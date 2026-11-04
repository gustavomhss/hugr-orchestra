import { describe, expect, test } from "bun:test"
import type { ServerConnection } from "@/context/server"
import { checkServerHealth, healthClient, nextServerHealth, pollServerHealth } from "./server-health"

const server: ServerConnection.HttpBase = {
  url: "http://localhost:4096",
}

function abortFromInput(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.signal) return init.signal
  if (input instanceof Request) return input.signal
  return undefined
}

describe("checkServerHealth", () => {
  test("returns healthy response with version", async () => {
    let request: URL | undefined
    const fetch = (async (input: RequestInfo | URL) => {
      request = input instanceof URL ? input : new URL(input instanceof Request ? input.url : input)
      return new Response(JSON.stringify({ healthy: true, version: "1.2.3" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }) as unknown as typeof globalThis.fetch

    const result = await checkServerHealth(server, fetch)

    expect(result).toEqual({ healthy: true, version: "1.2.3" })
    expect(request?.pathname).toBe("/api/health")
  })



  test("allows slow servers thirty seconds by default", async () => {
    const timeout = Object.getOwnPropertyDescriptor(AbortSignal, "timeout")
    let timeoutMs = 0
    Object.defineProperty(AbortSignal, "timeout", {
      configurable: true,
      value: (ms: number) => {
        timeoutMs = ms
        return new AbortController().signal
      },
    })

    const fetch = (async () =>
      new Response(JSON.stringify({ healthy: true, version: "1.2.3" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof globalThis.fetch

    await checkServerHealth(server, fetch).finally(() => {
      if (timeout) Object.defineProperty(AbortSignal, "timeout", timeout)
      if (!timeout) Reflect.deleteProperty(AbortSignal, "timeout")
    })

    expect(timeoutMs).toBe(30_000)
  })

  test("returns unhealthy when request fails", async () => {
    const fetch = (async () => {
      throw new Error("network")
    }) as unknown as typeof globalThis.fetch

    const result = await checkServerHealth(server, fetch)

    expect(result).toEqual({ healthy: false })
  })

  test("uses timeout fallback when AbortSignal.timeout is unavailable", async () => {
    const timeout = Object.getOwnPropertyDescriptor(AbortSignal, "timeout")
    Object.defineProperty(AbortSignal, "timeout", {
      configurable: true,
      value: undefined,
    })

    let aborted = false
    const fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = abortFromInput(input, init)
        signal?.addEventListener(
          "abort",
          () => {
            aborted = true
            reject(new DOMException("Aborted", "AbortError"))
          },
          { once: true },
        )
      })) as unknown as typeof globalThis.fetch

    const result = await checkServerHealth(server, fetch, {
      timeoutMs: 10,
    }).finally(() => {
      if (timeout) Object.defineProperty(AbortSignal, "timeout", timeout)
      if (!timeout) Reflect.deleteProperty(AbortSignal, "timeout")
    })

    expect(aborted).toBe(true)
    expect(result).toEqual({ healthy: false })
  })

  test("uses provided abort signal", async () => {
    let signal: AbortSignal | undefined
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      signal = abortFromInput(input, init)
      return new Response(JSON.stringify({ healthy: true, version: "1.2.3" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }) as unknown as typeof globalThis.fetch

    const abort = new AbortController()
    await checkServerHealth(server, fetch, {
      signal: abort.signal,
    })

    expect(signal).toBe(abort.signal)
  })

  test("retries transient failures and eventually succeeds", async () => {
    let count = 0
    const fetch = (async () => {
      count += 1
      if (count < 3) throw new TypeError("network")
      return new Response(JSON.stringify({ healthy: true, version: "1.2.3" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }) as unknown as typeof globalThis.fetch

    const result = await checkServerHealth(server, fetch, {
      retryCount: 2,
      retryDelayMs: 1,
    })

    expect(count).toBe(3)
    expect(result).toEqual({ healthy: true, version: "1.2.3" })
  })

  test("returns unhealthy when retries are exhausted", async () => {
    let count = 0
    const fetch = (async () => {
      count += 1
      throw new TypeError("network")
    }) as unknown as typeof globalThis.fetch

    const result = await checkServerHealth(server, fetch, {
      retryCount: 2,
      retryDelayMs: 1,
    })

    expect(count).toBe(3)
    expect(result).toEqual({ healthy: false })
  })
})

describe("nextServerHealth", () => {
  const up = { healthy: true, version: "1.2.3" }
  const down = { healthy: false }

  test("one missed poll keeps a healthy server healthy", () => {
    expect(nextServerHealth({ previous: up, result: down, failures: 0, streamAlive: false })).toEqual({
      health: up,
      failures: 1,
      suppressed: true,
    })
  })

  test("consecutive missed polls report the server down", () => {
    expect(nextServerHealth({ previous: up, result: down, failures: 1, streamAlive: false })).toEqual({
      health: down,
      failures: 2,
      suppressed: false,
    })
  })

  test("a live event stream outweighs any number of missed polls", () => {
    expect(nextServerHealth({ previous: up, result: down, failures: 9, streamAlive: true })).toEqual({
      health: up,
      failures: 10,
      suppressed: true,
    })
  })

  test("a healthy poll resets the streak", () => {
    expect(nextServerHealth({ previous: down, result: up, failures: 5, streamAlive: false })).toEqual({
      health: up,
      failures: 0,
      suppressed: false,
    })
  })

  test("a server never seen healthy is reported down at once", () => {
    expect(nextServerHealth({ result: down, failures: 0, streamAlive: true })).toEqual({
      health: down,
      failures: 1,
      suppressed: false,
    })
  })
})

describe("healthClient", () => {
  const fetch = (async () => new Response("{}")) as unknown as typeof globalThis.fetch

  test("one server and fetch share one client across polls", () => {
    const first = healthClient({ url: "http://localhost:4300" }, fetch)
    expect(healthClient({ url: "http://localhost:4300" }, fetch)).toBe(first)
  })

  test("changed credentials or a different fetch get a fresh client", () => {
    const first = healthClient({ url: "http://localhost:4301", password: "a" }, fetch)
    const other = healthClient({ url: "http://localhost:4301", password: "b" }, fetch)
    expect(other).not.toBe(first)
    const refetched = healthClient({ url: "http://localhost:4301", password: "b" }, fetch.bind(undefined))
    expect(refetched).not.toBe(other)
    expect(healthClient({ url: "http://localhost:4302" }, fetch)).not.toBe(first)
  })
})

describe("pollServerHealth", () => {
  const counted = () => {
    const calls = { count: 0 }
    return { calls, check: async () => { calls.count++; return { healthy: true, version: "2" } } }
  }

  test("a healthy server with a live event stream is not polled", async () => {
    const probe = counted()
    expect(await pollServerHealth({ previous: { healthy: true, version: "1" }, streamAlive: true, check: probe.check }))
      .toEqual({ healthy: true, version: "1" })
    expect(probe.calls.count).toBe(0)
  })

  test("a stalled stream, an unknown server or an unhealthy one is polled", async () => {
    const probe = counted()
    await pollServerHealth({ previous: { healthy: true }, streamAlive: false, check: probe.check })
    await pollServerHealth({ streamAlive: true, check: probe.check })
    await pollServerHealth({ previous: { healthy: false }, streamAlive: true, check: probe.check })
    expect(probe.calls.count).toBe(3)
  })
})
