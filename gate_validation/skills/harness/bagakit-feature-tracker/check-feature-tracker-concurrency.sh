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
TASK_PLAN_JSON="$TMP_DIR/.bagakit/feature-tracker/artifacts/reviewed-task-plan.json"
feature_tracker_write_reviewed_task_plan "$TASK_PLAN_JSON" "Exercise worktree execution from a reviewed task plan."

CONCURRENT_A_OUT="$TMP_DIR/concurrent-a.out"
CONCURRENT_A_ERR="$TMP_DIR/concurrent-a.err"
CONCURRENT_B_OUT="$TMP_DIR/concurrent-b.out"
CONCURRENT_B_ERR="$TMP_DIR/concurrent-b.err"
bash "$SKILL_DIR/scripts/feature-tracker.sh" create-feature --root "$TMP_DIR" --title "Concurrent feature A" --slug "concurrent-feature-a" --goal "Create concurrently without index corruption" --workspace-mode proposal_only >"$CONCURRENT_A_OUT" 2>"$CONCURRENT_A_ERR" &
CONCURRENT_A_PID=$!
bash "$SKILL_DIR/scripts/feature-tracker.sh" create-feature --root "$TMP_DIR" --title "Concurrent feature B" --slug "concurrent-feature-b" --goal "Create concurrently without index corruption" --workspace-mode proposal_only >"$CONCURRENT_B_OUT" 2>"$CONCURRENT_B_ERR" &
CONCURRENT_B_PID=$!
CONCURRENT_A_STATUS=0
CONCURRENT_B_STATUS=0
wait "$CONCURRENT_A_PID" || CONCURRENT_A_STATUS=$?
wait "$CONCURRENT_B_PID" || CONCURRENT_B_STATUS=$?
if [[ "$CONCURRENT_A_STATUS" -ne 0 || "$CONCURRENT_B_STATUS" -ne 0 ]]; then
  echo "error: concurrent create-feature commands failed" >&2
  cat "$CONCURRENT_A_ERR" >&2 || true
  cat "$CONCURRENT_B_ERR" >&2 || true
  exit 1
fi
python3 - "$TMP_DIR" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
index_path = root / ".bagakit" / "feature-tracker" / "index" / "features.json"
payload = json.loads(index_path.read_text(encoding="utf-8"))
items = payload.get("features", [])
found = {
    item.get("title"): item.get("feat_id")
    for item in items
    if item.get("title") in {"Concurrent feature A", "Concurrent feature B"}
}
if set(found) != {"Concurrent feature A", "Concurrent feature B"}:
    raise SystemExit(f"missing concurrent features: {found}")
if len(set(found.values())) != 2:
    raise SystemExit(f"concurrent features did not receive unique ids: {found}")
for feature_id in found.values():
    feature_dir = root / ".bagakit" / "feature-tracker" / "features" / str(feature_id)
    if not (feature_dir / "state.json").exists() or not (feature_dir / "tasks.json").exists():
        raise SystemExit(f"missing feature state for concurrent feature: {feature_id}")
PY
bash "$SKILL_DIR/scripts/feature-tracker.sh" validate-tracker --root "$TMP_DIR" >/dev/null

bash "$SKILL_DIR/scripts/feature-tracker.sh" create-feature --root "$TMP_DIR" --title "Worktree gate feature" --slug "worktree-gate-feature" --goal "Run gates from the feature worktree" --workspace-mode worktree --tasks-file "$TASK_PLAN_JSON" >/dev/null
WORKTREE_GATE_ID="$(feature_tracker_feature_id_by_title "$TMP_DIR" "Worktree gate feature")"
WORKTREE_GATE_PATH="$(feature_tracker_worktree_path "$TMP_DIR" "$WORKTREE_GATE_ID")"
mkdir -p "$WORKTREE_GATE_PATH/worktree-only"
cat > "$WORKTREE_GATE_PATH/worktree-only/gate-sentinel.txt" <<'EOF'
gate should run in the feature worktree
EOF
feature_tracker_set_task_command \
  "$TMP_DIR" "$WORKTREE_GATE_ID" "test -f worktree-only/gate-sentinel.txt"
bash "$SKILL_DIR/scripts/feature-tracker.sh" start-task --root "$TMP_DIR" --feature "$WORKTREE_GATE_ID" --task T-001 >/dev/null
DISCARD_ACTIVE_OUT="$TMP_DIR/discard-active.out"
DISCARD_ACTIVE_ERR="$TMP_DIR/discard-active.err"
if bash "$SKILL_DIR/scripts/feature-tracker.sh" discard-feature --root "$TMP_DIR" --feature "$WORKTREE_GATE_ID" --reason superseded >"$DISCARD_ACTIVE_OUT" 2>"$DISCARD_ACTIVE_ERR"; then
  echo "error: discard-feature accepted an in_progress task" >&2
  exit 1
fi
grep -q "cannot discard feat while a task is in_progress" "$DISCARD_ACTIVE_ERR"
bash "$SKILL_DIR/scripts/feature-tracker.sh" run-task-gate --root "$TMP_DIR" --feature "$WORKTREE_GATE_ID" --task T-001 >/dev/null
python3 - "$TMP_DIR" "$WORKTREE_GATE_ID" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
feature_id = sys.argv[2]
tasks_path = root / ".bagakit" / "feature-tracker" / "features" / feature_id / "tasks.json"
tasks = json.loads(tasks_path.read_text(encoding="utf-8"))
task = tasks["tasks"][0]
if task.get("gate_result") != "pass":
    raise SystemExit(f"gate did not pass from worktree execution root: {task.get('gate_result')}")
commands = task.get("last_gate_commands") or []
if not commands or commands[0].get("command") != "test -f worktree-only/gate-sentinel.txt":
    raise SystemExit("gate command record missing worktree-only sentinel check")
PY

echo "ok: bagakit-feature-tracker concurrency regression passed"
