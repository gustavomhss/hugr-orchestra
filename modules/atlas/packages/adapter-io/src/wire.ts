// @atlas/adapter-io — src/wire.ts  (WIRE-1: the ONE shared handler assembly)
//
// The single composition seam shared by every entrypoint (CLI, MCP): assemble the governance legs
// (atlas-init / atlas-query / atlas-emit / atlas-reconcile / atlas-link / atlas-memory-emit) over the raw
// adapters and hand them to the one frozen `createHandler`. Co-located with the adapters it composes (D2:
// the shared `wire` module lives in @atlas/adapter-io, not a separate package). This module is the SOLE
// assembly point — every entrypoint imports THIS `assembleHandler`, so CLI and MCP are contract-identical
// by construction, not by copy (WIRE-1). The legs are built from the raw adapters; the seams that have NO
// adapter (the T0 heuristic, the truth-gate, the KNOW-5 classifier, the drifted-fact set, and the anchor
// resolver) are INJECTED via `WireConfig.seams`, so the assembly is testable with fakes/stubs.
//
// [EXTENDED — WP-11.W8 / CAMPAIGN-11] `atlas-memory-emit` is the SIXTH governed leg — the ONE path a
// `MemoryEntry` reaches the durable per-seat memory log (`@atlas/memory` MEM-1..9), through the door
// `memory-emit.ts` composes. Its leg is ALWAYS present as a literal key in the `legs` object below (ARCH-3,
// `layer-guard.mjs`'s `boundLegs` forbids a top-level spread from hiding a leg): when `config.memoryEmit`
// is absent (a bare WIRE fake assembly with no composition root) the leg THROWS, and the frozen handler's
// existing catch converts that into a structured rejected `Verdict` (TOOLS-2) — the SAME "not wired at this
// seam" shape every other leg gets when its composition-root dependency is missing.

import { createHandler, createInit, createQuery, createReconcile } from "@atlas/tools"
import type { ToolLegs, ToolLeg, NodeSource, MemoryEmitOut } from "@atlas/tools"
import type { MemoryEntry } from "@atlas/memory"
import type { MemoryEmit } from "./memory-emit.js"
import { build, createResolve, createDepgraph, createSymbolReverse, nodeHashOfPath } from "@atlas/index"
import type { Axes, FileTree, ScipOutput, SymbolReverseApi } from "@atlas/index"
// The GROUND-1 per-fact drift oracle — the SAME import the composition root's truth-gate uses (compose.ts).
import { driftDetect } from "@atlas/grounding"
import { currentNodes, deriveSameAs, deriveSubsumes, resolveFactFreshness } from "@atlas/knowledge"
import type { BoundHits, GroundedFact } from "@atlas/knowledge"
import type { Freshness, Hash } from "@atlas/contracts"
import type { FreshnessOracle } from "./pack-shape.js"
import { retrievalPack } from "./retrieval-model.js"
import type { CasPath, DiskStore } from "./store.js"
import { walkFileTree } from "./fs.js"
import { readScipOrEmpty, readScipIndexerName, planIndexers } from "./scip.js"
import type { LangId } from "./scip.js"
import { createIndexAdapter } from "./index-adapter.js"
import { createProjectionQueryIndex, underScope } from "./projection-query-index.js"
import { createDriftSource } from "./git-drift.js"
import { headSha } from "./run-git.js"
import { createGovernedEmit } from "./governed-emit.js"
import { buildTargetEscapes } from "./escape/target-escapes.js"
import { buildDynamicReach } from "./escape/dynamic-reach.js"
import { createGovernedLink } from "./governed-link.js"
import { loadPolicy } from "./policy.js"
import { createDiskStore, rehydrateProjection } from "./store.js"
import type { SidecarTrust } from "./store-provenance.js"
import { UntrustedStoreError } from "./read-provenance.js"
// DAG-pin imports — referenced (not wired as legs) to keep the frozen skeleton's dependency edges real.
import { foldAstUnits } from "./ast.js"
import { createForge } from "./git-forge.js"
import { createHistorySource } from "./git-history.js"
import { createSiteProposer } from "./llm.js"

/** The one wired handler — the exact return of the frozen `createHandler` (@atlas/tools). */
export type WiredHandler = ReturnType<typeof createHandler>

/** The every-language set the extractor plan spans (ring shape — scip.ts `LangId`). */
const ALL_LANGS: readonly LangId[] = ["ts", "py", "go", "java", "rust", "rb"]

/**
 * The EDGE-MODEL version string a #99b negation stamps onto `NegationNode.edgeModel` (§3 clause 4 — the ONE
 * completeness clause `driftDetect` cannot see, since an extractor upgrade changes no file bytes). It is the
 * DETERMINISTIC join of the PINNED per-language extractor releases (`IndexerPlan.version`) — the "edge model"
 * that decided what edges (and thus what CALLERS) the completeness feed could see. Repo-independent (it is the
 * set of pinned tools, not which files exist) and stable (sorted), so equal builds stamp byte-identical
 * versions and a later re-check can compare them. An un-indexed language (`honest-hole`, no `version`) pins
 * nothing and contributes nothing here.
 */
export function edgeModelVersion(): string {
  return planIndexers([...ALL_LANGS])
    .flatMap((p) => (p.version !== undefined ? [`${p.lang}@${p.version}`] : []))
    .sort()
    .join(",")
}

/**
 * THE ONE per-fact freshness oracle, made FAMILY-AWARE (N4 · billy F1 — the honesty-axis teeth). This is the
 * single seam every read/reconcile freshness recompute rides (`FreshnessOracle`, pack-shape.ts): the query
 * projection readback + retrieval feed (via `resolveFreshness`) AND the #99b negation read leg. It is NOT a
 * fork of `driftDetect` — it CALLS the sealed oracle verbatim and ADDS one conjunct, and only for a NEGATION:
 *
 *   - advisory / predicate / relation ⇒ `driftDetect(grounding, axes)` VERBATIM (they carry no `edgeModel`);
 *   - negation ⇒ `driftDetect(grounding, axes) === FRESH ∧ edgeModel === currentEdgeModel ? FRESH : DRIFTED`.
 *
 * The `edgeModel` conjunct (§3 clause 4) is the ONE completeness clause `driftDetect` cannot see: an extractor
 * upgrade (E1→E2) changes NO file bytes, so the scope-directory subtreeHash stays FRESH, yet E2 may newly
 * resolve a caller of X — so a negation admitted under E1 MUST re-flag DRIFTED once the current edge model is
 * E2. `currentEdgeModel` is `edgeModelVersion()` at READ time (the SAME function the door stamps an admitted
 * negation's `edgeModel` with at emit), so equal builds compare byte-identical and a bumped extractor drifts.
 */
export function bindFreshnessOracle(axes: Axes, currentEdgeModel: string): FreshnessOracle {
  return (fact: GroundedFact): Freshness => {
    const base = driftDetect(fact.grounding, axes) // the sealed GROUND-1 oracle, ridden verbatim
    if (fact.kind === "advisory" || fact.kind === "predicate") return resolveFactFreshness(fact.kind, base)
    if (fact.kind !== "negation") return base // only a negation carries the edgeModel completeness clause
    return base === "FRESH" && fact.edgeModel === currentEdgeModel ? "FRESH" : "DRIFTED"
  }
}

/** The legs the assembler composes (frozen, referenced to pin the edge). */
type _Legs = ToolLegs
/** The read-only per-node projection the handler optionally binds (frozen, referenced to pin the edge). */
type _Nodes = NodeSource

/**
 * The seams the assembler injects because NO adapter backs them at this WIRE slice — passed in via config
 * so the assembly is testable with fakes/stubs (the five legs are exercised for ASSEMBLY, not behaviour).
 *
 * [SEAM-CORRECTION — the classifier type] the pre-decided design named `import('@atlas/tools').Know5Classifier`;
 * that symbol is NOT exported from @atlas/tools — it is a LOCAL alias inside tools/reconcile.ts of the
 * @atlas/knowledge `ReconcileApi` (the KNOW-5 mechanical/semantic split, `createReconcile`'s `classifier`
 * param). Wired to the real exported type: `import('@atlas/knowledge').ReconcileApi`.
 */
export interface WireSeams {
  /** T0-candidate keyword heuristic for `createInit` (@atlas/tools). */
  readonly heuristic: import("@atlas/tools").T0Heuristic
  /** The GROUND truth-gate for `createEmit` (@atlas/tools). */
  readonly gate: import("@atlas/tools").TruthGate
  /** The KNOW-5 mechanical/semantic classifier for `createReconcile` (@atlas/knowledge `ReconcileApi`). */
  readonly classifier: import("@atlas/knowledge").ReconcileApi
  /** The grounded facts whose anchors the drift-source diffs across the merge base. */
  readonly driftFacts: readonly import("@atlas/knowledge").GroundedFact[]
  /** GROUND-owned anchor resolution at a rev (createDriftSource dep, git-drift.ts:24). */
  readonly resolveAnchorAt: (rev: string, qp: string) => import("@atlas/contracts").StructRef | undefined
  /** N10 — GROUND-owned CONTENT-addressed resolution at a rev: the recorded `subtreeHash` re-located to its
   *  new qualifiedPath (or `undefined` if the content is gone). Feeds `createDriftSource`'s pure-rename
   *  widening (git-drift.ts). OPTIONAL — a bare WIRE fake that omits it simply never surfaces a rename. */
  readonly resolveBySubtreeAt?: (rev: string, subtreeHash: string) => import("@atlas/contracts").StructRef | undefined
}

/** What the assembler needs to stand up the runtime (ring shape). */
export interface WireConfig {
  readonly repoPath: string
  readonly casPath: CasPath
  /** The `.scip` dump `readScip` decodes for the index adapter. */
  readonly scipPath: string
  /** The injected seams that have no adapter (tests pass fakes/stubs). */
  readonly seams: WireSeams
  /** The KNOW-11 write actor (owner-scoped authz). Resolved by the composition root from the environment /
   *  local machine ONLY (never from a fact/payload); ABSENT ⇒ `''` ⇒ fail-closed (every write denied). */
  readonly actor?: string
  /** The KNOW-8 ratify token (`by`) for a full-ratify (T0/predicate/contested) commit. Resolved by the
   *  composition root from the environment ONLY (`ATLAS_RATIFY_TOKEN`, never a fact/payload); ABSENT ⇒ a
   *  full-ratify fact fails closed, a T0 fact needs `billy`. Fast-pathed (auto-accept) facts ignore it. */
  readonly ratifyToken?: string
  /** The built structural axes the CLOSED three-mode retrieval surface reads (N2 — `atlas query --by
   *  dependency|trigger`). Supplied by the composition root (`composeRuntime` builds the SAME axes the index
   *  adapter rides); the fact-dependent read model is rebuilt PER QUERY from the live store over these axes,
   *  so dependency/trigger are as fresh as scope. ABSENT for the bare WIRE assembly (wire-only fake tests
   *  exercise `--by scope` only), where the non-scope modes fail closed. */
  readonly axes?: Axes
  /** The PROVENANCE seam (`store-provenance.ts`) for the ONE durable store below — "did this store arrive
   *  through a door, or by a COMMIT". Resolved by the composition root (git lives there, `store.ts` is
   *  deliberately git-ignorant). ABSENT ⇒ never consulted ⇒ behaviour unchanged, which is the shape every
   *  wire-only fake test relies on. It MUST be threaded here and not only onto compose's own store: THIS is
   *  the store both user-facing doors ride, and a seam applied only to compose's drift/doctor store would
   *  leave `atlas query` serving a committed projection while every test of the seam passed. */
  readonly trusted?: SidecarTrust
  /** TRAVEL-BY-REPROOF (`read-access.ts`) — the store every READ leg (`atlas query`, `atlas node`) uses.
   *  ABSENT ⇒ falls back to the write-gated `store` built from `trusted` above, the EXACT prior behaviour
   *  every wire-only fake test relies on. The composition root supplies this for a `tracked-provable` repo
   *  (a raw re-read filtered to facts that replay `re-proven`) and for `trusted`/`tracked-staging` (verbatim
   *  `store`, or irrelevant because `readRefusal` short-circuits first). Writes NEVER read this — `store`
   *  (built from `trusted`) is the only store `governedEmit`/`governedLink` ever touch. */
  readonly readStore?: DiskStore
  /** TRAVEL-BY-REPROOF — present ⇒ every read leg refuses BEFORE touching `readStore` (case 3
   *  `tracked-staging`, or the fail-closed leg of `tracked-provable`). ABSENT ⇒ no flat refusal: either
   *  `trusted` (case 1) or a successful `tracked-provable` filtered serve (case 2) — `readStore` alone
   *  decides what is visible in that case. Replaces the OLD blanket `refuseUntrustedRead(config.trusted)`
   *  call at each read leg, which could not tell case 2 apart from case 3 (both read `trusted() === false`).
   *  ABSENT on a bare WIRE fake assembly ⇒ never consulted ⇒ unchanged behaviour. */
  readonly readRefusal?: string

  /** WP-D3B-B.USE-OR-SEAL (ARCH-D3b item 2) — the serveside KNOW-17 usage ledger, INJECTED by the
   *  composition root (NOT built here — its `servedSet`/`archive`/`calibrate` deps are the root's, via
   *  `bindHits`). When PRESENT the projection query-index serve path accrues a hit per advisory node it
   *  delivers and serves a grown node at the RAISED class (INV-AUTH-16); ABSENT (the bare WIRE fake
   *  assembly, and every wire-only test) ⇒ byte-identical prior behaviour — no counter, no class rise.
   *  See `projection-query-index.ts`'s USE-OR-SEAL section for the mutation this seam guards (removing
   *  the `logHit` in the serve path turns the growth SCNs red). */
  readonly hits?: BoundHits

  // ── DEDUP-COMPOSITION (#241) — OPTIONAL PRECOMPUTED ARTIFACTS ──────────────────────────────────────────
  // `composeRuntime` (compose.ts) builds `rawTree`/`fileTree`/`scipOutput`/`indexerName`/`axes`/
  // `symbolReverse`/`targetEscapes`/`dynamicReach` from `repoPath`/`scipPath` BEFORE calling this assembler,
  // and this assembler used to independently rebuild every one of them from the SAME raw inputs — the walk,
  // the SCIP decode+projection, the AST fold, the axes `build`, the symbol-reverse view and the two v2
  // escape legs, all TWICE per command (measured ~7s of an ~8s single pass, on this repo's dump, PAID
  // ROUGHLY TWICE). Each field below is OPTIONAL and used ONLY WHEN PRESENT — a bare WIRE assembly (no
  // composition root; see the "bare WIRE fake assembly" tests) omits all of them and gets the EXACT prior
  // behavior: every artifact rebuilt here, from `repoPath`/`scipPath` alone.
  //
  // COHERENCE IS THE CALLER'S OBLIGATION, NOT THIS MODULE'S: every field a caller supplies MUST be derived
  // from the SAME `repoPath`/`scipPath`/`rawTree` as every other field it supplies (exactly how
  // `composeRuntime` builds them, in one pass, before calling `assembleHandler`) — this assembler cannot
  // detect a caller that hands it `axes` built from a DIFFERENT tree than `fileTree`. This is why `axes`,
  // `symbolReverse`, `targetEscapes` and `dynamicReach` all key off the derived `fileTree`/`scipOutput`
  // /`rawTree` ABOVE them in the fallback chain below, never off `config.repoPath`/`config.scipPath`
  // directly — a caller that overrides `fileTree` but not `axes` gets an axes REBUILT from that overridden
  // `fileTree` (never a silently mismatched precomputed one). `test/wire-precomputed-parity.test.ts` pins
  // that a handler built with EVERY field precomputed (compose.ts's own recipe) answers every governance
  // leg + query mode IDENTICALLY to one built with none of them — the two paths are byte-for-byte the same
  // observable behavior, only the WORK differs. If you change how any of these are DERIVED here, update
  // `composeRuntime`'s construction to match, or that test goes red.

  /** The unfolded `walkFileTree(repoPath)` result. ABSENT ⇒ walked here. */
  readonly rawTree?: FileTree
  /** `foldAstUnits(rawTree)` — the index adapter's spatial input. ABSENT ⇒ folded from `rawTree` here
   *  (which is itself `config.rawTree` when present, else walked here). */
  readonly fileTree?: FileTree
  /** `readScipOrEmpty(scipPath)`. ABSENT ⇒ read here. */
  readonly scipOutput?: ScipOutput
  /** `readScipIndexerName(scipPath)` — may be a real `undefined` (no/foreign indexer), which is why this
   *  is safe to re-derive when absent rather than needing a tri-state "not supplied" sentinel: re-deriving
   *  from the SAME `scipPath` is deterministic and yields the SAME value either way. */
  readonly indexerName?: string
  /** `createSymbolReverse(scipOutput, {indexerName})` — the #99b N0 completeness view. ABSENT ⇒ built here
   *  from `scipOutput`/`indexerName` (each themselves possibly precomputed above). */
  readonly symbolReverse?: SymbolReverseApi
  /** `buildTargetEscapes({scipPath, repoPath})` — ADR-0016 M2b v2 negation leg. ABSENT ⇒ built here; the
   *  rebuild is CHEAP when it would come back `undefined` again (an un-warmed AST grammar or unsupported
   *  indexer short-circuits before any parse), so omitting this on a repo where it cannot be built soundly
   *  costs nothing extra. */
  readonly targetEscapes?: (target: string) => readonly string[]
  /** `buildDynamicReach(rawTree)` — the sibling v2 leg. Same ABSENT behavior as `targetEscapes`. */
  readonly dynamicReach?: (scope: string) => readonly string[]

  /**
   * The governed MEMORY write door (WP-11.W8, MEM-1..9) — `createMemoryEmit`'s composed seven-gate door
   * over the durable per-seat memory log (`memory-store.ts`), built by the composition root
   * (`compose.ts`) over its OWN `actor` (D1: the owner is `actor`, resolved by the composition root — this
   * assembler never resolves or interprets it) and a real pre-write scanner (`scanner.ts`). ABSENT on a
   * bare WIRE fake assembly ⇒ the `atlas-memory-emit` leg THROWS, converted by the frozen handler's catch
   * into a structured rejected `Verdict` (TOOLS-2) — never a silent success over an uncomposed door.
   */
  readonly memoryEmit?: MemoryEmit
}

/**
 * Assemble THE one shared handler over the five legs built from the raw adapters (WIRE-1). ONE handler,
 * no per-entrypoint copy: every entrypoint imports THIS factory and calls it — the single assembly point.
 *
 * Each leg wraps the frozen leg-constructor's one method (`init`/`query`/`emit`/`reconcile`/`link`); a leg backed
 * by a still-stubbed adapter or a throwing seam is SAFE, because `handle` catches a missing OR throwing leg
 * and returns a rejected `Verdict`, never a throw (TOOLS-2). The `args:unknown` boundary is cast at each
 * leg — the frozen per-tool signatures name the fields (`init(path)`/`query(scope)`/`emit(node,at)`/
 * `reconcile(mergeBase, options)`/`link(a,b)`).
 */
export function assembleHandler(config: WireConfig): WiredHandler {
  // The index-backing adapter (satisfies both frozen tools ports: MoveInIndex + QueryIndex) over the
  // frozen FS + SCIP outputs, driving @atlas/index. `nodeHashOfPath` is the sealed-kernel path→node keying
  // (= build's keying, `id({file})`) — the exact IndexAdapterDeps shape (cf s01 / index-adapter.test).
  // Fold sub-file AST item/block units onto the spatial FileTree BEFORE `build` (F1): `build` keys every
  // index node by `node.path` (build.ts `key: node.path`), so the folded `::`-chained unit paths become
  // resolvable index node keys — a symbol grounding re-derives FRESH and its `::` primaryAnchor lets
  // `deriveSubsumes` fire (module ⊃ function). `foldAstUnits` is SYNC and reads the module-level grammar
  // singletons; when the composition root has awaited `initAst()` (the bins do, before composeRuntime) it
  // folds real units, otherwise it is a safe additive NO-OP (file/dir nodes only) — so wire tests that never
  // warm up keep their exact prior behavior.
  // Capture the RAW (unfolded) tree so the sound-negation `dynamicReach` leg scans file bytes off the SAME
  // walk `build` folds (no second FS traversal, no divergent view). `fileTree` is the folded index input.
  //
  // DEDUP-COMPOSITION (#241) — every one of these ALREADY EXISTS on `config` when `composeRuntime` is the
  // caller (compose.ts builds all of them from this SAME `repoPath`/`scipPath` before calling this
  // function); `?? <rebuild>` is exercised ONLY by a bare WIRE assembly (no composition root — see the
  // "bare WIRE fake assembly" tests), which gets the exact prior behavior. See the `WireConfig` doc block
  // for the coherence obligation this places on callers, and `test/wire-precomputed-parity.test.ts` for the
  // guard that the two paths answer identically.
  const rawTree = config.rawTree ?? walkFileTree(config.repoPath)
  const fileTree = config.fileTree ?? foldAstUnits(rawTree)
  // DEGRADE gracefully on a fresh repo: a MISSING `.scip` dump (no `.atlas/index.scip` yet) is an empty
  // files-only index, never a throw. `readScipOrEmpty` is the ONE shared missing-file guard (scip.ts) — the
  // twin of the one `compose.ts` applies for the Axes build (COMPOSE-B).
  const scipOutput = config.scipOutput ?? readScipOrEmpty(config.scipPath)
  // #99 F1 — the indexer identity the collapsed-local gate trusts (raw dump `metadata.toolInfo.name`; the
  // frozen projection drops it). `undefined` on a missing/foreign dump ⇒ heuristic OFF (fail-closed). Bound
  // into the `createSymbolReverse` factory so the door's N0 feed carries `opaqueRefSources` under scip-typescript.
  const indexerName = config.indexerName ?? readScipIndexerName(config.scipPath)
  // `buildAxes`/`symbolReverseFor` key off the `fileTree`/`scipOutput` RESOLVED above (which may themselves
  // be a caller override), never off `config.repoPath`/`config.scipPath` directly — the coherence rule the
  // `WireConfig` doc block states: an overridden `fileTree` with no overridden `axes` REBUILDS `axes` from
  // that overridden `fileTree`, never silently serves a precomputed `axes` from a different tree.
  const buildAxes = (t: FileTree, s: ScipOutput): Axes => config.axes ?? build(t, s)
  const symbolReverseFor = (s: ScipOutput): SymbolReverseApi =>
    config.symbolReverse ?? createSymbolReverse(s, { indexerName })
  const index = createIndexAdapter({
    fileTree,
    scipOutput,
    build: buildAxes,
    createResolve,
    createDepgraph,
    createSymbolReverse: symbolReverseFor, // #99b N0 + #99 collapsed-local gate
    nodeHashOfPath, // THE index's own minting, imported — never a local copy of `id({file:p})` (KERNEL-1)
  })

  // GOVERNED DURABLE EMIT (COMPOSE-A): the emit leg persists through the governed path — the GROUND
  // truth-gate, the KNOW-11 owner-scoped authz gate (actor supplied by the composition root, fail-closed
  // to `''` when absent ⇒ every write denied), the KNOW-15 `upsert` write-decision, and durable persistence
  // (the projection sidecar + the whole fact into CAS) — over the DURABLE `createDiskStore(config.casPath)`,
  // not a throwaway in-memory map. This closes the former store-bridge TODO: the durable store is the real
  // one now. The actor is passed in via `config.actor` (resolved from env/git-config by compose.ts) — this
  // module NEVER reads `process.env` or a fact/payload for the actor (the spoof-guard boundary).
  // The ONE durable disk store this assembly rides — shared by the governed emit leg (the write side) AND
  // the projection query-readback (the read side), so `atlas query` reads back the very facts `atlas emit`
  // persists (WIRE-LOOP: emit→query is a closed loop over ONE store, never two divergent instances).
  // N11: inject the freshness-watermark seam — a cheap `git rev-parse HEAD` (no worktree). The store stamps
  // `builtAt` at each persist; the query index (below) compares it to live HEAD to flag a behind-HEAD read.
  const currentHead = (): string | undefined => headSha(config.repoPath)
  // PROVENANCE: threaded from the composition root onto the ONE store both doors ride (see `WireConfig`).
  const store = createDiskStore(config.casPath, currentHead, config.trusted)
  // TRAVEL-BY-REPROOF — the store every READ leg below uses. `config.readStore`, when supplied (the
  // composition root's `read-access.ts` decision), may be `store` verbatim (`trusted`) or a raw re-read
  // FILTERED to facts that replay `re-proven` (`tracked-provable`) — either way it is built ONCE, upstream,
  // never re-decided here. ABSENT (a bare WIRE fake assembly, no composition root) ⇒ falls back to `store`,
  // the EXACT prior behaviour every wire-only test relies on. WRITES always ride `store` — this split never
  // touches the write path.
  const readStore = config.readStore ?? store

  // ADR-0016 M2b — the TWO v2 negation closure legs, built ONCE off the SAME `scipPath`/`repoPath`/`rawTree`
  // as the other emit-leg deps. Both-or-neither (a half-gate is never run): if either cannot be built SOUNDLY
  // (AST grammars not warmed — `assembleHandler` is sync and a wire-only fake never calls `initAst()` — or the
  // dump is unreadable) the door falls back to the sound `holeSources() ∩ S` blanket, exactly as #99b shipped.
  // DEDUP-COMPOSITION (#241): `compose.ts` already built these (off the SAME `scipPath`/`repoPath`/
  // `rawTree`) for its own promote leg — reuse them when supplied; a bare WIRE assembly still builds here.
  const negTargetEscapes =
    config.targetEscapes ?? buildTargetEscapes({ scipPath: config.scipPath, repoPath: config.repoPath })
  const negDynamicReach = config.dynamicReach ?? buildDynamicReach(rawTree)
  const escapeLegs =
    negTargetEscapes !== undefined && negDynamicReach !== undefined
      ? { targetEscapes: negTargetEscapes, dynamicReach: negDynamicReach }
      : {}

  const governedEmit = createGovernedEmit({
    store,
    gate: config.seams.gate,
    policy: loadPolicy(config.repoPath),
    actor: config.actor ?? "",
    // The ratify token rides the SAME env-sourced, payload-free channel as the actor. Conditional spread
    // keeps it ABSENT (not `undefined`) when unset — `exactOptionalPropertyTypes`, so the door defaults to ''.
    ...(config.ratifyToken !== undefined ? { ratifyToken: config.ratifyToken } : {}),
    // #99b N2 — THE NEGATION LEG's channels. `symbolReverse` is the N0 completeness feed off the SAME
    // assembled index surface `blastRadius` rides; `axes`/`nodeHashOfPath` are the live structural rail the
    // abstention gate resolves the scope-Merkle and the `∩ S` containment against; `edgeModel` is the pinned
    // extractor release stamped onto an admitted negation (§3 clause 4). ABSENT `config.axes` (bare-WIRE fake)
    // ⇒ a negation abstains fail-closed, exactly as `--by dependency` fails closed there.
    symbolReverse: () => index.symbolReverse(),
    ...(config.axes !== undefined ? { axes: config.axes } : {}),
    nodeHashOfPath,
    edgeModel: edgeModelVersion(),
    // ADR-0016 M2b — the v2 target-relative legs (both or neither; empty spread ⇒ the sound blanket fallback).
    ...escapeLegs,
  })

  // GOVERNED sameAs LINK (WP-SAMEAS): the second governed write door — asserts a human `a ≡ b` equivalence
  // over the SAME durable disk store + admin policy + env-sourced actor/ratifyToken channels as emit. Four
  // fail-closed gates (distinct → both-known → authz-on-both → ratifier) before it persists a symmetric edge;
  // NON-destructive (never a merge). The projection it mutates is the SAME `store` the query readback rides,
  // so a linked edge surfaces on the very next `atlas query` (the WIRE-LOOP holds for link→query too).
  const governedLink = createGovernedLink({
    store,
    policy: loadPolicy(config.repoPath),
    actor: config.actor ?? "",
    ...(config.ratifyToken !== undefined ? { ratifyToken: config.ratifyToken } : {}),
  })

  // THE PER-FACT FRESHNESS ORACLE (ADR-0013 / REQ-TOOLS-6d amended). `driftDetect` over the composition
  // root's ALREADY-BUILT `Axes` — the very oracle over the very axes the WRITE door's truth-gate rides
  // (`compose.ts` `buildGate(axes)`), never a second freshness notion and never a git call on the read path.
  //
  // ABSENT `config.axes` (the bare WIRE fake assembly — no composition root) ⇒ the seam is NOT wired and
  // every row reads `DRIFTED`, fail-closed (`resolveFreshness`, pack-shape.ts). It does NOT fall back to the
  // stored `fact.freshness`, which no read path writes back and which therefore says `FRESH` forever.
  const axes = config.axes
  // The family-aware oracle (N4): `driftDetect` verbatim for every fact, PLUS the §3 clause-4 `edgeModel`
  // conjunct for a negation, against the current edge model at read (`edgeModelVersion()` — the same value the
  // door stamps at emit). ONE seam, branched on family — the query path and the negation read leg share it.
  const freshnessOracle = axes === undefined ? undefined : bindFreshnessOracle(axes, edgeModelVersion())

  // Seam-1: wrap the pure structural index-adapter with the durable projection readback, so a scope resolves
  // to its covering territory skeleton (from @atlas/index) FOLDED with the emitted facts under it (from CAS).
  // TRAVEL-BY-REPROOF: rides `readStore`, not `store` — for a `tracked-provable` repo this is the raw,
  // re-proof-filtered store (`read-access.ts`); for everything else it IS `store` (see `readStore` above).
  const queryIndex = createProjectionQueryIndex(index, readStore, currentHead, freshnessOracle, config.hits)

  const legs: ToolLegs = {
    "atlas-init": ((args) =>
      createInit(index, config.seams.heuristic).init((args as { path: string }).path)) satisfies ToolLeg,
    // Seam-3: the query leg's `Verdict.data` is the `{ pack, subsumes }` observability envelope. `subsumes`
    // is `deriveSubsumes` (its FIRST production call site — DP-2 resolution-at-read) filtered to the edges
    // whose BOTH endpoints are current nodes UNDER the covering scope, already deterministically sorted.
    "atlas-query": ((args) => {
      // PROVENANCE, BEFORE ANY MODE SPLIT (TRAVEL-BY-REPROOF: now `config.readRefusal`, not a blanket
      // `trusted` check — a `tracked-provable` repo has NO refusal here and falls through to a query over the
      // already-filtered `readStore`). `ok:true` + an empty pack is indistinguishable from "no knowledge
      // yet" — the silent-disappearance failure this product treats as the worst one available. Refusing here
      // (a throw the frozen handler converts into a structured rejected `Verdict`, TOOLS-2) covers EVERY read
      // mode from one line: putting it inside the `--by scope` branch would have left `--by dependency`
      // serving the same refused rows with no refusal, which is exactly how the seam was missed the first
      // time (`WireConfig.readRefusal` records the twin of this mistake for the store instance itself).
      if (config.readRefusal !== undefined) throw new UntrustedStoreError()
      const a = args as { scope: string; by?: string }
      // N2: `--by dependency|trigger` routes THROUGH the designed three-mode `createRetrieval` surface (INDEX-6),
      // NOT re-implemented here. `scope` (the default, and every MCP/wire-fake call) stays the byte-identical
      // pre-existing projection path below. The mode is marshal-validated ∈ {scope,dependency,trigger} (CLI).
      const by = a.by
      if (by === "dependency" || by === "trigger") {
        if (axes === undefined || freshnessOracle === undefined) {
          // No structural axes wired at this seam (bare WIRE fake assembly) — fail closed; the handler wraps
          // this throw into a structured rejected Verdict (TOOLS-2), never a raw throw at the user door.
          // The oracle is checked in the SAME breath because it is derived from the very same `axes`: this
          // branch is the one place a row could otherwise be served with the fail-closed default verdict,
          // and refusing is better than serving a whole pack of rows marked `DRIFTED` for a wiring reason.
          throw new Error("atlas query --by dependency|trigger needs the composition-root axes")
        }
        // retrievalPack rebuilds the read model FRESH from the live store each call — freshness parity w/ scope.
        return retrievalPack(axes, by, a.scope, readStore, freshnessOracle)
      }
      const scope = a.scope
      const pack = createQuery(queryIndex).query(scope)
      const proj = rehydrateProjection(readStore)
      const underKeys = new Set(
        currentNodes(proj)
          .filter((n) => n.primaryAnchor !== undefined && underScope(n.primaryAnchor, scope))
          .map((n) => n.nodeKey),
      )
      const subsumes = deriveSubsumes(proj).filter((s) => underKeys.has(s.broader) && underKeys.has(s.narrower))
      // WP-SAMEAS: the derived human equivalence edges, scoped EXACTLY like `subsumes` — both endpoints must
      // be current nodes UNDER the covering scope. `deriveSameAs` is transitive (union-find) + pre-sorted.
      const sameAs = deriveSameAs(proj).filter((e) => underKeys.has(e.a) && underKeys.has(e.b))
      return { pack, subsumes, sameAs }
    }) satisfies ToolLeg,
    "atlas-emit": ((args) =>
      governedEmit.emit(
        (args as { node: import("@atlas/knowledge").GroundedFact }).node,
        (args as { at: import("@atlas/contracts").Hash }).at,
      )) satisfies ToolLeg,
    // WP-SAMEAS: the governed sameAs link leg — routes through the ONE handler like every other tool. Reads
    // the two nodeKeys off the marshalled `{a,b}` arg shape (CLI marshal.ts / MCP inputSchema both supply it).
    // [A-D3 / task #83] `retract` selects the MODE on the SAME leg and the SAME tool — no sixth tool, no
    // second leg, so CLI and MCP reach retraction through one code path and cannot diverge. Compared to the
    // literal `true`: the published schema declares `retract` as a boolean, so anything else is refused as
    // `malformed-args` at the door BEFORE this line, and the CLI marshaller hands over a real boolean.
    "atlas-link": ((args) =>
      governedLink.link(
        (args as { a: string }).a,
        (args as { b: string }).b,
        (args as { retract?: unknown }).retract === true,
      )) satisfies ToolLeg,
    "atlas-reconcile": ((args) =>
      createReconcile(
        createDriftSource({
          repoPath: config.repoPath,
          resolveAnchorAt: config.seams.resolveAnchorAt,
          // N10 — thread the content-addressed resolver so `driftAt` surfaces a pure rename (spread keeps it
          // ABSENT, not `undefined`, when a fake omits it — exactOptionalPropertyTypes).
          ...(config.seams.resolveBySubtreeAt !== undefined
            ? { resolveBySubtreeAt: config.seams.resolveBySubtreeAt }
            : {}),
          facts: config.seams.driftFacts,
        }),
        config.seams.classifier,
      ).reconcile(
        (args as { mergeBase: import("@atlas/contracts").Hash }).mergeBase,
        (args as { options?: import("@atlas/tools").ReconcileOptions }).options,
      )) satisfies ToolLeg,
    // WP-11.W8 — the governed MEMORY write door. A LITERAL top-level key (ARCH-3: a spread here would hide
    // the leg from `layer-guard.mjs`'s static scan while leaving it fully invocable), always present; the
    // body throws when `config.memoryEmit` is absent (bare WIRE fake assembly, no composition root), which
    // the frozen handler's existing catch converts to a structured rejected `Verdict` (TOOLS-2). On a real
    // composed runtime this folds `@atlas/memory`'s `MemoryVerdict` (from `createMemoryEmit`) into the
    // `MemoryEmitOut` shape `@atlas/tools` owns — `admitted:false` is the ONE discriminator `isFailClosedWrite`
    // keys off (mirrors `emitted`/`linked`), `refusal` is the named MEM gate, `rejected` is its human reason.
    "atlas-memory-emit": ((args) => {
      if (config.memoryEmit === undefined) {
        throw new Error("atlas-memory-emit: no memory write door composed at this seam")
      }
      const entry = (args as { entry: MemoryEntry }).entry
      const verdict = config.memoryEmit.emit(entry)
      if (verdict.ok) {
        return { admitted: true, record: verdict.record } satisfies MemoryEmitOut
      }
      return {
        admitted: false,
        refusal: verdict.refusal,
        rejected: `${verdict.refusal}: ${verdict.reason}`,
      } satisfies MemoryEmitOut
    }) satisfies ToolLeg,
  }

  // The DAG-pin references NOT wired as handler legs (frozen skeleton edges): the git-forge / history /
  // site-proposer seams. (The AST fold is now REALLY wired — the index FileTree pipeline above; the durable
  // disk store is REALLY wired — the emit leg.)
  void [createForge, createHistorySource, createSiteProposer]

  // N6: the READ-ONLY per-node projection source (TOOLS-10). `resolveNode(addr)` reads the whole fact back
  // from CAS by its CONTENT ADDRESS — the SAME durable store the query readback + governed emit ride (the CAS
  // bytes ARE the fact). READ-ONLY: it opens NO write path (writes funnel through the governed doors `atlas-emit`/`atlas-link`, TOOLS-1);
  // a miss ⇒ `undefined` (the handler renders a structured "no grounded node" rejection, never a throw).
  const nodes: NodeSource = {
    resolve: (nodeAddr) => {
      // PROVENANCE — the leg that goes AROUND `loadProjection`. Everything else on the read side rehydrates
      // the sidecar, where the tripwire lives; this one reads CAS by content address DIRECTLY, and `.atlas/cas/**`
      // is committed by the same `git add -f` that lands the sidecar (`isDurableStorePath` covers both). So a
      // committed blob came back WHOLE over `atlas node <addr>` with `ok:true`, with every write door denying.
      // It USED to return `undefined` here — fail-closed but indistinguishable from an ordinary miss —
      // because the frozen `resolveNode` did not wrap this call in a try/catch, so a throw would have escaped
      // as a raw exception at the user door. `resolveNode` now catches and attributes (packages/tools/src/
      // fault.ts), so the refusal can travel the channel `ToolLeg` already uses and reach EVERY transport
      // with its own discriminant instead of being flattened into "no grounded node at <addr>". The CLI
      // still refuses one frame up with the same reason; this is the backstop for every other caller.
      // TRAVEL-BY-REPROOF: `config.readRefusal` (case 3 / fail-closed), not a blanket `trusted` check. AND —
      // this leg goes AROUND `loadProjection` (see above), which is exactly why `readStore.get` (not plain
      // `store.get`) matters here for `tracked-provable`: `read-access.ts` builds `readStore.get` to answer
      // `undefined` for any content hash that is NOT among the re-proven current nodes' `contentHash`es, so
      // an attacker-committed CAS blob that never re-proves — reachable ONLY through this address-direct
      // leg, never through the filtered projection — is refused here too, not just in `loadProjection`.
      if (config.readRefusal !== undefined) throw new UntrustedStoreError()
      // SECURITY (billy PoC): `nodeAddr` is attacker-controllable over MCP/poke. A CAS content address is
      // EXACTLY 64 lowercase hex; anything else (a `../` traversal to an unbounded file like /dev/zero) is a
      // MISS — rejected BEFORE any filesystem read, so it can never hang/OOM. Defense-in-depth: `store.get`
      // re-applies the same charset + sandbox guard (store.ts). READ-ONLY: no write path (TOOLS-1).
      const addr = String(nodeAddr)
      if (!/^[0-9a-f]{64}$/.test(addr)) return undefined
      return readStore.get(addr as unknown as Hash) as GroundedFact | undefined
    },
  }

  // ONE handler over the five legs + the read-only per-node source — no per-entrypoint copy (WIRE-1).
  return createHandler(legs, nodes)
}
