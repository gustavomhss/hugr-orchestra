// @atlas/index — test/rollup.test.ts  (WP-2.7-a.INDEX)
//
// RED→GREEN transcription of the VISIBLE goldens for the Merkle rollup / structural fold:
//   SCN-INDEX-2a-1 (order-independent rollup), 2b-1 (edit re-hashes leaf→root only),
//   2c-1 (siblings byte-identical), 12a-1 (rId/rState — two distinct roots), 12e-1 (spatial rId
//   re-hash is the leaf→root path only) — plus the ∀-law PROP-INDEX-2 (determinism + edit-locality).
// Golden ids (`bk-11`, `sp-9c`, …) are SYMBOLIC, so every assertion is RELATIONAL / encoder-agnostic
// (equality across child order; inequality for the named teeth; touched-SET membership) — never a
// specific hex digest. Held-out `-2` fixtures: NONE exist for these SCNs (all `gen: PBT`), so none run.

import { describe, it, expect } from "vitest"
import fc from "fast-check"
import { asHash, asSubtreeHash } from "@atlas/kernel"
import type { Hash, SubtreeHash } from "@atlas/contracts"
import type { Axis, IndexNode } from "../src/types.js"
import { subtreeHash, rehashPath, createRollup } from "../src/rollup.js"

const sh = (s: string): SubtreeHash => asSubtreeHash(s)
const h = (s: string): Hash => asHash(s)

function nd(
  key: string,
  level: string,
  subtree: string,
  children: IndexNode[] = [],
  objects: Hash[] = [],
  axis: Axis = "spatial",
): IndexNode {
  return { axis, level, key, subtreeHash: sh(subtree), children, objects }
}

// The spatial fixture tree of SCN-INDEX-2b/2c/12e: repo:atlas→crate:core→module:cas→{file:cas.ts→{b1,b2}, file:store.ts→{b3}}
function fixtureTree(b1Hash = "bk-11"): IndexNode {
  const b1 = nd("b1", "block", b1Hash)
  const b2 = nd("b2", "block", "bk-22")
  const b3 = nd("b3", "block", "bk-33")
  const fileCas = nd("file:cas.ts", "file", "sp-cas", [b1, b2])
  const fileStore = nd("file:store.ts", "file", "sp-st", [b3])
  const modCas = nd("module:cas", "module", "sp-mod", [fileCas, fileStore])
  const crate = nd("crate:core", "crate", "sp-crate", [modCas])
  return nd("repo:atlas", "repo", "sp-repo", [crate])
}
const CAS_PATH = ["repo:atlas", "crate:core", "module:cas", "file:cas.ts", "b1"] as const

const find = (root: IndexNode, key: string): IndexNode | undefined =>
  root.key === key ? root : root.children.map((c) => find(c, key)).find((x) => x !== undefined)

describe("INDEX-2 / INDEX-12 — Merkle rollup, structural fold (visible goldens)", () => {
  it("SCN-INDEX-2a-1: rollup = BLAKE3 over sorted child hashes, order-independent", () => {
    const b1 = nd("b1", "block", "bk-11")
    const b2 = nd("b2", "block", "bk-22")
    const ordered = nd("file:cas.ts", "file", "ignored", [b1, b2])
    const swapped = nd("file:cas.ts", "file", "ignored", [b2, b1])
    // both presentations hash to the ONE root — regardless of child input order (corpus vector sp-9c)
    expect(subtreeHash(ordered)).toBe(subtreeHash(swapped))
    // teeth (breaks-on concatenating in input order, no sort): a mutant that skips the sort would make
    // [b2,b1] hash differently. The invariance above is exactly what that mutant violates.
  })

  it("SCN-INDEX-2b-1: editing one block re-hashes exactly its leaf→root path", () => {
    const { touched } = rehashPath(fixtureTree(), CAS_PATH, sh("bk-11x"))
    // the re-hashed (touched) SET is exactly the leaf→root path
    expect([...touched].sort()).toEqual([...CAS_PATH].sort())
    // teeth (breaks-on re-hashing the whole level): file:store.ts / b2 must NOT be touched (0 sibling touches)
    expect(touched).not.toContain("file:store.ts")
    expect(touched).not.toContain("b2")
  })

  it("SCN-INDEX-2c-1: sibling subtrees keep their hash byte-identical (0 sibling re-hashes)", () => {
    const before = fixtureTree()
    const { root: after } = rehashPath(before, CAS_PATH, sh("bk-11x"))
    // sibling block b2 and sibling file:store.ts keep their subtreeHash byte-identical
    expect(find(after, "b2")!.subtreeHash).toBe(find(before, "b2")!.subtreeHash)
    expect(find(after, "file:store.ts")!.subtreeHash).toBe(find(before, "file:store.ts")!.subtreeHash)
    expect(find(after, "b3")!.subtreeHash).toBe(find(before, "b3")!.subtreeHash)
    // teeth (breaks-on a spurious sibling re-hash): b2's hash would flip to bk-22x on an edit it never saw.
    expect(find(after, "b2")!.subtreeHash).toBe(sh("bk-22"))
  })

  it("SCN-INDEX-12a-1: each axis node carries rId (structure) and rState (status+freshness) — two distinct roots", () => {
    const node = nd("module:cas", "module", "sp-mod", [nd("b1", "block", "bk-11")])
    const api = createRollup(() => ({ node, state: { status: "active", freshness: 1 } }))
    const r1 = api.rollup("spatial", "module:cas")
    expect(r1.rId).not.toBe(r1.rState) // two distinct roots
    // a status flip moves rState, NEVER rId (structure) — the separation
    const api2 = createRollup(() => ({ node, state: { status: "stale", freshness: 1 } }))
    const r2 = api2.rollup("spatial", "module:cas")
    expect(r2.rId).toBe(r1.rId) // structure root invariant under a state flip
    expect(r2.rState).not.toBe(r1.rState) // state root changed
    // teeth (breaks-on a single combined hash): a status flip would change rId too — killed by r2.rId===r1.rId
  })

  it("SCN-INDEX-12e-1: the spatial rId re-hash is the changed leaf→root path only", () => {
    // the spatial rId of a node IS its subtreeHash — so the rId re-hash set == the re-hashed path.
    const { touched } = rehashPath(fixtureTree(), CAS_PATH, sh("bk-11x"))
    expect([...touched].sort()).toEqual([...CAS_PATH].sort())
    // teeth (breaks-on walking siblings): file:store.ts's rId must not be recomputed on this edit.
    expect(touched).not.toContain("file:store.ts")
  })
})

// ---- PROP-INDEX-2 — rollup determinism + edit-locality (∀-law, properties-idx.md#PROP-INDEX-2) ----

// arbitrary spatial trees (random depth/branching), with unique keys + leaf hashes; returns [tree, leafPaths].
type Skel = { readonly kids: readonly Skel[] }
type BuiltTree = { root: IndexNode; leafPaths: string[][] }
const skel = fc.memo(
  (n: number): fc.Arbitrary<Skel> =>
    n <= 1
      ? fc.constant<Skel>({ kids: [] })
      : fc.array(skel(n - 1), { minLength: 0, maxLength: 3 }).map((kids) => ({ kids })),
)
function arbTree(): fc.Arbitrary<BuiltTree> {
  return skel(4).map((s) => {
    let id = 0
    const toNode = (x: Skel): IndexNode => {
      const key = `n${id}`
      const hash = `h${id}`
      id++
      const children = x.kids.map(toNode)
      return nd(key, children.length === 0 ? "block" : "lvl", hash, children)
    }
    const root = toNode(s)
    const paths: string[][] = []
    const walk = (n: IndexNode, acc: string[]): void => {
      const p = [...acc, n.key]
      if (n.children.length === 0) paths.push(p)
      else n.children.forEach((c) => walk(c, p))
    }
    walk(root, [])
    return { root, leafPaths: paths }
  })
}

describe("PROP-INDEX-2 — rollup determinism + edit-locality (∀-law)", () => {
  it("determinism: subtreeHash is invariant under any permutation of children", () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.string({ minLength: 1 }), { minLength: 2, maxLength: 6 }), (hashes) => {
        const kids = hashes.map((x, i) => nd(`b${i}`, "block", x))
        const rev = [...kids].reverse()
        const shuf = [...kids].sort((a, b) => (a.key < b.key ? 1 : -1))
        const base = subtreeHash(nd("p", "file", "ignored", kids))
        expect(subtreeHash(nd("p", "file", "ignored", rev))).toBe(base)
        expect(subtreeHash(nd("p", "file", "ignored", shuf))).toBe(base)
      }),
    )
  })

  it("edit-locality: a single-leaf edit re-hashes exactly the leaf→root path, siblings byte-identical", () => {
    fc.assert(
      fc.property(
        arbTree().chain((t) =>
          fc.record({ t: fc.constant(t), pick: fc.integer({ min: 0, max: t.leafPaths.length - 1 }) }),
        ),
        ({ t, pick }) => {
          const path = t.leafPaths[pick]!
          const { root: after, touched } = rehashPath(t.root, path, sh(`edit-${pick}`))
          // touched == the leaf→root path, exactly
          expect([...touched].sort()).toEqual([...path].sort())
          // every node NOT on the path keeps its subtreeHash byte-identical
          const onPath = new Set(path)
          const check = (bn: IndexNode, an: IndexNode): void => {
            if (!onPath.has(bn.key)) expect(an.subtreeHash).toBe(bn.subtreeHash)
            bn.children.forEach((c, i) => check(c, an.children[i]!))
          }
          check(t.root, after)
        },
      ),
    )
  })
})
