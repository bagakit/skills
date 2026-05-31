# Research Workspace Spec

## Goal

Keep repository research local, reusable, parallelizable, auditable, and
separate from durable promotion.

Researcher is an evidence-production surface. It is not a search provider,
subagent launcher, report platform, or automatic promotion path into
`bagakit-living-knowledge` or `bagakit-skill-evolver`.

## Topic Layout

Base runtime root:

```text
.bagakit/researcher/topics/<topic-class>/<topic>/
├── originals/
├── summaries/
└── index.md
```

Configured base runtime when `docs/.bagakit-knowledge.toml` declares
`researcher_root` under `.bagakit/`:

```text
<researcher_root>/topics/<topic-class>/<topic>/
├── originals/
├── summaries/
└── index.md
```

Extended workflow members are added only when a command needs them:

```text
<topic-workspace>/
├── charter.md
├── surveys/
├── passes/
├── tracks/
├── claims.md
├── insights/
├── leads.md
└── handoffs/
```

Researcher-local wiki/frontdoor members are derived from topic artifacts and
live under the researcher runtime root:

```text
<researcher_root>/
├── index.md
├── wiki/
│   ├── README.md
│   ├── concepts/
│   ├── questions/
│   └── claims/
└── topics/
```

## Root Rule

`researcher_root` may override the default root only when it stays under
`.bagakit/`.

Hidden `docs/.<topic-class>/...` paths are not valid Bagakit researcher roots.

`topics/` remains the source-of-truth evidence layer.

`wiki/` is a researcher-local frontdoor over topic evidence. It must not become
the shared checked-in knowledge root, and it must not replace repository
evolution memory.

Before opening a new topic, pass, or broad search, the researcher should
refresh or inspect the researcher frontdoor when prior topics exist. The
frontdoor is a recall surface: it tells the next researcher what already
exists, where evidence lives, and which questions or claims are still active.

## Workflow Rule

The preferred workflow is:

1. Refresh or inspect the researcher frontdoor and read relevant existing
   topic, question, and claim links.
2. Before broad retrieval, separate source-landscape unknowns from user-goal or
   local-context unknowns. Ask or hand back when search cannot resolve the
   blocking unknown.
3. Anchor the topic in `charter.md`.
4. If broad source collection would be premature, write one pre-retrieval
   survey packet under `surveys/`.
5. Plan a bounded pass in `passes/`.
6. Split parallel work into track contracts under `tracks/`.
7. Preserve source cards under `originals/`.
8. Write source-bound summaries under `summaries/`.
9. Record claims, insights, and active-mining leads.
10. Run quality and drift checks.
11. Refresh managed sections in `index.md`.
12. Refresh the researcher-local wiki/frontdoor when cross-topic discovery
   matters.
13. If the loop read the wiki and changed topic evidence, run `doctor --wiki`
    before final response or handoff.
14. Optionally render a handoff under `handoffs/`.

The skill may prepare retrieval plans, but provider execution happens outside
researcher.

## Route Ladder Rule

Choose the smallest route that preserves enough evidence for the next operator:

- Quick lookup:
  - no researcher workspace unless the result must be reusable or auditable.
- Clarification gate:
  - if the blocking unknown is user intent, project preference, or local
    context rather than source landscape, ask or write a handback condition
    before broad retrieval.
- Survey:
  - create one `surveys/` packet when the field, source landscape, ranking or
    benchmark sources, seed queries, or blind spots are unclear.
- Bounded pass:
  - create one `passes/` file when the scope and evidence threshold are clear.
- Parallel tracks:
  - create `tracks/` only when the pass decomposes into disjoint work packages.
- Synthesis or handoff:
  - compress evidence into claims, insights, leads, summaries, and optional
    handoff files without promoting it automatically.

External research-agent products, agent-skill specs, and benchmark writeups are
source evidence, not Bagakit capability proof. Before using them to change
researcher behavior, preserve the source-bound `borrow`, `avoid`, and Bagakit
implication in a summary or claim.

## Charter Rule

`charter.md` should capture:

- research question
- scope and non-goals
- expected output
- evidence threshold
- source priority
- drift sentinels
- stop rule

The charter is the anchor for later pass, track, claim, insight, and lead
review.

## Survey Rule

A survey packet under `surveys/` captures pre-retrieval field mapping before a
broad search starts. Use it when the question is still too open, the best source
classes are unclear, ranking or benchmark lists may matter, or blind spots could
change retrieval.

Each survey should include:

- survey id
- parent charter
- survey question
- why survey is needed before broad search
- clarification or handback gate
- problem decomposition
- four-quadrant uncertainty map:
  - known known
  - known unknown
  - unknown known
  - unknown unknown
- source landscape:
  - official or primary sources
  - curated lists, rankings, benchmark sets, indexes, or field-specific directories
  - likely weak or misleading source classes
- ranking and seed-list strategy
- source-quality heuristics
- provider-agnostic retrieval plan sketch
- stop or handback conditions
- drift check
- handoff target into passes, tracks, source cards, or downstream work

Write each material problem dimension so its evidence need is visible: what
must be learned, which decision it affects, and what source class could verify
it. This is guidance, not a fixed field schema. If a material dimension remains
unsupported after retrieval, preserve it as an evidence-coverage gap in the
final synthesis instead of silently dropping it.

`plan-survey` may create `charter.md` only when the operator provides
`--charter-question`. The survey question may be a routing or source-landscape
question, so it must not silently become the topic charter.

The four-quadrant map borrows the consensus-ledger lens as local survey fields.
It does not create a mandatory consensus-ledger runtime dependency. A survey
packet does not execute search, call providers, replace source cards, or decide
promotion.

Survey handback conditions should distinguish search-resolvable unknowns from
unknowns that require user, project, or local context. Do not fill that gap by
expanding retrieval.

## Evidence Challenge Rule

Run only checks that can change retrieval, synthesis, or the decision; none is
mandatory.

Before retrieval, select evidence lenses only when one-sided framing, contested
evidence, incentives, or historical analogy could change the search plan.
Derive lenses from topic structure, stakeholders, disagreements, and evidence
gaps. Use these only as fallbacks:

- operations: seek tacit practice, implementation constraints, and omitted
  realities
- scholarship: seek peer-reviewed or systematic evidence, including contrary
  findings
- countercase: seek the strongest serious objection and neglected evidence
- incentives: inspect beneficiaries, funding, business models, and conflicts
- precedent: compare earlier outcomes and mechanisms, not superficial analogy

For each lens, record its question, hypothesis, source classes, and
resolving evidence. Route results into claims and insights; any lens note must
bind its position to evidence, limits, decision contribution, confidence, and
claim kind.

Never present lenses as simulated expert testimony. When the user requests all
five perspectives, cover five question routes and mark unsupported positions as
evidence needs.

When material claims conflict, compare claims and evidence, not lenses or
personas:

- name the clashing claim refs and whether the disagreement is factual,
  definitional, causal, scope-bound, or value-bound; hand value- or
  preference-bound conflicts back
- compare the strongest evidence chain on each side and whether the source
  routes are independent
- state how the conflict affects the decision
- name the evidence, test, or question that could resolve it

Count agreement as convergence only across independent evidence routes. Shared
prompts, models, source families, or assumptions are not consensus.
Lens omission is a coverage gap, not proof of a field-wide blind spot.

Before synthesis or handoff, audit reliability:

- for each material finding, name supporting claim refs, counterclaims or gaps,
  confidence, and source-independence limits
- check whether one source family, stakeholder class, method, or lens is
  overrepresented, and whether an omitted lens could change the decision
- rank findings only when ordering helps the decision; do not require a fixed
  number of findings
- use model self-critique to find gaps, not as validation or an authority score

Keep only review outputs that add evidence, source routes, resolved
contradictions, or decision value.

## Pass And Track Rule

Each pass under `passes/` should describe one bounded research attempt:

- pass id
- parent charter
- research questions
- retrieval plan
- planned tracks
- evidence threshold
- review checks

Each track under `tracks/` is a concurrency contract:

- track id
- track question
- owned output files
- source-id range or naming convention
- expected source types
- evidence threshold
- lead policy
- drift check

Researcher writes contracts. It does not launch or supervise subagents.

## Source Preservation Rule

When a source materially informs Bagakit decisions, preserve a stable local
source card with:

- source id
- title
- published date when known
- authority level
- source role
- scope fit
- limitations
- URL
- one short note on why it was kept

Authority is contextual to the claim. Owner or vendor documentation is primary
evidence for that owner's API, product behavior, or stated policy. It is not
independent evidence for comparative superiority, broad field consensus, or
real-world effectiveness unless the source directly supports that narrower
claim.

Treat rankings and benchmarks as capability-bounded evidence. Preserve the
task setup, metric, version or date when available, and the capability actually
tested. A browsing benchmark can support a claim about browsing persistence or
retrieval under its setup; it does not by itself establish source judgment,
synthesis quality, citation correctness, or end-to-end research quality.

## Summary Rule

Each summary should cover:

- what the source is
- why it matters
- what to borrow
- what not to copy
- Bagakit-specific implication

Summaries stay source-bound. If a summary supports a decision, record that
decision-facing statement separately as a claim.

## Claim Rule

`claims.md` should distinguish:

- observation
- inference
- recommendation

Each claim should include:

- claim id
- claim kind
- status or confidence
- evidence refs
- counterevidence when relevant
- local implication

Claims without evidence refs are drift risks.

## Insight Rule

`insights/` contains cross-source or cross-track interpretation.

Each insight should include:

- insight id and title
- supporting claim refs
- counterclaim refs when relevant
- confidence
- Bagakit implication
- open questions

Single-source insights should be marked low-confidence or speculative.

## Lead Rule

`leads.md` is the active-mining queue.

Each lead should include:

- lead id
- lead text
- source or trigger
- expected value
- stop rule
- status
- outcome when pursued

Leads prevent proactive exploration from silently changing the topic.

## Index Rule

`index.md` should answer:

- what the topic is for
- which local materials already exist
- what to read first
- what is still missing

`refresh-index` should update managed artifact sections only. Human-written
goals, read order, conclusions, and open questions must be preserved.

## Wiki Frontdoor Rule

The researcher wiki is a semantic navigation layer, not the evidence layer.

Rules:

- every durable wiki statement should point to topic evidence under `topics/`
- topic workspaces remain independently readable and auditable
- wiki pages should stay researcher-local until explicit promotion
- promoted shared knowledge belongs in the configured shared knowledge root,
  not in researcher wiki pages
- repository-level evolution decisions belong in `.bagakit/evolver/`
- a researcher that reads the wiki inherits a maintenance duty for the current
  loop
- maintenance means updating topic evidence first, refreshing the relevant topic
  index, regenerating the wiki, and running `doctor --wiki`
- generated wiki pages should not be hand-edited as the durable source of truth

`refresh-wiki` should generate at least:

- `<researcher_root>/index.md`
- `<researcher_root>/wiki/README.md`
- `<researcher_root>/wiki/concepts/research-topics.md`
- `<researcher_root>/wiki/questions/open-questions.md`
- `<researcher_root>/wiki/claims/supported-claims.md`

## Doctor Rule

`doctor --quality` checks structural completeness, including required topic
files, source-card shape, summary shape, survey clarification gates, track
outputs, and index references.

`doctor --drift` checks research integrity, including missing charter anchors,
track scope drift, ungrounded claims, recommendation without counterevidence,
context-only sources used as decision evidence, unchecked leads, and pursued
leads without outcomes.

Before synthesis or downstream handoff, the operator should also review
citation and evidence parentage: recommendations should trace to claim refs,
claim refs should trace back to source-bound summaries or source cards, and a
new synthesis should retain a topic-relative parent-charter anchor. Material
survey dimensions without adequate evidence should remain visible under open
risks. These are warning-first review rules unless a future gate exposes a
stable proof surface.

Quality and drift checks are warning-first unless a gate explicitly raises the
bar for a release or migration.

`doctor --wiki` checks the researcher-local frontdoor shape, evidence refs, and
path hygiene. It is warning-first unless a gate explicitly raises the bar.

## Handoff Rule

Researcher may render optional handoff artifacts:

- `handoffs/selector-evidence.md`
- `handoffs/evolver-context.md`
- `handoffs/living-knowledge-intake.md`

Handoffs are explicit files. Rendering one must not mutate selector, evolver,
or living-knowledge state.

## Optional Next-Step Routes

- host/shared knowledge:
  - hand off through the host knowledge protocol, if one exists
- repository evolution:
  - `.bagakit/evolver/` via weak local context refs or summarized source records
- task-level evidence:
  - `.bagakit/skill-selector/tasks/<task-slug>/skill-usage.toml`

The research workspace stays the evidence-production surface even when one of
these later routes is used.
