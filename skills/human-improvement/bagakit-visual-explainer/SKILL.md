---
name: bagakit-visual-explainer
description: Create low-text, visual-first HTML explanations for newcomers. Use for unfamiliar or complex topics that need a reusable architecture overview, layered causal depth, and the user's language. Not for adaptive courses or mastery claims.
---

# Bagakit Visual Explainer

Build a runnable, responsive HTML artifact that gives someone with no prior
knowledge a faithful mental model.

Plain language is an entry ramp, not a reason to remove the mechanism. "Big
pictures and few words" means visuals carry more meaning; it does not mean the
subject becomes shallow.

## Defaults

- deliver working HTML, not a prompt, outline, or design brief
- use the language of the user's latest substantive request for all visible
  copy, labels, controls, examples, and alt text
- preserve exact identifiers, formulas, API names, and proper nouns; explain
  unfamiliar terms once in the user's language

Return inline HTML or design-only work only when the user explicitly asks for
that downgrade or the host forbids file creation.

## Four Invariants

### Visuals carry the explanation

Every large visual must encode a relationship, sequence, comparison, mechanism,
or faithful concrete intuition. Decorative scale does not count.

Keep one main idea per visible scene. Use short labels and progressive reveal
instead of surrounding a small diagram with long prose.

### Coverage before compression

"Few words" applies to each scene, not to the number of scenes. Build the
explanation graph before compressing it into a page.

For a complex topic, give every major module its own scene covering its job,
input, change, output, and necessity. Include one example that travels through
the whole system. An overview, card grid, or recap cannot substitute for either.

### The whole stays visible

For a complex topic, show an architecture overview before detail and reuse it
as a map while zooming into layers or modules. Mark where the reader is and
what flows into, through, and out of each part.

A topic is complex when one causal model cannot explain it cleanly, or when the
answer crosses several layers, modules, actors, or time steps.

### The explanation reaches the roots

Move from familiar language to the real causal mechanism: why the parts are
needed, which constraint produces the behavior, where an analogy stops matching,
and where the model fails. Include one changed-case prediction that surface
familiarity cannot answer.

## Working Path

Use the smallest path that preserves the four invariants:

1. Bound the topic and the questions a zero-background reader must answer.
2. Map those questions, major modules, and causal transitions into an
   explanation graph that determines scene count.
3. Give the newcomer one familiar anchor and only the vocabulary needed to
   enter the first visual.
4. Show the whole-system map when the topic is complex.
5. Give each major part its own explanation scene and trace what enters, what
   changes, what leaves, and why the part exists.
6. Walk one concrete example through the whole system end to end.
7. Expose assumptions, trade-offs, failure boundaries, and the changed case.
8. Return to the map so the details become one reconstructable model.
9. Render and verify the selected HTML delivery.

Do not force equal screen counts, a fixed visual style, or a fixed module count.
Let the topic determine the composition.

## Visual Choices

After the graph is sound, choose an intentional topic-fit visual world; this
skill has no house style. Technical accuracy must not default to a dashboard or
card grid. Use expressive illustration, spatial composition, typography, and
motion when they improve memory.

Do not infer a dark palette from technical complexity. Derive lightness,
temperature, chroma, and shape language from the audience, emotional goal, and
memory strategy; before committing, consider one materially different light or
editorial direction.

- match the visual form to the reasoning job: map, flow, sequence, comparison,
  or annotated close-up
- keep illustrations faithful and use HTML, CSS, or SVG when precision matters
- keep encoding stable and distinguish reality, simplification, and analogy
- vary scene form when the reasoning job changes

The artifact must work on desktop and mobile, provide meaningful alt text,
support keyboard use when interactive, and not rely on color alone.

## Completion Gate

The artifact must give a newcomer enough support to:

- state what the topic is for in ordinary language
- locate the major parts and relationships
- explain each major part's job, input, change, output, and necessity
- walk one concrete example through the system end to end
- follow the causal path that produces the result
- distinguish the real model from its analogy
- identify a boundary or failure case
- reason about the changed case
- reconnect the details to the whole

These are artifact-quality gates. They do not prove that a particular learner
understood, retained, transferred, or mastered the topic.

## Boundaries

This skill owns the explanation boundary, conceptual map, causal depth, visual
semantics, and learner-facing language. `bagakit-mastery-learning` owns learner
evidence and mastery claims; page peers may own interaction and frontend craft;
research owns missing facts. If peers are unavailable, build a self-contained
artifact and state the verification limit.

## Completion Receipt

Return the HTML path or URL, bounded topic, chosen language, overview and root
coverage, desktop/mobile evidence for built HTML, and unresolved limits. Do not
claim learner understanding without learner evidence.

The typed maintenance mirror is
`references/visual-explanation-contract.toml`; read it when an audit, validator,
or explicit handoff needs stable stage and guard ids.

This skill owns no persistent `.bagakit/` runtime surface. Put final artifacts
in the user-selected or project-native location and ad hoc intermediates under
`.tmp/`.
