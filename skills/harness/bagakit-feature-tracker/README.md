# bagakit-feature-tracker

Feature and task planning truth for repositories that need:

- one checked-in planning surface for feature work
- explicit workspace assignment per feature
- task-level gate evidence and structured closeout
- archive or discard lifecycle for finished or abandoned work

## Boundary

This skill owns canonical feature and task planning truth:

- feature identity and feature lifecycle
- reviewed task-plan revisions, supersession, and current task selection
- workspace mode and worktree assignment
- task gates
- execution-owner receipt projection
- optional long-running Agent `goal.md` control truth and its revision binding
- archive and discard state

It does not own:

- repeated execution flow
- host-side orchestration
- external system bridges

Use `bagakit-flow-runner` for repeated execution flow.
For tiny single-shot changes, work directly in the repository tree and keep the
task local instead of creating tracker lifecycle state.

## Runtime Surface Declaration

- top-level runtime surface root when materialized:
  - `.bagakit/feature-tracker/`
- shared exchange path not owned by this skill:
  - `.bagakit/planning-entry/handoffs/`
- stable contract:
  - `docs/specs/runtime-surface-contract.md`
- if the top-level root exists in a host repo, it should carry `surface.toml`

## Quick Start

```bash
export BAGAKIT_FEATURE_TRACKER_SKILL_DIR="<path-to-bagakit-feature-tracker-skill>"

bash "$BAGAKIT_FEATURE_TRACKER_SKILL_DIR/scripts/feature-tracker.sh" initialize-tracker --root .

bash "$BAGAKIT_FEATURE_TRACKER_SKILL_DIR/scripts/feature-tracker.sh" create-feature \
  --root . \
  --title "Add feature" \
  --slug "add-feature" \
  --goal "Deliver X" \
  --workspace-mode proposal_only

bash "$BAGAKIT_FEATURE_TRACKER_SKILL_DIR/scripts/feature-tracker.sh" create-feature-from-planning-entry-handoff \
  --root . \
  --handoff .bagakit/planning-entry/handoffs/<handoff-id>.json \
  --workspace-mode proposal_only

bash "$BAGAKIT_FEATURE_TRACKER_SKILL_DIR/scripts/feature-tracker.sh" set-task-plan \
  --root . \
  --feature <feature-id> \
  --tasks-file <reviewed-task-plan.json> \
  --expected-revision 0

bash "$BAGAKIT_FEATURE_TRACKER_SKILL_DIR/scripts/feature-tracker.sh" set-feature-goal \
  --root . \
  --feature <feature-id> \
  --goal-file <reviewed-goal.md> \
  --expected-revision none

bash "$BAGAKIT_FEATURE_TRACKER_SKILL_DIR/scripts/feature-tracker.sh" assign-feature-workspace \
  --root . \
  --feature <feature-id> \
  --workspace-mode current_tree

bash "$BAGAKIT_FEATURE_TRACKER_SKILL_DIR/scripts/feature-tracker.sh" start-task \
  --root . \
  --feature <feature-id> \
  --task T-001
```

Use `--slug` as the stable active Feature family key. It stays separate from
the opaque public feature id. A second proposal with the same normalized slug
reuses the existing active Feature without mutation; reviewed extensions must
enter through a new Task-plan revision. Closed history does not reserve the
slug, so a genuinely new lifecycle may start after archive or discard.

Optional helper files can be materialized later:

```bash
bash "$BAGAKIT_FEATURE_TRACKER_SKILL_DIR/scripts/feature-tracker.sh" materialize-feature-artifact \
  --root . \
  --feature <feature-id> \
  --kind verification
```

## Runtime State

Runtime state lives under:

- `.bagakit/feature-tracker/index/features.json`
- `.bagakit/feature-tracker/runtime-policy.json`
- `.bagakit/feature-tracker/features/<feature-id>/state.json`
- `.bagakit/feature-tracker/features/<feature-id>/tasks.json`
- optional `.bagakit/feature-tracker/features/<feature-id>/goal.md`
- `.bagakit/feature-tracker/features/<feature-id>/owner-receipt.json` for
  reviewed execution or Goal continuation
- `.bagakit/feature-tracker/features-archived/<feature-id>/`
- `.bagakit/feature-tracker/features-discarded/<feature-id>/`

Local-only issuer state lives under:

- `.bagakit/feature-tracker/local/issuer.json`

Stable specs:

- `docs/specs/feature-tracker-contract.md`
- `docs/specs/feature-tracker-id-issuance.md`
- `docs/specs/feature-tracker-projection-surfaces.md`
- `docs/specs/execution-owner-receipt-contract.md`

The skill directory is the operator entry surface.
The specs above are the durable repository contract.

Task SSOT lives only in `tasks.json`.
The default feature directory keeps canonical `state.json` and `tasks.json`
plus optional canonical `goal.md`. Derived `owner-receipt.json` exists only
for reviewed execution or Goal continuation.
Without reviewed task truth, a new feature remains `proposal` in
`proposal_only` mode and has no executable placeholder.
Active execution requires version 2 `tasks.json` materialized from an approved
`bagakit.feature-task-plan.v1` payload.
Approval means user confirmation or an explicitly delegated review decision;
Agent-authored plans and execution discoveries cannot self-authorize scope.
`set-task-plan` uses optimistic `--expected-revision` checks, rejects plan
replacement while a task is active, preserves blocked/done evidence, and
records explicit supersession against the immediately prior current plan.
If a persisted payload claims `plan_status=reviewed` but fails the canonical
lineage contract, ordinary owner writes fail closed. Maintainers may use
`repair-reviewed-task-plan` with a complete canonical replacement and exact
SHA-256 guards for the current state, tasks, Goal, and receipt. Repair may keep
an active task, preserves `state.json` byte-for-byte, requires identical task
identity for the active current task, then atomically refreshes tasks and the
derived receipt with rollback on publication failure.
Historical superseded tasks remain visible for attribution but cannot restart.
All review, source, verification, and evidence refs are portable repo-relative
paths; URI, absolute, drive-qualified, UNC, and escaping paths are rejected.
Feature-owned `goal.md` is the optional direct Agent control contract for
restart, compact, handoff, or loop supervision. It is revision-guarded by
`state.json.goal_contract`; Feature Tracker owns mutation and closeout while
`bagakit-set-loop-goal` owns authoring guidance.
For reviewed execution or Goal continuation, `owner-receipt.json` binds
canonical state, tasks, and `goal.md` when present with SHA-256
`evidence_hashes`. A missing or stale persisted receipt fails closed. Proposal
and draft state without a Goal do not materialize a receipt.
`show-feature-dag` computes a dependency projection on demand from active
feature state; no persisted graph becomes dependency truth or execution policy.
Workspace assignment determines where task gates execute. Tracker state
mutation is serialized, but long-running gate commands release the global
state lock while external commands run and revalidate workspace assignment
before recording results.
`diagnose-tracker --closeout-plan` remains a read-only cleanup surface when
unrelated active state fails validation: it still emits loadable closeout
candidates while preserving a non-zero exit.
Do not reassign a feature workspace while a task is `in_progress`; same-feature
task execution remains single-active-task by contract.
Optional helper markdown files such as `proposal.md`, `spec-delta.md`, and
`verification.md` can be materialized later at the feature root.
Unsupported feature-root files such as `PRD.md` and `Changelog.md` are outside
the current tracker contract and should fail validation.
Route feature intent to `proposal.md` or upstream planning artifacts, and keep
change history in repo or release surfaces rather than in active feature roots.
Closed feature roots keep `summary.md` instead; live-only or unsupported legacy
root entries are preserved under `artifacts/closeout-preserved-root/` during
archive/discard so the closed feature stays contract-valid.
The canonical closeout summary does not restate the Feature Goal as a
requirement summary. It points to the confirmed task-plan revision and review
evidence, while Agent-authored execution learning remains non-authoritative for
requirements.
If an operator already wrote `summary.md` in an active feature root, closeout
preserves that draft under `artifacts/closeout-preserved-root/summary.md`
before writing the canonical closed summary.

Use `verification.md` only when a task needs manual or mixed evidence beyond
automated command output.
The older `ui-verification.md` name is retired; rename old files to
`verification.md` before rerunning gate in active feature roots.
Closed feature roots should preserve legacy `ui-verification.md` under
`artifacts/closeout-preserved-root/` instead of restoring it at the root.

## Public Commands

- `initialize-tracker`
- `rekey-local-issuer`
- `materialize-feature-artifact`
- `create-feature`
- `create-feature-from-planning-entry-handoff`
- `set-task-plan`
- `repair-reviewed-task-plan`
- `validate-feature-goal`
- `set-feature-goal`
- `assign-feature-workspace`
- `show-feature-status`
- `get-owner-receipt`
- `start-task`
- `unstart-task` (only before gate or blocked/done completion evidence)
- `run-task-gate`
- `finish-task`
- `closeout-feature`
- `archive-feature`
- `discard-feature`
- `validate-tracker`
- `diagnose-tracker`
- `replan-features`
- `show-feature-dag`
- `list-features`
- `get-feature`
- `filter-features`

External bridges are intentionally out of scope for this skill.

## Design Notes

- Mutable runtime truth stays in JSON SSOT under `.bagakit/feature-tracker/`.
- Optional `goal.md` is canonical stable control truth; other helper Markdown
  files remain non-authoritative planning or evidence aids.
- Dependency projection is computed on demand from `state.json.depends_on`.
- `create-feature`, `archive-feature`, and `discard-feature` preflight the
  resulting active graph before they commit tracker state or closeout cleanup.
- For `current_tree` features, `archive-feature` may proceed with unrelated
  non-harness repo changes because it only closes tracker metadata;
  `discard-feature` still requires a clean non-harness tree before closeout.
- Feature ids are short opaque tokens whose lexical order follows tracker
  issuance cursor order.
- Runtime JSON is intentionally low-churn and avoids per-mutation timestamps.
- The tracker does not assume `bagakit-living-docs` or `bagakit-living-knowledge`
  repository seams.
- The tracker does not ship external-system bridge logic in its canonical
  surface.
