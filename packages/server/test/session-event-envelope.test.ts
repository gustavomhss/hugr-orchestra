import { expect } from "bun:test"
import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { Orchestra } from "@orchestra/client"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { FSUtil } from "@orchestra/core/fs-util"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import { MoveSession } from "@orchestra/core/control-plane/move-session"
import { AppProcess } from "@orchestra/core/process"
import { SessionV2 } from "@orchestra/core/session"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionExecutionLocal } from "@orchestra/core/session/execution/local"
import { SessionInputTable } from "@orchestra/core/session/sql"
import { SessionSubagentModels } from "@orchestra/core/session/subagent-models"
import { SessionProcess } from "@orchestra/core/session-process"
import { TaskBackground } from "@orchestra/core/tool/task-background"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { tmpdir } from "@orchestra/core/test/fixture/tmpdir"
import { testEffect } from "@orchestra/core/test/lib/effect"
import { makeSessionGroup } from "@orchestra/protocol/groups/session"
import { SchemaErrorMiddleware } from "@orchestra/protocol/middleware/schema-error"
import { Session } from "@orchestra/schema/session"
import { SessionEvent } from "@orchestra/schema/session-event"
import { SessionMessage } from "@orchestra/schema/session-message"
import { and, eq } from "drizzle-orm"
import { Effect, Layer, Option, Schema, Stream } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse, HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { ChildProcess } from "effect/unstable/process"
import { ServerAuth } from "../src/auth"
import { BodyLimit } from "../src/body-limit"
import { SessionHandler } from "../src/handlers/session"
import { authorizationLayer } from "../src/middleware/authorization"
import { schemaErrorLayer } from "../src/middleware/schema-error"
import { SessionLocationMiddleware, sessionLocationLayer } from "../src/middleware/session-location"

const services = AppNodeBuilder.build(
  LayerNode.group([
    Database.node, LocationServiceMap.node, AppProcess.node, FSUtil.node, SessionV2.node,
    SessionExecution.node, SessionSubagentModels.node, SessionProcess.node, MoveSession.node, TaskBackground.node,
  ]),
  [
    [Database.node, Database.layerFromPath(":memory:")],
    [SessionExecution.node, SessionExecutionLocal.node],
  ],
)
// The real Protocol Session group, handler, body cap and authorization/placement middleware over TCP.
const routes = Layer.merge(
  HttpApiBuilder.layer(
    HttpApi.make("server").add(makeSessionGroup(SessionLocationMiddleware)).middleware(SchemaErrorMiddleware),
  ).pipe(
    Layer.provide(SessionHandler),
    Layer.provide(sessionLocationLayer),
    Layer.provide(schemaErrorLayer),
    Layer.provide(authorizationLayer),
    Layer.provide(ServerAuth.Config.configLayer({ username: "orchestra", password: Option.none() })),
  ),
  BodyLimit.layer,
)
const it = testEffect(
  HttpRouter.serve(routes, { disableListenLog: true, disableLogger: true }).pipe(
    Layer.provideMerge(NodeHttpServer.layerTest),
    Layer.provideMerge(NodeServices.layer),
    Layer.provideMerge(services),
  ),
)
const Info = Schema.Struct({ data: Session.Info })
const post = (pathname: string, body: unknown) =>
  HttpClientRequest.fromWeb(new Request(new URL(pathname, "http://localhost"), {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  })).pipe(HttpClientRequest.setUrl(pathname), HttpClient.execute)

for (const size of [64, 800 * 1024]) {
  for (const transport of ["effect", "promise"] as const) {
    it.live(`${transport} durable SSE delivers the admitted ${size}-byte inline attachment intact`, () =>
      Effect.gen(function* () {
        expectSpawn(import.meta.path)
        const tmp = yield* Effect.acquireRelease(
          Effect.promise(() => tmpdir()),
          (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
        )
        const processes = yield* AppProcess.Service
        yield* processes.run(ChildProcess.make("git", ["init", "-q"], { cwd: tmp.path })).pipe(
          Effect.flatMap(AppProcess.requireSuccess),
        )
        const created = yield* post("/api/session", { location: { directory: tmp.path } })
        expect(created.status).toBe(200)
        const session = yield* HttpClientResponse.schemaBodyJson(Info)(created)
        const server = yield* HttpServer.HttpServer
        if (server.address._tag !== "TcpAddress") return yield* Effect.die("Expected real TCP server")
        const baseUrl = `http://127.0.0.1:${server.address.port}`

        // Deliberately synthetic bytes with a PNG signature, not an image-decoder fixture. resume:false tests
        // admission and event delivery only: no media ingestion, mentions expansion, model or provider work.
        const bytes = new Uint8Array(size)
        bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        const file = { uri: `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`, name: "envelope-fixture.png" }
        const prompt = {
          text: "Store this inline attachment without executing a turn",
          files: [{ ...file, mime: "image/png" }],
        }
        const messageID = SessionMessage.ID.create()
        const admitted = yield* post(`/api/session/${session.data.id}/prompt`, {
          id: messageID, prompt: { ...prompt, files: [file] }, resume: false,
        })
        expect(admitted.status).toBe(200)
        expect(yield* admitted.json).toMatchObject({ data: { id: messageID, sessionID: session.data.id } })

        const database = yield* Database.Service
        const durable = SessionEvent.PromptAdmitted.durable
        if (!durable) return yield* Effect.die("PromptAdmitted must have a durable event definition")
        const rows = yield* database.db.select().from(EventTable).where(and(
          eq(EventTable.aggregate_id, session.data.id),
          eq(EventTable.type, EventV2.versionedType(SessionEvent.PromptAdmitted.type, durable.version)),
        ))
        expect(rows).toHaveLength(1)
        expect(rows[0].seq).toBe(1)
        expect(rows[0].data.messageID).toBe(messageID)
        expect(rows[0].data.prompt).toEqual(prompt)
        const inputs = yield* database.db.select().from(SessionInputTable).where(eq(SessionInputTable.session_id, session.data.id))
        expect(inputs).toHaveLength(1)
        expect(inputs[0].id).toBe(messageID)
        expect(inputs[0].prompt).toEqual(prompt)
        expect(inputs[0].promoted_seq).toBeNull()
        const execution = yield* SessionExecution.Service
        expect([...(yield* execution.active)]).toEqual([])

        const event = transport === "promise"
          ? yield* Effect.tryPromise({ try: () => readPromise(baseUrl, session.data.id, messageID), catch: (error) => error })
          : yield* readEffect(baseUrl, session.data.id, messageID)
        expect(event.type).toBe(SessionEvent.PromptAdmitted.type)
        expect(event.durable).toMatchObject({ aggregateID: session.data.id, seq: 1 })
        expect(event.data.messageID).toBe(messageID)
        expect(event.data.prompt).toEqual(prompt)
        expect(event.data.prompt.files?.[0]?.uri).toBe(prompt.files[0].uri)
      }),
      30_000,
    )
  }
}

async function readPromise(baseUrl: string, sessionID: Session.ID, messageID: SessionMessage.ID) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error("Durable Promise SSE fixture deadline")), 5_000)
  try {
    const client = Orchestra.make({ baseUrl })
    for await (const event of client.sessions.events({ sessionID, after: 0 }, { signal: controller.signal })) {
      if (event.type === "session.next.prompt.admitted" && event.data.messageID === messageID) return event
    }
    throw new Error("Durable Promise SSE ended before the admitted input")
  } finally {
    clearTimeout(timeout)
    controller.abort()
  }
}

const readEffect = Effect.fn("test.readEffectPromptAdmitted")(function* (
  baseUrl: string,
  sessionID: Session.ID,
  messageID: SessionMessage.ID,
) {
  const { Orchestra } = yield* Effect.promise(() => import("@orchestra/client/effect"))
  const client = yield* Orchestra.make({ baseUrl }).pipe(Effect.provide(FetchHttpClient.layer))
  const received = yield* client.sessions.events({ sessionID, after: 0 }).pipe(
    Stream.filter((event) => event.type === "session.next.prompt.admitted" && event.data.messageID === messageID),
    Stream.take(1),
    Stream.runCollect,
    Effect.timeout("5 seconds"),
  )
  expect(received).toHaveLength(1)
  const event = received[0]
  if (event?.type !== "session.next.prompt.admitted") return yield* Effect.die("Expected durable admitted input")
  return event
})
