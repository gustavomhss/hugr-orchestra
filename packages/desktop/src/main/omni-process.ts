export * as DesktopOmni from "./omni-process"

// The desktop main process's spawn sites, through omni (integration plan §4 WP4), behind
// ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER. Each site keeps its legacy code as the default and swaps in one of the three
// adapters below, shaped like what it used before: execFile, a ChildProcess with piped stdio, a node-pty terminal.
// The binding comes from core's loader (the only importer of hugr-omni, D-L2); every spawn here is counted there.
// No electron import: these modules also run under bun test and in the Linux access proof (Electron as Node).

import { EventEmitter, once } from "node:events"
import { constants } from "node:os"
import { PassThrough, type Readable, Writable } from "node:stream"
import { omniSpawner } from "../../../core/src/flag/flag"
import { Omni } from "@orchestra/core/omni"

// The binding's pipe child, through core's loader (no import of hugr-omni here, D-L2).
type PipeChild = Extract<ReturnType<Awaited<ReturnType<typeof Omni.load>>["spawn"]>, { closeStdin: unknown }>

// D-L6: after the root exits, its output gets this long to end before the rest of the tree is stopped.
const DRAIN_GRACE = 2000

/** On (`1` or `strict`): the migrated sites spawn through omni. The desktop sites never need a legacy delegation. */
export function enabled() {
  return omniSpawner(process.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER) !== "off"
}

type Env = Record<string, string | undefined>

/**
 * D-L3 with legacy semantics kept: no `env` inherits process.env (core's childEnv), an explicit `env` replaces it,
 * as it does for child_process. Either way HUGR_OMNI_* never reaches a child, and the binding gets inheritEnv:false.
 */
function environment(env?: Env) {
  if (!env) return Omni.childEnv()
  return Object.fromEntries(
    Object.entries(env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined && !entry[0].toUpperCase().startsWith("HUGR_OMNI_"),
    ),
  )
}

/** A startup failure as child_process reports it (`code: "ENOENT"`), so the sites' error checks keep working. */
function startFailure(error: unknown, file: string) {
  const code = error instanceof Error && "code" in error ? error.code : undefined
  const errno =
    code === "NOT_FOUND" || code === "INVALID_CWD" ? "ENOENT" : code === "NOT_EXECUTABLE" ? "EACCES" : undefined
  if (!errno) return error instanceof Error ? error : new Error(String(error))
  return Object.assign(new Error(`spawn ${file} ${errno}`, { cause: error }), {
    code: errno,
    syscall: `spawn ${file}`,
    path: file,
  })
}

export type ExecOptions = { env?: Env; cwd?: string; timeout?: number; maxBuffer?: number; killSignal?: string }

/**
 * promisify(execFile) on omni's run(): resolves `{ stdout, stderr }` on exit 0, otherwise rejects like execFile
 * (`code` is the exit code, or `"ENOENT"`; `killed`/`signal` on a timeout; `stdout`/`stderr` attached). A timeout
 * or an output over `maxBuffer` (default 1 MiB, like execFile) stops the whole tree.
 */
export async function execFile(file: string, args: string[], options: ExecOptions = {}) {
  const omni = await Omni.load()
  const cmd = [file, ...args].join(" ")
  Omni.count("spawns")
  const result = await omni
    .run(file, args, {
      cwd: options.cwd,
      inheritEnv: false,
      env: environment(options.env),
      timeoutMs: options.timeout || undefined,
      graceMs: options.killSignal === "SIGKILL" ? 0 : undefined,
      maxOutputBytes: options.maxBuffer ?? 1024 * 1024,
    })
    .catch((error: unknown) => {
      const code = error instanceof Error && "code" in error ? error.code : undefined
      if (code !== "OUTPUT_LIMIT") throw Object.assign(startFailure(error, file), { cmd, stdout: "", stderr: "" })
      throw Object.assign(new Error(`${cmd}: output over maxBuffer`, { cause: error }), {
        code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
        cmd,
      })
    })
  if (result.success) return { stdout: result.stdout, stderr: result.stderr }
  const timedOut = result.reason === "timeout"
  throw Object.assign(new Error(`Command failed: ${cmd}\n${result.stderr}`), {
    code: timedOut ? null : result.exitCode,
    killed: timedOut || result.reason === "killed",
    signal: result.signal ?? (timedOut ? (options.killSignal ?? "SIGTERM") : null),
    cmd,
    stdout: result.stdout,
    stderr: result.stderr,
  })
}

/** What the sites use of a ChildProcess with piped stdio; node's ChildProcessWithoutNullStreams has all of it. */
export interface Spawned {
  readonly pid?: number
  readonly stdin: Writable
  readonly stdout: Readable
  readonly stderr: Readable
  kill(signal?: NodeJS.Signals): boolean
  once(event: "error", listener: (error: Error) => void): unknown
  once(event: "exit" | "close", listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown
}

export type SpawnOptions = {
  env?: Env
  cwd?: string
  stdin?: "pipe" | "closed"
  output?: "pipe" | "ignore"
  signal?: AbortSignal
}

/**
 * child_process.spawn with `stdio: ["pipe", "pipe", "pipe"]` (or a closed stdin, ignored output), on omni: bytes
 * (`text: false`) with backpressure, so a slow reader blocks the child instead of losing output. `kill()` stops the
 * whole tree (`SIGKILL`: at once); so does `signal`, which also emits an AbortError, as child_process does. Events:
 * `spawn`, `error` (startup failure, with child_process's `code`), `exit`, then `close` once the output ended, or
 * DRAIN_GRACE after the exit, when the rest of the tree is stopped.
 */
export function spawn(file: string, args: string[], options: SpawnOptions = {}) {
  return new OmniProcess(file, args, options)
}

class OmniProcess extends EventEmitter {
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly stdin: Writable
  pid: number | undefined
  #started: Promise<PipeChild | undefined>
  #exited = false

  constructor(file: string, args: string[], options: SpawnOptions) {
    super()
    if (options.output === "ignore") [this.stdout, this.stderr].forEach((stream) => stream.resume())
    const signal = options.signal
    const abort = () => {
      if (!this.kill()) return
      this.emit("error", new DOMException("The operation was aborted", "AbortError"))
    }
    if (signal?.aborted) queueMicrotask(abort)
    else signal?.addEventListener("abort", abort, { once: true })
    this.once("exit", () => signal?.removeEventListener("abort", abort))
    this.#started = this.#start(file, args, options)
    // Writes after a failed start or after the child closed its stdin are dropped: the process reports its own end.
    this.stdin = new Writable({
      write: (chunk: Buffer, _encoding, done) =>
        void this.#started
          .then((child) => child?.write(chunk))
          .then(
            () => done(),
            () => done(),
          ),
      final: (done) =>
        void this.#started
          .then((child) => child?.closeStdin())
          .then(
            () => done(),
            () => done(),
          ),
    })
  }

  kill(signal: NodeJS.Signals = "SIGTERM") {
    if (this.#exited) return false
    void this.#started.then((child) => child?.stop({ graceMs: signal === "SIGKILL" ? 0 : undefined })).catch(() => {})
    return true
  }

  async #start(file: string, args: string[], options: SpawnOptions) {
    const child = await Omni.load()
      .then((omni) =>
        omni.spawn(file, args, {
          cwd: options.cwd,
          inheritEnv: false,
          env: environment(options.env),
          stdin: options.stdin ?? "pipe",
          text: false,
          backpressure: true,
        }),
      )
      .catch((error: unknown) => {
        this.#exited = true
        this.stdout.end()
        this.stderr.end()
        this.emit("error", startFailure(error, file))
      })
    if (!child) return
    Omni.count("spawns")
    this.pid = child.pid
    this.emit("spawn")
    void this.#run(child)
    return child
  }

  async #run(child: PipeChild) {
    const done = Promise.withResolvers<void>()
    const reading = this.#pump(child, done.promise)
    const exit = await child.wait()
    this.#exited = true
    const signal = exit.signal as NodeJS.Signals | null
    this.emit("exit", exit.exitCode, signal)
    const timer = setTimeout(() => done.resolve(), DRAIN_GRACE)
    await Promise.race([reading, done.promise])
    clearTimeout(timer)
    // A descendant still holds the pipes: it outlived the root's grace, so the tree goes (D-L6).
    done.resolve()
    await child.stop().catch(() => undefined)
    this.stdout.end()
    this.stderr.end()
    this.emit("close", exit.exitCode, signal)
  }

  async #pump(child: PipeChild, done: Promise<void>) {
    const ended = done.then(() => undefined)
    const output = child.output[Symbol.asyncIterator]()
    for (;;) {
      const next = await Promise.race([output.next(), ended])
      if (!next || next.done) return void (await output.return?.())
      const stream = next.value.stream === "stderr" ? this.stderr : this.stdout
      // backpressure:true never drops; a gap anyway is a failed stream, never gapped bytes (D-L5).
      if (next.value.lostBefore) stream.destroy(new Error(`omni dropped ${next.value.lostBefore} bytes of output`))
      if (stream.destroyed) continue
      if (!stream.write(next.value.data)) await Promise.race([once(stream, "drain"), ended])
    }
  }
}

/** What the sites use of a node-pty IPty. */
export type Terminal = {
  readonly pid: number
  onData(listener: (data: string) => void): { dispose(): void }
  onExit(listener: (event: { exitCode: number }) => void): { dispose(): void }
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
}

export type TerminalOptions = { name: string; cols: number; rows: number; cwd?: string; env?: Env }

/**
 * node-pty's spawn on an omni terminal (D-L7): data and the exit are queued until a listener attaches, a gap
 * becomes a visible marker, the exit waits for the output to end (at most 1 s) and its code is
 * `exitCode ?? 128 + signo`. The size is clamped to 1..32767. `kill()` stops the whole tree. Rejects, like node-pty
 * throws, when the program cannot start.
 */
export async function terminal(file: string, args: string[], options: TerminalOptions): Promise<Terminal> {
  const omni = await Omni.load()
  const env = environment(options.env)
  // node-pty sets TERM from `name` on Unix.
  if (process.platform !== "win32") env.TERM = options.name
  const child = (() => {
    try {
      return omni.spawn(file, args, {
        cwd: options.cwd,
        inheritEnv: false,
        env,
        pty: { cols: clamp(options.cols), rows: clamp(options.rows) },
        text: true,
      })
    } catch (error) {
      throw startFailure(error, file)
    }
  })()
  Omni.count("spawns")
  const data = new Set<(data: string) => void>()
  const exits = new Set<(event: { exitCode: number }) => void>()
  const pending: string[] = []
  const state = { exitCode: undefined as number | undefined }
  const reading = (async () => {
    for await (const chunk of child.output) {
      const text = `${chunk.lostBefore ? `\r\n[${chunk.lostBefore} bytes of output lost]\r\n` : ""}${chunk.data}`
      if (data.size === 0) pending.push(text)
      data.forEach((listener) => listener(text))
    }
  })().catch(() => undefined)
  void child.wait().then(async (exit) => {
    await Promise.race([reading, new Promise((resolve) => setTimeout(resolve, 1000))])
    const signo = exit.signal ? (constants.signals[exit.signal as NodeJS.Signals] ?? 0) : 0
    state.exitCode = exit.exitCode ?? 128 + signo
    exits.forEach((listener) => listener({ exitCode: state.exitCode ?? 1 }))
  })
  return {
    pid: child.pid,
    onData(listener) {
      data.add(listener)
      pending.splice(0).forEach((text) => listener(text))
      return { dispose: () => data.delete(listener) }
    },
    onExit(listener) {
      exits.add(listener)
      if (state.exitCode !== undefined) queueMicrotask(() => listener({ exitCode: state.exitCode ?? 1 }))
      return { dispose: () => exits.delete(listener) }
    },
    write: (text) => void child.write(text).catch(() => undefined),
    resize: (cols, rows) => child.resize(clamp(cols), clamp(rows)),
    kill: () => void child.stop().catch(() => undefined),
  }
}

function clamp(value: number) {
  return Math.min(32767, Math.max(1, Math.trunc(value) || 1))
}
