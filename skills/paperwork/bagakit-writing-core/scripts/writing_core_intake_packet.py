"""Validate a writing Intake packet before Core consumes it.

Usage:
  python3 scripts/writing_core_intake_packet.py check-packet packet.json
  python3 scripts/writing_core_intake_packet.py check-packet packet.yaml

Exit codes:
  0: packet is structurally consumable by Core
  2: packet is missing required shape, evidence links, privacy boundary, or enum values
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError as exc:  # pragma: no cover - environment preflight
    raise SystemExit("error: PyYAML is required for writing_core_intake_packet.py") from exc


REQUIRED_TOP_LEVEL = [
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
]

REQUIRED_OBJECT_FIELDS = {
    "task_route": ["requested_action", "intake_lane", "final_prose_requested", "final_prose_owner"],
    "audience_channel_genre": ["audience", "channel", "genre", "decision_or_action_expected"],
    "source_material_state": ["available_materials", "missing_materials", "stability", "reason"],
    "clarity_routing": [
        "reader_target_language_proficiency",
        "text_mode",
        "misunderstanding_consequence",
        "terminology_state",
        "precision_route",
        "evidence_ids",
    ],
    "privacy_boundary": ["raw_private_samples_in_packet", "retention_rule", "allowed_reuse", "notes"],
    "language_profile": ["dimensions", "confidence", "evidence_ids"],
    "handoff": ["next_owner", "owner_reason", "must_read_refs", "open_questions"],
}

REQUIRED_ITEM_FIELDS = {
    "evidence_ledger": ["id", "kind", "source_scope", "excerpt_or_pointer", "supports", "confidence"],
    "language_profile.dimensions": [
        "name",
        "observation",
        "candidate_rule",
        "scope",
        "rollback_condition",
        "evidence_ids",
        "confidence",
    ],
    "expression_strengths": ["claim", "evidence_ids", "confidence"],
    "expression_frictions": ["claim", "likely_fix_owner", "evidence_ids", "confidence"],
    "protected_spans": ["span_or_pointer", "protection_reason", "allowed_operations", "evidence_ids"],
    "style_candidates": ["rule_candidate", "applies_when", "avoid_when", "evidence_ids", "confidence"],
    "core_risk_candidates": ["risk", "evidence_ids", "why_core_should_check", "confidence"],
    "rewrite_feedback_rule_candidates": [
        "before_pointer",
        "after_pointer",
        "delta_type",
        "inferred_rule",
        "scope",
        "rollback_condition",
        "evidence_ids",
        "confidence",
    ],
}

ENUMS = {
    "task_route.intake_lane": {"diagnose", "rewrite_plan", "style_calibration", "feedback_abstraction", "handoff"},
    "task_route.final_prose_owner": {
        "none",
        "bagakit-writing-core",
        "bagakit-writing-de-ai-tone",
        "style-overlay",
        "delivery-skill",
        "qihan-writing",
        "other",
    },
    "source_material_state.stability": {"stable", "partial", "unstable"},
    "clarity_routing.reader_target_language_proficiency": {"fluent", "working", "limited", "mixed", "unknown"},
    "clarity_routing.text_mode": {"procedure", "description", "argument", "mixed"},
    "clarity_routing.misunderstanding_consequence": {"low", "moderate", "high", "safety_critical"},
    "clarity_routing.terminology_state": {"stable", "glossary_available", "inconsistent", "unknown"},
    "clarity_routing.precision_route": {"ordinary", "core_clarity", "controlled_technical"},
    "privacy_boundary.allowed_reuse": {"task_only", "user_confirmed_profile", "team_pattern", "none"},
    "handoff.next_owner": {
        "bagakit-writing-core",
        "bagakit-writing-de-ai-tone",
        "style-overlay",
        "delivery-skill",
        "qihan-writing",
        "user",
        "none",
        "other",
    },
}

ITEM_ENUMS = {
    "evidence_ledger.kind": {"draft", "sample", "user_edit", "instruction", "constraint", "inferred_gap"},
    "evidence_ledger.source_scope": {"provided_in_task", "user_confirmed", "inferred"},
    "language_profile.dimensions.name": {
        "opening_move",
        "argument_order",
        "sentence_density",
        "evidence_posture",
        "voice_tone",
        "other",
    },
    "language_profile.dimensions.scope": {"local", "document", "profile_candidate"},
    "expression_frictions.likely_fix_owner": {"core", "de-ai-tone", "style-overlay", "delivery", "user"},
    "protected_spans.protection_reason": {"semantic", "legal", "factual", "voice", "user_requested", "unknown"},
    "rewrite_feedback_rule_candidates.delta_type": {
        "content",
        "structure",
        "tone",
        "rhythm",
        "evidence",
        "specificity",
        "layout",
    },
    "rewrite_feedback_rule_candidates.scope": {"local", "document", "profile_candidate"},
}

CONFIDENCE_FIELDS = {
    "evidence_ledger",
    "language_profile",
    "language_profile.dimensions",
    "expression_strengths",
    "expression_frictions",
    "style_candidates",
    "core_risk_candidates",
    "rewrite_feedback_rule_candidates",
}

CONFIDENCE_VALUES = {"high", "medium", "low"}

RISK_TO_VETO = {
    "semantic_drift": "content_regression",
    "evidence_loss": "evidence_insufficient",
    "task_mismatch": "task_mismatch",
    "unclear_audience": "clarity_failure",
    "weak_foundation": "foundation_unstable",
    "over_style": "style_overrides_substance",
}


def load_packet(path: Path) -> dict[str, Any]:
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise SystemExit(f"file not found: {path}") from exc

    if path.suffix.lower() in {".yaml", ".yml"}:
        try:
            payload = yaml.safe_load(text)
        except yaml.YAMLError as exc:
            raise SystemExit(f"invalid YAML: {exc}") from exc
    else:
        try:
            payload = json.loads(text)
        except json.JSONDecodeError as exc:
            raise SystemExit(f"invalid JSON: {exc.lineno}:{exc.colno}: {exc.msg}") from exc

    if not isinstance(payload, dict):
        raise SystemExit("packet file must contain an object")
    packet = payload.get("intake_packet", payload)
    if not isinstance(packet, dict):
        raise SystemExit("intake_packet must be an object")
    return packet


def require_object(packet: dict[str, Any], key: str, errors: list[str]) -> dict[str, Any]:
    value = packet.get(key)
    if not isinstance(value, dict):
        errors.append(f"{key} must be an object")
        return {}
    return value


def require_list(packet: dict[str, Any], key: str, errors: list[str]) -> list[Any]:
    value = packet.get(key)
    if not isinstance(value, list):
        errors.append(f"{key} must be a list")
        return []
    return value


def require_string(obj: dict[str, Any], key: str, path: str, errors: list[str], *, nonempty: bool = True) -> None:
    value = obj.get(key)
    if not isinstance(value, str):
        errors.append(f"{path}.{key} must be a string")
        return
    if nonempty and not value.strip():
        errors.append(f"{path}.{key} must be non-empty")


def require_bool(obj: dict[str, Any], key: str, path: str, errors: list[str]) -> None:
    if not isinstance(obj.get(key), bool):
        errors.append(f"{path}.{key} must be a boolean")


def require_list_field(obj: dict[str, Any], key: str, path: str, errors: list[str]) -> list[Any]:
    value = obj.get(key)
    if not isinstance(value, list):
        errors.append(f"{path}.{key} must be a list")
        return []
    return value


def require_string_list_field(obj: dict[str, Any], key: str, path: str, errors: list[str]) -> list[str]:
    values = require_list_field(obj, key, path, errors)
    strings: list[str] = []
    for index, value in enumerate(values):
        if not isinstance(value, str):
            errors.append(f"{path}.{key}[{index}] must be a string")
            continue
        strings.append(value)
    return strings


def check_required_fields(packet: dict[str, Any], errors: list[str]) -> None:
    for key in REQUIRED_TOP_LEVEL:
        if key not in packet:
            errors.append(f"missing top-level field: {key}")

    for key, fields in REQUIRED_OBJECT_FIELDS.items():
        obj = require_object(packet, key, errors)
        for field in fields:
            if field not in obj:
                errors.append(f"{key} missing field: {field}")

    for key, fields in REQUIRED_ITEM_FIELDS.items():
        if key == "language_profile.dimensions":
            language_profile = require_object(packet, "language_profile", errors)
            items = language_profile.get("dimensions", [])
            if not isinstance(items, list):
                errors.append("language_profile.dimensions must be a list")
                items = []
        else:
            items = require_list(packet, key, errors)
        for index, item in enumerate(items):
            if not isinstance(item, dict):
                errors.append(f"{key}[{index}] must be an object")
                continue
            for field in fields:
                if field not in item:
                    errors.append(f"{key}[{index}] missing field: {field}")


def check_object_types(packet: dict[str, Any], errors: list[str]) -> None:
    task_route = require_object(packet, "task_route", errors)
    for field in ["requested_action", "intake_lane", "final_prose_owner"]:
        require_string(task_route, field, "task_route", errors)
    require_bool(task_route, "final_prose_requested", "task_route", errors)

    audience = require_object(packet, "audience_channel_genre", errors)
    for field in ["audience", "channel", "genre", "decision_or_action_expected"]:
        require_string(audience, field, "audience_channel_genre", errors)

    source = require_object(packet, "source_material_state", errors)
    require_string_list_field(source, "available_materials", "source_material_state", errors)
    require_string_list_field(source, "missing_materials", "source_material_state", errors)
    for field in ["stability", "reason"]:
        require_string(source, field, "source_material_state", errors)

    clarity = require_object(packet, "clarity_routing", errors)
    for field in [
        "reader_target_language_proficiency",
        "text_mode",
        "misunderstanding_consequence",
        "terminology_state",
        "precision_route",
    ]:
        require_string(clarity, field, "clarity_routing", errors)
    require_string_list_field(clarity, "evidence_ids", "clarity_routing", errors)

    privacy = require_object(packet, "privacy_boundary", errors)
    require_bool(privacy, "raw_private_samples_in_packet", "privacy_boundary", errors)
    for field in ["retention_rule", "allowed_reuse", "notes"]:
        require_string(privacy, field, "privacy_boundary", errors, nonempty=field != "notes")

    language_profile = require_object(packet, "language_profile", errors)
    require_list_field(language_profile, "dimensions", "language_profile", errors)
    require_string_list_field(language_profile, "evidence_ids", "language_profile", errors)
    require_string(language_profile, "confidence", "language_profile", errors)

    handoff = require_object(packet, "handoff", errors)
    for field in ["next_owner", "owner_reason"]:
        require_string(handoff, field, "handoff", errors)
    require_string_list_field(handoff, "must_read_refs", "handoff", errors)
    require_string_list_field(handoff, "open_questions", "handoff", errors)


def check_item_types(packet: dict[str, Any], errors: list[str]) -> None:
    item_string_fields = {
        "evidence_ledger": ["id", "kind", "source_scope", "excerpt_or_pointer", "confidence"],
        "language_profile.dimensions": [
            "name",
            "observation",
            "candidate_rule",
            "scope",
            "rollback_condition",
            "confidence",
        ],
        "expression_strengths": ["claim", "confidence"],
        "expression_frictions": ["claim", "likely_fix_owner", "confidence"],
        "protected_spans": ["span_or_pointer", "protection_reason"],
        "style_candidates": ["rule_candidate", "applies_when", "avoid_when", "confidence"],
        "core_risk_candidates": ["risk", "why_core_should_check", "confidence"],
        "rewrite_feedback_rule_candidates": [
            "before_pointer",
            "after_pointer",
            "delta_type",
            "inferred_rule",
            "scope",
            "rollback_condition",
            "confidence",
        ],
    }
    item_list_fields = {
        "evidence_ledger": ["supports"],
        "language_profile.dimensions": ["evidence_ids"],
        "expression_strengths": ["evidence_ids"],
        "expression_frictions": ["evidence_ids"],
        "protected_spans": ["allowed_operations", "evidence_ids"],
        "style_candidates": ["evidence_ids"],
        "core_risk_candidates": ["evidence_ids"],
        "rewrite_feedback_rule_candidates": ["evidence_ids"],
    }

    for key, fields in item_string_fields.items():
        items = packet.get("language_profile", {}).get("dimensions", []) if key == "language_profile.dimensions" else packet.get(key, [])
        if not isinstance(items, list):
            continue
        for index, item in enumerate(items):
            if not isinstance(item, dict):
                continue
            path = f"{key}[{index}]"
            for field in fields:
                require_string(item, field, path, errors)

    for key, fields in item_list_fields.items():
        items = packet.get("language_profile", {}).get("dimensions", []) if key == "language_profile.dimensions" else packet.get(key, [])
        if not isinstance(items, list):
            continue
        for index, item in enumerate(items):
            if not isinstance(item, dict):
                continue
            path = f"{key}[{index}]"
            for field in fields:
                require_string_list_field(item, field, path, errors)


def check_enums(packet: dict[str, Any], errors: list[str]) -> None:
    if packet.get("packet_version") != "0.1":
        errors.append(f"packet_version has unsupported value: {packet.get('packet_version')}")

    for dotted_path, allowed in ENUMS.items():
        obj_name, field = dotted_path.split(".", 1)
        obj = packet.get(obj_name)
        if not isinstance(obj, dict) or field not in obj:
            continue
        value = obj[field]
        if value not in allowed:
            errors.append(f"{dotted_path} has unsupported value: {value}")

    for index, item in enumerate(packet.get("core_risk_candidates", [])):
        if not isinstance(item, dict):
            continue
        risk = item.get("risk")
        if risk not in RISK_TO_VETO:
            errors.append(f"core_risk_candidates[{index}].risk has unsupported value: {risk}")

    for key in CONFIDENCE_FIELDS:
        if key == "language_profile":
            value = packet.get("language_profile", {})
            if isinstance(value, dict) and value.get("confidence") not in CONFIDENCE_VALUES:
                errors.append(f"language_profile.confidence has unsupported value: {value.get('confidence')}")
            continue
        items = packet.get("language_profile", {}).get("dimensions", []) if key == "language_profile.dimensions" else packet.get(key, [])
        if not isinstance(items, list):
            continue
        for index, item in enumerate(items):
            if isinstance(item, dict) and item.get("confidence") not in CONFIDENCE_VALUES:
                errors.append(f"{key}[{index}].confidence has unsupported value: {item.get('confidence')}")

    for dotted_path, allowed in ITEM_ENUMS.items():
        list_key, field = dotted_path.rsplit(".", 1)
        items = packet.get("language_profile", {}).get("dimensions", []) if list_key == "language_profile.dimensions" else packet.get(list_key, [])
        if not isinstance(items, list):
            continue
        for index, item in enumerate(items):
            if not isinstance(item, dict) or field not in item:
                continue
            value = item[field]
            if value not in allowed:
                errors.append(f"{list_key}[{index}].{field} has unsupported value: {value}")


def evidence_ids(packet: dict[str, Any]) -> set[str]:
    ids: set[str] = set()
    for item in packet.get("evidence_ledger", []):
        if isinstance(item, dict) and isinstance(item.get("id"), str):
            ids.add(item["id"])
    return ids


def iter_evidence_refs(packet: dict[str, Any]) -> list[tuple[str, list[Any]]]:
    refs: list[tuple[str, list[Any]]] = []
    clarity_routing = packet.get("clarity_routing", {})
    if isinstance(clarity_routing, dict):
        ids = clarity_routing.get("evidence_ids")
        if isinstance(ids, list):
            refs.append(("clarity_routing.evidence_ids", ids))
    language_profile = packet.get("language_profile", {})
    if isinstance(language_profile, dict):
        ids = language_profile.get("evidence_ids")
        if isinstance(ids, list):
            refs.append(("language_profile.evidence_ids", ids))
        dimensions = language_profile.get("dimensions", [])
        if isinstance(dimensions, list):
            for index, item in enumerate(dimensions):
                if isinstance(item, dict) and isinstance(item.get("evidence_ids"), list):
                    refs.append((f"language_profile.dimensions[{index}].evidence_ids", item["evidence_ids"]))

    for key in [
        "expression_strengths",
        "expression_frictions",
        "protected_spans",
        "style_candidates",
        "core_risk_candidates",
        "rewrite_feedback_rule_candidates",
    ]:
        items = packet.get(key, [])
        if not isinstance(items, list):
            continue
        for index, item in enumerate(items):
            if isinstance(item, dict) and isinstance(item.get("evidence_ids"), list):
                refs.append((f"{key}[{index}].evidence_ids", item["evidence_ids"]))
    return refs


def check_evidence_refs(packet: dict[str, Any], errors: list[str]) -> None:
    known_ids = evidence_ids(packet)
    if not known_ids:
        errors.append("evidence_ledger must include at least one id")
    for path, refs in iter_evidence_refs(packet):
        if not refs:
            errors.append(f"{path} must cite at least one evidence id")
        for ref in refs:
            if ref not in known_ids:
                errors.append(f"{path} references unknown evidence id: {ref}")


def check_privacy(packet: dict[str, Any], errors: list[str]) -> None:
    privacy = packet.get("privacy_boundary")
    if not isinstance(privacy, dict):
        return
    if privacy.get("raw_private_samples_in_packet") is not False:
        errors.append("privacy_boundary.raw_private_samples_in_packet must be false before Core consumption")
    if not privacy.get("retention_rule"):
        errors.append("privacy_boundary.retention_rule is required")


def core_veto_candidates(packet: dict[str, Any]) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    for item in packet.get("core_risk_candidates", []):
        if not isinstance(item, dict):
            continue
        risk = item.get("risk")
        if risk not in RISK_TO_VETO:
            continue
        candidates.append(
            {
                "sourceRisk": risk,
                "vetoKind": RISK_TO_VETO[risk],
                "evidenceIds": item.get("evidence_ids", []),
                "confidence": item.get("confidence", "low"),
                "whyCoreShouldCheck": item.get("why_core_should_check", ""),
            }
        )
    return candidates


def check_packet(path: Path) -> tuple[dict[str, Any], int]:
    packet = load_packet(path)
    errors: list[str] = []
    check_required_fields(packet, errors)
    check_object_types(packet, errors)
    check_item_types(packet, errors)
    check_enums(packet, errors)
    check_evidence_refs(packet, errors)
    check_privacy(packet, errors)

    stable = not errors
    report = {
        "file": str(path),
        "stable": stable,
        "packetVersion": packet.get("packet_version"),
        "clarityRouting": packet.get("clarity_routing", {}),
        "coreVetoCandidates": core_veto_candidates(packet),
        "errors": errors,
        "nextAction": "run_core_review" if stable else "repair_intake_packet",
    }
    return report, 0 if stable else 2


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Validate a writing Intake packet before Core consumes it.")
    sub = parser.add_subparsers(dest="cmd", required=True)
    check = sub.add_parser("check-packet", help="Check a JSON or YAML intake_packet and map Core risk candidates to Core veto candidates.")
    check.add_argument("path", help="Path to a JSON or YAML intake_packet file")
    return parser


def main(argv: list[str]) -> int:
    parser = build_parser()
    args = parser.parse_args(argv[1:])
    if args.cmd == "check-packet":
        report, exit_code = check_packet(Path(args.path).expanduser())
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return exit_code
    parser.print_help()
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
