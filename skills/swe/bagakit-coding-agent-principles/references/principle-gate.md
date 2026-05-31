# Protected-Principle Gate

Use this gate before non-trivial coding work. The gate makes the decision
ladder principle-led instead of checklist-led.

## Static Meta-Principle

Protect the task-specific user goal with the smallest durable, project-native
change at the owning boundary, proven through behavior.

## Adaptive Gate

For tiny, obvious edits, compress the gate into one sentence:

```text
Protected goal: <goal>; owner: <truth/behavior owner>; strategy: <smallest durable path>; proof: <check>.
```

For non-trivial or high-risk work, write four fields:

- `protected_goal_or_principle`
  - the behavior, user value, or invariant the code change must protect
- `project_native_strategy`
  - the requirement and behavior owners, nearest existing pattern,
    configuration, dependency, or platform affordance that should shape the
    implementation
  - the long-term target boundary and smallest current vertical slice
- `failure_boundary`
  - what would make the implementation wrong, too broad, unsafe, or outside
    coding scope
  - include whether the change would add a compensating repair, gate, fallback,
    exception, retry, or supervisor layer instead of fixing the failing
    contract
  - include compatibility, migration, temporary architecture, working-path
    removal, second-truth, and cutover risks when they apply
- `proof_plan`
  - for fixes, the evidence that closes the causal owner
  - the smallest owner-owned contract and public-behavior oracles that would
    prove the change without duplicating owner-known facts

## Expansion Triggers

Use the explicit four-field gate when any trigger appears:

- behavior boundary is unclear
- new abstraction or dependency is being considered
- change crosses modules, packages, or ownership boundaries
- compatibility, migration, fallback, replacement, rollout, or cutover behavior
  is being considered
- the fix adds or edits repair, quality-gate, exception, retry, or supervisor
  machinery
- a new package or custom mechanism is proposed before existing dependency
  capabilities have been inspected
- the change needs a smallest real end-to-end slice before broader expansion
- task may really be debugging, refactoring, review, architecture, research, or
  writing
- proof plan is indirect or implementation-shaped
- a validator requires a model or caller to restate owner-known inventory or
  subjective quality judgments
- confirmed user discussion changed durable requirement truth
- user requirement has safety, privacy, data, accessibility, or production risk

## Failure Signals

Stop and clarify or reroute when:

- the protected goal is inferred but unconfirmed
- requirement or behavior ownership is unclear, duplicated, or stale
- the proof plan cannot prove public behavior or an owner-owned contract
- the strategy depends on unrelated cleanup or speculative extensibility
- the strategy knowingly creates a disposable target boundary that must be
  replaced later when a durable boundary can be chosen now
- the strategy removes a working path before its replacement closes the needed
  vertical slice, or leaves both paths as permanent truth
- compatibility, migration, or fallback behavior is invented without an
  explicit project or user requirement
- the strategy adds a new compensating layer while the underlying contract,
  owner boundary, or platform-native replacement remains unexamined
- a hard gate delegates owner-known facts to fallible model restatement or
  turns relevance, sufficiency, style, or other subjective quality into
  admission protocol
- implementation relies on a confirmed requirement change while the owning
  requirement document remains stale
- the task level is mismatched
- the change would be smaller only by dropping required behavior

## Optional Study

Read only the study matching the observed failure mode:

- `studies/compensatory-complexity-runaway.md`
- `studies/validation-authority-inversion.md`

Treat studies as background, not required steps for every coding task.
