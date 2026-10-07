# Session state — 2026-09-06

**What this file is:** the state of the work at a point in time, written so a DIFFERENT session, model,
harness or provider can pick it up cold. It is not a plan. This repository has already been bitten by
reading a plan as state — a doc describing work to be done outlived the work, and the next reader
recommended building something that already existed. So every claim below carries the command that
re-derives it, and nothing here is a value you are asked to trust.

This file replaces the previous handoffs (2026-08-31, its own 2026-09-02 rewrite, and the 2026-09-03
version). Read `git log --all --oneline -- docs/SESSION-STATE.md` for the prior state; the changes below
are the delta since then. §2.8 records the work of this session.

---

## 1 — How to re-derive everything on this page

Build first (`npx tsc -b`), then:

| what                               | command                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| all guards                         | `npm run godfile-guard && npm run spec-conformance-guard && npm run layer-guard && npm run reference-model-guard && npm run command-doc-guard && npm run wiring-guard && npm run adr-citation-guard && npm run req-clause-guard && npm run ears-coamend-guard && npm run doc-transcript-guard && npm run service-gate-guard` |
| the memory-ring benchmark (M-axis) | `node harness/probes/m1-memory-ring.mjs`                                                                                                                                                                                                                                                                                     |
| the CAS integrity audit            | `node packages/cli/dist/src/bin.js doctor cas`                                                                                                                                                                                                                                                                               |
| the proven-fact re-verification    | `node packages/cli/dist/src/bin.js verify-store`                                                                                                                                                                                                                                                                             |
| the advertised MCP surface         | pipe an `initialize` + `tools/list` JSON-RPC pair into `node packages/mcp-server/dist/src/bin.js`                                                                                                                                                                                                                            |

Two traps, both paid for in prior sessions:

- **`node harness/gates/<g>.mjs | grep …` reports grep's exit code, not the gate's.** Capture the command's
  own status immediately, or redirect to a file and check `$?` before piping.
- **Never run the whole test suite concurrently.** It has frozen this machine. One package at a time:
  `npx vitest run packages/<name> --pool=forks --poolOptions.forks.singleFork=true`.

### Operating notes from THIS session (paid for again)

- **A self-hosted runner has EIGHT sibling runners on the same machine** (atlas, skill-001, githugr,
  wallet×3, corelink). CI can stall to ~45min when they contend for the disk/CPU; the disk itself filled
  (100%) mid-session. Before debugging a stalled run, `df -h /` and count the Runner.Listener processes.
- **`~/actions-runner/bin` and `externals` are SYMLINKS to `bin.2.337.0`/`externals.2.337.0`.** Deleting the
  versioned dirs to free disk breaks `svc.sh` (`TEMPLATE_PATH` missing) and silently strands the runner.
  Delete the backup-suffixed dirs (`.2.336.0`) first; `svc.sh stop` kills the listener and `./run.sh` restarts it.
- **Do not `rm -rf` anything under `~/actions-runner` without reading what the symlinks point to.**

---

## 2 — What this session changed

The earlier handoff covered the store and CI/security work. This session then delivered the Campaign 3+6+8
fanout on top of that baseline: RETR (#323), GEN seed (#325), and PERSIST export/import (#324).

### 2.10 — Campaign 3+6+8 fanout delivered (2026-09-06)

All three implementation PRs merged into `master`; each master delivery gate passed:

- **#323 — RETR-8/RETR-13**: `atlas budget` exposes the per-kind budget/hit-rate ledger; `atlas territories`
  exposes the MISS-oracle territory ledger. Empty inputs remain honest zero results. The CLI totality golden
  was updated from 28 to 30 ratified command keys.
- **#325 — GEN-9**: `genesis/seed.ts` is wired into `mine` as the shipped Awareness assembly. The seed reads
  ratified report plus filesystem state and does not write governed projection state. `align.ts` was not wired:
  no production consumer exists yet, and a fabricated consumer would violate the seam contract.
- **#324 — PERSIST-1/9**: `atlas export <outDir>` and `atlas import <bundle> <targetDir>` are wired through
  store-instance doors. Import rejects a non-empty target and never writes governed projection state. The
  obsolete `persist/src/source.ts` reference-model row was removed; CLI dispatch was split to keep `cli.ts`
  below the godfile limit.

Final master: `61e4b45`. Master delivery run `34067482130` passed. The feature gate for #324 passed on rerun
(`34062657526`) after one loaded-runner cancellation. No implementation PR from this wave remains open.

### The 17 dangling rows are deliberately retired (owner decision) — 2026-09-02

Prior state (written down in the 2026-08-31 handoff, §3/§4): the CAS held 1320 objects; the projection
referenced 613; 17 of those references resolved to nothing (`doctor cas` reported `missing=17`,
`sound=false`; `verify-store` reported the same 17 as `dangling` and exited non-zero). All 17 were the same
shape — advisory family, tier T2, seal `proven`, slot `dependency`, scope `atlas:mined` — SCIP cross-unit
reference claims ("`packages/knowledge/src` references scip-typescript npm `@atlas/contracts` …").

**The decision (owner): retire the 17 rows from the projection.** The reason the repair is a write that is
NOT done through a tool: every tool-mediated path was measured and closed, and the residue is honest to
record:

- `contentHash = id(f)` hashes the fact's grounding including `subtreeHash` from the `.atlas/index.scip` of
  the mining moment (2026-08-25). That index was regenerated (2026-08-30), so any re-derivation produces
  different bytes and a different `contentHash` — the original object is unrecoverable by re-mining.
- `mine` writes only the STAGING sidecar, never the projection (ADR-0008; `packages/cli/src/mine.ts` — the
  driver never calls a projection door). Re-mining cannot backfill the 17 rows in place.
- Re-mining the `dependency` arm needs an operator-model (`.atlas`-adjacent `~/.config/atlas/model.json`);
  with none configured `resolveProposer` returns the abstaining `defaultProposer` and the pass stages
  nothing.
- `doctor reground` answers `plan: none` for these 17: the plan leg reads the fact back from CAS
  (`store.get(contentHash)`), and a dangling row has no bytes to read, so no drift is even classified.
- `derive-relations` was measured (2026-08-31) at **6193** derivable edges, not 17, and refuses every
  candidate on scope authz; using it as a repair would be a ~10× projection growth.
- `promote` rehydrates from CAS via `store.get` and files a byte-less staged row as
  `REJECTED_CANDIDATE_UNREADABLE`; it never re-derives bytes.

So "retire the rows" was executed as a **surgical projection write**: a copy of `projection.json` minus the
17 rows (and their 17 `cas` references) was written as generation 614; the compat mirror
`.atlas/projection.json` was republished byte-identically; generations 610–613 were pruned (normal sidecar
behaviour). Every remaining `current` row's `contentHash` is in `cas`, and every `cas` hash is referenced.
Nothing else was touched: no CAS object was deleted (1320 still present, the old ones now `orphan`), no
`policy.json` change, no source change.

**The honest cost.** This is a write outside the governed doors (`WRITE_PATHS` stays
`{atlas-emit, atlas-link}` — see `packages/tools/src/handler.ts`). It was the owner's explicit call because
the predicate "the store must pass its own audit before it travels" (2026-08-31 handoff §3) outranks the
alone-standing tentàtive to keep the rows. The 17 facts are T2 advisory, machine-mined, no ratifier ever
saw them; their claims are regenerable at need. The evidence that they existed lives in this file and the
prior handoff; the audit no longer fails on them.

---

## 2.5 — What changed after the 2026-09-02 handoff — the CI/security leg (2026-09-03)

Three pull requests merged to master after the section above was written.

### #300 — the store actually commits and travels green

The `docs/SESSION-STATE.md` rewrite and the store sidecars (`.atlas/cas/`, `.atlas/projection.json`)
went to master together as PR #300. The store now travels with the code, as §1 of `.gitignore`
intends (`projection` and `cas` are deliberately un-ignored). Re-derive: `doctor cas` →
`objects=1320 referenced=596 corrupt=0 unreadable=0 missing=0 orphan=724 sound=true`;
`verify-store` → `0 sealed-proven … 0 dangling`, exit 0. The mirror-only travel case was verified
(move `projection.614.json` aside, re-run both commands — green).

### Billing lock forced a self-hosted runner

The GitHub-hosted runner pool stopped starting jobs while the account billing is locked
("The job was not started because your account is locked due to a billing issue."). The gate now
runs on a machine-local self-hosted runner (`MacBook-Pro-de-Gustavo`, labels `self-hosted/macOS/X64`,
installed under `~/actions-runner`, run as a launch-agent via `./svc.sh install/start`). This is a
permanent operating fact of this repository until the billing lock is cleared, recorded so a future
session does not waste a CI cycle wondering why the job landed on somebody's laptop.

### #301 — forked pull requests never reach the runner (the RCE gate)

The gate executes **untrusted code** (`npm ci` + the whole suite) on the self-hosted runner — the
owner's machine — and this repository is **public**. A fork's pull_request is exactly the
remote-code-execution vector GitHub warns self-hosted runners must never accept. `.github/workflows/ci.yml`
now splits the surface:

- `gate` runs only for **pushes** and pull_requests whose head lives **inside this repository**
  (`head.repo.full_name == github.repository`). Forks never reach it.
- A fork PR triggers `fork-guard` instead: no checkout, no npm, no repo code — only a static
  `echo::warning`. The merge blocks on the missing `gate` check until a maintainer syncs the fork's
  change onto an in-repo branch.
- `permissions: contents: read` on the whole workflow; the workflow token is write-free.
- `actions/checkout` pinned to a full SHA (`11d5960a…`) instead of the `@v4` mutable tag.

Settings-level, applied via the REST API (live, do not revert without the owner):
`allowed_actions = selected` (allowlist = exactly `actions/checkout@11d5960a…`), `sha_pinning_required = true`.

---

## 2.6 — What changed later on 2026-09-03 — surface hygiene, lucy-1, the owner ruling

Three further PRs merged to master after §2.5 was written.

### #303 / #304 — the surface docs and code comments caught up with the shipped 18 tools

- `#303 chore/code-comment-hygiene` — stale comments in `packages/mcp-server/src/server.ts` /
  `server-read-tools.ts` corrected: 18 tools (not 17), six governance (not five), `doctor`/`node` ARE
  reachable over MCP (were claimed CLI-only). Comments only; the mutation-probe showed the guards read
  constants, not comments, so this job was value that no gate catches.
- `#304 docs/surface-truth-hygiene` — the docs layer corrected to the shipped constants (six
  governance / three write paths / ten read / 18 advertised): `emit.md` (both handles), `init.md`
  (full `InitOut` render, transcripts marked illustrative), `node.md`, the atlas-\* reference pages,
  `wp-campaign-10.md`, `roadmap-authoring.md` (CAMPAIGN-10.1/2/3 marked SHIPPED). One deliberate
  boundary: the RATIFIED `ENTRY-MCP-3` invariant text stayed "exactly five/two" — that was lucy-1,
  handled next.

### #305 — lucy-1 resolved: the ratified layer now names the derived six/three (req layer fan-out)

The requirement layer still asserted "exactly five governance / exactly two write doors" while the
product shipped **six / three / ten-read / 18-advertised**. ADR-0006 Decision 2 (owner-ratified) had
superseded the count with the DERIVED + BUDGETED surface property and CAMPAIGN-11 added
`atlas-memory-emit`, but the fan-out into the ratified rows never ran. #305 performed the governed
co-amendment: `INV-TOOLS-1/12/16` + `INV-MCP-3` restated to the derived surface; `REQ-TOOLS-1a/1b/12c/16e`

- `REQ-MCP-3d/3g` re-lifted verbatim (live quotes again, ledger shrank by four); goldens/method-tags/
  properties fanned out (teeth bumped to seventh-tool/fourth-door — the conformance tests already pinned
  6/3 since WP-11.W8, the docs were behind their own witness); register rows updated; ADR-0005's count
  superseded with a dated note; A-D3/A-D4 got `[COUNT SUPERSEDED]` tombstones. All 11 gates green.
  **In-flight CI also paid a tax: the disk on the runner filled (ENOSPC), producing two false-red gate
  runs on the same PR; the rerun passed in 8m.** See the operating notes in §1.

### #306 — hygiene: recut ledger closed, doc-transcript CI cost re-measured

`docs/design/campaign-10-recut.md` nine rows still `OPEN` that are shipped (lucy-1/2, bobby-1/2,
billy-1, A5-stale-4, dogfood-5, F4/F5/no-help) each given its closing evidence; `arch-#8` stays OPEN,
pointed at ARCH-D3b/D4. And the doc-transcript CI cost was re-measured on the healthy runner:
**241s, not the 833s recorded on 2026-08-31** — the "cut the same-invocation test" advice is retracted.

### #307 — the AUTHORITY ruling (owner, 2026-09-03): CREATE is T2-by-construction, growth by USE-OR-SEAL

The owner ratified the two questions that kept ADR-0010 a proposal. Product framing, verbatim:
_"who approves is the ORCHESTRATOR, approving only with evidence, clear protocol; both [use-and-success
and human seal] coexist; neither is mandatory; human-in-the-loop kills the purpose, this serves LLMs not
humans."_ Three commitments (ADR-0010 §"Owner ruling"; atlas-architecture §3.4):

1. **CREATE is T2-by-construction** — a new node is born advisory; the one-way join at
   `fastpath.ts:143` already made self-declaring higher cost more than it buys, and the ruling makes T2
   the written rule, not a consequence.
2. **Growth is USE-OR-SEAL, neither mandatory** — a node leaves advisory by ONE of two earned evidences:
   **USE** (served in a recorded, completed decision; the `hits` ledger
   `packages/knowledge/src/lifecycle/hits.ts` is the foundation) or **SEAL** (human ratify token).
   Neither is required; a node earning neither stays advisory and decays (KNOW-17).
3. **The ratify token is ONE evidence, not a gate; verification stays advisory** under the local
   posture; `service-gate-guard` re-opens it the moment a remote/multi-tenant transport is attempted.

ADR-0010 moves Proposed → Accepted. Items 1 and 3 of its old ratification list (wire `DOOR_RATIFY_CTX`
derivation; derive `scope` from `primaryAnchor`) become the implementation scope of **ARCH-D3b**, now
authorized to build. **Docs-only — no code behavior yet.**

---

## 2.7 — ARCH-D3b built to item 1: the fast-path verdicts are derived, the gate-pinning constant is dead

After #307, the ARCH-D3b implementation scope was measured, specified and built:

- **#309 docs/arch-d3b** — recorded that item 3 (scope↔primaryAnchor) was ALREADY CLOSED in code
  (WP-10.A3 #251: `evalAuthzGate` runs `scopeOwnsAnchor` backed by `authz.anchors`). The architecture's
  §3.4 and decision table now say so; ARCH-D3b re-scoped to items 1 + 2.
- **#311 test(blackbox)** — CI fix: the `e2e-blackbox` vitest project timeout raised 30s→60s. SCN-MCP-4b-1
  (8 subprocess pairs, adversarial claims) measured 37s even on a quiet box; under the machine's 16
  self-hosted runners the 30s cap failed repeatably, taking unrelated docs PRs down. This is what made the
  CI flicker all day; the fix stabilised it.
- **#310 docs(protocol)** — the SUCCESS-CRITERIA fifth vital axiom added (EXECUTION-PROTOCOL.md + TEAM.md +
  method/prompts/C.md): a WP's gates being green is not enough; its `success_criteria` names the
  user-observable outcome, and a green-with-no-exhibition is a false-green the seal must name + re-derive.
- **#312 req(d3b-a)** — S1+S2+S3 for item 1: INV-AUTH-15 (the fast-path verdicts are DERIVED, never a
  hardcoded constant), REQ-AUTH-15a/b/c, SCN-AUTH-15a/b/c, method-tag, and the wp-d3b-a-wire-verdicts
  card carrying the success_criteria. Counts fanned out 18→19 INVs, 73→76 REQs.
- **#313 feat(d3b-a)** — the IMPLEMENTATION: `DOOR_RATIFY_CTX = { contested: false, lowRisk: true }` module
  constant REMOVED. `ratifyCtxFor(derivedTier, verdicts, origin)` now requires `FastPathVerdicts` (no
  default, compile-enforced); `deriveFastPathVerdicts(truthCleared, contended)` is the one shared
  derivation — `lowRisk` from the cleared truth gate (groundedness on the no-truth-gate doors), `contested`
  from caller-observed contention/veto. All four doors (emit/negation/transition/test-vacuity) + the check
  leg thread it; check≡emit parity preserved (same function). The draft INCUMBENT port keeps its frozen
  1-arg signature (preview, never a commit). Behavior preserved: the common grounded∧T2∧advisory
  auto-accept still auto-accepts — as the OBSERVED outcome of real verdicts, not a hardcoded true.
  Mutation-probed: planting the old constant turns `wp-d3b-a-wire-verdicts.test.ts` red; restore → green.

**Known honest limit.** `contested` is `false` on every path today because no veto/contention mechanism
exists yet (the commit-retry already re-runs the gates on a collision, so no auto-accept survives a real
race, but the verdicts are not yet threaded from that). Documented as future extension in the code.

**Infra paid for this session.** The machine was hosting SIXTEEN self-hosted runners (atlas + wallet×3 +
corelink×5 + clw/hugit/mcp/githugr/lightr/skill). Nine were stopped as redundant (wallet-2/3, gh-runners
2-5, githugr, lightr, mcp); CPU is freed and CI is stable ~9.5min. The `python -c exec(eval(...))`
high-CPU processes seen were legitimate pytest xdist workers of the skill-001 runner, not malware.

## 2.8 — CI per-delivery cost + USE-OR-SEAL specified (2026-09-05)

Two merges this session, both on master `1d9fd5a`:

- **#316 ci(delivery-cost)** — `.github/workflows/ci.yml`: the **product suite runs only when the diff
  touches code**, not on docs-only PRs. A `paths` filter gates `npm test` (product suite) so pure-docs
  PRs ride the doc gates alone (adr-citation, req-clause, ears-coamend, doc-transcript, service-gate) —
  measured **10m35s vs ~1h+** on a docs-only PR (#315). Also folds in `test(e2e-blackbox)`: the s10
  path-traversal perf assertion gets host headroom 10s→30s (a 37s-measuring assertion was flaking under
  the machine's shared runners — the same family as #311).
- **#315 req(d3b-b)** — **S1+S2+S3 for ARCH-D3b item 2 (USE-OR-SEAL)**, docs-only: INV **ENTRY-AUTH-16**
  - 4 REQs + 4 SCNs + the `wp-d3b-b-use-or-seal` work-package card carrying its `success_criteria`.
    Counts fanned out: 19→20 INVs, 76→80 REQs (re-derive with `docs/requirements/*` + the recount commands
    in §1). The spec pins the owner ruling (#307): plain per-node usage COUNTER at named constant
    `USE_THRESHOLD`, human seal as alternative-sufficient, never a precondition.

**Loaded-machine flake root-caused.** The step before merge, the same commit's gate failed three tests
that all pass in isolation: `scanner.wp-11.w5` (2×: `expected 'could-not-run' to be 'hit'` + ENOENT on
the fake-scanner `stdin-capture` tmpdir) and e2e `SCN-MCP-4b-1` (`Test timed out in 30000ms`). Cause was
**not the diff** (CI-only, zero product code): sibling self-hosted runners (this time _corelink-server's_
CI, ~4 python workers at ~90% CPU each, ~330% aggregate) saturated the machine at the 01:35 run; the
scanner tests spawn real `/bin/sh` mid-test and the spawns blew their 30s test timeout. Honest markers
that it was load, not code: the failing tests run green in isolation on a cool box, and the identical
commit re-ran green 30m later once corelink finished. Lesson already half-paid in §2.7 (nine runners
stopped) — **corelink was the one that came back**: a foreign runner's scale-out still starves this
machine's CI; check `ps aux | sort -k3 -r` and `pgrep -f Runner.Listener` before debugging a stalled or
flaky run as a code problem.

## 2.9 — USE-OR-SEAL implementation started (2026-09-05, session 3)

`#317` merged (docs/session-state, commit `7bd1cc4`). Master delivery CI `33944286415`
(in_progress at save time) runs the full suite by the #316 cost model — a push to master always
runs the suite; the merge is the delivery moment.

ARCH-D3b item 2 — USE-OR-SEAL — went from SPECIFIED to **impl in flight**:

- Branch **`feat/use-or-seal-impl`** cut from master `7bd1cc4` (NOT yet pushed).
- Core design, settled:
  - `packages/knowledge/src/lifecycle/hits.ts` gains: **`USE_THRESHOLD`** named constant (plain
    positive integer, one tunable place — NOT the parametric `door2Threshold`, which is a DIFFERENT
    knob), a **`seal(nodeId)`** method (human ratify-token endorsement, independent of the counter),
    and a **`servedClass(nodeId): 'advisory' | 'governing'`** decision `= (hits ≥ USE_THRESHOLD) ∨
sealed`; otherwise advisory (never a default rise). `decay` stays KNOW-17.
  - SCNs to hit: `SCN-AUTH-16a-1/16b-1/16c-1/16d-1` (goldens-authoring.md:534-560), method-tag
    **exhaustive** (method-tags-authoring.md:146-152). Tests in the established hits.know17 pattern,
    plus a heldout `-2` leg (different nodes / `queue/` territory), plus the exit_predicate MUTATION:
    removing the `logHit` in the serve path turns the growth SCNs red.
  - Wire: the serve path is `createProjectionQueryIndex` `cover()` (`projection-query-index.ts:83`)
    → `factToInvariant` assigns `tier` from `fact.tier`; a grown node must be served at the RAISED
    class (`bands.ts:41-48`: GOVERNING = `≥T1`, ADVISORY = `T2`; `retrieval/src/pack.ts` admits
    T0/T1 only). The cover loop calls `logHit` per advisory node served — the counter MOVES on a real
    query.
  - Ref-model guard: `harness/gates/reference-model-guard.mjs:234` pins `hits.ts` `values: 1` —
    adding exports bumps it; the ledger entry must be updated in the same change.
- **Honest scoping decision (owner asked to avoid over-engineering):** the acceptance SCNs + the
  card's `success_criteria` are all IN-PROCESS (serve 8× → raised on the next pack, same bind). NO
  new durable sidecar. The `hits` ledger stays in-memory per process; persistence across restarts
  was NOT required by any acceptance/golden and would have meant a third sidecar family + rehydrate
  — rejected as invented scope. The card's "no production writer" deficit is closed by wiring the
  serve path (cover) to call `logHit`. `own-source.ts:330` `hits: 0` stays honest until the growth
  decision actually surfaces in `own` (it reads the ledger, which now has a writer).

## 2.9b — USE-OR-SEAL implementation DELIVERED AND MERGED (2026-09-05, session 3, later)

**PRs #318 + #319 MERGED** into master (`096c852` docs handoff → `b8ee518` impl), both master delivery
CI runs green. The impl landed as one commit
`feat(d3b-b): USE-OR-SEAL impl…`. What the merge delivers:

- **Core** `hits.ts`: `USE_THRESHOLD = 8` (plain const, one tunable place — distinct from the
  still-parametric door-2 `threshold`); `seal(nodeId)` (endorsement ≠ ledger event — `window`
  untouched); `servedClass(nodeId)` = governing iff sealed ∨ hits ≥ threshold.
- **Serve path** `projection-query-index.cover()`: optional `hits?: BoundHits`. ABSENT ⇒
  byte-identical pre-WP behaviour (all bare-WIRE tests unchanged). PRESENT ⇒ each ADVISORY node
  delivered logs one hit (SCN-16a); the served class is decided BEFORE the serve's own `logHit`,
  so the serve reaching `USE_THRESHOLD` rises the node on the NEXT pack (success-criteria); a
  grown/sealed node is served at the RAISED class (tier `T1`, governing band).
- **Wire seam** `WireConfig.hits?: BoundHits` — TYPE-ONLY (`import type`), no composition root
  binds it yet. hits.ts therefore KEEPS zero production callers; ref-model ledger updated
  `values: 1 → 2` (the new `USE_THRESHOLD` export) + header count 154→155. Do NOT compose a
  bound with fabricated `archive`/`calibrate` deps — decay/door-2 aren't exercised by the serve
  seam, so a composed no-op would be a placeholder. The seam is the delivery point the day a real
  GEN/RETR consumer exists (delete the ref-model entry then).
- **Tests**: `knowledge/test/hits.auth16(-heldout).test.ts` (SCN-16a-d-1 + held-out `-2`,
  exhaustive two-trigger enumeration); `adapter-io/test/projection-query-index.use-or-seal.test.ts`
  (serve-path 16a/16b/16c/16d + exit_predicate MUTATION — stripping the `logHit` call kills 3
  growth teeth, verified by mutation run).
- **Verified**: `npx tsc -b` clean; package suites green (knowledge 401, adapter-io 1130, genesis
  /retrieval/tools/index/memory/cli/mcp green; the scanner.wp-11.w5 failure under load is the KNOWN
  §2.7/§2.8 loaded-machine artifact — green isolated); harness gates green (wiring, layer,
  spec-conformance, godfile, id-integrity, reference-model).
- **NOW COMPOSED (2026-09-05, later in session 3)**: `compose.ts` binds the ONE served-use ledger via
  `bindHits` and injects it through `WireConfig.hits`, so `atlas query`'s serve path WRITES the counter
  in production — the "no production writer" deficit the wp card named is CLOSED. Deps are honuns,
  none fabricated: `servedSet` = `currentNodes(rehydrateProjection(readStore))` (the serve path's own
  snapshot), `archive` = re-assert the fact bytes into the CAS (KN-12, content-addressed, idempotent),
  `calibrate` = pass-through `observed→observed` (the OPEN-DEFINE door-2 `f(hits)`, no invented regime
  — ADR-0012). hits.ts now HAS a production caller ⇒ it LEAVES the reference-model ledger (entry
  deleted, declared-modules 44→43, dead-value-exports 155→153, type-reachable 6→5). `own-source.ts:330`
  stays `hits: 0` — that field is the SEPARATE RETR-8 frecency ledger, which genuinely still has no
  writer; it is not the USE-OR-SEAL counter.

---

## 3 — The state of THIS repository's own store — AFTER the retirement

Re-derive with the two commands in §1. Store state is unchanged by Campaign 3+6+8. Current HEAD is `61e4b45`:

- `doctor cas` → `objects=1320 referenced=596 corrupt=0 unreadable=0 missing=0 orphan=724 sound=true`.
  **`sound=true` for the first time since the rows went missing.** `orphan` is not a fault (append-only,
  content-keyed CAS; an object outliving the sidecar that referenced it is ordinary). Do not "clean up"
  orphans.
- `verify-store` → `0 sealed-proven fact(s) — 0 re-proven, 0 broken, 0 unverifiable, 0 dangling`, exit 0.
  The honest zero: the 17 were the entire `proven` population, so nothing remains to re-verify, and the
  line says so explicitly.
- `atlas doctor cas` and `atlas verify-store` run on the **compiled** CLI
  (`packages/cli/dist/src/bin.js`), so `npx tsc -b` must have run at least once since the last build.

The store is now in the state the 2026-08-31 handoff called for: it passes its own audit, and it is
COMMITTED (PR #300) — it travels with the code. `.atlas/cas/` and `.atlas/projection.json` are tracked
on master; a fresh clone reads a store that re-proves itself.

Remaining uncommitted-but-traveling sidecars: see `git status` for the exact list. `.atlas/policy.json` is
permanently tracked. Staging sidecars (`.atlas/staging*.json`) are git-ignored by design (ADR-0008) and
should stay so.

---

## 4 — Open decisions (owner's, not the next session's to take)

**(a) The 17 unresolvable rows — RESOLVED.** Retired by owner decision, 2026-09-02, per §2. The
alternatives that were weighed before choosing this one are recorded in §2 — re-mining is not a repair in
place, `derive-relations` is not a repair at all, and the retire is a governed-still-manual write.

**(b) Do NOT reach for `derive-relations` as a repair — still true, and now moot for the 17.** Measured
2026-08-31: it derives **6193** edges, not 17; every candidate is refused `unauthorized: actor not in fact
scope`; authorising would mean editing `.atlas/policy.json` (admin-owned). If the ~6193 derived edges are
ever wanted, that is its own campaign with its own plan.

**(c) CI cost.** `harness/gates/doc-transcript-guard.test.mjs` was measured at **833s** in the 2026-08-31
session. **Re-measured 2026-09-03 on the self-hosted runner: 241s (~4min), 13/13 green.** The earlier figure
was taken on a machine whose per-test corpus runs were slower; it also predates the runner being restored
to a healthy symlinked install. Two consequences: the §2026-08-31 suggestion to "cut the same-invocation
test" should NOT be followed — the two insertion tests are the teeth that prove the re-attach fix, they now
cost ~2min combined, and the whole file sits inside an 8-minute gate comfortably. If CI time ever
regresses to ~14min, re-measure before cutting anything.

**(d) The retirement was a manual projection write, not a tool.** There is deliberately no CLI/MCP command
that deletes a row (staging has no delete; projection has no delete). If deleting rows becomes a recurring
need, the honest place for it is a governor-approved `doctor` leg + a governed door — a new campaign, not
an ad-hoc edit. Until then, record it in the session handoff as this session did.

---

## 5 — Working rules in force

Same rules the prior sessions paid to learn; they are load-bearing for anything that touches the store:

1. **A gate that skips what it cannot read reports health for the exact fault it exists to catch.** Every
   drop must be counted and named (the `dangling` bucket is the canonical example).
2. **A sentence denying a failure mode is evidence someone once worried about it, not evidence it was
   fixed.**
3. **Anchor a gate on the shipped artifact, not on the constant that describes it.** Falsify it once
   against the live system by hand before believing it.
4. **Mutation-probe your own instrument.** Three defects in one prior session's probes were found only by
   deliberately breaking the thing under test.
5. **When you fix what a measurement measured, re-derive the measurement.** An assertion whose subject an
   earlier gate now removes still reads green and has become vacuous.
6. **Run every guard before pushing, not the ones you think you touched.** Their state on HEAD `1637ac6`
   (all 11 exit 0) is the proof this change did not rot anything.
7. **A dated transcript quoted as evidence goes stale while still reading as freshly verified.** Date it,
   or re-run it.
8. **Publish no measured numbers without an independent cold review.** Ask the reviewer explicitly to
   check whether an edit softened any pre-existing constraint.
9. **Measure a command before recommending it** — the `derive-relations` episode (364× error) is the text.

---

## 2.11 — WP closure wave frozen (2026-09-07)

The WP audit found `137` cards: `134` with positive evidence and three open contracts. The closure wave
froze the following decisions before delegation:

- **WP-4.11-b.KNOW / 1A** — provenance is durable claim data. Preserve `ClaimProvenance` from candidate/node
  through the knowledge projection and governed write path; untrusted claims are advisory and cannot take the
  fast gate. Existing optional carriers stay backward-readable; new write paths validate the receipt.
- **WP-4.12-a.GROUND / 2A** — GROUND owns structural freshness only. KNOW owns the upward `kind` decision and
  exposes advisory drift as canonical `STALE`; predicate drift remains `DRIFTED`. Do not make GROUND import
  Knowledge types.
- **WP-5.17.TOOLS / 3A** — `ResultCard` and wave-close orchestration belong to Orchestra. Atlas keeps the
  opaque `EmitApi.absorb` seam but does not invent its payload or pretend to ship a wave driver. Ledger records
  this card as delegated integration, not Atlas production code.

Dispatch used two implementation WPs plus one ledger/traceability WP. Agents worked only in isolated worktrees,
ran focused tests and mutation probes, and returned compact evidence. Lead cold-reviewed diffs, reran gates, and
landed changes locally; no agent merged.

Closure result: `WP-4.11-b.KNOW` and `WP-4.12-a.GROUND` are `REVIEWED-BUILT`; `WP-5.17.TOOLS` is
`DELEGATED-ORCHESTRA`. The Atlas ledger has `136` evidence-positive cards, `0` open cards, and `1` delegated
integration card (`npm run wp-audit`).

Verification: Knowledge `397/397`, Adapter `1141 passed / 12 skipped / 2 todo`, CLI `456/456`; focused closure
suite `68/68`; all named guards passed, including reference-model counts `38/38 modules` and `139/139 value
exports`. W1 and W2 mutation probes both produced red tests before restoration.

## 6 — Where to look next

No implementation PR is in flight. Wave B's first controlled slice is merged: #327 placement snapshots,
#328 grounding contract wording, #329 checkpoint replay barrel routing, #330 malformed provenance rejection,
and #331 transcript-pointer backend handling. Final master delivery run `34154872325` passed on merge
`6cc2059` (2026-09-07); local `master` is synchronized to that commit. The remaining reference-model rows
are the next decomposition input, not proof that every module should be wired blindly.

**WP awareness audit added 2026-09-07:** `docs/requirements/wp-status.md` and `npm run wp-audit` enumerate all
`137` WP IDs (`113` campaign + `24` remediation): `22` explicit-built, `97` full-acceptance-test evidence,
`6` partial/direct-test evidence, `11` reviewed-built, and `1` delegated Orchestra integration. The old `71`
count in `docs/roadmap/wave-plan.md` is a pre-recut snapshot.

**ARCH-D3b is now fully CLOSED** (item 2 delivered 2026-09-05):

- **item 1 (wire the fast-path verdicts)** — CLOSED: #312 (spec) + #313 (impl). The `DOOR_RATIFY_CTX`
  constant is dead; `deriveFastPathVerdicts` derives `lowRisk`/`contested` from observed state.
- **item 2 (USE-OR-SEAL)** — **CLOSED**: #315 (spec: ENTRY-AUTH-16 + 4 REQs + 4 SCNs + the
  `wp-d3b-b-use-or-seal` card), #319 (impl). `USE_THRESHOLD`/`seal`/`servedClass` in `hits.ts`; the
  serve path (`projection-query-index.cover()`, `hits?` seam) writes the counter per served advisory
  node and serves a grown/sealed node at the RAISED class; `WireConfig.hits?: BoundHits` is the
  type-only delivery seam. Full detail in §2.9b.
- **item 3 (derive scope from primaryAnchor)** — CLOSED in code since WP-10.A3 (#251); recorded in #309.

**The state left HONESTLY OPEN by item 2** — now CLOSED (2026-09-05, later in session 3):

- ~~The `hits` ledger has ZERO production callers~~ — **composed**: `compose.ts` binds it and injects
  `config.hits`; hits.ts LEFT the reference-model ledger (entry deleted). The serve path writes the
  counter on a real `atlas query`; the class can rise in-process, proven by the SCN tests and the
  exit_predicate mutation.
- **RETR-8 read leg is now composed** by #323: the frecency ledger's `budget` projection is reachable through
  `atlas budget`. Its production feed writer is still open; `own-source.ts:330` continues to carry the
  per-node `hits: 0` input shape. `atlas territories` exposes the RETR-13 MISS-oracle projection, but no
  served-turn writer is claimed here.
- **Remaining `shipped:null` rows need separate contracts**: RETR `drop.ts`, `poke.ts`, `relate.ts`; PERSIST
  `attach.ts`, `diff.ts`, `merge.ts`, `metering.ts`, `placement.ts`, `provenance.ts`, `reconstruct.ts`,
  `reinvoke.ts`, `transcript-store.ts`; GEN `align.ts`, `cost-policy.ts`, `loops.ts`, `usefulness.ts`; plus
  the independent grounding/index/knowledge rows listed by `reference-model-guard.mjs`. The bannered
  `tools/{diff,push}.ts` and `adapter-io/poke-file.ts` remain explicit no-transport seams.

Two standing threads remain owner-level, unchanged from the prior handoff:

- **The billing lock** — why CI runs on the owner's machine; clearing it restores hosted runners.
- **The fork-PR contribution flow** — #301 means forks never reach the gate until synced in-repo.
- **The self-hosted runner's load flakes** (§2.7/§2.8) still bite: `s-mcp-4-draft-parity`,
  `s26-surface-lies`, `scanner.wp-11.w5`, and `memory-store.test.ts:A4` (REAL subprocess spawn) all
  time out or flake when a foreign build (`opencode-tasks` rust/tsgo) starves the machine. Wave B PR gates
  reproduced scanner spawn failures only under concurrent full-suite runs; serial reruns passed. Keep full
  gates serial when runner pressure is visible; rerun is standard recovery, not a code fix.

For the full reasoning behind the recent changes, read the pull request bodies — `gh pr view 294`,
`gh pr view 296`, `gh pr view 297`, `gh pr view 300`, `gh pr view 301`, `gh pr view 305`, `gh pr view 307`,
`gh pr view 309`, `gh pr view 311`, `gh pr view 312`, `gh pr view 313`, `gh pr view 315`, `gh pr view 316`, `gh pr view 317`.
The four documents worth reading before touching anything: `README.md` for the shipped surface,
`BENCHMARKS.md` for what is measured and — more usefully — its Honest Limits section for what is not,
`docs/adr/ADR-0022-doctor-audits-the-store-it-diagnoses.md` for the most recent architectural decision,
and `docs/CONVENTIONS.md`. For ARCH-D3b specifically, start at `docs/adr/ADR-0010` §"Owner ruling" and
`docs/reference/atlas-architecture.md` §3.4.
