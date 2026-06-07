# Agent Message Usage Guide

Technique and admission judgment that the shape validator cannot check.

Authority split: the stable grammar, profiles, ownership, and non-proof
boundary live in `docs/specs/agent-message-contract.md` in the canonical
repository; the operating workflow lives in `SKILL.md`. When this guide and
the spec disagree, the spec wins.

## Contents

1. Plain-language technique
2. Citation admission
3. Conflict coordination advice
4. Worker report admission
5. Host boundary

## Plain-Language Technique

Write for the receiver, not for the harness implementation.

Lead with the concrete result or problem. Then say why it matters, what action
is needed, and what evidence or reply will settle it. Prefer the receiver's
language and established project terms.

Translate internal terms when they are not themselves decision-bearing:

- `Owner truth` -> `what the user currently asked for`
- `candidate identity` -> `the exact version this result applies to`
- `result predicate` -> `what this role must return before it counts as done`
- `effect observed` -> `whether the message actually changed the work`
- `topology` -> `how the team is currently divided`

Do not remove exact command names, version identifiers, failing gates, or API
terms needed to act. Explain an unfamiliar necessary term once instead of
replacing it with vague language.

Do not compress several findings, file lists, role changes, and actions into
one paragraph. Split unrelated outcomes into separate exchanges. For one
outcome, prefer a few short lines with localized plain-text labels such as
`Result`, `Action`, `Boundary`, and `Reply`; they are writing aids, not
protocol fields. Put long manifests, logs, and supporting detail in a
receiver-resolvable artifact or reference and keep the decision delta in the
message.

```xml
<bagakit-msg type="supervisor-v1" name="Cedar-7K2M" time="2000-01-01T00:00:00+00:00">
Result: The focused checks pass on the current version.
Action: Stage only the current task candidate.
Boundary: Do not continue analysis or edit code.
Reply: Return the staged manifest or one real blocker.
</bagakit-msg>
```

## Citation Admission

Use:

```xml
<cite from="user" ref="optional-resolvable-source">source text</cite>
```

Supported `from` values are `user`, `supervisor`, `worker`, `host`, `reviewer`,
`tester`, and `evidence`.

Good uses:

- `user`: preserve a direction whose wording constrains scope or priority
- `worker`: recall the Worker's own stated goal, blocker, or commitment
- `host`: surface a Host-observed state relevant to the next action
- `reviewer` or `tester`: preserve a bounded verdict or gate result
- `evidence`: quote a specification, artifact, or externally checkable fact

Use at most a few decision-bearing citations. Keep cited text as an exact short
excerpt, XML-escaped, and free of nested elements. Put a summary or
interpretation in the Agent-authored plain body rather than inside `<cite>`.
Use `ref` only when it resolves for the receiver or Host.

A citation is attributed content inside an Agent-authored message. It does not
authenticate a user, Host, reviewer, test, or artifact. It never outranks
current Host-authenticated Owner truth.

## Conflict Coordination Advice (Advisory)

This section is optional guidance, not part of the L1 grammar, authority model,
or validation gate. When a possible shared-file, shared-contract, or candidate
collision appears, an Agent should preserve valid work, pause only its own
next conflicting or irreversible action, state the concrete overlap to the
affected peer, and suggest coordination. It should not command the peer to
stop, hand off, cancel, release authority, or abandon work through message
text alone. The current integration owner or Host decides any action-bearing
hold, fence, cancellation, or lifecycle transition.

Do not add an authority, priority, stop, or conflict field to the envelope to
encode this advice. A message can describe a conflict or recommend a hold
without proving that the conflict exists or granting the sender control.

## Worker Report Admission

Request a Worker report only when it can change a decision, close a gate,
preserve a checkpoint, expose a mismatch, or resolve a real blocker. Do not
poll merely to show supervision activity.

At startup, ask for the Worker's `Goal`, its nearest attractive non-goal when
useful, and first evidence-producing `Next` step. Afterwards, `Goal` is
repeated only when understanding changed. `Result` must describe a new
externally relevant fact, not time spent or files read. `Evidence` binds the
result to a command, test, artifact, version, verdict, or observable state.
`Mismatch or blocker` contains at most one issue that can change direction.
`Next` names the immediate action, not a long plan.

The Worker may wrap the report in a `worker-v1` envelope using
`assets/worker-report.template.xml`. The labels are a semantic profile rather
than XML child fields, so the report stays readable without a schema ceremony.

## Host Boundary

The Host authenticates the sender and binds message type, sender instance,
target, Owner revision, attempt, controller authority, delivery, and
deduplication. Preserve the validated XML unchanged across the transport
boundary when possible.

Wrap Agent-authored content in `bagakit-msg` whenever its delivery channel
appears to the receiver as appended `user` or prompt input. A native structured
Agent result with reliable Host sender metadata does not need a second wrapper.

Unknown delivery remains unknown. A reply may prove consumption but not
effect. Callers must observe the requested artifact, state, or decision before
claiming the message worked.
