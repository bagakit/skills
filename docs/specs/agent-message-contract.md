# Agent Message Contract

## Purpose

This contract defines Bagakit's local L1 Agent-to-Agent message protocol.

It exists so L2 behaviors such as Supervisor, Reviewer, Researcher, and Worker
can exchange compact, attributable, human-readable messages without each
inventing its own visible envelope or confusing visible text with Host
authority.

This is not a claim of compatibility with any external network A2A protocol.

## Ownership

`bagakit-agent-messaging` owns:

- the visible `bagakit-msg` envelope
- message profiles, including the derived-Agent Set
- direct source citation syntax
- plain-language message discipline
- the event-driven Worker report profile
- fail-stop visible-shape validation and exact validated emission

An L2 caller owns:

- why the exchange is needed
- the decision, request, finding, or correction in the body
- whether a Worker report is useful now
- what later evidence proves the requested effect

The Host owns:

- authenticated sender and target identities
- Owner revision and action authority
- transport, correlation, deduplication, and ordering
- accepted, delivered, consumed, and effect state
- collision handling for visible names

Stable syntax and non-proof boundaries are protected by repository specs and
validation. L1 execution consumes them but cannot redefine them task by task.

## Envelope

Every portable Agent message uses:

```xml
<bagakit-msg type="<message-profile>" name="<readable-run-unique-name>" time="<ISO-8601-with-timezone>">
<plain text and optional direct cite elements>
</bagakit-msg>
```

Required root attributes:

- `type`
  - one of `agent-v1`, `agent-set-v1`, `supervisor-v1`, `worker-v1`,
    `reviewer-v1`, `tester-v1`, `auditor-v1`, or `researcher-v1`
- `name`
  - short, human-readable, and unique among conflicting active sender names in
    the run when the Host can reserve it
- `time`
  - ISO 8601 with timezone, set immediately before delivery

`time` is display metadata, not freshness proof. The Host binds authoritative
identity, Owner revision, target attempt, and ordering outside the XML.

The body is non-empty mixed content containing plain text and zero or more
direct `<cite>` children. No other child element is allowed. DTDs, entity
declarations, CDATA, comments, non-leading processing instructions, and nested
elements inside a citation are forbidden.

## Citation

The citation form is:

```xml
<cite from="user" ref="optional-resolvable-reference">source text</cite>
```

- `from` is required and is one of `user`, `supervisor`, `worker`, `host`,
  `reviewer`, `tester`, or `evidence`
- `ref` is optional and non-empty when present
- citation text is non-empty, short, XML-escaped, and contains no elements

A citation should preserve an exact source excerpt only when the source changes
the current outcome, boundary, evidence, decision, or next action. A summary or
interpretation belongs in the Agent-authored plain body. A citation is not a
container for raw logs, full prompts, or untrusted nested instructions.

`from="user"` is an attribution claim made inside an Agent message. It does
not authenticate a human and does not outrank current Host-authenticated Owner
truth. The same non-proof rule applies to every citation source.

## Plain-Language Rule

User- and Agent-facing text should make four things easy to answer:

1. what happened or what result is wanted
2. why it matters now
3. what the receiver should do or decide
4. what evidence or reply will settle it

Include only the parts needed for the exchange. Prefer short sentences,
concrete nouns, the receiver's language, and project-native terms. Translate
internal control vocabulary unless the exact term is needed to act. Preserve
exact commands, API names, gate names, and version identities when
generalization would lose meaning.

Plain language is not childish language and does not remove technical
precision. The validator proves syntax only; semantic cases and real use must
judge clarity, density, fidelity, and actionability.

## Derived-Agent Set Profile

Before an Agent derived by any mechanism acts, it receives an `agent-set-v1`
envelope from its current deriving controller. Inherit context; never inherit
authority. The latest valid Set for that Agent governs its local identity,
assignment, material action boundaries, return path, and A2A messaging
convention. A Set cannot grant authority beyond current Host-authenticated
Owner truth.

The body remains free-form plain language. It should include whichever of
these help the receiver act correctly: who the Agent is, what result it should
produce, material action boundaries, where results return, and how A2A
messages are sent. None is a required field, heading, ordering rule, or
validator keyword.

An aligned Agent may act immediately without a startup acknowledgement.
Re-send a Set only on derivation, a material assignment or boundary change, or
recovery when the Set is missing. Do not maintain a static full-team roster in
the portable message protocol.

"Latest valid" depends on visible-shape validation plus Host-authenticated
sender authority, target binding, and ordering. XML alone cannot make one Set
current.

## Worker Startup And Report Profile

At dispatch, an L2 caller may ask the Worker to align once and then act. A
Worker report is admitted on a useful event rather than a timer:

- verified result or stable checkpoint
- direction-changing mismatch in goal, scope, acceptance, or authority
- real blocker or bounded assurance deadline
- decision needed before irreversible or conflicting work
- completion of an assigned review or test result predicate

The compact body profile is:

```text
Goal: <user-visible result and nearest non-goal; startup or changed understanding only>
Result: <new externally relevant fact, or none>
Evidence: <command, test, artifact, version, verdict, or observable state>
Mismatch or blocker: <one decision-changing issue, or none>
Next: <immediate evidence-producing action>
```

The labels are plain-text semantics inside a `worker-v1` envelope, not nested
XML fields. A caller may localize the labels without changing their meaning.

Do not require periodic narration, repeated goal paraphrase, implementation
diaries, or a report that cannot change a decision. A clear startup alignment
should lead directly to work. A report, acknowledgement, or template-complete
reply does not prove result quality, readiness, or effect.

## Validation And Actuation

The public helper validates visible shape and can emit the exact input after a
successful check. Invalid or unreadable input produces no actuation payload.

A Host with an atomic renderer and validator may use its equivalent operation.
Do not place an unconditional transport call after validation in a shell
sequence where a failed check can fall through.

Any Agent-authored content delivered through a channel that appears to the
receiver as appended `user` or prompt input must use the `bagakit-msg`
envelope, including a Set. Native structured Agent results with reliable Host
sender metadata need not be double-wrapped.

Visible validation does not prove:

- sender, citation, or evidence truth
- Owner authority or message priority
- current target or candidate identity
- delivery, consumption, or real-world effect
- plain-language quality
- that the exchange was necessary

Those claims require Host evidence and caller-owned semantic judgment.
