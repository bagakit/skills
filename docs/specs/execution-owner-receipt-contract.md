# Execution Owner Receipt Contract

## Purpose

An execution owner receipt lets a compact Goal verify current planning or work
truth without parsing owner prose or copying the owner's task state.

The owner remains authoritative. Consumers record only the semantic revision
they observed and fail closed when the owner changes.

## Receipt

An owner writes `owner-receipt.json` beside its canonical runtime state:

```json
{
  "schema": "bagakit.execution-owner-receipt.v2",
  "owner_kind": "feature_tracker",
  "owner_id": "f-example",
  "semantic_revision": "<stable semantic digest>",
  "lifecycle_status": "in_progress",
  "continuation": "continue",
  "active_item_ids": ["T-001", "T-002"],
  "blockers": [],
  "replacement_ref": null,
  "evidence_refs": [
    ".bagakit/feature-tracker/features/f-example/state.json",
    ".bagakit/feature-tracker/features/f-example/tasks.json",
    ".bagakit/feature-tracker/features/f-example/goal.md"
  ],
  "evidence_hashes": {
    ".bagakit/feature-tracker/features/f-example/state.json": "<sha256>",
    ".bagakit/feature-tracker/features/f-example/tasks.json": "<sha256>",
    ".bagakit/feature-tracker/features/f-example/goal.md": "<sha256>"
  }
}
```

Required behavior:

- `evidence_hashes` contains the current sha256 digest of every artifact in
  `evidence_refs`; keys must match exactly.
- optional canonical owner control files such as Feature Tracker `goal.md`
  enter both collections when their owner state declares them; orphan helper
  files must not silently become receipt evidence
- `semantic_revision` is the sha256 of canonical compact JSON over
  `owner_kind`, `owner_id`, `lifecycle_status`, `continuation`,
  `active_item_ids`, `blockers`, `replacement_ref`, and `evidence_hashes`.
  Timestamps, logs, and rendered projections do not affect it.
- `continuation` is one of `continue`, `blocked`, `complete`, `superseded`, or
  `unavailable`.
- `active_item_ids` is the sorted set of current-plan Tasks whose status is
  `in_progress`; it is derived from `tasks.json` and is empty when no Task is
  active.
- `blockers` is empty unless continuation is `blocked`. Task blockers contain
  `item_id`, `class`, and `reason`; owner-level blockers such as missing plan or
  workspace use `item_id = null`.
- `replacement_ref` is null unless another repo-relative owner artifact
  supersedes this owner.
- `evidence_refs` are existing repo-relative canonical owner artifacts. A
  missing file or hash mismatch makes the receipt invalid, including a crash
  between canonical owner mutation and receipt refresh.
- The owner refreshes the receipt in the same canonical mutation boundary as
  its state. A projection job must not invent a newer revision.

## Feature Goal Recovery

A Feature-owned `goal.md` does not persist a second owner binding or observed
receipt revision. Its binding is already canonical in
`state.json.goal_contract`, and the sibling `owner-receipt.json` includes the
Goal bytes in `evidence_hashes`.

Recovery rules:

- verify the receipt identity and all evidence hashes before using its
  continuation
- verify `state.json.goal_contract.ref` and `revision` against the co-located
  `goal.md`
- read active Tasks, blockers, and continuation from owner state rather than
  copying them into the Goal
- `continue` permits querying Tracker for runnable work or continuing an active
  Task; the receipt does not select or schedule the next Task
- `blocked` requires following the owner's blockers and independent-work rules
- `complete` means the Feature lifecycle is complete; the Goal does not carry
  its own completion flag
- `superseded` routes to `replacement_ref`
- `unavailable` blocks execution until an authoritative owner is restored
- a changed receipt revision requires re-reading owner state, not rewriting the
  stable Goal unless durable intent changed

## Boundary

The receipt is a typed handoff, not shared authority. It does not authorize a
consumer to update Feature Tracker, infer task completion, or replay owner
history. It does not carry runnable Task ids, Worker assignments, concurrency
policy, or Task-worktree topology.
