import { expect, test } from "bun:test"
import { parseOptions, selectedScenarios } from "./httpapi-exercise/routing"

const scenarios = Array.from({ length: 7 }, (_, index) => ({
  kind: "todo" as const,
  method: "GET" as const,
  path: "/cases/" + index,
  name: "case" + index,
  reason: "selection fixture",
}))

test("effect shards preserve every scenario exactly once and keep original order", () => {
  const parts = [1, 2, 3].map((index) => selectedScenarios(parseOptions(["--mode", "effect", "--shard", index + "/3"]), scenarios))
  expect(parts.map((part) => part.map((scenario) => scenario.name))).toEqual([
    ["case0", "case3", "case6"], ["case1", "case4"], ["case2", "case5"],
  ])
  expect(parts.flat().map((scenario) => scenario.name).toSorted()).toEqual(scenarios.map((scenario) => scenario.name))
  expect(new Set(parts.flat().map((scenario) => scenario.name)).size).toBe(scenarios.length)
  expect(selectedScenarios(parseOptions([]), scenarios)).toEqual(scenarios)
  expect(selectedScenarios(parseOptions(["--shard", "1/1"]), scenarios)).toEqual(scenarios)
})

test("shards partition the selected include and range rather than dropping its boundaries", () => {
  const args = ["--include", "case", "--start-at", "case1", "--stop-at", "case5"]
  expect(selectedScenarios(parseOptions([...args, "--shard", "1/2"]), scenarios).map((scenario) => scenario.name)).toEqual(["case1", "case3", "case5"])
  expect(selectedScenarios(parseOptions([...args, "--shard", "2/2"]), scenarios).map((scenario) => scenario.name)).toEqual(["case2", "case4"])
})

test.each(["0/2", "3/2", "1/0", "1.5/2", "1/-2", "1/2/3", "x", "1/9007199254740992"])("invalid shard %s is refused", (shard) => {
  expect(() => parseOptions(["--shard", shard])).toThrow()
})

test("missing shard value and an empty selected shard fail instead of passing no work", () => {
  expect(() => parseOptions(["--shard"])).toThrow()
  expect(() => selectedScenarios(parseOptions(["--shard", "8/8"]), scenarios)).toThrow()
})

test.each(["coverage", "auth"])("inventory mode %s remains full and rejects effect sharding", (mode) => {
  expect(selectedScenarios(parseOptions(["--mode", mode]), scenarios)).toEqual(scenarios)
  expect(() => parseOptions(["--mode", mode, "--shard", "1/2"])).toThrow()
})
