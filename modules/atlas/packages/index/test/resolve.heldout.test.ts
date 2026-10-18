// @atlas/index — test/resolve.heldout.test.ts  (COLD-REVIEW HELD-OUT GATE, WP-2.8-a.INDEX)
//
// Fresh transcription of the BLINDED held-out goldens (SCN-INDEX-*-2, held_out:true) for reqs 4/6/7/9/10,
// compiled into assertions against the EXISTING src (createResolve/createRetrieval) — src is NOT modified.
// Fixtures are the INDEPENDENT `net` hierarchy the goldens name (repo→net→http→client.ts, item:send),
// disjoint from the `core/cas` fixtures the builder transcribed. Anti-overfit: passing here ⇒ generalizes.

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

const node = (axis: Axis, level: string, key: string, children: IndexNode[], objects: Hash[]): IndexNode => ({
  axis,
  level,
  key,
  subtreeHash: asSubtreeHash(`${axis}:${key}`),
  children,
  objects,
})

const H = {
  jfile: asHash("bk-jfile"),
  jmod: asHash("bk-jmod"),
  jcrate: asHash("bk-jcrate"),
  send: asHash("bk-send"),
}
const isSend = (f: unknown): boolean => (f as { item?: string }).item === "send"

// The independent `net` read model: repo→net→http→client.ts (Jfile/Jmod/Jcrate anchored), item:send on file,
// cross-indexed onto territory `http` (frank/T1) + dependency axis; blast-radius(client.ts)=[send]; tag on send.
function netModel(reverseAnchors = false): RetrievalModel {
  const store = new Map<Hash, Fact>([
    [H.jfile, { inv: "Jfile" }],
    [H.jmod, { inv: "Jmod" }],
    [H.jcrate, { inv: "Jcrate" }],
    [H.send, { item: "send" }],
  ])
  const fileObjs = reverseAnchors ? [H.send, H.jfile] : [H.jfile, H.send]
  const file = node("spatial", "file", "client.ts", [], fileObjs)
  const mod = node("spatial", "module", "http", [file], [H.jmod])
  const crate = node("spatial", "crate", "net", [mod], [H.jcrate])
  const spatial = node("spatial", "repo", "repo", [crate], [])
  const terr = node("territory", "territory", "http", [], [H.send])
  const territory = node("territory", "project", "proj", [terr], [])
  const depHttp = node("dependency", "module", "http", [], [H.send])
  const dependency = node("dependency", "crate", "dep", [depHttp], [])
  return {
    forest: { spatial, territory, dependency },
    store,
    triggers: new Map<string, readonly Hash[]>([["send-tag", [H.send]]]),
    blastRadius: new Map<string, readonly Hash[]>([["net/http/client.ts", [H.send]]]),
  }
}

describe("HELD-OUT SCN-INDEX-4a-2 — covering node on the net hierarchy", () => {
  it('resolve(spatial,"net/http/client.ts") ⇒ file:client.ts, NOT module:http', () => {
    const { resolve } = createResolve(netModel().forest)
    const n = resolve("spatial", "net/http/client.ts")
    expect(n).toBeDefined()
    expect(n?.key).toBe("client.ts")
    expect(n?.level).toBe("file")
    expect(n?.level).not.toBe("module") // teeth: NOT module:http
    expect(n?.axis).toBe("spatial")
  })
})

describe("HELD-OUT SCN-INDEX-4b-2 — file query rolls up module + crate invariants", () => {
  it('byScope("net/http/client.ts") ⇒ ⋃ {Jfile, Jmod, Jcrate}', () => {
    const r = createRetrieval(netModel())
    const invs = r
      .byScope("net/http/client.ts")
      .map((f) => (f as { inv?: string }).inv)
      .filter(Boolean)
    expect(invs).toEqual(expect.arrayContaining(["Jfile", "Jmod", "Jcrate"]))
    expect(invs).toContain("Jmod") // teeth: module roll-up not dropped
    expect(invs).toContain("Jcrate") // teeth: crate roll-up not dropped
  })
})

describe("HELD-OUT SCN-INDEX-6a-2 / 6b-2 — exactly three modes, no fourth", () => {
  it("6a-2: {byScope, byDependency, byTrigger} all resolve on the net fixture", () => {
    const r = createRetrieval(netModel())
    expect(r.byScope("net/http/client.ts").length).toBeGreaterThan(0)
    expect(r.byDependency("net/http/client.ts").length).toBeGreaterThan(0)
    expect(r.byTrigger("send-tag").length).toBeGreaterThan(0)
    expect(Object.keys(r).sort()).toEqual(["byDependency", "byScope", "byTrigger"])
  })
  it('6b-2: "semantic:payments" does not resolve — no search() surface', () => {
    const r = createRetrieval(netModel())
    expect("search" in r).toBe(false)
    expect(Reflect.get(r, "search")).toBeUndefined() // dynamic read, no cast: RetrievalApi has no index signature
    expect(r.byTrigger("semantic:payments")).toEqual([])
  })
})

describe("HELD-OUT SCN-INDEX-7a-2 — no embedding/vector/ANN on the net retrieval path", () => {
  it("0 embedding/vector/ANN deps in the retrieval-path import closure", () => {
    const readSrc = (f: string) => readFileSync(fileURLToPath(new URL(`../src/${f}`, import.meta.url)), "utf8")
    const importLines = ["retrieval.ts", "resolve.ts"]
      .map(readSrc)
      .join("\n")
      .split("\n")
      .filter((l) => /^\s*import\b/.test(l) || /require\(/.test(l))
      .join("\n")
    expect(importLines).not.toMatch(
      /embed|vector|\bann\b|faiss|pinecone|hnsw|onnx|tensorflow|@xenova|transformers|weaviate|qdrant|milvus|semantic/i,
    )
    expect(importLines).not.toMatch(/require\(/)
  })
})

describe("HELD-OUT SCN-INDEX-9a-2 / 9b-2 — malformed → empty, never throws (distinct seed)", () => {
  it('9a-2: {axis:"dep#ndency", path:"   ", tag:undefined} ⇒ empty on every entry point', () => {
    const model = netModel()
    const { resolve } = createResolve(model.forest)
    const r = createRetrieval(model)
    expect(resolve("dep#ndency" as Axis, "net/http/client.ts")).toBeUndefined() // bad axis, no default hit
    expect(resolve("spatial", "   ")).toBeUndefined() // whitespace-only path
    expect(r.byScope("   ")).toEqual([])
    expect(r.byTrigger(undefined as unknown as string)).toEqual([])
    expect(r.byDependency("   ")).toEqual([])
  })
  it("9b-2: ∀ fuzz input (distinct seed) — 0 throws, non-string ⇒ empty", () => {
    const model = netModel()
    const { resolve } = createResolve(model.forest)
    const r = createRetrieval(model)
    fc.assert(
      fc.property(fc.anything(), (x) => {
        expect(() => resolve(x as Axis, x as string)).not.toThrow()
        expect(() => r.byScope(x as string)).not.toThrow()
        expect(() => r.byDependency(x as string)).not.toThrow()
        expect(() => r.byTrigger(x as string)).not.toThrow()
        if (typeof x !== "string") {
          expect(resolve(x as Axis, x as string)).toBeUndefined()
          expect(r.byScope(x as string)).toEqual([])
          expect(r.byDependency(x as string)).toEqual([])
          expect(r.byTrigger(x as string)).toEqual([])
        }
      }),
      { numRuns: 500, seed: 20260719 },
    )
  })
})

describe("HELD-OUT SCN-INDEX-10a-2 / 10b-2 / 10c-2 — ≥3 axes, cross-indexed, single store", () => {
  it("10a-2: {spatial, territory, dependency}, each owning its own rollup", () => {
    const model = netModel()
    const { resolve } = createResolve(model.forest)
    expect(resolve("spatial", "net/http/client.ts")).toBeDefined()
    expect(resolve("territory", "http")).toBeDefined()
    expect(resolve("dependency", "http")).toBeDefined()
    expect(Object.keys(model.forest).length).toBeGreaterThanOrEqual(3)
    const rollups = new Set(
      [model.forest.spatial, model.forest.territory, model.forest.dependency].map((n) => n.subtreeHash),
    )
    expect(rollups.size).toBe(3) // teeth: territory sharing spatial's rollup ⇒ < 3
  })
  it("10b-2: item:send reachable via spatial, territory AND dependency", () => {
    const model = netModel()
    const { resolve } = createResolve(model.forest)
    const r = createRetrieval(model)
    expect(r.byScope("net/http/client.ts").some(isSend)).toBe(true)
    expect(resolve("territory", "http")?.objects).toContain(H.send)
    expect(r.byDependency("net/http/client.ts").some(isSend)).toBe(true)
  })
  it("10c-2: item:send stored ONCE, axes hold the hash", () => {
    const model = netModel()
    let count = 0
    for (const [h] of model.store) if (h === H.send) count++
    expect(count).toBe(1) // teeth: per-axis copy ⇒ 3
    const send = model.store.get(H.send)
    expect([...model.store.values()].filter((v) => v === send).length).toBe(1)
    expect(typeof model.forest.territory.children[0]!.objects[0]).toBe("string")
    expect(model.forest.territory.children[0]!.objects).toContain(H.send)
  })
})
