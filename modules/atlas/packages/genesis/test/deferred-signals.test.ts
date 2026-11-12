import { describe, expect, it } from "vitest"
import { asHash, asSubtreeHash } from "@atlas/kernel"
import type { StructRef } from "@atlas/contracts"
import { createMine } from "../src/rank.js"
import type { HistorySource } from "../src/rank.js"
import type { MinedSignals, Skeleton } from "../src/types.js"

// Five tied file sites, as in provable-frontier: real ranking, no history IO or model.
const sites: readonly StructRef[] = ["a", "b", "c", "d", "e"].map((name): StructRef => ({
  kind: "file", qualifiedPath: `${name}.ts`, subtreeHash: asSubtreeHash(`st-${name}`),
}))
const root: Skeleton["axes"]["spatial"] = {
  axis: "spatial", level: "repo", key: ".", subtreeHash: asSubtreeHash("st-root"), objects: [],
  children: sites.map((site): Skeleton["axes"]["spatial"] => ({
    axis: "spatial", level: "file", key: site.qualifiedPath, subtreeHash: site.subtreeHash,
    children: [], objects: [],
  })),
}
const skeleton = { skeleton: (): Skeleton => ({
  axes: { spatial: root, territory: root, dependency: root, edges: [] }, manifest: { territories: [] },
}) }
const exact = (site: StructRef): MinedSignals => ({
  hotspot: sites.indexOf(site) + 1, szzBugCommits: sites.indexOf(site) + 2,
  coChanged: [sites[(sites.indexOf(site) + 1) % sites.length]!],
  owners: [`owner:${site.qualifiedPath}`], messages: [`history:${site.qualifiedPath}`],
})
function observed() {
  const reads: StructRef[] = []
  const history: HistorySource = {
    commitCount: () => 5, shallow: () => false, blameConcentration: () => 0, frontier: () => sites,
    signals: (site) => { reads.push(site); return exact(site) },
  }
  return { reads, history }
}

describe("exact deferred history signals", () => {
  it("keeps the default eager and exact at every ranked site", () => {
    const source = observed()
    const ranked = createMine({ skeleton, history: source.history }).mine("/repo", "HEAD")
    expect(source.reads).toEqual(ranked.map((c) => c.site))
    expect(ranked).toHaveLength(5)
    ranked.forEach((c) => expect(c.signals).toEqual(exact(c.site)))
    expect(source.reads).toHaveLength(5)
  })

  it("defers all reads, memoizes each candidate, and preserves the exact unvisited tail", () => {
    const source = observed()
    const ranked = createMine({ skeleton, history: source.history, deferSignals: true }).mine("/repo", "HEAD")
    expect(ranked).toHaveLength(5)
    expect(source.reads).toEqual([])
    const first = ranked[0]!.signals
    expect(first).toEqual(exact(ranked[0]!.site))
    expect(ranked[0]!.signals).toBe(first)
    expect(source.reads).toEqual([ranked[0]!.site])
    const tail = ranked[4]!.signals
    expect(tail).toEqual(exact(ranked[4]!.site))
    expect(ranked[4]!.signals).toBe(tail)
    expect(source.reads).toEqual([ranked[0]!.site, ranked[4]!.site])
  })

  it("materializes the full eager JSON/rank output and leaves structural fallback at ZERO without history reads", () => {
    const source = observed()
    const eager = createMine({ skeleton, history: observed().history }).mine("/repo", "HEAD")
    const lazy = createMine({ skeleton, history: source.history, deferSignals: true }).mine("/repo", "HEAD")
    expect(lazy.map((c) => [c.site, c.rank, c.ppr])).toEqual(eager.map((c) => [c.site, c.rank, c.ppr]))
    expect(source.reads).toEqual([])
    expect(JSON.stringify(lazy)).toBe(JSON.stringify(eager))
    expect(lazy).toEqual(eager)
    expect(source.reads).toEqual(lazy.map((c) => c.site))
    const structural = skeleton.skeleton()
    for (const thin of [false, true]) {
      const fallback = observed()
      const ranked = createMine({ skeleton: { skeleton: () => ({ ...structural, axes: {
        ...structural.axes, edges: [{ from: asHash("a.ts"), to: asHash("b.ts"), kind: "resolved" }],
      } }) }, deferSignals: true, history: {
        ...fallback.history, commitCount: () => thin ? 0 : 5, frontier: () => [],
      } }).mine("/repo", "HEAD")
      expect(ranked.length).toBeGreaterThan(0)
      ranked.forEach((c) => expect(c.signals).toEqual({
        hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [],
      }))
      expect(fallback.reads).toEqual([])
    }
  })
})
