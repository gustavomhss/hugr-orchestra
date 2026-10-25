export * as ServeShutdown from "./serve-shutdown"

import { constants } from "node:os"
import * as Effect from "effect/Effect"

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
    const listeners = signals(platform).map((signal) => {
      const listener = () => {
        onSignal(signal)
        resume(Effect.void)
      }
      emitter.once(signal, listener)
      return { signal, listener }
    })
    return Effect.sync(() => listeners.forEach((item) => emitter.off(item.signal, item.listener)))
  })
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
