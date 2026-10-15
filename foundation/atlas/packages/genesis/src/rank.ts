// @atlas/genesis — src/rank.ts  (WP-8.27.GEN · GEN-1 / GEN-3 / GEN-10 / GEN-11 / GEN-15 — the S0/S1 stage)
//
// The deterministic `$0`-LLM genesis floor: S0 the structural SKELETON and S1 the reproducible PPR RANKING
// (personalized PageRank over the def→ref graph, PINNED damping, integer fixed-point ⇒ byte-identical), with
// a cheap history pre-check that degrades thin/degenerate history back to STRUCTURAL centrality (GEN-15).
// Co-locates the frozen S1 surfaces `HistoryProbe`/`MineApi` (was ref/mine.ts) + `RankApi` (was ref/rank.ts).

import type { StructRef } from "@atlas/contracts"
import type { Axes, IndexNode, Manifest } from "@atlas/index"
import { cmp, compareSiteOrder, correspondence, resolveSiteKey, siteOrderKeys, structuralFrontier } from "./seeds.js"
import type { FrontierOptions, SiteOrderKey } from "./seeds.js"
import type { Candidate, CostReport, MinedSignals, ScanApi, Skeleton } from "./types.js"

/**
 * The GEN-15 history-thin pre-check result. History is high-signal but degenerates SILENTLY on the repos
 * where it is weakest — young/greenfield, squashed / shallow-cloned history (kills `git blame` → SZZ +
 * co-change collapse), and initial-commit monorepo imports / vendored / generated code (blame resets to
 * one mega-commit). A cheap pre-check MUST detect this and fall the personalization vector back to
 * STRUCTURAL signals (PPR without history seeding + type/API-surface density) — history is a ranking
 * BOOSTER, never a dependency. GENESIS-HOME.
 *
 * [PINNED — oracle-pin-map §genesis, GEN-15] the carrier is `thin` (the boolean verdict) + an optional
 * `reason` drawn from GEN-15's three named triggers: `low-commit-count` (young/greenfield),
 * `shallow-clone` (squashed / shallow history kills blame → SZZ + co-change collapse), and
 * `blame-concentrated` (initial-commit monorepo import / vendored / generated). No fields beyond this.
 */
export interface HistoryProbe {
  readonly thin: boolean // degenerate history detected → fall back to structural centrality
  readonly reason?: "low-commit-count" | "shallow-clone" | "blame-concentrated"
}

export interface MineApi {
  /** S1 mining (GEN-6). MECHANICAL `$0`-LLM pure function of (repo, rev) that returns RANKED CANDIDATES,
   *  NEVER facts — SZZ (bug-introducing commits) + hotspots (change-freq × complexity) + temporal/logical
   *  coupling + ownership feed the candidate `signals`/`rank` ONLY. A signal is NOT a fact until grounded
   *  and ratified (GEN-6). The PPR ranking that fills `ppr`/`rank` is `RankApi` (GEN-11).
   *
   *  [FLAG — arg types] the surface `mine(repo, rev)` (atlas-genesis:187) leaves both untyped; transcribed
   *  as `string` / `string` (a repo path + a free-form git rev), mirroring `scan`. */
  mine(repo: string, rev: string): readonly Candidate[]

  /** GEN-15 history-thin pre-check. A cheap MECHANICAL probe (commit count below threshold / shallow
   *  clone / blame concentrated in one commit) that detects degenerate history so `mine`'s personalization
   *  vector falls back to structural + type/API-surface density — never rank noise. History is a booster,
   *  never a dependency. */
  probeHistory(repo: string, rev: string): HistoryProbe
}

export interface RankApi {
  /** DETERMINISTIC personalized-PageRank ranking (GEN-11). Pure function of the def→ref graph (carried by
   *  the S0 `Skeleton`'s dependency axis) + the personalization vector (the union of the hotspot / SZZ /
   *  coupling frontier SITES). Returns the ranked `Candidate[]` with `ppr`/`rank` filled — a stable total
   *  order (numeric ties broken deterministically), byte-identical across runs. NEVER facts (GEN-6).
   *
   *  [FLAG — arg carriers] the surface folds ranking INTO `mine` (no standalone `rank(...)` line), so the
   *  arg carriers are reference-attributed, NOT frozen literals: `graph` transcribed as the S0 `Skeleton`
   *  (which carries the def→ref dependency axis); `personalization` as the frontier `StructRef[]` (the
   *  "union of the hotspot / SZZ / coupling frontiers", atlas-genesis:58). On a GEN-15 history-thin repo
   *  the personalization vector is the STRUCTURAL + type/API-surface set instead (same signature). */
  rank(graph: Skeleton, personalization: readonly StructRef[]): readonly Candidate[]
}

// ── PINNED determinism constants (GEN-11) ────────────────────────────────────────────────────────────
// The personalized-PageRank damping is PINNED (atlas-genesis:142, golden `damping 0.85`); re-running with
// the same pins on the same rev ⇒ an identical ranking. Ranking carries NO RNG seed — a personalized
// PageRank is seedless-deterministic; the "seed" of GEN-11 is the pinned teleport vector, not an RNG. The
// power iteration runs a PINNED, fixed number of rounds and is evaluated in INTEGER fixed-point.
/** The damping ratio — the SINGLE declaration, an exact integer pair because the power iteration is
 *  evaluated in fixed-point (byte-identical across machines). It was previously declared twice, and the
 *  second copy guarded nothing: see ADR-0011 and `test/ppr-damping-teeth.test.ts`, which pins the ranking
 *  OUTPUT rather than the constant. */
export const DAMPING_NUM = 85n
export const DAMPING_DEN = 100n

/** The canonical PageRank damping (Brin & Page 1998), **derived** from the ratio above — never an
 *  independent literal. Exported because `pinned(damping=0.85, seed)` speaks in decimals. */
export const DAMPING = Number(DAMPING_NUM) / Number(DAMPING_DEN)
export const PPR_ITERATIONS = 64 as const

const FP = 1_000_000_000n // fixed-point scale (1e9) — integer arithmetic ⇒ byte-identical across machines

// ── GEN-15 history-thin pre-check thresholds (PINNED) ────────────────────────────────────────────────
export const MIN_COMMITS = 2 as const // below ⇒ young/greenfield → low-commit-count
export const BLAME_CONCENTRATION_MAX = 0.9 as const // ≥ ⇒ one squash/mega-commit → blame-concentrated

// ── GEN-10 stage → named deterministic mechanism registry ────────────────────────────────────────────
// Every stage binds to a NAMED, deterministic structural mechanism from the admissible set — none is an
// unnamed "smart scorer" (SCN-GEN-10a-1). There is NO embedding / vector store / ANN anywhere (A-14).
export const MECHANISMS = {
  scan: ["tree-sitter", "SCIP", "stack-graphs"],
  mine: ["SZZ", "hotspots", "temporal-coupling", "ownership"],
  rank: ["personalized-PageRank"],
} as const

const ZERO_SIGNALS: MinedSignals = { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] }

// ── injected seams (consumed, never authored here) ───────────────────────────────────────────────────

/**
 * The S0 skeleton source — the sealed atlas-init / @atlas/index structural walk (TOOLS-5, frozen upstream).
 * `$0`-LLM: it walks the tree STRUCTURALLY and returns the axes + T2/advisory manifest. This facet CONSUMES
 * it (card exclusion: "does not author the atlas-init skeleton") and canonicalises the result; @atlas/index
 * owns the concrete walk.
 */
export interface SkeletonSource {
  skeleton(repo: string, rev: string): Skeleton
}

/**
 * The S1 mining source — the cheap MECHANICAL history signals (SZZ / hotspots / temporal-coupling /
 * ownership) and the GEN-15 pre-check facts. Every member is a `$0`-LLM structural probe; a signal is a
 * RANKING heuristic only (GEN-6). `frontier` is the personalization vector (empty on a history-thin repo).
 */
export interface HistorySource {
  commitCount(repo: string, rev: string): number
  shallow(repo: string, rev: string): boolean
  blameConcentration(repo: string, rev: string): number // fraction of blame in the single top commit
  frontier(repo: string, rev: string): readonly StructRef[] // the mined hotspot/SZZ/coupling sites
  signals(site: StructRef): MinedSignals // the mined ranking heuristics for a site (GEN-6)
}

/** The seams the S1 `mine` driver composes (both consumed), plus one OPTIONAL diagnostic observer. */
export interface MineDeps {
  readonly skeleton: SkeletonSource
  readonly history: HistorySource
  /** Called once per pass that fell back to the STRUCTURAL frontier, with the number of dep-graph nodes
   *  dropped for having no path (`StructuralFrontier.droppedNoPath`). NOT a seam — the driver never reads a
   *  value back from it; it exists because a bounded set that is silently truncated reads as "we covered
   *  everything" (#130), and `MineApi.mine` is frozen at `readonly Candidate[]` with nowhere to carry it. */
  readonly onSeedsDropped?: (dropped: number) => void
  /** How wide the STRUCTURAL fallback frontier is cut (#182). **Omitted ⇒ FILE SITES ONLY** — the frontier
   *  master ships, byte for byte. Sub-file seeding is OPT-IN at every layer (`{ subFile: true }` here,
   *  `ATLAS_FRONTIER=symbol` at the CLI), because the hypothesis it tests is not established and a
   *  behaviour that may be reverted must not be what every unrelated caller silently gets meanwhile.
   *  THE DEFAULT IS DECLARED IN EXACTLY ONE PLACE — `FrontierOptions` in `seeds.ts` — and this sentence is
   *  a pointer to it, not a second copy of it: the previous wording here said the opposite of the code it
   *  documents, which is the failure class this whole wave exists to close. */
  readonly frontier?: FrontierOptions
}

// ── S0 — the structural skeleton (GEN-1) ─────────────────────────────────────────────────────────────

/** Canonicalise an axis node: children sorted by key, objects sorted — recursively. This is where the
 *  GEN-1 byte-identity is EARNED: the walk's order (mtime, hash-map iteration) is discarded for a stable
 *  structural order, so a re-run reproduces a byte-identical skeleton (SCN-GEN-1b-1).
 *
 *  IT REBUILDS THE RECORD FIELD BY FIELD, which is why the #182 ordering priors are NOT carried on the
 *  node: a field added upstream and forgotten here is silently erased between the producer and the
 *  frontier, and `structuralFrontier` runs on exactly this canonicalised skeleton. The priors ride an
 *  explicit injected seam instead (`MineDeps.frontier.prior`), where an absent supplier is VISIBLE. */
function canonNode(n: IndexNode): IndexNode {
  return {
    axis: n.axis,
    level: n.level,
    key: n.key,
    subtreeHash: n.subtreeHash,
    children: n.children.map(canonNode).sort((a, b) => cmp(a.key, b.key)),
    objects: [...n.objects].sort(),
  }
}

/** Canonicalise the whole skeleton — sorted axes, sorted edges, sorted territories. Deterministic ⇒ two
 *  runs on the same rev are byte-identical (GEN-1).
 *
 *  [PERF, waste-audit 2026-08-23] MEMOIZED by INPUT-skeleton object identity: the controller's `plan` leg
 *  canonicalises TWICE per pass — once in `createScan.scan`, once in `createMine`'s `mine()` — and
 *  `createSkeletonSource` hands back the SAME raw `Skeleton` object per `(repo,rev)`, so the deep-sort collapses
 *  from 6 walks/run (×3 arms) to one per raw skeleton. Pure ⇒ the shared result is byte-identical; the
 *  `WeakMap` releases with the raw skeleton, adding no lifetime. */
const canonCache = new WeakMap<Skeleton, Skeleton>()
export function canonicalizeSkeleton(sk: Skeleton): Skeleton {
  const memo = canonCache.get(sk)
  if (memo !== undefined) return memo
  const canon = buildCanonicalSkeleton(sk)
  canonCache.set(sk, canon)
  return canon
}

function buildCanonicalSkeleton(sk: Skeleton): Skeleton {
  const axes: Axes = {
    spatial: canonNode(sk.axes.spatial),
    territory: canonNode(sk.axes.territory),
    dependency: canonNode(sk.axes.dependency),
    edges: [...sk.axes.edges].sort((a, b) => cmp(a.from, b.from) || cmp(a.to ?? "", b.to ?? "") || cmp(a.kind, b.kind)),
  }
  const manifest: Manifest = {
    territories: [...sk.manifest.territories].sort((a, b) => cmp(a.name, b.name)),
  }
  return { axes, manifest }
}

/** Build `scan` over the injected structural source (ScanApi). Pure + total, `$0`-LLM: no model, clock, or
 *  IO — the output is a canonical structural function of the seam. */
export function createScan(src: SkeletonSource): ScanApi {
  return { scan: (repo: string, rev: string): Skeleton => canonicalizeSkeleton(src.skeleton(repo, rev)) }
}

// ── S1 — the reproducible personalized-PageRank ranking (GEN-11) ─────────────────────────────────────

/** The def→ref adjacency of the skeleton — node identity (`IndexNode.key` = the `DepEdge` endpoint space)
 *  → its out-edge targets. `personalizationKeys` are frontier sites ALREADY RESOLVED to node identity (via
 *  the subtreeHash↔key correspondence) — they join the graph in the SAME identity space as the edges. */
function adjacency(
  graph: Skeleton,
  personalizationKeys: readonly string[],
): {
  readonly nodes: readonly string[]
  readonly out: ReadonlyMap<string, readonly string[]>
} {
  const nodes = new Set<string>()
  const out = new Map<string, string[]>()
  for (const e of graph.axes.edges) {
    nodes.add(e.from)
    if (e.to !== null) {
      nodes.add(e.to)
      const list = out.get(e.from)
      if (list) list.push(e.to)
      else out.set(e.from, [e.to])
    }
  }
  for (const k of personalizationKeys) nodes.add(k)
  return { nodes: [...nodes].sort(), out }
}

/** Personalized PageRank in INTEGER fixed-point (exact on every machine — no IEEE drift). Teleports to the
 *  personalization set; dangling mass is redistributed to that set; a PINNED round count. Returns each
 *  node's fixed-point score. */
function pprScores(
  nodes: readonly string[],
  out: ReadonlyMap<string, readonly string[]>,
  pers: ReadonlySet<string>,
): ReadonlyMap<string, bigint> {
  const n = BigInt(nodes.length || 1)
  const p = BigInt(pers.size || 0)
  const teleDen = p > 0n ? p : n // teleport target count (fall back to uniform if no personalization)
  const teleVal = FP / teleDen // per-target teleport mass
  let score = new Map<string, bigint>()
  for (const node of nodes) score.set(node, FP / n)

  for (let it = 0; it < PPR_ITERATIONS; it += 1) {
    const inflow = new Map<string, bigint>()
    let dangling = 0n
    for (const node of nodes) {
      const s = score.get(node) ?? 0n
      const targets = out.get(node)
      if (!targets || targets.length === 0) {
        dangling += s
        continue
      }
      const share = s / BigInt(targets.length) // integer division — deterministic
      for (const t of targets) inflow.set(t, (inflow.get(t) ?? 0n) + share)
    }
    const danglingShare = teleDen > 0n ? dangling / teleDen : 0n
    const next = new Map<string, bigint>()
    for (const node of nodes) {
      const isPers = pers.size === 0 || pers.has(node)
      const teleport = isPers ? teleVal : 0n
      const extra = isPers ? danglingShare : 0n
      const inV = inflow.get(node) ?? 0n
      const base = ((DAMPING_DEN - DAMPING_NUM) * teleport) / DAMPING_DEN
      const walk = (DAMPING_NUM * (inV + extra)) / DAMPING_DEN
      next.set(node, base + walk)
    }
    score = next
  }
  return score
}

/**
 * Order personalization sites by fixed-point PPR score DESCENDING, breaking numeric ties by
 * `compareSiteOrder` (seeds.ts) — a stable total order (GEN-11).
 *
 * THE TIE-BREAK IS NO LONGER "the site's subtreeHash ascending", AND THAT SENTENCE IS NOT A DOWNGRADE.
 * For two FILE sites `compareSiteOrder` REDUCES to exactly `cmp(subtreeHash)`, so a file-only frontier
 * ranks byte-identically to master — pinned by `unit-frontier.test.ts` and measured in a subprocess against
 * the built binary. What changed is that sub-file sites (#182) have no PPR of their own and therefore ALL
 * tie with their parent file: a hash would then be deciding which 200 of 5803 candidates get a model call.
 * MEASURED on this repository BEFORE the refinement: 40 of the 200 sites inside the shipped budget window
 * were already being ordered by that hash, so this is not a hypothetical branch.
 */
function orderByPpr(
  a: readonly [StructRef, bigint, SiteOrderKey],
  b: readonly [StructRef, bigint, SiteOrderKey],
): number {
  if (a[1] !== b[1]) return a[1] > b[1] ? -1 : 1
  return compareSiteOrder(a[2], b[2])
}

/**
 * DETERMINISTIC personalized-PageRank ranking (GEN-11). Pure function of the S0 skeleton's def→ref graph +
 * the personalization frontier. Returns the ranked `Candidate[]` (one per personalization site) with a
 * stable total order — byte-identical across runs and machines. Carries NO model, NO randomness, NO clock.
 * `ppr` is the fixed-point score divided by the scale (a deterministic float); `signals` is the zero record
 * here — the S1 `mine` driver attaches the mined heuristics (GEN-6). NEVER a fact.
 */
export function rank(
  graph: Skeleton,
  personalization: readonly StructRef[],
  opts: FrontierOptions = {},
): readonly Candidate[] {
  // BIND: resolve each frontier site's CONTENT subtreeHash to its NODE-IDENTITY key BEFORE the PPR join,
  // so a mined site connects to the dep-graph on the real index (not a disconnected island — F1). The two
  // legs are bridged through the index correspondence, never compared as raw brand-mismatched strings.
  const { keyOfSubtree } = correspondence(graph)
  // The dependency-axis endpoint set — the ONLY keys that can carry a PPR score. It is what tells
  // `resolveSiteKey` whether a site has a vertex of its own or must inherit its file's (#182): a sub-file
  // unit never does, because `deriveEdges` keys both endpoints by document.
  const depNodes = new Set<string>()
  for (const e of graph.axes.edges) {
    depNodes.add(e.from)
    if (e.to !== null) depNodes.add(e.to)
  }
  const inGraph = (k: string): boolean => depNodes.has(k)
  const siteKey = (s: StructRef): string => resolveSiteKey(keyOfSubtree, s, inGraph)
  const { nodes, out } = adjacency(graph, personalization.map(siteKey))
  const pers = new Set<string>(personalization.map(siteKey))
  const scores = pprScores(nodes, out, pers)
  const orderKeys = siteOrderKeys(graph, personalization, opts.prior)
  const scored = personalization.map((site, i): readonly [StructRef, bigint, SiteOrderKey] => [
    site,
    scores.get(siteKey(site)) ?? 0n,
    orderKeys[i]!,
  ])
  const ordered = [...scored].sort(orderByPpr)
  return ordered.map(([site, s], i) => ({
    site,
    signals: ZERO_SIGNALS,
    ppr: Number(s) / Number(FP),
    rank: i + 1,
  }))
}

/** Bind the ranker to the frozen `RankApi` (above). */
export function makeRank(): RankApi {
  return { rank }
}

// ── GEN-15 — history-thin fallback to structural centrality ──────────────────────────────────────────

/** The cheap MECHANICAL history pre-check (GEN-15): commit count below threshold, shallow clone, or blame
 *  concentrated in one commit ⇒ degenerate history, fall the personalization vector back to structure. */
export function probeHistory(history: HistorySource, repo: string, rev: string): HistoryProbe {
  if (history.commitCount(repo, rev) < MIN_COMMITS) return { thin: true, reason: "low-commit-count" }
  if (history.shallow(repo, rev)) return { thin: true, reason: "shallow-clone" }
  if (history.blameConcentration(repo, rev) >= BLAME_CONCENTRATION_MAX)
    return { thin: true, reason: "blame-concentrated" }
  return { thin: false }
}

/** The GEN-15c structural frontier + its drop count (src/seeds.ts) — RE-EXPORTED so the package surface is
 *  unchanged by the file split: `structuralSeeds` is imported from here by tests and by adapter-io. */
export {
  structuralSeeds,
  structuralFrontier,
  filePartOf,
  isUnitSite,
  compareSiteOrder,
  siteOrderKeys,
} from "./seeds.js"
export type { StructuralFrontier, FrontierOptions, SiteOrderKey, UnitPrior, UnitPriorSource } from "./seeds.js"

// ── S1 — the `mine` driver: rank the frontier, attach signals, degrade thin history (GEN-6 / GEN-15) ──

/**
 * Build `mine` over the injected seams (MineApi). MECHANICAL `$0`-LLM: probes history, chooses the
 * personalization vector (mined frontier, or STRUCTURAL centrality when history is thin/empty — GEN-15b),
 * ranks it via the PPR law, and attaches the mined signals (GEN-6 — a ranking heuristic only, NEVER a
 * fact). History is a booster, never a dependency: an empty frontier still yields a structural ranking.
 */
export function createMine(deps: MineDeps): MineApi {
  const mine = (repo: string, rev: string): readonly Candidate[] => {
    const sk = canonicalizeSkeleton(deps.skeleton.skeleton(repo, rev))
    const probe = probeHistory(deps.history, repo, rev)
    const mined = probe.thin ? [] : deps.history.frontier(repo, rev)
    // GEN-15b booster-not-dependency: thin history OR an empty mined frontier ⇒ the structural fallback.
    // Computed ONCE (it used to be built twice, and the second build would re-fire the drop observer).
    const structural = mined.length === 0
    const fallback = structural ? structuralFrontier(sk, deps.frontier ?? {}) : undefined
    if (fallback !== undefined && fallback.droppedNoPath > 0) deps.onSeedsDropped?.(fallback.droppedNoPath)
    const personalization = fallback?.seeds ?? mined
    // The SAME `frontier` options the fallback was cut with are handed to `rank`: the seam that decides
    // which units exist and the seam that orders them must never be two different suppliers.
    const ranked = rank(sk, personalization, deps.frontier ?? {})
    // [PROVABLE-FRONTIER] STABLE-PARTITION the PPR-ranked frontier so provable sites come first — a metered
    // sound-arm run's top-PPR sites are dependency SINKS/barrels the oracle cannot prove, so a budget-capped
    // run spent its whole budget on unprovable sites. `provableFirst` is a PURE predicate (the CLI derives it
    // from the SAME reader that feeds the sound arm's candidate list). ABSENT ⇒ `ranked` is UNTOUCHED, so the
    // advisory arm and every existing caller stay byte-identical. It is a stable PARTITION, never a re-sort:
    // the PPR/rank order is preserved WITHIN each group (a total, deterministic transform), then `rank` is
    // re-numbered 1..N so the coverage ledger and the budget cap see the reordered frontier.
    // COUPLING (bobby cold-review): this reorder is honored ONLY because whole-frontier ordering flows through
    // `rank` here → `drive.ts` sorts by `rank` (rank-primary). `runExtract`/`extract.ts` sorts `byPprDescending`
    // (ppr-primary) and WOULD undo this — it is inert only because the mine path calls it with a SINGLE-site
    // array (`mine.ts` `runExtract([cand], …)`). Routing a multi-site array through `runExtract` would silently
    // drop the provable-first order; re-establish it here (or at that call site) if that ever changes.
    const provableFirst = deps.frontier?.provableFirst
    const ordered =
      provableFirst === undefined
        ? ranked
        : [...ranked.filter((c) => provableFirst(c.site)), ...ranked.filter((c) => !provableFirst(c.site))].map(
            (c, i) => ({ ...c, rank: i + 1 }),
          )
    return ordered.map((c) => ({
      ...c,
      signals: structural ? ZERO_SIGNALS : deps.history.signals(c.site),
    }))
  }
  return {
    mine,
    probeHistory: (repo: string, rev: string): HistoryProbe => probeHistory(deps.history, repo, rev),
  }
}

// ── GEN-3 — cost tracks the frontier, never the file/line count ──────────────────────────────────────

/** The GEN-3 cost oracle: the budget the S0/S1 frontier hands S2 is the RANKED SITE COUNT — a function of
 *  the PPR frontier, INVARIANT to file/line count. Adding un-churned code never enters the frontier. */
export function frontierBudget(cands: readonly Candidate[]): number {
  return cands.length
}

/** The S0/S1 per-stage cost (GEN-1 / GEN-13): both structural stages spend ZERO LLM calls — S2 is the sole
 *  LLM entry (GEN-2). No model call site is reachable from this facet. */
export function s0s1Cost(): CostReport {
  return [
    { stage: "S0", llmCalls: 0 },
    { stage: "S1", llmCalls: 0 },
  ]
}

// differential-vs-oracle (compile-time): the impls conform to the frozen Scan/Mine/Rank surfaces. The
// $0-LLM S0/S1 skeleton+ranking is DISTINCT from the atlas-init governance shaping (WP-8.27.TOOLS).
const _scanConforms: (s: SkeletonSource) => ScanApi = createScan
const _mineConforms: (d: MineDeps) => MineApi = createMine
const _rankConforms: RankApi = makeRank()
void _scanConforms
void _mineConforms
void _rankConforms
