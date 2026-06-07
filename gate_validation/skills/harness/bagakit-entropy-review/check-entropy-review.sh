set -euo pipefail

root="."
while [[ $# -gt 0 ]]; do
  case "$1" in
    --root)
      root="$2"
      shift 2
      ;;
    *)
      printf 'unknown argument: %s\n' "$1" >&2
      exit 2
      ;;
  esac
done

cd "$root"
cli="skills/harness/bagakit-entropy-review/scripts/bagakit-entropy-review-cli.sh"

bash "$cli" validate
description="$(bash "$cli" describe)"
[[ "$description" == bagakit-entropy-review:* ]]

references="$(bash "$cli" list-references)"
for ref in \
  references/artifact-lenses.md \
  references/frontdoor-rule.toml \
  references/review-contract.json \
  references/skill-cli.toml; do
  grep -Fxq "$ref" <<<"$references"
done

printf '%s\n' "ok: bagakit-entropy-review public checks passed"
