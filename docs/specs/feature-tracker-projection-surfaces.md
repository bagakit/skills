# Feature Tracker Projection Surfaces

This document defines the stable boundary for derived projection surfaces around
`bagakit-feature-tracker`.

## Scope

This spec covers:

- the meaning of the tracker dependency projection
- the boundary between dependency projection and execution planning
- the boundary between dependency projection and runtime history

This spec does not redefine canonical feature truth.

Canonical feature truth remains in:

- `docs/specs/feature-tracker-contract.md`

## First Principle

One tracker surface should not carry four meanings at once.

Keep these layers distinct:

1. canonical dependency truth
2. generated dependency projection
3. policy-resolved execution planning
4. runtime history or resume state

## Canonical Dependency Truth

Canonical dependency truth lives in feature-owned state:

- `features/<feature-id>/state.json`
  - `depends_on`

That truth may be edited through tracker commands.
It must not be inferred backward from generated projection output.

## Dependency Projection

The stable dependency projection is the output of:

- `feature-tracker.sh show-feature-dag`

It is computed on demand from canonical Feature state and is not persisted as
tracker truth or cache.

Purpose:

- expose the current active feature dependency graph
- expose derived dependents
- expose pure topological layers

It should answer:

- what depends on what
- what other active features each feature unlocks
- how the active graph layers topologically
- whether canonical dependency state forms a valid active graph

It should not answer:

- which execution mode is active
- how many items should run in parallel today
- what the current retry or scheduling policy is
- what happened in the last runtime attempt

## Execution Planning Boundary

Policy-resolved execution planning is conceptually separate from the dependency
projection.

Examples:

- chosen parallel limit
- selected batch or execution order under policy
- next runnable items under current scheduling rules

If Bagakit later stabilizes one execution-plan surface, that surface must be
defined independently instead of being added ad hoc to dependency projection
output.

## Runtime History Boundary

Runtime history is also separate.

Examples:

- checkpoints
- attempt receipts
- incidents
- replay or resume artifacts

If such a surface becomes stable, it must remain distinct from both:

- canonical dependency truth
- generated dependency projection

## Human Status Projection

`feature-tracker.sh show-feature-status --format html` emits a disposable,
read-only status page on stdout. `--output <path>` instead writes the same page
atomically and prints its local file URI so a Host can present it to a human.

It may present canonical Feature identity, lifecycle status, workspace,
current Task, blocker, dependencies, Task counts, and current-plan Task detail.
It must derive those facts directly from `index/features.json`, `state.json`,
and `tasks.json` on each invocation.

The default human overview places proposals before execution statuses. A
Feature card opens its review in place, showing current-plan objectives,
outcomes, acceptance, verification, and links to canonical files. The default
surface stays light and visually quiet instead of following the host into a
dark, heavily outlined dashboard.

A relative `--output` path resolves from `--root`. The recommended stable
scratch path is `.tmp/feature-tracker/status.html`. The operator must reject an
output path inside `.bagakit/feature-tracker/`; a generated page is never
tracker state. The file is a static snapshot, so current status requires
rerunning the command against canonical files and reloading the page.

For human-visible work, the first useful publication point is after
`create-feature` creates or reuses the Feature and before planning continues.
The calling Agent may include the returned page link in that start update when
the Host can present local files. It should reuse and refresh the same path at
meaningful lifecycle breakpoints: reviewed-plan confirmation, execution start,
blocker change, closeout, or an explicit status request. It must not publish a
link before the Feature exists or emit a new link for every tracker mutation.
The Host still owns presentation and delivery.

Every active Feature card may render one claim-message draft using the
`bagakit-agent-messaging` `agent-set-v1` envelope. The draft includes Feature
name and id, worktree or `none`, branch or `none`, lifecycle status, current
Task, and Task counts as a compact routing snapshot. It then gives the ordered
canonical refs where the Agent must recover Goal, current Task, acceptance,
blocker, authority, and next action. It must not copy Task objective, outcome,
acceptance, verification, release, or execution history into the message.

The page may use bounded client-side behavior only to preview, refresh the
display time immediately before copy/share, copy, or invoke the platform share
sheet. The draft and page do not authenticate a sender, select a target, send a
message, assign Host authority, or prove delivery, consumption, claim, or
effect. The message states this boundary in plain language.

The human projection must not:

- persist a dashboard, cache, database, or editable mirror
- infer progress percentages, execution order, readiness, or scheduling policy
- treat a generated claim draft as authenticated assignment or authority
- become an input to tracker mutation, validation, recovery, or closeout
- load closed Feature detail merely to render the active overview

Closed history may use the canonical index projection because the overview
needs only identity, title, and lifecycle status. A generated HTML file belongs
outside tracker state and can be deleted or regenerated without repair.

## Quality Rule

A good projection boundary makes these statements true:

- truth can be edited without hand-editing the projection
- projection can be computed at any time without a cache-repair step
- graph-affecting commands can preflight the resulting projection before they
  perform destructive side effects
- validation computes the graph from canonical state and rejects invalid
  dependency values, discarded dependencies, and cycles
- `replan-features` validates the complete proposed graph before persisting any
  dependency mutation
- users do not have to guess whether one field is graph truth or execution
  policy
