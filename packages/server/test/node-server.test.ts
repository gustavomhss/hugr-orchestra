import { expect } from "bun:test"
import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { AppProcess } from "@orchestra/core/process"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { tmpdir } from "@orchestra/core/test/fixture/tmpdir"
import { testEffect } from "@orchestra/core/test/lib/effect"
import { Context, Deferred, Effect, Layer } from "effect"
import { HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { ChildProcess } from "effect/unstable/process"
import { Agent, createServer, IncomingMessage, request, ServerResponse } from "node:http"
import { connect, type Socket } from "node:net"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { layer } from "../src/middleware/node-request-cancellation"

const it = testEffect(Layer.mergeAll(NodeServices.layer, AppNodeBuilder.build(AppProcess.node)))
const factoryFile = new URL("../src/node-server.ts", import.meta.url)
const plannedCreate = Effect.gen(function* () {
  if (!(yield* Effect.promise(() => Bun.file(factoryFile).exists()))) return createServer
  const { ServerNode } = yield* Effect.promise(() => import("../src/node-server"))
  return ServerNode.create
})
const observed = (gate: Deferred.Deferred<void>, message: string) =>
  Deferred.await(gate).pipe(
    Effect.timeoutOrElse({ duration: "5 seconds", orElse: () => Effect.fail(new Error(message)) }),
  )
const listen = (handler: (source: IncomingMessage, response: ServerResponse) => void) =>
  Effect.gen(function* () {
    const create = yield* plannedCreate
    const server = yield* Effect.acquireRelease(
      Effect.sync(() => create()),
      (server) =>
        Effect.promise(
          () =>
            new Promise<void>((resolve) => {
              server.closeAllConnections()
              server.close(() => resolve())
            }),
        ),
    )
    server.on("request", handler)
    yield* Effect.promise(
      () =>
        new Promise<void>((resolve, reject) => {
          server.once("error", reject)
          server.listen({ port: 0, host: "127.0.0.1" }, () => resolve())
        }),
    )
    const address = server.address()
    if (!address || typeof address === "string") return yield* Effect.die("Expected real TCP server")
    return { server, port: address.port, url: `http://127.0.0.1:${address.port}` }
  })
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
  ).pipe(
    Effect.timeoutOrElse({
      duration: "5 seconds",
      orElse: () => Effect.fail(new Error("TCP connection did not open")),
    }),
  )
const disconnect = (socket: Socket) =>
  Effect.promise(() => new Promise<void>((resolve) => socket.once("close", () => resolve()).destroy()))
const turn = Effect.promise(() => new Promise<void>((resolve) => setImmediate(resolve)))
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
  ).pipe(
    Effect.timeoutOrElse({
      duration: "5 seconds",
      orElse: () => Effect.fail(new Error("POST response did not finish")),
    }),
  )

it.live("CONTROL factory: body EOF closes the request once while response remains pending", () =>
  Effect.gen(function* () {
    const closed = yield* Deferred.make<void>()
    const finished = yield* Deferred.make<void>()
    const errors: unknown[] = []
    const state: { closes: number; bodyEnded: boolean; responseFinished: boolean; response?: ServerResponse } = {
      closes: 0,
      bodyEnded: false,
      responseFinished: false,
    }
    const server = yield* listen((source, response) => {
      state.response = response
      source.on("data", () => {})
      source.once("end", () => (state.bodyEnded = true))
      source.on("error", (error) => errors.push(error))
      source.on("close", () => {
        state.closes++
        Deferred.doneUnsafe(closed, Effect.void)
      })
      response.once("finish", () => {
        state.responseFinished = true
        Deferred.doneUnsafe(finished, Effect.void)
      })
    })
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        if (state.response && !state.response.writableEnded) state.response.end("released")
      }),
    )
    const pending = fetch(server.url, { method: "POST", body: "complete-body" }).then(
      async (response) => ({ status: response.status, body: await response.text() }),
      (error: unknown) => ({ status: 0, body: String(error) }),
    )
    yield* observed(closed, "Normal completed request did not close before response finish")
    expect(state).toMatchObject({ closes: 1, bodyEnded: true, responseFinished: false })
    expect(errors).toEqual([])
    state.response?.end("ok")
    expect(yield* Effect.promise(() => pending)).toEqual({ status: 200, body: "ok" })
    yield* observed(finished, "Response did not finish")
    yield* turn
    expect(state.closes).toBe(1)
    expect(errors).toEqual([])
  }),
)

it.live("CONTROL factory: response finish before later body EOF still closes the request once", () =>
  Effect.gen(function* () {
    const closed = yield* Deferred.make<void>()
    const errors: unknown[] = []
    const order: string[] = []
    const state = { closes: 0 }
    const server = yield* listen((source, response) => {
      source.pause()
      source.once("end", () => order.push("body-end"))
      source.on("error", (error) => errors.push(error))
      source.on("close", () => {
        order.push("request-close")
        state.closes++
        Deferred.doneUnsafe(closed, Effect.void)
      })
      response.once("finish", () => {
        order.push("response-finish")
        source.on("data", () => {})
        source.resume()
      })
      response.end("early")
    })
    const response = yield* Effect.promise(() => fetch(server.url, { method: "POST", body: "read-after-finish" }))
    expect(response.status).toBe(200)
    expect(yield* Effect.promise(() => response.text())).toBe("early")
    yield* observed(closed, "Body did not finish after early response")
    yield* turn
    expect(order).toEqual(["response-finish", "body-end", "request-close"])
    expect(state.closes).toBe(1)
    expect(errors).toEqual([])
  }),
)

it.live("CONTROL factory: two complete POST bodies share one healthy keep-alive socket", () =>
  Effect.gen(function* () {
    const sockets: Socket[] = []
    const closes: number[] = []
    const errors: unknown[] = []
    const server = yield* listen((source, response) => {
      const index = sockets.length
      sockets.push(source.socket)
      closes.push(0)
      const chunks: Buffer[] = []
      source.on("data", (chunk: Buffer) => chunks.push(chunk))
      source.on("error", (error) => errors.push(error))
      source.on("close", () => closes[index]++)
      source.once("end", () => response.end(Buffer.concat(chunks)))
    })
    const agent = yield* Effect.acquireRelease(
      Effect.sync(() => new Agent({ keepAlive: true, maxSockets: 1 })),
      (agent) => Effect.sync(() => agent.destroy()),
    )
    expect(yield* post(server.url, "first", agent)).toEqual({ status: 200, body: "first" })
    expect(yield* post(server.url, "second", agent)).toEqual({ status: 200, body: "second" })
    yield* turn
    expect(sockets).toHaveLength(2)
    expect(sockets[0]).toBe(sockets[1])
    expect(sockets[0].destroyed).toBe(false)
    expect(closes).toEqual([1, 1])
    expect(errors).toEqual([])
  }),
)

it.live("CONTROL factory: incomplete body disconnect preserves native aborted and close events", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>()
    const closed = yield* Deferred.make<void>()
    const state = { aborted: 0, closes: 0, complete: false }
    const server = yield* listen((source, response) => {
      source.once("data", () => Deferred.doneUnsafe(started, Effect.void))
      source.once("aborted", () => state.aborted++)
      source.on("error", () => {})
      source.on("close", () => {
        state.closes++
        state.complete = source.complete
        Deferred.doneUnsafe(closed, Effect.void)
      })
      response.on("error", () => {})
    })
    const socket = yield* socketFor(server.port)
    socket.write("POST / HTTP/1.1\r\nHost: localhost\r\nContent-Length: 40\r\n\r\npartial")
    yield* observed(started, "Incomplete body did not begin")
    yield* disconnect(socket)
    yield* observed(closed, "Incomplete body did not close")
    expect(state).toEqual({ aborted: 1, closes: 1, complete: false })
  }),
)

it.live("CONTROL factory: an error at complete body EOF preserves the original error", () =>
  Effect.gen(function* () {
    const closed = yield* Deferred.make<void>()
    const failure = new Error("Factory complete-body failure fixture")
    const errors: unknown[] = []
    const state: { closes: number; completeAtError: boolean; endedAtError: boolean; response?: ServerResponse } = {
      closes: 0,
      completeAtError: false,
      endedAtError: false,
    }
    const server = yield* listen((source, response) => {
      state.response = response
      source.on("data", () => {})
      source.once("end", () => {
        state.completeAtError = source.complete
        state.endedAtError = source.readableEnded
        source.destroy(failure)
      })
      source.on("error", (error) => errors.push(error))
      source.on("close", () => {
        state.closes++
        response.end("error-observed")
        Deferred.doneUnsafe(closed, Effect.void)
      })
    })
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        if (state.response && !state.response.writableEnded) state.response.end("released")
      }),
    )
    const pending = fetch(server.url, { method: "POST", body: "complete-body" }).then(
      async (response) => ({ status: response.status, body: await response.text() }),
      (error: unknown) => ({ status: 0, body: String(error) }),
    )
    yield* observed(closed, "Errored completed body did not close")
    expect(yield* Effect.promise(() => pending)).toEqual({ status: 200, body: "error-observed" })
    yield* turn
    expect(state).toMatchObject({ closes: 1, completeAtError: true, endedAtError: true })
    expect(errors).toEqual([failure])
  }),
)

it.live("REGRESSION factory: completed JSON body remains cancellable while the response is pending", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>()
    const interrupted = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const router = yield* HttpRouter.make
    yield* Layer.build(layer).pipe(Effect.provideService(HttpRouter.HttpRouter, router))
    const payload = JSON.stringify({ value: "completed-body" })
    yield* router.add(
      "POST",
      "/pending",
      Effect.gen(function* () {
        const source = yield* HttpServerRequest.HttpServerRequest
        expect(yield* source.text.pipe(Effect.orDie)).toBe(payload)
        yield* Deferred.succeed(entered, undefined)
        return yield* Deferred.await(release).pipe(
          Effect.as(HttpServerResponse.text("released")),
          Effect.onInterrupt(() => Deferred.succeed(interrupted, undefined)),
        )
      }),
    )
    const create = yield* plannedCreate
    const context = yield* Layer.build(NodeHttpServer.layer(create, { port: 0 }))
    const server = Context.get(context, HttpServer.HttpServer)
    if (server.address._tag !== "TcpAddress") return yield* Effect.die("Expected real TCP server")
    yield* server.serve(router.asHttpEffect())
    yield* Effect.addFinalizer(() => Deferred.succeed(release, undefined))
    const socket = yield* socketFor(server.address.port)
    socket.write(
      `POST /pending HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(payload)}\r\nConnection: close\r\n\r\n${payload}`,
    )
    yield* observed(entered, "Completed JSON handler did not enter")
    yield* disconnect(socket)
    yield* observed(interrupted, "Completed-body peer disconnect did not interrupt handler")
  }),
)

it.live("CONTROL factory: the bundled real factory uses native IncomingMessage in an actual Node process", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const temporary = yield* Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    )
    const exists = yield* Effect.promise(() => Bun.file(factoryFile).exists())
    if (exists) {
      const built = yield* Effect.promise(() =>
        Bun.build({
          entrypoints: [fileURLToPath(factoryFile)],
          outdir: temporary.path,
          naming: "factory.mjs",
          format: "esm",
          target: "node",
        }),
      )
      expect(built.success).toBe(true)
    }
    yield* Effect.promise(() =>
      Bun.write(
        path.join(temporary.path, "native-node.mjs"),
        `import { createServer, IncomingMessage, get } from "node:http"
import { pathToFileURL } from "node:url"
const module = process.argv[2] ? await import(pathToFileURL(process.argv[2]).href) : undefined
const server = module ? module.ServerNode.create() : createServer()
const state = { native: false }
server.on("request", (request, response) => {
  state.native = request.constructor === IncomingMessage
  response.end("node-ok")
})
try {
  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen({ port: 0, host: "127.0.0.1" }, resolve)
  })
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Expected Node TCP address")
  const body = await new Promise((resolve, reject) => {
    get("http://127.0.0.1:" + address.port, response => {
      const chunks = []
      response.setEncoding("utf8")
      response.on("data", chunk => chunks.push(chunk))
      response.once("error", reject)
      response.once("end", () => resolve(chunks.join("")))
    }).once("error", reject)
  })
  if (!state.native || body !== "node-ok") throw new Error("Node fallback changed native request semantics")
  console.log("native Node IncomingMessage verified")
} finally {
  await new Promise(resolve => server.close(resolve))
}
`,
      ),
    )
    const processes = yield* AppProcess.Service
    const result = yield* processes.run(
      ChildProcess.make("node", [
        path.join(temporary.path, "native-node.mjs"),
        ...(exists ? [path.join(temporary.path, "factory.mjs")] : []),
      ]),
      { timeout: "20 seconds", maxOutputBytes: 65_536, maxErrorBytes: 65_536 },
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout.toString()).toContain("native Node IncomingMessage verified")
  }),
)
