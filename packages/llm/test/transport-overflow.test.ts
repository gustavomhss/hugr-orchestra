import { describe, expect } from "bun:test"
import { Cause, Effect, Exit, Option, Stream } from "effect"
import { Headers } from "effect/unstable/http"
import { LLMError } from "../src"
import { WebSocketExecutor } from "../src/route"
import { it } from "./lib/effect"

const socketFixture = (count: number, closeAfterBurst = false) =>
  Effect.gen(function* () {
    const arrived = Promise.withResolvers<void>()
    const closed = Promise.withResolvers<number>()
    const state = { received: 0, sent: 0 }
    const server = yield* Effect.acquireRelease(
      Effect.sync(() =>
        Bun.serve({
          hostname: "127.0.0.1",
          port: 0,
          fetch(request, server) {
            if (server.upgrade(request)) return
            return new Response("WebSocket upgrade required", { status: 426 })
          },
          websocket: {
            message(socket) {
              Array.from({ length: count }, (_, index) =>
                JSON.stringify({ index, terminal: index === count - 1 }),
              ).forEach((frame) => {
                socket.send(frame)
                state.sent++
              })
              if (closeAfterBurst) socket.close(1000)
            },
            close(_, code) {
              closed.resolve(code)
            },
          },
        }),
      ),
      (server) => Effect.sync(() => server.stop(true)),
    )
    const url = new URL(server.url)
    url.protocol = "ws:"
    const raw = new WebSocket(url)
    yield* Effect.addFinalizer(() => Effect.sync(() => raw.close()))
    const connection = yield* Effect.acquireRelease(
      WebSocketExecutor.fromWebSocket(raw, { url: url.toString(), headers: Headers.empty }),
      (connection) => connection.close,
    )
    // This observer is installed after the production listener, so the barrier means the bounded queue saw all frames.
    raw.addEventListener("message", () => {
      state.received++
      if (state.received === Math.min(count, 129)) arrived.resolve()
    })
    yield* connection.sendText("burst")
    yield* Effect.promise(() => arrived.promise).pipe(Effect.timeout("5 seconds"))
    return { connection, state, closed }
  })

function overflowOf(exit: Exit.Exit<unknown, unknown>) {
  expect(Exit.isFailure(exit)).toBe(true)
  if (!Exit.isFailure(exit)) throw new Error("Dropped WebSocket frames must fail the consumer")
  const failure = Option.getOrUndefined(Cause.findErrorOption(exit.cause))
  expect(failure).toBeInstanceOf(LLMError)
  if (!(failure instanceof LLMError)) throw new Error("Expected overflow transport failure, not shutdown interruption")
  expect(failure.reason._tag).toBe("Transport")
  expect(failure.reason.message).toMatch(/overflow|buffer|queue|capacity/i)
  return failure
}

describe("bounded real WebSocket transport", () => {
  it.live("fails a 129-frame stopped-consumer burst instead of losing the final terminal frame", () =>
    Effect.gen(function* () {
      const fixture = yield* socketFixture(129)
      const delivered: Array<string | Uint8Array> = []
      const exit = yield* fixture.connection.messages.pipe(
        Stream.tap((frame) =>
          Effect.sync(() => {
            delivered.push(frame)
          }),
        ),
        Stream.runDrain,
        Effect.exit,
        Effect.timeout("5 seconds"),
      )
      overflowOf(exit)
      expect(fixture.state.sent).toBe(129)
      expect(fixture.state.received).toBe(129)
      expect(delivered.length).toBeLessThanOrEqual(128)
      expect(yield* Effect.promise(() => fixture.closed.promise).pipe(Effect.timeout("5 seconds"))).toBe(1011)
    }),
  )

  it.live("a subsequent normal socket close cannot erase the already observed overflow cause", () =>
    Effect.gen(function* () {
      const fixture = yield* socketFixture(129, true)
      const exit = yield* fixture.connection.messages.pipe(Stream.runCollect, Effect.exit, Effect.timeout("5 seconds"))
      overflowOf(exit)
      // The server initiated 1000 concurrently; the semantic failure must remain the overflow regardless of close race.
      expect(fixture.state.received).toBe(129)
    }),
  )

  it.live("preserves every frame and terminal marker for a stopped-consumer burst inside capacity", () =>
    Effect.gen(function* () {
      const fixture = yield* socketFixture(128, true)
      const frames = yield* fixture.connection.messages.pipe(Stream.runCollect, Effect.timeout("5 seconds"))
      expect(frames).toHaveLength(128)
      expect(frames.map((frame) => (typeof frame === "string" ? JSON.parse(frame).index : -1))).toEqual(
        Array.from({ length: 128 }, (_, index) => index),
      )
      expect(JSON.parse(String(frames.at(-1))).terminal).toBe(true)
      expect(yield* Effect.promise(() => fixture.closed.promise).pipe(Effect.timeout("5 seconds"))).toBe(1000)
    }),
  )
})
