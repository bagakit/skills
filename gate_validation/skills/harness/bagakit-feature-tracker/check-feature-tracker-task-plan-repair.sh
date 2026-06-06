set -euo pipefail

ROOT="."
while [[ $# -gt 0 ]]; do
  case "$1" in
    --root) ROOT="$2"; shift 2 ;;
    *) echo "unexpected argument: $1" >&2; exit 2 ;;
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
bash "$SKILL_DIR/scripts/feature-tracker.sh" create-feature \
  --root "$TMP_DIR" \
  --title "Repair reviewed task plan" \
  --goal "Repair damaged reviewed lineage without changing active execution truth." \
  --workspace-mode proposal_only >/dev/null
FEATURE_ID="$(feature_tracker_feature_id_by_title "$TMP_DIR" "Repair reviewed task plan")"
FEATURE_DIR="$TMP_DIR/.bagakit/feature-tracker/features/$FEATURE_ID"
PLAN="$TMP_DIR/plan.json"
GOAL="$TMP_DIR/goal.md"

feature_tracker_write_reviewed_task_plan "$PLAN"
bash "$SKILL_DIR/scripts/feature-tracker.sh" set-task-plan \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --tasks-file "$PLAN" --expected-revision 0 >/dev/null
cat >"$GOAL" <<EOF
# Repair Goal

Contract: \`bagakit.feature-goal.v1\`
Feature: \`$FEATURE_ID\`

## Outcome
Keep active execution truth stable while canonical reviewed lineage is repaired.

## Guardrails
- Feature Tracker remains the only repair owner.

## Completion
- Acceptance: exact guards pass and the owner receipt is current.
EOF
bash "$SKILL_DIR/scripts/feature-tracker.sh" set-feature-goal \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --goal-file "$GOAL" --expected-revision none >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" assign-feature-workspace \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --workspace-mode current_tree >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" start-task \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-001 >/dev/null

cp "$FEATURE_DIR/tasks.json" "$TMP_DIR/canonical-tasks.json"
cp "$FEATURE_DIR/state.json" "$TMP_DIR/state-before-repair.json"
python3 - "$FEATURE_DIR/tasks.json" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
payload = json.loads(path.read_text(encoding="utf-8"))
payload["plan_history"][-1].pop("source_refs")
path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY

sha256() {
  shasum -a 256 "$1" | awk '{print $1}'
}

STATE_SHA="$(sha256 "$FEATURE_DIR/state.json")"
TASKS_SHA="$(sha256 "$FEATURE_DIR/tasks.json")"
GOAL_SHA="$(sha256 "$FEATURE_DIR/goal.md")"
RECEIPT_SHA="$(sha256 "$FEATURE_DIR/owner-receipt.json")"

cp "$FEATURE_DIR/state.json" "$TMP_DIR/fail-closed-state.json"
cp "$FEATURE_DIR/tasks.json" "$TMP_DIR/fail-closed-tasks.json"
cp "$FEATURE_DIR/goal.md" "$TMP_DIR/fail-closed-goal.md"
cp "$FEATURE_DIR/owner-receipt.json" "$TMP_DIR/fail-closed-receipt.json"
if bash "$SKILL_DIR/scripts/feature-tracker.sh" set-feature-goal \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --goal-file "$FEATURE_DIR/goal.md" \
  --expected-revision "$GOAL_SHA" \
  >"$TMP_DIR/invalid-goal.out" 2>"$TMP_DIR/invalid-goal.err"; then
  echo "error: set-feature-goal accepted a non-canonical reviewed task plan" >&2
  exit 1
fi
grep -F "claims plan_status=reviewed but its task plan is not canonical" \
  "$TMP_DIR/invalid-goal.err" >/dev/null
cmp "$TMP_DIR/fail-closed-state.json" "$FEATURE_DIR/state.json"
cmp "$TMP_DIR/fail-closed-tasks.json" "$FEATURE_DIR/tasks.json"
cmp "$TMP_DIR/fail-closed-goal.md" "$FEATURE_DIR/goal.md"
cmp "$TMP_DIR/fail-closed-receipt.json" "$FEATURE_DIR/owner-receipt.json"

CONCURRENT_READY="$TMP_DIR/concurrent.ready"
python3 - "$TMP_DIR" "$FEATURE_DIR/tasks.json" "$CONCURRENT_READY" <<'PY' &
import fcntl
import subprocess
import sys
import time
from pathlib import Path

root = Path(sys.argv[1])
tasks_path = Path(sys.argv[2])
ready = Path(sys.argv[3])
raw_common = subprocess.check_output(
    ["git", "-C", str(root), "rev-parse", "--git-common-dir"],
    text=True,
).strip()
common = Path(raw_common)
if not common.is_absolute():
    common = (root / common).resolve()
lock_path = common / "bagakit" / "feature-tracker.lock"
lock_path.parent.mkdir(parents=True, exist_ok=True)
with lock_path.open("a+", encoding="utf-8") as lock:
    fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
    ready.write_text("locked\n", encoding="utf-8")
    time.sleep(0.5)
    tasks_path.write_bytes(tasks_path.read_bytes() + b" ")
PY
LOCK_HOLDER=$!
while [[ ! -f "$CONCURRENT_READY" ]]; do sleep 0.02; done
if bash "$SKILL_DIR/scripts/feature-tracker.sh" repair-reviewed-task-plan \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --tasks-file "$TMP_DIR/canonical-tasks.json" \
  --expected-state-sha256 "$STATE_SHA" \
  --expected-tasks-sha256 "$TASKS_SHA" \
  --expected-goal-sha256 "$GOAL_SHA" \
  --expected-receipt-sha256 "$RECEIPT_SHA" \
  >"$TMP_DIR/concurrent.out" 2>"$TMP_DIR/concurrent.err"; then
  echo "error: repair crossed a concurrent tasks mutation" >&2
  exit 1
fi
wait "$LOCK_HOLDER"
grep -F "stale tasks revision" "$TMP_DIR/concurrent.err" >/dev/null
cp "$TMP_DIR/fail-closed-tasks.json" "$FEATURE_DIR/tasks.json"
TASKS_SHA="$(sha256 "$FEATURE_DIR/tasks.json")"

mkdir "$FEATURE_DIR/owner-receipt.json.tmp"
if bash "$SKILL_DIR/scripts/feature-tracker.sh" repair-reviewed-task-plan \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --tasks-file "$TMP_DIR/canonical-tasks.json" \
  --expected-state-sha256 "$STATE_SHA" \
  --expected-tasks-sha256 "$TASKS_SHA" \
  --expected-goal-sha256 "$GOAL_SHA" \
  --expected-receipt-sha256 "$RECEIPT_SHA" \
  >"$TMP_DIR/rollback.out" 2>"$TMP_DIR/rollback.err"; then
  echo "error: injected receipt publication failure unexpectedly succeeded" >&2
  exit 1
fi
cmp "$TMP_DIR/fail-closed-tasks.json" "$FEATURE_DIR/tasks.json"
cmp "$TMP_DIR/fail-closed-receipt.json" "$FEATURE_DIR/owner-receipt.json"
rmdir "$FEATURE_DIR/owner-receipt.json.tmp"

if bash "$SKILL_DIR/scripts/feature-tracker.sh" repair-reviewed-task-plan \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --tasks-file "$TMP_DIR/canonical-tasks.json" \
  --expected-state-sha256 "$STATE_SHA" \
  --expected-tasks-sha256 "$(printf '0%.0s' {1..64})" \
  --expected-goal-sha256 "$GOAL_SHA" \
  --expected-receipt-sha256 "$RECEIPT_SHA" \
  >"$TMP_DIR/stale.out" 2>"$TMP_DIR/stale.err"; then
  echo "error: stale task hash unexpectedly passed" >&2
  exit 1
fi
grep -F "stale tasks revision" "$TMP_DIR/stale.err" >/dev/null
cmp "$TMP_DIR/fail-closed-tasks.json" "$FEATURE_DIR/tasks.json"
cmp "$TMP_DIR/fail-closed-receipt.json" "$FEATURE_DIR/owner-receipt.json"

bash "$SKILL_DIR/scripts/feature-tracker.sh" repair-reviewed-task-plan \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --tasks-file "$TMP_DIR/canonical-tasks.json" \
  --expected-state-sha256 "$STATE_SHA" \
  --expected-tasks-sha256 "$TASKS_SHA" \
  --expected-goal-sha256 "$GOAL_SHA" \
  --expected-receipt-sha256 "$RECEIPT_SHA" >/dev/null

cmp "$TMP_DIR/state-before-repair.json" "$FEATURE_DIR/state.json"
bash "$SKILL_DIR/scripts/feature-tracker.sh" get-owner-receipt \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --json >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" validate-tracker --root "$TMP_DIR" >/dev/null
python3 - "$FEATURE_DIR/tasks.json" "$FEATURE_DIR/state.json" <<'PY'
import json
import sys
from pathlib import Path

tasks = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
state = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
assert tasks["plan_status"] == "reviewed"
assert tasks["tasks"][0]["status"] == "in_progress"
assert state["status"] == "in_progress"
assert "current_task_id" not in state
PY

echo "feature-tracker reviewed task-plan repair passed"
