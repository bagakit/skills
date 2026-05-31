# Level Router Scorecard

Use this scorecard before layer-specific review.

## Question

Is this task really a coding/implementation task?

An adjacent discipline may own the first motion without owning the eventual
implementation. Route there first, then return to this skill when a concrete
implementation decision exists.

## Candidate Levels

- `coding`
  - primary motion is constructing or changing implementation behavior
- `debugging`
  - primary motion is causal diagnosis, reproduction, or isolation
- `review`
  - primary motion is risk finding or regression detection
- `refactoring`
  - primary motion is behavior-preserving structural change
- `architecture`
  - primary motion is boundary, dependency, or evolution design
- `testing_verification`
  - primary motion is proof surface or oracle design
- `research`
  - primary motion is evidence gathering before engineering decision
- `writing`
  - primary artifact is documentation or communication

## Scores

Use `0`, `1`, or `2`.

- `goal_fit`: selected level matches the user goal
- `primary_motion`: selected level matches what the agent must do first
- `proof_fit`: selected level owns the needed proof
- `boundary_fit`: selected level does not swallow adjacent work

Total interpretation:

- `7-8`: level accepted
- `4-6`: proceed only if risks are advisory and documented
- `0-3`: blocking reroute or clarification required

## Blocking Conditions

- selected level is not coding and coding was chosen anyway
- protected goal is unconfirmed and changes implementation direction
- task requires causal diagnosis before implementation
- task requires behavior-preserving structure work before new behavior
- task is primarily documentation, research, architecture, review, or testing
  and has not yet produced an implementation decision

## Re-entry Rule

- debugging re-enters after causal isolation identifies the implementation
  owner
- review re-enters when findings become an authorized correction
- refactoring re-enters when a concrete behavior-preserving change is chosen
- architecture re-enters after the durable boundary and evolution path are
  accepted
- testing or verification re-enters after the proof surface or oracle design
  produces an implementation decision
- research re-enters when evidence supports an implementation choice

## Output

```text
selected_level:
recommended_level:
confidence:
blocking:
scores:
reroute_reason:
notes:
```
