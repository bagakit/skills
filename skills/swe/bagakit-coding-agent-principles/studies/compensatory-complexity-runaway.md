# Compensatory Complexity Runaway

This study is optional background for coding tasks. Read it when a proposed
fix adds another repair, quality gate, fallback, exception, retry, supervisor,
or special case to an already fragile path.

## Name

Use `compensatory complexity runaway` for this failure mode.

Short definition:

- A system fails to repair the owning contract, boundary, or platform fit, then
  repeatedly adds compensating layers. The compensating layers begin to
  interact, create new failures, and require further compensation.

This is narrower than general technical debt. The signal is not just "there is
debt"; the signal is that the workaround system has become an active subsystem
with its own bugs, gates, states, and exceptions.

## Local Shape

Typical coding-agent path:

1. A core contract is weak, ambiguous, or too custom.
2. A patch adds a repair layer.
3. The repair layer creates false positives, false negatives, or format drift.
4. Another patch adds a quality gate, retry, fallback, or special case.
5. The gate proves the scaffold rather than the user-facing behavior.
6. Future fixes become cheaper inside the compensation stack than at the
   underlying boundary.
7. The system becomes harder to delete than to keep patching.

Concrete red flags:

- report-type, route, environment, or customer hardcodes
- exception lists that grow faster than the owned contract
- repair A creates output that repair B later destroys
- validation only proves that the repair/gate pipeline still runs
- a supervisor or checker is added because the executor cannot trust the
  control plane, then the supervisor itself requires another supervisor
- the smallest patch makes a future replacement harder

## Good Case

A good fix reduces the compensation stack or repairs the owner boundary.

Example:

- Replace custom rendering glue with a platform-native renderer.
- Turn a prompt-only format expectation into a typed owner contract.
- Delete an obsolete repair once the upstream representation is deterministic.
- Narrow a quality gate to the product invariant it actually protects.
- Route to architecture or refactoring when the root issue is boundary design.

Good-case proof:

- user behavior or owner-owned contract is proven
- the number of special cases, retries, or repair stages decreases or stays
  justified
- the replacement path makes the old compensation stack easier to delete
- evidence is tied to the real release object or public command boundary

## Bad Case

A bad fix makes the compensation layer more capable while leaving the broken
contract untouched.

Example:

- Add a report-type hardcode for a failed renderer.
- Add a retry that feeds malformed output back into a wider rewrite surface.
- Add a gate that blocks delivery because an unrelated advisory field is
  missing.
- Add a supervisor rule, then allow the executor to continue without requiring
  supervisor reconciliation.

Bad-case proof smell:

- tests assert implementation shape or scaffold behavior, not user behavior
- the fix passes the current failure but creates a new class of exceptions
- the owner boundary remains unclear
- no one can state which layer is allowed to delete the workaround later

## Research Context

Safety and resilience engineering frame complex systems as defended systems:
layers of defense can make normal operation possible, but they also increase
system complexity and create latent interactions. Richard Cook's essay on
complex systems emphasizes that complex systems run with latent flaws and
multiple defenses rather than clean single-cause behavior.

STAMP/STPA reframes accidents as control-structure problems. For coding-agent
work, the useful translation is: a repair, gate, fallback, or supervisor is a
control action. It can be unsafe when it is missing, wrong, late, early, too
broad, or applied for too long.

ML technical-debt literature names similar shapes as glue code, pipeline
jungles, hidden feedback loops, and correction cascades. The important lesson
for coding agents is to treat "one more wrapper" as a design move, not as a
free patch.

Program-repair research warns that a patch can pass visible tests while failing
the intended behavior. In compensatory stacks, this becomes easier because the
visible tests often encode the scaffold.

Agent-computer-interface work shows that better interfaces can improve coding
agents. That is a positive version of the same lesson: prefer a simpler,
owner-native interface over piles of prompt, repair, and retry logic.

## How To Use In Coding

Before adding a compensating layer, answer:

1. What underlying contract or owner boundary is this compensating for?
2. Can the fix delete, narrow, or replace the failing layer instead?
3. Does a project-native or platform-native owner already solve this class?
4. What evidence proves user behavior rather than scaffold survival?
5. Will this patch make the old compensation stack easier or harder to delete?

If the answer to 5 is "harder", reroute to architecture, refactoring, or
research unless the user explicitly asks for a temporary containment patch.

When the compensation stack is driven by validators that ask a model to echo
owner-known facts, also read `validation-authority-inversion.md`.

## Sources

- Richard I. Cook, "How Complex Systems Fail":
  https://how.complexsystems.fail/
- Nancy Leveson and John Thomas, "STPA Handbook":
  https://www.flighttestsafety.org/images/STPA_Handbook.pdf
- D. Sculley et al., "Hidden Technical Debt in Machine Learning Systems":
  https://papers.neurips.cc/paper/5656-hidden-technical-debt-in-machine-learning-systems.pdf
- "SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering":
  https://arxiv.org/abs/2405.15793
- "Is the Cure Still Worse Than the Disease? Test Overfitting by LLMs in
  Automated Program Repair":
  https://arxiv.org/abs/2511.16858
