import { expect } from "bun:test"
import { connect } from "node:net"
import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import {
  HttpClient,
  HttpClientRequest,
  HttpRouter,
  HttpServer,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http"
import { testEffect } from "@orchestra/core/test/lib/effect"
import { BodyLimit } from "../src/body-limit"

const MiB = 1024 * 1024

// Routes read their body the way the API does (`orDie`), behind the real middleware, on a real TCP server.
const read = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest
  return HttpServerResponse.text(String((yield* Effect.orDie(request.arrayBuffer)).byteLength))
})
const routes = Layer.mergeAll(
  HttpRouter.add("POST", "/api/other", read),
  HttpRouter.add("POST", "/api/session/ses_1/prompt", read),
  BodyLimit.layer,
)
const it = testEffect(
  HttpRouter.serve(routes, { disableListenLog: true, disableLogger: true }).pipe(
    Layer.provideMerge(NodeHttpServer.layerTest),
    Layer.provideMerge(NodeServices.layer),
  ),
)

const post = (route: string, size: number) =>
  HttpClientRequest.post(route).pipe(HttpClientRequest.bodyText("a".repeat(size)), HttpClient.execute)

// A raw socket declares or streams a body the HTTP client would not send, and stops reading as soon as the answer's
// headers arrive, so the server cutting the connection short cannot hide the status line.
const answer = (port: number, head: string, body?: () => AsyncIterable<string>) =>
  new Promise<string>((resolve) => {
    const socket = connect(port, "127.0.0.1")
    let received = ""
    socket.on("data", (data) => {
      received += data.toString()
      if (!received.includes("\r\n\r\n")) return
      socket.destroy()
      resolve(received)
    })
    socket.on("error", () => resolve(received))
    socket.on("close", () => resolve(received))
    socket.write(head)
    if (!body) return
    void (async () => {
      for await (const chunk of body()) {
        if (socket.destroyed) return
        await new Promise((written) => socket.write(chunk, written))
      }
    })()
  })

const port = Effect.gen(function* () {
  const server = yield* HttpServer.HttpServer
  if (server.address._tag !== "TcpAddress") return yield* Effect.die("Expected a TCP address")
  return server.address.port
})

const declared = (route: string, length: number) =>
  `POST ${route} HTTP/1.1\r\nHost: localhost\r\nContent-Length: ${length}\r\n\r\n`

it.live("a body inside the limit is read", () =>
  Effect.gen(function* () {
    const response = yield* post("/api/other", 1024)
    expect(response.status).toBe(200)
    expect(yield* response.text).toBe("1024")
  }),
)

it.live("a body declared over the default limit is refused with 413 before it is read", () =>
  Effect.gen(function* () {
    const target = yield* port
    const received = yield* Effect.promise(() => answer(target, declared("/api/other", BodyLimit.DEFAULT_LIMIT + 1)))
    expect(received).toMatch(/^HTTP\/1\.1 413/)
    expect(received).toContain("PayloadTooLargeError")
  }),
)

it.live("a body over the default limit but inside the upload limit is read on an upload route only", () =>
  Effect.gen(function* () {
    const size = BodyLimit.DEFAULT_LIMIT + MiB
    const upload = yield* post("/api/session/ses_1/prompt", size)
    expect(upload.status).toBe(200)
    expect(yield* upload.text).toBe(String(size))
  }),
)

it.live("a body declared over the upload limit is refused with 413 on an upload route", () =>
  Effect.gen(function* () {
    const target = yield* port
    const received = yield* Effect.promise(() =>
      answer(target, declared("/api/session/ses_1/prompt", BodyLimit.UPLOAD_LIMIT + 1)),
    )
    expect(received).toMatch(/^HTTP\/1\.1 413/)
  }),
)

it.live("a chunked body with no declared length is cut off at the limit with 413", () =>
  Effect.gen(function* () {
    const target = yield* port
    const chunk = "a".repeat(MiB)
    const received = yield* Effect.promise(() =>
      answer(
        target,
        "POST /api/other HTTP/1.1\r\nHost: localhost\r\nTransfer-Encoding: chunked\r\n\r\n",
        async function* () {
          for (let sent = 0; sent <= BodyLimit.DEFAULT_LIMIT; sent += MiB) yield `${MiB.toString(16)}\r\n${chunk}\r\n`
          yield "0\r\n\r\n"
        },
      ),
    )
    expect(received).toMatch(/^HTTP\/1\.1 413/)
  }),
)
