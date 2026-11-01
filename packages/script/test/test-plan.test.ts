import { describe, expect, test } from "bun:test"
import { balance, shardCount, suiteTimes, weigh } from "../../../script/test-plan.ts"

describe("test shard planner", () => {
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
