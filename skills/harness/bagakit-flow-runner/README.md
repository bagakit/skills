# bagakit-flow-runner

Standalone repeated execution flow for repositories that need:

- one bounded runner surface over normalized work items
- explicit session checkpoints and next-action payloads
- explicit resume-candidate discovery
- plan revision and incident records per work item
- repo snapshot safety before active sessions
- optional ingestion from `bagakit-feature-tracker`

## Boundary

This skill owns adjustable repeated execution flow:

- runner-local work-item protocol truth under `.bagakit/flow-runner/`
- next-item selection
- session checkpoint recording
- repo snapshot safety artifacts
- closeout and archive of runner-owned work items

It does not own feature or task planning truth. That belongs to
`bagakit-feature-tracker`.

For tracker-sourced items, feature lifecycle remains upstream; the runner owns
only local execution state and sidecars.

## Runtime Surface Declaration

- top-level runtime surface root when materialized:
  - `.bagakit/flow-runner/`
- stable contract:
  - `docs/specs/runtime-surface-contract.md`
- if the top-level root exists in a host repo, it should carry `surface.toml`

## Quick Start

```bash
export BAGAKIT_FLOW_RUNNER_SKILL_DIR="<path-to-bagakit-flow-runner-skill>"

bash "$BAGAKIT_FLOW_RUNNER_SKILL_DIR/scripts/flow-runner.sh" apply --root .

bash "$BAGAKIT_FLOW_RUNNER_SKILL_DIR/scripts/flow-runner.sh" add-item \
  --root . \
  --item-id demo \
  --title "Demo item" \
  --source-kind manual \
  --source-ref manual:demo

bash "$BAGAKIT_FLOW_RUNNER_SKILL_DIR/scripts/flow-runner.sh" activate-feature-tracker \
  --root . \
  --feature <feature-id> \
  --json

bash "$BAGAKIT_FLOW_RUNNER_SKILL_DIR/scripts/flow-runner.sh" next --root . --json

bash "$BAGAKIT_FLOW_RUNNER_SKILL_DIR/scripts/flow-runner.sh" resume-candidates --root . --json

bash "$BAGAKIT_FLOW_RUNNER_SKILL_DIR/scripts/flow-runner.sh" snapshot \
  --root . \
  --item demo \
  --label before-session

bash "$BAGAKIT_FLOW_RUNNER_SKILL_DIR/scripts/flow-runner.sh" checkpoint \
  --root . \
  --item demo \
  --stage inspect \
  --session-status progress \
  --objective "Inspect the repo" \
  --attempted "Read entry docs" \
  --result "Ready to plan" \
  --next-action "Run one bounded session" \
  --clean-state yes \
  --task-ref T-001

bash "$BAGAKIT_FLOW_RUNNER_SKILL_DIR/scripts/flow-runner.sh" open-incident \
  --root . \
  --item demo \
  --family review \
  --summary "Need a decision" \
  --recommended-resume stay_blocked
```

`--task-ref` is optional. It is a stable upstream work-item binding for
read-only consumers such as Feature Tracker's status page; omitting it keeps
the report at the runner item/Feature level.

## Runtime State

Runtime state lives under:

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

## Public Commands

- `apply`
- `add-item`
- `ingest-feature-tracker`
- `activate-feature-tracker`
- `list-items`
- `next`
- `resume-candidates`
- `snapshot`
- `checkpoint`
- `open-incident`
- `resolve-incident`
- `archive-item`
- `validate`

## Design Notes

- Protocol truth stays in item state, progress logs, checkpoint logs, plan
  revisions, and incidents.
- Runner policy stays in `policy.json`; it does not replace work-item truth or
  ownership rules.
- Recipe stage vocabulary stays in `recipe.json` and is shared by item state,
  checkpoints, and next-action payloads.
- `next` is fail-closed around multiple active in-progress items.
- `snapshot` creates repo-local safety artifacts before one bounded session.
- `resume-candidates` makes live vs closeout state explicit instead of hiding
  that classification inside `next`.
- `activate-feature-tracker` is the explicit bridge for tracker features that
  are already execution-ready; it is stricter than generic mirror ingest and
  fails closed when the source feature is still `proposal_only`, blocked, or
  otherwise not runnable.
- `archive-item` is explicit; session execution does not archive items by
  itself.
- `feature-tracker` sourced items are mirrored execution surfaces and must be
  closed by `bagakit-feature-tracker`, not by `bagakit-flow-runner`.
- source refresh may update only mirrored source fields.
- source refresh may explicitly close runner-local incidents when tracker
  closeout becomes authoritative.
- runner-owned items stay in `items/` until explicit closeout moves them into
  `archive/`.

## Canonical Operator

The stable shell wrapper is:

- `scripts/flow-runner.sh`

The canonical TypeScript operator behind it is:

- `node --experimental-strip-types scripts/flow-runner.ts`
