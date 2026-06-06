---
name: bagakit-feature-tracker
description: Track feature and task planning truth with explicit workspace modes, JSON SSOT transitions, task-level gate evidence, and archive or discard lifecycle. Use when a repository needs a durable planning surface before repeated flow execution.
metadata:
  bagakit:
    harness_layer: l1-execution
---

# Bagakit Feature Tracker

## Route

Use this skill when work needs durable Feature identity, a reviewed Task plan,
workspace assignment, task-gate evidence, or explicit archive/discard closeout.

Do not create Tracker state for a tiny single-shot change. Use
`bagakit-flow-runner` when canonical planning truth already exists and the need
is repeated execution rather than planning ownership.

## Ownership And Truth

Feature Tracker owns:

- Feature identity, lifecycle, workspace assignment, and dependencies
- reviewed Task-plan revisions, Task dependencies, and Task progression
- task gates and blocker evidence
- optional Feature-owned `goal.md` for restart, compact, handoff, or supervision
- archive and discard publication

Canonical truth is deliberately small:

- `state.json`: Feature lifecycle and workspace truth
- `tasks.json`: the only Task dependency, status, and closeout-review truth
- optional `goal.md`: stable Agent control truth, not another lifecycle
- `owner-receipt.json`: derived content binding, never Task truth

Keep these invariants:

- reuse an active Feature with the same normalized slug; revise its reviewed
  plan instead of creating a parallel same-class Feature
- an Agent may draft requirements, but only user-confirmed discussion or an
  explicitly delegated review decision may authorize the reviewed plan
- execution cannot start before reviewed Task truth and workspace assignment
- missing `depends_on` means a graph root; Task ids and array order never imply
  sequencing
- runnable and active Task sets are derived from `tasks.json`; different
  runnable Tasks may be active together
- Git commits, branches, merges, and cleanup remain Git truth, not Tracker truth
- helper Markdown and HTML projections never become editable mirrors of JSON
- exact SHAs, current phase, next action, and rebase checkpoints are mutable
  execution context; never keep them in stable `goal.md`
- the first reviewed execution Task should close the smallest end-to-end
  acceptance path before broad cross-tree coverage or cleanup

## Golden Path

Resolve the installed skill directory, then initialize once:

```bash
export BAGAKIT_FEATURE_TRACKER_SKILL_DIR="<path-to-bagakit-feature-tracker-skill>"

bash "$BAGAKIT_FEATURE_TRACKER_SKILL_DIR/scripts/feature-tracker.sh" \
  initialize-tracker --root .
```

Create or reuse a proposal before planning:

```bash
bash "$BAGAKIT_FEATURE_TRACKER_SKILL_DIR/scripts/feature-tracker.sh" \
  create-feature \
  --root . \
  --title "<feature-title>" \
  --slug "<feature-family-slug>" \
  --goal "<user goal>" \
  --workspace-mode proposal_only
```

After the user confirms the plan, materialize it and assign a workspace:

```bash
bash "$BAGAKIT_FEATURE_TRACKER_SKILL_DIR/scripts/feature-tracker.sh" \
  set-task-plan \
  --root . \
  --feature <feature-id> \
  --tasks-file <reviewed-task-plan.json> \
  --expected-revision <current-revision>

bash "$BAGAKIT_FEATURE_TRACKER_SKILL_DIR/scripts/feature-tracker.sh" \
  assign-feature-workspace \
  --root . \
  --feature <feature-id> \
  --workspace-mode <current_tree|worktree>
```

When the implementation worktree already exists, adopt or rebind it instead of
creating another one:

```bash
bash "$BAGAKIT_FEATURE_TRACKER_SKILL_DIR/scripts/feature-tracker.sh" \
  adopt-feature-worktree \
  --root . \
  --feature <feature-id> \
  --worktree-path <existing-worktree-path> \
  --branch <exact-checked-out-branch>
```

Execute any runnable Task through the public state machine:

```text
start-task -> run-task-gate -> finish-task
```

`start-task` atomically claims one Task after all direct dependencies are done.
Use the exact next command emitted by the operator. A blocked finish must carry
its canonical blocker class and reason in the same transition; unrelated
runnable or active Tasks may continue.

`run-task-gate` executes the current Task's `verification` mappings with
`kind=command`, in their declared order, and records the same command results
in both `tasks.json.last_gate_commands` and
`state.json.gate.last_check_commands`. Runtime policy does not choose Task
completion commands. A reviewed Task without an executable command
verification fails closed when it is being started or gated; artifact, manual,
and owner-receipt mappings remain additional evidence routes and are not
silently treated as a passing command gate. Existing reviewed plans that only
contain those non-command mappings remain readable as historical truth, but
cannot start or finish a new execution Task until their reviewed plan is
revised with an executable command. `finish-task --result done` also rejects a
stale receipt whose command list no longer matches the current Task plan, even
if an old `pass` value is present. This transition check is deliberately not a
retroactive migration: historical completed Tasks remain readable without
claiming that their older gate receipts satisfy the new proof rule.

When implementation is delegated, the Owner or Supervisor maintains Feature,
workspace, Goal, and Task transitions. The implementation Worker consumes the
current receipt and Task, produces code and evidence, and does not repeatedly
replan or rewrite control state unless a user-confirmed requirement changes.

## Task Decomposition And Parallelism

Treat one Feature as one user goal, then make its Task plan as fine-grained as
the acceptance evidence allows:

- split work at independently implementable and independently verifiable
  outcomes; a Task should be small enough to close in one bounded execution
  loop, not a broad phase such as “finish the backend”
- declare only real prerequisites in `depends_on`; do not add edges merely to
  preserve the order in which Tasks were written
- inspect the derived runnable frontier before each claim and start independent
  runnable Tasks concurrently when the Host or Supervisor can safely support
  them
- when branches must share an implementation result or joint verification,
  add one explicit downstream integration Task that depends on those branches
- do not split work into ceremony-only Tasks or force parallel edits to the
  same artifact; isolation and merge order remain Host/Supervisor decisions

The target is the smallest set of independently closable Tasks that exposes
real parallelism, not the largest possible Task count.

## Human Visibility

After Feature creation, a Host may present one stable, disposable status page
that derives the active and runnable Task frontier. Expanding a Feature shows
the same file-derived Task topology and links its nodes to acceptance and proof
detail:

```bash
bash "$BAGAKIT_FEATURE_TRACKER_SKILL_DIR/scripts/feature-tracker.sh" \
  show-feature-status \
  --root . \
  --feature <feature-id> \
  --format html \
  --output .tmp/feature-tracker/status.html
```

The HTML `--feature` option focuses and expands one Feature while retaining the
complete active overview; text and JSON forms continue to inspect one Feature.
If one active record is malformed, the overview shows a minimal repair-needed
card with canonical links and leaves strict diagnosis to `validate-tracker`.
The page is a static snapshot computed from canonical Tracker files plus an
optional latest Flow Runner progress overlay. Reuse the same
path and regenerate it only after plan confirmation, execution start, blocker
change, closeout, or an explicit status request. Its Agent claim draft is a
Host-delivered `bagakit-agent-messaging` envelope; it grants no authority and
proves no delivery or claim. Expanding a Feature exposes the Task topology;
use its full-screen control for larger graphs and read the node labels and
legend for the derived runtime frontier, gate state, and direct dependencies.
Task review details are independently collapsible; active and blocked Tasks are
open by default while other Tasks stay compact in larger plans. Their browser
disclosure state is preserved by live refresh and is not Tracker truth.

For a live local view, use the loopback-only read-only server:

```bash
bash "$BAGAKIT_FEATURE_TRACKER_SKILL_DIR/scripts/feature-tracker.sh" \
  serve-feature-status \
  --root . \
  --feature <feature-id>
```

The server regenerates the same projection from `state.json`, `tasks.json`,
and `index/features.json` on each browser refresh. If Flow Runner is present,
it also reads the latest `progress.ndjson` receipt for the mirrored Feature;
only an explicit `task_ref` can attach that informational activity to a Task.
The page's JavaScript only fetches and replaces the status region; it does not
read browser-local files, mutate Tracker state, or provide a write endpoint.
It preserves expanded Features and the topology dialog while showing refresh
state, and preserves topology scroll and
zoom position and the board's horizontal scroll position across those
replacements. The fullscreen control has a bounded
zoom range and a CSS fallback when the host does not expose native
`HTMLDialogElement` support. It fits a graph to the fullscreen viewport on first
open and keeps the SVG's layout dimensions synchronized with zoom, so scrolling
does not expose a clipped visual transform. Stop the server when the observation
session ends.

When the observer has a terminal but no browser, render the same projection in
place:

```bash
bash "$BAGAKIT_FEATURE_TRACKER_SKILL_DIR/scripts/feature-tracker.sh" \
  watch-feature-status \
  --root . \
  --feature <feature-id>
```

This is the same derived frontier and Task topology as the other two routes, not
a second projection: it renders `feature_task_frontier` and
`task_topology_layers` over the same canonical files and holds no tracker lock.
`--feature` expands one Feature's topology while keeping the full active board,
and a malformed active record shows the same repair-needed line rather than
disappearing from the board. On each refresh it recomputes the whole projection,
reports `updated`, and on a transient read error keeps the last good frame and
reports the failure instead of blanking the view. It also marks the time the
canonical content last changed, derived from content rather than file
timestamps, so a change that happened while the observer looked away stays
visible. Prefer the loopback server when a browser is available: only the page
carries the full interactive graph.

## Progress Publication

When reporting progress for a tracked Feature, the Agent must first refresh or
serve its human status projection and include the same stable topology link in
that progress message:

- static route: rerun `show-feature-status --format html --output <stable-path>`
- live route: reuse the `serve-feature-status` loopback URL
- terminal route: `watch-feature-status` when the observer has no browser
- keep the link stable across updates; do not create a new page per mutation
- let the page carry the complete topology; the progress message should give
  only the result, current exception or blocker, and the link
- if no route can be presented, include a compact derived frontier summary
  (`active`, `runnable`, `blocked`, `waiting`) and state that the topology page
  is unavailable

This publication rule applies to user-facing progress messages, not every
internal state mutation or Worker heartbeat.

When the Feature is executed through `bagakit-flow-runner`, a bounded session
about one Task should record the exact Task id with checkpoint's optional
`--task-ref <task-id>`. The status page then attaches the latest progress
receipt matching that Task. Feature-wide work or a session without a reliable Task
binding must omit it; the page keeps that activity Feature-wide rather than
guessing. This is a read-only overlay and never replaces `tasks.json` status or
gate evidence.
Host-only `worker-v1` messages and `agent-loop` observations are not scraped by
the page; when Task-level visibility matters, record the bounded execution
checkpoint through Flow Runner instead.

## Closeout

A code commit is not Feature completion. Run `closeout-feature` first as a dry
run, resolve the three review items it prints, then rerun with `--execute`:

- documentation: update or verify only the owning SSOT; never turn Agent
  inference into requirements
- learning: summarize bounded mistakes, corrections, and useful methods; merge
  duplicates and keep them non-authoritative for requirements
- promotion: use an existing Chronicle, Evolver, Principle Layer, or Living
  Knowledge owner; do not create another store

The terminal lifecycle is `archived` or `discarded`. Use
`discard-feature --reason invalid` only when a readable active Feature actually
fails its contract: Tracker rejects valid state, preserves the original
Feature-root files under `artifacts/invalid-source/`, and publishes a minimal
discarded tombstone without changing Git workspaces.

## Low-Frequency Paths

- `create-feature-from-planning-entry-handoff` consumes an approved planning
  handoff without making the handoff a second SSOT
- `set-feature-goal` is optional; use `bagakit-set-loop-goal` for Goal authoring
- `materialize-feature-artifact` creates optional proposal, spec-delta, or
  verification helpers only when they add evidence value
- `adopt-feature-worktree` binds or rebinds an existing registered worktree;
  it never creates, cleans, checks out, or removes the worktree
- `diagnose-tracker --closeout-plan` is the read-only cleanup entrypoint
- use `repair-reviewed-task-plan` only when the operator reports damaged
  reviewed lineage; do not invent another repair or compatibility path

The complete discovery inventory is
`references/skill-cli.toml`; argparse and the contracts own option semantics.

## Runtime Surface Declaration

- top-level runtime surface: `.bagakit/feature-tracker/`
- shared input not owned here: `.bagakit/planning-entry/handoffs/`
- stable surface contract: `docs/specs/runtime-surface-contract.md`
- a materialized top-level runtime surface should carry `surface.toml`

## Stable Contracts

- `docs/specs/feature-tracker-contract.md`
- `docs/specs/feature-tracker-id-issuance.md`
- `docs/specs/feature-tracker-projection-surfaces.md`
- `docs/specs/execution-owner-receipt-contract.md`
- `docs/specs/principle-layer-contract.md`

Read only the owning contract needed for a low-frequency decision. Do not copy
contract detail back into this entrypoint.
