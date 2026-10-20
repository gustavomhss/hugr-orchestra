import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { LSP } from "@orchestra/core/lsp"
import { AbsolutePath } from "@orchestra/core/schema"
import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import type { LocationError, LocationServices } from "@orchestra/core/location-services"
import { LspGroup } from "@orchestra/protocol/groups/lsp"
import { Authorization } from "@orchestra/protocol/middleware/authorization"
import { SchemaErrorMiddleware } from "@orchestra/protocol/middleware/schema-error"
import { Context, Effect, Layer, LayerMap, Option } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { LspHandler } from "../src/handlers/lsp"
import { LocationMiddleware, layer as locationLayer } from "../src/location"
import { authorizationLayer } from "../src/middleware/authorization"
import { schemaErrorLayer } from "../src/middleware/schema-error"
import { ServerAuth } from "../src/auth"

const api = HttpApi.make("server")
  .add(LspGroup.middleware(LocationMiddleware))
  .middleware(Authorization)
  .middleware(SchemaErrorMiddleware)
const auth = ServerAuth.headers({ username: "orchestra", password: "secret" })

type Locations = LayerMap.LayerMap<Location.Ref, LocationServices, LocationError>

function serve(input: { locations: Locations }) {
  return Effect.gen(function* () {
    const routes = HttpApiBuilder.layer(api).pipe(
      Layer.provide(LspHandler),
      Layer.provide(Layer.succeed(LocationServiceMap.Service, input.locations)),
      Layer.provide(locationLayer),
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

describe("lsp route", () => {
  test("returns 200", () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const locations = yield* LayerMap.make((ref: Location.Ref) =>
            Layer.succeed(LSP.Service, {
              status: () => Effect.succeed([]),
            } as unknown as LSP.Interface),
          )
          const server = yield* serve({ locations: locations as unknown as Locations })
          const response = yield* server.request("/api/lsp")
          expect(response.status).toBe(200)
        }),
      ),
    ))
})
