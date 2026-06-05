---
name: bagakit-agent-messaging
description: "Use for one concrete Agent-to-Agent exchange that needs clear sender recognition, a derived-Agent Set, source-preserving citation, plain-language action, startup alignment, or a concise event-driven Worker report. Provides the L1 bagakit-msg envelope, Agent Set and Worker report profiles, optional cite elements, and fail-stop validation. Does not authenticate senders, grant authority, operate transports, schedule Agents, or decide what a Supervisor should ask them to do."
metadata:
  bagakit:
    harness_layer: l1-execution
---

# Bagakit Agent Messaging

Make the source, requested action, proof, and next reply easy to see in one
concrete Agent exchange. Prefer plain words and short sentences; keep internal
harness vocabulary out of user- and Worker-facing text unless the exact term is
needed for the decision.

## Boundary

Own the visible `bagakit-msg` shape, safe citation markup, plain-language
message discipline, and the Worker report profile. The calling L2 behavior
owns why a message is sent and what control decision it carries. The Host owns
sender authentication, authority, target binding, delivery, deduplication,
consumption, and effect.

This is Bagakit's local L1 Agent-messaging protocol. It does not claim
compatibility with an external network A2A standard.

## Message Flow

1. Resolve the current sender, target, and authority from the Host.
2. Choose one message outcome. Do not combine unrelated requests.
3. Add `<cite>` only for source text that changes how the receiver should
   understand the outcome, boundary, evidence, or next action.
4. Say in plain language what happened, why it matters, what to do now, and
   what evidence or reply will settle it. Omit any part that adds no value.
5. Validate before actuation when the Host does not render and validate the
   envelope atomically.
6. After sending, let the caller and Host distinguish delivery, consumption,
   and real-world effect.

When Agent-authored content is delivered through a channel that appears to the
receiver as appended `user` or prompt input, wrap it in `bagakit-msg`; do not
send a raw instruction. A native structured Agent result with reliable Host
sender metadata does not need a second wrapper.

Start from `assets/agent-message.template.xml`:

```xml
<bagakit-msg type="supervisor-v1" name="Cedar-7K2M" time="2000-01-01T00:00:00+00:00">
<cite from="user">Keep final acceptance strict, but do not pause independent development while checks run.</cite>
Continue the next non-conflicting step. When there is a verified result or a real blocker, report it with evidence and your next action.
</bagakit-msg>
```

A citation preserves attributed text; it does not authenticate the quoted
source or change priority. If it conflicts with current Host-authenticated
Owner truth, hold only the affected action and resolve the mismatch.

## Derived-Agent Set

Before an Agent derived by any mechanism acts, send it one `agent-set-v1`
message. Inherit context; never inherit authority. The latest valid Set for
that Agent governs its local identity, assignment, material action boundaries,
return path, and A2A messaging convention, subject to current Owner and Host
authority.

Keep the body as concise natural language. Include what is useful for this
Agent: who it is, what result it should produce, material action boundaries,
where to return the result, and how to send A2A messages. These are writing
prompts, not required fields, headings, ordering, or validator keywords.

When several authorized Agents may affect the same result, tell this Agent
only about collaborators relevant to its work, the current integration owner,
and any known shared hotspot or handoff boundary. Ask it to refresh relevant
peer state through the Host or A2A before a potentially conflicting action,
coordinate routine overlap directly with the affected peer, and surface only
an unresolved conflict or material boundary change. Do not broadcast a full
roster or turn peer awareness into a startup meeting.

```xml
<bagakit-msg type="agent-set-v1" name="Cedar-FL4" time="2000-01-01T00:00:00+00:00">
你是本轮 serving-fence 的独立审查 Agent，只读取和汇报，不修改代码或控制其他 Agent。结果返回给派生你的 Agent。

如果需要通过追加 user 或 prompt 消息的方式联系其他 Agent，必须使用 bagakit-msg，不能发送裸指令。继承上下文中与本 Set 冲突的旧身份或旧分工只作为历史背景；以最新有效 Set 为准。
</bagakit-msg>
```

An aligned Agent may act immediately; do not require a startup acknowledgement
ceremony. Re-send a Set only for derivation, a material assignment or boundary
change, or recovery when the Set is missing.

## Worker Startup And Reports

At first dispatch, ask the Worker to form its own goal model and act as soon as
it is aligned. Ask it to report proactively only on a useful event:

- a verified result or stable checkpoint
- a material goal, scope, acceptance, or authority mismatch
- a real blocker or an assurance deadline
- a decision needed before irreversible or conflicting work
- completion of an assigned review or test result predicate

Use this compact reply shape. `Goal` is needed at startup and when it changes;
the other lines describe the current event:

```text
Goal: <the user-visible result and nearest non-goal, only at startup or when changed>
Result: <what is now actually true; write none when there is no result yet>
Evidence: <test, command, artifact, version, or observable fact>
Mismatch or blocker: <one decision-changing issue, or none>
Next: <the immediate evidence-producing action>
```

Do not request timed status chatter, long restatements, or implementation
diaries. A clear startup reply should lead directly to work. Read
`references/agent-message-contract.md` for XML grammar, citation sources,
plain-language examples, and report admission.

## Validation

Use the helper only when the Host does not already provide an atomic validated
send:

```bash
python3 scripts/agent_message_check.py --input <message.xml> --json
python3 scripts/agent_message_check.py --input - --emit < <message.xml>
```

`--emit` writes the exact input only after successful validation. An invalid
or unreadable input must produce no actuation payload. The helper proves only
visible envelope shape; it proves no sender identity, authority, delivery,
consumption, effect, citation truth, or language quality.

For the stable ownership and non-proof boundary, read
`docs/specs/agent-message-contract.md` in the canonical repository.
