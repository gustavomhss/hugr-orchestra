export * as LinuxWorkspaceAccess from "./linux-workspace-access"

import { execFile, spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import type { Readable, Writable } from "node:stream"
import { promisify } from "node:util"

export type Connection = { endpoint: string; containerID: string; key: string }
export type Input = { argv: string[]; cwd?: string; env?: Record<string, string>; timeoutMs?: number; stdin?: string }
export type Result = {
  stdout: string
  stderr: string
  exitCode: number | null
  cancelled: boolean
  timedOut: boolean
  truncated: boolean
}
type Terminal = {
  owner: string
  connection: Connection
  runID: string
  process: import("@lydell/node-pty").IPty
  buffer: string
  dropped: boolean
  exitCode?: number
  dispose: Array<() => void>
  ended: Promise<void>
  retiring?: Promise<{ closed: boolean; exitCode: number | null }>
}
const helper = "/opt/orchestra/workspace-access.py"
const limit = 1024 * 1024
const exec = promisify(execFile)
const hostEnvironment = () =>
  Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH", "DOCKER_API_VERSION"].includes(key),
    ),
  )

export function create(options: {
  prepare: () => Promise<Connection>
  verify: (connection: Connection) => Promise<void>
}) {
  const terminals = new Map<string, Terminal>()
  const running = new Map<AbortController, Promise<void>>()
  const opening = { count: 0 }
  const lifecycle = { closing: false }
  const command = (connection: Connection, op: string, runID: string) =>
    exec(
      "docker",
      [
        "--host",
        connection.endpoint,
        "exec",
        "--interactive",
        "--user",
        "dock",
        connection.containerID,
        ...(op === "cancel" ? ["sudo", "-n"] : []),
        "python3",
        helper,
        op,
        runID,
      ],
      { env: hostEnvironment(), timeout: 20_000, maxBuffer: limit },
    ).catch(() => {
      throw new Error("workspace-control-failed")
    })
  const configure = async (connection: Connection, runID: string, input: Input) => {
    const value = requireInput(input)
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        "docker",
        [
          "--host",
          connection.endpoint,
          "exec",
          "-i",
          "--user",
          "dock",
          connection.containerID,
          "python3",
          helper,
          "prepare",
          runID,
        ],
        { env: hostEnvironment(), stdio: ["pipe", "ignore", "ignore"] },
      )
      const timer = setTimeout(() => child.kill("SIGKILL"), 10_000)
      child.stdin.on("error", () => reject(new Error("workspace-prepare-failed")))
      child.once("error", () => {
        clearTimeout(timer)
        reject(new Error("workspace-prepare-failed"))
      })
      child.once("close", (code) => {
        clearTimeout(timer)
        if (code === 0) resolve()
        else reject(new Error("workspace-prepare-failed"))
      })
      child.stdin.end(JSON.stringify(value))
    })
  }
  const cancel = async (connection: Connection, runID: string) => {
    await options.verify(connection)
    await command(connection, "cancel", runID)
  }
  const clean = async (connection: Connection, runID: string) => {
    await options.verify(connection)
    return command(connection, "clean", runID)
  }
  const terminal = async (owner: string, id: string) => {
    const found = terminals.get(id)
    if (!found || found.owner !== owner) throw new Error("terminal-not-found")
    await options.verify(found.connection)
    return found
  }
  const retire = (id: string, found: Terminal) => {
    found.retiring ??= (async () => {
      if (found.exitCode === undefined) {
        await cancel(found.connection, found.runID)
        found.process.kill()
        const timeout = Promise.withResolvers<never>()
        const timer = setTimeout(() => timeout.reject(new Error("workspace-termination-unknown")), 5000)
        await Promise.race([found.ended, timeout.promise]).finally(() => clearTimeout(timer))
      }
      await clean(found.connection, found.runID)
      return { closed: true, exitCode: found.exitCode ?? null }
    })().then(
      (result) => {
        found.dispose.forEach((dispose) => dispose())
        terminals.delete(id)
        return result
      },
      (error) => {
        found.retiring = undefined
        throw error
      },
    )
    return found.retiring
  }
  return {
    async run(
      input: Input,
      optionsRun: {
        signal?: AbortSignal
        input?: Readable
        output?: { stdout: Writable; stderr: Writable }
        onData?: (stream: "stdout" | "stderr", data: Buffer) => void
      } = {},
    ): Promise<Result> {
      requireInput(input)
      if (lifecycle.closing) throw new Error("workspace-closing")
      optionsRun.signal?.throwIfAborted()
      if (running.size >= 8) throw new Error("workspace-busy")
      const controller = new AbortController()
      const settled = Promise.withResolvers<void>()
      running.set(controller, settled.promise)
      const abort = () => controller.abort()
      optionsRun.signal?.addEventListener("abort", abort, { once: true })
      const connection = await options.prepare().catch((error) => {
        running.delete(controller)
        settled.resolve()
        optionsRun.signal?.removeEventListener("abort", abort)
        throw error
      })
      const runID = randomUUID()
      const status = {
        cancelled: false,
        timedOut: false,
        truncated: false,
        bytes: 0,
        cleaned: false,
        cancellation: undefined as Promise<void> | undefined,
      }
      try {
        await configure(connection, runID, input)
        controller.signal.throwIfAborted()
        await options.verify(connection)
        const result = await new Promise<Result>((resolve, reject) => {
          const child = spawn(
            "docker",
            [
              "--host",
              connection.endpoint,
              "exec",
              "-i",
              "--user",
              "dock",
              connection.containerID,
              "python3",
              helper,
              "run",
              runID,
            ],
            { env: hostEnvironment(), stdio: ["pipe", "pipe", "pipe"] },
          )
          const stdout: Buffer[] = []
          const stderr: Buffer[] = []
          const escalation = { timer: undefined as ReturnType<typeof setTimeout> | undefined }
          const stop = (timedOut = false) => {
            status.timedOut ||= timedOut
            status.cancelled ||= !timedOut
            status.cancellation ??= cancel(connection, runID)
            // A failed transport is not proof that guest execution stopped.
            escalation.timer ??= setTimeout(() => {
              child.kill("SIGKILL")
              reject(new Error("workspace-termination-unknown"))
            }, 25_000)
            void status.cancellation.catch(() => {
              child.kill("SIGKILL")
              reject(new Error("workspace-termination-unknown"))
            })
          }
          const onAbort = () => stop()
          const timer =
            input.timeoutMs === 0 ? undefined : setTimeout(() => stop(true), (input.timeoutMs ?? 60_000) + 100)
          controller.signal.addEventListener("abort", onAbort, { once: true })
          const capture = (stream: "stdout" | "stderr", data: Buffer) => {
            optionsRun.onData?.(stream, data)
            const room = Math.max(0, limit - status.bytes)
            const kept = data.subarray(0, room)
            status.bytes += kept.length
            if (kept.length) (stream === "stdout" ? stdout : stderr).push(kept)
            if (kept.length < data.length) status.truncated = true
          }
          child.stdout.on("data", (data: Buffer) => capture("stdout", data))
          child.stderr.on("data", (data: Buffer) => capture("stderr", data))
          if (optionsRun.output) {
            child.stdout.pipe(optionsRun.output.stdout, { end: false })
            child.stderr.pipe(optionsRun.output.stderr, { end: false })
          }
          child.stdin.on("error", () => undefined)
          child.once("error", () => reject(new Error("workspace-exec-failed")))
          child.once("close", (code) => {
            clearTimeout(timer)
            clearTimeout(escalation.timer)
            controller.signal.removeEventListener("abort", onAbort)
            optionsRun.input?.unpipe(child.stdin)
            void (status.cancellation ?? Promise.resolve()).then(
              () =>
                resolve({
                  stdout: Buffer.concat(stdout).toString("utf8"),
                  stderr: Buffer.concat(stderr).toString("utf8"),
                  exitCode: code,
                  cancelled: status.cancelled,
                  timedOut: status.timedOut,
                  truncated: status.truncated,
                }),
              () => reject(new Error("workspace-termination-unknown")),
            )
          })
          if (optionsRun.input) optionsRun.input.pipe(child.stdin)
          if (!optionsRun.input) child.stdin.end(input.stdin ?? "")
          if (controller.signal.aborted) stop()
        })
        const cleaned = await clean(connection, runID)
        status.cleaned = true
        const completion: unknown = JSON.parse(cleaned.stdout)
        if (
          !completion ||
          typeof completion !== "object" ||
          !("exitCode" in completion) ||
          !("cancelled" in completion) ||
          !("timedOut" in completion)
        ) {
          if (result.cancelled || result.timedOut) return { ...result, exitCode: null }
          throw new Error("workspace-execution-unknown")
        }
        if (
          (completion.exitCode !== null && !Number.isSafeInteger(completion.exitCode)) ||
          typeof completion.cancelled !== "boolean" ||
          typeof completion.timedOut !== "boolean"
        )
          throw new Error("workspace-execution-unknown")
        return {
          ...result,
          exitCode: completion.exitCode as number | null,
          cancelled: result.cancelled || completion.cancelled,
          timedOut: result.timedOut || completion.timedOut,
        }
      } finally {
        optionsRun.signal?.removeEventListener("abort", abort)
        try {
          if (!status.cleaned) await clean(connection, runID)
        } finally {
          running.delete(controller)
          settled.resolve()
        }
      }
    },
    async shell(input: Input = { argv: ["/bin/bash", "-il"] }) {
      if (lifecycle.closing) throw new Error("workspace-closing")
      const connection = await options.prepare()
      const runID = randomUUID()
      await configure(connection, runID, input)
      await options.verify(connection)
      const child = spawn(
        "docker",
        [
          "--host",
          connection.endpoint,
          "exec",
          "-it",
          "--user",
          "dock",
          connection.containerID,
          "python3",
          helper,
          "terminal",
          runID,
        ],
        { env: hostEnvironment(), stdio: "inherit" },
      )
      const interruption = { failure: undefined as Error | undefined }
      const stop = () => {
        void cancel(connection, runID)
          .catch(() => {
            interruption.failure = new Error("workspace-termination-unknown")
          })
          .finally(() => child.kill("SIGTERM"))
      }
      process.once("SIGINT", stop)
      process.once("SIGTERM", stop)
      const code = await new Promise<number | null>((resolve, reject) => {
        child.once("close", resolve)
        child.once("error", () => reject(new Error("workspace-terminal-failed")))
      }).finally(() => {
        process.removeListener("SIGINT", stop)
        process.removeListener("SIGTERM", stop)
      })
      await clean(connection, runID)
      if (interruption.failure) throw interruption.failure
      return code ?? 1
    },
    async open(owner: string, input: Input = { argv: ["/bin/bash", "-il"] }, cols = 100, rows = 30) {
      if (lifecycle.closing) throw new Error("workspace-closing")
      requireSize(cols, rows)
      if (terminals.size + opening.count >= 8) throw new Error("terminal-limit")
      opening.count++
      const preparation = {
        connection: undefined as Connection | undefined,
        runID: undefined as string | undefined,
        attached: false,
      }
      try {
        const connection = await options.prepare()
        const runID = randomUUID()
        preparation.connection = connection
        preparation.runID = runID
        await configure(connection, runID, input)
        await options.verify(connection)
        if (lifecycle.closing) throw new Error("workspace-closing")
        const { spawn } = await import("@lydell/node-pty")
        const process = spawn(
          "docker",
          [
            "--host",
            connection.endpoint,
            "exec",
            "-it",
            "--user",
            "dock",
            connection.containerID,
            "python3",
            helper,
            "terminal",
            runID,
          ],
          { name: "xterm-256color", cols, rows, cwd: "/", env: hostEnvironment() },
        )
        const ended = Promise.withResolvers<void>()
        const ready = Promise.withResolvers<void>()
        const marker = `\u001b]777;orchestra-ready=${runID}\u0007`
        const id = randomUUID()
        const found = {
          owner,
          connection,
          runID,
          process,
          buffer: "",
          dropped: false,
          exitCode: undefined as number | undefined,
          dispose: [] as Array<() => void>,
          ended: ended.promise,
        }
        const data = process.onData((text) => {
          found.buffer += text
          if (found.buffer.includes(marker)) {
            found.buffer = found.buffer.replace(marker, "")
            ready.resolve()
          }
          if (found.buffer.length > 65536) {
            found.buffer = found.buffer.slice(-65536)
            found.dropped = true
          }
        })
        const exit = process.onExit((event) => {
          found.exitCode = event.exitCode
          ready.reject(new Error("terminal-start-failed"))
          ended.resolve()
        })
        found.dispose.push(
          () => data.dispose(),
          () => exit.dispose(),
        )
        terminals.set(id, found)
        preparation.attached = true
        const timer = setTimeout(() => ready.reject(new Error("terminal-start-timeout")), 15000)
        await ready.promise
          .finally(() => clearTimeout(timer))
          .catch(async (error) => {
            if (found.exitCode === undefined) {
              await cancel(connection, runID)
              process.kill()
              await ended.promise
            }
            found.dispose.forEach((dispose) => dispose())
            terminals.delete(id)
            await clean(connection, runID)
            throw error
          })
        return { terminalID: id, cols, rows }
      } catch (error) {
        if (!preparation.attached && preparation.connection && preparation.runID)
          await clean(preparation.connection, preparation.runID)
        throw error
      } finally {
        opening.count--
      }
    },
    async read(owner: string, id: string) {
      const found = await terminal(owner, id)
      const result = {
        data: found.buffer,
        truncated: found.dropped,
        exitCode: found.exitCode ?? null,
        running: found.exitCode === undefined,
      }
      found.buffer = ""
      found.dropped = false
      return result
    },
    async write(owner: string, id: string, text: string, signal?: AbortSignal) {
      if (typeof text !== "string" || text.length > 65536) throw new Error("invalid-terminal-input")
      const found = await terminal(owner, id)
      signal?.throwIfAborted()
      if (found.exitCode !== undefined) throw new Error("terminal-exited")
      found.process.write(text)
      return { written: true }
    },
    async resize(owner: string, id: string, cols: number, rows: number, signal?: AbortSignal) {
      requireSize(cols, rows)
      const found = await terminal(owner, id)
      signal?.throwIfAborted()
      if (found.exitCode !== undefined) throw new Error("terminal-exited")
      found.process.resize(cols, rows)
      return { resized: true, cols, rows }
    },
    async closeTerminal(owner: string, id: string) {
      const found = await terminal(owner, id)
      return retire(id, found)
    },
    async closeOwner(owner: string) {
      await Promise.all(
        [...terminals].filter(([, found]) => found.owner === owner).map(([id, found]) => retire(id, found)),
      )
    },
    async close() {
      lifecycle.closing = true
      try {
        const deadline = Date.now() + 30_000
        while (opening.count) {
          if (Date.now() >= deadline) throw new Error("workspace-termination-unknown")
          await new Promise((resolve) => setTimeout(resolve, 25))
        }
        await Promise.all(
          [...running].map(([controller, ended]) => {
            controller.abort()
            return ended
          }),
        )
        await Promise.all([...terminals].map(([id, found]) => retire(id, found)))
      } finally {
        lifecycle.closing = false
      }
    },
  }
}

function requireInput(input: Input) {
  if (
    !Array.isArray(input.argv) ||
    !input.argv.length ||
    input.argv.length > 256 ||
    input.argv.some((value) => typeof value !== "string" || value.includes("\0")) ||
    !input.argv[0]
  )
    throw new Error("invalid-argv")
  const cwd = input.cwd ?? "/home/dock"
  if (typeof cwd !== "string" || !cwd.startsWith("/") || cwd.includes("\0")) throw new Error("invalid-cwd")
  const timeoutMs = input.timeoutMs ?? 60_000
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 300_000) throw new Error("invalid-timeout")
  if (
    input.env &&
    Object.entries(input.env).some(
      ([key, value]) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof value !== "string" || value.includes("\0"),
    )
  )
    throw new Error("invalid-env")
  if (input.stdin !== undefined && (typeof input.stdin !== "string" || Buffer.byteLength(input.stdin) > limit))
    throw new Error("input-limit")
  const result = { argv: input.argv, cwd, env: input.env ?? {}, timeoutMs }
  if (Buffer.byteLength(JSON.stringify(result)) > limit) throw new Error("input-limit")
  return result
}

function requireSize(cols: number, rows: number) {
  if (![cols, rows].every((value) => Number.isSafeInteger(value) && value > 0 && value <= 500))
    throw new Error("invalid-terminal-size")
}
