# Technical Brief Guardrails

## Fidelity Before Compression

Protect code blocks, commands, flags, configuration, URLs, paths, API symbols,
versions, dates, metrics, units, identifiers, owners, error text, quoted source
lines, and qualifiers that change certainty, scope, sequence, or causality.

Preserve exact text for protected spans. The exception is secret masking:
replace token, key, password, session, PAT, cookie, or equivalent credential
values with `[已脱敏]` while retaining the surrounding field or command shape.

## No Hallucination

The brief may reorder, merge, label, and shorten source material. It may not add
a metric, command, URL, version, explanation, root cause, or recommendation
absent from the source or explicitly supplied by the user. Mark inference as
inference and missing support as `待补证据`.

## Time Validity

Prices, quotas, limits, versions, availability, and activity can drift. Add
`截至 YYYY-MM-DD` only when that date comes from the source or an explicit
verification step. If no defensible date exists, say `时效未知，需复核`.

## Privacy And Collaboration Boundaries

- Read cloud documents or chat history only within the user's stated scope.
- Retrieval is read-only by default: no edits, messages, cards, or external
  notifications without separate authorization.
- Do not persist raw private transcripts, credentials, or machine-local
  absolute paths in the skill payload or durable shared knowledge.
- Keep provenance as a logical name, stable URL, or repo-relative pointer.

## Compression Failure Modes

Reject or revise a brief when it:

- is shorter only because evidence, caveats, or owners disappeared;
- keeps the source timeline instead of grouping by technical theme;
- silently chooses one of two conflicting facts;
- turns a tentative observation into a definite conclusion;
- buries a command or metric in decorative prose;
- replaces a concrete root cause with a vague label such as “配置问题”;
- exposes a credential while claiming to preserve exact source text.
