# atlas-adapters — Reference (the productization ring)

> owner: orchestrator · grounding: each clause REALIZES a frozen layer-0 port (cited `→ port@file`) or an
> already-ratified reference invariant; the ratified productization decisions are recorded in §Decisions ·
> status: **draft — S0 design-freeze candidate for Campaign-9** (DEFINE seat = owner ratifies)

## Purpose

The layer-0 core (Campaigns 1–8) is a pure hexagon: every external system is a **frozen injected port**
satisfied by a fake in tests. This document is the **constitution of the outer ring** — the real **adapters**
that fill those ports over real backends (a code indexer, a durable store, git, an LLM) and the **entrypoints**
(`atlas` CLI + an MCP server) that drive the five governed tools on a real repository. It authors **no new core
behaviour**: every adapter clause is bounded by the port it realizes; the core stays untouched and pure.

## Boundary (what this ring is, and is NOT)

- The ring is a set of **new packages above genesis** in the DAG (`@atlas/adapter-io`, `@atlas/cli`,
  `@atlas/mcp-server`): they consume `@atlas/*`; **nothing in the core imports them** (the same one-way rule as
  `@atlas/e2e`). The core packages are not modified — **except** the one pre-existing OWNER-DEFINE seam
  (`writeDecision`, §ADAPT-STORE-2), which is a core binding, sequenced and reviewed as such.
- **Purity is preserved where it lives:** the core stays deterministic/clock-free/IO-free (this is why its 857
  tests are deterministic). Adapters are the _only_ place IO/network/clock enters, and are verified by
  **integration + recorded-fixture** tests, not the core's pure-determinism method.
- Identity stays sealed: every adapter that mints a hash does so through `@atlas/kernel` `id` — no adapter rolls
  its own digest (KERNEL-2/3 still hold across the ring).

## Data model (the ring's own shapes; core shapes imported, never redefined)

```
LangId       = 'ts' | 'py' | 'go' | 'java' | 'rust' | …        // a language the ring can index
IndexerPlan  = { lang: LangId, tool: string, args: string[], version?: string }
                                                               // which SCIP indexer runs for a language, and
                                                               // the pinned release it runs at (REQ-INDEX-3a);
                                                               // `version` is absent for the honest-hole
                                                               // sentinel, which names no binary
CasPath      = string                                          // on-disk CAS location (Decisions §D2)
CliVerdict   = { exitCode: number, stdout: string }            // deterministic render of a tool Verdict
WiredHandler = ReturnType<createHandler>                       // the ONE 5-leg handler both entrypoints share
```

## Invariants

### Indexer adapters (realize the `FileTree` + `ScipOutput` inputs of `index.build`)

- **ADAPT-FS-1 Faithful file tree.** The filesystem walker MUST produce the exact `FileTree`
  (`→ FileTree@index/types.ts`) for a real repo path — paths, nesting, and leaf `content` — in a deterministic
  order, honoring the repo's ignore rules (`.gitignore`). It MUST NOT fabricate or omit a tracked file.
- **ADAPT-SCIP-1 SCIP is read, not invented.** The SCIP reader MUST parse a `.scip` protobuf index into the
  frozen `ScipOutput` (`→ ScipOutput@index/types.ts`): per-document `definition`/`reference` occurrences only.
  A `reference` with no in-index `definition` MUST remain unresolved (downstream `to: null`, INDEX-13); the
  reader MUST NEVER synthesize a symbol or an edge the `.scip` does not contain.
- **ADAPT-SCIP-2 Multi-language by dispatch.** For a repo spanning languages, the ring MUST run the correct
  per-language SCIP indexer (`IndexerPlan` by `LangId`) and merge their `.scip` outputs. A language with **no
  configured indexer** MUST contribute its files to the `FileTree` only (an honest structural hole), and MUST
  NOT cause a fabricated or dropped edge for any other language (INDEX-13 honesty preserved cross-language).
  SHIPPED STATE, stated because "MUST run" reads like a claim about behaviour that does not exist: Atlas
  **plans** the invocation and the OPERATOR runs it. `atlas doctor index` derives the repo's languages from
  the tracked tree, routes them through `planIndexers`, and prints the pinned command per language; no code
  path spawns an indexer, by decision (security posture + a visible `$0`-LLM dependency —
  `docs/reference/commands/doctor.md`). The merge half is likewise unrealized in production: `mergeScip`
  exists and has no shipped caller, and every reader opens exactly ONE dump at `.atlas/index.scip`, so in a
  two-language repository the second indexer run overwrites the first. `doctor index` says so in its output.
- **ADAPT-AST-1 Deterministic sub-file units (additive).** The `web-tree-sitter` layer, when enabled, MUST fold
  sub-file structural units (item/block) into the `FileTree` spatial rail deterministically (same bytes ⇒ same
  units). It is an **additive refinement**: with it absent, the index is file-level and still valid.
- **ADAPT-INDEX-1 Wire to the real index.** The index-backing adapter MUST satisfy `MoveInIndex`
  (`→ tools/init.ts`) and `QueryIndex` (`→ tools/query.ts`) by driving `@atlas/index` `build`/`resolve`/
  `coverage` over the walker + SCIP outputs — it introduces no ranking or resolution of its own.

### Store adapter (realizes the kernel `StoreApi` + the emit sink, durably)

- **ADAPT-STORE-1 Durable content-addressed store.** The disk store MUST implement `StoreApi`
  (`→ kernel/store.ts`: `put(obj)→Hash`, `get(h)→CasObject|undefined`) over persistent storage such that an
  object `put` in one process is `get`-retrievable, byte-identical, in a later process. On read it MUST verify
  `id(value) === key` and treat a mismatch as absent (tamper-safe, KERNEL-1).
- **ADAPT-STORE-2 Governed persistent write (OWNER-DEFINE).** To make one governed **dedup/supersede** write
  land durably, the parked front-door `writeDecision(candidate,cfg)` (`→ knowledge/write/router.ts`) MUST be
  bound: compute `nodeKey(candidate)`, probe the durable store for the contentHash (D0) and nodeKey (D1) hits, call the
  existing `routeWrite`, apply `upsert`, and flush the projection through the store. This binds existing pieces;
  it invents no new routing.
- **ADAPT-STORE-3 Projection rehydrate (the read-back obligation).** Rehydrating the session projection from
  disk is the store adapter's job, not the core's — the write (ADAPT-STORE-2) and the read-back are **separate
  obligations**. On a fresh process the store adapter MUST reconstruct the `StoreProjection` current-node map
  from the durable store such that a fact written and flushed in an earlier run is present, byte-identical, in
  the rehydrated projection — reconstructing state only, minting nothing.
- **ADAPT-STORE-4 Freshness watermark seam (N11, DI).** `createDiskStore(casPath, headSha?)`
  (`→ packages/adapter-io/src/store.ts`) MUST take the freshness-watermark as an **injected**
  `() => headSha | undefined` seam — the store stays **git-ignorant**. When present, `persistProjection` MUST
  **stamp** `builtAt = headSha()` (the git HEAD the projection's stored per-fact freshness reflects) onto the
  wire projection; absent or resolving `undefined` (tests / non-git) ⇒ **no stamp** — `builtAt` stays absent
  and the reader treats the watermark as "unknown" (never a false `stale`). Both persist sites (governed emit
  - the mine driver) stamp uniformly by construction — no change to their code. The JSON-dropped `undefined`
    round-trips `deepEqual`-identically to a pre-N11 sidecar (additive, back-compat).
- **ADAPT-LINK-1 The second governed write door (WP-SAMEAS).** `createGovernedLink`
  (`→ packages/adapter-io/src/governed-link.ts`) MUST be the **sibling** of `createGovernedEmit`
  (`governed-emit.ts` — the door realizing ADAPT-STORE-2): the composition-root door for `atlas-link`, which
  asserts a human `sameAs` equivalence (the `linkSameAs` reducer — a non-destructive symmetric edge). Before a
  byte is written it MUST pass **four fail-closed gates, in order**: (1) DISTINCT — `a === b` refused; (2) BOTH
  KNOWN — both endpoints MUST be current nodes in the rehydrated projection; (3) AUTHZ — the KNOW-11
  owner-scoped gate (`actorInScope`) on **both** endpoints' fact scopes (each fact read back from CAS by its
  content address), reusing emit's authz seam verbatim; (4) RATIFY — a **non-empty** env-sourced ratifier
  (`ATLAS_RATIFY_TOKEN`, never a payload field; v1 = non-empty only, **not** emit's tier-graded KNOW-8/18 gate
  — deferred because `sameAs` is non-destructive). Only after all four does it `linkSameAs` + `persistProjection`;
  any gate failure returns `{linked:false, rejected}` and persists **nothing**.

### Git adapters (realize `HistorySource`, `DriftSource`, `Forge` over real git)

- **ADAPT-GIT-1 History is real + deterministic.** `HistorySource` (`→ genesis/rank.ts`) MUST be backed by real
  `git log`/`blame`/coupling over a rev, deterministic for a fixed rev; it feeds ranking only and MUST NEVER
  mint a fact (GEN structural-only guarantee).
- **ADAPT-GIT-2 Drift over merge-base.** `DriftSource` (`→ tools/reconcile.ts`) MUST compute drifted anchors
  across a git merge-base so `atlas-reconcile` can classify mechanical vs semantic (TOOLS-8 `exitCode` law
  unchanged).
- **ADAPT-GIT-3 Forge carries the atlas, honestly.** `Forge` (`→ persist/host-adapter.ts`) MUST write the
  provenance trailer + a `refs/notes/orchestra` note + the PR projection onto a real host; a history rewrite
  MUST keep trailer data and orphan note-carried data exactly as PERSIST-\* specifies — the adapter changes
  none of that semantics, only executes it.
- **ADAPT-GIT-4 One no-shell git seam (#74).** Every adapter git call MUST route through `run-git.ts`
  (`→ packages/adapter-io/src/run-git.ts`): `runGit(repo, args, opts)` — `execFileSync('git', …)`, **NO shell**
  (args are never shell-interpolated), stdin closed or `input`-piped, stdout+stderr **captured** (a failure
  throws, carrying `.stderr`); the deterministic-failure classifier `isDeterministicGitError` (bad-rev /
  non-git / `ENOENT` git-absent ⇒ retrying only wastes latency); the **clock-free** `gitYieldMs` backoff
  (`Atomics.wait` on a never-signaled `SharedArrayBuffer`, fixed `GIT_BACKOFF_MS` — no `Date.now`/`Math.random`
  enters any value); and `headSha(repo)` (a cheap `rev-parse HEAD`, **no worktree lock**, total → `undefined`
  on any failure — the N11 watermark reader). All 6 adapter git call-sites route through it; `rev-index` keeps
  its **structural** fresh-worktree retry, reusing the shared classifier + backoff (a command-level retry
  cannot re-create a wedged half-worktree). No generic `runGitRetrying` is shipped — `rev-index` is the only
  contended caller, so the wrapper would be dead speculative surface.

### LLM adapter (realizes `SiteProposer` — the single model entry)

- **ADAPT-LLM-1 The one model call, bounded, non-authoritative.** `SiteProposer.propose`
  (`→ genesis/extract.ts`) MUST be the **only** place a model is invoked in the whole system; it MUST make one
  bounded call per site, honor the cost/timeout budget, and return a **candidate** proposal that is never
  auto-trusted (the admission bar + ratification still gate it). The core stays `$0`-LLM (GEN S0/S1
  determinism is unaffected — the LLM enters at S2 extraction only).

### Entrypoints (CLI + MCP — one wired handler, two transports)

- **WIRE-1 One handler, assembled once.** A single shared `wire` module MUST assemble the five-leg
  `WiredHandler` (`atlas-init/query/emit/reconcile/link` legs over the adapters, `→ tools/handler.ts`). Both
  entrypoints MUST consume THIS module, so CLI and MCP are contract-identical **by construction**, not by copy
  (discharges TOOLS-3 at the entrypoint).
- **CLI-1 Total command surface.** `atlas <cmd>` MUST map each command to exactly one wired tool leg (plus
  `mine` driving genesis). Argument parsing MUST be total: a malformed invocation yields a structured error +
  guidance and a non-zero exit, never a crash (mirrors TOOLS-2).
- **CLI-2 The CLI is the floor.** Reads (`query`/`reconcile`/`doctor`) MUST resolve over the CLI directly;
  every write MUST funnel through a governed write door — `atlas-emit` for a grounded fact, `atlas-link` for a
  `sameAs` equivalence (WP-SAMEAS; both are composition-root doors, ADAPT-LINK-1) — never ad-hoc
  (TOOLS-1/TOOLS-11 CLI-floor). A read command MUST carry no write authority.
- **CLI-3 Deterministic render.** The CLI MUST render a tool `Verdict` to stdout deterministically and set the
  exit code from the verdict (`0` ok, non-zero on rejected/error), carrying the tool's `guidance` (TOOLS-4).
- **MCP-1 The server exposes the derived tool surface (amended ADR-0006).** The MCP stdio server MUST publish
  exactly the members of the closed `Tool` union — `GOVERNANCE_SURFACE ∪ READ_SURFACE`, of which
  `GOVERNANCE_SURFACE` is the six governed tools (`atlas-init`, `atlas-query`, `atlas-emit`,
  `atlas-reconcile`, `atlas-link`, `atlas-memory-emit` — ADR-0003, amended by ADR-0006) — each with its input schema, and MUST route every call through
  the shared `WiredHandler` (WIRE-1) — so an MCP call and the equivalent CLI call return contract-identical
  verdicts (TOOLS-3, by construction). The advertised set and the invocable set MUST both be DERIVED from
  that one union and MUST be equal; neither may be assembled independently (ARCH-5). No tool outside the
  union may be published or invocable.
  _(AMENDED — the original clause read "publishes exactly the five governed tools", with a "no sixth tool"
  guard. The five was the mechanism available when there were five legs, not the property: MCP-1's own stated
  purpose is CLI≡MCP contract identity via the one shared handler, which is preserved and, via ARCH-5,
  strengthened. Owner-ratified 2026-07-25 — see ADR-0006; the same surgery ADR-0003 performed on TOOLS-1's
  own count claim. The static surface is bounded by a measured budget instead of a fixed count — ARCH-7.)_
- **MCP-2 Fail-closed transport.** A tool error MUST surface as a structured rejected `Verdict` carried in the
  MCP result; the server MUST NOT crash or drop the fail-closed verdict (TOOLS-2 across the transport).
- **CLI-7 The `promote` driver curates through the EXISTING write door.** <a id="cli-7"></a> `atlas promote`
  MUST carry the explorer's STAGED candidates into governed knowledge by presenting each one to the existing
  `atlas-emit` governed write door — it MUST NOT mint a new governed tool and MUST NOT open a second write
  medium, so `GOVERNANCE_SURFACE` and `WRITE_PATHS` are unchanged (ADR-0008: a curator door is an ordinary
  use of the existing emit door). Every staged candidate MUST face FULL ratification: the door MUST supply a
  ratification context it DERIVED (the write came out of staging), never one the payload chose, and MUST NOT
  express that by asserting a store-state verdict that is not true of the candidate. A refusal MUST be
  PER-ROW — one unpromotable candidate MUST NOT end the pass — and the count reported MUST be what SETTLED
  durably, never what was attempted. A staging read that REFUSES MUST be reported as a refusal and MUST NOT
  degrade to "0 candidates".
- **CLI-4 The `mine` driver composes, it does not admit.** `atlas mine` MUST drive the **already-frozen**
  `genesis` run-controller (`→ genesis` run-controller, atlas-genesis reference) as a single governed pass over a
  real repo, minting **candidate-only** writes (never ratified). This clause is **ring-scoped composition only**:
  the internal `scan→rank→extract→admit→align→seed` stages and their laws are GEN's own frozen invariants — the
  `mine` driver wires the parts and **invents no admission of its own**.

## Acceptance (the ring's falsifiable checks — S3 lifts goldens from these)

1. `atlas init <fixture-repo>` on a real multi-file, multi-language repo prints the true skeleton + blast-radius
   - T0 candidates; re-run is byte-identical (ADAPT-FS-1/SCIP-1/2/INDEX-1, determinism).
2. A `reference` to a symbol defined in another indexed file ⇒ a `resolved` edge; a reference with no in-index
   definition (or an un-indexed language) ⇒ `to: null` — never a fabricated target (ADAPT-SCIP-1/2).
3. A fact `emit`ted in run A is `get`-retrievable, byte-identical, in run B; a tampered on-disk value reads as
   absent (ADAPT-STORE-1). A fresh process rehydrates the session projection from disk and the run-A fact is
   present, byte-identical, in the reconstructed current-node map (ADAPT-STORE-3).
4. One governed dedup write of the same fact twice lands once (idempotent); a superseding write records the
   supersedes pointer (ADAPT-STORE-2).
5. `atlas reconcile` on a git-sandbox where a cited file changed classifies the drift and sets `exitCode` per
   TOOLS-8 (ADAPT-GIT-2).
6. The same tool called over the CLI and over the MCP server returns a byte-identical `Verdict` (WIRE-1/MCP-1).
7. `atlas mine <fixture>` with a **recorded** proposer yields candidate facts with deterministic ranking, and
   makes exactly one proposer call per site (ADAPT-LLM-1, contract-tested — no live model in CI).
8. Every adapter git call goes through `runGit` (no `child_process` shell); a deterministic failure (bad rev /
   non-git / git absent) is not retried; a contended `rev-index` read retries with a clock-free backoff; and
   `headSha` off-repo returns `undefined`, never a throw (ADAPT-GIT-4).
9. A projection persisted by a store built **with** a `headSha` seam carries `builtAt == HEAD`; one built
   **without** the seam carries no `builtAt` and round-trips identically to a pre-N11 sidecar (ADAPT-STORE-4).
10. `atlas link a b` lands the symmetric edge **only** when `a≠b`, both nodes exist, the actor is authorized
    over **every scope the merged class spans**, and the ratifier satisfies the KNOW-8 law for that class's
    tier join (`billy` when any member is `T0`); any gate failing ⇒ `linked:false`, nothing persisted
    (ADAPT-LINK-1). `atlas link a b --retract` withdraws a previous assertion through the SAME ladder and
    APPENDS the retraction to both rows (removing nothing), after which the read fold stops merging across
    that edge; retracting an unasserted or already-retracted pair, and re-asserting a retracted one, are each
    refused with their own discriminant (A-D3 / task #83, ADR-0003 §Retraction).

## Decisions (ratified / DEFINE-pending — the S0 [NEEDS RECONCILIATION] queue)

- **D1 Toolchain (ratified 2026-07-19):** `web-tree-sitter` (WASM, AST) + **SCIP** for def/ref
  (`@sourcegraph/scip-typescript` + per-language SCIP indexers, read via `@c4312/scip`). **stack-graphs dropped**
  (archived 2025-09-09, Rust-only, ~3 langs). The `MECHANISMS` registry (`genesis/rank.ts`) listing
  `'stack-graphs'` is now stale and MUST be reconciled.
- **D2 Package structure (ratified):** minimal — `@atlas/adapter-io` (fs · scip · ast · store · git · llm, one
  file each) + `@atlas/cli` + `@atlas/mcp-server` + the shared `wire` module. Not one package per adapter.
- **D3 Language scope (ratified):** multi-language from v0 (per-language SCIP indexers), TS as the first + the
  dogfood target.
- **D4 [DEFINE-pending → owner]** disk-CAS layout (proposed default: `.atlas/cas/` sharded `<h[0:2]>/<h>`).
- **D5 [DEFINE-pending → owner]** the LLM (model + the exact `SiteProposer` prompt contract), surfaced at Phase-2.
- **D6 [DEFINE-pending → owner]** the forge host (proposed default: GitHub via `gh` first, generic git-notes
  fallback), surfaced at Phase-3.

### Memory adapters (realize the per-seat Memory kind, durably — CAMPAIGN-11)

> **Brownfield lift, stated as such.** Every clause below states behaviour that is ALREADY on `master`
> and measured by a named test. The ring for `@atlas/memory` was never cut with campaign 9 — that corpus
> mentions memory zero times — so this section is written AFTER the code, which is the same discipline
> `requirements-adapters.md` calls _brownfield lift-and-tag_. Nothing here is behaviour anyone wants; it is
> behaviour that runs.

- **ADAPT-MEM-1 The durable Memory log.** <a id="adapt-mem-1"></a> The memory ring MUST: append-only and content-keyed, one record per line; a record appended in one process is readable byte-identical in a later process; NEVER rewrite, truncate or reorder an existing line; a line whose id is not its own content hash is refused on read AND counted. It MUST NOT permit: a torn or hand-edited line is folded in as a record; an unreadable log is reported as an empty store.. _(measured: `packages/adapter-io/test/memory-store.test.ts`)_
- **ADAPT-MEM-2 Concurrent appends do not lose records.** <a id="adapt-mem-2"></a> The memory ring MUST: two processes appending concurrently both land; the fold contains every record either writer wrote. It MUST NOT permit: a concurrent append silently overwrites another writer's record.. _(measured: `packages/adapter-io/test/memory-store.test.ts`)_
- **ADAPT-MEM-3 Memory travels.** <a id="adapt-mem-3"></a> The memory ring MUST: admitted to git (the log travels); survives a plain text merge with 0 records lost and 0 spliced; a duplicated line dedups by content id on the fold. It MUST NOT permit: a branch merge loses a record; a merge splices two records into one.. _(measured: `packages/adapter-io/test/memory-store.test.ts`)_
- **ADAPT-MEM-4 Every memory write crosses the whole gate chain.** <a id="adapt-mem-4"></a> The memory ring MUST: the gates run in the stated ORDER; each refusal is a structured verdict NAMING the gate; the door authors no policy of its own. It MUST NOT permit: a record reaches disk having skipped a gate; a refusal escapes as a thrown exception a caller can swallow.. _(measured: `packages/adapter-io/test/memory-emit.test.ts`)_
- **ADAPT-MEM-5 The kind is derived, never declared.** <a id="adapt-mem-5"></a> The memory ring MUST: the template is selected from the entry's SHAPE; no caller-supplied argument selects it; no-match and multi-match are BOTH refused, never guessed. It MUST NOT permit: a caller files a payload under a template that judges it more leniently; an ambiguous shape is filed under the first matching template.. _(measured: `packages/memory/test/mem-kind-derivation.test.ts`)_
- **ADAPT-MEM-6 The owner is derived from the root, and never empty.** <a id="adapt-mem-6"></a> The memory ring MUST: owner = the composition root's resolved actor; no transport flag sets it; an empty owner is refused fail-closed. It MUST NOT permit: a caller sets the owner of a record they write; an unowned record is written and then injected to every empty-actor caller.. _(measured: `packages/memory/test/mem-kind-derivation.test.ts`)_
- **ADAPT-MEM-7 The scanner is real, and its absence fails closed.** <a id="adapt-mem-7"></a> The memory ring MUST: binds a NAMED binary actually present on PATH; no scanner available means the write is REFUSED; never redacted-and-continued. It MUST NOT permit: a write lands with no scanner having run; a clean record is refused because the invocation is wrong; a secret-carrying record is admitted because the invocation always exits clean.. _(measured: `packages/adapter-io/test/scanner-conformance.test.ts`)_
- **ADAPT-MEM-8 Reads are owner-scoped, and consultables are explicit.** <a id="adapt-mem-8"></a> The memory ring MUST: only the calling actor's own records — zero cross-seat; task, pr and logbook NEVER ride the header; they return ONLY via an explicit recall. It MUST NOT permit: another seat's record appears in a header; a consultable kind auto-injects on a running turn; an unqualified read returns a general dump.. _(measured: `packages/adapter-io/test/memory-read.test.ts`)_
- **ADAPT-MEM-9 The injected set is frecency-ranked over LOGGED positions.** <a id="adapt-mem-9"></a> The memory ring MUST: the injected set is the top-N by effective frecency, descending; a decayed entry is evicted even when slots are free; an evicted entry remains re-spawnable — nothing dies; decay advances with the LOG's own head, never wall-clock. It MUST NOT permit: a system-clock jump changes the injected set with no new log entries; an evicted rule is unrecoverable; a low-frecency entry is injected because slots happened to be free.. _(measured: `packages/adapter-io/test/memory-read.test.ts`)_
- **ADAPT-MEM-10 The derived slabs never fabricate.** <a id="adapt-mem-10"></a> The memory ring MUST: assembled from real sources; an absent source renders the labeled UN-SEEDED sentinel; never filled with invented text. It MUST NOT permit: an absent facet is rendered as plausible prose; a slab is served without its grounding.. _(measured: `packages/adapter-io/test/awareness-store.test.ts`)_
- **ADAPT-MEM-11 Both transports answer identically.** <a id="adapt-mem-11"></a> The memory ring MUST: an identical call yields a byte-identical Verdict on both transports; a refusal carries the same named reason on both. It MUST NOT permit: the two transports disagree on an admission; a refusal reads differently over MCP than on the CLI.. _(measured: `packages/mcp-server/test/memory-emit-mcp.test.ts`)_
- **ADAPT-MEM-12 The memory surface is documented in every direction.** <a id="adapt-mem-12"></a> The memory ring MUST: every shipped memory command has a reference page; every shipped memory command has a README table row; neither names a command that does not ship. It MUST NOT permit: a shipped command is absent from the README table; the README table advertises a command that does not run.. _(measured: `harness/gates/command-doc-guard.mjs`)_
