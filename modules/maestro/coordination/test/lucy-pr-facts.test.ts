import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Deferred, Effect, Fiber, Scheduler } from "effect"
import { ReviewPRFactsV2 } from "../src/v2/tools/review-pr-facts"
import { ReviewPRStoreV2 } from "../src/v2/tools/review-pr-store"
import { worktree } from "./fixture/v2-governance"

const candidate = "a".repeat(64)
const facts: ReviewPRFactsV2.Facts = {
  candidate, method: "review-v2/pr/standard",
  routing: {
    version: "route-v1", catalog: "b".repeat(64), profile: { id: "pr", source: "request" },
    tier: { id: "standard", source: "risk", signals: [] }, overlays: [], languages: [], lenses: [], packs: [],
    budget: { lensChildren: 1, samples: 1, verifiers: 1, itemsPerLens: 1, loadsPerSession: 1,
      candidatesPerChild: 1, candidatesPerVerifier: 1, toolCallsPerSession: 1, probeAttempts: 1 },
    deviations: [],
  },
  scope: { base: "base", head: "head", files: 1, changedLines: 1 },
  confirmed: [{ id: "C1", path: "src/a.ts", line: 1, severity: "P1", class: "logic.invariant", node: "node",
    lens: "correctness-logic", rule: "logic.invariant", trigger: "trigger", rungs: ["quote"],
    evidence: { kind: "quote", path: "src/a.ts", startLine: 1, endLine: 1 } }],
}

const posix = ReviewPRStoreV2.supported() ? test : test.skip

posix("POSIX: completed host facts round-trip without a verdict or card, and absence is distinct", () =>
  Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const directory = yield* worktree
    const store = path.join(directory, "orchestra-review", `pr_${candidate}`)
    expect(yield* ReviewPRFactsV2.read(store, candidate)).toBeUndefined()
    yield* ReviewPRFactsV2.write(store, facts)
    expect(yield* ReviewPRFactsV2.read(store, candidate)).toEqual(facts)
    const saved = yield* Effect.promise(() => Bun.file(ReviewPRFactsV2.file(store, candidate)).text())
    expect(saved).not.toContain('"verdict"')
    expect(saved).not.toContain('"card"')
    expect(yield* Effect.promise(() => fs.readdir(store))).toEqual(["host-facts.json"])
  }))),
)

posix("POSIX: candidate filenames and file contents are strictly bound to host identity", async () => {
  expect(() => ReviewPRFactsV2.file("/tmp/pr_../bad", "../bad")).toThrow("pr-facts-identity")
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const directory = yield* worktree
    const store = path.join(directory, "orchestra-review", `pr_${candidate}`)
    yield* ReviewPRFactsV2.write(store, facts)
    yield* Effect.promise(() => Bun.write(ReviewPRFactsV2.file(store, candidate), JSON.stringify({ ...facts, candidate: "c".repeat(64) })))
    const result = yield* Effect.flip(ReviewPRFactsV2.read(store, candidate))
    expect(result.message).toContain("pr-facts-identity")
  })))
})

posix("POSIX: corrupt, excess, invalid UTF-8 and oversized retained facts fail explicitly", () =>
  Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const directory = yield* worktree
    const store = path.join(directory, "orchestra-review", `pr_${candidate}`)
    yield* ReviewPRFactsV2.write(store, facts)
    const target = ReviewPRFactsV2.file(store, candidate)
    for (const bytes of ["{", JSON.stringify({ ...facts, verdict: "APPROVE" }),
      JSON.stringify({ ...facts, confirmed: [{ ...facts.confirmed[0], invented: true }] }), new Uint8Array([255])]) {
      yield* Effect.promise(() => Bun.write(target, bytes))
      expect((yield* Effect.flip(ReviewPRFactsV2.read(store, candidate))).message).toContain("pr-facts-corrupt")
    }
    yield* Effect.promise(() => Bun.write(target, new Uint8Array(4 * 1024 * 1024 + 1)))
    expect((yield* Effect.flip(ReviewPRFactsV2.read(store, candidate))).message).toContain("pr-facts-oversized")
  }))),
)

posix("POSIX: writer refuses excess fields and oversized host facts before publishing", () =>
  Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const directory = yield* worktree
    const store = path.join(directory, "orchestra-review", `pr_${candidate}`)
    const withVerdict = { ...facts, verdict: "APPROVE" }
    expect((yield* Effect.flip(ReviewPRFactsV2.write(store, withVerdict))).message).toContain("pr-facts-corrupt")
    expect((yield* Effect.flip(ReviewPRFactsV2.write(store, { ...facts, method: "a".repeat(4 * 1024 * 1024) }))).message).toContain("pr-facts-oversized")
    expect(yield* ReviewPRFactsV2.read(store, candidate)).toBeUndefined()
  }))),
)

posix("POSIX: concurrent writers publish one immutable winner and accept only equivalent retries", () =>
  Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const directory = yield* worktree
    const store = path.join(directory, "orchestra-review", `pr_${candidate}`)
    const alternate = { ...facts, method: "review-v2/pr/quick" }
    const attempts = yield* Effect.promise(() => Promise.allSettled([
      Effect.runPromise(ReviewPRFactsV2.write(store, facts)),
      Effect.runPromise(ReviewPRFactsV2.write(store, alternate)),
    ]))
    expect(attempts.filter((item) => item.status === "fulfilled")).toHaveLength(1)
    const failure = attempts.find((item) => item.status === "rejected")
    if (!failure || failure.status !== "rejected") throw new Error("expected conflicting writer")
    expect(String(failure.reason)).toContain("pr-facts-conflict")
    const winner = yield* ReviewPRFactsV2.read(store, candidate)
    if (!winner) throw new Error("missing winning facts")
    expect([facts.method, alternate.method]).toContain(winner.method)
    yield* ReviewPRFactsV2.write(store, winner)
    expect(yield* ReviewPRFactsV2.read(store, candidate)).toEqual(winner)
    expect((yield* Effect.promise(() => fs.stat(ReviewPRFactsV2.file(store, candidate)))).mode & 0o777).toBe(0o600)
    expect(yield* Effect.promise(() => fs.readdir(store))).toEqual(["host-facts.json"])
  }))),
)

posix("POSIX: a corrupt existing file cannot be replaced by a later writer", () =>
  Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const directory = yield* worktree
    const store = path.join(directory, "orchestra-review", `pr_${candidate}`)
    yield* ReviewPRFactsV2.write(store, facts)
    const target = ReviewPRFactsV2.file(store, candidate)
    yield* Effect.promise(() => Bun.write(target, "bad"))
    expect((yield* Effect.flip(ReviewPRFactsV2.write(store, facts))).message).toContain("pr-facts-corrupt")
    expect(yield* Effect.promise(() => Bun.file(target).text())).toBe("bad")
  }))),
)

posix("POSIX: symlinked candidate directories and targets cannot supply or receive host facts", () =>
  Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const directory = yield* worktree
    const parent = path.join(directory, "orchestra-review")
    const store = path.join(parent, `pr_${candidate}`)
    const outside = path.join(directory, "outside")
    const forged = path.join(outside, "host-facts.json")
    yield* Effect.promise(async () => {
      await fs.mkdir(parent, { mode: 0o700 })
      await fs.mkdir(outside, { mode: 0o700 })
      await fs.writeFile(forged, JSON.stringify(facts), { mode: 0o600 })
      await fs.symlink(outside, store)
    })
    const before = yield* Effect.promise(() => fs.stat(forged))
    expect((yield* Effect.flip(ReviewPRFactsV2.read(store, candidate))).message).toContain("pr-facts-unavailable")
    expect((yield* Effect.flip(ReviewPRFactsV2.write(store, facts))).message).toContain("pr-facts-unavailable")
    yield* Effect.promise(async () => {
      await fs.unlink(store)
      await fs.mkdir(store, { mode: 0o700 })
      await fs.symlink(forged, ReviewPRFactsV2.file(store, candidate))
    })
    expect((yield* Effect.flip(ReviewPRFactsV2.read(store, candidate))).message).toContain("pr-facts-unavailable")
    expect((yield* Effect.flip(ReviewPRFactsV2.write(store, facts))).message).toContain("pr-facts-unavailable")
    expect(yield* Effect.promise(() => Bun.file(forged).text())).toBe(JSON.stringify(facts))
    expect((yield* Effect.promise(() => fs.stat(forged))).mode).toBe(before.mode)
  }))),
)

posix("POSIX: cancellation waits for real publication and temporary cleanup before retirement", () =>
  Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const directory = yield* worktree
    const store = path.join(directory, "orchestra-review", `pr_${candidate}`)
    const started = yield* Deferred.make<void>()
    const trace: string[] = []
    let release = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    const owner = yield* ReviewPRFactsV2.write(store, facts).pipe(
      Effect.provideService(ReviewPRFactsV2.BeforePublish, () => {
        trace.push("before-link")
        Effect.runSync(Deferred.succeed(started, undefined))
        return gate
      }),
      Effect.ensuring(Effect.sync(() => trace.push("retired"))),
      Effect.forkChild({ startImmediately: true }),
    )
    yield* Deferred.await(started)
    const interrupt = yield* Fiber.interrupt(owner).pipe(
      Effect.forkChild({ startImmediately: true }),
      Effect.provideService(Scheduler.PreventSchedulerYield, true),
    )
    try {
      expect(trace).toEqual(["before-link"])
    } finally {
      release()
    }
    yield* Fiber.join(interrupt)
    expect(trace).toEqual(["before-link", "retired"])
    expect(yield* ReviewPRFactsV2.read(store, candidate)).toEqual(facts)
    expect(yield* Effect.promise(() => fs.readdir(store))).toEqual(["host-facts.json"])
  }))),
)

if (!ReviewPRStoreV2.supported()) test("unsupported platform refuses read and write without creating the store", () =>
  Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const directory = yield* worktree
    const store = path.join(directory, "orchestra-review", `pr_${candidate}`)
    expect((yield* Effect.flip(ReviewPRFactsV2.read(store, candidate))).message).toContain("pr-facts-unsupported")
    expect((yield* Effect.flip(ReviewPRFactsV2.write(store, facts))).message).toContain("pr-facts-unsupported")
    expect(yield* Effect.promise(() => Bun.file(path.join(directory, "orchestra-review")).exists())).toBe(false)
    expect(yield* Effect.promise(() => fs.readdir(directory))).toEqual([])
  }))),
)
