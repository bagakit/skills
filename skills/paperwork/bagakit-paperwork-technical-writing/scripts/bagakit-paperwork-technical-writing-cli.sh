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
usage: bagakit-paperwork-technical-writing-cli <command> [args...]

Commands:
  describe          Print a short skill description.
  list-references   List reference files shipped by this skill.
  validate          Check that required skill files exist.
  check-article     Run the bundled article quality checker directly.
  core              Run bagakit-writing-core CLI when available.
  print-review-packet-template
                    Print the technical-writing review packet template.
  print-procedural-precision
                    Print the execution-bearing procedural precision guide.
EOF
}

case "${1:-}" in
  describe)
    printf '%s\n' "bagakit-paperwork-technical-writing: technical article drafting and rewriting with article, appendix, and review gates."
    ;;
  list-references)
    find "$skill_root/references" -type f | sed "s#^$skill_root/##" | sort
    ;;
  validate)
    test -f "$skill_root/SKILL.md"
    test -f "$skill_root/references/start-here.md"
    test -f "$skill_root/references/quality-gates.md"
    test -f "$skill_root/references/procedural-precision.md"
    test -f "$skill_root/references/review-packet-template.md"
    test -f "$skill_root/scripts/check-article.py"
    ;;
  check-article)
    shift
    exec python3 "$skill_root/scripts/check-article.py" "$@"
    ;;
  core)
    shift
    if ! core_cli="$(find_skill_cli bagakit-writing-core scripts/bagakit-writing-core-cli.sh BAGAKIT_WRITING_CORE_CLI)"; then
      printf 'bagakit-writing-core is not available; install it or set BAGAKIT_WRITING_CORE_CLI\n' >&2
      exit 2
    fi
    exec bash "$core_cli" "$@"
    ;;
  print-review-packet-template)
    cat "$skill_root/references/review-packet-template.md"
    ;;
  print-procedural-precision)
    cat "$skill_root/references/procedural-precision.md"
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
