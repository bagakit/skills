# Supervision Contract

Stable authority: `docs/specs/supervisor-skill-contract.md`. This file is a
conditional operational projection; the stable spec wins on conflict.

Use this reference when a task needs a durable receipt, delegated work,
read-only evidence, recovery, or a disputed completion decision.

## Contents

1. Control brief
2. Owner binding
3. Route axes
4. Authority and identity
5. Evidence objects
6. Observation and intervention
7. Failure safety
8. Close-readiness
9. Path review

## Control Brief

Bind stable supervision intent before execution or correction:

- `outcome`: exact user-visible result
- `insufficiency`: productive-looking states that are not enough
- `resolution`: principle, design, implementation, or another owner-requested
  level that bounds fan-out depth
- `owner`: authoritative state ref, revision, and freshness evidence
- `authority`: who may mutate, review, merge, publish, or decide
- `evidence`: required artifact identities, verification, review, and acceptance
- `method`: only hard owner constraints or proof that a method cannot work
- `stop`: safety, budget, or terminal stop conditions
- `return`: conditions requiring an owner or human decision

Keep live assignments and chatter out of stable Goal truth. The receipt is a
read-only projection for one decision, not a second task system.

Use the cheapest representative owner-visible path as an early alignment oracle
when one exists. Do not treat elapsed time, local test volume, or component
polish as proof that the protected outcome is progressing.

## Owner Binding

Record:

- `owner_snapshot.ref`
- `owner_snapshot.revision`
- `owner_snapshot.evidence_refs[]`

Reconcile again when the owner revision, target artifact, external state, or
writer capability changes. A correct decision against an old revision is stale
evidence.

## Route Axes

Keep route dimensions separate:

| Axis | Tokens | Question |
| --- | --- | --- |
| topology | `single_agent`, `delegated` | Does execution use delegated actors? |
| assurance | `standard`, `audit`, `blocking_review` | What independent evidence can block? |
| lifecycle | `normal`, `recovery` | Is this ordinary execution or a takeover? |

Human-facing recipes combine these axes. A recovery run may also use blocking
review; an audit may use one synthesis writer outside the protected source
scope.

Route selection is a cost and risk judgment. It is not a maturity ladder.

## Authority And Identity

Keep these identities separate:

- logical `task_id`
- execution `attempt_id`
- `worker_id`
- owner revision
- current artifact identity
- optional host completion or writer capability

One task's attempts are a same-role lineage:

- `writer` attempts mutate inside one declared write root
- `auditor` attempts have no source write root and bind before/after source
  identity
- reviewers are recorded in `reviews[]`, not mixed into writer attempts

Default authority:

- one integration owner
- independent read-only reviewers
- multiple writers only with explicit authorization, attributable effects,
  relevant peer awareness, and one integration owner
- human gates only for outcome, acceptance, authority, privacy, publication,
  cost, production, safety, or irreversible boundaries

When parallel writers are not authorized, a ready writer waits while a current
writer is still running. Do not recommend a second dispatch and rely on later
validation to detect the overlap. Treat ambiguous exclusive authority the same
way.

When parallel writers are authorized, a shared tree, write root, file, or
mixed commit does not by itself invalidate authority. Keep each effect
attributable, name the integration owner, expose relevant collaborators and
shared hotspots through their Sets, and let affected Agents coordinate
directly. Preserve valid work and continue outside the conflict cone. Pause
only the affected work for an actual incompatible edit or unclear intent;
fence or escalate for stale or unauthorized writers, dangerous history
mutation, or unknown irreversible effects.

Resolve the integration owner from represented current writer identities. If
any current writers are running, the integration writer is one of their
`worker_id` values. Otherwise, if current writers have succeeded, it is one of
those succeeded writers. A single eligible writer must match exactly; an
authorized parallel group cannot name a ghost merge owner outside the group.

Before replacement, fence every non-current running or succeeded writer:

- add its attempt id to `stale_attempt_ids`
- set authority state to `fenced` or `released`
- preserve host fence, release, or isolation evidence

Do this before the late result, not after it.

## Evidence Objects

### Artifact

Every attempt artifact and verification/review target uses:

- `ref`
- `identity`
- `evidence_refs[]`

Identity may be a content hash, immutable object version, owner revision plus
digest, or another stable owner-native identity. A path is not an identity.

### Verification

Record:

- target attempt
- `not_run`, `pass`, or `fail`
- exact target artifact identities
- evidence refs

Passing verification with no evidence or against a previous artifact identity
does not satisfy close-readiness.

### Review

Each terminal review cycle records:

- review and reviewer ids
- target writer attempt
- exact target artifact identities
- `pass`, `advisory`, or `blocking` verdict
- findings and evidence refs
- before/after source identity plus authority evidence

If the target changes before review completes, discard the verdict and review
the current identity. Completed cycles are chronological, append-only history:
a historical review remains bound to the historical identity in its own
`target_artifacts`, even when that identity is no longer the target attempt's
current artifact.

Any recorded blocking verdict creates a repair obligation, regardless of
`requires_review`. Repair requires a later pass or advisory review on the
current repaired artifacts, and their identity set must differ from the
blocking cycle. Re-reviewing unchanged content or setting a boolean reverified
flag cannot discharge the block.

### Accepted Artifact

Checkpoint acceptance records:

- artifact ref
- identity
- attempt id

It must join a current succeeded attempt. A stale attempt cannot donate an
accepted artifact merely because it wrote the same path.

## Observation And Intervention

Running work records one next observation condition:

- host event or worker completion
- predicted material transition
- credible external predicate
- adaptive deadline
- human-requested boundary

Do not observe if the result cannot change the next action.

Recommend `observe_on_next_condition` only while observation budget remains and
the condition is non-empty and material. A missing condition requires evidence;
an exhausted observation budget requires checkpoint or handback. These
preconditions also apply when an earlier intervention effect is pending.

One intervention records:

- target attempt and named drift
- observation refs
- delivered action refs
- effect status
- effect refs when known

Rules:

- `pending`: observe before another correction
- `unresolved`: inspect and change diagnosis or method
- `resolved`: restore aligned state and preserve the historical episode
- never append another intervention while the prior effect is open
- never recommend a new corrective intervention when intervention budget is
  exhausted

An intervention with no observation or delivery evidence is post-hoc prose.

## Failure Safety

Record four orthogonal facts rather than one failure label:

1. cause
2. scope
3. external-effect state
4. authority state

Use this priority:

1. `effect_state=unknown` → authoritative readback; no retry
2. `authority_state=ambiguous` → freeze and rebind
3. `scope=unknown` → inspect before restart
4. `scope=shared_domain` plus provider evidence → scoped circuit
5. known cause and scope → bounded retry, method change, dependency-cone
   restart, human handback, or stop

A failed attempt must have a non-`none` cause and non-`none` scope. `none` does
not silently mean lane-local.

This permits combinations such as a logic defect with an outcome-unknown
external mutation. Safety uncertainty outranks repair convenience.
It remains live anywhere in the retained attempt lineage; replacement or
fencing alone cannot turn an unknown effect, ambiguous authority, or unknown
scope into resolved evidence. Any one of those states makes the whole logical
task ineligible for close-readiness and dependency satisfaction until new
evidence resolves it.

`known_applied` does not authorize replay. Receipt v1 contains no owner-bound
replay or idempotency authorization, so do not retry or restart any action that
may reissue that mutation. Preserve and reconcile forward from the applied
effect, or hand back; unknown extension fields cannot grant v1 replay
authority.

## Close-Readiness

A task is ready only when:

- current attempt succeeded
- prior writers are fenced
- all required artifacts have current identities
- verification passed on those identities
- required independent review passed on those identities
- blocking repair has a later nonblocking current review on a changed identity
- owner acceptance evidence exists
- drift is aligned
- intervention effects are resolved
- audited source identity is stable
- no retained attempt has unknown effect, ambiguous authority, or unknown scope

The checker reports `report_task_ready` or `report_run_ready`. The owner performs
the actual lifecycle transition.

Final owner-reported closure additionally requires:

- every required task complete
- optional tasks complete or cancelled, with no live current writer on a
  cancelled task
- no open circuit
- no unresolved blocking finding
- terminal checkpoint

Cancellation is not terminal while a current writer is running or retains
`current` or `ambiguous` authority. Fence or release that writer with authority
evidence, then reconcile cancellation.

If the owner already projects `run_status=complete` while any close predicate
is false, apply a decision-wide false-completion guard. It forbids mutation,
dispatch, retry, restart, repair, reviewer dispatch, and task/run readiness
until owner truth is reconciled. Do not let it suppress a higher-priority effect
readback or writer fence.

Before producing ordinary task actions, scan every retained attempt and owner
state for safety locks. A readable unknown effect, ambiguous authority, unknown
scope, open or newly implicated circuit, or false completion must survive
unrelated receipt errors and outrank `repair_receipt`, execution, observation,
or readiness. If malformed input prevents classification, fail closed.

## Comparative Evidence

Do not score Agent-authored worker counts, route prose, or intervention stories
as host facts.

For audited or comparative use, bind claims to host events or external oracles:

- route choice before execution
- spawn, observe, wait, message, cancel, fence, retry, and restart
- authority grant and revoke
- source and artifact snapshots
- external mutation, timeout, readback, and effect identity
- wall time, tokens, and tool calls when available

Unavailable telemetry is `unknown`, not zero.

## Path Review

Summarize only decision-bearing facts:

1. owner revision and route axes
2. current writer and stale fences
3. named drift, intervention, and effect
4. accepted or invalidated artifact identities
5. verification and review lineage
6. failure safety axes and circuit evidence
7. budget use
8. close-readiness or next safe action

Keep raw transcripts and host traces as secondary incident evidence.
