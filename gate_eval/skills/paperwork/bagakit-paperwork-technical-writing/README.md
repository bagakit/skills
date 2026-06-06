# Paperwork Technical Writing Eval

`gate_eval/skills/paperwork/bagakit-paperwork-technical-writing/` is the
non-gating eval slice for
`skills/paperwork/bagakit-paperwork-technical-writing/`.

It checks that source-parentage, counterevidence, and controlled-technical
procedure surfaces are visible through the skill CLI and compatible with the
owned article validator.

Primary entrypoint:

```bash
node --experimental-strip-types dev/eval/src/cli.ts run --root . --suite gate_eval/skills/paperwork/bagakit-paperwork-technical-writing/suite.ts
```

Default result root:

- `gate_eval/skills/paperwork/bagakit-paperwork-technical-writing/results/runs/`
