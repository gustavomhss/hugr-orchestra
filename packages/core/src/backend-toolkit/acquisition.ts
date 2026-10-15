export * as BackendToolkitAcquisition from "./acquisition"

import { Cause, Effect, Exit } from "effect"

type Attempt =
  | { readonly running: Promise<string | undefined>; readonly at: number }
  | { readonly failed: string; readonly at: number }

/** Own the entire work independently of every waiter, and settle every Exit before allowing another attempt. */
export function make<E>(retryMs: number, describe: (cause: Cause.Cause<E>) => string) {
  const attempts = new Map<string, Attempt>()
  const once = Effect.fnUntraced(function* (key: string, work: Effect.Effect<unknown, E>) {
    const attempt = attempts.get(key)
    if (attempt && "running" in attempt) return yield* Effect.promise(() => attempt.running)
    if (attempt && Date.now() - attempt.at < retryMs) return attempt.failed
    const running = Promise.withResolvers<string | undefined>()
    attempts.set(key, { running: running.promise, at: Date.now() })
    const settle = (failed?: string) => {
      if (failed === undefined) attempts.delete(key)
      if (failed !== undefined) attempts.set(key, { failed, at: Date.now() })
      running.resolve(failed)
    }
    // Even a runner rejection or a throwing diagnostic formatter must resolve the shared promise. Neither exposes
    // uninspected exception text. Effect captures finalizer rejection, defects and interruption in the Exit.
    void Promise.resolve().then(() => Effect.runPromiseExit(work)).then((exit) => {
      if (Exit.isSuccess(exit)) return settle()
      const formatted = Effect.runSyncExit(Effect.sync(() => describe(exit.cause)))
      settle(Exit.isSuccess(formatted) && formatted.value ? formatted.value : "acquisition-diagnostics-unavailable")
    }, () => settle("acquisition-runtime-rejected"))
    return yield* Effect.promise(() => running.promise)
  })
  return { once, get: (key: string) => attempts.get(key) }
}
