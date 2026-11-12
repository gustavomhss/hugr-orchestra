// This child is isolated from the submit harness's module mocks. Its paths are supplied before Core imports run.
import { Database } from "@orchestra/core/database/database"
import { AgentV2 } from "@orchestra/core/agent"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { makeGlobalNode } from "@orchestra/core/effect/app-node"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { FSUtil } from "@orchestra/core/fs-util"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import { Location } from "@orchestra/core/location"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { AppProcess } from "@orchestra/core/process"
import { MoveSession } from "@orchestra/core/control-plane/move-session"
import { SessionV2 } from "@orchestra/core/session"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionProcess } from "@orchestra/core/session-process"
import { SessionSubagentModels } from "@orchestra/core/session/subagent-models"
import { SessionInputTable, SessionMessageTable } from "@orchestra/core/session/sql"
import { TaskBackground } from "@orchestra/core/tool/task-background"
import { AbsolutePath } from "@orchestra/schema/schema"
import { makeSessionGroup } from "@orchestra/protocol/groups/session"
import { SchemaErrorMiddleware } from "@orchestra/protocol/middleware/schema-error"
import { ServerAuth } from "@orchestra/server/auth"
import { SessionHandler } from "@orchestra/server/handlers/session"
import { authorizationLayer } from "@orchestra/server/middleware/authorization"
import { schemaErrorLayer } from "@orchestra/server/middleware/schema-error"
import { SessionLocationMiddleware, sessionLocationLayer } from "@orchestra/server/middleware/session-location"
import { eq } from "drizzle-orm"
import { Context, Effect, Layer, Option } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"

const directory = process.argv[2]
const filename = process.argv[3]
const ready = process.argv[4]
if (!directory || !filename || !ready) throw new Error("Missing private prompt fixture paths")
const stop = Promise.withResolvers<void>()
process.once("SIGTERM", stop.resolve)

await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
  const databaseContext = yield* Layer.build(Database.layerFromPath(filename))
  const database = Context.get(databaseContext, Database.Service)
  const databaseNode = makeGlobalNode({ service: Database.Service, layer: Layer.succeed(Database.Service, database), deps: [] })
  const context = yield* Layer.build(AppNodeBuilder.build(LayerNode.group([
    Database.node, LocationServiceMap.node, AppProcess.node, FSUtil.node, SessionV2.node,
    SessionExecution.node, SessionSubagentModels.node, SessionProcess.node, MoveSession.node, TaskBackground.node,
  ]), [[Database.node, databaseNode], [SessionExecution.node, SessionExecution.noopLayer]]))
  const sessions = Context.get(context, SessionV2.Service)
  // Recording-only execution leaves admission/SQL/HTTP real without invoking an LLM or claiming tool execution.
  const session = yield* sessions.create({
    location: Location.Ref.make({ directory: AbsolutePath.make(directory) }),
    agent: AgentV2.ID.make("backend"),
    model: ModelV2.Ref.make({ providerID: ProviderV2.ID.make("provider"), id: ModelV2.ID.make("model") }),
  })
  const routes = HttpApiBuilder.layer(HttpApi.make("server")
    .add(makeSessionGroup(SessionLocationMiddleware)).middleware(SchemaErrorMiddleware)).pipe(
      Layer.provide(SessionHandler), Layer.provide(sessionLocationLayer), Layer.provide(schemaErrorLayer),
      Layer.provide(authorizationLayer),
      Layer.provide(ServerAuth.Config.configLayer({ username: "orchestra", password: Option.none() })),
      Layer.provide(Layer.succeedContext(context)), Layer.provide(HttpServer.layerServices),
    )
  const web = HttpRouter.toWebHandler(routes, { disableLogger: true })
  yield* Effect.addFinalizer(() => Effect.promise(() => web.dispose()))
  const inspect = () => Effect.runPromise(Effect.gen(function* () {
    const inputs = yield* database.db.select().from(SessionInputTable).where(eq(SessionInputTable.session_id, session.id)).all()
    const events = yield* database.db.select().from(EventTable).where(eq(EventTable.aggregate_id, session.id)).all()
    const messages = yield* database.db.select().from(SessionMessageTable).where(eq(SessionMessageTable.session_id, session.id)).all()
    return { session: yield* sessions.get(session.id), inputs,
      admissions: events.filter((event) => event.type === EventV2.versionedType(SessionEvent.PromptAdmitted.type, 1)), messages }
  }))
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    const pathname = new URL(request.url).pathname
    if (pathname === "/__fixture/inspect") return Response.json(await inspect())
    if (pathname === "/__fixture/stop") { stop.resolve(); return Response.json({ ok: true }) }
    return web.handler(request)
  } })
  yield* Effect.addFinalizer(() => Effect.sync(() => server.stop(true)))
  yield* Effect.promise(() => Bun.write(ready, JSON.stringify({ url: server.url.origin, directory, sessionID: session.id })))
  yield* Effect.promise(() => stop.promise)
})))
