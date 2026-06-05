# Rewrite Protocol

## Detect Mode

Return:

1. Issues found, grouped by P0/P1/P2.
2. Protected spans and scene assumption.
3. Assessment: which findings are real release risks and which are judgment
   calls.

Do not rewrite in detect mode.

## Rewrite Mode

Return:

1. Issues found, with short offending excerpts.
2. Protected spans and scene assumption.
3. Rewritten version, preserving intent, facts, examples, and useful structure.
4. Change summary, focused on meaningful structural edits.
5. Second-pass audit. Re-read the rewrite and either fix remaining AI tells or
   state that no blocking AI-tone issue remains.

The shipped CLI does not rewrite prose automatically. `lint` and `detect`
produce detection JSON; `rewrite-plan` prints this protocol for an agent or
downstream writing workflow to apply.

## Protected-Span Pass

Before rewriting, identify hard-information spans that must survive:

- code blocks and inline code
- commands, paths, URLs, API names, field names, and error strings
- dates, versions, metrics, identifiers, owners, and quoted source names

Rewrite the prose around these spans. Do not paraphrase a protected span just to
make the sentence sound smoother. If a protected span appears wrong, call it out
as a separate factual issue instead of silently fixing it.

The CLI lint report includes a `protected_spans` summary to make this pass
visible for downstream agents.

## Precision Cross-Check

After rewriting, compare the source and result for:

- stable technical terms and declared aliases
- actor-to-action and referent mappings
- preconditions, action order, and expected outcomes
- qualifiers, modality, causal direction, and trade-offs

Use the Core rules `terminology-stability-one-concept`,
`referent-actor-action-visible`, `instruction-primary-action`, and
`reader-burden-bounds-complexity` when available. A clearer surface does not
justify changing these relationships.

This cross-check does not turn de-AI-tone into an STE checker. Do not apply a
controlled vocabulary, fixed sentence length, or blanket active-voice rewrite.

## Scene Pack

When the CLI receives `--scene auto`, it may infer an active scene from visible
commands, paths, owners, metrics, dates, list shape, and document length. Treat
that inference as rewrite context, not as a new fact about the audience or
publication channel.

## Evidence Gap Guard

Do not invent missing evidence while removing AI-tone:

- If a lexicon suggestion says a claim needs a metric, customer, example,
  owner, or source, use only evidence already present in the draft or provided
  by the user.
- If the evidence is absent, mark an evidence gap and either narrow the claim
  or ask for the missing source.
- Do not add customer names, percentages, examples, quotes, benchmarks, dates,
  or audience assumptions to make the rewrite sound more grounded.
- Do not turn protected quoted text into the author's claim. Keep the quote
  intact and write any assessment outside it.

## Rewrite Threshold

Prefer patching when the draft has isolated word or phrase issues.

Recommend full paragraph rebuild when all of these are true:

- five or more always-rewrite lexicon hits
- three or more structural pattern categories
- uniform rhythm or list-heavy scaffolding

For a rebuild, first state the core point in one sentence, then rewrite around
that point.

Use the scene pack to set rewrite pressure:

- `chat`: reduce padding and keep the ask clear.
- `status`: preserve owners, metrics, blockers, sequence, and dates.
- `docs`: prefer exactness over voice; keep command and path text stable.
- `public-writing`: remove template polish while preserving sources and claims.
- `technical`: keep precise technical terms; avoid cosmetic synonym swaps.

## Conflict-Bait Guard

Do not create tension by turning the topic into a staged fight:

- `该做 vs 不该做`
- `塌方式 vs 体面`
- `赢面高 vs 赢面低`
- `老路 vs 新路`

These frames look clear, but they often manufacture conflict and invite
argument. Replace them with the actual decision boundary, trade-off, or failure
mode.

Also avoid vague group dunking:

- `人们往往...`
- `大多数人...`
- `很多团队会...`

Use those forms only when a source, sample, or explicit context is visible.
Otherwise write the concrete behavior: `把 rollout 写成发布，会漏掉验证完成`
is stronger than `大多数团队会误解 rollout`。

## Context Exceptions

Technical and docs profiles prioritize clarity over voice. Domain terms are
allowed when they carry precise meaning.

Do not flag quoted examples when the text is explicitly discussing AI writing
patterns. Only flag the author's own prose.

## Humanizer Boundary

Humanizer or detector-evasion artifacts may be used as adversarial fixtures.
They must not define the success target. The target is meaning-preserving,
source-preserving, accountable prose with fewer AI-tone tells.
