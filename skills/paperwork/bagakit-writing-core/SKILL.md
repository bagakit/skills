---
name: bagakit-writing-core
description: Generic paperwork writing primitives for routing, foundation checks, title and structure quality, evidence architecture, de-AI-tone orchestration, prose mechanics, rewrite feedback, and review discipline. Use directly for general writing quality work or compose with paperwork L2 skills such as qihan-writing and bagakit-paperwork-technical-writing.
metadata:
  bagakit:
    paperwork_layer: l1-core
---

# Bagakit Writing Core

`bagakit-writing-core` is the reusable writing foundation for the `paperwork`
family.

It exists because the strongest writing mechanics in the family should not be
locked inside one style-specific skill.

## Boundary

This skill owns generic writing primitives:

- task routing before drafting
- intake packet consumption from `bagakit-writing-intake`
- foundation sufficiency checks
- title promise and title-pattern discipline
- structure, paragraph movement, and claim/support quality
- terminology stability, referent and actor clarity, instruction atomicity,
  and reader-burden review
- evidence architecture, source parentage, sample boundary, and counterevidence
- content preservation, no-regression checks, task fitness, and Core vetoes
- Core rule metadata for reusable generic writing checks
- de-AI-tone orchestration through `bagakit-writing-de-ai-tone`
- prose-mechanics lint and publishable-prose review discipline
- Core validation of Intake-extracted rewrite-feedback rule candidates for
  clarity, structure, evidence, semantic preservation, and no-regression
- generic longform review, audience-fit checks, and review packet shape
- anti-rationalization discipline for common agent excuses

It does not own:

- personal taste calibration
- personal language profile distillation
- qihan-specific Chinese longform defaults
- Feishu or channel-specific layout
- a technical article delivery envelope
- PDF, HTML, slide, or book export
- research source capture

Those belong to L2 skills or peer systems.

## Relationship To L2 Skills

Use this core as the L1 writing substrate.

- `bagakit-writing-intake`
  - owns diagnostic intake, evidence ledger, privacy boundary, personal
    language profile distillation, style candidates, rewrite-feedback rule
    candidate extraction, and handoff owner
  - emits an `intake_packet` that Core may consume as route context
  - does not decide generic publishability, evidence sufficiency, semantic
    preservation, no-regression, or Core veto outcomes

- `bagakit-writing-de-ai-tone`
  - owns AI-tone detection, protected-span handling, rewrite protocol,
    bilingual lexicon, profile exceptions, and script-backed de-AI-tone lint
  - does not replace core-owned title, evidence, structure, audience, or
    longform review decisions
  - is a required L1 primitive for final prose, public summaries, rewritten
    drafts, titles, abstracts, and review reports

- `qihan-writing`
  - owns personal Chinese-writing taste, priority order, channel defaults, and
    personal rewrite cases
- `bagakit-paperwork-technical-writing`
  - owns `article.md`, `execution_appendix.md`, `review_report.md`, engineering
    evidence, baseline regression, and profile-specific hard gates

L2 skills should remain standalone-first. If this core is absent in a host
install, the L2 should either use its documented fallback or ask selector to
compose the core explicitly.

## Workflow

1. Route the writing task.
   - Start with `references/workflow/OPERATING_SURFACE_MATRIX.md`.
   - Pick the scenario and lane before drafting.
   - When a `bagakit-writing-intake` `intake_packet` is supplied, consume it
     through `references/workflow/INTAKE_HANDOFF_AND_CORE_VETO.md` before
     selecting the lane.
   - When `clarity_routing.precision_route` is `core_clarity` or
     `controlled_technical`, load
     `references/writing/PRECISION_AND_READER_BURDEN.md`.
2. Check whether the foundation is stable.
   - Use `references/knowledge/PRE_DRAFT_ROUTE_MEMO_TEMPLATE.md`.
   - Run `scripts/writing_core_route_tools.py check-foundation` when a route
     memo, handoff, or depth packet exists.
   - Run `scripts/writing_core_route_tools.py review-foundation` when only a
     draft or loose route artifact exists.
3. Choose structure and title promise.
   - Use `references/writing/NARRATIVE_ANGLE_SELECTION.md`.
   - Review the choice with
     `references/writing/NARRATIVE_ANGLE_REVIEW_HEURISTIC.md`.
4. Draft or rewrite.
   - Use `references/writing/STRUCTURE_PYRAMID.md`,
     `references/writing/AI_SMELLS.md`, and
     `references/workflow/REWRITE_FEEDBACK_LOOP.md`.
5. Lint and review.
   - Use `references/rules/core-rule-registry.toml` as the rule metadata index.
   - MUST run the de-AI-tone pass for publishable prose:
     `bash scripts/bagakit-writing-core-cli.sh de-ai-tone lint --profile <profile> <artifact.md>`.
   - Run `scripts/writing_core_lint.py`.
   - For rewrites, run `scripts/writing_core_inventory.py compare` before
     accepting a smoother but thinner draft.
   - Use `references/review/QA_HARD_METRICS.md`,
     `references/review/LONGFORM_RUBRIC.md`, and
     `references/review/ANTI_RATIONALIZATION_TABLE.md`.

## Runtime Surface Declaration

- top-level Bagakit runtime surface roots:
  - none by default
- this skill works through installed references, templates, scripts, and
  explicit task outputs
- stable contract:
  - `docs/specs/runtime-surface-contract.md`

## Commands

```bash
bash scripts/bagakit-writing-core-cli.sh validate
bash scripts/bagakit-writing-core-cli.sh list-references
bash scripts/bagakit-writing-core-cli.sh lint --fail-on warn <artifact.md>
bash scripts/bagakit-writing-core-cli.sh de-ai-tone lint --profile blog <artifact.md>
bash scripts/bagakit-writing-core-cli.sh route check-foundation <route-memo.md>
bash scripts/bagakit-writing-core-cli.sh route review-foundation <artifact.md>
bash scripts/bagakit-writing-core-cli.sh rules validate
bash scripts/bagakit-writing-core-cli.sh inventory compare <source.md> <rewrite.md> --fail-on risk
bash scripts/bagakit-writing-core-cli.sh print-review-packet-template
bash scripts/bagakit-writing-core-cli.sh print-intake-handoff
```

## References

- `references/README.md`
- `references/workflow/INTAKE_HANDOFF_AND_CORE_VETO.md`
- `references/workflow/OPERATING_SURFACE_MATRIX.md`
- `references/rules/core-rule-registry.toml`
- `references/knowledge/PRE_DRAFT_ROUTE_MEMO_TEMPLATE.md`
- `references/writing/AI_SMELLS.md`
- `references/writing/PRECISION_AND_READER_BURDEN.md`
- `references/writing/STRUCTURE_PYRAMID.md`
- `references/review/QA_HARD_METRICS.md`
- `references/review/ANTI_RATIONALIZATION_TABLE.md`
- `references/review/REVIEW_PACKET_TEMPLATE.md`
