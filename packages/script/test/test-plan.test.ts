import { describe, expect, test } from "bun:test"
import { balance, packageLanes, packageShards, shardCount, suiteTimes, weigh, type Timings } from "../src/test-plan.ts"
import registry from "../../../script/module-registry.json"

describe("test shard planner", () => {
  test("package filters cover each registered package once and keep future packages in libs", () => {
    const packages = [...registry.modules.filter((entry) => entry.kind === "bun" && entry.scope === ".").map((entry) => entry.name), "@orchestra/future-package"]
    for (const [platform, host] of [["linux", "ubuntu-24.04"], ["windows", "windows-latest"]] as const) {
      const lanes = [
        { part: "core", filters: "--filter=@orchestra/core" },
        ...packageLanes(platform, host),
      ] as { part: string; filters?: string }[]
      for (const name of packages) {
        const selected = lanes.filter((lane) => {
          if (!lane.filters) return false
          const filters = lane.filters.split(" ").map((filter) => filter.slice("--filter=".length))
          const included = filters.filter((filter) => !filter.startsWith("!"))
          return (included.length === 0 || included.includes(name)) && !filters.includes(`!${name}`)
        }).map((lane) => lane.part)
        expect(selected).toHaveLength(platform === "windows" && name === "@orchestra/httpapi-codegen" ? 0 : 1)
        if (["@orchestra/desktop", "@orchestra/script"].includes(name))
          expect(selected).toEqual([platform === "linux" ? "packages-libs" : `windows-${name.slice("@orchestra/".length)}`])
        if (name === "@orchestra/future-package") expect(selected).toEqual([platform === "linux" ? "packages-libs" : "windows-libs"])
      }
    }
  })

  test("Windows dedicated lanes reuse the existing budget and Linux package lanes stay unchanged", () => {
    const linux = packageLanes("linux", "ubuntu-24.04")
    expect(linux.map((lane) => lane.part)).toEqual([
      "packages-app", "packages-cli", "packages-atlas", "packages-relay", "packages-libs", "gates", "httpapi", "sandbox",
    ])
    const windows = packageLanes("windows", "windows-latest") as { part: string; filters?: string; budget?: number }[]
    expect(windows.filter((lane) => ["windows-desktop", "windows-script", "windows-libs"].includes(lane.part)).map((lane) => lane.budget)).toEqual([15, 15, 15])
    const libs = windows.find((lane) => lane.part === "windows-libs")!
    expect(libs.filters).toContain("--filter=!@orchestra/desktop")
    expect(libs.filters).toContain("--filter=!@orchestra/script")
  })

  test("a platform's overhead scales its total before the shard count", () => {
    const timings: Timings = {
      target: { linux: 300, windows: 300, e2e: 300 },
      overhead: { linux: 1, windows: 1.6 },
      margin: 1,
      budget: { limit: 20, fixed: 4 },
      files: {},
      totals: { "packages/core": { linux: 900, windows: 900 } },
    }
    expect(packageShards(timings, "packages/core", "linux")).toBe(3)
    expect(packageShards(timings, "packages/core", "windows")).toBe(5)
    expect(packageShards(timings, "packages/missing", "windows")).toBe(1)
  })

  test("relay, gates and rollback never share a lane with a bulk package", () => {
    for (const [name, host] of [["linux", "ubuntu-24.04"], ["windows", "windows-latest"]] as const) {
      const lanes = packageLanes(name, host) as { part: string; filters?: string; turbo?: boolean; relay?: boolean; repo_gates?: boolean; rollback?: boolean }[]
      expect(new Set(lanes.map((lane) => lane.part)).size).toBe(lanes.length)
      for (const lane of lanes.filter((entry) => entry.relay || entry.repo_gates)) expect(lane.turbo).toBeUndefined()
      const rollback = lanes.filter((lane) => lane.rollback)
      expect(rollback.map((lane) => lane.filters)).toEqual(name === "windows" ? ["--filter=@orchestra/atlas-boundary"] : [])
      const libs = lanes.find((lane) => lane.part.endsWith("libs"))
      expect(libs?.filters).toContain("--filter=!@orchestra/atlas-boundary")
      expect(libs?.filters).toContain("--filter=!@orchestra/relay")
      expect(libs?.relay ?? libs?.repo_gates ?? libs?.rollback).toBeUndefined()
      expect((libs as { budget?: number }).budget).toBe(name === "windows" ? 15 : undefined)
    }
  })

  test("shard count follows the measured time and the target", () => {
    expect(shardCount(1139, 270, 1.15)).toBe(5)
    expect(shardCount(100, 270, 1.15)).toBe(1)
    expect(shardCount(0, 270, 1.15)).toBe(1)
  })

  test("longest-first packing keeps every file once and balances the bins", () => {
    const items = [100, 90, 80, 30, 20, 10, 5, 5].map((weight, index) => ({ name: `f${index}`, weight }))
    const bins = balance(items, 3)
    expect(bins.flatMap((bin) => bin.names).toSorted()).toEqual(items.map((item) => item.name).toSorted())
    const seconds = bins.map((bin) => bin.seconds)
    expect(Math.max(...seconds) - Math.min(...seconds)).toBeLessThanOrEqual(30)
    expect(balance(items, 3)).toEqual(bins)
  })

  test("the real core package is covered by its shards without overlap", () => {
    const weights = weigh("packages/core", {}, 1200)
    const bins = balance(weights, 5)
    expect(bins.flatMap((bin) => bin.names).toSorted()).toEqual(weights.map((entry) => entry.name).toSorted())
    expect(bins.every((bin) => bin.names.length > 0)).toBe(true)
  })

  test("a measured file keeps its time and an unmeasured one is scaled from it", () => {
    const weights = weigh("packages/core", { "test/session-runner.test.ts": 60 }, 1200)
    expect(weights.find((entry) => entry.name === "test/session-runner.test.ts")?.weight).toBe(60)
    expect(weights.every((entry) => entry.weight > 0)).toBe(true)
  })

  test("reads per-file times from Bun's JUnit suites and ignores describe blocks", () => {
    const xml = `<testsuites><testsuite name="test/a.test.ts" tests="2" time="1.25"><testsuite name="inner" time="1.0"/></testsuite>` +
      `<testsuite name="test\\b.test.ts" tests="1" time="0.5"/></testsuites>`
    expect(suiteTimes(xml)).toEqual([["test/a.test.ts", 1.25], ["test/b.test.ts", 0.5]])
  })
})
