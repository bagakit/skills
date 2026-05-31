# Governance Structure

## Purpose

This document defines the governing structure of the Bagakit system.

It explains:

- why the canonical Bagakit repository is both an upstream system and a host
  repository
- why `skills/` is the independently distributable runtime surface
- why the rest of the system is governed through non-runtime governance
  surfaces
- why self-hosting is a stewardship mode rather than a separate system

This document is not a maintainer SOP.
It is the architecture-level explanation of how governance and runtime
distribution coexist.

## Governing Claim

The canonical Bagakit repository is itself a host repository.

That means:

- `upstream` is not the opposite of `host repo`
- the upstream system is realized through one canonical host repository
- that host repository exposes a distributable runtime surface through
  `skills/`
- everything else required to govern, review, route, and evolve the system
  belongs to non-runtime governance surfaces

This is the core governance structure that keeps Bagakit evolvable without
collapsing all surfaces into one bucket.

## Upstream As Canonical Host Repository

Bagakit should be understood as a host repository that hosts Bagakit itself.

This has two consequences:

- the repository is a real operating environment, not only a source archive
- the repository can produce host-style evidence about its own operation

That evidence still requires routing.
The fact that upstream is also a host does not make every local learning event
upstream truth.

## Distributable Runtime Surface

The distributable runtime surface of the Bagakit system is:

- `skills/`

More specifically, system-owned runtime units live under capability families
such as:

- `skills/a2a/`
- `skills/a2u/`
- `skills/harness/`

Those runtime units must satisfy both conditions:

- they are governed as part of one shared repository system
- they remain independently distributable and independently usable

This means:

- `skills/` is the broad distributable runtime surface
- `skills/harness/` is the canonical home for the runtime units that compose
  the Bagakit system itself
- `skills/a2a/` is the canonical home for role-neutral Agent communication
  capabilities that co-evolve across harness behaviors and hosts
- `skills/a2u/` is the canonical home for role-neutral user-communication
  capabilities that co-evolve across harness behaviors and hosts
- install and link distribution should project directly from those skill
  directories into runtime pickup directories such as repo-local `.codex/skills/`
  and `.claude/skills/`, or global `$AGENTS_HOME/skills` or `~/.agents/skills`
  together with `$CLAUDE_CONFIG_DIR/skills` or `~/.claude/skills`

So a system-owned runtime unit is not "internal only".
It is part of the system and still allowed to travel as a standalone runtime
capability.

## Governance Surface Outside Runtime

Everything outside the distributable runtime surface that governs the system
belongs to the governance surface outside runtime.

This includes:

- architecture
- stable semantics and contracts
- promotion authority
- routing authority
- review and quality governance
- maintainer guidance
- migration memory
- non-runtime system boundaries

This is why Bagakit separates:

- `skills/`
  - distributable runtime surface
- governance surfaces outside runtime
  - system governance and evolution control

Stewardship operates across this governance surface, but the governance surface
is larger than the `docs/stewardship/` directory.

Its main durable surfaces include:

- `docs/architecture/`
  - system structure and governance design
- `docs/specs/`
  - stable shared semantics and contracts
- `docs/stewardship/`
  - maintainer-facing operating guidance

The separation is not cosmetic.
It is what lets Bagakit distribute runtime capability without distributing all
maintainer truth together with it.

## Self-Hosting

Self-hosting is not a separate subsystem.

Self-hosting means:

- stewardship treats the canonical Bagakit host repository as a host worth
  observing and improving

This mode matters because the canonical repository produces two kinds of
knowledge at once:

- host or project knowledge
- repository-system evolution knowledge

Self-hosting therefore means stewardship is allowed to learn from the host role
of the canonical repo without collapsing host knowledge and system evolution
memory into one surface.

## Knowledge Boundary In Self-Hosting

When Bagakit runs in its own canonical repository, the same physical repo may
contain both:

- host or project knowledge surfaces
- repository-system evolution memory

Those surfaces must still remain distinct.

The correct relation is:

- `living_knowledge`
  - host or project knowledge substrate
- `evolver`
  - repository-system evidence-to-promotion control plane

The first may provide evidence to the second.
The second does not become a superset of the first.

So the rule is:

- co-location is allowed
- surface collapse is not

Upstream truth still has to land in bounded durable surfaces, not in the full
host-local knowledge field.

Canonical landing surfaces are:

- `docs/specs/`
- `docs/stewardship/`
- `skills/`

## Architectural Implications

This structure implies:

1. `skills/` families, including `skills/harness/`, `skills/a2a/`, and
   `skills/a2u/`, should be treated as the system-owned runtime surface for
   their declared co-evolution boundaries.
2. Architecture, contracts, routing, and promotion authority should stay
   outside runtime payloads unless a specific capability truly requires them.
3. Self-hosting should be discussed under stewardship and governance, not as a
   standalone runtime subsystem.
4. Host evidence discovered during self-hosting still requires routing through:
   - `host`
   - `upstream`
   - `split`

## Non-Goals

This structure does not imply:

- that upstream truth automatically equals all host-local knowledge
- that self-hosting removes the need for routing
- that `evolver` can absorb `living_knowledge` by adding more fields
- that system-owned runtime units stop being independently distributable
