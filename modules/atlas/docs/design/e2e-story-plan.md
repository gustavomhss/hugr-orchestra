# Atlas E2E — story-driven, user-simulating acceptance suite (ACCEPTANCE MANIFEST)

> **Decision (owner 2026-07-20):** validate "works exactly as defined" via user-story E2E, and prove
> "SOTA" by asserting the SOTA-defining invariants INSIDE the stories. **Fidelity = pure subprocess /
> stdio**: spawn the real `atlas` CLI binary + drive the real `atlas-mcp` server over real MCP stdio,
> against real temp git repos. No in-process shortcut. Highest user fidelity.

## Why this is new (honest gap)

The existing `packages/e2e/s01–s10` are IN-PROCESS: they import `@atlas/*` functions directly (the e2e
pkg doesn't even depend on `@atlas/cli`/`@atlas/mcp-server`). They are integration tests, not
user-simulating E2E. This suite fills that gap: it exercises the product ONLY through the doors a real
user/agent touches — the `atlas` binary and the `atlas-mcp` stdio protocol.

**These tests may go RED against real wiring bugs** (e.g. the flagged arg-marshalling gap where
`atlas query src` may render `malformed args` instead of a real projection). That is the POINT — a RED
here is a finding: the product does not yet work as defined. Findings are fixed at root (own WPs),
never asserted-around.

## Harness contract (WP-E2E-HARNESS — build + freeze FIRST; stories depend on it)

Three reusable pieces, in a new `packages/e2e-blackbox/` (deps: `@modelcontextprotocol/sdk`, node builtins only; spawns built `dist` binaries):

1. **`makeFixtureRepo(spec)`** — builds a real on-disk temp git repo (`os.tmpdir()`, portable): writes a
   source tree, `.atlas/policy.json`, a valid `.atlas/index.scip`, `git init && git add` (+ commits when a
   story needs history/drift). Returns `{ repoPath, sha(), commit(files), cleanup() }`. Model on
   `cli/test/wp-9.x-compose-b.integration.test.ts:47-75` + `adapter-io/test/harness/git-sbx.ts`.
2. **`runAtlas(repoPath, argv)`** — spawns `node <cli-dist>/bin.js …argv` with `cwd=repoPath`; returns
   `{ stdout, stderr, exitCode }`. The real CLI, real render, real exit codes (ok0/error1/rejected2).
3. **`mcpSession(repoPath)`** — spawns the `atlas-mcp` bin over `StdioClientTransport`, returns an SDK
   `Client` (`listTools()`, `callTool(name,args)`) + `close()`. The real MCP protocol.
   Gate needs `tsc -b` (dist built) before this suite runs — declare the build dependency.

## The stories (each = one file, one user narrative, black-box)

### S1 — Onboarding & first knowledge (`s1-genesis.blackbox`)

Narrative: user `atlas init <repo>` on a fresh repo → `atlas emit <grounded-fact.json> --at <sha>` →
`atlas query <scope>` sees the fact.

- BEHAVIOR: init exit0 + builds territories incl. the source tree; emit accepted (emitted:true, exit0),
  CAS+projection written under `.atlas/`; query returns the emitted fact rendered deterministically.
- **SOTA**: run `atlas query <scope>` TWICE → **byte-identical stdout** (RETR-1/INDEX-8 determinism); the
  fact is content-addressed (its id is stable across runs) (KERNEL-1).

### S2 — Fail-closed governance (`s2-guardrails.blackbox`)

Narrative: user tries to emit (a) an UNGROUNDED fact (citation doesn't re-derive), (b) a fact whose scope
they're not in (KNOW-11 authz).

- BEHAVIOR: (a) rejected, exit2, emitted:false, guidance names the ground failure, **nothing persisted**
  (a subsequent `query` shows absence); (b) rejected fail-closed (actor∉scope), nothing persisted.
- **SOTA**: grounded-or-rejected (GROUND-2/6); unauthorized-denied fail-closed (KNOW-11); the rejection is
  a well-formed verdict carrying `invariant`+`next` (governance is legible, not a crash).

### S3 — Dedup identity (the model we just built — the star) (`s3-dedup.blackbox`)

Narrative: emit fact F; emit byte-identical F again; emit same (anchor,slot) with reworded prose; emit the
SAME claim at a module anchor and at a function inside it.

- BEHAVIOR: 2nd identical → **D0 DEDUP** (one node, idempotent); reworded → **D1 UPDATE/union** (one node,
  claims unioned, prose-independent); module+function same claim → **TWO nodes, NO write-time merge**.
- **SOTA**: no always-merge (both nodes present, each keeps its grounding — A2 non-destructive); `subsumes`
  is derivable module⊃function without a merge (query/doctor surface shows the relation); deterministic.

### S4 — Drift & reconcile lifecycle (`s4-drift.blackbox`)

Narrative: emit a grounded fact; user commits a code change that moves the grounding; `atlas reconcile
<mergeBase>`; then `atlas doctor why|hotset`.

- BEHAVIOR: reconcile detects drift and classifies mechanical (moved-but-valid) vs semantic (broken)
  against the git merge-base, deterministically; doctor is READ-ONLY (exit0, proposes, never persists).
- **SOTA**: drift is a deterministic function of the git state (re-run → same verdict); doctor advisory
  never mutates the store (CAS unchanged before/after).

### S5 — The agent journey over real MCP stdio (`s5-mcp-parity.blackbox`)

Narrative: an agent connects to `atlas-mcp` over stdio → `listTools` → `callTool` query + emit → a
fail-closed emit.

- BEHAVIOR: exactly the 5 governance tools listed with input schemas; a query/emit callTool returns the
  same verdict the CLI produced for the same input; a fail-closed emit carries rejected+guidance in the
  CallToolResult (isError semantics preserved through the transport).
- **SOTA**: **transport parity** — CLI verdict ≡ MCP verdict for identical input (the product is one
  governed core behind two doors); fail-closed survives the transport (never a silent empty success).

### S6 — Full provenance pipeline (`s6-pipeline.blackbox`) [optional / if cheap]

Narrative: `atlas mine <repo>` → candidate facts on disk (candidate-only, not ratified) → emit a ratified
fact → query. Assert provenance/dossier artifacts land under `.atlas/`, candidates never auto-promote.

- **SOTA**: mining proposes, never ratifies (governed write door is the only path to durable knowledge).

## SOTA-invariant coverage matrix (every invariant MUST be asserted ≥1×)

| SOTA property                                       | invariant anchor           | asserted in |
| --------------------------------------------------- | -------------------------- | ----------- |
| Determinism / byte-identical query                  | RETR-1, INDEX-8            | S1, S4      |
| Content-addressed / reproducible id                 | KERNEL-1, INDEX-11         | S1, S3      |
| Grounded-or-rejected (fail-closed)                  | GROUND-2/6, KNOW-2         | S2          |
| Owner-scoped authz fail-closed                      | KNOW-11                    | S2          |
| Non-destructive relations (subsumes ¬merge, A2)     | KNOW-15, dedup-identity.md | S3          |
| Governance legible (verdict carries invariant+next) | render/verdict             | S2, S5      |
| Transport parity (CLI≡MCP)                          | s08 / GOVERNANCE_SURFACE   | S5          |
| Mining proposes, never ratifies                     | KNOW-6/8                   | S6          |
| NO embeddings (proxy: determinism + no network)     | INDEX-7                    | note\*      |

\*NO-embeddings is a STATIC code property; the black-box proxy is byte-identical determinism (an embedding
model would break it) — asserted via S1/S4, with the static invariant owned by the unit/invariant register.

## Slicing (after cold-critic APPROVES this manifest)

- **WP-E2E-HARNESS** (foundation, build first, freeze the 3-fn API) → then parallel:
- **WP-E2E-S1**, **-S2**, **-S3**, **-S4** (CLI stories), **-S5** (MCP stdio). S6 optional.
  Each story is its own file (disjoint), depends only on the frozen harness. Any RED that is a real wiring
  bug → spun out as its own fix-WP, reported, fixed at root (never asserted-around).
