# Validation Authority Inversion

This study is optional background for implementation tasks that add or change
quality gates, structured model output, correction prompts, retries, evidence
selection, or other admission protocols.

## Name

Use `validation authority inversion` when a system owner already possesses a
fact but delegates exhaustive restatement of that fact to a less reliable
model or caller, then hard-gates progress on the restatement.

The narrower recurring form is an `exhaustive echo gate`:

- the owner holds a complete inventory or canonical record
- the external actor must repeat every item and duplicate metadata
- the validator checks the repeated copy instead of deriving owner-known facts
- omissions or subjective disagreements become protocol failures

The problem is not exhaustive checking itself. Owners should exhaustively check
security, permission, membership, identity, protocol, and atomicity when the
risk requires it. The inversion occurs when the owner makes a fallible actor
reproduce facts the owner could validate directly.

## Failure Chain

1. A host owns a canonical inventory or receipt.
2. A model makes one bounded decision over that inventory.
3. The protocol requires the model to restate the whole inventory plus reasons,
   classifications, or quality judgments.
4. The hard gate rejects an otherwise useful decision because the restatement
   is incomplete or disagrees with a subjective policy.
5. Correction asks for more output than the original attempt.
6. Payload size, contradiction surface, and parse risk grow with every retry.
7. The system exhausts retries or emits a degraded result even though the host
   already possessed the facts needed for a smaller valid contract.

An observed bad case had a host-owned inventory of 114 matched sources. The
model selected 7 useful sources but was required to return four fields for all
114 entries. Rejection expanded the correction payload; subsequent attempts
became malformed and exhausted the retry budget.

## Red Flags

- model output cardinality grows with a host-owned inventory instead of the
  actual decision
- `referenced == matched`, one-decision-per-item, or full unselected ledgers
- a model must echo titles, timestamps, paths, identities, or counts already in
  an owner receipt
- relevance, sufficiency, coverage quality, style, or preference becomes an
  admission hard gate
- correction payload is larger or broader than the rejected submission
- retries compensate for a validator that cannot distinguish deterministic
  facts from subjective judgment
- tests prove exhaustive echo rather than the user-visible outcome

## Good Case

Keep canonical facts and deterministic validation with the owner:

- the host stores the full inventory, identity, membership, and digest
- the model returns only the irreducible decision delta, such as selected IDs
  or one bounded classification
- the host validates type, uniqueness, membership, authority, idempotency, and
  atomicity
- the host derives counts and repeated metadata from its own receipt
- subjective relevance or sufficiency is advisory, reviewed after artifact
  production, or explicitly owned by a human decision
- correction names only the invalid field and reduces the next action

Good-case proof:

- output size follows decision size, not inventory size
- owner-derived facts remain correct when the model omits duplicated metadata
- malformed or unauthorized decisions still fail closed
- a valid small decision can complete without a full echo
- correction is monotonic: narrower, local, and no harder than the first
  attempt

## Bad Case

Do not repair an exhaustive echo gate by adding:

- a larger schema or token budget
- a second parser or compatibility projection
- default reasons for missing entries
- another retry or repair model
- keyword rules that guess relevance or quality
- a fallback that silently claims success

Those changes preserve the inverted authority and make its compensation stack
more capable.

## Failure Boundaries

This principle does not forbid:

- exhaustive owner-local allowlist, permission, membership, or safety checks
- a user-requested exhaustive report as the actual product output
- full external records required by an explicit downstream contract when the
  owner cannot derive them
- exact wording or complete fields when those are themselves the owned behavior

Even in those cases, separate owner-known facts from external decisions and
avoid asking a model to regenerate deterministic data the host can compose.

## How To Use In Coding

Before adding or widening a hard gate, answer:

1. Which owner possesses each required fact?
2. What is the smallest decision the model or caller must contribute?
3. Can the owner derive the remaining fields from canonical state?
4. Does output size scale with the real decision or with duplicated inventory?
5. Is each blocking condition truth/safety/protocol, or subjective quality?
6. Will rejection make the next attempt smaller and more local?
7. Does the proof show user behavior, or only compliance with the echo scaffold?

If owner-known facts dominate the external payload, redesign the contract
before adding correction or retry machinery.

## Relationship To Compensatory Complexity

Validation authority inversion often starts a correction cascade. The echo
gate creates failures, retries compensate for those failures, and repair layers
then compensate for malformed retries. Use
`compensatory-complexity-runaway.md` when that stack has become an active
subsystem with its own states and exceptions.
