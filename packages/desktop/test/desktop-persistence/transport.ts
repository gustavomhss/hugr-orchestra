export * as DesktopProof from "./transport"

import { isAbsolute, join } from "node:path"
import { Effect, Fiber, Layer, Schema, Stream } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"

const boundary = { paths: undefined as Record<string, string> | undefined }

export async function child<A>(
  input: { command: string; args: string[]; cwd: string; env: Record<string, string>; timeoutMS?: number; onClosed?: () => void; windowsHide?: boolean },
  use: (host: { pid: number; output: () => string; exited: Promise<number>; signal: AbortSignal }) => Promise<A>,
): Promise<A> {
  const controller = new AbortController()
  const lifecycle = { exitConfirmed: false, scopeClosed: false, pid: undefined as number | undefined }
  const interrupted = Promise.withResolvers<never>()
  const abort = () => interrupted.reject(controller.signal.reason)
  const interrupt = () => controller.abort(new Error("CHILD_INTERRUPTED"))
  controller.signal.addEventListener("abort", abort, { once: true })
  process.once("SIGINT", interrupt)
  process.once("SIGTERM", interrupt)
  const deadline = setTimeout(() => controller.abort(new Error("CHILD_SCOPE_TIMEOUT")), input.timeoutMS ?? 120000)
  const capture = { buffer: Buffer.alloc(0) }
  const operation = { current: undefined as Promise<A> | undefined }
  const body = { failed: false, cause: undefined as unknown }
  try {
    operation.current = (async () => {
      const env = isolatedEnvironment(input.env)
      // Core's Global module caches paths and creates directories during import.
      Object.keys(process.env).forEach((key) => delete process.env[key])
      Object.assign(process.env, env)
      const { AppProcess } = await import("@orchestra/core/process")
      const { CrossSpawnSpawner } = await import("@orchestra/core/cross-spawn-spawner")
      const { LayerNode } = await import("@orchestra/core/effect/layer-node")
      const { LayerNodePlatform } = await import("@orchestra/core/effect/app-node-platform")
      const spawner = Layer.effect(ChildProcessSpawner, CrossSpawnSpawner.makeWith("off", { windowsHide: input.windowsHide })).pipe(
        Layer.provide(LayerNode.compile(LayerNode.group([LayerNodePlatform.filesystem, LayerNodePlatform.path]))),
      )
      controller.signal.throwIfAborted()
      return Effect.runPromise(Effect.uninterruptibleMask((restore) => Effect.gen(function* () {
        const processes = yield* AppProcess.Service
        const handle = yield* processes.spawn(ChildProcess.make(input.command, input.args, {
          cwd: input.cwd, env, extendEnv: false, stdin: "ignore", forceKillAfter: "5 seconds",
        }))
        lifecycle.pid = handle.pid
        yield* Effect.addFinalizer(() => Effect.gen(function* () {
          if (yield* handle.isRunning) {
            yield* handle.kill({ killSignal: "SIGTERM" }).pipe(
              Effect.timeout("5 seconds"),
              Effect.catch(() => handle.kill({ killSignal: "SIGKILL" }).pipe(
                Effect.timeout("5 seconds"))),
            )
          }
          if (yield* handle.isRunning) return yield* Effect.die(new Error("CHILD_EXIT_UNCONFIRMED"))
          lifecycle.exitConfirmed = true
        }).pipe(Effect.timeout("11 seconds"), Effect.orDie))
        // Our finalizer owns explicit exit verification; unref only releases the parent's event-loop reference.
        yield* handle.unref
        const captured = yield* handle.all.pipe(Stream.runForEach((chunk) => Effect.sync(() => {
          capture.buffer = Buffer.from(Buffer.concat([capture.buffer, chunk.subarray(-131072)]).subarray(-131072))
        })), Effect.forkScoped)
        const exited: Promise<number> = Effect.runPromise(
          Effect.all([handle.exitCode, Fiber.join(captured)], { concurrency: "unbounded" }).pipe(Effect.map((result) => result[0])),
          { signal: controller.signal },
        )
        return yield* restore(Effect.tryPromise(() => Promise.all([
            Promise.resolve().then(() => use({
              pid: handle.pid, output: () => capture.buffer.toString("utf8"), exited, signal: controller.signal,
            })).catch((cause: unknown) => { body.failed = true; body.cause = cause; throw cause }),
            exited,
          ]).then((values) => values[0])))
      })).pipe(Effect.scoped,
        Effect.provide(AppProcess.layerWith("off").pipe(Layer.provide(spawner))),
        Effect.onExit(() => Effect.sync(() => { lifecycle.scopeClosed = true }))), { signal: controller.signal })
    })()
    return await Promise.race([operation.current, interrupted.promise])
  } catch (cause) {
    // Abort bounds the work first. Observe the complete spawner release separately before classifying cleanup.
    const settled = Promise.withResolvers<boolean>()
    const timer = setTimeout(() => settled.resolve(false), 15000)
    const closed = await Promise.race([
      operation.current?.then(() => true, () => true) ?? Promise.resolve(true), settled.promise,
    ]).finally(() => clearTimeout(timer))
    if (!closed || !lifecycle.exitConfirmed || !lifecycle.scopeClosed) {
      throw new Error(`CHILD_CLEANUP_UNCONFIRMED_RETAIN_SANDBOX:${input.env.HOME}:${JSON.stringify(lifecycle)}`, {
        cause: body.failed ? new AggregateError([body.cause, cause], "PROOF_AND_CLEANUP_FAILED") : cause,
      })
    }
    if (body.failed) throw body.cause
    throw cause
  } finally {
    clearTimeout(deadline)
    controller.signal.removeEventListener("abort", abort)
    process.off("SIGINT", interrupt)
    process.off("SIGTERM", interrupt)
    controller.abort(new Error("CHILD_SCOPE_FINISHED"))
    if (lifecycle.exitConfirmed && lifecycle.scopeClosed) input.onClosed?.()
  }
}

function isolatedEnvironment(input: Record<string, string>) {
  if (!input.HOME || !isAbsolute(input.HOME)) throw new Error("ISOLATED_HOME_REQUIRED")
  const env = {
    ...input, USERPROFILE: input.USERPROFILE ?? input.HOME, ORCHESTRA_TEST_HOME: input.HOME,
    APPDATA: input.APPDATA ?? join(input.HOME, "config"), LOCALAPPDATA: input.LOCALAPPDATA ?? join(input.HOME, "data"),
    XDG_CONFIG_HOME: input.XDG_CONFIG_HOME ?? join(input.HOME, "config"),
    XDG_DATA_HOME: input.XDG_DATA_HOME ?? join(input.HOME, "data"),
    XDG_STATE_HOME: input.XDG_STATE_HOME ?? join(input.HOME, "state"),
    XDG_CACHE_HOME: input.XDG_CACHE_HOME ?? join(input.HOME, "cache"),
    TMPDIR: input.TMPDIR ?? join(input.HOME, "tmp"), TMP: input.TMP ?? input.TMPDIR ?? join(input.HOME, "tmp"),
    TEMP: input.TEMP ?? input.TMPDIR ?? join(input.HOME, "tmp"), ORCHESTRA_INHERIT_CREDENTIALS: "0",
    ORCHESTRA_DISABLE_MODELS_FETCH: "true",
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_COUNT: "0", GIT_CONFIG_GLOBAL: input.GIT_CONFIG_GLOBAL ?? join(input.HOME, "gitconfig"),
    GIT_CONFIG_SYSTEM: input.GIT_CONFIG_SYSTEM ?? join(input.HOME, "gitconfig"), GIT_TEMPLATE_DIR: input.GIT_TEMPLATE_DIR ?? join(input.HOME, "empty"),
  }
  const paths = Object.fromEntries([
    "HOME", "USERPROFILE", "ORCHESTRA_TEST_HOME", "APPDATA", "LOCALAPPDATA", "XDG_CONFIG_HOME",
    "XDG_DATA_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME", "TMPDIR", "TMP", "TEMP",
  ].map((key) => [key, (env as Record<string, string>)[key]]))
  if (Object.values(paths).some((path) => !isAbsolute(path))) throw new Error("ISOLATED_PATHS_REQUIRED")
  if (boundary.paths && Object.entries(paths).some(([key, value]) => boundary.paths?.[key] !== value)) {
    throw new Error("CORE_IMPORT_BOUNDARY_CHANGED")
  }
  boundary.paths = paths
  return env
}

export async function connect(port: number, signal?: AbortSignal): Promise<{
  evaluate: (expression: string) => Promise<unknown>; close: () => void
}> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("CDP_PORT_INVALID")
  const readiness = new AbortController()
  const deadline = setTimeout(() => readiness.abort(new Error("CDP_READINESS_TIMEOUT")), 30000)
  const active = AbortSignal.any([readiness.signal, ...(signal ? [signal] : [])])
  const targets = Schema.Array(Schema.Struct({
    type: Schema.String, url: Schema.String, webSocketDebuggerUrl: Schema.optional(Schema.String),
  }))
  const decode = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Struct({
    id: Schema.optional(Schema.Number), error: Schema.optional(Schema.Unknown),
    result: Schema.optional(Schema.Struct({
      exceptionDetails: Schema.optional(Schema.Unknown),
      result: Schema.optional(Schema.Struct({ value: Schema.optional(Schema.Unknown) })),
    })),
  })))
  try {
    while (true) {
      active.throwIfAborted()
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
          signal: AbortSignal.any([active, AbortSignal.timeout(2000)]), redirect: "error",
        })
        if (!response.ok) throw new Error(`CDP_HTTP_STATUS:${response.status}`)
        const page = Schema.decodeUnknownSync(targets)(await response.json()).find((target) =>
          target.type === "page" && target.url.trim() && target.webSocketDebuggerUrl?.trim())
        if (!page?.webSocketDebuggerUrl) throw new Error("CDP_PAGE_NOT_READY")
        const url = new URL(page.webSocketDebuggerUrl)
        if (url.protocol !== "ws:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
          Number(url.port || "80") !== port || url.username || url.password || url.search || url.hash ||
          !/^\/devtools\/page\/[^/]+$/.test(url.pathname)) throw new Error("CDP_WEBSOCKET_NOT_LOOPBACK")
        const socket = new WebSocket(url.href)
        const opened = Promise.withResolvers<void>()
        const pending = new Map<number, { resolve: (value: unknown) => void; reject: (cause: unknown) => void }>()
        const state = { id: 0, closed: undefined as Error | undefined }
        const stop = (error: Error) => {
          if (state.closed) return
          state.closed = error
          opened.reject(error)
          pending.forEach((waiter) => waiter.reject(error))
          pending.clear()
          active.removeEventListener("abort", abort)
          socket.close()
        }
        const abort = () => stop(new Error("CDP_ABORTED", { cause: active.reason }))
        socket.onopen = () => opened.resolve()
        socket.onerror = () => stop(new Error("CDP_SOCKET_ERROR"))
        socket.onclose = () => stop(new Error("CDP_SOCKET_CLOSED"))
        socket.onmessage = (event) => {
          try {
            const message = decode(event.data)
            if (message.id === undefined) return
            const waiter = pending.get(message.id)
            if (!waiter) return
            pending.delete(message.id)
            if (message.error !== undefined || message.result?.exceptionDetails !== undefined) {
              waiter.reject(new Error(`CDP_EVALUATE_FAILED:${JSON.stringify(message.error ?? message.result?.exceptionDetails)}`))
              return
            }
            if (!message.result?.result) {
              waiter.reject(new Error("CDP_RPC_RESULT_MISSING"))
              return
            }
            waiter.resolve(message.result.result.value)
          } catch (cause) {
            stop(new Error("CDP_MESSAGE_INVALID", { cause }))
          }
        }
        active.addEventListener("abort", abort, { once: true })
        if (active.aborted) abort()
        await opened.promise
        return {
          close: () => stop(new Error("CDP_CLOSED")),
          evaluate: async (expression) => {
            if (state.closed) throw state.closed
            const id = ++state.id
            const waiter = Promise.withResolvers<unknown>()
            const timer = setTimeout(() => waiter.reject(new Error(`CDP_RPC_TIMEOUT:${id}`)), 10000)
            pending.set(id, waiter)
            try {
              socket.send(JSON.stringify({ id, method: "Runtime.evaluate", params: {
                expression, awaitPromise: true, returnByValue: true,
              } }))
              return await waiter.promise
            } finally {
              clearTimeout(timer)
              pending.delete(id)
            }
          },
        }
      } catch (cause) {
        if (active.aborted) throw new Error("CDP_READINESS_FAILED", { cause })
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    }
  } finally {
    clearTimeout(deadline)
  }
}
