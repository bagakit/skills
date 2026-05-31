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

## Blocking Findings

Treat these as blocking:

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

Treat these as advisory unless they affect the protected goal or proof:

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
Blocking:
Advisory:
Correction made:
Residual risk:
Next action:
```
