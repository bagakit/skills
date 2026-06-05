# Intake Packet Contract

`bagakit-writing-intake` emits `intake_packet` as its authoritative artifact.
The packet is a handoff object, not a draft.

Intake does not produce final prose. When final prose is requested, Intake
stops at packet emission plus a handoff note; the same agent may continue with a
downstream skill only when that skill is available and the packet does not show
Core or user-input blockers.

## Required Shape

```yaml
intake_packet:
  packet_version: "0.1"
  task_route:
    requested_action: ""
    intake_lane: "diagnose | rewrite_plan | style_calibration | feedback_abstraction | handoff"
    final_prose_requested: false
    final_prose_owner: "none | bagakit-writing-core | bagakit-writing-de-ai-tone | style-overlay | delivery-skill | qihan-writing | other"
  audience_channel_genre:
    audience: ""
    channel: ""
    genre: ""
    decision_or_action_expected: ""
  source_material_state:
    available_materials: []
    missing_materials: []
    stability: "stable | partial | unstable"
    reason: ""
  clarity_routing:
    reader_target_language_proficiency: "fluent | working | limited | mixed | unknown"
    text_mode: "procedure | description | argument | mixed"
    misunderstanding_consequence: "low | moderate | high | safety_critical"
    terminology_state: "stable | glossary_available | inconsistent | unknown"
    precision_route: "ordinary | core_clarity | controlled_technical"
    evidence_ids: []
  evidence_ledger:
    - id: "e1"
      kind: "draft | sample | user_edit | instruction | constraint | inferred_gap"
      source_scope: "provided_in_task | user_confirmed | inferred"
      excerpt_or_pointer: ""
      supports: []
      confidence: "high | medium | low"
  privacy_boundary:
    raw_private_samples_in_packet: false
    retention_rule: "do_not_store_raw_samples"
    allowed_reuse: "task_only | user_confirmed_profile | team_pattern | none"
    notes: ""
  language_profile:
    dimensions:
      - name: "opening_move | argument_order | sentence_density | evidence_posture | voice_tone | other"
        observation: ""
        candidate_rule: ""
        scope: "local | document | profile_candidate"
        rollback_condition: ""
        evidence_ids: []
        confidence: "high | medium | low"
    confidence: "high | medium | low"
    evidence_ids: []
  expression_strengths:
    - claim: ""
      evidence_ids: []
      confidence: "high | medium | low"
  expression_frictions:
    - claim: ""
      evidence_ids: []
      likely_fix_owner: "core | de-ai-tone | style-overlay | delivery | user"
      confidence: "high | medium | low"
  protected_spans:
    - span_or_pointer: ""
      protection_reason: "semantic | legal | factual | voice | user_requested | unknown"
      allowed_operations: []
      evidence_ids: []
  style_candidates:
    - rule_candidate: ""
      applies_when: ""
      avoid_when: ""
      evidence_ids: []
      confidence: "high | medium | low"
  core_risk_candidates:
    - risk: "semantic_drift | evidence_loss | task_mismatch | unclear_audience | weak_foundation | over_style"
      evidence_ids: []
      why_core_should_check: ""
      confidence: "high | medium | low"
  rewrite_feedback_rule_candidates:
    - before_pointer: ""
      after_pointer: ""
      delta_type: "content | structure | tone | rhythm | evidence | specificity | layout"
      inferred_rule: ""
      scope: "local | document | profile_candidate"
      rollback_condition: ""
      evidence_ids: []
      confidence: "high | medium | low"
  handoff:
    next_owner: "bagakit-writing-core | bagakit-writing-de-ai-tone | style-overlay | delivery-skill | qihan-writing | user | none | other"
    owner_reason: ""
    must_read_refs: []
    open_questions: []
```

## Evidence Rules

- Every profile claim, friction, style candidate, and risk candidate must cite
  at least one `evidence_ledger.id`.
- Every `language_profile.dimensions[]` item must separate observation from
  candidate rule. Observation records what the evidence shows; candidate rule
  records what future writing may do if scope and rollback checks pass.
- Every `language_profile.dimensions[]` item must include `name`,
  `observation`, `candidate_rule`, `scope`, `rollback_condition`,
  `evidence_ids`, and `confidence`.
- Every `rewrite_feedback_rule_candidates[]` item must include `delta_type` so
  downstream owners can distinguish content, structure, tone, rhythm, evidence,
  specificity, and layout deltas before accepting a candidate rule.
- `clarity_routing` classifies reader burden and communication consequence. It
  does not authorize Intake to apply controlled-language rules or approve the
  final text.
- Use `controlled_technical` only when the text is procedural or descriptive
  and misunderstanding has a high or safety-critical consequence, or when the
  user explicitly requests a controlled-language route.
- `clarity_routing.evidence_ids` must cite the user instruction, audience
  evidence, source artifact, or an explicit inferred gap.
- Use `source_scope: inferred` only for gaps or route assumptions, not for
  claims about a person's style.
- Keep excerpts minimal. Prefer pointers when the source material already lives
  in the task context or a user-provided artifact.
- Do not include private raw corpora, long samples, or reusable personal
  profile data unless the user explicitly confirms that reuse boundary.

## Confidence Rules

- `high`: repeated direct evidence, or one direct user-stated preference.
- `medium`: one concrete sample plus no conflicting evidence.
- `low`: thin evidence, ambiguous signal, or plausible but unconfirmed route.

## Handoff Rules

- If `core_risk_candidates` is non-empty, the next owner is usually
  `bagakit-writing-core`.
- If the only issue is AI-tone cleanup and protected spans are clear, the next
  owner may be `bagakit-writing-de-ai-tone`.
- If Core risks are clear or resolved and taste overlay is requested, the next
  owner may be the generic `style-overlay`; name `qihan-writing` or another
  concrete style skill in `owner_reason` or `must_read_refs` when known.
- If a channel or artifact-specific delivery step is needed, the next owner may
  be the generic `delivery-skill`; name the concrete delivery skill when known.
- If the correct owner is outside the known enum, use `other` and explain the
  owner in `owner_reason`.
- If material is too thin to route, hand off to the user with one
  decision-changing question.

## Mini Example

```yaml
intake_packet:
  packet_version: "0.1"
  task_route:
    requested_action: "distill style from samples"
    intake_lane: "style_calibration"
    final_prose_requested: false
    final_prose_owner: "none"
  audience_channel_genre:
    audience: "internal technical readers"
    channel: "Feishu doc"
    genre: "research synthesis"
    decision_or_action_expected: "choose whether to draft with Core then style overlay"
  source_material_state:
    available_materials: ["two short samples"]
    missing_materials: ["longform example"]
    stability: "partial"
    reason: "enough for low-confidence profile, not enough for reusable style"
  clarity_routing:
    reader_target_language_proficiency: "working"
    text_mode: "argument"
    misunderstanding_consequence: "moderate"
    terminology_state: "stable"
    precision_route: "core_clarity"
    evidence_ids: ["e1"]
  evidence_ledger:
    - id: "e1"
      kind: "sample"
      source_scope: "provided_in_task"
      excerpt_or_pointer: "sample A paragraph 1"
      supports: ["opening_move", "evidence_posture"]
      confidence: "medium"
  privacy_boundary:
    raw_private_samples_in_packet: false
    retention_rule: "do_not_store_raw_samples"
    allowed_reuse: "task_only"
    notes: "Use pointers instead of copying full samples."
  language_profile:
    dimensions:
      - name: "opening_move"
        observation: "Starts with a concrete judgment before context."
        candidate_rule: "Open synthesis drafts with the decision-relevant claim."
        scope: "profile_candidate"
        rollback_condition: "Do not apply when the reader lacks object definition."
        evidence_ids: ["e1"]
        confidence: "medium"
    confidence: "medium"
    evidence_ids: ["e1"]
  expression_strengths: []
  expression_frictions: []
  protected_spans: []
  style_candidates: []
  core_risk_candidates:
    - risk: "weak_foundation"
      evidence_ids: ["e1"]
      why_core_should_check: "Only short samples are available."
      confidence: "low"
  rewrite_feedback_rule_candidates: []
  handoff:
    next_owner: "bagakit-writing-core"
    owner_reason: "Core should check foundation before any style overlay."
    must_read_refs: ["references/workflow/INTAKE_HANDOFF_AND_CORE_VETO.md"]
    open_questions: ["Do we have one longform sample?"]
```
