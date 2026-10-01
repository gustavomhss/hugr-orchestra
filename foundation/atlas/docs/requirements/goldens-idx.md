# Goldens — Block IDX (index) · S3 generate-from-method-tag

> **state:** S3 · **protocol:** [`goldens`](../../.claude/skills/goldens/SKILL.md) + [`completeness`](../../.claude/skills/completeness/SKILL.md) Gate-3 teeth ·
> **axiom:** S2 frozen (`method-tags-idx.md`; every INDEX-1..16 method-tagged, **0 `formal`** — the Atlas's one
> `formal` cluster is `FSPEC-merge` in KRN; IDX is the addressing substrate, not a convergence core) ·
> **owner:** charlie (FORGE).
>
> **Derivation (generated from the S2 method-tag, not hand-authored where a generator exists):**
>
> - **INDEX-2 / 8 / 12 / 14** are `PBT` (tool-by-shape: determinism / byte-identity / locality / **boundedness**
>   / tie-break **laws**). Their SCNs are **concrete witness instances of those laws** asserted on the
>   instrumented reference (`index/ref/*.ts`) — `gen: PBT`. The high-value ones are the **boundedness** witnesses
>   for INDEX-12 (assert eager touch-count ≤ `maxHops=2`; the mutant = a re-hash cascade O(blast-radius)).
> - **INDEX-1 / 3 / 4 / 5 / 6 / 7 / 9 / 10 / 11 / 13 / 15 / 16** are `reference-model` → **conformance /
>   differential** against the named build-language mock (`index/ref/*.ts`, reused as the unit-test mock;
>   anti-rot: the build breaks when a code path drifts) — `gen: conformance`. (INDEX-9's generator is PBT-fuzz,
>   but the tag stays `reference-model` — the total reference IS the oracle; cf. KERNEL-7.)
> - **residue: none** — every IDX invariant has a generator (there is no self-install/no-oracle case like KRN's 12a).
>
> **DEFINE-gated note (INDEX-15a):** the ownership-generation clause is normatively `SHOULD` ("owner SHOULD be
> generated…") projected with a `shall` (`req-idx.md` [NEEDS RECONCILIATION]). Its golden `SCN-INDEX-15a-1` is
> written as an **optional-feature case** gated on owner-generation being enabled — a **DEFINE-parametric** SCN.
> Whether generation is a hard MUST or a recommended default is a DEFINE-seat design call; the **MUST teeth
> (15b–15e) are covered concretely and hold regardless**.

Concrete fixtures reused across the block (fields per `atlas-index.md` §axes + §schema):

**Spatial tree** (`Axis = spatial`, levels repo→crate→module→file→item→block; `subtreeHash` per node):

| node             | subtreeHash | children                     |
| ---------------- | ----------- | ---------------------------- |
| repo:atlas       | `sp-rp`     | crate:core                   |
| crate:core       | `sp-cr`     | module:cas                   |
| module:cas       | `sp-mod`    | file:cas.ts, file:store.ts   |
| file:cas.ts      | `sp-9c`     | block b1(put), block b2(get) |
| block b1 (put)   | `bk-11`     | —                            |
| block b2 (get)   | `bk-22`     | —                            |
| file:store.ts    | `sp-st`     | block b3(write)              |
| block b3 (write) | `bk-33`     | —                            |

Editing block b1 → b1'=`bk-11x`. `sort(bk-11, bk-22)` is order-independent; `sp-9c = blake3(concat(sorted))`.

**Dependency DAG** (`Axis = dependency`, reverse-closure chain; edit at the sink A):
`A ← B(hop1) ← C(hop2) ← D(hop3) ← E(hop4)` — blast-radius(A) = {B,C,D,E}. `maxHops=2`. C carries an
`unresolved` edge `C ⇢ ?` (dynamic dispatch) and there is a cross-language edge `TS→Rust binary` (FFI, unseeable
by scip-typescript). C's `coChanged` git-history band = {P, Q}.

**Territory manifest** (`{name, owner, tier, globs}`, declaration order significant):

| decl | name  | owner   | tier | globs         |
| ---- | ----- | ------- | ---- | ------------- |
| 0    | atlas | charlie | T0   | `core/**`     |
| 1    | cas   | dana    | T1   | `core/cas/**` |

`core/cas/cas.ts` is matched by **both** globs → longest-path-match `core/cas/**` (dana, T1) wins.

**Held-out fixture universe (Wave H · genuinely independent — different data, same behaviour):**
Each `gen: conformance` REQ carries a second `held_out: true` fixture drawn from this universe, so the
execution GATE can withhold it from the builder. Different tree / depgraph / territory / coverage set, same
branch/behaviour as fixture-1 (a renamed clone would defeat the mechanism).

**Held-out spatial tree** (`Axis = spatial`):

| node              | subtreeHash | children                       |
| ----------------- | ----------- | ------------------------------ |
| repo:atlas        | `sp-rp`     | crate:net                      |
| crate:net         | `nt-cr`     | module:http                    |
| module:http       | `nt-mod`    | file:client.ts, file:server.ts |
| file:client.ts    | `nt-cl`     | block c1(send), block c2(recv) |
| block c1 (send)   | `bk-aa`     | —                              |
| block c2 (recv)   | `bk-bb`     | —                              |
| file:server.ts    | `nt-sv`     | block c3(listen)               |
| block c3 (listen) | `bk-cc`     | —                              |

Editing block c1 → c1'=`bk-aax`. `nt-cl = blake3(concat(sort(bk-aa, bk-bb)))`.

**Held-out dependency DAG** (reverse-closure chain; edit at the sink P):
`P ← Q(hop1) ← R(hop2) ← S(hop3) ← T(hop4)` — blast-radius(P) = {Q,R,S,T}. `maxHops=2`. R carries an
`unresolved` edge `R ⇢ ?` (dynamic dispatch) and there is a cross-language edge `TS→Go binary` (cgo FFI,
unseeable by scip-typescript). R's `coChanged` git-history band = {M, N}.

**Held-out territory manifest** (`{name, owner, tier, globs}`, declaration order significant):

| decl | name | owner | tier | globs         |
| ---- | ---- | ----- | ---- | ------------- |
| 0    | net  | erin  | T0   | `net/**`      |
| 1    | http | frank | T1   | `net/http/**` |

`net/http/client.ts` is matched by **both** globs → longest-path-match `net/http/**` (frank, T1) wins.
**Held-out coverage:** `territory:net` (T0) has 5 `unresolved` of 20 total edges → ratio `0.25 > 0.15`.

---

## REQ-INDEX-1 — one content-addressed index, N axes, two jobs

### REQ-INDEX-1a — one index backs both jobs (happy)

### SCN-INDEX-1a-1 — one index answers both drift and discovery (happy)

source: REQ-INDEX-1a
Given a single content-addressed index `I` over the CAS holding file:cas.ts and fact `F` anchored at item:put
When both `drift(anchor=item:put)` and `discover(byScope("core/cas/cas.ts"))` are routed
Then both are served by the same index object `I` — auxiliary-structure count == 0 (no second discovery/staleness structure stood up)
teeth: breaks-on "discovery is served by a second, separately-built discovery index — auxiliary-structure count == 1 and the two indexes can disagree"
gen: conformance # differential vs `index/ref/index.ts` (the single-index reference)

### SCN-INDEX-1a-2 — [held-out] one index answers both drift and discovery on an independent tree (happy)

source: REQ-INDEX-1a
held_out: true
Given a single content-addressed index `J` over the CAS holding file:client.ts and fact `G` anchored at item:send
When both `drift(anchor=item:send)` and `discover(byScope("net/http/client.ts"))` are routed
Then both are served by the same index object `J` — auxiliary-structure count == 0 (no second discovery/staleness structure stood up)
teeth: breaks-on "discovery of `net/http/client.ts` is served by a second, separately-built discovery index — auxiliary-structure count == 1 and the two indexes can disagree"
gen: conformance # held-out differential vs `index/ref/index.ts`; independent net/http fixture

### REQ-INDEX-1b — no separate discovery or sweep (guard)

### SCN-INDEX-1b-1 — no separate discovery structure or staleness pass exists (guard)

source: REQ-INDEX-1b
Given the reference index after ingesting {file:cas.ts, fact `F`, memory `M`}
When the structure-count assertion runs (count of discovery/staleness auxiliary structures)
Then the count is 0 — drift is decided at query time off `subtreeHash`, discovery off the same axes
teeth: breaks-on "a background staleness-sweep structure is registered — the auxiliary-structure count is 1 (a second source of truth)"
gen: conformance

### SCN-INDEX-1b-2 — [held-out] no separate discovery structure or staleness pass on an independent ingest (guard)

source: REQ-INDEX-1b
held_out: true
Given the reference index after ingesting {file:server.ts, fact `G`, memory `K`}
When the structure-count assertion runs (count of discovery/staleness auxiliary structures)
Then the count is 0 — drift is decided at query time off `subtreeHash`, discovery off the same axes
teeth: breaks-on "a background staleness-sweep structure is registered for the net axes — the auxiliary-structure count is 1 (a second source of truth)"
gen: conformance # held-out; independent net/http ingest

---

## REQ-INDEX-2 — Merkle rollup (determinism + edit-locality · PBT)

### REQ-INDEX-2a — rollup is BLAKE3 of children (happy)

### SCN-INDEX-2a-1 — rollup = BLAKE3 over sorted child hashes, order-independent (happy)

source: REQ-INDEX-2a
Given file:cas.ts with children block b1=`bk-11` and b2=`bk-22`
When `subtreeHash` is computed twice — once presenting children `[b1,b2]`, once `[b2,b1]`
Then both equal `blake3(concat(sort(bk-11, bk-22)))` = `sp-9c` — identical regardless of child input order
teeth: breaks-on "rollup concatenates children in input order without sorting — `[b2,b1]` hashes to `sp-9d` ≠ `[b1,b2]`'s `sp-9c` (nondeterministic rollup)"
gen: PBT # witness of the rollup-determinism law (fspec-less; `index/ref/rollup.ts`)

### REQ-INDEX-2b — edit re-hashes leaf→root only (happy)

### SCN-INDEX-2b-1 — editing one block re-hashes exactly its leaf→root path (happy)

source: REQ-INDEX-2b
Given the spatial tree repo:atlas→crate:core→module:cas→file:cas.ts→{b1,b2}, all `subtreeHash`es recorded
When block b1 is edited to b1'=`bk-11x` and the tree is re-hashed
Then the set of **re-hashed (touched)** nodes is exactly `{b1, file:cas.ts, module:cas, crate:core, repo:atlas}` — the leaf→root path; sibling nodes (`file:store.ts`, `b2`) are **not re-hashed** (0 sibling touches, instrumented)
teeth: breaks-on "the rollup re-hashes the whole level (every file under module:cas) — `file:store.ts` is re-hashed too (a touch, even though its value is idempotent-unchanged), so the touched set exceeds the leaf→root path"
gen: PBT # witness of the locality law (changed-set == leaf→root path)

### REQ-INDEX-2c — unaffected subtrees keep their hash (guard)

### SCN-INDEX-2c-1 — sibling subtrees keep their hash byte-identical (guard)

source: REQ-INDEX-2c
Given the same edit of b1 under file:cas.ts
When the tree is re-hashed
Then sibling block b2=`bk-22` and sibling file:store.ts (`sp-st`, b3=`bk-33`) keep their `subtreeHash` **byte-identical** — 0 sibling re-hashes
teeth: breaks-on "a sibling re-hash is triggered — b2's hash changes to `bk-22x` on an edit that never touched it (facts anchored at b2 spuriously flip stale)"
gen: PBT # witness of the sibling-invariance half of the locality law

---

## REQ-INDEX-3 — deterministic, mechanical, zero-LLM build

### REQ-INDEX-3a — mechanical SCIP-derived build (happy)

### SCN-INDEX-3a-1 — every axis derived mechanically via SCIP, 0 model calls (happy)

source: REQ-INDEX-3a
Given the file tree + recorded `scip-typescript` fixture output for crate:core
When `build(tree, scipOutput)` derives the spatial, territory, and dependency axes
Then all three axes are produced with model-call-count == 0, purely from the tree + the SCIP fixture
teeth: breaks-on "the build calls an LLM to infer a dependency edge — model-call-count == 1 (the build is no longer $0-LLM / reconstructable)"
gen: conformance # differential vs `index/ref/build.ts` fed recorded SCIP fixtures

### SCN-INDEX-3a-2 — [held-out] every axis derived mechanically via SCIP, 0 model calls (happy)

source: REQ-INDEX-3a
held_out: true
Given the file tree of crate:net + recorded `scip-typescript` fixture output for module:http
When `build(tree, scipOutput)` derives the spatial, territory, and dependency axes
Then all three axes are produced with model-call-count == 0, purely from the tree + the SCIP fixture
teeth: breaks-on "the build calls an LLM to infer the `client.ts→server.ts` dependency edge — model-call-count == 1 (the build is no longer $0-LLM / reconstructable)"
gen: conformance # held-out differential vs `index/ref/build.ts`; recorded net SCIP fixtures

### REQ-INDEX-3b — build depends on no model (guard)

### SCN-INDEX-3b-1 — the build path has zero model dependency (guard)

source: REQ-INDEX-3b
Given the build module graph
When it is audited for model/inference imports on the build path
Then 0 model dependencies are found — build is a pure function of `(tree, SCIP fixtures)`
teeth: breaks-on "an embedding/LLM client is imported on the build path — the dependency-free assertion fails"
gen: conformance

### SCN-INDEX-3b-2 — [held-out] the build path has zero model dependency (guard)

source: REQ-INDEX-3b
held_out: true
Given the crate:net build module graph
When it is audited for model/inference imports on the build path
Then 0 model dependencies are found — build is a pure function of `(tree, SCIP fixtures)`
teeth: breaks-on "an embedding/LLM client is imported on the net build path — the dependency-free assertion fails"
gen: conformance # held-out; independent net build graph

### REQ-INDEX-3c — no stack-graphs or LSIF backend (guard)

### SCN-INDEX-3c-1 — backend is SCIP, never stack-graphs or LSIF (guard)

source: REQ-INDEX-3c
Given the dependency-axis backend configuration
When the backend identity is asserted
Then it is a version-pinned SCIP binary — 0 `stack-graphs` (archived 2025-09) and 0 LSIF backends wired
teeth: breaks-on "the dep axis is wired to an LSIF backend — the SCIP-only assertion fails (a deprecated backend enters the build)"
gen: conformance

### SCN-INDEX-3c-2 — [held-out] backend is SCIP, never stack-graphs or LSIF (guard)

source: REQ-INDEX-3c
held_out: true
Given the dependency-axis backend configuration for crate:net (a `rust-analyzer --scip` leg alongside `scip-typescript`)
When the backend identity is asserted
Then it is a version-pinned SCIP binary — 0 `stack-graphs` (archived 2025-09) and 0 LSIF backends wired
teeth: breaks-on "the net dep axis is wired to a `stack-graphs` backend — the SCIP-only assertion fails (a deprecated backend enters the build)"
gen: conformance # held-out; independent backend config

### REQ-INDEX-3d — graph reconstructable given indexer (happy)

### SCN-INDEX-3d-1 — rebuilding twice with the same SCIP indexer yields identical graphs (happy)

source: REQ-INDEX-3d
Given the same file tree + the same version-pinned SCIP indexer fixtures
When `build` runs twice
Then the two dependency graphs are byte-identical — reconstructable **given that indexer**
teeth: breaks-on "the build folds in wall-clock / iteration-order state — the second rebuild's graph differs from the first (not reconstructable)"
gen: conformance

### SCN-INDEX-3d-2 — [held-out] rebuilding twice with the same SCIP indexer yields identical graphs (happy)

source: REQ-INDEX-3d
held_out: true
Given the same crate:net file tree + the same version-pinned SCIP indexer fixtures
When `build` runs twice
Then the two dependency graphs are byte-identical — reconstructable **given that indexer**
teeth: breaks-on "the net build folds in wall-clock / iteration-order state — the second rebuild's graph differs from the first (not reconstructable)"
gen: conformance # held-out; independent net tree

### REQ-INDEX-3e — unresolvable edges declared, never guessed (guard)

### SCN-INDEX-3e-1 — an unresolvable / cross-language edge is declared unresolved, not guessed (guard)

source: REQ-INDEX-3e
Given a TS node calling a Rust binary across an FFI boundary (unseeable by `scip-typescript`)
When the dependency edge is built
Then the edge is recorded `unresolved` with **no target invented**
teeth: breaks-on "the builder guesses a plausible target for the cross-language edge — a fabricated `resolved` edge enters the graph"
gen: conformance

### SCN-INDEX-3e-2 — [held-out] an unresolvable / cross-language edge is declared unresolved, not guessed (guard)

source: REQ-INDEX-3e
held_out: true
Given a TS node calling a Go binary across a cgo FFI boundary (unseeable by `scip-typescript`)
When the dependency edge is built
Then the edge is recorded `unresolved` with **no target invented**
teeth: breaks-on "the builder guesses a plausible target for the `TS→Go` edge — a fabricated `resolved` edge enters the graph"
gen: conformance # held-out; independent TS→Go boundary

---

## REQ-INDEX-4 — path resolution & hierarchy roll-up

### REQ-INDEX-4a — resolve returns covering node (happy)

### SCN-INDEX-4a-1 — resolving a path returns its covering node (happy)

source: REQ-INDEX-4a
Given the spatial axis and the path `"core/cas/cas.ts"`
When `resolve('spatial', "core/cas/cas.ts")` runs
Then it returns file:cas.ts as the covering node (not `undefined`, not the parent module)
teeth: breaks-on "resolve returns the module:cas node instead of the covering file node — the covering-node contract is violated"
gen: conformance # differential vs `index/ref/resolve.ts`

### SCN-INDEX-4a-2 — [held-out] resolving a path returns its covering node (happy)

source: REQ-INDEX-4a
held_out: true
Given the spatial axis and the path `"net/http/client.ts"`
When `resolve('spatial', "net/http/client.ts")` runs
Then it returns file:client.ts as the covering node (not `undefined`, not the parent module)
teeth: breaks-on "resolve returns the module:http node instead of the covering file:client.ts node — the covering-node contract is violated"
gen: conformance # held-out differential vs `index/ref/resolve.ts`

### REQ-INDEX-4b — file query rolls up hierarchy (happy)

### SCN-INDEX-4b-1 — a file query also surfaces its module + crate invariants (happy)

source: REQ-INDEX-4b
Given file:cas.ts with file-anchored invariant `Ifile`, module:cas invariant `Imod`, crate:core invariant `Icrate`
When `byScope("core/cas/cas.ts")` is queried
Then the result surfaces `{Ifile, Imod, Icrate}` — the union of ancestor-anchored invariants
teeth: breaks-on "the resolver returns only the file-anchored `Ifile` — `Imod` and `Icrate` are dropped (no hierarchy roll-up)"
gen: conformance

### SCN-INDEX-4b-2 — [held-out] a file query also surfaces its module + crate invariants (happy)

source: REQ-INDEX-4b
held_out: true
Given file:client.ts with file-anchored invariant `Jfile`, module:http invariant `Jmod`, crate:net invariant `Jcrate`
When `byScope("net/http/client.ts")` is queried
Then the result surfaces `{Jfile, Jmod, Jcrate}` — the union of ancestor-anchored invariants
teeth: breaks-on "the resolver returns only the file-anchored `Jfile` — `Jmod` and `Jcrate` are dropped (no hierarchy roll-up)"
gen: conformance # held-out; independent net hierarchy

---

## REQ-INDEX-5 — the index is the drift oracle

### REQ-INDEX-5a — stale entry visible at query time (happy)

### SCN-INDEX-5a-1 — an entry whose anchor hash ≠ current is visible at query time (happy)

source: REQ-INDEX-5a
Given fact `F` anchored at item:put with anchor hash `bk-11`, after item:put is edited so current hash = `bk-11x`
When `byScope` surfaces `F`
Then `F` is returned visibly marked stale (anchor `bk-11` ≠ current `bk-11x`) — decided inline at query time
teeth: breaks-on "the query compares nothing and returns `F` as FRESH — a drifted fact is served silently"
gen: conformance # differential vs `index/ref/retrieval.ts`

### SCN-INDEX-5a-2 — [held-out] an entry whose anchor hash ≠ current is visible at query time (happy)

source: REQ-INDEX-5a
held_out: true
Given fact `G` anchored at item:send with anchor hash `bk-aa`, after item:send is edited so current hash = `bk-aax`
When `byScope` surfaces `G`
Then `G` is returned visibly marked stale (anchor `bk-aa` ≠ current `bk-aax`) — decided inline at query time
teeth: breaks-on "the query compares nothing and returns `G` as FRESH — a drifted fact is served silently"
gen: conformance # held-out differential vs `index/ref/retrieval.ts`

### REQ-INDEX-5b — stale entry excluded or flagged (guard)

### SCN-INDEX-5b-1 — the stale entry is excluded or flagged, never served clean (guard)

source: REQ-INDEX-5b
Given the same drifted fact `F` (anchor `bk-11` ≠ current `bk-11x`)
When it is retrieved
Then it is flagged stale (or excluded from the FRESH set) — never returned as a clean current fact
teeth: breaks-on "`F` is returned in the FRESH set with no flag — the stale-flag/exclude path is dropped"
gen: conformance

### SCN-INDEX-5b-2 — [held-out] the stale entry is excluded or flagged, never served clean (guard)

source: REQ-INDEX-5b
held_out: true
Given the same drifted fact `G` (anchor `bk-aa` ≠ current `bk-aax`)
When it is retrieved
Then it is flagged stale (or excluded from the FRESH set) — never returned as a clean current fact
teeth: breaks-on "`G` is returned in the FRESH set with no flag — the stale-flag/exclude path is dropped"
gen: conformance # held-out; independent drifted fact

### REQ-INDEX-5c — no re-embedding, no separate sweep (guard)

### SCN-INDEX-5c-1 — drift is detected with 0 re-embedding and 0 sweep (guard)

source: REQ-INDEX-5c
Given the drift check over `F`
When staleness is decided
Then it is decided by a `subtreeHash` comparison at query time — re-embedding-count == 0 and sweep-count == 0
teeth: breaks-on "drift requires a background sweep pass to mark entries — sweep-count == 1 (a separate staleness pass)"
gen: conformance

### SCN-INDEX-5c-2 — [held-out] drift is detected with 0 re-embedding and 0 sweep (guard)

source: REQ-INDEX-5c
held_out: true
Given the drift check over `G`
When staleness is decided
Then it is decided by a `subtreeHash` comparison at query time — re-embedding-count == 0 and sweep-count == 0
teeth: breaks-on "drift over `G` requires a background sweep pass to mark entries — sweep-count == 1 (a separate staleness pass)"
gen: conformance # held-out; independent drift check

---

## REQ-INDEX-6 — three retrieval modes only

### REQ-INDEX-6a — exactly three retrieval modes (happy)

### SCN-INDEX-6a-1 — relevance resolves by exactly scope, dependency, trigger (happy)

source: REQ-INDEX-6a
Given the retrieval surface `{byScope, byDependency, byTrigger}`
When each mode is exercised on the fixture
Then scope→spatial facts, dependency→blast-radius facts, trigger→tag-matched facts all resolve — exactly three modes present
teeth: breaks-on "a mode is missing — `byTrigger` is unimplemented and returns empty for a valid tag (fewer than the three mandated modes resolve)"
gen: conformance # differential vs the closed `index/ref/retrieval.ts` surface

### SCN-INDEX-6a-2 — [held-out] relevance resolves by exactly scope, dependency, trigger (happy)

source: REQ-INDEX-6a
held_out: true
Given the retrieval surface `{byScope, byDependency, byTrigger}` over the net fixture
When each mode is exercised (scope=`net/http/client.ts`, dependency=blast-radius(P), trigger=a tag on item:send)
Then scope→spatial facts, dependency→blast-radius facts, trigger→tag-matched facts all resolve — exactly three modes present
teeth: breaks-on "a mode is missing — `byTrigger` is unimplemented and returns empty for a valid tag on the net fixture (fewer than the three mandated modes resolve)"
gen: conformance # held-out differential vs the closed `index/ref/retrieval.ts` surface

### REQ-INDEX-6b — no fourth mode (guard)

### SCN-INDEX-6b-1 — a fourth-mode request does not resolve (guard)

source: REQ-INDEX-6b
Given a relevance request through a free-text / similarity mode token `"search:acme"`
When it is issued to the retrieval surface
Then it does not resolve (returns empty / no such entry point) — the surface exposes no `search()`
teeth: breaks-on "a similarity `search()` entry point is added and resolves the free-text request — a fourth retrieval mode exists"
gen: conformance

### SCN-INDEX-6b-2 — [held-out] a fourth-mode request does not resolve (guard)

source: REQ-INDEX-6b
held_out: true
Given a relevance request through a free-text / similarity mode token `"semantic:payments"`
When it is issued to the retrieval surface
Then it does not resolve (returns empty / no such entry point) — the surface exposes no `search()`
teeth: breaks-on "a similarity `search()` entry point is added and resolves the `semantic:payments` request — a fourth retrieval mode exists"
gen: conformance # held-out; independent free-text token

---

## REQ-INDEX-7 — no embeddings / no RAG

### REQ-INDEX-7a — no embeddings, vector store, or ANN (guard)

### SCN-INDEX-7a-1 — no embedding model / vector store / ANN backs the index (guard)

source: REQ-INDEX-7a
Given the retrieval-path module graph
When it is audited for embedding / vector / ANN dependencies
Then 0 such dependencies are found — retrieval is pure lookup over the CAS/axes
teeth: breaks-on "a vector-store client is imported on the retrieval path — the no-embeddings assertion fails (RAG enters the substrate)"
gen: conformance

### SCN-INDEX-7a-2 — [held-out] no embedding model / vector store / ANN backs the index (guard)

source: REQ-INDEX-7a
held_out: true
Given the retrieval-path module graph for the net fixture
When it is audited for embedding / vector / ANN dependencies
Then 0 such dependencies are found — retrieval is pure lookup over the CAS/axes
teeth: breaks-on "a vector-store client is imported on the net retrieval path — the no-embeddings assertion fails (RAG enters the substrate)"
gen: conformance # held-out; independent retrieval graph

---

## REQ-INDEX-8 — deterministic results (query determinism · PBT)

### REQ-INDEX-8a — identical queries byte-identical results (happy)

### SCN-INDEX-8a-1 — two identical queries return byte-identical results (happy)

source: REQ-INDEX-8a
Given the CAS snapshot fixed and query `q = byScope("core/cas/cas.ts")`
When `run(q)` is executed twice
Then `run(q) == run(q)` byte-for-byte, including result ordering (a total deterministic sort)
teeth: breaks-on "results are ordered by `Map`-iteration / insertion order — the two runs differ in element order (nondeterministic bytes)"
gen: PBT # witness of the query-idempotence law `run(q)==run(q)` (`index/ref/retrieval.ts`)

---

## REQ-INDEX-9 — total (malformed → empty, never throws)

### REQ-INDEX-9a — malformed input yields empty result (happy)

### SCN-INDEX-9a-1 — malformed / missing path, tag, or axis yields an empty result (happy)

source: REQ-INDEX-9a
Given malformed inputs `{axis:"spat!al", path:"", tag:null}` fuzzed over every entry point (PBT-fuzz stream)
When each entry point is invoked
Then each returns an **empty** result (never a populated wrong answer)
teeth: breaks-on "a malformed axis falls through to a default axis and returns non-empty results (a wrong hit instead of empty)"
gen: conformance # PBT-fuzz **differential** vs the total `index/ref/*.ts` (tag stays reference-model per §INV-INDEX-9)

### SCN-INDEX-9a-2 — [held-out] malformed / missing path, tag, or axis yields an empty result (happy)

source: REQ-INDEX-9a
held_out: true
Given malformed inputs `{axis:"dep#ndency", path:"   ", tag:undefined}` fuzzed over every entry point (PBT-fuzz stream, distinct seed)
When each entry point is invoked
Then each returns an **empty** result (never a populated wrong answer)
teeth: breaks-on "the malformed axis `dep#ndency` falls through to a default axis and returns non-empty results (a wrong hit instead of empty)"
gen: conformance # held-out PBT-fuzz differential vs the total `index/ref/*.ts`

### REQ-INDEX-9b — malformed input never throws (guard)

### SCN-INDEX-9b-1 — malformed input yields a rejection/empty, never an exception (guard)

source: REQ-INDEX-9b
Given the same PBT-fuzz stream of malformed inputs across all entry points (10k cases, corner-biased)
When each is invoked
Then 0 exceptions thrown — every path returns empty, and prod matches the total reference
teeth: breaks-on "`resolve('bad-axis')` throws a `TypeError` instead of returning empty — a non-total path"
gen: conformance

### SCN-INDEX-9b-2 — [held-out] malformed input yields a rejection/empty, never an exception (guard)

source: REQ-INDEX-9b
held_out: true
Given the same PBT-fuzz stream of malformed inputs across all entry points (10k cases, corner-biased, distinct seed)
When each is invoked
Then 0 exceptions thrown — every path returns empty, and prod matches the total reference
teeth: breaks-on "`resolve('dep#ndency')` throws a `RangeError` instead of returning empty — a non-total path"
gen: conformance # held-out; independent fuzz seed

---

## REQ-INDEX-10 — multi-axis, single store

### REQ-INDEX-10a — expose at least three axes (happy)

### SCN-INDEX-10a-1 — the index exposes ≥3 axes, each with its own rollup (happy)

source: REQ-INDEX-10a
Given the built index
When the axis set is enumerated
Then it contains `{spatial, territory, dependency}` (axis-count ≥ 3), each owning its own rollup
teeth: breaks-on "the territory axis shares the spatial rollup instead of owning one — a hierarchy without its own rollup (axis-count effectively < 3)"
gen: conformance # differential vs `index/ref/index.ts`

### SCN-INDEX-10a-2 — [held-out] the index exposes ≥3 axes, each with its own rollup (happy)

source: REQ-INDEX-10a
held_out: true
Given the built index over crate:net
When the axis set is enumerated
Then it contains `{spatial, territory, dependency}` (axis-count ≥ 3), each owning its own rollup
teeth: breaks-on "the territory axis shares the spatial rollup instead of owning one — a hierarchy without its own rollup (axis-count effectively < 3)"
gen: conformance # held-out differential vs `index/ref/index.ts`

### REQ-INDEX-10b — cross-index on all applicable axes (happy)

### SCN-INDEX-10b-1 — one object is cross-indexed on all applicable axes (happy)

source: REQ-INDEX-10b
Given item:put in file:cas.ts, owned by territory `cas` (dana/T1), with a `depends-on` edge
When it is indexed
Then it is reachable via spatial (its file), territory (its owner+tier), and dependency (its edges) — cross-indexed on all three
teeth: breaks-on "the object is indexed only on spatial — a dependency query on item:put misses it (not cross-indexed)"
gen: conformance

### SCN-INDEX-10b-2 — [held-out] one object is cross-indexed on all applicable axes (happy)

source: REQ-INDEX-10b
held_out: true
Given item:send in file:client.ts, owned by territory `http` (frank/T1), with a `depends-on` edge
When it is indexed
Then it is reachable via spatial (its file), territory (its owner+tier), and dependency (its edges) — cross-indexed on all three
teeth: breaks-on "item:send is indexed only on spatial — a dependency query on item:send misses it (not cross-indexed)"
gen: conformance # held-out; independent object

### REQ-INDEX-10c — object never duplicated (guard)

### SCN-INDEX-10c-1 — the object is stored once, never duplicated across axes (guard)

source: REQ-INDEX-10c
Given item:put cross-indexed on spatial, territory, and dependency
When `object-storage-count` for its hash is asserted
Then `object-storage-count == 1` — the axes reference it by hash, no copy per axis
teeth: breaks-on "each axis stores its own copy of the object — `object-storage-count == 3` (duplication across axes)"
gen: conformance

### SCN-INDEX-10c-2 — [held-out] the object is stored once, never duplicated across axes (guard)

source: REQ-INDEX-10c
held_out: true
Given item:send cross-indexed on spatial, territory, and dependency
When `object-storage-count` for its hash is asserted
Then `object-storage-count == 1` — the axes reference it by hash, no copy per axis
teeth: breaks-on "each axis stores its own copy of item:send — `object-storage-count == 3` (duplication across axes)"
gen: conformance # held-out; independent object

---

## REQ-INDEX-11 — universal content-addressing

### REQ-INDEX-11a — every object is BLAKE3 CAS (happy)

### SCN-INDEX-11a-1 — every object kind incl. a Doc is a BLAKE3-keyed CAS object (happy)

source: REQ-INDEX-11a
Given one each of `{CodeNode, GroundedFact, MemoryEntry, Provenance, Transcript, Doc}`
When each is `put()`
Then each is keyed by `blake3(canonical(object))` into the one CAS and round-trips `get(hash)==object` — including the Doc
teeth: breaks-on "Doc objects bypass content-addressing and go to a side doc-store — `get(hash(doc))` misses (a kind is un-addressed)"
gen: conformance # `index/ref/cas.ts` (shares KERNEL `kernel/ref/store.ts`)

### SCN-INDEX-11a-2 — [held-out] every object kind incl. a Doc is a BLAKE3-keyed CAS object (happy)

source: REQ-INDEX-11a
held_out: true
Given one each of `{CodeNode, GroundedFact, MemoryEntry, Provenance, Transcript, Doc}` drawn from the net fixture
When each is `put()`
Then each is keyed by `blake3(canonical(object))` into the one CAS and round-trips `get(hash)==object` — including the Doc
teeth: breaks-on "the net Doc object bypasses content-addressing and goes to a side doc-store — `get(hash(doc))` misses (a kind is un-addressed)"
gen: conformance # held-out; `index/ref/cas.ts` (shares KERNEL `kernel/ref/store.ts`)

### REQ-INDEX-11b — every object grounded and drift-checked (happy)

### SCN-INDEX-11b-1 — every object is grounded + drift-checked like any fact (happy)

source: REQ-INDEX-11b
Given a Doc that cites code at item:put@`bk-11`
When item:put is edited to `bk-11x`
Then the Doc is flagged stale exactly like a `GroundedFact` — it is drift-eligible / grounded
teeth: breaks-on "Docs are exempt from drift-checking — editing the cited code leaves the Doc FRESH (a kind escapes grounding)"
gen: conformance

### SCN-INDEX-11b-2 — [held-out] every object is grounded + drift-checked like any fact (happy)

source: REQ-INDEX-11b
held_out: true
Given a Doc that cites code at item:send@`bk-aa`
When item:send is edited to `bk-aax`
Then the Doc is flagged stale exactly like a `GroundedFact` — it is drift-eligible / grounded
teeth: breaks-on "the net Doc is exempt from drift-checking — editing item:send leaves the Doc FRESH (a kind escapes grounding)"
gen: conformance # held-out; independent cited code

---

## REQ-INDEX-12 — dual rollup, bounded re-check (boundedness + locality · PBT)

### REQ-INDEX-12a — each node carries rId and rState (happy)

### SCN-INDEX-12a-1 — each axis node carries rId (structure) and rState (status+freshness) (happy)

source: REQ-INDEX-12a
Given axis node module:cas
When its `Rollup` is read
Then it carries both `rId` = BLAKE3 over sorted child hashes **and** `rState` = BLAKE3 over `(hash‖status‖freshness)` — two distinct roots
teeth: breaks-on "the node carries a single combined hash — a status flip changes `rId`, conflating structure with state"
gen: PBT # witness of the rId/rState separation (`index/ref/fold.ts`)

### REQ-INDEX-12b — Delta distinguishes structure from state (happy)

### SCN-INDEX-12b-1 — a Delta distinguishes a structure change from a state change (happy)

source: REQ-INDEX-12b
Given `before`/`after` where only a status flipped on item:put (no structural change)
When `delta(before, after)` is computed
Then `Delta = {idChanged:false, stateChanged:true}` — the two are distinguished
teeth: breaks-on "any state flip also sets `idChanged:true` — structure and state are conflated (a status change looks like a shape change)"
gen: PBT

### REQ-INDEX-12c — Delta names changed buckets (happy)

### SCN-INDEX-12c-1 — the Delta names exactly the changed buckets (happy)

source: REQ-INDEX-12c
Given an edit to block b1 under file:cas.ts
When `delta` is computed
Then `changedBuckets == ["repo:atlas","crate:core","module:cas","file:cas.ts","b1"]` — exactly the affected buckets, nothing else
teeth: breaks-on "`changedBuckets` lists every bucket in the axis — unaffected file:store.ts appears (re-checks are no longer scoped)"
gen: PBT

### REQ-INDEX-12d — re-check touches only affected buckets (guard)

### SCN-INDEX-12d-1 — a re-check touches only the affected buckets, never N (guard)

source: REQ-INDEX-12d
Given a store of `N=500` buckets and an edit confined to the 5-bucket leaf→root path
When the re-check runs off the `Delta`
Then touch-count == 5 (the changed buckets), never 500 — independent of `N`
teeth: breaks-on "the re-check folds the whole store — touch-count == 500 (O(N), the Delta scoping is ignored)"
gen: PBT # boundedness-vs-N law witness

### REQ-INDEX-12e — spatial rId re-hash is leaf→root only (happy)

### SCN-INDEX-12e-1 — the spatial rId re-hash is the changed leaf→root path only (happy)

source: REQ-INDEX-12e
Given the spatial tree and an edit to block b1
When `rId` is re-hashed
Then the set of re-hashed `rId` nodes == `{b1, file:cas.ts, module:cas, crate:core, repo:atlas}` — the leaf→root path, siblings untouched
teeth: breaks-on "the spatial `rId` re-hash walks siblings too — file:store.ts's `rId` is recomputed on an edit that never touched it"
gen: PBT # spatial locality law witness

### REQ-INDEX-12f — dependency fold eager re-hash bounded (guard)

### SCN-INDEX-12f-1 — the dependency rState eager re-hash is bounded, never O(blast-radius) (guard)

source: REQ-INDEX-12f
Given the reverse-closure chain `A←B←C←D←E` (blast-radius 4) and an edit at A
When the eager `rState` re-hash runs (instrumented touch-counter)
Then the eager re-hash count ≤ `|nodes-within-maxHops(2)|` = 2 (B, C), never 4 — independent of blast-radius
teeth: breaks-on "the fold eagerly re-hashes the whole reverse closure — eager count == 4 (O(blast-radius); the re-hash cascades, the bound is gone)"
gen: PBT # the "never O(blast-radius)" boundedness law — the block's highest-value witness

### REQ-INDEX-12g — edit propagates drift dirty-bit eagerly (happy)

### SCN-INDEX-12g-1 — an edit propagates a drift dirty-bit eagerly across the whole reverse closure (happy)

source: REQ-INDEX-12g
Given the chain `A←B←C←D←E` and an edit at A
When `propagateDirty` runs
Then every node in the reverse closure `{B,C,D,E}` carries a set drift dirty-bit (a cheap O(1)/node flag) — the whole closure is marked eagerly
teeth: breaks-on "the dirty-bit stops at `maxHops=2` — D and E are never marked dirty, so a later query treats them as FRESH despite the upstream edit (transitive drift missed)"
gen: PBT # note: the _bit_ propagates eagerly across the FULL closure; only the _hash_ re-compute is capped (12i)

### REQ-INDEX-12h — rState hash recomputed lazily on-read (happy)

### SCN-INDEX-12h-1 — the rState hash is recomputed lazily, on read (happy)

source: REQ-INDEX-12h
Given node D (dirty-bit set, beyond `maxHops`) after the edit at A
When no query touches D
Then D's `rState` hash is **not** eagerly recomputed — recomputation happens only on the read of D
teeth: breaks-on "`rState` is recomputed eagerly for D at edit time — the lazy-on-read contract collapses into an eager O(blast-radius) fold"
gen: PBT

### REQ-INDEX-12i — eager re-hash capped at maxHops=2 (happy)

### SCN-INDEX-12i-1 — the eager re-hash is capped at maxHops=2 (happy)

source: REQ-INDEX-12i
Given the chain `A←B(hop1)←C(hop2)←D(hop3)←E(hop4)`, edit at A
When the eager re-hash runs
Then only B (hop1) and C (hop2) are eagerly re-hashed — the cap is exactly `maxHops=2`
teeth: breaks-on "the cap is raised to 3 — D (hop3) is eagerly re-hashed, breaching the `maxHops=2` bound (re-hash cascade begins)"
gen: PBT # the maxHops=2 cap witness — assert eager touch-count ≤ 2

### REQ-INDEX-12j — deeper node marked state-suspect (guard)

### SCN-INDEX-12j-1 — a node deeper than maxHops=2 is marked state-suspect (guard)

source: REQ-INDEX-12j
Given D (hop3) and E (hop4), beyond the cap, after the edit at A
When the fold completes
Then D and E are marked `state-suspect` — neither silently FRESH nor eagerly resolved
teeth: breaks-on "D is left unmarked (neither re-hashed nor `state-suspect`) — a deep node is silently served as FRESH"
gen: PBT

### REQ-INDEX-12k — state-suspect resolved only on query (guard)

### SCN-INDEX-12k-1 — a state-suspect node is resolved only when queried (guard)

source: REQ-INDEX-12k
Given D marked `state-suspect`
When D is never queried, then later queried
Then D's `rState` stays unresolved until that query, and is resolved at the query (not before)
teeth: breaks-on "`state-suspect` nodes are resolved by a background pass before any query — reintroducing the eager O(blast-radius) fold the cap was meant to avoid"
gen: PBT

---

## REQ-INDEX-13 — unresolved edges are explicit

### REQ-INDEX-13a — record unresolvable edges explicitly (happy)

### SCN-INDEX-13a-1 — every unresolvable call and cross-language boundary is an explicit unresolved/dynamic edge (happy)

source: REQ-INDEX-13a
Given a dynamic-dispatch call `C ⇢ ?` and a cross-language edge `TS→Rust binary`
When the `depends-on` graph is built
Then both appear as explicit `unresolved`/`dynamic` edges in the graph (present, tagged)
teeth: breaks-on "the dynamic-dispatch edge is dropped from the graph — a real coupling silently disappears"
gen: conformance # differential vs `index/ref/depgraph.ts`

### SCN-INDEX-13a-2 — [held-out] every unresolvable call and cross-language boundary is an explicit unresolved/dynamic edge (happy)

source: REQ-INDEX-13a
held_out: true
Given a dynamic-dispatch call `R ⇢ ?` and a cross-language edge `TS→Go binary`
When the `depends-on` graph is built
Then both appear as explicit `unresolved`/`dynamic` edges in the graph (present, tagged)
teeth: breaks-on "the `R ⇢ ?` dynamic-dispatch edge is dropped from the graph — a real coupling silently disappears"
gen: conformance # held-out differential vs `index/ref/depgraph.ts`

### REQ-INDEX-13b — never silently omit an edge (guard)

### SCN-INDEX-13b-1 — an unresolvable edge is never silently omitted (guard)

source: REQ-INDEX-13b
Given a reflection-based call the SCIP indexer cannot resolve
When the graph is built and edge-count is compared to the reference
Then the reflection edge is present as `unresolved` — 0 silent omissions
teeth: breaks-on "the unresolvable reflection edge is omitted rather than recorded — edge-count is short by one vs the reference (silent omission)"
gen: conformance

### SCN-INDEX-13b-2 — [held-out] an unresolvable edge is never silently omitted (guard)

source: REQ-INDEX-13b
held_out: true
Given a DI / runtime-wiring call the SCIP indexer cannot resolve
When the graph is built and edge-count is compared to the reference
Then the DI-wiring edge is present as `unresolved` — 0 silent omissions
teeth: breaks-on "the unresolvable DI-wiring edge is omitted rather than recorded — edge-count is short by one vs the reference (silent omission)"
gen: conformance # held-out; independent DI-wiring call

### REQ-INDEX-13c — never fabricate a resolved target (guard)

### SCN-INDEX-13c-1 — an unresolvable edge never gets a fabricated resolved target (guard)

source: REQ-INDEX-13c
Given the cross-language `TS→Rust` edge
When the graph is built
Then the edge's target is `unresolved`, never a guessed concrete node
teeth: breaks-on "the builder fabricates a resolved target for the FFI edge — a phantom `resolved` edge to an invented node"
gen: conformance

### SCN-INDEX-13c-2 — [held-out] an unresolvable edge never gets a fabricated resolved target (guard)

source: REQ-INDEX-13c
held_out: true
Given the cross-language `TS→Go` edge
When the graph is built
Then the edge's target is `unresolved`, never a guessed concrete node
teeth: breaks-on "the builder fabricates a resolved target for the `TS→Go` edge — a phantom `resolved` edge to an invented node"
gen: conformance # held-out; independent TS→Go edge

### SCN-INDEX-13c-3 — a SCIP `local` symbol never gets a fabricated CROSS-DOCUMENT resolved target (guard, #189)

source: REQ-INDEX-13c
Given two documents that each define the SCIP-spec `local 2` symbol (document-scoped per the SCIP symbol
grammar, `<symbol> ::= … | 'local ' <local-id>` — unrelated to any other document's `local 2`) and each
reference it
When the dependency edge ledger is built
Then neither document's `local 2` reference produces ANY edge — no `resolved` edge joins the two documents,
and no `unresolved` edge is fabricated in its place either
teeth: breaks-on "`deriveEdges` keys its definition map on the RAW SCIP symbol string in a single GLOBAL
`Map`, so two documents' unrelated `local 2` symbols collide and the second document's reference resolves
to the first document's definition — a fabricated cross-document `resolved` edge the SCIP data never
asserted (measured on this repo's real `.atlas/index.scip`: 277 symbols defined in >1 document pre-fix,
6,753 total edges collapsing to 2,202 post-fix)"
gen: conformance

### REQ-INDEX-13d — closure reported under-approximate (happy)

### SCN-INDEX-13d-1 — a reverse closure over a node with unresolved edges in scope reports under-approximate (happy)

source: REQ-INDEX-13d
Given the reverse closure of A that includes C, where C has an `unresolved` edge in scope
When `reverseClosure(A)` is computed
Then it is reported `{underApprox: true}`
teeth: breaks-on "the closure reports `underApprox:false` despite an unresolved edge in scope — presented as complete"
gen: conformance

### SCN-INDEX-13d-2 — [held-out] a reverse closure over a node with unresolved edges in scope reports under-approximate (happy)

source: REQ-INDEX-13d
held_out: true
Given the reverse closure of P that includes R, where R has an `unresolved` edge in scope
When `reverseClosure(P)` is computed
Then it is reported `{underApprox: true}`
teeth: breaks-on "the closure reports `underApprox:false` despite R's unresolved edge in scope — presented as complete"
gen: conformance # held-out; independent reverse closure

### REQ-INDEX-13e — under-approximate closure unions coChanged (happy)

### SCN-INDEX-13e-1 — an under-approximate closure unions the coChanged band, labeled correlational (happy)

source: REQ-INDEX-13e
Given `reverseClosure(A)` flagged under-approximate, with C's `coChanged` git-history band = `{P, Q}`
When the closure is returned
Then it unions `{P, Q}` into the result, each labeled `correlational` (never a static edge)
teeth: breaks-on "the `coChanged` band is unioned but labeled as static resolved edges — correlational hits masquerade as static edges"
gen: conformance

### SCN-INDEX-13e-2 — [held-out] an under-approximate closure unions the coChanged band, labeled correlational (happy)

source: REQ-INDEX-13e
held_out: true
Given `reverseClosure(P)` flagged under-approximate, with R's `coChanged` git-history band = `{M, N}`
When the closure is returned
Then it unions `{M, N}` into the result, each labeled `correlational` (never a static edge)
teeth: breaks-on "the `coChanged` band `{M, N}` is unioned but labeled as static resolved edges — correlational hits masquerade as static edges"
gen: conformance # held-out; independent coChanged band

### REQ-INDEX-13f — never presented as complete or static (guard)

### SCN-INDEX-13f-1 — an under-approximate closure is never presented as complete or as static edges (guard)

source: REQ-INDEX-13f
Given the under-approximate `reverseClosure(A)` with its correlational `coChanged` band
When the closure is presented
Then it carries the `under-approximate` flag and the `correlational` labels — never presented as complete/static
teeth: breaks-on "the flag and labels are stripped on presentation — the closure is shown as a complete static blast radius"
gen: conformance

### SCN-INDEX-13f-2 — [held-out] an under-approximate closure is never presented as complete or as static edges (guard)

source: REQ-INDEX-13f
held_out: true
Given the under-approximate `reverseClosure(P)` with its correlational `coChanged` band `{M, N}`
When the closure is presented
Then it carries the `under-approximate` flag and the `correlational` labels — never presented as complete/static
teeth: breaks-on "the flag and labels are stripped on presentation — the P closure is shown as a complete static blast radius"
gen: conformance # held-out; independent closure presentation

---

## REQ-INDEX-14 — territory schema & overlap resolution (tie-break + determinism · PBT)

### REQ-INDEX-14a — assignment derives from hashed manifest (happy)

### SCN-INDEX-14a-1 — territory assignment derives from the hashed manifest (happy)

source: REQ-INDEX-14a
Given the hashed `territories` manifest and unit `"core/cas/cas.ts"`
When `assign(path, manifest)` runs
Then the unit is assigned `{owner, tier}` derived purely from the manifest (keyed by the manifest hash)
teeth: breaks-on "assignment reads `owner` from a hardcoded map instead of the hashed manifest — changing the manifest does not change the assignment"
gen: PBT # `index/ref/territory.ts`

### REQ-INDEX-14b — overlap resolves deterministically (happy)

### SCN-INDEX-14b-1 — overlapping globs resolve by longest-path-match, then declaration order (happy)

source: REQ-INDEX-14b
Given `T0{owner:charlie, globs:["core/**"], decl0}` and `T1{owner:dana, globs:["core/cas/**"], decl1}`, unit `"core/cas/cas.ts"` matched by both
When `assign` runs
Then the unit resolves to a single `{owner:dana, tier:T1}` — `"core/cas/**"` is the longer path-match (declaration order is only the tiebreak when specificity ties)
teeth: breaks-on "the tie-break is mutated to first-declaration-wins regardless of specificity — the unit resolves to charlie (the shorter glob), violating longest-path-match"
gen: PBT # tie-break law witness (cf. RETR-6 drop-order)

### REQ-INDEX-14c — assignment byte-identical across rebuilds (happy)

### SCN-INDEX-14c-1 — assignment is byte-identical across rebuilds (happy)

source: REQ-INDEX-14c
Given the same manifest and file tree
When `assign` runs twice over every unit
Then both runs produce byte-identical `owner+tier` assignments for every unit
teeth: breaks-on "assignment iterates globs in `Map`/hash-set order — the two rebuilds assign an overlap unit to different owners (nondeterministic)"
gen: PBT # determinism/byte-identity law witness

### REQ-INDEX-14d — unmatched path flagged uncovered (guard)

### SCN-INDEX-14d-1 — a path matched by no glob is flagged uncovered (guard)

source: REQ-INDEX-14d
Given unit `"scripts/tmp.sh"` matched by no glob in the manifest
When `assign` runs
Then the unit is flagged `uncovered` — a verdict, not a silent pass
teeth: breaks-on "an unmatched path is silently assigned to a default owner instead of flagged `uncovered` — the coverage verdict is lost"
gen: PBT

### REQ-INDEX-14e — T0-adjacent uncovered defaults to deny (guard)

### SCN-INDEX-14e-1 — a T0-adjacent uncovered path defaults to deny (guard)

source: REQ-INDEX-14e
Given `"core/cas/new.ts"` uncovered but sharing `region:cas` with a T0 member
When assignment resolves it
Then it defaults to `deny` until an owner assigns it
teeth: breaks-on "a T0-adjacent uncovered path defaults to `allow` — an ungoverned unit sits beside T0 code with no deny gate"
gen: PBT

### REQ-INDEX-14f — assignment calls no model (guard)

### SCN-INDEX-14f-1 — assignment calls no model (guard)

source: REQ-INDEX-14f
Given the assignment run over the fixture
When `model-call-count` is asserted on the `assign` path
Then it is 0 — resolution is pure glob matching + declaration order
teeth: breaks-on "an LLM is consulted to disambiguate an overlap — `model-call-count == 1` (nondeterministic, non-reconstructable assignment)"
gen: PBT

---

## REQ-INDEX-15 — territory ownership is generated + reconciled

### REQ-INDEX-15a — owner generated from graph and blame (happy · DEFINE-parametric optional feature)

> **DEFINE dependency:** INDEX-15a's clause is normatively `SHOULD` ("owner SHOULD be generated…") projected
> with a `shall` (`req-idx.md` [NEEDS RECONCILIATION]). This golden is an **optional-feature** case, **gated on
> owner-generation being ENABLED**. Whether generation is a hard MUST or a recommended default is a DEFINE-seat
> call; the MUST teeth 15b–15e hold regardless of that reconciliation. The method-tag (`reference-model`) is
> unaffected (`method-tags-idx.md` §INV-INDEX-15).

### SCN-INDEX-15a-1 — [DEFINE-parametric] where owner-generation is enabled, owner is generated from graph + blame (happy)

source: REQ-INDEX-15a
Given owner-generation **ENABLED** (the optional feature), an empty manifest, and structural graph + git-blame showing charlie authored 80% of `territory:cas`
When `reconcile(graph, blame, manifest)` runs
Then `territory:cas` owner is generated = charlie, deterministically from graph+blame, `$0`-LLM
teeth: breaks-on "with generation enabled, `owner` is left null/unassigned despite blame evidence — the SHOULD-projected generation path is a no-op"
gen: conformance # differential vs `index/ref/ownership.ts`; feature-gated (optional)

> **Held-out EXEMPT (Wave H):** SCN-INDEX-15a-1 gets **no** second held-out fixture — it is the block's one
> **DEFINE-parametric** SCN (owner-generation is `SHOULD`, projected with a `shall`; the enable/mandate call is a
> DEFINE-seat dependency, `req-idx.md` [NEEDS RECONCILIATION]). A held-out leg for an optional, un-ratified
> feature-gate would assert a behaviour the frozen sources do not yet fix. Exempt + flagged; the **MUST** teeth
> 15b–15e each carry an independent held-out fixture below.

### REQ-INDEX-15b — explicit override beats generated owner (guard)

### SCN-INDEX-15b-1 — an explicit manifest override beats the generated owner (guard)

source: REQ-INDEX-15b
Given a generated owner for `territory:cas` = charlie, and an explicit manifest override `owner = dana`
When reconciliation applies the override-precedence layer
Then the resolved owner is dana — the explicit override wins
teeth: breaks-on "the generated owner beats the override — resolved owner is charlie despite the explicit `dana` override (precedence inverted)"
gen: conformance

### SCN-INDEX-15b-2 — [held-out] an explicit manifest override beats the generated owner (guard)

source: REQ-INDEX-15b
held_out: true
Given a generated owner for `territory:http` = frank, and an explicit manifest override `owner = grace`
When reconciliation applies the override-precedence layer
Then the resolved owner is grace — the explicit override wins
teeth: breaks-on "the generated owner beats the override — resolved owner is frank despite the explicit `grace` override (precedence inverted)"
gen: conformance # held-out; independent territory + owners

### REQ-INDEX-15c — reconciliation deterministic and zero-LLM (happy)

### SCN-INDEX-15c-1 — ownership reconciliation is deterministic and zero-LLM (happy)

source: REQ-INDEX-15c
Given the same `(graph, blame, manifest)` inputs
When `reconcile` runs twice
Then both runs produce byte-identical ownership and `model-call-count == 0`
teeth: breaks-on "reconciliation consults a model to pick an owner — `model-call-count == 1` and reruns can differ (nondeterministic)"
gen: conformance

### SCN-INDEX-15c-2 — [held-out] ownership reconciliation is deterministic and zero-LLM (happy)

source: REQ-INDEX-15c
held_out: true
Given the same `(graph, blame, manifest)` inputs for the net fixture
When `reconcile` runs twice
Then both runs produce byte-identical ownership and `model-call-count == 0`
teeth: breaks-on "reconciliation over the net fixture consults a model to pick an owner — `model-call-count == 1` and reruns can differ (nondeterministic)"
gen: conformance # held-out; independent inputs

### REQ-INDEX-15d — tier stays human-ratified (guard)

### SCN-INDEX-15d-1 — tier stays human-ratified, never generated (guard)

source: REQ-INDEX-15d
Given the reconciler over `(graph, blame, manifest)` where `tier T0` is human-ratified in the manifest
When reconciliation runs
Then `tier` is passed through untouched = T0 — no mechanical tier is generated
teeth: breaks-on "the reconciler generates a `tier` from blast-radius/criticality heuristics — `tier` is mechanically overwritten (human ratification bypassed)"
gen: conformance

### SCN-INDEX-15d-2 — [held-out] tier stays human-ratified, never generated (guard)

source: REQ-INDEX-15d
held_out: true
Given the reconciler over `(graph, blame, manifest)` where `tier T0` is human-ratified for `territory:net`
When reconciliation runs
Then `tier` is passed through untouched = T0 — no mechanical tier is generated
teeth: breaks-on "the reconciler generates a `tier` for `territory:net` from blast-radius/criticality heuristics — `tier` is mechanically overwritten (human ratification bypassed)"
gen: conformance # held-out; independent territory

### REQ-INDEX-15e — manifest not sole ownership source (guard)

### SCN-INDEX-15e-1 — the manifest is not the sole hand-authored ownership source (guard)

source: REQ-INDEX-15e
Given an empty/partial manifest with owner-generation available
When ownership is resolved for a territory not listed in the manifest
Then an owner is still resolved from graph+blame — the manifest is an override layer, not the sole source
teeth: breaks-on "an unlisted territory has no owner because the manifest is treated as the sole source — ownership collapses to hand-authored manifest only (CODEOWNERS-rot)"
gen: conformance

### SCN-INDEX-15e-2 — [held-out] the manifest is not the sole hand-authored ownership source (guard)

source: REQ-INDEX-15e
held_out: true
Given an empty/partial manifest with owner-generation available
When ownership is resolved for `territory:http`, not listed in the manifest
Then an owner is still resolved from graph+blame — the manifest is an override layer, not the sole source
teeth: breaks-on "`territory:http` has no owner because the manifest is treated as the sole source — ownership collapses to hand-authored manifest only (CODEOWNERS-rot)"
gen: conformance # held-out; independent unlisted territory

---

## REQ-INDEX-16 — coverage gate is standing, not reactive

### REQ-INDEX-16a — publish unresolved-edge ratio per territory (happy)

### SCN-INDEX-16a-1 — the unresolved-edge ratio is published per-territory on every rollup (happy)

source: REQ-INDEX-16a
Given `territory:cas` with 3 unresolved of 20 total edges
When the territory rollup is computed
Then the rollup publishes `ratio(cas) = 3/20 = 0.15` as a readable per-territory health metric
teeth: breaks-on "the rollup omits the `ratio` field — unresolved coverage is not published (invisible health)"
gen: conformance # differential vs `index/ref/coverage.ts`

### SCN-INDEX-16a-2 — [held-out] the unresolved-edge ratio is published per-territory on every rollup (happy)

source: REQ-INDEX-16a
held_out: true
Given `territory:net` with 5 unresolved of 20 total edges
When the territory rollup is computed
Then the rollup publishes `ratio(net) = 5/20 = 0.25` as a readable per-territory health metric
teeth: breaks-on "the net rollup omits the `ratio` field — unresolved coverage is not published (invisible health)"
gen: conformance # held-out differential vs `index/ref/coverage.ts`

### REQ-INDEX-16b — enforce T0 ceiling as standing gate (happy)

### SCN-INDEX-16b-1 — the T0 ceiling is enforced as a standing gate from day one (happy)

source: REQ-INDEX-16b
Given a T0 territory with ratio 0.20 (> 0.15) at first build
When the standing coverage gate runs at build time
Then the gate is active from day one and evaluates the ceiling (not deferred to the `functional` axis)
teeth: breaks-on "the gate is scheduled for a later `functional`-axis milestone — no ceiling is enforced at build time on day one"
gen: conformance

### SCN-INDEX-16b-2 — [held-out] the T0 ceiling is enforced as a standing gate from day one (happy)

source: REQ-INDEX-16b
held_out: true
Given a T0 `territory:net` with ratio 0.25 (> 0.15) at first build
When the standing coverage gate runs at build time
Then the gate is active from day one and evaluates the ceiling (not deferred to the `functional` axis)
teeth: breaks-on "the net gate is scheduled for a later `functional`-axis milestone — no ceiling is enforced at build time on day one"
gen: conformance # held-out; independent T0 territory

### REQ-INDEX-16c — crossing ceiling fails the gate (guard)

### SCN-INDEX-16c-1 — a T0 territory crossing the ceiling fails the gate (guard)

source: REQ-INDEX-16c
Given T0 `territory:cas` with `unresolved/total = 0.20 > 0.15`
When `gate(cas)` evaluates
Then it **FAILs** the build (not merely schedules the `functional` axis)
teeth: breaks-on "crossing the ceiling only logs a warning / schedules the `functional` axis and the build stays green — the T0 gate has no teeth"
gen: conformance

### SCN-INDEX-16c-2 — [held-out] a T0 territory crossing the ceiling fails the gate (guard)

source: REQ-INDEX-16c
held_out: true
Given T0 `territory:net` with `unresolved/total = 5/20 = 0.25 > 0.15`
When `gate(net)` evaluates
Then it **FAILs** the build (not merely schedules the `functional` axis)
teeth: breaks-on "crossing the ceiling in `territory:net` only logs a warning / schedules the `functional` axis and the build stays green — the T0 gate has no teeth"
gen: conformance # held-out; independent T0 territory

### REQ-INDEX-17a — dependency axis addresses, does not commit (guard, #191)

### SCN-INDEX-17a-1 — editing a file's content moves its spatial hash but not its dependency-axis hash (guard, #191)

source: REQ-INDEX-17a
Given a file `cas.ts` present on both the `spatial` and `dependency` axes of a built index
When `cas.ts`'s content is edited and the index is rebuilt
Then `cas.ts`'s `spatial`-axis `subtreeHash` CHANGES, but its `dependency`-axis node's `subtreeHash` stays
byte-identical — it equals `asSubtreeHash(nodeHashOfPath('cas.ts'))`, a constant of the PATH, both before
and after the edit
teeth: breaks-on "the dependency axis rolls up child CONTENT the way the spatial axis does — the leaf's
`subtreeHash` moves on a content edit, so an anchor resolved there could witness drift (the exact
defeatability class closed by #98) and #189's 72.3%-fabricated-edge defect would again have had a spec
with no stated exception to catch it against"
gen: conformance

---

## Coverage ledger (S3 completeness facet)

- **REQ coverage:** 58/58 REQ have ≥1 SCN.
- **Guard coverage:** 26/26 unwanted-behaviour / If-then / MUST-NOT REQ have a guard SCN —
  1b, 2c, 3b, 3c, 3e, 5b, 5c, 6b, 7a, 9b, 10c, 12d, 12f, 12j, 12k, 13b, 13c, 13f, 14d, 14e, 14f, 15b, 15d, 15e, 16c, 17a.
- **Teeth (Gate 3):** 58/58 SCN name the exact mutant of their REQ they flip to BROKEN on; none vacuous. The
  PBT law witnesses are interesting (a real 5-node reverse-closure with blast-radius 4 for the INDEX-12
  boundedness/`maxHops=2`/`state-suspect` cluster; a genuine two-overlapping-glob resolution for INDEX-14;
  an order-swapped child list for INDEX-2 determinism — no antecedent-failure passes).
- **gen histogram:** PBT 21 (2a/2b/2c/8a/12a–12k/14a–14f) · conformance 37 (1a/1b/3a/3b/3c/3d/3e/4a/4b/5a/5b/5c/
  6a/6b/7a/9a/9b/10a/10b/10c/11a/11b/13a/13b/13c/13d/13e/13f/15a/15b/15c/15d/15e/16a/16b/16c/17a) · residue 0.
  (17a and 13c-3 are out-of-band hotfix goldens — no held-out `-2` fixture, per the `wp-fix-*` convention.)
- **DEFINE-parametric SCN:** 1 (SCN-INDEX-15a-1 — optional-feature, gated on owner-generation being enabled;
  SHOULD-vs-MUST mandate is a DEFINE-seat dependency).
- **Held-out fixtures (Wave H · execution-GATE held-out leg):** 35 added — one `held_out: true` second fixture
  per `gen: conformance` SCN, drawn from the independent net/http fixture universe (different tree / depgraph /
  territory / coverage set, SAME behaviour/branch as fixture-1, own `teeth`). **Held-out-covered: 35/36**
  conformance SCNs; the 36th (SCN-INDEX-15a-1) is **exempt+flagged** (DEFINE-parametric optional feature-gate —
  a held-out leg would assert un-ratified behaviour). PBT SCNs (21) are **out of scope** — subsumed by
  `properties-idx.md`; residue 0. With the held-out leg present, the execution GATE's overfit-catch is AVAILABLE
  (FULL assurance): a builder that hard-codes fixture-1's answer fails the withheld net/http fixture.

---

## Appendix — PINNED IDENTITY GOLDENS (#104) · the structural fold

> **Deliberately NOT an `SCN-`.** It mints no id, consumes no REQ and enters no ledger above: the id graph
> (`harness/gates/id-integrity.mjs`, ID-3 ORPHAN) requires every SCN to be consumed by a WP card, and this is
> a REGRESSION PIN rather than a scenario derived from a method tag. The coverage counts above are unchanged.

**Why it exists.** Every IDX golden above asserts a RELATION between hashes — `sp-9c` is a symbol, not a
value; SCN-INDEX-2a-1 asserts order-independence; 2b-1/2c-1 assert which nodes move. Those relations hold
under _any injective change_ to the fold, so the block could not see a re-key. It was measured: a seat
re-keyed **every** `subtreeHash` in the repository (`0b65b42`, then `f2a8659`) and 1346 tests stayed green.

**Carriers:** `packages/index/test/identity-goldens.test.ts` (fold, state root, build, incremental re-hash)
and `packages/adapter-io/test/identity-goldens.test.ts` (the sub-file UNIT LEAF end to end, and `nodeKey` —
both only legally in scope from the outer ring). **Generated by running `foldNodeHash` / `build` /
`nodeRollup` / `rehashPath` / `walkFileTree`+`foldAstUnits`** over the inputs written out in those files.

| digest                                                 | pinned value                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------ |
| `foldNodeHash` — branch over two named children        | `284558640453e1e761abfbd734ecefa014396051d793d1a56177de115f3ecdad` |
| `foldNodeHash` — leaf over its own content             | `a7a475f5dee73a8422cc899ee020596652f30a897733aaa54eed64a6affc711e` |
| `foldNodeHash` — EMPTY FILE (`content: ""`)            | `f6795eed0a54344bd5e320bf2934903d9de877a90f149407ad8c7dc1a3d9e3fc` |
| `foldNodeHash` — EMPTY DIRECTORY (content absent)      | `642aa93ec61e807643894aa7e09237d8e927726308c78df8f68dae9e33dbb604` |
| `build` — spatial root / `src` / `src/a.ts`            | `b19fc179…` / `7daed870…` / `a7a475f5…`                            |
| `build` — dependency-axis root (folds the edge ledger) | `64544e2e55a7d09207ffdfcb29be26dee6c35bc18ae4cf6b71d9a803ab372841` |
| `nodeHashOfPath('src/a.ts')`                           | `167d4964c726f310799c0f8ab667050b846dffb1d9687e7754a367d31f1826a6` |
| `nodeRollup` — `rState` (ACTIVE / RETIRED)             | `ec02cedf…` / `8cb59401…`                                          |
| `rehashPath` — root after a leaf edit                  | `49b1fc5124b8e2a1496d34599c1af1fa081416ff9977d29e8c0845222197913c` |
| UNIT LEAF — key / subtreeHash (end to end)             | `src/acct.ts::function_declaration:0:isAdmin` / `93297567…`        |
| `nodeKey` — advisory / predicate                       | `b171fa73…` / `ad71ec58…`                                          |

The empty-file / empty-directory pair is cross-checkable against an **independent witness**: `0b65b42`'s own
commit message records that collision being closed as "642aa93e vs f6795eed". Those are the first eight hex
digits of the two literals above, regenerated here from the live code.

**A RED here is a MIGRATION EVENT, not a test to update.** Every literal is a hash that real on-disk `.atlas`
stores contain; if one moves, every store written before the change is addressed by rules the build no longer
computes, so every anchor stops resolving and every grounded fact reads DRIFTED — with no way for its owner
to tell that from "my code changed". The response is: (1) decide whether the re-key is worth a full re-derive
for every user; (2) if it is, **bump `IDENTITY_SCHEMA`** in `packages/adapter-io/src/identity-schema.ts` in
the same commit (#112); (3) only then update the pin, naming what moved.
