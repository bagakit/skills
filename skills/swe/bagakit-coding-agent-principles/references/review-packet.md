# Bounded Review Packet

Use this packet when serial reviewers are worth the token cost.

## Trigger

Dispatch principle review when any of these are true:

- protected goal is inferred or contested
- selected level may be wrong
- new abstraction, dependency, or cross-boundary change is proposed
- compatibility, migration, fallback, replacement, or cutover is proposed
- a new quality gate or model-authored protocol field is proposed
- a working path may be removed before its replacement is proven
- confirmed discussion changed durable requirement truth
- stop rule is uncertain
- proof plan is weak or indirect
- implementation may affect safety, data, production, or accessibility

## Packet Shape

Keep the packet short. Include facts and refs, not full chat or persuasive
rationale.

```markdown
# Coding Principle Review Packet

## Task
- User goal:
- Selected level:
- Requested change:
- Non-goals:

## Epistemic Excerpt
- known_known:
- known_unknown:
- unknown_known:
- unknown_unknown:

## Protected-Principle Gate
- protected_goal_or_principle:
- project_native_strategy:
- failure_boundary:
- proof_plan:

## Ladder State
- selected_rung:
- owning_boundary:
- smallest_vertical_slice:
- stop_reason:
- rejected_heavier_rungs:

## Decision Lenses
- truth_and_ownership:
- total_complexity_delta:
- durable_evolution_path:
- reuse_evidence:
- causal_and_proof_closure:

## Evidence
- changed_surfaces:
- key_refs:
- diff_summary:
- known_risks:
```

## Epistemic Rules

- `known_known`: confirmed facts or direct observations
- `known_unknown`: explicit gaps, risks, or missing decisions
- `unknown_known`: agent inference that still needs confirmation
- `unknown_unknown`: plausible blind spots or unexplored dimensions

Reviewers must not treat `unknown_known` as confirmed.

Use `n/a` for a decision lens that the task does not trigger. Do not invent
work only to fill the packet.

## Sharing Rule

The Level Router Reviewer receives the packet first. The Layer Reviewer receives
the same packet plus only the router verdict, selected level, confidence, and
blocking reroute notes. Do not pass the router's full chain of thought.
