import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { balance, packageLanes, packageShards, plannedBins, shardCount, suiteTimes, weigh, type Timings } from "../src/test-plan.ts"

describe("test shard planner", () => {
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

  test("the windows libs budget does not also run the plugin compile", () => {
    const workflow = readFileSync(new URL("../../../.github/workflows/test.yml", import.meta.url), "utf8")
    const step = workflow.split("- name: Build Windows test dependencies")[1]?.split("- name:")[0] ?? ""
    const condition = step.match(/^\s*if: (.+)$/m)?.[1]
    const libs = packageLanes("windows", "windows-latest").find((lane) => lane.part.endsWith("libs")) as {
      budget?: number
      turbo?: boolean
    }
    expect(libs.turbo).toBe(true)
    expect(libs.budget).toBe(15)
    // 12 minutes of compile plus the 12-minute test step do not fit in 15. The step must not run there.
    expect(condition).toBe("runner.os == 'Windows' && matrix.turbo && !matrix.budget")
    expect(workflow).toContain("timeout-minutes: ${{ matrix.budget && 15 || (matrix.host == 'windows-latest' && matrix.turbo && 25 || 10) }}")
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

  test("a zero measurement does not stay zero when a floor is set", () => {
    const weights = weigh("packages/core", { "test/session-runner.test.ts": 0 }, 1200, 1)
    expect(weights.find((entry) => entry.name === "test/session-runner.test.ts")?.weight).toBe(1)
    expect(weights.every((entry) => entry.weight >= 1)).toBe(true)
  })

  test("core shards do not pile untimed files, and a multi-file bin stays under the step", () => {
    const timings = JSON.parse(readFileSync(new URL("../src/test-timings.json", import.meta.url), "utf8")) as Timings
    for (const platform of ["linux", "windows"] as const) {
      const bins = plannedBins(timings, "packages/core", platform)
      expect(Math.max(...bins.map((bin) => bin.names.length))).toBeLessThanOrEqual(120)
      expect(bins.filter((bin) => bin.names.length > 1).every((bin) => bin.seconds <= 280)).toBe(true)
      const bare = balance(
        weigh("packages/core", timings.files[`packages/core:${platform}`] ?? {}, timings.totals["packages/core"]?.[platform] ?? 0),
        packageShards(timings, "packages/core", platform),
      )
      expect(Math.max(...bare.map((bin) => bin.names.length))).toBeGreaterThan(120)
    }
  })

  test("reads per-file times from Bun's JUnit suites and ignores describe blocks", () => {
    const xml = `<testsuites><testsuite name="test/a.test.ts" tests="2" time="1.25"><testsuite name="inner" time="1.0"/></testsuite>` +
      `<testsuite name="test\\b.test.ts" tests="1" time="0.5"/></testsuites>`
    expect(suiteTimes(xml)).toEqual([["test/a.test.ts", 1.25], ["test/b.test.ts", 0.5]])
  })
})
