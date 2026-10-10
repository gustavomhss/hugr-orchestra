export * as CapabilityConnectionsFixture from "./capability-connections-fixture"

import { CapabilityOperator } from "@orchestra/core/capability/operator/index"
import type { CapabilityOperatorContract } from "@orchestra/core/capability/operator/contract"
import { CapabilityConnectionTable, CapabilityTargetTable } from "@orchestra/core/capability/sql"
import { CredentialTable } from "@orchestra/core/credential/sql"
import { Database } from "@orchestra/core/database/database"
import { Node, makeGlobalNode } from "@orchestra/core/effect/app-node"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import { locationServices } from "@orchestra/core/location-services"
import { ProjectTable } from "@orchestra/core/project/sql"
import { SessionTable } from "@orchestra/core/session/sql"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { makeCapabilityConnectionsGroup } from "@orchestra/protocol/groups/capability-connections"
import { Capability } from "@orchestra/schema/capability"
import { Credential } from "@orchestra/schema/credential"
import { Integration } from "@orchestra/schema/integration"
import { AbsolutePath } from "@orchestra/schema/schema"
import { SessionID } from "@orchestra/schema/session-id"
import { Context, Effect, Layer, LayerMap, Option } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApi } from "effect/unstable/httpapi"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ServerAuth } from "../src/auth"
import { CapabilityConnectionsHandler } from "../src/handlers/capability-connections"
import { LocationMiddleware, layer } from "../src/location"
import { Authorization, authorizationLayer } from "../src/middleware/authorization"
import { capabilityAuthorizationLayer } from "../src/middleware/capability-authorization"
import { SchemaErrorMiddleware, schemaErrorLayer } from "../src/middleware/schema-error"
import { ServerOperator } from "../src/operator"

// Same group identity and real handler; unrelated aggregate groups await Lead registration.
const TestApi = HttpApi.make("server").add(makeCapabilityConnectionsGroup(LocationMiddleware))
  .middleware(Authorization).middleware(SchemaErrorMiddleware)
export const secret = "http-private-credential-endpoint-subject-resource"

export function make(options: { password?: string } = {}) {
  return Effect.gen(function* () {
    const directory = yield* Effect.promise(() => mkdtemp(join(tmpdir(), "capability-connections-")))
    yield* Effect.addFinalizer(() => Effect.promise(() => rm(directory, { recursive: true, force: true })))
    const storage = Database.layerFromPath(":memory:")
    const database = Context.get(yield* Layer.build(storage), Database.Service)
    const databaseNode = makeGlobalNode({ service: Database.Service,
      layer: Layer.succeed(Database.Service, database), deps: [] })
    // Hoist first, override Database while compiling. Replacing it during hoist currently
    // clones repeated global dependencies and raises conflicting Event implementations.
    const map = Layer.effect(LocationServiceMap.Service, LayerMap.make((ref: Location.Ref) => {
      const nodes = LayerNode.hoist(locationServices, Node.tags.values.global, [
        [ToolRegistry.node, ToolRegistry.nativeNode], [ToolRegistry.toolsNode, ToolRegistry.nativeToolsNode],
        [Location.node, Location.boundNode(ref)],
      ])
      return LayerNode.compile(nodes.node).pipe(Layer.fresh,
        Layer.provide(LayerNode.compile(nodes.hoisted, [[Database.node, databaseNode]])))
    }, { idleTimeToLive: "60 minutes" }))
    const context = yield* Layer.build(Layer.mergeAll(Layer.succeed(Database.Service, database), map,
      LayerNode.compile(EventV2.node, [[Database.node, databaseNode]])))
    const locations = Context.get(context, LocationServiceMap.Service)
    const resolve = (path: string) => Location.Service.pipe(Effect.provide(locations.get(
      Location.Ref.make({ directory: AbsolutePath.make(path) }),
    )), Effect.map((location) => ({ projectID: location.project.id,
      location: Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID }) })))
    const placement = yield* resolve(directory)
    yield* Effect.promise(() => mkdir(join(directory, "foreign")))
    const foreign = yield* resolve(join(directory, "foreign"))
    const operators = yield* CapabilityOperator.make({ principal: `http-${crypto.randomUUID()}`,
      scope: { placements: "instance", actions: ["*"] } })
    const credentialID = Credential.ID.create()
    const integrationID = Integration.ID.make("http-fixture")
    yield* database.db.insert(ProjectTable).values({ id: placement.projectID,
      worktree: placement.location.directory, sandboxes: [] }).onConflictDoNothing().run()
    yield* database.db.insert(CredentialTable).values({ id: credentialID, integration_id: integrationID,
      label: secret, value: { type: "key", key: secret } }).run()
    const connection = (owner = placement) => Effect.gen(function* () {
      const ref: Capability.ConnectionRef = { id: Capability.ConnectionID.create(), provider: "fixture", generation: 0 }
      yield* database.db.insert(CapabilityConnectionTable).values({ id: ref.id, provider: ref.provider,
        project_id: owner.projectID, directory: owner.location.directory, workspace_id: owner.location.workspaceID,
        integration_id: integrationID, credential_id: credentialID, endpoint: `https://invalid.example/${secret}`,
        subject_id: secret, scope_hash: "a".repeat(64), state: "active", generation: ref.generation }).run()
      return ref
    })
    const target = (parent: Capability.ConnectionRef) => Effect.gen(function* () {
      const ref: Capability.TargetRef = { id: Capability.TargetID.create(), connectionID: parent.id,
        environment: "test", generation: 0 }
      yield* database.db.insert(CapabilityTargetTable).values({ id: ref.id, connection_id: parent.id,
        environment: ref.environment, generation: ref.generation, resource: { secret } }).run()
      return ref
    })
    const parent = yield* connection()
    const child = yield* target(parent)
    const foreignParent = yield* connection(foreign)
    const sessionID = SessionID.create()
    yield* database.db.insert(SessionTable).values({ id: sessionID, project_id: placement.projectID,
      directory, slug: "http", title: "http", version: "test", agent: "persisted-http-actor" }).run()
    const entered = { location: 0 }
    const web = HttpRouter.toWebHandler(HttpApiBuilder.layer(TestApi).pipe(
      Layer.provide(CapabilityConnectionsHandler),
      Layer.provide(Layer.effect(LocationMiddleware, Effect.map(LocationMiddleware, (middleware) =>
        LocationMiddleware.of((effect, metadata) => Effect.sync(() => { entered.location++ })
          .pipe(Effect.andThen(middleware(effect, metadata)))))).pipe(Layer.provide(layer))),
      Layer.provide(authorizationLayer), Layer.provide(capabilityAuthorizationLayer), Layer.provide(schemaErrorLayer),
      Layer.provide(Layer.mergeAll(Layer.succeed(ServerOperator.Service, operators),
        ServerAuth.Config.configLayer({ username: "http-basic", password: Option.fromUndefinedOr(options.password) }),
        Layer.succeedContext(context))),
      Layer.provide(HttpServer.layerServices),
    ), { disableLogger: true })
    yield* Effect.addFinalizer(() => Effect.promise(() => web.dispose()))
    const issue = (scope?: CapabilityOperatorContract.GrantScope) => operators.issue({ origin: "sdk", scope }).pipe(
      Effect.map((issued) => `Bearer ${issued.bearer}`),
    )
    const request = (path: string, input: { auth?: string; key?: string; payload?: unknown; directory?: string; headers?: Record<string, string>;
      query?: Record<string, string> } = {}) => Effect.promise(() => {
      const url = new URL(path, "http://orchestra.local")
      url.searchParams.set("location[directory]", input.directory ?? directory)
      Object.entries(input.query ?? {}).forEach(([key, value]) => url.searchParams.set(key, value))
      return web.handler(new Request(url, { method: input.payload === undefined ? "GET" : "POST",
        headers: { ...input.headers, "content-type": "application/json", ...(input.auth ? { authorization: input.auth } : {}),
          ...(input.key ? { "idempotency-key": input.key } : {}) },
        body: input.payload === undefined ? undefined : JSON.stringify(input.payload) }))
    })
    return { database, operators, directory, placement, foreign, parent, child, foreignParent, sessionID,
      credentialID, entered, connection, target, issue, request, handler: web.handler }
  })
}
