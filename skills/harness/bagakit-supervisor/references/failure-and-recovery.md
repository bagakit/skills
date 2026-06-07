# Failure And Recovery

Stable authority: `docs/specs/supervisor-skill-contract.md`. This file is a
conditional operational projection; the stable spec wins on conflict.

Read this reference when an attempt fails, a premise is stale, a provider or
host degrades, an external effect is uncertain, a reviewer blocks, or a new
Agent takes over existing work.

## Contents

1. Safety-first classification
2. Orthogonal failure fields
3. Disposition order
4. Restart scope
5. Circuit behavior
6. Stale premise and attempt fencing
7. Recovery
8. Stop and handback

## Safety-First Classification

Before retrying, establish:

1. whether an external side effect may already have happened
2. whether current writer authority is valid, released, fenced, or ambiguous
3. whether the failure scope is lane-local, dependency-shaped, shared, or
   unknown
4. the likely cause
5. whether the same method can plausibly succeed
6. whether restart, intervention, observation, and human budgets permit another
   action

When evidence is insufficient, inspect or stop. Do not use retry as diagnosis.

## Orthogonal Failure Fields

### Cause

| Token | Meaning |
| --- | --- |
| `none` | no failed-attempt cause |
| `transient_transport` | temporary lane transport or capacity failure |
| `logic_defect` | implementation, reasoning, or verification method failed |
| `dependency` | upstream state invalidated dependent work |
| `provider_fault` | provider auth, quota, policy, or availability fault |
| `human_decision` | progress needs a decision-bearing human choice |
| `restart_exhausted` | bounded restart intensity is spent |

### Scope

| Token | Meaning |
| --- | --- |
| `none` | no failed scope |
| `lane` | one attempt only |
| `dependency_cone` | downstream work whose input became invalid |
| `shared_domain` | one provider or host execution domain |
| `unknown` | insufficient evidence to invalidate safely |

`none` is valid only when no failed-attempt scope is being asserted. An attempt
with `status=failed` requires a non-`none` cause and a non-`none` scope; a
missing scope is not evidence for lane-local retry.

### External Effect State

| Token | Meaning |
| --- | --- |
| `not_applicable` | no relevant external mutation |
| `known_not_applied` | authoritative evidence says it did not happen |
| `known_applied` | authoritative evidence says it happened |
| `unknown` | request outcome is uncertain |

### Authority State

| Token | Meaning |
| --- | --- |
| `current` | attempt currently owns its declared capability |
| `released` | attempt ended and released authority |
| `fenced` | host or reconciliation rejects further current writes/results |
| `ambiguous` | ownership cannot be established safely |

A failed attempt may be `logic_defect + lane + unknown effect + ambiguous
authority`. Do not collapse that into one label.

## Disposition Order

Use the first applicable safety guard:

1. Unknown effect:
   - freeze the affected side-effect cone
   - preserve lease, business key, idempotency key, and attempt identity
   - read back authoritative external state
   - retry only after proving the effect did not occur
2. Ambiguous authority:
   - stop overlapping mutation
   - freeze, fence, or isolate the old writer
   - rebind before replacement
3. Unknown scope:
   - inspect dependencies and shared state
   - stop instead of guessing a restart cone
4. Shared provider domain:
   - require host or multi-lane evidence
   - open the affected circuit
   - preserve completed work and continue healthy domains
5. Known cause and scope:
   - transient lane → new attempt when budget remains
   - logic defect → change method or enter repair-review
   - dependency cone → repair upstream and restart only invalidated dependents
   - human decision → hand back with bounded evidence
   - restart exhausted → checkpoint and stop

Apply one additional replay guard before every cause-driven disposition:
`effect_state=known_applied` is not retry permission. Receipt v1 has no
owner-bound idempotency or replay authorization, so preserve the applied effect
and reconcile forward, or hand back. Never retry, restart, or replace in a way
that may reissue the external mutation. This guard does not hide a simultaneous
authority, scope, or circuit lock. Apply it across retained attempt lineage;
receipt v1 cannot satisfy dependents or report close-readiness while that
reconciliation remains outstanding.

Derive these guards across every retained attempt before ordinary actions or
receipt repair. A discoverable unknown effect, ambiguous authority, or unknown
scope remains the decision-wide priority even when another field is invalid.

## Restart Scope

Choose the smallest valid scope:

- one attempt for a known lane-local transient failure
- downstream cone for proven invalidated inputs
- coupled group only when shared state makes partial recovery unsafe
- whole run only when no accepted artifact can be trusted

Every retry uses a new attempt id. Preserve accepted artifacts. Fence prior
running or succeeded writers before making the replacement current.

Do not let replacement hide unresolved history. An old attempt's unknown
external effect, ambiguous authority, or unknown scope remains a safety lock
after fencing until authoritative evidence updates that axis.

Such a retained lock makes the logical task incomplete for readiness,
dependency satisfaction, and final validation. Do not let a succeeded
replacement donate closure around unresolved history.

Bound restart intensity. When the same signature recurs, change method, open the
right circuit, or stop; do not replay the same prompt.

## Circuit Behavior

Open a circuit only from evidence of a shared execution domain.

While open:

- stop new affected starts and retries
- cancel or fence affected work when the host can do so safely
- preserve completed lane artifacts
- continue independent domains
- record a credible recheck predicate or hand back

Distinguish:

- 429/503 capacity: bounded backoff and one canary before gradual recovery
- disabled authentication, organization policy, or unavailable credentials:
  typed waiting, external repair, or an already-authorized independent domain;
  no prompt change or fan-out can fix it

Closing requires new evidence, not elapsed time alone.

## Stale Premise And Attempt Fencing

Before mutation, compare the delegated premise with the owner revision and
current artifact state.

Return `stale_premise` when:

- required behavior already exists
- a newer revision replaced the instruction
- the mutation boundary no longer targets current state
- another accepted attempt already owns the result

Do not mutate. Reconcile with the owner.

Before replacement:

- create a new attempt id
- revoke, release, or isolate the prior writer capability
- record authority evidence
- mark prior running or succeeded attempts stale
- reject their later result as current evidence

Portable receipt validation can detect missing fences. Only the host can enforce
transport cancellation or capability revocation.

## Recovery

A fresh supervisor should recover from bounded current truth without reading the
full transcript.

Inspect in this order:

1. stable objective and owner snapshot
2. current owner task or work-item truth
3. repository, artifact, and external-effect state
4. current and prior writer attempts plus authority evidence
5. accepted artifact and verification identities
6. review cycles and unresolved findings
7. open circuits and remaining budgets
8. next safe action and forbidden retries

Freeze or fence old writers before assigning a replacement. Resume only the
missing or invalidated cone. If owner revision, authority, dependency scope, or
external effect cannot be established, stop and hand back.

## Stop And Handback

Before completion, Agent input cannot authorize voluntary Supervisor stop;
apply the two-message Owner rule. Host or safety holds remain immediate and do
not close the Goal.

Stop with a compact checkpoint when:

- authority is ambiguous
- external effect remains unknown after available readback
- restart, intervention, or observation budget is exhausted
- a provider circuit has no credible recheck predicate
- dependency scope cannot be proven
- human approval can change outcome, acceptance, privacy, cost, safety,
  publication, production, or an irreversible action

An observation action additionally requires a non-empty material observation
predicate; pending effect alone is not a predicate. When its predicate is
missing or observation budget is exhausted, checkpoint or hand back instead of
recommending observation. Confirmed drift likewise cannot authorize a new
corrective action after intervention budget is exhausted.

Report owner revision, preserved artifact identities, failure axes, evidence,
attempted dispositions, and one next safe action. Without confirmed early stop,
remain checkpointed or waiting rather than releasing the unfinished Goal.
