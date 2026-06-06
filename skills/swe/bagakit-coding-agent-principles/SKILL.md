---
name: bagakit-coding-agent-principles
description: Use as the cross-cutting principle layer whenever Codex plans or makes a non-trivial implementation change. Protect the user goal with the smallest durable, project-native change at the owning boundary, proven through behavior, especially for boundary, abstraction, dependency, compatibility, migration, fallback, validation-gate, vertical-slice, and durable-requirement decisions. Debugging, review, refactoring, architecture, testing or verification, and research keep their own primary workflows; apply this skill when they hand off to implementation.
---

# Bagakit Coding Agent Principles

Use this skill to keep coding-agent implementation work principle-led instead
of checklist-led.

Static meta-principle:

- Protect the task-specific user goal with the smallest durable,
  project-native change at the owning boundary, proven through behavior.

Minimal code is not the target by itself. Choose the long-term owning boundary,
implement the smallest current vertical slice, minimize total system
complexity, and prove the behavior that matters.

## When To Use

Use this skill when a non-trivial task reaches an implementation decision,
including after an adjacent discipline has completed its primary motion.
Typical triggers are:

- the requested behavior or non-goal could be misread
- ownership, requirement truth, module boundaries, or dependency direction are
  unclear
- the change may introduce a new abstraction, dependency, custom mechanism, or
  cross-module path
- compatibility, migration, fallback, rollout, replacement, or cutover behavior
  is being considered
- the work needs a smallest real end-to-end slice before broader capability
- the agent has not inspected what existing project code or dependencies can do
- the agent may overbuild, widen the diff, or do opportunistic cleanup
- the proposed fix adds or changes a repair, quality gate, exception, retry, or
  supervisor layer
- the proof plan is unclear, unnecessarily broad, or could prove only private
  implementation shape
- confirmed user discussion changes a durable requirement that implementation
  will rely on
- an independent principle review would improve quality for the token cost
- concrete findings need a priority that controls whether delivery blocks,
  continues with parallel repair, or defers

For tiny, obvious edits, compress the gate and ladder into one sentence before
editing.

## When Not To Use

Do not use this skill as the primary motion when the task is still:

- debugging, where causal isolation comes first
- review, where risk finding comes first
- refactoring, where behavior-preserving structure change comes first
- architecture, where system boundary and evolution decisions come first
- testing or verification, where proof-surface and oracle design come first
- research, where evidence gathering comes first
- writing, where the primary artifact is documentation and no implementation
  decision is being made

Those branches keep their own methods. Re-enter this skill when they produce a
concrete implementation decision. It must not become a SWE control plane or a
complete coding-agent runtime.

## Minimal Loop

1. Classify the level.
   - Route the primary motion correctly, then return here before implementation.
2. State the protected-principle gate.
   - Name the protected goal, owner truth, project-native strategy, failure and
     evolution boundary, and proof plan.
3. Walk the project-native proof-first ladder.
   - Inspect existing capabilities, choose the durable owning boundary, and
     stop at the smallest real vertical slice that can satisfy the proof plan.
4. Minimize total system complexity.
   - Prefer deletion, narrowing, wiring, or reuse before new code.
   - Do not invent compatibility or temporary architecture. Preserve a working
     path until its durable replacement is proven, then cut over and delete the
     obsolete path according to project policy.
5. Close cause and proof proportionally.
   - For fixes, repair the causal owner. Validate owner-owned facts directly,
     require only the smallest decision delta from models or callers, and prove
     the owner contract plus public behavior with the smallest sufficient
     oracles.
   - Start verification at the affected owner surface, run independent checks
     concurrently when isolation permits, and widen scope only when dependency
     reach or risk requires it. Do not trade away required proof for speed.
6. Synchronize durable truth.
   - If confirmed user discussion changed a requirement, update its owning
     document in the same implementation boundary using wording close to the
     user's meaning.
7. Use serial bounded reviewers when risk warrants it.
   - Run Level Router Reviewer first, then Layer Reviewer, using a bounded
     packet rather than full chat context.
8. Apply finding priority.
   - Require concrete findings to carry the project-owner or reviewer-assigned
     P level; do not downgrade one to admit the candidate. Fix P0/P1
     immediately, route P2 through an independent-repair handoff after the
     closed intent commits, and allow an acceptable P3 residual to be proposed
     for future related owner work.
9. Report the result.
   - State the protected goal, owning boundary, chosen slice, proof, and
     residual risk.

## Reference Routing

Read only the reference needed for the current decision:

- `references/principle-gate.md`
  - protected-principle gate, compressed gate, and task-risk expansion
- `references/decision-ladder.md`
  - project-native proof-first ladder, durable vertical evolution, reuse,
    cutover, requirement sync, and proof rules
- `references/review-packet.md`
  - bounded packet shape and consensus-ledger-style epistemic excerpt
- `references/level-router-scorecard.md`
  - Level Router Reviewer rubric for coding versus adjacent branches
- `references/coding-layer-scorecard.md`
  - Coding Layer Reviewer rubric and cross-cutting engineering checks
- `references/verdict-policy.md`
  - P-level finding priority, delivery gates, verdicts, and main-agent response

Optional context studies live under `studies/`. They are background reading,
not required workflow steps. Read the relevant study only when the task shows
that failure mode or when a reviewer asks for deeper context.

- `studies/compensatory-complexity-runaway.md`
  - good/bad cases and research context for fixes that keep adding repair,
    gate, fallback, exception, retry, or supervisor layers instead of repairing
    the underlying contract
- `studies/validation-authority-inversion.md`
  - good/bad cases for hard gates that make a fallible model exhaustively echo
    owner-known facts or turn subjective quality into admission protocol

## Output Discipline

- Keep reasoning compact and action-bound.
- Treat project compatibility, migration, rollout, and safety policy as owner
  truth. This skill must not weaken an explicit project rule or invent a new
  one.
- Do not copy external methods or persona branding into Bagakit truth.
- Treat external benchmark claims as comparison evidence, not capability
  claims.
- If a minimal patch drops required behavior or weakens proof, the ladder has
  failed even if the code volume decreases.

## Operator

Use `scripts/bagakit-coding-agent-principles.sh` for read-only inspection:

- `describe`
- `list-references`
- `list-studies`
- `print-gate`
- `validate`
