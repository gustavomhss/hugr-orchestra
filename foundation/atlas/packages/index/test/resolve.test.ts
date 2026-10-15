// @atlas/index — test/resolve.test.ts  (WP-2.8-a.INDEX)
//
// RED→GREEN transcription of the VISIBLE resolve goldens SCN-INDEX-4a-1 (covering-node resolve) + the
// resolve leg of the ∀-law PROP-INDEX-4 (resolution totality: resolve(spatial,p) ≡ coveringNode(p), never
// the parent, never undefined for an in-tree path). Golden node handles are SYMBOLIC ⇒ every assertion is
// RELATIONAL (the covering node is identified by its transcribed `level`/`key`, never a hard-coded hash).
// Held-out `-2` fixtures are NOT transcribed here (GATE runs those).

import { describe, it, expect } from "vitest"
import fc from "fast-check"
import { asSubtreeHash } from "@atlas/kernel"
import type { Hash } from "@atlas/contracts"
import type { Axis, FileTree, IndexNode, ScipOutput } from "../src/types.js"
import { createResolve, coveringPath, pathSegments, type AxisForest } from "../src/resolve.js"
import { build, escapeKeyComponent } from "../src/build.js"

// --- fixture builders (RELATIONAL; keys are the path segments, rollup roots per-axis distinct) ----------
const node = (axis: Axis, level: string, key: string, children: IndexNode[], objects: Hash[]): IndexNode => ({
  axis,
  level,
  key,
  subtreeHash: asSubtreeHash(`${axis}:${key}`),
  children,
  objects,
})

// spatial rail repo→crate→module→file (atlas-index:54): the covering node of "core/cas/cas.ts" is file:cas.ts.
function coreForest(): AxisForest {
  const file = node("spatial", "file", "cas.ts", [], [])
  const mod = node("spatial", "module", "cas", [file], [])
  const crate = node("spatial", "crate", "core", [mod], [])
  const spatial = node("spatial", "repo", "repo", [crate], [])
  const territory = node("territory", "project", "proj", [], [])
  const dependency = node("dependency", "crate", "dep", [], [])
  return { spatial, territory, dependency }
}

// a linear spatial chain repo→<segs…> for the ∀-property (arbitrary in-tree paths).
function chainForest(segs: readonly string[]): AxisForest {
  let current: IndexNode = node("spatial", `L${segs.length}`, segs[segs.length - 1]!, [], [])
  for (let i = segs.length - 2; i >= 0; i--) current = node("spatial", `L${i + 1}`, segs[i]!, [current], [])
  const spatial = node("spatial", "repo", "repo", [current], [])
  const territory = node("territory", "project", "proj", [], [])
  const dependency = node("dependency", "crate", "dep", [], [])
  return { spatial, territory, dependency }
}

// generator: unique, trimmed, slash-free RAW path components — the FULL alphabet, `::` and `:` and `%`
// very much included (fast-check's string arbitrary reaches `"::!"` on roughly 1 seed in 10).
//
// TRIM is the one narrowing, and it is honest: `pathSegments` normalizes each segment with `trim()`, so a
// key with leading/trailing whitespace is not addressable through `resolve` at all. That is a property of
// resolve.ts's normalization, not of the key mint, and it is OUT of this seat's scope — flagged, not hidden.
const rawSegArb = fc
  .string({ minLength: 1, maxLength: 6 })
  .filter((s) => s === s.trim() && s.length > 0 && !s.includes("/"))

// The KEY domain: a raw component is not a key — `build` mints one by escaping it (`escapeKeyComponent`).
// This property used to feed RAW components straight in as node keys and consequently failed ~8-10% of
// seeds (task #110, counterexample `["::!"]`) — not because the resolver was wrong, but because the fixture
// was building a tree the mint can never produce: a `::` inside ONE component, which `descentSteps` (rightly)
// reads as a refinement boundary. Routing the same full-alphabet strings through the REAL escape keeps every
// corner reachable AND makes the fixture a tree that can actually exist. A regression in the escape now
// fails HERE too, so this is a widening, not a filter.
const chainArb = fc.uniqueArray(rawSegArb, { minLength: 1, maxLength: 5 }).map((segs) => segs.map(escapeKeyComponent))

describe("INDEX-4a — resolving a path returns its covering node (visible golden)", () => {
  it('SCN-INDEX-4a-1: resolve(spatial,"core/cas/cas.ts") ⇒ file:cas.ts, not the parent module', () => {
    const { resolve } = createResolve(coreForest())
    const n = resolve("spatial", "core/cas/cas.ts")
    expect(n).toBeDefined()
    expect(n?.key).toBe("cas.ts")
    expect(n?.level).toBe("file") // the covering FILE node …
    expect(n?.level).not.toBe("module") // teeth: NOT module:cas (covering-node contract violated)
    expect(n?.axis).toBe("spatial")
  })
})

describe("PROP-INDEX-4 (resolve leg) — resolution totality ∀ in-tree path", () => {
  it("∀ in-tree path p: resolve(spatial,p) ≡ the deepest matched (covering) node, never a shorter ancestor", () => {
    fc.assert(
      fc.property(chainArb, (segs) => {
        const { resolve } = createResolve(chainForest(segs))
        // every prefix path resolves to the node AT that depth (the covering node) — not the parent.
        for (let k = 1; k <= segs.length; k++) {
          const p = segs.slice(0, k).join("/")
          const n = resolve("spatial", p)
          expect(n?.key).toBe(segs[k - 1])
        }
        // a segment that leaves the tree ⇒ a total miss (undefined), never a wrong ancestor hit.
        expect(resolve("spatial", segs.join("/") + "/__absent__")).toBeUndefined()
      }),
    )
  })

  it("PROP-INDEX-4 (mint leg): ∀ raw path components, the key `build` MINTS resolves to THAT node", () => {
    // The leg the symbolic fixture above cannot reach: the keys are not written by the test, they are the
    // ones `build` actually mints from a walker-shaped FileTree. A mint that fabricates a `::` boundary
    // (a file named `x::alpha.ts`) makes its own key unreachable, and this goes red.
    fc.assert(
      fc.property(fc.uniqueArray(rawSegArb, { minLength: 1, maxLength: 4 }), (segs) => {
        // walker convention (adapter-io/src/fs.ts): root '.', each child's path = parent path + '/' + seg.
        let leaf: FileTree = { path: segs.join("/"), children: [], content: "x" }
        for (let i = segs.length - 2; i >= 0; i--) {
          leaf = { path: segs.slice(0, i + 1).join("/"), children: [leaf] }
        }
        const axes = build({ path: ".", children: [leaf] }, { documents: [] } as unknown as ScipOutput)
        const { resolve } = createResolve({
          spatial: axes.spatial,
          territory: axes.territory,
          dependency: axes.dependency,
        })
        // every minted key on the chain resolves to exactly its own node — never a shorter ancestor.
        const walk = (n: IndexNode): void => {
          if (n.key !== ".") expect(resolve("spatial", n.key)?.key).toBe(n.key)
          n.children.forEach(walk)
        }
        walk(axes.spatial)
      }),
    )
  })

  it("pathSegments trims + drops empties (path normalization is total)", () => {
    expect(pathSegments(" a / b //c ")).toEqual(["a", "b", "c"])
    expect(pathSegments("")).toEqual([])
    expect(coveringPath(coreForest().spatial, "")).toEqual([])
  })
})
