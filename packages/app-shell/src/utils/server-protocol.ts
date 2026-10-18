import type { ServerConnection } from "@/context/server"
import { retry } from "@orchestra/core/util/retry"
import { authTokenFromCredentials } from "./server"

export type ServerProtocol = "v1" | "v2"

export type ServerProtocolOptions = {
  signal?: AbortSignal
  timeoutMs?: number
  probeTimeoutMs?: number
  attempts?: number
  retryDelayMs?: number
}

export class ServerProtocolUnresolvedError extends Error {
  constructor() {
    super("Unable to detect Orchestra server protocol: neither health endpoint reported ready.")
    this.name = "ServerProtocolUnresolvedError"
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
      if (response.status === 503) throw new ServerProtocolUnresolvedError()
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

// Retry an unanswered or not-yet-ready endpoint before trying the other API generation. Exhaustion stays unknown;
// only a ready health response may become the connection's cached protocol.
const probeAttempts = 3

function answer(
  server: ServerConnection.HttpBase,
  fetcher: typeof fetch,
  path: string,
  signal: AbortSignal,
  timeoutMs: number,
  attempt = 1,
): Promise<object | undefined> {
  return probe(server, fetcher, path, signal, timeoutMs).catch(() => {
    signal.throwIfAborted()
    return attempt < probeAttempts ? answer(server, fetcher, path, signal, timeoutMs, attempt + 1) : undefined
  })
}

export async function detectServerProtocol(
  server: ServerConnection.HttpBase,
  fetcher: typeof fetch,
  options: ServerProtocolOptions = {},
): Promise<ServerProtocol> {
  options.signal?.throwIfAborted()
  const abort = new AbortController()
  const onAbort = () => abort.abort(options.signal?.reason)
  options.signal?.addEventListener("abort", onAbort, { once: true })
  const timer = setTimeout(() => abort.abort(new ServerProtocolUnresolvedError()), options.timeoutMs ?? 30_000)
  const cancelled = Promise.withResolvers<never>()
  const rejectAbort = () => cancelled.reject(abort.signal.reason)
  abort.signal.addEventListener("abort", rejectAbort, { once: true })

  return Promise.race([
    retry(async () => {
      abort.signal.throwIfAborted()
      // Cold local servers can take longer than five seconds to initialize their Location services.
      const legacy = await answer(server, fetcher, "/global/health", abort.signal, options.probeTimeoutMs ?? 20_000)
      abort.signal.throwIfAborted()
      if (legacy && "healthy" in legacy && legacy.healthy === true) return "v1" as const

      const current = await answer(server, fetcher, "/api/health", abort.signal, options.probeTimeoutMs ?? 20_000)
      abort.signal.throwIfAborted()
      if (current && "pid" in current && typeof current.pid === "number") return "v2" as const
      if (current && "healthy" in current && current.healthy === true) return "v1" as const
      throw new ServerProtocolUnresolvedError()
    }, {
      attempts: options.attempts ?? 60,
      delay: options.retryDelayMs ?? 500,
      factor: 1,
      retryIf: (error) => error instanceof ServerProtocolUnresolvedError && !abort.signal.aborted,
    }),
    cancelled.promise,
  ]).finally(() => {
    clearTimeout(timer)
    options.signal?.removeEventListener("abort", onAbort)
    abort.signal.removeEventListener("abort", rejectAbort)
  })
}
