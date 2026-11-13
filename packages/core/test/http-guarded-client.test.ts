import { Effect, Fiber } from "effect"
import { createServer } from "node:http"
import net, { type Server } from "node:net"
import { networkInterfaces } from "node:os"
import tls from "node:tls"
import { describe, expect, test } from "bun:test"
import { HttpClientRequest } from "effect/unstable/http"
import {
  makePinnedClient,
  makeSessionValue,
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

describe("beyond loopback", () => {
  test("a non-loopback TLS dial keeps the URL hostname as SNI and rejects the untrusted certificate", async () => {
    const seen: { servername?: string; local?: string } = {}
    const dialed = await reachableBeyond()
    const server = tls.createServer({
      cert: await Bun.file(new URL("./fixture/pinned-example-cert.pem", import.meta.url)).text(),
      key: await Bun.file(new URL("./fixture/pinned-example-key.pem", import.meta.url)).text(),
    })
    server.on("connection", (socket) => {
      seen.local = socket.localAddress
    })
    server.on("secureConnection", (socket) => {
      if (socket.servername) seen.servername = socket.servername
      if (socket.localAddress) seen.local = socket.localAddress
      socket.end("HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok")
    })
    server.on("tlsClientError", (_error, socket) => {
      if (!socket) return
      if (socket.servername) seen.servername = socket.servername
      if (socket.localAddress) seen.local = socket.localAddress
    })
    await listen(server, dialed)
    const bound = server.address()
    if (!bound || typeof bound === "string") throw new Error("missing address")
    try {
      const client = makePinnedClient(() => "direct", async () => [address(dialed)])
      const failure = await Effect.runPromise(
        client.execute(HttpClientRequest.get(`https://pinned.example:${bound.port}/`)).pipe(Effect.exit),
      )
      for (let attempt = 0; attempt < 50 && !seen.servername; attempt++) await new Promise((resolve) => setTimeout(resolve, 10))
      expect(failure._tag).toBe("Failure")
      expect(seen.servername).toBe("pinned.example")
      expect(seen.local).toBe(dialed)
      expect(dialed).not.toBe("127.0.0.1")
    } finally {
      server.close()
    }
  }, 30_000)

  test("an env proxy does not receive a guarded dial to a non-loopback address", async () => {
    let proxyHits = 0
    let hits = 0
    const proxy = net.createServer((socket) => {
      proxyHits++
      socket.destroy()
    })
    await listen(proxy, "127.0.0.1")
    const proxyBound = proxy.address()
    if (!proxyBound || typeof proxyBound === "string") throw new Error("missing proxy")
    const dialed = await reachableBeyond()
    const server = createServer((_request, response) => {
      hits++
      response.writeHead(200, { "content-type": "text/plain" })
      response.end("direct")
    })
    await listen(server, dialed)
    const bound = server.address()
    if (!bound || typeof bound === "string") throw new Error("missing address")
    const previous = {
      HTTP_PROXY: process.env.HTTP_PROXY, HTTPS_PROXY: process.env.HTTPS_PROXY, ALL_PROXY: process.env.ALL_PROXY,
      http_proxy: process.env.http_proxy, https_proxy: process.env.https_proxy,
      NO_PROXY: process.env.NO_PROXY, no_proxy: process.env.no_proxy,
    }
    const proxyUrl = `http://127.0.0.1:${proxyBound.port}`
    process.env.HTTP_PROXY = proxyUrl
    process.env.HTTPS_PROXY = proxyUrl
    process.env.ALL_PROXY = proxyUrl
    process.env.http_proxy = proxyUrl
    process.env.https_proxy = proxyUrl
    process.env.NO_PROXY = ""
    process.env.no_proxy = ""
    try {
      const client = makePinnedClient(() => "direct", async () => [address(dialed)])
      const response = await Effect.runPromise(client.execute(HttpClientRequest.get(`http://pinned.example:${bound.port}/`)))
      expect(await Effect.runPromise(response.text)).toBe("direct")
      expect(hits).toBe(1)
      expect(proxyHits).toBe(0)
      expect(dialed).not.toBe("127.0.0.1")
    } finally {
      for (const [key, value] of Object.entries(previous)) process.env[key] = value ?? ""
      proxy.close()
      server.close()
    }
  }, 30_000)

  test("closing the session releases the proxy hold when an IP request is cancelled before headers", async () => {
    const stuck = await ipWithoutHeaders()
    const previous = {
      HTTP_PROXY: process.env.HTTP_PROXY,
      NO_PROXY: process.env.NO_PROXY,
      no_proxy: process.env.no_proxy,
    }
    process.env.HTTP_PROXY = "http://127.0.0.1:9"
    process.env.NO_PROXY = "example.test"
    process.env.no_proxy = "example.test"
    const session = makeSessionValue({
      lookup: async () => {
        throw new Error("IP_URL_MUST_NOT_LOOKUP")
      },
    })
    const fiber = Effect.runFork(session.client.execute(HttpClientRequest.get(`http://127.0.0.1:${stuck.port}/`)))
    try {
      await stuck.connected
      expect(process.env.NO_PROXY).toBe("*")
      expect(process.env.no_proxy).toBe("*")
      await Effect.runPromise(session.close)
      expect(process.env.NO_PROXY).toBe("example.test")
      expect(process.env.no_proxy).toBe("example.test")
      expect(process.env.HTTP_PROXY).toBe("http://127.0.0.1:9")
    } finally {
      await Effect.runPromise(Fiber.interrupt(fiber))
      process.env.HTTP_PROXY = previous.HTTP_PROXY ?? ""
      process.env.NO_PROXY = previous.NO_PROXY ?? ""
      process.env.no_proxy = previous.no_proxy ?? ""
      stuck.server.close()
    }
  }, 30_000)

  test("interrupting an IP request releases the proxy hold before headers", async () => {
    const stuck = await ipWithoutHeaders()
    const previous = {
      HTTP_PROXY: process.env.HTTP_PROXY,
      NO_PROXY: process.env.NO_PROXY,
      no_proxy: process.env.no_proxy,
    }
    process.env.HTTP_PROXY = "http://127.0.0.1:9"
    process.env.NO_PROXY = "example.test"
    process.env.no_proxy = "example.test"
    const client = makePinnedClient(() => "direct", async () => {
      throw new Error("IP_URL_MUST_NOT_LOOKUP")
    })
    const fiber = Effect.runFork(client.execute(HttpClientRequest.get(`http://127.0.0.1:${stuck.port}/`)))
    try {
      await stuck.connected
      expect(process.env.NO_PROXY).toBe("*")
      expect(process.env.no_proxy).toBe("*")
      await Effect.runPromise(Fiber.interrupt(fiber))
      expect(process.env.NO_PROXY).toBe("example.test")
      expect(process.env.no_proxy).toBe("example.test")
      expect(process.env.HTTP_PROXY).toBe("http://127.0.0.1:9")
    } finally {
      await Effect.runPromise(Fiber.interrupt(fiber))
      process.env.HTTP_PROXY = previous.HTTP_PROXY ?? ""
      process.env.NO_PROXY = previous.NO_PROXY ?? ""
      process.env.no_proxy = previous.no_proxy ?? ""
      stuck.server.close()
    }
  }, 30_000)

  test("an IP dial releases the proxy hold", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/plain" })
      response.end("ip")
    })
    await listen(server, "127.0.0.1")
    const bound = server.address()
    if (!bound || typeof bound === "string") throw new Error("missing address")
    const previous = { HTTP_PROXY: process.env.HTTP_PROXY, NO_PROXY: process.env.NO_PROXY }
    process.env.HTTP_PROXY = "http://127.0.0.1:9"
    process.env.NO_PROXY = "example.test"
    try {
      const client = makePinnedClient(() => "direct", async () => {
        throw new Error("IP_URL_MUST_NOT_LOOKUP")
      })
      const response = await Effect.runPromise(client.execute(HttpClientRequest.get(`http://127.0.0.1:${bound.port}/`)))
      expect(await Effect.runPromise(response.text)).toBe("ip")
      expect(process.env.NO_PROXY).toBe("example.test")
      expect(process.env.HTTP_PROXY).toBe("http://127.0.0.1:9")
    } finally {
      process.env.HTTP_PROXY = previous.HTTP_PROXY ?? ""
      process.env.NO_PROXY = previous.NO_PROXY ?? ""
      server.close()
    }
  }, 30_000)

  test("a second request dials the new lookup instead of reusing the first socket", async () => {
    let primary = 0
    let lookups = 0
    const server = createServer((_request, response) => {
      primary++
      response.writeHead(200, { "content-type": "text/plain" })
      response.end("primary")
    })
    await listen(server, "127.0.0.1")
    const bound = server.address()
    if (!bound || typeof bound === "string") throw new Error("missing address")
    try {
      let phase = "first"
      const client = makePinnedClient(() => "direct", async () => {
        lookups++
        return [address(phase === "first" ? "127.0.0.1" : "127.0.0.2")]
      })
      const first = await Effect.runPromise(client.execute(HttpClientRequest.get(`http://pinned.example:${bound.port}/`)))
      expect(await Effect.runPromise(first.text)).toBe("primary")
      const afterFirst = lookups
      phase = "second"
      const second = await Effect.runPromise(
        client.execute(HttpClientRequest.get(`http://pinned.example:${bound.port}/`)).pipe(Effect.exit),
      )
      expect(second._tag).toBe("Failure")
      expect(primary).toBe(1)
      expect(lookups).toBeGreaterThan(afterFirst)
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  }, 30_000)
})

async function ipWithoutHeaders() {
  let connected: (() => void) | undefined
  const connectedPromise = new Promise<void>((resolve) => {
    connected = resolve
  })
  const server = net.createServer(() => {
    connected?.()
  })
  await listen(server, "127.0.0.1")
  const bound = server.address()
  if (!bound || typeof bound === "string") throw new Error("missing address")
  return { server, port: bound.port, connected: connectedPromise }
}

function listen(server: Server, host: string, port = 0) {
  return new Promise<void>((resolve, reject) => {
    const fail = (error: Error) => reject(error)
    server.once("error", fail)
    server.listen(port, host, () => {
      server.removeListener("error", fail)
      resolve()
    })
  })
}

async function reachableBeyond() {
  const candidates = Object.values(networkInterfaces()).flatMap((entries) =>
    (entries ?? []).flatMap((entry) => {
      const family = String(entry.family)
      if ((family !== "IPv4" && family !== "4") || entry.internal || entry.address.startsWith("169.254.")) return []
      return [entry.address]
    }),
  )
  if (candidates.length === 0) throw new Error("GUARDED_DIAL_NO_NON_LOOPBACK")
  let last: unknown
  for (const candidate of candidates) {
    const probe = net.createServer()
    try {
      await listen(probe, candidate)
      const bound = probe.address()
      if (!bound || typeof bound === "string") throw new Error("missing address")
      await connect(candidate, bound.port)
      probe.close()
      return candidate
    } catch (error) {
      probe.close()
      last = error
    }
  }
  throw last instanceof Error ? last : new Error("GUARDED_DIAL_NO_NON_LOOPBACK")
}

function connect(host: string, port: number) {
  return new Promise<void>((resolve, reject) => {
    const socket = net.connect({ host, port })
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error("GUARDED_DIAL_PROBE_TIMEOUT"))
    }, 1_000)
    socket.once("connect", () => {
      clearTimeout(timer)
      socket.end()
      resolve()
    })
    socket.once("error", (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}
