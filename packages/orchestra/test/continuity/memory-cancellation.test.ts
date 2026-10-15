import { expect } from "bun:test"
import { Cause, Deferred, Effect, Fiber, Stream } from "effect"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { BackgroundJob } from "@/background/job"
import { LLMEvent } from "@orchestra/llm"
import type { LLM } from "@/session/llm"
import { run } from "@/continuity/fork"
import type { MemoryArtifact } from "@/continuity/memory-types"
import { awaitWithTimeout, testEffect } from "../lib/effect"
import { captured, finding, host, memory, provider } from "./memory-fixture"

const it = testEffect(LayerNode.compile(BackgroundJob.node))

function transport() {
  return Effect.gen(function* () {
    const jobs = yield* BackgroundJob.Service
    const entered = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const closing = yield* Deferred.make<void>()
    const naturalClosed = yield* Deferred.make<void>()
    const allowClose = yield* Deferred.make<void>()
    const controller = new AbortController()
    const events: string[] = []
    yield* Effect.addFinalizer(() => Deferred.succeed(allowClose, undefined).pipe(
      Effect.andThen(Deferred.succeed(release, undefined))))
    const llm: LLM.Interface = { stream: () => Stream.scoped(Stream.unwrap(Effect.gen(function* () {
      yield* Effect.addFinalizer(() => Deferred.succeed(naturalClosed, undefined))
      yield* Effect.acquireRelease(Effect.succeed(controller), (controller) => Effect.gen(function* () {
        controller.abort()
        events.push("abort")
        yield* Deferred.succeed(closing, undefined)
        yield* Deferred.await(allowClose)
        events.push("closed")
      }))
      // A complete JSON body without terminal stop must not become applied memory.
      return Stream.concat(Stream.make(LLMEvent.textDelta({ id: "memory", text: JSON.stringify({ ops: [finding()] }) })),
        Stream.unwrap(Effect.gen(function* () {
          yield* jobs.list()
          yield* Deferred.succeed(entered, undefined)
          yield* Deferred.await(release)
          return Stream.make(LLMEvent.finish({ reason: "stop" }))
        })))
    }))) }
    return { llm, controller, entered, release, closing, naturalClosed, allowClose, events }
  })
}

it.instance("maintenance completion then cancellation await captured AbortController cleanup", () => Effect.gen(function* () {
  const jobs = yield* BackgroundJob.Service
  for (const action of ["complete", "cancel", "cancel-immediate"] as const) {
    const capture = yield* transport()
    const snapshot = captured()
    const accepted: MemoryArtifact[] = []
    const job = yield* jobs.start({ type: "context-maintenance", run: run(snapshot, { provider: provider(), llm: capture.llm }, host([...snapshot.head, ...snapshot.tail])).pipe(
      Effect.map(({ artifact }) => {
        if (artifact) accepted.push(artifact)
        return artifact ? "applied" : "discarded"
      }),
      Effect.catchCause((cause) => Effect.logWarning("captured maintenance failure").pipe(Effect.andThen(
        Cause.hasInterruptsOnly(cause) ? Effect.failCause(cause) : Effect.fail(new Error("Maintenance failed")),
      ))),
      Effect.ensuring(Effect.sync(() => { capture.events.push("worker-finished") })),
    ) }).pipe(Effect.interruptible, Effect.uninterruptible)
    yield* awaitWithTimeout(Deferred.await(capture.entered), "Transport never entered")
    expect(capture.controller.signal.aborted).toBe(false)
    expect(accepted).toEqual([])
    if (action === "complete") {
      yield* Deferred.succeed(capture.allowClose, undefined)
      yield* Deferred.succeed(capture.release, undefined)
      const result = yield* jobs.wait({ id: job.id })
      expect(result.info?.output).toBe("applied")
      expect(accepted).toHaveLength(1)
      expect(accepted[0].text).toContain(memory)
    }
    if (action === "cancel") {
      const cancel = yield* awaitWithTimeout(jobs.cancel(job.id), "Cancellation did not return", "5 seconds").pipe(
        Effect.tap(() => Effect.sync(() => capture.events.push("cancel-returned"))), Effect.forkChild)
      yield* awaitWithTimeout(Deferred.await(capture.closing), "Cancellation never reached transport cleanup")
      expect(capture.controller.signal.aborted).toBe(true)
      expect(yield* Effect.sync(() => cancel.pollUnsafe())).toBeUndefined()
      expect(accepted).toEqual([])
      expect(yield* Deferred.isDone(capture.release)).toBe(false)
      yield* Deferred.succeed(capture.allowClose, undefined)
      expect((yield* Fiber.join(cancel))?.status).toBe("cancelled")
      expect(accepted).toEqual([])
    }
    if (action === "cancel-immediate") {
      yield* Deferred.succeed(capture.allowClose, undefined)
      const result = yield* awaitWithTimeout(jobs.cancel(job.id), "Cancellation did not return", "5 seconds")
      capture.events.push("cancel-returned")
      expect(result?.status).toBe("cancelled")
      expect(accepted).toEqual([])
      expect(yield* Deferred.isDone(capture.release)).toBe(false)
    }
    expect(capture.controller.signal.aborted).toBe(true)
    expect(yield* Deferred.isDone(capture.naturalClosed)).toBe(true)
    expect(capture.events).toEqual(action === "complete" ? ["abort", "closed", "worker-finished"] : ["abort", "closed", "worker-finished", "cancel-returned"])
  }
}))
