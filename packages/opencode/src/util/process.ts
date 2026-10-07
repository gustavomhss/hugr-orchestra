// Process: the legacy (cross-spawn) path, and the omni path when OPENCODE_EXPERIMENTAL_OMNI_SPAWNER is on (WP3).
//
// Mapping table, legacy option or behavior -> omni (integration plan §4 WP3, D-L1, D-L3, D-L4, D-L6):
//
// | Legacy                                  | Omni path                                                               |
// |-----------------------------------------|-------------------------------------------------------------------------|
// | cmd[0], cmd.slice(1)                    | spawn(command, args); no shell; omni batch-quotes `.cmd`/`.bat`         |
// | cwd                                     | cwd                                                                     |
// | env: undefined / {...}                  | inheritEnv:false, env: Omni.childEnv(env) (D-L3, HUGR_OMNI_* stripped)  |
// | env: null (empty environment)           | inheritEnv:false, env: {} (Windows still gets SystemRoot)               |
// | stdin "pipe"                            | stdin "pipe"; a real Writable, end() -> closeStdin()                    |
// | stdin "ignore" / unset                  | stdin "closed"; the stream is null                                      |
// | stdout/stderr "pipe"                    | one pump reads omni's single consumer into real Readables, with         |
// |                                         | backpressure: true (nothing dropped)                                    |
// | stdout/stderr "ignore" / unset          | pumped and discarded; the stream is null                                |
// | Stdio "inherit", number, Stream         | unsupported. Flag "1" delegates to legacy (counted, logged); "strict"   |
// |                                         | rejects `exited` with code EINVAL. Terminal callers use interactive().  |
// | shell: true / string                    | Shell.invocation() -> [shell, flag, joined]; cmd.exe (undefined) runs   |
// |                                         | ComSpec, args [], windowsVerbatimArgs '/d /s /c "<joined>"' (WP8b)      |
// | abort (AbortSignal)                     | tree stop({graceMs}); surfaces as an exit code: RunFailedError, or the  |
// |                                         | nothrow result. Never an OmniError.                                     |
// | abort already aborted                   | throws synchronously, as legacy (nothing runs)                          |
// | kill (signal name)                      | ignored: omni sends its own graceful request (SIGTERM / CTRL_BREAK)     |
// | timeout (ms to SIGKILL after abort)     | graceMs = timeout > 0 ? timeout : 2000 (whole tree, one deadline)       |
// | deadline (new)                          | timeoutMs; legacy: a timer that aborts the same way                     |
// | 'error' ENOENT / EACCES                 | NOT_FOUND, INVALID_CWD -> ENOENT; NOT_EXECUTABLE -> EACCES;             |
// |                                         | INVALID_ARGUMENT -> EINVAL; others -> EIO. Never a synchronous throw:   |
// |                                         | `exited` rejects with an Error carrying `code` and `cause`.             |
// | exited = code ?? (signal ? 1 : 0)       | exitCode ?? (signal ? 1 : 0), resolved at root exit plus output end or  |
// |                                         | a 2 s drain grace (D-L6); after the grace a tree whose pipes are still  |
// |                                         | held by descendants is stopped, so readers always end                   |
// | run(): buffers stdout/stderr unbounded  | omni run(), text:false, maxOutputBytes 1 GiB (OUTPUT_LIMIT -> ENOBUFS)  |
// | stop(proc): kill / taskkill /T /F       | child.stop({graceMs: 2000}) on the whole tree                           |
// | pid                                     | omni pid once spawned (the binding loads asynchronously: undefined      |
// |                                         | until then and after a startup failure)                                 |
// | interactive(): n/a                      | always legacy cross-spawn, stdio may inherit (§3 terminal callers)      |
import { type ChildProcess } from "child_process"
import { Readable, Writable, type Stream } from "node:stream"
import launch from "cross-spawn"
import { buffer } from "node:stream/consumers"
import { appendFile } from "node:fs/promises"
import path from "node:path"
import { Flag } from "@opencode-ai/core/flag/flag"
import { Global } from "@opencode-ai/core/global"
import { Omni } from "@opencode-ai/core/omni"
import { Shell as ShellPath } from "@opencode-ai/core/shell"
import { errorMessage } from "./error"

export type Stdio = "inherit" | "pipe" | "ignore" | number | Stream
export type Shell = boolean | string

export interface Options {
  cwd?: string
  env?: NodeJS.ProcessEnv | null
  stdin?: Stdio
  stdout?: Stdio
  stderr?: Stdio
  shell?: Shell
  abort?: AbortSignal
  kill?: NodeJS.Signals | number
  timeout?: number
  /** Whole-run deadline in ms: the process (omni: its whole tree) is stopped when it expires. */
  deadline?: number
}

export interface RunOptions extends Omit<Options, "stdout" | "stderr"> {
  nothrow?: boolean
}

export interface Result {
  code: number
  stdout: Buffer
  stderr: Buffer
}

export interface TextResult extends Result {
  text: string
}

export class RunFailedError extends Error {
  readonly cmd: string[]
  readonly code: number
  readonly stdout: Buffer
  readonly stderr: Buffer

  constructor(cmd: string[], code: number, stdout: Buffer, stderr: Buffer) {
    const text = stderr.toString().trim()
    super(
      text
        ? `Command failed with code ${code}: ${cmd.join(" ")}\n${text}`
        : `Command failed with code ${code}: ${cmd.join(" ")}`,
    )
    this.name = "ProcessRunFailedError"
    this.cmd = [...cmd]
    this.code = code
    this.stdout = stdout
    this.stderr = stderr
  }
}

/** What both paths return: a legacy ChildProcess satisfies it, and so does the omni adapter. */
export interface Child {
  readonly pid?: number
  readonly stdin: Writable | null
  readonly stdout: Readable | null
  readonly stderr: Readable | null
  readonly exitCode: number | null
  readonly signalCode: NodeJS.Signals | null
  kill(signal?: NodeJS.Signals | number): boolean
  exited: Promise<number>
}

/** A legacy child with inherited stdio (Process.interactive). */
export type Interactive = ChildProcess & { exited: Promise<number> }

const DRAIN_GRACE = 2_000
const MAX_OUTPUT = 1024 * 1024 * 1024
const EMPTY = Buffer.alloc(0)
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
type Route =
  | { kind: "legacy" | "delegate" | "refuse"; reason?: string }
  | { kind: "omni"; file: string; args: string[]; verbatim?: string }

export function spawn(cmd: string[], opts: Options = {}): Child {
  if (cmd.length === 0) throw new Error("Command is required")
  opts.abort?.throwIfAborted()
  const way = route(cmd, opts)
  if (way.kind === "omni") return new OmniChild(way.file, way.args, { ...opts, verbatim: way.verbatim })
  if (way.kind === "refuse") return new OmniChild(cmd[0], [], opts, () => Promise.reject(refused(way.reason)))
  if (way.kind === "delegate") {
    Omni.count("delegations")
    telemetry("delegation", { command: base(cmd[0]), reason: way.reason })
  }
  return legacy(cmd, opts)
}

/**
 * A child that needs the real terminal (stdio "inherit"): pagers, the TUI, sqlite3, auth prompts. Always the legacy
 * cross-spawn path, whatever the flag says (integration plan §3).
 */
export function interactive(cmd: string[], opts: Options = {}): Interactive {
  if (cmd.length === 0) throw new Error("Command is required")
  opts.abort?.throwIfAborted()
  telemetry("fallback", { command: base(cmd[0]), reason: "interactive" })
  return legacy(cmd, opts)
}

function legacy(cmd: string[], opts: Options): Interactive {
  const proc = launch(cmd[0], cmd.slice(1), {
    cwd: opts.cwd,
    shell: opts.shell,
    env: opts.env === null ? {} : opts.env ? { ...process.env, ...opts.env } : undefined,
    stdio: [opts.stdin ?? "ignore", opts.stdout ?? "ignore", opts.stderr ?? "ignore"],
    windowsHide: process.platform === "win32",
  })

  let closed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let deadline: ReturnType<typeof setTimeout> | undefined

  const abort = () => {
    if (closed) return
    if (proc.exitCode !== null || proc.signalCode !== null) return
    closed = true

    proc.kill(opts.kill ?? "SIGTERM")

    const ms = opts.timeout ?? 5_000
    if (ms <= 0) return
    timer = setTimeout(() => proc.kill("SIGKILL"), ms)
  }

  const exited = new Promise<number>((resolve, reject) => {
    const done = () => {
      opts.abort?.removeEventListener("abort", abort)
      if (timer) clearTimeout(timer)
      if (deadline) clearTimeout(deadline)
    }

    proc.once("exit", (code, signal) => {
      done()
      resolve(code ?? (signal ? 1 : 0))
    })

    proc.once("error", (error) => {
      done()
      reject(error)
    })
  })
  void exited.catch(() => undefined)

  if (opts.abort) {
    opts.abort.addEventListener("abort", abort, { once: true })
    if (opts.abort.aborted) abort()
  }
  if (opts.deadline !== undefined) deadline = setTimeout(abort, opts.deadline)

  const child = proc as Interactive
  child.exited = exited
  return child
}

export async function run(cmd: string[], opts: RunOptions = {}): Promise<Result> {
  if (cmd.length === 0) throw new Error("Command is required")
  opts.abort?.throwIfAborted()
  const way = route(cmd, { stdin: opts.stdin, shell: opts.shell })
  const collected =
    way.kind === "omni"
      ? runOmni(way.file, way.args, { ...opts, verbatim: way.verbatim })
      : collect(spawn(cmd, { ...opts, stdout: "pipe", stderr: "pipe" }))

  const out = await collected.catch((err: unknown) => {
    if (!opts.nothrow) throw err
    return {
      code: 1,
      stdout: EMPTY,
      stderr: Buffer.from(errorMessage(err)),
    }
  })
  if (out.code === 0 || opts.nothrow) return out
  throw new RunFailedError(cmd, out.code, out.stdout, out.stderr)
}

async function collect(proc: Child): Promise<Result> {
  if (!proc.stdout || !proc.stderr) throw new Error("Process output not available")
  const [code, stdout, stderr] = await Promise.all([proc.exited, buffer(proc.stdout), buffer(proc.stderr)])
  return { code, stdout, stderr }
}

async function runOmni(file: string, args: string[], opts: RunOptions & { verbatim?: string }): Promise<Result> {
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

// The legacy branch is duplicated in `packages/sdk/js/src/process.ts` because the SDK cannot import
// `opencode` without creating a cycle. Keep both copies in sync; the SDK has no omni branch (D-L10).
export async function stop(proc: Child) {
  if (proc instanceof OmniChild) return proc.terminate(DRAIN_GRACE)
  if (proc.exitCode !== null || proc.signalCode !== null) return

  if (process.platform !== "win32" || !proc.pid) {
    proc.kill()
    return
  }

  const out = await run(["taskkill", "/pid", String(proc.pid), "/T", "/F"], {
    nothrow: true,
  })

  if (out.code === 0) return
  proc.kill()
}

export async function text(cmd: string[], opts: RunOptions = {}): Promise<TextResult> {
  const out = await run(cmd, opts)
  return {
    ...out,
    text: out.stdout.toString(),
  }
}

export async function lines(cmd: string[], opts: RunOptions = {}): Promise<string[]> {
  return (await text(cmd, opts)).text.split(/\r?\n/).filter(Boolean)
}

/**
 * Structured omni log events (R2-17): spawn, delegation to legacy, and fallback (a kept legacy site ran while the
 * flag is on). One JSON line each in <log>/omni.log; nothing is written while the flag is off. Never logs arguments.
 */
export function telemetry(event: "spawn" | "delegation" | "fallback", fields: Record<string, unknown>) {
  if (Flag.OPENCODE_EXPERIMENTAL_OMNI_SPAWNER === "off") return
  const line = JSON.stringify({ time: new Date().toISOString(), event: `omni.${event}`, pid: process.pid, ...fields })
  void appendFile(path.join(Global.Path.log, "omni.log"), line + "\n").catch(() => undefined)
}

function route(cmd: string[], opts: Pick<Options, "stdin" | "stdout" | "stderr" | "shell">): Route {
  const mode = Flag.OPENCODE_EXPERIMENTAL_OMNI_SPAWNER
  if (mode === "off") return { kind: "legacy" }
  const odd = [opts.stdin, opts.stdout, opts.stderr].find((io) => io !== undefined && io !== "pipe" && io !== "ignore")
  if (odd !== undefined) {
    const reason = `stdio ${typeof odd === "object" ? "stream" : String(odd)} (use Process.interactive)`
    return { kind: mode === "strict" ? "refuse" : "delegate", reason }
  }
  if (!opts.shell) return { kind: "omni", file: cmd[0], args: cmd.slice(1) }
  const shell = ShellPath.invocation(opts.shell, cmd[0], cmd.slice(1))
  if (shell) return { kind: "omni", file: shell.file, args: shell.args }
  // cmd.exe parses its own command line: name it and hand it the line verbatim, as cross-spawn does (WP8b).
  const file = opts.shell === true ? (process.env.ComSpec ?? "cmd.exe") : String(opts.shell)
  return { kind: "omni", file, args: [], verbatim: `/d /s /c "${cmd.join(" ")}"` }
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

function refused(reason = "unsupported option") {
  return Object.assign(new Error(`OPENCODE_EXPERIMENTAL_OMNI_SPAWNER=strict: Process.spawn cannot take ${reason}.`), {
    code: "EINVAL",
  })
}

function bytes(data: Uint8Array) {
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
}

function base(file: string) {
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
class OmniChild implements Child {
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

export * as Process from "./process"
