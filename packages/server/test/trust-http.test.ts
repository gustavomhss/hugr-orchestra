import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { Global } from "@orchestra/core/global"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import type { LocationError, LocationServices } from "@orchestra/core/location-services"
import { Mcp } from "@orchestra/core/mcp"
import { AbsolutePath } from "@orchestra/core/schema"
import { TrustGroup } from "@orchestra/protocol/groups/trust"
import { Authorization } from "@orchestra/protocol/middleware/authorization"
import { SchemaErrorMiddleware } from "@orchestra/protocol/middleware/schema-error"
import { Context, Effect, Layer, LayerMap, Option } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { ServerAuth } from "../src/auth"
import { TrustHandler } from "../src/handlers/trust"
import { authorizationLayer } from "../src/middleware/authorization"
import { schemaErrorLayer } from "../src/middleware/schema-error"

const api = HttpApi.make("server").add(TrustGroup).middleware(Authorization).middleware(SchemaErrorMiddleware)
const auth = ServerAuth.headers({ username: "orchestra", password: "secret" })

// Serves the trust routes over real core services. Only the open-location map is a stand-in: its Mcp service records
// which open Locations re-apply trust.
type Locations = LayerMap.LayerMap<Location.Ref, LocationServices, LocationError>

function serve(input: { config: string; locations: Locations }) {
  return Effect.gen(function* () {
    const services = AppNodeBuilder.build(LayerNode.group([FSUtil.node, Global.node]), [
      [Global.node, Global.layerWith({ config: input.config })],
    ])
    const context = yield* Layer.build(services)
    const routes = HttpApiBuilder.layer(api).pipe(
      Layer.provide(TrustHandler),
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
    return { request }
  })
}

function scratch() {
  return Effect.acquireRelease(
    Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), "orchestra-server-trust-"))),
    (directory) => Effect.promise(() => fs.rm(directory, { recursive: true, force: true })),
  )
}

const listed = (request: (pathname: string) => Effect.Effect<Response>) =>
  request("/api/trust").pipe(Effect.flatMap((response) => Effect.promise(() => response.json())))

const open = (applied: string[]) =>
  LayerMap.make((ref: Location.Ref) =>
    Layer.succeed(Mcp.Service, {
      applyTrust: () => Effect.sync(() => void applied.push(ref.directory)),
    } as unknown as Mcp.Interface),
  )

describe("trust routes", () => {
  test("approves a project folder in the global config, re-applies trust to open locations, and lists it", () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const directory = yield* scratch()
          const project = yield* scratch()
          const applied: string[] = []
          const locations = yield* open(applied)
          // An open location: its scope stays alive until the test ends.
          yield* locations.contextEffect(Location.Ref.make({ directory: AbsolutePath.make(project) }))
          const server = yield* serve({ config: directory, locations: locations as unknown as Locations })

          expect(yield* listed(server.request)).toEqual([])

          const approved = yield* server.request("/api/trust/approve", {
            method: "POST",
            body: JSON.stringify({ directory: project }),
          })
          expect(approved.status).toBe(204)
          // Windows temp paths come back as either the 8.3 short or the long form depending on the resolver, so compare
          // what is stored by the folder it names, not by its spelling.
          const stored = JSON.parse(
            yield* Effect.promise(() => fs.readFile(path.join(directory, "orchestra.json"), "utf8")),
          ).trusted_projects
          expect(yield* Effect.promise(() => Promise.all(stored.map((item: string) => fs.realpath.native(item))))).toEqual([
            yield* Effect.promise(() => fs.realpath.native(project)),
          ])
          expect(applied).toEqual([project])

          expect(yield* listed(server.request)).toEqual(stored)
        }),
      ),
    ))

  test("refuses a folder that does not exist, and writes nothing", () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const directory = yield* scratch()
          const applied: string[] = []
          const locations = yield* open(applied)
          const server = yield* serve({ config: directory, locations: locations as unknown as Locations })

          const response = yield* server.request("/api/trust/approve", {
            method: "POST",
            body: JSON.stringify({ directory: path.join(directory, "missing") }),
          })
          expect(response.status).toBe(400)
          expect(yield* Effect.promise(() => fs.readdir(directory))).toEqual([])
          expect(applied).toEqual([])
        }),
      ),
    ))

  test("revoke removes the project and re-applies trust to open locations", () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const directory = yield* scratch()
          const project = yield* scratch()
          const applied: string[] = []
          const locations = yield* open(applied)
          // An open location: its scope stays alive until the test ends.
          yield* locations.contextEffect(Location.Ref.make({ directory: AbsolutePath.make(project) }))
          const server = yield* serve({ config: directory, locations: locations as unknown as Locations })
          yield* server.request("/api/trust/approve", { method: "POST", body: JSON.stringify({ directory: project }) })

          const revoked = yield* server.request("/api/trust/revoke", {
            method: "POST",
            body: JSON.stringify({ directory: project }),
          })
          expect(revoked.status).toBe(204)
          expect(yield* listed(server.request)).toEqual([])
          expect(applied).toEqual([project, project])
        }),
      ),
    ))
})
