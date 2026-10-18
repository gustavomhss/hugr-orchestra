// @atlas/adapter-io — test/skeleton-source.test.ts  (the production genesis S0 `SkeletonSource`)
//
// The FINDING this suite pins: `packages/cli/src/mine.ts` used to inject a hand-built `emptySkeleton()` whose
// `axes.edges` is `[]`. `structuralSeeds` (genesis/rank.ts:321) ranks by dep-graph DEGREE and reads ONLY
// `axes.edges`, so an empty skeleton ⇒ 0 seeds ⇒ `rank` 0 candidates ⇒ 0 sites visited ⇒ 0 model calls. The
// operative cause of a 0-candidate `atlas mine` was therefore the ABSENT SKELETON, not the absent model:
// wiring a real proposer on top of an empty skeleton would still have produced 0.
//
// So the goldens here are the CHAIN, not just the shape: a real repo + a real `.atlas/index.scip` must carry
// the skeleton all the way to a non-zero `structuralSeeds` / `rank` count. The MUTANT in every chain case is
// the empty skeleton itself (asserted alongside), so a green here can never be a green that would also have
// been green before the wiring.
//
// The other half is TOTALITY, which this composition INHERITS rather than re-implements: a non-git tree
// (`walkFileTree`, WP-N8), a corrupt `.scip` (`readScipOrEmpty`, WP-N4) and a malformed rev
// (`createRevIndex.axesAt`) must each degrade to an honestly-empty-but-structurally-valid skeleton, never a
// throw — and a repo with NO scip dump must still produce a real FILE-LEVEL skeleton (territories + axes).

import { describe, it, expect, afterEach } from "vitest"
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { canonicalizeSkeleton, structuralSeeds, rank } from "@atlas/genesis"
import type { Skeleton } from "@atlas/genesis"
import type { IndexNode } from "@atlas/index"
import { createSkeletonSource } from "../src/skeleton-source.js"
import { makeFixRepo, type FixRepo } from "./harness/fix-repo.js"
import { makeFixScip, type FixScip } from "./harness/fix-scip.js"

// ── the MUTANT: the exact skeleton `mine.ts` used to inject (the pre-wiring baseline) ──────────────────
const emptyNode = (axis: string): unknown => ({
  axis,
  level: "repo",
  key: "root",
  subtreeHash: "root",
  children: [],
  objects: [],
})
const EMPTY_SKELETON = {
  axes: {
    spatial: emptyNode("spatial"),
    territory: emptyNode("territory"),
    dependency: emptyNode("dependency"),
    edges: [],
  },
  manifest: { territories: [] },
} as unknown as Skeleton

const countNodes = (n: IndexNode): number => 1 + n.children.reduce((a, c) => a + countNodes(c), 0)

let repo: FixRepo | undefined
let scip: FixScip | undefined
const temps: string[] = []

afterEach(() => {
  repo?.cleanup()
  scip?.cleanup()
  repo = undefined
  scip = undefined
  while (temps.length > 0) rmSync(temps.pop()!, { recursive: true, force: true })
})

/** The frozen multi-language `fix-repo`, with the frozen `fix.scip` corpus COPIED to the location the
 *  production source reads (`<repo>/.atlas/index.scip` — the same path `composeRuntime` uses). */
function repoWithScip(): string {
  repo = makeFixRepo()
  scip = makeFixScip()
  mkdirSync(join(repo.repoPath, ".atlas"), { recursive: true })
  copyFileSync(scip.scipPath, join(repo.repoPath, ".atlas", "index.scip"))
  return repo.repoPath
}

function tempDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix))
  temps.push(d)
  return d
}

describe("createSkeletonSource — the S0 chain reaches non-zero seeds on a real indexed repo", () => {
  it("an indexed repo yields real axes, real dep edges, and a NON-ZERO seed/candidate chain", () => {
    const path = repoWithScip()
    const sk = canonicalizeSkeleton(createSkeletonSource(path).skeleton(path, "HEAD"))

    // S0 — a real structural skeleton, not the root-only stub.
    expect(countNodes(sk.axes.spatial)).toBeGreaterThan(1)
    expect(sk.manifest.territories.length).toBeGreaterThan(0)
    // the def→ref ledger derived from the REAL dump: `greet` resolves (util.ts), `missingHelper` does not.
    expect(sk.axes.edges.length).toBe(2)
    expect(sk.axes.edges.filter((e) => e.to !== null).length).toBe(1)
    expect(sk.axes.edges.filter((e) => e.to === null).length).toBe(1) // INDEX-13: declared, never guessed

    // S1 — the chain that used to terminate at 0. Both participating dep nodes are seeds; `rank` orders them.
    const seeds = structuralSeeds(sk)
    expect(seeds.length).toBe(2)
    expect(rank(sk, seeds).length).toBe(2)

    // MUTANT — the same two calls over the skeleton `mine.ts` used to inject: 0 and 0. This is the RED.
    const mutant = canonicalizeSkeleton(EMPTY_SKELETON)
    expect(structuralSeeds(mutant).length).toBe(0)
    expect(rank(mutant, structuralSeeds(mutant)).length).toBe(0)
  })

  it("every territory ships at the T2/advisory move-in tier (TOOLS-5c — no tier is inherited from the walk)", () => {
    const path = repoWithScip()
    const sk = createSkeletonSource(path).skeleton(path, "HEAD")
    expect(sk.manifest.territories.length).toBeGreaterThan(0)
    for (const t of sk.manifest.territories) expect(t.tier).toBe("T2")
  })

  it("is deterministic: two calls on the same (repo, rev) produce a byte-identical skeleton", () => {
    const path = repoWithScip()
    const a = JSON.stringify(canonicalizeSkeleton(createSkeletonSource(path).skeleton(path, "HEAD")))
    // a FRESH source instance, so this proves determinism of the composition, not just the memo.
    const b = JSON.stringify(canonicalizeSkeleton(createSkeletonSource(path).skeleton(path, "HEAD")))
    expect(a).toBe(b)
  })
})

describe("createSkeletonSource — TOTAL: every degraded input yields an honest skeleton, never a throw", () => {
  it("a repo with NO scip dump still yields a real FILE-LEVEL skeleton (axes + territories, 0 edges)", () => {
    repo = makeFixRepo() // no `.atlas/index.scip` written
    const sk = createSkeletonSource(repo.repoPath).skeleton(repo.repoPath, "HEAD")
    expect(countNodes(sk.axes.spatial)).toBeGreaterThan(1) // the files ARE there…
    expect(sk.manifest.territories.length).toBeGreaterThan(0)
    expect(sk.axes.edges.length).toBe(0) // …and the honest hole is declared: edges come from SCIP alone
    // and therefore — stated, not hidden — the seed chain is still 0 until the repo is indexed.
    expect(structuralSeeds(canonicalizeSkeleton(sk)).length).toBe(0)
  })

  it("a PRESENT-but-corrupt scip dump degrades to the files-only skeleton (WP-N4 inherited, no throw)", () => {
    const path = repoWithScip()
    writeFileSync(join(path, ".atlas", "index.scip"), "not a protobuf — garbage bytes\n")
    let sk: Skeleton | undefined
    expect(() => {
      sk = createSkeletonSource(path).skeleton(path, "HEAD")
    }).not.toThrow()
    expect(countNodes(sk!.axes.spatial)).toBeGreaterThan(1)
    expect(sk!.axes.edges.length).toBe(0)
  })

  it("a NON-git directory degrades to the empty tracked set (WP-N8 inherited, no throw)", () => {
    const dir = tempDir("atlas-skel-nongit-")
    writeFileSync(join(dir, "a.ts"), "export const a = 1;\n")
    let sk: Skeleton | undefined
    expect(() => {
      sk = createSkeletonSource(dir).skeleton(dir, "HEAD")
    }).not.toThrow()
    expect(countNodes(sk!.axes.spatial)).toBe(1) // root only — never a fabricated tree
    expect(sk!.manifest.territories.length).toBe(0)
    expect(sk!.axes.edges.length).toBe(0)
  })

  it("an ABSENT path yields a structurally-valid empty skeleton (no throw at the composition boot path)", () => {
    const missing = join(tempDir("atlas-skel-missing-"), "no-such-repo")
    let sk: Skeleton | undefined
    expect(() => {
      sk = createSkeletonSource(missing).skeleton(missing, "HEAD")
    }).not.toThrow()
    expect(countNodes(sk!.axes.spatial)).toBe(1)
    expect(canonicalizeSkeleton(sk!).axes.edges.length).toBe(0)
  })

  it("a MALFORMED rev yields a partial (empty) skeleton, never a throw (GEN-8)", () => {
    const path = repoWithScip()
    let sk: Skeleton | undefined
    expect(() => {
      sk = createSkeletonSource(path).skeleton(path, "no-such-rev-@@@")
    }).not.toThrow()
    expect(sk!.axes.edges.length).toBe(0)
    expect(countNodes(sk!.axes.spatial)).toBe(1) // the fail-closed EMPTY axes of `createRevIndex`
  })

  it("a rev naming the resolved HEAD sha takes the SCIP-bearing working-tree leg (not a worktree checkout)", () => {
    const path = repoWithScip()
    const src = createSkeletonSource(path, {
      headSha: () => "deadbeef",
      // a revIndex double: if the HEAD-sha leg were NOT taken this would be the (edge-free) result.
      revIndex: {
        axesAt: () => ({
          spatial: emptyNode("spatial") as IndexNode,
          territory: emptyNode("territory") as IndexNode,
          dependency: emptyNode("dependency") as IndexNode,
          edges: [],
        }),
        resolveAnchorAt: () => undefined,
        resolveBySubtreeAt: () => undefined,
        reDerives: () => false,
      },
    })
    expect(src.skeleton(path, "deadbeef").axes.edges.length).toBe(2) // working-tree leg ⇒ the dump was read
    expect(src.skeleton(path, "some-other-rev").axes.edges.length).toBe(0) // the revIndex leg ⇒ the double
  })
})
