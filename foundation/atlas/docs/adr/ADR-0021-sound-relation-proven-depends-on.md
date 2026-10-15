# ADR-0021 — Sound relation: a `proven` `depends-on` edge, derived mechanically from the index

**Status:** ACCEPTED — owner-ratified 2026-08-22 (forks F1–F3 + decisions D-a…D-e), implemented over the
#99 sound-relation wave (WP-R0…R8) and finalised here by WP-R8 with the measured results (§Measured results).
Full reasoning: `docs/design/99-sound-relation-design.md` + `docs/design/99-sound-relation-wave.md`.

**Supersedes/relates:** ADR-0015 D2 (the relation family this makes SOUND — it was admitted through the
advisory truth door, `deps.doors.grounded`, never proven); ADR-0017 (the two-seal `proven`/`justified`
vocabulary and the `buildSound` mint this reuses for the relation family); ADR-0016/#231/#232 (the
negation sound-gate pattern this mirrors); #189 (the `isLocalSymbol` global-join soundness fix the
projection depends on); #240 (the read-side reverify trap this closes for relations).

## Context

`#99` — Atlas cannot ground a relation. The relation family (`RelationNode`, `endpointA`/`relationKind`/
`endpointB`) ships **advisory-only**: grounded (aboutness), never **proven**. A `depends-on` edge is
exactly what the code index (SCIP) can prove mechanically, so shipping it as merely advisory leaves the
one relation the index CAN prove unproven — and blocks the #95 benchmark (the owner ruled relation
_primordial_).

## Decision

A `depends-on` relation `A → B` (two **document/unit** endpoints) is admitted **`seal:'proven'`** iff the
index mechanically witnesses a resolved cross-unit reference A→B — i.e. it is a `kind:'resolved'`
`DepEdge`. The **derivation is the proof**, re-runnable on read-back (drift = A2 staleness).

Ratified forks:

- **F1 — mechanical projection, no LLM.** The proven relation is derived from the index's resolved
  edges, not proposed by a model. 0-false by construction; model-independent.
- **F2 — exhaustive** over resolved intra-repo edges (a dependency graph is only useful complete). Bounded
  by a stated budget; over-budget **fails loud** (never a partial set labelled complete).
- **F3 — `depends-on` only is proven.** `calls` is NOT provable from the frozen `ScipOccurrence`
  projection (`ScipSymbolRole = 'definition' | 'reference'`, no call-role) and is deferred to a later
  advisory/justified LLM arm. Honest boundary, explicit + tested.

Locked design decisions:

- **D-a** proven `A→B` supersedes a pre-existing advisory `A→B` (same `relationKey` identity; proven
  strictly stronger; existing SUPERSEDE lineage). No silent duplicate, no downgrade.
- **D-b** N resolved references A→B collapse to exactly one `depends-on A→B` relation (identity).
- **D-c** the projection emits an edge only for two **distinct intra-repo units** (excludes
  external/`node_modules` resolved targets and intra-unit references).
- **D-d** two-layer forgery defense (refined by R4 cold-review): the write door strips a SHAPE-forged
  proven relation (witness missing/malformed/`calls`); a shape-valid-but-false witness (the door has no
  oracle) is caught at read-side reverify (WP-R5/#240), which re-runs the oracle. The two layers together
  guarantee no forged proven survives end-to-end.
- **D-e** the relation **unit granularity is the document (`docHash = nodeHashOfPath`)**, per the resolved
  `DepEdge` endpoints. The sound `depends-on` is file→file; a finer symbol-level relation is a separate
  future family.

The `proven` relation carries a `RelationWitness` (`packages/knowledge/src/types.ts`) — the proven
`relationKind`, the witnessing global symbol under `endpointB`, and `endpointA`'s verify-scope — so
read-side reverify re-runs `verifyDependency(sourceScope, target)` over the current index and re-proves
iff the edge still exists (else `broken`); a witness-less `proven` relation is `unverifiable` (#240 closed
for the relation family).

## Acceptance

The 30-item acceptance suite (3 cold-critic rounds) in `docs/design/99-sound-relation-wave.md` §1. This
ADR is finalised to ACCEPTED by WP-R8 once every item is red→green and the honesty-ledger non-behaviors
(`calls`/dynamic/reflection/cross-language) are pinned.

## Measured results (WP-R8, 2026-08-22)

The wave shipped **`atlas derive-relations`** (arity 0, repo = cwd): it enumerates the index's resolved
cross-unit references, proves + seals each `depends-on` edge through the sound oracle, and persists every
proven relation through the governed emit door. `atlas relations <unit>` reads them back both directions
(seal surfaced), `atlas node <addr>` shows seal + witness, `atlas verify-store` re-proves them.

- **Exhaustive projection over the real Atlas index.** Run against the main repo's own SCIP index
  (**677 documents**), the projection derives **5126 distinct intra-repo `depends-on` edges** — one per
  distinct directed cross-unit document pair, deduped (D-b) and cross-unit-only (D-c/D-e). This edge count
  is **VERIFIED EXACT by cold review**. F2 (exhaustive) holds: no resolved intra-repo edge is dropped and
  over-budget **fails loud** (AR-30), never a partial set labelled complete.
- **Timing is NOT a claimed measurement.** A self-report of ~412ms was **not independently reproduced**; a
  cold run measured ~2.9s including the symbol-reverse index build. The cost is dominated by the one-time
  index build and varies with it — treat any single figure as _unverified_. The soundness/exactness claims
  above stand on their own; timing does not gate them.
- **Two-layer D-d (write-door strip + read-side re-derivation).** The governed write door strips a
  SHAPE-forged proven relation (witness missing / malformed / non-provable `calls` kind) at admission; a
  shape-valid-but-false witness (the door has no oracle) is caught at read-side reverify (`reverify-store.ts`,
  #240), which re-runs the oracle. Neither layer alone is D-d; the two together guarantee no forged proven
  survives end-to-end.
- **The cold-review-caught soundness fix (2026-08-22, `1984590`).** The oracle now binds **BOTH endpoints
  at file granularity**: `endpointA ∈ reverseCallers(target)` AND `endpointB === definesAt(target)`. Before
  the fix, a well-formed witness bolted onto an unrelated true edge could survive replay; after it, a forged
  endpoint pair reads `broken`, not `re-proven` (the read-side D-d teeth).
- **Acceptance: all 30 items green** (`AR-1..AR-30`), none vacuous — `AR-18` is the explicit anti-vacuous
  teeth (a specific expected proven pair must be present, so "exhaustive" cannot pass by proving nothing).
  The e2e black-box story (AR-14, `e2e-blackbox/test/s37-sound-relation.blackbox.test.ts`) drives the
  shipped binaries as a subprocess through the full flow incl. the drift → `broken` contrast.

### The honest boundary (F3 — documented, tested, not a silent gap)

`depends-on` is proven **only at document granularity** and **only** for a witnessed cross-unit reference.
The index cannot prove — so the projection abstains on (never a proven seal), each pinned in the honesty
ledger (`docs/design/e2e-coverage-matrix.md`) and tested:

- **`calls` is NOT provable.** The frozen `ScipSymbolRole` projection is `'definition' | 'reference'` — no
  call-role. A "reference" (import / type position / use) is all SCIP gives; `calls` (A's body _invokes_ B)
  cannot be distinguished from it. `calls` ships advisory/justified via a later LLM arm, never `proven`.
- **Dynamic dispatch / reflection / cross-language / FFI** resolve to `unresolved`/`dynamic` edges
  (`to: null`) — they abstain, never a proven relation.
- **No refute.** An absent edge is abstained, never a "these do not depend" fact (negation is the separate
  #99b family for closeable-world absence).
