import { describe, expect } from "bun:test"
import { Cause, Deferred, Effect, Exit, Fiber, Option, Schema, Stream } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { LLM, LLMError, LLMEvent } from "../src"
import { OpenAIChat } from "../src/protocols"
import { Auth, Endpoint, Framing, LLMClient, Protocol, RequestExecutor, Route } from "../src/route"
import { testEffect } from "./lib/effect"
import { runtimeLayer } from "./lib/http"
import { deltaChunk, finishChunk } from "./lib/openai-chunks"

const it = testEffect(runtimeLayer(FetchHttpClient.layer))
const incomplete = [deltaChunk({ role: "assistant", content: "partial" })]
const complete = [...incomplete, finishChunk("stop")]
const sse = (values: readonly unknown[]) => values.map((value) => `data: ${JSON.stringify(value)}\n\n`).join("")
const response = (values: readonly unknown[]) =>
  new Response(sse(values), { headers: { "content-type": "text/event-stream" } })

const serve = (respond: (index: number) => Response | Promise<Response>) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const state = { requests: 0 }
      return Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => respond(++state.requests) })
    }),
    (server) => Effect.sync(() => server.stop(true)),
  )

function request(url: URL) {
  return LLM.request({
    model: OpenAIChat.route.with({ endpoint: { baseURL: url.toString() }, auth: Auth.none }).model({ id: "fixture" }),
    prompt: "Use the local fixture",
  })
}

function errorOf(exit: Exit.Exit<unknown, unknown>) {
  expect(Exit.isFailure(exit)).toBe(true)
  if (!Exit.isFailure(exit)) throw new Error("Expected provider stream failure")
  const failure = Option.getOrUndefined(Cause.findErrorOption(exit.cause))
  expect(failure).toBeInstanceOf(LLMError)
  if (!(failure instanceof LLMError)) throw new Error("Expected a typed LLMError")
  return failure
}

// A legitimate test protocol that emits finish during step, with no raw terminal predicate.
// This keeps reading transport bytes after normalized finish, unlike protocols that stop on a sentinel.
const immediate = Protocol.make({
  id: "terminal-fixture",
  body: { schema: Schema.Struct({}), from: () => Effect.succeed({}) },
  stream: {
    event: Protocol.jsonEvent(Schema.Struct({ type: Schema.String })),
    initial: () => 0,
    step: (state, event) =>
      Effect.succeed([
        state + 1,
        event.type === "finish"
          ? [LLMEvent.finish({ reason: "stop" })]
          : event.type === "provider-error"
            ? [LLMEvent.providerError({ message: "provider rejected" })]
            : [LLMEvent.textDelta({ id: "partial", text: "partial" })],
      ] as const),
  },
})

const immediateRequest = (url: URL) =>
  LLM.request({
    model: Route.make({
      id: "terminal-fixture",
      provider: "fixture",
      protocol: immediate,
      endpoint: Endpoint.path("/stream", { baseURL: url.toString() }),
      auth: Auth.none,
      framing: Framing.sse,
    }).model({ id: "fixture" }),
    prompt: "Use the local fixture",
  })

describe("normalized stream terminals", () => {
  it.live("rejects an HTTP 200 delta plus EOF without a normalized finish", () =>
    Effect.gen(function* () {
      const server = yield* serve(() => response(incomplete))
      const exit = yield* LLMClient.stream(request(server.url)).pipe(Stream.runCollect, Effect.exit)
      expect(errorOf(exit).reason).toMatchObject({
        _tag: "InvalidProviderOutput",
        message: "Provider stream ended without a terminal finish event",
      })
    }),
  )

  it.live("accepts native onHalt finish without requiring a raw universal sentinel", () =>
    Effect.gen(function* () {
      const server = yield* serve(() => response(complete))
      const events = yield* LLMClient.stream(request(server.url)).pipe(Stream.runCollect)
      expect(events.filter(LLMEvent.is.finish)).toHaveLength(1)
      expect(events.filter(LLMEvent.is.textDelta)).toMatchObject([{ text: "partial" }])
    }),
  )

  it.live("accepts provider-error as terminal and does not replace it with absent-finish", () =>
    Effect.gen(function* () {
      const server = yield* serve(() => response([{ type: "provider-error" }]))
      const events = yield* LLMClient.stream(immediateRequest(server.url)).pipe(Stream.runCollect)
      expect(events).toMatchObject([{ type: "provider-error", message: "provider rejected" }])
    }),
  )

  it.live("preserves pure caller interruption of an open HTTP body", () =>
    Effect.gen(function* () {
      const seen = yield* Deferred.make<void>()
      const server = yield* serve(
        () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new TextEncoder().encode(sse(incomplete)))
              },
            }),
            { headers: { "content-type": "text/event-stream" } },
          ),
      )
      const fiber = yield* LLMClient.stream(request(server.url)).pipe(
        Stream.tap(() => Deferred.succeed(seen, undefined)),
        Stream.runDrain,
        Effect.forkChild,
      )
      yield* Deferred.await(seen).pipe(Effect.timeout("5 seconds"))
      yield* Fiber.interrupt(fiber)
      const exit = fiber.pollUnsafe()
      expect(exit?._tag).toBe("Failure")
      if (exit?._tag === "Failure") expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true)
    }),
  )

  it.live("partial downstream take does not manufacture missing-finish EOF", () =>
    Effect.gen(function* () {
      const server = yield* serve(
        () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new TextEncoder().encode(sse(incomplete)))
              },
            }),
            { headers: { "content-type": "text/event-stream" } },
          ),
      )
      const events = yield* LLMClient.stream(request(server.url)).pipe(
        Stream.take(1),
        Stream.runCollect,
        Effect.timeout("5 seconds"),
      )
      expect(events).toHaveLength(1)
    }),
  )

  it.live("one streamPrepared value does not inherit finish from an earlier materialization", () =>
    Effect.gen(function* () {
      const server = yield* serve((index) => response(index === 1 ? complete : incomplete))
      const input = request(server.url)
      const route = input.model.route
      const prepared = yield* route.prepareTransport(yield* route.body.from(input), input)
      const http = yield* RequestExecutor.Service
      const stream = route.streamPrepared(prepared, input, { http })
      const first = yield* stream.pipe(Stream.runCollect)
      expect(first.filter(LLMEvent.is.finish)).toHaveLength(1)
      const second = yield* stream.pipe(Stream.runCollect, Effect.exit)
      expect(errorOf(second).reason.message).toContain("without a terminal finish")
    }),
  )

  it.live("concurrent materializations of one streamPrepared value isolate terminal observations", () =>
    Effect.gen(function* () {
      const finished = Promise.withResolvers<void>()
      const release = Promise.withResolvers<void>()
      const server = yield* serve((index) =>
        index === 1
          ? new Response(
              new ReadableStream({
                start(controller) {
                  controller.enqueue(new TextEncoder().encode(sse([{ type: "finish" }])))
                  void release.promise.then(() => controller.close())
                },
              }),
              { headers: { "content-type": "text/event-stream" } },
            )
          : finished.promise.then(() => response([{ type: "delta" }])),
      )
      const input = immediateRequest(server.url)
      const route = input.model.route
      const prepared = yield* route.prepareTransport(yield* route.body.from(input), input)
      const http = yield* RequestExecutor.Service
      const stream = route.streamPrepared(prepared, input, { http }).pipe(
        Stream.tap((event) =>
          Effect.sync(() => {
            if (LLMEvent.is.finish(event)) finished.resolve()
          }),
        ),
      )
      // A valid materialization remains open while the other observes EOF; no reset shared at EOF can hide a leak.
      const collect = stream.pipe(
        Stream.runCollect,
        Effect.exit,
        Effect.tap(() => Effect.sync(() => release.resolve())),
      )
      const exits = yield* Effect.all([collect, collect], { concurrency: 2 }).pipe(Effect.timeout("5 seconds"))
      expect(exits.filter(Exit.isSuccess)).toHaveLength(1)
      expect(exits.filter(Exit.isFailure)).toHaveLength(1)
      const failed = exits.find(Exit.isFailure)
      if (!failed) throw new Error("Expected only the truncated materialization to fail")
      expect(errorOf(failed).reason.message).toContain("without a terminal finish")
    }),
  )

  it.live("retains a transport failure occurring after normalized finish", () =>
    Effect.gen(function* () {
      const finished = Promise.withResolvers<void>()
      const sent = new WeakSet<object>()
      const server = yield* Effect.acquireRelease(
        Effect.sync(() =>
          Bun.listen({
            hostname: "127.0.0.1",
            port: 0,
            socket: {
              data(socket) {
                if (sent.has(socket)) return
                sent.add(socket)
                const body = sse([{ type: "finish" }])
                socket.write(
                  "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n",
                )
                socket.write(`${new TextEncoder().encode(body).length.toString(16)}\r\n${body}\r\n`)
                // The final HTTP chunk is deliberately absent. Only close after the client observed semantic finish.
                void finished.promise.then(() => socket.end())
              },
            },
          }),
        ),
        (server) => Effect.sync(() => server.stop(true)),
      )
      const events: LLMEvent[] = []
      const exit = yield* LLMClient.stream(immediateRequest(new URL(`http://127.0.0.1:${server.port}`))).pipe(
        Stream.tap((event) =>
          Effect.sync(() => {
            events.push(event)
            if (LLMEvent.is.finish(event)) finished.resolve()
          }),
        ),
        Stream.runDrain,
        Effect.exit,
        Effect.timeout("5 seconds"),
      )
      expect(events.filter(LLMEvent.is.finish)).toHaveLength(1)
      expect(errorOf(exit).reason.message).not.toContain("without a terminal finish")
      expect(errorOf(exit).reason.message).toContain("Failed to read")
    }),
  )
})
