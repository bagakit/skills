set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
skill_root="$(dirname "$script_dir")"

usage() {
  cat <<'EOF'
usage: bagakit-visual-explainer-cli <command>

Commands:
  describe          Print the visual-explainer ownership boundary.
  list-references   List references shipped by this skill.
  validate          Check required skill files and references.
EOF
}

case "${1:-}" in
  describe)
    printf '%s\n' "bagakit-visual-explainer: novice-first visual HTML explanations with architecture maps, causal depth, and user-language delivery."
    ;;
  list-references)
    find "$skill_root/references" -type f | sed "s#^$skill_root/##" | sort
    ;;
  validate)
    test -f "$skill_root/SKILL.md"
    test -f "$skill_root/agents/openai.yaml"
    test -f "$skill_root/references/frontdoor-rule.toml"
    test -f "$skill_root/references/skill-cli.toml"
    test -f "$skill_root/references/visual-explanation-contract.toml"
    printf '%s\n' "ok: bagakit-visual-explainer skill assets are complete"
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
