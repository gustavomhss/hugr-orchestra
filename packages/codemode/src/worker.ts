import { Worker } from "node:worker_threads"
import { Cause, Deferred, Effect, Exit, Fiber, Queue } from "effect"
import type { ExecuteOptions, ResolvedExecutionLimits, Result } from "./codemode.js"
import { boundOutput } from "./interpreter/output.js"
import { ToolError } from "./tool-error.js"
import { ToolRuntime, ToolRuntimeError, type HostTools, type Services } from "./tool-runtime.js"
import type { NamespaceSnapshot, ToolFailure, WorkerCommand, WorkerSignal } from "./worker-protocol.js"

type Event = WorkerSignal
  | { readonly type: "deadline" }
  | { readonly type: "worker-error" }
  | { readonly type: "worker-exit" }
  | { readonly type: "settled"; readonly id: number; readonly exit: Exit.Exit<unknown, unknown> }

type Call = {
  cancelRequested: boolean
  fiber: Fiber.Fiber<Exit.Exit<unknown, unknown>> | undefined
}

/** Private orchestration seam; the observer exposes the actual owned worker only to lifecycle tests. */
export const executeWithLimits = <const Tools extends Record<string, unknown>>(
  options: ExecuteOptions<Tools>,
  limits: ResolvedExecutionLimits,
  searchIndex: ToolRuntime.DiscoveryPlan["searchIndex"],
  observe?: (worker: Worker) => void,
): Effect.Effect<Result, never, Services<Tools>> => Effect.suspend(() => {
  const admittedAt = performance.now()
  const tools = ToolRuntime.make((options.tools ?? {}) as HostTools<Services<Tools>>, limits.maxToolCalls, searchIndex, {
    ...(options.onToolCallStart === undefined ? {} : { onToolCallStart: options.onToolCallStart }),
    ...(options.onToolCallEnd === undefined ? {} : { onToolCallEnd: options.onToolCallEnd }),
  })
  const namespaces: Array<NamespaceSnapshot[number]> = []
  const snapshot = (path: ReadonlyArray<string>): void => {
    const keys = tools.keys(path)
    namespaces.push({ path, keys })
    keys.filter((key) => !ToolRuntime.isBlockedMember(key)).forEach((key) => snapshot([...path, key]))
  }
  snapshot([])
  const logs: Array<string> = []
  const calls = new Map<number, Call>()
  const completed = Deferred.makeUnsafe<Result>()
  const readyOrExit = Deferred.makeUnsafe<void>()
  const state = {
    open: true, exited: false,
    actor: undefined as Fiber.Fiber<void, unknown> | undefined,
    timer: undefined as Fiber.Fiber<void> | undefined,
  }
  const finish = (result: Result): void => {
    state.open = false
    Deferred.doneUnsafe(completed, Effect.succeed({ ...result, toolCalls: [...tools.calls] }))
  }
  const failure = (): Result => ({
    ok: false, error: { kind: "ExecutionFailure", message: "CodeMode worker execution failed." },
    ...(logs.length > 0 ? { logs: [...logs] } : {}), toolCalls: [...tools.calls],
  })

  return Effect.gen(function* () {
    const events = yield* Queue.unbounded<Event>()
    return yield* Effect.acquireUseRelease(
      Effect.sync(() => {
        const worker = new Worker(new URL("./worker-entry.js", import.meta.url))
        const message = (signal: WorkerSignal): void => {
          if (signal.type === "ready") Deferred.doneUnsafe(readyOrExit, Effect.void)
          Queue.offerUnsafe(events, signal)
        }
        const error = (): void => { Queue.offerUnsafe(events, { type: "worker-error" }) }
        const exit = (): void => {
          state.exited = true
          Deferred.doneUnsafe(readyOrExit, Effect.void)
          Queue.offerUnsafe(events, { type: "worker-exit" })
        }
        worker.on("message", message)
        worker.on("error", error)
        worker.on("exit", exit)
        return { worker, message, error, exit }
      }),
      ({ worker }) => Effect.gen(function* () {
        yield* Effect.sync(() => observe?.(worker))
        const send = (command: WorkerCommand): void => { if (!state.exited) worker.postMessage(command) }
        const actor = Effect.gen(function* () {
          while (true) {
            const event = yield* Queue.take(events)
            if (event.type === "log") {
              logs.push(event.line)
              continue
            }
            if (event.type === "cancel") {
              const call = calls.get(event.id)
              if (call !== undefined) {
                call.cancelRequested = true
                if (call.fiber !== undefined) yield* Fiber.interrupt(call.fiber)
              }
              // Completed ids still acknowledge cancellation; their real outcome/hooks remain intact.
              send({ type: "cancelled", id: event.id })
              continue
            }
            if (event.type === "deadline") {
              const result: Result = {
                ok: false, error: { kind: "TimeoutExceeded", message: `Execution timed out after ${limits.timeoutMs}ms.` },
                ...(logs.length > 0 ? { logs: [...logs] } : {}), toolCalls: [...tools.calls],
              }
              finish(limits.maxOutputBytes === undefined ? result : boundOutput(result, limits.maxOutputBytes))
              continue
            }
            if (!state.open) continue
            if (event.type === "ready") {
              send({ type: "start", code: options.code, namespaces, maxOutputBytes: limits.maxOutputBytes })
              continue
            }
            if (event.type === "done") { finish(event.result); continue }
            if (event.type === "interrupted") {
              state.open = false
              Deferred.doneUnsafe(completed, Effect.interrupt)
              continue
            }
            if (event.type === "worker-error" || event.type === "worker-exit") { finish(failure()); continue }
            if (event.type === "invoke") {
              const call: Call = { cancelRequested: false, fiber: undefined }
              calls.set(event.id, call)
              call.fiber = yield* Effect.forkChild(tools.invoke(event.path, [...event.args]).pipe(
                Effect.onExit((exit) => Effect.sync(() => {
                  // Classify at actual settlement, before a later queued cancel could hide a spontaneous interrupt.
                  if (Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause) && !call.cancelRequested && state.open) {
                    state.open = false
                    Deferred.doneUnsafe(completed, Effect.failCause(exit.cause).pipe(Effect.orDie))
                  }
                  Queue.offerUnsafe(events, { type: "settled", id: event.id, exit })
                })),
                Effect.exit,
              ), { uninterruptible: false })
              continue
            }
            if (event.type === "settled") {
              if (Exit.isSuccess(event.exit)) {
                send({ type: "tool-result", id: event.id, result: { ok: true, value: event.exit.value } })
                continue
              }
              if (Cause.hasInterruptsOnly(event.exit.cause)) continue
              const error = Cause.squash(event.exit.cause)
              const safe: ToolFailure = error instanceof ToolRuntimeError
                ? { type: "runtime", kind: error.kind, message: error.message, suggestions: error.suggestions }
                : error instanceof ToolError ? { type: "tool", message: error.message }
                : { type: "execution", message: "Tool execution failed" }
              send({ type: "tool-result", id: event.id, result: { ok: false, error: safe } })
            }
          }
        })
        state.actor = yield* Effect.forkChild(actor, { uninterruptible: false })
        if (limits.timeoutMs !== undefined) {
          state.timer = yield* Effect.forkChild(Effect.sleep(Math.max(0, limits.timeoutMs - (performance.now() - admittedAt))).pipe(
            Effect.andThen(Effect.sync(() => {
              // Close admission immediately; the actor drains earlier FIFO log checkpoints before assembling the timeout.
              state.open = false
              Queue.offerUnsafe(events, { type: "deadline" })
            })),
          ), { uninterruptible: false })
        }
        return yield* Deferred.await(completed)
      }),
      ({ worker, message, error, exit }) => Effect.gen(function* () {
        state.open = false
        calls.forEach((call) => { call.cancelRequested = true })
        if (state.timer !== undefined) yield* Fiber.interrupt(state.timer)
        yield* Fiber.interruptAll([...calls.values()].flatMap((call) => call.fiber === undefined ? [] : [call.fiber]))
        // Bun can crash if terminated during module initialization. Imports must reach ready or exit first.
        yield* Deferred.await(readyOrExit)
        if (!state.exited) yield* Effect.promise(() => worker.terminate())
        if (state.actor !== undefined) yield* Fiber.interrupt(state.actor)
        worker.off("message", message)
        worker.off("error", error)
        worker.off("exit", exit)
        yield* Queue.shutdown(events)
      }),
    )
  })
})
