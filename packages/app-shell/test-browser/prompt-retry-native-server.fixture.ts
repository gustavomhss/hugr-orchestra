// This child is isolated from the submit harness's module mocks. Its paths are supplied before Core imports run.
import { Database } from "@orchestra/core/database/database"
import { AgentV2 } from "@orchestra/core/agent"
import { Catalog } from "@orchestra/core/catalog"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { makeGlobalNode, makeLocationNode } from "@orchestra/core/effect/app-node"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { FSUtil } from "@orchestra/core/fs-util"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import { locationServices } from "@orchestra/core/location-services"
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
import { ModelGroup } from "@orchestra/protocol/groups/model"
import { Authorization } from "@orchestra/protocol/middleware/authorization"
import { SchemaErrorMiddleware } from "@orchestra/protocol/middleware/schema-error"
import { ServerAuth } from "@orchestra/server/auth"
import { SessionHandler } from "@orchestra/server/handlers/session"
import { ModelHandler } from "@orchestra/server/handlers/model"
import { LocationMiddleware, layer } from "@orchestra/server/location"
import { authorizationLayer } from "@orchestra/server/middleware/authorization"
import { schemaErrorLayer } from "@orchestra/server/middleware/schema-error"
import { SessionLocationMiddleware, sessionLocationLayer } from "@orchestra/server/middleware/session-location"
import { eq } from "drizzle-orm"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"

const directory = process.argv[2]
const filename = process.argv[3]
const ready = process.argv[4]
if (!directory || !filename || !ready) throw new Error("Missing private prompt fixture paths")
const stop = Promise.withResolvers<void>()
const promptAck: { hold?: {
  claimed: boolean; expired: boolean;
  entered: ReturnType<typeof Promise.withResolvers<{ status: number; sessionID: string; messageID: string }>>;
  release: ReturnType<typeof Promise.withResolvers<void>>;
  timer?: ReturnType<typeof setTimeout>;
} } = {}
const releasePromptAck = () => {
  if (!promptAck.hold) return
  clearTimeout(promptAck.hold.timer)
  promptAck.hold.release.resolve()
}
process.once("SIGTERM", () => { releasePromptAck(); stop.resolve() })

// This seeds real Location state; ModelExecution.node remains the production node in locationServices.
const catalogSeed = makeLocationNode({
  name: "prompt-retry-model-catalog",
  layer: Layer.effectDiscard(Effect.gen(function* () {
    const agents = yield* AgentV2.Service
    yield* agents.transform((draft) => draft.update(AgentV2.ID.make("backend"), (agent) => {
      agent.engine = "orchestra"
      agent.mode = "all"
    }))
    const catalog = yield* Catalog.Service
    yield* catalog.transform((draft) => {
      draft.provider.update(ProviderV2.ID.make("provider"), (provider) => {
        provider.api = { type: "native", url: "http://127.0.0.1:1", settings: {} }
      })
      draft.model.update(ProviderV2.ID.make("provider"), ModelV2.ID.make("model"), (model) => {
        model.enabled = true
      })
      draft.model.update(ProviderV2.ID.make("provider"), ModelV2.ID.make("model-next"), (model) => {
        model.enabled = true
        model.variants = [{ id: ModelV2.VariantID.make("default") }]
      })
    })
  })),
  deps: [locationServices],
})

await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
  const databaseContext = yield* Layer.build(Database.layerFromPath(filename))
  const database = Context.get(databaseContext, Database.Service)
  const databaseNode = makeGlobalNode({ service: Database.Service, layer: Layer.succeed(Database.Service, database), deps: [] })
  const context = yield* Layer.build(AppNodeBuilder.build(LayerNode.group([
    Database.node, LocationServiceMap.node, AppProcess.node, FSUtil.node, SessionV2.node,
    SessionExecution.node, SessionSubagentModels.node, SessionProcess.node, MoveSession.node, TaskBackground.node,
  ]), [[Database.node, databaseNode], [SessionExecution.node, SessionExecution.noopLayer]], [catalogSeed]))
  const sessions = Context.get(context, SessionV2.Service)
  // Recording-only execution leaves admission/SQL/HTTP real without invoking an LLM or claiming tool execution.
  const session = yield* sessions.create({
    location: Location.Ref.make({ directory: AbsolutePath.make(directory) }),
    agent: AgentV2.ID.make("backend"),
    model: ModelV2.Ref.make({ providerID: ProviderV2.ID.make("provider"), id: ModelV2.ID.make("model") }),
  })
  const routes = HttpApiBuilder.layer(HttpApi.make("server")
    .add(makeSessionGroup(SessionLocationMiddleware))
    .add(ModelGroup.middleware(LocationMiddleware).middleware(Authorization))
    .middleware(SchemaErrorMiddleware)).pipe(
      Layer.provide(SessionHandler), Layer.provide(ModelHandler), Layer.provide(layer),
      Layer.provide(sessionLocationLayer), Layer.provide(schemaErrorLayer),
      Layer.provide(authorizationLayer),
      Layer.provide(ServerAuth.Config.configLayer({ username: "orchestra", password: Option.none() })),
      Layer.provide(Layer.succeedContext(context)), Layer.provide(HttpServer.layerServices),
    )
  const web = HttpRouter.toWebHandler(routes, { disableLogger: true })
  yield* Effect.addFinalizer(() => Effect.promise(() => web.dispose()))
  const inspect = (sessionID = session.id) => Effect.runPromise(Effect.gen(function* () {
    const inputs = yield* database.db.select().from(SessionInputTable).where(eq(SessionInputTable.session_id, sessionID)).all()
    const events = yield* database.db.select().from(EventTable).where(eq(EventTable.aggregate_id, sessionID)).all()
    const messages = yield* database.db.select().from(SessionMessageTable).where(eq(SessionMessageTable.session_id, sessionID)).all()
    return { session: yield* sessions.get(sessionID), inputs,
      admissions: events.filter((event) => event.type === EventV2.versionedType(SessionEvent.PromptAdmitted.type, 1)), messages }
  }))
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    const url = new URL(request.url)
    const pathname = url.pathname
    if (pathname === "/__fixture/inspect") {
      const selected = url.searchParams.get("sessionID")
      const sessionID = selected === null ? Option.some(session.id) : Schema.decodeUnknownOption(SessionV2.ID)(selected)
      if (Option.isNone(sessionID)) return new Response("Invalid fixture Session ID", { status: 400 })
      return Response.json(await inspect(sessionID.value))
    }
    if (pathname === "/__fixture/prompt-ack/arm" && request.method === "POST") {
      if (promptAck.hold) return new Response("Fixture hold already armed", { status: 409 })
      const hold = { claimed: false, expired: false,
        entered: Promise.withResolvers<{ status: number; sessionID: string; messageID: string }>(),
        release: Promise.withResolvers<void>(), timer: undefined as ReturnType<typeof setTimeout> | undefined }
      // The route waiter observes this rejection; teardown before that waiter must not leak a rejection.
      void hold.entered.promise.catch(() => {})
      promptAck.hold = hold
      hold.timer = setTimeout(() => {
        hold.expired = true
        hold.entered.reject(new Error("Native fixture prompt ACK hold expired"))
        hold.release.resolve()
      }, 10_000)
      return Response.json({ ok: true })
    }
    if (pathname === "/__fixture/prompt-ack/entered") {
      if (!promptAck.hold) return new Response("Fixture hold not armed", { status: 409 })
      return Response.json(await promptAck.hold.entered.promise)
    }
    if (pathname === "/__fixture/prompt-ack/release" && request.method === "POST") {
      releasePromptAck()
      return Response.json({ ok: true })
    }
    if (pathname === "/__fixture/stop") { releasePromptAck(); stop.resolve(); return Response.json({ ok: true }) }
    const hold = promptAck.hold
    const target = /^\/api\/session\/([^/]+)\/prompt$/.exec(pathname)
    const sessionID = target ? Schema.decodeUnknownOption(SessionV2.ID)(target[1]) : Option.none()
    const claimed = request.method === "POST" && hold && !hold.claimed && Option.isSome(sessionID)
    if (claimed) hold.claimed = true
    const response = await web.handler(request)
    if (!claimed || !hold || Option.isNone(sessionID)) return response
    if (response.status !== 200) {
      hold.entered.reject(new Error(`Actual native prompt returned HTTP ${response.status} before held ACK`))
      releasePromptAck()
      return response
    }
    const rows = await inspect(sessionID.value)
    if (rows.inputs.length !== 1 || rows.admissions.length !== 1) {
      hold.entered.reject(new Error("Native fixture hold requires one actual SQL admission and event"))
      releasePromptAck()
      return response
    }
    hold.entered.resolve({ status: response.status, sessionID: sessionID.value, messageID: rows.inputs[0]!.id })
    // The generated-client fetch is still pending: Bun.serve has not returned the actual handler Response.
    await hold.release.promise
    if (hold.expired) throw new Error("Native fixture prompt ACK hold expired")
    return response
  } })
  yield* Effect.addFinalizer(() => Effect.sync(() => { releasePromptAck(); server.stop(true) }))
  yield* Effect.promise(() => Bun.write(ready, JSON.stringify({ url: server.url.origin, directory, sessionID: session.id })))
  yield* Effect.promise(() => stop.promise)
})))
