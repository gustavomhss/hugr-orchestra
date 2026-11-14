import { Cause, Effect, Exit, Semaphore } from "effect"
import { InterpreterRuntimeError, type AstNode } from "./interpreter/model.js"
import { Executor, decodeReply, type Reply, type Request } from "./native-regex.js"

export type Driver = {
  readonly run: (request: () => Request, node: AstNode, commit?: (reply: Reply) => void) => Effect.Effect<Reply, unknown>
  readonly idle: Effect.Effect<void>
}

// Construct once inside each execute suspension, never in a shared provider or reusable runtime.
export function makeDriver(deadline: number, guard: Effect.Effect<void>): Driver {
  const permit = Semaphore.makeUnsafe(1)
  return {
    run: (factory, node, commit) => Effect.gen(function* () {
      const outcome = yield* permit.withPermits(1)(Effect.gen(function* () {
        const provider = yield* Executor
        if (provider === undefined)
          return yield* Effect.fail(new InterpreterRuntimeError("Native regular expression executor is unavailable for timed execution.", node))
        const request = yield* Effect.try({ try: factory, catch: (error) => error })
        const remaining = deadline - performance.now()
        // Capture expiry immediately; only the post-release absolute guard may wait for the execution timer.
        if (remaining <= 0) return yield* Effect.fail(new Error("Native regex execution budget exhausted"))
        const value = yield* provider.run(request, remaining)
        return yield* Effect.try({
          try: () => {
            const reply = decodeReply(request, value)
            commit?.(reply)
            return reply
          },
          catch: (error) => error,
        })
      }).pipe(Effect.exit))
      if (Exit.isFailure(outcome) && Cause.hasInterruptsOnly(outcome.cause)) return yield* outcome
      yield* guard
      return yield* outcome
    }),
    idle: permit.withPermits(1)(Effect.void),
  }
}
