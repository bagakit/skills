---
name: bagakit-entropy-review
description: Review a skill, project, article, plan, validation stack, or other authored artifact for avoidable decision, coordination, navigation, change, and proof burden. Use when an Agent should identify unnecessary entropy, over-validation, duplicated truth, route overload, or a safer simplification while preserving required behavior and evidence. Not a literal information-theory measure, generic quality score, automatic rewrite, or replacement for domain review.
metadata:
  bagakit:
    harness_layer: l2-behavior
---

# Bagakit Entropy Review

Find burden the artifact does not need, without deleting complexity that
protects its purpose.

Here, `entropy` is a Bagakit diagnostic shorthand for avoidable decision,
coordination, navigation, change, and proof burden for a named actor and task.
It is not Shannon entropy, a bit count, readability, code complexity, or an
overall quality score.

## Boundary

Own the cross-artifact review frame, burden profile, necessity test, and
smallest safe optimization recommendation.

Do not:

- replace domain correctness, safety, security, legal, accessibility,
  architecture, editorial, or owner-acceptance review
- infer that shorter text, fewer files, fewer branches, or fewer checks is
  automatically better
- turn a subjective review or model score into a release gate
- mutate the artifact unless the user separately asks for implementation
- create a persistent Bagakit runtime surface by default

The stable vocabulary is in
[`references/review-contract.json`](references/review-contract.json). Read
[`references/artifact-lenses.md`](references/artifact-lenses.md) only for the
matching object type or a needed countercase.

## Review Flow

### 1. Bind the frame

Name:

- exact artifact and included boundary
- object type and primary actor
- task the artifact must support
- required outcomes
- protected obligations such as authority, safety, irreversibility,
  acceptance, compliance, independent proof, observability, or recovery
- assessment use: diagnostic, comparison, or gate
- evidence inspected and material evidence not inspected
- compatible baseline when comparison is requested

If a missing frame element could reverse the decision, abstain. `Unnecessary`
has no stable meaning without this frame.

### 2. Establish the necessity floor

Map apparent complexity to the behavior, meaning, environmental state, risk,
owner boundary, evidence route, or recovery property it uniquely protects.

Existing structure does not prove necessity. A retained element needs a
current contribution or an explicit unresolved protection question.

### 3. Rate the applicable profile

Use only dimensions that can change the decision:

- `meaning`: avoidable interpretation work around purpose, terms, ownership,
  or action
- `structure`: avoidable navigation, layering, disclosure timing, or
  fragmentation
- `choice`: avoidable routes, modes, exceptions, or local judgments
- `coupling`: avoidable synchronization, dependency, handoff, or change
  propagation
- `proof`: validation, review, or evidence burden beyond justified decision
  risk

Use the ordered bands from the contract:

- `E0`: necessary or clear
- `E1`: contained local friction
- `E2`: material avoidable burden with a visible smaller form
- `E3`: dominating or systemic avoidable burden

Do not sum, average, subtract, or convert the bands into percentages. Counts
locate suspicion; they do not determine a band. Use `n/a` when a dimension is
not activated and `unknown` when missing evidence could change the rating.

### 4. Protect non-compensatory boundaries

Use no more than the three contract gates:

- `G0 frame`: an invalid frame requires `abstain`
- `G1 preservation`: a reduction that loses a protected outcome requires
  `retain` or `review`
- `G2 decision authority`: a comparison or gate without owner authority and
  two-sided error rules stays advisory or incomparable

A failed gate cannot be offset by strong dimensions elsewhere.

### 5. Compare real counterfactuals

For each material finding, compare the smallest relevant options:

- preserve
- delete or merge
- move or defer
- derive or script
- add or clarify

Choose the option that lowers total burden while preserving the same accepted
result. Adding one bridge or moving conditional detail can reduce more entropy
than deletion. Splitting a coherent artifact can increase handoffs and
duplicated context.

### 6. Stop proportionally

Finish with one disposition:

- `retain`
- `reduce`
- `review`
- `increase-with-evidence`
- `mixed`
- `abstain`

For every `E2` or `E3` finding, report `limited`, `medium`, or `robust` support
with the reason. Keep evidence support, independent-assessor agreement, and
outcome calibration separate. Default to `agreement = n/a` for one assessor
and `calibration_status = uncalibrated` until observed outcomes justify more.

Stop when another check or review cannot change the action, add meaningfully
independent evidence, or satisfy an owned boundary at justified cost.

## Over-Validation

Assess a `check -> evidence -> decision` path, not a check count.

- `boundary-proof`: required by authority, acceptance, safety,
  irreversibility, or contract
- `incremental-proof`: adds unique or meaningfully independent evidence that
  can change the action
- `advisory`: useful diagnosis without an owner-owned blocking action
- `duplicate-ceremony`: correlated evidence, no distinct protected failure,
  and no possible decision change
- `unresolved`: owner, claim, consequence, evidence route, or decision is
  missing

Preserve required and independent proof. Demote or consolidate ceremony.
Reopen validation after a covered artifact change, expired assumption, new
material failure, changed acceptance criterion, or higher owner assurance bar.

## Output

Return a compact packet:

```text
Frame: artifact, object type, actor/task, required outcomes, protected obligations, assessment use, evidence window, baseline when applicable
Gates: G0/G1/G2 with reasons
Profile: meaning / structure / choice / coupling / proof
Attention band: E0-E3 or indeterminate
Material findings: evidence, protected-case check, support
Disposition: retain | reduce | review | increase-with-evidence | mixed | abstain
Smallest safe action: one bounded action or none
Checks not run: only omissions that could be mistaken for evidence
Agreement: n/a | aligned | mixed | disputed
Calibration: uncalibrated | agreement_observed | outcome_calibrated
```

`Attention band` is the highest sufficiently supported active dimension. It is
a review-priority score, not quality, correctness, usefulness, maturity, or
capability. Never rank artifacts within one band.

## Comparison And Self-Review

Compare only compatible frames and evidence windows. One candidate is lower
only when it is no worse on every active common dimension, lower on at least
one, and preserves all gates. Otherwise report `incomparable` unless an
authorized priority resolves the trade-off.

Apply this skill to itself with one counterfactual pass: map every mandatory
field, route, and check to a distinct decision or protected failure; merge
items without unique contribution; exercise one case where a shorter skill
would lose necessary variety; then stop. Self-review cannot certify the skill
or upgrade calibration.

For the repository-owned stable semantics, see
`docs/specs/artifact-entropy-review-contract.md` in the canonical Bagakit
repository.
