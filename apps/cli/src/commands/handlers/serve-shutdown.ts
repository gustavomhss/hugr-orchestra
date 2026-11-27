export * as ServeShutdown from "./serve-shutdown"

import { constants } from "node:os"
import { Deferred, Effect } from "effect"

export type Emitter = {
  once(signal: NodeJS.Signals, listener: () => void): unknown
  off(signal: NodeJS.Signals, listener: () => void): unknown
}

export type Status = "started" | "disposed"

// SIGBREAK is what a Windows console delivers for Ctrl+Break and for a closing console window; SIGINT is Ctrl+C.
// The Effect runtime already interrupts on SIGINT and SIGTERM. SIGHUP and SIGBREAK would otherwise end the
// process before the scope finalizers run.
export function signals(platform: NodeJS.Platform): NodeJS.Signals[] {
  return platform === "win32" ? ["SIGTERM", "SIGHUP", "SIGINT", "SIGBREAK"] : ["SIGTERM", "SIGHUP", "SIGINT"]
}

export function exitCode(signal: NodeJS.Signals) {
  return 128 + (constants.signals[signal] ?? 0)
}

/** Completes on the first shutdown signal after calling onSignal, and removes every listener when it ends. */
export function untilSignal(emitter: Emitter, platform: NodeJS.Platform, onSignal: (signal: NodeJS.Signals) => void) {
  return Effect.callback<void>((resume) => {
    // The returned finalizer runs only on interruption, so a delivered signal removes the other listeners itself.
    const remove = () => listeners.forEach((item) => emitter.off(item.signal, item.listener))
    const listeners = signals(platform).map((signal) => {
      const listener = () => {
        remove()
        onSignal(signal)
        resume(Effect.void)
      }
      emitter.once(signal, listener)
      return { signal, listener }
    })
    return Effect.sync(remove)
  })
}

/** Interrupt a scoped serve lifetime on the first signal and keep handling signals until its cleanup finishes. */
export function withSignals<A, E, R>(
  emitter: Pick<Emitter, "off"> & { prependListener(signal: NodeJS.Signals, listener: () => void): unknown },
  platform: NodeJS.Platform,
  onSignal: (signal: NodeJS.Signals) => void,
  lifetime: Effect.Effect<A, E, R>,
) {
  return Effect.scoped(Effect.gen(function* () {
    const received = yield* Deferred.make<void>()
    yield* Effect.acquireRelease(
      Effect.sync(() => signals(platform).map((signal) => {
        const listener = () => {
          if (Deferred.isDoneUnsafe(received)) return
          onSignal(signal)
          Deferred.doneUnsafe(received, Effect.void)
        }
        // Record SIGINT and SIGTERM before NodeRuntime interrupts the main fiber.
        emitter.prependListener(signal, listener)
        return { signal, listener }
      })),
      (listeners) => Effect.sync(() => listeners.forEach((item) => emitter.off(item.signal, item.listener))),
    )
    return yield* Effect.raceFirst(Deferred.await(received), lifetime)
  }))
}

/** One evidence line per phase, read by native/omni/campaign/windows-lifecycle.ts. Only written under DEBUG logging. */
export function evidence(input: {
  level: string | undefined
  pid: number
  signal: NodeJS.Signals
  status: Status
  elapsedMs: number
}) {
  if (input.level !== "DEBUG") return undefined
  return `CLI_SHUTDOWN ${JSON.stringify({ event: "cli.shutdown", level: "DEBUG", pid: input.pid, signal: input.signal, status: input.status, elapsedMs: input.elapsedMs })}\n`
}
