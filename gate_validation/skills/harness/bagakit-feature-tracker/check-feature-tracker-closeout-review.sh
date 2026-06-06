set -euo pipefail

ROOT="."

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root)
      ROOT="$2"
      shift 2
      ;;
    *)
      echo "unexpected argument: $1" >&2
      exit 2
      ;;
  esac
done

ROOT="$(cd "$ROOT" && pwd)"
SKILL_DIR="$ROOT/skills/harness/bagakit-feature-tracker"
LIB_DIR="$ROOT/gate_validation/skills/harness/bagakit-feature-tracker/lib"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

source "$LIB_DIR/feature-tracker-testlib.sh"

feature_tracker_init_temp_repo "$TMP_DIR"
bash "$SKILL_DIR/scripts/feature-tracker.sh" initialize-tracker --root "$TMP_DIR" >/dev/null

PLAN="$TMP_DIR/.bagakit/feature-tracker/artifacts/closeout-review-plan.json"
feature_tracker_write_reviewed_task_plan "$PLAN" "Prove explicit closeout review behavior."
bash "$SKILL_DIR/scripts/feature-tracker.sh" create-feature \
  --root "$TMP_DIR" \
  --title "Closeout review feature" \
  --slug "closeout-review-feature" \
  --goal "Close only after documentation, learning, and promotion review" \
  --workspace-mode proposal_only >/dev/null
FEATURE_ID="$(feature_tracker_feature_id_by_title "$TMP_DIR" "Closeout review feature")"
feature_tracker_complete_reviewed_feature "$TMP_DIR" "$SKILL_DIR" "$FEATURE_ID" "$PLAN"

FEATURE_DIR="$TMP_DIR/.bagakit/feature-tracker/features/$FEATURE_ID"
CONTROL_HASH_BEFORE="$(shasum \
  "$FEATURE_DIR/state.json" \
  "$FEATURE_DIR/tasks.json" \
  "$FEATURE_DIR/owner-receipt.json" | awk '{print $1}')"

bash "$SKILL_DIR/scripts/feature-tracker.sh" closeout-feature \
  --root "$TMP_DIR" --feature "$FEATURE_ID" >"$TMP_DIR/closeout-plan.out"
grep -F "closeout review checklist:" "$TMP_DIR/closeout-plan.out" >/dev/null
grep -F "shortest useful vertical closure" "$TMP_DIR/closeout-plan.out" >/dev/null
grep -F "merge same-class candidates" "$TMP_DIR/closeout-plan.out" >/dev/null
grep -F "requirement changes must come from user-confirmed discussion" \
  "$TMP_DIR/closeout-plan.out" >/dev/null
grep -F "never promote Agent-authored learning into a requirement" \
  "$TMP_DIR/closeout-plan.out" >/dev/null

if bash "$SKILL_DIR/scripts/feature-tracker.sh" archive-feature \
  --root "$TMP_DIR" --feature "$FEATURE_ID" \
  >"$TMP_DIR/missing-review.out" 2>"$TMP_DIR/missing-review.err"; then
  echo "error: archive accepted a missing closeout review" >&2
  exit 1
fi
grep -F "closeout review checklist:" "$TMP_DIR/missing-review.err" >/dev/null
test "$CONTROL_HASH_BEFORE" = "$(shasum \
  "$FEATURE_DIR/state.json" \
  "$FEATURE_DIR/tasks.json" \
  "$FEATURE_DIR/owner-receipt.json" | awk '{print $1}')"
python3 - "$FEATURE_DIR/tasks.json" <<'PY'
import json
import sys
from pathlib import Path

tasks = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
assert "closeout_review" not in tasks
PY

if bash "$SKILL_DIR/scripts/feature-tracker.sh" archive-feature \
  --root "$TMP_DIR" --feature "$FEATURE_ID" \
  --documentation-disposition updated \
  --documentation-rationale "The owning documentation changed." \
  --learning-disposition no_reusable_learning \
  --learning-rationale "No reusable learning was found." \
  --promotion-disposition not_needed \
  --promotion-rationale "No promotion is needed." \
  >"$TMP_DIR/missing-ref.out" 2>"$TMP_DIR/missing-ref.err"; then
  echo "error: updated documentation accepted no evidence ref" >&2
  exit 1
fi
grep -F "documentation.refs is required" "$TMP_DIR/missing-ref.err" >/dev/null
test "$CONTROL_HASH_BEFORE" = "$(shasum \
  "$FEATURE_DIR/state.json" \
  "$FEATURE_DIR/tasks.json" \
  "$FEATURE_DIR/owner-receipt.json" | awk '{print $1}')"

if bash "$SKILL_DIR/scripts/feature-tracker.sh" archive-feature \
  --root "$TMP_DIR" --feature "$FEATURE_ID" \
  --documentation-disposition not_applicable \
  --documentation-rationale "No documentation contract changed." \
  --learning-disposition no_reusable_learning \
  --learning-rationale "No reusable learning was found." \
  --promotion-disposition promoted \
  --promotion-rationale "A rule was promoted." \
  --promotion-ref README.md \
  >"$TMP_DIR/contradiction.out" 2>"$TMP_DIR/contradiction.err"; then
  echo "error: contradictory learning and promotion choices were accepted" >&2
  exit 1
fi
grep -F "cannot route or promote learning after declaring no_reusable_learning" \
  "$TMP_DIR/contradiction.err" >/dev/null

VALID_REVIEW_ARGS=(
  --documentation-disposition updated
  --documentation-rationale "The owning project document was updated without creating a second SSOT."
  --documentation-ref README.md
  --learning-disposition candidates_reviewed
  --learning-rationale "Bounded execution evidence was reviewed for scope growth, stop rules, shortest closure, and quality gain."
  --learning-ref README.md
  --promotion-disposition routed_for_review
  --promotion-rationale "Same-class candidates were consolidated before routing through the existing owner."
  --promotion-ref README.md
)

bash "$SKILL_DIR/scripts/feature-tracker.sh" closeout-feature \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --execute \
  "${VALID_REVIEW_ARGS[@]}" >/dev/null

ARCHIVED_DIR="$TMP_DIR/.bagakit/feature-tracker/features-archived/$FEATURE_ID"
test ! -d "$FEATURE_DIR"
test -f "$ARCHIVED_DIR/summary.md"
grep -F "## Closeout Review" "$ARCHIVED_DIR/summary.md" >/dev/null
grep -F "## Requirement Authority" "$ARCHIVED_DIR/summary.md" >/dev/null
grep -F -- "- Canonical Truth: tasks.json" "$ARCHIVED_DIR/summary.md" >/dev/null
grep -F -- "- Confirmed Plan Revision: 1" "$ARCHIVED_DIR/summary.md" >/dev/null
grep -F -- "- Confirmation Ref: test/reviewed-task-plan" \
  "$ARCHIVED_DIR/summary.md" >/dev/null
if grep -F "Close only after documentation, learning, and promotion review" \
  "$ARCHIVED_DIR/summary.md" >/dev/null; then
  echo "error: archive summary restated unconfirmed Feature Goal as requirement truth" >&2
  exit 1
fi
grep -F -- "- Documentation: updated" "$ARCHIVED_DIR/summary.md" >/dev/null
grep -F -- "- Execution Learning (Agent-authored): candidates_reviewed" \
  "$ARCHIVED_DIR/summary.md" >/dev/null
grep -F -- "- Promotion: routed_for_review" "$ARCHIVED_DIR/summary.md" >/dev/null

python3 - "$ARCHIVED_DIR" <<'PY'
import hashlib
import json
import sys
from pathlib import Path

feature_dir = Path(sys.argv[1])
tasks_path = feature_dir / "tasks.json"
tasks = json.loads(tasks_path.read_text(encoding="utf-8"))
review = tasks["closeout_review"]
assert review["schema"] == "bagakit.feature-closeout-review.v1"
assert review["documentation"]["disposition"] == "updated"
assert review["learning"]["disposition"] == "candidates_reviewed"
assert review["promotion"]["disposition"] == "routed_for_review"
assert review["documentation"]["refs"] == ["README.md"]

receipt = json.loads((feature_dir / "owner-receipt.json").read_text(encoding="utf-8"))
tasks_ref = next(ref for ref in receipt["evidence_refs"] if Path(ref).name == "tasks.json")
assert receipt["evidence_hashes"][tasks_ref] == hashlib.sha256(tasks_path.read_bytes()).hexdigest()
assert {path.name for path in feature_dir.iterdir()} == {
    "artifacts",
    "owner-receipt.json",
    "state.json",
    "summary.md",
    "tasks.json",
}
PY

bash "$SKILL_DIR/scripts/feature-tracker.sh" archive-feature \
  --root "$TMP_DIR" --feature "$FEATURE_ID" >/dev/null
if bash "$SKILL_DIR/scripts/feature-tracker.sh" archive-feature \
  --root "$TMP_DIR" --feature "$FEATURE_ID" "${VALID_REVIEW_ARGS[@]}" \
  >"$TMP_DIR/rewrite-review.out" 2>"$TMP_DIR/rewrite-review.err"; then
  echo "error: idempotent archive accepted a second closeout review" >&2
  exit 1
fi
grep -F "closed feature review is immutable" "$TMP_DIR/rewrite-review.err" >/dev/null

bash "$SKILL_DIR/scripts/feature-tracker.sh" create-feature \
  --root "$TMP_DIR" \
  --title "Discard review feature" \
  --slug "discard-review-feature" \
  --goal "Prove discard cannot bypass closeout review" \
  --workspace-mode proposal_only >/dev/null
DISCARD_ID="$(feature_tracker_feature_id_by_title "$TMP_DIR" "Discard review feature")"
if bash "$SKILL_DIR/scripts/feature-tracker.sh" discard-feature \
  --root "$TMP_DIR" --feature "$DISCARD_ID" --reason cancelled \
  >"$TMP_DIR/discard-missing.out" 2>"$TMP_DIR/discard-missing.err"; then
  echo "error: discard accepted a missing closeout review" >&2
  exit 1
fi
grep -F "closeout review checklist:" "$TMP_DIR/discard-missing.err" >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" discard-feature \
  --root "$TMP_DIR" --feature "$DISCARD_ID" --reason cancelled \
  "${FEATURE_TRACKER_CLOSEOUT_REVIEW_ARGS[@]}" >/dev/null
test -f "$TMP_DIR/.bagakit/feature-tracker/features-discarded/$DISCARD_ID/summary.md"
DISCARDED_SUMMARY="$TMP_DIR/.bagakit/feature-tracker/features-discarded/$DISCARD_ID/summary.md"
grep -F -- "- Confirmed Plan Revision: none" "$DISCARDED_SUMMARY" >/dev/null
grep -Fx -- "- Confirmation Ref: " "$DISCARDED_SUMMARY" >/dev/null
if grep -F "Prove discard cannot bypass closeout review" "$DISCARDED_SUMMARY" >/dev/null; then
  echo "error: discarded proposal Goal became archived requirement truth" >&2
  exit 1
fi

bash "$SKILL_DIR/scripts/feature-tracker.sh" create-feature \
  --root "$TMP_DIR" \
  --title "Invalid discard feature" \
  --slug "invalid-discard-feature" \
  --goal "Close damaged tracker state without normalizing it into requirements" \
  --workspace-mode proposal_only >/dev/null
INVALID_ID="$(feature_tracker_feature_id_by_title "$TMP_DIR" "Invalid discard feature")"
INVALID_DIR="$TMP_DIR/.bagakit/feature-tracker/features/$INVALID_ID"
if bash "$SKILL_DIR/scripts/feature-tracker.sh" discard-feature \
  --root "$TMP_DIR" --feature "$INVALID_ID" --reason invalid \
  "${FEATURE_TRACKER_CLOSEOUT_REVIEW_ARGS[@]}" \
  >"$TMP_DIR/valid-as-invalid.out" 2>"$TMP_DIR/valid-as-invalid.err"; then
  echo "error: a valid Feature was discarded as invalid" >&2
  exit 1
fi
grep -F -- "--reason invalid requires at least one Feature contract error" \
  "$TMP_DIR/valid-as-invalid.err" >/dev/null

python3 - "$INVALID_DIR/tasks.json" <<'PY'
import json
import sys
from pathlib import Path

tasks_path = Path(sys.argv[1])
tasks = json.loads(tasks_path.read_text(encoding="utf-8"))
tasks.pop("plan_status")
tasks_path.write_text(json.dumps(tasks, indent=2) + "\n", encoding="utf-8")
PY
cp "$INVALID_DIR/state.json" "$TMP_DIR/invalid-source-state.json"
cp "$INVALID_DIR/tasks.json" "$TMP_DIR/invalid-source-tasks.json"
printf 'unrelated work remains outside tracker state\n' >"$TMP_DIR/unrelated-work.txt"

bash "$SKILL_DIR/scripts/feature-tracker.sh" discard-feature \
  --root "$TMP_DIR" --feature "$INVALID_ID" --reason invalid \
  "${FEATURE_TRACKER_CLOSEOUT_REVIEW_ARGS[@]}" \
  >"$TMP_DIR/invalid-discard.out"
grep -F "invalid_source_errors: " "$TMP_DIR/invalid-discard.out" >/dev/null
grep -F "artifacts/invalid-source" "$TMP_DIR/invalid-discard.out" >/dev/null

INVALID_CLOSED_DIR="$TMP_DIR/.bagakit/feature-tracker/features-discarded/$INVALID_ID"
INVALID_SOURCE_DIR="$INVALID_CLOSED_DIR/artifacts/invalid-source"
cmp "$TMP_DIR/invalid-source-state.json" "$INVALID_SOURCE_DIR/state.json"
cmp "$TMP_DIR/invalid-source-tasks.json" "$INVALID_SOURCE_DIR/tasks.json"
test -f "$TMP_DIR/unrelated-work.txt"
python3 - "$INVALID_CLOSED_DIR" <<'PY'
import json
import sys
from pathlib import Path

feature_dir = Path(sys.argv[1])
state = json.loads((feature_dir / "state.json").read_text(encoding="utf-8"))
tasks = json.loads((feature_dir / "tasks.json").read_text(encoding="utf-8"))
summary = (feature_dir / "summary.md").read_text(encoding="utf-8")
assert state["status"] == "discarded"
assert state["discard_reason"] == "invalid"
assert state["workspace_mode"] == "proposal_only"
assert tasks["tasks"] == []
assert tasks["closeout_review"]["schema"] == "bagakit.feature-closeout-review.v1"
assert "artifacts/invalid-source/state.json" in summary
assert "artifacts/invalid-source/tasks.json" in summary
assert "Close damaged tracker state" not in summary
assert not (feature_dir / "owner-receipt.json").exists()
PY

bash "$SKILL_DIR/scripts/feature-tracker.sh" validate-tracker --root "$TMP_DIR" >/dev/null

echo "ok: feature tracker closeout review"
