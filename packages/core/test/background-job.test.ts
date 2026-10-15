import { describe, expect } from "bun:test"
import { BackgroundJob } from "@orchestra/core/background-job"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Deferred, Effect, Exit, Scope } from "effect"
import { it } from "./lib/effect"

const jobsLayer = LayerNode.compile(BackgroundJob.node)

describe("BackgroundJob", () => {
  it.live("tracks process-local work through explicit observation", () =>
    Effect.gen(function* () {
      const jobs = yield* BackgroundJob.Service
      const latch = yield* Deferred.make<void>()
      const job = yield* jobs.start({
        type: "test",
        metadata: { durable: false },
        run: Deferred.await(latch).pipe(Effect.as("done")),
      })

      expect(job).toMatchObject({ type: "test", status: "running", metadata: { durable: false } })
      expect(yield* jobs.wait({ id: job.id, timeout: 0 })).toMatchObject({
        timedOut: true,
        info: { status: "running" },
      })

      yield* Deferred.succeed(latch, undefined)
      expect(yield* jobs.wait({ id: job.id })).toMatchObject({
        timedOut: false,
        info: { status: "completed", output: "done" },
      })
    }).pipe(Effect.provide(jobsLayer)),
  )

  it.live("publishes jobs before starting immediately settling work", () =>
    Effect.gen(function* () {
      const jobs = yield* BackgroundJob.Service

      yield* Effect.forEach(Array.from({ length: 100 }), (_, index) => {
        const id = `job_immediate_start_${index}`
        return Effect.gen(function* () {
          const job = yield* jobs.start({
            id,
            type: "test",
            run: jobs
              .get(id)
              .pipe(
                Effect.flatMap((info) =>
                  info?.status === "running"
                    ? Effect.succeed(`done-${index}`)
                    : Effect.fail("job started before publish"),
                ),
              ),
          })

          expect(yield* jobs.wait({ id: job.id })).toMatchObject({
            timedOut: false,
            info: { status: "completed", output: `done-${index}` },
          })
        })
      })
    }).pipe(Effect.provide(jobsLayer)),
  )

  it.live("increments pending work before starting immediately settling extensions", () =>
    Effect.gen(function* () {
      const jobs = yield* BackgroundJob.Service

      yield* Effect.forEach(Array.from({ length: 100 }), (_, index) =>
        Effect.gen(function* () {
          const first = yield* Deferred.make<void>()
          const job = yield* jobs.start({
            type: "test",
            run: Deferred.await(first).pipe(Effect.as(`first-${index}`)),
          })

          expect(yield* jobs.extend({ id: job.id, run: Effect.succeed(`second-${index}`) })).toBe(true)
          expect((yield* jobs.get(job.id))?.status).toBe("running")

          yield* Deferred.succeed(first, undefined)
          expect(yield* jobs.wait({ id: job.id })).toMatchObject({
            timedOut: false,
            info: { status: "completed", output: `second-${index}` },
          })
        }),
      )
    }).pipe(Effect.provide(jobsLayer)),
  )

  it.live("interrupts live work without promising settlement after the owning process-local scope closes", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make()
      const interrupted = yield* Deferred.make<void>()
      const jobs = yield* BackgroundJob.make.pipe(Scope.provide(scope))
      const job = yield* jobs.start({
        type: "test",
        run: Effect.never.pipe(Effect.ensuring(Deferred.succeed(interrupted, undefined))),
      })

      yield* Scope.close(scope, Exit.void)

      yield* Deferred.await(interrupted).pipe(Effect.timeout("1 second"))
      // The abandoned in-memory registry is not a durable observation channel.
      expect((yield* jobs.get(job.id))?.status).toBe("running")
    }),
  )

  for (const replace of [false, true]) {
    it.live(`extension ${replace ? "replaces" : "retains"} actual attempt's callback`, () => Effect.gen(function* () {
      const jobs = yield* BackgroundJob.Service
      const entered = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const notice = yield* Deferred.make<{ owner: string; info: BackgroundJob.Info }>()
      const notify = (owner: string) => (info: BackgroundJob.Info) => Deferred.succeed(notice, { owner, info }).pipe(Effect.asVoid)
      const job = yield* jobs.start({ type: "test", notify: notify("original"),
        run: Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release)), Effect.as("first")) })
      yield* Deferred.await(entered)
      expect(yield* jobs.extend({ id: job.id, notify: replace ? notify("extension") : undefined, run: Effect.succeed("second") })).toBe(true)
      yield* Deferred.succeed(release, undefined)
      expect(yield* Deferred.await(notice).pipe(Effect.timeout("5 seconds"))).toMatchObject({
        owner: replace ? "extension" : "original", info: { status: "completed", output: "second" } })
    }).pipe(Effect.provide(jobsLayer)))
  }

  it.live("earlier failed command owns notification and never starts queued successor", () => Effect.gen(function* () {
    const jobs = yield* BackgroundJob.Service
    const release = yield* Deferred.make<void>()
    const notice = yield* Deferred.make<{ owner: string; info: BackgroundJob.Info }>()
    const ran: string[] = []
    const notify = (owner: string) => (info: BackgroundJob.Info) => Deferred.succeed(notice, { owner, info }).pipe(Effect.asVoid)
    const job = yield* jobs.start({ type: "test", notify: notify("original"),
      run: Deferred.await(release).pipe(Effect.andThen(Effect.fail(new Error("first failed")))) })
    expect(yield* jobs.extend({ id: job.id, notify: notify("unstarted"), run: Effect.sync(() => {
      ran.push("unstarted")
      return "second"
    }) })).toBe(true)
    yield* Deferred.succeed(release, undefined)
    expect(yield* Deferred.await(notice).pipe(Effect.timeout("5 seconds"))).toMatchObject({
      owner: "original", info: { status: "error", error: "first failed" } })
    expect(ran).toEqual([])
  }).pipe(Effect.provide(jobsLayer)))
})
