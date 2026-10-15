import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { expect } from "bun:test"
import { Catalog } from "@orchestra/core/catalog"
import { Credential } from "@orchestra/core/credential"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Integration } from "@orchestra/core/integration"
import { Location } from "@orchestra/core/location"
import { Project } from "@orchestra/core/project"
import { AbsolutePath } from "@orchestra/core/schema"
import { ModelGroup } from "@orchestra/protocol/groups/model"
import { ServerAuth } from "@orchestra/server/auth"
import { ModelHandler } from "@orchestra/server/handlers/model"
import { LocationMiddleware, type LocationServices } from "@orchestra/server/location"
import { Authorization, authorizationLayer } from "@orchestra/server/middleware/authorization"
import { SchemaErrorMiddleware, schemaErrorLayer } from "@orchestra/server/middleware/schema-error"
import { Context, Effect, Layer, Option } from "effect"
import { HttpClient, HttpClientRequest, HttpRouter } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { testEffect } from "../lib/effect"

const directory = AbsolutePath.make("/empty-catalog")
const unexpectedIntegration = () =>
  Effect.die("The empty-catalog handler must not use integration connections or attempts")
const catalogLayer = AppNodeBuilder.build(LayerNode.group([Catalog.node, Location.node]), [
  [Location.node, Layer.succeed(Location.Service, { directory, project: { id: Project.ID.global, directory } })],
  // Isolate persistence and event I/O; the catalog selection and model handler are real.
  [Credential.node, Layer.mock(Credential.Service)({ all: () => Effect.succeed([]) })],
  [
    Integration.node,
    Layer.mock(Integration.Service)({
      list: () => Effect.succeed([]),
      connection: {
        active: unexpectedIntegration,
        resolve: unexpectedIntegration,
        key: unexpectedIntegration,
        oauth: unexpectedIntegration,
        update: unexpectedIntegration,
        remove: unexpectedIntegration,
      },
      attempt: { status: unexpectedIntegration, complete: unexpectedIntegration, cancel: unexpectedIntegration },
    }),
  ],
  [EventV2.node, Layer.mock(EventV2.Service)({})],
])
const api = HttpApi.make("server").add(
  ModelGroup.middleware(LocationMiddleware).middleware(Authorization).middleware(SchemaErrorMiddleware),
)
const middleware = Layer.effect(
  LocationMiddleware,
  Effect.gen(function* () {
    // This fixture mounts only ModelGroup; its real handlers use Catalog and Location.
    // The production middleware's environment also covers all the other API groups.
    const services = (yield* Effect.context<Catalog.Service | Location.Service>()) as Context.Context<LocationServices>
    return LocationMiddleware.of((effect) => Effect.provide(effect, services))
  }),
).pipe(Layer.provide(catalogLayer))
const it = testEffect(
  HttpRouter.serve(
    HttpApiBuilder.layer(api).pipe(
      Layer.provide(ModelHandler),
      Layer.provide(middleware),
      Layer.provide(schemaErrorLayer),
      Layer.provide(
        authorizationLayer.pipe(
          Layer.provide(ServerAuth.Config.configLayer({ username: "test", password: Option.none() })),
        ),
      ),
    ),
    { disableListenLog: true },
  ).pipe(Layer.provideMerge(NodeHttpServer.layerTest), Layer.provideMerge(NodeServices.layer)),
)

it.live("the actual default-model handler returns a required null in the empty-catalog envelope", () =>
  Effect.gen(function* () {
    const response = yield* HttpClient.execute(HttpClientRequest.get("/api/model/default"))
    expect(response.status).toBe(200)
    expect(yield* response.json).toEqual({
      location: { directory, project: { id: Project.ID.global, directory } },
      data: null,
    })
  }),
)
