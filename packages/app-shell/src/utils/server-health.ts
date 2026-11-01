import { usePlatform } from "@/context/platform"
import { ServerConnection } from "@/context/server"
import { authTokenFromCredentials } from "./server"
import { ClientError, Orchestra } from "@orchestra/client"
import { Accessor, createEffect, onCleanup } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { streamAlive } from "./server-stream-liveness"

export type ServerHealth = { healthy: boolean; version?: string }

interface CheckServerHealthOptions {
  timeoutMs?: number
  signal?: AbortSignal
  retryCount?: number
  retryDelayMs?: number
}

const defaultTimeoutMs = 30_000
const defaultRetryCount = 2
const defaultRetryDelayMs = 100
const cacheMs = 750
const healthCache = new Map<
  string,
  { at: number; done: boolean; fetch: typeof globalThis.fetch; promise: Promise<ServerHealth> }
>()

function cacheKey(server: ServerConnection.HttpBase) {
  return `${server.url}\n${server.username ?? ""}\n${server.password ?? ""}`
}

// The generated client builds every API namespace when it is made, so a poll every few seconds reuses one per server.
// Keyed by URL: a changed password or fetch replaces the entry instead of leaving the old one behind.
const clients = new Map<string, { key: string; fetch: typeof globalThis.fetch; client: ReturnType<typeof Orchestra.make> }>()

export function healthClient(server: ServerConnection.HttpBase, fetch: typeof globalThis.fetch) {
  const key = cacheKey(server)
  const hit = clients.get(server.url)
  if (hit && hit.key === key && hit.fetch === fetch) return hit.client
  const client = Orchestra.make({
    baseUrl: server.url,
    fetch,
    headers: server.password
      ? { Authorization: `Basic ${authTokenFromCredentials({ username: server.username, password: server.password })}` }
      : undefined,
  })
  clients.set(server.url, { key, fetch, client })
  return client
}

function timeoutSignal(timeoutMs: number) {
  const timeout = (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }).timeout
  if (timeout) {
    try {
      return {
        signal: timeout.call(AbortSignal, timeoutMs),
        clear: undefined as (() => void) | undefined,
      }
    } catch {}
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return { signal: controller.signal, clear: () => clearTimeout(timer) }
}

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException("Aborted", "AbortError"))
    }
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

function retryable(error: unknown, signal?: AbortSignal) {
  if (signal?.aborted) return false
  if (error instanceof ClientError) return error.reason === "Transport"
  if (!(error instanceof Error)) return false
  if (error.name === "AbortError" || error.name === "TimeoutError") return false
  if (error instanceof TypeError) return true
  return /network|fetch|econnreset|econnrefused|enotfound|timedout/i.test(error.message)
}

export async function checkServerHealth(
  server: ServerConnection.HttpBase,
  fetch: typeof globalThis.fetch,
  opts?: CheckServerHealthOptions,
): Promise<ServerHealth> {
  const timeout = opts?.signal ? undefined : timeoutSignal(opts?.timeoutMs ?? defaultTimeoutMs)
  const signal = opts?.signal ?? timeout?.signal
  const retryCount = opts?.retryCount ?? defaultRetryCount
  const retryDelayMs = opts?.retryDelayMs ?? defaultRetryDelayMs
  const next = (count: number, error: unknown) => {
    if (count >= retryCount || !retryable(error, signal)) return Promise.resolve({ healthy: false } as const)
    return wait(retryDelayMs * (count + 1), signal)
      .then(() => attempt(count + 1))
      .catch(() => ({ healthy: false }))
  }
  const client = healthClient(server, fetch)
  const attempt = async (count: number): Promise<ServerHealth> => {
    const current = await client.health
      .get({ signal })
      .then((value) => ({ data: { healthy: value.healthy === true, version: value.version } }))
      .catch((error) => ({ error }))
    if ("data" in current && current.data) return current.data
    if (signal?.aborted) return { healthy: false }

    return next(count, "error" in current ? current.error : new Error("Invalid health response"))
  }
  return attempt(0).finally(() => timeout?.clear?.())
}

const pollMs = 10_000

export function useCheckServerHealth() {
  const platform = usePlatform()
  const fetcher = platform.fetch ?? globalThis.fetch

  return (http: ServerConnection.HttpBase) => {
    const key = cacheKey(http)
    const hit = healthCache.get(key)
    const now = Date.now()
    if (hit && hit.fetch === fetcher && (!hit.done || now - hit.at < cacheMs)) return hit.promise
    const promise = checkServerHealth(http, fetcher).finally(() => {
      const next = healthCache.get(key)
      if (!next || next.promise !== promise) return
      next.done = true
      next.at = Date.now()
    })
    healthCache.set(key, { at: now, done: false, fetch: fetcher, promise })
    return promise
  }
}

// A loaded machine can delay one health response past its timeout. One miss must not flip the UI to
// disconnected, so a healthy server is only demoted after this many consecutive misses.
const failureThreshold = 2
// A miss is confirmed sooner than the regular poll, so a server that really went down is reported quickly.
const confirmMs = 2_000

/**
 * Decides what a poll result means for the published health. A failed poll keeps the last healthy status while the
 * event stream still shows life, or until `failureThreshold` polls in a row have failed.
 */
export function nextServerHealth(input: {
  previous?: ServerHealth
  result: ServerHealth
  failures: number
  streamAlive: boolean
}): { health: ServerHealth; failures: number; suppressed: boolean } {
  if (input.result.healthy) return { health: input.result, failures: 0, suppressed: false }
  const failures = input.failures + 1
  if (input.previous?.healthy && (input.streamAlive || failures < failureThreshold))
    return { health: input.previous, failures, suppressed: true }
  return { health: input.result, failures, suppressed: false }
}

/**
 * A healthy server whose event stream is still delivering events or heartbeats needs no health request: the stream is
 * the stronger signal, and a lost stream stops counting as alive within `STREAM_STALL_MS`, after which polling resumes.
 */
export function pollServerHealth(input: {
  previous?: ServerHealth
  streamAlive: boolean
  check: () => Promise<ServerHealth>
}) {
  if (input.previous?.healthy && input.streamAlive) return Promise.resolve(input.previous)
  return input.check()
}

export const useServerHealth = (servers: Accessor<ServerConnection.Any[]>, enabled: Accessor<boolean>) => {
  const checkServerHealth = useCheckServerHealth()
  const [status, setStatus] = createStore({} as Record<ServerConnection.Key, ServerHealth | undefined>)

  createEffect(() => {
    if (!enabled()) {
      setStatus(reconcile({}))
      return
    }
    const list = servers()
    let dead = false
    let running = false
    let confirm: ReturnType<typeof setTimeout> | undefined
    const failures: Record<string, number> = {}

    const refresh = async () => {
      // A poll can outlast the interval on a loaded machine; overlapping rounds would count one miss twice.
      if (running) return
      running = true
      const results: Record<string, ServerHealth> = {}
      let unsure = false
      await Promise.all(
        list.map(async (conn) => {
          const key = ServerConnection.key(conn)
          const polled = await pollServerHealth({
            previous: status[key],
            streamAlive: streamAlive(conn.http.url),
            check: () => checkServerHealth(conn.http),
          })
          if (dead) return
          const next = nextServerHealth({
            previous: status[key],
            result: polled,
            failures: failures[key] ?? 0,
            streamAlive: streamAlive(conn.http.url),
          })
          failures[key] = next.failures
          if (next.suppressed) {
            unsure = true
            console.warn("[server-health] poll failed, keeping last healthy status", {
              url: conn.http.url,
              failures: next.failures,
              streamAlive: streamAlive(conn.http.url),
            })
          }
          if (!next.suppressed && !next.health.healthy && status[key]?.healthy)
            console.warn("[server-health] server marked unreachable", { url: conn.http.url, failures: next.failures })
          results[key] = next.health
          setStatus(key, next.health)
        }),
      )
      running = false
      if (dead) return
      setStatus(reconcile(results))
      if (unsure) confirm = setTimeout(() => void refresh(), confirmMs)
    }

    void refresh()
    const id = setInterval(() => void refresh(), pollMs)
    onCleanup(() => {
      dead = true
      clearInterval(id)
      if (confirm) clearTimeout(confirm)
    })
  })

  return status
}
