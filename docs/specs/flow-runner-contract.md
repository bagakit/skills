# Flow Runner Contract

This document defines the stable runtime contract for `bagakit-flow-runner`.

Its place as Bagakit's current flow protocol surface in the broader runtime
control chain is defined in:

- `docs/architecture/C4-runtime-control-chain.md`

## Scope

This contract covers:

- work-item runtime state
- next-action payloads
- explicit tracker-to-runner activation payloads
- checkpoint receipts
- resume-candidate payloads
- snapshot metadata
- incident and plan-revision sidecars

This contract does not define feature planning truth. That remains owned by
`bagakit-feature-tracker`.

## Runtime Surfaces

Stable runtime files live under:

- `.bagakit/flow-runner/policy.json`
- `.bagakit/flow-runner/recipe.json`
- `.bagakit/flow-runner/items/<item-id>/state.json`
- `.bagakit/flow-runner/items/<item-id>/checkpoints.ndjson`
- `.bagakit/flow-runner/items/<item-id>/progress.ndjson`
- `.bagakit/flow-runner/items/<item-id>/mutation-receipts.ndjson`
- `.bagakit/flow-runner/items/<item-id>/handoff.md`
- `.bagakit/flow-runner/items/<item-id>/plan-revisions/`
- `.bagakit/flow-runner/items/<item-id>/incidents/`
- `.bagakit/flow-runner/archive/<item-id>/`
- `.bagakit/flow-runner/backups/`
- `.bagakit/flow-runner/next-action.json`
- `.bagakit/flow-runner/resume-candidates.json`

`items/` is the active tree.

`archive/` is the closed tree.

## Source-of-Truth Rule

- `bagakit-flow-runner` owns runner-local work-item truth.
- `bagakit-feature-tracker` owns feature and task lifecycle truth.
- `feature-tracker` sourced runner items are mirrors, not owner records.

Implications:

- the runner may ingest and mirror source state
- the runner may not archive or close tracker-sourced items by itself
- tracker closeout must be reflected into runner state through source refresh

## Explicit Activation Rule

`bagakit-flow-runner` may expose one explicit activation command for
tracker-sourced execution-ready work.

Current activation payload schema:

- `bagakit/flow-runner/feature-activation/v1`

Its job is narrower than generic ingest:

- `ingest-feature-tracker`
  - mirror upstream feature state into runner-local execution state
- explicit activation
  - prove one concrete tracker feature is execution-ready and return the exact
    runnable flow packet for that feature

Allowed direction:

- feature-tracker canonical planning truth -> flow-runner activation payload ->
  flow-runner next-action packet for that same mirrored item

Fail-closed activation expectations:

- archived or discarded tracker features must not activate
- `proposal_only` tracker features must not activate
- tracker features in blocked state must not activate
- activation must fail if the resulting runner item is not runnable via
  `recommended_action=run_session`

## Fail-Closed Rules

- multiple active `in_progress` items are an error
- legacy tracker layouts are an error
- invalid checkpoint stage is an error
- invalid status or resolution combinations are an error
- duplicate active/archive item ids are an error

These are invariants, not policy toggles.

`policy.json` is reserved for lightweight runner-safety behavior that may be
adjusted without changing ownership or state semantics.

## Policy Contract

`policy.json` currently uses schema `bagakit/flow-runner/policy/v2`.

Supported fields:

- `safety.snapshot_before_session`
- `safety.checkpoint_before_stop`
- `safety.persist_state_before_stop`

These fields tune session safety only.

They do not redefine ownership, archive authority, or source-of-truth rules.

## Recipe Contract

`recipe.json` currently uses schema `bagakit/flow-runner/recipe/v2`.

Supported fields:

- `recipe_id`
- `recipe_version`
- `stage_chain[]`

Each `stage_chain` entry must contain:

- `stage_key`
- `goal`

The recipe defines the bounded-session stage vocabulary used by item state,
checkpoint receipts, and next-action payloads.

## Payload Rule

Hosts should trust:

- `state.json`
- `next-action.json`
- `resume-candidates.json`
- checkpoint and progress receipts
- mutation receipts

Hosts should not infer authority from raw command stdout beyond those payloads.

## Mutation Receipt Rule

`bagakit-flow-runner` is Bagakit's current protocol owner for accepted
execution-state mutations.

Mutation commands that change execution-facing state must return or persist a
structured receipt before a host treats the change as durable.

Accepted protocol mutation receipts use schema
`bagakit/flow-runner/mutation-receipt/v1` and append to the owning item's
`mutation-receipts.ndjson` log.

Current mutation receipt fields:

- `schema`: always `bagakit/flow-runner/mutation-receipt/v1`
- `receipt_id`: unique protocol receipt identity
- `mutation`: accepted mutation kind
- `item_id`: target item identity
- `recorded_at`: protocol-assigned receipt timestamp
- `authority`: `runner_local` or `source_mirror`
- `changed`: whether the accepted mutation changed durable state
- `events`: field-level before or after JSON-safe mutation events
- `notes`: optional protocol notes for the accepted mutation

Current receipt-bearing mutation surfaces include:

- `add-item` and `ingest-feature-tracker`
  - create or refresh item state through protocol mutation services
  - append one mutation receipt for each accepted state mutation
- `checkpoint`
  - returns schema `bagakit/flow-runner/checkpoint/v2`
  - appends one checkpoint receipt to `checkpoints.ndjson`
  - appends one progress receipt to `progress.ndjson`
  - appends one protocol mutation receipt to `mutation-receipts.ndjson`
  - updates `state.json` after validating stage and source ownership rules
- `open-incident` and `resolve-incident`
  - persist incident payloads under `incidents/`
  - update item state through protocol-owned incident rules
  - append protocol mutation receipts for the state transition
- `snapshot`
  - returns schema `bagakit/flow-runner/snapshot/v1`
  - stores a protocol-scoped snapshot reference
  - appends one protocol mutation receipt for the snapshot anchor
- `archive-item`
  - moves runner-owned closeout items into `archive/`
  - appends one protocol mutation receipt before the physical move
Checkpoint receipt fields currently include:

- optional `task_ref`, a caller-supplied upstream work-item binding (for
  example a Feature Tracker Task id)
- `stage`
- `session_status`
- `objective`
- `attempted`
- `result`
- `next_action`
- `clean_state`
- `recorded_at`
- `session_number`

Progress receipts currently include those fields plus:

- `schema`
- `item_id`

Checkpoint and progress `task_ref` are optional. The runner stores and checks
the field shape but does not resolve or authorize the referenced item. When it
is omitted, consumers must keep the report at runner-item/Feature level and
must not infer a Task binding from `stage`, `objective`, or free-form text.

Receipt validation expectations:

- invalid stages fail before any checkpoint or progress receipt is appended
- tracker-sourced items reject direct `--item-status` mutation overrides
- checkpoint and progress session numbers match the updated runtime
  `session_count`
- receipt `item_id` values match the owning item directory
- mutation receipt logs move with archived items and keep paths aligned with
  `state.json`
- host exhaust, runner stdout, and notification delivery receipts do not count
  as flow-runner mutation receipts

`activate-feature-tracker` returns schema
`bagakit/flow-runner/feature-activation/v1`. It is an activation proof over
current tracker and flow-runner state, not a separate mutation receipt surface.
If activation has to import or refresh the mirrored item first, that accepted
state mutation is recorded by `ingest-feature-tracker`.

## Ownership Overlay Rule

For `feature-tracker` sourced items:

- source refresh may update source-derived fields only
- source refresh may explicitly close runner-local incidents when tracker closeout
  becomes authoritative
- runner-local incidents may temporarily keep an item blocked until they are
  resolved
- source closeout still wins over runner-local liveliness

Source-derived fields are:

- `title`
- `source_ref`
- the mirror lifecycle baseline derived from feature-tracker status

Runner-owned fields for tracker-sourced items are:

- `current_stage`
- `current_step_status`
- `runtime.*`
- `steps[]`
- checkpoint, progress, plan-revision, incident, handoff, and snapshot sidecars

## Runner-Owned Item Rule

For items whose `source_kind` is not `feature-tracker`:

- the runner owns live state and archive closeout
- `archive-item` is the only closeout command that moves the item into `archive/`
- `next-action.json` may recommend closeout, but it does not archive by itself
