import { expect } from "bun:test"
import { Deferred, Effect, Fiber } from "effect"
import { SessionContinuity } from "@/continuity/service"
import { BackgroundJob } from "@/background/job"
import { Archive } from "@/continuity/archive"
import { validChecklist } from "@/continuity/checklist-seal"
import { pollWithTimeout } from "../lib/effect"
import { ClaudeEngineFixture } from "./engine-fixture"

for (const correction of [false, true]) for (const cancel of [false, true]) {
  ClaudeEngineFixture.it.instance(`SDK producer cannot publish before query.return cleanup; Stop joins disposal (correction=${correction}, cancel=${cancel})`, () => Effect.gen(function* () {
    ClaudeEngineFixture.reset()
    const entered = yield* Deferred.make<void>()
    const disposing = yield* Deferred.make<void>()
    const stopped = yield* Deferred.make<void>()
    const context = yield* Effect.context<never>()
    const cleanup: { release?: () => void; aborted: boolean; closed: number; returns: number; disposed: boolean } = {
      aborted: false, closed: 0, returns: 0, disposed: false,
    }
    yield* Effect.addFinalizer(() => Effect.sync(() => { cleanup.release?.(); ClaudeEngineFixture.state.producer = undefined }))
    ClaudeEngineFixture.state.producer = (params) => {
      if (correction && ClaudeEngineFixture.state.producers === 1) return (async function* () {
        // Missing Now is a real C15 host failure, not a synthetic reviewer response.
        yield { type: "assistant", ...ClaudeEngineFixture.frame, message: { id: "invalid", content: [{ type: "text", text: '{"ops":[]}' }], stop_reason: "end_turn", usage: {} } }
        yield { type: "result", subtype: "success", is_error: false, stop_reason: "end_turn", ...ClaudeEngineFixture.frame }
      })()
      expect(ClaudeEngineFixture.state.producers).toBe(correction ? 2 : 1)
      if (correction) expect(JSON.stringify(ClaudeEngineFixture.historicalMessages(params).at(-1))).toContain("HOST CHECK FAILED. C15:")
      const release = new Promise<void>((resolve) => { cleanup.release = resolve })
      const abort = new Promise<void>((resolve) => params.options?.abortController?.signal.addEventListener("abort", () => {
        cleanup.aborted = true
        resolve()
      }, { once: true }))
      const query = (async function* () {
        for await (const message of ClaudeEngineFixture.memoryProducer(params)) {
          yield message
          if (message.type === "assistant") {
            // Candidate bytes reached the SDK transport; publication must still await disposal.
            await Effect.runPromiseWith(context)(Deferred.succeed(entered, undefined))
            if (cancel) {
              await abort
              return
            }
          }
        }
      })()
      const dispose = query.return.bind(query)
      return Object.assign(query, {
        close: () => { cleanup.closed++ },
        return: async () => {
          cleanup.returns++
          await Effect.runPromiseWith(context)(Deferred.succeed(disposing, undefined))
          await release
          const result = await dispose(undefined)
          cleanup.disposed = true
          return result
        },
      })
    }
    const setup = yield* ClaudeEngineFixture.setup()
    const sessions = setup.sessions
    const prompt = setup.prompt
    const chat = setup.chat
    const jobs = yield* BackgroundJob.Service
    const continuity = yield* SessionContinuity.Service
    const archive = yield* Archive.Service
    for (let index = 0; index < 6; index++) {
      ClaudeEngineFixture.state.scripts.push(ClaudeEngineFixture.nativeReply(index, { usage: index === 5 ? 15_000 : 50 }))
      yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say(`producer-cleanup-${index} ` + "source evidence ".repeat(120)) })
    }
    yield* Deferred.await(entered).pipe(Effect.timeout("15 seconds"))
    const job = yield* pollWithTimeout(jobs.list().pipe(Effect.map((list) => list.find((job) => job.metadata?.sessionId === chat.id))), "producer job not registered")
    const before = yield* archive.readMemory(chat.id)
    expect(before?.context).toBeUndefined()
    const history = yield* sessions.messages({ sessionID: chat.id })
    const stop = cancel ? yield* prompt.cancel(chat.id).pipe(Effect.onExit(() => Deferred.succeed(stopped, undefined)), Effect.forkChild) : undefined
    yield* Deferred.await(disposing).pipe(Effect.timeout("15 seconds"))
    expect(cleanup).toMatchObject({ aborted: true, closed: 1, returns: 1, disposed: false })
    expect(yield* Deferred.isDone(stopped)).toBe(false)
    // BackgroundJob marks cancellation before closing its scope; Stop completion proves the join.
    expect((yield* jobs.get(job.id))?.status).toBe(cancel ? "cancelled" : "running")
    expect(yield* archive.readMemory(chat.id)).toEqual(before)
    expect((yield* continuity.prepare({ sessionID: chat.id, messages: history, canRecall: true })).system).toEqual([])
    expect(ClaudeEngineFixture.state.producers).toBe(correction ? 2 : 1)
    expect(ClaudeEngineFixture.state.reviews).toBe(0)
    expect(ClaudeEngineFixture.state.queries.filter((query) => query.options?.persistSession !== false)).toHaveLength(6)
    expect(ClaudeEngineFixture.state.apiCalls).toBe(0)
    cleanup.release?.()
    if (stop) yield* Fiber.join(stop)
    const done = yield* jobs.wait({ id: job.id, timeout: 15_000 })
    expect(done.timedOut).toBe(false)
    expect(cleanup.disposed).toBe(true)
    expect(done.info?.status).toBe(cancel ? "cancelled" : "completed")
    expect(ClaudeEngineFixture.state.producers).toBe(correction ? 2 : 1)
    expect(ClaudeEngineFixture.state.reviews).toBe(0)
    expect(yield* sessions.messages({ sessionID: chat.id })).toEqual(history)
    if (cancel) {
      expect(yield* Deferred.isDone(stopped)).toBe(true)
      expect(yield* archive.readMemory(chat.id)).toEqual(before)
      expect((yield* continuity.prepare({ sessionID: chat.id, messages: history, canRecall: true })).system).toEqual([])
      return
    }
    expect(done.info?.output).toBe("applied")
    const memory = (yield* archive.readMemory(chat.id))?.context?.artifact
    // Bun's asymmetric matcher must not mutate the sealed artifact under inspection.
    expect(memory?.version === 5 && structuredClone(memory.checklist)).toMatchObject({ version: 1, critical: [], digest: expect.any(String) })
    expect(memory?.version === 5 && validChecklist(memory)).toBe(true)
    expect(memory).not.toHaveProperty("review")
    expect((yield* continuity.prepare({ sessionID: chat.id, messages: history, canRecall: true })).system.join("\n")).toContain("SDK_MEMORY_NEEDLE_9C41")
  }), 120_000)
}
