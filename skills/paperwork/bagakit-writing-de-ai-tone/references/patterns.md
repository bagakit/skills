# De-AI Tone Patterns

AI tone is usually structural before it is lexical. Fix the sentence skeleton,
paragraph movement, and evidence pressure before replacing words.

## P0 Credibility Killers

- chatbot artifacts: `Certainly!`, `Absolutely!`, `希望对你有所帮助`
- model cutoff disclaimers: `as of my last update`, `截至我所知`
- vague authority: `experts believe`, `业内人士指出`, `有分析认为`
- reasoning-chain artifacts: `let me think step by step`, `我们一步步分析`
- significance inflation without proof: `里程碑式意义`, `pivotal moment`

These should normally be removed or rewritten before release.

## P1 Strong AI Smell

- fake contrast: `不是 A，而是 B`, `it is not X, it is Y`
- universal openings: `随着…不断发展`, `in today's rapidly evolving...`
- process filler: `进行分析`, `进行优化`, `进行讨论`
- list scaffolding where prose should connect the ideas
- excessive bold, emoji headers, or too many headings in a short section
- PR inflation: `开创性`, `引领行业`, `game-changer`
- synonym cycling: rotating equivalent nouns instead of repeating the precise one
- forced rule-of-three or parallel slogans without added information
- conflict-bait binary framing: `该做 vs 不该做`, `塌方式 vs 体面`,
  `赢面高 vs 赢面低`, `老路 vs 新路`. This borrows tension from a
  staged fight instead of earning the claim through evidence.
- unsupported people-generalization dunking: `人们往往...`, `大多数人...`,
  `很多团队会...`. If the group is only there to make the author look sharper,
  rewrite the sentence around the concrete failure mode, sample, or boundary.

## P2 Polish Signals

- uniform sentence and paragraph length
- too many transition words: `此外`, `与此同时`, `moreover`, `furthermore`
- title-case headings in English prose when sentence case is expected
- stacked Chinese `的` phrases
- high four-character slogan density
- generic endings: `未来可期`, `only time will tell`
- action hidden in a noun shell: `conduct a comprehensive evaluation`,
  `实现了对体验的显著提升`

## Controlled-Clarity Overlap

Some controlled-language concerns overlap with AI tone only when they hide
meaning or add decorative complexity:

- an empty verb carries an abstract action noun
- a passive or pronoun hides responsibility or reference
- synonym cycling makes one concept look like several
- a clause stack obscures action order or a necessary qualifier

Treat the first item as a script-backed advisory when the pattern is strong.
Treat the others as contextual review questions through `bagakit-writing-core`.
Do not import a controlled dictionary, universal sentence limit, blanket
active-voice rule, or one-action procedure style into generic de-AI-tone work.

## Rewrite Principles

- Direct positive claims beat fake contrast.
- Concrete examples beat importance labels.
- Source names beat vague authority.
- Mixed rhythm beats symmetrical phrasing.
- Plain verbs beat inflated verbs.
- Repeated precise terms beat synonym cycling.
- Specific failure modes beat vague group dunking.
- A real continuum beats a staged binary fight.
- Protected hard facts beat smoother wording.
- Stable terms, visible responsibility, and preserved action order beat a
  superficially more natural rewrite.

When in doubt, ask: if this sentence is deleted, what information disappears?
If the answer is "nothing", delete it.

## Humanizer Artifacts To Treat As Adversarial

These patterns can appear after generic "humanizer" rewrites. Treat them as
review targets, not as goals:

- facts removed to create a smoother paragraph
- commands, paths, or identifiers paraphrased into natural language
- metrics rounded or softened without permission
- sources turned into vague authority
- accountability removed from status updates
- detector-focused rhythm variation that makes the text less precise
