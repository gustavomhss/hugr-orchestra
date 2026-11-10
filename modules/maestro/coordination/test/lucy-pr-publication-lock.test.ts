import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Deferred, Effect, Fiber, Scheduler } from "effect"
import { ReviewCatalog } from "@orchestra/core/review/catalog"
import { ReviewPRConcurrencyV2 } from "../src/v2/tools/review-pr-concurrency"
import { ReviewPRFactsV2 } from "../src/v2/tools/review-pr-facts"
import { ReviewChecksV2 } from "../src/v2/workflow/review-checks"
import { ReviewPRStoreV2 } from "../src/v2/tools/review-pr-store"
import { worktree } from "./fixture/v2-governance"

const candidate = "d".repeat(64)
const routing = {
  version: "route-v1", catalog: "b".repeat(64), profile: { id: "pr", source: "request" },
  tier: { id: "standard", source: "risk", signals: [] }, overlays: [], languages: [], lenses: [], packs: [],
  budget: { lensChildren: 1, samples: 1, verifiers: 1, itemsPerLens: 1, loadsPerSession: 1,
    candidatesPerChild: 1, candidatesPerVerifier: 1, toolCallsPerSession: 1, probeAttempts: 1 }, deviations: [],
} as const
const facts: ReviewPRFactsV2.Facts = {
  candidate, method: "review-v2/pr/standard", routing,
  scope: { base: "base", head: "head", files: 1, changedLines: 1 },
  checkFacts: ReviewChecksV2.collect({ routing, checks: [], catalog: ReviewCatalog.current, settings: undefined }),
  outcomes: [],
  confirmed: [],
}
expect(facts.checkFacts.checks).toEqual([])
expect(facts.checkFacts.repository).toEqual([])

const posix = ReviewPRStoreV2.supported() ? test : test.skip
posix("POSIX: cancelled publication retires before a registered contender reads the winner", () =>
  Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const directory = yield* worktree
    const store = path.join(directory, "orchestra-review", `pr_${candidate}`)
    const beforeLink = yield* Deferred.make<void>()
    const waiting = yield* Deferred.make<void>()
    const trace: string[] = []
    const admissions: { candidate: string; waiting: boolean }[] = []
    let release = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    const owner = yield* ReviewPRConcurrencyV2.withCandidate(candidate, () => ReviewPRFactsV2.write(store, facts).pipe(
      Effect.ensuring(Effect.sync(() => trace.push("owner-retired"))),
      Effect.provideService(ReviewPRFactsV2.BeforePublish, () => {
        trace.push("before-link")
        Effect.runSync(Deferred.succeed(beforeLink, undefined))
        return gate
      }),
    )).pipe(Effect.forkScoped({ startImmediately: true }))
    try {
      yield* Deferred.await(beforeLink)
      const contender = yield* ReviewPRConcurrencyV2.withCandidate(candidate, () => Effect.gen(function* () {
        trace.push("contender-entered")
        expect(yield* ReviewPRFactsV2.read(store, candidate)).toEqual(facts)
        expect(yield* Effect.promise(() => fs.readdir(store))).toEqual(["host-facts.json"])
      })).pipe(
        Effect.provideService(ReviewPRConcurrencyV2.AdmissionObserver, (event) => {
          admissions.push(event)
          if (event.candidate === candidate && event.waiting) Effect.runSync(Deferred.succeed(waiting, undefined))
        }),
        Effect.forkScoped({ startImmediately: true }),
        Effect.provideService(Scheduler.PreventSchedulerYield, true),
      )
      yield* Deferred.await(waiting)
      const other = yield* ReviewPRConcurrencyV2.withCandidate("different", () => Effect.succeed("entered"))
        .pipe(Effect.forkScoped({ startImmediately: true }), Effect.provideService(Scheduler.PreventSchedulerYield, true))
      expect(yield* Fiber.join(other)).toBe("entered")
      const interrupt = yield* Fiber.interrupt(owner).pipe(
        Effect.forkScoped({ startImmediately: true }), Effect.provideService(Scheduler.PreventSchedulerYield, true),
      )
      expect(admissions).toEqual([{ candidate, waiting: true }])
      expect(trace).toEqual(["before-link"])
      release()
      yield* Fiber.join(interrupt)
      yield* Fiber.join(contender)
      expect(trace).toEqual(["before-link", "owner-retired", "contender-entered"])
      expect(yield* ReviewPRFactsV2.read(store, candidate)).toEqual(facts)
    } finally {
      release()
    }
  }))),
)
