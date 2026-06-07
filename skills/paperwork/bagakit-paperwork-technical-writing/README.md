# Bagakit Paperwork Technical Writing

Technical-writing L2 skill for turning technical notes, drafts, transcripts, and
technical collaboration fragments into either a concise source-faithful brief
or publishable article outputs plus execution-ready handoff material.

Use `bagakit-writing-core` for generic writing mechanics: route, foundation,
structure, evidence architecture, de-AI-tone orchestration, rewrite feedback,
and review packet shape. The canonical AI-tone taxonomy and bilingual lexicon
live in `bagakit-writing-de-ai-tone`; this L2 reaches that primitive through
core.

This skill owns the technical article delivery envelope:

- `article.md`
- `execution_appendix.md`
- `review_report.md`
- technical profile budgets and hard gates
- engineering evidence, baseline regression, and source-parentage reporting

It also owns the concise `distill` route for chats, meeting notes, survey
drafts, and incident logs. Use it when the user says 炼化、精炼、提炼、整理成
技术文档、`distill`, or `$refine-doc`; it emits a compact brief rather than
forcing article-length gates.

`refine-doc` is a mode and trigger alias, not a second installable skill. Use
`distill` for fast facts-and-actions; switch to `article` only when publication
or a full execution handoff is required.

It remains standalone-first. If the sibling core is not installed, use the
bundled local references and checker, then record that core composition was
unavailable.

## Commands

```bash
bash scripts/bagakit-paperwork-technical-writing-cli.sh validate
bash scripts/bagakit-paperwork-technical-writing-cli.sh core describe
bash scripts/bagakit-paperwork-technical-writing-cli.sh check-article --input article.md --profile general --strict
bash scripts/bagakit-paperwork-technical-writing-cli.sh print-review-packet-template
bash scripts/bagakit-paperwork-technical-writing-cli.sh print-distillation-workflow
bash scripts/bagakit-paperwork-technical-writing-cli.sh print-refined-document-template
bash scripts/bagakit-paperwork-technical-writing-cli.sh mask-secrets < source.md
```

The `core` command dispatches to the sibling `bagakit-writing-core` CLI when it
is installed next to this skill.

## Runtime Surface Declaration

- top-level Bagakit runtime surface roots:
  - none by default
- this skill writes explicit working-directory outputs instead of owning one
  Bagakit persistent runtime root
- stable contract:
  - `docs/specs/runtime-surface-contract.md`
