import { expect } from "bun:test"
import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { testEffect } from "@orchestra/core/test/lib/effect"
import { Cause, Context, Deferred, Effect, Exit, Layer } from "effect"
import { HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { Agent, createServer, IncomingMessage, request } from "node:http"
import { connect, type Socket } from "node:net"

const it = testEffect(NodeServices.layer)
const observed = (gate: Deferred.Deferred<void>, message: string) =>
  Deferred.await(gate).pipe(
    Effect.timeoutOrElse({ duration: "5 seconds", orElse: () => Effect.fail(new Error(message)) }),
  )
const plannedLayer = Effect.gen(function* () {
  if (
    !(yield* Effect.promise(() =>
      Bun.file(new URL("../src/middleware/node-request-cancellation.ts", import.meta.url)).exists(),
    ))
  )
    return Layer.empty
  const { layer } = yield* Effect.promise(() => import("../src/middleware/node-request-cancellation"))
  return layer
})
const plannedCreate = Effect.gen(function* () {
  if (!(yield* Effect.promise(() => Bun.file(new URL("../src/node-server.ts", import.meta.url)).exists())))
    return createServer
  const { ServerNode } = yield* Effect.promise(() => import("../src/node-server"))
  return ServerNode.create
})

const setup = (mode: "body" | "success" | "error" | "pending" | "already-aborted") =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>()
    const prepared = yield* Deferred.make<void>()
    const cleanupStarted = yield* Deferred.make<void>()
    const releaseCleanup = yield* Deferred.make<void>()
    const completed = yield* Deferred.make<void>()
    const state = { entries: 0, finalized: false }
    const records: {
      socket: Socket
      body: string
      complete: boolean
      socketDestroyed: boolean
      extraAbortedListeners: number
      extraCloseListeners: number
      failed: boolean
      interrupted: boolean
    }[] = []
    const router = yield* HttpRouter.make
    // This observer arranges real request state before the boundary and measures its listener lifetime.
    yield* router.addGlobalMiddleware((effect) =>
      Effect.gen(function* () {
        const incoming = yield* HttpServerRequest.HttpServerRequest
        if (!(incoming.source instanceof IncomingMessage)) return yield* Effect.die("Expected a real Node request")
        const source = incoming.source
        const socket = source.socket
        const body = mode === "body" ? yield* incoming.text.pipe(Effect.orDie) : ""
        if (mode === "already-aborted") {
          const closed = yield* Deferred.make<void>()
          socket.once("close", () => Deferred.doneUnsafe(closed, Effect.void))
          yield* Deferred.succeed(prepared, undefined)
          yield* Deferred.await(closed)
        }
        const beforeAborted = new Set(source.rawListeners("aborted"))
        const beforeClose = new Set(socket.rawListeners("close"))
        const complete = source.complete
        const socketDestroyed = socket.destroyed
        return yield* effect.pipe(
          Effect.onExit((exit) =>
            Effect.gen(function* () {
              records.push({
                socket,
                body,
                complete,
                socketDestroyed,
                extraAbortedListeners: source.rawListeners("aborted").filter((fn) => !beforeAborted.has(fn)).length,
                extraCloseListeners: socket.rawListeners("close").filter((fn) => !beforeClose.has(fn)).length,
                failed: Exit.isFailure(exit),
                interrupted: Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause),
              })
              yield* Deferred.succeed(completed, undefined)
            }),
          ),
        )
      }),
    )
    // Absent planned code means these tests exercise today's real router, not a missing-module failure.
    const cancellation = yield* plannedLayer
    yield* Layer.build(cancellation).pipe(Effect.provideService(HttpRouter.HttpRouter, router))
    yield* router.add(
      "POST",
      "/boundary",
      Effect.gen(function* () {
        state.entries++
        yield* Deferred.succeed(entered, undefined)
        if (mode === "error") return yield* Effect.die("Cancellation cleanup fixture failure")
        if (mode === "pending")
          return yield* Effect.never.pipe(
            Effect.onInterrupt(() =>
              Deferred.succeed(cleanupStarted, undefined).pipe(Effect.andThen(Deferred.await(releaseCleanup))),
            ),
            Effect.ensuring(Effect.sync(() => (state.finalized = true))),
          )
        return HttpServerResponse.text("ok")
      }),
    )
    const create = yield* plannedCreate
    const context = yield* Layer.build(NodeHttpServer.layer(create, { port: 0 }))
    const server = Context.get(context, HttpServer.HttpServer)
    if (server.address._tag !== "TcpAddress") return yield* Effect.die("Expected a real TCP server")
    yield* server.serve(router.asHttpEffect())
    // A failing assertion must still release the deliberate cleanup barrier before server teardown.
    yield* Effect.addFinalizer(() => Deferred.succeed(releaseCleanup, undefined))
    return {
      state,
      records,
      entered,
      prepared,
      cleanupStarted,
      releaseCleanup,
      completed,
      port: server.address.port,
      url: `http://127.0.0.1:${server.address.port}/boundary`,
    }
  })

const post = (url: string, body: string, agent: Agent) =>
  Effect.promise(
    () =>
      new Promise<{ status: number | undefined; body: string }>((resolve, reject) => {
        const outgoing = request(
          url,
          { method: "POST", agent, headers: { "content-length": String(Buffer.byteLength(body)) } },
          (response) => {
            const chunks: Buffer[] = []
            response.on("data", (chunk: Buffer) => chunks.push(chunk))
            response.once("error", reject)
            response.once("end", () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString() }))
          },
        )
        outgoing.once("error", reject)
        outgoing.end(body)
      }),
  )
const socketFor = (port: number) =>
  Effect.acquireRelease(
    Effect.promise(
      () =>
        new Promise<Socket>((resolve, reject) => {
          const socket = connect(port, "127.0.0.1")
          socket.once("connect", () => resolve(socket))
          socket.once("error", reject)
        }),
    ),
    (socket) => Effect.sync(() => socket.destroy()),
  )
const disconnect = (socket: Socket) =>
  Effect.promise(() => new Promise<void>((resolve) => socket.once("close", () => resolve()).destroy()))

it.live("CONTROL cancellation: a real Web Request passes through the same boundary", () =>
  Effect.gen(function* () {
    const cancellation = yield* plannedLayer
    const entries = { count: 0 }
    const app = Layer.merge(
      HttpRouter.add(
        "POST",
        "/boundary",
        Effect.sync(() => {
          entries.count++
          return HttpServerResponse.text("web-ok")
        }),
      ),
      cancellation,
    ).pipe(Layer.provide(HttpServer.layerServices))
    const handler = yield* Effect.acquireRelease(
      Effect.sync(() => HttpRouter.toWebHandler(app, { disableLogger: true })),
      (handler) => Effect.promise(() => handler.dispose()),
    )
    const response = yield* Effect.promise(() =>
      handler.handler(new Request("http://127.0.0.1/boundary", { method: "POST" })),
    )
    expect(response.status).toBe(200)
    expect(yield* Effect.promise(() => response.text())).toBe("web-ok")
    expect(entries.count).toBe(1)
  }),
)

it.live("CONTROL cancellation: fully consumed bodies keep one real socket usable for two sequential requests", () =>
  Effect.gen(function* () {
    const fixture = yield* setup("body")
    const agent = yield* Effect.acquireRelease(
      Effect.sync(() => new Agent({ keepAlive: true, maxSockets: 1 })),
      (agent) => Effect.sync(() => agent.destroy()),
    )
    expect(yield* post(fixture.url, "first", agent)).toEqual({ status: 200, body: "ok" })
    expect(yield* post(fixture.url, "second", agent)).toEqual({ status: 200, body: "ok" })
    expect(fixture.records.map((record) => record.body)).toEqual(["first", "second"])
    expect(fixture.records.map((record) => record.complete)).toEqual([true, true])
    expect(fixture.records.map((record) => record.socketDestroyed)).toEqual([false, false])
    expect(fixture.records[0].socket).toBe(fixture.records[1].socket)
    expect(fixture.state.entries).toBe(2)
    for (const record of fixture.records)
      expect(record).toMatchObject({ extraAbortedListeners: 0, extraCloseListeners: 0, failed: false })
  }),
)

for (const mode of ["success", "error"] as const) {
  it.live(`CONTROL cancellation: ${mode} removes request-aborted and socket-close listeners`, () =>
    Effect.gen(function* () {
      const fixture = yield* setup(mode)
      const response = yield* Effect.promise(() => fetch(fixture.url, { method: "POST" }))
      expect(response.status).toBe(mode === "success" ? 200 : 500)
      yield* Effect.promise(() => response.text())
      yield* observed(fixture.completed, "Request did not finish")
      expect(fixture.records).toHaveLength(1)
      expect(fixture.records[0]).toMatchObject({
        extraAbortedListeners: 0,
        extraCloseListeners: 0,
        failed: mode === "error",
        interrupted: false,
      })
    }),
  )
}

it.live("REGRESSION cancellation: peer disconnect waits for handler cleanup before cancellation completes", () =>
  Effect.gen(function* () {
    const fixture = yield* setup("pending")
    const socket = yield* socketFor(fixture.port)
    socket.write("POST /boundary HTTP/1.1\r\nHost: localhost\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
    yield* observed(fixture.entered, "Pending handler did not enter")
    yield* disconnect(socket)
    yield* observed(fixture.cleanupStarted, "Disconnect did not interrupt pending handler")
    expect(yield* Deferred.isDone(fixture.completed)).toBe(false)
    expect(fixture.state.finalized).toBe(false)
    yield* Deferred.succeed(fixture.releaseCleanup, undefined)
    yield* observed(fixture.completed, "Cancellation did not finish after handler cleanup")
    expect(fixture.state.finalized).toBe(true)
    expect(fixture.records).toHaveLength(1)
    expect(fixture.records[0]).toMatchObject({
      extraAbortedListeners: 0,
      extraCloseListeners: 0,
      failed: true,
      interrupted: true,
    })
  }),
)

it.live("REGRESSION cancellation: an already-aborted real request never enters the handler", () =>
  Effect.gen(function* () {
    const fixture = yield* setup("already-aborted")
    const socket = yield* socketFor(fixture.port)
    socket.write("POST /boundary HTTP/1.1\r\nHost: localhost\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
    yield* observed(fixture.prepared, "Request observer did not enter before boundary")
    yield* disconnect(socket)
    yield* observed(fixture.completed, "Already-aborted request did not settle")
    expect(fixture.state.entries).toBe(0)
    expect(fixture.records).toHaveLength(1)
    expect(fixture.records[0]).toMatchObject({
      extraAbortedListeners: 0,
      extraCloseListeners: 0,
      socketDestroyed: true,
      failed: true,
      interrupted: true,
    })
  }),
)
