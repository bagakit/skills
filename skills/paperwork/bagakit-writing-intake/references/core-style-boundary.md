# Core And Style Boundary

Intake, Core, and Style own different decisions.

## Intake Owns Diagnosis

Intake may say:

- what task route appears to be requested
- what evidence exists and what is missing
- what language-profile observations are supported
- what strengths and frictions appear in the samples
- what style rules are candidates, with confidence and rollback conditions
- what Core risks should be checked next
- whether ordinary, Core-clarity, or controlled-technical precision is the
  best downstream route

Intake must not say that a final draft is good enough.
Intake must not apply a controlled vocabulary, fixed sentence limit, or
procedure rule merely because `clarity_routing` selects a stricter route.

## Core Owns Universal Quality

`bagakit-writing-core` owns:

- foundation sufficiency
- title promise and task fit
- evidence architecture
- structure and paragraph movement
- semantic preservation and no-regression checks
- clarity and audience fitness
- final confirmation or rejection of Core vetoes

Intake can emit `core_risk_candidates`; Core decides whether they become actual
blocking vetoes.

## Style Owns Taste Overlay

Style skills such as `qihan-writing` own:

- personal or team taste
- priority order among otherwise valid choices
- channel defaults and casebook examples
- preferred rhythm, sharpness, metaphor posture, and final voice

Style may not override Core checks. If style pressure causes semantic drift,
evidence loss, task mismatch, or audience confusion, Core wins.

## Default Composition

Use this order for non-trivial writing work:

1. Intake emits `intake_packet`.
2. Core reads the packet and checks universal quality risks.
3. De-AI-tone runs when final prose or polished rewrite is in scope.
4. Style overlay applies taste only after Core has enough foundation.
5. Delivery skill packages the final artifact when needed.

## Boundary Smells

- Intake starts writing the final draft.
- Core starts storing personal style samples.
- Style skips evidence preservation because the sentence sounds better.
- A private sample becomes installable skill content.
- A one-off user edit becomes a universal rule without confidence or rollback.
