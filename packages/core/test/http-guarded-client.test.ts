import { Effect } from "effect"
import { createServer } from "node:http"
import { describe, expect, test } from "bun:test"
import { HttpClientRequest } from "effect/unstable/http"
import {
  makePinnedClient,
  selectApprovedAddress,
  type Resolution,
} from "../src/effect/http-guarded-client"

const address = (value: string): Resolution => ({ address: value, family: 4 })

describe("selectApprovedAddress", () => {
  test("public origin dials a public address", () => {
    expect(selectApprovedAddress("example.test", "public", [address("93.184.216.34")])).toEqual({
      ok: true,
      address: "93.184.216.34",
    })
  })

  test("public origin never dials loopback, private, link-local, mixed or literal non-public", () => {
    for (const addresses of [
      [address("127.0.0.1")],
      [address("10.0.0.5")],
      [address("169.254.169.254")],
      [address("93.184.216.34"), address("127.0.0.1")],
      [],
    ]) {
      expect(selectApprovedAddress("example.test", "public", addresses).ok).toBe(false)
    }
    expect(selectApprovedAddress("127.0.0.1", "public", [address("127.0.0.1")]).ok).toBe(false)
    expect(selectApprovedAddress("localhost", "public", []).ok).toBe(false)
  })

  test("local and private origins keep their permission semantics, link-local stays refused", () => {
    expect(selectApprovedAddress("localhost", "loopback", [address("127.0.0.1")]).ok).toBe(true)
    expect(selectApprovedAddress("db.local", "private", [address("10.1.2.3")])).toEqual({
      ok: true,
      address: "10.1.2.3",
    })
    expect(selectApprovedAddress("169.254.169.254", "loopback", [address("169.254.169.254")]).ok).toBe(false)
  })

  test("the initial direct request keeps the caller's permission semantics", () => {
    expect(selectApprovedAddress("localhost", "direct", [address("127.0.0.1")])).toEqual({
      ok: true,
      address: "127.0.0.1",
    })
  })

  test("IPv6 and mapped addresses classify like their IPv4 reach", () => {
    expect(selectApprovedAddress("example.test", "public", [{ address: "2606:4700:4700::1111", family: 6 }]).ok).toBe(true)
    expect(selectApprovedAddress("example.test", "public", [{ address: "fe80::1", family: 6 }]).ok).toBe(false)
    expect(selectApprovedAddress("example.test", "public", [{ address: "::ffff:127.0.0.1", family: 6 }]).ok).toBe(false)
  })
})

describe("makePinnedClient", () => {
  test("dials the approved address while keeping Host at the URL hostname", async () => {
    let hits = 0
    let seenHost: string | undefined
    const server = createServer((request, response) => {
      hits++
      seenHost = request.headers.host
      response.writeHead(200, { "content-type": "text/plain" })
      response.end("pinned-ok")
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const bound = server.address()
    if (!bound || typeof bound === "string") throw new Error("missing address")
    try {
      const client = makePinnedClient(
        () => "direct",
        async () => [address("127.0.0.1")],
      )
      const response = await Effect.runPromise(
        client.execute(HttpClientRequest.get(`http://pinned.local:${bound.port}/`)),
      )
      expect(response.status).toBe(200)
      expect(await Effect.runPromise(response.text)).toBe("pinned-ok")
      expect(hits).toBe(1)
      expect(seenHost).toBe(`pinned.local:${bound.port}`)
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  }, 30_000)

  test("a chunked response past the cap is refused during reception instead of buffered", async () => {
    let served = 0
    let closed = false
    const server = createServer((request, response) => {
      request.on("close", () => {
        closed = true
      })
      response.writeHead(200, { "content-type": "application/octet-stream", "transfer-encoding": "chunked" })
      const send = (index: number) => {
        if (closed) return
        response.write(Buffer.alloc(512 * 1024))
        served++
        if (served < 20) setImmediate(() => send(index + 1))
        else response.end()
      }
      send(0)
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const bound = server.address()
    if (!bound || typeof bound === "string") throw new Error("missing address")
    try {
      const client = makePinnedClient(
        () => "direct",
        async () => [address("127.0.0.1")],
        1024 * 1024,
      )
      const failure = await Effect.runPromise(
        client.execute(HttpClientRequest.get(`http://pinned.local:${bound.port}/`)).pipe(Effect.exit),
      )
      expect(failure).toMatchObject({ _tag: "Failure" })
      const message = String(failure)
      expect(message).toContain("exceeds the limit")
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  }, 30_000)

  test("closing the session destroys in-flight requests instead of letting them stream on", async () => {
    let aborted = false
    let received: (() => void) | undefined
    const receivedPromise = new Promise<void>((resolve) => {
      received = resolve
    })
    const server = createServer((request, response) => {
      request.on("aborted", () => {
        aborted = true
      })
      response.writeHead(200, { "content-type": "text/plain" })
      response.write("part-1\n")
      // The server intentionally never finishes; only the client's cancellation can close the socket.
      received?.()
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const bound = server.address()
    if (!bound || typeof bound === "string") throw new Error("missing address")
    try {
      const { makeSessionValue } = await import("../src/effect/http-guarded-client")
      const session = makeSessionValue({ lookup: async () => [address("127.0.0.1")] })
      const request = Effect.runFork(session.client.execute(HttpClientRequest.get(`http://pinned.local:${bound.port}/`)))
      await receivedPromise
      await Effect.runPromise(session.close)
      for (let attempt = 0; attempt < 100 && !aborted; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      expect(aborted).toBe(true)
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  }, 30_000)

  test("a changed dial-time answer to loopback from a public origin never dials", async () => {
    let hits = 0
    const server = createServer((_request, response) => {
      hits++
      response.writeHead(200, { "content-type": "text/plain" })
      response.end("should-not-happen")
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const bound = server.address()
    if (!bound || typeof bound === "string") throw new Error("missing address")
    try {
      const client = makePinnedClient(
        () => "public",
        async () => [address("127.0.0.1")],
      )
      const failure = await Effect.runPromise(
        client.execute(HttpClientRequest.get(`http://rebinding.test:${bound.port}/`)).pipe(Effect.exit),
      )
      expect(failure._tag).toBe("Failure")
      expect(hits).toBe(0)
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  }, 30_000)
})
