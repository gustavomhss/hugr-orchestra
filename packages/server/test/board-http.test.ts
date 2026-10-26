import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { Board } from "@orchestra/core/board/board"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Global } from "@orchestra/core/global"
import { BoardGroup } from "@orchestra/protocol/groups/board"
import { Authorization } from "@orchestra/protocol/middleware/authorization"
import { SchemaErrorMiddleware } from "@orchestra/protocol/middleware/schema-error"
import { Context, Effect, Layer, Option } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { ServerAuth } from "../src/auth"
import { BoardHandler } from "../src/handlers/board"
import { authorizationLayer } from "../src/middleware/authorization"
import { schemaErrorLayer } from "../src/middleware/schema-error"

const api = HttpApi.make("server").add(BoardGroup).middleware(Authorization).middleware(SchemaErrorMiddleware)
const auth = ServerAuth.headers({ username: "orchestra", password: "secret" })

describe("board routes", () => {
  test("reads the board Maestro planned and takes owner writes with 404 and 409 for refusals", () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const directory = yield* Effect.acquireRelease(
            Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), "orchestra-server-board-"))),
            (directory) => Effect.promise(() => fs.rm(directory, { recursive: true, force: true })),
          )
          const context = yield* Layer.build(
            AppNodeBuilder.build(LayerNode.group([Board.node]), [
              [Database.node, Database.layerFromPath(":memory:")],
              [Global.node, Global.layerWith({ config: directory })],
            ]),
          )
          const routes = HttpApiBuilder.layer(api).pipe(
            Layer.provide(BoardHandler),
            Layer.provide(Layer.succeedContext(context)),
            Layer.provide(authorizationLayer),
            Layer.provide(schemaErrorLayer),
            Layer.provide(ServerAuth.Config.configLayer({ username: "orchestra", password: Option.some("secret") })),
            Layer.provide(HttpServer.layerServices),
          )
          const web = yield* Effect.acquireRelease(
            Effect.sync(() => HttpRouter.toWebHandler(routes, { disableLogger: true })),
            (web) => Effect.promise(() => web.dispose()),
          )
          const request = (pathname: string, init: RequestInit = {}) =>
            Effect.promise(async () => {
              const response = await web.handler(
                new Request(new URL(pathname, "http://orchestra.test"), {
                  ...init,
                  headers: { ...auth, "content-type": "application/json" },
                }),
              )
              return { status: response.status, body: await response.json().catch(() => null) }
            })

          const board = Context.get(context, Board.Service)
          yield* board.project({ key: "WEB", name: "Web", reason: "Start." })
          yield* board.issue({ project: "WEB", title: "Serve it", reason: "Plan." })

          expect(yield* request("/api/board")).toMatchObject({
            status: 200,
            body: [{ project: { key: "WEB" }, stages: { backlog: 1 }, health: "on_track" }],
          })
          expect(yield* request("/api/board/WEB")).toMatchObject({
            status: 200,
            body: { project: { key: "WEB" }, issues: [{ ref: "WEB-1", title: "Serve it" }] },
          })
          expect((yield* request("/api/board/NOPE")).status).toBe(404)

          const note = yield* request("/api/board/WEB/issue/1/note", {
            method: "POST",
            body: JSON.stringify({ body: "Keep it simple." }),
          })
          expect(note.status).toBe(200)
          const page = yield* request("/api/board/WEB/issue/1")
          expect(page).toMatchObject({ status: 200, body: { notes: [{ author: "owner", body: "Keep it simple." }] } })
          expect(page.body.trail).toEqual({ state: "none", branch: null })
          expect((yield* request("/api/board/WEB/activity")).body.at(-1)).toMatchObject({
            id: note.body.activity,
            actor: "owner",
            action: "note.add",
          })

          expect((yield* request("/api/board/WEB/pause", { method: "POST", body: JSON.stringify({}) })).status).toBe(200)
          expect(yield* request("/api/board/WEB/pause", { method: "POST", body: JSON.stringify({}) })).toMatchObject({
            status: 409,
            body: { message: "WEB is already paused." },
          })
        }),
      ),
    ))
})
