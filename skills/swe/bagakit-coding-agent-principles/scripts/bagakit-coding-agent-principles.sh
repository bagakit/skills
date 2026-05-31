set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
skill_root="$(dirname "$script_dir")"

usage() {
  cat <<'EOF'
usage: bagakit-coding-agent-principles <command>

Commands:
  describe          Print the protected meta-principle.
  list-references   List shipped decision and review references.
  list-studies      List optional background studies.
  print-gate        Print the protected-principle gate template.
  validate          Check the minimal skill payload.
EOF
}

case "${1:-}" in
  describe)
    printf '%s\n' "Protect the task-specific user goal with the smallest durable, project-native change at the owning boundary, proven through behavior."
    ;;
  list-references)
    find "$skill_root/references" -type f | sed "s#^$skill_root/##" | sort
    ;;
  list-studies)
    if [[ -d "$skill_root/studies" ]]; then
      find "$skill_root/studies" -type f | sed "s#^$skill_root/##" | sort
    fi
    ;;
  print-gate)
    cat "$skill_root/references/principle-gate.md"
    ;;
  validate)
    test -f "$skill_root/SKILL.md"
    test -f "$skill_root/references/principle-gate.md"
    test -f "$skill_root/references/decision-ladder.md"
    test -f "$skill_root/references/verdict-policy.md"
    test -f "$skill_root/studies/compensatory-complexity-runaway.md"
    test -f "$skill_root/studies/validation-authority-inversion.md"
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
