import type { Readable, Writable } from "node:stream"
import { Readable as NodeReadable, Writable as NodeWritable } from "node:stream"
import { Effect, Scope } from "effect"
import { Exit } from "effect"
import { Omni } from "../omni"
import { ToolSafetySandbox } from "../tool-safety-sandbox"

export type Child = {
  pid?: number
  stdin: Writable | null
  stdout: Readable | null
  stderr: Readable | null
  exitCode: number | null
  signalCode: NodeJS.Signals | null
  kill(signal?: NodeJS.Signals | number): boolean
  exited: Promise<number>
  terminate?(graceMs: number): Promise<void>
}

export interface Options {
  cwd?: string
  env?: NodeJS.ProcessEnv | null
  stdin?: "pipe" | "ignore" | "inherit" | number
  stdout?: "pipe" | "ignore" | "inherit" | number
  stderr?: "pipe" | "ignore" | "inherit" | number
  shell?: boolean | string
  abort?: AbortSignal
  kill?: NodeJS.Signals | number
  timeout?: number
  deadline?: number
}

type Pipe = {
  readonly pid: number
  readonly output: AsyncIterable<{ stream: "stdout" | "stderr" | "pty"; data: Uint8Array; lostBefore?: number }>
  write(data: Uint8Array): Promise<void>
  closeStdin(): Promise<void>
  wait(): Promise<{ exitCode: number | null; signal: string | null }>
  stop(options?: { graceMs?: number }): Promise<unknown>
}

const DRAIN_GRACE = 2_000

class Output extends NodeReadable {
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
    if (this.push(Buffer.from(data.buffer, data.byteOffset, data.byteLength))) return
    return new Promise((resolve) => (this.wake = resolve))
  }

  private release() {
    const wake = this.wake
    this.wake = undefined
    wake?.()
  }
}

class Input extends NodeWritable {
  constructor(private readonly child: Promise<Pipe | undefined>) {
    super()
  }

  override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.child
      .then((child) => child?.write(chunk))
      .then(
        () => callback(),
        (error: unknown) => callback(error as Error),
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

export async function spawn(cmd: string, args?: string[], opts?: Options): Promise<Child>
export async function spawn(cmd: string, opts?: Options): Promise<Child>
export async function spawn(cmd: string, argsOrOpts?: string[] | Options, opts?: Options) {
  const args = Array.isArray(argsOrOpts) ? [...argsOrOpts] : []
  const cfg = Array.isArray(argsOrOpts) ? (opts ?? {}) : (argsOrOpts ?? {})
  const binding = await Omni.load()
  Omni.count("spawns")
  const child = binding.spawn(cmd, args, {
    cwd: cfg.cwd,
    inheritEnv: false,
    env: cfg.env === null ? {} : Omni.childEnv(cfg.env ?? undefined),
    // A language server speaks JSON-RPC over stdio, so every launch opens all three pipes, as the earlier runtime's launcher did.
    stdin: "pipe",
    text: false,
    backpressure: true,
  }) as Pipe

  const stdout = new Output()
  const stderr = new Output()
  const stdin = new Input(Promise.resolve(child))

  const adapter = {
    pid: undefined as number | undefined,
    stdin,
    stdout,
    stderr,
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
    kill() {
      void adapter.terminate(DRAIN_GRACE)
      return true
    },
    exited: Promise.resolve(0),
    async terminate(graceMs: number) {
      await child.stop({ graceMs }).catch(() => undefined)
    },
  }

  const pumped = (async () => {
    try {
      for await (const chunk of child.output) {
        if (chunk.stream === "stderr") await stderr?.feed(chunk.data)
        else await stdout?.feed(chunk.data)
      }
    } catch {
      // ignore
    }
  })()

  adapter.exited = (async () => {
    const exit = await child.wait().catch(() => ({ exitCode: 1, signal: null }))
    await pumped.catch(() => undefined)
    adapter.pid = child.pid
    adapter.exitCode = exit.exitCode ?? (exit.signal ? 1 : 0)
    stdout?.push(null)
    stderr?.push(null)
    return adapter.exitCode ?? 0
  })()
  void adapter.exited.catch(() => undefined)

  adapter.pid = child.pid
  return adapter as Child
}

export async function confined(cmd: string, args: string[], opts?: Options): Promise<Child>
export async function confined(cmd: string, opts?: Options): Promise<Child>
export async function confined(cmd: string, argsOrOpts?: string[] | Options, opts?: Options) {
  const args = Array.isArray(argsOrOpts) ? [...argsOrOpts] : []
  const cfg = (Array.isArray(argsOrOpts) ? opts : argsOrOpts) ?? {}
  const scope = Scope.makeUnsafe()
  const close = () => Effect.runPromise(Scope.close(scope, Exit.void))
  const launch = await Effect.runPromise(
    ToolSafetySandbox.confine({ command: cmd, args, cwd: cfg.cwd ?? process.cwd(), env: cfg.env ?? process.env }).pipe(
      Effect.provideService(Scope.Scope, scope),
    ),
  ).catch(async (error) => {
    await close()
    throw error
  })
  const proc = await spawn(launch.command, launch.args, { ...cfg, env: launch.env })
  void proc.exited.finally(close)
  return proc
}

export async function stop(proc: Child) {
  if (typeof proc.terminate === "function") {
    await proc.terminate(2000)
    return
  }
  if (proc.exitCode !== null || proc.signalCode !== null) return
  proc.kill()
}

