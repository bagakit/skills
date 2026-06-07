# Supervisor Health

Stable authority: `docs/specs/supervisor-skill-contract.md`. This file is a
conditional operational projection; the stable spec wins on conflict.

Read this reference after compact, resume, handoff, takeover, suspected
Supervisor drift, consequential intervention, recovery, or pre-close assurance.

## Contents

1. Health model
2. Admission sentinels
3. Compact-safe packet
4. Fresh semantic auditor
5. Disagreement and recursion stop
6. Evaluation boundary

## Health Model

Supervisor health is a vector, not a blended score:

- `context_integrity`: decisive evidence is present, attributable, and not
  displaced or contradicted
- `memory_fidelity`: the saved packet points faithfully to primary truth
- `owner_freshness`: Owner revision and authority remain current, and durable
  supervision changes are reconciled into owner truth rather than left as
  chat-only overrides
- `goal_understanding`: the Supervisor's current interpretation of the user's
  real desired result is bound to primary evidence; authorized truth and
  unarticulated candidate outcomes are distinct, and decision-changing
  ambiguity is visible rather than filled by assumption
- `outcome_ownership`: the control policy binds the next Goal-derived result
  and boundary, advances material verified progress, and does not confuse
  ceremony, activity, a delivered message, or resultless waiting with
  convergence
- `goal_seeking_initiative`: the Supervisor keeps goal understanding upstream
  of optimization, then captures high-value permission-valid control
  opportunities or deliberately rejects them with an effect/authority reason;
  activity is not used as a proxy
- `team_capacity_truth`: any topology decision uses current Host-observed role,
  authority, target, assignment, result predicate, material liveness, load, and
  conflict evidence rather than roster presence or utilization
- `worker_goal_assimilation`: a newly dispatched Worker has an actionable
  current outcome and proof model; clear truth leads directly to action while a
  material mismatch is reconciled before affected commitment
- `communication_clarity`: user- and Worker-facing messages state the concrete
  result or problem, needed action, and settling proof in receiver-language
  terms while preserving necessary technical identifiers
- `communication_binding_freshness`: the current logical user route, cadence,
  maximum staleness, language, explanation level, emphasis, and special
  constraints are bound to a current user or Owner revision and refreshed
  after recovery or failure
- `user_visibility`: every completed review round produces one truthful,
  result-first user conclusion; low-level observations do not create chatter,
  same-question facts coalesce, a maximum-staleness fallback prevents silence,
  and blockers, material risks, corrections, and decisions surface promptly
- `report_admission`: startup establishes an event-driven Worker return channel
  for results, evidence, mismatches, blockers, decisions, and assigned verdicts
  without timer-based narration or repeated alignment ceremony
- `executor_efficiency`: the delivery deadline follows the AI team's measured
  wall-clock critical path rather than summed human effort or avoidable idle,
  and any claimed waste has an ex-ante credible same-constraint alternative
- `attention_coherence`: one current control question owns a bounded evidence
  cone; unrelated leads are deferred and preemption is explicit
- `reasoning_health`: diagnosis distinguishes evidence, inference, unknown, and
  alternative cause
- `runtime_liveness`: Host observation and communication paths remain usable

These dimensions fail independently. A faithful summary may preserve an
expired Goal. An active session may be unreachable. A polished rationale may be
wrong. A delivered message may have no effect.

Keep Owner, identity, authority, effect, and closure predicates as hard facts.
Never average them away with a high semantic score.

## Admission Sentinels

At every admission-sensitive boundary, check deterministically when the Host
can expose the fact:

- Owner ref, revision, and freshness evidence
- any durable supervision constraint changed by the Owner and whether the Goal
  or owner system now reflects it
- current interpretation of the user's real desired result, authorized outcome,
  candidate outcomes with evidence and decision deadlines, and any material
  ambiguity that could change the control decision
- Supervisor epoch, logical task, target attempt, and writer capability
- current Supervisor session/terminal identity and the target session identity
  for any interrupt, stop, cancel, fence, replacement, release, or close action
- current candidate and reviewed artifact identities
- open intervention and external-effect state
- stale writer fence or release evidence
- required verification, review, acceptance, and budget state
- latest material outcome progress or the concrete predicate blocking it,
  including whether nonblocking assurance has unnecessarily occupied the
  Writer path
- current delivery target, forecast confidence, unfinished critical path,
  measured checkpoint and gate durations, and next calibration event
- next Goal-derived product, decision-information, or blocker result; its
  material event or maximum-staleness boundary; and the disposition if that
  boundary has expired without any of the three
- any suspected executor inefficiency, its changed-decision evidence, and the
  same-constraint alternative that would make it avoidable
- before a topology change, the relevant roles' current authority, target,
  assignment, result predicate, material liveness or artifact, staleness
  boundary, load, duplication, and conflict state
- after new dispatch, the Worker's Owner-visible outcome, proof target, any
  direction-changing uncertainty, first evidence-producing action, and nearby
  non-goal—or the material mismatch that prevents safe action
- the current event-driven Worker report triggers and whether any requested
  report can change a decision, close a gate, preserve a checkpoint, or expose
  a real mismatch or blocker
- the current user communication binding, its source revision, the last
  completed review-round conclusion, its report disposition, and any unknown
  or failed delivery state
- highest-value current control opportunity after goal reconciliation, its
  expected effect, authority basis, observation predicate, and stop condition—or
  why non-action dominates
- current control question, gated decision, stop condition, and any deferred
  handles with material wake conditions
- unknown or conflicting fields

Admission-sensitive boundaries include start, compact, resume, handoff,
takeover, Owner revision, writer or candidate change, intervention, recovery,
irreversible effect, and consequential readiness.

Before a semantic intervention, perform a self-countercheck:

- What evidence would show the work is actually aligned?
- Is this Owner drift or merely my preferred method?
- What valid work would this action destroy?
- Is an unknown effect, authority, or scope fact upstream of my diagnosis?

This produces a competing hypothesis; it does not certify the Supervisor.

Before a destructive or lifecycle control operation, perform an identity
self-check: re-read the Host's current Supervisor session and target session
binding, compare stable session/run identity plus terminal/handle/worktree, and
reject the operation when the target is this Supervisor or comparison is
unknown. Never recover from a failed lookup by trying another handle. A Host
safety fence may still act through its own authenticated path.

## Compact-Safe Packet

Persist a bounded orientation packet outside transient chat when continuity
earns it:

```text
Owner: <ref@revision + freshness evidence>
Authorized outcome: <result + constraints + acceptance + resolution refs>
Outcome candidates: <candidate id + evidence + expected value + path effect + decision deadline + status>
Supervisor epoch: <identity>
Supervisor binding: <active-run-unique visible name + Host controller identity + current session/terminal identity>
User communication: <logical route + cadence + maximum staleness + language + explanation + emphasis + constraints + source revision + last report>
Delivery clock: <wall-clock target + forecast confidence + critical-path evidence + next calibration event>
Stop admission: <unfinished|complete + authenticated Owner route + first request + exact challenge + second confirmation + forced hold>
Question: <one current control question + gated decision + stop condition>
Target: <logical task + attempt/generation + writer capability>
Artifact candidate: <artifact identity + accepted/reviewed identity>
Open effects: <intervention and external mutation states>
Evidence handles: <primary Owner, Host, artifact, verification, review refs>
Unknown/conflict: <fields requiring re-admission>
Deferred: <evidence handles + material wake conditions only>
Compact lineage: <prior epoch and packet identity>
Disposition: <continue|inspect|steer|escalate|report_ready blocked/allowed>
```

The packet is an index, not authority. On restore, re-read primary Owner, Host,
artifact, and external-effect truth; compare revisions and identities;
invalidate stale judgments; then open a new Supervisor epoch before mutation.
Restore only the one current control question. Do not replay deferred analysis
unless its wake condition is now material. A control issue already closed by
current primary evidence must not re-enter the convergence frontier after
compact merely because its history is prominent in the saved packet.

## Fresh Semantic Auditor

Use a fresh read-only auditor according to the selected assurance policy,
especially for high-risk ambiguity, a broad steer, recovery, or consequential
close. Do not start one unconditionally on every cycle.

Give it frozen primary evidence plus the proposed transition, not the
Supervisor's full narrative by default. When anchoring matters, withhold the
Supervisor rationale until the auditor records its initial finding.

Bind the result to:

- Owner revision
- Supervisor and review epoch
- target attempt and candidate identity
- evidence handles inspected
- proposed transition

Discard a stale result after any material identity changes.

The auditor may:

- inspect evidence
- emit dimension-specific findings with refs
- advise the Supervisor
- recommend a scoped block
- escalate to the Owner

The auditor may not:

- contact or steer the worker
- mutate product artifacts
- author, relax, or invalidate Owner truth
- grant writer or repair authority
- declare task completion
- launch another semantic monitor

Same-model fresh context reduces narrative coupling; it does not prove
failure-mode independence.

## Disagreement And Recursion Stop

Deterministic evidence wins inside its exact scope. Semantic disagreement is
not resolved by majority vote or an average score.

When an enumerated hard predicate is reproduced, only the Host or controller
may enforce the scoped transition freeze. A semantic-only concern may freeze at
most the affected transition under a predeclared fail-closed rule. Reconcile
evidence or escalate to the Owner.

Runtime semantic recursion stops at this auditor. The auditor is constrained by
primary evidence, deterministic sentinels, sealed evaluation, and bounded Owner
escalation—not by another Supervisor-of-Supervisor.

## Evaluation Boundary

Do not optimize the live Supervisor against a visible health score. Evaluate
policies on sealed aligned and fault episodes using separate vectors:

- hard incidents and unsafe intervention
- final outcome and defect escape
- false correction, false veto, deadlock, and Owner touches
- context, token, latency, observation, and review cost

Sample apparently healthy episodes outside the live reward path to estimate
missed drift and monitor gaming. The Supervisor and auditor may propose policy
changes; neither grades its own promotion.
