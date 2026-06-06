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
FEATURE_TRACKER_DIR="$ROOT/skills/harness/bagakit-feature-tracker"
FLOW_RUNNER_DIR="$ROOT/skills/harness/bagakit-flow-runner"
source "$ROOT/gate_validation/skills/harness/bagakit-feature-tracker/lib/feature-tracker-testlib.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

git -C "$TMP_DIR" init -q -b main
git -C "$TMP_DIR" config user.name "Bagakit"
git -C "$TMP_DIR" config user.email "bagakit@example.com"
printf '# demo\n' > "$TMP_DIR/README.md"
git -C "$TMP_DIR" add README.md
git -C "$TMP_DIR" commit -q -m "init"

bash "$FEATURE_TRACKER_DIR/scripts/feature-tracker.sh" initialize-tracker --root "$TMP_DIR"
bash "$FEATURE_TRACKER_DIR/scripts/feature-tracker.sh" create-feature --root "$TMP_DIR" --title "Flow source" --slug "flow-source" --goal "Drive flow" --workspace-mode proposal_only

FEATURE_ID="$(python3 - "$TMP_DIR" <<'PY'
import json
import sys
from pathlib import Path

index_path = Path(sys.argv[1]) / ".bagakit" / "feature-tracker" / "index" / "features.json"
payload = json.loads(index_path.read_text(encoding="utf-8"))
items = payload.get("features")
if not isinstance(items, list):
    raise SystemExit("missing features array")
print(items[0]["feat_id"])
PY
)"

TASK_PLAN="$TMP_DIR/flow-source-task-plan.json"
feature_tracker_write_reviewed_task_plan "$TASK_PLAN" "Provide reviewed execution truth for the Flow Runner source fixture."
bash "$FEATURE_TRACKER_DIR/scripts/feature-tracker.sh" set-task-plan --root "$TMP_DIR" --feature "$FEATURE_ID" --tasks-file "$TASK_PLAN" --expected-revision 0 >/dev/null
bash "$FEATURE_TRACKER_DIR/scripts/feature-tracker.sh" assign-feature-workspace --root "$TMP_DIR" --feature "$FEATURE_ID" --workspace-mode worktree >/dev/null

bash "$FLOW_RUNNER_DIR/scripts/flow-runner.sh" apply --root "$TMP_DIR"
bash "$FLOW_RUNNER_DIR/scripts/flow-runner.sh" ingest-feature-tracker --root "$TMP_DIR"

if bash "$FLOW_RUNNER_DIR/scripts/flow-runner.sh" add-item --root "$TMP_DIR" --item-id forged-tracker --title "Forged tracker" --source-kind feature-tracker --source-ref "feature-tracker:$FEATURE_ID" >/dev/null 2>&1; then
  echo "error: add-item unexpectedly accepted forged feature-tracker source ownership" >&2
  exit 1
fi

ACTIVATE_JSON="$TMP_DIR/activate.json"
bash "$FLOW_RUNNER_DIR/scripts/flow-runner.sh" activate-feature-tracker --root "$TMP_DIR" --feature "$FEATURE_ID" --json > "$ACTIVATE_JSON"
python3 - "$ACTIVATE_JSON" "$FEATURE_ID" <<'PY'
import json
import sys
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
feature_id = sys.argv[2]
assert payload["schema"] == "bagakit/flow-runner/feature-activation/v1"
assert payload["command"] == "activate-feature-tracker"
assert payload["feature_id"] == feature_id
assert payload["item_id"] == f"feature-{feature_id}"
assert payload["flow_next"]["recommended_action"] == "run_session"
PY

ITEM_ID="feature-${FEATURE_ID}"
NEXT_JSON="$TMP_DIR/next.json"
bash "$FLOW_RUNNER_DIR/scripts/flow-runner.sh" next --root "$TMP_DIR" --json > "$NEXT_JSON"
python3 - "$NEXT_JSON" <<'PY'
import json
import sys
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
assert payload["recommended_action"] == "run_session"
assert payload["session_contract"]["launch_bounded_session"] is True
assert payload["session_contract"]["archive_only_closeout"] is False
assert "BAGAKIT_FLOW_RUNNER_SKILL_DIR" in payload["checkpoint_request"]["command_example"]
PY

RESUME_JSON="$TMP_DIR/resume.json"
bash "$FLOW_RUNNER_DIR/scripts/flow-runner.sh" resume-candidates --root "$TMP_DIR" --json > "$RESUME_JSON"
python3 - "$RESUME_JSON" <<'PY'
import json
import sys
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
assert len(payload["live"]) == 1
assert payload["live"][0]["item_id"].startswith("feature-")
PY

bash "$FLOW_RUNNER_DIR/scripts/flow-runner.sh" snapshot --root "$TMP_DIR" --item "$ITEM_ID" --label "../../../escape" --json >/dev/null
test ! -d "$TMP_DIR/.bagakit/flow-runner/escape"
bash "$FLOW_RUNNER_DIR/scripts/flow-runner.sh" checkpoint --root "$TMP_DIR" --item "$ITEM_ID" --stage inspect --session-status progress --objective "Inspect" --attempted "Read runtime" --result "Ready" --next-action "Run one bounded session" --clean-state yes --task-ref T-001 --json >/dev/null
RECEIPTS="$TMP_DIR/.bagakit/flow-runner/items/$ITEM_ID/mutation-receipts.ndjson"
CHECKPOINTS="$TMP_DIR/.bagakit/flow-runner/items/$ITEM_ID/checkpoints.ndjson"
PROGRESS="$TMP_DIR/.bagakit/flow-runner/items/$ITEM_ID/progress.ndjson"
test -s "$RECEIPTS"
python3 - "$RECEIPTS" <<'PY'
import json
import sys
from pathlib import Path

entries = [json.loads(line) for line in Path(sys.argv[1]).read_text(encoding="utf-8").splitlines() if line.strip()]
assert entries
assert all(entry["schema"] == "bagakit/flow-runner/mutation-receipt/v1" for entry in entries)
assert all(entry["item_id"].startswith("feature-") for entry in entries)
assert all(entry["authority"] in {"runner_local", "source_mirror"} for entry in entries)
checkpoint_receipts = [entry for entry in entries if entry["mutation"] == "checkpoint"]
assert checkpoint_receipts
assert checkpoint_receipts[-1]["authority"] == "runner_local"
assert len({entry["receipt_id"] for entry in entries}) == len(entries)
PY
python3 - "$CHECKPOINTS" "$PROGRESS" <<'PY'
import json
import sys
from pathlib import Path

for path in sys.argv[1:]:
    records = [json.loads(line) for line in Path(path).read_text(encoding="utf-8").splitlines() if line.strip()]
    assert records[-1]["task_ref"] == "T-001"
PY

BEFORE_COUNTS="$(python3 - "$RECEIPTS" "$CHECKPOINTS" "$PROGRESS" <<'PY'
import sys
from pathlib import Path

print(",".join(str(len([line for line in Path(path).read_text(encoding="utf-8").splitlines() if line.strip()])) for path in sys.argv[1:]))
PY
)"
if bash "$FLOW_RUNNER_DIR/scripts/flow-runner.sh" checkpoint --root "$TMP_DIR" --item "$ITEM_ID" --stage bogus --session-status progress --objective "Bad" --attempted "Bad" --result "Bad" --next-action "Bad" --clean-state yes >/dev/null 2>&1; then
  echo "error: bogus checkpoint stage unexpectedly passed" >&2
  exit 1
fi
AFTER_COUNTS="$(python3 - "$RECEIPTS" "$CHECKPOINTS" "$PROGRESS" <<'PY'
import sys
from pathlib import Path

print(",".join(str(len([line for line in Path(path).read_text(encoding="utf-8").splitlines() if line.strip()])) for path in sys.argv[1:]))
PY
)"
if [[ "$BEFORE_COUNTS" != "$AFTER_COUNTS" ]]; then
  echo "error: invalid checkpoint stage changed protocol receipt files" >&2
  exit 1
fi

bash "$FLOW_RUNNER_DIR/scripts/flow-runner.sh" checkpoint --root "$TMP_DIR" --item "$ITEM_ID" --stage review --session-status gate_passed --objective "Review" --attempted "Check status" --result "Done" --next-action "Ask feature-tracker to close out" --clean-state yes --json >/dev/null

if bash "$FLOW_RUNNER_DIR/scripts/flow-runner.sh" checkpoint --root "$TMP_DIR" --item "$ITEM_ID" --stage review --session-status gate_passed --objective "Bad" --attempted "Bad" --result "Bad" --next-action "Bad" --clean-state yes --item-status completed >/dev/null 2>&1; then
  echo "error: tracker-sourced item unexpectedly accepted --item-status override" >&2
  exit 1
fi

STOP_JSON="$TMP_DIR/next-stop.json"
bash "$FLOW_RUNNER_DIR/scripts/flow-runner.sh" next --root "$TMP_DIR" --item "$ITEM_ID" --json > "$STOP_JSON"
python3 - "$STOP_JSON" <<'PY'
import json
import sys
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
assert payload["recommended_action"] == "stop"
assert payload["action_reason"] == "closeout_pending"
assert payload["session_contract"]["archive_only_closeout"] is False
PY

if bash "$FLOW_RUNNER_DIR/scripts/flow-runner.sh" archive-item --root "$TMP_DIR" --item "$ITEM_ID" >/dev/null 2>&1; then
  echo "error: feature-tracker sourced item unexpectedly archived from flow-runner" >&2
  exit 1
fi

bash "$FLOW_RUNNER_DIR/scripts/flow-runner.sh" open-incident --root "$TMP_DIR" --item "$ITEM_ID" --family review --summary "Need a decision" --recommended-resume stay_blocked >/dev/null
bash "$FLOW_RUNNER_DIR/scripts/flow-runner.sh" resolve-incident --root "$TMP_DIR" --item "$ITEM_ID" --incident "inc-does-not-exist" --close-note "noop" >/dev/null 2>&1 && {
  echo "error: resolving missing incident unexpectedly passed" >&2
  exit 1
} || true

bash "$FEATURE_TRACKER_DIR/scripts/feature-tracker.sh" discard-feature --root "$TMP_DIR" --feature "$FEATURE_ID" --reason stale \
  "${FEATURE_TRACKER_CLOSEOUT_REVIEW_ARGS[@]}" >/dev/null
bash "$FLOW_RUNNER_DIR/scripts/flow-runner.sh" ingest-feature-tracker --root "$TMP_DIR" >/dev/null
test -d "$TMP_DIR/.bagakit/flow-runner/archive/$ITEM_ID"
test ! -d "$TMP_DIR/.bagakit/flow-runner/items/$ITEM_ID"
ARCHIVE_RECEIPTS="$TMP_DIR/.bagakit/flow-runner/archive/$ITEM_ID/mutation-receipts.ndjson"
test -s "$ARCHIVE_RECEIPTS"
python3 - "$ARCHIVE_RECEIPTS" <<'PY'
import json
import sys
from pathlib import Path

entries = [json.loads(line) for line in Path(sys.argv[1]).read_text(encoding="utf-8").splitlines() if line.strip()]
assert entries[-1]["schema"] == "bagakit/flow-runner/mutation-receipt/v1"
assert entries[-1]["mutation"] == "state_normalization"
assert entries[-1]["authority"] == "source_mirror"
assert any(event["field_path"] == "paths" for event in entries[-1]["events"])
PY

bash "$FEATURE_TRACKER_DIR/scripts/feature-tracker.sh" create-feature --root "$TMP_DIR" --title "Blocked flow source" --slug "blocked-flow-source" --goal "Stay proposal only" --workspace-mode proposal_only >/dev/null
BLOCKED_FEATURE_ID="$(python3 - "$TMP_DIR" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
index_path = root / ".bagakit" / "feature-tracker" / "index" / "features.json"
payload = json.loads(index_path.read_text(encoding="utf-8"))
items = payload.get("features")
print(items[-1]["feat_id"])
PY
)"
if bash "$FLOW_RUNNER_DIR/scripts/flow-runner.sh" activate-feature-tracker --root "$TMP_DIR" --feature "$BLOCKED_FEATURE_ID" --json >/dev/null 2>&1; then
  echo "error: proposal_only feature unexpectedly activated into flow-runner" >&2
  exit 1
fi

bash "$FLOW_RUNNER_DIR/scripts/flow-runner.sh" validate --root "$TMP_DIR" >/dev/null

echo "ok: bagakit-flow-runner canonical smoke passed"
