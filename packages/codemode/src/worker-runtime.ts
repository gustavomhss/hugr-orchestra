import { parentPort } from "node:worker_threads"
import { Cause, Deferred, Effect, Exit, Fiber } from "effect"
import type { DataValue, Result } from "./codemode.js"
import { Interpreter, normalizeError, parseProgram } from "./interpreter/runtime.js"
import { boundOutput } from "./interpreter/output.js"
import { ToolError } from "./tool-error.js"
import { ToolRuntime, ToolRuntimeError } from "./tool-runtime.js"
import type { ToolFailure, WorkerCommand, WorkerSignal } from "./worker-protocol.js"

type RemoteCall = {
  readonly id: number
  readonly result: Deferred.Deferred<unknown, Error>
  readonly cancelled: Deferred.Deferred<void>
}

/** Worker-owned interpreter lifetime. The entry observes rejection without blocking module evaluation. */
export const runWorker = (): Promise<void> => Effect.runPromise(Effect.gen(function* () {
  const port = parentPort
  if (port === null) return yield* Effect.die("CodeMode worker requires a parent port.")
  const start = Deferred.makeUnsafe<Extract<WorkerCommand, { type: "start" }>>()
  const calls = new Map<number, RemoteCall>()
  const sequence = { next: 0 }
  const send = (signal: WorkerSignal): void => { port.postMessage(signal) }
  const toolError = (error: ToolFailure): Error => error.type === "runtime"
    ? new ToolRuntimeError(error.kind, error.message, error.suggestions)
    : error.type === "tool" ? new ToolError({ message: error.message }) : new Error(error.message)
  const message = (command: WorkerCommand): void => {
    if (command.type === "start") { Deferred.doneUnsafe(start, Effect.succeed(command)); return }
    const call = calls.get(command.id)
    if (call === undefined) return
    if (command.type === "cancelled") { Deferred.doneUnsafe(call.cancelled, Effect.void); return }
    Deferred.doneUnsafe(call.result, command.result.ok
      ? Effect.succeed(command.result.value) : Effect.fail(toolError(command.result.error)))
  }
  yield* Effect.acquireUseRelease(
    Effect.sync(() => { port.on("message", message); send({ type: "ready" }) }),
    () => Effect.gen(function* () {
      const command = yield* Deferred.await(start)
      const namespaces = new Map(command.namespaces.map((entry) => [JSON.stringify(entry.path), entry.keys]))
      const keys = (path: ReadonlyArray<string>): ReadonlyArray<string> => {
        const found = path.some(ToolRuntime.isBlockedMember) ? undefined : namespaces.get(JSON.stringify(path))
        if (found !== undefined) return found
        throw new ToolRuntimeError("UnknownTool", `Unknown tool namespace '${path.join(".")}'.`, [
          "Object.keys(tools) lists the available namespaces; tools.$codemode.search({ query }) finds described tools.",
        ])
      }
      const invoke = (path: ReadonlyArray<string>, args: Array<unknown>): Effect.Effect<unknown, Error> =>
        Effect.acquireUseRelease(
          Effect.sync(() => {
            // Preserve the existing default argument boundary, including undefined properties and sparse holes.
            const externalArgs = args.map((arg) => ToolRuntime.copyOut(ToolRuntime.copyIn(arg, `Arguments for tool '${path.join(".")}'`)))
            const call: RemoteCall = {
              id: sequence.next++, result: Deferred.makeUnsafe<unknown, Error>(), cancelled: Deferred.makeUnsafe<void>(),
            }
            calls.set(call.id, call)
            send({ type: "invoke", id: call.id, path, args: externalArgs })
            return call
          }),
          (call) => Deferred.await(call.result),
          (call, exit) => Effect.gen(function* () {
            if (Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)) {
              send({ type: "cancel", id: call.id })
              // The parent acknowledges only after the exact host fiber and its finalizers have settled.
              yield* Deferred.await(call.cancelled)
            }
            calls.delete(call.id)
          }),
        )
      const logs: Array<string> = []
      const operation = Effect.gen(function* () {
        if (command.code.trim().length === 0) return {
          ok: false, error: { kind: "ParseError", message: "Code cannot be empty." }, toolCalls: [],
        } satisfies Result
        const program = parseProgram(command.code)
        const interpreter = new Interpreter(invoke, keys, logs, (line) => send({ type: "log", line }))
        const value = yield* interpreter.run(program)
        return {
          ok: true, value: ToolRuntime.copyOut(ToolRuntime.copyIn(value, "Execution result"), true) as DataValue,
          ...(logs.length > 0 ? { logs: [...logs] } : {}), toolCalls: [],
        } satisfies Result
      }).pipe(Effect.catchCause((cause) => Cause.hasInterruptsOnly(cause) ? Effect.interrupt : Effect.succeed({
        ok: false, error: normalizeError(Cause.squash(cause)),
        ...(logs.length > 0 ? { logs: [...logs] } : {}), toolCalls: [],
      } satisfies Result)))
      const execution = yield* Effect.forkChild(operation)
      const exit = yield* Fiber.await(execution)
      if (Exit.isFailure(exit)) { send({ type: "interrupted" }); return }
      send({ type: "done", result: command.maxOutputBytes === undefined ? exit.value : boundOutput(exit.value, command.maxOutputBytes) })
    }),
    () => Effect.sync(() => { port.off("message", message); port.close() }),
  )
}))
