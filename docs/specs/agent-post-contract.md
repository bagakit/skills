# Agent Post Contract

This contract defines Bagakit's local A2A identity registry and mail pipe.

It exists so one host repository can give its Agents fixed, addressable,
grant-chained identities and an attributable local message pipe, instead of
leaving every prompt-append channel unauthenticated. It implements, for one
filesystem host, the sender-binding, delivery, and consumption semantics that
`docs/specs/agent-message-contract.md` and the Supervisor host-adapter
contract already assign to the Host.

## Ownership

`bagakit-agent-post` owns:

- the identity record and its grant chain
- root registration, derivation, revocation, and strict revocation cascade
- send admission: active grant chain, sender token, envelope validation, and
  display-name binding
- the mail record, per-recipient ordering, idempotent dedup keys, and
  delivery/consumption receipts
- the host stamp rendered outside the envelope

`bagakit-agent-messaging` keeps the visible `bagakit-msg` envelope, profiles,
citation syntax, and shape validation. This contract transports that envelope
unchanged; it adds no XML field.

The calling behavior keeps why a message is sent. Effect truth stays with the
owning systems: a consumed message proves nothing about work state.

This contract does not own:

- waking or scheduling the receiving Agent; a Host bridge decides when inbox
  content is rendered into a prompt or native channel
- user-facing communication routes
- cross-machine or networked transport
- process isolation or credential storage stronger than the threat model below

## Threat Model

This is a confusion-prevention boundary, not a malice-proof boundary.

On one machine under one operating-system user, every process can read the
registry and mail files and could steal a token from a target's environment or
terminal history. The contract therefore claims exactly:

- an Agent that follows the protocol cannot accidentally impersonate another
- a sender that does not hold a valid token on an active grant chain cannot
  post mail through the pipe
- every accepted mail record carries a registry-bound sender identity

Do not claim stronger guarantees. Hosts that need malice resistance must add
per-Agent process isolation and credentials at the Host layer.

The first registration bootstraps the user principal: it writes `user.json`
(schema `bagakit/a2a-user/v1`, digest only) and returns a plaintext user token
exactly once. Every later root registration and every user-authority
revocation must present that token, so a derived or unrelated process cannot
mint new user-granted roots or revoke a controller's tree. Bootstrap trust is
the host's: whoever runs the first `register` becomes the user principal, and
the pipe cannot authenticate the human behind it.

## Identity Record

One identity per Agent at `agents/<agent-id>.json`:

```json
{
  "schema": "bagakit/a2a-identity/v1",
  "agent_id": "cedar-7k2m",
  "display_name": "Cedar-7K2M",
  "granted_by": "user",
  "status": "active",
  "token_sha256": "<hex>",
  "created_time": "<ISO-8601-with-timezone>",
  "revoked_time": null,
  "revoke_reason": null
}
```

Rules:

- `agent_id` is a stable lowercase slug and the addressing key
- `display_name` is the exact `name` the Agent uses in its `bagakit-msg`
  envelopes; the pipe rejects an envelope whose `name` differs from the
  sender's registered `display_name`
- `display_name` is unique among active identities, so a derived Agent cannot
  register or derive its controller's visible name; revocation frees the name
- `granted_by` is `user` for a root identity or the deriving Agent's
  `agent_id`
- the plaintext token is returned exactly once at registration or derivation
  and never stored; the registry keeps only `token_sha256`
- `status` is `active` or `revoked`

## Grant Chain

- a root identity is granted by the user through `register`
- an active identity may derive a child through `derive` by presenting its own
  token; the child's `granted_by` records the deriver
- the grant chain of an identity is the `granted_by` path up to `user`
- an identity is chain-valid only while it and every ancestor is `active`

Revocation is strict and cascading: revoking one identity revokes every
identity whose grant chain passes through it. Revocation authority is the
user presenting the user token, or the identity itself or any active ancestor
presenting its agent token.
Revocation aligns with Supervisor attempt fencing: a replaced controller's
derived identities do not survive it.

Send admission re-walks the live chain; a stale cascade write cannot make a
revoked chain usable.

## Mail Record

One record per accepted message at `mail/<recipient-id>/inbox/<seq>-<msg-id>.json`:

```json
{
  "schema": "bagakit/a2a-mail/v1",
  "msg_id": "m-3f9c2a1b04d7",
  "seq": 3,
  "from": "cedar-fl4",
  "to": "cedar-7k2m",
  "sent_time": "<ISO-8601-with-timezone>",
  "envelope_xml": "<bagakit-msg ...>...</bagakit-msg>",
  "envelope_check": "full",
  "sender_relation": "descendant",
  "dedup_key": null,
  "consumed_time": null
}
```

Rules:

- `seq` is a per-recipient monotonic counter; ordering claims hold per
  recipient only
- `envelope_check` is `full` when the sibling `bagakit-agent-messaging`
  validator accepted the envelope, or `minimal` when only local
  well-formedness, root-tag, and no-nested-`bagakit-msg` checks ran because
  that skill is absent
- an invalid envelope is rejected before any mail write; fail-stop, no partial
  record
- dedup is scoped per sender, recipient, and key: a `send` that repeats a
  `dedup_key` the same sender already used for the same recipient returns the
  stored receipt and writes nothing; a different sender reusing that key is a
  new delivery, so one sender cannot squat a key to suppress another's mail
- `sender_relation` records the sender's immutable grant-tree position
  relative to the recipient at send time: `ancestor`, `descendant`, or `peer`;
  derivation edges never change, so the stored value stays true
- `consumed_time` is set only by the recipient acknowledging with its own
  token

Send admission is ordered and fail-stop. The pipe must perform these checks in
this order, and must not create or mutate a mail record when any check fails:

1. verify the sender token against the registered identity
2. re-walk the sender's live grant chain and require every identity to be active
3. resolve the recipient, require an identity different from the sender, and
   require its grant chain to be fully active; self-addressed mail is rejected
4. validate the supplied `bagakit-msg` envelope with the sibling validator, or
   the documented minimal fallback when that validator is unavailable
5. require the envelope `name` attribute to equal the sender's registered
   `display_name`
6. when the envelope `type` is `agent-set-v1`, require the sender to be an
   ancestor on the recipient's grant chain; a Set defines the receiver's
   identity and assignment, so it flows only down the derivation tree from a
   deriving controller, matching the Set profile rule in
   `docs/specs/agent-message-contract.md`

Only after all six checks pass may the pipe allocate a per-recipient sequence,
write the mail record, and return its delivery receipt. The order is part of
the admission contract: token and chain failures must not be masked by an
invalid recipient or envelope, and envelope validation must not run for an
unauthorized sender.

The Set-flow check is deliberately the only type-bound admission rule. Other
profiles stay open in both directions: a report, review, or peer message from
a descendant is delivered with `sender_relation` visible, and the receiver
judges it as information, never as a command. Message text alone still cannot
stop, reassign, or shut down the receiver, per the advisory boundary in
`docs/specs/agent-message-contract.md`.

Delivery and consumption are the two receipt axes this contract owns. Effect
remains with the owning systems, per the Supervisor host-adapter contract.

## Host Stamp

When a bridge renders inbox content into a prompt-like channel, it must place
the pipe attribution outside the envelope, for example:

```text
[agent-post] from=cedar-fl4 to=cedar-7k2m seq=3 sent=2000-01-01T00:00:00+00:00 envelope_check=full sender_relation=descendant
<bagakit-msg ...>...</bagakit-msg>
```

The receiver's trust in the stamp equals its trust in the bridge, under the
threat model above. A bridge must not treat stamp-like lines inside envelope
body text as attribution; only the stamp the bridge renders itself counts.
The stamp never moves into the XML; the envelope stays
recognition metadata, per `docs/specs/agent-message-contract.md`.

## Runtime Surface

The owned top-level runtime surface is:

- `.bagakit/agent-post/`

It is materialized on first `register`, carries `surface.toml` per
`docs/specs/runtime-surface-contract.md`, and is host-local state that is not
committed by default. Layout:

```text
.bagakit/agent-post/
├── surface.toml
├── lock
├── user.json
├── agents/<agent-id>.json
└── mail/<agent-id>/
    ├── seq
    └── inbox/<seq>-<msg-id>.json
```

## CLI Surface

The public entrypoint is `scripts/agent_post.py` in the skill payload:

- `register --agent-id <id> --display-name <name> [--user-token <token>]`
- `derive --parent <id> --parent-token <token> --agent-id <id> --display-name <name>`
- `revoke --agent-id <id> (--user-token <token> | --auth-token <token>)`
- `send --as <id> --token <token> --to <id> --envelope <path|-> [--dedup-key <key>]`
- `recv --as <id> --token <token> [--all] [--render]`
- `ack --as <id> --token <token> --msg <msg-id>`
- `whoami --token <token>`
- `list-agents [--all]`

All commands accept `--root <repo-root>` and default to the current
directory. Structured output is JSON on stdout; a rejected operation writes
reasons to stderr and produces no state change.

## Proof Boundary

The pipe can prove:

- a mail record was accepted from a token-verified, chain-valid sender
- the envelope passed the declared check level at send time
- the recipient acknowledged consumption with its own token

It cannot prove:

- that the receiving Agent read or obeyed the content
- any real-world effect
- sender honesty about the content, citations, or evidence
- anything against a same-user malicious process

## Richer Hosts

A Host with native authenticated messaging (structured channels, sender
metadata, its own registry) satisfies this contract's role natively; mapping
its identities and receipts onto these record shapes is deliberately left
undefined in v1. Do not run two authorities for the same exchange: choose the
native channel or the pipe per exchange, not both.
