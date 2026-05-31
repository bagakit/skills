# Bagakit Skills Repo Rules

## Purpose

This file defines repository-level principles for the `skills/` repo while it
is being upgraded in place from a submodule hub to the canonical Bagakit
monorepo.

## Repo Stance

- this repo is the long-term source of truth for Bagakit skill authoring
- the old submodule-hub model must not be reintroduced
- remove obsolete behavior directly; do not add compatibility layers,
  compatibility migrations, or fallbacks

## Boundary Model

- `skills/` contains runtime-ready skill sources
- `host-harnesses/` contains L4 host-defining harness source units
- `docs/specs/` contains shared Bagakit specifications and durable semantics
- `docs/stewardship/` contains maintainer-facing stewardship guidance
- `gate_validation/` contains repo-owned and owner-local validation registration
- `gate_eval/` contains non-gating eval and benchmark assets
- `dev/` contains maintainer-only tool projects; the authoritative tool split
  lives in `dev/README.md`
- `.bagakit/` contains host-local Bagakit runtime state and may be ignored;
  materialized top-level runtime surfaces still require `surface.toml`
- `mem/` contains durable repository memory that is still evolving and should
  not be promoted to specs or runtime payload
- `catalog/` is reserved for non-authoritative metadata or legacy notes and
  must not become a shadow control plane for discovery, installability, or
  packaging

Do not let maintainer-only assets leak into runtime skill payloads.

Working split:

- executable tools belong under `dev/`
- validation truth belongs under `gate_validation/`
- non-gating eval belongs under `gate_eval/`
- stable rules belong under `docs/`
- evolving memory with future reuse value belongs under `mem/`
- agent-facing workflow semantics belong under `skills/`, not `dev/`
- host-defining workspace semantics belong under `host-harnesses/`, not
  `skills/`

Install split:

- installable skill directories are directly installable
- `link` expands families or skills into the target skills directory by symlink
- use `scripts/skill.sh install` or the Make install targets for install and
  update; do not manually create or repair skill links outside the installer
- distribution packaging is a separate concern from installability
- skill identity should come directly from the directory protocol under
  `skills/<family>/<skill-id>/` with `SKILL.md`

## Transition Rule

During migration:

- do not add new gitlinks or submodules
- do not recreate the `projects/` indirection model
- do not add new architecture that depends on sibling workspace repos being the
  hidden source of truth
- prefer changing this repo first when setting future structure, metadata, or
  validation rules
- do not keep compatibility-only entrypoints in the design baseline

## Engineering Principles

- choose the simplest implementation that satisfies the current requirement;
  do not add speculative abstractions or configuration layers
- establish the smallest working end-to-end path first, then add layers without
  dismantling working behavior for unfinished complexity
- keep components modular and concerns separated
- make architecture decisions for the long term; reject temporary designs that
  depend on replacing them later
- study how mature products solve the same problem and prefer proven patterns;
  apply the clean-room naming rule when adapting them to Bagakit
- keep documentation authority explicit and maintain one SSOT; when discussion
  with the user changes a requirement, update the owning requirement document
  immediately using language close to the user's original wording

## Clean-Room Naming Rule

Bagakit path naming must be independently authored.

Rules:

1. Do not reuse directory names under `docs/` from any external, reference, or
   generalized project.
2. Do not reuse file names under `docs/` from any external, reference, or
   generalized project.
3. Do not mirror external document ordering, section naming, or naming
   taxonomy.
4. When a concept is borrowed, restate it in Bagakit terms and rename the path
   from first principles.

## Path Rule

Do not use absolute filesystem paths in rules, plans, docs, scripts, examples,
or generated text unless the user explicitly requires one for an execution-only
command.

Default rule:

1. prefer repo-relative paths
2. otherwise use logical names or environment variables
3. do not encode machine-local paths into durable project text

## Temporary Artifact Rule

Ad hoc temporary files and directories belong under `.tmp/` by default.
Use an owned runtime/cache surface only when that surface is declared by
`surface.toml`; do not create new root scratch directories or generated
directories inside installable skill payloads.

Detailed local artifact rules live in
`docs/specs/runtime-surface-contract.md`.

## AGENTS Context Rule

Keep `AGENTS.md` short.

Rules:

1. keep only high-priority repository rules and index-style pointers here
2. move detailed operational or placement rules into the owning core file
3. when adding a new rule, prefer linking to the lower-level source of truth
   instead of copying the full rule text into `AGENTS.md`

Current core references:

- document placement and authority:
  - `docs/specs/document-surface-rules.md`
- runtime-surface ownership and local root protocol:
  - `docs/specs/runtime-surface-contract.md`
- ad hoc temporary artifact hygiene:
  - `docs/specs/runtime-surface-contract.md`
- all-skills frontdoor index contract:
  - `docs/specs/frontdoor-index-contract.md`
- selector entry policy:
  - `docs/specs/selector-selection-model.md`
- task-local shared-understanding ledgers:
  - `docs/specs/consensus-ledger-contract.md`
- validation assertion discipline:
  - `docs/stewardship/sop/validation-sop.md`

## Selector Entry Rule

For non-trivial Bagakit-shaped work, run selector preflight before major
implementation.

Selector frontdoor and candidate-scope semantics live in
`docs/specs/selector-selection-model.md`.

## Validation Rule

Validation should prove public behavior or owned contract text, not private
implementation shape. Detailed assertion-choice rules live in
`docs/stewardship/sop/validation-sop.md`.

Before adding or changing validation, choose the smallest proof-bearing oracle:
structured state, generated artifact, public command boundary, deterministic
fixture or receipt, or narrow wording contract. Do not add checks that only
police incidental headings, arbitrary phrases, private source strings, or broad
keyword arrays. If exact wording is the contract, classify it as a wording
contract and state what behavior it does not prove. If meaningful behavior lacks
a stable proof surface, expose a smaller owner-owned artifact or use non-gating
eval instead of skipping the test or adding a prose checklist.

## Tool Rule

Bagakit repository tooling should be designed as reusable operator tools rather
than ad hoc one-off commands.

Rules:

1. Prefer a CLI entrypoint for repository tools.
2. Small helper scripts may use the language best suited to the task.
3. Larger tools must consider engineering quality first.
4. Default to TypeScript instead of Python for larger-scale tools unless Python
   has a clear advantage for the task.
5. If another language has a clearly better fit for the task, use it
   deliberately and state why.
6. Keep tooling DRY. Shared logic should move into reusable modules instead of
   being copied across scripts.
7. Inspect existing dependencies before adding a package or writing a custom
   implementation; do not assume the current libraries lack the needed
   capability.
8. Prefer mature, actively maintained libraries. Add a dependency or reimplement
   a capability only when the reason is explicit.

## Install Rule

For canonical monorepo skills:

1. the skill directory is the install unit
2. `SKILL_PAYLOAD.json` is forbidden
3. if a file should not be installed with the skill, it does not belong inside
   the skill directory
4. do not add compatibility manifests to compensate for poor directory
   discipline

## Family Model

Current family boundary target:

- `skills/a2a/<skill-id>/`
- `skills/a2u/<skill-id>/`
- `skills/harness/<skill-id>/`
- `skills/design/<skill-id>/`
- `skills/swe/<skill-id>/`
- `skills/media-production/<skill-id>/`
- `skills/paperwork/<skill-id>/`
- `skills/gamemaker/<skill-id>/`
- `skills/human-improvement/<skill-id>/`

Use family names only when they express a real co-evolution boundary.

## Host Harness Model

Host harnesses are L4 host-defining units.

Rules:

1. source units live directly under `host-harnesses/<harness-id>/`
2. do not add family directories under `host-harnesses/`
3. each host harness has `harness.toml` as identity truth and `SKILL.md` as
   agent entrypoint
4. host harnesses define dedicated workspace purpose and top-level host layout;
   ordinary skills only add callable capabilities

Stable contract:

- `docs/specs/host-harness-contract.md`

## Decision Order

When architecture changes are proposed, prioritize:

1. source-of-truth clarity
2. runtime vs maintainer boundary clarity
3. validation and specification coherence
4. projection feasibility to legacy repos
5. install and distribution clarity without compatibility fallbacks

## Capability Claim Rule

Use one capability-claim ladder for this repo:

- `graduation`
  - minimum canonical onboarding bar is met
- `frontier`
  - graduation is met and Bagakit wins against a named comparison set on a
    shared benchmark
- `flywheel`
  - frontier is met and repeated failures improve shared specs, gates, eval, or
    reusable tooling

Do not claim a higher level without evidence.

Full definitions live in `docs/specs/canonical-capability-ladder.md`.
Maintainer review procedure lives in
`docs/stewardship/sop/capability-review-sop.md`.

## Commit Rule

For migration-effort commits, use `git-commit-nt <commit-message> [args...]`
instead of `git commit` unless the user explicitly overrides the rule.

## Working Rule

If a change helps short-term convenience but preserves split truth between the
canonical monorepo and any external legacy source, reject it.
<!-- BAGAKIT:LIVING-KNOWLEDGE:START -->
This is a managed block for `bagakit-living-knowledge`. Do not hand-edit the
managed region directly; refresh it through the skill operator instead.

Resolve the installed skill dir before using the operator directly:

- `export BAGAKIT_LIVING_KNOWLEDGE_SKILL_DIR="<repo-relative-installed-skill-dir>"`

Boot layer:

- Read the resolved `must-guidebook.md` before relying on memory.
- If a task needs shared knowledge rules, read `must-authority.md`.
- If a task needs maintenance-route guidance or shared directives, read `must-sop.md`.
- If a task needs prior decisions or facts, follow `must-recall.md`.
- `AGENTS.md` is only the bootstrap layer; the shared checked-in knowledge root
  defaults to `docs`, with shared path protocol config in
  `.bagakit-knowledge.toml` when present.

Recall discipline:

- Search first:
  - `sh "$BAGAKIT_LIVING_KNOWLEDGE_SKILL_DIR/scripts/bagakit-living-knowledge.sh" recall search --root . '<query>'`
- Then inspect only the needed lines:
  - `sh "$BAGAKIT_LIVING_KNOWLEDGE_SKILL_DIR/scripts/bagakit-living-knowledge.sh" recall get --root . <path> --from <line> --lines <n>`
- Prefer quoting only needed lines over paraphrasing from memory.

Substrate discipline:

- Shared knowledge belongs under the configured shared root.
- `.bagakit/` is host-local runtime state and may be ignored; do not publish
  shared knowledge there.
- Durable examples and managed bootstrap text must stay repo-relative; never
  record absolute filesystem paths in shared knowledge or AGENTS guidance.
- When imported material needs one durable handle, prefer a short opaque id
  such as `k-2ab7qxk9` instead of a timestamped capture name.
- Research runtime belongs to `bagakit-researcher`.
- Task-level composition/runtime belongs to `bagakit-skill-selector`.
- Repository evolution memory belongs to `bagakit-skill-evolver`.
- `living-knowledge` owns path protocol, normalization, indexing, and recall.
- `living-knowledge` also owns generated `must-sop.md` and reusable-items
  governance inside the shared knowledge root.

Inspection helpers:

- Run these commands from the project root so `--root .` resolves to the
  intended project.
- View the resolved path protocol:
  - `sh "$BAGAKIT_LIVING_KNOWLEDGE_SKILL_DIR/scripts/bagakit-living-knowledge.sh" paths --root .`
- Refresh the guidebook and helper map:
  - `sh "$BAGAKIT_LIVING_KNOWLEDGE_SKILL_DIR/scripts/bagakit-living-knowledge.sh" index --root .`
- Run non-destructive diagnostics:
  - `sh "$BAGAKIT_LIVING_KNOWLEDGE_SKILL_DIR/scripts/bagakit-living-knowledge.sh" doctor --root .`

If the surrounding workflow explicitly asks for `living-knowledge` task
reporting, the response footer may use:

- `[[BAGAKIT]]`
- `- LivingKnowledge: Surface=<updated shared surfaces or none>; Evidence=<commands/checks>; Next=<one deterministic next action>`
<!-- BAGAKIT:LIVING-KNOWLEDGE:END -->

<!-- BAGAKIT:FRONTDOOR:START -->
<bagakit-rule skill="bagakit-skill-selector">Trigger: Non-trivial Bagakit work needs an explicit skill or composition choice. | Do: Run selector preflight before major implementation; direct execution remains valid. | See: `docs/specs/selector-selection-model.md` | Evidence: `.bagakit/skill-selector/tasks/<task-slug>/skill-usage.toml`</bagakit-rule>
<bagakit-rule skill="bagakit-agent-messaging">Trigger: One concrete Agent-to-Agent exchange needs clear sender recognition, source citation, plain-language action, startup alignment, or an event-driven Worker report. | Do: Use the L1 bagakit-msg envelope, cite only decision-bearing source text, say the action and proof in plain language, and keep authentication, authority, transport, and effect with the Host. | See: `skills/a2a/bagakit-agent-messaging/SKILL.md` | Fallback: Use the Host-authenticated plain-text channel without inventing another XML grammar; preserve the same attribution and report semantics.</bagakit-rule>
<bagakit-rule skill="bagakit-brainstorm">Trigger: Markdown notes need option exploration, trade-offs, expert-forum review, and a next-step handoff. | Do: Run the bounded brainstorm workflow and produce explicit handoff artifacts. | See: `skills/harness/bagakit-brainstorm/SKILL.md`</bagakit-rule>
<bagakit-rule skill="bagakit-codex-webpage-design">Trigger: A task needs a high-craft webpage or landing page built and visually verified. | Do: Clarify the brief and reference intent, implement in the host stack, then verify with browser screenshots and parity review. | See: `skills/design/bagakit-codex-webpage-design/SKILL.md`</bagakit-rule>
<bagakit-rule skill="bagakit-coding-agent-principles">Trigger: A non-trivial task reaches an implementation decision, including after debugging, review, refactoring, architecture, verification, or research. | Do: Protect the user goal at the owning boundary, choose the smallest durable project-native slice, reuse before inventing, and prove owned and public behavior. | See: `skills/swe/bagakit-coding-agent-principles/SKILL.md`</bagakit-rule>
<bagakit-rule skill="bagakit-consensus-ledger">Trigger: Work needs a durable ledger for consensus, unknowns, inferences, blind spots, decisions, dimensions, or evidence requirements. | Do: Embed the ledger in the owner run when possible and keep epistemic class, status, provenance, evidence, and promotion explicit. | See: `skills/harness/bagakit-consensus-ledger/SKILL.md` | Surface: `<owner-dir>/consensus-ledger.json or .bagakit/consensus-ledger/ledgers/<ledger-id>/ledger.json` | Fallback: Use prose for tiny one-turn work; promote durable knowledge through living-knowledge.</bagakit-rule>
<bagakit-rule skill="bagakit-daily-media-production">Trigger: Work needs a recurring, multi-stage research-to-publication production loop. | Do: Compose peers through briefs and receipts, preserve no-publish gates, and keep deployment and notification status explicit. | See: `skills/media-production/bagakit-daily-media-production/SKILL.md` | Evidence: `.bagakit/daily-media-production/runs/<run-id>/archive.md`</bagakit-rule>
<bagakit-rule skill="bagakit-design-core">Trigger: A design task needs tone, rule, reference-tier, or draft/plan/result review. | Do: Map design evidence into concrete axes and review a design packet without owning implementation. | See: `skills/design/bagakit-design-core/SKILL.md` | Surface: `.bagakit/design/` | Fallback: Use `bagakit-spark` when the target is too vague to review.</bagakit-rule>
<bagakit-rule skill="bagakit-feature-tracker">Trigger: A repository needs durable feature or task planning truth before implementation or repeated flow execution. | Do: Create or update tracker state with explicit workspace mode, task gates, and lifecycle status. | See: `skills/harness/bagakit-feature-tracker/SKILL.md`</bagakit-rule>
<bagakit-rule skill="bagakit-flow-runner">Trigger: Existing planning truth needs a repeatable runner for one bounded execution item, checkpoint, or resume. | Do: Select one item, run the bounded session, and write checkpoint or incident state. | See: `skills/harness/bagakit-flow-runner/SKILL.md`</bagakit-rule>
<bagakit-rule skill="bagakit-git-message-craft">Trigger: Git changes need intent-based commit splitting, review-quality messages, or merge-request text. | Do: Choose draft, commit, or MR authority, derive the message from the diff, lint it, and preserve validation facts. | See: `skills/swe/bagakit-git-message-craft/SKILL.md`</bagakit-rule>
<bagakit-rule skill="bagakit-grill">Trigger: A concrete plan, design, goal, or implementation direction needs pressure testing before execution. | Do: Preserve the goal, resolve inspectable nodes with evidence, ask only decision-bearing questions, and require convergence. | See: `skills/harness/bagakit-grill/SKILL.md` | Surface: `.bagakit/grill/runs/<run-id>/` | Fallback: Use `bagakit-spark` when the target is too vague to grill.</bagakit-rule>
<bagakit-rule skill="bagakit-hitl-webutil-design">Trigger: A task needs or resumes a HITL utility or course page for learning, testing, evidence review, comparison, approval, or handoff. | Do: Define interaction, evidence, and continuity, then route building and desktop/mobile verification through webpage design unless explicitly design-only. | See: `skills/design/bagakit-hitl-webutil-design/SKILL.md`</bagakit-rule>
<bagakit-rule skill="bagakit-living-knowledge">Trigger: A repository needs shared checked-in knowledge, deterministic recall, managed bootstrap guidance, or path protocol. | Do: Use the living-knowledge operator for indexing, recall, ingestion, and managed guidebook surfaces. | See: `skills/harness/bagakit-living-knowledge/SKILL.md`</bagakit-rule>
<bagakit-rule skill="bagakit-mastery-learning">Trigger: Source material should become or continue an evidence-backed course or mastery path. | Do: Define source and mastery boundaries, diagnose, practice for transfer, and continue interactive learning through the existing verified page. | See: `skills/human-improvement/bagakit-mastery-learning/SKILL.md`</bagakit-rule>
<bagakit-rule skill="bagakit-paperwork-technical-writing">Trigger: Technical notes, drafts, or transcripts need a publishable article plus execution-ready handoff. | Do: Draft or rewrite with explicit quality gates, source evidence, and review output. | See: `skills/paperwork/bagakit-paperwork-technical-writing/SKILL.md`</bagakit-rule>
<bagakit-rule skill="bagakit-project-chronicle">Trigger: Project sessions need an evidence-grounded chronicle, retrospective, origin story, or evolution analysis. | Do: Seal the source census, derive session cards and lineage, then publish the chronicle and evolution ledger without fictionalizing facts. | See: `skills/harness/bagakit-project-chronicle/SKILL.md` | Surface: `.bagakit/project-chronicle/runs/<run-id>/` | Fallback: Use an ordinary summary for one session; hand promotion candidates to the owning workflow.</bagakit-rule>
<bagakit-rule skill="bagakit-researcher">Trigger: A repository needs a local-first research loop with topic charter, source cards, summaries, claims, or drift checks. | Do: Create a topic workspace, preserve source-bound evidence, and synthesize only after quality checks. | See: `skills/harness/bagakit-researcher/SKILL.md`</bagakit-rule>
<bagakit-rule skill="bagakit-set-loop-goal">Trigger: A Feature Tracker feature needs a compact Agent Goal that survives restart or handoff. | Do: Write the Feature-owned goal through Feature Tracker and keep mutable execution truth in tracker state. | See: `skills/harness/bagakit-set-loop-goal/SKILL.md` | Surface: `.bagakit/feature-tracker/features/<feature-id>/goal.md` | Fallback: Resolve the Feature first; use Spark for an unclear target and Grill only for unresolved decisions.</bagakit-rule>
<bagakit-rule skill="bagakit-skill-evolver">Trigger: A long-lived repository evolution topic spans multiple candidates, decisions, or promotion paths. | Do: Open or update evolver topic state before the decision history becomes too large for the current task. | See: `skills/harness/bagakit-skill-evolver/SKILL.md`</bagakit-rule>
<bagakit-rule skill="bagakit-spark">Trigger: The user wants deep exploratory discussion, a thinking partner, or an accepted conceptual snapshot. | Do: Choose the resolution route, gather the needed evidence, ask only decision-changing questions, and preserve rationale and option coverage. | See: `skills/harness/bagakit-spark/SKILL.md`</bagakit-rule>
<bagakit-rule skill="bagakit-supervisor">Trigger: Capable Agent execution may run long, become passive or wasteful, drift from its goal, lose convergence, serialize behind assurance, delegate, recover, or claim completion. | Do: Actively own efficient, high-quality convergence to current Owner truth: understand the user's real desired result, keep Worker method ownership intact, use A2A for Worker control and A2U for result-first user visibility after each review round, and require exact-current-candidate readiness. | See: `skills/harness/bagakit-supervisor/SKILL.md` | Fallback: Use the same harness around one direct Agent without fan-out; let the host own provider and process mechanics.</bagakit-rule>
<bagakit-rule skill="bagakit-user-communication">Trigger: An Agent must keep a user oriented with a timely start, progress, decision, blocker, correction, or completion update in plain language. | Do: Bind the user's current communication requirements, surface urgent exceptions immediately, coalesce ordinary facts at semantic breakpoints, lead with the real result, and leave channel authentication and delivery to the Host. | See: `skills/a2u/bagakit-user-communication/SKILL.md` | Fallback: Use the current Host-authenticated user channel with the same result-first, plain-language, truth-calibrated semantics.</bagakit-rule>
<bagakit-rule skill="bagakit-writing-core">Trigger: Writing needs generic routing, foundation, structure, evidence, prose mechanics, or review without a personal style. | Do: Route first, check the foundation, apply generic mechanics, then lint or review. | See: `skills/paperwork/bagakit-writing-core/SKILL.md`</bagakit-rule>
<bagakit-rule skill="bagakit-writing-de-ai-tone">Trigger: Writing needs AI-tone detection or rewriting, protected spans, bilingual smell checks, or rhythm review. | Do: Detect language and scene, preserve protected spans, audit by severity, rewrite only as needed, and recheck without inventing evidence. | See: `skills/paperwork/bagakit-writing-de-ai-tone/SKILL.md`</bagakit-rule>
<bagakit-rule skill="bagakit-writing-intake">Trigger: Writing needs pre-draft intake for evidence, privacy, protected spans, style, or rewrite risks. | Do: Emit an intake packet with evidence and boundaries plus a named next owner; do not write final prose. | See: `skills/paperwork/bagakit-writing-intake/SKILL.md`</bagakit-rule>
<bagakit-rule skill="qihan-writing">Trigger: Technical, research, planning, weekly-review, or Feishu-oriented prose needs qihan-style rewriting or drafting. | Do: Route through the operating surface matrix before drafting, then apply the writing and review references. | See: `skills/paperwork/qihan-writing/references/workflow/OPERATING_SURFACE_MATRIX.md`</bagakit-rule>
<bagakit-rule skill="topdown-image2-sprite-pipeline">Trigger: Game work needs image2-derived top-down sprite strips, alpha sheets, motion validation, or provenance review. | Do: Process in an isolated package, validate independently, analyze motion, and record reviewer disposition before integration. | See: `skills/gamemaker/topdown-image2-sprite-pipeline/SKILL.md`</bagakit-rule>
<!-- BAGAKIT:FRONTDOOR:END -->
