// @atlas/index — test/resolve.depth.test.ts  (REGRESSION: scope resolution at ANY depth)
//
// The base-commit `coveringPath` compared a single path SEGMENT against `IndexNode.key`, but `build.ts:38`
// keys every node `key: node.path` — the FULL repo-relative path. The comparison therefore only ever
// succeeded at depth 1, capping the addressable scope vocabulary of a real repo at its top-level entries
// (18 on this repo; 636 after the fix). These tests are written against the FROZEN key contract: fixtures
// are produced by the REAL `build()` wherever possible, so a future change to `key` breaks them loudly
// instead of silently re-capping resolution.
//
// The control legs are as load-bearing as the depth legs: depth-1 must be UNCHANGED, and the prefix
// boundary must sit on a path SEPARATOR, never on characters — matching `src/m0` against `srcM0` or
// `src/m0x` would turn a resolution bug into an authorization-adjacent one.

import { describe, it, expect } from "vitest"
import fc from "fast-check"
import { asSubtreeHash } from "@atlas/kernel"
import type { Axis, FileTree, IndexNode } from "../src/types.js"
import { build } from "../src/build.js"
import { createResolve, coveringPath, type AxisForest } from "../src/resolve.js"
import { createRetrieval } from "../src/retrieval.js"
import type { Hash } from "@atlas/contracts"

// ---- fixtures built through the REAL `build()` (so `key === node.path` is the contract under test) ----

const dir = (path: string, children: FileTree[]): FileTree => ({ path, children })
const file = (path: string, content = ""): FileTree => ({ path, children: [], content })

/** `.` → src/{m0/{f0.ts,f1.ts}, m1/f2.ts} + srcM0/f3.ts + src/m0x/f4.ts — the sibling names are chosen to
 *  be character-prefix neighbours of `src/m0`, which is exactly the off-by-one this fix must not create. */
function realTree(): FileTree {
  return dir(".", [
    dir("src", [
      dir("src/m0", [file("src/m0/f0.ts", "a"), file("src/m0/f1.ts", "b")]),
      dir("src/m0x", [file("src/m0x/f4.ts", "c")]),
      dir("src/m1", [file("src/m1/f2.ts", "d")]),
    ]),
    dir("srcM0", [file("srcM0/f3.ts", "e")]),
  ])
}

const realForest = (): AxisForest => {
  const axes = build(realTree(), { documents: [] })
  return { spatial: axes.spatial, territory: axes.territory, dependency: axes.dependency }
}

describe("REGRESSION — scope resolution reaches ANY depth (build.ts:38 keys nodes by FULL path)", () => {
  it('depth 2: resolve(territory,"src/m0") ⇒ the src/m0 node, not undefined', () => {
    const n = createResolve(realForest()).resolve("territory", "src/m0")
    expect(n).toBeDefined()
    expect(n?.key).toBe("src/m0")
  })

  it('depth 3 — a leaf FILE path: resolve(territory,"src/m0/f0.ts") ⇒ the file node', () => {
    const n = createResolve(realForest()).resolve("territory", "src/m0/f0.ts")
    expect(n).toBeDefined()
    expect(n?.key).toBe("src/m0/f0.ts")
    expect(n?.children).toEqual([]) // teeth: it is the covering LEAF, not an ancestor directory
  })

  it("∀ node in a really-built tree: resolve(axis, node.key) ⇒ THAT node (never a shorter ancestor)", () => {
    const forest = realForest()
    const { resolve } = createResolve(forest)
    const keys: string[] = []
    const walk = (n: IndexNode, depth: number): void => {
      if (depth > 0) keys.push(n.key)
      n.children.forEach((c) => walk(c, depth + 1))
    }
    walk(forest.territory, 0)
    expect(keys.length).toBeGreaterThan(5) // teeth: an empty walk would vacuously pass
    for (const k of keys) expect(resolve("territory", k)?.key).toBe(k)
  })

  it("∀ arbitrary nested dir chain: every in-tree prefix path resolves to the node AT that depth", () => {
    const segArb = fc.uniqueArray(fc.stringMatching(/^[a-z][a-z0-9]{0,5}$/), { minLength: 1, maxLength: 6 })
    fc.assert(
      fc.property(segArb, (segs) => {
        // build a real FileTree whose paths are the accumulated prefixes (exactly what walkFileTree mints)
        let node: FileTree = file(segs.join("/"), "x")
        for (let i = segs.length - 1; i >= 1; i--) node = dir(segs.slice(0, i).join("/"), [node])
        const axes = build(dir(".", [node]), { documents: [] })
        const { resolve } = createResolve({
          spatial: axes.spatial,
          territory: axes.territory,
          dependency: axes.dependency,
        })
        for (let k = 1; k <= segs.length; k++) {
          const p = segs.slice(0, k).join("/")
          expect(resolve("territory", p)?.key).toBe(p)
        }
        // a step that leaves the tree ⇒ a total miss, never a wrong ancestor hit
        expect(resolve("territory", `${segs.join("/")}/__absent__`)).toBeUndefined()
      }),
    )
  })

  it("the hierarchy roll-up (byScope) now unions EVERY ancestor of a deep path, not just depth 1", () => {
    const forest = realForest()
    const at = (key: string): IndexNode => {
      const found = createResolve(forest).resolve("territory", key)
      if (found === undefined) throw new Error(`fixture: ${key} did not resolve`)
      return found
    }
    // re-anchor objects onto the really-built spatial chain: repo → src → src/m0 → src/m0/f0.ts
    const anchor = (n: IndexNode, objs: Record<string, Hash>): IndexNode => ({
      ...n,
      objects: objs[n.key] !== undefined ? [objs[n.key] as Hash] : [],
      children: n.children.map((c) => anchor(c, objs)),
    })
    const objs = {
      src: "h-crate" as Hash,
      "src/m0": "h-mod" as Hash,
      "src/m0/f0.ts": "h-file" as Hash,
    }
    const spatial = anchor(forest.spatial, objs)
    const r = createRetrieval({
      forest: { ...forest, spatial },
      store: new Map<Hash, unknown>([
        ["h-crate" as Hash, { inv: "Icrate" }],
        ["h-mod" as Hash, { inv: "Imod" }],
        ["h-file" as Hash, { inv: "Ifile" }],
      ]),
      triggers: new Map(),
      blastRadius: new Map(),
    })
    void at("src/m0/f0.ts")
    const invs = r.byScope("src/m0/f0.ts").map((f) => (f as { inv?: string }).inv)
    expect(invs).toEqual(expect.arrayContaining(["Ifile", "Imod", "Icrate"]))
    expect(invs).toContain("Imod") // teeth: the ancestor roll-up is not dropped at depth ≥ 2
    expect(invs).toContain("Icrate")
  })
})

describe("CONTROL — depth-1 resolution is UNCHANGED", () => {
  it("a top-level scope still resolves exactly as before the fix", () => {
    const { resolve } = createResolve(realForest())
    expect(resolve("territory", "src")?.key).toBe("src")
    expect(resolve("territory", "srcM0")?.key).toBe("srcM0")
  })

  it("the symbolic segment-keyed goldens (SCN-INDEX-4a-1 shape) still resolve to the covering node", () => {
    // The transcribed goldens key nodes by symbolic LEVEL NAME, and the dependency axis keys its children
    // by node HASH — neither is a path. Both must keep resolving.
    const node = (axis: Axis, level: string, key: string, children: IndexNode[]): IndexNode => ({
      axis,
      level,
      key,
      subtreeHash: asSubtreeHash(`${axis}:${key}`),
      children,
      objects: [],
    })
    const spatial = node("spatial", "repo", "repo", [
      node("spatial", "crate", "core", [node("spatial", "module", "cas", [node("spatial", "file", "cas.ts", [])])]),
    ])
    const dependency = node("dependency", "root", "dependency", [node("dependency", "unit", "bk-9f", [])])
    const { resolve } = createResolve({ spatial, territory: spatial, dependency })
    const n = resolve("spatial", "core/cas/cas.ts")
    expect(n?.key).toBe("cas.ts")
    expect(n?.level).toBe("file")
    expect(n?.level).not.toBe("module") // teeth: NOT the parent module
    expect(resolve("dependency", "bk-9f")?.key).toBe("bk-9f") // flat hash-keyed axis still resolves
  })
})

describe("CONTROL — the prefix boundary is a SEPARATOR, never a character (authorization-adjacent)", () => {
  const uncovered = [
    "srcM0/f3.ts", // NOT reachable as a refinement of `src` — different top-level territory
    "src/m0x/f4.ts", // sibling whose key EXTENDS `src/m0` by characters
  ]

  it("`src/m0` never matches the character-neighbour scopes `srcM0` or `src/m0x`", () => {
    const { resolve } = createResolve(realForest())
    // each is a real, DISTINCT node — it must resolve to ITSELF, never to `src/m0`
    expect(resolve("territory", "srcM0")?.key).toBe("srcM0")
    expect(resolve("territory", "src/m0x")?.key).toBe("src/m0x")
    expect(resolve("territory", "src/m0")?.key).toBe("src/m0")
    for (const u of uncovered) expect(resolve("territory", u)?.key).not.toBe("src/m0")
  })

  it("a genuinely-uncovered scope returns NO covering node, never a prefix-accidental match", () => {
    const { resolve } = createResolve(realForest())
    for (const q of [
      "src/m", // character truncation of `src/m0`
      "src/m00", // character extension of `src/m0`
      "srcm0", // separator removed
      "src/m0/f0", // truncation of the leaf file name
      "src/m0/f0.tsx", // extension of the leaf file name
      "sr", // truncation of depth-1 `src`
      "src2", // extension of depth-1 `src`
    ]) {
      expect(resolve("territory", q), `"${q}" must not resolve`).toBeUndefined()
    }
  })

  it("∀ character-mutation of a real scope that is not itself a real scope ⇒ no covering node", () => {
    const forest = realForest()
    const { resolve } = createResolve(forest)
    const real = new Set<string>()
    const walk = (n: IndexNode, d: number): void => {
      if (d > 0) real.add(n.key)
      n.children.forEach((c) => walk(c, d + 1))
    }
    walk(forest.territory, 0)
    fc.assert(
      fc.property(fc.constantFrom(...real), fc.stringMatching(/^[a-zA-Z0-9]{1,4}$/), (key, junk) => {
        for (const mutant of [key + junk, junk + key, key.slice(0, -1), key.replace(/\//g, "")]) {
          if (real.has(mutant)) continue // a mutation that lands on a REAL scope is allowed to resolve
          expect(resolve("territory", mutant)).toBeUndefined()
        }
      }),
    )
  })
})

describe("CONTROL — resolution stays TOTAL (INDEX-9): a miss is `undefined`, never a throw", () => {
  it("malformed / unknown / non-string scopes yield undefined without throwing", () => {
    const { resolve } = createResolve(realForest())
    for (const q of ["", "   ", "/", "///", "::", "src/::", "../../etc/passwd", "src/../srcM0"]) {
      expect(() => resolve("territory", q)).not.toThrow()
      expect(resolve("territory", q), `"${q}" must not resolve`).toBeUndefined()
    }
    expect(resolve("nope" as Axis, "src")).toBeUndefined() // unknown axis ⇒ no default-axis fall-through
    expect(resolve("territory", undefined as unknown as string)).toBeUndefined()
    expect(coveringPath(realForest().territory, null as unknown as string)).toEqual([])
  })

  it("∀ fuzz input — 0 throws, non-string ⇒ undefined", () => {
    const { resolve } = createResolve(realForest())
    fc.assert(
      fc.property(fc.anything(), (x) => {
        expect(() => resolve("territory", x as string)).not.toThrow()
        if (typeof x !== "string") expect(resolve("territory", x as string)).toBeUndefined()
      }),
      { numRuns: 500, seed: 20260801 },
    )
  })

  it("a `::` sub-file refinement chain (adapter-io ast.ts `unitPath`) resolves step by step", () => {
    // file `src/m0/f0.ts` refined into item `…::12:function_declaration:foo` → block `…::30:statement_block:`
    const item = file("src/m0/f0.ts::12:function_declaration:foo", "fn")
    const withItem: FileTree = dir(".", [
      dir("src", [dir("src/m0", [{ path: "src/m0/f0.ts", content: "src", children: [item] }])]),
    ])
    const axes = build(withItem, { documents: [] })
    const { resolve } = createResolve({
      spatial: axes.spatial,
      territory: axes.territory,
      dependency: axes.dependency,
    })
    expect(resolve("territory", "src/m0/f0.ts")?.key).toBe("src/m0/f0.ts")
    expect(resolve("territory", "src/m0/f0.ts::12:function_declaration:foo")?.key).toBe(
      "src/m0/f0.ts::12:function_declaration:foo",
    )
    // teeth: the `::` boundary is a whole separator too — a character neighbour must NOT resolve
    expect(resolve("territory", "src/m0/f0.ts::12:function_declaration:fooX")).toBeUndefined()
    expect(resolve("territory", "src/m0/f0.ts:12:function_declaration:foo")).toBeUndefined()
  })
})
