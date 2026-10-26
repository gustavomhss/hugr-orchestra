import type { ServerConnection } from "@/context/server"
import { retry } from "@orchestra/core/util/retry"
import { authTokenFromCredentials } from "./server"

export type ServerReadyOptions = {
  signal?: AbortSignal
  timeoutMs?: number
  probeTimeoutMs?: number
  attempts?: number
  retryDelayMs?: number
}

export class ServerNotReadyError extends Error {
  constructor() {
    super("Orchestra server is not ready: the health endpoint did not report ready.")
    this.name = "ServerNotReadyError"
  }
}

function headers(server: ServerConnection.HttpBase) {
  if (!server.password) return
  return {
    Authorization: `Basic ${authTokenFromCredentials({ username: server.username, password: server.password })}`,
  }
}

async function probe(
  server: ServerConnection.HttpBase,
  fetcher: typeof fetch,
  path: string,
  signal: AbortSignal,
  timeoutMs: number,
) {
  signal.throwIfAborted()
  const abort = new AbortController()
  const onAbort = () => abort.abort(signal.reason)
  const cancelled = Promise.withResolvers<never>()
  const rejectAbort = () => cancelled.reject(abort.signal.reason)
  abort.signal.addEventListener("abort", rejectAbort, { once: true })
  const timer = setTimeout(() => abort.abort(new DOMException("Timed out", "TimeoutError")), timeoutMs)
  signal.addEventListener("abort", onAbort, { once: true })
  return Promise.race([
    Promise.resolve().then(() => {
      abort.signal.throwIfAborted()
      return fetcher(new URL(path, server.url), { headers: headers(server), signal: abort.signal })
    }).then(async (response) => {
      if (response.status === 503) throw new ServerNotReadyError()
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return
      const value: unknown = await response.json()
      if (!value || typeof value !== "object") return
      return value
    }),
    cancelled.promise,
  ]).finally(() => {
    clearTimeout(timer)
    signal.removeEventListener("abort", onAbort)
    abort.signal.removeEventListener("abort", rejectAbort)
  })
}

// Retry an unanswered or not-yet-ready endpoint. Exhaustion fails; only a ready health response resolves.
const probeAttempts = 3

function answer(
  server: ServerConnection.HttpBase,
  fetcher: typeof fetch,
  path: string,
  signal: AbortSignal,
  timeoutMs: number,
  attempt = 1,
): Promise<object | undefined> {
  return probe(server, fetcher, path, signal, timeoutMs).catch(async () => {
    signal.throwIfAborted()
    if (attempt >= probeAttempts) return undefined
    // An unreachable server refuses at once; the pause keeps the retries from becoming a burst.
    await pause(probeRetryMs * attempt, signal)
    return answer(server, fetcher, path, signal, timeoutMs, attempt + 1)
  })
}

const probeRetryMs = 100

function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const done = () => {
      signal.removeEventListener("abort", stop)
      resolve()
    }
    const timer = setTimeout(done, ms)
    const stop = () => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    signal.addEventListener("abort", stop, { once: true })
  })
}

export async function waitForServer(
  server: ServerConnection.HttpBase,
  fetcher: typeof fetch,
  options: ServerReadyOptions = {},
): Promise<void> {
  options.signal?.throwIfAborted()
  const abort = new AbortController()
  const onAbort = () => abort.abort(options.signal?.reason)
  options.signal?.addEventListener("abort", onAbort, { once: true })
  const timer = setTimeout(() => abort.abort(new ServerNotReadyError()), options.timeoutMs ?? 30_000)
  const cancelled = Promise.withResolvers<never>()
  const rejectAbort = () => cancelled.reject(abort.signal.reason)
  abort.signal.addEventListener("abort", rejectAbort, { once: true })

  return Promise.race([
    retry(async () => {
      abort.signal.throwIfAborted()
      const current = await answer(server, fetcher, "/api/health", abort.signal, options.probeTimeoutMs ?? 20_000)
      abort.signal.throwIfAborted()
      if (current && "pid" in current && typeof current.pid === "number") return
      if (current && "healthy" in current && current.healthy === true) return
      throw new ServerNotReadyError()
    }, {
      attempts: options.attempts ?? 60,
      delay: options.retryDelayMs ?? 500,
      factor: 2,
      maxDelay: 5_000,
      retryIf: (error) => error instanceof ServerNotReadyError && !abort.signal.aborted,
    }),
    cancelled.promise,
  ]).finally(() => {
    clearTimeout(timer)
    options.signal?.removeEventListener("abort", onAbort)
    abort.signal.removeEventListener("abort", rejectAbort)
  })
}
