import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { AgentV2 } from "@orchestra/core/agent"
import { Catalog } from "@orchestra/core/catalog"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { FSUtil } from "@orchestra/core/fs-util"
import { GitCli } from "@orchestra/core/git-cli"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import type { LocationError, LocationServices } from "@orchestra/core/location-services"
import { ProjectV2 } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { ConfigGroup } from "@orchestra/protocol/groups/config"
import { ProjectGroup } from "@orchestra/protocol/groups/project"
import { Authorization } from "@orchestra/protocol/middleware/authorization"
import { SchemaErrorMiddleware } from "@orchestra/protocol/middleware/schema-error"
import { Context, Effect, Layer, LayerMap, Option } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { ServerAuth } from "../src/auth"
import { ConfigHandler } from "../src/handlers/config"
import { ProjectHandler } from "../src/handlers/project"
import { authorizationLayer } from "../src/middleware/authorization"
import { schemaErrorLayer } from "../src/middleware/schema-error"

const api = HttpApi.make("server")
  .add(ProjectGroup, ConfigGroup)
  .middleware(Authorization)
  .middleware(SchemaErrorMiddleware)
const auth = ServerAuth.headers({ username: "orchestra", password: "secret" })

// Serves the project and config routes over real core services; only the open-location map is a stand-in, so
// the test can observe which locations reload.
type Locations = LayerMap.LayerMap<Location.Ref, LocationServices, LocationError>

function serve(input: { config: string; locations: Locations }) {
  return Effect.gen(function* () {
    const services = AppNodeBuilder.build(
      LayerNode.group([ProjectV2.node, FSUtil.node, Global.node, Database.node, EventV2.node, GitCli.node]),
      [
        [Database.node, Database.layerFromPath(":memory:")],
        [Global.node, Global.layerWith({ config: input.config })],
      ],
    )
    const context = yield* Layer.build(services)
    const routes = HttpApiBuilder.layer(api).pipe(
      Layer.provide(Layer.mergeAll(ProjectHandler, ConfigHandler)),
      Layer.provide(Layer.succeedContext(context)),
      Layer.provide(Layer.succeed(LocationServiceMap.Service, input.locations)),
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
      Effect.promise(() =>
        web.handler(
          new Request(new URL(pathname, "http://orchestra.test"), {
            ...init,
            headers: { ...auth, "content-type": "application/json" },
          }),
        ),
      )
    return { request, database: Context.get(context, Database.Service).db }
  })
}

function scratch() {
  return Effect.acquireRelease(
    Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), "orchestra-server-config-"))),
    (directory) => Effect.promise(() => fs.rm(directory, { recursive: true, force: true })),
  )
}

const closed = (reloads: string[]) =>
  LayerMap.make((ref: Location.Ref) =>
    Layer.mergeAll(
      Layer.succeed(AgentV2.Service, {
        reload: () => Effect.sync(() => void reloads.push(`agent:${ref.directory}`)),
      } as unknown as AgentV2.Interface),
      Layer.succeed(Catalog.Service, {
        reload: () => Effect.sync(() => void reloads.push(`catalog:${ref.directory}`)),
      } as unknown as Catalog.Interface),
    ),
  )

describe("project and config routes", () => {
  test("lists stored projects", () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const directory = yield* scratch()
          const locations = yield* closed([])
          const server = yield* serve({
            config: directory,
            locations: locations as unknown as Locations,
          })
          yield* server.database
            .insert(ProjectTable)
            .values({ id: ProjectV2.ID.make("prj_one"), worktree: AbsolutePath.make("/repo"), vcs: "git", sandboxes: [] })
            .run()
            .pipe(Effect.orDie)

          const response = yield* server.request("/api/project")
          expect(response.status).toBe(200)
          expect(yield* Effect.promise(() => response.json())).toMatchObject([
            { id: "prj_one", worktree: "/repo", vcs: "git", sandboxes: [] },
          ])
        }),
      ),
    ))

  test("writes global settings and reloads every open location", () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const directory = yield* scratch()
          const reloads: string[] = []
          const locations = yield* closed(reloads)
          // An open location: its scope stays alive until the test ends.
          yield* locations.contextEffect(Location.Ref.make({ directory: AbsolutePath.make("/repo") }))
          const server = yield* serve({
            config: directory,
            locations: locations as unknown as Locations,
          })

          const response = yield* server.request("/api/config", {
            method: "PATCH",
            body: JSON.stringify({
              model: "anthropic/claude-opus",
              agents: { maestro: { engine: "claude-code" } },
            }),
          })

          expect(response.status).toBe(204)
          expect(JSON.parse(yield* Effect.promise(() => fs.readFile(path.join(directory, "orchestra.json"), "utf8")))).toEqual({
            model: "anthropic/claude-opus",
            agents: { maestro: { engine: "claude-code" } },
          })
          expect(reloads).toEqual(["agent:/repo", "catalog:/repo"])
        }),
      ),
    ))

  test("stores disabled providers as provider.use denials and reads them back", () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const directory = yield* scratch()
          const locations = yield* closed([])
          const server = yield* serve({
            config: directory,
            locations: locations as unknown as Locations,
          })

          const response = yield* server.request("/api/config", {
            method: "PATCH",
            body: JSON.stringify({ disabledProviders: ["openai"] }),
          })
          expect(response.status).toBe(204)
          expect(JSON.parse(yield* Effect.promise(() => fs.readFile(path.join(directory, "orchestra.json"), "utf8")))).toEqual({
            experimental: { policies: [{ action: "provider.use", effect: "deny", resource: "openai" }] },
          })
          const read = yield* server.request("/api/config")
          expect(yield* Effect.promise(() => read.json())).toEqual({ disabledProviders: ["openai"] })
        }),
      ),
    ))

  test("lists a project's directories", () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const directory = yield* scratch()
          const locations = yield* closed([])
          const server = yield* serve({
            config: directory,
            locations: locations as unknown as Locations,
          })
          yield* server.database
            .insert(ProjectTable)
            .values({ id: ProjectV2.ID.make("prj_one"), worktree: AbsolutePath.make("/repo"), vcs: "git", sandboxes: [] })
            .run()
            .pipe(Effect.orDie)

          const response = yield* server.request("/api/project/prj_one/directories?location[directory]=/repo")
          expect(response.status).toBe(200)
          expect(yield* Effect.promise(() => response.json())).toEqual([])
        }),
      ),
    ))
})

