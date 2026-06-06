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

bash "$SKILL_DIR/scripts/feature-tracker.sh" create-feature \
  --root "$TMP_DIR" \
  --title "Semantic task truth" \
  --goal "Execute only reviewed semantic task plans" \
  --workspace-mode proposal_only >/dev/null
FEATURE_ID="$(feature_tracker_feature_id_by_title "$TMP_DIR" "Semantic task truth")"

python3 - "$TMP_DIR" "$FEATURE_ID" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
feature_id = sys.argv[2]
feature_dir = root / ".bagakit" / "feature-tracker" / "features" / feature_id
tasks = json.loads((feature_dir / "tasks.json").read_text(encoding="utf-8"))
assert tasks["plan_status"] == "draft"
assert tasks["plan_revision"] == 0
assert tasks["tasks"] == []
assert not (feature_dir / "owner-receipt.json").exists()
PY

if bash "$SKILL_DIR/scripts/feature-tracker.sh" assign-feature-workspace \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --workspace-mode current_tree \
  >"$TMP_DIR/assign-before-plan.out" 2>"$TMP_DIR/assign-before-plan.err"; then
  echo "error: workspace assignment accepted a draft task plan" >&2
  exit 1
fi
grep -q "has no reviewed task plan" "$TMP_DIR/assign-before-plan.err"

if bash "$SKILL_DIR/scripts/feature-tracker.sh" start-task \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-001 \
  >"$TMP_DIR/start-before-plan.out" 2>"$TMP_DIR/start-before-plan.err"; then
  echo "error: task start accepted a draft task plan" >&2
  exit 1
fi
grep -q "has no reviewed task plan" "$TMP_DIR/start-before-plan.err"

PLAN_ONE="$TMP_DIR/plan-one.json"
cat >"$PLAN_ONE" <<'JSON'
{
  "schema": "bagakit.feature-task-plan.v1",
  "review": {
    "status": "approved",
    "evidence_ref": "review/task-plan-one"
  },
  "source_refs": ["request/semantic-task-truth"],
  "tasks": [
    {
      "id": "T-001",
      "title": "Materialize semantic task truth",
      "objective": "Replace draft task state with one reviewed executable plan.",
      "outcome": "The feature exposes reviewable task meaning before execution.",
      "acceptance": ["The task plan is revisioned and contains no placeholder."],
      "verification": [
        {
          "kind": "command",
          "ref": "true",
          "proves": "Feature Tracker public lifecycle behavior remains valid."
        }
      ],
      "source_refs": ["request/semantic-task-truth"],
      "supersedes": []
    }
  ]
}
JSON
printf '/plan-*.json\n/invalid-ref-*.json\n/tasks-before-*.json\n/owner-receipt.saved.json\n/*.saved\n/*.out\n/*.err\n' \
  >>"$TMP_DIR/.git/info/exclude"

bash "$SKILL_DIR/scripts/feature-tracker.sh" set-task-plan \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --tasks-file "$PLAN_ONE" --expected-revision 0 >/dev/null

if bash "$SKILL_DIR/scripts/feature-tracker.sh" set-task-plan \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --tasks-file "$PLAN_ONE" --expected-revision 0 \
  >"$TMP_DIR/stale-plan.out" 2>"$TMP_DIR/stale-plan.err"; then
  echo "error: stale task plan revision unexpectedly succeeded" >&2
  exit 1
fi
grep -q "task plan revision conflict" "$TMP_DIR/stale-plan.err"

assert_rejected_ref() {
  local case_id="$1"
  local field="$2"
  local invalid_ref="$3"
  local candidate="$TMP_DIR/invalid-ref-$case_id.json"
  python3 - "$PLAN_ONE" "$candidate" "$field" "$invalid_ref" <<'PY'
import json
import sys
from pathlib import Path, PurePosixPath

source = Path(sys.argv[1])
target = Path(sys.argv[2])
field = sys.argv[3]
invalid_ref = sys.argv[4]
payload = json.loads(source.read_text(encoding="utf-8"))
if field == "review":
    payload["review"]["evidence_ref"] = invalid_ref
elif field == "plan_source":
    payload["source_refs"] = [invalid_ref]
elif field == "task_source":
    payload["tasks"][0]["source_refs"] = [invalid_ref]
elif field == "verification":
    payload["tasks"][0]["verification"][0]["ref"] = invalid_ref
else:
    raise SystemExit(f"unknown field: {field}")
target.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
PY
  if bash "$SKILL_DIR/scripts/feature-tracker.sh" set-task-plan \
    --root "$TMP_DIR" --feature "$FEATURE_ID" --tasks-file "$candidate" --expected-revision 1 \
    >"$TMP_DIR/invalid-ref-$case_id.out" 2>"$TMP_DIR/invalid-ref-$case_id.err"; then
    echo "error: invalid repo reference unexpectedly passed: $case_id" >&2
    exit 1
  fi
  grep -Eq "repo-relative|escape the repository root|URI or drive-qualified" "$TMP_DIR/invalid-ref-$case_id.err"
}

assert_rejected_ref "posix-absolute" "review" "/tmp/review.md"
assert_rejected_ref "parent-escape" "plan_source" "../request.md"
assert_rejected_ref "file-uri" "task_source" "file:///tmp/request.md"
assert_rejected_ref "windows-drive" "verification" 'C:\review\check.md'
assert_rejected_ref "unc" "review" '\\server\share\review.md'

PLAN_TWO="$TMP_DIR/plan-two.json"
cat >"$PLAN_TWO" <<'JSON'
{
  "schema": "bagakit.feature-task-plan.v1",
  "review": {
    "status": "approved",
    "evidence_ref": "review/task-plan-two"
  },
  "source_refs": ["request/semantic-task-truth", "decision/split-plan"],
  "tasks": [
    {
      "id": "T-002",
      "title": "Execute revised semantic task",
      "objective": "Prove revised task lineage and owner receipt freshness.",
      "outcome": "The current task supersedes the earlier reviewed task without erasing lineage.",
      "acceptance": ["Revision two records T-001 as superseded."],
      "verification": [
        {
          "kind": "command",
          "ref": "true",
          "proves": "The reviewed Task gate has an executable proof."
        },
        {
          "kind": "owner_receipt",
          "ref": "owner-receipt.json",
          "proves": "The owner receipt reflects current lifecycle and task identity."
        }
      ],
      "source_refs": ["decision/split-plan"],
      "supersedes": ["T-001"]
    }
  ]
}
JSON

bash "$SKILL_DIR/scripts/feature-tracker.sh" set-task-plan \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --tasks-file "$PLAN_TWO" --expected-revision 1 >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" assign-feature-workspace \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --workspace-mode current_tree >/dev/null

READY_RECEIPT="$(bash "$SKILL_DIR/scripts/feature-tracker.sh" get-owner-receipt \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --json)"
python3 - "$TMP_DIR" "$FEATURE_ID" "$READY_RECEIPT" <<'PY'
import hashlib
import json
import sys
from pathlib import Path, PurePosixPath

root = Path(sys.argv[1])
feature_id = sys.argv[2]
receipt = json.loads(sys.argv[3])
feature_dir = root / ".bagakit" / "feature-tracker" / "features" / feature_id
tasks = json.loads((feature_dir / "tasks.json").read_text(encoding="utf-8"))
assert tasks["plan_status"] == "reviewed"
assert tasks["plan_revision"] == 2
assert tasks["supersedes_revision"] == 1
assert tasks["tasks"][0]["id"] == "T-002"
assert tasks["tasks"][0]["supersedes"] == ["T-001"]
assert tasks["plan_history"][-1]["superseded_task_ids"] == ["T-001"]
assert receipt["lifecycle_status"] == "ready"
assert receipt["continuation"] == "continue"
assert receipt["active_item_ids"] == []
assert receipt["blockers"] == []
assert len(receipt["semantic_revision"]) == 64
feature_ref_root = PurePosixPath(".bagakit", "feature-tracker", "features", feature_id)
assert receipt["evidence_refs"] == [
    str(feature_ref_root / "state.json"),
    str(feature_ref_root / "tasks.json"),
]
assert receipt["evidence_hashes"] == {
    ref: hashlib.sha256((root / ref).read_bytes()).hexdigest()
    for ref in receipt["evidence_refs"]
}
PY

python3 - "$TMP_DIR" "$FEATURE_ID" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1]) / ".bagakit" / "feature-tracker" / "features" / sys.argv[2] / "state.json"
payload = json.loads(path.read_text(encoding="utf-8"))
payload.setdefault("history", []).append({"action": "simulated_interrupted_write", "detail": "receipt not refreshed"})
path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
PY
if bash "$SKILL_DIR/scripts/feature-tracker.sh" get-owner-receipt \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --json \
  >"$TMP_DIR/interrupted-receipt.out" 2>"$TMP_DIR/interrupted-receipt.err"; then
  echo "error: receipt accepted state bytes written without a receipt refresh" >&2
  exit 1
fi
grep -q "owner receipt drift" "$TMP_DIR/interrupted-receipt.err"

bash "$SKILL_DIR/scripts/feature-tracker.sh" start-task \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-002 >/dev/null
ACTIVE_RECEIPT="$(bash "$SKILL_DIR/scripts/feature-tracker.sh" get-owner-receipt \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --json)"
python3 - "$ACTIVE_RECEIPT" <<'PY'
import json
import sys

receipt = json.loads(sys.argv[1])
assert receipt["lifecycle_status"] == "in_progress"
assert receipt["continuation"] == "continue"
assert receipt["active_item_ids"] == ["T-002"]
assert receipt["blockers"] == []
PY

ACTIVE_HEAD="$(git -C "$TMP_DIR" rev-parse HEAD)"
printf 'dirty\n' >>"$TMP_DIR/README.md"
if bash "$SKILL_DIR/scripts/feature-tracker.sh" unstart-task \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-002 --expected-head "$ACTIVE_HEAD" \
  >"$TMP_DIR/unstart-dirty.out" 2>"$TMP_DIR/unstart-dirty.err"; then
  echo "error: dirty feature execution worktree unexpectedly allowed task unstart" >&2
  exit 1
fi
grep -q "feature execution worktree is dirty" "$TMP_DIR/unstart-dirty.err"
git -C "$TMP_DIR" checkout -- README.md

if bash "$SKILL_DIR/scripts/feature-tracker.sh" unstart-task \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-002 --expected-head "$(printf '0%.0s' {1..40})" \
  >"$TMP_DIR/unstart-wrong-head.out" 2>"$TMP_DIR/unstart-wrong-head.err"; then
  echo "error: mismatched feature execution HEAD unexpectedly allowed task unstart" >&2
  exit 1
fi
grep -q "feature execution HEAD conflict" "$TMP_DIR/unstart-wrong-head.err"

ORPHAN_GATE_LOG="$TMP_DIR/.bagakit/feature-tracker/features/$FEATURE_ID/artifacts/gate-T-002-r2-9999.log"
mkdir -p "$(dirname "$ORPHAN_GATE_LOG")"
printf 'orphan physical gate evidence\n' >"$ORPHAN_GATE_LOG"
if bash "$SKILL_DIR/scripts/feature-tracker.sh" unstart-task \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-002 --expected-head "$ACTIVE_HEAD" \
  >"$TMP_DIR/unstart-orphan-log.out" 2>"$TMP_DIR/unstart-orphan-log.err"; then
  echo "error: task with an orphan physical gate log unexpectedly allowed task unstart" >&2
  exit 1
fi
grep -q "task has execution evidence and cannot be unstarted" "$TMP_DIR/unstart-orphan-log.err"
rm "$ORPHAN_GATE_LOG"

cp "$TMP_DIR/.bagakit/feature-tracker/features/$FEATURE_ID/tasks.json" \
  "$TMP_DIR/tasks-before-unstart-tamper.json"
python3 - "$TMP_DIR" "$FEATURE_ID" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
feature_id = sys.argv[2]
tasks_path = root / ".bagakit" / "feature-tracker" / "features" / feature_id / "tasks.json"
receipt_path = tasks_path.with_name("owner-receipt.json")
payload = json.loads(tasks_path.read_text(encoding="utf-8"))
payload["tasks"][0]["gate_result"] = "fail"
tasks_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
PY
if bash "$SKILL_DIR/scripts/feature-tracker.sh" unstart-task \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-002 --expected-head "$ACTIVE_HEAD" \
  >"$TMP_DIR/unstart-evidence.out" 2>"$TMP_DIR/unstart-evidence.err"; then
  echo "error: task with gate evidence unexpectedly allowed task unstart" >&2
  exit 1
fi
grep -q "owner receipt drift" "$TMP_DIR/unstart-evidence.err"
python3 - "$TMP_DIR" "$FEATURE_ID" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
feature_id = sys.argv[2]
feature_dir = root / ".bagakit" / "feature-tracker" / "features" / feature_id
tasks_path = feature_dir / "tasks.json"
payload = json.loads(tasks_path.read_text(encoding="utf-8"))
payload["tasks"][0]["gate_result"] = None
tasks_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
receipt_path = feature_dir / "owner-receipt.json"
receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
receipt["semantic_revision"] = "stale"
receipt_path.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
PY
if bash "$SKILL_DIR/scripts/feature-tracker.sh" unstart-task \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-002 --expected-head "$ACTIVE_HEAD" \
  >"$TMP_DIR/unstart-stale-receipt.out" 2>"$TMP_DIR/unstart-stale-receipt.err"; then
  echo "error: stale owner receipt unexpectedly allowed task unstart" >&2
  exit 1
fi
grep -q "owner receipt drift" "$TMP_DIR/unstart-stale-receipt.err"

mv "$TMP_DIR/unstart-stale-receipt.err" "$TMP_DIR/unstart-stale-receipt.saved"
mv "$TMP_DIR/.bagakit/feature-tracker/features/$FEATURE_ID/owner-receipt.json" \
  "$TMP_DIR/owner-receipt.saved.json"
if bash "$SKILL_DIR/scripts/feature-tracker.sh" unstart-task \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-002 --expected-head "$ACTIVE_HEAD" \
  >"$TMP_DIR/unstart-missing-receipt.out" 2>"$TMP_DIR/unstart-missing-receipt.err"; then
  echo "error: missing owner receipt unexpectedly allowed task unstart" >&2
  exit 1
fi
grep -q "missing persisted owner receipt" "$TMP_DIR/unstart-missing-receipt.err"
mv "$TMP_DIR/owner-receipt.saved.json" \
  "$TMP_DIR/.bagakit/feature-tracker/features/$FEATURE_ID/owner-receipt.json"
cp "$TMP_DIR/tasks-before-unstart-tamper.json" \
  "$TMP_DIR/.bagakit/feature-tracker/features/$FEATURE_ID/tasks.json"
printf '%s\n' "$ACTIVE_RECEIPT" \
  >"$TMP_DIR/.bagakit/feature-tracker/features/$FEATURE_ID/owner-receipt.json"
bash "$SKILL_DIR/scripts/feature-tracker.sh" unstart-task \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-002 --expected-head "$ACTIVE_HEAD" >/dev/null
UNSTARTED_RECEIPT="$(bash "$SKILL_DIR/scripts/feature-tracker.sh" get-owner-receipt \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --json)"
python3 - "$TMP_DIR" "$FEATURE_ID" "$UNSTARTED_RECEIPT" <<'PY'
import hashlib
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
feature_id = sys.argv[2]
receipt = json.loads(sys.argv[3])
feature_dir = root / ".bagakit" / "feature-tracker" / "features" / feature_id
state = json.loads((feature_dir / "state.json").read_text(encoding="utf-8"))
tasks = json.loads((feature_dir / "tasks.json").read_text(encoding="utf-8"))
assert state["status"] == "ready"
assert "current_task_id" not in state
assert state["history"][-1] == {"action": "task_unstarted", "detail": "T-002"}
assert tasks["tasks"][0]["status"] == "todo"
assert receipt["lifecycle_status"] == "ready"
assert receipt["active_item_ids"] == []
assert receipt["blockers"] == []
assert receipt["evidence_hashes"] == {
    ref: hashlib.sha256((root / ref).read_bytes()).hexdigest()
    for ref in receipt["evidence_refs"]
}
PY
bash "$SKILL_DIR/scripts/feature-tracker.sh" validate-tracker --root "$TMP_DIR" >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" start-task \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-002 >/dev/null

CONTROL_PATHS=(
  "$TMP_DIR/.bagakit/feature-tracker/features/$FEATURE_ID/state.json"
  "$TMP_DIR/.bagakit/feature-tracker/features/$FEATURE_ID/tasks.json"
  "$TMP_DIR/.bagakit/feature-tracker/features/$FEATURE_ID/owner-receipt.json"
  "$TMP_DIR/.bagakit/feature-tracker/index/features.json"
)
assert_finish_rejected_without_writes() {
  local case_id="$1"
  local expected_error="$2"
  shift 2
  local control_before
  control_before="$(shasum "${CONTROL_PATHS[@]}")"
  if bash "$SKILL_DIR/scripts/feature-tracker.sh" finish-task \
    --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-002 "$@" \
    >"$TMP_DIR/$case_id.out" 2>"$TMP_DIR/$case_id.err"; then
    echo "error: invalid finish-task case unexpectedly succeeded: $case_id" >&2
    exit 1
  fi
  grep -q -- "$expected_error" "$TMP_DIR/$case_id.err"
  test "$control_before" = "$(shasum "${CONTROL_PATHS[@]}")"
}

assert_finish_rejected_without_writes \
  blocked-missing-class "--blocked-reason-class is required" \
  --result blocked --blocked-reason "missing class must fail"
assert_finish_rejected_without_writes \
  blocked-missing-reason "--blocked-reason is required" \
  --result blocked --blocked-reason-class external_blocker
assert_finish_rejected_without_writes \
  blocked-blank-reason "--blocked-reason is required" \
  --result blocked --blocked-reason-class external_blocker --blocked-reason "   "
assert_finish_rejected_without_writes \
  blocked-invalid-parked "parked_context Task blocker requires runtime_role=frontdoor_context" \
  --result blocked --blocked-reason-class parked_context \
  --blocked-reason "standalone cannot park as frontdoor context"
assert_finish_rejected_without_writes \
  done-with-blocker "valid only with --result blocked" \
  --result done --blocked-reason-class internal_blocker \
  --blocked-reason "done must reject blocker args"
assert_finish_rejected_without_writes \
  done-with-class "valid only with --result blocked" \
  --result done --blocked-reason-class internal_blocker
assert_finish_rejected_without_writes \
  done-with-reason "valid only with --result blocked" \
  --result done --blocked-reason "done must reject a reason alone"

python3 - "$TMP_DIR" "$FEATURE_ID" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1]) / ".bagakit" / "feature-tracker" / "features" / sys.argv[2] / "owner-receipt.json"
payload = json.loads(path.read_text(encoding="utf-8"))
payload["semantic_revision"] = "stale"
path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
PY
if bash "$SKILL_DIR/scripts/feature-tracker.sh" get-owner-receipt \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --json \
  >"$TMP_DIR/stale-receipt.out" 2>"$TMP_DIR/stale-receipt.err"; then
  echo "error: stale persisted owner receipt unexpectedly passed" >&2
  exit 1
fi
grep -q "owner receipt drift" "$TMP_DIR/stale-receipt.err"

rm -f "$TMP_DIR/.bagakit/feature-tracker/features/$FEATURE_ID/owner-receipt.json"
if bash "$SKILL_DIR/scripts/feature-tracker.sh" get-owner-receipt \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --json \
  >"$TMP_DIR/missing-receipt.out" 2>"$TMP_DIR/missing-receipt.err"; then
  echo "error: missing persisted owner receipt unexpectedly passed" >&2
  exit 1
fi
grep -q "missing persisted owner receipt" "$TMP_DIR/missing-receipt.err"

bash "$SKILL_DIR/scripts/feature-tracker.sh" finish-task \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-002 --result blocked \
  --blocked-reason-class external_blocker \
  --blocked-reason "upstream capability is unavailable" >/dev/null
BLOCKED_RECEIPT="$(bash "$SKILL_DIR/scripts/feature-tracker.sh" get-owner-receipt \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --json)"
python3 - "$TMP_DIR" "$FEATURE_ID" "$BLOCKED_RECEIPT" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
feature_id = sys.argv[2]
receipt = json.loads(sys.argv[3])
feature_dir = root / ".bagakit" / "feature-tracker" / "features" / feature_id
state = json.loads((feature_dir / "state.json").read_text(encoding="utf-8"))
tasks = json.loads((feature_dir / "tasks.json").read_text(encoding="utf-8"))
index = json.loads(
    (root / ".bagakit" / "feature-tracker" / "index" / "features.json").read_text(encoding="utf-8")
)
index_entry = next(item for item in index["features"] if item["feat_id"] == feature_id)
assert tasks["tasks"][0]["status"] == "blocked"
assert tasks["tasks"][0]["last_blocker"] == {
    "class": "external_blocker",
    "reason": "upstream capability is unavailable",
}
assert state["status"] == "blocked"
assert "current_task_id" not in state
assert "blocked_reason_class" not in state
assert "blocked_reason" not in state
assert "blocked_task_id" not in state
assert index_entry["status"] == "blocked"
assert "blocked_reason_class" not in index_entry
assert receipt["lifecycle_status"] == "blocked"
assert receipt["continuation"] == "blocked"
assert receipt["active_item_ids"] == []
assert receipt["blockers"] == [{
    "item_id": "T-002",
    "class": "external_blocker",
    "reason": "upstream capability is unavailable",
}]
PY
bash "$SKILL_DIR/scripts/feature-tracker.sh" validate-tracker --root "$TMP_DIR" >/dev/null

bash "$SKILL_DIR/scripts/feature-tracker.sh" start-task \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-002 >/dev/null
python3 - "$TMP_DIR" "$FEATURE_ID" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
feature_id = sys.argv[2]
feature_dir = root / ".bagakit" / "feature-tracker" / "features" / feature_id
state = json.loads((feature_dir / "state.json").read_text(encoding="utf-8"))
receipt = json.loads((feature_dir / "owner-receipt.json").read_text(encoding="utf-8"))
index = json.loads(
    (root / ".bagakit" / "feature-tracker" / "index" / "features.json").read_text(encoding="utf-8")
)
index_entry = next(item for item in index["features"] if item["feat_id"] == feature_id)
assert state["status"] == "in_progress"
assert "blocked_reason_class" not in state
assert "blocked_reason" not in state
assert "blocked_task_id" not in state
assert index_entry["status"] == "in_progress"
assert "blocked_reason_class" not in index_entry
assert receipt["continuation"] == "continue"
assert receipt["active_item_ids"] == ["T-002"]
assert receipt["blockers"] == []
PY
BLOCKED_RESTART_HEAD="$(git -C "$TMP_DIR" rev-parse HEAD)"
if bash "$SKILL_DIR/scripts/feature-tracker.sh" unstart-task \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-002 --expected-head "$BLOCKED_RESTART_HEAD" \
  >"$TMP_DIR/unstart-blocked-restart.out" 2>"$TMP_DIR/unstart-blocked-restart.err"; then
  echo "error: restarted blocked task unexpectedly allowed task unstart" >&2
  exit 1
fi
grep -q "task has execution evidence and cannot be unstarted" \
  "$TMP_DIR/unstart-blocked-restart.err"
bash "$SKILL_DIR/scripts/feature-tracker.sh" finish-task \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-002 --result blocked \
  --blocked-reason-class internal_blocker \
  --blocked-reason "reviewed recovery plan is required" >/dev/null
python3 - "$TMP_DIR" "$FEATURE_ID" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
feature_id = sys.argv[2]
feature_dir = root / ".bagakit" / "feature-tracker" / "features" / feature_id
state = json.loads((feature_dir / "state.json").read_text(encoding="utf-8"))
tasks = json.loads((feature_dir / "tasks.json").read_text(encoding="utf-8"))
task = next(item for item in tasks["tasks"] if item["id"] == "T-002")
assert task["last_blocker"] == {
    "class": "internal_blocker",
    "reason": "reviewed recovery plan is required",
}
assert "blocked_reason_class" not in state
assert "blocked_reason" not in state
assert "blocked_task_id" not in state
PY

PLAN_THREE="$TMP_DIR/plan-three.json"
cat >"$PLAN_THREE" <<'JSON'
{
  "schema": "bagakit.feature-task-plan.v1",
  "review": {
    "status": "approved",
    "evidence_ref": "review/task-plan-three"
  },
  "source_refs": ["decision/recover-blocked-plan"],
  "tasks": [
    {
      "id": "T-003",
      "title": "Recover through a revised task",
      "objective": "Add a new task without rewriting the blocked task record.",
      "outcome": "The blocked task remains attributable while the reviewed plan provides a new route.",
      "acceptance": ["T-002 remains blocked and T-003 is the only new todo task."],
      "verification": [
        {
          "kind": "command",
          "ref": "true",
          "proves": "The reviewed Task gate has an executable proof."
        },
        {
          "kind": "artifact",
          "ref": "tasks.json",
          "proves": "Prior task status and evidence survive plan revision."
        }
      ],
      "source_refs": ["decision/recover-blocked-plan"],
      "supersedes": ["T-002"]
    }
  ]
}
JSON
bash "$SKILL_DIR/scripts/feature-tracker.sh" set-task-plan \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --tasks-file "$PLAN_THREE" --expected-revision 2 >/dev/null
python3 - "$TMP_DIR" "$FEATURE_ID" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
feature_id = sys.argv[2]
feature_dir = root / ".bagakit" / "feature-tracker" / "features" / feature_id
state = json.loads((feature_dir / "state.json").read_text(encoding="utf-8"))
tasks = json.loads((feature_dir / "tasks.json").read_text(encoding="utf-8"))
receipt = json.loads((feature_dir / "owner-receipt.json").read_text(encoding="utf-8"))
index = json.loads(
    (root / ".bagakit" / "feature-tracker" / "index" / "features.json").read_text(encoding="utf-8")
)
index_entry = next(item for item in index["features"] if item["feat_id"] == feature_id)
by_id = {task["id"]: task for task in tasks["tasks"]}
assert tasks["plan_revision"] == 3
assert by_id["T-002"]["status"] == "blocked"
assert by_id["T-002"]["superseded_by"] == ["T-003"]
assert by_id["T-002"]["last_blocker"] == {
    "class": "internal_blocker",
    "reason": "reviewed recovery plan is required",
}
assert by_id["T-003"]["status"] == "todo"
assert state["status"] == "ready"
assert "blocked_reason_class" not in state
assert "blocked_reason" not in state
assert "blocked_task_id" not in state
assert index_entry["status"] == "ready"
assert "blocked_reason_class" not in index_entry
assert receipt["continuation"] == "continue"
assert receipt["active_item_ids"] == []
assert receipt["blockers"] == []
PY
bash "$SKILL_DIR/scripts/feature-tracker.sh" validate-tracker --root "$TMP_DIR" >/dev/null

if bash "$SKILL_DIR/scripts/feature-tracker.sh" start-task \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-002 \
  >"$TMP_DIR/start-superseded.out" 2>"$TMP_DIR/start-superseded.err"; then
  echo "error: superseded blocked task unexpectedly restarted" >&2
  exit 1
fi
grep -q "not part of the current reviewed task plan" "$TMP_DIR/start-superseded.err"

PLAN_FOUR="$TMP_DIR/plan-four.json"
cat >"$PLAN_FOUR" <<'JSON'
{
  "schema": "bagakit.feature-task-plan.v1",
  "review": {
    "status": "approved",
    "evidence_ref": "review/task-plan-four"
  },
  "source_refs": ["decision/continue-revised-plan"],
  "tasks": [
    {
      "id": "T-004",
      "title": "Continue without repeating historical supersession",
      "objective": "Replace the current unexecuted task without superseding an older historical task again.",
      "outcome": "Revision four supersedes only revision three's current task.",
      "acceptance": ["T-002 remains preserved while only T-003 is newly superseded."],
      "verification": [
        {
          "kind": "command",
          "ref": "true",
          "proves": "The reviewed Task gate has an executable proof."
        },
        {
          "kind": "artifact",
          "ref": "tasks.json",
          "proves": "Current-plan membership and historical lineage remain distinct."
        }
      ],
      "source_refs": ["decision/continue-revised-plan"],
      "supersedes": ["T-003"]
    }
  ]
}
JSON
bash "$SKILL_DIR/scripts/feature-tracker.sh" set-task-plan \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --tasks-file "$PLAN_FOUR" --expected-revision 3 >/dev/null
python3 - "$TMP_DIR" "$FEATURE_ID" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
feature_id = sys.argv[2]
tasks_path = root / ".bagakit" / "feature-tracker" / "features" / feature_id / "tasks.json"
tasks = json.loads(tasks_path.read_text(encoding="utf-8"))
by_id = {task["id"]: task for task in tasks["tasks"]}
assert tasks["plan_revision"] == 4
assert tasks["plan_history"][-1]["task_ids"] == ["T-004"]
assert tasks["plan_history"][-1]["superseded_task_ids"] == ["T-003"]
assert set(by_id) == {"T-002", "T-004"}
assert by_id["T-002"]["status"] == "blocked"
assert by_id["T-002"]["superseded_by"] == ["T-003"]
assert by_id["T-004"]["status"] == "todo"
PY

PLAN_FIVE="$TMP_DIR/plan-five.json"
python3 - "$PLAN_FOUR" "$PLAN_FIVE" <<'PY'
import json
import sys
from pathlib import Path

source = Path(sys.argv[1])
target = Path(sys.argv[2])
payload = json.loads(source.read_text(encoding="utf-8"))
payload["review"]["evidence_ref"] = "review/task-plan-five"
payload["source_refs"] = ["decision/carry-historical-supersession"]
payload["tasks"][0]["title"] = "Retain historical supersession lineage"
payload["tasks"][0]["objective"] = "Keep an unexecuted current task while carrying its already reviewed historical supersession."
payload["tasks"][0]["outcome"] = "A later revision distinguishes carried lineage from newly removed tasks."
payload["tasks"][0]["acceptance"] = [
    "T-004 still carries T-003 while revision five removes no current task."
]
payload["tasks"][0]["source_refs"] = ["decision/carry-historical-supersession"]
target.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
PY
bash "$SKILL_DIR/scripts/feature-tracker.sh" set-task-plan \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --tasks-file "$PLAN_FIVE" --expected-revision 4 >/dev/null
python3 - "$TMP_DIR" "$FEATURE_ID" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
feature_id = sys.argv[2]
tasks_path = root / ".bagakit" / "feature-tracker" / "features" / feature_id / "tasks.json"
tasks = json.loads(tasks_path.read_text(encoding="utf-8"))
by_id = {task["id"]: task for task in tasks["tasks"]}
assert tasks["plan_revision"] == 5
assert tasks["plan_history"][-1]["task_ids"] == ["T-004"]
assert tasks["plan_history"][-1]["superseded_task_ids"] == []
assert tasks["plan_history"][-1]["supersedes_by_task"] == {"T-004": ["T-003"]}
assert by_id["T-004"]["supersedes"] == ["T-003"]
PY

PLAN_REUSE="$TMP_DIR/plan-reuse.json"
python3 - "$PLAN_FIVE" "$PLAN_REUSE" <<'PY'
import json
import sys
from pathlib import Path

source = Path(sys.argv[1])
target = Path(sys.argv[2])
payload = json.loads(source.read_text(encoding="utf-8"))
payload["tasks"][0]["id"] = "T-001"
payload["tasks"][0]["supersedes"] = ["T-004"]
target.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
PY
if bash "$SKILL_DIR/scripts/feature-tracker.sh" set-task-plan \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --tasks-file "$PLAN_REUSE" --expected-revision 5 \
  >"$TMP_DIR/reuse-historical.out" 2>"$TMP_DIR/reuse-historical.err"; then
  echo "error: historically retired task id was reused" >&2
  exit 1
fi
grep -q "cannot reactivate historical superseded tasks" "$TMP_DIR/reuse-historical.err"

PLAN_DROP="$TMP_DIR/plan-drop.json"
python3 - "$PLAN_FIVE" "$PLAN_DROP" <<'PY'
import json
import sys
from pathlib import Path

source = Path(sys.argv[1])
target = Path(sys.argv[2])
payload = json.loads(source.read_text(encoding="utf-8"))
payload["tasks"][0]["supersedes"] = []
target.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
PY
if bash "$SKILL_DIR/scripts/feature-tracker.sh" set-task-plan \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --tasks-file "$PLAN_DROP" --expected-revision 5 \
  >"$TMP_DIR/drop-lineage.out" 2>"$TMP_DIR/drop-lineage.err"; then
  echo "error: retained task dropped historical supersession lineage" >&2
  exit 1
fi
grep -q "must preserve its historical supersession lineage" "$TMP_DIR/drop-lineage.err"

cp "$TMP_DIR/.bagakit/feature-tracker/features/$FEATURE_ID/tasks.json" \
  "$TMP_DIR/tasks-before-lineage-tamper.json"
python3 - "$TMP_DIR" "$FEATURE_ID" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
feature_id = sys.argv[2]
tasks_path = root / ".bagakit" / "feature-tracker" / "features" / feature_id / "tasks.json"
payload = json.loads(tasks_path.read_text(encoding="utf-8"))
payload["plan_history"][-1]["supersedes_by_task"] = {"T-002": ["T-003"]}
tasks_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
PY
if bash "$SKILL_DIR/scripts/feature-tracker.sh" validate-tracker --root "$TMP_DIR" \
  >"$TMP_DIR/tampered-lineage.out" 2>"$TMP_DIR/tampered-lineage.err"; then
  echo "error: tampered supersession owner mapping passed validation" >&2
  exit 1
fi
grep -q "not canonical executable" "$TMP_DIR/tampered-lineage.err"
cp "$TMP_DIR/tasks-before-lineage-tamper.json" \
  "$TMP_DIR/.bagakit/feature-tracker/features/$FEATURE_ID/tasks.json"

python3 - "$TMP_DIR" "$FEATURE_ID" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
feature_id = sys.argv[2]
tasks_path = root / ".bagakit" / "feature-tracker" / "features" / feature_id / "tasks.json"
payload = json.loads(tasks_path.read_text(encoding="utf-8"))
payload["plan_history"][-1]["supersedes_by_task"] = {}
by_id = {task["id"]: task for task in payload["tasks"]}
by_id["T-004"]["supersedes"] = []
tasks_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
PY
if bash "$SKILL_DIR/scripts/feature-tracker.sh" validate-tracker --root "$TMP_DIR" \
  >"$TMP_DIR/cleared-lineage.out" 2>"$TMP_DIR/cleared-lineage.err"; then
  echo "error: cleared current supersession ownership passed validation" >&2
  exit 1
fi
grep -q "not canonical executable" "$TMP_DIR/cleared-lineage.err"
cp "$TMP_DIR/tasks-before-lineage-tamper.json" \
  "$TMP_DIR/.bagakit/feature-tracker/features/$FEATURE_ID/tasks.json"

python3 - "$TMP_DIR" "$FEATURE_ID" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1]) / ".bagakit" / "feature-tracker" / "features" / sys.argv[2] / "tasks.json"
payload = json.loads(path.read_text(encoding="utf-8"))
payload["version"] = 1
path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
PY
if bash "$SKILL_DIR/scripts/feature-tracker.sh" start-task \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-004 \
  >"$TMP_DIR/start-non-v2.out" 2>"$TMP_DIR/start-non-v2.err"; then
  echo "error: non-v2 reviewed task payload unexpectedly passed execution gate" >&2
  exit 1
fi
grep -q "has no reviewed task plan" "$TMP_DIR/start-non-v2.err"
python3 - "$TMP_DIR" "$FEATURE_ID" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1]) / ".bagakit" / "feature-tracker" / "features" / sys.argv[2] / "tasks.json"
payload = json.loads(path.read_text(encoding="utf-8"))
payload["version"] = 2
path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
PY

bash "$SKILL_DIR/scripts/feature-tracker.sh" validate-tracker --root "$TMP_DIR" >/dev/null
echo "ok: feature tracker semantic task truth passed"
