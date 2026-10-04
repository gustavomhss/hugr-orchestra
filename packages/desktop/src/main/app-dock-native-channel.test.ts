import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { createServer, type Socket } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AppDockNativeChannel } from "./app-dock-native-channel"
import { NativeDockClient } from "./app-dock-native-client"
import { NativeDockProtocol } from "./app-dock-native-protocol"

// Real local sockets exercise only transport behavior, not Docker or runtime ownership.
const response = Buffer.from("HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n\r\n")
const containerID = "a".repeat(64)
const cap = NativeDockProtocol.limits.frameBytes
const channels: NativeDockProtocol.Channel[] = []
const fixtures: Array<() => Promise<void>> = []
const releases: Array<() => void> = []

afterEach(async () => {
  releases.splice(0).forEach((release) => release())
  await Promise.all(channels.splice(0).map((channel) => channel.terminate().catch(() => {})))
  await Promise.all(fixtures.splice(0).map((close) => close()))
})

function hold<T>(fallback: T) {
  const deferred = Promise.withResolvers<T>()
  releases.push(() => deferred.resolve(fallback))
  return deferred
}

async function peer(reply: Uint8Array | undefined = response) {
  const directory = await mkdtemp(join(tmpdir(), "nc-"))
  const path = join(directory, "s")
  const attached = Promise.withResolvers<{ socket: Socket; header: string }>()
  const sockets = new Set<Socket>()
  const input: Buffer[] = []
  const state = { connections: 0, bytes: 0 }
  const server = createServer({ allowHalfOpen: true }, (socket) => {
    state.connections++
    sockets.add(socket)
    socket.on("error", () => {})
    socket.once("close", () => sockets.delete(socket))
    const request = { bytes: Buffer.alloc(0), complete: false }
    socket.on("data", (chunk: Buffer) => {
      if (request.complete) {
        input.push(chunk)
        state.bytes += chunk.length
        return
      }
      request.bytes = Buffer.concat([request.bytes, chunk])
      const end = request.bytes.indexOf("\r\n\r\n")
      if (end === -1) return
      request.complete = true
      attached.resolve({ socket, header: request.bytes.subarray(0, end + 4).toString("ascii") })
      if (request.bytes.length > end + 4) {
        input.push(request.bytes.subarray(end + 4))
        state.bytes += request.bytes.length - end - 4
      }
      request.bytes = Buffer.alloc(0)
      if (reply) socket.write(reply)
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(path, resolve)
  })
  fixtures.push(async () => {
    sockets.forEach((socket) => socket.destroy())
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    await rm(directory, { recursive: true, force: true })
  })
  return { endpoint: `unix://${encodeURI(path)}`, attached: attached.promise, state, input }
}

function launch(endpoint: string, callbacks: Partial<Pick<AppDockNativeChannel.Options, "start" | "stop">> = {}) {
  const state = { starts: 0, stops: 0, events: [] as string[] }
  const channel = AppDockNativeChannel.create({
    endpoint, containerID,
    async start() {
      state.starts++
      state.events.push("start")
      await callbacks.start?.()
      state.events.push("started")
    },
    async stop() {
      state.stops++
      state.events.push("stop")
      const exit = callbacks.stop ? await callbacks.stop() : { code: 0, reason: "helper-exited" as const }
      state.events.push("stopped")
      return exit
    },
  })
  channels.push(channel)
  return { channel, state }
}

function mux(bytes: Uint8Array, selector = 1) {
  const header = Buffer.alloc(8)
  header[0] = selector
  header.writeUInt32BE(bytes.length, 4)
  return Buffer.concat([header, bytes])
}

async function until(predicate: () => boolean, ms = 2000) {
  const deadline = performance.now() + ms
  while (!predicate()) {
    if (performance.now() >= deadline) throw new Error("Transport fixture condition not reached")
    await Bun.sleep(1)
  }
}

async function failure(promise: Promise<unknown>) {
  return promise.then(() => { throw new Error("Expected channel rejection") }, (error: unknown) => {
    expect(error).toBeInstanceOf(NativeDockProtocol.NativeError)
    return error as NativeDockProtocol.NativeError
  })
}

test("synchronous create defers attach, snapshots identity, and preserves fragmented/coalesced raw bytes", async () => {
  const server = await peer(Buffer.alloc(0))
  const received: Uint8Array[] = []
  const state = { starts: 0, stops: 0 }
  const options: AppDockNativeChannel.Options = {
    endpoint: server.endpoint, containerID,
    start: async () => { state.starts++ },
    stop: async () => { state.stops++; return { code: 23, reason: "helper-exited" } },
  }
  const channel = AppDockNativeChannel.create(options)
  channels.push(channel)
  expect(typeof channel.write).toBe("function")
  expect(server.state.connections).toBe(0)
  options.endpoint = "tcp://127.0.0.1:1"
  options.containerID = "b".repeat(64)
  options.start = async () => { throw new Error("mutated callback") }
  options.stop = async () => { throw new Error("mutated callback") }
  channel.onData((bytes) => { received.push(bytes) })
  const exits: NativeDockProtocol.Exit[] = []
  channel.onExit((exit) => { exits.push(exit) })
  const stdin = Buffer.from([0, 255, 32, 10, 13, 0xc3, 0xa9])
  const expectedInput = Buffer.from(stdin)
  const writing = channel.write(stdin)
  stdin.fill(42)
  const attach = await server.attached
  expect(attach.header).toBe(`POST /v1.51/containers/${containerID}/attach?stream=1&stdin=1&stdout=1&stderr=1 HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: tcp\r\nContent-Length: 0\r\n\r\n`)
  expect(state.starts).toBe(0)
  expect(server.state.bytes).toBe(0)
  attach.socket.write(response.subarray(0, 11))
  await Bun.sleep(10)
  expect(state.starts).toBe(0)
  const first = mux(Buffer.from([32, 0, 255, 0xc3]))
  attach.socket.write(Buffer.concat([response.subarray(11), first.subarray(0, 3)]))
  await until(() => state.starts === 1)
  attach.socket.write(first.subarray(3, 9))
  await Bun.sleep(5)
  attach.socket.write(Buffer.concat([
    first.subarray(9), mux(Buffer.from("private stderr"), 2), mux(Buffer.alloc(0)), mux(Buffer.from([0xa9, 10, 32])),
  ]))
  await writing
  await until(() => server.state.bytes === expectedInput.length && Buffer.concat(received).length === 7)
  expect(Buffer.concat(server.input)).toEqual(expectedInput)
  expect(Buffer.concat(received)).toEqual(Buffer.from([32, 0, 255, 0xc3, 0xa9, 10, 32]))
  await channel.terminate()
  expect(state).toEqual({ starts: 1, stops: 1 })
  expect(exits).toEqual([{ code: 23, reason: "helper-exited" }])
})

test("accepts exact 16 KiB HTTP boundary and exact frame cap; drains stderr beyond 64 KiB", async () => {
  const prefix = "HTTP/1.1 101 Switching Protocols\r\nConnection: keep-alive, Upgrade\r\nUpgrade: tcp\r\nX-Pad: "
  const header = Buffer.from(prefix + "x".repeat(16384 - prefix.length - 4) + "\r\n\r\n")
  expect(header.length).toBe(16384)
  const server = await peer(header)
  const transport = launch(server.endpoint)
  const received: Uint8Array[] = []
  transport.channel.onData((bytes) => { received.push(bytes) })
  const attach = await server.attached
  await until(() => transport.state.starts === 1)
  const bytes = Buffer.alloc(cap, 0x9f)
  attach.socket.write(Buffer.concat([mux(Buffer.alloc(cap, 42), 2), mux(Buffer.alloc(cap, 43), 2), mux(bytes)]))
  await until(() => Buffer.concat(received).length === cap)
  expect(Buffer.concat(received)).toEqual(bytes)
  expect(transport.state.stops).toBe(0)
})

test.each([
  ["200", "HTTP/1.1 200 OK\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n\r\n"],
  ["redirect", "HTTP/1.1 307 Redirect\r\nLocation: http://secret.invalid/token\r\n\r\n"],
  ["version", "HTTP/2 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n\r\n"],
  ["connection", "HTTP/1.1 101 Switching Protocols\r\nUpgrade: tcp\r\n\r\n"],
  ["upgrade", "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n"],
  ["duplicate", "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: tcp\r\nUpgrade: tcp\r\n\r\n"],
  ["malformed", "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: tcp\r\nBad Header\r\n\r\n"],
  ["body", "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: tcp\r\nContent-Length: 1\r\n\r\n"],
  ["chunked", "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: tcp\r\nTransfer-Encoding: chunked\r\n\r\n"],
  ["oversize", "HTTP/1.1 101 Switching Protocols\r\nX-Pad: " + "x".repeat(16384) + "\r\n\r\n"],
  ["unterminated", "x".repeat(16384)],
])("rejects HTTP %s without start, redirect, or response text in diagnostics", async (_, header) => {
  const server = await peer(Buffer.from(header))
  const transport = launch(server.endpoint)
  transport.channel.onData(() => {})
  await until(() => transport.state.stops === 1)
  await transport.channel.terminate()
  const error = await failure(transport.channel.write(Buffer.from("not sent")))
  expect(error.code).toBe("protocol-error")
  expect(error.message).not.toContain("secret")
  expect(transport.state.starts).toBe(0)
  expect(server.state.connections).toBe(1)
  expect(server.state.bytes).toBe(0)
})

test.each(["selector-0", "selector-3", "selector-255", "reserved-1", "reserved-2", "reserved-3", "oversize", "uint32-max"])(
  "rejects multiplex %s and tears down once", async (kind) => {
    const server = await peer()
    const transport = launch(server.endpoint)
    const received: Uint8Array[] = []
    transport.channel.onData((bytes) => { received.push(bytes) })
    const attach = await server.attached
    await until(() => transport.state.starts === 1)
    const bytes = mux(Buffer.from("secret"))
    if (kind.startsWith("selector")) bytes[0] = Number(kind.split("-")[1])
    if (kind.startsWith("reserved")) bytes[Number(kind.split("-")[1])] = 1
    if (kind === "oversize") bytes.writeUInt32BE(cap + 1, 4)
    if (kind === "uint32-max") bytes.writeUInt32BE(0xffffffff, 4)
    attach.socket.write(bytes.subarray(0, 5))
    await Bun.sleep(5)
    expect(transport.state.stops).toBe(0)
    attach.socket.write(bytes.subarray(5))
    await until(() => transport.state.stops === 1 || received.length > 0)
    expect(received).toEqual([])
    expect(transport.state.stops).toBe(1)
    await transport.channel.terminate()
    expect(await failure(transport.channel.write(Buffer.alloc(0)))).toMatchObject({ code: "protocol-error" })
    expect(transport.state.stops).toBe(1)
  },
)

test.each(["header", "mux-header", "payload"])("partial %s EOF fails protocol and joins actual stop", async (kind) => {
  const server = await peer(Buffer.alloc(0))
  const reap = hold<NativeDockProtocol.Exit>({ code: 9, reason: "helper-exited" })
  const transport = launch(server.endpoint, { stop: () => reap.promise })
  transport.channel.onData(() => {})
  const exits: NativeDockProtocol.Exit[] = []
  transport.channel.onExit((exit) => { exits.push(exit) })
  const attach = await server.attached
  if (kind === "header") attach.socket.end(response.subarray(0, 12))
  if (kind === "mux-header") attach.socket.end(Buffer.concat([response, mux(Buffer.from("ab")).subarray(0, 3)]))
  if (kind === "payload") attach.socket.end(Buffer.concat([response, mux(Buffer.from("ab")).subarray(0, 9)]))
  await until(() => transport.state.stops === 1)
  expect(await failure(transport.channel.write(Buffer.alloc(0)))).toMatchObject({ code: "protocol-error" })
  expect(exits).toEqual([])
  reap.resolve({ code: 9, reason: "helper-exited" })
  await transport.channel.terminate()
  expect(exits).toEqual([{ code: 9, reason: "helper-exited" }])
})

test.each(["late", "slow"])("%s stdout listener backpressures real socket without dropping bytes", async (kind) => {
  const server = await peer()
  const transport = launch(server.endpoint)
  const gate = hold<void>(undefined)
  const received = { bytes: 0, calls: 0 }
  const listener = async (bytes: Uint8Array) => {
    received.calls++
    received.bytes += bytes.length
    expect(bytes.every((byte) => byte === 0xa5)).toBe(true)
    if (kind === "slow" && received.calls === 1) await gate.promise
  }
  if (kind === "slow") transport.channel.onData(listener)
  const attach = await server.attached
  await until(() => transport.state.starts === 1)
  const packet = Buffer.concat(Array.from({ length: 16 }, () => mux(Buffer.alloc(cap, 0xa5))))
  const sent = { done: false }
  expect(attach.socket.write(packet, () => { sent.done = true })).toBe(false)
  if (kind === "slow") await until(() => received.calls === 1)
  await Bun.sleep(25)
  expect(sent.done).toBe(false)
  expect(received.calls).toBe(kind === "slow" ? 1 : 0)
  if (kind === "late") transport.channel.onData(listener)
  gate.resolve()
  // This proves bounded delivery and byte preservation, not a throughput target.
  await until(() => transport.state.stops > 0 || sent.done && received.bytes === 16 * cap, 5000)
  expect(transport.state.stops).toBe(0)
  expect(sent.done).toBe(true)
  expect(received.bytes).toBe(16 * cap)
}, 8000)

test("stdin waits for start and real writable backpressure before resolving; no retry or mutation", async () => {
  const server = await peer(Buffer.alloc(0))
  const starting = hold<void>(undefined)
  const transport = launch(server.endpoint, { start: () => starting.promise })
  const attach = await server.attached
  attach.socket.pause()
  attach.socket.write(response)
  await until(() => transport.state.starts === 1)
  const sent = { count: 0 }
  const writing = (async () => {
    for (let index = 0; index < 16; index++) {
      await transport.channel.write(Buffer.alloc(65536, index))
      sent.count++
    }
  })()
  await Bun.sleep(15)
  expect(sent.count).toBe(0)
  starting.resolve()
  await Bun.sleep(25)
  expect(sent.count).toBeLessThan(16)
  attach.socket.resume()
  await writing
  await until(() => server.state.bytes === 16 * 65536)
  expect(Buffer.concat(server.input)).toEqual(Buffer.concat(Array.from({ length: 16 }, (_, index) => Buffer.alloc(65536, index))))
  expect(transport.state.starts).toBe(1)
  expect(transport.state.stops).toBe(0)
})

test("listener installed by start resumes coalesced stdout while previous read is settling", async () => {
  const server = await peer(Buffer.concat([response, mux(Buffer.from("coalesced"))]))
  const received: Uint8Array[] = []
  const transport = launch(server.endpoint, { start: async () => {
    transport.channel.onData((bytes) => { received.push(bytes) })
  } })
  await until(() => Buffer.concat(received).length === 9)
  expect(Buffer.concat(received).toString()).toBe("coalesced")
  expect(transport.state.starts).toBe(1)
  expect(transport.state.stops).toBe(0)
})

test("write admission bounds queue count, aggregate bytes, and individual frame bytes", async () => {
  const server = await peer(Buffer.alloc(0))
  const transport = launch(server.endpoint)
  const writes = Array.from({ length: 32 }, () => failure(transport.channel.write(Buffer.alloc(0))))
  expect(await failure(transport.channel.write(Buffer.alloc(0)))).toMatchObject({ code: "pending-limit" })
  await transport.channel.terminate()
  expect((await Promise.all(writes)).every((error) => error.code === "client-closed")).toBe(true)
  const other = launch(server.endpoint)
  expect(await failure(other.channel.write(Buffer.alloc(cap + 1)))).toMatchObject({ code: "protocol-error" })
  const maximum = failure(other.channel.write(Buffer.alloc(cap)))
  expect(await failure(other.channel.write(Buffer.alloc(1)))).toMatchObject({ code: "pending-limit" })
  expect(other.state.stops).toBe(0)
  await other.channel.terminate()
  expect(await maximum).toMatchObject({ code: "client-closed" })
})

test.each(["attach", "socket"])("1s write deadline covers waiting for %s", async (kind) => {
  const server = await peer(Buffer.alloc(0))
  const transport = launch(server.endpoint)
  const attach = await server.attached
  if (kind === "socket") {
    attach.socket.pause()
    attach.socket.write(response)
    await until(() => transport.state.starts === 1)
  }
  const admitted = performance.now()
  const error = await failure((async () => {
    // More than the real local socket can accept while its peer is paused.
    for (let index = 0; index < 32; index++) await transport.channel.write(Buffer.alloc(cap))
  })())
  expect(error.code).toBe("write-timeout")
  expect(performance.now() - admitted).toBeGreaterThanOrEqual(900)
  expect(performance.now() - admitted).toBeLessThan(2000)
  await transport.channel.terminate()
  expect(transport.state.stops).toBe(1)
  expect(transport.state.starts).toBe(kind === "socket" ? 1 : 0)
  expect(server.state.bytes).toBe(0)
})

test("subscriptions are bounded, removable, and independently owned even for identical functions", async () => {
  const server = await peer(Buffer.alloc(0))
  const transport = launch(server.endpoint)
  const data = () => {}
  const exit = () => {}
  const off = Array.from({ length: 16 }, () => transport.channel.onData(data))
  const exits = Array.from({ length: 16 }, () => transport.channel.onExit(exit))
  expect(() => transport.channel.onData(data)).toThrow("Native channel subscription capacity exhausted")
  expect(() => transport.channel.onExit(exit)).toThrow("Native channel subscription capacity exhausted")
  off[0]!()
  off[0]!()
  transport.channel.onData(data)
  expect(() => transport.channel.onData(data)).toThrow("Native channel subscription capacity exhausted")
  off.forEach((remove) => remove())
  exits.forEach((remove) => remove())
  const attach = await server.attached
  attach.socket.write(response)
  await until(() => transport.state.starts === 1)
  await transport.channel.terminate()
})

test("terminate before startup microtask never connects or starts; late exit replays once", async () => {
  const server = await peer()
  const transport = launch(server.endpoint)
  const stopping = transport.channel.terminate()
  expect(transport.channel.terminate()).toBe(stopping)
  await stopping
  await Bun.sleep(10)
  expect(server.state.connections).toBe(0)
  expect(transport.state.events).toEqual(["stop", "stopped"])
  const exits: NativeDockProtocol.Exit[] = []
  const off = transport.channel.onExit((exit) => { exits.push(exit) })
  off()
  await transport.channel.terminate()
  expect(exits).toEqual([{ code: 0, reason: "helper-exited" }])
})

test("terminate during attach prevents late upgrade from starting after stop", async () => {
  const server = await peer(Buffer.alloc(0))
  const transport = launch(server.endpoint)
  const attach = await server.attached
  await transport.channel.terminate()
  attach.socket.write(response)
  await Bun.sleep(10)
  expect(transport.state.events).toEqual(["stop", "stopped"])
  expect(server.state.connections).toBe(1)
})

test.each(["resolve", "reject"])("terminate joins in-flight start %s before calling stop", async (kind) => {
  const server = await peer()
  const starting = hold<void>(undefined)
  const reap = hold<NativeDockProtocol.Exit>({ code: 0 })
  const transport = launch(server.endpoint, { start: () => starting.promise, stop: () => reap.promise })
  await until(() => transport.state.starts === 1)
  const finished = { value: false }
  const stopping = transport.channel.terminate()
  stopping.then(() => { finished.value = true })
  expect(transport.channel.terminate()).toBe(stopping)
  await Bun.sleep(15)
  expect(transport.state.stops).toBe(0)
  expect(finished.value).toBe(false)
  if (kind === "resolve") starting.resolve()
  if (kind === "reject") starting.reject(new Error("private start failure"))
  await until(() => transport.state.stops === 1)
  expect(finished.value).toBe(false)
  expect(transport.state.events).toEqual(kind === "resolve" ? ["start", "started", "stop"] : ["start", "stop"])
  reap.resolve({ code: 137, reason: "helper-resource-exit" })
  await stopping
  expect(finished.value).toBe(true)
  expect(transport.state.stops).toBe(1)
})

test.each(["throw", "reject"])("start %s triggers one sanitized teardown", async (kind) => {
  const server = await peer()
  const transport = launch(server.endpoint, { start: () => {
    if (kind === "throw") throw new Error("private start failure")
    return Promise.reject(new Error("private start failure"))
  } })
  await until(() => transport.state.stops === 1)
  await transport.channel.terminate()
  expect(await failure(transport.channel.write(Buffer.alloc(0)))).toMatchObject({
    code: "transport-error", message: "Native helper start failed",
  })
  expect(transport.state.starts).toBe(1)
  expect(server.state.connections).toBe(1)
})

test("EOF never acknowledges reaping before stop; exit preserves resource reason and isolates callbacks", async () => {
  const server = await peer()
  const reap = hold<NativeDockProtocol.Exit>({ code: 0 })
  const transport = launch(server.endpoint, { stop: () => reap.promise })
  transport.channel.onData(() => {})
  const exits: NativeDockProtocol.Exit[] = []
  transport.channel.onExit(() => { throw new Error("subscriber failure") })
  transport.channel.onExit(async () => { throw new Error("async subscriber failure") })
  transport.channel.onExit((exit) => { exits.push(exit) })
  transport.channel.onExit((exit) => { exits.push(exit) })()
  const attach = await server.attached
  await until(() => transport.state.starts === 1)
  attach.socket.end()
  await until(() => transport.state.stops === 1)
  const finished = { value: false }
  const stopping = transport.channel.terminate()
  stopping.then(() => { finished.value = true })
  await Bun.sleep(15)
  expect(exits).toEqual([])
  expect(finished.value).toBe(false)
  const actual: NativeDockProtocol.Exit = { code: 137, signal: "SIGKILL", reason: "helper-resource-exit" }
  reap.resolve(actual)
  await stopping
  expect(exits).toEqual([actual])
  const late: NativeDockProtocol.Exit[] = []
  transport.channel.onExit((exit) => { late.push(exit) })
  await transport.channel.terminate()
  expect(late).toEqual([actual])
  expect(exits).toEqual([actual])
  expect(transport.state.stops).toBe(1)
})

test.each(["throw", "reject"])("stop %s rejects shared termination without fake exit or retry", async (kind) => {
  const server = await peer()
  const transport = launch(server.endpoint, { stop: () => {
    if (kind === "throw") throw new Error("secret owner failure")
    return Promise.reject(new Error("secret owner failure"))
  } })
  const exits: NativeDockProtocol.Exit[] = []
  transport.channel.onExit((exit) => { exits.push(exit) })
  await until(() => transport.state.starts === 1)
  const stopping = transport.channel.terminate()
  expect(await failure(stopping)).toMatchObject({
    code: "helper-termination-failed", message: "Native helper cleanup failed", outcome: "unknown",
  })
  expect(transport.channel.terminate()).toBe(stopping)
  await failure(transport.channel.terminate())
  expect(exits).toEqual([])
  expect(transport.state.stops).toBe(1)
})

test("socket and subscriber failures retire once without leaking diagnostics", async () => {
  const server = await peer()
  const missing = launch(`${server.endpoint}-missing`)
  await until(() => missing.state.stops === 1)
  expect(await failure(missing.channel.write(Buffer.alloc(0)))).toMatchObject({ code: "transport-error", message: "Native attach socket failed" })
  expect(missing.state.starts).toBe(0)
  const transport = launch(server.endpoint)
  transport.channel.onData(async () => { throw new Error("private subscriber failure") })
  const attach = await server.attached
  await until(() => transport.state.starts === 1)
  attach.socket.write(mux(Buffer.from("data")))
  await until(() => transport.state.stops === 1)
  expect(await failure(transport.channel.write(Buffer.alloc(0)))).toMatchObject({ code: "transport-error", message: "Native attach delivery failed" })
})

test.each(["tcp://127.0.0.1:1", "http://localhost", "unix://foreign/tmp/s", "unix:///tmp/s?token=secret", "unix:///tmp/%00"])(
  "rejects nonlocal or malformed endpoint %s", async (endpoint) => {
    const transport = launch(endpoint)
    await until(() => transport.state.stops === 1)
    expect(await failure(transport.channel.write(Buffer.alloc(0)))).toMatchObject({
      code: "transport-error", message: "Native attach endpoint or identity is invalid",
    })
    expect(transport.state.starts).toBe(0)
  },
)

test("invalid container ID cannot inject request bytes", async () => {
  const server = await peer()
  const state = { stops: 0 }
  const channel = AppDockNativeChannel.create({ endpoint: server.endpoint, containerID: "name\r\nInjected: yes",
    start: async () => { throw new Error("must not start") }, stop: async () => { state.stops++; return { code: 0 } },
  })
  channels.push(channel)
  await until(() => state.stops === 1)
  expect(await failure(channel.write(Buffer.alloc(0)))).toMatchObject({ code: "transport-error" })
  expect(server.state.connections).toBe(0)
})

test("NativeClient 1s grace reports failure while channel still awaits actual reap", async () => {
  const server = await peer()
  const reap = hold<NativeDockProtocol.Exit>({ code: 0 })
  const transport = launch(server.endpoint, { stop: () => reap.promise })
  const client = NativeDockClient.create(transport.channel, { cancelGraceMs: 1000 })
  const attach = await server.attached
  await until(() => transport.state.starts === 1)
  attach.socket.write(mux(Buffer.from(JSON.stringify({ v: 1, id: "hello", ok: true, value: {
    backend: "linux-atspi", helperEpoch: "epoch", sessionID: "session", limits: NativeDockProtocol.limits,
    operations: ["bind", "read", "action", "type", "unbind", "cancel", "shutdown"],
  } }) + "\n")))
  const native = await client
  expect(native.hello.sessionID).toBe("session")
  attach.socket.end()
  await until(() => transport.state.stops === 1)
  const closed = native.close()
  expect(await failure(closed)).toMatchObject({ code: "helper-termination-timeout", outcome: "unknown" })
  expect(transport.state.events).toEqual(["start", "started", "stop"])
  reap.resolve({ code: 0, reason: "helper-exited" })
  await transport.channel.terminate()
  expect(await failure(native.close())).toMatchObject({ code: "helper-termination-timeout" })
})

test("5s startup deadline bounds silent attach and unresolved start", async () => {
  const silent = await peer(Buffer.alloc(0))
  const server = await peer()
  const starting = hold<void>(undefined)
  const attach = launch(silent.endpoint)
  const start = launch(server.endpoint, { start: () => starting.promise })
  await until(() => start.state.starts === 1)
  await until(() => attach.state.stops === 1, 6500)
  expect(await failure(attach.channel.write(Buffer.alloc(0)))).toMatchObject({ code: "startup-timeout" })
  expect(await failure(start.channel.write(Buffer.alloc(0)))).toMatchObject({ code: "startup-timeout" })
  expect(start.state.stops).toBe(0)
  starting.resolve()
  await start.channel.terminate()
  expect(start.state.stops).toBe(1)
}, 8000)

test("5s cleanup watchdog fails stuck start/stop; late settlement never rewrites failed termination", async () => {
  const server = await peer()
  const other = await peer()
  const starting = hold<void>(undefined)
  const reap = hold<NativeDockProtocol.Exit>({ code: 0 })
  const start = launch(server.endpoint, { start: () => starting.promise })
  const stop = launch(other.endpoint, { stop: () => reap.promise })
  const exits: NativeDockProtocol.Exit[] = []
  start.channel.onExit((exit) => { exits.push(exit) })
  stop.channel.onExit((exit) => { exits.push(exit) })
  await until(() => start.state.starts === 1 && stop.state.starts === 1)
  const first = start.channel.terminate()
  const second = stop.channel.terminate()
  const errors = await Promise.all([failure(first), failure(second)])
  expect(errors.map((error) => error.code)).toEqual(["helper-termination-timeout", "helper-termination-timeout"])
  expect(exits).toEqual([])
  expect(start.state.stops).toBe(0)
  expect(stop.state.stops).toBe(1)
  starting.resolve()
  reap.resolve({ code: 1, reason: "helper-exited" })
  await until(() => exits.length === 2)
  expect(start.channel.terminate()).toBe(first)
  expect(stop.channel.terminate()).toBe(second)
  expect(await failure(first)).toMatchObject({ code: "helper-termination-timeout" })
  expect(await failure(second)).toMatchObject({ code: "helper-termination-timeout" })
  expect(start.state.stops).toBe(1)
  expect(stop.state.stops).toBe(1)
}, 8000)
