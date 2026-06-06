# Quality Gates

Quality gates are split into hard gates and warning gates.

- hard gates define non-negotiable release conditions
- warning gates require human judgment and explicit record

## 1. Hard Gates (block publish)

Hard gate failure means the draft cannot be marked complete.

| Gate | Rule | Why this matters |
|---|---|---|
| H1 uniqueness | exactly one H1 | prevents structural ambiguity |
| H2 range | H2 count in `[3, 5]` by default | keeps scanability and scope control |
| placeholder hygiene | no `TODO`, `TBD`, `{{...}}`, `待补充` | avoids implicit unfinished state |
| publish metadata leakage | no `[[BAGAKIT]]` or `- PaperworkWriting:` line in article | prevents internal directive pollution in publish copy |
| first-draft density floor | when `--profile` is set (non-general), satisfy profile floors for words/cases/diagrams/full-sample anchors | ensures first draft is publish-grade, not a short scaffold |
| readability floor | for non-general profiles, satisfy all: H2 short restatement coverage (`<=16`), opening/middle/ending anchor loop, long sentence ratio `<25%` (`>40` units counts as long), short break sentence density | prevents drafts that are solid but hard to restate and hard to scan |
| rewrite regression guard | if baseline exists, high-compression rewrite cannot drop multiple evidence classes (`full sample`, `hard evidence`, `anti-pattern`, `rollout/checklist`); and high-content baseline (`>=500` words) cannot be compressed `>45%` without explicit scope-cut note | blocks "clean but hollow" rewrites |
| checker status | `scripts/check-article.py --strict` exits `0` | ensures objective baseline is met |

## 2. Warning Gates (human review required)

Warning gates do not auto-block release, but cannot be silently ignored.

| Gate | Trigger | Required reviewer action |
|---|---|---|
| list overload | any continuous bullet block > 5 items | justify list form or convert part to narrative |
| generic headings | headings like `问题诊断`, `问题陈述`, `方案设计`, `总结` | rewrite to reader-question or scoped heading |
| example absence | no explicit markers (`例如`, `比如`, `case`, `before`, `after`) | add at least one concrete example or rationale |
| AI-tone lexicon risk | warning lexicon hits (for example `锁死`, `抓手`, `赋能`; source: `references/ai-tone-terms.txt`) | rewrite into owner/action/signal language; keep final decision in agent gate |
| process scaffold leakage | publish article contains planning headings (`Reader contract`, `Task after reading`, `Out of scope`, `Success signal`) | move planning content to outline/review artifacts |
| suspicious shrink vs baseline | article drops sharply compared with previous version (default threshold 35%) | explain intentional scope cut or recover missing substance |
| evidence-pack thin | article lacks concrete evidence anchors and reads like framework-only outline | add concrete artifact anchor and operational proof signals |
| evidence-pack drop vs baseline | baseline has richer evidence anchors than current rewrite | restore key evidence blocks or document intentional scope cut |
| sample/checklist class drop | baseline has long sample block or rollout checklist but rewrite removes it | restore class-level evidence density or document explicit scope cut |
| hard-evidence chain drop | baseline has command/path/hash/threshold linkage but rewrite drops that chain | recover traceability chain in body text |
| memory-anchor weak coverage | memory hooks are sparse or low-quality in agent review | add recall-friendly anchor lines (restatable proposition, contrast line, or tri-question close) |
| ending recall closure weak | ending has no recap signal (`goal/status/next step` or key-claim one-liner) | redesign closing paragraph for post-read recall |
| brainstorm sampling metadata weak | missing one or more of sampling object / sample size / window / review role |补齐采样协议元信息，避免“可执行但不可运营” |
| mechanical short-sequence style | repeated short sequence sentences (for example continuous `先X。再Y。`) | merge/expand with causal evidence sentence to avoid robotic cadence |
| fragment sentence dense | too many fragment-like short lines in body | clean residual fragments and restore coherent sentence flow |
| procedure action overload | one numbered step carries multiple primary actions or obscures their order | split or regroup the step while preserving preconditions and expected signals |
| procedure actor or referent ambiguity | a pronoun, passive form, or omitted actor makes responsibility uncertain | name the actor or repeat the precise referent; record a justified deviation when the actor is irrelevant |
| procedure terminology drift | one concept cycles through undeclared synonyms or a technical name is paraphrased | restore one stable term and preserve exact domain or API identity |

Weighted score formula note:

- The weighted formula in `references/agent-gate-rubric.md` is recommended for writer self-check and final comparison.
- It is not a script hard gate and cannot replace hard-gate pass requirements.

## 3. Review Recording Contract

For every warning gate that remains:

- write decision in `review_report.md`
- include reason and reviewer name/role
- include whether follow-up is required

If warning count increases compared with prior version, explain why.

## 4. Release Decision Policy

- `pass`: all hard gates pass, warnings are reviewed and documented
- `fail`: any hard gate fails
- `conditional pass`: hard gates pass, warning follow-up is accepted with explicit owner

## 5. Escalation Rules

Escalate to deep review when any of the following occurs:

- same hard gate fails in 2 consecutive iterations
- warning count rises for 2 consecutive iterations
- gate conflicts with business-critical publication deadline

Escalation output should define:

- what is blocked
- what can still ship
- who owns recovery and by when

## 6. Operational Command

```bash
python3 scripts/check-article.py --input article.md --strict --profile <profile> --report review_report.md
python3 scripts/check-article.py --input article.md --strict --profile <profile> --baseline previous.md --report review_report.md
```

## 7. Minimal Reviewer Checklist

- [ ] Hard-gate status is explicit.
- [ ] Warning decisions are recorded with rationale.
- [ ] No unresolved placeholders remain.
- [ ] Release status (`pass/fail/conditional pass`) is written in report.
