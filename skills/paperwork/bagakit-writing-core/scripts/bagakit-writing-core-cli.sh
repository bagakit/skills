set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
skill_root="$(dirname "$script_dir")"
sibling_root="$(dirname "$skill_root")"

join_skill_cli_path() {
  local base="${1%/}"
  printf '%s/%s/%s\n' "$base" "$2" "$3"
}

find_skill_cli() {
  local skill_id="$1"
  local rel_cli="$2"
  local explicit_env="$3"
  local candidate

  if [[ -n "${!explicit_env:-}" && -f "${!explicit_env}" ]]; then
    printf '%s\n' "${!explicit_env}"
    return 0
  fi

  local candidates=()
  candidates+=("$(join_skill_cli_path "$sibling_root" "$skill_id" "$rel_cli")")
  [[ -n "${BAGAKIT_SKILLS_DIR:-}" ]] && candidates+=("$(join_skill_cli_path "$BAGAKIT_SKILLS_DIR" "$skill_id" "$rel_cli")")
  candidates+=("$(join_skill_cli_path "$PWD/.codex/skills" "$skill_id" "$rel_cli")")
  [[ -n "${CODEX_HOME:-}" ]] && candidates+=("$(join_skill_cli_path "$CODEX_HOME/skills" "$skill_id" "$rel_cli")")
  [[ -n "${HOME:-}" ]] && candidates+=("$(join_skill_cli_path "$HOME/.codex/skills" "$skill_id" "$rel_cli")" "$(join_skill_cli_path "$HOME/.agents/skills" "$skill_id" "$rel_cli")")

  for candidate in "${candidates[@]}"; do
    if [[ -f "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

usage() {
  cat <<'EOF'
usage: bagakit-writing-core-cli <command> [args...]

Commands:
  describe          Print a short skill description.
  list-references   List reference files shipped by this skill.
  validate          Check that required skill files exist.
  lint              Run generic writing-core markdown lint checks.
  de-ai-tone        Run bagakit-writing-de-ai-tone CLI when available.
  route             Run writing-core route foundation and derivation tools.
                    Includes check-foundation, review-foundation, and derive-route.
  intake            Run writing-core Intake packet checks and Core-veto mapping tools.
  rules             Validate, list, or show Core rule metadata.
  inventory         Build or compare no-regression inventories.
  print-intake-handoff
                    Print the Intake handoff and Core veto reference.
  print-review-packet-template
                    Print the writing-core review packet template.
  print-anti-rationalization-table
                    Print the anti-rationalization review table.
EOF
}

case "${1:-}" in
  describe)
    printf '%s\n' "bagakit-writing-core: generic writing route, foundation, structure, evidence, anti-AI, prose-mechanics, and review primitives."
    ;;
  list-references)
    find "$skill_root/references" -type f | sed "s#^$skill_root/##" | sort
    ;;
  validate)
    test -f "$skill_root/SKILL.md"
    test -f "$skill_root/references/README.md"
    test -f "$skill_root/references/workflow/OPERATING_SURFACE_MATRIX.md"
    test -f "$skill_root/references/knowledge/PRE_DRAFT_ROUTE_MEMO_TEMPLATE.md"
    test -f "$skill_root/references/writing/AI_SMELLS.md"
    test -f "$skill_root/references/writing/PRECISION_AND_READER_BURDEN.md"
    test -f "$skill_root/references/writing/ai-smell-lexicon.json"
    test -f "$skill_root/references/workflow/INTAKE_HANDOFF_AND_CORE_VETO.md"
    test -f "$skill_root/references/rules/core-rule-registry.toml"
    test -f "$skill_root/references/review/QA_HARD_METRICS.md"
    test -f "$skill_root/references/review/ANTI_RATIONALIZATION_TABLE.md"
    test -f "$skill_root/references/review/REVIEW_PACKET_TEMPLATE.md"
    test -f "$skill_root/scripts/writing_core_lint.py"
    test -f "$skill_root/scripts/writing_core_route_tools.py"
    test -f "$skill_root/scripts/writing_core_intake_packet.py"
    test -f "$skill_root/scripts/writing_core_rules.py"
    test -f "$skill_root/scripts/writing_core_inventory.py"
    python3 "$skill_root/scripts/writing_core_rules.py" validate >/dev/null
    ;;
  lint)
    shift
    exec python3 "$skill_root/scripts/writing_core_lint.py" "$@"
    ;;
  de-ai-tone)
    shift
    if ! de_ai_cli="$(find_skill_cli bagakit-writing-de-ai-tone scripts/bagakit-writing-de-ai-tone-cli.sh BAGAKIT_DE_AI_TONE_CLI)"; then
      printf 'bagakit-writing-de-ai-tone is required for publishable prose review; install it or set BAGAKIT_DE_AI_TONE_CLI\n' >&2
      exit 2
    fi
    exec bash "$de_ai_cli" "$@"
    ;;
  route)
    shift
    exec python3 "$skill_root/scripts/writing_core_route_tools.py" "$@"
    ;;
  intake)
    shift
    exec python3 "$skill_root/scripts/writing_core_intake_packet.py" "$@"
    ;;
  rules)
    shift
    exec python3 "$skill_root/scripts/writing_core_rules.py" "$@"
    ;;
  inventory)
    shift
    exec python3 "$skill_root/scripts/writing_core_inventory.py" "$@"
    ;;
  print-review-packet-template)
    cat "$skill_root/references/review/REVIEW_PACKET_TEMPLATE.md"
    ;;
  print-intake-handoff)
    cat "$skill_root/references/workflow/INTAKE_HANDOFF_AND_CORE_VETO.md"
    ;;
  print-anti-rationalization-table)
    cat "$skill_root/references/review/ANTI_RATIONALIZATION_TABLE.md"
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
