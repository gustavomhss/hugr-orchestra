import { expect } from "bun:test"
import fs from "fs/promises"
import { connect } from "node:net"
import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { Database } from "@orchestra/core/database/database"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { PtyEnvironment } from "@orchestra/core/host/pty-environment"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import { AppProcess } from "@orchestra/core/process"
import { FSUtil } from "@orchestra/core/fs-util"
import { ProjectV2 } from "@orchestra/core/project"
import { PtyTicket } from "@orchestra/core/pty/ticket"
import { SessionV2 } from "@orchestra/core/session"
import { SessionExecution } from "@orchestra/core/session/execution"
import { PtyGroup } from "@orchestra/protocol/groups/pty"
import { SchemaErrorMiddleware } from "@orchestra/protocol/middleware/schema-error"
import { Effect, Layer, Option } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { tmpdir } from "@orchestra/core/test/fixture/tmpdir"
import { testEffect } from "@orchestra/core/test/lib/effect"
import { ServerAuth } from "../src/auth"
import { PtyHandler } from "../src/handlers/pty"
import { LocationMiddleware, layer } from "../src/location"
import { authorizationLayer } from "../src/middleware/authorization"
import { schemaErrorLayer } from "../src/middleware/schema-error"

// A Location's task tool captures the process-global Session services, so the fixture exports them as the server does.
const services = AppNodeBuilder.build(
  LayerNode.group([
    Database.node,
    LocationServiceMap.node,
    AppProcess.node,
    FSUtil.node,
    ProjectV2.node,
    SessionV2.node,
    SessionExecution.node,
    PtyTicket.node,
    PtyEnvironment.node,
  ]),
  [[SessionExecution.node, SessionExecution.noopLayer]],
)
// Serve the actual PTY group and handler over TCP, with no password so only the origin check can refuse the upgrade.
const routes = HttpApiBuilder.layer(
  HttpApi.make("server").add(PtyGroup.middleware(LocationMiddleware)).middleware(SchemaErrorMiddleware),
).pipe(
  Layer.provide(PtyHandler),
  Layer.provide(layer),
  Layer.provide(schemaErrorLayer),
  Layer.provide(authorizationLayer),
  Layer.provide(ServerAuth.Config.configLayer({ username: "orchestra", password: Option.none() })),
)
const it = testEffect(
  HttpRouter.serve(routes, { disableListenLog: true, disableLogger: true }).pipe(
    Layer.provideMerge(NodeHttpServer.layerTest),
    Layer.provideMerge(NodeServices.layer),
    Layer.provideMerge(services),
  ),
)

// The upgrade is sent over a raw socket so the test controls the Origin header, which a browser sets and a fetch client may not.
const upgrade = (port: number, directory: string, origin: string | undefined) =>
  new Promise<string>((resolve) => {
    const socket = connect(port, "127.0.0.1")
    let received = ""
    socket.on("data", (data) => {
      received += data.toString()
      if (!received.includes("\r\n")) return
      socket.destroy()
      resolve(received.split("\r\n")[0])
    })
    socket.on("error", () => resolve(received))
    socket.on("close", () => resolve(received))
    socket.write(
      [
        `GET /api/pty/pty_missing/connect?location[directory]=${encodeURIComponent(directory)} HTTP/1.1`,
        "Host: 127.0.0.1",
        "Connection: Upgrade",
        "Upgrade: websocket",
        "Sec-WebSocket-Version: 13",
        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
        ...(origin ? [`Origin: ${origin}`] : []),
        "",
        "",
      ].join("\r\n"),
    )
  })

it.live("a PTY upgrade from a foreign origin is refused with 403 even without a ticket", () =>
  Effect.gen(function* () {
    const server = yield* HttpServer.HttpServer
    if (server.address._tag !== "TcpAddress") return yield* Effect.die("Expected a TCP address")
    const port = server.address.port
    const tmp = yield* Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    )
    const directory = yield* Effect.promise(() => fs.realpath(tmp.path))

    expect(yield* Effect.promise(() => upgrade(port, directory, "https://evil.example"))).toBe("HTTP/1.1 403 Forbidden")

    // Origins the apps send, and clients that send none, pass the check and reach the PTY lookup, which has no such PTY.
    for (const origin of ["oc://renderer", "http://localhost:5173", `http://127.0.0.1:${port}`, undefined]) {
      expect(yield* Effect.promise(() => upgrade(port, directory, origin))).toMatch(/^HTTP\/1\.1 404/)
    }
  }),
)
