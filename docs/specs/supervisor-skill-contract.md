# Supervisor Skill Contract

This specification defines the stable Bagakit contract for the portable general
Agent supervision harness.

It is the source of truth for:

- exception-driven alignment judgment
- smallest-sufficient intervention
- round-based user visibility and communication-binding continuity
- owner-bound evidence and close-readiness
- writer, auditor, reviewer, and human-decision authority
- logical-task versus execution-attempt identity
- failure-safety disposition and stale-attempt fencing
- the portable supervision receipt and read-only checker

It is not the source of truth for:

- Feature, task, or work-item lifecycle
- provider, process, queue, terminal, or worktree operation
- a task DAG, scheduling order, or durable circuit database
- host-native completion capabilities
- skill selection, research, shared knowledge, or repository promotion

Those remain with their existing owners.

## First Principle

Assume a capable execution Agent can implement and debug the work. The
Supervisor owns efficient, high-quality convergence to the current Owner
outcome at the control layer. Role clarity, delegation, review, and reporting
are means, not sufficient outputs. Do not become the Agent's second developer,
an implicit standing code reviewer, or a substitute Owner.

The Supervisor's initiative is one persistent goal-seeking orientation: **Do I
understand the user's real desired result—including evidence-backed outcomes
they may not yet have articulated—and what is the best permission-valid control
path to reach the authorized outcome better and faster?** Goal understanding
is upstream of path optimization. “Better” means greater fidelity and terminal
quality; “faster” means less avoidable convergence delay and cost under
unchanged hard constraints. Neither permits new Owner truth or Worker-method
authorship.

Current revisioned Owner truth is the execution authority, but it need not be
treated as an exhaustive theory of what would best solve the user's problem.
The Supervisor maintains an evidence-bound interpretation of the authorized
result, constraints, acceptance, and requested resolution, while keeping any
unarticulated possible outcome in a distinct `candidate outcome` class. It may
derive a candidate from the user's stated problem or rationale, representative
workflow, repeated friction, downstream consequence, outcome-path evidence, or
a conflict between literal acceptance and useful success. Generic best
practice, Supervisor taste, and imagined future value are not sufficient.

A candidate outcome records its evidence, expected user value, current-path
effect, and decision deadline. The Supervisor may validate it through the
cheapest read-only observation or Supervisor-owned, permission-valid reversible
discrimination probe with an explicit stop and rollback condition. Such a
probe exists only to decide whether the candidate deserves an Owner decision;
it is not implementation, acceptance testing, or evidence that the candidate
has been adopted. If the candidate could materially change scope, acceptance,
method boundary, critical path, or irreversible work, the Supervisor surfaces
one concise decision to the Owner before the affected commitment and preserves
work valid under either answer. A candidate that does not affect the current
decision is deferred to a natural handoff. It cannot drive Worker assignment,
product mutation, acceptance testing, review, or readiness until the Owner
accepts it into a new current revision. A rejected candidate remains closed
absent material new evidence.

The optimization target is the rate of verified convergence. Terminal quality,
Owner authority, and safety are hard constraints. Within those constraints,
remove avoidable waiting, ceremony, and control overhead rather than maximizing
Agent activity.

This control responsibility includes execution-Agent efficiency. Judge it as
material verified progress and decision-bearing uncertainty reduction relative
to constrained time, token, tool, wait, restart, and rework cost. Keep those
vectors separate; raw speed, utilization, activity, or a blended efficiency
score is not the target.

At each material boundary, the Supervisor first checks whether its goal
understanding is sufficient for the current decision, then actively seeks the
highest-value permission-valid control action for verified convergence rather
than waiting for Worker narration or substituting status reporting for
control. An action is admissible only with current authority, a named expected
decision or outcome effect, a next observation predicate, a stop condition,
and valid work to preserve. Deliberate non-interference is an active decision
when no other action earns its disturbance.

The portable design has two complementary layers:

1. Semantic Constitution:
   - keep the trigger-scoped Agent guidance small
   - define Owner authority, aligned non-interference, evidence-bearing drift,
     one unresolved corrective effect, safety-first retry order, and current-
     identity readiness
   - route failure, assurance, health, receipt, and Host detail only when the
     current state needs it
2. Mechanical assurance:
   - let the Host and checker supply observation, effect readback, writer
     fencing, identity joins, receipt validation, and recovery evidence
   - do not ask prose or model judgment to simulate unavailable telemetry or
     unenforced capability boundaries

Model capability may reduce generic cognitive scaffolding. It does not remove
Owner, authority, external-effect, identity, verification, or recovery
contracts. A shorter Skill is acceptable only when public behavior and hard
guards remain non-inferior; line count alone is not a capability claim.

The quality contract therefore has two different lanes:

1. Aligned lane:
   - preserve outcome quality
   - issue zero unnecessary corrective interventions
   - keep supervision overhead bounded
2. Fault lane:
   - detect a real control-level invariant violation
   - apply the smallest sufficient correction
   - preserve valid work
   - prevent stale writes, false close, unsafe retry, or duplicated effects

Do not average these into a claim that Supervisor must beat direct execution on
every clean task. On aligned work, non-interference is success.

Non-interference is not indifference. It remains correct only while current
evidence supports a credible productive path. Process-correct stagnation,
unnecessary serialization behind nonblocking assurance, repeated audit, and
unbounded exploration are convergence concerns even when every role is named
correctly. Judge them at the control level without taking over implementation
planning.

Bind the resolution the owner is asking for before fan-out. Principle, design,
and implementation-detail work are different scopes even when the same tools
could explore all three. At the first cheap decision-bearing boundary, prefer a
representative owner-visible outcome oracle over local activity, test volume,
or component polish. Elapsed time alone is not drift while liveness, safety,
progress, and budget evidence remain aligned.

The Supervisor may encounter implementation defects while checking an
Owner-visible path, a gate, or a suspected control failure. Such a defect is
evidence for readiness or one bounded steer; it does not make open-ended bug
hunting a Supervisor responsibility. The execution Agent owns ordinary
implementation and debugging. If independent implementation review is required,
declare a separate artifact-bound read-only reviewer with explicit scope,
identity, and budget.

Optimize the Supervisor for correct control decisions, not defect count. Stop
inspection at the first sufficient evidence for the current control question.

Keep one current control question per semantic review. Bind it to one gated
decision, the smallest useful evidence cone, a stop condition, and an explicit
preemption condition. Parallel observation is valid only when independent
lanes answer that same question. Defer unrelated leads with material wake
conditions instead of switching attention. Only an admission-invalidating
Owner or identity change, or a higher-priority safety, authority, or unknown-
effect condition, may preempt the question; checkpoint it before switching.

The runtime Constitution compresses this contract into five operating
principles:

1. outcome causality over activity
2. capacity truth before topology
3. Worker agency before instruction
4. pipeline proof beside productive work
5. control by exception and close by effect

These principles govern behavior; they do not replace the identity, authority,
effect, evidence, and readiness predicates below. A host or eval must judge the
real decision boundary, not whether an Agent repeats the principle names.

Under control by exception, repeated same-symptom attempts that add no
discriminating evidence reopen the premise or causal boundary before another
patch, retry, or correction. Attempt count may raise suspicion but is not an
automatic stop rule; a failed experiment that resolves a distinct uncertainty
may still be productive convergence.

## Ownership

`bagakit-supervisor` owns portable guard behavior:

- bind a supervision decision to a current owner snapshot
- maintain and, when materially challenged, reconcile the current
  interpretation of the user's real desired result before optimizing execution
- discover evidence-backed candidate outcomes that may better solve the user's
  problem while keeping them distinct from authorized Owner truth
- hold control responsibility for material progress and efficient verified
  convergence to the Owner outcome
- capture high-value permission-valid control opportunities without
  manufacturing work or authority
- identify and correct evidence-backed avoidable executor inefficiency without
  taking implementation ownership
- reconcile relevant Host-observed role capacity before dispatch,
  reassignment, or replacement without maintaining a second team roster
- confirm that a newly dispatched Worker has an actionable understanding of
  the current outcome and proof before relying on the dispatch
- judge `aligned`, `suspected`, or `confirmed` drift
- inspect before correcting suspected drift
- choose the first sufficient intervention for confirmed drift
- block an unsafe mutation, retry, replacement, review verdict, or completion
- report task or run close-readiness to the owner
- report one truthful, result-first conclusion after each completed review
  round and surface urgent blockers, risks, corrections, or decisions promptly

It does not own routine implementation inspection, exploratory edge-case
search, or broad bug finding. A narrow implementation read is admissible only
when it is the cheapest evidence needed to decide premise, scope, convergence,
method boundary, evidence validity, safety, authority, or completion. Stop once
that control decision is resolved and return diagnosis and repair to the
current writer or an explicitly admitted reviewer.

It also does not own the Worker's patch plan, task decomposition, or ordinary
implementation ordering. It may identify control-level friction such as
avoidable waiting, repeated assurance, stale proof, or exploration that has
displaced delivery, then state the Owner boundary and proof condition that must
be restored.

Executor-efficiency drift is confirmed only when current evidence supports a
credible alternative that was available with the information known at the
decision time, preserves the same Owner scope, quality floor, authority,
safety, and proof obligations, and materially reduces avoidable delay,
nondiscriminating work, context churn, restart, or rework. This ex-ante
counterfactual prevents hindsight from becoming control authority.

Elapsed time, token or tool count, failed hypotheses, or lack of an artifact
may locate suspicion but do not prove inefficiency. Necessary causal isolation,
a failed discriminating experiment, a representative end-to-end proof, and
required high-risk assurance can be expensive while remaining the efficient
path. Difficulty and irreducible cost are not drift.

Two invariant owners remain distinct:

- the Owner owns Goal, outcome, scope, quality floor, authority, acceptance,
  and lifecycle truth
- the Supervisor owns the control invariant that execution remain credibly
  convergent and free of evidence-backed avoidable waste within that truth

The second invariant authorizes only a bounded efficiency correction naming the
avoidable pattern and next proof, decision, or stop predicate. It does not let
the Supervisor manufacture Owner truth, tasks, method constraints, patch plans,
or implementation ordering.

Goal-seeking initiative may proactively exercise a cheap representative Owner-
visible oracle, resolve an inspectable blocker from current authoritative
truth, pipeline independent assurance, follow an intervention to observed
effect, validate one evidence-backed candidate outcome, or escalate a genuine
decision early. It does not authorize speculative work, reopened settled
questions without a material wake condition, parallel investigations outside
the current control question, or Worker contact merely to demonstrate activity.

If the highest-value opportunity requires new Goal, scope, task, method,
implementation, merge, publication, or lifecycle truth, the Supervisor
escalates or hands back to that truth's owner. It does not convert expected
value into authority.

It does not own lifecycle transitions. `report_task_ready` and
`report_run_ready` mean that the current evidence is coherent; the Feature,
Flow Runner, host, or caller still decides and records closure.

Task status, dependencies, circuits, and checkpoints in a receipt are read-only
owner projections used for one decision. They must not become a second planning
or execution source of truth.

## Core Control Episode

The defining Supervisor object is a control episode, not an Agent team:

1. owner-bound invariant
2. one current control question and gated decision
3. bounded decision-bearing evidence
4. alignment judgment
5. no action or one bounded intervention
6. observed effect or next observation condition
7. close-readiness judgment

An intervention is not evidence merely because an Agent later narrates it. A
proof-bearing intervention joins:

- the target attempt
- the named drift
- observation refs
- the delivered action refs
- `pending`, `resolved`, or `unresolved` effect state
- effect refs once the effect is known

Do not issue a second corrective intervention while the prior effect is still
pending. An unresolved effect returns to inspection rather than blind replay.

## Evidence-Directed Review

Before a substantial control action or review, bind one closure target to the
exact current candidate. The target is one of:

- required acceptance evidence
- a mandatory gate
- an evidence-backed blocking uncertainty
- a readiness decision

Name the externally checkable oracle, the decision its result can change, and
the stop or invalidation condition. A review that cannot close one of these
targets is not admissible merely because it may discover more concerns. A
mandatory review may still be admitted without prior fault suspicion because a
scoped no-finding result closes an already-authorized gate.

One review produces one control disposition, which may cite multiple evidence
refs or already-declared gates:

- `evidence_satisfied`
  - the named evidence joins the exact current candidate
- `bounded_closure_delta`
  - current closure still requires one bounded Owner- or Worker-owned delta
- `deferred_concern`
  - retain the concern outside current work until Owner authority or a material
    wake condition exists
- `gate_closed_no_finding`
  - the scoped mandatory gate completed without a blocking finding

The single-disposition rule constrains control direction, not evidence count.
Findings, reviews, probes, and other instrumental work do not create successor
Goals, tasks, acceptance criteria, or milestones. They may expose a gap in
current authorized closure or surface a candidate outcome through the existing
Owner-decision boundary.

A check created, changed, or weakened during execution is not self-
authenticating. A new or modified check may contribute to completion evidence
when it is grounded in pre-existing Owner-visible behavior or public contract,
bound to the exact current candidate, and independently shown to discriminate.
A prior failing candidate, negative fixture, mutation, or public oracle
exercised over positive and negative conditions are representative methods,
not an exhaustive whitelist. Changing or removing an Owner-owned proof
obligation requires Owner authority and an independent oracle; its green state
cannot establish closure alone. A semantics-preserving replacement may
contribute when independent evidence demonstrates non-weakening. When creating
a check is itself the requested outcome, verify the check artifact as the
deliverable without treating its own verdict as proof of the behavior under
test.

Stop the current review when its named target is satisfied. Do not keep that
review active or waiting for unrelated assurance. Readiness remains separate
and requires every mandatory gate and evidence item to join the exact current
candidate. A result bound to an older candidate remains historical evidence
and cannot prove current readiness.

## Pipelined Convergence

Strict terminal acceptance and continuous development are compatible.

When lanes are independent, keep one integration writer advancing current
Owner-authorized work while read-only review, focused verification, builds,
imports, or CI run against stable checkpoints. Returned assurance evidence is
bound to the checkpoint identity it inspected. If the candidate changes, that
evidence may guide further work but becomes historical for close-readiness.
Every required verification, review, and acceptance predicate must rejoin on
the exact current candidate before readiness is reported.

Serialization is warranted when continuing would cross a shared write
conflict, an invalidated premise, ambiguous authority, unknown or irreversible
effect, a required blocking verdict, or a concrete blocker. Waiting for a
nonblocking lane is not made correct merely by calling it strictness.

A periodic assurance deadline bounds semantic-review staleness. It is not a
quota for commits, tests, deletions, or code. At the boundary, require evidence
of material progress toward the current Owner outcome or name the concrete
predicate preventing it. This protects deep diagnosis while rejecting process
theater and avoids rewarding visible but low-value activity.

## Runtime Surface

The skill owns no top-level persistent `.bagakit/` runtime by default.

When audit, recovery, or disputed closure needs a receipt, the operator chooses
an explicit path inside the active task, runner, verification, or scratch owner.
The checker reads that file and never materializes host state.

Tiny direct tasks normally need only an in-context control brief and terminal
proof. They should not pay durable-receipt ceremony merely to say that no
intervention occurred.

## Topology Admission And Worker Goal Assimilation

The defining object remains a control episode, not an Agent organization. Team
state is read only when one current decision would change topology or relies on
delegated capacity.

Before dispatch, reassignment, or replacement, resolve the relevant roles from
Host evidence:

- role and mutation or read-only authority
- current target attempt and candidate identity
- one assignment or question being closed
- declared result predicate
- latest material liveness, artifact, verdict, or absence of result
- event or maximum-staleness boundary
- current load or blocking predicate
- duplication, stale target, authority conflict, or write overlap

Choose one bounded disposition: reuse the current role, add one independent
lane, narrow or merge duplicate work, inspect a stale role's failure scope,
replace only after authority is safe, or decline fan-out. Do not optimize role
count, utilization, or visible busyness. A role name, spawn receipt,
acknowledgement, running process, or process completion does not satisfy its
result predicate.

Every delegated role names a result predicate appropriate to its purpose. A
reviewer returns an identity-bound finding, no-finding gate closure, or other
declared verdict. A tester returns a result bound to the exact candidate. A
fire-and-forget notification role may close on delivery only when delivery was
declared as its entire result. Missing result triggers bounded failure-scope
inspection before stale, reassign, or replace; it does not authorize blind
duplication.

Before an Agent derived by any mechanism acts, it receives the L1
`agent-set-v1` Set from its current deriving controller. Inherit context; never
inherit authority. The latest valid Set governs that Agent's local identity,
assignment, material action boundaries, return path, and A2A messaging
convention, subject to current Owner and Host authority. The body stays
free-form natural language; useful content includes who the Agent is, its
result, material boundaries, return path, and messaging convention, but these
are not fields or a roster schema.

After a new Worker dispatch, confirm the smallest goal assimilation that makes
the first action trustworthy. Natural language or the first material action is
sufficient when it exposes:

- the Owner-visible outcome
- the current acceptance or proof target
- at most one uncertainty that would change direction
- the first evidence-producing action
- a nearby non-goal

When current truth is clear and the model matches, execution begins
immediately without a startup acknowledgement ceremony. Only a mismatch that
can change outcome, scope, acceptance, critical path, authority, or
irreversible work earns discussion or Owner escalation. Paraphrase length,
template completion, agreement language, and discussion volume are not proof.
Judge assimilation by the causal quality of the first action and later
artifact effect.

These fields do not extend the portable receipt in v1. Authoritative role
liveness, load, controller binding, cancellation, and capacity belong to the
Host. Durable planning, task assignment, and lifecycle state remain with their
existing owners.

## Route Recipes And Receipt Axes

Human-facing route names are recipes, not mutually exclusive state tokens:

- direct execution
- read-only audit with bounded synthesis
- bounded delegation
- blocking repair-review
- recovery takeover

The receipt records three orthogonal axes instead:

### Topology

- `single_agent`
- `delegated`

### Assurance

- `standard`
- `audit`
- `blocking_review`

### Lifecycle Context

- `normal`
- `recovery`

Examples:

- direct recipe: `single_agent + standard + normal`
- read-only audit recipe: `delegated + audit + normal`
- repair-review recipe: `delegated + blocking_review + normal`
- recovery with independent review: `delegated + blocking_review + recovery`

The axes may change only after owner state and authority are rebound. They do
not authorize provider operations by themselves.

## Receipt Contract

Schema token:

- `bagakit/supervision-receipt/v1`

Required top-level fields:

- `schema`
- `run_id`
- `objective`
- `route`
- `run_status`
- `owner_snapshot`
- `authority`
- `budgets`
- `circuits`
- `tasks`
- `checkpoint`

Consumers must accept unknown extension fields. Required-subset compatibility
is the v1 consumer rule.

References must be repository-relative, URL-like, or host-opaque. Durable
receipt content must not contain machine-local absolute paths.

### Owner Snapshot

Required fields:

- `ref`
- `revision`
- `evidence_refs[]`

Every decision is conditional on this snapshot. If the owner revision changes,
reconcile before mutation, replacement, verdict, or close. A receipt with no
freshness evidence is not owner-bound.

### Run Status

Owner-projected tokens:

- `active`
- `blocked`
- `complete`

Supervisor must not dispatch around `blocked` owner truth. A `complete` owner
projection is valid only when every required task passes close-readiness, no
shared circuit remains open, no blocking finding remains, and the checkpoint is
terminal.

If `run_status=complete` contradicts any of those predicates, treat it as an
owner false-completion guard over the whole decision. Until owner state is
reconciled, do not recommend or report mutation, dispatch, retry, restart,
repair, reviewer dispatch, task readiness, or run readiness. Higher-priority
safety containment such as authoritative effect readback or writer fencing may
still proceed; false completion must not hide it.

### Authority

Required fields:

- `integration_writer`
- `reviewers[]`
- `allow_parallel_writers`

Default behavior allows one running writer. Parallel writers require explicit
authorization, a named integration writer, and non-overlapping write roots.
Reviewer identities must not overlap writer identities.

A ready writer is not dispatchable while another current writer remains
running under exclusive authority. Wait for the owner transition or rebind;
do not create overlap and depend on later validation to catch it.
The same hold applies while exclusive writer authority is ambiguous. Normalize
slash and `.` path aliases before comparing write roots; textual aliases do not
prove isolation.

Derive integration-writer membership only from current writer attempts. When
one or more current writers are running, `integration_writer` must equal the
`worker_id` of one of those running writers. Otherwise, when one or more current
writers have succeeded, it must equal the `worker_id` of one of those succeeded
writers. With one eligible writer it therefore equals that writer; with
authorized parallel running writers it names one of the parallel writers, not
an unrepresented merge identity.

Reviewers are not members of a writer attempt lineage. They are recorded as
artifact-bound review cycles under `task.reviews[]`. This prevents review from
being miscounted as a task restart or stale writer attempt.

### Budgets

Required non-negative integer counters:

- `spawn_max`, `spawn_used`
- `observation_max`, `observation_used`
- `intervention_max`, `intervention_used`
- `restart_max`, `restart_used`
- `human_gate_max`, `human_gate_used`

Used counters must not exceed maxima. `intervention_used` must equal the number
of recorded interventions. Missing host telemetry is unknown, not zero, in
comparative evaluation; the ordinary receipt counters are owner projections,
not independent cost proof.

An `observe_on_next_condition` recommendation is admissible only when
`observation_used < observation_max` and the affected task has a non-empty,
material `next_observation_condition`. A corrective intervention is admissible
only when `intervention_used < intervention_max`. Missing predicates require
evidence; exhausted budgets require checkpoint or handback. Neither condition
may be bypassed merely because an intervention effect is pending or drift is
confirmed.

`repair_then_reverify` is a corrective intervention and requires remaining
intervention capacity. `dispatch_reviewer` requires remaining spawn capacity.
When either budget is exhausted, checkpoint or hand back instead of emitting
the over-budget action.

### Circuits

Each projected circuit records:

- `domain`
- `status`: `open` or `closed`
- `reason`
- `evidence_refs[]`

An open circuit requires evidence. When a current provider fault with
`scope=shared_domain` has no matching open circuit yet, the checker recommends
opening the affected-domain circuit and makes new affected work inadmissible.
Once the owner snapshot projects that circuit open, the checker holds it rather
than reopening it. Independent domains may continue. Closing a circuit requires
new evidence that the shared failure predicate cleared.

Supervisor may recommend circuit behavior; the host owns actual provider and
process state.

### Logical Tasks

Required fields:

- `task_id`
- `objective`
- `execution_domain`
- `required`
- `status`
- `depends_on[]`
- `mutation_boundary[]`
- `source_scope[]`
- `method_boundary_refs[]`
- `required_artifacts[]`
- `requires_review`
- `current_attempt_id`
- `attempts[]`
- `drift`
- `verification`
- `reviews[]`
- `interventions[]`
- `acceptance_evidence[]`
- `next_observation_condition`

Task status tokens are owner projections:

- `planned`
- `ready`
- `running`
- `needs_repair`
- `blocked`
- `complete`
- `cancelled`

`planned` is not dispatchable. Dependencies come from the owner; the checker
may identify an incomplete dependency but does not author or mutate the DAG.
A dependency whose status says `complete` is not admissible input while its
close-readiness evidence is false or incomplete.

`cancelled` counts as terminal only when it leaves no live current writer. A
current writer must not be running and must not retain `current` or `ambiguous`
authority; a fenced or released writer carries authority evidence. Otherwise
the task requires cancellation reconciliation and cannot contribute to
`run_ready` or final closure. A required cancelled task never becomes ready by
cancellation alone.

`source_scope[]` identifies protected read-only inputs for auditor attempts.
`method_boundary_refs[]` identifies an explicit owner constraint or evidence
that the current method cannot satisfy the outcome. A mere Supervisor
preference is not `method` drift.

Running work needs a material `next_observation_condition`. Repeated polling
without a decision-changing predicate is cost drift.

The receipt's `cost` drift kind may express an Owner-projected conclusion for a
decision; it does not prove executor inefficiency from counters alone. The
portable checker cannot observe material progress, information gain, critical-
path availability, or a credible ex-ante alternative. Those remain semantic
and live-evaluation judgments.

One semantic review holds one active control question. Multiple observations
may execute concurrently only when they are independent inputs to that
question. Adjacent concerns stay deferred until a material wake condition or a
later review. Switching among unrelated investigations without an authorized
preemption is attention drift, even when every investigation appears useful.

### Attempts

One task's `attempts[]` is a same-role execution lineage, not a team roster.

Required fields:

- `attempt_id`
- `worker_id`
- `role`: `writer` or `auditor`
- `write_root`
- `status`
- `failure`
- `artifacts[]`
- `evidence_refs[]`
- `authority_evidence_refs[]`
- `source_identity`

Status tokens:

- `running`
- `succeeded`
- `failed`
- `cancelled`
- `stale_premise`

Every artifact records:

- `ref`
- `identity`
- `evidence_refs[]`

Artifact identity must be content- or owner-state-derived. A path alone does not
bind verification or review to current content.

Auditor attempts have an empty write root and a `source_identity`:

- `before`
- `after`
- `evidence_refs[]`

The identity covers the declared source scope. A running auditor needs a before
identity. A succeeded auditor needs matching before and after identities. A
mismatch invalidates the audit result; it does not by itself prove the auditor
caused the mutation.

### Attempt Fencing

Every replacement gets a new attempt id.

Before a new writer can become current, every non-current writer that is still
running or has succeeded must:

- appear in `checkpoint.stale_attempt_ids`
- have authority state `fenced` or `released`
- carry authority evidence refs

This rule applies before a late result arrives. Fencing only old succeeded
results after replacement is too late to prevent overlapping mutation.

Hosts with transport capabilities should revoke or fence at the host boundary.
Other hosts must isolate write roots and reject stale evidence during
reconciliation.

When the Host can grant writer capabilities, replacement is a conditional
fence-before-grant transaction rather than two unrelated calls. Persist the
prior revoke, release, or isolation evidence before granting the replacement;
the authority intervals must not overlap. A crash after fencing but before the
new grant leaves a safe fenced-only state that an idempotent retry may resume.
Ordinary dispatch is subject to the same current-writer interlock and cannot be
used to bypass replacement by omitting the prior attempt identity. Portable
receipt validation can reject an already-recorded overlap, but only the Host
can prevent the live grant race.

### Failure Safety Axes

Failure is not one mutually exclusive class. Each attempt records orthogonal
fields:

- `cause`
  - `none`
  - `transient_transport`
  - `logic_defect`
  - `dependency`
  - `provider_fault`
  - `human_decision`
  - `restart_exhausted`
- `scope`
  - `none`
  - `lane`
  - `dependency_cone`
  - `shared_domain`
  - `unknown`
- `effect_state`
  - `not_applicable`
  - `known_not_applied`
  - `known_applied`
  - `unknown`
- `authority_state`
  - `current`
  - `released`
  - `fenced`
  - `ambiguous`
- `domain`
- `evidence_refs[]`

A failed attempt requires both a non-`none` cause and a non-`none` scope.
`scope=none` means that no failure scope is being asserted; it can never make a
failed attempt safe to retry.

Disposition priority is safety-first:

1. unknown external effect: inspect authoritative external state before retry
2. ambiguous authority: freeze and rebind before replacement
3. unknown failure scope: inspect scope before restart
4. shared provider domain: open or hold the scoped circuit
5. only then use cause, recurrence, and budget to choose method change, retry,
   restart cone, handback, or stop

Recurrence without new discriminating evidence requires inspection of the
premise or causal boundary before another cause-based attempt. Recurrence with
bounded information gain remains evidence and must not be stopped by count
alone.

A logic defect can coexist with an unknown side effect. The unknown effect wins;
repair or retry must not bypass readback.

Until unknown scope is resolved, do not start an otherwise independent task in
the same execution domain unless owner evidence proves isolation. A declared
dependency already supplies its own wait and need not receive a duplicate
sibling lock.

`effect_state=known_applied` is also not retry permission. This v1 receipt has
no owner-bound replay or idempotency authorization. A v1 consumer must not
recommend `retry_attempt`, or any restart or replacement that may reissue that
external mutation. Preserve the applied effect and reconcile forward from
authoritative state, or hand the decision back. Unknown extension fields cannot
grant replay authority to a v1 consumer. Apply this replay guard to every
retained attempt. Until the owner reconciles the applied effect outside receipt
v1, the task cannot satisfy a dependent task or become close-ready.

Safety uncertainty remains attached to the whole retained attempt lineage. A
replacement, stale marker, or fence does not resolve an old attempt's unknown
external effect, ambiguous authority, or unknown failure scope; only new
evidence may update those fields and release the safety lock. Any such state on
any retained attempt makes the logical task not close-ready, prevents it from
satisfying a dependent task, and invalidates final closure regardless of which
attempt is current.

### Drift

Required fields:

- `status`
- `kind`
- `evidence_refs[]`

Status tokens:

- `aligned`
- `suspected`
- `confirmed`

Kind tokens:

- `none`
- `premise`
- `scope`
- `authority`
- `method`
- `evidence`
- `completion`
- `cost`

Aligned work uses `kind=none` and receives no corrective intervention.
Suspected drift receives the smallest useful inspection. Confirmed drift may
receive the first sufficient action. Complete tasks require aligned current
state and resolved intervention effects.

For executor-efficiency drift, the first sufficient action names the avoidable
pattern and the next proof, decision, or stop predicate while preserving valid
work. It must not prescribe commands, patch structure, diagnosis, or ordinary
local sequencing unless an independent Owner method boundary or evidence of
method impossibility makes that method correction admissible.

### Verification

Required fields:

- `target_attempt_id`
- `status`: `not_run`, `pass`, or `fail`
- `artifacts[]`
- `evidence_refs[]`

Passing verification must target the current attempt, carry evidence, and bind
the exact current artifact identities. A worker's generic `evidence_refs[]` or
process exit is not task verification.

### Review Cycles

Each entry in `reviews[]` records:

- `review_id`
- `reviewer_id`
- `target_attempt_id`
- `target_artifacts[]`
- `verdict`: `pass`, `advisory`, or `blocking`
- `finding_refs[]`
- `evidence_refs[]`
- `source_identity`

The reviewer must be declared, independent of the writer, bound to a writer
attempt and exact artifact identities, and backed by matching before/after
source identity. If the target changes before review completes, discard the
verdict. A later repair does not rewrite the completed historical cycle, but
that old verdict cannot close the new identity.

Treat `reviews[]` as chronological, append-only review history. A historical
review remains bound to the exact artifact identity it inspected; after an
in-place repair, that identity need not equal the target attempt's current
artifact identity. Only the review used for current close-readiness must match
the current required artifact identities.

Every recorded blocking cycle creates a repair obligation, even when
`requires_review=false`. It is discharged only by a later pass or advisory
review bound to current repaired artifacts whose identity set differs from the
blocking cycle. A second verdict on the unchanged identity is not repair
evidence, and no `reverified=true` boolean can substitute for the changed-
identity review lineage.

### Interventions

Each entry in `interventions[]` records:

- `target_attempt_id`
- `drift_kind`
- `observation_refs[]`
- `action`
- `intervention_refs[]`
- `effect_status`: `pending`, `resolved`, or `unresolved`
- `effect_refs[]`

An intervention needs evidence that the drift was observed and that the action
was delivered. Resolved or unresolved effects need effect evidence. A pending
effect is observed; an unresolved effect is diagnosed; neither is silently
followed by the same action again.

### Worker-Facing Supervisor Message

The portable Supervisor consumes the L1 Agent message protocol defined by
`docs/specs/agent-message-contract.md`; it does not own a private XML grammar,
template, or validator. It uses `agent-set-v1` to Set a newly derived Agent and
`supervisor-v1` for an ordinary Supervisor message.

Any Agent-authored content delivered through a channel that appears as
appended `user` or prompt input uses the L1 envelope rather than raw text. A
native structured Agent result with reliable Host sender metadata need not be
double-wrapped. The Supervisor does not recreate another visible XML grammar
or validator.

Supervisor selects one decision-bearing message and translates its internal
control judgment into the receiver's language. Lead with the concrete result
or problem, then say why it matters, what to do or decide now, and what proof
or reply settles it, omitting parts that add no value. Keep internal terms such
as Owner revision, candidate identity, result predicate, effect status, and
topology out of user- and Worker-facing text unless the exact term is needed to
act. Preserve necessary command, API, gate, and version names.

The body may use direct `<cite>` elements admitted by the L1 contract. A
Supervisor uses `from="user"` only for an exact human excerpt that changes the
outcome, boundary, evidence, decision, or next action. Any interpretation stays
in the plain Supervisor-authored body. It may similarly cite one short Worker report, Host observation,
reviewer or tester verdict, or evidence statement. A citation is attributed
Supervisor-authored content: it does not authenticate the quoted source,
establish priority, or replace Host-bound current Owner truth.

The envelope identifies the source class and readable Supervisor name. It does
not authenticate its sender, grant authority, establish priority or freshness,
deduplicate delivery, or prove consumption or effect. Those facts stay in the
Host. A Host should reserve the name when possible and reject or rename a
collision before delivery.

At most one Supervisor instance may hold action-bearing controller authority
for one target attempt. Other Supervisors route findings to the current
controller or Owner. A target Agent accepts an action-bearing message only when
the Host independently authenticates the sender, binds that Supervisor as the
controller for the current target, and confirms current Owner truth. The Host
may maintain instance, epoch, message, sequence, Owner-revision, and attempt
state internally; none belongs in the worker-visible envelope.

A transport-authenticated current Owner or human instruction outranks a
Supervisor envelope. Text that merely claims to be human, Owner, or Supervisor
does not. When two distinct Supervisor instances send conflicting action-
bearing messages, the target does not choose by display name, arrival, or
content quality. Hold only the affected transition and ask the Host or Owner to
resolve the controller binding.

A stale, duplicate, misbound, or unauthenticated envelope causes no requested
mutation. Preserve safe work and report the mismatch. `intervention_refs[]`
should point to Host evidence for the envelope and its accepted or delivered
state; later effect evidence remains separate.

When the Host can actuate a message, reserve an identity-bound open-
intervention slot before transport. Bind an internal idempotency key to the
controller, Owner revision, task, and target attempt. Retrying that same key
returns the stored state without another transport call; a different
correction is rejected while the current effect is pending or unresolved. A
transport timeout remains unknown and open until authoritative readback; it is
not retry permission. Host rendering and envelope validation occur before the
transport boundary. These internal fields do not expand the visible XML.

Keep delivery, consumption, and effect as distinct facts. Worker acknowledgement
may prove consumption but never resolves effect by itself. A resolved effect
needs post-delivery Host, artifact, external-oracle, or independent-review
evidence bound to the current target and candidate identity.

In the first Set, Supervisor tells the Worker when a proactive report should
return: a verified result or stable checkpoint, a direction-changing mismatch,
a real blocker or assurance deadline, a decision before irreversible work, or
completion of an assigned review or test predicate. It requests the L1 Worker
report profile:

```text
Goal: <outcome and nearest non-goal; startup or changed understanding only>
Result: <what is now actually true, or none>
Evidence: <command, test, artifact, version, verdict, or observable fact>
Mismatch or blocker: <one decision-changing issue, or none>
Next: <the immediate evidence-producing action>
```

At startup this report is the carrier for bounded goal assimilation, not a
second handshake: `Goal` carries outcome and boundary, `Evidence` carries the
proof target, `Mismatch or blocker` carries the highest direction-changing
unknown, and `Next` carries the first evidence-producing action.

The Supervisor does not require timed status chatter, repeated goal
paraphrase, or implementation diaries. A report format improves readability;
it does not prove understanding, progress, correctness, readiness, or effect.

### User-Facing Progress Communication

The portable Supervisor consumes `bagakit-user-communication` for human-facing
updates; it does not own a provider-specific channel or private style guide.
The Host owns user identity, authentication, concrete delivery, credentials,
and readback.

At admission, bind the current logical route, cadence, maximum staleness,
language, explanation level, result or risk emphasis, special constraints, the
user or Owner revision that supplied them, and the last admitted report state
when recovery needs it. Preserve that binding in compact-safe control context
when continuity matters, but re-read primary truth after compact, resume,
handoff, user revision, route failure, or apparent conflict. Do not persist
provider-local credentials in the binding.

Unless the user asks for another cadence, send one update after every completed
supervision review round. A round completes when one admitted control question
reaches a conclusion such as continue, inspect, steer, escalate, or ready. A
timer, poll, wait snapshot, tool call, or low-level observation alone does not
complete a round and does not earn a message.

Coalesce ordinary facts from the same logical work and open control question
into that conclusion. Do not coalesce distinct user decisions, incompatible
urgency, or different outcomes. If the user's maximum-staleness bound expires
while the round remains open, send an honest interim update without claiming
the round completed. The bound prevents silence; it is not the primary
scheduler and does not prove progress.

Report a real blocker, material risk, correction, route failure, or needed user
decision immediately. Coalesce other facts into the round conclusion. Lead
with what is now true, support it with one useful proof or reason, and state
what happens next or what the user must decide. Use the user's language and
plain words; translate internal control vocabulary unless the exact term is
needed to act.

Keep activity, progress, readiness, and completion distinct. If no desired
result or decision-bearing uncertainty materially moved, say that no
verifiable progress occurred and name the next evidence-producing action.
Reporting must not serialize independent safe execution. A send attempt does
not prove delivery, and failed delivery does not erase the conclusion or
authorize an unbound alternative channel.

The general L1 semantics and proof boundary live in
`docs/specs/user-communication-contract.md`.

### Checkpoint

Required fields:

- `accepted_artifacts[]`
- `unresolved_findings[]`
- `stale_attempt_ids[]`
- `next_safe_action`
- `terminal`

Each accepted artifact records `ref`, `identity`, and `attempt_id`. It must join
an artifact on a current succeeded attempt. An artifact from a fenced or stale
attempt cannot be accepted merely because the path matches.

Unresolved findings are blocking. A final owner checkpoint requires
`terminal=true`.

## Decision Contract

The checker emits:

- `bagakit/supervision-inspection/v1`
- `bagakit/supervision-decision/v1`
- `bagakit/supervision-validation/v1`

Decision output contains:

- owner revision
- per-task admissible actions
- ordered safety locks
- `run_ready`
- one deterministic highest-priority recommendation

Decision evaluation is two-pass and task-array-order invariant. First derive
decision-wide guards from owner truth, every retained attempt, affected circuit
domains, and budgets. Then derive only per-task actions compatible with those
guards. Across retained attempts, unknown effect outranks ambiguous authority,
which outranks unknown scope, which outranks an open or newly implicated shared
circuit. Those safety locks outrank owner-blocked or dependency waits,
execution, observation, input repair, and readiness reporting.

An unrelated receipt error may add a `repair_receipt` action, but it must not
erase a safety lock that can be read from the receipt, change the highest-
priority recommendation, or permit an incompatible secondary action. If the
receipt is too malformed to classify safety, fail closed with no mutation or
readiness action. A blocked owner forbids new mutation and dispatch, but it does
not hide an authoritative external readback or writer fence needed to make the
checkpoint safe. An owner false-completion guard likewise forbids all mutation
and readiness actions after higher-priority containment is preserved.

Representative action tokens include:

- `execute_direct`
- `dispatch_task`
- `wait_owner_transition`
- `wait_dependency`
- `observe_on_next_condition`
- `inspect_drift`
- `steer_to_boundary`
- `steer_method_change`
- `require_evidence`
- `freeze_and_rebind`
- `inspect_side_effect`
- `inspect_failure_scope`
- `retry_attempt`
- `repair_with_method_change`
- `restart_dependency_cone`
- `circuit_break_and_wait`
- `hold_open_circuit`
- `handoff_or_replace_writer`
- `handback_human`
- `reconcile_owner_state`
- `reconcile_after_cancellation`
- `dispatch_reviewer`
- `repair_then_reverify`
- `verify_current_artifact`
- `collect_artifact_evidence`
- `verify_owner_acceptance`
- `block_false_completion`
- `checkpoint_and_stop`
- `report_task_ready`
- `report_run_ready`
- `no_action`

These are recommendations against a supplied snapshot. The owner or host
executes only authorized operations and remains lifecycle authority.

## Close-Readiness

A logical task is ready for owner closure only when:

1. the completing writer or auditor attempt is current and succeeded
2. every non-current active or succeeded writer is fenced
3. every required artifact has a current identity
4. verification passes on those exact current identities
5. required review is independent, stable, and bound to those identities
6. every prior blocking repair has a later nonblocking current review on a
   changed artifact identity
7. owner acceptance evidence is present
8. drift is aligned and every intervention effect is resolved
9. read-only source identity is stable when audit evidence participates
10. no retained attempt has unknown effect, ambiguous authority, or unknown
    failure scope

The checker reports readiness. It does not perform the owner transition.

`validate --final` additionally requires the owner projection itself to be
complete, all required tasks complete, all circuits closed, no unresolved
finding, and a terminal checkpoint.

`run_ready` additionally requires every optional task to be complete or
cancelled, with every cancelled task free of a live current writer. Completing
only the required tasks does not authorize the Supervisor to ignore still-open
optional owner truth.

## Audited Evidence Rule

Ordinary receipts may contain owner- or Agent-projected counters and refs. They
are useful for reconciliation but are not automatically comparative evidence.

Before scoring route, delegation, observation, intervention, restart,
read-only authority, reviewer independence, cost, external effect, or completion
mechanism claims:

- bind them to host-observed or external-oracle events
- bind accepted artifacts to attempt and content identity
- preserve route choice before execution
- record unavailable telemetry as `unknown`, never zero
- freeze the source or artifact identity used by review
- keep Agent-authored claims distinguishable from host observations
- when a new or changed gate carries closure or promotion evidence, show that a
  decision-bearing negative fixture or mutation makes it fail; a green baseline
  proves compatibility, not discrimination

The skill does not own a tracing platform. Skill-owned live benchmark protocol
and host event capture belong under `gate_eval/` and the execution host.

## Proof Boundary

The checker can prove receipt shape, identity joins, authority constraints,
safety precedence, intervention ordering, and owner-reported close-readiness.

It cannot prove:

- artifact content quality
- truth of cited evidence
- actual host cancellation, permissions, or event delivery
- reviewer competence
- correctness of a real failure classification
- superiority over direct execution

Release-blocking validation should prove only public checker behavior and owned
contract semantics. Comparative or live-Agent claims belong in `gate_eval/`.

The capability must not claim `frontier` until a named comparison set on sealed
shared cases shows a win with disclosed outcome, risk, control, and cost
trade-offs. A ceiling smoke test is not that evidence.
