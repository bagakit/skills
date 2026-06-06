"""Exercise the public bagakit-agent-post CLI in isolated host roots."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


REQUIRED_FILES = (
    "docs/specs/agent-post-contract.md",
    "skills/a2a/README.md",
    "skills/a2a/bagakit-agent-post/SKILL.md",
    "skills/a2a/bagakit-agent-post/agents/openai.yaml",
    "skills/a2a/bagakit-agent-post/references/frontdoor-rule.toml",
    "skills/a2a/bagakit-agent-post/references/skill-cli.toml",
    "skills/a2a/bagakit-agent-post/scripts/agent_post.py",
    "gate_validation/skills/a2a/README.md",
    "gate_validation/skills/a2a/bagakit-agent-post/validation.toml",
    "gate_validation/skills/a2a/bagakit-agent-post/check-agent-post.py",
)
REQUIRED_DIRS = (
    "skills/a2a",
    "skills/a2a/bagakit-agent-post",
    "skills/a2a/bagakit-agent-post/agents",
    "skills/a2a/bagakit-agent-post/references",
    "skills/a2a/bagakit-agent-post/scripts",
    "gate_validation/skills/a2a",
    "gate_validation/skills/a2a/bagakit-agent-post",
)
FORBIDDEN_PATHS = (
    "skills/a2a/bagakit-agent-post/SKILL_PAYLOAD.json",
    "skills/a2a/bagakit-agent-post/README.md",
    "skills/a2a/bagakit-agent-post/AGENTS.md",
    "skills/a2a/bagakit-agent-post/docs",
    "skills/a2a/bagakit-agent-post/scripts_dev",
)


def fail(message: str) -> None:
    raise AssertionError(message)


def run(cli: Path, root: Path, *args: str, data: str | None = None) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    return subprocess.run(
        [sys.executable, str(cli), "--root", str(root), *args],
        input=data,
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )


def json_output(result: subprocess.CompletedProcess[str]) -> dict | list:
    if not result.stdout.strip():
        fail(f"expected JSON stdout, got none; stderr={result.stderr!r}")
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as error:
        fail(f"invalid JSON stdout: {error}: {result.stdout!r}")


def expect_rejected(result: subprocess.CompletedProcess[str], label: str) -> None:
    if result.returncode == 0:
        fail(f"{label} unexpectedly succeeded: {result.stdout!r}")
    if result.stdout:
        fail(f"{label} emitted actuation stdout: {result.stdout!r}")
    if not result.stderr.startswith("error:"):
        fail(f"{label} did not explain rejection on stderr: {result.stderr!r}")


def snapshot(root: Path) -> dict[str, bytes]:
    return {
        str(path.relative_to(root)): path.read_bytes()
        for path in root.rglob("*")
        if path.is_file()
    }


def assert_unchanged(root: Path, before: dict[str, bytes], label: str) -> None:
    after = snapshot(root)
    if after != before:
        fail(f"{label} changed host state: before={sorted(before)} after={sorted(after)}")


def register(cli: Path, root: Path, agent_id: str, display_name: str) -> str:
    result = run(cli, root, "register", "--agent-id", agent_id, "--display-name", display_name)
    if result.returncode != 0:
        fail(f"register failed: {result.stderr}")
    record = json_output(result)
    if not isinstance(record, dict) or not isinstance(record.get("token"), str):
        fail(f"register did not return one token: {record!r}")
    return str(record["token"])


def test_layout(root: Path) -> None:
    for relative in REQUIRED_DIRS:
        if not (root / relative).is_dir():
            fail(f"missing required directory: {relative}")
    for relative in REQUIRED_FILES:
        if not (root / relative).is_file():
            fail(f"missing required file: {relative}")
    for relative in FORBIDDEN_PATHS:
        if (root / relative).exists():
            fail(f"forbidden payload path exists: {relative}")

    skill_cli = (root / "skills/a2a/bagakit-agent-post/references/skill-cli.toml").read_text(encoding="utf-8")
    if 'entrypoint = "scripts/agent_post.py"' not in skill_cli:
        fail("skill-cli.toml does not identify the single agent_post.py entrypoint")
    for command in ("register", "derive", "revoke", "send", "recv", "ack", "whoami", "list-agents"):
        if f'name = "{command}"' not in skill_cli:
            fail(f"skill-cli.toml is missing command {command}")

    contract = (root / "docs/specs/agent-post-contract.md").read_text(encoding="utf-8")
    for anchor in (
        "confusion-prevention boundary",
        "bagakit/a2a-identity/v1",
        "bagakit/a2a-mail/v1",
        "Send admission is ordered and fail-stop",
        ".bagakit/agent-post/",
    ):
        if anchor not in contract:
            fail(f"agent-post contract is missing anchor: {anchor}")
    if re.search(r"(?<![A-Za-z0-9._>])/(?:[A-Za-z0-9._-]+/)+", contract):
        fail("agent-post contract contains an absolute local path")


def test_runtime(cli: Path, root: Path) -> None:
    # Invalid first registration must not create a runtime surface.
    rejected = run(cli, root, "register", "--agent-id", "bad id", "--display-name", "Bad")
    expect_rejected(rejected, "invalid first register")
    if (root / ".bagakit/agent-post").exists():
        fail("invalid first register materialized .bagakit/agent-post")

    root_token = register(cli, root, "root-agent", "Root Agent")
    surface = root / ".bagakit/agent-post"
    marker = surface / "surface.toml"
    if not marker.is_file() or 'surface_id = "agent-post-runtime"' not in marker.read_text(encoding="utf-8"):
        fail("first successful register did not materialize the required surface.toml")
    identity = json.loads((surface / "agents/root-agent.json").read_text(encoding="utf-8"))
    if identity.get("schema") != "bagakit/a2a-identity/v1":
        fail("identity schema token is wrong")
    if identity.get("token_sha256") != hashlib.sha256(root_token.encode()).hexdigest():
        fail("identity token is not stored as the expected sha256 digest")
    if root_token in (surface / "agents/root-agent.json").read_text(encoding="utf-8"):
        fail("plaintext root token was persisted")

    before = snapshot(root)
    duplicate = run(cli, root, "register", "--agent-id", "root-agent", "--display-name", "Other")
    expect_rejected(duplicate, "duplicate register")
    assert_unchanged(root, before, "duplicate register")

    before = snapshot(root)
    bad_derive = run(
        cli,
        root,
        "derive",
        "--parent",
        "root-agent",
        "--parent-token",
        "wrong-token",
        "--agent-id",
        "child-agent",
        "--display-name",
        "Child Agent",
    )
    expect_rejected(bad_derive, "bad-token derive")
    assert_unchanged(root, before, "bad-token derive")

    derived = run(
        cli,
        root,
        "derive",
        "--parent",
        "root-agent",
        "--parent-token",
        root_token,
        "--agent-id",
        "child-agent",
        "--display-name",
        "Child Agent",
    )
    child_token = str(json_output(derived)["token"])
    envelope = '<bagakit-msg type="agent-v1" name="Root Agent" time="2000-01-01T00:00:00Z">Hello.</bagakit-msg>'

    before = snapshot(root)
    bad_sender = run(
        cli,
        root,
        "send",
        "--as",
        "root-agent",
        "--token",
        "wrong-token",
        "--to",
        "child-agent",
        "--envelope",
        "-",
        data=envelope,
    )
    expect_rejected(bad_sender, "bad-token send")
    assert_unchanged(root, before, "bad-token send")

    before = snapshot(root)
    unknown_recipient = run(
        cli,
        root,
        "send",
        "--as",
        "root-agent",
        "--token",
        root_token,
        "--to",
        "missing-agent",
        "--envelope",
        "-",
        data=envelope,
    )
    expect_rejected(unknown_recipient, "unknown-recipient send")
    assert_unchanged(root, before, "unknown-recipient send")

    before = snapshot(root)
    malformed = run(
        cli,
        root,
        "send",
        "--as",
        "root-agent",
        "--token",
        root_token,
        "--to",
        "child-agent",
        "--envelope",
        "-",
        data="not xml",
    )
    expect_rejected(malformed, "malformed-envelope send")
    assert_unchanged(root, before, "malformed-envelope send")

    before = snapshot(root)
    mismatched_name = run(
        cli,
        root,
        "send",
        "--as",
        "root-agent",
        "--token",
        root_token,
        "--to",
        "child-agent",
        "--envelope",
        "-",
        data=envelope.replace("Root Agent", "Other Agent"),
    )
    expect_rejected(mismatched_name, "display-name mismatch send")
    assert_unchanged(root, before, "display-name mismatch send")

    accepted = run(
        cli,
        root,
        "send",
        "--as",
        "root-agent",
        "--token",
        root_token,
        "--to",
        "child-agent",
        "--envelope",
        "-",
        "--dedup-key",
        "message-1",
        data=envelope,
    )
    accepted_receipt = json_output(accepted)
    if accepted_receipt.get("delivery") != "accepted" or accepted_receipt.get("seq") != 1:
        fail(f"unexpected delivery receipt: {accepted_receipt!r}")
    msg_id = str(accepted_receipt["msg_id"])
    mail_path = surface / "mail/child-agent/inbox"
    files = list(mail_path.glob("*.json"))
    if len(files) != 1:
        fail(f"expected one mail record, found {files}")
    mail = json.loads(files[0].read_text(encoding="utf-8"))
    if mail.get("schema") != "bagakit/a2a-mail/v1" or mail.get("envelope_xml") != envelope:
        fail("mail record did not preserve the accepted envelope and schema")

    before = snapshot(root)
    duplicate = run(
        cli,
        root,
        "send",
        "--as",
        "root-agent",
        "--token",
        root_token,
        "--to",
        "child-agent",
        "--envelope",
        "-",
        "--dedup-key",
        "message-1",
        data=envelope,
    )
    duplicate_receipt = json_output(duplicate)
    if duplicate_receipt.get("delivery") != "duplicate" or duplicate_receipt.get("msg_id") != msg_id:
        fail(f"unexpected duplicate receipt: {duplicate_receipt!r}")
    assert_unchanged(root, before, "deduplicated send")

    rendered = run(cli, root, "recv", "--as", "child-agent", "--token", child_token, "--render")
    if rendered.returncode != 0 or not rendered.stdout.startswith("[agent-post] from=root-agent to=child-agent seq=1"):
        fail(f"recv --render did not print the Host stamp: {rendered.stdout!r}")
    if envelope not in rendered.stdout:
        fail("recv --render did not preserve the raw envelope")

    before = snapshot(root)
    wrong_ack = run(cli, root, "ack", "--as", "child-agent", "--token", root_token, "--msg", msg_id)
    expect_rejected(wrong_ack, "wrong-token ack")
    assert_unchanged(root, before, "wrong-token ack")
    before = snapshot(root)
    acked = run(cli, root, "ack", "--as", "child-agent", "--token", child_token, "--msg", msg_id)
    ack_payload = json_output(acked)
    if ack_payload.get("msg_id") != msg_id or not ack_payload.get("consumed_time"):
        fail(f"ack did not return a consumption receipt: {ack_payload!r}")
    consumed_snapshot = snapshot(root)
    ack_again = run(cli, root, "ack", "--as", "child-agent", "--token", child_token, "--msg", msg_id)
    if json_output(ack_again).get("consumed_time") != ack_payload.get("consumed_time"):
        fail("ack was not idempotent")
    if snapshot(root) != consumed_snapshot:
        fail("repeated ack changed an already consumed record")
    if json_output(run(cli, root, "recv", "--as", "child-agent", "--token", child_token)) != []:
        fail("consumed record was returned by default recv")
    all_records = json_output(run(cli, root, "recv", "--as", "child-agent", "--token", child_token, "--all"))
    if not isinstance(all_records, list) or len(all_records) != 1:
        fail("recv --all did not return the consumed record")

    before = snapshot(root)
    bad_revoke = run(cli, root, "revoke", "--agent-id", "root-agent", "--auth-token", "wrong-token")
    expect_rejected(bad_revoke, "bad-token revoke")
    assert_unchanged(root, before, "bad-token revoke")

    revoked = run(cli, root, "revoke", "--agent-id", "root-agent", "--by-user")
    revoked_ids = json_output(revoked).get("revoked")
    if revoked_ids != ["root-agent", "child-agent"]:
        fail(f"strict cascade did not revoke root and child: {revoked_ids!r}")
    for args, label in (
        (("send", "--as", "child-agent", "--token", child_token, "--to", "root-agent", "--envelope", "-"), "revoked send"),
        (("derive", "--parent", "root-agent", "--parent-token", root_token, "--agent-id", "grandchild", "--display-name", "Grandchild"), "revoked derive"),
        (("recv", "--as", "child-agent", "--token", child_token), "revoked recv"),
        (("whoami", "--token", child_token), "revoked whoami"),
    ):
        result = run(cli, root, *args, data=envelope if args[-1] == "-" else None)
        expect_rejected(result, label)


def test_minimal_fallback(source_script: Path) -> None:
    with tempfile.TemporaryDirectory(prefix="agent-post-fallback-") as raw:
        root = Path(raw)
        isolated_script = root / "skills/a2a/bagakit-agent-post/scripts/agent_post.py"
        isolated_script.parent.mkdir(parents=True)
        shutil.copy2(source_script, isolated_script)
        token = register(isolated_script, root, "isolated-agent", "Isolated Agent")
        envelope = '<bagakit-msg type="agent-v1" name="Isolated Agent" time="2000-01-01T00:00:00Z">Fallback.</bagakit-msg>'
        recipient_token = register(isolated_script, root, "recipient-agent", "Recipient Agent")
        sent = run(
            isolated_script,
            root,
            "send",
            "--as",
            "isolated-agent",
            "--token",
            token,
            "--to",
            "recipient-agent",
            "--envelope",
            "-",
            data=envelope,
        )
        payload = json_output(sent)
        if payload.get("envelope_check") != "minimal":
            fail(f"missing sibling validator did not use minimal fallback: {payload!r}")
        received = json_output(run(isolated_script, root, "recv", "--as", "recipient-agent", "--token", recipient_token))
        if received[0].get("envelope_check") != "minimal":
            fail("minimal fallback receipt lost its check level")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".")
    parser.add_argument("--layout-only", action="store_true")
    args = parser.parse_args()
    root = Path(args.root).resolve()
    source_script = root / "skills/a2a/bagakit-agent-post/scripts/agent_post.py"
    test_layout(root)
    if args.layout_only:
        print("ok: bagakit-agent-post layout checks passed")
        return 0
    with tempfile.TemporaryDirectory(prefix="agent-post-runtime-") as raw:
        test_runtime(source_script, Path(raw))
    test_minimal_fallback(source_script)
    print("ok: bagakit-agent-post checks passed (layout, isolated runtime, fail-stop rejection, receipts, cascade revoke, fallback)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
