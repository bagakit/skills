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

For the HTML projection, `--feature <feature-id>` is a focus selector: the
page still renders every non-closed Feature and expands only the selected one.
The text and JSON forms keep their single-Feature detail meaning. A malformed
active Feature is represented by a minimal repair-needed card with canonical
links so one bad record does not hide the rest of the overview; `validate-tracker`
remains the strict diagnostic surface.

It may present canonical Feature identity, lifecycle status, workspace,
active and runnable Tasks, Task blockers, dependencies, Task counts, and
current-plan Task detail. When a reviewed Task plan exists, the expanded
Feature review should also render its derived Task topology: roots, dependency
edges, convergence points, and each Task's current derived status. Selecting a
topology node opens its collapsible Task detail before scrolling to that Task's
acceptance and verification detail. The
topology may open in a full-screen read-only dialog for inspecting larger
graphs; its runtime legend and node labels distinguish active, runnable,
waiting, blocked, and done Tasks and show each Task's gate state and direct
dependency summary. The graph viewport provides bounded zoom controls and
preserves its horizontal/vertical scroll and zoom position when the live
projection refreshes; these are display state only and never Tracker truth.
Mixed CJK/Latin Task titles are wrapped to the node's display width, while the
full title remains available through the SVG tooltip.
Zoom changes the SVG layout dimensions as well as its visual scale, so the
scroll viewport remains truthful; first opening the full-screen view fits the
current graph when possible.
It must derive planning and lifecycle facts directly from
`index/features.json`, `state.json`, and `tasks.json` on each invocation. When
the optional Flow Runner surface exists, it may also read the latest
`items/feature-<feature-id>/progress.ndjson` receipt as a clearly labelled
read-only execution overlay. An explicit receipt `task_ref` is the only valid
binding to a Task; an omitted or unmatched binding stays Feature-wide and is
never guessed from free-form text. The projection keeps the latest receipt per
bound Task, so parallel Task activity remains visible instead of being hidden
by one Feature-level "last update". This overlay is informational and cannot
change Task status, gate evidence, or closeout truth.

Host-only `worker-v1` messages and `agent-loop` session observations are not
scraped into this page: they are delivery or host-exhaust surfaces, not a
durable Task binding. A Worker report becomes visible here only when its
execution owner records a Flow Runner progress receipt with `task_ref`.

The default human overview places proposals before execution statuses. A
Feature card opens its review in place, showing current-plan objectives,
outcomes, acceptance, verification, and links to canonical files. The default
surface stays light and visually quiet instead of following the host into a
dark, heavily outlined dashboard.

Within an expanded Feature, each reviewed Task is an independent collapsible
detail. Active and blocked Tasks open by default; larger plans leave the other
Task details collapsed, and the user may open any Task without changing
Tracker state. The live route preserves those Task disclosure choices across
refreshes.

A relative `--output` path resolves from `--root`. The recommended stable
scratch path is `.tmp/feature-tracker/status.html`. The operator must reject an
output path inside `.bagakit/feature-tracker/`; a generated page is never
tracker state. The file is a static snapshot, so current status requires
rerunning the command against canonical files and reloading the page.

`feature-tracker.sh serve-feature-status` may provide a live local observation
route. It binds only to loopback, serves no mutation endpoint, and regenerates
the same HTML from canonical files on each request. Its bounded page JavaScript
fetches the current projection and replaces only the status-content region,
preserving expanded Features, topology dialogs, and anchors while showing an
updating/updated/error indicator. It also preserves each topology viewport and
the full-screen dialog's scroll/zoom position, as well as the board's
horizontal scroll position, across those content updates,
with a non-native-dialog fallback for hosts that expose the page without
`HTMLDialogElement`. It does not read browser-local files or create a second
state surface. When present, Flow Runner progress receipts are reread with the
same request and become visible without a second event log or a write-back into
Tracker state. The server is an observation process and must be stopped when
the observation session ends.

For human-visible work, the first useful publication point is after
`create-feature` creates or reuses the Feature and before planning continues.
The calling Agent may include the returned page link in that start update when
the Host can present local files. It should reuse and refresh the same path at
meaningful lifecycle breakpoints: reviewed-plan confirmation, execution start,
blocker change, closeout, or an explicit status request. It must not publish a
link before the Feature exists or emit a new link for every tracker mutation.
The Host still owns presentation and delivery.

For every user-facing progress message about a tracked Feature, the Agent
should refresh the stable static page or reuse the live loopback URL and include
that same topology link. The message carries the result and any exception or
blocker; the page carries the full topology. If the page cannot be presented,
the Agent gives the compact derived frontier (`active`, `runnable`, `blocked`,
`waiting`) and says that the topology page is unavailable. This rule does not
apply to internal mutation logs or Worker heartbeats.

Every active Feature card may render one claim-message draft using the
`bagakit-agent-messaging` `agent-set-v1` envelope. The draft includes Feature
name and id, worktree or `none`, branch or `none`, lifecycle status, active and
runnable Task ids, and Task counts as a compact routing snapshot. It
then gives the ordered canonical refs where the Agent must recover Goal, Task
acceptance, blockers, authority, and next action. It must not copy Task
objective, outcome, acceptance, verification, release, or execution history
into the message.

The static page may use bounded client-side behavior only to preview, refresh
the display time immediately before copy/share, copy, or invoke the platform
share sheet. The live route may additionally fetch the current URL at its
configured interval and replace only its status-content region; it must not
read local files or mutate Tracker state. The
draft and page do not authenticate a sender, select a target, send a message,
assign Host authority, or prove delivery, consumption, claim, or effect. The
message states this boundary in plain language.

The human projection must not:

- persist a dashboard, cache, database, or editable mirror
- infer progress percentages, execution order, recommended parallelism, or
  scheduling policy beyond the deterministic runnable frontier
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
