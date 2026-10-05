# Properties — Block IDX (index) · S3-sibling ∀-law render

> **state:** S3-sibling (rendered from the frozen S2 method-tags) · **owner:** charlie (FORGE) ·
> **source (frozen, do not edit):** `method-tags-idx.md` — each `### INV-INDEX-<n>` `up-property`, carried as a
> `ptr+digest` so an upstream edit renders the property STALE.
> **purpose:** transcribe every behavioural IDX invariant's `up-property` into a runnable ∀-quantified property —
> the oracle-free beyond-the-witness (PBT) leg that raises IDX WPs from FLOOR toward FULL assurance. **Invents no
> law.** IDX carries **no `formal` cluster** (the Atlas's one FSPEC is `FSPEC-merge` in KRN), so no fspec law is
> transcribed here; every `law` is a faithful render of a frozen `up-property`.
>
> `source` digest = `sha256(<INV block>)[:12]` over the frozen `method-tags-idx.md`. All 16 IDX invariants are
> `behavioural` → each renders to ≥1 PROP (16/16). `covers_reqs` point at `req-idx.md#REQ-INDEX-<n>`.

---

### PROP-INDEX-1 — single-index sufficiency

inv: INV-INDEX-1
source: method-tags-idx.md#INV-INDEX-1 @sha256:36fd7639673c
law: ∀ query q. drift(q) ∧ discover(q) both route through the **same** index object I ∧ auxiliaryStructureCount(I) ≡ 0 — no separate discovery structure, no separate staleness pass.
arbitrary: arbitrary CAS of mixed object kinds → one index I; arbitrary {drift(anchor), discover(scope|dep|trigger)} query pairs.
covers_reqs: [ REQ-INDEX-1a, REQ-INDEX-1b ] # req-idx.md#REQ-INDEX-1
witness: [ SCN-INDEX-1a-1, SCN-INDEX-1b-1 ]
teeth: breaks-on "a second, separately-built discovery/staleness structure is stood up (auxiliaryStructureCount ≥ 1) that can disagree with the drift index — a witness that only checks one query pair cannot rule out a divergent second store over the arbitrary query space."

### PROP-INDEX-2 — rollup determinism + edit-locality

inv: INV-INDEX-2
source: method-tags-idx.md#INV-INDEX-2 @sha256:ca8dbba64a02
law: ∀ node n, ∀ permutation π of children(n). subtreeHash(n) ≡ blake3(concat(sort(childHashes(n)))) — invariant under π (determinism). ∧ ∀ tree t, ∀ single-leaf edit e. touchedNodes(rehash(t,e)) ≡ path(leaf→root) ∧ ∀ sibling s ∉ path. hash(s) byte-identical (0 sibling re-hashes).
arbitrary: arbitrary spatial trees (random depth/branching) × random child input orderings × one random leaf edit; instrumented touch-set.
covers_reqs: [ REQ-INDEX-2a, REQ-INDEX-2b, REQ-INDEX-2c ] # req-idx.md#REQ-INDEX-2
witness: [ SCN-INDEX-2a-1, SCN-INDEX-2b-1, SCN-INDEX-2c-1 ]
teeth: breaks-on "a rollup that concatenates children in input order (nondeterministic root) or re-hashes a whole level (a sibling touch) — the single fixture-tree witness passes for its one shape; the ∀-tree property kills the mutant across arbitrary branching where a sibling-touch or order-swap surfaces."

### PROP-INDEX-3 — mechanical zero-LLM build

inv: INV-INDEX-3
source: method-tags-idx.md#INV-INDEX-3 @sha256:3cb74bc0e1d0
law: ∀ (tree, scipOutput). modelCalls(build(tree,scipOutput)) ≡ 0 ∧ build(tree,scipOutput) ≡ build(tree,scipOutput) (idempotent re-run, byte-identical) ∧ ∀ edge e statically-unresolvable (incl. every cross-language edge). tag(e) ≡ `unresolved` — no target invented.
arbitrary: arbitrary file trees × recorded SCIP fixtures seeded with cross-language / FFI boundaries; run-twice pairs; model-call counter.
covers_reqs: [ REQ-INDEX-3a, REQ-INDEX-3b, REQ-INDEX-3c, REQ-INDEX-3d, REQ-INDEX-3e ] # req-idx.md#REQ-INDEX-3
witness: [ SCN-INDEX-3a-1, SCN-INDEX-3b-1, SCN-INDEX-3c-1, SCN-INDEX-3d-1, SCN-INDEX-3e-1 ]
teeth: breaks-on "a build that guesses a target for an unresolvable edge (fabricated `resolved`) or folds wall-clock/iteration-order state (second rebuild differs) — the lone FFI fixture cannot cover the space of unresolvable shapes the ∀-fixture stream exercises."

### PROP-INDEX-4 — resolution totality + hierarchy roll-up

inv: INV-INDEX-4
source: method-tags-idx.md#INV-INDEX-4 @sha256:f01b8bcdc778
law: ∀ path p ∈ tree. resolve(spatial,p) ≡ coveringNode(p) (never undefined, never the parent) ∧ result surfaces ⋃ ancestorAnchoredInvariants(p) — the file→module→crate roll-up.
arbitrary: arbitrary trees with invariants anchored at each level × arbitrary in-tree paths (file/module/crate/item).
covers_reqs: [ REQ-INDEX-4a, REQ-INDEX-4b ] # req-idx.md#REQ-INDEX-4
witness: [ SCN-INDEX-4a-1, SCN-INDEX-4b-1 ]
teeth: breaks-on "a resolver that drops an ancestor's invariant (returns only the file-anchored one) or returns the parent module instead of the covering node — the single 3-level witness misses roll-ups that fail only at deeper/other anchor depths the ∀-path property reaches."

### PROP-INDEX-5 — drift oracle at query time

inv: INV-INDEX-5
source: method-tags-idx.md#INV-INDEX-5 @sha256:48e54c33e405
law: ∀ hit h at query time. anchorHash(h) ≠ currentHash(node(h)) ⇒ h is flagged/excluded stale, decided inline ∧ reEmbeddingCount ≡ 0 ∧ sweepCount ≡ 0.
arbitrary: arbitrary facts anchored at arbitrary nodes × arbitrary edits that flip a subset of current node hashes; query-time staleness verdict + re-embed/sweep counters.
covers_reqs: [ REQ-INDEX-5a, REQ-INDEX-5b, REQ-INDEX-5c ] # req-idx.md#REQ-INDEX-5
witness: [ SCN-INDEX-5a-1, SCN-INDEX-5b-1, SCN-INDEX-5c-1 ]
teeth: breaks-on "a query that returns a drifted fact as FRESH, or one that requires a background sweep to mark staleness (sweepCount ≥ 1) — the one drifted-fact witness cannot exclude a sweep dependency that only shows under arbitrary anchor/edit combinations."

### PROP-INDEX-6 — closed retrieval surface (exactly three modes)

inv: INV-INDEX-6
source: method-tags-idx.md#INV-INDEX-6 @sha256:11d65cfd6e73
law: ∀ mode token m. resolves(m) ⇔ m ∈ {byScope, byDependency, byTrigger} — every other m (free-text / similarity, e.g. `search:*`) returns empty; the surface exposes no `search()`.
arbitrary: PBT-fuzz over arbitrary mode-token strings (the 3 valid + unbounded junk incl. `search:`/similarity tokens).
covers_reqs: [ REQ-INDEX-6a, REQ-INDEX-6b ] # req-idx.md#REQ-INDEX-6
witness: [ SCN-INDEX-6a-1, SCN-INDEX-6b-1 ]
teeth: breaks-on "a similarity `search()` entry point that resolves a free-text request (a fourth mode) — a fixed `search:acme` witness misses a fourth path keyed on a different token prefix that the unbounded fuzz surfaces."

### PROP-INDEX-7 — no-embeddings substrate

inv: INV-INDEX-7
source: method-tags-idx.md#INV-INDEX-7 @sha256:650672f8c97d
law: embeddingDeps(retrievalPath) ≡ 0 ∧ vectorStoreDeps ≡ 0 ∧ annDeps ≡ 0 — the three deterministic modes are the whole of retrieval (A-14); retrieval is pure lookup over the CAS/axes.
arbitrary: the retrieval-path static import set (dependency arbitrary); grep-style assertion over the transitive import closure of the retrieval entry points.
covers_reqs: [ REQ-INDEX-7a ] # req-idx.md#REQ-INDEX-7
witness: [ SCN-INDEX-7a-1 ]
teeth: breaks-on "a vector-store / ANN client imported anywhere on the retrieval path (RAG enters the substrate) — asserting the ∀-import closure kills a dependency added on a code path the single hand-checked module never traverses."

### PROP-INDEX-8 — query determinism

inv: INV-INDEX-8
source: method-tags-idx.md#INV-INDEX-8 @sha256:0d32c0c16146
law: ∀ query q, ∀ fixed CAS snapshot S. run(q,S) ≡ run(q,S) byte-for-byte — including result ordering as a total deterministic sort (0 nondeterminism, 0 fuzzy recall).
arbitrary: a fixed CAS snapshot × arbitrary well-formed queries (scope/dep/trigger keys); run-twice byte-compare.
covers_reqs: [ REQ-INDEX-8a ] # req-idx.md#REQ-INDEX-8
witness: [ SCN-INDEX-8a-1 ]
teeth: breaks-on "results ordered by Map-iteration / insertion order or served from a stateful cache — two runs differ in element order; the single fixed-query witness cannot expose ordering nondeterminism that only appears for other key distributions the ∀-query property samples."

### PROP-INDEX-9 — totality (malformed → empty, never throws)

inv: INV-INDEX-9
source: method-tags-idx.md#INV-INDEX-9 @sha256:95402fcdd8ef
law: ∀ input i (incl. malformed / missing path, tag, or axis), ∀ entry point ep. ep(i) ≡ empty ∧ throwsCount ≡ 0 — total by construction across every entry point.
arbitrary: corner-biased PBT-fuzz stream (empty, null, bad-axis, unicode, oversized) × every entry point (10k cases).
covers_reqs: [ REQ-INDEX-9a, REQ-INDEX-9b ] # req-idx.md#REQ-INDEX-9
witness: [ SCN-INDEX-9a-1, SCN-INDEX-9b-1 ]
teeth: breaks-on "a malformed axis that falls through to a default axis (a wrong hit) or a path that throws TypeError instead of empty — the two named malformed witnesses cannot cover the corner space where a single un-total path throws or returns non-empty."

### PROP-INDEX-10 — multi-axis single-store

inv: INV-INDEX-10
source: method-tags-idx.md#INV-INDEX-10 @sha256:0d8ad727b731
law: axisCount(index) ≥ 3 (spatial, territory, dependency) ∧ ∀ axis a. ownsRollup(a) ∧ ∀ object o. objectStorageCount(hash(o)) ≡ 1 — cross-indexed on all applicable axes, stored once (0 duplication).
arbitrary: arbitrary object sets cross-indexed on their applicable axes; per-hash storage counter + axis/rollup enumeration.
covers_reqs: [ REQ-INDEX-10a, REQ-INDEX-10b, REQ-INDEX-10c ] # req-idx.md#REQ-INDEX-10
witness: [ SCN-INDEX-10a-1, SCN-INDEX-10b-1, SCN-INDEX-10c-1 ]
teeth: breaks-on "each axis storing its own copy (objectStorageCount ≡ 3) or an axis without its own rollup — the single item:put witness misses per-hash duplication that only appears for objects cross-indexed on a different axis subset the ∀-object property covers."

### PROP-INDEX-11 — universal content-addressing

inv: INV-INDEX-11
source: method-tags-idx.md#INV-INDEX-11 @sha256:a7ba6c67eb42
law: ∀ object o ∈ {Code, Knowledge, Memory, Provenance, Transcript, Doc}. key(o) ≡ blake3(canonical(o)) ∧ get(put(o)) ≡ o ∧ driftEligible(o) — 0 un-addressed kinds (incl. Doc).
arbitrary: one generated instance of each object kind (incl. Doc) × a Doc citing code × an edit to the cited node; put/get round-trip + drift-eligibility check.
covers_reqs: [ REQ-INDEX-11a, REQ-INDEX-11b ] # req-idx.md#REQ-INDEX-11
witness: [ SCN-INDEX-11a-1, SCN-INDEX-11b-1 ]
teeth: breaks-on "a Doc that bypasses content-addressing to a side store (get(hash(doc)) misses) or is exempt from drift-checking — quantifying over all six kinds kills a kind-specific bypass the single Doc witness would catch only for Doc, not for a future kind."

### PROP-INDEX-12 — dual rollup, bounded re-check (never O(blast-radius))

inv: INV-INDEX-12
source: method-tags-idx.md#INV-INDEX-12 @sha256:2903e2e1bdcd
law: ∀ DAG g, ∀ edit e. eagerRStateRehashCount(g,e) ≤ |nodesWithinMaxHops(g, e, 2)| — independent of blast-radius (never O(blast-radius)). ∧ changedRIdHashes ≡ path(leaf→root) ∧ Delta names exactly the changed buckets (rId≠rState distinguished) ∧ propagateDirty sets the dirty-bit over the **full** reverse closure (O(1)/node) ∧ rState hash recomputed lazily on-read ∧ nodes deeper than maxHops=2 marked `state-suspect`, resolved only on query.
arbitrary: arbitrary DAGs (random reverse-closure depth/width, |N| ≫ hops) × a single sink edit; instrumented eager touch-counter + dirty-bit/suspect markers.
covers_reqs: [ REQ-INDEX-12a, REQ-INDEX-12b, REQ-INDEX-12c, REQ-INDEX-12d, REQ-INDEX-12e, REQ-INDEX-12f, REQ-INDEX-12g, REQ-INDEX-12h, REQ-INDEX-12i, REQ-INDEX-12j, REQ-INDEX-12k ] # req-idx.md#REQ-INDEX-12
witness: [ SCN-INDEX-12a-1, SCN-INDEX-12b-1, SCN-INDEX-12c-1, SCN-INDEX-12d-1, SCN-INDEX-12e-1, SCN-INDEX-12f-1, SCN-INDEX-12g-1, SCN-INDEX-12h-1, SCN-INDEX-12i-1, SCN-INDEX-12j-1, SCN-INDEX-12k-1 ]
teeth: breaks-on "a fold that eagerly re-hashes the whole reverse closure (eager count == blast-radius, not ≤ nodes-within-2-hops) or raises the maxHops cap — the fixed 5-node chain witness proves the bound only at blast-radius 4; the ∀-DAG boundedness law kills the O(blast-radius) cascade at every depth, the block's highest-value teeth."

### PROP-INDEX-13 — honest under-approximation

inv: INV-INDEX-13
source: method-tags-idx.md#INV-INDEX-13 @sha256:ae5ef1f6db7b
law: ∀ import/call/cross-language edge e unresolvable-statically. e ∈ graph as explicit `unresolved`/`dynamic` (never omitted, never a fabricated target). ∧ ∀ reverseClosure(n) with an unresolved edge in scope. underApprox ≡ true ∧ result ⊇ coChanged(n) each labeled `correlational` — never presented as complete / static.
arbitrary: arbitrary graphs seeded with unresolvable / dynamic / reflection / cross-language edges × reverse-closure queries; edge-count vs reference + flag/label assertions.
covers_reqs: [ REQ-INDEX-13a, REQ-INDEX-13b, REQ-INDEX-13c, REQ-INDEX-13d, REQ-INDEX-13e, REQ-INDEX-13f ] # req-idx.md#REQ-INDEX-13
witness: [ SCN-INDEX-13a-1, SCN-INDEX-13b-1, SCN-INDEX-13c-1, SCN-INDEX-13d-1, SCN-INDEX-13e-1, SCN-INDEX-13f-1 ]
teeth: breaks-on "an unresolvable edge silently omitted or given a fabricated resolved target, or a closure that strips the underApprox flag / labels coChanged as static — the fixed dynamic-dispatch + FFI witness cannot cover the space of unresolvable shapes where a single silent omission escapes the ∀-edge property."

### PROP-INDEX-14 — deterministic overlap resolution

inv: INV-INDEX-14
source: method-tags-idx.md#INV-INDEX-14 @sha256:dc65d7f8813b
law: ∀ unit u matched by ≥2 overlapping globs. assign(u, manifest) ≡ argmax over matching globs by (literalPrefixLength, −declIndex) → exactly one {owner, tier} (total, single-valued) ∧ assign(u) ≡ assign(u) byte-identical across rebuilds ∧ modelCalls ≡ 0 ∧ (no-glob u ⇒ flagged `uncovered`) ∧ (uncovered ∧ T0-adjacent ⇒ default `deny`).
arbitrary: arbitrary territory manifests with overlapping globs × declaration orders × arbitrary unit paths (covered / uncovered / T0-adjacent); rerun byte-compare + model-call counter.
covers_reqs: [ REQ-INDEX-14a, REQ-INDEX-14b, REQ-INDEX-14c, REQ-INDEX-14d, REQ-INDEX-14e, REQ-INDEX-14f ] # req-idx.md#REQ-INDEX-14
witness: [ SCN-INDEX-14a-1, SCN-INDEX-14b-1, SCN-INDEX-14c-1, SCN-INDEX-14d-1, SCN-INDEX-14e-1, SCN-INDEX-14f-1 ]
teeth: breaks-on "a tie-break mutated to first-declaration-wins regardless of specificity (shorter glob wins) or a T0-adjacent uncovered path defaulting to allow — the single two-glob witness proves one overlap; the ∀-manifest property kills specificity-inversions that only appear on deeper/multi-glob overlaps."

### PROP-INDEX-15 — generated + reconciled ownership

inv: INV-INDEX-15
source: method-tags-idx.md#INV-INDEX-15 @sha256:5c9da24b13d8
law: ∀ (graph, blame, manifest). reconcile(graph, blame, manifest) ≡ reconcile(graph, blame, manifest) byte-identical (deterministic) ∧ modelCalls ≡ 0 ∧ (explicit manifest override ≻ generated owner) ∧ tier passed through untouched (human-ratified, never generated) ∧ manifest is not the sole ownership source. **[NEEDS RECONCILIATION: INDEX-15a owner-generation mandate — the generation clause is normatively `SHOULD` projected with a `shall` (`req-idx.md#[NEEDS RECONCILIATION]`); whether "owner is generated from graph+blame" is a hard ∀-law or a DEFINE-gated optional feature is a DEFINE-seat call. The MUST laws above hold regardless; the generation-law is rendered only as the DEFINE-parametric case gated on owner-generation ENABLED — cf. witness SCN-INDEX-15a-1.]**
arbitrary: arbitrary (graph, blame, manifest) triples incl. empty/partial manifests × explicit overrides × human-ratified tiers; rerun byte-compare + model-call counter.
covers_reqs: [ REQ-INDEX-15a, REQ-INDEX-15b, REQ-INDEX-15c, REQ-INDEX-15d, REQ-INDEX-15e ] # req-idx.md#REQ-INDEX-15
witness: [ SCN-INDEX-15a-1, SCN-INDEX-15b-1, SCN-INDEX-15c-1, SCN-INDEX-15d-1, SCN-INDEX-15e-1 ]
teeth: breaks-on "a generated owner beating an explicit override (precedence inverted), a mechanically-generated `tier`, or the manifest treated as sole source (unlisted territory left owner-less) — the fixed override witness cannot cover the ∀-triple space where precedence inverts only for certain blame/manifest combinations."

### PROP-INDEX-16 — standing coverage gate

inv: INV-INDEX-16
source: method-tags-idx.md#INV-INDEX-16 (digest UNVERIFIED: terminal renderer unavailable)
law: ∀ territory t. ratio(t) ≡ unresolvedEdges(t)/totalEdges(t), published on t's rollup (readable health metric) ∧ gate(t) ≡ ( tier(t) == T0 ∧ ratio(t) > 0.15 ) ⇒ FAIL — enforced at build time from day one, not deferred to the `functional` axis.
arbitrary: arbitrary territories with random unresolved/total edge counts × tiers {T0..Tn}; ratio readback + build-time gate verdict.
covers_reqs: [ REQ-INDEX-16a, REQ-INDEX-16b, REQ-INDEX-16c ] # req-idx.md#REQ-INDEX-16
witness: [ SCN-INDEX-16a-1, SCN-INDEX-16b-1, SCN-INDEX-16c-1 ]
teeth: breaks-on "crossing the T0 ceiling only logs a warning / schedules the `functional` axis while the build stays green, or the rollup omits the ratio — the single 0.20-ratio witness cannot cover the boundary space (e.g. ratio exactly 0.15, non-T0 tiers) where the gate predicate must fire/not-fire across the ∀-territory range."
