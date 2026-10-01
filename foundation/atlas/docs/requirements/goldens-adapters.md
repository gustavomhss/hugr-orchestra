# Goldens — Block ADAPTERS (Campaign-9 · the productization ring) · S3 generate-from-method-tag

> **state:** S3 · **protocol:** [`goldens`](../../.claude/skills/goldens/SKILL.md) + [`completeness`](../../.claude/skills/completeness/SKILL.md) Gate-3 teeth ·
> **axiom:** S1 frozen (`requirements-adapters.md`; 55 REQs at the freeze, **58 counted today** — +REQ-MCP-1d/1e
> by the governed-write-doors amendment, +REQ-ADAPTER-1e by the tracked-symlink amendment 2026-08-02) + S2 frozen (`method-tags-adapters.md`; every
> behavioural INV method-tagged, **0 `formal`** in the ring — the sole `formal` cluster `FSPEC-merge` lives one
> layer down and is unchanged, consumed via frozen seams) · **owner:** charlie (FORGE).
>
> **Derivation (generated from the method-tag, NOT hand-authored where a generator exists):**
>
> - **15 `reference-model` INVs** (ADAPTER-1..6, 8..12, WIRE-1, CLI-3, CLI-4, MCP-2) → **`gen: conformance`**:
>   each SCN is a differential/conformance witness against the named oracle in the S2 down-model — the
>   committed fixture repo + its reference `FileTree`, the recorded `.scip` corpus, the kernel `StoreApi`
>   reference, a pinned git-sandbox + write-spy, the spy `SiteProposer`, the `@atlas/index` reference + call-spy,
>   the reference `Verdict` renderer, the frozen `genesis` run-controller, the fault-injecting reference
>   transport, and the shared `WiredHandler` parity oracle. The named mock is the anti-rot; the SCN's teeth are
>   the exact mutant that diverges from it.
> - **3 `exhaustive` INVs** (CLI-1, CLI-2, MCP-1) → **`gen: exhaustive`**: the finite space is enumerated — the
>   `command → wired-leg` map, the `command × authority` matrix, and the closed `Tool` union (MCP-1, amended
>   ADR-0006 — was "the closed five-tool set") — plus (CLI-1) the
>   PBT-fuzz malformed-`argv` totality arm the enumeration cannot reach.
> - **1 `PBT` INV** (ADAPTER-7, the one algebraic law the ring itself composes — durable dedup/supersede
>   idempotence) → **`gen: PBT`**: concrete witness instances of the idempotence law (`write∘write ≡ write` over
>   the DURABLE store) and the supersede-ordering law in **both** delivery orders, plus the reference-model
>   equality arm against the existing `routeWrite`/`upsert`.
> - **0 `residue`** — every ring INV has a named oracle (no oracle-less integration case survives the S2 tags).
>
> **Non-vacuity note (load-bearing for teeth direction):** the durable-store SCNs (ADAPTER-6/7/12) bite the
> **flush→fresh-process→read-back** seam, not an in-memory shortcut — the anti-rot for ADAPTER-7 is explicit
> that "a single-fact golden silently passes" the flush-ordering bug, so every durable teeth names a mutant a
> memory-only golden cannot see. Every guard SCN carries an **interesting witness** (a genuine dangling ref, a
> real un-indexed language adjacent to real edges, a real cross-writer supersede in both orders, a real rebase
> that changes the sha, a tool that genuinely throws) — no antecedent-failure vacuity.

## Fixture universe (reused concretely across every SCN — witnesses, not abstractions)

### `fix-repo` — a committed multi-language repo (the walker/SCIP/index/genesis oracle)

| path               | lang | tracked             | role                                                                                                              |
| ------------------ | ---- | ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `.gitignore`       | —    | yes                 | contains `dist/` and `*.log`                                                                                      |
| `src/app.ts`       | ts   | yes                 | imports `greet` from `./util` (→ resolvable ref) **and** references `missingHelper` (→ dangling, no in-index def) |
| `src/util.ts`      | ts   | yes                 | **defines** `greet()` (SCIP symbol `scip-ts . . util/greet().`)                                                   |
| `api/service.py`   | py   | yes                 | **defines** `compute()` (SCIP symbol via `scip-python`)                                                           |
| `legacy/report.rb` | rb   | yes                 | **no configured indexer** → honest structural hole (files-only)                                                   |
| `dist/bundle.js`   | —    | **no** (gitignored) | must be ABSENT from the `FileTree`                                                                                |
| `debug.log`        | —    | **no** (gitignored) | must be ABSENT from the `FileTree`                                                                                |

Reference tree `T_ref` = the deterministic sorted walk of the 5 tracked paths with leaf `content`; `dist/` and
`*.log` excluded by `.gitignore`. `LangId → IndexerPlan` dispatch: `ts → scip-typescript`, `py → scip-python`,
`rb → honest-hole` (total over the repo's languages).

### `link-repo` — a committed repo whose tracked set contains SYMLINKS (the REQ-ADAPTER-1e oracle)

A SECOND fixture, deliberately not folded into `fix-repo`: `fix-repo` and its `T_ref` are the symlink-FREE
oracle, and they are what proves the tracked-symlink rule moves no hash on a repo that has no symlinks.

| path                | git mode   | tracked | role                                                                                                               |
| ------------------- | ---------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| `src/real.ts`       | 100644     | yes     | an ordinary TS file — the CONTROL that the walk and the AST fold really ran                                        |
| `secrets/token.txt` | 100644     | yes     | the target of the link below; its bytes must appear only under THIS path                                           |
| `src/config.ts`     | **120000** | yes     | link text `../secrets/token.txt` (and, in the `/etc/passwd` witness, the absolute path of a file outside the repo) |
| `src/leak.ts`       | **120000** | yes     | link text `const leaked = 1` — a target name that is legal TypeScript                                              |
| `src/gone.ts`       | **120000** | yes     | link text `./nowhere.ts` — a BROKEN link (target absent)                                                           |
| `src/dirlink`       | **120000** | yes     | link text `../sub` — a link to a DIRECTORY                                                                         |
| `sub/keep.ts`       | 100644     | yes     | the file inside the linked directory (must appear once, under its real path)                                       |

Mode is read from `git ls-files -s`, i.e. what the REPO DECLARES; the link text is the entry's index blob.

### `fix.scip` — a recorded SCIP protobuf index (the SCIP-reader oracle)

- document `src/util.ts`: one **definition** occurrence for `util/greet().`
- document `src/app.ts`: one **reference** occurrence to `util/greet().` (has an in-index definition ⇒ resolvable)
  and one **reference** occurrence to `util/missingHelper().` (**no** in-index definition ⇒ dangling, `to: null`).
- contains **no** symbol `util/deletedFn()` and **no** edge `app.ts → api/service.py:compute`.

### `git-sbx` — a git sandbox (the history/drift/forge oracle)

- pinned rev `r0 = a1b2c3d`; `git blame` attributes `util/greet()` to commit `c_greet`.
- branches `main` and `topic` share **merge-base** `mb = 9f8e7d6`; on `topic`, `src/util.ts`'s `greet()` anchor
  moved (a cited file changed) — the `mb → topic` diff is the expected drifted-anchor set.
- a shared change `X` landed on **both** `main` and `topic` after `mb` (a two-tip diff would show nothing).
- host role: a commit `c1` receives a provenance trailer + a `refs/notes/orchestra` note + a PR projection; a
  rebase rewrites `c1 → c1'` (new sha).

### durable CAS + facts (the StoreApi / dedup-supersede / rehydrate oracle)

- disk CAS at `.atlas/cas/` sharded `<h[0:2]>/<h>` (D4 default).
- `CasObject O` with `H = id(O)`; a **tampered** on-disk copy at `.atlas/cas/<H[0:2]>/<H>` whose bytes give
  `id(value) !== H`.
- fact `F` = `{ nodeKey: 'claim:fix-cov', content: c1 }`; superseder `F'` = `{ nodeKey: 'claim:fix-cov',
content: c2, supersedes: [id(F)] }`.

### entrypoint fixtures (CLI / MCP / wire)

- command set = `{ init, query, emit, reconcile, link, doctor, mine }`; the five governed tools =
  `{ atlas-init, atlas-query, atlas-emit, atlas-reconcile, atlas-link }`; `mine` drives the `genesis` run-controller.
- `Verdict` fixture set: `V_ok = {status:'ok', exitCode:0, guidance:'index built'}`,
  `V_rej = {status:'rejected', exitCode:2, guidance:'drift needs review'}`,
  `V_err = {status:'error', exitCode:1, guidance:'malformed input: expected a repo path'}`.
- `spyProposer` = the recorded `SiteProposer` (call-counter + budget stub); returns candidate `P0` for site
  `S_greet`. No live model in CI.
- `createHandler(adapters)` = the single shared `wire` module both entrypoints import.

---

## REQ-ADAPTER-1 — faithful file tree

### SCN-ADAPTER-1a-1 — the walk equals the reference tree, .gitignore honored (happy)

source: REQ-ADAPTER-1a
Given `fix-repo` committed with reference tree `T_ref` (the 5 tracked paths in deterministic sorted order with leaf `content`), and `.gitignore` listing `dist/` and `*.log`
When `walk(fix-repo)` runs
Then `deepEqual(walk(fix-repo), T_ref)` — exact paths·nesting·leaf `content` in the deterministic order, and `dist/bundle.js` + `debug.log` are absent
teeth: breaks-on "a walker that invents a path — it ignores `.gitignore` and includes `dist/bundle.js`, so a phantom path enters the `FileTree` ≠ `T_ref`"
gen: conformance

### SCN-ADAPTER-1b-1 — a tracked file with no indexer is still in the tree (guard)

source: REQ-ADAPTER-1b
Given `legacy/report.rb` is git-tracked (a `rb` file with no configured indexer)
When `walk(fix-repo)` runs
Then the `FileTree` includes `legacy/report.rb` with its leaf `content` — the tracked set is fully present
teeth: breaks-on "a walker that drops a tracked file — it applies an extension allowlist and omits `legacy/report.rb`, so a tracked file is missing from the `FileTree`"
gen: conformance

### SCN-ADAPTER-1c-1 — no fabricated path is emitted (guard)

source: REQ-ADAPTER-1c
Given `dist/bundle.js` is absent from the tracked set (gitignored) and no file `src/generated.ts` exists on disk
When `walk(fix-repo)` runs
Then the `FileTree` contains neither `dist/bundle.js` nor `src/generated.ts` — 0 phantom paths
teeth: breaks-on "a walker that invents a path — it emits a stale `src/generated.ts` entry cached from a prior walk that no longer exists on disk, fabricating a file"
gen: conformance

### SCN-ADAPTER-1d-1 — two walks of the same tree are byte-identical (happy)

source: REQ-ADAPTER-1d
Given `fix-repo` unchanged between two invocations
When `walk(fix-repo)` runs twice → `w1`, `w2`
Then `w1` ≡ `w2` byte-identically (identical sibling order and leaf `content`)
teeth: breaks-on "a walker that stamps each `FileTree` node with a per-walk value (the wall-clock at visit time / a fresh nonce) instead of deriving the node purely from bytes — so `w1` and `w2` differ on that field across the two runs (`readdir` order alone is stable across consecutive walks and would not diverge)"
gen: conformance

---

## REQ-ADAPTER-1e — a tracked symlink contributes its stored link text (amended 2026-08-02, the containment family)

### SCN-ADAPTER-1e-1 — a tracked symlink's leaf carries the LINK TEXT, and the target is never read (guard)

source: REQ-ADAPTER-1e
Given `link-repo` where `src/config.ts` is tracked at mode 120000 with link text `../secrets/token.txt`, and the target file holds bytes that appear nowhere else
When `walk(link-repo)` runs
Then the `FileTree` INCLUDES `src/config.ts` (REQ-ADAPTER-1b, no new exception) as a leaf whose `content` is exactly `../secrets/token.txt`, and — for the `-> /etc/passwd` witness — not one byte of the target file appears anywhere in the tree
teeth: breaks-on "a walker that reads the path again (`readFileSync`, which FOLLOWS a symlink) instead of the entry's index blob — the target's bytes become the leaf `content`, which is how `/etc/passwd` reached the skeleton"
gen: conformance

### SCN-ADAPTER-1e-2 — a mode-120000 leaf mints NO sub-file unit key (guard)

source: REQ-ADAPTER-1e
Given `link-repo` where `src/leak.ts` is tracked at mode 120000 with link text `const leaked = 1` (legal TypeScript), alongside the ordinary `src/real.ts` defining `realFn()`
When `foldAstUnits(walk(link-repo))` runs and the index is built
Then `src/real.ts::function_declaration:0:realFn` is minted (the CONTROL — the fold really ran) and NO key beginning `src/leak.ts::` exists — the link leaf is returned unrefined, with no children
teeth: breaks-on "the fold exclusion is dropped — the link text is parsed as source and `src/leak.ts::lexical_declaration:0:leaked` becomes a first-class node key, i.e. retrieval hands out a key minted from a file name"
gen: conformance

### SCN-ADAPTER-1e-3 — a broken link and a directory link are INCLUDED as link-text leaves (guard, the behaviour that changed)

source: REQ-ADAPTER-1e
Given `link-repo` where `src/gone.ts` is tracked at mode 120000 with link text `./nowhere.ts` (target absent) and `src/dirlink` at mode 120000 with link text `../sub` (a directory), and `sub/keep.ts` is tracked
When `walk(link-repo)` runs
Then both are present as leaves with `content` exactly `./nowhere.ts` and `../sub`, both with `children: []`, and `sub/keep.ts` appears once under its real path while `src/dirlink/keep.ts` does not appear at all
teeth: breaks-on "the mode is discarded again and the read decides — the dangling target's ENOENT and the directory target's EISDIR are swallowed, so both tracked entries vanish from the `FileTree` (the pre-amendment behaviour, which was an ACCIDENT of the swallow, not a decision)"
gen: conformance

---

## REQ-ADAPTER-2 — SCIP is read into ScipOutput

### SCN-ADAPTER-2a-1 — the reader yields exactly the fixture's occurrences (happy)

source: REQ-ADAPTER-2a
Given `fix.scip` with document `src/util.ts` (one definition of `util/greet().`) and `src/app.ts` (a reference to `util/greet().` and a reference to `util/missingHelper().`)
When `read(fix.scip)` runs
Then `ScipOutput` == the fixture's per-document `definition`/`reference` occurrence set — exactly those three occurrences, no more
teeth: breaks-on "the reader synthesizes a document-level `imports` occurrence the `.scip` does not contain — `ScipOutput` carries an occurrence absent from the fixture corpus"
gen: conformance

### SCN-ADAPTER-2b-1 — a dangling reference resolves to null (guard)

source: REQ-ADAPTER-2b
Given `fix.scip`'s `src/app.ts` reference to `util/missingHelper().` has **no** definition occurrence anywhere in the index
When the ring resolves the `ScipOutput`
Then that reference stays unresolved — downstream `to: null` (INDEX-13)
teeth: breaks-on "the reader resolves the dangling `util/missingHelper()` ref to the nearest same-named symbol — it invents a target so `to !== null`"
gen: conformance

### SCN-ADAPTER-2c-1 — no symbol or edge is synthesized (guard)

source: REQ-ADAPTER-2c
Given `fix.scip` contains the resolvable `app.ts → util/greet().` edge but **no** edge `app.ts → api/service.py:compute`
When `read(fix.scip)` runs
Then `ScipOutput` carries the one recorded edge and 0 cross-file edges the `.scip` does not contain
teeth: breaks-on "the reader adds a heuristic same-name edge `app.ts → api/service.py:compute` not present in the `.scip` — a synthesized edge appears"
gen: conformance

---

## REQ-ADAPTER-3 — per-language indexer dispatch and merge

### SCN-ADAPTER-3a-1 — each language runs its indexer and the outputs merge (happy)

source: REQ-ADAPTER-3a
Given `fix-repo` spans `ts` and `py` with the total dispatch table `ts → scip-typescript`, `py → scip-python`, `rb → honest-hole`
When the ring runs each configured indexer by `LangId` and merges the `.scip` outputs
Then the dispatch table is total (every repo `LangId` routes to exactly one of {indexer, honest-hole}) and the merged index carries the `ts` edge `app.ts → util/greet()` and the `py` symbol `service.py:compute`, each from its own indexer
teeth: breaks-on "a `LangId` with no dispatch entry (`rb`) falls through to the `ts` indexer instead of the honest-hole — the totality/dispatch assertion fails (a language routed to the wrong indexer)"
gen: conformance

### SCN-ADAPTER-3b-1 — the un-indexed language is files-only (guard)

source: REQ-ADAPTER-3b
Given `legacy/report.rb` (`rb`, no configured indexer)
When the ring builds the index over `fix-repo`
Then `report.rb` appears in the `FileTree` with its `content` but contributes **0** edges (an honest structural hole)
teeth: breaks-on "the ring drops `report.rb` entirely because `rb` has no indexer — a tracked file vanishes instead of becoming a files-only hole"
gen: conformance

### SCN-ADAPTER-3c-1 — the un-indexed language corrupts no other language (guard)

source: REQ-ADAPTER-3c
Given `rb` has no indexer while `ts`/`py` do, with the `ts` edge `app.ts → util/greet()` adjacent to the `rb` hole
When the merge runs
Then the `ts` edge and the `py` `compute` symbol are intact — 0 fabricated or dropped edges for `ts` or `py`
teeth: breaks-on "the missing `rb` indexer aborts the merge and drops the `ts` edge `app.ts → util/greet()` — an un-indexed language corrupts another language's edges (INDEX-13 cross-language honesty broken)"
gen: conformance

---

## REQ-ADAPTER-4 — deterministic sub-file units

### SCN-ADAPTER-4a-1 — same bytes fold to the reference unit set every run (happy)

source: REQ-ADAPTER-4a
Given `src/util.ts` bytes with the `web-tree-sitter` layer **enabled** and reference unit set `U_ref` (item: the `greet` fn; block: its body)
When the layer folds the bytes twice → `u1`, `u2`
Then `u1 == u2 == U_ref` — identical sub-file units folded into the `FileTree` spatial rail
teeth: breaks-on "a non-deterministic fold — the layer tags each unit with a monotonic/wall-clock id, so `u1` and `u2` carry different unit ids for the same bytes (same bytes ⇏ same units)"
gen: conformance

### SCN-ADAPTER-4b-1 — the file-level index is valid without the AST layer (happy)

source: REQ-ADAPTER-4b
Given the `web-tree-sitter` layer **disabled**
When the index is built over `fix-repo`
Then the index is valid at file level (the `FileTree` is present and `resolve`/`coverage` answer) with no sub-file units — an honest additive refinement is simply absent
teeth: breaks-on "disabling the AST layer leaves the index half-built — `resolve` throws because it assumes sub-file units exist, so the file-level index is no longer valid without the additive layer"
gen: conformance

### SCN-ADAPTER-4c-1 — repeated folds of identical bytes are identical (guard)

source: REQ-ADAPTER-4c
Given the identical byte sequence of `src/util.ts` folded three times with the layer enabled
When the three unit sets are compared
Then all three are byte-identical (unit set and order)
teeth: breaks-on "the fold assigns each unit an order index from a fold-scoped counter that advances across invocations (not from the unit's byte offset) — so the three folds of identical bytes disagree on unit order (same bytes ⇏ same units); distinct from 4a-1's wall-clock-id source"
gen: conformance

---

## REQ-ADAPTER-5 — index adapter drives @atlas/index

### SCN-ADAPTER-5a-1 — adapter outputs equal @atlas/index over the same inputs (happy)

source: REQ-ADAPTER-5a
Given the walker + SCIP outputs over `fix-repo` fed to both the index-backing adapter and `@atlas/index` directly
When `MoveInIndex`/`QueryIndex` run through the adapter and `@atlas/index` `build`/`resolve`/`coverage` run over the same inputs
Then `deepEqual(adapterOutput, atlasIndexOutput)` — the adapter is pure delegation
teeth: breaks-on "the adapter serves a stale cached `resolve` result instead of calling `@atlas/index` — its output diverges from the `@atlas/index` oracle"
gen: conformance

### SCN-ADAPTER-5b-1 — every resolution originates in @atlas/index, not the adapter (guard)

source: REQ-ADAPTER-5b
Given a call-spy on `@atlas/index.resolve`
When `QueryIndex` resolves the `app.ts → util/greet()` edge
Then the spy count equals the number of resolutions — every resolution/ranking result originated from an `@atlas/index` call, 0 computed in the adapter
teeth: breaks-on "the adapter resolves `util/greet()` with its own local shortcut and never calls `@atlas/index.resolve` — the spy count is 0 while a resolution was returned (the adapter introduced its own resolution)"
gen: conformance

---

## REQ-ADAPTER-6 — durable content-addressed store

### SCN-ADAPTER-6a-1 — put/get round-trips under the content hash (happy)

source: REQ-ADAPTER-6a
Given the disk store at `.atlas/cas/` and `CasObject O` with `H = id(O)`
When `put(O)` then `get(H)` run
Then `get(H)` returns `O` byte-identical, and `O` is stored at `.atlas/cas/<H[0:2]>/<H>` — the `StoreApi` `put(obj)→Hash` / `get(h)→CasObject|undefined` contract holds
teeth: breaks-on "`put` stores `O` under a random uuid filename instead of `id(O)` — `get(H)` misses (the content-addressing contract is violated)"
gen: conformance

### SCN-ADAPTER-6b-1 — an object put in process A is get-retrievable in a fresh process B (happy)

source: REQ-ADAPTER-6b
Given process A calls `put(O) → H` and flushes to `.atlas/cas/`
When a fresh process B (a new `StoreApi` instance over the same dir) calls `get(H)`
Then B returns `O` byte-identical — durability across processes
teeth: breaks-on "`put` keeps `O` only in an in-memory `Map` and never flushes to disk — process B's `get(H)` returns `undefined` (no durability; a same-process golden passes)"
gen: conformance

### SCN-ADAPTER-6c-1 — a tampered on-disk value reads as absent (guard)

source: REQ-ADAPTER-6c
Given `.atlas/cas/<H[0:2]>/<H>` whose on-disk bytes were mutated so `id(value) !== H`
When `get(H)` runs
Then the store treats the mismatch as absent and returns `undefined` (tamper-safe, KERNEL-1)
teeth: breaks-on "`get` returns the file's bytes without re-verifying `id(value) === key` — the tampered value is served as if genuine (tamper-safety broken)"
gen: conformance

---

## REQ-ADAPTER-7 — governed persistent write binding

### SCN-ADAPTER-7a-1 — the binding composes nodeKey→probe→routeWrite→upsert→flush (happy)

source: REQ-ADAPTER-7a
Given candidate fact `F` (`nodeKey claim:fix-cov`, content `c1`) and the durable store
When `writeDecision(F, cfg)` runs
Then it computes `nodeKey(F)`, probes the **durable** store for the contentHash (D0) and nodeKey (D1) hits, calls the existing `routeWrite`, applies `upsert`, and flushes the projection through the store — and a fresh probe over the flushed store round-trips `F`
teeth: breaks-on "the binding skips the flush step — `routeWrite`/`upsert` land in memory but the durable store never sees `F`, so the next write's durable probe misses the prior (a memory-only golden passes)"
gen: PBT

### SCN-ADAPTER-7b-1 — a governed write of the same fact twice lands once (happy)

source: REQ-ADAPTER-7b
Given fact `F` (`nodeKey claim:fix-cov`, content `c1`) over the DURABLE store
When `writeDecision(F)` runs, then `writeDecision(F)` runs a second time
Then `F` lands exactly once — the second call is a no-op once the probe sees the flushed prior (`head-count(claim:fix-cov) == 1`); `write∘write ≡ write`
teeth: breaks-on "the probe reads only the in-memory projection, not the flushed durable store — a flush-ordering bug lets the second write land a duplicate (`write∘write ≠ write`); the anti-rot's exact case a single-fact golden silently passes"
gen: PBT

### SCN-ADAPTER-7b-2 — a supersede lands one head in either delivery order (happy)

source: REQ-ADAPTER-7b
Given fact `F` (content `c1`) and its superseder `F'` (content `c2`, `supersedes: [id(F)]`) over the durable store
When they are delivered in order `[F, F']` and, separately, in order `[F', F]`
Then both orders yield an identical single head `F'` with the supersedes-pointer recorded — order-independent, 0 double-lands
teeth: breaks-on "supersede resolution reads arrival order — delivering `[F', F]` leaves `F` as head, so the two delivery orders disagree on the head (order-dependent)"
gen: PBT

### SCN-ADAPTER-7c-1 — the bound decision equals routeWrite's on the same inputs (guard)

source: REQ-ADAPTER-7c
Given the existing `routeWrite`/`upsert` as the equality oracle and a near-duplicate of `F` that `routeWrite` would route to supersede
When `writeDecision` makes its routing decision on the same inputs
Then `boundDecision == routeWrite(sameInputs)` — the binding adds no path of its own
teeth: breaks-on "the binding adds a local fast-path that routes the near-duplicate to `insert` instead of delegating to `routeWrite` — the bound decision diverges from the `routeWrite` oracle (new routing invented)"
gen: PBT

---

## REQ-ADAPTER-8 — history is backed by real git

### SCN-ADAPTER-8a-1 — HistorySource yields real git signals (happy)

source: REQ-ADAPTER-8a
Given `git-sbx` pinned at rev `r0 = a1b2c3d` where `git blame` attributes `util/greet()` to commit `c_greet`
When `HistorySource` yields `log`/`blame`/`coupling` for `src/util.ts`
Then the signals equal the real git output at `r0` — `blame` attributes `greet()` to `c_greet`
teeth: breaks-on "`HistorySource` returns a hardcoded stub signal instead of shelling to real git — `blame` attributes `greet()` to the wrong commit ≠ `git blame` at `r0`"
gen: conformance

### SCN-ADAPTER-8b-1 — the signals are byte-identical across runs at a fixed rev (happy)

source: REQ-ADAPTER-8b
Given `git-sbx` at the fixed rev `r0`
When `HistorySource` runs twice
Then the two signal sets are byte-identical (deterministic for a fixed rev)
teeth: breaks-on "`coupling` ranks by a `Map` iteration seeded from the wall-clock — the two runs at the same `r0` produce different coupling orders (non-deterministic at a fixed rev)"
gen: conformance

### SCN-ADAPTER-8c-1 — ranking mints no fact (guard)

source: REQ-ADAPTER-8c
Given a write-spy on the fact store while `HistorySource` computes `log`/`blame`/`coupling` over `r0` to feed ranking
When ranking runs
Then the write-spy records 0 fact mints during ranking — history feeds ranking only
teeth: breaks-on "the coupling miner upserts a `co-change` fact into the store while ranking — the write-spy fires (the GEN structural-only guarantee is broken)"
gen: conformance

---

## REQ-ADAPTER-9 — drift over merge-base

### SCN-ADAPTER-9a-1 — DriftSource anchors equal the merge-base diff (happy)

source: REQ-ADAPTER-9a
Given `git-sbx` where `main` and `topic` share merge-base `mb = 9f8e7d6` and on `topic` the cited `src/util.ts` `greet()` anchor moved
When `DriftSource` computes drifted anchors
Then the anchor set == the `mb → topic` diff (`greet()` flagged drifted), feeding `atlas-reconcile`'s mechanical-vs-semantic classification (TOOLS-8 `exitCode` law unchanged)
teeth: breaks-on "`DriftSource` diffs `merge-base → main` instead of `merge-base → topic` — the topic-only `greet()` drift is absent from `mb → main`, so the anchor set comes back empty and the real drift is missed (the two-tip mutant is caught by 9b-1's shared-`X` witness, not here)"
gen: conformance

### SCN-ADAPTER-9b-1 — drift is computed across the merge-base and nothing else (guard)

source: REQ-ADAPTER-9b
Given a shared change `X` landed on **both** `main` and `topic` after `mb` (a two-tip diff would show nothing) plus the topic-only `greet()` change that predates it
When `DriftSource` computes drift
Then only the topic-only `greet()` change vs `mb` is in the anchor set — the shared `X` is not
teeth: breaks-on "drift is computed over a fixed window `HEAD~1..HEAD` instead of across the merge-base — it misses the topic-only `greet()` drift that predates the window"
gen: conformance

### SCN-ADAPTER-9c-1 — a secondary citation's drift is classified from that citation (happy, added 2026-08-03)

source: REQ-ADAPTER-9c
Given a grounded fact citing TWO anchors — `src/a-primary.ts`, which still re-derives at HEAD, and `src/b-secondary.ts`, whose content was renamed to `src/z-secondary-moved.ts`
When the doctor classifies the fact's drift
Then the item is `mechanical` keyed on the citation that drifted (`anchorWas = src/b-secondary.ts`, `anchorNow = src/z-secondary-moved.ts`), not on the primary
teeth: breaks-on "classification reads `entries[0]` alone — the primary still resolves at HEAD, so the item comes back `anchorWas = anchorNow = src/a-primary.ts`, a 'move' from a path to itself, and the citation that actually drifted is never named (MEASURED pre-fix)"
gen: conformance

### SCN-ADAPTER-9d-1 — the repair re-anchors the drifted citation and earns its freshness (happy, added 2026-08-03)

source: REQ-ADAPTER-9d
Given the same two-citation fact, classified `mechanical`
When the doctor emits the re-ground plan
Then entry 1 is re-anchored to `src/z-secondary-moved.ts`, entry 0 is passed through at its recorded anchor, the candidate is stamped `FRESH` and it re-derives end-to-end at HEAD — while a repair that leaves any entry unestablished is stamped `DRIFTED`
teeth: breaks-on "the template rewrites `entries[0]` and stamps `freshness: 'FRESH'` unconditionally — the stale entry 1 survives into the candidate, which the truth door then refuses (`NA`, MEASURED pre-fix): a repair plan that cannot land, wearing a FRESH stamp it never earned"
gen: conformance

### SCN-ADAPTER-9e-1 — a rotted non-primary citation blocks the merge gate (happy, added 2026-08-03)

source: REQ-ADAPTER-9e
Given a durable knowledge base holding a fact whose grounding cites TWO anchors — a primary renamed with a byte-identical body (mechanically re-groundable) and a secondary whose content was REWRITTEN at HEAD — driven end-to-end through the real `composeRuntime` handler at `mergeBase = A`
When `atlas-reconcile` classifies the run
Then that fact is `semantic`, `reauthorCount == 1` and `exitCode == 2` — the merge is blocked and exactly the fact a human must re-author is named
teeth: breaks-on "the composition root inlines its own classifier over `entries[0]` — the renamed primary re-derives by content at HEAD, the fact reads `mechanical`, and the gate reports `semantic: [], exitCode: 0` over a knowledge base holding a dead citation (MEASURED pre-fix through the shipped path)"
gen: conformance

### SCN-ADAPTER-9e-2 — a knowledge base with no rotted citation still merges (guard, added 2026-08-03)

source: REQ-ADAPTER-9e
Given the SAME repository and the SAME merge base, with the rotted-secondary fact absent from the durable projection
When `atlas-reconcile` classifies the run
Then the primary-only mechanical drift is `mechanical`, `semantic` is empty, `reauthorCount == 0` and `exitCode == 0`
teeth: breaks-on "the shared classifier answers `semantic` when NO entry drifted, or keys semantic on anything other than a citation that re-derives nowhere — either turns the merge gate into a blanket block on drifted-but-alive facts"
gen: conformance

### SCN-ADAPTER-9f-1 — a secondary-only drift is surfaced end-to-end, through the real merge gate (happy, added 2026-08-03)

source: REQ-ADAPTER-9f
Given a durable knowledge base holding four facts driven through the real `composeRuntime` handler at `mergeBase = A`: `sec-mech` (primary fresh, secondary renamed with a byte-identical body), `sec-rot` (primary fresh, secondary rewritten away), `lead-mech` (primary renamed, secondary fresh) and `mixed` (primary renamed AND secondary rewritten away)
When `atlas-reconcile` classifies the run
Then all FOUR facts are surfaced (not just `lead-mech` and `mixed`): `mechanical == ['sec-mech','lead-mech']`, `semantic == ['sec-rot','mixed']`, `reauthorCount == 2`, `exitCode == 2`
teeth: breaks-on "`driftAt` reads `f.grounding.entries[0]` alone — `sec-mech` and `sec-rot`'s primaries are intact, so neither ever reaches the classifier: `mechanical == ['lead-mech']`, `semantic == ['mixed']`, `reauthorCount == 1` (MEASURED pre-fix through the shipped path)"
gen: conformance

### SCN-ADAPTER-9f-2 — single-entry facts and a rot-free base are unaffected (guard, added 2026-08-03)

source: REQ-ADAPTER-9f
Given (a) every pre-existing single-entry `DriftSource`/`atlas-reconcile` fixture, unchanged, and (b) the SAME four-fact repository above with `sec-rot` and `mixed` — the two rotted-secondary facts — absent from the durable projection
When `DriftSource.driftAt`/`atlas-reconcile` runs
Then (a) is BYTE-IDENTICAL to its pre-widening result (a single-entry grounding's only entry IS entry 0) and (b) reports `mechanical == ['sec-mech','lead-mech']`, `semantic == []`, `reauthorCount == 0`, `exitCode == 0`
teeth: breaks-on "the widened loop reports a pair for a fact whose entries never drifted (an over-eager detector that surfaces everything), or a single-entry grounding's result changes shape — either moves a merge gate that was never supposed to move"
gen: conformance

---

## REQ-ADAPTER-10 — forge carries the atlas

### SCN-ADAPTER-10a-1 — the forge writes trailer + orchestra note + PR projection (happy)

source: REQ-ADAPTER-10a
Given the `git-sbx` host and commit `c1`
When the `Forge` writes the atlas for `c1`
Then a provenance trailer is appended to `c1`'s message, a note is attached to `c1` under `refs/notes/orchestra`, and the PR projection is written
teeth: breaks-on "the `Forge` writes the note to `refs/notes/commits` (the default namespace) instead of `refs/notes/orchestra` — the orchestra note is absent from the expected ref"
gen: conformance

### SCN-ADAPTER-10b-1 — a rewrite keeps the trailer and orphans the note data (guard)

source: REQ-ADAPTER-10b
Given the atlas written to `c1` (trailer in the message + note on `c1`'s sha)
When history is rewritten by a rebase (`c1 → c1'`, new sha)
Then the trailer data survives in the rewritten message and the note-carried data is orphaned exactly as PERSIST-_ specifies (the note still points at the old `c1` sha, not silently discarded)
teeth: breaks-on "the rewrite drops the trailer from the rewritten message (trailer treated as ephemeral) — trailer data is lost, diverging from the PERSIST-_ expected outcome"
gen: conformance

### SCN-ADAPTER-10c-1 — the forge executes PERSIST-\* semantics unchanged (guard)

source: REQ-ADAPTER-10c
Given PERSIST-_ specifies the exact trailer/note/orphan semantics as the oracle
When the `Forge` acts on `git-sbx` across the write + rewrite path
Then the observed outcome == PERSIST-_'s expected outcome at every step — the adapter changed 0 of that semantics, only executed it
teeth: breaks-on "the `Forge` 'improves' orphan handling by re-pointing the orphaned note to the rewritten `c1'` sha — it alters PERSIST-\* orphan semantics, so the outcome diverges from the PERSIST oracle"
gen: conformance

---

## REQ-ADAPTER-11 — the single model entry

### SCN-ADAPTER-11a-1 — a model is invoked only via SiteProposer.propose (guard)

source: REQ-ADAPTER-11a
Given `spyProposer` wrapping the only model seam and a module-graph audit for any other model call site, with genesis extraction run over `fix-repo`
When extraction invokes the model
Then every model invocation went through `SiteProposer.propose` — 0 out-of-band model call sites in the graph
teeth: breaks-on "a second module calls the model client directly, bypassing `SiteProposer.propose` — the graph audit finds a 2nd model entry point"
gen: conformance

### SCN-ADAPTER-11b-1 — exactly one bounded call per site (happy)

source: REQ-ADAPTER-11b
Given a call-counter on `spyProposer` and a budget stub (cost cap + timeout `t`)
When `propose` runs for site `S_greet`
Then exactly one bounded call is made for `S_greet`, honoring the cost/timeout budget (≤1 call/site)
teeth: breaks-on "`propose` retries the model 3× on a low-confidence result — the call-counter records 3 calls for `S_greet` (>1 call/site, budget ignored)"
gen: conformance

### SCN-ADAPTER-11c-1 — the proposal enters as a gated candidate (guard)

source: REQ-ADAPTER-11c
Given `spyProposer` returns proposal `P0` for `S_greet`
When `P0` enters the pipeline
Then it enters as a **candidate** gated by the admission bar + ratification — never auto-trusted
teeth: breaks-on "`propose`'s return is written straight to the ratified store, skipping the admission bar — an auto-trusted proposal lands (the ratification gate is bypassed)"
gen: conformance

---

## REQ-ADAPTER-12 — rehydrate the session projection

### SCN-ADAPTER-12a-1 — a fresh process rehydrates the flushed fact byte-identically (happy)

source: REQ-ADAPTER-12a
Given run A writes + flushes fact `F` (`nodeKey claim:fix-cov`) to `.atlas/cas/`
When a fresh process (run B) reconstructs the `StoreProjection` current-node map from the durable store
Then `F` is present byte-identical in the reconstructed current-node map (`head(claim:fix-cov) == F`)
teeth: breaks-on "rehydrate reconstructs from an in-memory snapshot run B doesn't have (it never reads the durable CAS) — `F` is missing from the rehydrated projection"
gen: conformance

### SCN-ADAPTER-12b-1 — rehydrate reconstructs state only, minting nothing (guard)

source: REQ-ADAPTER-12b
Given a write-spy on the fact store while run B rehydrates the projection from run A's flushed CAS
When rehydration runs
Then the write-spy records 0 mint/alter — rehydration reconstructs state only
teeth: breaks-on "rehydrate re-runs `routeWrite` while rebuilding the projection and mints a fresh fact/pointer — the write-spy fires (reconstruct-only broken)"
gen: conformance

---

## REQ-WIRE-1 — one shared handler assembly

### SCN-WIRE-1a-1 — the wire module assembles one five-leg handler (happy)

source: REQ-WIRE-1a
Given the shared `wire` module and the adapters
When `createHandler(adapters)` is called
Then a single `WiredHandler` exposes exactly the five legs (`atlas-init`/`query`/`emit`/`reconcile`/`link`, the `atlas-link` leg added by WP-SAMEAS, ADR-0003) over the adapters
teeth: breaks-on "the `wire` module assembles two separate handlers (one per entrypoint) instead of one shared assembly — two `WiredHandler` instances exist"
gen: conformance

### SCN-WIRE-1b-1 — both entrypoints return byte-identical verdicts (guard)

source: REQ-WIRE-1b
Given the fixture set of tool calls `{init fix-repo, query greet, emit F, reconcile git-sbx}`
When each is driven through the CLI entrypoint and the MCP entrypoint
Then `deepEqual(cliVerdict, mcpVerdict)` for each call AND both entrypoints dispatch through the **same** `WiredHandler` instance (module-identity: `cliHandler === mcpHandler`, asserted via a shared-module import spy) — contract-identical by construction, not by copy
teeth: breaks-on "the MCP entrypoint imports its own copy-assembled handler — the module-identity assertion (`cliHandler === mcpHandler`) fails even though a faithful copy still produces byte-identical verdicts, so only the instance-identity clause distinguishes shared-module from copy"
gen: conformance

---

## REQ-CLI-1 — total command surface

### SCN-CLI-1a-1 — every command maps to exactly one leg (happy)

source: REQ-CLI-1a
Given the finite command set `{ init, query, emit, reconcile, doctor, mine }`
When the `command → wired-leg` map is enumerated
Then it is total and mutually exclusive: `init→atlas-init`, `query→atlas-query`, `emit→atlas-emit`, `reconcile→atlas-reconcile`, `doctor→atlas-query` (read path), `mine→genesis run-controller` — each command maps to exactly one leg
teeth: breaks-on "a new command `export` is added with no leg binding — the enumeration finds a command mapping to zero legs (totality fails), or `query` is bound to two legs (uniqueness fails)"
gen: exhaustive

### SCN-CLI-1b-1 — a malformed invocation yields a structured error (guard)

source: REQ-CLI-1b
Given the malformed invocation `atlas query --depth=notanumber`
When the CLI parses it
Then it yields a structured error `{ exitCode: non-zero, guidance }` — not a stack trace
teeth: breaks-on "the parser passes `--depth=NaN` through and the tool throws deep inside — no structured error is produced and guidance is absent (a non-zero-with-guidance contract violated)"
gen: PBT

### SCN-CLI-1c-1 — no malformed input crashes the parser (guard)

source: REQ-CLI-1c
Given a PBT-fuzz stream of malformed `argv` (empty, unknown flags, binary garbage, missing positional args)
When each input is fed to the CLI parser
Then every input returns a structured error with a non-zero exit — 0 uncaught throws / process crashes
teeth: breaks-on "an unknown-flag input `atlas --??` throws an uncaught exception and the process crashes instead of returning a structured error (the totality clause the finite enumeration cannot reach)"
gen: PBT

---

## REQ-CLI-2 — the CLI is the floor

### SCN-CLI-2a-1 — reads resolve directly over the CLI (happy)

source: REQ-CLI-2a
Given the read commands `{ query, reconcile, doctor }`
When the `command × authority` matrix is enumerated
Then each resolves over the CLI directly (a read path), classified as a read
teeth: breaks-on "`reconcile` is routed through the `atlas-emit` write-door instead of resolving as a direct read — a read is misclassified in the matrix"
gen: exhaustive

### SCN-CLI-2b-1 — every write funnels through a governed door (guard)

source: REQ-CLI-2b
Given the write commands `emit` and `link`
When the `command × authority` matrix is enumerated
Then every write funnels through a governed door — `atlas-emit` (grounded facts) or `atlas-link` (sameAs) — no command carries an ungoverned write path (ADR-0003)
teeth: breaks-on "`init` is granted a direct write path to the store bypassing the governed doors — an ungoverned write path appears in the matrix (the governed-door partition breaks)"
gen: exhaustive

### SCN-CLI-2c-1 — a read carries no write authority (guard)

source: REQ-CLI-2c
Given the read command `query`
When its authority cell is asserted in the matrix
Then `query` carries no write capability — read xor write, mutually exclusive
teeth: breaks-on "`query` is granted write authority (it can mint a fact) — a command is both a read and a write, the partition assertion fails"
gen: exhaustive

---

## REQ-CLI-3 — deterministic render

### SCN-CLI-3a-1 — the render matches the reference renderer byte-for-byte (happy)

source: REQ-CLI-3a
Given `V_ok` and the reference `Verdict` renderer
When the CLI renders `V_ok` to stdout
Then the output matches the reference renderer's output byte-for-byte
teeth: breaks-on "the renderer interpolates a timestamp/duration into stdout — the render diverges from the reference renderer (non-deterministic bytes)"
gen: conformance

### SCN-CLI-3b-1 — the exit code is a function of the verdict status (happy)

source: REQ-CLI-3b
Given the fixture set `{ V_ok, V_rej, V_err }`
When each is rendered
Then `exitCode == f(status)` — `0` for `ok`, non-zero for `rejected` (`2`) and `error` (`1`)
teeth: breaks-on "the CLI hardcodes `exit 0` after rendering — a `rejected` verdict exits `0` (the exit code ignores the verdict)"
gen: conformance

### SCN-CLI-3c-1 — the same verdict renders identically twice (happy)

source: REQ-CLI-3c
Given `V_rej`
When it is rendered twice
Then the two stdout strings are byte-identical
teeth: breaks-on "the renderer stamps a per-render value (a wall-clock timestamp / fresh nonce) into stdout instead of deriving the output purely from the verdict — so the two renders of `V_rej` differ (a `Set`-iteration reorder would not: identical input iterates identically)"
gen: conformance

### SCN-CLI-3d-1 — the render carries the tool's guidance (happy)

source: REQ-CLI-3d
Given `V_err` with guidance `"malformed input: expected a repo path"`
When it is rendered
Then the guidance text is present in stdout (TOOLS-4)
teeth: breaks-on "the renderer prints only `status` + `exitCode` and drops the verdict's `guidance` field — guidance is absent from stdout"
gen: conformance

---

## REQ-CLI-4 — mine drives the frozen run-controller

### SCN-CLI-4a-1 — mine's write-set equals the frozen run-controller's (happy)

source: REQ-CLI-4a
Given `fix-repo` and a recorded proposer, with the frozen `genesis` run-controller as the oracle
When `atlas mine fix-repo` runs a single governed pass
Then the produced write-set equals the run-controller's output over the same inputs
teeth: breaks-on "the `mine` driver re-orders the `scan→rank→extract→admit→align→seed` stages (runs `extract` before `rank`) — its write-set diverges from the frozen run-controller's"
gen: conformance

### SCN-CLI-4b-1 — every mined write is candidate-only (guard)

source: REQ-CLI-4b
Given `atlas mine fix-repo` produces facts from proposal `P0`
When each written fact's status is inspected
Then every write is candidate-only (status `candidate`), never ratified
teeth: breaks-on "the `mine` driver stamps a high-confidence proposal as `ratified` — a mined fact lands ratified (the never-ratified invariant is broken)"
gen: conformance

### SCN-CLI-4c-1 — mine adds no admission of its own (guard)

source: REQ-CLI-4c
Given the frozen run-controller owns the admission logic and a candidate the driver could pre-filter
When `atlas mine fix-repo` runs
Then the driver adds 0 admission of its own — the admitted set == the run-controller's admitted set
teeth: breaks-on "the `mine` driver adds a local pre-filter that admits/rejects a candidate before the run-controller — the admitted set diverges from the frozen run-controller's (admission invented)"
gen: conformance

### SCN-CLI-4d-1 — a non-empty frontier reaches the gate's verdict (happy)

source: REQ-CLI-4d
Given a real git repository carrying a real SCIP index, whose structural frontier is NON-EMPTY (asserted before anything is concluded from the run), and a spy proposer that returns a candidate at every site, with NO gate injected
When `atlas mine` runs over it on production defaults
Then every visited site reaches the verdict of the gate the composition root supplied — the admitted candidates are staged carrying a re-derived FRESH grounding receipt and a mechanically-computed obviousness score, and no site's outcome is the unwired-default abstention `no admission seam wired (mine default)`
teeth: breaks-on "the composition root supplies no gate (or supplies one built over a receipt taken verbatim from the seed, whose `subtreeHash` is the dependency-axis node identity the freshness oracle refuses by construction) — the frontier is unchanged, the model is still called at every site, and 0 candidates are staged"
gen: conformance

### SCN-CLI-4d-2 — with the gate absent the run still abstains, and says so (guard)

source: REQ-CLI-4d
Given the SAME repository, the SAME frontier and the SAME spy proposer as SCN-CLI-4d-1, with the admission supply deliberately REMOVED
When `atlas mine` runs
Then the pass visits the same sites, spends the same model calls, stages 0 candidates, and the abstention NAMES THE WIRING (`no admission seam wired (mine default)`) rather than the repository
teeth: breaks-on "the unwired gate abstains anonymously — an unsupplied gate and a repository that genuinely holds no groundable fact render identically, which is the indistinguishability that let `atlas mine` ship staging nothing while REQ-CLI-4a/4b/4c all held"
gen: conformance

---

## REQ-CLI-7 — promote curates through the existing write door

### SCN-CLI-7a-1 — a promoted candidate is published by the emit door, and the surface does not move (happy)

source: REQ-CLI-7a
Given a repo whose staging sidecar holds one grounded candidate and whose admin policy appoints a curator over the mined scope
When `atlas promote` runs under that curator with a ratifier named
Then the candidate is durable in the governed projection, `GOVERNANCE_SURFACE` is still the five governed tools, `WRITE_PATHS` is still `{atlas-emit, atlas-link}`, and the CLI leg `promote` binds a member of `WRITE_PATHS`
teeth: breaks-on "promotion is given its own governed tool (`atlas-promote`) or its own write medium — the frozen `WRITE_PATHS` no longer equals the set of legs the write commands funnel into"
gen: conformance

### SCN-CLI-7b-1 — a staged candidate does not auto-accept (guard)

source: REQ-CLI-7b
Given a staged candidate that is grounded, `T2` and advisory — the exact shape the confidence fast path auto-accepts — and no ratifier named
When `atlas promote` runs
Then the candidate is refused `unratified`, nothing is persisted, and the SAME candidate through an authored emit leg auto-accepts with no ratifier at all
teeth: breaks-on "the promotion path uses the write door's DEFAULT ratify context — the candidate fast-paths to auto-accept, `ratify` is never called, and the row lands with no ratifier consulted"
gen: conformance

### SCN-CLI-7c-1 — the fast-path derivation forges no store state (guard)

source: REQ-CLI-7c
Given the ratification context the promotion door builds for a staged candidate
When that context is inspected field by field
Then it reports the candidate as neither contested nor high-risk, and states the promotion origin instead
teeth: breaks-on "the promotion route is obtained by setting `contested: true` (or `lowRisk: false`) — the route is correct and the record now asserts a reviewer veto / threshold verdict that nobody computed"
gen: conformance

### SCN-CLI-7d-1 — one unpromotable row does not end the pass (guard)

source: REQ-CLI-7d
Given a staging sidecar holding one row whose CAS bytes are absent, one row whose grounding names no single containing unit, and one healthy candidate
When `atlas promote` runs
Then each bad row is refused by its own named reason, the healthy candidate is promoted, and every row appears in the report
teeth: breaks-on "an unrehydratable row is skipped (it vanishes from the report and the candidate count under-counts) or throws (the pass dies and the healthy candidate is lost)"
gen: conformance

### SCN-CLI-7e-1 — the count is what settled (guard)

source: REQ-CLI-7e
Given a staging sidecar holding several candidates of which exactly one can clear the gates
When `atlas promote` runs
Then the reported promoted count is one, it equals the number of rows the governed projection gained, and promoted plus refused equals the candidates found
teeth: breaks-on "the pass reports the number of rows it ATTEMPTED — the measured shape of 40 candidates reported committed against 5 durable"
gen: conformance

### SCN-CLI-7f-1 — a refused staging read is reported as a refusal (guard)

source: REQ-CLI-7f
Given a staging sidecar whose read refuses (unreadable, untrusted or contended) while candidates are still on disk
When `atlas promote` runs
Then the outcome is a named refusal with a non-zero exit, and it is distinguishable from a staging that is honestly empty
teeth: breaks-on "a refused staging read degrades to the empty projection — the pass reports a clean, complete promotion of nothing over candidates that were never read"
gen: conformance

---

## REQ-MCP-1 — the published set is the closed tool union (amended ADR-0006)

### SCN-MCP-1a-1 — the published set is exactly the closed `Tool` union, with schemas (happy, amended ADR-0006)

source: REQ-MCP-1a
Given the MCP stdio server
When the published tool set is enumerated
Then it equals exactly the closed `Tool` union — `GOVERNANCE_SURFACE ∪ READ_SURFACE`, which enumerates to `{ atlas-init, atlas-query, atlas-emit, atlas-reconcile, atlas-link }` today (ADR-0003; `READ_SURFACE` empty until CAMPAIGN-10.3) — each with its input schema
teeth: breaks-on "the server publishes `atlas-init` without its input schema — the enumerated set does not match the union-with-schemas oracle"
gen: exhaustive

### SCN-MCP-1b-1 — no tool outside the closed union is published (guard, amended ADR-0006)

source: REQ-MCP-1b
Given the published tool set
When a set-equality assertion runs against the closed `Tool` union
Then every published tool is a member of the union and no non-member is registered
teeth: breaks-on "a debug tool `atlas-dump` is registered — it is in neither GOVERNANCE_SURFACE nor READ_SURFACE, so it is outside the closed union"
gen: exhaustive

### SCN-MCP-1d-1 — advertised equals invocable (happy, added ADR-0006)

source: REQ-MCP-1d
Given the advertised tool list and the set of tokens the handler will actually dispatch
When the two are compared as sets
Then they are equal, and both equal the closed `Tool` union
teeth: breaks-on "a leg bound at the composition root for a token absent from the advertised list — it is invocable over MCP, unadvertised, and invisible to every surface pin (the pre-ADR-0006 state, where callTool dispatched on legs[tool] with no membership check)"
gen: exhaustive

### SCN-MCP-1e-1 — advertised and invocable are both traced to the ONE source, never computed separately (guard, added ADR-0006)

source: REQ-MCP-1e
Given the advertised tool set (`advertisedTools`, derived from `GOVERNANCE_SURFACE`) and the dispatch path (`callTool`, which forwards every non-read-tool name to `handler.handle` unfiltered)
When both are probed against the SAME production `GOVERNANCE_SURFACE` — the advertised names for exact (ordered) equality, and the dispatch path for whether an off-surface name still reaches `handler.handle` unfiltered by any independent list inside `callTool`
Then the advertised set equals `GOVERNANCE_SURFACE` byte-for-byte and `callTool` carries no second membership computation of its own, so the two sets cannot diverge without an edit to `GOVERNANCE_SURFACE` itself
teeth: breaks-on "advertisedTools reads from a second hardcoded literal array instead of GOVERNANCE_SURFACE.map(...), OR callTool grows its own allowlist/blocklist before forwarding to handler.handle — either is the advertised and invocable sets being COMPUTED SEPARATELY, which is exactly what REQ-MCP-1e forbids"
gen: conformance

### SCN-MCP-1c-1 — every MCP call routes through the shared handler and matches the CLI verdict (happy)

source: REQ-MCP-1c
Given the tool call `query greet` over both transports
When it is routed over MCP and over the CLI
Then the MCP call dispatches through the shared `WiredHandler` (WIRE-1) and the MCP verdict == the CLI verdict, byte-identical
teeth: breaks-on "the MCP server dispatches `query` through its own handler copy instead of the shared `WiredHandler` — the MCP verdict diverges from the CLI verdict (routing bypasses the parity oracle)"
gen: exhaustive

---

## REQ-MCP-2 — fail-closed transport

### SCN-MCP-2a-1 — a tool error surfaces as a rejected verdict (guard)

source: REQ-MCP-2a
Given a tool stub for `atlas-emit` that throws mid-call
When it is called over MCP
Then the MCP result carries a structured rejected `Verdict` (`isError` set, status `rejected`/`error`, verdict present)
teeth: breaks-on "the thrown error is swallowed and the server returns an empty `ok` result — no rejected `Verdict` in the MCP result"
gen: conformance

### SCN-MCP-2b-1 — the server does not crash on a tool error (guard)

source: REQ-MCP-2b
Given the throwing `atlas-emit` stub
When it throws
Then the MCP stdio server stays up and continues serving the next request
teeth: breaks-on "the uncaught tool exception propagates to the stdio loop and the server process exits (a transport crash)"
gen: conformance

### SCN-MCP-2c-1 — the fail-closed verdict is never dropped (guard)

source: REQ-MCP-2c
Given the throwing `atlas-emit` stub
When the error is handled
Then no empty or `ok` result is emitted — the fail-closed rejected verdict is always carried in the MCP result
teeth: breaks-on "on error the server returns `{ content: [] }` (an empty result) instead of the fail-closed rejected verdict — the verdict is dropped (TOOLS-2 broken across the transport)"
gen: conformance

---

## Coverage ledger (S3 completeness facet)

- **REQ coverage:** 58/58 REQ have ≥1 SCN. <!-- AMENDED 2026-08-12: SCN-MCP-1e-1 closes REQ-MCP-1e -->
  <!-- COUNTED, not restated: this ledger read "55/55" while the two files already held 57 REQs and 57 SCNs
       before the amendment below — REQ-MCP-1d/1e and SCN-MCP-1d-1 landed with the governed-write-doors
       amendment (8cd1cb9) and the ledger was not recounted, leaving REQ-MCP-1e with no SCN here. It sat at
       57/58, every REQ except REQ-MCP-1e, until `packages/mcp-server/test/surface-conformance-req-mcp-1e.test.ts`
       (SCN-MCP-1e-1) landed and closed the gap — recounted here, not absorbed into a fresh number. -->
- **SCN count:** 61 — 56 as frozen, +1 `SCN-MCP-1d-1` (the write-doors amendment), +3 `SCN-ADAPTER-1e-1/2/3`
  (the tracked-symlink amendment), +1 `SCN-MCP-1e-1` (the REQ-MCP-1e witness). Two extras sit under one REQ
  each: REQ-ADAPTER-7b (the supersede-ordering witness in both delivery orders, distinct from the idempotence
  witness) and REQ-ADAPTER-1e (three properties of one rule: the link text, the unrefined fold, the included
  broken/dir links).
- **Guard coverage:** every guard/`If-then` REQ has a guard SCN with an interesting witness —
  ADAPTER-1b/1c, **1e**, 2b/2c, 3b/3c, 4c, 5b, 6c, 7c, 8c, 9b, 10b/10c, 11a/11c, 12b, WIRE-1b, CLI-1b/1c, 2b/2c,
  4b/4c, MCP-1b, **1e**, 2a/2b/2c. No antecedent-failure vacuity: each guard SCN non-trivially enters the guarded
  state (a real dangling ref, a real un-indexed language adjacent to real edges, a real supersede in both
  orders, a real rebase that changes the sha, a tool that genuinely throws).
- **Teeth (Gate 3):** 61/61 SCN name the exact mutant of their REQ they flip to BROKEN on (counted: 61 `teeth:`
  lines for 61 SCN headings); none vacuous. The three ADAPTER-1e teeth are not hypothetical — the walker
  mutants they name were APPLIED to the shipped source and killed by the suite. The
  durable-store teeth (ADAPTER-6b/6c/7a/7b/12a/12b) bite the flush→fresh-process→read-back seam a memory-only
  golden cannot see (per the ADAPTER-7 anti-rot). **100% teeth coverage.**
- **gen histogram:** conformance 47 (counted; 43 frozen + SCN-MCP-1d-1 + the three ADAPTER-1e SCNs + SCN-MCP-1e-1,
  whose oracle is the `link-repo` fixture above / the shared `GOVERNANCE_SURFACE` oracle) · exhaustive 7 (CLI-1a, CLI-2a/2b/2c, MCP-1a/1b/1c) · PBT 6
  (ADAPTER-7a/7b-idempotence/7b-supersede/7c + CLI-1b/1c malformed-argv fuzz arm) · residue 0.
- **Method-tag → gen mapping (audit):** all 15 `reference-model` INVs → `conformance`; the `PBT` INV (ADAPTER-7)
  → `PBT`. The 3 `exhaustive` INVs → `exhaustive` for their finite-enumeration SCNs; CLI-1's malformed-`argv`
  totality SCNs (1b/1c) are the **PBT-fuzz arm** its own S2 down-model mandates (the infinite argv space cannot
  be exhaustively enumerated), so they carry `gen: PBT` — CLI-1a (the finite `command→leg` map) stays
  `exhaustive`. No hand-authored generated case; no `residue` fabricated.
- **No [NEEDS RECONCILIATION]:** every SCN stayed grounded in a frozen REQ normative-clause + its S2 down-model
  oracle; no golden required deciding new behaviour, and no REQ lacked a writable golden (0 atom-gate bounces).
- → next_state **C** (roadmap).

## CAMPAIGN-11 — the MEMORY RING

> Generated from the method-tag, as S3 requires. Every SCN names the SHIPPED test that witnesses it —
> these are not to-be-written goldens, they are the acceptance already green on `master`.

### SCN-MEMRING-1a-1 — append-only and content-keyed, one record per line (happy)

source: REQ-MEMRING-1a
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-1 is exercised
Then append-only and content-keyed, one record per line
teeth: breaks-on "the reader's content-key check is the mock; removing it folds a hand-edited line in as a record"
witness: packages/adapter-io/test/memory-store.test.ts
gen: conformance

### SCN-MEMRING-1b-1 — a record appended in one process is readable byte-identical in a later process (happy)

source: REQ-MEMRING-1b
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-1 is exercised
Then a record appended in one process is readable byte-identical in a later process
teeth: breaks-on "the reader's content-key check is the mock; removing it folds a hand-edited line in as a record"
witness: packages/adapter-io/test/memory-store.test.ts
gen: conformance

### SCN-MEMRING-1c-1 — NEVER rewrite, truncate or reorder an existing line (happy)

source: REQ-MEMRING-1c
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-1 is exercised
Then NEVER rewrite, truncate or reorder an existing line
teeth: breaks-on "the reader's content-key check is the mock; removing it folds a hand-edited line in as a record"
witness: packages/adapter-io/test/memory-store.test.ts
gen: conformance

### SCN-MEMRING-1d-1 — a line whose id is not its own content hash is refused on read AND counted (happy)

source: REQ-MEMRING-1d
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-1 is exercised
Then a line whose id is not its own content hash is refused on read AND counted
teeth: breaks-on "the reader's content-key check is the mock; removing it folds a hand-edited line in as a record"
witness: packages/adapter-io/test/memory-store.test.ts
gen: conformance

### SCN-MEMRING-1e-1 — a torn or hand-edited line is folded in as a record (guard)

source: REQ-MEMRING-1e
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-1 is exercised
Then a torn or hand-edited line is folded in as a record
teeth: breaks-on "the reader's content-key check is the mock; removing it folds a hand-edited line in as a record"
witness: packages/adapter-io/test/memory-store.test.ts
gen: conformance

### SCN-MEMRING-1f-1 — an unreadable log is reported as an empty store (guard)

source: REQ-MEMRING-1f
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-1 is exercised
Then an unreadable log is reported as an empty store
teeth: breaks-on "the reader's content-key check is the mock; removing it folds a hand-edited line in as a record"
witness: packages/adapter-io/test/memory-store.test.ts
gen: conformance

### SCN-MEMRING-2a-1 — two processes appending concurrently both land (happy)

source: REQ-MEMRING-2a
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-2 is exercised
Then two processes appending concurrently both land
teeth: breaks-on "the O_APPEND write is the mock; replacing it with a read-modify-write drops the count from 40 to 3"
witness: packages/adapter-io/test/memory-store.test.ts
gen: conformance

### SCN-MEMRING-2b-1 — the fold contains every record either writer wrote (happy)

source: REQ-MEMRING-2b
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-2 is exercised
Then the fold contains every record either writer wrote
teeth: breaks-on "the O_APPEND write is the mock; replacing it with a read-modify-write drops the count from 40 to 3"
witness: packages/adapter-io/test/memory-store.test.ts
gen: conformance

### SCN-MEMRING-2c-1 — a concurrent append silently overwrites another writer's record (guard)

source: REQ-MEMRING-2c
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-2 is exercised
Then a concurrent append silently overwrites another writer's record
teeth: breaks-on "the O_APPEND write is the mock; replacing it with a read-modify-write drops the count from 40 to 3"
witness: packages/adapter-io/test/memory-store.test.ts
gen: conformance

### SCN-MEMRING-3a-1 — admitted to git (the log travels) (happy)

source: REQ-MEMRING-3a
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-3 is exercised
Then admitted to git (the log travels)
teeth: breaks-on "the JSONL one-record-per-line form is the mock; a multi-line record makes the same merge splice"
witness: packages/adapter-io/test/memory-store.test.ts
gen: conformance

### SCN-MEMRING-3b-1 — survives a plain text merge with 0 records lost and 0 spliced (happy)

source: REQ-MEMRING-3b
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-3 is exercised
Then survives a plain text merge with 0 records lost and 0 spliced
teeth: breaks-on "the JSONL one-record-per-line form is the mock; a multi-line record makes the same merge splice"
witness: packages/adapter-io/test/memory-store.test.ts
gen: conformance

### SCN-MEMRING-3c-1 — a duplicated line dedups by content id on the fold (happy)

source: REQ-MEMRING-3c
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-3 is exercised
Then a duplicated line dedups by content id on the fold
teeth: breaks-on "the JSONL one-record-per-line form is the mock; a multi-line record makes the same merge splice"
witness: packages/adapter-io/test/memory-store.test.ts
gen: conformance

### SCN-MEMRING-3d-1 — a branch merge loses a record (guard)

source: REQ-MEMRING-3d
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-3 is exercised
Then a branch merge loses a record
teeth: breaks-on "the JSONL one-record-per-line form is the mock; a multi-line record makes the same merge splice"
witness: packages/adapter-io/test/memory-store.test.ts
gen: conformance

### SCN-MEMRING-3e-1 — a merge splices two records into one (guard)

source: REQ-MEMRING-3e
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-3 is exercised
Then a merge splices two records into one
teeth: breaks-on "the JSONL one-record-per-line form is the mock; a multi-line record makes the same merge splice"
witness: packages/adapter-io/test/memory-store.test.ts
gen: conformance

### SCN-MEMRING-4a-1 — the gates run in the stated ORDER (happy)

source: REQ-MEMRING-4a
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-4 is exercised
Then the gates run in the stated ORDER
teeth: breaks-on "the ordered composition is the mock; reordering derivation after validation judges a payload by a template it chose"
witness: packages/adapter-io/test/memory-emit.test.ts
gen: exhaustive

### SCN-MEMRING-4b-1 — each refusal is a structured verdict NAMING the gate (happy)

source: REQ-MEMRING-4b
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-4 is exercised
Then each refusal is a structured verdict NAMING the gate
teeth: breaks-on "the ordered composition is the mock; reordering derivation after validation judges a payload by a template it chose"
witness: packages/adapter-io/test/memory-emit.test.ts
gen: exhaustive

### SCN-MEMRING-4c-1 — the door authors no policy of its own (happy)

source: REQ-MEMRING-4c
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-4 is exercised
Then the door authors no policy of its own
teeth: breaks-on "the ordered composition is the mock; reordering derivation after validation judges a payload by a template it chose"
witness: packages/adapter-io/test/memory-emit.test.ts
gen: exhaustive

### SCN-MEMRING-4d-1 — a record reaches disk having skipped a gate (guard)

source: REQ-MEMRING-4d
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-4 is exercised
Then a record reaches disk having skipped a gate
teeth: breaks-on "the ordered composition is the mock; reordering derivation after validation judges a payload by a template it chose"
witness: packages/adapter-io/test/memory-emit.test.ts
gen: exhaustive

### SCN-MEMRING-4e-1 — a refusal escapes as a thrown exception a caller can swallow (guard)

source: REQ-MEMRING-4e
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-4 is exercised
Then a refusal escapes as a thrown exception a caller can swallow
teeth: breaks-on "the ordered composition is the mock; reordering derivation after validation judges a payload by a template it chose"
witness: packages/adapter-io/test/memory-emit.test.ts
gen: exhaustive

### SCN-MEMRING-5a-1 — the template is selected from the entry's SHAPE (happy)

source: REQ-MEMRING-5a
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-5 is exercised
Then the template is selected from the entry's SHAPE
teeth: breaks-on "the multi-match refusal is the mock; a first-match-wins fold files an ambiguous entry silently"
witness: packages/memory/test/mem-kind-derivation.test.ts
gen: conformance

### SCN-MEMRING-5b-1 — no caller-supplied argument selects it (happy)

source: REQ-MEMRING-5b
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-5 is exercised
Then no caller-supplied argument selects it
teeth: breaks-on "the multi-match refusal is the mock; a first-match-wins fold files an ambiguous entry silently"
witness: packages/memory/test/mem-kind-derivation.test.ts
gen: conformance

### SCN-MEMRING-5c-1 — no-match and multi-match are BOTH refused, never guessed (happy)

source: REQ-MEMRING-5c
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-5 is exercised
Then no-match and multi-match are BOTH refused, never guessed
teeth: breaks-on "the multi-match refusal is the mock; a first-match-wins fold files an ambiguous entry silently"
witness: packages/memory/test/mem-kind-derivation.test.ts
gen: conformance

### SCN-MEMRING-5d-1 — a caller files a payload under a template that judges it more leniently (guard)

source: REQ-MEMRING-5d
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-5 is exercised
Then a caller files a payload under a template that judges it more leniently
teeth: breaks-on "the multi-match refusal is the mock; a first-match-wins fold files an ambiguous entry silently"
witness: packages/memory/test/mem-kind-derivation.test.ts
gen: conformance

### SCN-MEMRING-5e-1 — an ambiguous shape is filed under the first matching template (guard)

source: REQ-MEMRING-5e
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-5 is exercised
Then an ambiguous shape is filed under the first matching template
teeth: breaks-on "the multi-match refusal is the mock; a first-match-wins fold files an ambiguous entry silently"
witness: packages/memory/test/mem-kind-derivation.test.ts
gen: conformance

### SCN-MEMRING-6a-1 — owner = the composition root's resolved actor (happy)

source: REQ-MEMRING-6a
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-6 is exercised
Then owner = the composition root's resolved actor
teeth: breaks-on "the empty-owner refusal is the mock; removing it mints a record every empty-actor caller is injected"
witness: packages/memory/test/mem-kind-derivation.test.ts
gen: conformance

### SCN-MEMRING-6b-1 — no transport flag sets it (happy)

source: REQ-MEMRING-6b
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-6 is exercised
Then no transport flag sets it
teeth: breaks-on "the empty-owner refusal is the mock; removing it mints a record every empty-actor caller is injected"
witness: packages/memory/test/mem-kind-derivation.test.ts
gen: conformance

### SCN-MEMRING-6c-1 — an empty owner is refused fail-closed (happy)

source: REQ-MEMRING-6c
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-6 is exercised
Then an empty owner is refused fail-closed
teeth: breaks-on "the empty-owner refusal is the mock; removing it mints a record every empty-actor caller is injected"
witness: packages/memory/test/mem-kind-derivation.test.ts
gen: conformance

### SCN-MEMRING-6d-1 — a caller sets the owner of a record they write (guard)

source: REQ-MEMRING-6d
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-6 is exercised
Then a caller sets the owner of a record they write
teeth: breaks-on "the empty-owner refusal is the mock; removing it mints a record every empty-actor caller is injected"
witness: packages/memory/test/mem-kind-derivation.test.ts
gen: conformance

### SCN-MEMRING-6e-1 — an unowned record is written and then injected to every empty-actor caller (guard)

source: REQ-MEMRING-6e
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-6 is exercised
Then an unowned record is written and then injected to every empty-actor caller
teeth: breaks-on "the empty-owner refusal is the mock; removing it mints a record every empty-actor caller is injected"
witness: packages/memory/test/mem-kind-derivation.test.ts
gen: conformance

### SCN-MEMRING-7a-1 — binds a NAMED binary actually present on PATH (happy)

source: REQ-MEMRING-7a
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-7 is exercised
Then binds a NAMED binary actually present on PATH
teeth: breaks-on "the argv is the mock; the shipped `detect --source -` exits 1 on clean input and turns the clean-scan leg red"
witness: packages/adapter-io/test/scanner-conformance.test.ts
gen: conformance

### SCN-MEMRING-7b-1 — no scanner available means the write is REFUSED (happy)

source: REQ-MEMRING-7b
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-7 is exercised
Then no scanner available means the write is REFUSED
teeth: breaks-on "the argv is the mock; the shipped `detect --source -` exits 1 on clean input and turns the clean-scan leg red"
witness: packages/adapter-io/test/scanner-conformance.test.ts
gen: conformance

### SCN-MEMRING-7c-1 — never redacted-and-continued (happy)

source: REQ-MEMRING-7c
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-7 is exercised
Then never redacted-and-continued
teeth: breaks-on "the argv is the mock; the shipped `detect --source -` exits 1 on clean input and turns the clean-scan leg red"
witness: packages/adapter-io/test/scanner-conformance.test.ts
gen: conformance

### SCN-MEMRING-7d-1 — a write lands with no scanner having run (guard)

source: REQ-MEMRING-7d
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-7 is exercised
Then a write lands with no scanner having run
teeth: breaks-on "the argv is the mock; the shipped `detect --source -` exits 1 on clean input and turns the clean-scan leg red"
witness: packages/adapter-io/test/scanner-conformance.test.ts
gen: conformance

### SCN-MEMRING-7e-1 — a clean record is refused because the invocation is wrong (guard)

source: REQ-MEMRING-7e
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-7 is exercised
Then a clean record is refused because the invocation is wrong
teeth: breaks-on "the argv is the mock; the shipped `detect --source -` exits 1 on clean input and turns the clean-scan leg red"
witness: packages/adapter-io/test/scanner-conformance.test.ts
gen: conformance

### SCN-MEMRING-7f-1 — a secret-carrying record is admitted because the invocation always exits clean (guard)

source: REQ-MEMRING-7f
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-7 is exercised
Then a secret-carrying record is admitted because the invocation always exits clean
teeth: breaks-on "the argv is the mock; the shipped `detect --source -` exits 1 on clean input and turns the clean-scan leg red"
witness: packages/adapter-io/test/scanner-conformance.test.ts
gen: conformance

### SCN-MEMRING-8a-1 — only the calling actor's own records — zero cross-seat (happy)

source: REQ-MEMRING-8a
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-8 is exercised
Then only the calling actor's own records — zero cross-seat
teeth: breaks-on "the `injectFor` owner filter is the mock; removing it leaks the other seat into the header"
witness: packages/adapter-io/test/memory-read.test.ts
gen: conformance

### SCN-MEMRING-8b-1 — task, pr and logbook NEVER ride the header (happy)

source: REQ-MEMRING-8b
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-8 is exercised
Then task, pr and logbook NEVER ride the header
teeth: breaks-on "the `injectFor` owner filter is the mock; removing it leaks the other seat into the header"
witness: packages/adapter-io/test/memory-read.test.ts
gen: conformance

### SCN-MEMRING-8c-1 — they return ONLY via an explicit recall (happy)

source: REQ-MEMRING-8c
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-8 is exercised
Then they return ONLY via an explicit recall
teeth: breaks-on "the `injectFor` owner filter is the mock; removing it leaks the other seat into the header"
witness: packages/adapter-io/test/memory-read.test.ts
gen: conformance

### SCN-MEMRING-8d-1 — another seat's record appears in a header (guard)

source: REQ-MEMRING-8d
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-8 is exercised
Then another seat's record appears in a header
teeth: breaks-on "the `injectFor` owner filter is the mock; removing it leaks the other seat into the header"
witness: packages/adapter-io/test/memory-read.test.ts
gen: conformance

### SCN-MEMRING-8e-1 — a consultable kind auto-injects on a running turn (guard)

source: REQ-MEMRING-8e
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-8 is exercised
Then a consultable kind auto-injects on a running turn
teeth: breaks-on "the `injectFor` owner filter is the mock; removing it leaks the other seat into the header"
witness: packages/adapter-io/test/memory-read.test.ts
gen: conformance

### SCN-MEMRING-8f-1 — an unqualified read returns a general dump (guard)

source: REQ-MEMRING-8f
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-8 is exercised
Then an unqualified read returns a general dump
teeth: breaks-on "the `injectFor` owner filter is the mock; removing it leaks the other seat into the header"
witness: packages/adapter-io/test/memory-read.test.ts
gen: conformance

### SCN-MEMRING-9a-1 — the injected set is the top-N by effective frecency, descending (happy)

source: REQ-MEMRING-9a
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-9 is exercised
Then the injected set is the top-N by effective frecency, descending
teeth: breaks-on "the decay term is the mock; returning the stored value unchanged turns the frecency legs red"
witness: packages/adapter-io/test/memory-read.test.ts
gen: conformance

### SCN-MEMRING-9b-1 — a decayed entry is evicted even when slots are free (happy)

source: REQ-MEMRING-9b
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-9 is exercised
Then a decayed entry is evicted even when slots are free
teeth: breaks-on "the decay term is the mock; returning the stored value unchanged turns the frecency legs red"
witness: packages/adapter-io/test/memory-read.test.ts
gen: conformance

### SCN-MEMRING-9c-1 — an evicted entry remains re-spawnable — nothing dies (happy)

source: REQ-MEMRING-9c
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-9 is exercised
Then an evicted entry remains re-spawnable — nothing dies
teeth: breaks-on "the decay term is the mock; returning the stored value unchanged turns the frecency legs red"
witness: packages/adapter-io/test/memory-read.test.ts
gen: conformance

### SCN-MEMRING-9d-1 — decay advances with the LOG's own head, never wall-clock (happy)

source: REQ-MEMRING-9d
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-9 is exercised
Then decay advances with the LOG's own head, never wall-clock
teeth: breaks-on "the decay term is the mock; returning the stored value unchanged turns the frecency legs red"
witness: packages/adapter-io/test/memory-read.test.ts
gen: conformance

### SCN-MEMRING-9e-1 — a system-clock jump changes the injected set with no new log entries (guard)

source: REQ-MEMRING-9e
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-9 is exercised
Then a system-clock jump changes the injected set with no new log entries
teeth: breaks-on "the decay term is the mock; returning the stored value unchanged turns the frecency legs red"
witness: packages/adapter-io/test/memory-read.test.ts
gen: conformance

### SCN-MEMRING-9f-1 — an evicted rule is unrecoverable (guard)

source: REQ-MEMRING-9f
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-9 is exercised
Then an evicted rule is unrecoverable
teeth: breaks-on "the decay term is the mock; returning the stored value unchanged turns the frecency legs red"
witness: packages/adapter-io/test/memory-read.test.ts
gen: conformance

### SCN-MEMRING-9g-1 — a low-frecency entry is injected because slots happened to be free (guard)

source: REQ-MEMRING-9g
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-9 is exercised
Then a low-frecency entry is injected because slots happened to be free
teeth: breaks-on "the decay term is the mock; returning the stored value unchanged turns the frecency legs red"
witness: packages/adapter-io/test/memory-read.test.ts
gen: conformance

### SCN-MEMRING-10a-1 — assembled from real sources (happy)

source: REQ-MEMRING-10a
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-10 is exercised
Then assembled from real sources
teeth: breaks-on "the sentinel is the mock; substituting a generic card makes an absent facet indistinguishable from a seeded one"
witness: packages/adapter-io/test/awareness-store.test.ts
gen: conformance

### SCN-MEMRING-10b-1 — an absent source renders the labeled UN-SEEDED sentinel (happy)

source: REQ-MEMRING-10b
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-10 is exercised
Then an absent source renders the labeled UN-SEEDED sentinel
teeth: breaks-on "the sentinel is the mock; substituting a generic card makes an absent facet indistinguishable from a seeded one"
witness: packages/adapter-io/test/awareness-store.test.ts
gen: conformance

### SCN-MEMRING-10c-1 — never filled with invented text (happy)

source: REQ-MEMRING-10c
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-10 is exercised
Then never filled with invented text
teeth: breaks-on "the sentinel is the mock; substituting a generic card makes an absent facet indistinguishable from a seeded one"
witness: packages/adapter-io/test/awareness-store.test.ts
gen: conformance

### SCN-MEMRING-10d-1 — an absent facet is rendered as plausible prose (guard)

source: REQ-MEMRING-10d
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-10 is exercised
Then an absent facet is rendered as plausible prose
teeth: breaks-on "the sentinel is the mock; substituting a generic card makes an absent facet indistinguishable from a seeded one"
witness: packages/adapter-io/test/awareness-store.test.ts
gen: conformance

### SCN-MEMRING-10e-1 — a slab is served without its grounding (guard)

source: REQ-MEMRING-10e
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-10 is exercised
Then a slab is served without its grounding
teeth: breaks-on "the sentinel is the mock; substituting a generic card makes an absent facet indistinguishable from a seeded one"
witness: packages/adapter-io/test/awareness-store.test.ts
gen: conformance

### SCN-MEMRING-11a-1 — an identical call yields a byte-identical Verdict on both transports (happy)

source: REQ-MEMRING-11a
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-11 is exercised
Then an identical call yields a byte-identical Verdict on both transports
teeth: breaks-on "the shared handler is the mock; a second, separately-composed door diverges under the same call"
witness: packages/mcp-server/test/memory-emit-mcp.test.ts
gen: conformance

### SCN-MEMRING-11b-1 — a refusal carries the same named reason on both (happy)

source: REQ-MEMRING-11b
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-11 is exercised
Then a refusal carries the same named reason on both
teeth: breaks-on "the shared handler is the mock; a second, separately-composed door diverges under the same call"
witness: packages/mcp-server/test/memory-emit-mcp.test.ts
gen: conformance

### SCN-MEMRING-11c-1 — the two transports disagree on an admission (guard)

source: REQ-MEMRING-11c
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-11 is exercised
Then the two transports disagree on an admission
teeth: breaks-on "the shared handler is the mock; a second, separately-composed door diverges under the same call"
witness: packages/mcp-server/test/memory-emit-mcp.test.ts
gen: conformance

### SCN-MEMRING-11d-1 — a refusal reads differently over MCP than on the CLI (guard)

source: REQ-MEMRING-11d
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-11 is exercised
Then a refusal reads differently over MCP than on the CLI
teeth: breaks-on "the shared handler is the mock; a second, separately-composed door diverges under the same call"
witness: packages/mcp-server/test/memory-emit-mcp.test.ts
gen: conformance

### SCN-MEMRING-12a-1 — every shipped memory command has a reference page (happy)

source: REQ-MEMRING-12a
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-12 is exercised
Then every shipped memory command has a reference page
teeth: breaks-on "the guard's README leg is the mock; removing it lets the table drift, which is exactly how it reached ten rows against twenty-three commands"
witness: harness/gates/command-doc-guard.mjs
gen: exhaustive

### SCN-MEMRING-12b-1 — every shipped memory command has a README table row (happy)

source: REQ-MEMRING-12b
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-12 is exercised
Then every shipped memory command has a README table row
teeth: breaks-on "the guard's README leg is the mock; removing it lets the table drift, which is exactly how it reached ten rows against twenty-three commands"
witness: harness/gates/command-doc-guard.mjs
gen: exhaustive

### SCN-MEMRING-12c-1 — neither names a command that does not ship (happy)

source: REQ-MEMRING-12c
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-12 is exercised
Then neither names a command that does not ship
teeth: breaks-on "the guard's README leg is the mock; removing it lets the table drift, which is exactly how it reached ten rows against twenty-three commands"
witness: harness/gates/command-doc-guard.mjs
gen: exhaustive

### SCN-MEMRING-12d-1 — a shipped command is absent from the README table (guard)

source: REQ-MEMRING-12d
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-12 is exercised
Then a shipped command is absent from the README table
teeth: breaks-on "the guard's README leg is the mock; removing it lets the table drift, which is exactly how it reached ten rows against twenty-three commands"
witness: harness/gates/command-doc-guard.mjs
gen: exhaustive

### SCN-MEMRING-12e-1 — the README table advertises a command that does not run (guard)

source: REQ-MEMRING-12e
Given the shipped memory ring over a real durable store
When the door for INV-MEMRING-12 is exercised
Then the README table advertises a command that does not run
teeth: breaks-on "the guard's README leg is the mock; removing it lets the table drift, which is exactly how it reached ten rows against twenty-three commands"
witness: harness/gates/command-doc-guard.mjs
gen: exhaustive
