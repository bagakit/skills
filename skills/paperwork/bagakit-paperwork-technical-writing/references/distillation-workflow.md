# Technical Collaboration Distillation

Use this route when technical collaboration material needs a compact brief
before, instead of, or alongside a publishable article. Distillation removes
noise and reorders material; it never upgrades an observation into a fact.

## Route Memo

Before compressing, write a small internal memo:

| Field | Required question |
| --- | --- |
| Object | What system, incident, decision, or body of notes is being refined? |
| Reader | Who needs to scan or act on the result? |
| Deliverable | What decision or action should the brief enable? |
| Source set | Which files, messages, documents, or pasted blocks are in scope? |
| Time validity | What source date/range is known? What may have drifted? |
| Evidence shape | Which facts need exact quotations, links, commands, or counts? |
| Gaps | Which missing or conflicting items must remain visible? |

If the object or source boundary is unclear, stop and ask one question that
would change the route. Do not compensate with a longer summary.

## Source Inventory

Keep one provenance record per source. It can remain internal or become the
appendix of `refined.md`.

```text
source: <logical name or repo-relative pointer>
kind: pasted_text | local_file | cloud_doc | chat_export | mixed
scope: <time range, channel, or section>
items_read: <count when known>
excluded: <missing, duplicate, or out-of-scope items>
```

When sources disagree, keep both values with their pointers and mark the
conflict. Resolution requires evidence or an explicit decision owner.

## Extraction Pass

Tag each candidate fact as one of:

1. `conclusion` — decision, comparison, recommendation, or settled finding;
2. `data` — metric, threshold, cost, quota, version, date, or count;
3. `step` — command, configuration change, installation, or recovery action;
4. `resource` — repository, issue, document, dashboard, or source link;
5. `pitfall` — symptom or error → root cause → fix, including residual risk.

Drop greetings, acknowledgements, repeated asks, emotional reactions, and
narration of the author's effort. Keep uncertainty that changes the claim
(`可能`, `约`, `截至`, `未确认`); remove only process filler.

## Reconciliation Pass

- Merge exact duplicates, but keep relevant source pointers.
- Preserve units and precision. Never round, normalize, or translate a command
  or identifier for neatness.
- Convert chronology into topic modules. Keep sequence inside a procedure or
  causal chain where order is part of the meaning.
- Keep unresolved decision-relevant items as `待确认` or `待补证据`.
- Do not silently choose one of two conflicting facts.

## Verification Pass

Check the brief against the source set:

- every metric has its original number and unit;
- every command/config/URL/version/date/ID/owner survives unchanged, except
  secret values replaced with `[已脱敏]`;
- each step keeps its actor, precondition, primary action, and expected signal
  when those details are present in the source;
- source count, time range, exclusions, and appendix agree;
- time-sensitive claims carry `截至 YYYY-MM-DD` when a source or explicit
  verification supplies that date; otherwise state that validity is unknown;
- no new explanation, benchmark, link, or causal claim was introduced;
- headings and first lines allow scanning without replaying the raw timeline.

Run `python3 scripts/mask-secrets.py` before rendering when credentials may be
present. Treat its output as a candidate signal, not a complete PII scan.
