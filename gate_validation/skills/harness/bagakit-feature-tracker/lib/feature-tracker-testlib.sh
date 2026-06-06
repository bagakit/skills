FEATURE_TRACKER_CLOSEOUT_REVIEW_ARGS=(
  --documentation-disposition not_applicable
  --documentation-rationale "The fixture changes no project documentation contract."
  --learning-disposition no_reusable_learning
  --learning-rationale "The fixture exercises an already-owned lifecycle invariant."
  --promotion-disposition not_needed
  --promotion-rationale "The fixture produces no reusable project learning."
)

feature_tracker_init_temp_repo() {
  local repo_root="$1"
  git -C "$repo_root" init -q -b main
  git -C "$repo_root" config user.name "Bagakit"
  git -C "$repo_root" config user.email "bagakit@example.com"
  printf '# demo\n' > "$repo_root/README.md"
  git -C "$repo_root" add README.md
  git -C "$repo_root" commit -q -m "init"
}

feature_tracker_write_reviewed_task_plan() {
  local target="$1"
  local objective="${2:-Exercise the feature tracker lifecycle.}"
  mkdir -p "$(dirname "$target")"
  cat > "$target" <<JSON
{
  "schema": "bagakit.feature-task-plan.v1",
  "review": {
    "status": "approved",
    "evidence_ref": "test/reviewed-task-plan"
  },
  "source_refs": ["test/feature-tracker-fixture"],
  "tasks": [
    {
      "id": "T-001",
      "title": "Execute reviewed fixture task",
      "objective": "$objective",
      "outcome": "The public feature lifecycle completes with semantic task truth.",
      "acceptance": ["The fixture reaches its expected public lifecycle state."],
      "verification": [
        {
          "kind": "command",
          "ref": "true",
          "proves": "The public lifecycle behavior under test passes."
        }
      ],
      "source_refs": ["test/feature-tracker-fixture"],
      "supersedes": []
    }
  ]
}
JSON
}

feature_tracker_feature_id_by_title() {
  local repo_root="$1"
  local title="$2"
  python3 - "$repo_root" "$title" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
title = sys.argv[2]
index_path = root / ".bagakit" / "feature-tracker" / "index" / "features.json"
payload = json.loads(index_path.read_text(encoding="utf-8"))
for item in payload.get("features", []):
    if item.get("title") == title:
        print(item["feat_id"])
        break
else:
    raise SystemExit(f"feature not found by title: {title}")
PY
}

feature_tracker_worktree_path() {
  local repo_root="$1"
  local feature_id="$2"
  python3 - "$repo_root" "$feature_id" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
feature_id = sys.argv[2]
state_path = root / ".bagakit" / "feature-tracker" / "features" / feature_id / "state.json"
state = json.loads(state_path.read_text(encoding="utf-8"))
print(root / state["worktree_path"])
PY
}

feature_tracker_worktree_branch() {
  local repo_root="$1"
  local feature_id="$2"
  python3 - "$repo_root" "$feature_id" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
feature_id = sys.argv[2]
state_path = root / ".bagakit" / "feature-tracker" / "features" / feature_id / "state.json"
state = json.loads(state_path.read_text(encoding="utf-8"))
print(state["branch"])
PY
}

feature_tracker_set_task_command() {
  local repo_root="$1"
  local feature_id="$2"
  local command="$3"
  python3 - "$repo_root" "$feature_id" "$command" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
feature_id = sys.argv[2]
command = sys.argv[3]
tasks_path = root / ".bagakit" / "feature-tracker" / "features" / feature_id / "tasks.json"
payload = json.loads(tasks_path.read_text(encoding="utf-8"))
current_ids = set(payload["plan_history"][-1]["task_ids"])
current = [task for task in payload["tasks"] if task.get("id") in current_ids]
if len(current) != 1:
    raise SystemExit("fixture requires exactly one current task")
current[0]["verification"] = [{
    "kind": "command",
    "ref": command,
    "proves": "The command runs from the assigned Feature workspace.",
}]
tasks_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY
}

feature_tracker_complete_reviewed_feature() {
  local repo_root="$1"
  local skill_dir="$2"
  local feature_id="$3"
  local task_plan="$4"
  bash "$skill_dir/scripts/feature-tracker.sh" set-task-plan \
    --root "$repo_root" --feature "$feature_id" --tasks-file "$task_plan" --expected-revision 0 >/dev/null
  bash "$skill_dir/scripts/feature-tracker.sh" assign-feature-workspace \
    --root "$repo_root" --feature "$feature_id" --workspace-mode current_tree >/dev/null
  bash "$skill_dir/scripts/feature-tracker.sh" start-task \
    --root "$repo_root" --feature "$feature_id" --task T-001 >/dev/null
  bash "$skill_dir/scripts/feature-tracker.sh" run-task-gate \
    --root "$repo_root" --feature "$feature_id" --task T-001 >/dev/null
  bash "$skill_dir/scripts/feature-tracker.sh" finish-task \
    --root "$repo_root" --feature "$feature_id" --task T-001 --result done >/dev/null
}
