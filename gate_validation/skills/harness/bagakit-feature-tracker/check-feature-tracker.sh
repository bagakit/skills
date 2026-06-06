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

bash "$SKILL_DIR/scripts/feature-tracker.sh" initialize-tracker --root "$TMP_DIR"
python3 - "$SKILL_DIR" <<'PY'
import argparse
import importlib.util
import re
import sys
from pathlib import Path

skill_dir = Path(sys.argv[1])
spec = importlib.util.spec_from_file_location(
    "bagakit_feature_tracker",
    skill_dir / "scripts" / "feature-tracker.py",
)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
parser = module.build_parser()
subparsers = next(
    action for action in parser._actions if isinstance(action, argparse._SubParsersAction)
)
runtime_commands = set(subparsers.choices)
inventory = (skill_dir / "references" / "skill-cli.toml").read_text(encoding="utf-8")
declared_commands = set(
    re.findall(r'\[\[command\]\]\s+name = "([^"]+)"', inventory)
)
assert declared_commands == runtime_commands, (declared_commands, runtime_commands)
PY
ISSUER_NAMESPACE_BEFORE="$(python3 - "$TMP_DIR" <<'PY'
import json
import sys
from pathlib import Path

issuer_path = Path(sys.argv[1]) / ".bagakit" / "feature-tracker" / "local" / "issuer.json"
payload = json.loads(issuer_path.read_text(encoding="utf-8"))
print(payload["namespace"])
PY
)"
bash "$SKILL_DIR/scripts/feature-tracker.sh" rekey-local-issuer --root "$TMP_DIR" >/dev/null
ISSUER_NAMESPACE_AFTER="$(python3 - "$TMP_DIR" <<'PY'
import json
import sys
from pathlib import Path

issuer_path = Path(sys.argv[1]) / ".bagakit" / "feature-tracker" / "local" / "issuer.json"
payload = json.loads(issuer_path.read_text(encoding="utf-8"))
print(payload["namespace"])
PY
)"
test "$ISSUER_NAMESPACE_BEFORE" != "$ISSUER_NAMESPACE_AFTER"
bash "$SKILL_DIR/scripts/feature-tracker.sh" create-feature --root "$TMP_DIR" --title "Demo feature" --slug "demo-feature" --goal "Ship demo" --workspace-mode proposal_only

FEATURE_ID="$(feature_tracker_feature_id_by_title "$TMP_DIR" "Demo feature")"
FAMILY_STATE="$TMP_DIR/.bagakit/feature-tracker/features/$FEATURE_ID/state.json"
FAMILY_TASKS="$TMP_DIR/.bagakit/feature-tracker/features/$FEATURE_ID/tasks.json"
FAMILY_INDEX="$TMP_DIR/.bagakit/feature-tracker/index/features.json"
FAMILY_ISSUER="$TMP_DIR/.bagakit/feature-tracker/local/issuer.json"
test ! -e "$TMP_DIR/.bagakit/feature-tracker/features/$FEATURE_ID/owner-receipt.json"
FAMILY_STATE_SHA="$(shasum "$FAMILY_STATE" | awk '{print $1}')"
FAMILY_TASKS_SHA="$(shasum "$FAMILY_TASKS" | awk '{print $1}')"
FAMILY_INDEX_SHA="$(shasum "$FAMILY_INDEX" | awk '{print $1}')"
FAMILY_ISSUER_SHA="$(shasum "$FAMILY_ISSUER" | awk '{print $1}')"
bash "$SKILL_DIR/scripts/feature-tracker.sh" create-feature \
  --root "$TMP_DIR" \
  --title "Demo feature extension" \
  --slug "Demo Feature" \
  --goal "Extend the same stable goal through Tasks" \
  --workspace-mode current_tree >"$TMP_DIR/family-reuse.out"
grep -F "reuse: active feature family demo-feature => $FEATURE_ID" "$TMP_DIR/family-reuse.out" >/dev/null
grep -F "feature_id: $FEATURE_ID" "$TMP_DIR/family-reuse.out" >/dev/null
test "$FAMILY_STATE_SHA" = "$(shasum "$FAMILY_STATE" | awk '{print $1}')"
test "$FAMILY_TASKS_SHA" = "$(shasum "$FAMILY_TASKS" | awk '{print $1}')"
test "$FAMILY_INDEX_SHA" = "$(shasum "$FAMILY_INDEX" | awk '{print $1}')"
test "$FAMILY_ISSUER_SHA" = "$(shasum "$FAMILY_ISSUER" | awk '{print $1}')"
TASK_PLAN_JSON="$TMP_DIR/.bagakit/feature-tracker/artifacts/reviewed-task-plan.json"
feature_tracker_write_reviewed_task_plan "$TASK_PLAN_JSON" "Ship the demo feature through a reviewed task plan with <literal> input."
if bash "$SKILL_DIR/scripts/feature-tracker.sh" create-feature \
  --root "$TMP_DIR" \
  --title "Demo feature reviewed extension" \
  --slug "demo-feature" \
  --goal "Do not silently merge reviewed Task semantics" \
  --workspace-mode current_tree \
  --tasks-file "$TASK_PLAN_JSON" >"$TMP_DIR/family-reviewed.out" 2>"$TMP_DIR/family-reviewed.err"; then
  echo "same-family reviewed create unexpectedly succeeded" >&2
  exit 1
fi
grep -F "active feature family already exists" "$TMP_DIR/family-reviewed.err" >/dev/null
grep -F "set-task-plan" "$TMP_DIR/family-reviewed.err" >/dev/null

HANDOFF_JSON="$TMP_DIR/.bagakit/planning-entry/handoffs/demo-approved.json"
mkdir -p "$(dirname "$HANDOFF_JSON")"
cat >"$HANDOFF_JSON" <<'JSON'
{
  "schema": "bagakit/planning-entry-handoff/v1",
  "handoff_id": "peh-demo-approved",
  "status": "approved",
  "producer_surface": "bagakit-brainstorm",
  "title": "Handoff feature",
  "goal": "Materialize approved planning-entry handoff into canonical tracker truth",
  "objective": "Turn one approved planning-entry handoff into tracker state without scraping brainstorm prose.",
  "demand_summary": "The request was clarified upstream and is ready for canonical feature planning.",
  "success_criteria": [
    "A new tracker feature is created from the approved handoff."
  ],
  "constraints": [
    "Do not create a second planning SSOT."
  ],
  "clarification_status": "complete",
  "discussion_clear": true,
  "user_review_status": "approved",
  "recommended_route": {
    "scene": "ambiguous_delivery",
    "recipe_id": "planning-entry-brainstorm-to-feature"
  },
  "source_artifacts": [
    ".bagakit/brainstorm/archive/demo/input_and_qa.md",
    ".bagakit/brainstorm/archive/demo/expert_forum.md",
    ".bagakit/brainstorm/archive/demo/outcome_and_handoff.md"
  ],
  "source_refs": [
    ".bagakit/brainstorm/archive/demo/input_and_qa.md#Q-001",
    ".bagakit/brainstorm/archive/demo/expert_forum.md#Decision-Target-And-Exit",
    ".bagakit/brainstorm/archive/demo/outcome_and_handoff.md#Outcome-Summary"
  ]
}
JSON

bash "$SKILL_DIR/scripts/feature-tracker.sh" create-feature-from-planning-entry-handoff --root "$TMP_DIR" --handoff "$HANDOFF_JSON" --workspace-mode proposal_only >/dev/null
if bash "$SKILL_DIR/scripts/feature-tracker.sh" create-feature-from-planning-entry-handoff \
  --root "$TMP_DIR" \
  --handoff "$HANDOFF_JSON" \
  --workspace-mode proposal_only >"$TMP_DIR/family-handoff.out" 2>"$TMP_DIR/family-handoff.err"; then
  echo "same-family planning-entry handoff unexpectedly succeeded" >&2
  exit 1
fi
grep -F "existing active feature family" "$TMP_DIR/family-handoff.err" >/dev/null
grep -F "route the extension through its Task plan" "$TMP_DIR/family-handoff.err" >/dev/null

python3 - "$TMP_DIR" "$HANDOFF_JSON" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
handoff_path = Path(sys.argv[2])
index_path = root / ".bagakit" / "feature-tracker" / "index" / "features.json"
payload = json.loads(index_path.read_text(encoding="utf-8"))
features = payload.get("features")
if not isinstance(features, list):
    raise SystemExit("missing features array")
assert len(features) == 2
match = next(item for item in features if item["title"] == "Handoff feature")
feat_id = match["feat_id"]
proposal_path = root / ".bagakit" / "feature-tracker" / "features" / feat_id / "proposal.md"
proposal_text = proposal_path.read_text(encoding="utf-8")
state_path = root / ".bagakit" / "feature-tracker" / "features" / feat_id / "state.json"
state_payload = json.loads(state_path.read_text(encoding="utf-8"))
assert handoff_path.exists()
assert proposal_path.exists()
assert "peh-demo-approved" in proposal_text
assert "The request was clarified upstream and is ready for canonical feature planning." in proposal_text
assert "planning-entry-brainstorm-to-feature" in proposal_text
assert "## Principle Layer" in proposal_text
assert "- What: Turn one approved planning-entry handoff into tracker state without scraping brainstorm prose." in proposal_text
assert "- Why: The request was clarified upstream and is ready for canonical feature planning." in proposal_text
assert "## Transfer Checks" in proposal_text
assert any(item.get("action") == "planning_entry_handoff_applied" for item in state_payload.get("history", []))
tasks_path = root / ".bagakit" / "feature-tracker" / "features" / feat_id / "tasks.json"
tasks_payload = json.loads(tasks_path.read_text(encoding="utf-8"))
assert tasks_payload["plan_status"] == "draft"
assert tasks_payload["tasks"] == []
PY

bash "$SKILL_DIR/scripts/feature-tracker.sh" show-feature-dag --root "$TMP_DIR" --json >"$TMP_DIR/feature-dag.json"
python3 - "$TMP_DIR/feature-dag.json" "$FEATURE_ID" <<'PY'
import json
import sys
from pathlib import Path

dag_path = Path(sys.argv[1])
feature_id = sys.argv[2]
dag_payload = json.loads(dag_path.read_text(encoding="utf-8"))
assert feature_id in [item["feat_id"] for item in dag_payload["features"]]
assert any(feature_id in layer["feat_ids"] for layer in dag_payload["layers"])
PY
test ! -e "$TMP_DIR/.bagakit/feature-tracker/index/FEATURES_DAG.json"

bash "$SKILL_DIR/scripts/feature-tracker.sh" set-task-plan --root "$TMP_DIR" --feature "$FEATURE_ID" --tasks-file "$TASK_PLAN_JSON" --expected-revision 0
bash "$SKILL_DIR/scripts/feature-tracker.sh" assign-feature-workspace --root "$TMP_DIR" --feature "$FEATURE_ID" --workspace-mode current_tree
bash "$SKILL_DIR/scripts/feature-tracker.sh" start-task --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-001
bash "$SKILL_DIR/scripts/feature-tracker.sh" show-feature-status --root "$TMP_DIR" --feature "$FEATURE_ID" --json >/dev/null
STATUS_PAGE_REL=".tmp/feature-tracker/status.html"
STATUS_PAGE="$TMP_DIR/$STATUS_PAGE_REL"
bash "$SKILL_DIR/scripts/feature-tracker.sh" show-feature-status --root "$TMP_DIR" --format html --output "$STATUS_PAGE_REL" >"$TMP_DIR/feature-status-page.out"
grep -F "status_page: file://" "$TMP_DIR/feature-status-page.out" >/dev/null
test -f "$STATUS_PAGE"
bash "$SKILL_DIR/scripts/feature-tracker.sh" show-feature-status --root "$TMP_DIR" --feature "$FEATURE_ID" --format html >"$TMP_DIR/feature-status-detail.html"
if bash "$SKILL_DIR/scripts/feature-tracker.sh" show-feature-status --root "$TMP_DIR" --output "$STATUS_PAGE_REL" >"$TMP_DIR/feature-status-invalid-format.out" 2>"$TMP_DIR/feature-status-invalid-format.err"; then
  echo "human status output unexpectedly accepted non-HTML format" >&2
  exit 1
fi
grep -F -- "--output requires --format html" "$TMP_DIR/feature-status-invalid-format.err" >/dev/null
if bash "$SKILL_DIR/scripts/feature-tracker.sh" show-feature-status --root "$TMP_DIR" --format html --output ".bagakit/feature-tracker/status.html" >"$TMP_DIR/feature-status-invalid-path.out" 2>"$TMP_DIR/feature-status-invalid-path.err"; then
  echo "human status output unexpectedly wrote inside tracker state" >&2
  exit 1
fi
grep -F "human status output must stay outside tracker state" "$TMP_DIR/feature-status-invalid-path.err" >/dev/null
python3 - "$TMP_DIR" "$FEATURE_ID" <<'PY'
from html.parser import HTMLParser
import re
import sys
from pathlib import Path

class ClaimDraftParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.in_claim = False
        self.current = []
        self.messages = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "textarea" and "claim-draft" in attrs.get("class", "").split():
            self.in_claim = True
            self.current = []

    def handle_data(self, data):
        if self.in_claim:
            self.current.append(data)

    def handle_endtag(self, tag):
        if tag == "textarea" and self.in_claim:
            self.messages.append("".join(self.current))
            self.in_claim = False

root = Path(sys.argv[1])
feature_id = sys.argv[2]
overview = (root / ".tmp" / "feature-tracker" / "status.html").read_text(encoding="utf-8")
detail = (root / "feature-status-detail.html").read_text(encoding="utf-8")

assert overview.startswith("<!doctype html>")
assert "Bagakit · read-only projection" in overview
assert "Snapshot computed from Feature Tracker canonical files" in overview
assert feature_id in overview
assert "In progress" in overview
assert "T-001" in overview
assert "Current plan" in detail
assert detail.count('<article class="feature-card"') == 2
assert detail.count('<details class="feature-review" open>') == 1
assert re.search(
    rf'<article class="feature-card" id="{re.escape(feature_id)}">.*?'
    r'<details class="feature-review" open>',
    detail,
    re.S,
)
assert "Handoff feature" in detail
assert overview.index("<h2>Proposal</h2>") < overview.index("<h2>In progress</h2>")
assert '<summary class="feature-summary">' in overview
assert "Review" in overview
assert "file://" in detail
assert "prefers-color-scheme:dark" not in overview
assert "&lt;literal&gt;" in detail
assert "<literal>" not in detail
assert overview.count("<script>") == 2
assert detail.count("<script>") == 2
assert "Agent 认领" in overview
assert "复制认领消息" in overview
parser = ClaimDraftParser()
parser.feed(detail)
assert len(parser.messages) == 2
claim = next(message for message in parser.messages if "Feature name: Demo feature" in message)
assert '<bagakit-msg type="agent-set-v1"' in claim
assert "Feature name: Demo feature" in claim
assert "Worktree: none" in claim
assert "Branch: none" in claim
assert "Progress snapshot: status=in_progress; active_tasks=T-001; runnable_tasks=none; todo=0, in_progress=1, done=0, blocked=0" in claim
assert f".bagakit/feature-tracker/features/{feature_id}/owner-receipt.json" in claim
assert f".bagakit/feature-tracker/features/{feature_id}/state.json" in claim
assert f".bagakit/feature-tracker/features/{feature_id}/tasks.json" in claim
assert "Current task objective:" not in claim
assert "Current task outcome:" not in claim
assert "&lt;" not in claim and "&gt;" not in claim
assert "本消息只传递认领上下文，不授予" in claim
assert "Goal / Result / Evidence / Mismatch or blocker / Next" in claim
(root / "claim-message.xml").write_text(claim, encoding="utf-8")
assert not list((root / ".bagakit" / "feature-tracker").rglob("*.html"))
PY
python3 "$ROOT/skills/a2a/bagakit-agent-messaging/scripts/agent_message_check.py" \
  --input "$TMP_DIR/claim-message.xml" --json >"$TMP_DIR/claim-message-check.json"
python3 - "$TMP_DIR/claim-message-check.json" <<'PY'
import json
import sys
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
assert payload["valid"] is True
assert payload["issues"] == []
PY
bash "$SKILL_DIR/scripts/feature-tracker.sh" list-features --root "$TMP_DIR" >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" replan-features --root "$TMP_DIR" --json >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" validate-tracker --root "$TMP_DIR" >/dev/null

python3 - "$TMP_DIR" "$FEATURE_ID" <<'PY'
import json
import re
import sys
from pathlib import Path
import subprocess

root = Path(sys.argv[1])
feature_id = sys.argv[2]

if not re.fullmatch(r"f-[23456789abcdefghjkmnpqrstuvwxyz]{9}", feature_id):
    raise SystemExit(f"unexpected feature id shape: {feature_id}")

index_path = root / ".bagakit" / "feature-tracker" / "index" / "features.json"
state_path = root / ".bagakit" / "feature-tracker" / "features" / feature_id / "state.json"
tasks_path = root / ".bagakit" / "feature-tracker" / "features" / feature_id / "tasks.json"
issuer_path = root / ".bagakit" / "feature-tracker" / "local" / "issuer.json"
feature_dir = root / ".bagakit" / "feature-tracker" / "features" / feature_id

index_payload = json.loads(index_path.read_text(encoding="utf-8"))
state_payload = json.loads(state_path.read_text(encoding="utf-8"))
tasks_payload = json.loads(tasks_path.read_text(encoding="utf-8"))
issuer_payload = json.loads(issuer_path.read_text(encoding="utf-8"))

assert "updated_at" not in index_payload
assert index_payload["feature_id_issuance"]["scheme"] == "feature-tracker-id-v1-c3n2g4"
assert isinstance(index_payload["feature_id_issuance"]["next_cursor"], int)
assert "created_at" not in state_payload
assert "updated_at" not in state_payload
assert "archived_at" not in state_payload
assert "discarded_at" not in state_payload
assert "last_checked_at" not in state_payload["gate"]
assert all("at" not in item for item in state_payload.get("history", []))
assert not (feature_dir / "tasks.md").exists()
assert not (feature_dir / "artifacts").exists()
assert not (feature_dir / "proposal.md").exists()
assert not (feature_dir / "spec-delta.md").exists()
assert not (feature_dir / "verification.md").exists()
assert (feature_dir / "owner-receipt.json").exists()
assert tasks_payload["plan_status"] == "reviewed"
assert tasks_payload["plan_revision"] == 1
task = tasks_payload["tasks"][0]
assert task["objective"] == "Ship the demo feature through a reviewed task plan with <literal> input."
assert task["depends_on"] == []
for key in ("last_gate_at", "started_at", "finished_at", "updated_at", "last_commit_hash"):
    assert key not in task
assert issuer_payload["namespace"] == feature_id[5:7]
assert issuer_payload["guard_key_source"] == "git-config:bagakit.feature-tracker.guard-key"

guard_key = subprocess.run(
    ["git", "-C", str(root), "config", "--local", "--get", "bagakit.feature-tracker.guard-key"],
    check=True,
    text=True,
    capture_output=True,
).stdout.strip()
assert re.fullmatch(r"[23456789abcdefghjkmnpqrstuvwxyz]{12}", guard_key)

check_ignore = subprocess.run(
    ["git", "-C", str(root), "check-ignore", ".bagakit/feature-tracker/local/issuer.json"],
    check=False,
    text=True,
    capture_output=True,
)
assert check_ignore.returncode == 0
PY

bash "$SKILL_DIR/scripts/feature-tracker.sh" materialize-feature-artifact --root "$TMP_DIR" --feature "$FEATURE_ID" --kind proposal >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" materialize-feature-artifact --root "$TMP_DIR" --feature "$FEATURE_ID" --kind spec-delta >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" materialize-feature-artifact --root "$TMP_DIR" --feature "$FEATURE_ID" --kind verification >/dev/null
test -f "$TMP_DIR/.bagakit/feature-tracker/features/$FEATURE_ID/proposal.md"
test -f "$TMP_DIR/.bagakit/feature-tracker/features/$FEATURE_ID/spec-delta.md"
test -f "$TMP_DIR/.bagakit/feature-tracker/features/$FEATURE_ID/verification.md"

mkdir -p "$TMP_DIR/.bagakit/feature-tracker/test-bin"
printf 'exit 0\n' > "$TMP_DIR/.bagakit/feature-tracker/test-bin/ok.sh"

# Task verification owns completion evidence. Runtime policy does not select task commands.
TASK_GATE_STATE="$TMP_DIR/task-gate-state.py"
cat >"$TASK_GATE_STATE" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
feature_id = sys.argv[2]
expected_result = sys.argv[3]
expected_records = json.loads(sys.argv[4])
required_log_text = sys.argv[5]
feature_dir = root / ".bagakit" / "feature-tracker" / "features" / feature_id
state = json.loads((feature_dir / "state.json").read_text(encoding="utf-8"))
tasks = json.loads((feature_dir / "tasks.json").read_text(encoding="utf-8"))
task = next(item for item in tasks["tasks"] if item["id"] == "T-001")
assert state["gate"]["last_result"] == expected_result
assert state["gate"]["last_check_commands"] == expected_records
assert task["gate_result"] == expected_result
assert task["last_gate_commands"] == expected_records
log = (root / state["gate"]["last_log_path"]).read_text(encoding="utf-8")
assert f"result={expected_result}" in log
assert required_log_text in log
PY

assert_gate() {
  local expected_result="$1"
  local expected_records_json="$2"
  local required_log_text="$3"
  python3 "$TASK_GATE_STATE" "$TMP_DIR" "$FEATURE_ID" \
    "$expected_result" "$expected_records_json" "$required_log_text"
}

POLICY_PATH="$TMP_DIR/.bagakit/feature-tracker/runtime-policy.json"
cp "$POLICY_PATH" "$TMP_DIR/runtime-policy.saved.json"
rm -f "$TMP_DIR/.bagakit/feature-tracker/features/$FEATURE_ID/verification.md"

bash "$SKILL_DIR/scripts/feature-tracker.sh" run-task-gate \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-001 >/dev/null
PASSING_TASK_RECORDS='[{"command":"true","exit_code":0,"status":"pass"}]'
assert_gate pass "$PASSING_TASK_RECORDS" "true => pass (0)"

# A failing Task proof must fail even when the workspace itself has no profile command.
python3 - "$TMP_DIR" "$FEATURE_ID" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
feature_id = sys.argv[2]
path = root / ".bagakit" / "feature-tracker" / "features" / feature_id / "tasks.json"
payload = json.loads(path.read_text(encoding="utf-8"))
task = next(item for item in payload["tasks"] if item["id"] == "T-001")
task["verification"][0]["ref"] = "false"
task["gate_result"] = "pass"
task["last_gate_commands"] = [{"command": "true", "exit_code": 0, "status": "pass"}]
path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY
if bash "$SKILL_DIR/scripts/feature-tracker.sh" finish-task \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-001 --result done \
  >"$TMP_DIR/stale-task-gate.out" 2>"$TMP_DIR/stale-task-gate.err"; then
  echo "stale Task gate receipt unexpectedly authorized completion" >&2
  exit 1
fi
grep -F "gate receipt does not match the current Task verification commands" \
  "$TMP_DIR/stale-task-gate.err" >/dev/null
if bash "$SKILL_DIR/scripts/feature-tracker.sh" run-task-gate \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-001 \
  >"$TMP_DIR/task-proof-fail.out" 2>"$TMP_DIR/task-proof-fail.err"; then
  echo "failing Task verification unexpectedly passed" >&2
  exit 1
fi
FAILING_TASK_RECORDS='[{"command":"false","exit_code":1,"status":"fail"}]'
assert_gate fail "$FAILING_TASK_RECORDS" "task verification command failed: false"
grep -F "task verification command failed: false" "$TMP_DIR/task-proof-fail.err" >/dev/null

# A reviewed Task with no executable command cannot be completed by a generic profile.
python3 - "$TMP_DIR" "$FEATURE_ID" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
feature_id = sys.argv[2]
path = root / ".bagakit" / "feature-tracker" / "features" / feature_id / "tasks.json"
payload = json.loads(path.read_text(encoding="utf-8"))
task = next(item for item in payload["tasks"] if item["id"] == "T-001")
task["verification"] = [{
    "kind": "artifact",
    "ref": "tasks.json",
    "proves": "The canonical task state is available for inspection.",
}]
path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY
if bash "$SKILL_DIR/scripts/feature-tracker.sh" run-task-gate \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-001 \
  >"$TMP_DIR/no-task-command.out" 2>"$TMP_DIR/no-task-command.err"; then
  echo "Task without command verification unexpectedly passed" >&2
  exit 1
fi
grep -F "reviewed Task gate requires at least one verification mapping with kind=command" \
  "$TMP_DIR/no-task-command.err" >/dev/null
assert_gate fail '[]' "reviewed Task gate requires at least one verification mapping with kind=command"

# Restore the executable Task proof and exercise optional Feature-level verification evidence.
python3 - "$TMP_DIR" "$FEATURE_ID" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
feature_id = sys.argv[2]
path = root / ".bagakit" / "feature-tracker" / "features" / feature_id / "tasks.json"
payload = json.loads(path.read_text(encoding="utf-8"))
task = next(item for item in payload["tasks"] if item["id"] == "T-001")
task["verification"] = [{
    "kind": "command",
    "ref": "true",
    "proves": "The public lifecycle behavior under test passes.",
}]
path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
policy_path = root / ".bagakit" / "feature-tracker" / "runtime-policy.json"
policy = json.loads(policy_path.read_text(encoding="utf-8"))
policy.setdefault("gate", {})["verification_policy"] = "required"
policy_path.write_text(json.dumps(policy, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY
if bash "$SKILL_DIR/scripts/feature-tracker.sh" run-task-gate \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-001 \
  >"$TMP_DIR/missing-feature-verification.out" 2>"$TMP_DIR/missing-feature-verification.err"; then
  echo "required Feature verification unexpectedly passed" >&2
  exit 1
fi
grep -F "missing verification file:" "$TMP_DIR/missing-feature-verification.err" >/dev/null
assert_gate fail "$PASSING_TASK_RECORDS" "missing verification file:"

cat > "$TMP_DIR/.bagakit/feature-tracker/features/$FEATURE_ID/verification.md" <<'EOF'
# Verification Evidence

## Automated Checks
- Command:
- Result:

## Manual Checks
- Step:
- Outcome:

## Residual Risks
- None noted.
EOF
if bash "$SKILL_DIR/scripts/feature-tracker.sh" run-task-gate \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-001 \
  >"$TMP_DIR/blank-verification.out" 2>"$TMP_DIR/blank-verification.err"; then
  echo "blank verification template unexpectedly passed" >&2
  exit 1
fi
grep -F "blank verification evidence field" "$TMP_DIR/blank-verification.err" >/dev/null
assert_gate fail "$PASSING_TASK_RECORDS" "blank verification evidence field"

cat > "$TMP_DIR/.bagakit/feature-tracker/features/$FEATURE_ID/verification.md" <<'EOF'
# Verification Evidence

## Automated Checks
- Command: true
- Result: [TBD]

## Manual Checks
- Step: Result: Passed is prose, not the canonical result field.
- Outcome: ＴＢＤ

## Residual Risks
- -
EOF
if bash "$SKILL_DIR/scripts/feature-tracker.sh" run-task-gate \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-001 \
  >"$TMP_DIR/placeholder-verification.out" 2>"$TMP_DIR/placeholder-verification.err"; then
  echo "placeholder verification evidence unexpectedly passed" >&2
  exit 1
fi
grep -F "requires a substantive Result or Outcome" "$TMP_DIR/placeholder-verification.err" >/dev/null
grep -F "requires an explicit residual-risk disposition" "$TMP_DIR/placeholder-verification.err" >/dev/null
assert_gate fail "$PASSING_TASK_RECORDS" "requires a substantive Result or Outcome"

cat > "$TMP_DIR/.bagakit/feature-tracker/features/$FEATURE_ID/verification.md" <<'EOF'
# Verification Evidence

## Automated Checks
- Command: true
- Result: Passed with exit code 0.

## Manual Checks
- Step: Reviewed the recorded command and aggregate result.
- Outcome: The command evidence matches this task.

## Residual Risks
- None; this synthetic fixture exercises only the gate aggregate.
EOF
bash "$SKILL_DIR/scripts/feature-tracker.sh" run-task-gate \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-001 >/dev/null
assert_gate pass "$PASSING_TASK_RECORDS" "true => pass (0)"

# Old profile command fields are rejected instead of silently becoming a second gate.
python3 - "$POLICY_PATH" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
policy = json.loads(path.read_text(encoding="utf-8"))
policy.setdefault("gate", {})["non_ui_commands"] = ["true"]
path.write_text(json.dumps(policy, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY
if bash "$SKILL_DIR/scripts/feature-tracker.sh" run-task-gate \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-001 \
  >"$TMP_DIR/retired-profile.out" 2>"$TMP_DIR/retired-profile.err"; then
  echo "retired profile command unexpectedly passed" >&2
  exit 1
fi
grep -F "gate.non_ui_commands are retired" "$TMP_DIR/retired-profile.err" >/dev/null
assert_gate fail '[]' "gate.non_ui_commands are retired"
cp "$TMP_DIR/runtime-policy.saved.json" "$POLICY_PATH"

# Malformed policy is still fail-closed, but no stale or profile command is recorded.
cp "$POLICY_PATH" "$TMP_DIR/runtime-policy.saved.json"
printf '{\n' > "$POLICY_PATH"
if bash "$SKILL_DIR/scripts/feature-tracker.sh" run-task-gate \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-001 \
  >"$TMP_DIR/invalid-policy-json.out" 2>"$TMP_DIR/invalid-policy-json.err"; then
  echo "invalid runtime-policy JSON unexpectedly passed" >&2
  exit 1
fi
grep -F "invalid runtime policy JSON" "$TMP_DIR/invalid-policy-json.err" >/dev/null
assert_gate fail '[]' "invalid runtime policy JSON"
cp "$TMP_DIR/runtime-policy.saved.json" "$POLICY_PATH"

printf '\377' > "$TMP_DIR/.bagakit/feature-tracker/test-bin/invalid-utf8.bin"
python3 - "$TMP_DIR" "$FEATURE_ID" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
feature_id = sys.argv[2]
path = root / ".bagakit" / "feature-tracker" / "features" / feature_id / "tasks.json"
payload = json.loads(path.read_text(encoding="utf-8"))
task = next(item for item in payload["tasks"] if item["id"] == "T-001")
task["verification"][0]["ref"] = "cat .bagakit/feature-tracker/test-bin/invalid-utf8.bin; exit 1"
path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY
if bash "$SKILL_DIR/scripts/feature-tracker.sh" run-task-gate \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-001 \
  >"$TMP_DIR/invalid-command-utf8.out" 2>"$TMP_DIR/invalid-command-utf8.err"; then
  echo "non-UTF-8 failing Task command unexpectedly passed" >&2
  exit 1
fi
if grep -F "Traceback" "$TMP_DIR/invalid-command-utf8.err" >/dev/null; then
  echo "non-UTF-8 Task command leaked a decoder traceback" >&2
  exit 1
fi
INVALID_UTF8_COMMAND='cat .bagakit/feature-tracker/test-bin/invalid-utf8.bin; exit 1'
INVALID_UTF8_RECORDS='[{"command":"cat .bagakit/feature-tracker/test-bin/invalid-utf8.bin; exit 1","exit_code":1,"status":"fail"}]'
assert_gate fail "$INVALID_UTF8_RECORDS" "task verification command failed: $INVALID_UTF8_COMMAND"

python3 - "$TMP_DIR" "$FEATURE_ID" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
feature_id = sys.argv[2]
path = root / ".bagakit" / "feature-tracker" / "features" / feature_id / "tasks.json"
payload = json.loads(path.read_text(encoding="utf-8"))
task = next(item for item in payload["tasks"] if item["id"] == "T-001")
task["verification"][0]["ref"] = "true"
path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY
rm -f "$TMP_DIR/.bagakit/feature-tracker/features/$FEATURE_ID/verification.md"
python3 - "$POLICY_PATH" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
policy = json.loads(path.read_text(encoding="utf-8"))
policy.setdefault("gate", {})["verification_policy"] = "on_demand"
path.write_text(json.dumps(policy, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY
bash "$SKILL_DIR/scripts/feature-tracker.sh" run-task-gate \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-001 >/dev/null
assert_gate pass "$PASSING_TASK_RECORDS" "true => pass (0)"
bash "$SKILL_DIR/scripts/feature-tracker.sh" finish-task \
  --root "$TMP_DIR" --feature "$FEATURE_ID" --task T-001 --result done >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" show-feature-status --root "$TMP_DIR" --format html --output "$STATUS_PAGE_REL" >"$TMP_DIR/feature-status-page-refreshed.out"
cmp "$TMP_DIR/feature-status-page.out" "$TMP_DIR/feature-status-page-refreshed.out"
python3 - "$STATUS_PAGE" "$FEATURE_ID" <<'PY'
import sys
from pathlib import Path

page = Path(sys.argv[1]).read_text(encoding="utf-8")
feature_id = sys.argv[2]
assert feature_id in page
assert "<h2>Needs closeout</h2>" in page
assert "Current task" not in page
PY
python3 - "$TMP_DIR" "$FEATURE_ID" "$SKILL_DIR" <<'PY'
import json
import subprocess
import sys
from pathlib import Path

root = Path(sys.argv[1])
feature_id = sys.argv[2]
script = Path(sys.argv[3]) / "scripts" / "feature-tracker.sh"

def run_json(*args):
    cp = subprocess.run(["bash", str(script), *args], check=True, text=True, capture_output=True)
    return json.loads(cp.stdout)

active = run_json("list-features", "--root", str(root))
assert feature_id in [item["feat_id"] for item in active["features"]]
assert {item["scope"] for item in active["features"]} == {"active"}
target = next(item for item in active["features"] if item["feat_id"] == feature_id)
assert target["status"] == "done"

done_active = run_json("filter-features", "--root", str(root), "--status", "done")
assert [item["feat_id"] for item in done_active["features"]] == [feature_id]

archived_default = run_json("filter-features", "--root", str(root), "--status", "archived")
assert archived_default["features"] == []
PY

DISCARD_FEATURE_ID="$(feature_tracker_feature_id_by_title "$TMP_DIR" "Handoff feature")"
python3 - "$TMP_DIR" "$DISCARD_FEATURE_ID" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
feat_id = sys.argv[2]
tasks_path = root / ".bagakit" / "feature-tracker" / "features" / feat_id / "tasks.json"
tasks_path.write_text(
    json.dumps({"version": 1, "feat_id": feat_id, "tasks": []}, indent=2) + "\n",
    encoding="utf-8",
)
PY
if bash "$SKILL_DIR/scripts/feature-tracker.sh" diagnose-tracker --root "$TMP_DIR" --closeout-plan >"$TMP_DIR/doctor-active-done.out" 2>"$TMP_DIR/doctor-active-done.err"; then
  echo "doctor unexpectedly hid tracker validation failure" >&2
  exit 1
fi
grep -F "$FEATURE_ID: status=done remains active; run closeout-feature" "$TMP_DIR/doctor-active-done.out" >/dev/null
grep -F "$FEATURE_ID: active done; review and close with" "$TMP_DIR/doctor-active-done.out" >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" archive-feature --root "$TMP_DIR" --feature "$FEATURE_ID" \
  "${FEATURE_TRACKER_CLOSEOUT_REVIEW_ARGS[@]}" >/dev/null

bash "$SKILL_DIR/scripts/feature-tracker.sh" discard-feature --root "$TMP_DIR" --feature "$DISCARD_FEATURE_ID" --reason cancelled \
  "${FEATURE_TRACKER_CLOSEOUT_REVIEW_ARGS[@]}" >/dev/null

python3 - "$TMP_DIR" "$FEATURE_ID" "$DISCARD_FEATURE_ID" "$SKILL_DIR" <<'PY'
import json
import subprocess
import sys
from pathlib import Path

root = Path(sys.argv[1])
archived_feature_id = sys.argv[2]
discarded_feature_id = sys.argv[3]
script = Path(sys.argv[4]) / "scripts" / "feature-tracker.sh"

def run_json(*args):
    cp = subprocess.run(["bash", str(script), *args], check=True, text=True, capture_output=True)
    return json.loads(cp.stdout)

default_list = run_json("list-features", "--root", str(root))
assert default_list["features"] == []

archived = run_json("list-features", "--root", str(root), "--scope", "archived")
assert [item["feat_id"] for item in archived["features"]] == [archived_feature_id]
assert archived["features"][0]["scope"] == "archived"

discarded = run_json("list-features", "--root", str(root), "--scope", "discarded")
assert [item["feat_id"] for item in discarded["features"]] == [discarded_feature_id]
assert discarded["features"][0]["scope"] == "discarded"

combined = run_json("list-features", "--root", str(root), "--scope", "active,archived", "--scope", "discarded")
assert [item["feat_id"] for item in combined["features"]] == [archived_feature_id, discarded_feature_id]

archived_filter = run_json("filter-features", "--root", str(root), "--scope", "archived", "--status", "archived")
assert [item["feat_id"] for item in archived_filter["features"]] == [archived_feature_id]

archived_hidden_by_default = run_json("filter-features", "--root", str(root), "--status", "archived")
assert archived_hidden_by_default["features"] == []
PY

mkdir -p "$TMP_DIR/.bagakit/planning-entry/handoffs"
bash "$SKILL_DIR/scripts/feature-tracker.sh" create-feature --root "$TMP_DIR" --title "Closeout feature" --slug "closeout-feature" --goal "Exercise closeout command" --workspace-mode current_tree --tasks-file "$TASK_PLAN_JSON" >/dev/null
CLOSEOUT_FEATURE_ID="$(feature_tracker_feature_id_by_title "$TMP_DIR" "Closeout feature")"
bash "$SKILL_DIR/scripts/feature-tracker.sh" start-task --root "$TMP_DIR" --feature "$CLOSEOUT_FEATURE_ID" --task T-001 >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" run-task-gate --root "$TMP_DIR" --feature "$CLOSEOUT_FEATURE_ID" --task T-001 >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" closeout-feature --root "$TMP_DIR" --feature "$CLOSEOUT_FEATURE_ID" --task T-001 >"$TMP_DIR/closeout-plan.out"
grep -F "plan: feature-tracker.sh finish-task" "$TMP_DIR/closeout-plan.out" >/dev/null
grep -F "closeout review checklist:" "$TMP_DIR/closeout-plan.out" >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" diagnose-tracker --root "$TMP_DIR" --closeout-plan >"$TMP_DIR/doctor-closeout-plan.out"
grep -F "$CLOSEOUT_FEATURE_ID: task T-001 gate passed; finish with" "$TMP_DIR/doctor-closeout-plan.out" >/dev/null
bash "$SKILL_DIR/scripts/feature-tracker.sh" closeout-feature --root "$TMP_DIR" --feature "$CLOSEOUT_FEATURE_ID" --task T-001 --execute \
  "${FEATURE_TRACKER_CLOSEOUT_REVIEW_ARGS[@]}" >/dev/null
test -f "$TMP_DIR/.bagakit/feature-tracker/features-archived/$CLOSEOUT_FEATURE_ID/summary.md"
bash "$SKILL_DIR/scripts/feature-tracker.sh" create-feature \
  --root "$TMP_DIR" \
  --title "Closeout feature next lifecycle" \
  --slug "closeout-feature" \
  --goal "Start a new lifecycle only after the prior Feature is archived" \
  --workspace-mode proposal_only >"$TMP_DIR/family-after-archive.out"
NEW_CLOSEOUT_FEATURE_ID="$(sed -n 's/^feature_id: //p' "$TMP_DIR/family-after-archive.out")"
test -n "$NEW_CLOSEOUT_FEATURE_ID"
test "$NEW_CLOSEOUT_FEATURE_ID" != "$CLOSEOUT_FEATURE_ID"
python3 - "$TMP_DIR" "$CLOSEOUT_FEATURE_ID" "$SKILL_DIR" <<'PY'
import json
import subprocess
import sys
from pathlib import Path

root = Path(sys.argv[1])
feature_id = sys.argv[2]
script = Path(sys.argv[3]) / "scripts" / "feature-tracker.sh"

def run_json(*args):
    cp = subprocess.run(["bash", str(script), *args], check=True, text=True, capture_output=True)
    return json.loads(cp.stdout)

active = run_json("list-features", "--root", str(root))
assert feature_id not in [item["feat_id"] for item in active["features"]]
archived = run_json("list-features", "--root", str(root), "--scope", "archived")
assert feature_id in [item["feat_id"] for item in archived["features"]]
PY

bash "$SKILL_DIR/scripts/feature-tracker.sh" diagnose-tracker --root "$TMP_DIR" >"$TMP_DIR/doctor-closed.out"
if grep -F "round_count=" "$TMP_DIR/doctor-closed.out" >/dev/null; then
  echo "doctor reported closed feature threshold noise" >&2
  cat "$TMP_DIR/doctor-closed.out" >&2
  exit 1
fi

echo "ok: bagakit-feature-tracker canonical smoke passed"
