// @atlas/genesis — test/seeds-qualified-path.test.ts  (GEN-15c — `qualifiedPath` is a PATH, from BOTH producers)
//
// THE FINDING. `StructRef.qualifiedPath` carried two different kinds of value depending on who produced it:
// `adapter-io/src/git-history.ts:74` `fileRef` put a repo-relative PATH there, `structuralSeeds` put a
// dep-graph NODE-IDENTITY KEY (a hash). Every consumer treats the field as a path — `createFileSourceReader`
// resolves it against the repo root, `filePathOf` splits it on `::`, `bucketOf` calls it a file — so on any
// repo that falls back to the structural frontier (thin history, or an empty mined one: rank.ts:360-362)
// the reader returned `null` at EVERY site, the prompt factory refused, and the run-controller's GEN-8c
// catch turned it into an anonymous partial run.
//
// THE FIXTURES ARE BUILT BY `@atlas/index` `build`, not hand-written, and that is load-bearing: the hand-
// built skeletons elsewhere in this suite mint a node's identity and its subtreeHash from ONE id, which
// collapses the two orthogonal identity spaces the bug lives between. Only the REAL build has a spatial
// axis keyed by PATH with a content-fold subtreeHash and a dependency axis keyed by `id({file: path})`.

import { describe, expect, it } from "vitest"
import { build, nodeHashOfPath } from "@atlas/index"
import type { FileTree, ScipOutput } from "@atlas/index"
import type { Skeleton } from "@atlas/genesis"
import { canonicalizeSkeleton, createMine, structuralFrontier, structuralSeeds } from "../src/rank.js"
import type { HistorySource, SkeletonSource } from "../src/rank.js"

const SYM_GREET = "util/greet()."
const SYM_MISSING = "util/missingHelper()."

const file = (path: string, content: string): FileTree => ({ path, children: [], content })

/** `src/util.ts` + `src/app.ts`, really present in the tree — both have bytes a prompt could carry. */
const TREE: FileTree = {
  path: ".",
  children: [
    {
      path: "src",
      children: [
        file("src/app.ts", "import { greet } from './util';\n"),
        file("src/util.ts", "export function greet(): void {}\n"),
      ],
    },
  ],
}

/** `greet` is defined in util.ts and referenced in app.ts (⇒ a resolved edge); `missingHelper` is defined
 *  nowhere (⇒ an `unresolved` edge, INDEX-13 — declared, never guessed). */
const SCIP: ScipOutput = {
  documents: [
    { relativePath: "src/util.ts", occurrences: [{ symbol: SYM_GREET, role: "definition" }] },
    {
      relativePath: "src/app.ts",
      occurrences: [
        { symbol: SYM_GREET, role: "reference" },
        { symbol: SYM_MISSING, role: "reference" },
      ],
    },
  ],
}

/** The SAME corpus plus a document the TREE DOES NOT CONTAIN — an indexed file outside the tracked tree.
 *  Its dep node exists (it participates in edges) but it has no spatial counterpart, hence no path. */
const SCIP_WITH_GHOST: ScipOutput = {
  documents: [
    ...SCIP.documents,
    { relativePath: "src/ghost.ts", occurrences: [{ symbol: SYM_GREET, role: "reference" }] },
  ],
}

const skeletonOf = (scip: ScipOutput): Skeleton =>
  canonicalizeSkeleton({ axes: build(TREE, scip), manifest: { territories: [] } })

describe("GEN-15c — a structural seed carries a PATH, the same kind of value `fileRef` produces", () => {
  it("emits the repo-relative PATH, never the dep-graph node-identity key", () => {
    // teeth (breaks-on "the seed emits the dependency key again"): the mutant emits the 64-hex identity
    // hash, which is neither of these two EXACT strings. Asserted by exact set equality and not by
    // `toContain`, because a substring match cannot tell `src/app.ts` from `src/app.ts::ns`.
    const seeds = structuralSeeds(skeletonOf(SCIP))

    expect([...seeds.map((s) => s.qualifiedPath)].sort()).toEqual(["src/app.ts", "src/util.ts"])
    for (const s of seeds) expect(s.qualifiedPath).not.toBe(String(nodeHashOfPath(s.qualifiedPath)))
  })

  it("the CONTENT subtreeHash leg is unchanged — it still resolves through the index correspondence (F2)", () => {
    // The other leg must NOT move: it is what `resolveSiteKey` joins back to the dep graph before the PPR,
    // and `fileRef` mints exactly this value for the same path (`asSubtreeHash(nodeHashOfPath(p))`).
    const seeds = structuralSeeds(skeletonOf(SCIP))
    for (const s of seeds) expect(String(s.subtreeHash)).toBe(String(nodeHashOfPath(s.qualifiedPath)))
  })
})

describe("GEN-15c — a dep node with no spatial counterpart is DROPPED and COUNTED, never silently", () => {
  it("drops the pathless node and reports how many it dropped", () => {
    // teeth (breaks-on "the drop becomes silent"): with the count removed `droppedNoPath` reads 0 while the
    // frontier is one site shorter, which is exactly the shape of a phantom-coverage claim (#130).
    const withGhost = structuralFrontier(skeletonOf(SCIP_WITH_GHOST))

    expect([...withGhost.seeds.map((s) => s.qualifiedPath)].sort()).toEqual(["src/app.ts", "src/util.ts"])
    expect(withGhost.droppedNoPath).toBe(1) //           `src/ghost.ts` is indexed but not in the tree
    expect(structuralFrontier(skeletonOf(SCIP)).droppedNoPath).toBe(0) // CONTROL: nothing to drop
  })

  it("the drop reaches the `mine` driver through the observer — the count leaves genesis", () => {
    // A count computed and kept inside the frontier builder would be just as silent. `MineApi.mine` is
    // frozen at `readonly Candidate[]`, so the observer is how it gets out.
    const dropped: number[] = []
    const skeleton: SkeletonSource = { skeleton: () => skeletonOf(SCIP_WITH_GHOST) }
    const history: HistorySource = {
      commitCount: () => 0, //  thin ⇒ the structural fallback, which is the only path that drops
      shallow: () => false,
      blameConcentration: () => 0,
      frontier: () => [],
      signals: () => ({ hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] }),
    }

    const cands = createMine({ skeleton, history, onSeedsDropped: (n) => void dropped.push(n) }).mine("repo", "HEAD")

    expect(dropped).toEqual([1]) // fired ONCE — the fallback is built once per pass, not twice
    expect(cands.length).toBe(2)
    expect([...cands.map((c) => c.site.qualifiedPath)].sort()).toEqual(["src/app.ts", "src/util.ts"])
  })
})
