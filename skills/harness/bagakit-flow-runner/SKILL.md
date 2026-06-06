---
name: bagakit-flow-runner
description: Run one adjustable repeated execution flow over normalized work items with explicit next-action payloads, checkpoint receipts, and repo snapshot safety. Use when a repository already has execution truth and needs a bounded runner surface above it.
metadata:
  bagakit:
    harness_layer: l2-behavior
---

# Bagakit Flow Runner

## When to Use

- You already have work truth from another surface such as
  `bagakit-feature-tracker`.
- You need one repeatable runner that can pick one item, checkpoint one
  bounded session, and stop cleanly.
- You need repo snapshot artifacts before risky or stateful sessions.

## When Not to Use

- You need to create or manage feature or task planning truth.
- You only need task-level skill evidence.
- You need repository-level learning or promotion.

## What It Owns

- normalized work-item runtime state
- next-item selection
- runner contract and checkpoint contract
- explicit resume-candidate discovery
- plan revision and incident records
- snapshot safety artifacts
- explicit archive closeout for runner-owned items

It does not own:

- feature lifecycle
- task gates
- task commit protocol
- repository-level evolution topics

For tracker-sourced items, feature lifecycle remains upstream; the runner owns
only local execution state and sidecars.

## Output Discipline

Follow `docs/specs/output-discipline.md` for runner-owned sidecars.

- trust structured state, checkpoint receipts, next actions, and incidents over
  free-form stdout
- write gaps and blocked conditions as explicit resume information
- add ratchets as runner checks only for failures the runner can observe
- do not let policy or score fields redefine upstream planning truth

## Runtime Surface Declaration

- top-level runtime surface root when materialized:
  - `.bagakit/flow-runner/`
- stable contract:
  - `docs/specs/runtime-surface-contract.md`
- if the top-level root exists in a host repo, it should carry `surface.toml`

## Public Commands

- `flow-runner.sh apply`
- `flow-runner.sh add-item`
- `flow-runner.sh ingest-feature-tracker`
- `flow-runner.sh activate-feature-tracker`
- `flow-runner.sh list-items`
- `flow-runner.sh next`
- `flow-runner.sh resume-candidates`
- `flow-runner.sh snapshot`
- `flow-runner.sh checkpoint`
- `flow-runner.sh open-incident`
- `flow-runner.sh resolve-incident`
- `flow-runner.sh archive-item`
- `flow-runner.sh validate`

`checkpoint` accepts an optional `--task-ref <upstream-item-id>`. For a
Feature Tracker-sourced item, pass the exact Task id when a bounded session is
about one Task; omit it when the report is Feature-wide or no binding is known.
The runner stores this optional field in checkpoint and progress receipts but
does not validate or change upstream Task truth.

## Runtime Contract

Stable runtime surfaces:

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

## Core Rule

`flow-runner` executes one bounded session at a time.

For tracker-sourced items, explicit execution-ready activation should prefer
`activate-feature-tracker` over forcing hosts to stitch together:

- generic ingest
- mirrored item id guessing
- explicit `next --item ...`

That bridge still does not replace tracker planning truth.

The host should trust:

- refreshed item state
- checkpoint receipts
- next-action payloads
- resume-candidate payloads

The host should not trust:

- arbitrary stdout as control-plane truth
- implicit archive decisions
- hidden retry logic outside item state
- tracker-sourced item closeout emitted by the runner itself

## Boundary Reminder

`policy.json` tunes runner behavior.

It must not be used to redefine:

- ownership between `bagakit-flow-runner` and `bagakit-feature-tracker`
- closeout authority
- fail-closed selection rules

## Source Boundary

For tracker-sourced items, only these fields are source-derived:

- `title`
- `source_ref`
- the mirror lifecycle baseline derived from `bagakit-feature-tracker`

Everything else under `.bagakit/flow-runner/` remains runner-local execution
state.

## Runner-Owned Items

When `source_kind` is not `feature-tracker`:

- `bagakit-flow-runner` owns archive closeout
- `archive-item` is explicit and moves the item from `items/` to `archive/`
- `next` may surface closeout readiness, but it does not archive by itself
