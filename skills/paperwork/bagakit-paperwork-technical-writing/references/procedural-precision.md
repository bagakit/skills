# Procedural Precision

Use this reference for execution-bearing text: procedures, runbooks,
installation steps, recovery actions, safety instructions, and the operational
parts of `execution_appendix.md`.

Do not apply this mode to article narrative, architecture rationale, trade-off
analysis, or quoted source text merely because the topic is technical.

## Activation

Use stronger precision review when one or more conditions hold:

- Intake selects `clarity_routing.precision_route: controlled_technical`.
- A reader must execute the text in order.
- Misunderstanding can cause data loss, service impact, security risk, or a
  safety issue.
- The target audience has mixed or limited proficiency in the document
  language.

## Review

1. Classify each block as `procedure`, `description`, or `rationale`.
2. Keep one stable term for one concept and preserve exact technical names.
3. Give each numbered step one primary action.
4. Put a precondition before the action when sequence matters.
5. Name the actor and referent when omission makes responsibility ambiguous.
6. Attach the expected signal, failure condition, or recovery action to the
   step that owns it.
7. Review sentence and noun-cluster load against the reader and consequence;
   do not enforce one universal length target.
8. Recheck commands, identifiers, qualifiers, order, and causal direction
   against the source.

Record accepted deviations in `review_report.md`. A deviation is valid when a
longer or passive form preserves necessary technical meaning better than the
shorter alternative.

## Source And Ownership

The Core rule ids are:

- `terminology-stability-one-concept`
- `referent-actor-action-visible`
- `instruction-primary-action`
- `reader-burden-bounds-complexity`

The activation model is informed by ASD-STE100 Issue 9 and the ASD STEMG
checker guidance:

- `https://www.asd-ste100.org/about_STE.html`
- `https://www.asd-ste100.org/STEsoftware.html`

This skill applies a bounded Bagakit transfer. It does not ship the controlled
dictionary, reproduce the standard, or claim STE compliance.
