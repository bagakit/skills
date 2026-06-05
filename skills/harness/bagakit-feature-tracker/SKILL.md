---
name: bagakit-feature-tracker
description: Track feature and task planning truth with explicit workspace modes, JSON SSOT transitions, task-level gate evidence, and archive or discard lifecycle. Use when a repository needs a durable planning surface before repeated flow execution.
metadata:
  bagakit:
    harness_layer: l1-execution
---

# Bagakit Feature Tracker

## When to Use

- You need a durable feature or task planning surface.
- You need explicit workspace assignment such as `worktree`,
  `current_tree`, or `proposal_only`.
- You need task-level gate evidence.
- You need archive or discard flows that keep planning state explicit.

## When Not to Use

- The change is tiny and does not need tracked feature lifecycle.
- You only need task-level skill evidence.
- You need repeated execution orchestration across rounds.

Use `bagakit-flow-runner` for repeated execution flow.
For tiny single-shot changes, work directly in the repository tree and keep the
task local instead of creating tracker lifecycle state.

## What It Owns

- feature identity and feature lifecycle
- reviewed semantic task plans, revisions, supersession, and current task progression
- workspace mode and worktree assignment
- task gates
- execution-owner receipts derived from canonical feature state
- optional long-running Agent `goal.md` control truth and its revision binding
- archive and discard state

It does not own:

- repeated outer-loop scheduling
- generic normalized work-item orchestration
- external system bridges
- repository-level learning or promotion

## Output Discipline

Follow `docs/specs/output-discipline.md` through tracker-owned artifacts.
Follow `docs/specs/principle-layer-contract.md` when feature intent will guide
multiple tasks or later reuse.

- task acceptance depends on task gates, not persuasive prose
- optional helper artifacts should state what they prove and what remains open
- repeated tracker failures should become task-gate or validation ratchets only
  when the failure mode is reproducible
- do not add subjective scores to feature lifecycle transitions
- `show-feature-status --format html` is a disposable, read-only human
  projection; redirect it outside tracker state when a page artifact is useful
- its per-Feature Agent claim action emits a `bagakit-agent-messaging`
  `agent-set-v1` draft for Host delivery; the draft never grants authority or
  proves that an Agent received or claimed the work
- non-trivial feature proposals should distinguish rationale, intended
  generalization, non-goals, acceptance criteria, and verification checks

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
  --title "<feature-title>" \
  --slug "<feature-slug>" \
  --goal "<goal>" \
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

bash "$BAGAKIT_FEATURE_TRACKER_SKILL_DIR/scripts/feature-tracker.sh" create-feature-from-planning-entry-handoff \
  --root . \
  --handoff .bagakit/planning-entry/handoffs/<handoff-id>.json \
  --workspace-mode proposal_only
```

Use `--slug` as the stable active Feature family key. It does not affect the
opaque public feature id, but two non-closed Features must not share the same
normalized slug. Creating a proposal for an existing slug reuses that Feature
without mutation. When new reviewed work targets an existing slug, revise that
Feature's Task plan with `set-task-plan`; do not create a parallel Feature.
Archived or discarded history remains immutable and does not reserve the slug.

Optional helper files can be materialized later:

```bash
bash "$BAGAKIT_FEATURE_TRACKER_SKILL_DIR/scripts/feature-tracker.sh" materialize-feature-artifact \
  --root . \
  --feature <feature-id> \
  --kind proposal
```

## Public Commands

- `feature-tracker.sh initialize-tracker`
- `feature-tracker.sh rekey-local-issuer`
- `feature-tracker.sh materialize-feature-artifact`
- `feature-tracker.sh create-feature`
- `feature-tracker.sh create-feature-from-planning-entry-handoff`
- `feature-tracker.sh set-task-plan`
- `feature-tracker.sh repair-reviewed-task-plan`
- `feature-tracker.sh validate-feature-goal`
- `feature-tracker.sh set-feature-goal`
- `feature-tracker.sh assign-feature-workspace`
- `feature-tracker.sh show-feature-status`
- `feature-tracker.sh get-owner-receipt`
- `feature-tracker.sh start-task`
- `feature-tracker.sh unstart-task`
- `feature-tracker.sh run-task-gate`
- `feature-tracker.sh finish-task`
- `feature-tracker.sh closeout-feature`
- `feature-tracker.sh archive-feature`
- `feature-tracker.sh discard-feature`
- `feature-tracker.sh validate-tracker`
- `feature-tracker.sh diagnose-tracker`
- `feature-tracker.sh replan-features`
- `feature-tracker.sh show-feature-dag`
- `feature-tracker.sh list-features`
- `feature-tracker.sh get-feature`
- `feature-tracker.sh filter-features`

External bridges are intentionally out of scope for this skill.

## Stable Specs

- `docs/specs/feature-tracker-contract.md`
- `docs/specs/feature-tracker-id-issuance.md`
- `docs/specs/feature-tracker-projection-surfaces.md`
- `docs/specs/execution-owner-receipt-contract.md`
- `docs/specs/principle-layer-contract.md`

The runtime payload is intentionally smaller than the canonical repo-spec layer.
Use the specs above when you need the durable contract rather than the local
operator entrypoint.

Task SSOT lives only in `tasks.json`.
The default feature directory keeps canonical `state.json` and `tasks.json`
plus optional canonical `goal.md`. Derived `owner-receipt.json` exists only
for reviewed execution or Goal continuation.
New features without a reviewed task plan remain `proposal` + `proposal_only`
with no executable placeholder task.
Active execution requires explicit version 2 reviewed task truth materialized
from `bagakit.feature-task-plan.v1` through `--tasks-file` or `set-task-plan`.
Plan approval means the user confirmed the requirements during discussion or
explicitly delegated the review decision. An Agent may draft the plan but must
not self-approve inferred requirements or implementation discoveries.
Workspace assignment and task start fail closed until that plan exists.
Plan replacement uses `--expected-revision`, is rejected during active task
execution, preserves blocked/done evidence, and requires explicit supersession
lineage against the immediately prior current plan.
When persisted state claims a reviewed plan but canonical lineage is damaged,
ordinary owner writes fail closed. `repair-reviewed-task-plan` is the single
maintainer repair path: it accepts a complete canonical `tasks.json`, requires
exact SHA-256 guards for state/tasks/Goal/receipt, preserves `state.json` and
the active current-task identity, and atomically refreshes tasks plus receipt.
Historical superseded tasks remain attributable but cannot be restarted.
Review, source, verification, and evidence refs must be portable repo-relative
paths and must not use URI, absolute, drive-qualified, UNC, or escaping paths.
`goal.md` is optional and should be created only when restart, compact, handoff,
or loop supervision needs a durable Agent control Kernel. Feature Tracker owns
its write path and revision guard; `bagakit-set-loop-goal` owns authoring
semantics and delegates mutation back to this operator. Goal does not own a
second lifecycle, topology, event stream, or archive.
Tracker validation checks Goal identity, Feature binding, non-empty content,
and portability; it does not prescribe headings, prose order, or recovery
wording.
For reviewed execution or Goal continuation, `owner-receipt.json` binds
`state.json`, `tasks.json`, and `goal.md` when present through SHA-256
`evidence_hashes`; missing or stale persisted receipts fail closed. Proposal
and draft state without a Goal do not materialize a receipt.
The receipt follows `docs/specs/execution-owner-receipt-contract.md` and remains
a derived handoff rather than task truth.
`show-feature-dag` computes the dependency projection on demand from active
feature state. No persisted DAG is required; `state.json.depends_on` remains
the only dependency truth and the projection never carries policy-resolved
execution planning.
Runtime truth and Git truth are separate surfaces. Feature Tracker does not
generate commit prose or execute Git commits; use ordinary Git or
`bagakit-git-message-craft` and keep implementation commits outside tracker
state. Workspace assignment determines where task gates execute. For
`worktree` features, `run-task-gate` runs from the assigned worktree path.
Task gates fail closed when the resolved UI or non-UI command list is empty;
an empty gate is never passing evidence.
Tracker state mutation is serialized, but long-running gate commands release
the global state lock while external commands run and revalidate the
workspace assignment before recording results.
Do not reassign a feature workspace while a task is `in_progress`; same-feature
task execution remains single-active-task by contract.
An accidentally started task may return to `todo` only through `unstart-task`
when it has no gate evidence or prior blocked/done completion, its persisted
owner receipt is current, its assigned execution worktree is clean, and the
current Git HEAD matches the caller's expected HEAD. This optimistic
current-state guard does not prove that no commit occurred since task start.
The transition is for evidence-free plan correction, not for erasing attempted
execution.
Finishing a task as blocked requires canonical blocker truth in the same
transition:

```bash
bash "$BAGAKIT_FEATURE_TRACKER_SKILL_DIR/scripts/feature-tracker.sh" finish-task \
  --root . \
  --feature <feature-id> \
  --task <task-id> \
  --result blocked \
  --blocked-reason-class <external_blocker|internal_blocker|parked_context> \
  --blocked-reason "<non-empty reason>"
```

The Tracker stores the exact pair as task evidence and projects it as the
current blocker; the complete blocker lifecycle is normative in
`docs/specs/feature-tracker-contract.md`.
For tracked features, a code commit is not the feature completion boundary;
close through `archive-feature`, `discard-feature`, or
`closeout-feature --execute`.
`closeout-feature` is the single-feature operator path for completing the
tracker lifecycle after gate work. It defaults to a dry-run plan and
requires `--execute` before it mutates state.
Use that dry run to resolve all three closeout review items before archive or
discard:

- documentation: `updated`, `verified_current`, or `not_applicable`
- learning: `candidates_reviewed` or `no_reusable_learning`
- promotion: `routed_for_review`, `promoted`, or `not_needed`

Give each item a rationale and add repo-relative refs when the selected option
claims an update, verification, reviewed candidate, route, or promotion.
For documentation, inspect changed behavior and update only the owning SSOT;
write requirement changes only from user-confirmed discussion or explicitly
delegated review evidence, never from Agent inference. For learning, the Agent
may review bounded plan revisions, failures, corrections, and final evidence;
compare original intent and non-goals with delivered scope; ask whether the
shortest useful vertical closure came first and whether later work improved
quality instead of only expanding task count. Merge duplicate lessons, keep
them concise, and do not turn them into requirements without user confirmation.
Keep raw sessions with their host. For promotion, merge same-class candidates,
check repository principles, and route through existing Chronicle, Evolver,
Principle Layer, or Living Knowledge ownership instead of creating another
store.
Tracker writes the normalized result only to final
`tasks.json.closeout_review`; `summary.md` projects it and the existing owner
receipt binds it. A failed closeout leaves no active review record.
The canonical `summary.md` does not restate the Feature Goal or regenerate
requirements. It points to the confirmed `tasks.json` plan revision and review
evidence; Agent-authored execution learning remains explicitly non-authoritative
for requirements.
Closeout validation, option scope, staged publication, and Git-cleanup
boundaries are normative in `docs/specs/feature-tracker-contract.md`.
For `current_tree` features, `archive-feature` may proceed with unrelated
non-harness repo changes because it only closes tracker metadata; `discard-feature`
still requires a clean non-harness tree before closeout.
Optional helper markdown files such as `proposal.md`, `spec-delta.md`, and
`verification.md` can be materialized later at the feature root.
Unsupported feature-root files such as `PRD.md` and `Changelog.md` are outside
the current tracker contract and should fail validation.
Route feature intent to `proposal.md` or upstream planning artifacts, and keep
change history in repo or release surfaces rather than in active feature roots.
Closed feature roots keep `summary.md` instead; live-only or unsupported legacy
root entries are preserved under `artifacts/closeout-preserved-root/` during
archive/discard so the closed feature stays contract-valid.
If an operator already wrote `summary.md` in an active feature root, closeout
preserves that draft under `artifacts/closeout-preserved-root/summary.md`
before writing the canonical closed summary.

Use `verification.md` only when a task needs manual or mixed evidence beyond
automated command output.
The older `ui-verification.md` name is retired; rename old files to
`verification.md` before rerunning gate in active feature roots.
Closed feature roots should preserve legacy `ui-verification.md` under
`artifacts/closeout-preserved-root/` instead of restoring it at the root.
