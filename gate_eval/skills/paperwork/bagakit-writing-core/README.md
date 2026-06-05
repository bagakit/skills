# Bagakit Writing Core Eval

`gate_eval/skills/paperwork/bagakit-writing-core/` is the non-gating eval slice
for `skills/paperwork/bagakit-writing-core/`.

It checks that route/foundation, rule metadata, lint/prose mechanics, review
packet, and anti-rationalization surfaces are reachable through the skill CLI.
It also validates a Core-owned qualitative case pack for terminology,
referents, instructions, reader burden, and no-regression boundaries.

Primary entrypoint:

```bash
node --experimental-strip-types dev/eval/src/cli.ts run --root . --suite gate_eval/skills/paperwork/bagakit-writing-core/suite.ts
```

Default result root:

- `gate_eval/skills/paperwork/bagakit-writing-core/results/runs/`
