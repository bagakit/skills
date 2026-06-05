"""Validate bagakit-writing-de-ai-tone public behavior."""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path


SKILL_DIR = Path("skills/paperwork/bagakit-writing-de-ai-tone")
FIXTURE_DIR = Path("gate_validation/skills/paperwork/bagakit-writing-de-ai-tone/fixtures")


def run(cmd: list[str], root: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=root,
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


def require(condition: bool, message: str, failures: list[str]) -> None:
    if not condition:
        failures.append(message)


def load_json(stdout: str, label: str, failures: list[str]) -> dict:
    try:
        payload = json.loads(stdout)
    except json.JSONDecodeError as exc:
        failures.append(f"{label} did not emit valid JSON: {exc}")
        return {}
    if not isinstance(payload, dict):
        failures.append(f"{label} JSON payload must be an object")
        return {}
    return payload


def codes(payload: dict) -> set[str]:
    return {
        str(item.get("code"))
        for item in payload.get("findings", [])
        if isinstance(item, dict)
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=".", help="Repository root")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    failures: list[str] = []
    cli = SKILL_DIR / "scripts/bagakit-writing-de-ai-tone-cli.sh"
    core_cli = Path("skills/paperwork/bagakit-writing-core/scripts/bagakit-writing-core-cli.sh")

    for path in [
        SKILL_DIR / "SKILL.md",
        SKILL_DIR / "references/patterns.md",
        SKILL_DIR / "references/rewrite-protocol.md",
        SKILL_DIR / "references/protected-spans.md",
        SKILL_DIR / "references/context-profiles.toml",
        SKILL_DIR / "references/lexicon.json",
        SKILL_DIR / "references/frontdoor-rule.toml",
        SKILL_DIR / "references/skill-cli.toml",
        SKILL_DIR / "scripts/de_ai_tone_lint.py",
        cli,
    ]:
        require((root / path).is_file(), f"missing required file: {path}", failures)

    if failures:
        for failure in failures:
            print(f"error: {failure}")
        return 1

    validate = run(["bash", str(cli), "validate"], root)
    require(validate.returncode == 0, f"CLI validate failed: {validate.stderr}", failures)

    describe = run(["bash", str(cli), "describe"], root)
    require(describe.returncode == 0, "describe failed", failures)
    require("bagakit-writing-de-ai-tone" in describe.stdout, "describe missing skill id", failures)

    protocol = run(["bash", str(cli), "print-rewrite-protocol"], root)
    require(protocol.returncode == 0, "print-rewrite-protocol failed", failures)
    for token in ["Detect Mode", "Rewrite Mode", "Protected-Span Pass", "Precision Cross-Check", "Second-pass audit", "Evidence Gap Guard"]:
        require(token in protocol.stdout, f"rewrite protocol missing token: {token}", failures)

    protected_protocol = run(["bash", str(cli), "print-protected-spans"], root)
    require(protected_protocol.returncode == 0, "print-protected-spans failed", failures)
    for token in ["Protected Span Classes", "Scene Packs", "Humanizer Boundary", "`owner`", "`quoted_source`", "`product_ui_label`"]:
        require(token in protected_protocol.stdout, f"protected-span protocol missing token: {token}", failures)

    rewrite_plan = run(["bash", str(cli), "rewrite-plan"], root)
    require(rewrite_plan.returncode == 0, "rewrite-plan failed", failures)
    require("The shipped CLI does not rewrite prose automatically" in rewrite_plan.stdout, "rewrite-plan should expose CLI rewrite boundary", failures)

    zh = run(
        [
            "bash",
            str(cli),
            "lint",
            "--profile",
            "blog",
            "--fail-on",
            "none",
            str(FIXTURE_DIR / "ai-tone-zh.md"),
        ],
        root,
    )
    require(zh.returncode == 0, f"zh lint failed: {zh.stderr}", failures)
    zh_payload = load_json(zh.stdout, "zh lint", failures)
    zh_codes = codes(zh_payload)
    for expected in [
        "P1_FORMULAIC_OPENING",
        "P1_PROCESS_FILLER",
        "P1_LEXICON_ALWAYS",
        "P1_FAKE_CONTRAST",
        "P0_VAGUE_AUTHORITY",
        "P0_SIGNIFICANCE_INFLATION",
    ]:
        require(expected in zh_codes, f"zh fixture missed {expected}", failures)

    conflict = run(
        [
            "bash",
            str(cli),
            "lint",
            "--profile",
            "blog",
            "--fail-on",
            "none",
            str(FIXTURE_DIR / "conflict-bait.md"),
        ],
        root,
    )
    require(conflict.returncode == 0, f"conflict-bait lint failed: {conflict.stderr}", failures)
    conflict_payload = load_json(conflict.stdout, "conflict-bait lint", failures)
    conflict_codes = codes(conflict_payload)
    for expected in [
        "P1_CONFLICT_BAIT_BINARY",
        "P1_UNSUPPORTED_PEOPLE_GENERALIZATION",
    ]:
        require(expected in conflict_codes, f"conflict-bait fixture missed {expected}", failures)

    tech = run(
        [
            "bash",
            str(cli),
            "lint",
            "--profile",
            "technical",
            "--fail-on",
            "none",
            str(FIXTURE_DIR / "technical-exemption.md"),
        ],
        root,
    )
    require(tech.returncode == 0, f"technical lint failed: {tech.stderr}", failures)
    tech_payload = load_json(tech.stdout, "technical lint", failures)
    require(
        "P1_LEXICON_ALWAYS" not in codes(tech_payload),
        "technical profile should exempt precise technical terms in fixture",
        failures,
    )

    nominalized = run(
        [
            "bash",
            str(cli),
            "lint",
            "--profile",
            "blog",
            "--fail-on",
            "none",
            str(FIXTURE_DIR / "nominalized-action-shell.md"),
        ],
        root,
    )
    require(nominalized.returncode == 0, f"nominalized-action lint failed: {nominalized.stderr}", failures)
    nominalized_payload = load_json(nominalized.stdout, "nominalized-action lint", failures)
    nominalized_findings = [
        item
        for item in nominalized_payload.get("findings", [])
        if item.get("code") == "P2_NOMINALIZED_ACTION_SHELL"
    ]
    require(len(nominalized_findings) == 1, "nominalized-action fixture should emit one aggregate advisory", failures)
    if nominalized_findings:
        require(
            len(nominalized_findings[0].get("meta", {}).get("items", [])) == 2,
            "nominalized-action advisory should expose both high-signal shells without flagging precise deployment prose",
            failures,
        )

    advisory = run(
        [
            "bash",
            str(cli),
            "lint",
            "--profile",
            "blog",
            str(FIXTURE_DIR / "advisory-only.md"),
        ],
        root,
    )
    advisory_payload = load_json(advisory.stdout, "advisory lint", failures)
    require(advisory.returncode == 0, "advisory-only fixture should not fail default lint", failures)
    require(
        advisory_payload.get("summary", {}).get("advisory", 0) > 0,
        "advisory-only fixture should produce advisory findings",
        failures,
    )

    protected = run(
        [
            "bash",
            str(cli),
            "lint",
            "--profile",
            "technical",
            "--scene",
            "technical",
            "--fail-on",
            "none",
            str(FIXTURE_DIR / "protected-spans.md"),
        ],
        root,
    )
    require(protected.returncode == 0, f"protected-spans lint failed: {protected.stderr}", failures)
    protected_payload = load_json(protected.stdout, "protected-spans lint", failures)
    require(protected_payload.get("scene") == "technical", "protected-spans lint should preserve scene", failures)
    protected_spans = protected_payload.get("protected_spans", {})
    classes = protected_spans.get("classes", {}) if isinstance(protected_spans, dict) else {}
    require(protected_payload.get("summary", {}).get("protected_spans", 0) >= 8, "protected-spans fixture should report protected span count", failures)
    for expected in [
        "inline_code",
        "command",
        "file_path",
        "url",
        "version",
        "metric",
        "date",
        "api_symbol",
        "issue_or_id",
        "owner",
        "quoted_source",
        "product_ui_label",
    ]:
        require(expected in classes, f"protected-spans fixture missed {expected}", failures)

    protected_negative = run(
        [
            "bash",
            str(cli),
            "detect",
            "--profile",
            "business",
            "--scene",
            "public-writing",
            "--fail-on",
            "none",
            str(FIXTURE_DIR / "protected-negative.md"),
        ],
        root,
    )
    require(protected_negative.returncode == 0, f"protected-negative lint failed: {protected_negative.stderr}", failures)
    protected_negative_payload = load_json(protected_negative.stdout, "protected-negative lint", failures)
    protected_negative_classes = protected_negative_payload.get("protected_spans", {}).get("classes", {})
    for expected in ["owner", "quoted_source", "product_ui_label"]:
        require(expected in protected_negative_classes, f"protected-negative missed protected class {expected}", failures)
    require(
        protected_negative_classes.get("owner", {}).get("count") == 1,
        "protected-negative should de-duplicate overlapping Owner line and @handle spans",
        failures,
    )
    require(
        protected_negative_classes.get("quoted_source", {}).get("count") == 3,
        "protected-negative should protect full source/quote lines without double-counting nested quoted text",
        failures,
    )
    require(
        protected_negative_classes.get("product_ui_label", {}).get("count") == 4,
        "protected-negative should protect full product/button lines without double-counting nested label tokens",
        failures,
    )
    require(
        protected_negative_payload.get("summary", {}).get("fail", 0) == 0
        and protected_negative_payload.get("summary", {}).get("warn", 0) == 0,
        "protected quoted/source/product/owner text, including long label lines, should not create blocking AI-tone findings",
        failures,
    )

    author_quote = run(
        [
            "bash",
            str(cli),
            "lint",
            "--profile",
            "business",
            "--scene",
            "public-writing",
            "--fail-on",
            "none",
            str(FIXTURE_DIR / "author-quote.md"),
        ],
        root,
    )
    require(author_quote.returncode == 0, f"author-quote lint failed: {author_quote.stderr}", failures)
    author_quote_payload = load_json(author_quote.stdout, "author-quote lint", failures)
    require(
        "quoted_source" not in author_quote_payload.get("protected_spans", {}).get("classes", {}),
        "author-owned quote marks should not become quoted_source protected spans",
        failures,
    )
    require("P1_LEXICON_ALWAYS" in codes(author_quote_payload), "author-owned quoted AI-hype should still be linted", failures)

    casual = run(
        [
            "bash",
            str(cli),
            "lint",
            "--profile",
            "casual",
            "--fail-on",
            "warn",
            str(FIXTURE_DIR / "casual-p1.md"),
        ],
        root,
    )
    casual_payload = load_json(casual.stdout, "casual lint", failures)
    require(casual.returncode == 0, "casual p0-only profile should not fail on P1 warnings", failures)
    require(casual_payload.get("summary", {}).get("warn", 0) == 0, "casual p0-only should downgrade P1 warnings", failures)
    require(casual_payload.get("summary", {}).get("advisory", 0) > 0, "casual p0-only should keep downgraded P1 as advisory signal", failures)

    docs_list = run(
        [
            "bash",
            str(cli),
            "lint",
            "--profile",
            "docs",
            "--scene",
            "docs",
            "--fail-on",
            "none",
            str(FIXTURE_DIR / "docs-list.md"),
        ],
        root,
    )
    require(docs_list.returncode == 0, f"docs-list lint failed: {docs_list.stderr}", failures)
    require("P2_LIST_SCAFFOLDING" not in codes(load_json(docs_list.stdout, "docs-list lint", failures)), "docs profile should tolerate checklist scaffolding fixture", failures)

    multi = run(
        [
            "bash",
            str(cli),
            "lint",
            "--profile",
            "blog",
            "--scene",
            "auto",
            "--fail-on",
            "none",
            str(FIXTURE_DIR / "multi-file"),
        ],
        root,
    )
    require(multi.returncode == 0, f"multi-file lint failed: {multi.stderr}", failures)
    multi_payload = load_json(multi.stdout, "multi-file lint", failures)
    multi_findings = multi_payload.get("findings", [])
    require(isinstance(multi_findings, list) and len(multi_findings) >= 2, "multi-file top-level findings should aggregate all files", failures)
    require(
        all(isinstance(item, dict) and item.get("path") for item in multi_findings),
        "multi-file top-level findings should carry path",
        failures,
    )
    multi_classes = multi_payload.get("protected_spans", {}).get("classes", {})
    for expected in ["owner", "url", "product_ui_label"]:
        require(expected in multi_classes, f"multi-file aggregate missed protected class {expected}", failures)
    require(multi_payload.get("scene_metadata", {}).get("active_scenes"), "multi-file payload should expose active scene metadata", failures)

    core = run(
        [
            "bash",
            str(core_cli),
            "de-ai-tone",
            "lint",
            "--profile",
            "blog",
            "--fail-on",
            "none",
            str(FIXTURE_DIR / "ai-tone-zh.md"),
        ],
        root,
    )
    require(core.returncode == 0, f"writing-core de-ai-tone dispatch failed: {core.stderr}", failures)
    core_payload = load_json(core.stdout, "core de-ai-tone dispatch", failures)
    require(core_payload.get("schema") == "bagakit.de_ai_tone_lint.v1", "core dispatch should return de-AI-tone lint schema", failures)

    if failures:
        print("writing de-AI-tone gate failed:")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("ok: writing de-AI-tone gate passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
