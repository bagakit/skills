set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
skill_root="$(dirname "$script_dir")"

usage() {
  cat <<'EOF'
usage: bagakit-entropy-review-cli <command>

Commands:
  describe          Print the operational entropy-review definition.
  list-references   List reference files shipped by this skill.
  validate          Validate the skill-owned public contract files.
EOF
}

case "${1:-}" in
  describe)
    printf '%s\n' "bagakit-entropy-review: purpose-conditioned review of avoidable meaning, structure, choice, coupling, and proof burden above a protected necessity floor."
    ;;
  list-references)
    find "$skill_root/references" -type f | sed "s#^$skill_root/##" | sort
    ;;
  validate)
    test -f "$skill_root/SKILL.md"
    test -f "$skill_root/agents/openai.yaml"
    test -f "$skill_root/references/review-contract.json"
    test -f "$skill_root/references/artifact-lenses.md"
    test -f "$skill_root/references/frontdoor-rule.toml"
    test -f "$skill_root/references/skill-cli.toml"
    python3 - "$skill_root/references/review-contract.json" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    contract = json.load(handle)

assert contract["version"] == 1
assert [item["id"] for item in contract["dimensions"]] == [
    "meaning", "structure", "choice", "coupling", "proof"
]
assert [item["id"] for item in contract["bands"]] == ["E0", "E1", "E2", "E3"]
assert [item["id"] for item in contract["gates"]] == ["G0", "G1", "G2"]
assert contract["self_review"]["passes"] == 1
PY
    printf '%s\n' "ok: bagakit-entropy-review contract is valid"
    ;;
  ""|-h|--help|help)
    usage
    ;;
  *)
    printf 'unknown command: %s\n' "$1" >&2
    usage >&2
    exit 2
    ;;
esac
