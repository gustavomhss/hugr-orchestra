// Child-only bootstrap. Parent supplies isolated paths before any Core import evaluates.
import { CapabilityOperator } from "@orchestra/core/capability/operator/index"
import { CapabilityConnectionVerification } from "@orchestra/core/capability/connection/verify"
import { CapabilityBindingTable, CapabilityConnectionTable, CapabilityRequestTable, CapabilityTargetTable } from "@orchestra/core/capability/sql"
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
import { AbsolutePath } from "@orchestra/schema/schema"
import { SessionID } from "@orchestra/schema/session-id"
import { Cause, Context, Effect, Layer, LayerMap, Option } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { eq } from "drizzle-orm"
import { makeCapabilityConnectionsGroup } from "../../../protocol/src/groups/capability-connections"
import { ServerAuth } from "../../../server/src/auth"
import { CapabilityConnectionsHandler } from "../../../server/src/handlers/capability-connections"
import { ServerCapabilityVerification } from "../../../server/src/capability-verification"
import { LocationMiddleware, layer } from "../../../server/src/location"
import { Authorization, authorizationLayer } from "../../../server/src/middleware/authorization"
import { capabilityAuthorizationLayer } from "../../../server/src/middleware/capability-authorization"
import { SchemaErrorMiddleware, schemaErrorLayer } from "../../../server/src/middleware/schema-error"
import { ServerOperator } from "../../../server/src/operator"

const Api = HttpApi.make("server").add(makeCapabilityConnectionsGroup(LocationMiddleware))
  .middleware(Authorization).middleware(SchemaErrorMiddleware)
const stop = Promise.withResolvers<void>()
process.once("SIGTERM", stop.resolve)
const directory = process.env.ORCHESTRA_TEST_HOME!
const password = process.argv[2] === "basic" ? "native:password" : undefined

await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
  const vendor: { method: string; path: string; authorization: string | null }[] = []
  const readiness = { expired: false }
  const identity = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) {
    const path = new URL(request.url).pathname
    const authorization = request.headers.get("authorization")
    vendor.push({ method: request.method, path, authorization })
    if (readiness.expired || authorization?.includes("expired")) return Response.json({ ok: false, error: "token_expired", secret: authorization })
    if (authorization?.includes("malformed")) return Response.json({ ok: true, team_id: "bad", secret: authorization })
    if (path === "/api/auth.test") return Response.json({ ok: true, team_id: "TNATIVE", user_id: "UNATIVE", bot_id: "BNATIVE", ignored: "vendor-private" })
    if (path === "/api/v10/users/@me") return Response.json({ id: "123456789", bot: true, ignored: "vendor-private" })
    return new Response("Unexpected identity route", { status: 404 })
  } })
  yield* Effect.addFinalizer(() => Effect.sync(() => identity.stop(true)))
  const database = Context.get(yield* Layer.build(Database.layerFromPath(process.env.ORCHESTRA_DB!)), Database.Service)
  const databaseNode = makeGlobalNode({ service: Database.Service, layer: Layer.succeed(Database.Service, database), deps: [] })
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
  const location = yield* Location.Service.pipe(Effect.provide(locations.get(Location.Ref.make({ directory: AbsolutePath.make(directory) }))))
  yield* database.db.insert(ProjectTable).values({ id: location.project.id, worktree: location.directory, sandboxes: [] }).onConflictDoNothing().run()
  const sessionID = SessionID.create()
  yield* database.db.insert(SessionTable).values({ id: sessionID, project_id: location.project.id,
    directory: location.directory, slug: "native", title: "native", version: "test", agent: "native-actor" }).run()
  const operators = yield* CapabilityOperator.make({ principal: `native-${crypto.randomUUID()}`,
    scope: { placements: "instance", actions: ["*"] } })
  const issued = yield* operators.issue({ origin: "sdk" })
  const verifier = Layer.effect(ServerCapabilityVerification.Service,
    CapabilityConnectionVerification.make({ fixtureOrigin: identity.url.origin, timeoutMs: 2000 }))
  const web = HttpRouter.toWebHandler(HttpApiBuilder.layer(Api).pipe(
    Layer.provide(CapabilityConnectionsHandler), Layer.provide(verifier),
    Layer.provide(Layer.effect(LocationMiddleware, Effect.map(LocationMiddleware, (middleware) =>
      LocationMiddleware.of((effect, metadata) => middleware(effect, metadata).pipe(
        Effect.catchCause((cause) => Effect.sync(() => console.error(Cause.pretty(cause))).pipe(Effect.andThen(Effect.failCause(cause)))))))).pipe(Layer.provide(layer))),
    Layer.provide(authorizationLayer), Layer.provide(capabilityAuthorizationLayer), Layer.provide(schemaErrorLayer),
    Layer.provide(Layer.mergeAll(Layer.succeed(ServerOperator.Service, operators),
      ServerAuth.Config.configLayer({ username: "native", password: Option.fromUndefinedOr(password) }), Layer.succeedContext(context))),
    Layer.provide(HttpServer.layerServices),
  ), { disableLogger: true })
  yield* Effect.addFinalizer(() => Effect.promise(() => web.dispose()))
  const inspect = () => Effect.runPromise(Effect.gen(function* () {
    return {
      connections: yield* database.db.select().from(CapabilityConnectionTable).all(),
      credentials: yield* database.db.select().from(CredentialTable).all(),
      targets: yield* database.db.select().from(CapabilityTargetTable).all(),
      bindings: yield* database.db.select().from(CapabilityBindingTable).all(),
      receipts: yield* database.db.select().from(CapabilityRequestTable).all(), vendor,
    }
  }))
  // Control endpoints exist only on this private child; domain requests always traverse protected HttpApi.
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    const path = new URL(request.url).pathname
    if (path === "/__fixture/inspect") return Response.json(await inspect())
    if (path === "/__fixture/expire") { readiness.expired = true; return Response.json({ ok: true }) }
    if (path === "/__fixture/credential") {
      const credential = (await inspect()).credentials[0]
      if (!credential) throw new Error("Missing fixture credential")
      await Effect.runPromise(database.db.delete(CredentialTable).where(eq(CredentialTable.id, credential.id)).run())
      return Response.json({ ok: true })
    }
    if (path === "/__fixture/actor") {
      await Effect.runPromise(database.db.update(SessionTable).set({ agent: "changed-actor" }).where(eq(SessionTable.id, sessionID)).run())
      return Response.json({ ok: true })
    }
    return web.handler(request)
  } })
  yield* Effect.addFinalizer(() => Effect.sync(() => server.stop(true)))
  console.log(JSON.stringify({ url: server.url.origin, directory, sessionID, bearer: issued.bearer, password }))
  yield* Effect.promise(() => stop.promise)
})))
