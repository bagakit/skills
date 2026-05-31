# Agent Message Use Guide

## Contents

1. Plain-language rule
2. Message anatomy
3. Citation admission
4. Worker report admission
5. Host boundary

## Plain-Language Rule

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

## Message Anatomy

The root is always:

```xml
<bagakit-msg type="<message-profile>" name="<run-unique-readable-name>" time="<ISO-8601-with-timezone>">
<optional cites and plain text>
</bagakit-msg>
```

Supported message profiles are `agent-v1`, `agent-set-v1`, `supervisor-v1`,
`worker-v1`, `reviewer-v1`, `tester-v1`, `auditor-v1`, and `researcher-v1`.

The body may contain plain text and direct `<cite>` children. No other nested
element is allowed. Keep one message focused on one outcome or decision.

## Derived-Agent Set

Before an Agent derived by any mechanism acts, send it an `agent-set-v1`
message. Inherit context; never inherit authority. The latest valid Set governs
that Agent's local identity, assignment, material action boundaries, return
path, and A2A messaging convention, subject to current Host and Owner
authority.

Write the Set body in concise natural language. Include what is useful: who the
Agent is, what result it should produce, material action boundaries, where the
result returns, and how it sends A2A messages. Do not turn these suggestions
into required fields, headings, ordering, or validation keywords.

Let an aligned Agent act immediately. Re-send only on derivation, a material
assignment or boundary change, or recovery when the Set is missing. Do not
build a static full-team roster into the message.

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

## Worker Report Admission

Request a Worker report only when it can change a decision, close a gate,
preserve a checkpoint, expose a mismatch, or resolve a real blocker. Do not
poll merely to show supervision activity.

At startup, ask for the Worker's `Goal`, its nearest attractive non-goal when
useful, and first evidence-producing `Next` step. Afterwards, `Goal` is
repeated only when understanding changed. `Result`
must describe a new externally relevant fact, not time spent or files read.
`Evidence` binds the result to a command, test, artifact, version, verdict, or
observable state. `Mismatch or blocker` contains at most one issue that can
change direction. `Next` names the immediate action, not a long plan.

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
