# Bagakit Feature Tracker

Feature Tracker is Bagakit's filesystem-first planning and lifecycle operator.
It keeps Feature state and reviewed Task truth in project-local JSON, then
projects status, receipts, and closeout summaries from that truth.

## Boundary

The operator owns Feature identity, reviewed plans, workspace assignment, task
gates, and archive/discard lifecycle. It does not own Git history, repeated
runner scheduling, external bridges, or repository knowledge promotion.

Runtime truth remains:

- `state.json` for Feature lifecycle and workspace state
- `tasks.json` for Task dependencies, Task status, and final closeout review
- optional `goal.md` for stable Agent control
- derived `owner-receipt.json` for content binding

Read [SKILL.md](SKILL.md) for the Agent workflow. Read the repository specs for
durable semantics; this README is not a second contract.

## Runtime Surface Declaration

- `.bagakit/feature-tracker/` is the owned project-local runtime surface
- `.bagakit/planning-entry/handoffs/` is a shared input surface, not Tracker
  truth
- `docs/specs/runtime-surface-contract.md` owns placement and cleanup rules
- a materialized top-level runtime surface should carry `surface.toml`

## Operator

```bash
export BAGAKIT_FEATURE_TRACKER_SKILL_DIR="<path-to-bagakit-feature-tracker-skill>"

bash "$BAGAKIT_FEATURE_TRACKER_SKILL_DIR/scripts/feature-tracker.sh" \
  initialize-tracker --root .

bash "$BAGAKIT_FEATURE_TRACKER_SKILL_DIR/scripts/feature-tracker.sh" \
  show-feature-status --root .
```

Use the operator's `--help` for current options. The complete discovery
inventory is `references/skill-cli.toml`.

Within one Feature, `depends_on` is the only Task-ordering truth. Omission means
a root Task, not an implicit dependency on the preceding array entry. The CLI
derives active and runnable frontiers on demand and may atomically start more
than one independent Task; it does not persist a graph cache or schedule
Workers. For observation, `serve-feature-status` provides a loopback-only live
read-only page that regenerates from the same canonical files and, when
available, the optional Flow Runner progress receipt.

Task completion gates run the current Task's declared `verification` command
refs in order and record those results in the Task and Feature gate receipts;
runtime-policy command profiles are not completion truth.

If a Feature uses Flow Runner, pass `--task-ref <task-id>` to checkpoint when a
session is about one Task. The human status page reads that optional progress
receipt as an informational overlay; it never writes or substitutes Tracker
Task truth.

## Durable Contracts

- `docs/specs/feature-tracker-contract.md`
- `docs/specs/feature-tracker-id-issuance.md`
- `docs/specs/feature-tracker-projection-surfaces.md`
- `docs/specs/execution-owner-receipt-contract.md`
- `docs/specs/principle-layer-contract.md`

Validation and non-gating eval remain outside the installable skill under
`gate_validation/` and `gate_eval/`.
