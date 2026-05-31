# bagakit/skills

Bagakit skills repository, now acting as the canonical Bagakit monorepo.

## Current Stance

- this repo is the long-term source of truth for Bagakit skill authoring
- this repo is maintained as one complete Bagakit system
- `skills/` contains distributable runtime units inside that shared system
- `host-harnesses/` contains L4 host-defining harness source units
- new structure should prefer the monorepo target layout instead of expanding
  incomplete placeholder structure
- do not preserve compatibility logic as a design goal

## System Model

Bagakit should evolve through:

- evidence
- decision memory
- promotion
- durable surface

`evidence` may come from research or practice.

The intended system split is:

- `researcher`
  - an independent evidence-production system
  - responsible for research workflow, source preservation, summaries, and
    topic-level research capture
- `evolver`
  - the repository learning system
  - contains a `memory plane` and a `decision plane`
  - responsible for turning evidence into structured decision memory and then
    promoting stable conclusions upward

Promotion routing should distinguish:

- `host`
- `upstream`
- `split`

The intended rule is:

- host-specific adoption learning stays in the host repository
- reusable Bagakit learning should move upstream
- mixed cases should be split instead of forced into one side

The current intake seam for upstream-worthy memory that is not yet ready to
become structured evolver state is top-level `.mem_inbox/`.

Important split:

- evidence may stay distributed across local workspaces and operational traces
- `evolver` runtime memory and decision state is structurally recorded in
  `.bagakit/evolver/` when that surface is locally materialized
- durable conclusions should be promoted into `docs/specs/`,
  `docs/stewardship/`, or `skills/`

This repository should not be treated as a loose bundle of unrelated skills.
It is one jointly maintained system whose runtime units happen to be
independently distributable.

## Target Repository Shape

```text
skills/
├── skills/
│   ├── harness/
│   ├── design/
│   ├── swe/
│   ├── paperwork/
│   ├── gamemaker/
│   ├── media-production/
│   └── human-improvement/
├── host-harnesses/
├── docs/
│   ├── architecture/
│   ├── specs/
│   └── stewardship/
├── .bagakit/              # local runtime state, ignored by default
├── dev/                   # one tool project per child; split truth in dev/README.md
│   ├── eval/
│   ├── bagakit_cli/
│   ├── agent_runner/
│   ├── agent_loop/
│   ├── validator/
│   └── host_tools/
├── gate_validation/
│   ├── backbone/
│   ├── dev/
│   ├── host-harnesses/
│   └── skills/
├── gate_eval/
│   ├── backbone/
│   ├── dev/
│   └── skills/
├── mem/
├── catalog/
├── scripts/
└── blogs/
```

## Repository Surfaces

- `skills/`
  - installable Bagakit skill sources
  - runtime-ready skill content should live here
- `host-harnesses/`
  - L4 host harness source units
  - each child defines one dedicated host workspace shape
  - flat layout only: `host-harnesses/<harness-id>/`
- `docs/specs/`
  - Bagakit-authored stable specifications and shared semantics
- `docs/stewardship/`
  - maintainer-facing repository stewardship guidance
- `dev/`
  - maintainer-only tool projects, one independent tool per child directory
  - the authoritative tool split lives in `dev/README.md`
- `gate_validation/`
  - repo-owned and owner-local validation registration
- `gate_eval/`
  - non-gating eval and benchmark assets
- `.bagakit/`
  - project-local Bagakit runtime state
  - ignored by default because task, research, selector, evolver, and design
    runtime state may contain private host context
  - materialized top-level runtime surfaces still carry `surface.toml` locally
    per `docs/specs/runtime-surface-contract.md`
  - reviewed public evidence must be promoted to `docs/`, `mem/`,
    `gate_validation/`, `gate_eval/`, or `skills/` before being committed
- `.mem_inbox/`
  - optional evolver-owned intake buffer for upstream-worthy memory that is
    not yet structured topic state
- `mem/`
  - durable but still-evolving repository memory
  - evidence, experiments, and decisions that should not yet be promoted into
    stable specifications
- `catalog/`
  - reserved metadata and transition notes
  - not consulted by the active skill discovery, link, or package flows
- `scripts/`
  - repository entrypoints for validation, link install, and package-archive
    generation
- `blogs/`
  - public-facing narrative and release notes

Important split:

- `dev/` is for steward-facing tool projects
- `gate_validation/` is the proving surface for release-blocking validation
- `gate_eval/` is the non-gating measurement surface
- agent-facing workflow semantics belong in `skills/`
- host-defining workspace semantics belong in `host-harnesses/`
- task-level skill selection and usage evidence and repository-level evolution must stay
  distinct

## First Principle

Installable skill sources are directly installable from their skill directory.

Rules:

- do not add compatibility layers that weaken the directory-is-payload model
- do not reintroduce manifest-driven payload selection for installable skill
  sources
- do not put files inside a skill directory unless they are meant to be
  installable with that skill

The old submodule-hub model has already been removed from this repository.

## Tooling Direction

- prefer CLI-shaped tools for repository maintenance and validation
- small scripts may use the language best suited to the task
- larger tools should default toward TypeScript unless Python or another
  language has a stronger concrete advantage
- shared logic should be factored to avoid script drift

## Validation

Primary entrypoint:

```bash
make validate-repo
```

Current behavior:

- `make validate` is an alias of `make validate-repo`
- `make validate-fast` runs only the universal preflight suites
- `make validate-repo` selects the release-blocking suites affected by the
  current change set
- the default gate is resolved through `dev/validator` plus `gate_validation/`

Command-language target:

- `gate validate`
- `gate eval`

`dev/validator` is the engine, not the user-facing taxonomy.

## Install And Distribution

Bagakit distributes installable skill sources directly from the directory
protocol:

- `skills/<family>/<skill-id>/`
- `SKILL.md`

No registry, delivery profile, or secondary manifest is consulted.

### Install Scope

Choose one install scope before symlinking the runtime-ready skill sources.

If you are not sure, choose repo-local install.

### Repo-Local Install

Install into one consumer repo under both `.codex/skills/` and
`.claude/skills/`.

Run this from the consumer repo:

```bash
bash <bagakit-skills-clone>/scripts/skill.sh install --scope repo-local
```

With no selector, this installs every discovered installable skill source into
both `.codex/skills/<skill-id>` and `.claude/skills/<skill-id>`.

To install one family instead:

```bash
bash <bagakit-skills-clone>/scripts/skill.sh install --selector harness --scope repo-local
```

To install one exact skill source instead:

```bash
bash <bagakit-skills-clone>/scripts/skill.sh install --selector harness/bagakit-skill-selector --scope repo-local
```

If you want to target a different consumer repo explicitly:

```bash
bash <bagakit-skills-clone>/scripts/skill.sh install \
  --selector harness \
  --scope repo-local \
  --repo <consumer-repo>
```

### Global Install

Install into both global pickup directories by default:

- Agent: `$AGENTS_HOME/skills` or `~/.agents/skills`
- Claude: `$CLAUDE_CONFIG_DIR/skills` or `~/.claude/skills`

Use this when one local clone should feed many repos.

```bash
bash <bagakit-skills-clone>/scripts/skill.sh install --scope global
```

Common Make wrappers:

```bash
make install-status
make install-check
make install-global
make update-global
make install-repo REPO=<consumer-repo>
make update-repo REPO=<consumer-repo>
```

`install-*` creates missing links in both default destinations for the selected
scope and leaves correct links unchanged. All destinations are checked for
protected conflicts before any link is written.
`update-*` passes `--force` to refresh stale or conflicting links. Use
`make install-status` to inspect, and `make install-check` when stale, missing,
or conflicting installs should fail the command.

### Raw Link Primitive

`install` is the preferred user-facing entrypoint.

`link` remains available as the low-level projection primitive when you need an
explicit target directory instead of the standard repo-local or global pickup
paths.

```bash
bash scripts/skill.sh link --selector harness --dest <target-skills-dir>
```

Make wrapper:

```bash
make link-skills DEST=<target-skills-dir> SELECTOR=harness
make update-link DEST=<target-skills-dir> SELECTOR=harness
```

### Package Archives

Package archive generation is not the normal local install or update path.
Use it only when you need distributable `.skill` archives instead of symlinked
local projections. It follows the same directory protocol and writes
family-scoped `.skill` archives.

```bash
make package-all
make package-one SELECTOR=<all|family|family/skill-id|skill-id>
```

`make package-all`, and `make package-one SELECTOR=all`, package every
discovered installable skill source.
Any other selector packages only the resolved family or exact skill selection.

Skill ids are globally unique across families.
If a bare selector matches a family name, family selection wins; use
`<family>/<skill-id>` when you need the exact skill.

If no installable skill sources exist yet, packaging may produce no
artifacts.

Command-language targets:

- `bash scripts/skill.sh install`
- `bash scripts/skill.sh distribute-package`

## Local Preview

For the GitHub Pages blog output:

```bash
python3 -m pip install markdown
python3 scripts/build-blog-pages.py --input blogs --output site --repo-url https://github.com/bagakit/skills
python3 -m http.server --directory site 8000
```

## Design Baseline

- `AGENTS.md`
  - repository-level migration rules
- `docs/specs/document-surface-rules.md`
  - stable placement and authority rules for repository documents
- `docs/specs/harness-concepts.md`
  - project-level concept set for the harness direction
  - semantic boundaries are the main contract
- `docs/specs/canonical-capability-ladder.md`
  - durable meanings for `graduation`, `frontier`, and `flywheel`
- `docs/stewardship/sop/capability-review-sop.md`
  - maintainer procedure for reviewing those claim levels
- `docs/skill-development.md`
  - current Bagakit skill development baseline

These legacy reference docs may be rehomed or rewritten as the monorepo model
stabilizes.
