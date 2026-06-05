"""Validate bagakit-writing-intake public contract surfaces."""

from __future__ import annotations

import argparse
import re
import subprocess
from pathlib import Path


SKILL_DIR = Path("skills/paperwork/bagakit-writing-intake")
CONTRACT_PATH = SKILL_DIR / "references/intake-packet-contract.md"
FRONTDOOR_PATH = SKILL_DIR / "references/frontdoor-rule.toml"
CLI_MANIFEST_PATH = SKILL_DIR / "references/skill-cli.toml"
CLI_PATH = SKILL_DIR / "scripts/bagakit-writing-intake-cli.sh"
TEXT_SUFFIXES = {".md", ".toml", ".json", ".yaml", ".yml", ".sh", ".py", ".txt"}
SLASH = re.escape(chr(47))

LEAK_PATTERNS = [
    (re.compile(rf"{SLASH}Users{SLASH}"), "macOS user-home absolute path"),
    (re.compile(rf"\b{SLASH}home{SLASH}[A-Za-z0-9._-]+{SLASH}"), "Linux home absolute path"),
    (
        re.compile(rf"\b{SLASH}private{SLASH}var{SLASH}|\b{SLASH}var{SLASH}folders{SLASH}"),
        "macOS temporary absolute path",
    ),
    (re.compile(r"[A-Za-z]:\\Users\\"), "Windows user absolute path"),
    (
        re.compile(
            r"\b(?:capture|snapshot|dump|export|recording|transcript)[-_ ]?"
            r"20\d{2}[-_]?([01]\d)[-_]?([0-3]\d)"
            r"(?:[Tt_\- ]?[0-2]\d[-_:]?[0-5]\d(?:[-_:]?[0-5]\d)?)?\b",
            re.IGNORECASE,
        ),
        "timestamp-like local capture name",
    ),
]


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


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def skill_files(root: Path) -> list[Path]:
    skill_root = root / SKILL_DIR
    if not skill_root.is_dir():
        return []
    return sorted(
        path
        for path in skill_root.rglob("*")
        if path.is_file() and path.suffix.lower() in TEXT_SUFFIXES
    )


def combined_text(paths: list[Path]) -> str:
    return "\n".join(read_text(path) for path in paths)


def find_contract_files(paths: list[Path], text_by_path: dict[Path, str]) -> list[Path]:
    return [
        path
        for path in paths
        if "intake_packet" in text_by_path[path] or "core_veto" in text_by_path[path]
    ]


def require_tokens(text: str, tokens: list[str], label: str, failures: list[str]) -> None:
    missing = [token for token in tokens if token not in text]
    require(not missing, f"{label} missing tokens: {', '.join(missing)}", failures)


def required_shape_block(text: str) -> str:
    match = re.search(r"## Required Shape\s+```ya?ml\n(?P<body>[\s\S]*?)\n```", text)
    return match.group("body") if match else ""


def require_shape_pattern(block: str, pattern: str, label: str, failures: list[str]) -> None:
    if not re.search(pattern, block, re.MULTILINE):
        failures.append(f"required shape block missing shape anchor: {label}")


def check_packet_contract(root: Path, failures: list[str]) -> None:
    contract = root / CONTRACT_PATH
    require(contract.is_file(), f"missing packet contract: {CONTRACT_PATH}", failures)
    if not contract.is_file():
        return

    text = read_text(contract)
    lower = text.lower()

    require("intake_packet:" in text, "packet contract must define intake_packet", failures)
    require("does not produce final prose" in lower, "packet contract must state Intake does not produce final prose", failures)
    require("stops at packet emission" in lower, "packet contract must state final-prose requests stop at packet emission", failures)

    shape = required_shape_block(text)
    require(shape, "packet contract must include a YAML Required Shape block", failures)
    if shape:
        shape_patterns = {
            "root object": r"^intake_packet:",
            "top-level packet_version": r"^  packet_version:",
            "top-level task_route": r"^  task_route:",
            "task_route.requested_action": r"^    requested_action:",
            "task_route.intake_lane": r"^    intake_lane:",
            "task_route.final_prose_requested": r"^    final_prose_requested:",
            "task_route.final_prose_owner": r"^    final_prose_owner:",
            "audience_channel_genre.audience": r"^    audience:",
            "top-level clarity_routing": r"^  clarity_routing:",
            "clarity_routing.reader_target_language_proficiency": r"^    reader_target_language_proficiency:",
            "clarity_routing.text_mode": r"^    text_mode:",
            "clarity_routing.misunderstanding_consequence": r"^    misunderstanding_consequence:",
            "clarity_routing.terminology_state": r"^    terminology_state:",
            "clarity_routing.precision_route": r"^    precision_route:",
            "clarity_routing.evidence_ids": r"^    evidence_ids:",
            "source_material_state.available_materials": r"^    available_materials:",
            "evidence_ledger[].id": r"^    - id:",
            "privacy_boundary.raw_private_samples_in_packet": r"^    raw_private_samples_in_packet:",
            "language_profile.dimensions[].name": r"^      - name:",
            "language_profile.dimensions[].observation": r"^        observation:",
            "language_profile.dimensions[].candidate_rule": r"^        candidate_rule:",
            "expression_frictions[].likely_fix_owner": r"^      likely_fix_owner:",
            "protected_spans[].allowed_operations": r"^      allowed_operations:",
            "core_risk_candidates[].why_core_should_check": r"^      why_core_should_check:",
            "rewrite_feedback_rule_candidates[].delta_type": r"^      delta_type:",
            "handoff.next_owner": r"^    next_owner:",
        }
        for label, pattern in shape_patterns.items():
            require_shape_pattern(shape, pattern, label, failures)

    require_tokens(
        text,
        [
            "packet_version",
            "task_route",
            "audience_channel_genre",
            "source_material_state",
            "clarity_routing",
            "evidence_ledger",
            "privacy_boundary",
            "language_profile",
            "expression_strengths",
            "expression_frictions",
            "protected_spans",
            "style_candidates",
            "core_risk_candidates",
            "rewrite_feedback_rule_candidates",
            "handoff",
        ],
        "packet top-level contract",
        failures,
    )
    require_tokens(
        text,
        ["requested_action", "intake_lane", "final_prose_requested", "final_prose_owner"],
        "task_route contract",
        failures,
    )
    require_tokens(
        text,
        ["audience", "channel", "genre", "decision_or_action_expected"],
        "audience_channel_genre contract",
        failures,
    )
    require_tokens(
        text,
        ["available_materials", "missing_materials", "stability", "reason"],
        "source_material_state contract",
        failures,
    )
    require_tokens(
        text,
        [
            "reader_target_language_proficiency",
            "text_mode",
            "misunderstanding_consequence",
            "terminology_state",
            "precision_route",
            "controlled_technical",
        ],
        "clarity_routing contract",
        failures,
    )
    require_tokens(
        text,
        ["id", "kind", "source_scope", "excerpt_or_pointer", "supports", "confidence"],
        "evidence_ledger item contract",
        failures,
    )
    require_tokens(
        text,
        ["raw_private_samples_in_packet", "retention_rule", "allowed_reuse", "notes"],
        "privacy_boundary contract",
        failures,
    )
    require_tokens(
        text,
        ["dimensions", "name", "observation", "candidate_rule", "scope", "rollback_condition", "evidence_ids", "confidence"],
        "language_profile.dimensions[] contract",
        failures,
    )
    require_tokens(
        text,
        ["expression_strengths", "claim", "evidence_ids", "confidence"],
        "expression_strengths item contract",
        failures,
    )
    require_tokens(
        text,
        ["expression_frictions", "claim", "likely_fix_owner", "evidence_ids", "confidence"],
        "expression_frictions item contract",
        failures,
    )
    require_tokens(
        text,
        ["protected_spans", "span_or_pointer", "protection_reason", "allowed_operations", "evidence_ids"],
        "protected_spans item contract",
        failures,
    )
    require_tokens(
        text,
        ["style_candidates", "rule_candidate", "applies_when", "avoid_when", "evidence_ids", "confidence"],
        "style_candidates item contract",
        failures,
    )
    require_tokens(
        text,
        ["core_risk_candidates", "risk", "why_core_should_check", "evidence_ids", "confidence"],
        "core_risk_candidates item contract",
        failures,
    )
    require_tokens(
        text,
        [
            "rewrite_feedback_rule_candidates",
            "before_pointer",
            "after_pointer",
            "delta_type",
            "inferred_rule",
            "scope",
            "rollback_condition",
            "evidence_ids",
            "confidence",
        ],
        "rewrite_feedback_rule_candidates item contract",
        failures,
    )
    require_tokens(
        text,
        ["handoff", "next_owner", "owner_reason", "must_read_refs", "open_questions"],
        "handoff contract",
        failures,
    )

    for owner in ["style-overlay", "delivery-skill", "other", "qihan-writing"]:
        require(owner in text, f"handoff owner enum missing extensible owner: {owner}", failures)

    for guardrail in [
        "Do not include private raw corpora",
        "raw_private_samples_in_packet: false",
        "retention_rule: \"do_not_store_raw_samples\"",
        "Use `source_scope: inferred` only for gaps or route assumptions",
        "Every profile claim, friction, style candidate, and risk candidate must cite",
        "does not authorize Intake to apply controlled-language rules",
    ]:
        require(guardrail in text, f"privacy/provenance guardrail missing: {guardrail}", failures)


def check_leaks(root: Path, paths: list[Path], failures: list[str]) -> None:
    for path in paths:
        rel = path.relative_to(root).as_posix() if path.is_absolute() else path.as_posix()
        haystacks = [(rel, "<path>"), (read_text(path), rel)]
        for text, label in haystacks:
            for pattern, description in LEAK_PATTERNS:
                if pattern.search(text):
                    failures.append(f"{label} contains {description}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=".", help="Repository root")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    failures: list[str] = []

    require((root / SKILL_DIR).is_dir(), f"missing skill directory: {SKILL_DIR}", failures)
    require((root / SKILL_DIR / "SKILL.md").is_file(), f"missing skill entrypoint: {SKILL_DIR / 'SKILL.md'}", failures)
    require((root / FRONTDOOR_PATH).is_file(), f"missing frontdoor declaration: {FRONTDOOR_PATH}", failures)
    require((root / CLI_MANIFEST_PATH).is_file(), f"missing CLI manifest: {CLI_MANIFEST_PATH}", failures)
    require((root / CLI_PATH).is_file(), f"missing CLI entrypoint: {CLI_PATH}", failures)
    require(
        not (root / SKILL_DIR / "SKILL_PAYLOAD.json").exists(),
        "installable skill must not ship SKILL_PAYLOAD.json",
        failures,
    )
    require((root / CONTRACT_PATH).is_file(), f"missing packet contract: {CONTRACT_PATH}", failures)

    paths = skill_files(root)
    if not paths:
        for failure in failures:
            print(f"error: {failure}")
        return 1

    text_by_path = {path: read_text(path) for path in paths}
    all_text = combined_text(paths)
    lower_text = all_text.lower()

    skill_md = root / SKILL_DIR / "SKILL.md"
    skill_text = text_by_path.get(skill_md, "")
    require("name: bagakit-writing-intake" in skill_text, "SKILL.md frontmatter must declare bagakit-writing-intake", failures)
    require("description:" in skill_text, "SKILL.md frontmatter must include a description", failures)

    contract_files = find_contract_files(paths, text_by_path)
    require(contract_files, "missing intake_packet/Core veto contract reference", failures)
    check_packet_contract(root, failures)

    require(
        "qihan-writing" in lower_text,
        "intake handoff should expose relation to qihan-writing without owning its style overlay",
        failures,
    )
    require(
        "bagakit-writing-core" in lower_text,
        "intake handoff should expose relation to bagakit-writing-core",
        failures,
    )
    require(
        "does not produce final prose" in skill_text.lower()
        and ("stop intake at packet emission" in skill_text.lower() or "stops at packet emission" in skill_text.lower()),
        "Intake SKILL.md must state it stops before final-prose generation",
        failures,
    )
    require(
        "do not use as the terminal drafting or rewrite owner" in skill_text.lower(),
        "Intake SKILL.md trigger must keep terminal drafting/rewrite ownership out of Intake",
        failures,
    )

    for placeholder in ["TODO", "TBD", "FIXME", "lorem ipsum"]:
        require(placeholder.lower() not in lower_text, f"skill files contain placeholder marker: {placeholder}", failures)

    forbidden_dirs = [
        root / SKILL_DIR / "raw-samples",
        root / SKILL_DIR / "raw_samples",
        root / SKILL_DIR / "corpus",
        root / SKILL_DIR / "captures",
    ]
    for forbidden_dir in forbidden_dirs:
        require(not forbidden_dir.exists(), f"installable skill must not store raw sample directory: {forbidden_dir.relative_to(root)}", failures)

    check_leaks(root, paths, failures)

    validate = run(["bash", str(CLI_PATH), "validate"], root)
    require(validate.returncode == 0, f"intake CLI validate failed: {validate.stderr}", failures)
    describe = run(["bash", str(CLI_PATH), "describe"], root)
    require(describe.returncode == 0, "intake CLI describe failed", failures)
    require("bagakit-writing-intake" in describe.stdout, "intake CLI describe missing skill id", failures)
    contract_proc = run(["bash", str(CLI_PATH), "print-packet-contract"], root)
    require(contract_proc.returncode == 0, "intake CLI print-packet-contract failed", failures)
    require("intake_packet" in contract_proc.stdout, "intake CLI packet contract output missing intake_packet", failures)

    if failures:
        print("bagakit-writing-intake gate failed:")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("ok: bagakit-writing-intake gate passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
