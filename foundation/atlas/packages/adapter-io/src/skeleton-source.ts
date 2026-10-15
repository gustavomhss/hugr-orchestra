// @atlas/adapter-io — src/skeleton-source.ts  (the PRODUCTION S0 `SkeletonSource`, GEN-1)
//
// The genesis S0 stage is a CONSUMER: `rank.ts` declares `SkeletonSource` and explicitly excludes authoring
// the walk ("@atlas/index owns the concrete walk"). Until now nothing in the ring SATISFIED that port at the
// production door — `packages/cli/src/mine.ts` injected a hand-built `emptySkeleton()`, whose `axes.edges`
// is `[]`, so `structuralSeeds` (rank.ts:321, which reads ONLY `axes.edges`) returned 0 seeds, `rank`
// returned 0 candidates, the controller visited 0 sites and made 0 model calls. Wiring a real proposer
// would still have produced 0 — the absent skeleton, not the absent model, was the operative cause.
//
// This file introduces NO walker, NO SCIP reader and NO ranking. It COMPOSES the four frozen pieces that
// already exist, in the ONE order compose.ts / wire.ts / rev-index.ts already use:
//
//   walkFileTree (fs.ts, ADAPT-FS-1)   →  foldAstUnits (ast.ts)  →  build (@atlas/index, INDEX-3)  →  Axes
//   readScipOrEmpty (scip.ts) ─────────────────────────────────────↗
//   createIndexAdapter (index-adapter.ts) → createInit (@atlas/tools, TOOLS-5) ─────────────────→ Manifest
//
// TOTALITY (the house rule: no throw, fail closed, degrade to empty rather than crash) is INHERITED, not
// re-implemented: `walkFileTree` degrades a non-git / unreadable tree to the empty tracked set (WP-N8),
// `readScipOrEmpty` degrades a MISSING **or corrupt** `.scip` to `{documents: []}` (WP-N4), `build` /
// `createInit` are pure+total, and `createRevIndex.axesAt` fails closed to empty axes on a bad rev. The
// composition therefore has no throwing edge of its own, and a repo with NO SCIP dump still yields a real
// FILE-LEVEL skeleton (spatial + territory axes + the T2 territory manifest) rather than nothing.
//
// HONEST HOLE, stated once: `axes.edges` is derived from SCIP occurrences alone (`deriveEdges`, build.ts:53).
// A repo with no `.atlas/index.scip` has 0 edges, and `structuralSeeds` — which ranks by dep-graph DEGREE —
// therefore yields 0 seeds from a real skeleton just as it did from the empty one. That is an upstream
// property of GEN-15c, NOT something this source may paper over by inventing edges: a fabricated edge would
// be a fabricated structural claim. The operator-visible consequence is that `atlas mine` seeds candidates
// only once the repo has been indexed.

import { join } from "node:path"
import { id } from "@atlas/kernel"
import { build, createResolve, createDepgraph, createSymbolReverse } from "@atlas/index"
import type { Axes, FileTree, ScipOutput } from "@atlas/index"
import { createInit } from "@atlas/tools"
import type { Skeleton, SkeletonSource, UnitPrior, UnitPriorSource } from "@atlas/genesis"
import { walkFileTree } from "./fs.js"
import { foldAstUnitsWithPriors } from "./ast.js"
import { readScipOrEmpty } from "./scip.js"
import { createIndexAdapter } from "./index-adapter.js"
import { createRevIndex } from "./rev-index.js"
import type { RevIndex } from "./rev-index.js"
import { headSha } from "./run-git.js"

/** Where the optional SCIP dump lives under a repo — the SAME location `composeRuntime` reads (compose.ts:49),
 *  so the skeleton genesis mines over and the index the truth-gate re-derives against cannot diverge. */
const SCIP_REL = join(".atlas", "index.scip")

/** The empty structural inputs used when only the already-built `Axes` are available (the non-HEAD rev leg).
 *  They are never folded: the adapter's `build` is overridden with the pre-built axes below. */
const NO_TREE: FileTree = { path: ".", children: [] }
const NO_SCIP: ScipOutput = { documents: [] }

/**
 * The injectable seams (testability only — every one defaults to the real frozen adapter). A test can drive
 * a deterministic skeleton without a git repo or a `.scip` on disk; production passes nothing.
 */
/**
 * The production S0 source: the frozen genesis `SkeletonSource` port PLUS the #182 unit-prior lookup.
 *
 * A SUPERSET, never a replacement — it still IS a `SkeletonSource`, so every existing consumer and every
 * injected test double is unaffected. The extra member rides here rather than on `Skeleton` because
 * `Skeleton`/`IndexNode` are the frozen index data model and carry no `content`: the priors would have had
 * to be recovered by a SECOND whole-repo parse. They ride on the object that already did the first one.
 */
export interface ProductionSkeletonSource extends SkeletonSource {
  readonly unitPrior: UnitPriorSource
}

export interface SkeletonSourceDeps {
  readonly walkFileTree?: (repoPath: string) => FileTree
  readonly readScip?: (scipPath: string) => ScipOutput
  readonly headSha?: (repoPath: string) => string | undefined
  readonly revIndex?: RevIndex
}

/**
 * The T2 territory manifest for an already-built `Axes`.
 *
 * The territory PROJECTION (`{name, owner:'', globs:['<name>/**']}`) belongs to `createIndexAdapter`
 * (index-adapter.ts:45) and the `T2/advisory` move-in tier belongs to `createInit` (init.ts:52-65) — both are
 * CONSUMED here so the skeleton's manifest is byte-identical to what `atlas init` would have moved in, and so
 * a tier above T2 stays structurally unreachable (TOOLS-5c: the raw shape has no `tier` leg to inherit).
 * `blastRadius`/`t0Candidates` are computed by `init` but discarded — `Manifest` carries territories only, so
 * the flag-only T0 heuristic is passed as flag-NOTHING (its whole effect would be `t0Candidates`).
 *
 * `build` is overridden with `() => axes`: `build` is documented deterministic + idempotent (INDEX-3,
 * "rebuild twice ⇒ identical trees"), so handing back the axes already built from the SAME (tree, scip) is
 * byte-identical to letting the adapter rebuild them — it only avoids re-hashing the whole tree twice.
 */
function manifestOf(axes: Axes): Skeleton["manifest"] {
  const index = createIndexAdapter({
    fileTree: NO_TREE,
    scipOutput: NO_SCIP,
    build: () => axes,
    createResolve,
    createDepgraph,
    createSymbolReverse,
    nodeHashOfPath: (p: string) => id({ file: p }),
  })
  // `'.'` — the WHOLE repo, spelled the way the index names it. This used to pass the absolute `repoPath`,
  // which worked only because `territories()` discarded its argument and always returned the top-level
  // territories; now that the path is READ (index-adapter.ts), the argument has to say what was always
  // meant. The index is keyed by repo-RELATIVE paths (`build.ts` keys every node by its tree path), so an
  // absolute path names nothing in it and never could — the manifest is the whole repo's, not a subtree's.
  return { territories: createInit(index, { isCandidate: () => false }).init(".").territories }
}

/** The WORKING-TREE axes: the frozen walk + the optional SCIP dump, folded exactly as `composeRuntime` folds
 *  them (`foldAstUnits` before `build`, so the skeleton carries the same `::` sub-file nodes the truth-gate
 *  re-derives freshness against once `initAst()` has been awaited; a no-op warm-up-free). Total by
 *  inheritance: an unwalkable tree ⇒ empty tracked set, an absent/corrupt dump ⇒ `{documents: []}`. */
function workingTreeAxes(repoPath: string, deps: SkeletonSourceDeps, priors: Map<string, UnitPrior>): Axes {
  const walk = deps.walkFileTree ?? walkFileTree
  const scip = deps.readScip ?? readScipOrEmpty
  // ONE fold, TWO outputs (#182). The `::` units and their ordering priors come from the same parse, so a
  // unit the frontier can seed and a unit the frontier can rank are the same set by construction — there
  // is no second walk to fall out of step with this one, and no re-parse to pay for.
  const folded = foldAstUnitsWithPriors(walk(repoPath))
  // #197 — RESET the instance-global priors to EXACTLY this fold's set before repopulating. The map is
  // path-keyed and instance-lived; without the clear it is `.set()`-only, so a `(repo, rev)` folded EARLIER
  // on the same source leaks its priors at any path THIS fold does not re-state. On the shipped path this is
  // dormant — `atlas mine` builds one source per process for one (repo, HEAD) (mine.ts) — but the cache is a
  // per-fold view, not an accumulator, so a future multi-repo/multi-rev reuser of one instance must read
  // THIS fold's priors, not a stale peer's. UNKNOWN (a path this fold lacks) must read `undefined` so the
  // frontier comparator degrades to address order, never asserts a prior from a DIFFERENT tree.
  priors.clear()
  for (const [path, p] of folded.priors) priors.set(path, p)
  return build(folded.tree, scip(join(repoPath, SCIP_REL)))
}

/**
 * Build the production S0 `SkeletonSource` over a repo path.
 *
 * REV SEMANTICS (GEN-1 "pure function of (repo, rev)" / GEN-8 "a MALFORMED rev yields a partial skeleton,
 * never a throw"):
 *   • `rev` naming HEAD (the literal `'HEAD'`, or a rev that resolves to the HEAD sha) ⇒ the WORKING-TREE
 *     build above, which is the only leg where the `.atlas/index.scip` dump — a working-tree artifact — is
 *     readable, so it is the only leg that can carry dependency edges.
 *   • any OTHER rev ⇒ `createRevIndex(repo).axesAt(rev)`, the frozen memoized arbitrary-rev index
 *     (COMPOSE-C), which checks the rev out into a throwaway worktree and builds `{documents: []}` — a
 *     FILE-LEVEL skeleton with no dep edges (the dump does not exist at a historical rev). Honest hole,
 *     not a hidden failure.
 *   • a MALFORMED / unknown rev ⇒ `axesAt` classifies it as a deterministic git error and returns its
 *     fail-closed EMPTY axes ⇒ a structurally-valid, honestly-empty skeleton. No throw reaches genesis.
 *
 * MEMOIZED per `(repo, rev)`: the controller's `plan` leg calls the skeleton TWICE per pass (`createScan`
 * once and `createMine` once — mine.ts `buildControllerDeps`), and a walk+build of a real repo is the
 * expensive part of an S0 pass. The build is deterministic, so the memo is behaviour-preserving; the cache
 * lives on the source instance (one mine pass), never module-global.
 */
export function createSkeletonSource(repoPath: string, deps: SkeletonSourceDeps = {}): ProductionSkeletonSource {
  const head = deps.headSha ?? headSha
  const memo = new Map<string, Skeleton>()
  // The #182 ordering priors, accumulated by the SAME fold that produces the working-tree axes above. It
  // is a cache, never an oracle: a path it does not hold reads `undefined` = UNKNOWN, and the frontier
  // comparator degrades to address order rather than asserting a prior it does not have. The non-HEAD rev
  // leg genuinely has none (`axesAt` builds from a throwaway worktree, not through this fold) and that is
  // the honest answer for it.
  const priors = new Map<string, UnitPrior>()
  // The arbitrary-rev index is built LAZILY: constructing it is cheap, but the HEAD leg must never pay for
  // a capability it does not use, and a caller that only ever mines HEAD must never touch `git worktree`.
  let rev0: RevIndex | undefined = deps.revIndex
  const revIndex = (): RevIndex => (rev0 ??= createRevIndex(repoPath))

  const axesFor = (repo: string, rev: string): Axes => {
    if (rev === "" || rev === "HEAD") return workingTreeAxes(repo, deps, priors)
    const at = head(repo)
    // `rev` is compared against the resolved HEAD sha, so `atlas mine --rev <headSha>` takes the same
    // (SCIP-bearing) leg as `HEAD` instead of paying for a redundant worktree checkout of HEAD itself.
    if (at !== undefined && rev === at) return workingTreeAxes(repo, deps, priors)
    return revIndex().axesAt(rev)
  }

  return {
    unitPrior: (qualifiedPath: string): UnitPrior | undefined => priors.get(qualifiedPath),
    skeleton(repo: string, rev: string): Skeleton {
      // The memo key joins `repo` and `rev` on NUL — the one byte that can appear in NEITHER a POSIX path
      // NOR a git rev, so the join is injective and no two distinct (repo, rev) pairs can share a cache
      // entry. It is spelled as the ESCAPE `\0`, and it MUST stay spelled that way: written as a literal
      // 0x00 byte (as it was) the whole file reads as "binary" to `git diff` and is INVISIBLE to `grep`,
      // so every grep-derived review or count over this module silently skipped it. Same value, same
      // runtime bytes — `@atlas/index` build.ts `edgeKey` already spells the identical separator this way.
      // NOT `\\0`: that is a two-character backslash-zero, which a repo path can contain, and the join
      // stops being injective the moment it can (`skeleton-memo-key.test.ts` pins exactly that collision).
      const key = `${repo}\0${rev}`
      const hit = memo.get(key)
      if (hit !== undefined) return hit
      const axes = axesFor(repo, rev)
      // `canonicalizeSkeleton` (rank.ts) is applied by the genesis side (`createScan` / `createMine`) on
      // everything this port returns, so sorting is NOT duplicated here — this source is the structural
      // producer, canonicalisation is the consumer's law.
      const sk: Skeleton = { axes, manifest: manifestOf(axes) }
      memo.set(key, sk)
      return sk
    },
  }
}

// differential-vs-oracle (compile-time): the factory's return conforms to the frozen genesis `SkeletonSource`
// port — an S0 seam that stopped satisfying `skeleton(repo, rev): Skeleton` would fail the build here.
const _conforms: (repo: string) => SkeletonSource = createSkeletonSource
void _conforms
