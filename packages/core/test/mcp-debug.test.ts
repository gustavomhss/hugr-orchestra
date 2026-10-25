// Mcp.debug probes a remote server with an unauthenticated initialize request: it reports the HTTP answer and the
// server info, echoes WWW-Authenticate on a 401 and then tries the OAuth discovery, and refuses what has no sign-in
// to debug (a local server, an unknown name); OAuth explicitly disabled stops before any request.
import path from "path"
import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { LocationServiceMap } from "@orchestra/core/location-services"
import { Location } from "@orchestra/core/location"
import { Mcp } from "@orchestra/core/mcp"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionExecutionLocal } from "@orchestra/core/session/execution/local"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"
import { Database } from "../src/database/database"
import { EventV2 } from "../src/event"
import { ApplicationTools } from "../src/tool/application-tools"

const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([
      ApplicationTools.node,
      Database.node,
      EventV2.node,
      LocationServiceMap.node,
      SessionV2.node,
      SessionExecution.node,
    ]),
    [[SessionExecution.node, SessionExecutionLocal.node]],
  ),
)

describe("Mcp.debug", () => {
  it.live(
    "reports the answer of a remote server and refuses what cannot be debugged",
    () =>
      Effect.acquireRelease(
        Effect.promise(() => tmpdir()),
        (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()),
      ).pipe(
        Effect.flatMap((dir) =>
          Effect.gen(function* () {
            const open = Bun.serve({
              port: 0,
              fetch: () =>
                Response.json({ jsonrpc: "2.0", id: 1, result: { serverInfo: { name: "demo", version: "9" } } }),
            })
            const locked = Bun.serve({
              port: 0,
              fetch: () =>
                new Response("denied", { status: 401, headers: { "www-authenticate": 'Bearer realm="demo"' } }),
            })
            yield* Effect.addFinalizer(() =>
              Effect.sync(() => {
                open.stop(true)
                locked.stop(true)
              }),
            )
            yield* Effect.promise(() =>
              Bun.write(
                path.join(dir.path, "orchestra.json"),
                JSON.stringify({
                  mcp: {
                    open: { type: "remote", url: `http://127.0.0.1:${open.port}/mcp`, enabled: false },
                    locked: { type: "remote", url: `http://127.0.0.1:${locked.port}/mcp`, enabled: false },
                    plain: { type: "remote", url: `http://127.0.0.1:${open.port}/mcp`, enabled: false, oauth: false },
                    stdio: { type: "local", command: ["bun", "--version"], enabled: false },
                  },
                }),
              ),
            )
            yield* Effect.gen(function* () {
              const mcp = yield* Mcp.Service
              const answered = yield* mcp.debug("open")
              expect(answered.http?.status).toBe(200)
              expect(JSON.parse(answered.http?.serverInfo ?? "null")).toEqual({ name: "demo", version: "9" })
              expect(answered.flow).toBeUndefined()

              const denied = yield* mcp.debug("locked")
              expect(denied.http).toMatchObject({ status: 401, wwwAuthenticate: 'Bearer realm="demo"', body: "denied" })
              expect(denied.flow?.result).not.toBe("authenticated")

              expect(yield* mcp.debug("plain")).toEqual({
                name: "plain",
                url: `http://127.0.0.1:${open.port}/mcp`,
                oauth: false,
              })
              expect(yield* mcp.debug("stdio").pipe(Effect.flip)).toBeInstanceOf(Mcp.ConfigError)
              expect(yield* mcp.debug("missing").pipe(Effect.flip)).toBeInstanceOf(Mcp.NotFoundError)
            }).pipe(
              Effect.scoped,
              Effect.provide(LocationServiceMap.Service.get(Location.Ref.make({ directory: AbsolutePath.make(dir.path) }))),
            )
          }).pipe(Effect.scoped),
        ),
      ),
    30_000,
  )
})
