"""Validate and inspect the bagakit-writing-core rule registry."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


DEFAULT_REGISTRY = Path(__file__).resolve().parents[1] / "references/rules/core-rule-registry.toml"
REQUIRED_FIELDS = {
    "id",
    "source",
    "scope",
    "severity",
    "enforcement_tier",
    "proof_mode",
    "owner",
    "applies_when",
    "exempt_when",
    "good_example",
    "bad_example",
    "non_goal",
}
ALLOWED_SEVERITY = {"hard", "warn", "advisory", "review", "eval-only"}
ALLOWED_ENFORCEMENT = {"hard", "warn", "advisory", "lint", "review", "eval-only"}
ALLOWED_PROOF = {
    "lint_json",
    "foundation_review",
    "inventory_compare",
    "review_packet",
    "audience_review",
    "de_ai_tone_lint",
    "agent_review",
}
ID_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def parse_value(raw: str) -> object:
    value = raw.strip()
    if value.startswith('"') and value.endswith('"'):
        return value[1:-1]
    if value.startswith("[") and value.endswith("]"):
        inner = value[1:-1].strip()
        if not inner:
            return []
        return [item.strip().strip('"') for item in inner.split(",")]
    if value.isdigit():
        return int(value)
    return value


def load_registry(path: Path) -> dict:
    rules: list[dict[str, object]] = []
    version = None
    current: dict[str, object] | None = None
    for line_no, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line == "[[rule]]":
            current = {"_line": line_no}
            rules.append(current)
            continue
        if "=" not in line:
            raise ValueError(f"line {line_no}: expected key = value")
        key, raw_value = line.split("=", 1)
        key = key.strip()
        value = parse_value(raw_value)
        if current is None:
            if key == "version":
                version = value
                continue
            raise ValueError(f"line {line_no}: root key is not supported: {key}")
        current[key] = value
    return {"version": version, "rules": rules}


def validate_rule(rule: dict[str, object], seen: set[str]) -> list[str]:
    errors: list[str] = []
    rule_id = str(rule.get("id", ""))
    missing = sorted(REQUIRED_FIELDS - set(rule))
    if missing:
        errors.append(f"{rule_id or '<unknown>'}: missing fields: {', '.join(missing)}")
    if not ID_RE.match(rule_id):
        errors.append(f"{rule_id or '<unknown>'}: id must be lowercase hyphen-case")
    if rule_id in seen:
        errors.append(f"{rule_id}: duplicate rule id")
    seen.add(rule_id)
    if rule.get("owner") != "bagakit-writing-core":
        errors.append(f"{rule_id}: owner must be bagakit-writing-core")
    if rule.get("severity") not in ALLOWED_SEVERITY:
        errors.append(f"{rule_id}: unsupported severity {rule.get('severity')!r}")
    if rule.get("enforcement_tier") not in ALLOWED_ENFORCEMENT:
        errors.append(f"{rule_id}: unsupported enforcement_tier {rule.get('enforcement_tier')!r}")
    if rule.get("proof_mode") not in ALLOWED_PROOF:
        errors.append(f"{rule_id}: unsupported proof_mode {rule.get('proof_mode')!r}")
    for field in ("scope", "applies_when", "exempt_when"):
        value = rule.get(field)
        if not isinstance(value, list) or not all(isinstance(item, str) and item for item in value):
            errors.append(f"{rule_id}: {field} must be a non-empty string list")
    if "source_refs" in rule:
        value = rule.get("source_refs")
        if not isinstance(value, list) or not all(isinstance(item, str) and item for item in value):
            errors.append(f"{rule_id}: source_refs must be a non-empty string list when present")
    for field in ("good_example", "bad_example", "non_goal"):
        value = rule.get(field)
        if not isinstance(value, str) or not value.strip():
            errors.append(f"{rule_id}: {field} must be non-empty")
    return errors


def serializable_rule(rule: dict[str, object]) -> dict[str, object]:
    return {key: value for key, value in rule.items() if not key.startswith("_")}


def validate_registry(path: Path) -> tuple[dict, int]:
    try:
        registry = load_registry(path)
    except Exception as exc:  # noqa: BLE001 - CLI should report parse errors.
        return {"schema": "bagakit.core_rule_registry.v1", "path": str(path), "ok": False, "errors": [str(exc)]}, 2
    seen: set[str] = set()
    errors: list[str] = []
    for rule in registry["rules"]:
        errors.extend(validate_rule(rule, seen))
    payload = {
        "schema": "bagakit.core_rule_registry.v1",
        "path": str(path),
        "ok": not errors,
        "version": registry["version"],
        "count": len(registry["rules"]),
        "errors": errors,
    }
    return payload, 0 if not errors else 2


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registry", default=str(DEFAULT_REGISTRY), help="Path to core-rule-registry.toml")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("validate", help="Validate registry shape")
    sub.add_parser("list", help="List registry rules as JSON")
    show = sub.add_parser("show", help="Show one rule by id")
    show.add_argument("rule_id")
    return parser


def main(argv: list[str]) -> int:
    parser = build_parser()
    args = parser.parse_args(argv[1:])
    path = Path(args.registry)
    if not path.is_file():
        print(json.dumps({"ok": False, "error": f"registry not found: {path}"}, indent=2))
        return 2
    if args.cmd == "validate":
        payload, code = validate_registry(path)
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return code
    registry = load_registry(path)
    if args.cmd == "list":
        print(json.dumps({
            "schema": "bagakit.core_rule_registry.v1",
            "path": str(path),
            "count": len(registry["rules"]),
            "rules": [
                {
                    "id": rule.get("id"),
                    "scope": rule.get("scope"),
                    "severity": rule.get("severity"),
                    "enforcement_tier": rule.get("enforcement_tier"),
                    "proof_mode": rule.get("proof_mode"),
                }
                for rule in registry["rules"]
            ],
        }, ensure_ascii=False, indent=2))
        return 0
    if args.cmd == "show":
        for rule in registry["rules"]:
            if rule.get("id") == args.rule_id:
                print(json.dumps(serializable_rule(rule), ensure_ascii=False, indent=2))
                return 0
        print(json.dumps({"ok": False, "error": f"rule not found: {args.rule_id}"}, indent=2))
        return 2
    parser.print_help()
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
