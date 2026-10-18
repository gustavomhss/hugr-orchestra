// The omni side of Process (WP3): the child adapter over hugr-omni's pipe child, run(), and omni telemetry.
// process.ts routes each call here or to the legacy path; its header holds the legacy -> omni mapping table.
import { Readable, Writable } from "node:stream"
import { appendFile } from "node:fs/promises"
import path from "node:path"
import { Flag } from "@orchestra/core/flag/flag"
import { Global } from "@orchestra/core/global"
import { Omni } from "@orchestra/core/omni"
import { errorMessage } from "./error"
import type { Child, Options, Result, RunOptions } from "./process"

export const DRAIN_GRACE = 2_000
const MAX_OUTPUT = 1024 * 1024 * 1024
export const EMPTY = Buffer.alloc(0)
// The slice of hugr-omni's PipeChild<Uint8Array> this adapter uses (only core/src/omni.ts imports hugr-omni).
type Pipe = {
  readonly pid: number
  readonly output: AsyncIterable<{ stream: "stdout" | "stderr" | "pty"; data: Uint8Array; lostBefore?: number }>
  write(data: Uint8Array): Promise<void>
  closeStdin(): Promise<void>
  wait(): Promise<{ exitCode: number | null; signal: string | null }>
  stop(options?: { graceMs?: number }): Promise<unknown>
}
type Collected = { exitCode: number | null; signal: string | null; stdout: Uint8Array; stderr: Uint8Array }

export async function runOmni(file: string, args: string[], opts: RunOptions & { verbatim?: string }): Promise<Result> {
  const binding = await Omni.load()
  const pending = binding.run(file, args, { ...common(opts), text: false, maxOutputBytes: MAX_OUTPUT })
  Omni.count("spawns")
  telemetry("spawn", { command: base(file), mode: "run" })
  const result: Collected = await pending.catch((error: unknown) => {
    // Cancellation is an exit like any other here (RunFailedError or the nothrow result), never an OmniError.
    if (code(error) !== "ABORTED") throw startup(error, file)
    const partial = (error as { result?: Collected }).result
    return partial ?? { exitCode: 1, signal: null, stdout: EMPTY, stderr: EMPTY }
  })
  return {
    code: result.exitCode ?? (result.signal ? 1 : 0),
    stdout: bytes(result.stdout),
    stderr: bytes(result.stderr),
  }
}

/**
 * Structured omni log events (R2-17): spawn, delegation to legacy, and fallback (a kept legacy site ran while the
 * flag is on). One JSON line each in <log>/omni.log; nothing is written while the flag is off. Never logs arguments.
 */
export function telemetry(event: "spawn" | "delegation" | "fallback", fields: Record<string, unknown>) {
  if (Flag.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER === "off") return
  const line = JSON.stringify({ time: new Date().toISOString(), event: `omni.${event}`, pid: process.pid, ...fields })
  void appendFile(path.join(Global.Path.log, "omni.log"), line + "\n").catch(() => undefined)
}

function common(opts: Options & { verbatim?: string }) {
  return {
    ...(opts.verbatim === undefined ? {} : { windowsVerbatimArgs: opts.verbatim }),
    cwd: opts.cwd,
    inheritEnv: false,
    env: opts.env === null ? {} : Omni.childEnv(opts.env),
    graceMs: opts.timeout !== undefined && opts.timeout > 0 ? opts.timeout : DRAIN_GRACE,
    timeoutMs: opts.deadline,
    signal: opts.abort,
  }
}

const CODES: Record<string, string> = {
  NOT_FOUND: "ENOENT",
  INVALID_CWD: "ENOENT",
  NOT_EXECUTABLE: "EACCES",
  INVALID_ARGUMENT: "EINVAL",
  OUTPUT_LIMIT: "ENOBUFS",
  CLOSED: "EPIPE",
  IO: "EIO",
}

function code(error: unknown) {
  return error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : undefined
}

/** An omni startup failure as a Node-style spawn error (ENOENT, EACCES, ...). Anything else, such as a loader that
 * could not find the addon, stays as it is: loud. */
function startup(error: unknown, file: string) {
  const mapped = CODES[code(error) ?? ""]
  if (!mapped) return error
  return Object.assign(new Error(`spawn ${file} ${mapped}: ${errorMessage(error)}`, { cause: error }), {
    code: mapped,
    syscall: `spawn ${file}`,
    path: file,
  })
}

export function refused(reason = "unsupported option") {
  return Object.assign(new Error(`ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER=strict: Process.spawn cannot take ${reason}.`), {
    code: "EINVAL",
  })
}

function bytes(data: Uint8Array) {
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
}

export function base(file: string) {
  return path.basename(file)
}

/** A real Readable fed by the pump; push() past the high-water mark pauses the pump until the consumer reads. */
class Output extends Readable {
  private wake?: () => void

  override _read() {
    this.release()
  }

  override _destroy(error: Error | null, callback: (error?: Error | null) => void) {
    this.release()
    callback(error)
  }

  feed(data: Uint8Array): Promise<void> | undefined {
    if (this.destroyed) return
    if (this.push(bytes(data))) return
    return new Promise((resolve) => (this.wake = resolve))
  }

  private release() {
    const wake = this.wake
    this.wake = undefined
    wake?.()
  }
}

/** A real Writable over the child's stdin; end() closes it. Writes after the child closed stdin are discarded. */
class Input extends Writable {
  constructor(private readonly child: Promise<Pipe | undefined>) {
    super()
  }

  override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.child
      .then((child) => child?.write(chunk))
      .then(
        () => callback(),
        (error: unknown) => callback(code(error) === "CLOSED" ? undefined : (startup(error, "stdin") as Error)),
      )
  }

  override _final(callback: (error?: Error | null) => void) {
    this.child
      .then((child) => child?.closeStdin())
      .then(
        () => callback(),
        () => callback(),
      )
  }
}

/** The omni side of Process.spawn: same shape as the legacy child, the whole tree behind it. */
export class OmniChild implements Child {
  pid: number | undefined
  exitCode: number | null = null
  signalCode: NodeJS.Signals | null = null
  readonly stdin: Input | null
  readonly stdout: Output | null
  readonly stderr: Output | null
  readonly exited: Promise<number>
  private readonly child: Promise<Pipe | undefined>
  private readonly grace: number
  private stopping?: Promise<void>
  private paused = false

  constructor(
    file: string,
    args: string[],
    opts: Options & { verbatim?: string },
    start = () => launchOmni(file, args, opts),
  ) {
    this.grace = common(opts).graceMs
    const started = start()
    this.child = started.catch(() => undefined)
    this.stdin = opts.stdin === "pipe" ? new Input(this.child) : null
    this.stdout = opts.stdout === "pipe" ? new Output() : null
    this.stderr = opts.stderr === "pipe" ? new Output() : null
    this.exited = started.then(
      (child) => this.watch(child),
      (error: unknown) => {
        this.close()
        throw error
      },
    )
    void this.exited.catch(() => undefined)
  }

  kill() {
    void this.terminate(this.grace)
    return true
  }

  /** Stops the whole tree (also after the root exited: that ends descendants still holding the pipes). */
  terminate(graceMs: number) {
    this.stopping ??= this.child
      .then(async (child) => {
        await child?.stop({ graceMs })
      })
      .catch(() => undefined)
    return this.stopping
  }

  private async watch(child: Pipe | undefined) {
    if (!child) {
      // Cancelled while the binding was loading: nothing ran.
      this.close()
      this.exitCode = 1
      return 1
    }
    this.pid = child.pid
    const pumped = this.pump(child)
    const exit = await child.wait()
    let timer: ReturnType<typeof setTimeout> | undefined
    const drained = await Promise.race([
      pumped.then(() => true),
      new Promise<boolean>((resolve) => (timer = setTimeout(() => resolve(false), DRAIN_GRACE))),
    ])
    clearTimeout(timer)
    // The root exited but descendants still hold the pipes: stop the tree so every reader ends (D-L6). A pump that
    // waits for a slow reader is not stuck, and keeps its data.
    if (!drained && !this.paused) void this.terminate(this.grace)
    this.exitCode = exit.exitCode
    this.signalCode = exit.signal as NodeJS.Signals | null
    return exit.exitCode ?? (exit.signal ? 1 : 0)
  }

  private async pump(child: Pipe) {
    try {
      for await (const chunk of child.output) {
        const out = chunk.stream === "stderr" ? this.stderr : this.stdout
        if (!out) continue
        // backpressure: true means omni never drops; a gap anyway fails that stream rather than gapping it (D-L5).
        if (chunk.lostBefore) out.destroy(new Error(`omni dropped ${chunk.lostBefore} bytes of ${chunk.stream}`))
        const wait = out.feed(chunk.data)
        if (!wait) continue
        this.paused = true
        await wait
        this.paused = false
      }
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error))
      this.stdout?.destroy(failure)
      this.stderr?.destroy(failure)
    }
    this.close()
  }

  private close() {
    this.stdout?.push(null)
    this.stderr?.push(null)
    if (this.stdin && !this.stdin.writableFinished) this.stdin.destroy()
  }
}

async function launchOmni(
  file: string,
  args: string[],
  opts: Options & { verbatim?: string },
): Promise<Pipe | undefined> {
  const binding = await Omni.load()
  if (opts.abort?.aborted) return
  try {
    const child = binding.spawn(file, args, {
      ...common(opts),
      stdin: opts.stdin === "pipe" ? "pipe" : "closed",
      text: false,
      backpressure: true,
    })
    Omni.count("spawns")
    telemetry("spawn", { command: base(file), mode: "spawn" })
    return child
  } catch (error) {
    throw startup(error, file)
  }
}
