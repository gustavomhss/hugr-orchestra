# Atlas — architecture & navigation

Atlas is a git-native, content-addressed **knowledge layer** for a codebase: it answers _what is true
about this code, and is it still true?_ deterministically — no embeddings, no RAG. This document is the
map: the module graph, where things live, and the invariants that hold across the whole tree.

## The package graph (dependencies point downward only)

Fifteen packages (nine core layers + the productization ring), one domain each, in a strict layered DAG. A package may import only from packages **below**
it; nothing ever imports upward. `@atlas/e2e` sits above everything as a pure consumer.

```
                          contracts          L0  shared vocabulary (pure types, zero logic)
                              │
                           kernel            L1  sealed identity: hashing · CAS · event-fold
                          ┌───┴───┐
                       persist   index       L2  durability / provenance   ·   structural index
                              │
                          grounding          L3  the truth primitive: grounding + drift oracle + gate
                              │
                          knowledge          L4  fact lifecycle: emit · reconcile · write-gov · ratify
                              │
                          retrieval          L5  bounded context assembly (packs, budgets, ceilings)
                              │
                           memory            L6  per-seat scoped memory (≠ knowledge)
                              │
                            tools            L7  the governed public surface (5 governed tools · 2 write doors — ADR-0003)
                              │
                          genesis            L8  cold-start miner ($0-LLM seed → grounded proposals)

                            e2e              —   story-driven end-to-end suite (imports all; imported by none)
```

## What each package owns

| Package       | Owns                                                                                                                                                                                                                                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **contracts** | The layer-0 vocabulary every package shares — `Hash`, `SubtreeHash`, `StructRef`, `Tier`, `Territory`, `Status`, `Pack`, `Tool`. Pure types, no runtime.                                                                                                                                                         |
| **kernel**    | The **sealed identity seam**. `id`/`canonicalForm` (BLAKE3 content address), the one CAS `createStore`, the event-log `fold`/`merge`/`head`. _All hashing in Atlas goes through here — no package computes its own digest._                                                                                      |
| **index**     | The `$0-LLM` structural index: `build(tree, scip)` → three axis-views (spatial · territory · dependency), Merkle `rollup`, dependency **blast-radius** (reverse closure), the standing T0 coverage gate, and the CAS-of-objects.                                                                                 |
| **persist**   | The durable side: provenance dossiers, secret **scrub**, metering, the transcript store, the git-notes host-adapter, and read-only version-delta **diff**.                                                                                                                                                       |
| **grounding** | The **trust primitive**: a fact is grounded iff anchored to a real structural unit; the drift oracle is subtreeHash equality (`FRESH`/`DRIFTED`, never line ranges); the **truth-gate** HOLDS only when _grounded ∧ FRESH_ (fail-closed).                                                                        |
| **knowledge** | The fact **lifecycle** (see sub-domains below): grounded emit, status recompute, drift reconcile, write-routing (every write an upsert), template/authz gates, tier + T0 ratification, fastpath, hits ledger.                                                                                                    |
| **retrieval** | **Bounded context assembly**: deterministic `relate()` over the axes, the ~2K-token bounded pack (T0-then-T1 by rank), `own_<unit>`, the injection-ceiling drop-order (two pins never drop, stale-not-trusted), hits-tuned caps.                                                                                 |
| **memory**    | Per-seat **scoped** memory, held distinct from Knowledge by a fail-closed partition; inject-only-own, the Rules slab (top-12 by frecency, evict-never-delete), templated writes, the orchestrator logbook, Awareness/Orientation slabs.                                                                          |
| **tools**     | The **governed public surface**: one pure+total handler over the governed surface (`atlas-init/query/emit/reconcile/link`) with two governed write doors (`atlas-emit`, `atlas-link` — ADR-0003), tri-transport addressability (MCP · poke · CLI, byte-identical, CLI-floor), read-only doctor/diff projections. |
| **genesis**   | The one-time **cold-start miner**: deterministic `$0-LLM` S0/S1 (scan + integer fixed-point PPR rank), budgeted grounded proposal (2-door + WhyNot), mechanical admission (teeth / vacuous-drop), candidate-only writes + one batched ratification pass, seed, resume/checkpoint, governed deepening loops.      |

`knowledge` is the one package large enough to group internally, by domain:
`src/lifecycle/` (emit · status · reconcile · freshness · produce · evaluator · hits) ·
`src/write/` (router · template · authz · archive) ·
`src/ratify/` (init · tier · ratify · fastpath).

## Where things live (per-package layout)

Every package is the same shape — no surprises:

```
packages/<name>/
  package.json        deps + the public "exports" entry
  tsconfig.json       composite project reference; include: ["src"]
  src/
    index.ts          the ONE public barrel = the package's public API surface
    types.ts          the shared data model + any cross-file / public interface
    <concept>.ts      one domain concept per file — its interface co-located with its implementation
  test/
    *.test.ts         goldens + held-out + property tests
```

**Conventions (SOTA colocation):**

- **Types live with their implementation.** A file's interface sits at the top of the same file that
  implements it. There is no separate `ref/` interface tree (it was dissolved). An interface shared by
  two or more files, or one with no local implementation, lives in `src/types.ts`.
- **One public barrel per package.** `src/index.ts` is the only barrel; import across packages from the
  bare package root (`@atlas/kernel`), never from a deep path. There are no intermediate per-folder barrels.
- **The file name predicts the contents.** One domain concept per file, named for the concept.
- **Functional, factory-style.** Behavior lives in exported functions and `createX()` / `bindX()`
  factories — not classes (the only two classes in the tree are error types).

## Invariants that hold everywhere

- **Downward-only imports.** The DAG above is enforced by TypeScript project references; a package never
  imports one above it.
- **Hashing only through `@atlas/kernel`.** No package rolls its own digest; identity is always the sealed
  `id` / `canonicalForm` seam.
- **Governed write doors.** Every write flows through a governed door — `atlas-emit` (grounded facts) or `atlas-link` (sameAs), each enforcing authz + a ratifier and failing closed visibly (ADR-0003); reads carry no write authority.
- **Grounded or nothing.** A fact is served as truth only while _grounded ∧ FRESH_; the gate fails closed.
- **Knowledge ≠ Memory.** Knowledge is shared and project-level (edited/superseded, never blind-append);
  Memory is per-seat and scoped. A conflation between them fails closed.
- **`≤ 400` LOC per source file**, enforced by `harness/gates/godfile-guard.mjs` in CI.

## The harness is not the product

`harness/` (CI gates) and `docs/` (the frozen decomposition method + requirements + WP cards) are the
_build machinery_, kept separate from the Atlas product and destined for the Orchestra orchestrator repo.
The product (`packages/*`) never imports the harness.

## Build & test

```
npm ci
npm run build          # tsc -b across the project-reference graph
npm test               # vitest run — the full suite
npm run godfile-guard  # the ≤400-LOC gate
```
