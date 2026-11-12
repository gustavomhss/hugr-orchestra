import { expect, test } from "bun:test"
import { Effect } from "effect"
import { ReviewFanoutV2 } from "../src/v2/workflow/review-fanout"
import { brief, harness, run } from "./fixture/lucy-fanout"

test("coverage reports a lens removed by the host route cap", () =>
  run((directory) => Effect.gen(function* () {
    const h = yield* harness(directory, "capcoverage")
    const input = h.input("standard")
    const catalog = {
      ...input.catalog,
      overlays: [...input.catalog.overlays, { id: "cap-coverage", paths: ["src/**"], content: [], lenses: ["change"], checks: [] }],
      route: {
        ...input.catalog.route,
        tiers: input.catalog.route.tiers.map((tier) => tier.id === "standard" ? { ...tier, budget: { ...tier.budget, lenses: { ...tier.budget.lenses, max: 5 } } } : tier),
      },
    }
    const result = yield* ReviewFanoutV2.run({ ...input, catalog }, h.port)
    if (result.status !== "ran") throw new Error("expected a run")
    expect(h.calls.some((call) => call.startsWith("create:lens:change:"))).toBe(false)
    const finish = brief(h.briefs, "lead:finish")
    const text = finish.split("Coverage the host recorded:\n")[1]?.split("\n")[0]
    if (!text) throw new Error("host coverage missing")
    const coverage: { notExamined: { item: string; reason: string }[] } = JSON.parse(text)
    expect(coverage.notExamined.filter((item) => item.item === "lens:change")).toEqual([{ item: "lens:change", reason: "budget" }])
  })),
)
