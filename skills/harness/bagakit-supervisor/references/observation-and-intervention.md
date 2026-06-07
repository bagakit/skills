# Observation And Intervention

Stable authority: `docs/specs/supervisor-skill-contract.md`. This file is a
conditional operational projection; the stable spec wins on conflict.

Read this reference when the task needs deliberate semantic review, a
corrective message, an assurance deadline, or a repair recommendation.

## Contents

1. Operation boundaries
2. Outcome ownership and pipelined convergence
3. Goal-seeking initiative
4. Execution-readiness and capacity admission
5. Worker goal assimilation
6. Executor efficiency
7. Assurance policies
8. Review packet and lenses
9. Evidence-directed review
10. Attention discipline
11. Implementation-review boundary
12. Steer admission and message
13. Supervisor messaging profile
14. Repair recommendation boundary
15. Review receipt

## Operation Boundaries

Keep four operations distinct:

| Operation | Purpose | Authority effect |
| --- | --- | --- |
| `observe` | acquire a decision-bearing state delta | none |
| `review` | rebind identities and reassess semantics | none |
| `steer` | ask the current writer for one bounded correction | writer remains current |
| `repair_recommended` | request evaluation of a separately authorized repair lane | no writer is admitted |

Observation is not semantic review. Review is not correction. A steer does not
create another writer. A repair recommendation is not permission to mutate.

## Outcome Ownership And Pipelined Convergence

The Supervisor is answerable for better and faster verified delivery of the
current Owner outcome. It does not satisfy that responsibility by clarifying
roles, dispatching reviewers, producing a careful status report, or keeping
processes correct and busy.

Mechanism ownership and delivery responsibility are different. Host, tracker,
Git, CI, queue, terminal, workspace, and lifecycle systems keep their own truth
and actuation. The Supervisor must use or coordinate those owners until the
execution condition is ready and observe the effect; it must not hand their
maintenance to a product Worker. Missing authority earns escalation, not
simulated truth or abdication.

Treat strict terminal acceptance as a final evidence join, not a barrier placed
in front of all independent development:

- keep one integration owner while an authorized Writer team advances current
  Owner-authorized work when parallelism shortens the critical path
- trigger read-only review, focused verification, builds, imports, or CI from a
  stable checkpoint when those lanes are independent and identity-bound
- while those lanes run, continue the next nonconflicting, Owner-authorized
  slice instead of waiting for nonblocking assurance
- when a result returns, classify whether it invalidates the active premise,
  blocks only the affected path, or can be repaired while independent work
  continues
- before readiness, rejoin every required verification, review, and acceptance
  result on the exact current candidate; a green predecessor checkpoint is
  historical evidence, not current proof

Serialize only when the next step would cross a real boundary: an actual
incompatible mutation, an invalidated premise, ambiguous authority, unknown or
irreversible effect, a required blocking verdict, or a concrete blocker. A
shared path, shared tree, or mixed commit is evidence to inspect and coordinate,
not a global stop condition by itself. Do not invent the
Worker's task breakdown, patch, or ordering to create throughput. Inspect and
steer the control-level friction: unnecessary waiting, repeated assurance,
unbounded exploration, stale evidence, or process ceremony that has displaced
material progress.

Use a periodic deadline as a maximum review-staleness bound, not an artifact
quota. At the boundary, ask what material outcome progress occurred or which
concrete predicate blocked it. Do not require a commit, test, deletion, or code
change merely to satisfy the clock; that converts assurance into reward
hacking.

## Goal-Seeking Initiative

At each material boundary, ask whether the user's real desired result is
understood well enough for the current decision and which permission-valid
action reaches it better and faster. Ground the answer in primary Owner truth:
result, decision-bearing rationale, constraints, acceptance, and requested
resolution. Ask one question only when unresolved ambiguity could change the
path; do not reconfirm clear truth.

Keep an unarticulated possible result as a `candidate outcome`, separate from
the authorized outcome. Admit a candidate only from concrete user rationale,
representative workflow, repeated friction, downstream consequence, or
outcome-path failure—not generic best practice or taste. Record its evidence,
expected value, current-path effect, and decision deadline.

Use the cheapest permission-valid read-only or reversible probe to decide
whether a candidate deserves an Owner decision. If it would change scope,
acceptance, method boundary, critical path, or irreversible work, ask before
the affected commitment and preserve work valid under either answer. Do not
assign, implement, review, test, or use the candidate for readiness until the
Owner accepts it. Defer candidates that cannot change the current decision.

Admit initiative only with a named effect, next observation predicate, stop
condition, and authority basis. Use or coordinate the relevant truth owner;
escalate missing authority instead of manufacturing it. Initiative is not
message, tool, Agent, inspection, or interrupt volume, and deliberate silence
is correct when no action earns its disturbance.

## Execution-Readiness And Capacity Admission

Before dispatch, prove a compact ready state: current Owner outcome and proof,
correct target and workspace, usable authority, assignment and result
predicate, return path, and no unresolved Goal, tracker, workspace, permission,
rebase, or lifecycle prerequisite that the product Worker would have to fix.
When readiness breaks mid-run, preserve valid implementation work and close the
control-plane condition through its owner before the affected transition.

Treat a new Owner message as control input, not transport payload. First bind
what it changes in outcome, constraint, priority, authority, or acceptance;
then reconcile current roles, dependencies, Writer and proof frontiers, shared
hotspots, and integration capacity. Choose whether to continue unchanged,
reuse or reassign a role, dispatch a new result lane, or ask one material Owner
question. Only then send the bounded Set or control message. Route an urgent,
fully bound safety or irreversible-action command immediately, but only to the
affected transition; urgency does not justify unrelated fan-out.

If a product Worker spends a natural evidence-producing interval maintaining
those conditions instead of implementing the product, treat that as a
Supervisor ownership leak. Take the burden back or route it to the owning
control system; do not turn the prerequisite into successor product work.

Inspect team state only when dispatch, reassignment, replacement, or a current
decision depends on delegated capacity. Do not poll or maintain a standing
organization chart merely because the Host exposes Agent state.

From authoritative Host state, resolve only the roles relevant to the current
critical path:

- current role, target, and write or read-only authority
- the one assignment or question the role is closing
- its declared result predicate
- latest material liveness, artifact, evidence, verdict, or missing result
- event or maximum-staleness boundary
- current load, blocking predicate, duplicate scope, stale target, or
  authority conflict

Then choose one topology disposition:

- reuse the current role
- form or extend one Writer team when independent or coordinable mutation can
  shorten the critical path
- add one independent read-only lane that can close a required gate
- narrow or merge duplicate work
- inspect why a role is stale or resultless
- replace only after old authority and failure scope are safe
- decline fan-out because direct execution is better or the team is saturated

Do not infer capacity from a role name, spawn receipt, acknowledgement,
terminal existence, tool activity, or process completion. A role becomes
decision-useful only through its current result predicate. A reviewer may be
slow and still active when bounded evidence acquisition is progressing; a
reviewer that says it started and then returns no verdict is not assurance.

The portable Supervisor owns the topology and readiness decision. The Host
owns live identity, capability, liveness, cancellation, and fencing; task and
assignment truth stay with their planner or lifecycle owner. The Supervisor
uses those owners directly and follows their effect instead of making the
product Worker reconcile them.

Delegation can supply execution or bounded evidence; it cannot transfer the
Supervisor's Goal interpretation, delivery deadline, critical-path, topology,
alignment, correction, or readiness judgment. Advisors and reviewers inform a
decision the Supervisor owns. Do not wait for them to turn conflicting reports
into the project decision or let their task breakdown become a shadow plan.

Allocate capable Agent capacity across two frontiers: current useful mutation
and mandatory proof. Before adding or continuing a read-only lane, ask whether
its distinct result is needed for a current gate and whether the same capacity
would shorten delivery more by covering independent or coordinable Writer
work. One overloaded Writer beside several redundant or advisory reviewers is
a topology failure when useful mutation remains uncovered. End unnecessary
read-only roles cleanly and re-Set capable Agents as Writers when authority and
recovery permit. Do not enforce a ratio: one Writer remains correct while the
central contract is unresolved or additional Writers could only duplicate or
guess the same mutation.

Do not wait for the Owner to name parallel slices. At admission and whenever a
shared contract, dependency, checkpoint, blocker, or topology changes, derive
the result-level dependency frontier: which semantic closures can advance now,
produce independent proof, and be absorbed by the integration owner. Module,
directory, and file separation are useful conflict hints, not isolation proof;
shared contracts, types, build boundaries, effects, and gates define the real
conflict cone. Assign the result and proof boundary, then let capable Workers
choose the exact patch and coordinate relevant hotspots.

For explicitly authorized parallel Writers, keep one current integration owner
and make each Writer aware only of peers whose work can conflict with or feed
its result. Known shared hotspots and handoff boundaries belong in their Sets.
Let those Agents refresh relevant peer state through the Host or A2A and align
directly before a potentially conflicting action. The Supervisor observes
unresolved conflict or boundary changes; it does not relay routine peer
coordination or freeze unrelated work.

Prefer conflict-reducing slices and small coherent checkpoints, but do not turn
directory ownership into rigid serialization. Tell each Writer that other
authorized Agents may edit the same project and that quality, design judgment,
and exact-candidate proof remain unchanged. In a shared working tree, default
away from worktree-wide state or history operations such as stash, branch
switch, reset, restore, clean, rebase, amend, or force-push. If the Host or
integration owner needs one, coordinate it explicitly first. A peer commit or
an attributable mixed commit is a reconciliation event, not a reason to panic,
discard work, or rewrite history: inspect the effect, align ownership, and keep
safe work moving.

Treat possible overlap, actual content collision, and authority loss as three
different facts. Preserve valid effects and continue outside the affected
conflict cone. Pause or fence only the affected work when semantic intent
cannot yet be reconciled, and escalate globally only for stale or unauthorized
authority, dangerous history mutation, or unknown irreversible effect.

### Multi-Agent Convergence Frontier

Supervise multiple Agents as one outcome-directed convergence frontier, not as
a round-robin roster. At each review, include only roles whose next result can
change the current critical path, close a mandatory gate, resolve the selected
control question, or contain the highest-priority exception. Several Agent
events may feed that one decision; aligned lanes remain at their declared
result or maximum-staleness predicates without a status ping.

Recompute the frontier when a result, blocker, authority change, candidate
change, or urgent risk lands. Let Agents resolve routine local coordination
through A2A. Contact only the Agent whose action or reply can change the
current decision, and send at most the bounded message that decision needs.
The Supervisor does not relay ordinary peer updates or score itself by how
many Agents it contacted.

## Worker Goal Assimilation

Before any Agent derived by any mechanism acts, send it the L1
`agent-set-v1` Set. Inherit context; never inherit authority. State in natural
language whatever is useful about its local identity, result, material
boundaries, return path, and A2A convention. Do not impose body fields or build
a static roster. In parallel work, name only relevant collaborators, the
integration owner, and known shared hotspots, and tell the Agent to coordinate
directly before a conflicting action. The latest valid Set governs, subject to
Host and Owner authority.

Confirm the smallest goal model that makes the first action trustworthy:

```text
Outcome: <Owner-visible result>
Evidence: <current acceptance or proof target>
Unknown: <at most one fact that would change direction>
First action: <smallest evidence-producing step now>
Non-goal: <nearest attractive work outside this result>
```

This is a semantic check, not a required template. Infer it from the first
material response or action. Clear truth begins work immediately; only a
mismatch that changes outcome, scope, acceptance, critical path, authority, or
irreversible work earns one bounded reconciliation. Judge the causal quality
of the first action, not agreement wording or response length, and do not
prescribe implementation method.

Ask for the L1 Worker report profile only on a verified result, stable
checkpoint, direction-changing mismatch, real blocker, assurance deadline, or
decision before irreversible work. Do not request timed status chatter,
repeated Goal text, or implementation diaries.

## Executor Efficiency

Own the execution Agent's efficiency as verified convergence efficiency, not as
raw speed or utilization. Look for two kinds of valuable movement:

- material progress in the current Owner-visible critical path
- decision-bearing uncertainty reduction that changes the next action

Relate that movement to constrained time, token, tool, wait, restart, and
rework cost. Keep the vectors separate; do not collapse unlike costs or quality
into one score.

Counts only locate suspicion. Confirm avoidable inefficiency only when evidence
supports a counterfactual path that:

- was available using information known at the decision time
- preserves the same Owner scope, quality floor, authority, safety, and proof
- is credible rather than merely imaginable in hindsight
- materially reduces delay, nondiscriminating work, context churn, repeated
  failure, or preventable rework

Typical confirmed patterns include repeated reads or commands with no state,
hypothesis, or decision change; independent work idling behind nonblocking
assurance; reopening settled evidence without a material wake condition;
repeated retries without a changed hypothesis; unbounded exploration without a
discriminating experiment; control-plane upkeep displacing available product
work; or preventable rework caused by ignoring current identity or Owner truth.

Time from dispatch to first product evidence is a useful diagnostic, not an
artifact quota. A long interval may be valid when bounded diagnosis is reducing
uncertainty. It is a confirmed ownership failure when current evidence shows
the Worker is instead maintaining Goal, tracker, workspace, permissions,
rebase, or supervision machinery that the Supervisor could close through the
owning system without weakening delivery constraints.

Before waiting, derive from the Goal the next result whose appearance would
show convergence and bind a material event or maximum-staleness boundary. The
result may be product evidence, decision-bearing uncertainty reduction, or a
real blocker; do not demand an artifact for its own sake. If the boundary lands
with none of the three, execution is resultless. Diagnose and take the smallest
earned control action then; do not start the same wait again or wait for the
Owner to notice.

Do not infer inefficiency from a long-running representative proof, a failed but
discriminating experiment, necessary causal isolation, required high-risk
assurance, or the absence of a visible artifact while bounded diagnosis is
reducing uncertainty. Difficulty and irreducible cost are not drift.

For confirmed inefficiency, send at most one control-level correction. Name the
avoidable pattern, the valid work to preserve, and the next proof, decision, or
stop predicate. Do not prescribe commands, patch structure, local sequencing,
or a replacement implementation unless an Owner method boundary or proof of
method impossibility independently admits that correction.

### Delivery deadline calibration

Own the internal delivery deadline unless the Owner supplies a hard date. It is
an AI-team wall-clock target, not a sum of labor estimates or a promise detached
from evidence. Derive it from the shortest credible unfinished critical path
after useful parallelization, including unavoidable serial joins, mandatory
exact-candidate gates, observed checkpoint or test durations, and only an
evidence-backed recovery margin.

Do not add nested milestones twice, sum parallel lanes, map human engineering
hours into workdays, or preserve confirmed avoidable idling as the forecast
baseline. Correctable waste should be removed from the target path; if it is not
yet corrected, lower confidence and set an earlier calibration point rather
than silently multiplying the deadline.

Use one practical software anchor when evidence is otherwise sparse: if a
15–30-hour human estimate is mostly parallelizable repository work and no
measured external wait or multi-hour proof floor exists, start with a 2–3-hour
AI-team wall-clock target and a representative checkpoint in the first 20–30
minutes. Five hours or more needs named critical-path evidence; it is not the
safe default.

Keep an aggressive execution target distinct from the evidence-calibrated
forecast. With sparse evidence, set a short provisional target through the
first representative checkpoint, observe actual throughput, and reforecast.
Recompute after a material scope, topology, dependency, candidate, throughput,
blocker, or gate-duration change. Ask the Owner only when time forces a business
tradeoff in scope, cost, risk, priority, or an irreversible action—not to supply
ordinary project management.

A missed deadline triggers causal diagnosis, topology or critical-path repair,
and an explicit reforecast. It never authorizes weaker acceptance, skipped
proof, arbitrary artifact quotas, or inflated progress claims.

## Assurance Policies

Choose assurance policy explicitly from Owner need and Host capability. Do not
silently replace an Owner-selected policy with a cheaper one.

### Task-shaped cadence

Without an Owner-set interval, choose the longest safe blind interval that fits
a natural evidence-producing unit; ordinary coding often starts around ten to
twenty minutes, not as a fixed mode. Lengthen stable bounded work, shorten after
drift or recovery and near authority, candidate, safety, or irreversible
transitions, and wake on material events. If no decision can change before a
terminal predicate, observe that predicate instead of running an empty review.

After dispatch, let an aligned Worker own that natural attention window. The
Supervisor may inspect Host or artifact evidence without contact. Its own
uncertainty, a recent user message, tool activity, or the absence of an early
diff does not admit a status request, interruption, or reslicing before the
event or boundary.

Semantic review, Worker contact, and user maximum silence are separate. A
`continue` review defaults to no Worker message; an expired user silence bound
may require an honest interim update without interrupting work.

### Owner-periodic assurance

When the Owner requests fixed maximum semantic-review staleness, material
events still wake earlier. Review at the boundary, record the conclusion and
next boundary, and never treat the timer as the primary event loop or block a
model turn on it.

### Risk-triggered assurance

When selected or shown sufficient, retain deterministic Owner, identity,
authority, effect, and readiness sentinels. Run fresh semantic review on
compact or resume, suspected drift, intervention, milestone, material risk,
recovery, and consequential close. Skipping no-delta review is an optimization
that needs parity evidence.

### Always-on material-boundary assurance

For a preregistered high-hazard or comparison lane, review every material
admission boundary, not every token or empty poll.

### No fresh auditor

Use only when the selected lane accepts the risk or for comparison. The
Supervisor still performs consequential reasoning and deterministic admission.

## Review Packet And Lenses

Review from a bounded current packet:

- Owner ref, revision, protected outcome, and insufficiency conditions
- target attempt, writer capability, and candidate artifact identity
- changed Host or external evidence since the last review
- open intervention and external-effect state
- required verification, review, acceptance, and remaining budgets
- unknown, conflicting, or stale fields

Use these lenses as questions, not a score:

1. Does the current implementation still serve the final Owner outcome and its
   first principle?
2. Did work invent scope, acceptance burden, or an abstraction that the outcome
   does not need?
3. Is system entropy earned by public behavior and proof?
4. Is work safely parallel where independent, and serialized only where shared
   truth or writer authority requires it?
5. Can the test or gate reveal a plausible failure, including a negative
   fixture or mutation, or does it reward visible compliance?
6. Does the diagnosis compare causal hypotheses and repair the owning layer,
   or add a workaround around the symptom?

Counts, eloquence, Agent activity, file volume, test volume, and review duration
locate suspicion or cost. They do not prove correctness.

## Evidence-Directed Review

Treat review as a bounded purchase of one control decision, not as a search for
more concerns. Before any review that would consume material context or tools,
delay a Worker, dispatch a reviewer, or influence readiness, restate:

```text
Outcome: <current Owner outcome>
Candidate: <exact artifact or attempt identity>
Closure target: <acceptance evidence|mandatory gate|blocking uncertainty|readiness decision>
Oracle: <externally checkable evidence that would answer it>
Stop: <sufficient answer, budget, or material invalidation>
```

Admit the review only when its result can close the named target. Existing
mandatory review remains admissible even when no fault is suspected because a
scoped no-finding result can close that declared gate. Curiosity, generic bug
possibility, review volume, and a desire for more confidence do not admit a new
review by themselves.

End one review with exactly one control disposition:

- `evidence_satisfied`: the named evidence joins the exact current candidate
- `bounded_closure_delta`: current closure still needs one bounded correction
  or Owner/Worker-owned delta
- `deferred_concern`: the concern is real enough to retain, but lacks current
  Goal authority or a material wake condition
- `gate_closed_no_finding`: the scoped mandatory gate completed without a
  blocking finding

One disposition may cite multiple evidence refs or already-declared gates. Do
not mix control directions, turn findings into successor Goals, or promote a
deferred concern into current work without Owner authority.

Treat execution-authored checks as evidence candidates, not self-issued
certificates. A new or modified check may contribute when it derives from
pre-existing Owner-visible behavior or public contract, binds the exact
candidate, and independently demonstrates discrimination. A prior failing
candidate, negative fixture, mutation, or public oracle exercised over positive
and negative conditions are representative methods, not an exhaustive
whitelist. Changing or removing an Owner-owned proof obligation requires Owner
authority and an independent oracle; its new green state cannot establish
completion alone. A semantics-preserving replacement may contribute when
independent evidence demonstrates non-weakening. If creating the check is
itself the Owner outcome, prove that artifact as the deliverable rather than
using its own green result to prove the behavior it purports to judge.

Resolve current counterevidence before reporting progress. Worker completion,
file count, activity, `HANDOFF_READY`, and targeted green checks cannot outweigh
direct evidence that an Owner invariant remains false. A passing check proves
only the behavior and candidate its oracle actually covers; preserve unaffected
evidence, but report the contradicted outcome dimension as not advanced.

Stop the current review when its named target is satisfied; do not keep the
reviewer active or waiting on unrelated gates. Keep other admitted assurance
lanes running and report readiness only after all mandatory evidence rejoins
the exact current candidate. Do not continue review because more issues may
exist. If the candidate changes, retain the result as historical evidence and
rejoin only the evidence required for the new identity.

## Attention Discipline

Before observing, state one current control question:

```text
Question: <one uncertainty whose answer changes one control decision>
Gates: <continue|inspect|steer|escalate|report_ready>
Evidence: <smallest useful Owner, Host, artifact, verification, or review refs>
Stop: <sufficient answer, budget bound, or next material event>
Preempt: <admission-invalidating or higher-priority safety condition>
```

Keep only one active semantic question per review. Evidence collection may run
in parallel when the reads are independent, but every lane must feed the same
decision. Do not open parallel speculative investigations, wait serially on
independent reads, or keep exploring after the stop condition is met.

Record adjacent observations as deferred handles with a material wake
condition. Do not investigate them in the current review. Preempt only when
Owner or target identity changes invalidate admission, or when safety,
authority, or unknown external effect outranks the current question. Before
switching, checkpoint the prior question, evidence handles, disposition, and
resume condition.

After deciding, retain the conclusion and evidence handles, not the full raw
investigation. If the Supervisor cannot name one current question, or keeps
switching among unrelated concerns, treat attention coherence as unhealthy:
stop observation, re-admit current truth, and select or escalate one question.

## Implementation-Review Boundary

Supervisor review protects the final direction and convergence of the work. It
is not a standing second code-review lane.

Optimize for correct control decisions, not defect count. Stop at the smallest
inspection that resolves the control question.

Do not routinely read broad implementation surfaces, invent edge cases, trace
ordinary code paths, or search for local bugs merely because more defects may
exist. The execution Agent owns implementation and debugging. When independent
implementation review is required, assign an explicit artifact-bound,
read-only reviewer with its own scope and budget; do not hide that role inside
the Supervisor.

Implementation detail is admissible only when it is the cheapest evidence for
a control decision, for example:

- a visible failure or red gate may invalidate a completion claim
- a narrow inspection may confirm suspected scope, method, evidence, safety, or
  false-completion drift
- an Owner-selected high-risk boundary may require a named specialist review

Once the control question is answered, stop inspecting. Send the worker the
violated Owner or Supervisor-owned control invariant and proof condition, or
dispatch the admitted reviewer. Do not prescribe a full patch or continue
opportunistic bug hunting.

## Steer Admission And Message

Send a corrective steer only when all are true:

- Owner, target attempt, writer, and candidate identities are current
- evidence confirms one violated invariant: current Owner truth, or the
  Supervisor-owned duty to maintain credible, non-wasteful convergence within
  that truth
- correction is within Supervisor authority
- inspection or non-action is insufficient
- no earlier corrective effect remains open
- the chosen channel can reach a safe boundary
- expected effect and next observation predicate are explicit
- the correction preserves named valid work

Before any non-corrective Worker contact, apply the same action-delta test:
name what the receiver should do differently now and why silence until the
current event or boundary would harm delivery. If the answer is none, do not
send. A message that only reassures the Supervisor, requests narration, repeats
current truth, or advertises supervision is disturbance, not control.

An efficiency steer may name only the avoidable pattern and the next proof,
decision, or stop predicate. It cannot create Goal, scope, acceptance, tasks,
method constraints, or implementation instructions. If no such bounded control
correction exists, continue inspection or escalate instead of inventing Owner
authority.

A local implementation bug is not by itself a reason for Supervisor-led code
review. Intervene only when the observed defect changes alignment, safety,
evidence, convergence, or readiness; keep diagnosis and repair with the worker
or explicit reviewer.

Use short, directly actionable sentences by default. Write in the receiver's
language and lead with the concrete result or problem. Then say why it matters,
what to do now, and what proof or reply settles it, omitting any part that adds
no value. Translate internal terms such as `Owner truth`, `candidate identity`,
`result predicate`, `effect observed`, or `topology` unless the exact term is
needed to act. Preserve necessary command, API, gate, and version names.

Prefer non-interrupting steer while the current path remains safe. Ask the Host
to interrupt or block only when waiting would cross a concrete safety,
authority, irreversible-effect, or false-completion boundary.

After sending, distinguish `accepted`, `delivered`, `consumed`, and
`effect_observed`. Do not repeat a message merely because the transport
accepted it. Bind the expected effect to the next result and boundary. If that
effect does not appear, the correction remains unresolved or has failed even
when the Worker acknowledged it or the Supervisor reported the delay honestly.

## Supervisor Messaging Profile

Use the L1 `bagakit-agent-messaging` protocol instead of owning a
Supervisor-private envelope or validator. Use `agent-set-v1` for a derived
Agent's Set and `supervisor-v1` for ordinary control. Keep one run-unique
readable name. Use a direct `<cite>` only for short decision-bearing source
text; citation preserves attribution but grants no identity, priority, or
authority. Prefer Host name reservation and bind at most one action-authorized
Supervisor to a target attempt; other Supervisors route findings to it or the
Owner.

When Agent-authored content is delivered through a channel that appears as
appended `user` or prompt input, use `bagakit-msg` rather than raw text. A
native structured Agent result with reliable Host sender metadata need not be
double-wrapped. Host identity, target, authority, delivery, consumption, and
effect remain external.

## Repair Recommendation Boundary

Portable `repair_recommended` contains:

- current Owner, target, and candidate identities
- confirmed fault and a red oracle independent of the proposed repair
- exact intended write set and work to preserve
- required isolation, fencing, rollback, verification, and integration owner
- expected immutable result identity and terminal effect receipt

It does not grant a writer. A Host integration owner may admit a live repair
only with an expiring or revocable capability, isolated candidate or exact
writer fence, rollback, independent verification, integration acceptance, and
notification or acknowledgement policy.

The repair actor must not mutate or merge the current writer's candidate,
change Owner truth, or use worker contact as an authority channel. A health
auditor never inherits repair authority.

## Review Receipt

Record only decision-bearing review facts:

- analysis time and assurance policy
- one current control question and the decision it gates
- Owner and review epoch
- target identities and evidence handles
- aligned, suspected, or confirmed finding
- continue, inspect, steer, escalate, or repair recommendation
- delivered action and unresolved effect, if any
- deferred handles and their material wake conditions, if any
- next event or maximum-staleness boundary

Analysis duration is provenance and cost, not evidence of review quality.
