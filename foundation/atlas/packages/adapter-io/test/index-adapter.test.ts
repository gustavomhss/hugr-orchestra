// @atlas/adapter-io — test/index-adapter.test.ts
//
// RED/GREEN for WP-9.1.1-b.INDEX — the index-backing adapter drives `@atlas/index` (pure delegation).
// Transcribes the frozen goldens SCN-ADAPTER-5a-1 (adapter output ≡ @atlas/index over the same inputs)
// and SCN-ADAPTER-5b-1 (every resolution originates in @atlas/index — a resolve call-spy proves it).
// Reuses the shared fixture harness `T_ref` / `expectedScipOutput`; the adapter is constructed with the
// REAL @atlas/index functions + `nodeHashOfPath = (p) => id({ file: p })` (the sealed-kernel keying).

import { describe, it, expect } from "vitest"
import { id } from "@atlas/kernel"
import type { Hash, NodeKey } from "@atlas/contracts"
import { build, createResolve, createDepgraph, createSymbolReverse } from "@atlas/index"
import type { AxisForest } from "@atlas/index"
import { createIndexAdapter } from "../src/index-adapter.js"
import { T_ref } from "./harness/fix-repo.js"
import { expectedScipOutput } from "./harness/fix-scip.js"

// The single cast helper, applied identically to the adapter side and the in-test oracle side (SCN-5a-1):
// Hash and NodeKey are same-string distinct brands.
const asNodeKeys = (hs: readonly Hash[]): readonly NodeKey[] => hs as unknown as readonly NodeKey[]

const nodeHashOfPath = (p: string): Hash => id({ file: p })

const realDeps = () => ({
  fileTree: T_ref,
  scipOutput: expectedScipOutput,
  build,
  createResolve,
  createDepgraph,
  createSymbolReverse,
  nodeHashOfPath,
})

describe("WP-9.1.1-b.INDEX — index-backing adapter (pure delegation)", () => {
  describe("SCN-ADAPTER-5a-1 — adapter output equals @atlas/index over the same inputs", () => {
    it("blastRadius delegates to @atlas/index reverse-closure identically", () => {
      const adapter = createIndexAdapter(realDeps())
      const axes = build(T_ref, expectedScipOutput)
      const expected = asNodeKeys(createDepgraph(axes.edges).reverseClosure(id({ file: "src/util.ts" })).closure)
      // greet is defined in util.ts + referenced from app.ts ⇒ app.ts depends on util.ts ⇒ util.ts's
      // blast radius contains app.ts's node hash (non-empty).
      expect(expected).not.toHaveLength(0)
      expect(expected).toContain(id({ file: "src/app.ts" }) as unknown as NodeKey)
      expect(adapter.blastRadius("src/util.ts")).toEqual(expected)
    })

    it("cover delegates to @atlas/index resolve identically", () => {
      const adapter = createIndexAdapter(realDeps())
      const axes = build(T_ref, expectedScipOutput)
      const forest: AxisForest = {
        spatial: axes.spatial,
        territory: axes.territory,
        dependency: axes.dependency,
      }
      const node = createResolve(forest).resolve("territory", "src")
      expect(node).toBeDefined()
      expect(adapter.cover("src")).toEqual({
        territory: node!.key,
        axisHash: node!.subtreeHash as unknown as Hash,
        invariants: [],
        stale: false,
      })
    })

    it("territories delegates to the @atlas/index territory axis (owner/globs projection only)", () => {
      const adapter = createIndexAdapter(realDeps())
      const axes = build(T_ref, expectedScipOutput)
      const expectedNames = axes.territory.children.map((n) => n.key)
      const got = adapter.territories(".")
      expect(got.map((t) => t.name)).toEqual(expectedNames)
      for (const t of got) {
        expect(t.owner).toBe("")
        expect(t.globs).toEqual([`${t.name}/**`])
      }
    })
  })

  describe("SCN-ADAPTER-5b-1 — every resolution originates in @atlas/index (resolve spy)", () => {
    it("cover calls @atlas/index resolve exactly once per call — nothing resolved in the adapter", () => {
      let resolveCalls = 0
      const spyDeps = {
        ...realDeps(),
        createResolve: (forest: AxisForest) => {
          const real = createResolve(forest)
          return {
            resolve: (axis: Parameters<typeof real.resolve>[0], key: string) => {
              resolveCalls += 1
              return real.resolve(axis, key)
            },
          }
        },
      }
      const adapter = createIndexAdapter(spyDeps)
      const cover = adapter.cover("src")
      expect(cover.territory).toBe("src")
      expect(resolveCalls).toBe(1)
    })
  })
})
