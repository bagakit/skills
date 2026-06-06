# Coding Layer Scorecard

Use this scorecard only after the Level Router accepts `coding` or explicitly
allows coding with documented risk.

## Scores

Use `0`, `1`, or `2`.

- `protected_goal`
  - goal is explicit and implementation-relevant
- `owner_truth_and_strategy`
  - requirement and behavior owners are explicit, one SSOT is preserved, and
    implementation follows the durable project-native boundary
- `ladder_use`
  - existing code, dependency capabilities, lighter rungs, and any required
    prior art were inspected and rejected for clear reasons
- `stop_rule`
  - the selected vertical slice is sufficient and heavier work is not justified
- `proof_plan`
  - proof closes the causal owner when applicable, an owner-owned contract, and
    public behavior with proportionate oracles, scope, and execution cost
- `scope_control`
  - diff stays inside one intent and minimizes total system complexity rather
    than only changed lines
- `compensation_and_evolution_risk`
  - change avoids unowned compatibility, temporary architecture, permanent
    dual paths, and fragile repair/gate/fallback stacks
- `maintainability`
  - responsibilities and dependency direction stay clear, and the target state
    does not require a known later rewrite

Total interpretation:

- `14-16`: strong
- `11-13`: acceptable with notes
- `8-10`: correction recommended before implementation or commit
- `0-7`: blocking unless user explicitly lowers the bar

## Five Decision Lenses

Apply only the lenses triggered by the task. They guide the scores above; do
not score them again or create work merely to fill every lens.

- `Truth And Ownership`
  - does the change use the owning requirement and behavior sources instead of
    creating parallel truth?
  - if confirmed discussion changed a durable requirement, is the owner updated
    with the same meaning?
- `Total Complexity`
  - does the change prefer deletion, narrowing, wiring, reuse, DRY, and
    KISS/YAGNI without premature abstraction?
  - do modules keep one clear responsibility and established dependency
    direction?
- `Durable Evolution`
  - is the long-term boundary correct while the current vertical slice stays
    minimal?
  - does cutover preserve working behavior until the replacement is proven,
    then remove obsolete paths under project policy?
- `Reuse Before Invention`
  - were existing dependency capabilities inspected rather than assumed absent?
  - when local evidence is insufficient, is the chosen library mature and
    maintained, or is custom work justified by proven gaps?
- `Causal And Proof Closure`
  - for a fix, does the change repair the causal owner rather than compensate
    around it?
  - do validators check owner-known facts directly, request only the minimum
    external decision delta, and prove behavior with the smallest sufficient
    oracles?
  - does verification begin at the affected owner surface, parallelize only
    independent checks, and expand with dependency reach or risk without
    dropping required proof?

## Blocking Conditions

- protected goal or owner truth is insufficient
- selected level or stop rule is invalid
- implementation drops required behavior
- change creates conflicting requirement or behavior truth
- new dependency, abstraction, or custom mechanism lacks evidence that existing
  capabilities are insufficient
- compatibility, migration, fallback, or temporary architecture is invented
  without an explicit user or project-owner requirement
- a working path is removed before its durable replacement proves the required
  vertical slice, or old and new paths become permanent truth
- new repair, quality gate, exception, retry, or supervisor layer masks an
  unexamined broken contract or owner boundary
- hard gate requires exhaustive model restatement of owner-known facts or turns
  subjective quality into admission protocol
- patch hardcodes a type, report, route, or environment around a general
  contract failure
- implementation relies on a confirmed durable requirement change while the
  owning document stays stale
- verification scope is narrowed for speed even though it cannot close the
  required owner contract or public-behavior risk
- engineering risk affects safety, data, production, or accessibility

## Finding Priority

After scoring, label every concrete finding `P0`, `P1`, `P2`, or `P3` using the
project severity policy and `verdict-policy.md`. Score totals do not determine
priority mechanically, and the main coding agent must not downgrade reviewer
priority to admit the candidate.

## Output

```text
scores:
blocking_findings: # each tagged P0 or P1
advisory_findings: # each tagged P2 or P3
required_corrections:
parallel_repair_handoffs:
deferred_or_residual:
optimization_suggestions:
residual_risk:
```
