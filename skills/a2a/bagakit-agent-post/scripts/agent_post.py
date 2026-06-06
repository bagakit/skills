"""Local A2A identity registry and mail pipe per docs/specs/agent-post-contract.md."""

from __future__ import annotations

import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
import re
import secrets
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

IDENTITY_SCHEMA = "bagakit/a2a-identity/v1"
MAIL_SCHEMA = "bagakit/a2a-mail/v1"
AGENT_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")

SURFACE_TOML = """schema_version = 1
surface_id = "agent-post-runtime"
surface_root = ".bagakit/agent-post"
owner_kind = "skill"
owner_id = "bagakit-agent-post"
lifecycle_class = "durable_state"
edit_policy = "generated_only"
cleanup_safe = false
source_of_truth = [
  "docs/specs/agent-post-contract.md",
  "skills/a2a/bagakit-agent-post/SKILL.md",
]
reviewable_outputs = []
"""


def fail(message: str, code: int = 1) -> int:
    print(f"error: {message}", file=sys.stderr)
    return code


def now() -> str:
    return dt.datetime.now().astimezone().isoformat(timespec="seconds")


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def validate_display_name(display_name: str) -> None:
    if not display_name.strip():
        raise ValueError("display name must not be empty")
    # XML attribute-value normalization folds newlines and tabs into spaces,
    # so a display name containing them could never pass send's name binding.
    if any(ord(char) < 0x20 for char in display_name):
        raise ValueError("display name must not contain control characters")


def atomic_write(path: Path, text: str) -> None:
    # Readers (recv, whoami, list-agents) do not take the registry lock, so
    # every record write must replace atomically instead of truncating in place.
    temp = path.with_name(f".{path.name}.tmp-{os.getpid()}")
    temp.write_text(text, encoding="utf-8")
    os.replace(temp, path)


def validate_agent_id(agent_id: str) -> None:
    if AGENT_ID_PATTERN.fullmatch(agent_id) is None:
        raise ValueError(f"agent id must match {AGENT_ID_PATTERN.pattern}")


class Registry:
    def __init__(self, root: Path):
        self.surface = root / ".bagakit" / "agent-post"
        self.agents_dir = self.surface / "agents"
        self.mail_dir = self.surface / "mail"

    def materialize(self) -> None:
        self.agents_dir.mkdir(parents=True, exist_ok=True)
        self.mail_dir.mkdir(parents=True, exist_ok=True)
        marker = self.surface / "surface.toml"
        if not marker.exists():
            marker.write_text(SURFACE_TOML, encoding="utf-8")
        (self.surface / "lock").touch()

    def lock(self):
        # Never truncate the lock marker while admitting or rejecting an
        # operation; an append-open handle is enough for flock and preserves
        # any host-visible marker content.
        handle = (self.surface / "lock").open("a+")
        fcntl.flock(handle, fcntl.LOCK_EX)
        return handle

    def identity_path(self, agent_id: str) -> Path:
        return self.agents_dir / f"{agent_id}.json"

    def load(self, agent_id: str) -> dict | None:
        path = self.identity_path(agent_id)
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def save(self, record: dict) -> None:
        atomic_write(
            self.identity_path(record["agent_id"]),
            json.dumps(record, ensure_ascii=False, indent=2) + "\n",
        )

    def all_identities(self) -> list[dict]:
        if not self.agents_dir.exists():
            return []
        return [json.loads(p.read_text(encoding="utf-8")) for p in sorted(self.agents_dir.glob("*.json"))]

    def chain_of(self, agent_id: str) -> list[dict] | None:
        """Return the identity chain from agent to root, or None when broken."""
        chain: list[dict] = []
        current = agent_id
        seen: set[str] = set()
        while True:
            if current in seen:
                return None
            seen.add(current)
            record = self.load(current)
            if record is None:
                return None
            chain.append(record)
            if record["granted_by"] == "user":
                return chain
            current = record["granted_by"]

    def chain_valid(self, agent_id: str) -> bool:
        chain = self.chain_of(agent_id)
        return chain is not None and all(item["status"] == "active" for item in chain)

    def verify_token(self, agent_id: str, token: str) -> dict | None:
        record = self.load(agent_id)
        if record is None or record["status"] != "active":
            return None
        if record["token_sha256"] != token_hash(token):
            return None
        return record

    def descendants(self, agent_id: str) -> list[dict]:
        result = []
        frontier = {agent_id}
        remaining = [r for r in self.all_identities() if r["agent_id"] != agent_id]
        changed = True
        while changed:
            changed = False
            for record in list(remaining):
                if record["granted_by"] in frontier:
                    result.append(record)
                    frontier.add(record["agent_id"])
                    remaining.remove(record)
                    changed = True
        return result


def new_identity(registry: Registry, agent_id: str, display_name: str, granted_by: str) -> dict:
    validate_agent_id(agent_id)
    validate_display_name(display_name)
    if registry.load(agent_id) is not None:
        raise ValueError(f"agent id already registered: {agent_id}")
    token = secrets.token_urlsafe(24)
    record = {
        "schema": IDENTITY_SCHEMA,
        "agent_id": agent_id,
        "display_name": display_name,
        "granted_by": granted_by,
        "status": "active",
        "token_sha256": token_hash(token),
        "created_time": now(),
        "revoked_time": None,
        "revoke_reason": None,
    }
    registry.save(record)
    return {"agent_id": agent_id, "display_name": display_name, "granted_by": granted_by, "token": token}


def sibling_validator() -> Path | None:
    candidate = (
        Path(__file__).resolve().parent.parent.parent
        / "bagakit-agent-messaging"
        / "scripts"
        / "agent_message_check.py"
    )
    return candidate if candidate.exists() else None


def check_envelope(envelope: str) -> tuple[str | None, str]:
    """Return (error, check_level)."""
    validator = sibling_validator()
    if validator is not None:
        try:
            result = subprocess.run(
                [sys.executable, str(validator), "--input", "-"],
                input=envelope,
                capture_output=True,
                text=True,
            )
        except OSError as error:
            return f"envelope validator could not run: {error}", "full"
        if result.returncode != 0:
            detail = (result.stdout + result.stderr).strip()
            return f"envelope rejected by bagakit-agent-messaging validator:\n{detail}", "full"
        return None, "full"
    try:
        parsed = ET.fromstring(envelope)
    except ET.ParseError as error:
        return f"envelope is not well-formed XML: {error}", "minimal"
    if parsed.tag != "bagakit-msg":
        return "envelope root element must be bagakit-msg", "minimal"
    return None, "minimal"


def envelope_name(envelope: str) -> str | None:
    try:
        return ET.fromstring(envelope).attrib.get("name")
    except ET.ParseError:
        return None


def cmd_register(registry: Registry, args: argparse.Namespace) -> int:
    # Validate all user input before materializing the first runtime surface.
    # A rejected first registration must leave the host untouched.
    try:
        validate_agent_id(args.agent_id)
        validate_display_name(args.display_name)
    except ValueError as error:
        return fail(str(error))

    registry.materialize()
    with registry.lock():
        try:
            issued = new_identity(registry, args.agent_id, args.display_name, "user")
        except ValueError as error:
            return fail(str(error))
    print(json.dumps(issued, ensure_ascii=False, indent=2))
    return 0


def cmd_derive(registry: Registry, args: argparse.Namespace) -> int:
    if not registry.surface.exists():
        return fail("no agent-post surface; run register first")
    with registry.lock():
        parent = registry.verify_token(args.parent, args.parent_token)
        if parent is None:
            return fail("parent identity, status, or token is invalid")
        if not registry.chain_valid(args.parent):
            return fail("parent grant chain is not fully active")
        try:
            issued = new_identity(registry, args.agent_id, args.display_name, args.parent)
        except ValueError as error:
            return fail(str(error))
    print(json.dumps(issued, ensure_ascii=False, indent=2))
    return 0


def cmd_revoke(registry: Registry, args: argparse.Namespace) -> int:
    if not registry.surface.exists():
        return fail("no agent-post surface; run register first")
    with registry.lock():
        target = registry.load(args.agent_id)
        if target is None:
            return fail(f"unknown agent id: {args.agent_id}")
        if not args.by_user:
            chain = registry.chain_of(args.agent_id) or []
            authorized = any(
                registry.chain_valid(item["agent_id"])
                and item["token_sha256"] == token_hash(args.auth_token or "")
                for item in chain
            )
            if not authorized:
                return fail("revocation requires --by-user or an active self or ancestor token")
        revoked = []
        reason_root = f"revoked:{'user' if args.by_user else 'chain'}"
        for record in [target, *registry.descendants(args.agent_id)]:
            if record["status"] == "revoked":
                continue
            record["status"] = "revoked"
            record["revoked_time"] = now()
            record["revoke_reason"] = (
                reason_root if record["agent_id"] == args.agent_id else f"ancestor-revoked:{args.agent_id}"
            )
            registry.save(record)
            revoked.append(record["agent_id"])
    print(json.dumps({"revoked": revoked}, ensure_ascii=False, indent=2))
    return 0


def cmd_send(registry: Registry, args: argparse.Namespace) -> int:
    if not registry.surface.exists():
        return fail("no agent-post surface; run register first")
    with registry.lock():
        sender = registry.verify_token(args.as_id, args.token)
        if sender is None:
            return fail("sender identity, status, or token is invalid")
        if not registry.chain_valid(sender["agent_id"]):
            return fail("sender grant chain is not fully active")
        recipient = registry.load(args.to)
        if recipient is None or not registry.chain_valid(recipient["agent_id"]):
            return fail(f"recipient is unknown or revoked: {args.to}")
        try:
            envelope = sys.stdin.read() if args.envelope == "-" else Path(args.envelope).read_text(encoding="utf-8")
        except OSError as error:
            return fail(str(error), 2)
        error, check_level = check_envelope(envelope)
        if error is not None:
            return fail(error)
        name = envelope_name(envelope)
        if name != sender["display_name"]:
            return fail(
                f"envelope name {name!r} does not match sender display_name {sender['display_name']!r}"
            )
        inbox = registry.mail_dir / recipient["agent_id"] / "inbox"
        inbox.mkdir(parents=True, exist_ok=True)
        if args.dedup_key is not None:
            for existing in sorted(inbox.glob("*.json")):
                record = json.loads(existing.read_text(encoding="utf-8"))
                if record.get("dedup_key") == args.dedup_key:
                    print(json.dumps(
                        {"msg_id": record["msg_id"], "seq": record["seq"], "delivery": "duplicate",
                         "envelope_check": record["envelope_check"]},
                        ensure_ascii=False, indent=2))
                    return 0
        seq_path = registry.mail_dir / recipient["agent_id"] / "seq"
        seq = int(seq_path.read_text(encoding="utf-8")) + 1 if seq_path.exists() else 1
        atomic_write(seq_path, str(seq))
        msg_id = f"m-{secrets.token_hex(6)}"
        record = {
            "schema": MAIL_SCHEMA,
            "msg_id": msg_id,
            "seq": seq,
            "from": sender["agent_id"],
            "to": recipient["agent_id"],
            "sent_time": now(),
            "envelope_xml": envelope,
            "envelope_check": check_level,
            "dedup_key": args.dedup_key,
            "consumed_time": None,
        }
        atomic_write(
            inbox / f"{seq:06d}-{msg_id}.json",
            json.dumps(record, ensure_ascii=False, indent=2) + "\n",
        )
    print(json.dumps(
        {"msg_id": msg_id, "seq": seq, "delivery": "accepted", "envelope_check": check_level},
        ensure_ascii=False, indent=2))
    return 0


def load_inbox(registry: Registry, agent_id: str) -> list[tuple[Path, dict]]:
    inbox = registry.mail_dir / agent_id / "inbox"
    if not inbox.exists():
        return []
    return [(p, json.loads(p.read_text(encoding="utf-8"))) for p in sorted(inbox.glob("*.json"))]


def cmd_recv(registry: Registry, args: argparse.Namespace) -> int:
    receiver = registry.verify_token(args.as_id, args.token)
    if receiver is None:
        return fail("receiver identity, status, or token is invalid")
    if not registry.chain_valid(receiver["agent_id"]):
        return fail("receiver grant chain is not fully active")
    records = [r for _, r in load_inbox(registry, receiver["agent_id"])]
    if not args.all:
        records = [r for r in records if r["consumed_time"] is None]
    if args.render:
        for record in records:
            print(
                f"[agent-post] from={record['from']} to={record['to']} seq={record['seq']} "
                f"sent={record['sent_time']} envelope_check={record['envelope_check']}"
            )
            print(record["envelope_xml"])
            print()
    else:
        print(json.dumps(records, ensure_ascii=False, indent=2))
    return 0


def cmd_ack(registry: Registry, args: argparse.Namespace) -> int:
    receiver = registry.verify_token(args.as_id, args.token)
    if receiver is None:
        return fail("receiver identity, status, or token is invalid")
    if not registry.chain_valid(receiver["agent_id"]):
        return fail("receiver grant chain is not fully active")
    with registry.lock():
        for path, record in load_inbox(registry, receiver["agent_id"]):
            if record["msg_id"] == args.msg:
                if record["consumed_time"] is None:
                    record["consumed_time"] = now()
                    atomic_write(path, json.dumps(record, ensure_ascii=False, indent=2) + "\n")
                print(json.dumps({"msg_id": args.msg, "consumed_time": record["consumed_time"]},
                                 ensure_ascii=False, indent=2))
                return 0
    return fail(f"unknown message id in this inbox: {args.msg}")


def cmd_whoami(registry: Registry, args: argparse.Namespace) -> int:
    digest = token_hash(args.token)
    for record in registry.all_identities():
        if record["token_sha256"] == digest and registry.chain_valid(record["agent_id"]):
            public = {k: v for k, v in record.items() if k != "token_sha256"}
            print(json.dumps(public, ensure_ascii=False, indent=2))
            return 0
    return fail("token does not match any active identity")


def cmd_list(registry: Registry, args: argparse.Namespace) -> int:
    records = registry.all_identities()
    if not args.all:
        records = [r for r in records if r["status"] == "active"]
    public = [{k: v for k, v in r.items() if k != "token_sha256"} for r in records]
    print(json.dumps(public, ensure_ascii=False, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Bagakit local A2A identity registry and mail pipe.")
    parser.add_argument("--root", default=".", help="Host repository root; defaults to the current directory.")
    commands = parser.add_subparsers(dest="command", required=True)

    register = commands.add_parser("register", help="Register one user-granted root identity.")
    register.add_argument("--agent-id", required=True)
    register.add_argument("--display-name", required=True)

    derive = commands.add_parser("derive", help="Derive one child identity from an active parent.")
    derive.add_argument("--parent", required=True)
    derive.add_argument("--parent-token", required=True)
    derive.add_argument("--agent-id", required=True)
    derive.add_argument("--display-name", required=True)

    revoke = commands.add_parser("revoke", help="Revoke one identity and cascade to its descendants.")
    revoke.add_argument("--agent-id", required=True)
    authority = revoke.add_mutually_exclusive_group(required=True)
    authority.add_argument("--by-user", action="store_true")
    authority.add_argument("--auth-token", help="Token of the identity itself or an active ancestor.")

    send = commands.add_parser("send", help="Validate and post one envelope to one recipient inbox.")
    send.add_argument("--as", dest="as_id", required=True)
    send.add_argument("--token", required=True)
    send.add_argument("--to", required=True)
    send.add_argument("--envelope", required=True, help="Path to one bagakit-msg XML file, or - for stdin.")
    send.add_argument("--dedup-key", default=None)

    recv = commands.add_parser("recv", help="List inbox records for one identity.")
    recv.add_argument("--as", dest="as_id", required=True)
    recv.add_argument("--token", required=True)
    recv.add_argument("--all", action="store_true", help="Include consumed records.")
    recv.add_argument("--render", action="store_true", help="Print host stamp lines plus raw envelopes.")

    ack = commands.add_parser("ack", help="Mark one inbox record consumed.")
    ack.add_argument("--as", dest="as_id", required=True)
    ack.add_argument("--token", required=True)
    ack.add_argument("--msg", required=True)

    whoami = commands.add_parser("whoami", help="Resolve the active identity holding a token.")
    whoami.add_argument("--token", required=True)

    list_agents = commands.add_parser("list-agents", help="List identities without token material.")
    list_agents.add_argument("--all", action="store_true", help="Include revoked identities.")

    args = parser.parse_args()
    registry = Registry(Path(args.root).resolve())
    handlers = {
        "register": cmd_register,
        "derive": cmd_derive,
        "revoke": cmd_revoke,
        "send": cmd_send,
        "recv": cmd_recv,
        "ack": cmd_ack,
        "whoami": cmd_whoami,
        "list-agents": cmd_list,
    }
    if args.command != "register" and not registry.surface.exists():
        return fail("no agent-post surface; run register first")
    return handlers[args.command](registry, args)


if __name__ == "__main__":
    raise SystemExit(main())
