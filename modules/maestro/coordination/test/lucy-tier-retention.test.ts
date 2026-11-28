import { expect, test } from "bun:test"
import { Effect } from "effect"
import { ReviewCatalog } from "@orchestra/core/review/catalog"
import type { ReviewResultV2 } from "../src/v2/governance/review-result"
import { ReviewFanoutV2 } from "../src/v2/workflow/review-fanout"
import { brief, harness, run } from "./fixture/lucy-fanout"

test("a retained Standard round does not upgrade when Deep later becomes built", () =>
  run((directory) =>
    Effect.gen(function* () {
      const opened = yield* harness(directory, "tier_deep")
      const input = opened.input("deep")
      const round = yield* ReviewFanoutV2.run({
        ...input,
        catalog: {
          ...input.catalog,
          route: {
            ...input.catalog.route,
            tiers: input.catalog.route.tiers.map((tier) => tier.id === "deep" ? { ...tier, built: false, runs: "standard" } : tier),
          },
        },
      }, opened.port)
      if (round.status !== "ran") throw new Error("expected a run")
      expect(round.method).toBe("review-v2/code/standard")
      expect(round.routing.tier.id).toBe("standard")
      expect(round.routing.tier.requested).toBe("deep")
      const findings: ReadonlyArray<ReviewResultV2.Finding> = []
      const firstRound = { routing: round.routing, findings, reviewed: "tree-1", executionTier: "standard" }
      const builtDeep = {
        ...input.catalog,
        route: {
          ...input.catalog.route,
          tiers: input.catalog.route.tiers.map((tier) => tier.id === "deep" ? { ...tier, built: true, runs: "deep" } : tier),
        },
      }
      const kept = yield* harness(directory, "tier_keep")
      const result = yield* ReviewFanoutV2.run(kept.input(undefined, {
        catalog: builtDeep,
        request: { stage: "code", profile: "rereview", firstRound: "standard", settings: { acceptedUnavailable: [] } },
        reviewed: "tree-2",
        firstRound,
      }), kept.port)
      if (result.status !== "ran") throw new Error("expected a run")
      expect(result.method).toBe("review-v2/rereview/standard")
      expect(result.routing.tier).toEqual(round.routing.tier)
      const analyzed = kept.analyzed[0]
      if (!analyzed) throw new Error("rereview did not analyze")
      expect(analyzed.executionTier).toBe(firstRound.executionTier)
      const finish = brief(kept.briefs, "lead:finish")
      expect(finish.startsWith("Stage: finish")).toBe(true)
      expect(finish.startsWith("Stage: hunt")).toBe(false)
    }),
  ))

test("a retained Standard tier that is unbuilt or gone is refused before analysis or a child", () =>
  run((directory) =>
    Effect.gen(function* () {
      const quick = ReviewCatalog.current.route.tiers.find((tier) => tier.id === "quick")
      const standard = ReviewCatalog.current.route.tiers.find((tier) => tier.id === "standard")
      if (!quick || !standard) throw new Error("catalog controls missing")
      expect(quick.built).toBe(true)
      expect(standard.built).toBe(true)
      const opened = yield* harness(directory, "tier_open")
      const round = yield* ReviewFanoutV2.run(opened.input("standard"), opened.port)
      if (round.status !== "ran") throw new Error("expected a run")
      const findings: ReadonlyArray<ReviewResultV2.Finding> = []
      const firstRound = { routing: round.routing, findings, reviewed: "tree-1", executionTier: "standard" }
      const drifted = [
        {
          prefix: "tier_quick",
          catalog: {
            ...ReviewCatalog.current,
            route: {
              ...ReviewCatalog.current.route,
              tiers: ReviewCatalog.current.route.tiers.map((tier) => tier.id === "standard" ? { ...tier, built: false, runs: "quick" } : tier),
            },
          },
        },
        {
          prefix: "tier_gone",
          catalog: {
            ...ReviewCatalog.current,
            route: {
              ...ReviewCatalog.current.route,
              tiers: ReviewCatalog.current.route.tiers.filter((tier) => tier.id !== "standard"),
            },
          },
        },
      ]
      yield* Effect.forEach(drifted, (item) => Effect.gen(function* () {
        const next = yield* harness(directory, item.prefix)
        const message = yield* ReviewFanoutV2.run(next.input(undefined, {
          catalog: item.catalog,
          request: { stage: "code", profile: "rereview", firstRound: "standard", settings: { acceptedUnavailable: [] } },
          reviewed: "tree-2",
          firstRound,
        }), next.port).pipe(Effect.flip, Effect.map((error) => error.message))
        expect(message).toStartWith("ReviewRequestRejected: retained-tier-unavailable.")
        expect(next.calls).toEqual([])
      }))
    }),
  ))
