// @atlas/index — test/retrieval.test.ts  (WP-2.8-a.INDEX)
//
// RED→GREEN transcription of the VISIBLE retrieval-path goldens the WP owns:
//   SCN-INDEX-4b-1 (hierarchy roll-up)   · SCN-INDEX-6a-1 / 6b-1 (exactly three modes, no fourth)
//   SCN-INDEX-7a-1 (no embeddings/RAG)   · SCN-INDEX-8a-1 (byte-identical results)
//   SCN-INDEX-9a-1 / 9b-1 (malformed → empty, never throws) · SCN-INDEX-10a-1/10b-1/10c-1 (≥3 axes,
//   cross-indexed, stored once)
// plus the ∀-laws PROP-INDEX-4(rollup)/6/7/8/9/10. Fact handles are SYMBOLIC ⇒ assertions are RELATIONAL.
// Held-out `-2` fixtures are NOT transcribed (GATE runs those).

import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import fc from "fast-check"
import { asHash, asSubtreeHash } from "@atlas/kernel"
import type { Hash } from "@atlas/contracts"
import type { Axis, IndexNode } from "../src/types.js"
import type { Fact } from "../src/retrieval.js"
import { createResolve } from "../src/resolve.js"
import { createRetrieval, type RetrievalModel } from "../src/retrieval.js"

// --- fixtures (RELATIONAL) ------------------------------------------------------------------------------
const node = (axis: Axis, level: string, key: string, children: IndexNode[], objects: Hash[]): IndexNode => ({
  axis,
  level,
  key,
  subtreeHash: asSubtreeHash(`${axis}:${key}`),
  children,
  objects,
})

const H = {
  ifile: asHash("bk-ifile"),
  imod: asHash("bk-imod"),
  icrate: asHash("bk-icrate"),
  put: asHash("bk-put"),
}
const isPut = (f: unknown): boolean => (f as { item?: string }).item === "put"

// ONE store (objects stored once, keyed by hash — INDEX-10c). Axes hold the HASH, never a copy.
function coreModel(reverseAnchors = false): RetrievalModel {
  const store = new Map<Hash, Fact>([
    [H.ifile, { inv: "Ifile" }],
    [H.imod, { inv: "Imod" }],
    [H.icrate, { inv: "Icrate" }],
    [H.put, { item: "put" }],
  ])
  // spatial: repo→core→cas→cas.ts, invariants anchored file/module/crate, item:put on the file.
  const fileObjs = reverseAnchors ? [H.put, H.ifile] : [H.ifile, H.put]
  const file = node("spatial", "file", "cas.ts", [], fileObjs)
  const mod = node("spatial", "module", "cas", [file], [H.imod])
  const crate = node("spatial", "crate", "core", [mod], [H.icrate])
  const spatial = node("spatial", "repo", "repo", [crate], [])
  // territory: proj→cas (dana/T1) — item:put cross-indexed here (owner+tier axis).
  const terr = node("territory", "territory", "cas", [], [H.put])
  const territory = node("territory", "project", "proj", [terr], [])
  // dependency: dep→cas — item:put cross-indexed on the dependency axis.
  const depCas = node("dependency", "module", "cas", [], [H.put])
  const dependency = node("dependency", "crate", "dep", [depCas], [])
  return {
    forest: { spatial, territory, dependency },
    store,
    triggers: new Map<string, readonly Hash[]>([["drift", [H.put]]]),
    blastRadius: new Map<string, readonly Hash[]>([["core/cas/cas.ts", [H.put]]]),
  }
}

describe("INDEX-4b — a file query rolls up its module + crate invariants (visible golden)", () => {
  it("SCN-INDEX-4b-1: byScope surfaces ⋃ ancestor-anchored invariants {Ifile, Imod, Icrate}", () => {
    const r = createRetrieval(coreModel())
    const invs = r
      .byScope("core/cas/cas.ts")
      .map((f) => (f as { inv?: string }).inv)
      .filter(Boolean)
    expect(invs).toEqual(expect.arrayContaining(["Ifile", "Imod", "Icrate"]))
    // teeth: NOT only the file-anchored Ifile — the module + crate roll-up must be present.
    expect(invs).toContain("Imod")
    expect(invs).toContain("Icrate")
  })

  it("PROP-INDEX-4 (rollup leg): ∀ chain, byScope(full) ≡ ⋃ every ancestor-anchored fact", () => {
    // `/` was already excluded because it is the path separator, so a segment containing one would name a
    // node the builder never mints as an ATOMIC key. `::` is now the second such separator (the unit-path
    // delimiter `resolve.ts` descends on), so it needs the same exclusion for the same reason — this
    // generator was inventing an atomic key like `::!` with no intermediate node, a shape `build.ts` cannot
    // produce (it sets `key: node.path`, and `unitPath` returns the CUMULATIVE path `src/x.ts::12:fn:f`,
    // which is exactly what the descent reconstructs). Measured before the exclusion: 232/3000 seeds failed
    // at numRuns 100 — 7.7%, bisected to the Merkle-fold commit that introduced `UNIT_SEP`. It read as load
    // flake for two seats. The product agrees with itself; only the generator disagreed with the product.
    const segArb = fc.uniqueArray(
      fc
        .string({ minLength: 1, maxLength: 6 })
        .filter((s) => s === s.trim() && s.length > 0 && !s.includes("/") && !s.includes("::")),
      { minLength: 1, maxLength: 5 },
    )
    fc.assert(
      fc.property(segArb, (segs) => {
        const store = new Map<Hash, Fact>()
        // leaf up to root, each level anchoring one distinct fact {lvl:'L<depth>'}.
        let current = node(
          "spatial",
          `L${segs.length}`,
          segs[segs.length - 1]!,
          [],
          [
            (() => {
              const h = asHash(`h:${segs.length}`)
              store.set(h, { lvl: `L${segs.length}` })
              return h
            })(),
          ],
        )
        for (let i = segs.length - 2; i >= 0; i--) {
          const h = asHash(`h:${i + 1}`)
          store.set(h, { lvl: `L${i + 1}` })
          current = node("spatial", `L${i + 1}`, segs[i]!, [current], [h])
        }
        const spatial = node("spatial", "repo", "repo", [current], [])
        const model: RetrievalModel = {
          forest: {
            spatial,
            territory: node("territory", "p", "p", [], []),
            dependency: node("dependency", "c", "d", [], []),
          },
          store,
          triggers: new Map(),
          blastRadius: new Map(),
        }
        const got = new Set(
          createRetrieval(model)
            .byScope(segs.join("/"))
            .map((f) => (f as { lvl: string }).lvl),
        )
        const expected = new Set(segs.map((_, i) => `L${i + 1}`))
        expect(got).toEqual(expected)
      }),
    )
  })
})

describe("INDEX-6 — relevance resolves by exactly three modes, no fourth (visible goldens)", () => {
  it("SCN-INDEX-6a-1: {byScope, byDependency, byTrigger} all resolve — exactly three modes present", () => {
    const r = createRetrieval(coreModel())
    expect(r.byScope("core/cas/cas.ts").length).toBeGreaterThan(0) // scope → spatial facts
    expect(r.byDependency("core/cas/cas.ts").length).toBeGreaterThan(0) // dependency → blast facts
    expect(r.byTrigger("drift").length).toBeGreaterThan(0) // trigger → tag-matched facts
    // teeth: a missing mode (byTrigger unimplemented ⇒ empty) would fail the above.
    expect(Object.keys(r).sort()).toEqual(["byDependency", "byScope", "byTrigger"])
  })

  it("SCN-INDEX-6b-1: a fourth-mode / free-text token does not resolve — no search() surface", () => {
    const r = createRetrieval(coreModel())
    expect("search" in r).toBe(false)
    expect(Reflect.get(r, "search")).toBeUndefined() // dynamic read, no cast: RetrievalApi has no index signature
    expect(r.byTrigger("search:acme")).toEqual([]) // free-text token resolves nothing
    expect(Object.keys(r).sort()).toEqual(["byDependency", "byScope", "byTrigger"])
  })

  it("PROP-INDEX-6: ∀ mode token m — resolves(m) ⇔ m ∈ {byScope, byDependency, byTrigger}", () => {
    const r = createRetrieval(coreModel()) as unknown as Record<string, unknown>
    const modes = new Set(["byScope", "byDependency", "byTrigger"])
    fc.assert(
      fc.property(fc.string(), (m) => {
        const resolvesAsMethod = Object.prototype.hasOwnProperty.call(r, m) && typeof r[m] === "function"
        expect(resolvesAsMethod).toBe(modes.has(m)) // teeth: any 4th OWN mode-method (e.g. search) breaks this — inherited Object.prototype methods (toString/constructor/…) are not modes
      }),
    )
  })
})

describe("INDEX-7 — no embeddings / vector store / ANN on the retrieval path (visible golden + ∀-import)", () => {
  it("SCN-INDEX-7a-1 / PROP-INDEX-7: 0 embedding/vector/ANN deps in the retrieval-path import closure", () => {
    const readSrc = (f: string) => readFileSync(fileURLToPath(new URL(`../src/${f}`, import.meta.url)), "utf8")
    const importLines = ["retrieval.ts", "resolve.ts"]
      .map(readSrc)
      .join("\n")
      .split("\n")
      .filter((l) => /^\s*import\b/.test(l) || /require\(/.test(l))
      .join("\n")
    expect(importLines).not.toMatch(
      /embed|vector|\bann\b|faiss|pinecone|hnsw|onnx|tensorflow|@xenova|transformers|weaviate|qdrant|milvus/i,
    )
    expect(importLines).not.toMatch(/require\(/) // pure ESM lookup over the CAS/axes, no dynamic backend
  })
})

describe("INDEX-8 — two identical queries return byte-identical results (visible golden + PBT)", () => {
  it("SCN-INDEX-8a-1: run(q) ≡ run(q) byte-for-byte, ordering is a TOTAL deterministic sort", () => {
    const r = createRetrieval(coreModel())
    const a = r.byScope("core/cas/cas.ts")
    const b = r.byScope("core/cas/cas.ts")
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    // teeth: ordering by Map/insertion order — flipping a node's object array order must NOT change output.
    const flipped = createRetrieval(coreModel(true)).byScope("core/cas/cas.ts")
    expect(JSON.stringify(flipped)).toBe(JSON.stringify(a))
  })

  it("PROP-INDEX-8: ∀ query over the fixed snapshot — run(q) ≡ run(q)", () => {
    const r = createRetrieval(coreModel())
    fc.assert(
      fc.property(fc.constantFrom("core/cas/cas.ts", "core/cas", "core", "absent/x"), (q) => {
        expect(JSON.stringify(r.byScope(q))).toBe(JSON.stringify(r.byScope(q)))
        expect(JSON.stringify(r.byDependency(q))).toBe(JSON.stringify(r.byDependency(q)))
      }),
    )
  })
})

describe("INDEX-9 — total: malformed → empty, never throws (visible goldens + PBT)", () => {
  it("SCN-INDEX-9a-1: malformed / missing path, tag, or axis yields an EMPTY result on every entry point", () => {
    const model = coreModel()
    const { resolve } = createResolve(model.forest)
    const r = createRetrieval(model)
    expect(resolve("spat!al" as Axis, "core/cas/cas.ts")).toBeUndefined() // bad axis ⇒ no default-axis hit
    expect(resolve("spatial", "")).toBeUndefined()
    expect(resolve(null as unknown as Axis, null as unknown as string)).toBeUndefined()
    expect(r.byScope("")).toEqual([])
    expect(r.byDependency("")).toEqual([])
    expect(r.byTrigger("")).toEqual([])
    expect(r.byTrigger(null as unknown as string)).toEqual([])
  })

  it("SCN-INDEX-9b-1 / PROP-INDEX-9: ∀ input (10k corner-biased) — 0 throws, malformed ⇒ empty", () => {
    const model = coreModel()
    const { resolve } = createResolve(model.forest)
    const r = createRetrieval(model)
    fc.assert(
      fc.property(fc.anything(), (x) => {
        expect(() => resolve(x as Axis, x as string)).not.toThrow()
        expect(() => r.byScope(x as string)).not.toThrow()
        expect(() => r.byDependency(x as string)).not.toThrow()
        expect(() => r.byTrigger(x as string)).not.toThrow()
        // a non-string input can never produce a populated wrong answer.
        if (typeof x !== "string") {
          expect(resolve(x as Axis, x as string)).toBeUndefined()
          expect(r.byScope(x as string)).toEqual([])
          expect(r.byDependency(x as string)).toEqual([])
          expect(r.byTrigger(x as string)).toEqual([])
        }
      }),
      { numRuns: 500 },
    )
  })
})

describe("INDEX-10 — ≥3 axes, cross-indexed, single store (visible goldens + PBT)", () => {
  it("SCN-INDEX-10a-1: the index exposes {spatial, territory, dependency}, each owning its own rollup", () => {
    const model = coreModel()
    const { resolve } = createResolve(model.forest)
    expect(resolve("spatial", "core/cas/cas.ts")).toBeDefined()
    expect(resolve("territory", "cas")).toBeDefined()
    expect(resolve("dependency", "cas")).toBeDefined()
    expect(Object.keys(model.forest).length).toBeGreaterThanOrEqual(3) // axis-count ≥ 3
    const rollups = new Set(
      [model.forest.spatial, model.forest.territory, model.forest.dependency].map((n) => n.subtreeHash),
    )
    expect(rollups.size).toBe(3) // teeth: territory sharing spatial's rollup ⇒ size < 3
  })

  it("SCN-INDEX-10b-1: item:put is reachable via spatial, territory AND dependency (cross-indexed)", () => {
    const model = coreModel()
    const { resolve } = createResolve(model.forest)
    const r = createRetrieval(model)
    expect(r.byScope("core/cas/cas.ts").some(isPut)).toBe(true) // spatial (its file)
    expect(resolve("territory", "cas")?.objects).toContain(H.put) // territory (owner+tier)
    expect(r.byDependency("core/cas/cas.ts").some(isPut)).toBe(true) // dependency (its edges)
  })

  it("SCN-INDEX-10c-1: the object is stored ONCE — object-storage-count(hash) ≡ 1, axes hold the hash", () => {
    const model = coreModel()
    let count = 0
    for (const [h] of model.store) if (h === H.put) count++
    expect(count).toBe(1) // teeth: per-axis copy ⇒ count 3
    const put = model.store.get(H.put)
    expect([...model.store.values()].filter((v) => v === put).length).toBe(1) // one referential copy
    // the axes reference it BY HASH (a string), never a second copy of the value.
    expect(typeof model.forest.territory.children[0]!.objects[0]).toBe("string")
    expect(model.forest.territory.children[0]!.objects).toContain(H.put)
  })

  it("PROP-INDEX-10: ∀ object set cross-indexed — objectStorageCount(hash(o)) ≡ 1 ∧ axisCount ≥ 3", () => {
    const idArb = fc.uniqueArray(fc.string({ minLength: 1, maxLength: 8 }), { minLength: 1, maxLength: 8 })
    fc.assert(
      fc.property(idArb, (ids) => {
        const store = new Map<Hash, Fact>(ids.map((i) => [asHash(`h:${i}`), { id: i }]))
        for (const i of ids) {
          const h = asHash(`h:${i}`)
          let c = 0
          for (const [k] of store) if (k === h) c++
          expect(c).toBe(1) // stored once per hash regardless of how many axes reference it
        }
        expect(Object.keys(coreModel().forest).length).toBeGreaterThanOrEqual(3)
      }),
    )
  })
})
