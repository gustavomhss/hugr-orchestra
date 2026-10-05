// @atlas/index — test/fold.test.ts  (WP-2.7-a.INDEX)
//
// RED→GREEN transcription of the VISIBLE goldens for the structural-fold arm:
//   SCN-INDEX-12b-1 (Delta distinguishes structure from state), 12c-1 (Delta names exactly the changed
//   buckets), 12d-1 (a re-check touches only affected buckets, never N), 12f-1 (dependency rState eager
//   re-hash bounded, never O(blast-radius)) — plus the structural half of ∀-law PROP-INDEX-12
//   (boundedness ≤ nodes-within-maxHops(2), independent of blast-radius; Delta bucket-naming == leaf→root).
// Golden ids SYMBOLIC ⇒ RELATIONAL assertions only. The drift/dirty-bit half of PROP-INDEX-12
// (propagateDirty full closure, lazy on-read rState, state-suspect) is WP-2.7-b's concern — NOT here.
//
// MODELING NOTE (disciplined-judgment, flagged for DEFINE ratification): the frozen `delta(before,after)`
// input is `Axes` (src/fold.ts), whose `IndexNode` carries STRUCTURE (`subtreeHash`) + the anchored CAS
// `objects`, but no separate status/freshness field. Per SCN-INDEX-12b the STATE half of the dual rollup
// is modeled by the append-only `objects` payload: a status/freshness change lands a NEW content-addressed
// object version (objects[] changes) while the node's structural `subtreeHash` is invariant — so `delta`
// reads idChanged from `subtreeHash` and stateChanged from `objects`. This is faithful to the append-only
// CAS and satisfies 12b within the frozen types; the state-carrier proper (rState side-index) is 2.7-b.

import { describe, it, expect } from "vitest"
import fc from "fast-check"
import { asHash, asSubtreeHash } from "@atlas/kernel"
import type { Hash, SubtreeHash } from "@atlas/contracts"
import type { Axes, Axis, DepEdge, IndexNode } from "../src/types.js"
import { delta, eagerRehashState, MAX_HOPS } from "../src/fold.js"
import { rehashPath } from "../src/rollup.js"

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
function axes(spatial: IndexNode, edges: DepEdge[] = []): Axes {
  return {
    spatial,
    territory: nd("t", "territory", "tr-root", [], [], "territory"),
    dependency: nd("d", "dependency", "dp-root", [], [], "dependency"),
    edges,
  }
}

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

describe("INDEX-12 — Delta + bounded re-check (visible goldens)", () => {
  it("SCN-INDEX-12b-1: a Delta distinguishes a structure change from a state change", () => {
    // only a status flipped on item:put (a new object version) — no structural change (subtreeHash fixed)
    const putBefore = nd("item:put", "item", "st-put", [], [h("obj-v1")])
    const putAfter = nd("item:put", "item", "st-put", [], [h("obj-v2")])
    const before = axes(nd("module:cas", "module", "st-mod", [putBefore]))
    const after = axes(nd("module:cas", "module", "st-mod", [putAfter]))
    const d = delta(before, after)
    expect(d.idChanged).toBe(false) // structure unchanged
    expect(d.stateChanged).toBe(true) // state changed
    // teeth (breaks-on any state flip also setting idChanged): killed by idChanged===false above.
  })

  it("SCN-INDEX-12c-1: the Delta names exactly the changed buckets", () => {
    const before = fixtureTree()
    const { root: after } = rehashPath(before, CAS_PATH, sh("bk-11x"))
    const d = delta(axes(before), axes(after))
    expect(new Set(d.changedBuckets)).toEqual(new Set(CAS_PATH)) // exactly the affected buckets
    expect(d.idChanged).toBe(true)
    // teeth (breaks-on listing every bucket): unaffected file:store.ts must NOT appear.
    expect(d.changedBuckets).not.toContain("file:store.ts")
    expect(d.changedBuckets).not.toContain("b2")
  })

  it("SCN-INDEX-12d-1: a re-check touches only the affected buckets, never N", () => {
    const b1 = nd("b1", "block", "bk-11")
    const fileCas = nd("file:cas.ts", "file", "sp-cas", [b1])
    const siblings = Array.from({ length: 495 }, (_, i) => nd(`file:s${i}`, "file", `sp-s${i}`))
    const modCas = nd("module:cas", "module", "sp-mod", [fileCas, ...siblings])
    const crate = nd("crate:core", "crate", "sp-crate", [modCas])
    const repo = nd("repo:atlas", "repo", "sp-repo", [crate]) // total buckets == 500
    const { root: after } = rehashPath(repo, CAS_PATH, sh("bk-11x"))
    const d = delta(axes(repo), axes(after))
    // touch-count == 5 (the changed leaf→root path), never 500 — independent of N
    expect(d.changedBuckets).toHaveLength(5)
    expect(new Set(d.changedBuckets)).toEqual(new Set(CAS_PATH))
    // teeth (breaks-on folding the whole store): changedBuckets would be 500.
  })

  it("SCN-INDEX-12f-1: the dependency rState eager re-hash is bounded, never O(blast-radius)", () => {
    // reverse-closure chain A←B←C←D←E (blast-radius 4), edit at A
    const edges: DepEdge[] = [
      { from: h("B"), to: h("A"), kind: "resolved" },
      { from: h("C"), to: h("B"), kind: "resolved" },
      { from: h("D"), to: h("C"), kind: "resolved" },
      { from: h("E"), to: h("D"), kind: "resolved" },
    ]
    const touched = eagerRehashState(h("A"), edges)
    // eager re-hash count ≤ |nodes-within-maxHops(2)| = 2 (B, C), never 4
    expect(touched.length).toBeLessThanOrEqual(2)
    expect(touched).toContain(h("B"))
    expect(touched).toContain(h("C"))
    // teeth (breaks-on eagerly re-hashing the whole reverse closure): D, E beyond maxHops=2 stay untouched.
    expect(touched).not.toContain(h("D"))
    expect(touched).not.toContain(h("E"))
    expect(MAX_HOPS).toBe(2)
  })
})

// ---- PROP-INDEX-12 (structural half) — bounded re-check, never O(blast-radius) (∀-law) ----

describe("PROP-INDEX-12 — boundedness + bucket-naming (∀-law, structural half)", () => {
  it("∀ chain of length L, an edit at the head eagerly re-hashes ≤ nodes-within-maxHops(2), independent of L", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 30 }), (L) => {
        const nodes = Array.from({ length: L + 1 }, (_, i) => h(`n${i}`))
        const edges: DepEdge[] = []
        for (let i = 0; i < L; i++) edges.push({ from: nodes[i + 1]!, to: nodes[i]!, kind: "resolved" })
        const touched = eagerRehashState(nodes[0]!, edges)
        expect(touched.length).toBeLessThanOrEqual(2) // never grows with L (never O(blast-radius))
        expect(new Set(touched)).toEqual(new Set([nodes[1]!, nodes[2]!])) // exactly the within-2-hop dependents
      }),
    )
  })

  it("∀ branching DAG, the eager set == the exact within-2-hop reverse closure, never deeper", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 4 }), fc.integer({ min: 2, max: 4 }), (width, extra) => {
        // A has `width` direct dependents; each has `extra` dependents (hop 2); each of those has 1 (hop 3)
        const edges: DepEdge[] = []
        const hop1 = Array.from({ length: width }, (_, i) => h(`b${i}`))
        const hop2: Hash[] = []
        const hop3: Hash[] = []
        hop1.forEach((b) => edges.push({ from: b, to: h("A"), kind: "resolved" }))
        hop1.forEach((b, i) => {
          for (let j = 0; j < extra; j++) {
            const c = h(`c${i}_${j}`)
            hop2.push(c)
            edges.push({ from: c, to: b, kind: "resolved" })
            const dNode = h(`d${i}_${j}`)
            hop3.push(dNode)
            edges.push({ from: dNode, to: c, kind: "resolved" })
          }
        })
        const touched = new Set(eagerRehashState(h("A"), edges))
        expect(touched).toEqual(new Set([...hop1, ...hop2])) // exactly hops 1..2
        for (const d of hop3) expect(touched.has(d)).toBe(false) // hop 3 never eagerly re-hashed
      }),
    )
  })

  it("bucket-naming: ∀ single-leaf edit, delta names exactly the leaf→root path (idChanged, siblings excluded)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 3 }), fc.integer({ min: 2, max: 4 }), (depth, branch) => {
        let id = 0
        const build = (d: number): IndexNode => {
          const key = `n${id++}`
          if (d === 0) return nd(key, "block", `h-${key}`)
          const kids = Array.from({ length: branch }, () => build(d - 1))
          return nd(key, "lvl", `h-${key}`, kids)
        }
        const before = build(depth)
        // walk down the FIRST child each level to a leaf → the path we edit
        const path: string[] = []
        let cur: IndexNode = before
        path.push(cur.key)
        while (cur.children.length > 0) {
          cur = cur.children[0]!
          path.push(cur.key)
        }
        const { root: after } = rehashPath(before, path, sh(`edit-${path.length}`))
        const d = delta(axes(before), axes(after))
        expect(new Set(d.changedBuckets)).toEqual(new Set(path)) // exactly the leaf→root path
        expect(d.idChanged).toBe(true)
      }),
    )
  })
})
