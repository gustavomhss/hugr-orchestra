// @atlas/adapter-io — src/rev-index.ts  (COMPOSE-C: the arbitrary-rev code index)
//
// The standalone capability `atlas-reconcile` needs to detect REAL drift: build the code-index `Axes` at
// an ARBITRARY git rev (not just HEAD). A rev is immutable, so the built `Axes` is MEMOIZED by rev — one
// checkout per rev, reused by every repeated call + concurrent reconcile. Each build runs in a TEMPORARY
// detached git worktree that is torn down immediately (the cache holds the `Axes`, never the worktree), so
// the target repo is always left pristine. Every method is TOTAL + deterministic: a bad/unknown rev, a
// checkout failure, or an absent path yields `undefined`/`false`/an empty snapshot — NEVER a throw; no
// clock, no random (the temp-path counter is pid-scoped, off the identity path). Wiring into the
// composition root is a SEPARATE step (this file exports the capability only).
//
// All git I/O flows through one seam (`execFileSync` — NO shell), mirroring git-history.ts. `build`,
// `walkFileTree`, `foldAstUnits`, and `driftDetect` are the FROZEN ingredients — consumed, never
// reimplemented. `foldAstUnits` is applied BEFORE `build` — the SAME TREE transform composeRuntime /
// assembleHandler apply at compose time — so the arbitrary-rev index carries the very `::` sub-file symbol
// nodes a grounded fact is authored against; otherwise a symbol/file anchor's recorded (folded)
// `subtreeHash` could never re-derive at a rev, and the drift oracle would diverge from the index the
// truth-gate accepted the fact on. It is warmup-gated (a no-op until `initAst()` is awaited — the entrypoint
// bins do this once), so a caller that never warms the grammar sees the identical file/dir-only snapshot.
//
// ── WHAT IS *NOT* SHARED WITH THE COMPOSE PATH, AND WHY IT CANNOT MOVE AN ANSWER HERE ────────────────────
// `build` takes TWO inputs and only the TREE one is shared. compose.ts passes `readScipOrEmpty(scipPath)`;
// every `build` in this file passes a hardcoded `{ documents: [] }` — this module never reads a `.scip` at
// the rev it checks out. That is a real asymmetry and it used to be papered over by the sentence above, so
// it is stated here with the measurement rather than left for a reader to assume parity.
//
// MEASURED (`test/rev-index-scip-parity.test.ts`, over one folded tree built both ways): the `spatial` and
// `territory` axes come back BYTE-IDENTICAL — SCIP occurrences feed `deriveEdges` and the `dependency` axis
// ALONE (@atlas/index src/build.ts), and the two content-committing hierarchies are a pure function of the
// file tree. Only `dependency` differs (its root re-keys and it gains one hash-keyed leaf per participating
// document). The consequence for each of this module's three readers:
//   - `reDerives`          → `driftDetect`, which resolves over `spatial`/`territory` ONLY and deliberately
//                            refuses the dependency axis (grounding/src/drift.ts). Provably unaffected.
//   - `resolveAnchorAt`    → scans the dependency axis too, but its leaves are keyed by `id({file: p})` —
//                            64 hex — so no path-shaped `qualifiedPath` can match one, in either build.
//   - `resolveBySubtreeAt` → same: a dependency leaf's `subtreeHash` IS its own key (an identity, not a
//                            content fold), a value no grounded anchor's `subtreeHash` inhabits.
// So the empty-SCIP build is not a blind drift oracle; it is a narrower one in a region no anchor reaches.
// Reading the rev's own `.scip` would still be the more honest build, and is a deliberate non-change here:
// it is a behaviour change to the reconcile/doctor classifier, not a comment fix, and it belongs to whoever
// owns that classifier. What this header must not do is claim a parity the code does not have.

import { mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Axes, IndexNode } from "@atlas/index"
import { driftDetect } from "@atlas/grounding"
import type { Hash, StructRef } from "@atlas/contracts"
import type { GroundedFact } from "@atlas/knowledge"
import { walkFileTree } from "./fs.js"
import { deriveGroundingAxes } from "./grounding-computer.js"
import { runGit as gitExec, isDeterministicGitError, gitYieldMs, GIT_BACKOFF_MS, GIT_MAX_ATTEMPTS } from "./run-git.js"

/** The arbitrary-rev code-index capability. `axesAt` builds (once, memoized) the index at a rev; the two
 *  derived readers ride on it — `resolveAnchorAt` re-derives a grounding anchor's `StructRef` at that rev,
 *  and `reDerives` is the drift oracle `driftDetect` evaluated against that rev's snapshot. */
export interface RevIndex {
  /** The built `Axes` at `rev` (via a temp detached worktree), memoized — a rev is immutable so it is
   *  built at most once. A bad/unknown rev or checkout failure returns an empty snapshot, never throws. */
  axesAt(rev: string): Axes
  /** The `StructRef` for `qp` in `axesAt(rev)` (kind/qualifiedPath/subtreeHash), or `undefined` if `qp`
   *  is not a structural unit in that rev's tree. Mirrors grounding's `resolveCurrent` (drift.ts): a node
   *  is keyed by `IndexNode.key` (= the FileTree path). Total: never throws. */
  resolveAnchorAt(rev: string, qp: string): StructRef | undefined
  /** The `StructRef` of the UNIQUE unit in `axesAt(rev)` whose `subtreeHash` equals `subtreeHash` — the
   *  re-derivability oracle keyed on the drift oracle (`subtreeHash`, GROUND-1), NOT on the anchor's
   *  `qualifiedPath`. A moved anchor whose content survives at a NEW path re-derives here (⇒ mechanical,
   *  re-groundable to that path); content that genuinely changed/vanished does not (⇒ semantic).
   *
   *  `undefined` in THREE cases, all meaning "not mechanically re-groundable": the content resolves
   *  NOWHERE in the rev; the content resolves at ≥2 distinct paths, which is genuine AMBIGUITY and is
   *  refused rather than guessed (see the implementation note); or the rev's checkout FAILED, in which case
   *  there is no snapshot to answer from. Total: never throws. */
  resolveBySubtreeAt(rev: string, subtreeHash: string): StructRef | undefined
  /** Does `fact`'s grounding still hold at `newSha` — `driftDetect(fact.grounding, axesAt(newSha))` is
   *  `FRESH`. `false` on any drift, an absent unit, or a bad `newSha` (fail-closed, never throws). */
  reDerives(fact: GroundedFact, newSha: Hash): boolean
}

/**
 * Optional dependency seam (testability). The frozen surface is `createRevIndex(repoPath): RevIndex`; this
 * second param is OPTIONAL with a default, so single-arg callers are unaffected (the same arity-widening
 * precedent as git-history.ts). `runGit` is the repo-scoped git runner used for the worktree lifecycle —
 * injected only so a test can COUNT checkouts (memo golden). `walkFileTree`'s own internal git (run inside
 * the temp worktree) is NOT routed through here — it is a frozen dependency, consumed as-is.
 */
export interface RevIndexDeps {
  readonly runGit?: (repo: string, args: readonly string[]) => string
}

/** The deterministic empty snapshot returned on any checkout/build failure (fail-closed totality). Built
 *  once from an empty tree — `build` is deterministic, so this is a stable, side-effect-free sentinel: no
 *  real file-path anchor resolves in it, so `driftDetect` against it is DRIFTED (⇒ `reDerives` false). */
const EMPTY_AXES: Axes = deriveGroundingAxes({ path: ".", children: [] }, { documents: [] }).axes

/** Resolve the `IndexNode` whose key is `qp`, across the three axes — the SAME traversal grounding's
 *  `resolveCurrent`/`findByKey` (drift.ts) uses, so `resolveAnchorAt` and `reDerives` agree by construction.
 *  Total: an absent unit returns `undefined`, never a throw. */
function findNode(node: IndexNode, key: string): IndexNode | undefined {
  if (node.key === key) return node
  for (const child of node.children) {
    const hit = findNode(child, key)
    if (hit !== undefined) return hit
  }
  return undefined
}

/** Collect EVERY node in `node`'s subtree whose `subtreeHash` equals `hash`, keyed by `qualifiedPath` —
 *  the content-addressed dual of `findNode` (keys on the drift oracle, not the path). Total.
 *
 *  Keyed by PATH, not by node hit, and that is load-bearing: `build` emits the spatial and territory axes
 *  over the SAME tree, so every file matches at least TWICE across axes. Counting raw hits would make every
 *  content look ambiguous and would disable the mechanical arm entirely; distinct paths is the real arity. */
function collectBySubtree(node: IndexNode, hash: string, into: Map<string, IndexNode>): void {
  if (String(node.subtreeHash) === hash && !into.has(node.key)) into.set(node.key, node)
  for (const child of node.children) collectBySubtree(child, hash, into)
}

/** Classify a resolved node into a `StructRef.kind`. The build's `IndexNode.level` is DEPTH-based
 *  (repo→crate→module→file→…), so it is NOT a reliable `kind` source; the structural shape is. The root is
 *  the `repo`; a leaf spatial/territory node is a `file`; any interior unit is a `block`. `kind` is NEVER
 *  the drift oracle (that is `subtreeHash` alone, GROUND-1) — it is descriptive metadata only. */
function kindOf(node: IndexNode): StructRef["kind"] {
  if (node.key === ".") return "repo"
  return node.children.length === 0 ? "file" : "block"
}

/**
 * Construct the arbitrary-rev code-index capability over `repoPath` (COMPOSE-C).
 *
 * `axesAt(rev)` checks the rev out into a throwaway detached worktree under the OS temp dir, runs the ONE
 * grounding derivation over that rev's `walkFileTree` (`deriveGroundingAxes`, grounding-computer.ts — the
 * SAME fold→build the HEAD gate + `anchors` planner use, AUTHOR-1), then tears the worktree down — memoizing the
 * resulting `Axes` by rev (build-once for an immutable rev). Every temp worktree is removed on BOTH the
 * happy and error paths (`attemptBuild`'s `finally`: `worktree remove --force` + `rmSync`), so the target
 * repo is left pristine. A checkout that FAILS is CLASSIFIED (rev-index.ts): a deterministic bad rev is
 * genuine-empty at once, while a transient `git worktree` lock is retried a bounded number of times — so
 * concurrent-reconcile contention can no longer masquerade as a genuinely-empty rev (finding #73).
 */
export function createRevIndex(repoPath: string, deps: RevIndexDeps = {}): RevIndex {
  const runGit = deps.runGit ?? gitExec
  const cache = new Map<string, Axes>()
  /** Revs whose checkout FAILED, so `axesAt` served the `EMPTY_AXES` sentinel rather than that rev's real
   *  tree. Tracked because the sentinel is a genuine built snapshot of an empty tree and is therefore
   *  INDISTINGUISHABLE BY VALUE from a rev that honestly has one — the readers must key on PROVENANCE. */
  const unresolved = new Set<string>()
  const base = join(tmpdir(), "atlas-revcache")
  let seq = 0

  /** A fresh, non-pre-existing worktree path (git creates the leaf dir; a colliding leaf would make
   *  `worktree add` fail). Pid-scoped + a monotonic counter — deterministic per process, off the identity
   *  path (it never enters the built `Axes`). */
  const nextDir = (): string => join(base, `${process.pid}-${seq++}`)

  /** One checkout+build attempt in a FRESH throwaway worktree, torn down per-attempt (so a half-created
   *  worktree from a failed attempt can never wedge the next). Returns the built `Axes` on success; RE-THROWS
   *  the git/build error to the retry loop, which classifies it. The teardown is `worktree remove` + `rmSync`
   *  only — no per-call `git worktree prune` (that rewrites the SHARED `.git/worktrees` admin state and is a
   *  contention AMPLIFIER against concurrent `worktree add`s; remove+rmSync already leave the repo pristine). */
  function attemptBuild(rev: string, dir: string): Axes {
    try {
      // Detach the rev into the throwaway worktree; a bad/unknown rev OR a transient lock makes this throw.
      runGit(repoPath, ["worktree", "add", "--detach", dir, rev])
      // Route through the ONE grounding derivation (`deriveGroundingAxes`, grounding-computer.ts) — the SAME
      // fold→build the HEAD gate + `anchors` planner use (AUTHOR-1), so this rev's index carries the `::`
      // symbol nodes a fact is grounded against, byte-identical to compose-time. Warmup-gated no-op otherwise.
      // The rev's own `.scip` is not read here (empty documents) — the deliberate asymmetry the header states.
      return deriveGroundingAxes(walkFileTree(dir), { documents: [] }).axes
    } finally {
      // Tear down this attempt's worktree unconditionally so the repo stays pristine — each step guarded.
      try {
        runGit(repoPath, ["worktree", "remove", "--force", dir])
      } catch {
        /* not a registered worktree (add failed) — ignore */
      }
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        /* dir may never have been created — ignore */
      }
    }
  }

  function axesAt(rev: string): Axes {
    const cached = cache.get(rev)
    if (cached !== undefined) return cached

    mkdirSync(base, { recursive: true })

    // A bad rev fails deterministically (fast EMPTY, no retry); a TRANSIENT `git worktree` lock — many
    // concurrent reconcile/doctor subprocesses racing the shared `.git/worktrees` admin area — clears after a
    // brief clock-free yield, so it is RETRIED a BOUNDED number of times. Only a retries-EXHAUSTED transient
    // (or an unclassified error that never clears) falls through to EMPTY_AXES — a real transient never
    // masquerades as a genuinely-empty rev (finding #73: that masquerade silently dropped drift).
    for (let attempt = 0; attempt < GIT_MAX_ATTEMPTS; attempt++) {
      try {
        const axes = attemptBuild(rev, nextDir())
        cache.set(rev, axes) // memoize the immutable rev's Axes (NOT the worktree)
        unresolved.delete(rev) // a retry that CLEARED a transient makes the rev genuinely resolved
        return axes
      } catch (err) {
        // DETERMINISTIC bad rev ⇒ genuine empty, immediately (retrying a bad rev only wastes latency). The
        // classifier is the shared run-git.ts one (superset of the former local BAD_REV_RE; same result).
        if (isDeterministicGitError(err)) {
          unresolved.add(rev)
          return EMPTY_AXES
        }
        // Transient/lock/unclassified ⇒ yield briefly (clock-free) and retry, unless attempts are exhausted.
        if (attempt < GIT_MAX_ATTEMPTS - 1)
          gitYieldMs(GIT_BACKOFF_MS[attempt] ?? GIT_BACKOFF_MS[GIT_BACKOFF_MS.length - 1]!)
      }
    }
    unresolved.add(rev)
    return EMPTY_AXES // fail-closed: a transient that never cleared within the bounded attempts ⇒ empty
  }

  /** `axesAt(rev)`, but ONLY when that rev's checkout actually succeeded — otherwise `undefined`.
   *
   *  A failed checkout must not ANSWER. `EMPTY_AXES` is a real built snapshot, so the readers happily found
   *  the repo ROOT ('.', and its empty-tree hash) inside it and returned a POSITIVE `StructRef` for a rev
   *  that does not exist — reconcile/doctor then read that as MECHANICAL and re-grounded a fact onto '.'.
   *  This is the sibling of finding #73: the same "a failure masquerades as a genuinely-empty rev", here in
   *  the readers rather than in the transient-retry classifier. The gate is on the REV's provenance, never on
   *  the hash VALUE — so a rev that is genuinely empty still resolves exactly as before. */
  function axesIfResolved(rev: string): Axes | undefined {
    const axes = axesAt(rev) // populates `unresolved` as a side effect — must run BEFORE the check
    return unresolved.has(rev) ? undefined : axes
  }

  function resolveAnchorAt(rev: string, qp: string): StructRef | undefined {
    const axes = axesIfResolved(rev)
    if (axes === undefined) return undefined
    for (const root of [axes.spatial, axes.territory, axes.dependency]) {
      const node = findNode(root, qp)
      if (node !== undefined) {
        return { kind: kindOf(node), qualifiedPath: node.key, subtreeHash: node.subtreeHash }
      }
    }
    return undefined
  }

  function resolveBySubtreeAt(rev: string, subtreeHash: string): StructRef | undefined {
    const axes = axesIfResolved(rev)
    if (axes === undefined) return undefined
    const matches = new Map<string, IndexNode>()
    for (const root of [axes.spatial, axes.territory, axes.dependency]) {
      collectBySubtree(root, subtreeHash, matches)
    }
    // AMBIGUITY IS REFUSED, NOT GUESSED. This resolver licenses an AUTOMATIC re-ground: compose.ts and
    // doctor-source.ts read a defined result as MECHANICAL, and git-drift.ts reports the returned
    // `qualifiedPath` as the anchor's NEW home. When the content lives at ≥2 paths (`__init__.py`,
    // `mod.rs`, a vendored copy) there is no unique correct target, and the single-`StructRef` return can
    // only name one — so the preorder-first pick bound the fact to an ARBITRARY duplicate, a wrong anchor
    // that then reads FRESH forever. Refusing degrades an unsafe automatic re-ground into a SEMANTIC one
    // (human adjudication), which is the fail-closed direction and the only answer that is never wrong.
    if (matches.size !== 1) return undefined
    const node = [...matches.values()][0]!
    return { kind: kindOf(node), qualifiedPath: node.key, subtreeHash: node.subtreeHash }
  }

  function reDerives(fact: GroundedFact, newSha: Hash): boolean {
    // Gated on the same provenance: an anchor on the repo ROOT would otherwise re-derive FRESH against the
    // EMPTY sentinel, i.e. a failed checkout could CERTIFY a fact. Fail-closed — a rev we could not read
    // never certifies anything.
    const axes = axesIfResolved(String(newSha))
    return axes !== undefined && driftDetect(fact.grounding, axes) === "FRESH"
  }

  return { axesAt, resolveAnchorAt, resolveBySubtreeAt, reDerives }
}
