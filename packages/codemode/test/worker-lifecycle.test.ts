import { expect, test } from "bun:test"
import type { Worker } from "node:worker_threads"
import { Cause, Deferred, Effect, Exit, Fiber, Schema } from "effect"
import { Tool } from "../src/index.js"
import { ToolRuntime } from "../src/tool-runtime.js"
import { executeWithLimits } from "../src/worker.js"

const unlimited = { timeoutMs: undefined, maxToolCalls: undefined, maxOutputBytes: undefined }
const input = Schema.Struct({})

function lifetime() {
  const workers: Array<Worker> = []
  const exits: Array<number> = []
  const ready: Array<number> = []
  const admittedAt = performance.now()
  return {
    workers, exits, ready,
    observe(worker: Worker) {
      workers.push(worker)
      worker.once("exit", (code) => { exits.push(code) })
      worker.on("message", (message: unknown) => {
        if (message !== null && typeof message === "object" && "type" in message && message.type === "ready") {
          ready.push(performance.now() - admittedAt)
        }
      })
    },
  }
}

function expectExited(observed: ReturnType<typeof lifetime>) {
  expect(observed.workers).toHaveLength(1)
  expect(observed.exits).toHaveLength(1)
  expect(observed.workers[0].threadId).toBe(-1)
  expect(observed.ready).toHaveLength(1)
  console.info(`CodeMode actual worker lifecycle: readyAfterMs=${observed.ready[0].toFixed(3)}, exited=true`)
}

test("actual worker has exited before normal execution returns", async () => {
  const observed = lifetime()
  const result = await Effect.runPromise(executeWithLimits({ code: 'return /a/.test("a")' }, unlimited, [], observed.observe).pipe(Effect.timeout("10 seconds")))
  expect(result).toMatchObject({ ok: true, value: true, toolCalls: [] })
  expectExited(observed)
}, 15_000)

test("timeout joins the actual host finalizer and worker before returning", async () => {
  const observed = lifetime()
  const state = { entered: false, finalized: false, endHooks: 0 }
  const tools = {
    wait: Tool.make({
      description: "Wait until interrupted", input, output: Schema.String,
      run: () => Effect.sync(() => { state.entered = true }).pipe(
        Effect.andThen(Effect.never), Effect.onInterrupt(() => Effect.sync(() => { state.finalized = true })),
      ),
    }),
  }
  const result = await Effect.runPromise(executeWithLimits({
    tools, code: "return await tools.wait({})",
    onToolCallEnd: () => Effect.sync(() => { state.endHooks++ }),
  }, { ...unlimited, timeoutMs: 1500 }, ToolRuntime.searchIndex(tools), observed.observe))
  expect(result).toMatchObject({ ok: false, error: { kind: "TimeoutExceeded" }, toolCalls: [{ name: "wait" }] })
  expect(state).toEqual({ entered: true, finalized: true, endHooks: 0 })
  expectExited(observed)
}, 15_000)

test("caller interruption joins host cleanup and the actual worker", async () => {
  const observed = lifetime()
  const state = { finalized: false, endHooks: 0 }
  const exit = await Effect.runPromise(Effect.gen(function* () {
    const entered = yield* Deferred.make<void>()
    const tools = {
      wait: Tool.make({
        description: "Announce a real host invocation", input, output: Schema.String,
        run: () => Deferred.succeed(entered, undefined).pipe(
          Effect.andThen(Effect.never), Effect.onInterrupt(() => Effect.sync(() => { state.finalized = true })),
        ),
      }),
    }
    const execution = yield* Effect.forkChild(executeWithLimits({
      tools, code: "return await tools.wait({})",
      onToolCallEnd: () => Effect.sync(() => { state.endHooks++ }),
    }, unlimited, ToolRuntime.searchIndex(tools), observed.observe))
    yield* Deferred.await(entered).pipe(Effect.timeout("5 seconds"))
    yield* Fiber.interrupt(execution)
    return yield* Fiber.await(execution)
  }).pipe(Effect.timeout("10 seconds")))
  expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true)
  expect(state).toEqual({ finalized: true, endHooks: 0 })
  expectExited(observed)
}, 15_000)

test("host tools retain the actual caller Scope and its resource lifetime", async () => {
  const observed = lifetime()
  const state = { sameScope: false, finalized: false }
  await Effect.runPromise(Effect.gen(function* () {
    const callerScope = yield* Effect.scope
    const tools = {
      resource: Tool.make({
        description: "Acquire in the caller scope", input, output: Schema.String,
        run: () => Effect.gen(function* () {
          state.sameScope = (yield* Effect.scope) === callerScope
          yield* Effect.acquireRelease(Effect.void, () => Effect.sync(() => { state.finalized = true }))
          return "resource"
        }),
      }),
    }
    const result = yield* executeWithLimits({ tools, code: "return await tools.resource({})" }, unlimited, ToolRuntime.searchIndex(tools), observed.observe)
    expect(result).toMatchObject({ ok: true, value: "resource", toolCalls: [{ name: "resource" }] })
    expect(state).toEqual({ sameScope: true, finalized: false })
    expectExited(observed)
  }).pipe(Effect.scoped, Effect.timeout("10 seconds")))
  expect(state.finalized).toBe(true)
}, 15_000)

test("Promise.race waits for the exact losing host finalizer ACK", async () => {
  const observed = lifetime()
  const trace: Array<string> = []
  await Effect.runPromise(Effect.gen(function* () {
    const entered = yield* Deferred.make<void>()
    const finalizing = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const returned = { value: false }
    const tools = {
      slow: Tool.make({
        description: "Lose after host admission", input, output: Schema.String,
        run: () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never), Effect.onInterrupt(() =>
          Effect.sync(() => { trace.push("finalizer:start") }).pipe(
            Effect.andThen(Deferred.succeed(finalizing, undefined)),
            Effect.andThen(Deferred.await(release)),
            Effect.andThen(Effect.sync(() => { trace.push("finalizer:end") })),
          ),
        )),
      }),
      winner: Tool.make({
        description: "Win only after the loser actually entered", input, output: Schema.String,
        run: () => Deferred.await(entered).pipe(Effect.as("winner")),
      }),
    }
    const execution = yield* Effect.forkChild(executeWithLimits({
      tools, code: "return await Promise.race([tools.slow({}), tools.winner({})])",
      onToolCallEnd: (call) => Effect.sync(() => { trace.push(`end:${call.name}:${call.outcome}`) }),
    }, unlimited, ToolRuntime.searchIndex(tools), observed.observe).pipe(Effect.tap(() => Effect.sync(() => { returned.value = true }))))
    yield* Effect.gen(function* () {
      yield* Deferred.await(finalizing).pipe(Effect.timeout("5 seconds"))
      expect(returned.value).toBe(false)
      expect(trace).toContain("finalizer:start")
      expect(trace).not.toContain("finalizer:end")
    }).pipe(Effect.ensuring(Deferred.succeed(release, undefined)))
    const result = yield* Fiber.join(execution)
    expect(result).toMatchObject({ ok: true, value: "winner" })
    expect(trace).toEqual(["end:winner:success", "finalizer:start", "finalizer:end"])
    expectExited(observed)
  }).pipe(Effect.timeout("10 seconds")))
}, 15_000)

test("spontaneous host interruption without a deadline preserves its actual Cause and exits the worker", async () => {
  const observed = lifetime()
  const state: { cause: Cause.Cause<never> | undefined; endHooks: number } = { cause: undefined, endHooks: 0 }
  const tools = {
    stop: Tool.make({
      description: "Interrupt at the real host boundary", input, output: Schema.String,
      run: () => Effect.interrupt.pipe(Effect.onExit((exit) => Effect.sync(() => {
        if (Exit.isFailure(exit)) state.cause = exit.cause
      }))),
    }),
  }
  const exit = await Effect.runPromiseExit(executeWithLimits({
    tools, code: "return await tools.stop({})",
    onToolCallEnd: () => Effect.sync(() => { state.endHooks++ }),
  }, unlimited, ToolRuntime.searchIndex(tools), observed.observe).pipe(Effect.timeout("10 seconds")))
  expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true)
  expect(state.cause).toBeDefined()
  if (Exit.isFailure(exit) && state.cause !== undefined) expect(exit.cause).toEqual(state.cause)
  expect(state.endHooks).toBe(0)
  expectExited(observed)
}, 15_000)

test("absolute expiry prevents start after ready while the parent's timer callback is delayed", async () => {
  const observed = lifetime()
  const admittedAt = performance.now()
  const timeoutMs = 1500
  const state = { readyBeforeDeadline: false, starts: 0, hostEntries: 0 }
  const tools = {
    entry: Tool.make({
      description: "Witness any admission after expiry", input, output: Schema.String,
      run: () => Effect.sync(() => { state.hostEntries++; return "unexpected" }),
    }),
  }
  const result = await Effect.runPromise(executeWithLimits({ tools, code: "return await tools.entry({})" },
    { ...unlimited, timeoutMs }, ToolRuntime.searchIndex(tools), (worker) => {
      observed.observe(worker)
      const send = worker.postMessage.bind(worker)
      // Local observation of this actual owned instance; every send still delegates to the real transport.
      worker.postMessage = (message: unknown) => {
        if (message !== null && typeof message === "object" && "type" in message && message.type === "start") state.starts++
        send(message)
      }
      worker.on("message", (message: unknown) => {
        if (message === null || typeof message !== "object" || !("type" in message) || message.type !== "ready") return
        state.readyBeforeDeadline = performance.now() < admittedAt + timeoutMs
        // The real ready event is already queued for the actor. Delay the timer callback across absolute expiry.
        const unblockAt = performance.now() + timeoutMs + 50
        while (performance.now() < unblockAt) {}
      })
    },
  ).pipe(Effect.timeout("10 seconds")))
  expect(state).toEqual({ readyBeforeDeadline: true, starts: 0, hostEntries: 0 })
  expect(result).toEqual({ ok: false, error: { kind: "TimeoutExceeded", message: "Execution timed out after 1500ms." }, toolCalls: [] })
  expectExited(observed)
}, 15_000)

test("local actual-worker postMessage fault produces a safe result and still joins worker exit", async () => {
  const observed = lifetime()
  const result = await Effect.runPromise(executeWithLimits({ code: 'return "unreachable"' }, unlimited, [], (worker) => {
    observed.observe(worker)
    // Fault injection is restricted to this owned Worker. No global or prototype is replaced.
    worker.postMessage = () => { throw new Error("private transport failure /tmp/do-not-expose") }
  }).pipe(Effect.timeout("10 seconds")))
  expect(result).toEqual({ ok: false, error: { kind: "ExecutionFailure", message: "CodeMode worker execution failed." }, toolCalls: [] })
  expectExited(observed)
}, 15_000)

test("unsupported private worker URL returns a safe constructor failure without network or leaked worker", async () => {
  const observed = lifetime()
  const result = await Effect.runPromise(executeWithLimits({ code: 'return "unreachable"' }, unlimited, [], observed.observe,
    new URL("codemode-invalid://worker"),
  ).pipe(Effect.timeout("10 seconds")))
  expect(result).toEqual({ ok: false, error: { kind: "ExecutionFailure", message: "CodeMode worker execution failed." }, toolCalls: [] })
  expect(observed.workers.length).toBeLessThanOrEqual(1)
  expect(observed.exits).toHaveLength(observed.workers.length)
  observed.workers.forEach((worker) => expect(worker.threadId).toBe(-1))
}, 15_000)

test("absolute expiry rejects a real done event when parent acceptance is delayed beyond the budget", async () => {
  const observed = lifetime()
  const admittedAt = performance.now()
  const timeoutMs = 1500
  const state = { doneBeforeDeadline: false, acceptedSuccesses: 0 }
  const result = await Effect.runPromise(executeWithLimits({ code: 'return "ordinary"' },
    { ...unlimited, timeoutMs }, [], (worker) => {
      observed.observe(worker)
      worker.on("message", (message: unknown) => {
        if (message === null || typeof message !== "object" || !("type" in message) || message.type !== "done") return
        state.doneBeforeDeadline = performance.now() < admittedAt + timeoutMs
        // Delay only the actual parent's event callback; no signal or program result is fabricated.
        const unblockAt = performance.now() + timeoutMs + 50
        while (performance.now() < unblockAt) {}
      })
    },
  ).pipe(Effect.tap((result) => Effect.sync(() => { if (result.ok) state.acceptedSuccesses++ })), Effect.timeout("10 seconds")))
  expect(state).toEqual({ doneBeforeDeadline: true, acceptedSuccesses: 0 })
  expect(result).toEqual({ ok: false, error: { kind: "TimeoutExceeded", message: "Execution timed out after 1500ms." }, toolCalls: [] })
  expectExited(observed)
}, 15_000)
