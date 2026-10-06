export * as PtyOmni from "./omni.ts"

// The omni terminal backend (D-L7): a Proc over a hugr-omni PtyChild, used when OPENCODE_EXPERIMENTAL_OMNI_SPAWNER is
// on. omni's output has a single consumer, so this module claims it synchronously at spawn and pumps it eagerly; data
// and the exit wait in a queue until the first listener arrives, so a program that prints and exits at once loses
// nothing. It must also load under Node with --experimental-strip-types (the node smoke), so it imports only node:
// builtins and .ts files that do the same.

import os from "node:os"
import { Omni } from "../omni.ts"
import { clampSize } from "./pty.ts"
import type { Disp, Exit, Opts, Proc } from "./pty.ts"

/** How long onExit waits, after the root exited, for the output to end (a background job may hold the terminal). */
export const DRAIN_MS = 1000

type Terminal = Omni.Child & { resize(cols: number, rows: number): void }

export type OmniProc = Proc & {
  /** The live tree, for adoption (OmniAdoption.release); its output is already claimed by this Proc. */
  readonly child: Terminal
  /** Ends the whole tree within graceMs; never rejects. */
  stop(graceMs?: number): Promise<void>
}

/** Loads hugr-omni through the core loader (failing loudly when it is missing) and returns a synchronous spawn. */
export async function load() {
  const binding = await Omni.load()
  return {
    spawn(file: string, args: string[], opts: Opts): OmniProc {
      const child = binding.spawn(file, args, {
        pty: { cols: clampSize(opts.cols ?? 80), rows: clampSize(opts.rows ?? 24) },
        cwd: opts.cwd,
        inheritEnv: false,
        env: Omni.childEnv(opts.env),
      })
      Omni.count("spawns")
      return adapt(child)
    },
  }
}

/** The text a gap of `bytes` dropped bytes becomes; it is output like any other, so the cursor counts it. */
export function marker(bytes: number) {
  return `\x1b[0m\r\n[orchestra: ${bytes} bytes of output skipped]\r\n`
}

/** A Proc over a terminal child whose output nobody has claimed yet. Claims it now. */
export function adapt(child: Terminal): OmniProc {
  const iterator = child.output[Symbol.asyncIterator]()
  const decoder = new TextDecoder()
  const onData = new Set<(data: string) => void>()
  const onExit = new Set<(event: Exit) => void>()
  // Data waits here only until the first listener; after the last one left, output is read and discarded.
  const queued: string[] = []
  const state = { listened: false, exit: undefined as Exit | undefined }

  const emit = (data: string) => {
    if (!state.listened) {
      queued.push(data)
      return
    }
    for (const listener of onData) call(listener, data)
  }
  const pump = async () => {
    for (;;) {
      const next = await iterator.next().catch(() => undefined)
      if (!next || next.done) return
      if (next.value.lostBefore) emit(marker(next.value.lostBefore))
      const data = typeof next.value.data === "string" ? next.value.data : decoder.decode(next.value.data)
      if (data) emit(data)
    }
  }
  const ended = pump()
  void child
    .wait()
    .then(
      (exit) => exit,
      () => undefined,
    )
    .then(async (exit) => {
      await drained(ended)
      state.exit = { exitCode: exitCode(exit), ...(exit?.signal ? { signal: exit.signal } : {}) }
      for (const listener of onExit) call(listener, state.exit)
    })

  const stop = (graceMs?: number) =>
    child.stop(graceMs === undefined ? undefined : { graceMs }).then(
      () => undefined,
      () => undefined,
    )

  return {
    child,
    pid: child.pid,
    onData(listener) {
      onData.add(listener)
      if (!state.listened) {
        state.listened = true
        for (const data of queued.splice(0)) call(listener, data)
      }
      return dispose(onData, listener)
    },
    onExit(listener) {
      onExit.add(listener)
      const exit = state.exit
      if (exit) queueMicrotask(() => onExit.has(listener) && call(listener, exit))
      return dispose(onExit, listener)
    },
    write(data) {
      child.write(data).catch(() => undefined)
    },
    resize(cols, rows) {
      try {
        child.resize(clampSize(cols), clampSize(rows))
      } catch {
        // CLOSED: the terminal is gone; a resize then has nothing to do.
      }
    },
    kill() {
      void stop()
    },
    stop,
  }
}

/** The output's end, or DRAIN_MS, whichever comes first. */
async function drained(ended: Promise<void>) {
  const timer = { id: undefined as ReturnType<typeof setTimeout> | undefined }
  await Promise.race([ended, new Promise<void>((resolve) => (timer.id = setTimeout(resolve, DRAIN_MS)))])
  clearTimeout(timer.id)
}

/** exitCode, or 128 + the signal's number for a Unix child ended by a signal (a shell's convention). */
function exitCode(exit: { exitCode: number | null; signal: string | null } | undefined) {
  if (!exit) return 1
  if (exit.exitCode !== null) return exit.exitCode
  const signals: Record<string, number | undefined> = os.constants.signals
  return 128 + (signals[exit.signal ?? ""] ?? 0)
}

function dispose<T>(set: Set<T>, listener: T): Disp {
  return { dispose: () => void set.delete(listener) }
}

function call<T>(listener: (value: T) => void, value: T) {
  try {
    listener(value)
  } catch {
    // A listener's failure is its own; the pump and the other listeners go on.
  }
}
