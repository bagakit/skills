# Project-Native Proof-First Ladder

Use this ladder after the protected-principle gate.

## Ladder

1. Clarify the protected principle and owner truth.
   - Confirm the user goal, behavior boundary, non-goal, requirement owner,
     implementation owner, and proof plan.
   - If confirmed discussion changed a durable requirement, update the owning
     requirement document before implementation relies on it.
2. Locate existing behavior and capabilities.
   - Read nearby code, tests, configuration, owner documents, helpers,
     conventions, and installed dependencies before proposing new code.
   - Inspect the actual dependency API and project usage before concluding that
     an existing library cannot satisfy the need.
   - Identify stacked repairs, gates, fallbacks, exceptions, retries,
     supervisors, duplicate state, or compatibility paths.
3. Choose the durable owning boundary and smallest real vertical slice.
   - Make the architecture decision for the maintainable target state.
   - Implement only the smallest current end-to-end path through that target
     boundary; do not create a knowingly disposable architecture for later
     replacement.
4. Prefer deletion, narrowing, configuration, or wiring.
   - Use existing behavior when it already supports the goal.
   - Delete obsolete code, state, tests, or documents when the project policy
     does not require a transition path.
   - Prefer removing or narrowing a compensating layer when that restores the
     owner contract.
5. Reuse before invention.
   - Prefer the nearest owner-owned project pattern, then platform or standard
     library behavior, then an already installed dependency.
   - When a new dependency is justified, prefer a mature and actively
     maintained library over custom implementation.
6. Write the minimum new code at the chosen boundary.
   - Add only what the protected goal and proof plan require.
   - Keep modules cohesive, concerns separated, and dependency direction clear.
   - Preserve a working path until its durable replacement closes the required
     vertical slice; then cut over and delete the obsolete path according to
     project policy.
7. Close cause and proof proportionally.
   - For fixes, prove that the causal owner was repaired rather than hidden.
   - Prove an owner-owned contract and the public behavior it supports.
   - Use the smallest sufficient oracles; do not multiply checks when one
     stronger proof surface already closes the risk.
   - Treat verification scope and execution cost as part of the proof plan.

## Stop Rule

Stop at the first rung that protects the task-specific goal, uses the durable
owning boundary, and satisfies the proof plan. Do not escalate for polish,
symmetry, speculative flexibility, or unrelated cleanup.

Smallest means minimum total system complexity for the required behavior, not
minimum changed lines. A smaller diff that preserves duplicate truth, temporary
architecture, or a compensation stack has stopped too early.

## Escalation Rule

Escalate only when the current rung cannot protect the goal, cannot reach the
durable boundary, or cannot be proven. Name the failed rung and reason before
moving up.

Route back to debugging, refactoring, architecture, research, or verification
when that discipline must close a prerequisite before implementation can
continue.

## Compatibility And Cutover Rule

Do not invent compatibility, migration, fallback, dual-read, or dual-write
behavior. Follow the explicit user or project owner policy.

When compatibility is required, name its contract, owner, scope, exit
condition, and deletion path. When the project requires direct replacement,
switch all owners and delete the obsolete path in the same completed cutover.

Preserving a working path while its target-state replacement is unfinished is
delivery sequencing, not permission to create permanent split truth.

## New Abstraction Rule

Add a new abstraction only when it reduces real total complexity, prevents
meaningful duplication, or matches a local pattern that already owns the
behavior. Do not add an abstraction or configuration layer merely to predict a
future variant.

## Dependency And Prior-Art Rule

Before adding a dependency or writing a custom capability:

1. inspect project code and installed dependency capabilities
2. inspect platform and standard library behavior
3. for novel, foundational, security-sensitive, reliability-sensitive, or
   costly decisions, inspect proven mature-product or research patterns
4. add a maintained dependency or custom implementation only when the earlier
   routes cannot protect the goal at acceptable proof and maintenance cost

Do not require external research for ordinary local changes when project-native
evidence already resolves the decision.

## Requirement Sync Rule

When confirmed user discussion changes a durable requirement, update the
owning requirement document before completing implementation or commit. Keep
the wording close to the user's meaning while normalizing it into the owner's
existing structure.

Do not create a new requirement document when an owner already exists, and do
not turn unconfirmed inference or implementation discovery into user-approved
scope.

## Compensation Layer Rule

Do not add another repair, gate, fallback, exception, retry, or supervisor layer
until you have checked whether the better fix is to delete, narrow, replace, or
move the underlying contract to a project-native or platform-native owner.

Escalate or reroute when the proposed patch would make the old compensating
stack harder to delete, hides a broken owner boundary, or proves only that the
scaffold still satisfies itself.

## Validation Authority Rule

Each owner validates deterministic facts it already owns. A model or caller
should submit only the smallest decision delta the owner cannot derive.

Do not require exhaustive restatement of owner-known inventory, unselected
items, duplicated metadata, or subjective quality judgments as an admission
hard gate. Keep truth, safety, permission, membership, protocol, idempotency,
and atomicity hard; keep relevance, sufficiency, style, and preference advisory
unless the user goal makes one of them an exact contract.

Correction should be monotonic: narrower, more local, and easier to satisfy.
If a rejection expands the required payload or retry surface, recheck the gate
owner before adding another repair.

## Proof Rule

Prefer proof surfaces in this order:

1. structured owner state or deterministic artifact
2. public command or API boundary
3. test that covers the requested behavior
4. narrow wording contract when wording is the behavior
5. manual verification when automation is not yet available

Use only the layers needed by the risk. Do not claim success from implementation
shape alone, and do not treat more checks as stronger proof by default.

## Verification Execution Rule

Choose the least costly execution plan that still closes the identified risk:

1. start with owner-local or affected-surface checks tied to the changed
   behavior
2. run independent checks concurrently only when their isolation, resources,
   and results remain reliable
3. expand to dependent integration, package, or repository suites when the
   change crosses boundaries, dependency reach is uncertain, shared state raises
   risk, or explicit owner policy requires broader proof
4. avoid full-repository regression for a narrow change when smaller oracles
   already close the owner contract and public behavior

Execution time is a design constraint, not permission to weaken proof. If the
selected scope cannot close the required risk, broaden it even when the checks
are slow; improve test partitioning separately instead of skipping evidence.
