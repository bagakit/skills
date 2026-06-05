---
name: bagakit-explain
description: Create low-text visual HTML explanations that give newcomers an architecture map, causal understanding, and only useful motion in the user's language. Not for courses or mastery claims.
---

# Bagakit Explain

Build runnable, responsive HTML for a reader with no topic knowledge. Big
pictures teach; "few words" applies per scene, not to the number of ideas.

## Defaults

- use the language of the user's latest substantive request everywhere
- deliver working HTML; preserve exact identifiers, formulas, and proper nouns
- make every large visual explain a relationship, sequence, comparison, or mechanism

## Make It Understandable

1. Start from the learner's goal and current knowledge; for a complex topic,
   show a stable whole-system map before detail and introduce terms only when needed.
2. Let each scene answer one question, share the work between visuals and words,
   and remove anything that does not change understanding.
3. Reach the real causal mechanism, then test it with a changed-case prediction
   or self-explanation; fluent reading is not understanding.

## Keep the Critical Content

1. Put the one conclusion, judgment, or action the user must retain first.
2. Organize by causal and dependency order, not source order; show each major
   part's job, input, change, output, and necessity.
3. If removing something does not weaken correct explanation, prediction, or
   action, delete it or progressively disclose it.

## Use Motion Only When It Teaches

1. Animate only when removing motion would remove temporal, state, or causal
   information the reader needs to infer.
2. Keep entities and spatial references stable, expose the changing relation,
   and preserve deliberate inspection and a meaningful reduced-motion state.
3. Compare static and animated versions on prediction, explanation, or transfer;
   if motion improves only preference or experience, keep the static version.

## Build

1. Map the scenes before coding. A complex topic needs the architecture, major
   parts, one end-to-end example, root mechanism, boundary, and changed case.
2. Choose a visual world from the audience and topic, not a technical-dark
   stereotype; implement an accessible static page that works on desktop and mobile.
3. Verify and expose the static artifact to the user as a real milestone.
4. Then review motion. If it qualifies, replace only that visual at the same
   path with accessible inline SVG and reverify; otherwise stop with the static page.

Return the artifact path, language, motion decision, desktop/mobile evidence,
and limits. Artifact completion never proves learner understanding or mastery.

This skill owns no persistent runtime surface; put ad hoc intermediates under
`.tmp/`.
