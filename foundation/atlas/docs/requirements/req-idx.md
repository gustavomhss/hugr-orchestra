# Requirements — Block IDX (index) · S1 lift-and-tag

### REQ-INDEX-1a — one index backs both jobs

source: INV-INDEX-1 @ reference/atlas-index.md#index-1
The index shall back both drift detection and discovery across every axis with a single content-addressed index.
normative-clause: "A single content-addressed index MUST back both drift detection and discovery across every axis"

### REQ-INDEX-1b — no separate discovery or sweep

source: INV-INDEX-1 @ reference/atlas-index.md#index-1
The index shall maintain no separate discovery structure and no separate staleness pass.
normative-clause: "There MUST NOT be a separate discovery structure or staleness pass"

### REQ-INDEX-2a — rollup is BLAKE3 of children

source: INV-INDEX-2 @ reference/atlas-index.md#index-2
The index shall compute each node's rollup as the BLAKE3 rollup of its children.
normative-clause: "Each node's rollup MUST be the BLAKE3 rollup of its children"

### REQ-INDEX-2b — edit re-hashes leaf→root only

source: INV-INDEX-2 @ reference/atlas-index.md#index-2
When an edit occurs, the index shall re-hash only the leaf→root path on the affected axis.
normative-clause: "An edit MUST re-hash only the leaf→root path on the affected axis"

### REQ-INDEX-2c — unaffected subtrees keep their hash

source: INV-INDEX-2 @ reference/atlas-index.md#index-2
When an edit occurs, the index shall keep every unaffected subtree's hash unchanged.
normative-clause: "every unaffected subtree MUST keep its hash"

### REQ-INDEX-3a — mechanical SCIP-derived build

source: INV-INDEX-3 @ reference/atlas-index.md#index-3
The index shall mechanically derive every axis from the real file tree / import graph via a per-language SCIP indexer with zero LLM.
normative-clause: "Every axis (structural tree, territory tree, `depends-on` graph + blast radius) MUST be mechanically derived from the real file tree / import graph via a per-language **SCIP indexer** (SCIP-primary; a separate installed, version-pinned binary per language), `$0`-LLM"

### REQ-INDEX-3b — build depends on no model

source: INV-INDEX-3 @ reference/atlas-index.md#index-3
The index shall not depend on a model.
normative-clause: "It MUST NOT depend on a model"

### REQ-INDEX-3c — no stack-graphs or LSIF backend

source: INV-INDEX-3 @ reference/atlas-index.md#index-3
The index shall not rely on stack-graphs or LSIF as a backend.
normative-clause: "MUST NOT rely on `stack-graphs` (archived 2025-09) or LSIF (legacy/deprecated in favor of SCIP) as a backend"

### REQ-INDEX-3d — graph reconstructable given indexer

source: INV-INDEX-3 @ reference/atlas-index.md#index-3
The index shall keep the graph reconstructable given that indexer.
normative-clause: "The graph MUST be reconstructable **given that indexer**"

### REQ-INDEX-3e — unresolvable edges declared, never guessed

source: INV-INDEX-3 @ reference/atlas-index.md#index-3
If an edge cannot be statically resolved or crosses a language boundary, then the index shall declare it unresolved rather than guess.
normative-clause: "edges it cannot statically resolve, **and every cross-language edge (unseeable by any single-language indexer),** MUST be **declared `unresolved`, never guessed**"

### REQ-INDEX-4a — resolve returns covering node

source: INV-INDEX-4 @ reference/atlas-index.md#index-4
When a path is resolved, the index shall return the covering node.
normative-clause: "Resolving a `path` MUST return the covering node"

### REQ-INDEX-4b — file query rolls up hierarchy

source: INV-INDEX-4 @ reference/atlas-index.md#index-4
When a file is queried, the index shall also surface its module's and crate's invariants.
normative-clause: "a file query MUST also surface its module's and crate's invariants"

### REQ-INDEX-5a — stale entry visible at query time

source: INV-INDEX-5 @ reference/atlas-index.md#index-5
If an entry's anchor hash is not equal to current, then the index shall make that entry visible at query time.
normative-clause: "an entry whose anchor hash ≠ current MUST be visible at query time"

### REQ-INDEX-5b — stale entry excluded or flagged

source: INV-INDEX-5 @ reference/atlas-index.md#index-5
If an entry's anchor hash is not equal to current, then the index shall exclude or flag that entry.
normative-clause: "excluded/flagged"

### REQ-INDEX-5c — no re-embedding, no separate sweep

source: INV-INDEX-5 @ reference/atlas-index.md#index-5
The index shall perform no re-embedding and no separate sweep to detect drift.
normative-clause: "No re-embedding, no separate sweep"

### REQ-INDEX-6a — exactly three retrieval modes

source: INV-INDEX-6 @ reference/atlas-index.md#index-6
The index shall resolve relevance by exactly scope, dependency, and trigger.
normative-clause: "Relevance MUST be resolved by exactly **scope (path → spatial)**, **dependency (`depends-on` / blast radius)**, and **trigger (tag/pattern)**"

### REQ-INDEX-6b — no fourth mode

source: INV-INDEX-6 @ reference/atlas-index.md#index-6
If relevance is requested through any mode other than scope, dependency, or trigger, then the index shall not resolve it.
normative-clause: "Relevance MUST be resolved by exactly **scope (path → spatial)**, **dependency (`depends-on` / blast radius)**, and **trigger (tag/pattern)**"

### REQ-INDEX-7a — no embeddings, vector store, or ANN

source: INV-INDEX-7 @ reference/atlas-index.md#index-7
The index shall be backed by no embedding model, vector store, or ANN.
normative-clause: "no embedding model, vector store, or ANN backs the index"

### REQ-INDEX-8a — identical queries byte-identical results

source: INV-INDEX-8 @ reference/atlas-index.md#index-8
When two identical queries are issued, the index shall return byte-identical results.
normative-clause: "Two identical queries MUST return byte-identical results"

### REQ-INDEX-9a — malformed input yields empty result

source: INV-INDEX-9 @ reference/atlas-index.md#index-9
If a path, tag, or axis is malformed or missing, then the index shall yield an empty result.
normative-clause: "A malformed / missing path, tag, or axis MUST yield an empty result"

### REQ-INDEX-9b — malformed input never throws

source: INV-INDEX-9 @ reference/atlas-index.md#index-9
If a path, tag, or axis is malformed or missing, then the index shall not throw.
normative-clause: "never a throw"

### REQ-INDEX-10a — expose at least three axes

source: INV-INDEX-10 @ reference/atlas-index.md#index-10
The index shall expose at least three axes — spatial, territory, and dependency — each a hierarchy with its own rollup.
normative-clause: "The index MUST expose ≥3 axes — `spatial`, `territory`, `dependency` — each a hierarchy with its own rollup"

### REQ-INDEX-10b — cross-index on all applicable axes

source: INV-INDEX-10 @ reference/atlas-index.md#index-10
The index shall cross-index one object on all applicable axes.
normative-clause: "one object MUST be cross-indexed on all applicable axes"

### REQ-INDEX-10c — object never duplicated

source: INV-INDEX-10 @ reference/atlas-index.md#index-10
The index shall not duplicate an object across axes.
normative-clause: "not duplicated"

### REQ-INDEX-11a — every object is BLAKE3 CAS

source: INV-INDEX-11 @ reference/atlas-index.md#index-11
The index shall make every Atlas object a BLAKE3-keyed CAS object.
normative-clause: "EVERY Atlas object — code, knowledge, memory, provenance, transcripts, **and the docs** — MUST be a BLAKE3-keyed CAS object"

### REQ-INDEX-11b — every object grounded and drift-checked

source: INV-INDEX-11 @ reference/atlas-index.md#index-11
The index shall ground and drift-check every Atlas object like any fact.
normative-clause: "grounded + drift-checked like any fact"

### REQ-INDEX-12a — each node carries rId and rState

source: INV-INDEX-12 @ reference/atlas-index.md#index-12
The index shall have each axis node carry rId for structure and rState for status and freshness.
normative-clause: "Each axis node MUST carry `rId` (structure) + `rState` (status+freshness)"

### REQ-INDEX-12b — Delta distinguishes structure from state

source: INV-INDEX-12 @ reference/atlas-index.md#index-12
The index shall have a Delta distinguish a structure change from a state change.
normative-clause: "a `Delta` MUST distinguish structure from state change"

### REQ-INDEX-12c — Delta names changed buckets

source: INV-INDEX-12 @ reference/atlas-index.md#index-12
The index shall have a Delta name the changed buckets.
normative-clause: "name the changed buckets"

### REQ-INDEX-12d — re-check touches only affected buckets

source: INV-INDEX-12 @ reference/atlas-index.md#index-12
When re-checking, the index shall touch only affected buckets, never N.
normative-clause: "a re-check touches only affected buckets, never `N`"

### REQ-INDEX-12e — spatial rId re-hash is leaf→root only

source: INV-INDEX-12 @ reference/atlas-index.md#index-12
When the spatial rId is re-hashed, the index shall re-hash the changed leaf→root path only.
normative-clause: "The spatial `rId` re-hash MUST be the changed leaf→root path only"

### REQ-INDEX-12f — dependency fold eager re-hash bounded

source: INV-INDEX-12 @ reference/atlas-index.md#index-12
On the dependency rState fold, the index shall keep the eager re-hash bounded, never O(blast-radius).
normative-clause: "For the **dependency `rState` fold** the eager re-hash MUST be bounded, never O(blast-radius)"

### REQ-INDEX-12g — edit propagates drift dirty-bit eagerly

source: INV-INDEX-12 @ reference/atlas-index.md#index-12
When an edit occurs, the index shall propagate a drift dirty-bit eagerly across the reverse closure.
normative-clause: "on an edit a **drift dirty-bit MUST propagate eagerly** across the reverse closure"

### REQ-INDEX-12h — rState hash recomputed lazily on-read

source: INV-INDEX-12 @ reference/atlas-index.md#index-12
The index shall recompute the rState hash lazily on-read.
normative-clause: "the `rState` **hash MUST be recomputed lazily / on-read**"

### REQ-INDEX-12i — eager re-hash capped at maxHops=2

source: INV-INDEX-12 @ reference/atlas-index.md#index-12
The index shall cap the eager re-hash at maxHops=2.
normative-clause: "**eager re-hash capped at `maxHops=2`**"

### REQ-INDEX-12j — deeper node marked state-suspect

source: INV-INDEX-12 @ reference/atlas-index.md#index-12
If a node lies deeper than maxHops=2 on the dependency fold, then the index shall mark it state-suspect.
normative-clause: "any node deeper MUST be marked `state-suspect`"

### REQ-INDEX-12k — state-suspect resolved only on query

source: INV-INDEX-12 @ reference/atlas-index.md#index-12
If a node is marked state-suspect, then the index shall resolve it only when queried.
normative-clause: "resolved only when queried"

### REQ-INDEX-13a — record unresolvable edges explicitly

source: INV-INDEX-13 @ reference/atlas-index.md#index-13
The index shall record every unresolvable import or call, including every cross-language boundary, as an explicit unresolved or dynamic edge.
normative-clause: "The `depends-on` graph MUST record every import/call it cannot statically resolve (re-export chains beyond the indexer, dynamic dispatch, reflection, DI / runtime wiring, **and every cross-language boundary — FFI, codegen, a TS frontend calling a Rust binary**) as an explicit `unresolved` / `dynamic` edge"

### REQ-INDEX-13b — never silently omit an edge

source: INV-INDEX-13 @ reference/atlas-index.md#index-13
The index shall not silently omit such an edge.
normative-clause: "It MUST NOT silently omit such an edge"

### REQ-INDEX-13c — never fabricate a resolved target

source: INV-INDEX-13 @ reference/atlas-index.md#index-13
The index shall not fabricate a resolved target.
normative-clause: "MUST NOT fabricate a resolved target"

### REQ-INDEX-13d — closure reported under-approximate

source: INV-INDEX-13 @ reference/atlas-index.md#index-13
If a reverse closure covers a node with unresolved edges in scope, then the index shall report the closure as under-approximate.
normative-clause: "A reverse closure over a node with `unresolved` edges in scope MUST be reportable as **under-approximate**"

### REQ-INDEX-13e — under-approximate closure unions coChanged

source: INV-INDEX-13 @ reference/atlas-index.md#index-13
When a reverse closure is flagged under-approximate, the index shall union the node's coChanged band, labeled correlational.
normative-clause: "when so flagged MUST **union the node's `coChanged` band, labeled correlational**"

### REQ-INDEX-13f — never presented as complete or static

source: INV-INDEX-13 @ reference/atlas-index.md#index-13
The index shall not present an under-approximate closure as complete or as static edges.
normative-clause: "never presented as complete or as static edges"

### REQ-INDEX-14a — assignment derives from hashed manifest

source: INV-INDEX-14 @ reference/atlas-index.md#index-14
The index shall derive territory assignment from the hashed territories manifest.
normative-clause: "Territory assignment MUST derive from the hashed `territories` manifest (`{name, owner, tier, globs}`)"

### REQ-INDEX-14b — overlap resolves deterministically

source: INV-INDEX-14 @ reference/atlas-index.md#index-14
If a unit's path is matched by two or more overlapping globs, then the index shall resolve it to a single owner and tier by longest-path-match, then manifest declaration order.
normative-clause: "assignment MUST resolve to a single `owner`+`tier` per unit by **longest-path-match, then manifest declaration order**"

### REQ-INDEX-14c — assignment byte-identical across rebuilds

source: INV-INDEX-14 @ reference/atlas-index.md#index-14
The index shall make territory assignment deterministic and byte-identical across rebuilds.
normative-clause: "deterministic, byte-identical across rebuilds"

### REQ-INDEX-14d — unmatched path flagged uncovered

source: INV-INDEX-14 @ reference/atlas-index.md#index-14
If a path is matched by no glob, then the index shall flag it uncovered.
normative-clause: "A path matched by no glob MUST be flagged `uncovered`"

### REQ-INDEX-14e — T0-adjacent uncovered defaults to deny

source: INV-INDEX-14 @ reference/atlas-index.md#index-14
If an uncovered path is T0-adjacent, then the index shall default it to deny.
normative-clause: "a `T0`-adjacent `uncovered` path MUST default to deny"

### REQ-INDEX-14f — assignment calls no model

source: INV-INDEX-14 @ reference/atlas-index.md#index-14
The index shall not call a model for territory assignment.
normative-clause: "Assignment MUST NOT call a model"

### REQ-INDEX-15a — owner generated from graph and blame

source: INV-INDEX-15 @ reference/atlas-index.md#index-15
Where territory-owner generation is enabled, the index shall generate territory owner from the structural graph and git-blame authorship.
normative-clause: "Territory `owner` SHOULD be **generated from the structural graph + git-blame authorship** the index already holds"

### REQ-INDEX-15b — explicit override beats generated owner

source: INV-INDEX-15 @ reference/atlas-index.md#index-15
If a generated owner conflicts with an explicit manifest override, then the index shall let the override win.
normative-clause: "a generated `owner` MUST lose to an explicit override"

### REQ-INDEX-15c — reconciliation deterministic and zero-LLM

source: INV-INDEX-15 @ reference/atlas-index.md#index-15
The index shall make ownership reconciliation deterministic and zero LLM.
normative-clause: "reconciliation MUST be deterministic and `$0`-LLM"

### REQ-INDEX-15d — tier stays human-ratified

source: INV-INDEX-15 @ reference/atlas-index.md#index-15
The index shall keep tier human-ratified.
normative-clause: "`tier` MUST remain **human-ratified** (no mechanical criticality ground truth)"

### REQ-INDEX-15e — manifest not sole ownership source

source: INV-INDEX-15 @ reference/atlas-index.md#index-15
The index shall not treat the manifest as the sole hand-authored ownership source.
normative-clause: "The manifest MUST NOT be the sole hand-authored ownership source"

### REQ-INDEX-16a — publish unresolved-edge ratio per territory

source: INV-INDEX-16 @ reference/atlas-index.md#index-16
On every rollup, the index shall publish the unresolved-edge ratio as a per-territory health metric.
normative-clause: "The `unresolved`-edge ratio MUST be a **per-territory published health metric** on every rollup"

### REQ-INDEX-16b — enforce T0 ceiling as standing gate

source: INV-INDEX-16 @ reference/atlas-index.md#index-16
The index shall enforce the T0 ceiling of unresolved-edges over total-edges greater than 15% as a standing gate from day one.
normative-clause: "the T0 ceiling (`unresolved-edges / total-edges > 15%`) MUST be enforced as a **standing gate from day one**"

### REQ-INDEX-16c — crossing ceiling fails the gate

source: INV-INDEX-16 @ reference/atlas-index.md#index-16
If a T0 territory crosses the unresolved-edge ceiling, then the index shall fail the gate rather than merely schedule the functional axis.
normative-clause: "crossing it in a T0 territory MUST fail the gate, not merely schedule the `functional` axis"

### REQ-INDEX-17a — dependency axis addresses, does not commit (#191)

source: INV-INDEX-17 @ reference/atlas-index.md#index-17
A dependency-axis node's subtreeHash shall be the identity of its path, carrying no content, so it shall not be treated as a freshness oracle and an anchor resolved on it shall not be treated as a grounding.
normative-clause: "A dependency-axis node's `subtreeHash` MUST be the identity of its path (`id({file: path})`) and MUST carry no content … the axis MUST NOT be treated as a freshness oracle, and an anchor resolved on it MUST NOT be treated as a grounding"

## [NEEDS RECONCILIATION]

- INV-INDEX-15: the ownership-generation clause is normatively `SHOULD` ("owner SHOULD be generated…"), whereas its override-precedence, reconciliation-determinism, tier-human-ratified, and manifest-not-sole clauses are `MUST` — REQ-INDEX-15a projects a recommendation with a `shall`; confirm with DEFINE whether owner-generation is a hard mandate or a recommended default.
