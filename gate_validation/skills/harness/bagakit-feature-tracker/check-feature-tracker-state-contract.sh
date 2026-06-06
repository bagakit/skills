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
ADOPT_TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR" "$ADOPT_TMP_DIR"' EXIT

source "$LIB_DIR/feature-tracker-testlib.sh"

feature_tracker_init_temp_repo "$TMP_DIR"
bash "$SKILL_DIR/scripts/feature-tracker.sh" initialize-tracker --root "$TMP_DIR" >/dev/null
TASK_PLAN_JSON="$TMP_DIR/.bagakit/feature-tracker/artifacts/reviewed-task-plan.json"
feature_tracker_write_reviewed_task_plan "$TASK_PLAN_JSON" "Exercise the regression scenario through reviewed task truth."
bash "$SKILL_DIR/scripts/feature-tracker.sh" create-feature --root "$TMP_DIR" --title "Dirty current tree archive" --slug "dirty-current-tree-archive" --goal "Archive should ignore unrelated dirty work" --workspace-mode proposal_only >/dev/null
DIRTY_ARCHIVE_ID="$(feature_tracker_feature_id_by_title "$TMP_DIR" "Dirty current tree archive")"
bash "$SKILL_DIR/scripts/feature-tracker.sh" set-task-plan --root "$TMP_DIR" --feature "$DIRTY_ARCHIVE_ID" --tasks-file "$TASK_PLAN_JSON" --expected-revision 0 >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" assign-feature-workspace --root "$TMP_DIR" --feature "$DIRTY_ARCHIVE_ID" --workspace-mode current_tree >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" start-task --root "$TMP_DIR" --feature "$DIRTY_ARCHIVE_ID" --task T-001 >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" run-task-gate --root "$TMP_DIR" --feature "$DIRTY_ARCHIVE_ID" --task T-001 >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" finish-task --root "$TMP_DIR" --feature "$DIRTY_ARCHIVE_ID" --task T-001 --result done >/dev/null
cat > "$TMP_DIR/UNRELATED.md" <<'EOF'
unrelated dirty work
EOF
bash "$SKILL_DIR/scripts/feature-tracker.sh" archive-feature --root "$TMP_DIR" --feature "$DIRTY_ARCHIVE_ID" \
  "${FEATURE_TRACKER_CLOSEOUT_REVIEW_ARGS[@]}" >/dev/null 2>&1
test -d "$TMP_DIR/.bagakit/feature-tracker/features-archived/$DIRTY_ARCHIVE_ID"
test -f "$TMP_DIR/UNRELATED.md"
rm -f "$TMP_DIR/UNRELATED.md"

bash "$SKILL_DIR/scripts/feature-tracker.sh" create-feature --root "$TMP_DIR" --title "Boundary feature" --slug "boundary-feature" --goal "Reject unsupported feature-root files" --workspace-mode proposal_only >/dev/null

BOUNDARY_FEATURE_ID="$(feature_tracker_feature_id_by_title "$TMP_DIR" "Boundary feature")"

BOUNDARY_DIR="$TMP_DIR/.bagakit/feature-tracker/features/$BOUNDARY_FEATURE_ID"
cat > "$BOUNDARY_DIR/PRD.md" <<'EOF'
shadow product doc
EOF
cat > "$BOUNDARY_DIR/Changelog.md" <<'EOF'
shadow change log
EOF

if bash "$SKILL_DIR/scripts/feature-tracker.sh" validate-tracker --root "$TMP_DIR" >/dev/null 2>&1; then
  echo "error: unsupported feature-root files unexpectedly accepted" >&2
  exit 1
fi
rm -f "$BOUNDARY_DIR/PRD.md" "$BOUNDARY_DIR/Changelog.md"

bash "$SKILL_DIR/scripts/feature-tracker.sh" create-feature --root "$TMP_DIR" --title "Archive blocked feature" --slug "archive-blocked-feature" --goal "Archive should preflight graph" --workspace-mode proposal_only >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" create-feature --root "$TMP_DIR" --title "Discard blocked feature" --slug "discard-blocked-feature" --goal "Discard should preflight graph" --workspace-mode proposal_only >/dev/null

ARCHIVE_BLOCKED_ID="$(
  feature_tracker_feature_id_by_title "$TMP_DIR" "Archive blocked feature"
)"
DISCARD_BLOCKED_ID="$(
  feature_tracker_feature_id_by_title "$TMP_DIR" "Discard blocked feature"
)"

feature_tracker_complete_reviewed_feature "$TMP_DIR" "$SKILL_DIR" "$ARCHIVE_BLOCKED_ID" "$TASK_PLAN_JSON"
bash "$SKILL_DIR/scripts/feature-tracker.sh" set-task-plan \
  --root "$TMP_DIR" --feature "$DISCARD_BLOCKED_ID" --tasks-file "$TASK_PLAN_JSON" \
  --expected-revision 0 >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" assign-feature-workspace \
  --root "$TMP_DIR" --feature "$DISCARD_BLOCKED_ID" --workspace-mode current_tree >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" start-task \
  --root "$TMP_DIR" --feature "$DISCARD_BLOCKED_ID" --task T-001 >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" finish-task \
  --root "$TMP_DIR" --feature "$DISCARD_BLOCKED_ID" --task T-001 --result blocked \
  --blocked-reason-class internal_blocker \
  --blocked-reason "discard remains blocked until closeout" >/dev/null

FEATURE_COUNT_BEFORE="$(python3 - "$TMP_DIR" <<'PY'
import json
import sys
from pathlib import Path

index_path = Path(sys.argv[1]) / ".bagakit" / "feature-tracker" / "index" / "features.json"
payload = json.loads(index_path.read_text(encoding="utf-8"))
print(len(payload.get("features", [])))
PY
)"
WORKTREE_COUNT_BEFORE="$(git -C "$TMP_DIR" worktree list --porcelain | grep -c '^worktree ')"

python3 - "$TMP_DIR" "$BOUNDARY_FEATURE_ID" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
feature_id = sys.argv[2]
state_path = root / ".bagakit" / "feature-tracker" / "features" / feature_id / "state.json"
state = json.loads(state_path.read_text(encoding="utf-8"))
state["depends_on"] = [feature_id]
state_path.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
PY

if bash "$SKILL_DIR/scripts/feature-tracker.sh" create-feature --root "$TMP_DIR" --title "Blocked create feature" --slug "blocked-create-feature" --goal "Create should preflight graph" --workspace-mode worktree --tasks-file "$TASK_PLAN_JSON" >/dev/null 2>&1; then
  echo "error: create-feature unexpectedly mutated state before graph validation" >&2
  exit 1
fi
FEATURE_COUNT_AFTER="$(python3 - "$TMP_DIR" <<'PY'
import json
import sys
from pathlib import Path

index_path = Path(sys.argv[1]) / ".bagakit" / "feature-tracker" / "index" / "features.json"
payload = json.loads(index_path.read_text(encoding="utf-8"))
print(len(payload.get("features", [])))
PY
)"
WORKTREE_COUNT_AFTER="$(git -C "$TMP_DIR" worktree list --porcelain | grep -c '^worktree ')"
test "$FEATURE_COUNT_BEFORE" = "$FEATURE_COUNT_AFTER"
test "$WORKTREE_COUNT_BEFORE" = "$WORKTREE_COUNT_AFTER"

if bash "$SKILL_DIR/scripts/feature-tracker.sh" archive-feature --root "$TMP_DIR" --feature "$ARCHIVE_BLOCKED_ID" \
  "${FEATURE_TRACKER_CLOSEOUT_REVIEW_ARGS[@]}" >/dev/null 2>&1; then
  echo "error: archive-feature unexpectedly cleaned up before graph preflight" >&2
  exit 1
fi
test -d "$TMP_DIR/.bagakit/feature-tracker/features/$ARCHIVE_BLOCKED_ID"
test ! -d "$TMP_DIR/.bagakit/feature-tracker/features-archived/$ARCHIVE_BLOCKED_ID"

if bash "$SKILL_DIR/scripts/feature-tracker.sh" discard-feature --root "$TMP_DIR" --feature "$DISCARD_BLOCKED_ID" --reason superseded \
  "${FEATURE_TRACKER_CLOSEOUT_REVIEW_ARGS[@]}" >/dev/null 2>&1; then
  echo "error: discard-feature unexpectedly cleaned up before graph preflight" >&2
  exit 1
fi
test -d "$TMP_DIR/.bagakit/feature-tracker/features/$DISCARD_BLOCKED_ID"
test ! -d "$TMP_DIR/.bagakit/feature-tracker/features-discarded/$DISCARD_BLOCKED_ID"

python3 - "$TMP_DIR" "$BOUNDARY_FEATURE_ID" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
feature_id = sys.argv[2]
state_path = root / ".bagakit" / "feature-tracker" / "features" / feature_id / "state.json"
state = json.loads(state_path.read_text(encoding="utf-8"))
state.pop("depends_on", None)
state_path.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
PY
bash "$SKILL_DIR/scripts/feature-tracker.sh" replan-features --root "$TMP_DIR" >/dev/null

bash "$SKILL_DIR/scripts/feature-tracker.sh" create-feature \
  --root "$TMP_DIR" --title "Close blocked archive" --slug "close-blocked-archive" \
  --goal "Archive a real blocked Feature without losing blocker evidence" \
  --workspace-mode current_tree --tasks-file "$TASK_PLAN_JSON" >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" create-feature \
  --root "$TMP_DIR" --title "Close blocked discard" --slug "close-blocked-discard" \
  --goal "Discard a real blocked Feature without losing blocker evidence" \
  --workspace-mode current_tree --tasks-file "$TASK_PLAN_JSON" >/dev/null
CLOSE_BLOCKED_ARCHIVE_ID="$(
  feature_tracker_feature_id_by_title "$TMP_DIR" "Close blocked archive"
)"
CLOSE_BLOCKED_DISCARD_ID="$(
  feature_tracker_feature_id_by_title "$TMP_DIR" "Close blocked discard"
)"
for feat_id in "$CLOSE_BLOCKED_ARCHIVE_ID" "$CLOSE_BLOCKED_DISCARD_ID"; do
  bash "$SKILL_DIR/scripts/feature-tracker.sh" start-task \
    --root "$TMP_DIR" --feature "$feat_id" --task T-001 >/dev/null
done
bash "$SKILL_DIR/scripts/feature-tracker.sh" closeout-feature \
  --root "$TMP_DIR" --feature "$CLOSE_BLOCKED_ARCHIVE_ID" --task T-001 --result blocked \
  --blocked-reason-class external_blocker \
  --blocked-reason "archive waits on owner's upstream capability" \
  >"$TMP_DIR/blocked-closeout-plan.out"
grep -F "plan: feature-tracker.sh finish-task" "$TMP_DIR/blocked-closeout-plan.out" >/dev/null
grep -F -- "--blocked-reason-class external_blocker" "$TMP_DIR/blocked-closeout-plan.out" >/dev/null
grep -F "owner" "$TMP_DIR/blocked-closeout-plan.out" >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" closeout-feature \
  --root "$TMP_DIR" --feature "$CLOSE_BLOCKED_ARCHIVE_ID" --task T-001 --result blocked \
  --blocked-reason-class external_blocker \
  --blocked-reason "archive waits on owner's upstream capability" --execute >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" finish-task \
  --root "$TMP_DIR" --feature "$CLOSE_BLOCKED_DISCARD_ID" --task T-001 --result blocked \
  --blocked-reason-class internal_blocker \
  --blocked-reason "discard closes an invalid execution route" >/dev/null

cp "$TMP_DIR/.bagakit/feature-tracker/features/$CLOSE_BLOCKED_ARCHIVE_ID/tasks.json" \
  "$TMP_DIR/blocked-closeout-tasks.saved"
python3 - "$TMP_DIR" "$CLOSE_BLOCKED_ARCHIVE_ID" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
feature_id = sys.argv[2]
tasks_path = root / ".bagakit" / "feature-tracker" / "features" / feature_id / "tasks.json"
tasks = json.loads(tasks_path.read_text(encoding="utf-8"))
task = next(item for item in tasks["tasks"] if item["id"] == "T-001")
task["last_blocker"]["reason"] = " " + task["last_blocker"]["reason"]
tasks_path.write_text(json.dumps(tasks, indent=2) + "\n", encoding="utf-8")
PY
if bash "$SKILL_DIR/scripts/feature-tracker.sh" archive-feature \
  --root "$TMP_DIR" --feature "$CLOSE_BLOCKED_ARCHIVE_ID" \
  "${FEATURE_TRACKER_CLOSEOUT_REVIEW_ARGS[@]}" \
  >"$TMP_DIR/noncanonical-live-blocker.out" 2>"$TMP_DIR/noncanonical-live-blocker.err"; then
  echo "error: archive accepted a non-canonical live blocker" >&2
  exit 1
fi
grep -F "last_blocker.reason must not have surrounding whitespace" \
  "$TMP_DIR/noncanonical-live-blocker.err" >/dev/null
test -d "$TMP_DIR/.bagakit/feature-tracker/features/$CLOSE_BLOCKED_ARCHIVE_ID"
test ! -d "$TMP_DIR/.bagakit/feature-tracker/features-archived/$CLOSE_BLOCKED_ARCHIVE_ID"
cp "$TMP_DIR/blocked-closeout-tasks.saved" \
  "$TMP_DIR/.bagakit/feature-tracker/features/$CLOSE_BLOCKED_ARCHIVE_ID/tasks.json"

if bash "$SKILL_DIR/scripts/feature-tracker.sh" closeout-feature \
  --root "$TMP_DIR" --feature "$CLOSE_BLOCKED_ARCHIVE_ID" \
  --archive-blocked --result blocked \
  --blocked-reason-class external_blocker --blocked-reason "must not be consumed" \
  >"$TMP_DIR/blocked-closeout-unused.out" 2>"$TMP_DIR/blocked-closeout-unused.err"; then
  echo "error: blocked closeout accepted unused task transition arguments" >&2
  exit 1
fi
grep -F "task result and blocker arguments require an in_progress feature" \
  "$TMP_DIR/blocked-closeout-unused.err" >/dev/null
test -d "$TMP_DIR/.bagakit/feature-tracker/features/$CLOSE_BLOCKED_ARCHIVE_ID"
test ! -d "$TMP_DIR/.bagakit/feature-tracker/features-archived/$CLOSE_BLOCKED_ARCHIVE_ID"

if bash "$SKILL_DIR/scripts/feature-tracker.sh" closeout-feature \
  --root "$TMP_DIR" --feature "$CLOSE_BLOCKED_DISCARD_ID" --mode discard \
  --reason cancelled --blocked-reason-class internal_blocker \
  >"$TMP_DIR/discard-closeout-unused.out" 2>"$TMP_DIR/discard-closeout-unused.err"; then
  echo "error: discard closeout accepted unused blocker arguments" >&2
  exit 1
fi
grep -F "valid only for archive closeout of an in_progress task" \
  "$TMP_DIR/discard-closeout-unused.err" >/dev/null
test -d "$TMP_DIR/.bagakit/feature-tracker/features/$CLOSE_BLOCKED_DISCARD_ID"
test ! -d "$TMP_DIR/.bagakit/feature-tracker/features-discarded/$CLOSE_BLOCKED_DISCARD_ID"

assert_closeout_rejected() {
  local case_id="$1"
  local feature_id="$2"
  local expected_error="$3"
  shift 3
  local control_before
  control_before="$(shasum \
    "$TMP_DIR/.bagakit/feature-tracker/features/$feature_id/state.json" \
    "$TMP_DIR/.bagakit/feature-tracker/features/$feature_id/tasks.json" \
    "$TMP_DIR/.bagakit/feature-tracker/features/$feature_id/owner-receipt.json" \
    "$TMP_DIR/.bagakit/feature-tracker/index/features.json")"
  if bash "$SKILL_DIR/scripts/feature-tracker.sh" closeout-feature \
    --root "$TMP_DIR" --feature "$feature_id" "$@" \
    >"$TMP_DIR/$case_id.out" 2>"$TMP_DIR/$case_id.err"; then
    echo "error: invalid closeout option scope unexpectedly succeeded: $case_id" >&2
    exit 1
  fi
  grep -F "$expected_error" "$TMP_DIR/$case_id.err" >/dev/null
  test "$control_before" = "$(shasum \
    "$TMP_DIR/.bagakit/feature-tracker/features/$feature_id/state.json" \
    "$TMP_DIR/.bagakit/feature-tracker/features/$feature_id/tasks.json" \
    "$TMP_DIR/.bagakit/feature-tracker/features/$feature_id/owner-receipt.json" \
    "$TMP_DIR/.bagakit/feature-tracker/index/features.json")"
}
assert_closeout_rejected archive-with-reason "$CLOSE_BLOCKED_ARCHIVE_ID" \
  "valid only with --mode discard" --reason cancelled
assert_closeout_rejected archive-with-replacement "$CLOSE_BLOCKED_ARCHIVE_ID" \
  "valid only with --mode discard" --replacement "$CLOSE_BLOCKED_DISCARD_ID"
assert_closeout_rejected discard-with-archive-blocked "$CLOSE_BLOCKED_DISCARD_ID" \
  "valid only with --mode archive" --mode discard --reason cancelled --archive-blocked
rm -f "$TMP_DIR"/*.out "$TMP_DIR"/*.err "$TMP_DIR"/*.saved

bash "$SKILL_DIR/scripts/feature-tracker.sh" closeout-feature \
  --root "$TMP_DIR" --feature "$CLOSE_BLOCKED_ARCHIVE_ID" \
  --archive-blocked --execute \
  "${FEATURE_TRACKER_CLOSEOUT_REVIEW_ARGS[@]}" >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" closeout-feature \
  --root "$TMP_DIR" --feature "$CLOSE_BLOCKED_DISCARD_ID" \
  --mode discard --reason cancelled --execute \
  "${FEATURE_TRACKER_CLOSEOUT_REVIEW_ARGS[@]}" >/dev/null
python3 - "$TMP_DIR" "$CLOSE_BLOCKED_ARCHIVE_ID" "$CLOSE_BLOCKED_DISCARD_ID" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
cases = (
    (sys.argv[2], "features-archived", "archived", "external_blocker", "archive waits on owner's upstream capability"),
    (sys.argv[3], "features-discarded", "discarded", "internal_blocker", "discard closes an invalid execution route"),
)
index = json.loads(
    (root / ".bagakit" / "feature-tracker" / "index" / "features.json").read_text(encoding="utf-8")
)
for feat_id, directory, status, reason_class, reason in cases:
    feature_dir = root / ".bagakit" / "feature-tracker" / directory / feat_id
    state = json.loads((feature_dir / "state.json").read_text(encoding="utf-8"))
    tasks = json.loads((feature_dir / "tasks.json").read_text(encoding="utf-8"))
    receipt = json.loads((feature_dir / "owner-receipt.json").read_text(encoding="utf-8"))
    entry = next(item for item in index["features"] if item["feat_id"] == feat_id)
    task = next(item for item in tasks["tasks"] if item["id"] == "T-001")
    assert state["status"] == status
    assert state["closed_from_status"] == "blocked"
    assert "blocked_reason_class" not in state
    assert "blocked_reason" not in state
    assert "blocked_task_id" not in state
    assert task["status"] == "blocked"
    assert task["last_blocker"] == {"class": reason_class, "reason": reason}
    assert receipt["lifecycle_status"] == status
    assert receipt["active_item_ids"] == []
    assert receipt["blockers"] == []
    assert entry["status"] == status
    assert "blocked_reason_class" not in entry
PY
bash "$SKILL_DIR/scripts/feature-tracker.sh" validate-tracker --root "$TMP_DIR" >/dev/null

WORKTREE_COLLISION_PREVIEW="$(python3 - "$ROOT" "$TMP_DIR" <<'PY'
import importlib.util
import sys
from pathlib import Path

repo_root = Path(sys.argv[1])
tmp_root = Path(sys.argv[2])
module_path = repo_root / "skills" / "harness" / "bagakit-feature-tracker" / "scripts" / "feature-tracker.py"
spec = importlib.util.spec_from_file_location("feature_tracker_module", module_path)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
sys.modules[spec.name] = module
spec.loader.exec_module(module)
paths = module.HarnessPaths(tmp_root)
policy = module.load_runtime_policy(paths)
branch_prefix = module.resolve_branch_prefix(policy, None)
feat_id, _ = module.allocate_feat_id(tmp_root, paths)
print(feat_id)
print(f"{branch_prefix}{feat_id}")
print((tmp_root / ".worktrees" / f"wt-{feat_id}").as_posix())
PY
)"
WORKTREE_COLLISION_ID="$(printf '%s\n' "$WORKTREE_COLLISION_PREVIEW" | sed -n '1p')"
WORKTREE_COLLISION_BRANCH="$(printf '%s\n' "$WORKTREE_COLLISION_PREVIEW" | sed -n '2p')"
WORKTREE_COLLISION_PATH="$(printf '%s\n' "$WORKTREE_COLLISION_PREVIEW" | sed -n '3p')"
FEATURE_COUNT_BEFORE_WORKTREE_COLLISION="$(python3 - "$TMP_DIR" <<'PY'
import json
import sys
from pathlib import Path

index_path = Path(sys.argv[1]) / ".bagakit" / "feature-tracker" / "index" / "features.json"
payload = json.loads(index_path.read_text(encoding="utf-8"))
print(len(payload.get("features", [])))
print(payload["feature_id_issuance"]["next_cursor"])
PY
)"
WORKTREE_COLLISION_FEATURE_COUNT="$(printf '%s\n' "$FEATURE_COUNT_BEFORE_WORKTREE_COLLISION" | sed -n '1p')"
WORKTREE_COLLISION_NEXT_CURSOR="$(printf '%s\n' "$FEATURE_COUNT_BEFORE_WORKTREE_COLLISION" | sed -n '2p')"
WORKTREE_COLLISION_WORKTREE_COUNT="$(git -C "$TMP_DIR" worktree list --porcelain | grep -c '^worktree ')"

git -C "$TMP_DIR" branch "$WORKTREE_COLLISION_BRANCH" >/dev/null
if bash "$SKILL_DIR/scripts/feature-tracker.sh" create-feature --root "$TMP_DIR" --title "Blocked create by branch collision" --slug "blocked-create-by-branch-collision" --goal "Reject existing branch before cursor persistence" --workspace-mode worktree --tasks-file "$TASK_PLAN_JSON" >/dev/null 2>&1; then
  echo "error: create-feature unexpectedly accepted colliding worktree branch" >&2
  exit 1
fi
WORKTREE_COLLISION_AFTER_BRANCH="$(python3 - "$TMP_DIR" <<'PY'
import json
import sys
from pathlib import Path

index_path = Path(sys.argv[1]) / ".bagakit" / "feature-tracker" / "index" / "features.json"
payload = json.loads(index_path.read_text(encoding="utf-8"))
print(len(payload.get("features", [])))
print(payload["feature_id_issuance"]["next_cursor"])
PY
)"
test "$WORKTREE_COLLISION_FEATURE_COUNT" = "$(printf '%s\n' "$WORKTREE_COLLISION_AFTER_BRANCH" | sed -n '1p')"
test "$WORKTREE_COLLISION_NEXT_CURSOR" = "$(printf '%s\n' "$WORKTREE_COLLISION_AFTER_BRANCH" | sed -n '2p')"
test "$WORKTREE_COLLISION_WORKTREE_COUNT" = "$(git -C "$TMP_DIR" worktree list --porcelain | grep -c '^worktree ')"
git -C "$TMP_DIR" branch -D "$WORKTREE_COLLISION_BRANCH" >/dev/null

mkdir -p "$WORKTREE_COLLISION_PATH"
if bash "$SKILL_DIR/scripts/feature-tracker.sh" create-feature --root "$TMP_DIR" --title "Blocked create by worktree path collision" --slug "blocked-create-by-worktree-path-collision" --goal "Reject existing worktree path before cursor persistence" --workspace-mode worktree --tasks-file "$TASK_PLAN_JSON" >/dev/null 2>&1; then
  echo "error: create-feature unexpectedly accepted colliding worktree path" >&2
  exit 1
fi
WORKTREE_COLLISION_AFTER_PATH="$(python3 - "$TMP_DIR" <<'PY'
import json
import sys
from pathlib import Path

index_path = Path(sys.argv[1]) / ".bagakit" / "feature-tracker" / "index" / "features.json"
payload = json.loads(index_path.read_text(encoding="utf-8"))
print(len(payload.get("features", [])))
print(payload["feature_id_issuance"]["next_cursor"])
PY
)"
test "$WORKTREE_COLLISION_FEATURE_COUNT" = "$(printf '%s\n' "$WORKTREE_COLLISION_AFTER_PATH" | sed -n '1p')"
test "$WORKTREE_COLLISION_NEXT_CURSOR" = "$(printf '%s\n' "$WORKTREE_COLLISION_AFTER_PATH" | sed -n '2p')"
test "$WORKTREE_COLLISION_WORKTREE_COUNT" = "$(git -C "$TMP_DIR" worktree list --porcelain | grep -c '^worktree ')"
rm -rf "$WORKTREE_COLLISION_PATH"

bash "$SKILL_DIR/scripts/feature-tracker.sh" create-feature \
  --root "$TMP_DIR" --title "Worktree closeout" --slug "worktree-closeout" \
  --goal "Close metadata without mutating the assigned Git workspace" \
  --workspace-mode worktree --tasks-file "$TASK_PLAN_JSON" >/dev/null
WORKTREE_CLOSEOUT_ID="$(
  feature_tracker_feature_id_by_title "$TMP_DIR" "Worktree closeout"
)"
WORKTREE_CLOSEOUT_FACTS="$(python3 - "$TMP_DIR" "$WORKTREE_CLOSEOUT_ID" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
feature_id = sys.argv[2]
state = json.loads(
    (root / ".bagakit" / "feature-tracker" / "features" / feature_id / "state.json").read_text(
        encoding="utf-8"
    )
)
print(state["worktree_path"])
print(state["branch"])
PY
)"
WORKTREE_CLOSEOUT_PATH="$TMP_DIR/$(printf '%s\n' "$WORKTREE_CLOSEOUT_FACTS" | sed -n '1p')"
WORKTREE_CLOSEOUT_BRANCH="$(printf '%s\n' "$WORKTREE_CLOSEOUT_FACTS" | sed -n '2p')"
bash "$SKILL_DIR/scripts/feature-tracker.sh" start-task \
  --root "$TMP_DIR" --feature "$WORKTREE_CLOSEOUT_ID" --task T-001 >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" run-task-gate \
  --root "$TMP_DIR" --feature "$WORKTREE_CLOSEOUT_ID" --task T-001 >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" finish-task \
  --root "$TMP_DIR" --feature "$WORKTREE_CLOSEOUT_ID" --task T-001 --result done >/dev/null
git -C "$TMP_DIR" merge -q --no-ff "$WORKTREE_CLOSEOUT_BRANCH" -m "merge worktree closeout fixture"
WORKTREE_REGISTRATION_BEFORE="$(git -C "$TMP_DIR" worktree list --porcelain)"
bash "$SKILL_DIR/scripts/feature-tracker.sh" archive-feature \
  --root "$TMP_DIR" --feature "$WORKTREE_CLOSEOUT_ID" \
  "${FEATURE_TRACKER_CLOSEOUT_REVIEW_ARGS[@]}" >/dev/null
test -d "$WORKTREE_CLOSEOUT_PATH"
test "$WORKTREE_REGISTRATION_BEFORE" = "$(git -C "$TMP_DIR" worktree list --porcelain)"
git -C "$TMP_DIR" show-ref --verify --quiet "refs/heads/$WORKTREE_CLOSEOUT_BRANCH"

bash "$SKILL_DIR/scripts/feature-tracker.sh" create-feature --root "$TMP_DIR" --title "Dirty current tree discard" --slug "dirty-current-tree-discard" --goal "Discard should fail without artifacts side effects" --workspace-mode proposal_only >/dev/null
DIRTY_DISCARD_ID="$(
  feature_tracker_feature_id_by_title "$TMP_DIR" "Dirty current tree discard"
)"
bash "$SKILL_DIR/scripts/feature-tracker.sh" set-task-plan --root "$TMP_DIR" --feature "$DIRTY_DISCARD_ID" --tasks-file "$TASK_PLAN_JSON" --expected-revision 0 >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" assign-feature-workspace --root "$TMP_DIR" --feature "$DIRTY_DISCARD_ID" --workspace-mode current_tree >/dev/null
cat > "$TMP_DIR/DIRTY.md" <<'EOF'
root dirty change
EOF
if bash "$SKILL_DIR/scripts/feature-tracker.sh" discard-feature --root "$TMP_DIR" --feature "$DIRTY_DISCARD_ID" --reason superseded \
  "${FEATURE_TRACKER_CLOSEOUT_REVIEW_ARGS[@]}" >/dev/null 2>&1; then
  echo "error: dirty current_tree discard unexpectedly succeeded" >&2
  exit 1
fi
test ! -d "$TMP_DIR/.bagakit/feature-tracker/features/$DIRTY_DISCARD_ID/artifacts"
rm -f "$TMP_DIR/DIRTY.md"

bash "$SKILL_DIR/scripts/feature-tracker.sh" create-feature --root "$TMP_DIR" --title "Cycle A" --slug "cycle-a" --goal "Check replan rollback" --workspace-mode proposal_only >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" create-feature --root "$TMP_DIR" --title "Cycle B" --slug "cycle-b" --goal "Check replan rollback" --workspace-mode proposal_only >/dev/null

CYCLE_FEATURE_IDS="$(python3 - "$TMP_DIR" <<'PY'
import json
import sys
from pathlib import Path

index_path = Path(sys.argv[1]) / ".bagakit" / "feature-tracker" / "index" / "features.json"
payload = json.loads(index_path.read_text(encoding="utf-8"))
feature_ids = {}
for item in payload.get("features", []):
    title = item.get("title")
    if title == "Cycle A":
        feature_ids["a"] = item["feat_id"]
    elif title == "Cycle B":
        feature_ids["b"] = item["feat_id"]
if set(feature_ids) != {"a", "b"}:
    raise SystemExit("cycle features not found")
print(feature_ids["a"])
print(feature_ids["b"])
PY
)"

CYCLE_A_ID="$(printf '%s\n' "$CYCLE_FEATURE_IDS" | sed -n '1p')"
CYCLE_B_ID="$(printf '%s\n' "$CYCLE_FEATURE_IDS" | sed -n '2p')"

if bash "$SKILL_DIR/scripts/feature-tracker.sh" replan-features --root "$TMP_DIR" --dependency "$CYCLE_A_ID:$CYCLE_B_ID" --dependency "$CYCLE_B_ID:$CYCLE_A_ID" >/dev/null 2>&1; then
  echo "error: cyclic replan unexpectedly succeeded" >&2
  exit 1
fi
python3 - "$TMP_DIR" "$CYCLE_A_ID" "$CYCLE_B_ID" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
for feature_id in (sys.argv[2], sys.argv[3]):
    state_path = root / ".bagakit" / "feature-tracker" / "features" / feature_id / "state.json"
    state = json.loads(state_path.read_text(encoding="utf-8"))
    assert state.get("depends_on", []) == []
PY

python3 - "$TMP_DIR" "$CYCLE_A_ID" "$CYCLE_B_ID" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
for feature_id, deps in ((sys.argv[2], [sys.argv[3]]), (sys.argv[3], [sys.argv[2]])):
    state_path = root / ".bagakit" / "feature-tracker" / "features" / feature_id / "state.json"
    state = json.loads(state_path.read_text(encoding="utf-8"))
    state["depends_on"] = deps
    state_path.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
PY
if bash "$SKILL_DIR/scripts/feature-tracker.sh" validate-tracker --root "$TMP_DIR" >/dev/null 2>&1; then
  echo "error: canonical dependency cycle unexpectedly accepted" >&2
  exit 1
fi

python3 - "$TMP_DIR" "$CYCLE_A_ID" "$CYCLE_B_ID" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
for feature_id in (sys.argv[2], sys.argv[3]):
    state_path = root / ".bagakit" / "feature-tracker" / "features" / feature_id / "state.json"
    state = json.loads(state_path.read_text(encoding="utf-8"))
    state.pop("depends_on", None)
    state_path.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
PY

python3 - "$TMP_DIR" "$CYCLE_A_ID" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
feature_id = sys.argv[2]
state_path = root / ".bagakit" / "feature-tracker" / "features" / feature_id / "state.json"
state = json.loads(state_path.read_text(encoding="utf-8"))
state["depends_on"] = feature_id
state_path.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
PY
if bash "$SKILL_DIR/scripts/feature-tracker.sh" validate-tracker --root "$TMP_DIR" >/dev/null 2>&1; then
  echo "error: non-list/string depends_on unexpectedly accepted" >&2
  exit 1
fi
bash "$SKILL_DIR/scripts/feature-tracker.sh" replan-features --root "$TMP_DIR" --clear-dependencies "$CYCLE_A_ID" >/dev/null

bash "$SKILL_DIR/scripts/feature-tracker.sh" create-feature --root "$TMP_DIR" --title "Closeout preserve feature" --slug "closeout-preserve-feature" --goal "Preserve root files on archive" --workspace-mode proposal_only >/dev/null
CLOSEOUT_FEATURE_ID="$(
  feature_tracker_feature_id_by_title "$TMP_DIR" "Closeout preserve feature"
)"

feature_tracker_complete_reviewed_feature "$TMP_DIR" "$SKILL_DIR" "$CLOSEOUT_FEATURE_ID" "$TASK_PLAN_JSON"

bash "$SKILL_DIR/scripts/feature-tracker.sh" materialize-feature-artifact --root "$TMP_DIR" --feature "$CLOSEOUT_FEATURE_ID" --kind proposal >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" materialize-feature-artifact --root "$TMP_DIR" --feature "$CLOSEOUT_FEATURE_ID" --kind verification >/dev/null
CLOSEOUT_DIR="$TMP_DIR/.bagakit/feature-tracker/features/$CLOSEOUT_FEATURE_ID"
cat > "$CLOSEOUT_DIR/ui-verification.md" <<'EOF'
legacy ui verification
EOF
cat > "$CLOSEOUT_DIR/summary.md" <<'EOF'
operator-authored active summary
EOF
PRESERVED_SUMMARY_SHA="$(shasum "$CLOSEOUT_DIR/summary.md" | awk '{print $1}')"
cat > "$CLOSEOUT_DIR/PRD.md" <<'EOF'
legacy product doc
EOF
mkdir -p "$CLOSEOUT_DIR/notes-dir"
cat > "$CLOSEOUT_DIR/notes-dir/notes.txt" <<'EOF'
legacy notes
EOF
CLOSEOUT_CONTROL_BEFORE="$(shasum \
  "$CLOSEOUT_DIR/state.json" \
  "$CLOSEOUT_DIR/tasks.json" \
  "$CLOSEOUT_DIR/owner-receipt.json" \
  "$TMP_DIR/.bagakit/feature-tracker/index/features.json" | awk '{print $1}')"
for residue in \
  "$TMP_DIR/.bagakit/feature-tracker/features-archived/.$CLOSEOUT_FEATURE_ID.staging" \
  "$TMP_DIR/.bagakit/feature-tracker/features/.$CLOSEOUT_FEATURE_ID.closing"; do
  mkdir -p "$residue"
  if bash "$SKILL_DIR/scripts/feature-tracker.sh" archive-feature \
    --root "$TMP_DIR" --feature "$CLOSEOUT_FEATURE_ID" \
    "${FEATURE_TRACKER_CLOSEOUT_REVIEW_ARGS[@]}" \
    >"$TMP_DIR/closeout-residue.out" 2>"$TMP_DIR/closeout-residue.err"; then
    echo "error: closeout unexpectedly accepted publication residue" >&2
    exit 1
  fi
  grep -F "closeout staging residue exists; inspect before retry" \
    "$TMP_DIR/closeout-residue.err" >/dev/null
  test "$CLOSEOUT_CONTROL_BEFORE" = "$(shasum \
    "$CLOSEOUT_DIR/state.json" \
    "$CLOSEOUT_DIR/tasks.json" \
    "$CLOSEOUT_DIR/owner-receipt.json" \
    "$TMP_DIR/.bagakit/feature-tracker/index/features.json" | awk '{print $1}')"
  rmdir "$residue"
done
printf 'must remain unchanged\n' > "$TMP_DIR/outside-closeout.txt"
ln -s "$TMP_DIR/outside-closeout.txt" "$CLOSEOUT_DIR/unsupported-link"
if bash "$SKILL_DIR/scripts/feature-tracker.sh" archive-feature \
  --root "$TMP_DIR" --feature "$CLOSEOUT_FEATURE_ID" \
  "${FEATURE_TRACKER_CLOSEOUT_REVIEW_ARGS[@]}" \
  >"$TMP_DIR/staged-symlink-failure.out" 2>"$TMP_DIR/staged-symlink-failure.err"; then
  echo "error: closeout unexpectedly accepted a feature-tree symlink" >&2
  exit 1
fi
grep -F "feature tree contains unsupported symlink" \
  "$TMP_DIR/staged-symlink-failure.err" >/dev/null
test "$(cat "$TMP_DIR/outside-closeout.txt")" = "must remain unchanged"
test "$CLOSEOUT_CONTROL_BEFORE" = "$(shasum \
  "$CLOSEOUT_DIR/state.json" \
  "$CLOSEOUT_DIR/tasks.json" \
  "$CLOSEOUT_DIR/owner-receipt.json" \
  "$TMP_DIR/.bagakit/feature-tracker/index/features.json" | awk '{print $1}')"
rm -f "$CLOSEOUT_DIR/unsupported-link"

mkfifo "$CLOSEOUT_DIR/unsupported.pipe"
if bash "$SKILL_DIR/scripts/feature-tracker.sh" archive-feature \
  --root "$TMP_DIR" --feature "$CLOSEOUT_FEATURE_ID" \
  "${FEATURE_TRACKER_CLOSEOUT_REVIEW_ARGS[@]}" \
  >"$TMP_DIR/staged-closeout-failure.out" 2>"$TMP_DIR/staged-closeout-failure.err"; then
  echo "error: closeout unexpectedly copied an unsupported special file" >&2
  exit 1
fi
grep -F "closeout publication failed without changing active state" \
  "$TMP_DIR/staged-closeout-failure.err" >/dev/null
test -d "$CLOSEOUT_DIR"
test ! -d "$TMP_DIR/.bagakit/feature-tracker/features-archived/$CLOSEOUT_FEATURE_ID"
test "$CLOSEOUT_CONTROL_BEFORE" = "$(shasum \
  "$CLOSEOUT_DIR/state.json" \
  "$CLOSEOUT_DIR/tasks.json" \
  "$CLOSEOUT_DIR/owner-receipt.json" \
  "$TMP_DIR/.bagakit/feature-tracker/index/features.json" | awk '{print $1}')"
test ! -e "$TMP_DIR/.bagakit/feature-tracker/features-archived/.$CLOSEOUT_FEATURE_ID.staging"
rm -f "$CLOSEOUT_DIR/unsupported.pipe" "$TMP_DIR/staged-closeout-failure.out" \
  "$TMP_DIR/staged-closeout-failure.err"

INDEX_DIR="$TMP_DIR/.bagakit/feature-tracker/index"
chmod 0555 "$INDEX_DIR"
if bash "$SKILL_DIR/scripts/feature-tracker.sh" archive-feature \
  --root "$TMP_DIR" --feature "$CLOSEOUT_FEATURE_ID" \
  "${FEATURE_TRACKER_CLOSEOUT_REVIEW_ARGS[@]}" \
  >"$TMP_DIR/index-publication-failure.out" \
  2>"$TMP_DIR/index-publication-failure.err"; then
  chmod 0755 "$INDEX_DIR"
  echo "error: closeout unexpectedly ignored index publication failure" >&2
  exit 1
fi
chmod 0755 "$INDEX_DIR"
grep -F "closeout publication failed without changing active state" \
  "$TMP_DIR/index-publication-failure.err" >/dev/null
test -d "$CLOSEOUT_DIR"
test ! -d "$TMP_DIR/.bagakit/feature-tracker/features-archived/$CLOSEOUT_FEATURE_ID"
test "$CLOSEOUT_CONTROL_BEFORE" = "$(shasum \
  "$CLOSEOUT_DIR/state.json" \
  "$CLOSEOUT_DIR/tasks.json" \
  "$CLOSEOUT_DIR/owner-receipt.json" \
  "$TMP_DIR/.bagakit/feature-tracker/index/features.json" | awk '{print $1}')"
test ! -e "$TMP_DIR/.bagakit/feature-tracker/features-archived/.$CLOSEOUT_FEATURE_ID.staging"
test ! -e "$TMP_DIR/.bagakit/feature-tracker/features/.$CLOSEOUT_FEATURE_ID.closing"

FEATURES_DIR="$TMP_DIR/.bagakit/feature-tracker/features"
ARCHIVED_DIR="$TMP_DIR/.bagakit/feature-tracker/features-archived"
BACKUP_DIR="$FEATURES_DIR/.$CLOSEOUT_FEATURE_ID.closing"
STAGE_DIR="$ARCHIVED_DIR/.$CLOSEOUT_FEATURE_ID.staging"
CLOSED_DIR="$ARCHIVED_DIR/$CLOSEOUT_FEATURE_ID"
INDEX_TMP="$INDEX_DIR/features.json.tmp"
mkfifo "$INDEX_TMP"
(
  while test ! -d "$CLOSED_DIR"; do
    sleep 0.01
  done
  chmod 0555 "$FEATURES_DIR" "$ARCHIVED_DIR" "$INDEX_DIR"
  cat "$INDEX_TMP" >/dev/null
) &
ROLLBACK_FAULT_PID=$!
if bash "$SKILL_DIR/scripts/feature-tracker.sh" archive-feature \
  --root "$TMP_DIR" --feature "$CLOSEOUT_FEATURE_ID" \
  "${FEATURE_TRACKER_CLOSEOUT_REVIEW_ARGS[@]}" \
  >"$TMP_DIR/rollback-failure.out" 2>"$TMP_DIR/rollback-failure.err"; then
  chmod 0755 "$FEATURES_DIR" "$ARCHIVED_DIR" "$INDEX_DIR"
  wait "$ROLLBACK_FAULT_PID"
  echo "error: compounded closeout rollback fault unexpectedly succeeded" >&2
  exit 1
fi
wait "$ROLLBACK_FAULT_PID"
chmod 0755 "$FEATURES_DIR" "$ARCHIVED_DIR" "$INDEX_DIR"
grep -F "closeout publication failed and rollback is incomplete" \
  "$TMP_DIR/rollback-failure.err" >/dev/null
grep -F "manual repair required; ambiguous closeout residues were preserved" \
  "$TMP_DIR/rollback-failure.err" >/dev/null
if grep -F "without changing active state" "$TMP_DIR/rollback-failure.err" >/dev/null; then
  echo "error: incomplete rollback falsely claimed unchanged active state" >&2
  exit 1
fi
test ! -d "$CLOSEOUT_DIR"
test -d "$BACKUP_DIR"
test -d "$CLOSED_DIR"
test "$CLOSEOUT_CONTROL_BEFORE" = "$(shasum \
  "$BACKUP_DIR/state.json" \
  "$BACKUP_DIR/tasks.json" \
  "$BACKUP_DIR/owner-receipt.json" \
  "$TMP_DIR/.bagakit/feature-tracker/index/features.json" | awk '{print $1}')"
if bash "$SKILL_DIR/scripts/feature-tracker.sh" validate-tracker --root "$TMP_DIR" \
  >"$TMP_DIR/rollback-validation.out" 2>"$TMP_DIR/rollback-validation.err"; then
  echo "error: tracker validation accepted an incomplete closeout rollback" >&2
  exit 1
fi
mv "$CLOSED_DIR" "$STAGE_DIR"
mv "$BACKUP_DIR" "$CLOSEOUT_DIR"
python3 - "$STAGE_DIR" "$INDEX_TMP" <<'PY'
import shutil
import sys
from pathlib import Path

shutil.rmtree(Path(sys.argv[1]))
Path(sys.argv[2]).unlink(missing_ok=True)
PY

chmod 0555 "$CLOSEOUT_DIR/artifacts"
bash "$SKILL_DIR/scripts/feature-tracker.sh" archive-feature --root "$TMP_DIR" --feature "$CLOSEOUT_FEATURE_ID" \
  "${FEATURE_TRACKER_CLOSEOUT_REVIEW_ARGS[@]}" >/dev/null
ARCHIVED_CLOSEOUT_DIR="$TMP_DIR/.bagakit/feature-tracker/features-archived/$CLOSEOUT_FEATURE_ID"
test -f "$ARCHIVED_CLOSEOUT_DIR/summary.md"
test ! -f "$ARCHIVED_CLOSEOUT_DIR/proposal.md"
test ! -f "$ARCHIVED_CLOSEOUT_DIR/verification.md"
test ! -f "$ARCHIVED_CLOSEOUT_DIR/ui-verification.md"
test ! -f "$ARCHIVED_CLOSEOUT_DIR/PRD.md"
test ! -d "$ARCHIVED_CLOSEOUT_DIR/notes-dir"
test -f "$ARCHIVED_CLOSEOUT_DIR/artifacts/closeout-preserved-root/proposal.md"
test -f "$ARCHIVED_CLOSEOUT_DIR/artifacts/closeout-preserved-root/verification.md"
test -f "$ARCHIVED_CLOSEOUT_DIR/artifacts/closeout-preserved-root/ui-verification.md"
test -f "$ARCHIVED_CLOSEOUT_DIR/artifacts/closeout-preserved-root/summary.md"
test -f "$ARCHIVED_CLOSEOUT_DIR/artifacts/closeout-preserved-root/PRD.md"
test -f "$ARCHIVED_CLOSEOUT_DIR/artifacts/closeout-preserved-root/notes-dir/notes.txt"
test "$PRESERVED_SUMMARY_SHA" = "$(shasum "$ARCHIVED_CLOSEOUT_DIR/artifacts/closeout-preserved-root/summary.md" | awk '{print $1}')"
SUMMARY_SHA_BEFORE="$(shasum "$ARCHIVED_CLOSEOUT_DIR/summary.md" | awk '{print $1}')"
bash "$SKILL_DIR/scripts/feature-tracker.sh" archive-feature --root "$TMP_DIR" --feature "$CLOSEOUT_FEATURE_ID" >/dev/null
SUMMARY_SHA_AFTER="$(shasum "$ARCHIVED_CLOSEOUT_DIR/summary.md" | awk '{print $1}')"
test "$SUMMARY_SHA_BEFORE" = "$SUMMARY_SHA_AFTER"
test -f "$ARCHIVED_CLOSEOUT_DIR/summary.md"
test "$PRESERVED_SUMMARY_SHA" = "$(shasum "$ARCHIVED_CLOSEOUT_DIR/artifacts/closeout-preserved-root/summary.md" | awk '{print $1}')"
if bash "$SKILL_DIR/scripts/feature-tracker.sh" materialize-feature-artifact --root "$TMP_DIR" --feature "$CLOSEOUT_FEATURE_ID" --kind verification >/dev/null 2>&1; then
  echo "error: closed feature unexpectedly allowed helper materialization" >&2
  exit 1
fi
bash "$SKILL_DIR/scripts/feature-tracker.sh" validate-tracker --root "$TMP_DIR" >/dev/null

mkdir -p "$TMP_DIR/.bagakit/feature-tracker/feats/legacy-test"
if bash "$SKILL_DIR/scripts/feature-tracker.sh" validate-tracker --root "$TMP_DIR" >/dev/null 2>&1; then
  echo "error: legacy feats directory unexpectedly accepted" >&2
  exit 1
fi
rmdir "$TMP_DIR/.bagakit/feature-tracker/feats/legacy-test"
rmdir "$TMP_DIR/.bagakit/feature-tracker/feats"

bash "$SKILL_DIR/scripts/feature-tracker.sh" create-feature --root "$TMP_DIR" --title "False archived feature" --slug "false-archived-feature" --goal "Reject false archived fast path" --workspace-mode proposal_only >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" create-feature --root "$TMP_DIR" --title "False discarded feature" --slug "false-discarded-feature" --goal "Reject false discarded fast path" --workspace-mode proposal_only >/dev/null
FALSE_ARCHIVE_ID="$(
  feature_tracker_feature_id_by_title "$TMP_DIR" "False archived feature"
)"
FALSE_DISCARD_ID="$(
  feature_tracker_feature_id_by_title "$TMP_DIR" "False discarded feature"
)"

python3 - "$TMP_DIR" "$FALSE_ARCHIVE_ID" "$FALSE_DISCARD_ID" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
archive_id = sys.argv[2]
discard_id = sys.argv[3]
for feat_id, status in ((archive_id, "archived"), (discard_id, "discarded")):
    state_path = root / ".bagakit" / "feature-tracker" / "features" / feat_id / "state.json"
    state = json.loads(state_path.read_text(encoding="utf-8"))
    state["status"] = status
    state_path.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
PY

if bash "$SKILL_DIR/scripts/feature-tracker.sh" archive-feature --root "$TMP_DIR" --feature "$FALSE_ARCHIVE_ID" >/dev/null 2>&1; then
  echo "error: archive-feature falsely accepted active-root archived state" >&2
  exit 1
fi
test -d "$TMP_DIR/.bagakit/feature-tracker/features/$FALSE_ARCHIVE_ID"
test ! -d "$TMP_DIR/.bagakit/feature-tracker/features-archived/$FALSE_ARCHIVE_ID"

if bash "$SKILL_DIR/scripts/feature-tracker.sh" discard-feature --root "$TMP_DIR" --feature "$FALSE_DISCARD_ID" --reason superseded >/dev/null 2>&1; then
  echo "error: discard-feature falsely accepted active-root discarded state" >&2
  exit 1
fi
test -d "$TMP_DIR/.bagakit/feature-tracker/features/$FALSE_DISCARD_ID"
test ! -d "$TMP_DIR/.bagakit/feature-tracker/features-discarded/$FALSE_DISCARD_ID"

bash "$SKILL_DIR/scripts/feature-tracker.sh" create-feature --root "$TMP_DIR" --title "Broken active feature" --slug "broken-active-feature" --goal "Break active graph without blocking closed rerun" --workspace-mode proposal_only >/dev/null
BROKEN_ACTIVE_ID="$(
  feature_tracker_feature_id_by_title "$TMP_DIR" "Broken active feature"
)"
python3 - "$TMP_DIR" "$BROKEN_ACTIVE_ID" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
feature_id = sys.argv[2]
state_path = root / ".bagakit" / "feature-tracker" / "features" / feature_id / "state.json"
state = json.loads(state_path.read_text(encoding="utf-8"))
state["depends_on"] = [feature_id]
state_path.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
PY
if ! bash "$SKILL_DIR/scripts/feature-tracker.sh" archive-feature --root "$TMP_DIR" --feature "$CLOSEOUT_FEATURE_ID" >/dev/null 2>&1; then
  echo "error: already-closed archive-feature unexpectedly failed on unrelated active-graph breakage" >&2
  exit 1
fi
bash "$SKILL_DIR/scripts/feature-tracker.sh" replan-features --root "$TMP_DIR" --clear-dependencies "$BROKEN_ACTIVE_ID" >/dev/null

python3 - "$TMP_DIR" "$CLOSE_BLOCKED_ARCHIVE_ID" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
feature_id = sys.argv[2]
tasks_path = (
    root
    / ".bagakit"
    / "feature-tracker"
    / "features-archived"
    / feature_id
    / "tasks.json"
)
tasks = json.loads(tasks_path.read_text(encoding="utf-8"))
task = next(item for item in tasks["tasks"] if item["id"] == "T-001")
task["last_blocker"]["reason"] = " archive waits on an upstream capability"
tasks_path.write_text(json.dumps(tasks, indent=2) + "\n", encoding="utf-8")
PY
if bash "$SKILL_DIR/scripts/feature-tracker.sh" validate-tracker --root "$TMP_DIR" \
  >"$TMP_DIR/noncanonical-blocker.out" 2>"$TMP_DIR/noncanonical-blocker.err"; then
  echo "error: non-canonical task blocker whitespace unexpectedly validated" >&2
  exit 1
fi
grep -F "last_blocker.reason must not have surrounding whitespace" \
  "$TMP_DIR/noncanonical-blocker.err" >/dev/null

feature_tracker_init_temp_repo "$ADOPT_TMP_DIR"
bash "$SKILL_DIR/scripts/feature-tracker.sh" initialize-tracker \
  --root "$ADOPT_TMP_DIR" >/dev/null
ADOPT_PLAN="$ADOPT_TMP_DIR/.bagakit/feature-tracker/artifacts/adopt-plan.json"
feature_tracker_write_reviewed_task_plan \
  "$ADOPT_PLAN" \
  "Adopt and rebind existing registered worktrees without changing them."
bash "$SKILL_DIR/scripts/feature-tracker.sh" create-feature \
  --root "$ADOPT_TMP_DIR" \
  --title "Adopt existing worktree" \
  --slug "adopt-existing-worktree" \
  --goal "Bind an existing worktree through the public Tracker transition" \
  --workspace-mode proposal_only >/dev/null
ADOPT_ID="$(
  feature_tracker_feature_id_by_title "$ADOPT_TMP_DIR" "Adopt existing worktree"
)"
bash "$SKILL_DIR/scripts/feature-tracker.sh" set-task-plan \
  --root "$ADOPT_TMP_DIR" \
  --feature "$ADOPT_ID" \
  --tasks-file "$ADOPT_PLAN" \
  --expected-revision 0 >/dev/null

mkdir -p "$ADOPT_TMP_DIR/.worktrees"
printf '.worktrees/\n' >>"$ADOPT_TMP_DIR/.git/info/exclude"
FIRST_WORKTREE="$ADOPT_TMP_DIR/.worktrees/existing-feature"
SECOND_WORKTREE="$ADOPT_TMP_DIR/.worktrees/rebound-feature"
git -C "$ADOPT_TMP_DIR" worktree add -q \
  -b feature/existing-feature "$FIRST_WORKTREE" HEAD
git -C "$ADOPT_TMP_DIR" worktree add -q \
  -b feature/rebound-feature "$SECOND_WORKTREE" HEAD
printf 'preserve first\n' >"$FIRST_WORKTREE/UNRELATED.txt"
printf 'preserve second\n' >"$SECOND_WORKTREE/UNRELATED.txt"
WORKTREE_LIST_BEFORE="$(git -C "$ADOPT_TMP_DIR" worktree list --porcelain)"
FIRST_HEAD_BEFORE="$(git -C "$FIRST_WORKTREE" rev-parse HEAD)"
SECOND_HEAD_BEFORE="$(git -C "$SECOND_WORKTREE" rev-parse HEAD)"
ADOPT_STATE="$ADOPT_TMP_DIR/.bagakit/feature-tracker/features/$ADOPT_ID/state.json"
ADOPT_RECEIPT="$ADOPT_TMP_DIR/.bagakit/feature-tracker/features/$ADOPT_ID/owner-receipt.json"
ADOPT_STATE_SHA="$(shasum "$ADOPT_STATE" | awk '{print $1}')"

if bash "$SKILL_DIR/scripts/feature-tracker.sh" adopt-feature-worktree \
  --root "$ADOPT_TMP_DIR" \
  --feature "$ADOPT_ID" \
  --worktree-path "$FIRST_WORKTREE" \
  --branch feature/wrong-branch >/dev/null 2>&1; then
  echo "error: worktree adoption accepted a branch mismatch" >&2
  exit 1
fi
test "$ADOPT_STATE_SHA" = "$(shasum "$ADOPT_STATE" | awk '{print $1}')"

mkdir -p "$ADOPT_TMP_DIR/not-registered"
if bash "$SKILL_DIR/scripts/feature-tracker.sh" adopt-feature-worktree \
  --root "$ADOPT_TMP_DIR" \
  --feature "$ADOPT_ID" \
  --worktree-path "$ADOPT_TMP_DIR/not-registered" \
  --branch feature/existing-feature >/dev/null 2>&1; then
  echo "error: worktree adoption accepted an unregistered path" >&2
  exit 1
fi
test "$ADOPT_STATE_SHA" = "$(shasum "$ADOPT_STATE" | awk '{print $1}')"

cp "$ADOPT_RECEIPT" "$ADOPT_TMP_DIR/owner-receipt.saved.json"
printf '{}\n' >"$ADOPT_RECEIPT"
if bash "$SKILL_DIR/scripts/feature-tracker.sh" adopt-feature-worktree \
  --root "$ADOPT_TMP_DIR" \
  --feature "$ADOPT_ID" \
  --worktree-path "$FIRST_WORKTREE" \
  --branch feature/existing-feature >/dev/null 2>&1; then
  echo "error: worktree adoption accepted a stale owner receipt" >&2
  exit 1
fi
mv "$ADOPT_TMP_DIR/owner-receipt.saved.json" "$ADOPT_RECEIPT"

bash "$SKILL_DIR/scripts/feature-tracker.sh" adopt-feature-worktree \
  --root "$ADOPT_TMP_DIR" \
  --feature "$ADOPT_ID" \
  --worktree-path "$FIRST_WORKTREE" \
  --branch feature/existing-feature >/dev/null
RECEIPT_SHA_AFTER_ADOPT="$(shasum "$ADOPT_RECEIPT" | awk '{print $1}')"
bash "$SKILL_DIR/scripts/feature-tracker.sh" adopt-feature-worktree \
  --root "$ADOPT_TMP_DIR" \
  --feature "$ADOPT_ID" \
  --worktree-path "$SECOND_WORKTREE" \
  --branch feature/rebound-feature >/dev/null
test "$RECEIPT_SHA_AFTER_ADOPT" != "$(shasum "$ADOPT_RECEIPT" | awk '{print $1}')"

python3 - "$ADOPT_TMP_DIR" "$ADOPT_ID" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
feature_id = sys.argv[2]
state = json.loads(
    (root / ".bagakit" / "feature-tracker" / "features" / feature_id / "state.json").read_text(
        encoding="utf-8"
    )
)
assert state["status"] == "ready"
assert state["workspace_mode"] == "worktree"
assert state["branch"] == "feature/rebound-feature"
assert state["worktree_name"] == "rebound-feature"
assert state["worktree_path"] == ".worktrees/rebound-feature"
assert state["history"][-1] == {
    "action": "workspace_adopted",
    "detail": (
        "worktree:feature/existing-feature@.worktrees/existing-feature"
        " -> worktree:feature/rebound-feature@.worktrees/rebound-feature"
    ),
}
PY

bash "$SKILL_DIR/scripts/feature-tracker.sh" start-task \
  --root "$ADOPT_TMP_DIR" --feature "$ADOPT_ID" --task T-001 >/dev/null
if bash "$SKILL_DIR/scripts/feature-tracker.sh" adopt-feature-worktree \
  --root "$ADOPT_TMP_DIR" \
  --feature "$ADOPT_ID" \
  --worktree-path "$FIRST_WORKTREE" \
  --branch feature/existing-feature >/dev/null 2>&1; then
  echo "error: worktree adoption accepted an active Task" >&2
  exit 1
fi

test "$(cat "$FIRST_WORKTREE/UNRELATED.txt")" = "preserve first"
test "$(cat "$SECOND_WORKTREE/UNRELATED.txt")" = "preserve second"
test "$WORKTREE_LIST_BEFORE" = "$(git -C "$ADOPT_TMP_DIR" worktree list --porcelain)"
test "$FIRST_HEAD_BEFORE" = "$(git -C "$FIRST_WORKTREE" rev-parse HEAD)"
test "$SECOND_HEAD_BEFORE" = "$(git -C "$SECOND_WORKTREE" rev-parse HEAD)"
bash "$SKILL_DIR/scripts/feature-tracker.sh" get-owner-receipt \
  --root "$ADOPT_TMP_DIR" --feature "$ADOPT_ID" >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" validate-tracker \
  --root "$ADOPT_TMP_DIR" >/dev/null

echo "ok: bagakit-feature-tracker state contract regression passed"
