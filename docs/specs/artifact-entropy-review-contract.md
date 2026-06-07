# Artifact Entropy Review Contract

## Purpose

This specification defines Bagakit's stable meaning of generalized artifact
entropy review.

Use it when a skill, project, article, plan, validation stack, or other
authored artifact needs a comparable diagnosis of avoidable burden without
weakening its required result.

## First Principle

Protect the artifact's purpose first. Then minimize avoidable decision,
coordination, navigation, change, and proof burden across the whole affected
system.

`Entropy` is Bagakit diagnostic shorthand. It is not:

- Shannon entropy or semantic bits
- minimum description length or Kolmogorov complexity
- raw size, readability, cyclomatic complexity, file count, or check count
- overall quality, correctness, usefulness, maturity, or capability

Formal and empirical sources may supply bounded observables and countercases.
They do not create one representation-independent cross-artifact unit.

## Ownership

`bagakit-entropy-review` owns:

- the assessment frame
- the protected necessity floor
- the five-dimension burden profile
- ordered attention bands
- non-compensatory protection gates
- counterfactual reduction and stop semantics
- the distinction between necessary proof and duplicate ceremony

It does not own:

- domain correctness or quality standards
- safety, security, legal, accessibility, architecture, editorial, or
  acceptance authority
- artifact mutation
- repository promotion
- release gating
- empirical calibration of a model reviewer

Owning domain workflows may accept, reject, or refine a recommendation.

## Assessment Frame

Every review binds:

- exact artifact identity and included boundary
- object type
- primary actor and task
- required outcomes
- protected obligations
- assessment use: diagnostic, comparison, or gate
- inspected evidence window and material omissions
- compatible baseline for before/after comparison

If a missing frame element could reverse the result, the correct disposition
is `abstain`.

## Necessity Floor

An element may be protected when evidence traces it to:

- required behavior or semantic meaning
- a distinct environmental state, user need, hazard, or failure
- authority, safety, security, irreversibility, compliance, or acceptance
- independent evidence or endpoint correctness
- observability, containment, recovery, or fault tolerance
- change containment or an explicit owner boundary

Existing structure is not proof of necessity. Removal is not safe merely
because the element looks repetitive or costly.

## Burden Profile

The stable dimensions are:

- `meaning`
  - avoidable interpretation work around purpose, terms, ownership, or action
- `structure`
  - avoidable navigation, layering, disclosure timing, or fragmentation
- `choice`
  - avoidable branches, modes, exceptions, or local judgments
- `coupling`
  - avoidable synchronization, dependency, handoff, or change propagation
- `proof`
  - validation, review, or evidence burden beyond justified risk and owned
    acceptance

Object-specific lenses map observations to this core. A lens should not add a
sixth dimension merely to preserve domain vocabulary.

## Attention Bands

The profile uses ordinal categories:

- `E0 — necessary or clear`
- `E1 — contained local friction`
- `E2 — material avoidable burden`
- `E3 — dominating or systemic avoidable burden`

The bands are not equal intervals. Do not sum, average, subtract, multiply,
convert to percentages, or use decimals. `n/a` means a dimension was not
activated. `unknown` means missing evidence could change the rating.

An optional `attention_band` is the highest sufficiently supported active
dimension. It schedules review attention; it does not rank artifact quality.
Artifacts within one band have no implied order.

## Protection Gates

The stable non-compensatory gates are:

- `G0 frame`
  - an invalid frame forces `abstain`
- `G1 preservation`
  - a change that may lose a protected obligation forces `retain` or `review`
- `G2 decision authority`
  - an unauthorized comparison or gate remains advisory or incomparable

Gate statuses are `pass`, `fail`, `unknown`, or `n/a`. A failed gate cannot be
offset by strengths elsewhere.

## Counterfactual And Disposition

For a material finding, compare the applicable actions:

- preserve
- delete or merge
- move or defer
- derive or script
- add or clarify

Choose the smallest action that lowers total burden while preserving the same
accepted result. Addition and consolidation are both valid entropy reductions
when they remove more downstream work than they add.

The disposition is one of:

- `retain`
- `reduce`
- `review`
- `increase-with-evidence`
- `mixed`
- `abstain`

Every `E2` or `E3` finding reports `limited`, `medium`, or `robust` support
with its rationale and evidence. Finding support, independent-assessor
agreement, and observed-outcome calibration remain separate.

## Validation Necessity

Review validation as a `check -> evidence -> decision` path.

- `boundary-proof`
  - required by authority, acceptance, safety, irreversibility, or contract
- `incremental-proof`
  - unique or meaningfully independent evidence that can change the action
- `advisory`
  - useful diagnosis without an owned blocking action
- `duplicate-ceremony`
  - correlated evidence, no distinct protected failure, and no possible
    decision change
- `unresolved`
  - owner, claim, consequence, evidence route, or decision is missing

Continue while a protected floor is unsatisfied, a material decision can
still change through independent evidence, residual risk exceeds authorized
tolerance, or a material contradiction or stale claim remains.

Stop when required floors and acceptance evidence are satisfied, residual
risks and gaps are visible and owned, the best next check cannot change the
action or adds no independent evidence at justified cost, and no
high-consequence failure lacks its required route.

Reopen after a covered artifact change, expired assumption, new failure,
changed acceptance criterion, or higher owner assurance bar.

## Comparison

Compare only the same artifact boundary, actor task, required outcomes,
protected obligations, and evidence window.

Candidate A is lower than B only when A is no worse on every active common
dimension, lower on at least one, and preserves the gates. Otherwise the
result is `incomparable` unless an authorized, predeclared priority resolves
the trade-off.

## Skill Corpus Baseline

A repository-wide skill census should:

1. freeze one worktree snapshot and complete corpus inventory
2. inspect equal evidence classes for every skill
3. publish the five-dimension profile, attention band, gates, support,
   disposition, one preserve observation, and one smallest safe action
4. double-rate only `E3`, gate failures, disposition-changing boundary cases,
   and a predeclared cross-family overlap set
5. report band distributions and repeated mechanisms rather than average
   family scores or a quality league table

The first baseline is `uncalibrated`. Agreement may be observed after
independent overlap review. `Outcome_calibrated` requires later observed
results on cases not used to set the anchors.

## Self-Assessment

The skill may perform exactly one self-pass on a versioned candidate:

1. map every mandatory field, route, warning, and check to a distinct decision
   or protected failure
2. remove or merge items without unique contribution
3. exercise one case where a shorter artifact loses necessary variety
4. stop when another pass would not change a user-facing action, artifact, or
   verification decision

Self-assessment is not independent agreement and cannot certify the skill,
authorize a gate, or upgrade calibration.

## Runtime And Evidence Surfaces

- installable runtime owner:
  - `skills/harness/bagakit-entropy-review/`
- stable structured contract:
  - `skills/harness/bagakit-entropy-review/references/review-contract.json`
- persistent Bagakit runtime surface:
  - none by default
- release-blocking structural proof:
  - `gate_validation/skills/harness/bagakit-entropy-review/`
- non-gating cases and corpus baselines:
  - `gate_eval/skills/harness/bagakit-entropy-review/`

The review may consume caller-provided artifacts and emit ordinary response
text or an owner-chosen task artifact. It does not require a new `.bagakit/`
control plane.
