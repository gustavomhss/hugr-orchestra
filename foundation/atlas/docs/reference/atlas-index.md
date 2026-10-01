# atlas-index — Reference

> owner: charlie (FORGE) · grounding: `spec/atlas.md` §3.5, §3.6, §6.1, A-14 + v1's multi-axis dual-Merkle rollup
> (graph-v1 §3) · status: draft

## Purpose

The index is the Atlas's **addressing subsystem** — the hard part. A **content-addressed store (CAS)** where
_every_ object is keyed by its BLAKE3 hash, plus **several hierarchies ("axes")** over that store — each a
Merkle rollup — doing two jobs at once: **drift detection** and **discovery**. It is _not_ one tree: the same
object is reachable by structure, territory, or dependency, each axis rolling up independently. Retrieval is
deterministic — **no embeddings, no RAG, ever**.

## Everything is hashed (universal content-addressing)

Every Atlas object — not just code — is a CAS object keyed by BLAKE3:

```
CAS : hash → object.   object ∈ {
  CodeNode,      // a structural unit (file / item / block)
  GroundedFact,  // a knowledge fact
  MemoryEntry,   // task / pr / project / logbook
  Provenance,    // per-agent metering + dossier
  Transcript,    // the run transcript (in-tree, cred-scanned)
  Doc,           // THE DOCS THEMSELVES — reference / explanation / how-to are Atlas objects
}
```

- **The docs are first-class hashed objects** — grounded to `source@sha` and drift-checked by rosie, like
  any fact. The Atlas indexes its own documentation; the dogfood is literal. Identical content ⇒ identical
  hash ⇒ **dedup + integrity for free** (Bazel-style CAS).

## The axes (multiple hierarchies, each a Merkle rollup)

```
Axis = 'spatial' | 'territory' | 'dependency'          // 'functional' / flows = the NEXT axis (see below)

IndexNode = { axis, level, key, subtreeHash, children: IndexNode[], objects: Hash[] }

Rollup = {
  axis, bucket,        // which axis, which node
  rId:    string,      // BLAKE3 Merkle root over sorted child hashes  — STRUCTURE
  rState: string,      // BLAKE3 root over (hash ‖ status ‖ freshness) — STATE
}
Delta  = { idChanged: boolean, stateChanged: boolean, changedBuckets: string[] }

RetrievalMode = 'scope' | 'dependency' | 'trigger'
```

An object is cross-indexed on every applicable axis but stored **once** in the CAS (see **Composition**).

### Axis 1 — `spatial` (the structural tree · the granularity axis)

- **Levels:** `repo → crate → module → file → item → block`. `item` = a top-level decl (fn / struct /
  trait / class / const / type); `block` = a sub-item unit with its own `subtreeHash` (a method body, a
  match arm, a closure) — the finest anchor a `StructRef` can point at.
- **Derived from:** the file tree + an AST parse; each unit's `subtreeHash` is taken over its **raw source
  slice** (comments and whitespace are NOT stripped — there is no normalizer).
  `$0`-LLM, deterministic, reconstructable. <!-- AMENDED 2026-08-02 (HONESTY-TAPROOT) -->
- **Hangs off it — Knowledge:** `GroundedFact`s anchored by `StructRef` at exactly this node — the primary
  grounding surface ("this fn MUST hold invariant X"). **Memory:** a seat's task/pr memory cross-indexed by
  the structural units it touched ("what did I learn last time I was in `cas.ts`").
- **Rolls up:** `subtreeHash` = BLAKE3 over sorted child hashes; an edit re-hashes only block→file→
  crate→repo. This IS the incremental drift index (INDEX-2/5). A file query rolls up its module + crate
  invariants (INDEX-4).
- **Answers:** **scope** retrieval (mode 1) — "I'm in this path, what's known here and above"; the poke keys
  off entering a spatial scope.

### Axis 2 — `territory` (ownership + criticality overlay · NOT the file tree)

- **Levels:** `project → territory (owner + tier T0/T1/T2) → region`. A **territory** is the atomic unit of
  governance — `{ owner: seat, tier: T0|T1|T2, members: StructRef[] }` — and MAY span files/crates. A
  **region** is a named coherent sub-zone inside a big territory (`cas`, `grounding` in the atlas territory).
- **`territories` manifest (normative schema).** Authored _or generated_ (see below), hashed like any object:

  ```
  Territory = { name, owner: seat, tier: 'T0'|'T1'|'T2', globs: Glob[] }
  Manifest  = { territories: Territory[] }   // declaration order is significant (overlap tiebreak)
  ```

  Globs **MAY overlap**. Ownership is a partition **only after overlap resolution**: each structural unit
  is assigned to exactly one territory by the deterministic rule below, so the _result_ is a partition
  even though the globs are not.

- **Ownership is GENERATED, not hand-authored (anti-CODEOWNERS-rot).** A hand-authored manifest rots like a
  hand-authored CODEOWNERS — it drifts the moment code moves. The manifest is a richer CODEOWNERS, and the
  design already holds the signals to compile it: the **structural graph** + **git-blame authorship**. So
  territory **`owner` SHOULD be generated/reconciled from those signals**, the manifest an **override layer,
  not the sole source** (generated `owner` loses to an explicit override). **`tier` MUST stay
  human-ratified** (no mechanical criticality ground truth); `owner` MAY be generated (INDEX-15).
- **Overlap resolution (deterministic).** For a path matched by ≥2 globs: (1) **longest path-match wins**
  (most specific glob — longest literal prefix / most matched segments); (2) **manifest declaration order**
  is the sole tiebreak (earliest wins). No other signal; byte-identical across rebuilds.
- **Uncovered paths.** A path matched by **no** glob is flagged `uncovered` — a _verdict_, never a silent
  pass. An `uncovered` path **T0-adjacent** (sharing a region/parent with a `T0` member) **defaults to deny**
  until an owner assigns it. Reconciliation against the real spatial tree is data, not a model call.
- **Hangs off it — Knowledge:** tier-scoped, symbol-free rules ("T0: no unbounded alloc"); T0 = human-only
  ratification. **Memory:** which seat owns → whose task/pr/project memory scopes here; `scope=territory`
  Rules surface on entry; logbook entries cross-indexed by territories touched.
- **Rolls up:** `rId` over the member set (ownership shape), `rState` over member states + tier — so "did
  any T0 zone drift?" is a single rollup read.
- **Answers:** governance/**trigger** retrieval — route cold-review to the owner, gate strictness by tier,
  prioritize injection (T0 rules first under the ceiling), "give me everything T0."

### Axis 3 — `dependency` (blast radius · a DAG, not a tree)

- **Structure:** nodes = structural units; edges = `depends-on` (import / call / type-reference). Two
  closures — **forward** (what a node needs) and **reverse** / transpose (what needs it = **blast
  radius**). "Rollup" here is reachability, not a parent chain.
- **Derived from:** a per-language **SCIP indexer** doing semantic name resolution — tree-sitter alone is a
  _parser_, not a name-resolver, so it cannot resolve re-exports, barrels, dynamic dispatch, or DI wiring.
  The backend is **SCIP-primary**: each language ships a **separate installed, version-pinned SCIP binary**
  (`scip-java` / `scip-typescript` / `scip-python` / `rust-analyzer` / `scip-clang` / …). `stack-graphs` is
  **archived (2025-09)** and **LSIF is legacy/deprecated in favor of SCIP** — prior art, **not** backend
  options. `$0`-LLM, deterministic, reconstructable **given that indexer** (not "trivially at any time").
  **Cross-language edges are `unresolved` by construction** — no single-language indexer sees across an FFI
  boundary, a codegen step, or a TS frontend calling a Rust binary; those, and any within-language edge it
  cannot resolve (dynamic dispatch, reflection, runtime wiring), MUST be recorded `unresolved` (INDEX-13).
- **Hangs off it — Knowledge:** contract/interface facts propagating along edges — change a signature and
  every dependent's grounded assumption is suspect. **Memory:** "last time this API changed, N callers broke."
- **Rolls up:** a node's `rState` folds in the `rState` of its forward closure — so if a _dependency_
  drifted, YOUR `rState` flips even though your own bytes did not. This is the axis that catches
  **transitive** drift. The fold is **bounded, never O(blast-radius)** (INDEX-12): a cheap drift dirty-bit
  propagates eagerly across the reverse closure, the `rState` hash is recomputed lazily / on-read, eager
  re-hash **capped at `maxHops=2`**, deeper nodes marked `state-suspect` and resolved only when queried.
- **Answers:** **dependency** retrieval (mode 2) — editing X surfaces facts/memory anchored anywhere in X's
  reverse-closure; bounds re-check to the closure, never `N`.

### The next axis — `functional` / flows (named, not built here)

- **Status: next, not deferred.** The `functional` axis (runtime call-flows / event chains) is the **next
  axis to land**, **not built in this spec** — but its trigger is **not** reactive: the `unresolved`-edge
  ratio is a **per-territory published health metric** on every rollup, with the T0 ceiling
  (`unresolved-edges / total-edges > 15%`) **enforced as a standing gate from day one** (INDEX-16).
- **coChanged auto-fallback (day-one backstop).** A reverse closure flagged `under-approximate` **MUST
  auto-union the node's `coChanged` git-history band** (units that co-changed across history), **labeled
  correlational**, never a static edge — backstopping the worst-covered nodes (DI / reflection / event-bus
  hubs; the convention-coupled blind spot). Reuses a signal already in the design; no model call.
- **Honest caveat.** Until the `functional` axis exists, the `dependency` axis **under-approximates runtime
  coupling** (dynamic-dispatch / event edges invisible statically). The ratio + T0 gate make it _measured
  and enforced_ and the `coChanged` union _backstopped_ — but that band is correlational, so a guarantee is
  only as strong as the static graph plus a labeled band.

### Shared rollup mechanics

- **Dual rollup (v1 graph-v1 §3).** `rId` captures _shape_ (node added / removed / moved); `rState` captures
  _state_ (a status flip or drift). A `Delta` says which changed and where — re-checks are **bounded to the
  changed buckets**, never the whole store. A change re-hashes only the affected leaf→root path **on the
  relevant axis**; unaffected subtrees keep both hashes, so facts anchored there stay FRESH. **The
  dependency axis is the exception to this paragraph** — see INDEX-17.
- **Composition.** One object hangs off all three — its file (spatial), owner+tier (territory), deps
  (dependency). A query picks the axis that fits; the object is never duplicated.

## Invariants

- **INDEX-1 One index, N axes, two jobs.** A single content-addressed index MUST back both drift detection
  and discovery across every axis. There MUST NOT be a separate discovery structure or staleness pass.
- **INDEX-2 Merkle rollup.** Each node's rollup MUST be the BLAKE3 rollup of its children. An edit MUST
  re-hash only the leaf→root path on the affected axis; every unaffected subtree MUST keep its hash.
  (This is the content-committing model; the dependency axis does not participate in it — see INDEX-17.)
- **INDEX-3 Deterministic, mechanical build.** Every axis (structural tree, territory tree, `depends-on`
  graph + blast radius) MUST be mechanically derived from the real file tree / import graph via a
  per-language **SCIP indexer** (SCIP-primary; a separate installed, version-pinned binary per language),
  `$0`-LLM. It MUST NOT depend on a model, and MUST NOT rely on `stack-graphs` (archived 2025-09) or LSIF
  (legacy/deprecated in favor of SCIP) as a backend. The graph MUST be reconstructable **given that indexer**
  — _not_ "trivially at any time": edges it cannot statically resolve, **and every cross-language edge
  (unseeable by any single-language indexer),** MUST be **declared `unresolved`, never guessed** (INDEX-13).
- **INDEX-4 Path resolution & roll-up.** Resolving a `path` MUST return the covering node and roll up the
  hierarchy: a file query MUST also surface its module's and crate's invariants.
- **INDEX-5 The index is the drift oracle.** Because retrieval keys on `subtreeHash`, an entry whose anchor
  hash ≠ current MUST be visible at query time and excluded/flagged. No re-embedding, no separate sweep.
- **INDEX-6 Three retrieval modes only.** Relevance MUST be resolved by exactly **scope (path → spatial)**,
  **dependency (`depends-on` / blast radius)**, and **trigger (tag/pattern)** — all deterministic.
- **INDEX-7 No embeddings / no RAG.** → see spec **A-14**; enforced in atlas-index — no embedding model,
  vector store, or ANN backs the index (the three retrieval modes are INDEX-6).
- **INDEX-8 Deterministic results.** Two identical queries MUST return byte-identical results.
- **INDEX-9 Total.** A malformed / missing path, tag, or axis MUST yield an empty result, never a throw.
- **INDEX-10 Multi-axis.** The index MUST expose ≥3 axes — `spatial`, `territory`, `dependency` — each a
  hierarchy with its own rollup; one object MUST be cross-indexed on all applicable axes, not duplicated.
- **INDEX-11 Universal content-addressing.** EVERY Atlas object — code, knowledge, memory, provenance,
  transcripts, **and the docs** — MUST be a BLAKE3-keyed CAS object, grounded + drift-checked like any fact.
- **INDEX-12 Dual rollup, bounded re-check.** Each axis node MUST carry `rId` (structure) + `rState`
  (status+freshness); a `Delta` MUST distinguish structure from state change and name the changed buckets,
  so a re-check touches only affected buckets, never `N`. The spatial `rId` re-hash MUST be the changed
  leaf→root path only. For the **dependency `rState` fold** the eager re-hash MUST be bounded, never
  O(blast-radius): on an edit a **drift dirty-bit MUST propagate eagerly** across the reverse closure, but
  the `rState` **hash MUST be recomputed lazily / on-read**, **eager re-hash capped at `maxHops=2`** — any
  node deeper MUST be marked `state-suspect` and resolved only when queried.
- **INDEX-13 Unresolved edges are explicit.** The `depends-on` graph MUST record every import/call it cannot
  statically resolve (re-export chains beyond the indexer, dynamic dispatch, reflection, DI / runtime wiring,
  **and every cross-language boundary — FFI, codegen, a TS frontend calling a Rust binary**) as an explicit
  `unresolved` / `dynamic` edge. It MUST NOT silently omit such an edge, MUST NOT fabricate a resolved
  target. A reverse closure over a node with `unresolved` edges in scope MUST be reportable as
  **under-approximate**, and when so flagged MUST **union the node's `coChanged` band, labeled correlational**
  (INDEX-16) — never presented as complete or as static edges.
- **INDEX-14 Territory schema & overlap resolution.** Territory assignment MUST derive from the hashed
  `territories` manifest (`{name, owner, tier, globs}`). Globs MAY overlap; assignment MUST resolve to a
  single `owner`+`tier` per unit by **longest-path-match, then manifest declaration order** — deterministic,
  byte-identical across rebuilds. A path matched by no glob MUST be flagged `uncovered`; a `T0`-adjacent
  `uncovered` path MUST default to deny. Assignment MUST NOT call a model.
- **INDEX-15 Territory ownership is generated + reconciled.** Territory `owner` SHOULD be **generated from
  the structural graph + git-blame authorship** the index already holds, with the manifest as an **override
  layer** (a generated `owner` MUST lose to an explicit override); reconciliation MUST be deterministic and
  `$0`-LLM. `tier` MUST remain **human-ratified** (no mechanical criticality ground truth). The manifest MUST
  NOT be the sole hand-authored ownership source.
- **INDEX-16 Coverage gate is standing, not reactive.** The `unresolved`-edge ratio MUST be a **per-territory
  published health metric** on every rollup, and the T0 ceiling (`unresolved-edges / total-edges > 15%`) MUST
  be enforced as a **standing gate from day one** — crossing it in a T0 territory MUST fail the gate, not
  merely schedule the `functional` axis. (The `coChanged` auto-union backstop is INDEX-13.)
- **INDEX-17 The dependency axis ADDRESSES; it does not COMMIT (#191, closes #98/#189's shared root cause).**
  A dependency-axis node's `subtreeHash` MUST be the identity of its path (`id({file: path})`) and MUST
  carry no content, so INDEX-2's leaf-to-root re-hash model MUST NOT be read as applying to it: the axis
  MUST NOT be treated as a freshness oracle, and an anchor resolved on it MUST NOT be treated as a
  grounding. (Built: `packages/index/src/build.ts` `dependencyAxis`/`nodeHashOfPath`; enforced at the
  freshness door by `packages/grounding/src/drift.ts` `resolveCurrent`, which does not scan this axis.)

## Surface / API

```
resolve(axis, key): IndexNode | undefined      // axis + key → covering node, total
rollup(axis, key): Rollup                        // this node's dual Merkle rollup (INDEX-12)
delta(before, after): Delta                      // which axis buckets changed, structure vs state
byScope(path): Fact[]                            // mode 1 — spatial resolve + hierarchy roll-up
byDependency(path): Fact[]                       // mode 2 — follow depends-on (blast radius)
byTrigger(tag): Fact[]                           // mode 3 — cross-cutting rules attached by match
put(object): Hash                                // content-address ANY object (incl. a Doc), returns its hash
```

- `byScope` / `byDependency` / `byTrigger` are the **only** retrieval paths — no free-text / similarity
  `search(query)` entry point. Every entry point is total: an unresolvable axis/key/tag returns empty.

## Acceptance

1. **INDEX-1 / INDEX-5** — A stale entry (anchor hash ≠ current) is excluded/flagged at query time with no
   separate staleness pass; one index serves both the drift check and the discovery query.
2. **INDEX-2 / INDEX-12** — Editing one block re-hashes only its leaf→root path on the spatial axis; sibling
   subtrees keep both `rId` and `rState`; a `Delta` flags exactly the changed bucket. On the dependency axis
   a hub edit eagerly re-hashes `rState` only within `maxHops=2` and sets a `state-suspect` dirty-bit deeper
   — the deeper `rState` is recomputed only on read, never as an eager O(blast-radius) fold.
3. **INDEX-3** — Rebuild every axis from the file tree / import graph twice ⇒ identical trees; no LLM in the build path.
4. **INDEX-4 / INDEX-10** — `atlas-query` on a file resolves on `spatial`, on a territory on `territory`,
   and a blast-radius query on `dependency` — same object, three axes, never duplicated.
5. **INDEX-6** — Scope, dependency, and trigger each return the expected facts; there is no fourth mode.
6. **INDEX-7 / INDEX-8** — Grep the codebase: no embedding model / vector store / RAG call; two identical
   queries return byte-identical results.
7. **INDEX-11** — `put()` a reference doc ⇒ it is a BLAKE3-keyed CAS object, grounded and drift-checked;
   changing the code it cites flags the doc stale, exactly like a fact.
8. **INDEX-9** — A malformed / missing path, tag, or axis returns an empty result, no throw.
9. **INDEX-13 / INDEX-16** — A dynamic-dispatch / DI call **or a cross-language (FFI / codegen) boundary**
   the SCIP indexer cannot resolve builds a graph with an explicit `unresolved` edge (not omission, not a
   fabricated target); a reverse closure over that node reports itself under-approximate and **auto-unions
   its `coChanged` git-history band, labeled correlational** (never a static edge).
10. **INDEX-14** — A manifest with two **overlapping** globs reconciles to a single owner+tier per unit by
    longest-path-match then declaration order; a path covered by no glob is flagged `uncovered` and, when
    T0-adjacent, defaults to deny; rebuilding twice yields identical assignment.
11. **INDEX-15** — With an empty/partial manifest, territory `owner` is generated from the structural graph
    - git-blame and reconciled deterministically ($0-LLM); an explicit manifest `owner` override wins over
      the generated one; `tier` is never generated (stays human-ratified).
12. **INDEX-16** — A T0 territory whose `unresolved/total` crosses 15% fails the standing coverage gate at
    build time (not deferred to a later axis); the ratio is readable on the territory rollup.
13. **INDEX-17** — Editing a file's content changes its `spatial`-axis `subtreeHash` but leaves its
    `dependency`-axis node's `subtreeHash` byte-identical (it is `asSubtreeHash(id({file: path}))`, a
    constant of the path); an anchor resolved against the dependency axis is never treated as FRESH.
