# ADR-0006 — the layer hierarchy is machine-checked; the tool surface is derived and budgeted

- **Status:** Accepted (2026-07-25) for the exposure amendment (§Decision 2, owner-ratified); **Proposed**
  for the hierarchy clauses (§Decision 1), pending the DEFINE seat.
- **Owner-authorized:** yes, for Decision 2 — when three cold reviews showed the "exactly five tools" rule
  blocking the owner's own both-transports requirement, the owner was asked whether the count should be
  replaced by the property and answered _"te do ok em relacao a regra"_ (2026-07-25).
- **Spec author:** lead, grounded against `master` @ `000b6ac` + the lucy / bobby / billy cold reviews.
- **Amends:** **INV-MCP-1** (`reference/atlas-adapters.md#mcp-1`) and its `REQ-MCP-1a` / `REQ-MCP-1b`
  (`requirements-adapters.md`).
- **Introduces:** `ARCH-1..12` (`reference/atlas-architecture.md`), `harness/gates/layer-guard.mjs`.
- **Does NOT amend:** INV-TOOLS-1 / ADR-0003. `GOVERNANCE_SURFACE` stays 5; `WRITE_PATHS` stays 2.

## Context

Three independent cold reviews of CAMPAIGN-10 converged on one root cause from three directions:

- **lucy** — the tool-exposure rule exists in two places and they contradict: `INV-MCP-1` says _"the MCP
  stdio server MUST publish exactly the five governed tools"_, with a `REQ-MCP-1b` literally titled _"no
  sixth tool"_, while the new `INV-MCP-3` requires publishing a union of twelve. The new register's
  completeness table claimed "zero unresolved contradiction with a ratified invariant" — a check scoped to
  the one invariant that was _not_ in conflict.
- **bobby** — the campaign was cut as if `adapter-io` were upstream of `tools`. It is the reverse
  (`packages/tools` has no dependency on `adapter-io`; `adapter-io` depends on `tools`), so two of the five
  seam-freezes were unbuildable as carded. Separately, **no WP named `packages/adapter-io/src/wire.ts`** —
  the one site where a tool becomes reachable — so all four new doors would have been built and never bound.
- **billy** — `callTool` dispatches on `legs[tool]` with no membership check against the advertised list, so
  "advertised" and "invocable" have always been two independently-maintained sets that merely happen to
  coincide today.

None of these is a mistake in a document. They are the symptoms of a **hierarchy and an exposure model that
were never written down**, and were therefore inferred — differently — by each artifact that needed them.

The count itself has the same shape as a rule this project already amended once. ADR-0003 replaced
INV-TOOLS-1's "exactly four" with a property, on the explicit reasoning that _"the count was the accidental
part of INV-TOOLS-1; the governance property is the essential part."_ `INV-MCP-1`'s own text shows the same:
its stated purpose is that every call route through the shared `WiredHandler` _"so an MCP call and the
equivalent CLI call return contract-identical verdicts"_ — the five was the mechanism available when there
were five legs, not the goal.

## Decision 1 — the hierarchy is explicit and machine-checked

Ports are declared in the layer that **consumes** them; adapters implement them **outward**; dependencies
flow outer→inner only; the graph is acyclic; `@atlas/tools` never depends on `adapter-io` / `cli` /
`mcp-server` (`ARCH-1`, `ARCH-2`). There is exactly one composition root, and every work package that
introduces a tool must name it (`ARCH-3`).

This is not new architecture — it is the architecture the repo _already has_, written down. `TruthGate`,
`DoctorSource`, `T0Heuristic` and `NodeSource` are already ports declared in `tools` and implemented in
`adapter-io`. The defect was that nothing recorded the rule, so a 16-card campaign inverted it.

**And it is enforced by a fitness function, not by review** (`ARCH-4`) — `harness/gates/layer-guard.mjs`,
in CI beside `godfile-guard` and `spec-conformance-guard`. Mutation-tested at authoring time: a planted
`tools → adapter-io` edge, a planted cycle, and a planted unbound leg are each caught and named, exit 1.

## Decision 2 — the surface is DERIVED and BUDGETED, not counted _(owner-ratified)_

`INV-MCP-1`'s "exactly five" is superseded by two properties and one measured bound:

- **`ARCH-5` — one closed union, both surfaces derived from it:** `advertised ≡ invocable ≡ Tool`, provably,
  rather than two lists maintained in parallel.
- **`ARCH-6` — every tool declares its authority class:** `Tool` partitions, totally and disjointly, into
  `GOVERNANCE_SURFACE` (with `WRITE_PATHS` as its write subset) and `READ_SURFACE` (zero write authority).
- **`ARCH-7` — a measured budget of 30**, not an invented number. The state of the art reports
  tool-selection accuracy holding above ~90% up to roughly 30 candidate tools and degrading sharply beyond
  30–50 (with observed drops of 95% → 71% when a single large catalog is loaded), and schema cost of ~42k
  tokens for one production server's definitions alone. The surface after CAMPAIGN-10 is **12** — inside the
  budget, which is precisely why the amendment is safe.
- **`ARCH-8` — growth goes to progressive disclosure, not to the catalog.** This product already specified
  the correct pattern and ratified it for a different surface: `spec/atlas.md` §6.2 requires node-tools to
  be projected per scope and retracted on leaving, because _"exposing the whole graph as tools at once would
  flood the context with schemas and is forbidden."_ Anything that scales with the repository uses that
  mechanism; the governance + read core stays a small static set.

## Why this preserves what INV-MCP-1 protected

MCP-1's guarantee was **CLI≡MCP contract identity via the one shared handler**, and nothing here weakens it:
every advertised tool still routes through `WiredHandler` and still publishes a schema owned by
`handler.schema(tool)`. What changes is that the guarantee is now stated as the property it always was, and
`ARCH-5` makes it _stronger_ than before by closing the advertised-vs-invocable gap that existed under the
old rule and that the old rule could not see.

## Rejected alternatives

**(a) Keep "exactly five".** Rejected by the owner. It blocks the both-transports requirement outright, and
it would have kept `doctor`/`node`/`diff` CLI-only — an asymmetry that predates this work.

**(b) Replace the count with no bound at all.** Rejected. The tool-overload evidence is real and measurable;
dropping the number entirely trades a wrong constraint for no constraint. `ARCH-7` keeps a bound and makes it
_grounded_ rather than arbitrary.

**(c) Raise the count to twelve.** Rejected — that repeats the original error one number later. The next
door would face the same false question.

**(d) Enforce the hierarchy by review / by convention.** Rejected. The hierarchy _was_ the convention, and a
16-card campaign inverted it anyway without anyone noticing until a cold review read `package.json`. A rule
that cannot fail a build is not a rule.

## Consequences

- `INV-MCP-1` clause 1 and `REQ-MCP-1a` / `REQ-MCP-1b` are **superseded** and must be rewritten to the
  derived-surface property; `reference/atlas-adapters.md#mcp-1` is amended in place, exactly as ADR-0003
  amended `atlas-tools.md`. CAMPAIGN-10's `INV-MCP-3` becomes consistent rather than contradictory.
- CI gains a fifth gate. `layer-guard` currently reports: **15 packages, acyclic, 0 layer inversions,
  surface 5/30, advertised ≡ invocable.**
- CAMPAIGN-10's seam ownership is corrected by construction: `GroundingComputer` and `GateChain` are
  **ports in `tools`**, implemented in `adapter-io`; `WP-10.A1.TOOLS` freezes them and `WP-10.A1.ADAPTER`
  consumes. The campaign's dependency edges and its "A1.ADAPTER blocks everything" preamble invert
  accordingly.
- A sixth seam is added for leg registration at the composition root, and `wire.ts` enters the edit surface
  of every WP that introduces a door.
- **`READ_SURFACE` does not exist yet.** The gate treats it as empty, so every check holds today and
  tightens automatically the moment CAMPAIGN-10.3 lands the constant — no follow-up edit to the gate.
- **Not resolved here:** the authority model (`ARCH-9..12`) — the reproduced `tier` confused-deputy, the
  UPDATE-lowers-authority hole, and the object-capability port for planner legs. Those are governance
  changes on shipped code, tracked as `ARCH-D3` / `ARCH-D4` and requiring their own ADR and owner
  ratification. This ADR deliberately does not smuggle them in.
