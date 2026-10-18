// @atlas/index — test/compose.compose-index.test.ts  (WP-2.6-b.INDEX · composed-index facet)
//
// RED→GREEN transcription of the VISIBLE composition goldens SCN-INDEX-1a-1 (one index answers BOTH
// drift AND discovery) + SCN-INDEX-1b-1 (no separate discovery structure / staleness pass — auxiliary
// count == 0). The FACET under test is `src/compose.ts` — the composition of `build` (EPIC-6) + the
// resolve surface (EPIC-8-a) into ONE content-addressed index that backs both jobs (INV-INDEX-1). This
// is the composition facet named by WP-2.6-b.INDEX, distinct from the runtime barrel `src/index.ts`.
//
// Node handles are RELATIONAL (covering node identified by transcribed `level`/`key`, never a hard-coded
// hash); drift is asserted off the `subtreeHash` oracle by comparison, never a re-embedding or a sweep.
// Held-out `-2` fixtures are NOT transcribed here (GATE runs those).

import { describe, it, expect } from "vitest"
import type { FileTree, ScipOutput } from "../src/types.js"
import { composeIndex } from "../src/compose.js"

// --- fixture: the CAS holding file:cas.ts with an item:put node (SCN-INDEX-1a-1 / 1b-1) ------------------
// spatial rail repo→crate→module→file→item (atlas-index:54): the covering node of "core/cas/cas.ts" is
// file:cas.ts; the drift anchor "core/cas/cas.ts/put" resolves the item:put node the fact `F` is anchored at.
const coreTree: FileTree = {
  path: "repo",
  children: [
    {
      path: "core",
      children: [
        {
          path: "cas",
          children: [
            {
              path: "cas.ts",
              content: "file:cas.ts",
              children: [{ path: "put", content: "item:put·F", children: [] }],
            },
          ],
        },
      ],
    },
  ],
}
// No cross-file references ⇒ an empty (honest) edge ledger; the composition is over the built axes.
const coreScip: ScipOutput = { documents: [] }

describe("INDEX-1a — one index answers both drift and discovery (visible golden)", () => {
  it('SCN-INDEX-1a-1: drift(item:put) + discover(byScope("core/cas/cas.ts")) are served by the ONE index I', () => {
    const I = composeIndex(coreTree, coreScip)

    // discovery — byScope resolves the covering node off the built spatial axis.
    const discovered = I.discover("core/cas/cas.ts")
    expect(discovered?.key).toBe("cas.ts")
    expect(discovered?.level).toBe("file") // the covering FILE node, not its parent module

    // drift — anchored at item:put, decided INLINE off the same axes' subtreeHash oracle.
    const now = I.drift("core/cas/cas.ts/put", "")
    expect(now.node?.key).toBe("put")
    expect(now.node?.level).toBe("item")
    const recorded = now.current // record the baseline off the SAME subtreeHash drift oracle
    expect(recorded).toBeDefined()
    // fresh anchor ⇒ not stale; a changed subtreeHash ⇒ stale — decided by comparison, no re-embedding.
    expect(I.drift("core/cas/cas.ts/put", recorded as string).stale).toBe(false)
    expect(I.drift("core/cas/cas.ts/put", (recorded as string) + "x").stale).toBe(true)

    // ── one-index assertion: BOTH jobs are served by the same index object I ──────────────────────────
    // auxiliary-structure count == 0 (no second, separately-built discovery/staleness structure stood up).
    expect(I.auxiliaryStructureCount).toBe(0) // teeth: a 2nd discovery index ⇒ 1 (the two can disagree)
    // discovery + drift read the IDENTICAL built axes (the single backing index) — same object references.
    expect(I.backsBothJobs).toBe(true)
    expect(I.forest.spatial).toBe(I.axes.spatial)
    expect(I.forest.territory).toBe(I.axes.territory)
    expect(I.forest.dependency).toBe(I.axes.dependency)
    // the ONE index exposes ≥3 axes (spatial / territory / dependency), each cross-indexed once (INDEX-10).
    expect(I.axesList.length).toBeGreaterThanOrEqual(3)
  })
})

describe("INDEX-1b — no separate discovery structure or staleness pass (guard golden)", () => {
  it("SCN-INDEX-1b-1: structure-count assertion is 0 — drift off subtreeHash, discovery off the same axes", () => {
    const I = composeIndex(coreTree, coreScip)

    // no-separate-pass assertion: 0 auxiliary discovery/staleness structures + 0 separate sweeps.
    expect(I.auxiliaryStructureCount).toBe(0) // teeth: a background staleness-sweep structure ⇒ 1
    expect(I.sweepCount).toBe(0) // drift is decided at query time — there is NO separate staleness pass
    expect(I.reembedCount).toBe(0) // discovery is lookup over the same axes — nothing is ever re-embedded

    // drift IS decided at query time off subtreeHash (a comparison), for the ingested {file:cas.ts, F, M}.
    const v = I.drift("core/cas/cas.ts", "stale-baseline")
    expect(v.current).toBe(String(I.axes.spatial.children[0]?.children[0]?.children[0]?.subtreeHash))
    expect(v.stale).toBe(true) // anchor `subtreeHash` ≠ current ⇒ visible + flagged inline (INDEX-5)

    // discovery is served off the SAME axes the drift comparison reads — one source of truth.
    expect(I.discover("core/cas/cas.ts")).toBe(I.axes.spatial.children[0]?.children[0]?.children[0])
  })
})
