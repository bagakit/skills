set -euo pipefail

ROOT="."
while [[ $# -gt 0 ]]; do
  case "$1" in
    --root) ROOT="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
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
PLAN="$TMP_DIR/task-dag-plan.json"
cat >"$PLAN" <<'JSON'
{
  "schema": "bagakit.feature-task-plan.v1",
  "review": {"status": "approved", "evidence_ref": "review/task-dag"},
  "source_refs": ["decision/task-dag"],
  "tasks": [
    {
      "id": "T-003",
      "depends_on": ["T-002", "T-001"],
      "title": "采集侧自适应 QPS:熔断 + 半开 + 爬升",
      "objective": "Integrate and verify the two independent outcomes.",
      "outcome": "The Feature closes over both branch results.",
      "acceptance": ["Both predecessor Tasks are done before integration starts."],
      "verification": [{"kind": "command", "ref": "true", "proves": "The integrated repository remains valid."}],
      "source_refs": ["decision/task-dag"],
      "supersedes": []
    },
    {
      "id": "T-002",
      "title": "Build branch two",
      "objective": "Close the second independent outcome.",
      "outcome": "Branch two is integrated and verified.",
      "acceptance": ["Branch two passes its Task gate."],
      "verification": [{"kind": "command", "ref": "true", "proves": "Branch two remains repository-valid."}],
      "source_refs": ["decision/task-dag"],
      "supersedes": []
    },
    {
      "id": "T-001",
      "depends_on": [],
      "title": "Build branch one",
      "objective": "Close the first independent outcome.",
      "outcome": "Branch one is integrated and verified.",
      "acceptance": ["Branch one passes its Task gate."],
      "verification": [{"kind": "command", "ref": "true", "proves": "Branch one remains repository-valid."}],
      "source_refs": ["decision/task-dag"],
      "supersedes": []
    }
  ]
}
JSON

bash "$SKILL_DIR/scripts/feature-tracker.sh" create-feature \
  --root "$TMP_DIR" --title "Task DAG feature" --slug "task-dag-feature" \
  --goal "Run independent Tasks in parallel and converge explicitly" \
  --workspace-mode current_tree --tasks-file "$PLAN" >/dev/null
FEATURE_ID="$(feature_tracker_feature_id_by_title "$TMP_DIR" "Task DAG feature")"
FEATURE_DIR="$TMP_DIR/.bagakit/feature-tracker/features/$FEATURE_ID"

SERVER_OUT="$TMP_DIR/status-server.out"
bash "$SKILL_DIR/scripts/feature-tracker.sh" serve-feature-status \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --port 0 --refresh-ms 1000 \
  >"$SERVER_OUT" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 30); do
  grep -q '^status_server: http://' "$SERVER_OUT" && break
  sleep 0.1
done
SERVER_URL="$(sed -n '1s/^status_server: //p' "$SERVER_OUT")"
test -n "$SERVER_URL"
python3 - "$SERVER_URL" <<'PY'
import sys
from urllib.request import urlopen

with urlopen(sys.argv[1], timeout=5) as response:
    body = response.read().decode("utf-8")
    assert response.status == 200
    assert "Live read-only view" in body
    assert "fetch(window.location.pathname + window.location.search" in body
    assert 'id="refresh-indicator"' in body
    assert 'id="topology-dialog"' in body
    assert "window.location.reload()" not in body
    assert "Task topology" in body
    assert "captureTopologyViews" in body
    assert "restoreTopologyViews" in body
    assert "captureBoardScroll" in body
    assert "restoreBoardScroll" in body
    assert "openTaskIds" in body
    assert "restoreOpenTasks" in body
    assert "scrollLeft" in body
print("ok: live status server")
PY
kill "$SERVER_PID"
wait "$SERVER_PID" 2>/dev/null || true

bash "$SKILL_DIR/scripts/feature-tracker.sh" show-feature-status \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --format html >"$TMP_DIR/task-topology.html"
python3 - "$TMP_DIR/task-topology.html" "$FEATURE_ID" <<'PY'
import sys
from pathlib import Path

html = Path(sys.argv[1]).read_text(encoding="utf-8")
feature_id = sys.argv[2]
assert "Task topology" in html
assert "Dependencies and convergence" in html
assert 'data-task-id="T-001"' in html
assert 'data-task-id="T-002"' in html
assert 'data-task-id="T-003"' in html
assert 'data-from="T-001" data-to="T-003"' in html
assert 'data-from="T-002" data-to="T-003"' in html
assert "采集侧自适应 QPS:熔断 + 半开 + 爬升" in html
assert '<text class="topology-node-title"' in html
assert html.count("<tspan") >= 2
assert "View fullscreen" in html
assert 'data-topology-zoom="out"' in html
assert 'data-topology-zoom="in"' in html
assert 'data-topology-zoom="reset"' in html
assert 'data-topology-zoom-level' in html
assert "Task runtime status" in html
assert "Gate pending" in html
assert f'id="{feature_id}-task-T-003"' in html
assert f'href="#{feature_id}-task-T-003"' in html
assert 'class="review-task-summary"' in html
assert 'class="review-task-toggle"' in html
assert 'class="review-task-fold-note"' in html
PY

python3 - "$FEATURE_DIR/tasks.json" <<'PY'
import json, sys
from pathlib import Path
tasks = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
by_id = {task["id"]: task for task in tasks["tasks"]}
assert by_id["T-001"]["depends_on"] == []
assert by_id["T-002"]["depends_on"] == []
assert by_id["T-003"]["depends_on"] == ["T-001", "T-002"]
PY

if bash "$SKILL_DIR/scripts/feature-tracker.sh" start-task \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-003 \
  >"$TMP_DIR/join-early.out" 2>"$TMP_DIR/join-early.err"; then
  echo "error: join Task started before its dependencies" >&2
  exit 1
fi
grep -F "unfinished dependencies: T-001, T-002" "$TMP_DIR/join-early.err" >/dev/null

bash "$SKILL_DIR/scripts/feature-tracker.sh" start-task \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-001 >/dev/null &
START_ONE_PID=$!
bash "$SKILL_DIR/scripts/feature-tracker.sh" start-task \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-002 >/dev/null &
START_TWO_PID=$!
wait "$START_ONE_PID"
wait "$START_TWO_PID"

# Flow Runner progress is an optional read-only overlay. Bind one receipt to
# the exact Task so the projection can show activity without changing Tracker
# state or inventing a second progress store.
FLOW_RUNNER_DIR="$ROOT/skills/harness/bagakit-flow-runner"
bash "$FLOW_RUNNER_DIR/scripts/flow-runner.sh" apply --root "$TMP_DIR" >/dev/null
bash "$FLOW_RUNNER_DIR/scripts/flow-runner.sh" activate-feature-tracker \
  --root "$TMP_DIR" --feature "$FEATURE_ID" >/dev/null
bash "$FLOW_RUNNER_DIR/scripts/flow-runner.sh" checkpoint \
  --root "$TMP_DIR" --item "feature-$FEATURE_ID" --stage inspect \
  --session-status progress --objective "Inspect branch one" \
  --attempted "Read the current implementation" --result "Progress recorded" \
  --next-action "Continue Task T-001" --clean-state yes --task-ref T-001 >/dev/null
bash "$FLOW_RUNNER_DIR/scripts/flow-runner.sh" checkpoint \
  --root "$TMP_DIR" --item "feature-$FEATURE_ID" --stage inspect \
  --session-status progress --objective "Inspect branch two" \
  --attempted "Read the second implementation" --result "Second progress recorded" \
  --next-action "Continue Task T-002" --clean-state yes --task-ref T-002 >/dev/null

bash "$SKILL_DIR/scripts/feature-tracker.sh" show-feature-status \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --format html >"$TMP_DIR/progress-overlay.html"
python3 - "$TMP_DIR/progress-overlay.html" <<'PY'
import sys
from pathlib import Path

html = Path(sys.argv[1]).read_text(encoding="utf-8")
assert "Execution update" in html
assert "<strong>Task T-001</strong>" in html
assert "Progress recorded" in html
assert "Continue Task T-001" in html
assert "<strong>Task T-002</strong>" in html
assert "Second progress recorded" in html
assert "Continue Task T-002" in html
assert "informational only; it does not change Task state or gate evidence" in html
PY

bash "$SKILL_DIR/scripts/feature-tracker.sh" get-feature \
  --root "$TMP_DIR" --feature "$FEATURE_ID" >"$TMP_DIR/active.json"
bash "$SKILL_DIR/scripts/feature-tracker.sh" get-owner-receipt \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --json >"$TMP_DIR/active-receipt.json"
python3 - "$TMP_DIR/active.json" "$TMP_DIR/active-receipt.json" <<'PY'
import json, sys
from pathlib import Path
feature = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
receipt = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
state = feature["state"]
assert state["status"] == "in_progress"
assert "current_task_id" not in state
assert "blocked_reason_class" not in state
assert feature["task_frontier"] == {
    "active": ["T-001", "T-002"], "runnable": [], "blocked": [],
    "waiting": ["T-003"], "done": [],
}
assert receipt["schema"] == "bagakit.execution-owner-receipt.v2"
assert receipt["active_item_ids"] == ["T-001", "T-002"]
assert receipt["blockers"] == []
PY

if bash "$SKILL_DIR/scripts/feature-tracker.sh" closeout-feature \
  --root "$TMP_DIR" --feature "$FEATURE_ID" \
  >"$TMP_DIR/ambiguous-closeout.out" 2>"$TMP_DIR/ambiguous-closeout.err"; then
  echo "error: closeout selected one of multiple active Tasks implicitly" >&2
  exit 1
fi
grep -F -- "--task is required when multiple Tasks are active" \
  "$TMP_DIR/ambiguous-closeout.err" >/dev/null
grep -F -- "--task T-001" "$TMP_DIR/ambiguous-closeout.out" >/dev/null
grep -F -- "--task T-002" "$TMP_DIR/ambiguous-closeout.out" >/dev/null

bash "$SKILL_DIR/scripts/feature-tracker.sh" run-task-gate \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-001 >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" finish-task \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-001 --result blocked \
  --blocked-reason-class external_blocker \
  --blocked-reason "branch one awaits an external input" >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" get-feature \
  --root "$TMP_DIR" --feature "$FEATURE_ID" >"$TMP_DIR/partially-blocked.json"
python3 - "$TMP_DIR/partially-blocked.json" <<'PY'
import json, sys
from pathlib import Path
feature = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
assert feature["state"]["status"] == "in_progress"
assert feature["task_frontier"]["active"] == ["T-002"]
assert feature["task_frontier"]["blocked"] == ["T-001"]
assert feature["task_frontier"]["waiting"] == ["T-003"]
PY

bash "$SKILL_DIR/scripts/feature-tracker.sh" run-task-gate \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-002 >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" finish-task \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-002 --result done >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" get-owner-receipt \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --json >"$TMP_DIR/stalled-receipt.json"
python3 - "$FEATURE_DIR/state.json" "$TMP_DIR/stalled-receipt.json" <<'PY'
import json, sys
from pathlib import Path
state = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
receipt = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
assert state["status"] == "blocked"
assert receipt["continuation"] == "blocked"
assert receipt["active_item_ids"] == []
assert receipt["blockers"] == [{
    "item_id": "T-001", "class": "external_blocker",
    "reason": "branch one awaits an external input",
}]
PY

bash "$SKILL_DIR/scripts/feature-tracker.sh" start-task \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-001 >/dev/null
if bash "$SKILL_DIR/scripts/feature-tracker.sh" finish-task \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-001 --result done \
  >"$TMP_DIR/stale-gate.out" 2>"$TMP_DIR/stale-gate.err"; then
  echo "error: restarted blocked Task reused a stale passing gate" >&2
  exit 1
fi
grep -F "cannot finish task as done without gate pass" "$TMP_DIR/stale-gate.err" >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" run-task-gate \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-001 >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" finish-task \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-001 --result done >/dev/null

bash "$SKILL_DIR/scripts/feature-tracker.sh" get-feature \
  --root "$TMP_DIR" --feature "$FEATURE_ID" >"$TMP_DIR/join-ready.json"
python3 - "$TMP_DIR/join-ready.json" <<'PY'
import json, sys
from pathlib import Path
feature = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
assert feature["state"]["status"] == "ready"
assert feature["task_frontier"]["runnable"] == ["T-003"]
assert feature["task_frontier"]["done"] == ["T-001", "T-002"]
PY

bash "$SKILL_DIR/scripts/feature-tracker.sh" start-task \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-003 >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" run-task-gate \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-003 >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" finish-task \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-003 --result done >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" validate-tracker --root "$TMP_DIR" >/dev/null
python3 - "$FEATURE_DIR/state.json" <<'PY'
import json, sys
from pathlib import Path
assert json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))["status"] == "done"
PY

CYCLE_PLAN="$TMP_DIR/cycle-plan.json"
cat >"$CYCLE_PLAN" <<'JSON'
{
  "schema": "bagakit.feature-task-plan.v1",
  "review": {"status": "approved", "evidence_ref": "review/cycle"},
  "source_refs": ["decision/cycle"],
  "tasks": [
    {
      "id": "T-001", "depends_on": ["T-002"], "title": "Cycle one",
      "objective": "Prove cycle rejection.", "outcome": "The plan is rejected.",
      "acceptance": ["Cycle is rejected."],
      "verification": [{"kind": "command", "ref": "true", "proves": "The reviewed Task gate has an executable proof."}, {"kind": "artifact", "ref": "tasks.json", "proves": "No cyclic plan is stored."}],
      "source_refs": ["decision/cycle"], "supersedes": []
    },
    {
      "id": "T-002", "depends_on": ["T-001"], "title": "Cycle two",
      "objective": "Complete the invalid cycle.", "outcome": "The plan is rejected.",
      "acceptance": ["Cycle is rejected."],
      "verification": [{"kind": "command", "ref": "true", "proves": "The reviewed Task gate has an executable proof."}, {"kind": "artifact", "ref": "tasks.json", "proves": "No cyclic plan is stored."}],
      "source_refs": ["decision/cycle"], "supersedes": []
    }
  ]
}
JSON

bash "$SKILL_DIR/scripts/feature-tracker.sh" create-feature \
  --root "$TMP_DIR" --title "Cycle proposal" --slug "cycle-proposal" \
  --goal "Reject a cyclic Task plan" --workspace-mode proposal_only >/dev/null
CYCLE_ID="$(feature_tracker_feature_id_by_title "$TMP_DIR" "Cycle proposal")"
CYCLE_TASKS="$TMP_DIR/.bagakit/feature-tracker/features/$CYCLE_ID/tasks.json"
CYCLE_TASKS_SHA="$(shasum "$CYCLE_TASKS" | awk '{print $1}')"
UNKNOWN_PLAN="$TMP_DIR/unknown-dependency-plan.json"
python3 - "$CYCLE_PLAN" "$UNKNOWN_PLAN" <<'PY'
import json, sys
from pathlib import Path
payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
payload["tasks"][0]["depends_on"] = ["T-999"]
payload["tasks"][1]["depends_on"] = []
Path(sys.argv[2]).write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
PY
if bash "$SKILL_DIR/scripts/feature-tracker.sh" set-task-plan \
  --root "$TMP_DIR" --feature "$CYCLE_ID" --tasks-file "$UNKNOWN_PLAN" \
  --expected-revision 0 >"$TMP_DIR/unknown.out" 2>"$TMP_DIR/unknown.err"; then
  echo "error: unknown Task dependency was accepted" >&2
  exit 1
fi
grep -F "T-999" "$TMP_DIR/unknown.err" >/dev/null
test "$CYCLE_TASKS_SHA" = "$(shasum "$CYCLE_TASKS" | awk '{print $1}')"

if bash "$SKILL_DIR/scripts/feature-tracker.sh" set-task-plan \
  --root "$TMP_DIR" --feature "$CYCLE_ID" --tasks-file "$CYCLE_PLAN" \
  --expected-revision 0 >"$TMP_DIR/cycle.out" 2>"$TMP_DIR/cycle.err"; then
  echo "error: cyclic Task plan was accepted" >&2
  exit 1
fi
grep -F "cycle" "$TMP_DIR/cycle.err" >/dev/null
test "$CYCLE_TASKS_SHA" = "$(shasum "$CYCLE_TASKS" | awk '{print $1}')"

echo "ok: bagakit-feature-tracker Task DAG"
