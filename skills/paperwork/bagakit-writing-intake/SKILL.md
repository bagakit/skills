---
name: bagakit-writing-intake
description: Small L1 paperwork Intake surface for diagnosing writing tasks, distilling evidence-bound language profiles, and emitting an intake_packet before Core or Style work. Use when a writing, rewrite-planning, calibration, style-distillation, or rewrite-feedback task needs pre-draft routing, audience/channel context, evidence ledger, privacy boundary, protected spans, style candidates, Core risk candidates, or rule candidates; do not use as the terminal drafting or rewrite owner.
metadata:
  bagakit:
    paperwork_layer: l1-intake
---

# Bagakit Writing Intake

`bagakit-writing-intake` is the paperwork Intake layer.

It emits an evidence-bound `intake_packet`. It does not produce final prose.

## Boundary

This skill owns:

- writing task route, audience, channel, genre, and source-material state
- clarity routing from target-language proficiency, text mode, terminology
  state, and the consequence of misunderstanding
- sample provenance, privacy boundary, retention posture, and evidence strength
- language-profile observations derived from supplied samples or guided prompts
- expression strengths, expression frictions, protected spans, and exclusions
- style candidates and rewrite-feedback rule candidates with confidence
- rewrite-feedback extraction from before/after evidence into candidate rules
- Core risk candidates for later confirmation by `bagakit-writing-core`
- handoff owner selection for Core, de-AI-tone, generic style overlays,
  concrete overlays such as `qihan-writing`, delivery skills, or other owners

It does not own:

- final drafting, rewriting, polishing, or publishing
- universal quality approval or final Core veto authority
- qihan-specific taste, channel defaults, or casebook examples
- detector evasion, identity simulation, raw private sample storage, or training
- research-source capture, article packaging, slides, PDFs, or HTML delivery

## Workflow

1. Establish the task route.
   - Is the user asking for diagnosis, rewrite planning, profile calibration,
     feedback abstraction, or a handoff packet?
   - If the user asks for final prose, Intake still stops at packet emission
     and hands off to the appropriate Core or Style layer.
2. Gather only task-needed evidence.
   - Use provided drafts, samples, user edits, brief answers, and constraints.
   - Do not persist raw private samples inside the skill payload.
   - If evidence is thin, mark confidence low and ask one focused question only
     when the missing answer changes the route.
   - For procedures, technical descriptions, or high-consequence text, record
     the `clarity_routing` dimensions before choosing Core or delivery work.
3. Read the required reference for the current decision:
   - packet shape: `references/intake-packet-contract.md`
   - profile dimensions: `references/profile-dimensions.md`
   - Core and Style ownership: `references/core-style-boundary.md`
   - rewrite feedback: `references/rewrite-feedback-intake-rule-candidates.md`
4. Emit one `intake_packet`.
   - Prefer YAML or JSON.
   - Every profile claim, risk, and candidate rule must cite evidence from the
     provided task context or state that evidence is missing.
   - Keep raw excerpts short and only as needed for traceability.
5. Name the next owner.
   - Typical route: Intake -> `bagakit-writing-core` -> optional
     `bagakit-writing-de-ai-tone` -> optional Style overlay such as
     `qihan-writing` -> delivery skill.
   - If final prose was requested, emit the packet and a compact handoff note.
     The same agent may continue with the selected downstream skill only when
     that skill is available and neither Core risk candidates nor missing user
     input block the route.
   - If evidence or Core risks block the route, stop after the packet and ask
     the smallest decision-changing question or name the next repair owner.

## Output Contract

The primary output is a single `intake_packet` plus a short handoff note.

Minimum top-level fields:

- `packet_version`
- `task_route`
- `audience_channel_genre`
- `source_material_state`
- `clarity_routing`
- `evidence_ledger`
- `privacy_boundary`
- `language_profile`
- `expression_strengths`
- `expression_frictions`
- `protected_spans`
- `style_candidates`
- `core_risk_candidates`
- `rewrite_feedback_rule_candidates`
- `handoff`

Use `references/intake-packet-contract.md` for field definitions and examples.

## Runtime Surface Declaration

- top-level Bagakit runtime surface roots:
  - none by default
- this skill works through installed references and explicit task outputs
- stable contract:
  - `docs/specs/runtime-surface-contract.md`

## References

- `references/intake-packet-contract.md`
- `references/profile-dimensions.md`
- `references/core-style-boundary.md`
- `references/rewrite-feedback-intake-rule-candidates.md`
- `references/frontdoor-rule.toml`
- `references/skill-cli.toml`
