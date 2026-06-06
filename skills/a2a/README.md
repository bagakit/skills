# A2A Family

This family owns role-neutral Agent-to-Agent communication capabilities that
co-evolve across harness behaviors and hosts.

Current A2A skill sources:

- `bagakit-agent-messaging`
- `bagakit-agent-post`

The family owns visible exchange semantics such as message envelopes,
attribution, citations, and report shapes. `bagakit-agent-post` is the
family's default host-local identity registry and transport implementation: it
owns user-rooted identity, grant-chain revocation, delivery, and consumption
receipts while transporting the envelope unchanged. Richer Hosts may provide
their own authenticated channel; the family does not claim to replace that
Host authority. Calling behaviors such as Supervisor still own why and when a
message is useful.

This is a Bagakit-local capability family. Its name does not claim
compatibility with any external Agent-to-Agent network protocol.
