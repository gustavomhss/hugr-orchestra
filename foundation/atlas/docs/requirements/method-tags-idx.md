# Method-tags — Block IDX (index) · S2 formal-decision

> **state:** S2 · **protocol:** [`formal-decision`](../../.claude/skills/formal-decision/SKILL.md) ·
> **axiom:** S1 frozen (`req-idx.md`; every behavioural INV has ≥1 REQ, atom-gate passed) ·
> **owner:** charlie (FORGE).
>
> One tag per **behavioural** INV by the 3-conjunct rule. IDX is the **substrate** — the content-addressed
> index that every other module addresses through — **not** a convergence core, so **nothing here is `formal`**
> (INDEX fails conjunct #2: no combinatorial concurrency/crash interleaving lives in the index itself; the one
> `formal` cluster in the whole Atlas is `FSPEC-merge` in KRN). Tool-by-**shape**: the determinism / byte-
> identity / ordering laws (INDEX-2/8/12/14) earn **PBT**; totality / robustness / structural properties earn
> **reference-model + PBT-fuzz** per the ratified baseline — a feature, not a compromise. All 16 IDX invariants
> are `behavioural` (register), so none carries `n/a`.
>
> Every tag reuses one **anti-rot mock**: a reference index written in the build language (`index/ref/*.ts`) and
> imported as the unit-test mock, so the build breaks when a code path drifts from the reference.

---

### INV-INDEX-1

method-tag: reference-model
fspec: —
up-property: "single-index sufficiency: one content-addressed index serves both drift detection and discovery across every axis; there exists no separate discovery structure and no separate staleness pass (auxiliary-structure count == 0)"
down-model: "reference index = one CAS + N axis-views over it; both drift(query) and discover(query) route through the same index object; the mock asserts 0 auxiliary discovery/staleness structures"
anti-rot: `index/ref/index.ts` (the single-index reference) is the mock; any code path that stands up a second discovery or sweep structure fails the structure-count assertion in the shared unit test.

### INV-INDEX-2

method-tag: PBT
fspec: —
up-property: "rollup determinism + edit-locality: each node's rollup is BLAKE3 over sorted child hashes (order-independent given the sort); an edit re-hashes exactly the leaf→root path on the affected axis and leaves every unaffected subtree's hash byte-identical (0 sibling re-hashes)"
down-model: "reference Merkle rollup `subtreeHash(node)=blake3(concat(sorted(childHashes)))`; PBT the determinism law (same children ⇒ same root under any input order) + the locality law (mutate one leaf ⇒ the set of changed node-hashes == the leaf→root path, sibling hashes invariant)"
anti-rot: `index/ref/rollup.ts` (the reference Merkle rollup) is the mock in the rollup unit tests; a code path that re-hashes a sibling or reorders children fails the locality/determinism property against it. _(Tag is `PBT`, not `reference-model`: the shape is a determinism + ordering/locality law, not general totality — the properties, not a differential oracle, are the teeth.)_

### INV-INDEX-3

method-tag: reference-model
fspec: —
up-property: "mechanical zero-LLM build: every axis (structural, territory, depends-on + blast radius) is derived from the real file tree / import graph via a per-language SCIP indexer with 0 model calls; rebuilding twice yields identical trees; an edge that cannot be statically resolved (incl. every cross-language edge) is declared `unresolved`, never guessed"
down-model: "reference `build(tree, scipOutput)=axes`; the SCIP binary is a black-box input (recorded fixtures, not modeled); the reference is a pure function of its inputs — PBT-fuzz that build makes 0 model calls, is idempotent on re-run, and marks every unresolvable edge rather than inventing a target"
anti-rot: `index/ref/build.ts` is the mock, fed recorded SCIP fixtures; a build path that calls a model or fabricates an edge diverges from the reference and breaks the build.

### INV-INDEX-4

method-tag: reference-model
fspec: —
up-property: "resolution totality + roll-up: resolving a `path` returns its covering node, and a file query also surfaces its module's and crate's invariants (hierarchy roll-up), for every path in the tree"
down-model: "reference `resolve(axis,key)` walks the spatial hierarchy returning the covering node + the union of ancestor-anchored invariants; conformance-tested against the reference over the whole tree"
anti-rot: `index/ref/resolve.ts` is the mock; a code resolver that misses an ancestor's invariants diverges from it and breaks the roll-up test.

### INV-INDEX-5

method-tag: reference-model
fspec: —
up-property: "drift oracle: because retrieval keys on `subtreeHash`, an entry whose anchor hash ≠ current is visible at query time and excluded/flagged — with 0 re-embedding and 0 separate sweep"
down-model: "reference query compares each hit's anchor hash to the current node hash and tags stale ones inline; the mock asserts staleness is decided at query time with no background pass"
anti-rot: `index/ref/retrieval.ts` (shared with INDEX-8) is the mock; a code path that needs a sweep to detect staleness fails the no-sweep assertion.

### INV-INDEX-6

method-tag: reference-model
fspec: —
up-property: "closed retrieval surface: relevance resolves by exactly scope, dependency, and trigger; any request through a fourth mode (e.g. free-text / similarity) does not resolve — the surface exposes no `search()`"
down-model: "reference retrieval exposes exactly {byScope, byDependency, byTrigger}; PBT-fuzz over arbitrary mode tokens asserts only the three resolve and every other returns empty — no fourth path exists"
anti-rot: `index/ref/retrieval.ts` is the mock; a code path that adds a similarity / free-text entry point diverges from the closed reference surface and breaks the build. _(Shape note: the 3 modes are finite but the non-mode input space is unbounded, so this is totality/robustness → `reference-model` + PBT-fuzz, NOT `exhaustive` — there is no finite decision table to enumerate.)_

### INV-INDEX-7

method-tag: reference-model
fspec: —
up-property: "no-embeddings substrate: no embedding model, vector store, or ANN backs the index (0 such dependencies); the three deterministic modes are the whole of retrieval (A-14)"
down-model: "reference retrieval is pure lookup over the CAS/axes with 0 embedding/vector calls; the mock is dependency-free by construction and a grep-style assertion confirms 0 ANN/vector imports on the retrieval path"
anti-rot: `index/ref/retrieval.ts` is the mock; introducing an embedding/vector dependency on the retrieval path fails the dependency-free assertion.

### INV-INDEX-8

method-tag: PBT
fspec: —
up-property: "query determinism: two identical queries (same axis/key/tag against the same CAS snapshot) return byte-identical results (0 nondeterminism, 0 fuzzy recall)"
down-model: "reference `byScope`/`byDependency`/`byTrigger` is a pure function of (CAS snapshot, query); PBT: for arbitrary query q, `run(q)==run(q)` byte-for-byte, and result ordering is a total deterministic sort"
anti-rot: `index/ref/retrieval.ts` is the mock; a code path that introduces nondeterministic ordering or a stateful cache diverges under the idempotence property and breaks the build.

### INV-INDEX-9

method-tag: reference-model
fspec: —
up-property: "totality: a malformed / missing path, tag, or axis yields an empty result and never throws (0 exceptions) across every entry point"
down-model: "the reference index is total by construction — every entry point returns empty/undefined, never throws; the golden generator is PBT-fuzz over arbitrary + malformed inputs asserting no-throw + empty"
anti-rot: the total reference index (`index/ref/*.ts`) is the mock; PBT fuzzes it and the code side-by-side so a throwing code path fails the shared no-throw property. _(Note: the golden generator is PBT-fuzz; the tag stays `reference-model` because the total reference IS the oracle — the shape is robustness/totality, not ordering, so it does not earn a standalone `PBT` tag. Cf. KERNEL-7.)_

### INV-INDEX-10

method-tag: reference-model
fspec: —
up-property: "multi-axis single-store: the index exposes ≥3 axes (spatial, territory, dependency), each with its own rollup; one object is cross-indexed on all applicable axes but stored once (0 duplication)"
down-model: "reference index holds one CAS map + ≥3 axis-views referencing objects by hash; the mock asserts axis-count ≥3, each view owns a rollup, and object-storage-count == 1 per hash"
anti-rot: `index/ref/index.ts` is the mock; a code path that duplicates an object across axes fails the single-storage assertion.

### INV-INDEX-11

method-tag: reference-model
fspec: —
up-property: "universal content-addressing: every Atlas object kind — code, knowledge, memory, provenance, transcripts, and docs — is a BLAKE3-keyed CAS object, grounded and drift-checked like any fact (0 un-addressed kinds)"
down-model: "reference `put(object)` keys every kind by `blake3(canonical(object))` into the one CAS and registers it for grounding + drift; the mock asserts each object kind (incl. Doc) round-trips through put/get and is drift-eligible"
anti-rot: `index/ref/cas.ts` (shares the KERNEL CAS reference `kernel/ref/store.ts`) is the mock; a kind that bypasses content-addressing fails the round-trip / drift-eligibility assertion.

### INV-INDEX-12

method-tag: PBT
fspec: —
up-property: "bounded incremental re-check: a `Delta` distinguishes `rId` (structure) from `rState` (state) and names only the changed buckets; a re-check touches only affected buckets (never `N`); the spatial `rId` re-hash is the changed leaf→root path only; the dependency `rState` eager re-hash is bounded — a drift dirty-bit propagates eagerly across the reverse closure, the hash is recomputed lazily on-read, eager re-hash capped at `maxHops=2`, deeper nodes marked `state-suspect` and resolved only on query (eager touch-count ≤ nodes-within-2-hops, never O(blast-radius))"
down-model: "reference dual-rollup with an instrumented touch-counter: `propagateDirty` (eager, whole reverse closure — a bit, O(1)/node) + `rehashState` (lazy, capped at maxHops=2); PBT the **boundedness** property — for an arbitrary DAG + edit, the count of eager `rState` re-hashes ≤ |nodes-within-maxHops(2)|, independent of blast-radius — plus the spatial leaf→root property (changed `rId` hashes == leaf→root path) and Delta bucket-naming"
anti-rot: `index/ref/fold.ts` (the instrumented bounded fold) is the mock; a code fold that re-hashes beyond `maxHops` or eagerly folds the whole closure exceeds the touch-count bound and breaks the boundedness property. _(Tag is `PBT`: the teeth are the boundedness + locality laws, asserted directly on the instrumented reference — this is exactly the "never O(blast-radius)" property, not a general differential oracle.)_

### INV-INDEX-13

method-tag: reference-model
fspec: —
up-property: "honest under-approximation: the `depends-on` graph records every unresolvable import/call and every cross-language boundary as an explicit `unresolved`/`dynamic` edge — never silently omitted, never a fabricated target; a reverse closure over such a node is reportable `under-approximate` and, when flagged, unions the node's `coChanged` band labeled correlational, never presented as complete / static"
down-model: "reference graph carries edges tagged `resolved|unresolved|dynamic`; `reverseClosure(node)={closure, underApprox: any-unresolved-in-scope, coChanged: correlational band when underApprox}`; conformance-tested that no unresolvable edge is dropped or invented and the under-approx flag + coChanged union fire exactly when scope holds an unresolved edge"
anti-rot: `index/ref/depgraph.ts` is the mock; a code path that omits an unresolved edge or fabricates a target diverges from the reference closure and breaks the build.

### INV-INDEX-14

method-tag: PBT
fspec: —
up-property: "deterministic overlap resolution: a unit matched by ≥2 overlapping globs resolves to exactly one owner+tier by longest-path-match, then manifest declaration order (total, single-valued); a no-glob path is flagged `uncovered` and, if T0-adjacent, defaults to deny; assignment is byte-identical across rebuilds and calls no model"
down-model: "reference `assign(path, manifest)=argmax` over matching globs by (literalPrefixLength, −declIndex); PBT the determinism (assign is a pure total function, byte-identical on re-run), single-valuedness (exactly one owner+tier), the tie-break laws (longest-match dominates; declaration order breaks the remaining tie), and the uncovered → T0-adjacent → deny default"
anti-rot: `index/ref/territory.ts` (the reference resolver) is the mock in the assignment unit tests; a non-deterministic or model-calling assignment path diverges from it and breaks the build. _(Tag is `PBT`: the shape is a deterministic ordering / tie-break law with byte-identity — cf. RETR-6 drop-order — not general totality.)_

### INV-INDEX-15

method-tag: reference-model
fspec: —
up-property: "generated + reconciled ownership: territory `owner` is generated from the structural graph + git-blame authorship the index already holds; an explicit manifest override beats the generated owner; reconciliation is deterministic and $0-LLM; `tier` stays human-ratified (never generated); the manifest is not the sole ownership source"
down-model: "reference `reconcile(graph, blame, manifest)`=deterministic owner-generator, then `apply(manifest-override)` as a precedence layer; the ref is the oracle — PBT the determinism + the override-beats-generated precedence layered on it; assert `tier` is passed through untouched (human-ratified)"
anti-rot: `index/ref/ownership.ts` is the mock; a code path that lets a generated owner beat an override, generates a `tier`, or calls a model diverges from the reference and breaks the build. **Open:** `req-idx.md` carries a `[NEEDS RECONCILIATION]` on INDEX-15a (owner-generation is `SHOULD` in the clause, projected with a `shall`) — the **method-tag holds regardless**; whether owner-generation is a hard mandate or a recommended default is a DEFINE-seat design call, not an S2 verification-method question.

### INV-INDEX-16

method-tag: reference-model
fspec: —
up-property: "standing coverage gate: the `unresolved`-edge ratio (`unresolved/total`) is a per-territory published health metric on every rollup; the T0 ceiling (>15%) is enforced as a standing gate from day one — a T0 territory that crosses it fails the gate (not merely schedules the `functional` axis)"
down-model: "reference `ratio(territory)=unresolvedEdges/totalEdges` published on each rollup; `gate(territory)= tier==T0 ∧ ratio>0.15 ⇒ FAIL`; conformance-tested that crossing the ceiling in a T0 zone fails the build-time gate and the ratio is readable on the rollup"
anti-rot: `index/ref/coverage.ts` is the mock; a code path that defers the T0 gate or omits the ratio from the rollup diverges from the reference gate and breaks the build. _(The ratio has a clean deterministic oracle — `unresolved/total` — so it is modeled, not refused; only the index's runtime **performance** is refused, below.)_

---

## Refuse-to-model

- **performance / latency of the index**: the incremental re-check is bounded **structurally** by the
  `maxHops=2` property (INDEX-12, modeled as a boundedness PBT — the touch-**count**, not wall-clock); actual
  query/build **latency + memory footprint** are covered by **load tests** with no correctness oracle. We model
  that the eager fold touches ≤ a bound; we do **not** model that it is fast.
- **the SCIP indexer internals / name-resolution correctness**: each per-language SCIP binary
  (`scip-typescript` / `rust-analyzer` / …) is a **black-box, version-pinned external input** — trusted like
  git or BLAKE3, fed as recorded fixtures. We model that the build **declares `unresolved` rather than guesses**
  (INDEX-3/13), not that the indexer resolves correctly.
- **the code itself**: conformance-tested (sampled) against the reference index — "success = we could not find
  a bug"; a verified design is not a verified impl. Confidence is bought with scale + coverage, not a proof claim.
- **BLAKE3 / digest cryptographic collision-resistance**: the hash is a trusted primitive, assumed — not
  modeled. Content-addressing byte-agreement (INDEX-2/8/11) is a conformance/property corpus, not a formal model.
- **git-blame authorship as ownership ground truth (INDEX-15)**: blame is a **signal** fed to the deterministic
  reconciler; we model the reconciler's determinism + override precedence, not that blame names the "right" owner.
- **runtime coupling beyond the static graph / the `functional` axis (INDEX-13/16)**: dynamic-dispatch, event-bus
  and reflection edges are **invisible to any static indexer by construction** — declared `unresolved` and
  backstopped by the correlational `coChanged` band, not modeled. The guarantee is only as strong as the static
  graph plus a labeled band; that limit is honest, not a gap.
- **real-time / wall-clock freshness**: no clock enters a rollup or a query result by construction, so there is
  nothing to model.

## FSPEC-merge

**None in this block.** IDX is the addressing **substrate**, not the convergence core; no IDX cluster meets the
3-conjunct rule (all fail conjunct #2 — no combinatorial concurrency/crash interleaving lives in the index
itself). The Atlas's only `formal` cluster is `FSPEC-merge` (KERNEL-9/10/11 + PERSIST-11), owned by Block KRN.

## Completion report

- tagged-register: `docs/requirements/method-tags-idx.md`
- tag histogram: **formal 0** · **exhaustive 0** · **PBT 4** (INDEX-2/8/12/14) · **reference-model 12**
  (INDEX-1/3/4/5/6/7/9/10/11/13/15/16)
- FSPEC-merge: **none in IDX** (the core lives in KRN)
- refusal count: **7**
- every INDEX-1..16 tagged: **yes** (16/16; all behavioural, 0 `n/a`)
- shape-no-fit flag: **none** (every INV fits a tool-per-shape row)
- → next_state **S3** (goldens).
