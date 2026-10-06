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
// | shell: true / string                    | Shell.invocation() -> [shell, flag, joined]; cmd.exe (undefined)        |
// |                                         | delegates to legacy in "1" and "strict" alike (D-L4), counted           |
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
import type { Stream } from "node:stream"
import launch from "cross-spawn"
import { buffer } from "node:stream/consumers"
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

export type Child = ChildProcess & { exited: Promise<number> }

export function spawn(cmd: string[], opts: Options = {}): Child {
  if (cmd.length === 0) throw new Error("Command is required")
  opts.abort?.throwIfAborted()

  const proc = launch(cmd[0], cmd.slice(1), {
    cwd: opts.cwd,
    shell: opts.shell,
    env: opts.env === null ? {} : opts.env ? { ...process.env, ...opts.env } : undefined,
    stdio: [opts.stdin ?? "ignore", opts.stdout ?? "ignore", opts.stderr ?? "ignore"],
    windowsHide: process.platform === "win32",
  })

  let closed = false
  let timer: ReturnType<typeof setTimeout> | undefined

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

  const child = proc as Child
  child.exited = exited
  return child
}

export async function run(cmd: string[], opts: RunOptions = {}): Promise<Result> {
  const proc = spawn(cmd, {
    cwd: opts.cwd,
    env: opts.env,
    stdin: opts.stdin,
    shell: opts.shell,
    abort: opts.abort,
    kill: opts.kill,
    timeout: opts.timeout,
    stdout: "pipe",
    stderr: "pipe",
  })

  if (!proc.stdout || !proc.stderr) throw new Error("Process output not available")

  const out = await Promise.all([proc.exited, buffer(proc.stdout), buffer(proc.stderr)])
    .then(([code, stdout, stderr]) => ({
      code,
      stdout,
      stderr,
    }))
    .catch((err: unknown) => {
      if (!opts.nothrow) throw err
      return {
        code: 1,
        stdout: Buffer.alloc(0),
        stderr: Buffer.from(errorMessage(err)),
      }
    })
  if (out.code === 0 || opts.nothrow) return out
  throw new RunFailedError(cmd, out.code, out.stdout, out.stderr)
}

// Duplicated in `packages/sdk/js/src/process.ts` because the SDK cannot import
// `opencode` without creating a cycle. Keep both copies in sync.
export async function stop(proc: ChildProcess) {
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

export * as Process from "./process"
