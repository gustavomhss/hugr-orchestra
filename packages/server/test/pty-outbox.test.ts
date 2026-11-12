import { expect, test } from "bun:test"
import { Pty } from "@orchestra/core/pty"
import { Effect, Fiber } from "effect"
import { Socket } from "effect/unstable/socket"
import { connectPty } from "../src/handlers/pty-outbox"

// Uses the production attach/queue/writer boundary, without a process or user connection.
function fixture(replay = "", blocked = false, readerCloses = false) {
  const state = { detached: 0, active: false, interrupted: 0, sent: [] as (string | Uint8Array | Socket.CloseEvent)[], input: undefined as Pty.AttachInput | undefined }
  const pty = {
    attach: (_id: Parameters<Pty.Interface["attach"]>[0], input: Pty.AttachInput) => Effect.sync(() => {
      state.input = input
      return {
        replay, cursor: replay.length, write: () => {},
        activate: () => { state.active = true }, detach: () => { state.detached++ },
      }
    }),
  }
  const socket = Socket.make({
    runRaw: (_handler, options) => Effect.andThen(options?.onOpen ?? Effect.void, readerCloses ? Effect.sleep("10 millis") : Effect.never),
    writer: Effect.succeed((frame) => {
      state.sent.push(frame)
      return blocked && !(frame instanceof Socket.CloseEvent)
        ? Effect.never.pipe(Effect.ensuring(Effect.sync(() => { state.interrupted++ })))
        : Effect.void
    }),
  })
  return { state, pty, socket }
}

for (const oversized of [false, true]) {
  test(`PTY detaches a blocked writer on ${oversized ? "one oversized frame" : "byte backlog overflow"}`, async () => {
    const f = fixture("", true)
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const fiber = yield* Effect.forkScoped(connectPty(f.pty, "pty_test" as Parameters<Pty.Interface["attach"]>[0], undefined, f.socket))
      yield* Effect.sleep("10 millis")
      expect(f.state.active).toBe(true)
      if (oversized) f.state.input!.onData("界".repeat(4 * 1024 * 1024))
      if (!oversized) for (let i = 0; i < 100; i++) f.state.input!.onData("界".repeat(64 * 1024))
      yield* Effect.sleep("30 millis")
      const detached = f.state.detached
      const close = f.state.sent.find((frame) => frame instanceof Socket.CloseEvent)
      yield* Fiber.interrupt(fiber)
      expect(detached).toBe(1)
      expect(close).toBeInstanceOf(Socket.CloseEvent)
      expect((close as Socket.CloseEvent).code).toBe(1013)
      expect((close as Socket.CloseEvent).reason).toContain("reconnect")
      expect(f.state.interrupted).toBe(1)
    })))
  })
}

test("PTY keeps replay, cursor, live output and end ordered, and detaches once", async () => {
  const f = fixture("replay界")
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const fiber = yield* Effect.forkScoped(connectPty(f.pty, "pty_test" as Parameters<Pty.Interface["attach"]>[0], 0, f.socket))
    yield* Effect.sleep("10 millis")
    f.state.input!.onData("live😀")
    f.state.input!.onEnd({ exitCode: 0 })
    yield* Fiber.join(fiber)
    expect(f.state.sent[0]).toBe("replay界")
    expect(new TextDecoder().decode(f.state.sent[1] as Uint8Array)).toBe('\0{"cursor":7}')
    expect(f.state.sent[2]).toBe("live😀")
    expect((f.state.sent[3] as Socket.CloseEvent).code).toBe(1000)
    expect(f.state.detached).toBe(1)
  })))
})

test("cancelling a blocked PTY writer releases its subscription and writer", async () => {
  const f = fixture("replay", true)
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const fiber = yield* Effect.forkScoped(connectPty(f.pty, "pty_test" as Parameters<Pty.Interface["attach"]>[0], undefined, f.socket))
    yield* Effect.sleep("10 millis")
    yield* Fiber.interrupt(fiber)
    expect(f.state.detached).toBe(1)
    expect(f.state.interrupted).toBe(1)
  })))
})

test("reconnect snapshot bytes count toward the same bounded backlog", async () => {
  const f = fixture("界".repeat(3 * 1024 * 1024), true)
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const fiber = yield* Effect.forkScoped(connectPty(f.pty, "pty_test" as Parameters<Pty.Interface["attach"]>[0], 0, f.socket))
    yield* Effect.sleep("30 millis")
    expect(f.state.detached).toBe(1)
    expect(f.state.sent.some((frame) => frame instanceof Socket.CloseEvent && frame.code === 1013)).toBe(true)
    yield* Fiber.interrupt(fiber)
  })))
})

test("remote close interrupts a blocked writer and detaches once", async () => {
  const f = fixture("replay", true, true)
  await Effect.runPromise(connectPty(f.pty, "pty_test" as Parameters<Pty.Interface["attach"]>[0], 0, f.socket))
  expect(f.state.detached).toBe(1)
  expect(f.state.interrupted).toBe(1)
})

test("real Node WebSocket slow reader bounds native buffers and terminates only its connection", async () => {
  const { NodeWS } = await import("@effect/platform-node/NodeSocket")
  const { connect } = await import("node:net")
  const server = new NodeWS.WebSocketServer({ port: 0, host: "127.0.0.1" })
  await new Promise<void>((resolve, reject) => server.once("listening", resolve).once("error", reject))
  const address = server.address()
  if (typeof address === "string" || !address) throw new Error("Expected TCP address")
  const connected = new Promise<InstanceType<typeof NodeWS.WebSocket>>((resolve) => server.once("connection", resolve))
  const client = connect(address.port, "127.0.0.1")
  await new Promise<void>((resolve, reject) => client.once("connect", resolve).once("error", reject))
  const handshake = new Promise<void>((resolve, reject) => client.once("data", () => resolve()).once("error", reject))
  client.write([
    "GET / HTTP/1.1", `Host: 127.0.0.1:${address.port}`, "Upgrade: websocket", "Connection: Upgrade",
    "Sec-WebSocket-Version: 13", "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==", "", "",
  ].join("\r\n"))
  await handshake
  const native = await connected
  client.pause()
  const f = fixture()
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const socket = yield* Socket.fromWebSocket(Effect.succeed(native as unknown as globalThis.WebSocket))
      const fiber = yield* Effect.forkScoped(connectPty(f.pty, "pty_test" as Parameters<Pty.Interface["attach"]>[0], 0, socket))
      yield* Effect.sleep("10 millis")
      let peak = 0
      // Yield between callbacks so send() reaches the actual native transport;
      // the paused peer eventually fills the kernel's finite send window.
      for (let i = 0; i < 2048 && !f.state.detached; i++) {
        f.state.input!.onData("界".repeat(64 * 1024))
        peak = Math.max(peak, native.bufferedAmount)
        yield* Effect.sleep("1 millis")
      }
      yield* Fiber.join(fiber).pipe(Effect.timeout("10 seconds"))
      expect(f.state.detached).toBe(1)
      expect(peak).toBeGreaterThan(0)
      expect(peak).toBeLessThan(8 * 1024 * 1024)
      expect(native.readyState).toBe(NodeWS.WebSocket.CLOSED)
      // The producer fixture has no termination hook: only attachment.detach
      // and native transport termination are involved.
    })))
  } finally {
    client.resume()
    client.destroy()
    native.terminate()
    // Bun's ws compatibility layer can omit the server-close callback even
    // after its client is CLOSED. Keep fixture teardown bounded, then verify
    // listener closure independently so the deadline cannot fake cleanup.
    await Promise.race([
      new Promise<void>((resolve) => server.close(() => resolve())),
      new Promise<void>((resolve) => setTimeout(resolve, 250)),
    ])
    expect(server.address()).toBeNull()
    expect(client.destroyed).toBe(true)
    expect(server.clients.size).toBe(0)
  }
}, 20000)
