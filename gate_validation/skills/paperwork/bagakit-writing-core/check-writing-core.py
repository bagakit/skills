"""Validate bagakit-writing-core public behavior."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path


SKILL_DIR = Path("skills/paperwork/bagakit-writing-core")
CORE_INTAKE_MARKERS = ["intake_packet", "bagakit-writing-intake", "core_veto"]


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


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def core_text_files(root: Path) -> list[Path]:
    suffixes = {".md", ".toml", ".json", ".yaml", ".yml", ".sh", ".py"}
    return sorted(
        path
        for path in (root / SKILL_DIR).rglob("*")
        if path.is_file() and path.suffix.lower() in suffixes
    )


def check_core_intake_adapter(root: Path, cli: Path, failures: list[str]) -> None:
    files = core_text_files(root)
    text_by_path = {path: read_text(path) for path in files}
    skill_text = text_by_path.get(root / SKILL_DIR / "SKILL.md", "")
    adapter_files = [
        path
        for path, text in text_by_path.items()
        if any(marker in text for marker in CORE_INTAKE_MARKERS)
    ]
    command_advertised = "print-intake-handoff" in skill_text
    if not adapter_files and not command_advertised:
        print("note: writing-core intake adapter surface not detected; skipping adaptive intake checks")
        return

    adapter_text = "\n".join(text_by_path[path] for path in adapter_files).lower()
    required_groups = {
        "intake packet": [["intake_packet"]],
        "Core veto": [["core_veto"], ["core", "veto"]],
        "Intake skill": [["bagakit-writing-intake"]],
        "semantic/content preservation": [["semantic drift"], ["semantic", "preservation"], ["content preservation"], ["content_regression"]],
        "evidence loss or insufficiency": [["evidence loss"], ["evidence_insufficient"], ["evidence", "insufficient"], ["evidence architecture"]],
        "task mismatch": [["task mismatch"], ["task_mismatch"], ["task fitness"]],
    }
    for label, alternatives in required_groups.items():
        require(
            any(all(token in adapter_text for token in alternative) for alternative in alternatives),
            f"writing-core intake adapter missing contract signal: {label}",
            failures,
        )
    require("sample_provenance" not in adapter_text, "writing-core adapter must not reference undefined sample_provenance field", failures)
    require("evidence_ledger" in adapter_text, "writing-core adapter must consume Intake evidence_ledger", failures)
    require("privacy_boundary" in adapter_text, "writing-core adapter must consume Intake privacy_boundary", failures)
    require(
        "rewrite_feedback_rule_candidates" in adapter_text,
        "writing-core adapter must map Intake rewrite_feedback_rule_candidates to Core validation",
        failures,
    )

    require(
        "personal taste" in adapter_text or "style overlay" in adapter_text,
        "writing-core intake adapter should keep personal taste/style overlay outside Core ownership",
        failures,
    )

    help_proc = run(["bash", str(cli), "--help"], root)
    help_text = f"{help_proc.stdout}\n{help_proc.stderr}".lower()
    if "intake" in help_text:
        validate_proc = run(["bash", str(cli), "validate"], root)
        require(validate_proc.returncode == 0, "writing-core validate failed after intake adapter surfaced", failures)

    handoff_proc = run(["bash", str(cli), "print-intake-handoff"], root)
    require(
        handoff_proc.returncode == 0,
        "writing-core CLI print-intake-handoff must succeed when adapter surface exists or SKILL advertises it",
        failures,
    )
    handoff_output = f"{handoff_proc.stdout}\n{handoff_proc.stderr}".lower()
    require("intake_packet" in handoff_output, "writing-core CLI print-intake-handoff missing intake_packet", failures)
    require("core_veto" in handoff_output, "writing-core CLI print-intake-handoff missing core_veto", failures)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=".", help="Repository root")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    failures: list[str] = []

    cli = SKILL_DIR / "scripts/bagakit-writing-core-cli.sh"
    lint_script = SKILL_DIR / "scripts/writing_core_lint.py"
    route_script = SKILL_DIR / "scripts/writing_core_route_tools.py"
    intake_script = SKILL_DIR / "scripts/writing_core_intake_packet.py"
    rules_script = SKILL_DIR / "scripts/writing_core_rules.py"
    inventory_script = SKILL_DIR / "scripts/writing_core_inventory.py"
    rule_registry = SKILL_DIR / "references/rules/core-rule-registry.toml"
    precision_reference = SKILL_DIR / "references/writing/PRECISION_AND_READER_BURDEN.md"
    review_template = SKILL_DIR / "references/review/REVIEW_PACKET_TEMPLATE.md"
    anti_rationalization = SKILL_DIR / "references/review/ANTI_RATIONALIZATION_TABLE.md"
    de_ai_cli = Path("skills/paperwork/bagakit-writing-de-ai-tone/scripts/bagakit-writing-de-ai-tone-cli.sh")
    readme = SKILL_DIR / "README.md"

    for path in [
        SKILL_DIR / "SKILL.md",
        readme,
        SKILL_DIR / "references/README.md",
        cli,
        lint_script,
        route_script,
        intake_script,
        rules_script,
        inventory_script,
        rule_registry,
        precision_reference,
        review_template,
        anti_rationalization,
        Path("skills/paperwork/bagakit-writing-de-ai-tone/references/lexicon.json"),
        de_ai_cli,
    ]:
        require((root / path).is_file(), f"missing required file: {path}", failures)

    if failures:
        for failure in failures:
            print(f"error: {failure}")
        return 1

    cli_validate = run(["bash", str(cli), "validate"], root)
    require(cli_validate.returncode == 0, "skill CLI validate failed", failures)

    rules_validate = run(["bash", str(cli), "rules", "validate"], root)
    require(rules_validate.returncode == 0, f"rules validate failed: {rules_validate.stderr}", failures)
    rules_payload = load_json(rules_validate.stdout, "rules validate", failures)
    require(rules_payload.get("ok") is True, "rules validate should report ok", failures)
    require(int(rules_payload.get("count", 0)) >= 13, "rules registry should expose the expanded Core rule set", failures)

    rule_show = run(["bash", str(cli), "rules", "show", "title-promise-topic-label"], root)
    require(rule_show.returncode == 0, "rules show should find title-promise-topic-label", failures)
    rule_payload = load_json(rule_show.stdout, "rules show", failures)
    require(rule_payload.get("owner") == "bagakit-writing-core", "shown rule should keep Core ownership", failures)
    require("proof_mode" in rule_payload, "shown rule should expose proof_mode", failures)

    rhythm_rule_show = run(["bash", str(cli), "rules", "show", "object-before-short-judgment"], root)
    require(rhythm_rule_show.returncode == 0, "rules show should find object-before-short-judgment", failures)
    rhythm_rule_payload = load_json(rhythm_rule_show.stdout, "object-before-short-judgment rule", failures)
    require(rhythm_rule_payload.get("owner") == "bagakit-writing-core", "object-before-short-judgment should keep Core ownership", failures)
    require(rhythm_rule_payload.get("proof_mode") == "lint_json", "object-before-short-judgment should use lint_json proof", failures)

    for clarity_rule_id in [
        "terminology-stability-one-concept",
        "referent-actor-action-visible",
        "instruction-primary-action",
        "reader-burden-bounds-complexity",
    ]:
        clarity_rule_show = run(["bash", str(cli), "rules", "show", clarity_rule_id], root)
        require(clarity_rule_show.returncode == 0, f"rules show should find {clarity_rule_id}", failures)
        clarity_rule_payload = load_json(clarity_rule_show.stdout, clarity_rule_id, failures)
        require(clarity_rule_payload.get("owner") == "bagakit-writing-core", f"{clarity_rule_id} should keep Core ownership", failures)
        require(clarity_rule_payload.get("source_refs"), f"{clarity_rule_id} should expose source_refs", failures)

    de_ai_proc = run(["bash", str(cli), "de-ai-tone", "describe"], root)
    require(de_ai_proc.returncode == 0, "writing-core de-ai-tone dispatch failed", failures)
    require(
        "bagakit-writing-de-ai-tone" in de_ai_proc.stdout,
        "writing-core de-ai-tone dispatch did not reach de-AI-tone primitive",
        failures,
    )

    reference_text = "\n".join(
        path.read_text(encoding="utf-8")
        for path in (root / SKILL_DIR / "references").rglob("*")
        if path.is_file() and path.suffix in {".md", ".json", ".toml"}
    )
    for forbidden in ["花叔", "橙皮书", "DeerFlow", "公众号", "飞书"]:
        require(
            forbidden not in reference_text,
            f"writing-core references should not carry L2 or borrowed-source token: {forbidden}",
            failures,
        )

    review_proc = run(["bash", str(cli), "print-review-packet-template"], root)
    require(review_proc.returncode == 0, "print-review-packet-template failed", failures)
    for token in [
        "skill: `bagakit-writing-core`",
        "Evidence And Sample Boundary",
        "counterevidence",
        "reviewer_ownership",
        "docs/specs/review-packet-contract.md",
    ]:
        require(token in review_proc.stdout, f"review packet template missing token: {token}", failures)

    anti_proc = run(["bash", str(cli), "print-anti-rationalization-table"], root)
    require(anti_proc.returncode == 0, "print-anti-rationalization-table failed", failures)
    for token in [
        "Rationalization",
        "Required Action",
        "The model knows the tool or API",
        "accepted deviation",
    ]:
        require(token in anti_proc.stdout, f"anti-rationalization table missing token: {token}", failures)

    check_core_intake_adapter(root, cli, failures)

    with tempfile.TemporaryDirectory(prefix="writing-core-gate-") as tmp_dir:
        tmp = Path(tmp_dir)
        route = tmp / "route.md"
        route.write_text(
            "\n".join(
                [
                    "# Route",
                    "",
                    "- title_promise: A title must make a judgment.",
                    "- first_question: What should the reader decide first?",
                    "- evidence_movement: Start from claim, then evidence.",
                    "- chapter_movement: Move from problem to mechanism to action.",
                    "- exit_move: Decide the next writing action.",
                    "",
                ]
            ),
            encoding="utf-8",
        )
        route_proc = run(["bash", str(cli), "route", "check-foundation", str(route)], root)
        require(route_proc.returncode == 0, f"route check failed: {route_proc.stderr}", failures)
        route_payload = load_json(route_proc.stdout, "route check", failures)
        require(route_payload.get("stable") is True, "route check should mark fixture stable", failures)

        foundation = tmp / "foundation.md"
        foundation.write_text(
            "\n".join(
                [
                    "# Rewrite Core Needs A Rule Registry",
                    "",
                    "- title_promise: Core rules should be reusable metadata, not scattered advice.",
                    "- first_question: Which generic writing checks should every L2 skill inherit?",
                    "- evidence_shape: Source notes, rule ids, and benchmark 12 ms command output.",
                    "- sample_boundary: Applies to paperwork L1 Core and excludes personal style overlays.",
                    "- counterevidence: A tiny typo fix should not require a full review packet.",
                    "- exit_move: Next action: run rules validate and inventory compare before accepting the rewrite.",
                    "",
                ]
            ),
            encoding="utf-8",
        )
        foundation_proc = run(["bash", str(cli), "route", "review-foundation", str(foundation)], root)
        require(foundation_proc.returncode == 0, f"foundation review failed: {foundation_proc.stderr}", failures)
        foundation_payload = load_json(foundation_proc.stdout, "foundation review", failures)
        require(
            foundation_payload.get("schema") == "bagakit.writing_core_foundation_review.v1",
            "foundation review should expose its schema",
            failures,
        )
        require(foundation_payload.get("status") == "stable", "foundation fixture should be stable", failures)
        dimensions = {str(item.get("name")) for item in foundation_payload.get("dimensions", [])}
        for expected_dimension in ["object_boundary", "first_question", "evidence_shape", "reader_action"]:
            require(expected_dimension in dimensions, f"foundation review missing dimension: {expected_dimension}", failures)

        incomplete_handoff = tmp / "incomplete-handoff.md"
        incomplete_handoff.write_text(
            "\n".join(
                [
                    "# Handoff",
                    "",
                    "- title_promise: A title must make a judgment.",
                    "- first_question: What should the reader decide first?",
                    "- evidence_movement: Start from claim, then evidence.",
                    "- chapter_movement: Move from problem to mechanism to action.",
                    "- exit_move: Decide the next writing action.",
                    "",
                ]
            ),
            encoding="utf-8",
        )
        derive_proc = run(["bash", str(cli), "route", "derive-route", str(incomplete_handoff)], root)
        require(derive_proc.returncode == 2, "derive-route should reject incomplete handoff", failures)
        derive_payload = load_json(derive_proc.stdout, "derive-route incomplete handoff", failures)
        require(derive_payload.get("stable") is False, "derive-route error should mark handoff unstable", failures)
        require(
            derive_payload.get("error") == "missing_required_fields",
            "derive-route error should be structured",
            failures,
        )
        missing = set(derive_payload.get("missingFields", []))
        for expected_missing in [
            "promoted_claim",
            "chosen_viewpoint",
            "hard_boundary",
            "evidence_pack",
            "return_gate_passed_because",
        ]:
            require(
                expected_missing in missing,
                f"derive-route missingFields should include {expected_missing}",
                failures,
            )

        draft = tmp / "draft.md"
        draft.write_text(
            "\n".join(
                [
                    "# Title With A Claim",
                    "",
                    "## First Claim",
                    "",
                    "本文将通过多个步骤从而进而说明这个问题。",
                    "管住了一个开放、长期、容易跑偏的任务。",
                    "",
                    "- one",
                    "- two",
                    "- three",
                    "- four",
                    "",
                    "## Second Claim",
                    "",
                    "The next action is check.",
                    "",
                    "## Third Claim",
                    "",
                    "Goal, status, next step.",
                    "",
                ]
            ),
            encoding="utf-8",
        )
        lint_proc = run(["bash", str(cli), "lint", "--fail-on", "none", str(draft)], root)
        require(lint_proc.returncode == 0, f"lint command failed: {lint_proc.stderr}", failures)
        lint_payload = load_json(lint_proc.stdout, "lint", failures)
        require("findings" in lint_payload, "lint output missing findings", failures)
        require("proseMechanics" in lint_payload, "lint output missing proseMechanics", failures)
        codes = {str(item.get("code")) for item in lint_payload.get("findings", [])}
        require(
            "AI_PATTERNS" in codes or "LIST_BLOCK_CLUSTER" in codes,
            "lint fixture should produce a writing signal",
            failures,
        )
        require(
            "OBJECT_JUDGMENT_TAIL_ADVISORY" in codes,
            "lint fixture should expose object/judgment sentence-rhythm advisory",
            failures,
        )

        source = tmp / "source.md"
        source.write_text(
            "\n".join(
                [
                    "# Preserve Evidence",
                    "",
                    "Claim: Core must keep rewrite evidence visible.",
                    "Evidence: benchmark source https://example.com/core shows `scripts/core-check.ts` at 12 ms.",
                    "Constraint: must not drop protected implementation paths.",
                    "Risk: deleting the command hides a review failure.",
                    "Next action: run validate before publishing.",
                    "",
                ]
            ),
            encoding="utf-8",
        )
        rewrite = tmp / "rewrite.md"
        rewrite.write_text("# Preserve Evidence\n\nCore should improve the draft.\n", encoding="utf-8")
        inventory_proc = run(["bash", str(cli), "inventory", "compare", str(source), str(rewrite), "--fail-on", "risk"], root)
        require(inventory_proc.returncode == 2, "inventory compare should fail on detected regression risk", failures)
        inventory_payload = load_json(inventory_proc.stdout, "inventory compare", failures)
        require(
            inventory_payload.get("schema") == "bagakit.writing_core_inventory_compare.v1",
            "inventory compare should expose its schema",
            failures,
        )
        require(inventory_payload.get("regressionRisk") is True, "inventory compare should flag regression risk", failures)
        require(
            bool(inventory_payload.get("missingCategories")) or bool(inventory_payload.get("missingProtectedLikeTokens")),
            "inventory compare should name missing categories or protected-like tokens",
            failures,
        )

        intake_packet = tmp / "intake-packet.json"
        intake_packet.write_text(
            json.dumps(
                {
                    "intake_packet": {
                        "packet_version": "0.1",
                        "task_route": {
                            "requested_action": "plan a rewrite",
                            "intake_lane": "rewrite_plan",
                            "final_prose_requested": False,
                            "final_prose_owner": "bagakit-writing-core",
                        },
                        "audience_channel_genre": {
                            "audience": "internal technical readers",
                            "channel": "Feishu doc",
                            "genre": "research synthesis",
                            "decision_or_action_expected": "choose rewrite owner",
                        },
                        "source_material_state": {
                            "available_materials": ["draft"],
                            "missing_materials": [],
                            "stability": "partial",
                            "reason": "draft is present but style evidence is thin",
                        },
                        "clarity_routing": {
                            "reader_target_language_proficiency": "working",
                            "text_mode": "argument",
                            "misunderstanding_consequence": "moderate",
                            "terminology_state": "stable",
                            "precision_route": "core_clarity",
                            "evidence_ids": ["e1"],
                        },
                        "evidence_ledger": [
                            {
                                "id": "e1",
                                "kind": "draft",
                                "source_scope": "provided_in_task",
                                "excerpt_or_pointer": "draft paragraph 1",
                                "supports": ["semantic_drift"],
                                "confidence": "medium",
                            }
                        ],
                        "privacy_boundary": {
                            "raw_private_samples_in_packet": False,
                            "retention_rule": "do_not_store_raw_samples",
                            "allowed_reuse": "task_only",
                            "notes": "Use task-local pointers only.",
                        },
                        "language_profile": {
                            "dimensions": [
                                {
                                    "name": "opening_move",
                                    "observation": "Starts with a claim.",
                                    "candidate_rule": "Start with the decision-relevant claim.",
                                    "scope": "document",
                                    "rollback_condition": "Do not apply when context is missing.",
                                    "evidence_ids": ["e1"],
                                    "confidence": "medium",
                                }
                            ],
                            "confidence": "medium",
                            "evidence_ids": ["e1"],
                        },
                        "expression_strengths": [],
                        "expression_frictions": [],
                        "protected_spans": [],
                        "style_candidates": [],
                        "core_risk_candidates": [
                            {
                                "risk": "semantic_drift",
                                "evidence_ids": ["e1"],
                                "why_core_should_check": "Rewrite may change the claim.",
                                "confidence": "medium",
                            }
                        ],
                        "rewrite_feedback_rule_candidates": [],
                        "handoff": {
                            "next_owner": "bagakit-writing-core",
                            "owner_reason": "Core should confirm semantic preservation.",
                            "must_read_refs": ["references/workflow/INTAKE_HANDOFF_AND_CORE_VETO.md"],
                            "open_questions": [],
                        },
                    }
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        intake_proc = run(["bash", str(cli), "intake", "check-packet", str(intake_packet)], root)
        require(intake_proc.returncode == 0, f"intake check-packet failed: {intake_proc.stderr}", failures)
        intake_payload = load_json(intake_proc.stdout, "intake check-packet", failures)
        require(intake_payload.get("stable") is True, "intake check-packet should mark valid fixture stable", failures)
        require(
            intake_payload.get("clarityRouting", {}).get("precision_route") == "core_clarity",
            "intake check-packet should expose the selected clarity route",
            failures,
        )
        veto_kinds = {str(item.get("vetoKind")) for item in intake_payload.get("coreVetoCandidates", [])}
        require("content_regression" in veto_kinds, "intake check-packet should map semantic_drift to content_regression", failures)

        broken_packet = tmp / "broken-intake-packet.json"
        broken_source = json.loads(intake_packet.read_text(encoding="utf-8"))
        broken_source["intake_packet"]["language_profile"]["evidence_ids"] = ["missing-evidence"]
        broken_packet.write_text(json.dumps(broken_source, ensure_ascii=False, indent=2), encoding="utf-8")
        broken_proc = run(["bash", str(cli), "intake", "check-packet", str(broken_packet)], root)
        require(broken_proc.returncode == 2, "intake check-packet should reject unknown evidence references", failures)
        broken_payload = load_json(broken_proc.stdout, "broken intake check-packet", failures)
        require(broken_payload.get("stable") is False, "broken intake check-packet should mark packet unstable", failures)
        require(
            broken_payload.get("nextAction") == "repair_intake_packet",
            "broken intake check-packet should return repair next action",
            failures,
        )

        yaml_packet = tmp / "intake-packet.yaml"
        yaml_packet.write_text(
            "\n".join(
                [
                    "intake_packet:",
                    "  packet_version: '0.1'",
                    "  task_route:",
                    "    requested_action: plan a rewrite",
                    "    intake_lane: rewrite_plan",
                    "    final_prose_requested: false",
                    "    final_prose_owner: bagakit-writing-core",
                    "  audience_channel_genre:",
                    "    audience: internal technical readers",
                    "    channel: Feishu doc",
                    "    genre: research synthesis",
                    "    decision_or_action_expected: choose rewrite owner",
                    "  source_material_state:",
                    "    available_materials: [draft]",
                    "    missing_materials: []",
                    "    stability: partial",
                    "    reason: draft is present but style evidence is thin",
                    "  clarity_routing:",
                    "    reader_target_language_proficiency: working",
                    "    text_mode: argument",
                    "    misunderstanding_consequence: moderate",
                    "    terminology_state: stable",
                    "    precision_route: core_clarity",
                    "    evidence_ids: [e1]",
                    "  evidence_ledger:",
                    "    - id: e1",
                    "      kind: draft",
                    "      source_scope: provided_in_task",
                    "      excerpt_or_pointer: draft paragraph 1",
                    "      supports: [semantic_drift]",
                    "      confidence: medium",
                    "  privacy_boundary:",
                    "    raw_private_samples_in_packet: false",
                    "    retention_rule: do_not_store_raw_samples",
                    "    allowed_reuse: task_only",
                    "    notes: Use task-local pointers only.",
                    "  language_profile:",
                    "    dimensions:",
                    "      - name: opening_move",
                    "        observation: Starts with a claim.",
                    "        candidate_rule: Start with the decision-relevant claim.",
                    "        scope: document",
                    "        rollback_condition: Do not apply when context is missing.",
                    "        evidence_ids: [e1]",
                    "        confidence: medium",
                    "    confidence: medium",
                    "    evidence_ids: [e1]",
                    "  expression_strengths: []",
                    "  expression_frictions: []",
                    "  protected_spans: []",
                    "  style_candidates: []",
                    "  core_risk_candidates:",
                    "    - risk: semantic_drift",
                    "      evidence_ids: [e1]",
                    "      why_core_should_check: Rewrite may change the claim.",
                    "      confidence: medium",
                    "  rewrite_feedback_rule_candidates: []",
                    "  handoff:",
                    "    next_owner: bagakit-writing-core",
                    "    owner_reason: Core should confirm semantic preservation.",
                    "    must_read_refs: [references/workflow/INTAKE_HANDOFF_AND_CORE_VETO.md]",
                    "    open_questions: []",
                    "",
                ]
            ),
            encoding="utf-8",
        )
        yaml_proc = run(["bash", str(cli), "intake", "check-packet", str(yaml_packet)], root)
        require(yaml_proc.returncode == 0, f"intake check-packet should accept YAML packets: {yaml_proc.stderr}", failures)
        yaml_payload = load_json(yaml_proc.stdout, "YAML intake check-packet", failures)
        require(yaml_payload.get("stable") is True, "YAML intake check-packet should mark valid fixture stable", failures)

        invalid_packet = tmp / "invalid-intake-packet.json"
        invalid_source = json.loads(intake_packet.read_text(encoding="utf-8"))
        invalid = invalid_source["intake_packet"]
        invalid["source_material_state"]["available_materials"] = [42]
        invalid["language_profile"]["dimensions"][0]["evidence_ids"] = []
        invalid["language_profile"]["dimensions"][0]["confidence"] = "certain"
        invalid["evidence_ledger"][0]["supports"] = [None]
        invalid["evidence_ledger"][0]["source_scope"] = "guessed"
        invalid["rewrite_feedback_rule_candidates"] = [
            {
                "before_pointer": "draft sentence 1",
                "after_pointer": "user edit 1",
                "delta_type": "vibes",
                "inferred_rule": "Use a sharper verb.",
                "scope": "document",
                "rollback_condition": "Do not apply when it changes facts.",
                "evidence_ids": ["e1"],
                "confidence": "medium",
            }
        ]
        invalid["style_candidates"] = [
            {
                "rule_candidate": "Open with a judgment.",
                "applies_when": "Synthesis doc",
                "avoid_when": "Definition-first doc",
                "evidence_ids": "e1",
                "confidence": "medium",
            }
        ]
        invalid["handoff"]["must_read_refs"] = [False]
        invalid_packet.write_text(json.dumps(invalid_source, ensure_ascii=False, indent=2), encoding="utf-8")
        invalid_proc = run(["bash", str(cli), "intake", "check-packet", str(invalid_packet)], root)
        require(invalid_proc.returncode == 2, "intake check-packet should reject bad enums, wrong types, and empty evidence refs", failures)
        invalid_payload = load_json(invalid_proc.stdout, "invalid intake check-packet", failures)
        invalid_errors = "\n".join(str(item) for item in invalid_payload.get("errors", []))
        for expected_error in [
            "source_scope has unsupported value",
            "source_material_state.available_materials[0] must be a string",
            "confidence has unsupported value",
            "evidence_ledger[0].supports[0] must be a string",
            "evidence_ids must cite at least one evidence id",
            "delta_type has unsupported value",
            "style_candidates[0].evidence_ids must be a list",
            "handoff.must_read_refs[0] must be a string",
        ]:
            require(expected_error in invalid_errors, f"invalid packet should report: {expected_error}", failures)

    if failures:
        print("writing-core gate failed:")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("ok: writing-core gate passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
