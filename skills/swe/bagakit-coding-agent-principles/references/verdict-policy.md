# Verdict Policy

Use this policy to decide how reviewer output changes the main agent's next
action.

## Verdicts

- `pass`
  - proceed with the selected rung and proof plan
- `pass_with_advisory`
  - proceed, but include the advisory notes in residual risk or cleanup
    suggestions
- `needs_correction`
  - revise the gate, ladder, implementation, or proof before proceeding
- `reroute`
  - stop coding and route to a better level
- `blocked`
  - ask the user or gather missing evidence before implementation

## Finding Priority And Delivery

The coding layer consumes project-owner or reviewer-assigned priority to decide
whether the current candidate may proceed. Use the project severity policy when
one exists. When the Coding Layer Reviewer owns classification and no project
policy resolves it, classify by consequence, affected reach, urgency,
recoverability, and confidence:

- `P0` or `P1`
  - the finding invalidates the protected goal, owner contract, required proof,
    or an owner-defined critical boundary
  - block the current candidate and fix immediately before it proceeds, commits,
    or claims completion
- `P2`
  - important but bounded defect or maintainability risk that does not invalidate
    the protected goal, owner contract, or required proof
  - the closed primary intent may commit; emit an independent-repair handoff for
    the owning supervision or planning workflow to schedule in parallel when
    appropriate
- `P3`
  - low-impact local quality, cleanup, or optimization issue whose residual risk
    is acceptable
  - the current candidate may commit; disclose it when decision-relevant, and
    propose combining it with future related owner work instead of forcing a
    standalone task

Priority measures consequence and urgency, not repair effort. Do not downgrade
a finding because the fix is expensive, the deadline is near, or a compensating
workaround hides the symptom. A credible unresolved risk that could be `P0` or
`P1` remains blocking until bounded evidence lowers or confirms it.

This policy owns coding-candidate admission and handoff only. It does not
redefine host alert or incident severities, assign Agents, schedule parallel
work, or mutate project-planning truth.

## Blocking Findings

Treat these as at least `P1` for the current candidate unless direct evidence
establishes a genuinely bounded case:

- level mismatch
- unconfirmed protected goal that changes implementation direction
- invalid ladder stop rule
- proof plan insufficient for public behavior or owner-owned contract
- required behavior dropped for a smaller patch
- requirement or behavior SSOT break that creates conflicting truth
- invented compatibility, migration, fallback, or temporary architecture not
  required by the user or project owner
- working behavior removed before its durable replacement closes the required
  vertical slice, or permanent split truth remains after cutover
- compensating-layer accumulation that masks a broken contract, owner boundary,
  or platform replacement path
- new dependency or custom implementation chosen without inspecting existing
  capabilities, when that evidence could change the decision
- validation authority inversion that requires exhaustive model restatement of
  owner-known facts or turns subjective quality into admission protocol
- implementation relies on a confirmed durable requirement change while the
  owning document remains stale
- safety, data, production, accessibility, or privacy risk without approval

## Advisory Findings

Treat these as `P2` or `P3` unless they affect the protected goal or proof:

- local readability improvement
- minor DRY opportunity
- SOLID concern outside the touched boundary
- optional cleanup
- stronger naming
- future eval or validation improvement
- mature-product or external research that is unnecessary for the current
  project-native decision
- background study would help future maintainers but does not change the
  current protected goal or proof

## Main-Agent Response

- For `pass`, implement or continue.
- For `pass_with_advisory`, continue and report residual risk.
- For `needs_correction`, patch the gate, ladder, or proof plan before editing
  more code.
- For `reroute`, stop coding and switch to the named branch.
- For `blocked`, ask or gather evidence. Do not invent certainty.
- For `P0` or `P1`, do not return `pass` or `pass_with_advisory`; correct the
  issue immediately or block/reroute the current candidate.
- For `P2`, allow the closed primary intent to commit only when the finding does
  not weaken required behavior or proof, then hand repair to the owning
  supervision or planning workflow.
- For `P3`, keep only decision-relevant residual risk and combine it with future
  related owner work when the planning owner accepts that route.
- If the issue is compensatory complexity runaway, prefer `needs_correction`
  or `reroute` over another small coding patch unless the patch reduces the
  compensating stack or repairs the owning contract.
- If the issue is validation authority inversion, prefer `needs_correction`
  over a larger schema, correction payload, retry budget, or second validator.
  Move owner-known facts back to the owner and shrink the external decision
  delta.

## Reporting Shape

```text
Review verdict:
Findings: # each tagged P0-P3 with evidence
Immediate correction:
Parallel-repair handoff:
Deferred or residual:
Next action:
```
