import { SessionProcess } from "@orchestra/core/session-process"
import { MoveSession } from "@orchestra/core/control-plane/move-session"
import { TaskBackground } from "@orchestra/core/tool/task-background"
import { expect } from "bun:test"
import { $ } from "bun"
import fs from "fs/promises"
import path from "path"
import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { Database } from "@orchestra/core/database/database"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import { AppProcess } from "@orchestra/core/process"
import { FSUtil } from "@orchestra/core/fs-util"
import { SessionV2 } from "@orchestra/core/session"
import { SessionSubagentModels } from "@orchestra/core/session/subagent-models"
import { SessionExecution } from "@orchestra/core/session/execution"
import { makeSessionGroup } from "@orchestra/protocol/groups/session"
import { SchemaErrorMiddleware } from "@orchestra/protocol/middleware/schema-error"
import { Session } from "@orchestra/schema/session"
import { SessionMessage } from "@orchestra/schema/session-message"
import { Revert } from "@orchestra/schema/revert"
import { SessionMessageTable } from "@orchestra/core/session/sql"
import { Snapshot } from "@orchestra/core/snapshot"
import { Effect, Layer, Option, Schema } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse, HttpRouter } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { tmpdir } from "@orchestra/core/test/fixture/tmpdir"
import { testEffect } from "@orchestra/core/test/lib/effect"
import { ServerAuth } from "../src/auth"
import { SessionHandler } from "../src/handlers/session"
import { authorizationLayer } from "../src/middleware/authorization"
import { SessionLocationMiddleware, sessionLocationLayer } from "../src/middleware/session-location"
import { schemaErrorLayer } from "../src/middleware/schema-error"

const services = AppNodeBuilder.build(
  LayerNode.group([
    Database.node,
    LocationServiceMap.node,
    AppProcess.node,
    FSUtil.node,
    SessionV2.node,
    SessionExecution.node,
    SessionSubagentModels.node,
    SessionProcess.node,
    MoveSession.node,
    TaskBackground.node,
  ]),
  [[SessionExecution.node, SessionExecution.noopLayer]],
)
// Serve the actual Session group, handler and middleware over TCP; other API groups are outside this fixture.
const routes = HttpApiBuilder.layer(
  HttpApi.make("server").add(makeSessionGroup(SessionLocationMiddleware)).middleware(SchemaErrorMiddleware),
).pipe(
  Layer.provide(SessionHandler),
  Layer.provide(sessionLocationLayer),
  Layer.provide(schemaErrorLayer),
  Layer.provide(authorizationLayer),
  Layer.provide(ServerAuth.Config.configLayer({ username: "orchestra", password: Option.none() })),
)
const it = testEffect(
  HttpRouter.serve(routes, { disableListenLog: true, disableLogger: true }).pipe(
    Layer.provideMerge(NodeHttpServer.layerTest),
    Layer.provideMerge(NodeServices.layer),
    Layer.provideMerge(services),
  ),
)
const Info = Schema.Struct({ data: Session.Info })
const Diffs = Schema.Struct({ data: Schema.Array(Revert.FileDiff) })
const request = (path: string, init?: RequestInit) => {
  const url = new URL(path, "http://localhost")
  return HttpClientRequest.fromWeb(new Request(url, init)).pipe(
    HttpClientRequest.setUrl(url.pathname),
    HttpClient.execute,
  )
}

async function initRepo(directory: string) {
  await $`git init`.cwd(directory).quiet()
  await $`git config core.autocrlf false`.cwd(directory).quiet()
  await $`git config commit.gpgsign false`.cwd(directory).quiet()
  await $`git config user.email test@orchestra.test`.cwd(directory).quiet()
  await $`git config user.name Test`.cwd(directory).quiet()
  await fs.writeFile(path.join(directory, "first.txt"), "one\n")
  await fs.writeFile(path.join(directory, "second.txt"), "one\n")
  await $`git add .`.cwd(directory).quiet()
  await $`git commit -m root`.cwd(directory).quiet()
}

it.live(
  "real HTTP turn diff spans only the snapshots of the turn that answered the user message",
  () =>
    Effect.gen(function* () {
      expectSpawn(import.meta.path)
      const tmp = yield* Effect.acquireRelease(
        Effect.promise(() => tmpdir()),
        (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
      )
      yield* Effect.promise(() => initRepo(tmp.path))
      const directory = yield* Effect.promise(() => fs.realpath(tmp.path))
      const created = yield* request("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ location: { directory } }),
      }).pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(Info)))
      const sessionID = created.data.id
      const locations = yield* LocationServiceMap.Service
      const capture = Effect.gen(function* () {
        const snapshot = yield* Snapshot.Service
        return yield* snapshot.capture()
      }).pipe(Effect.provide(locations.get(created.data.location)))
      const start = yield* capture
      yield* Effect.promise(() => fs.writeFile(path.join(directory, "first.txt"), "two\n"))
      const middle = yield* capture
      yield* Effect.promise(() => fs.writeFile(path.join(directory, "second.txt"), "two\n"))
      const end = yield* capture
      expect(start && middle && end).toBeTruthy()

      const firstPrompt = SessionMessage.ID.create()
      const secondPrompt = SessionMessage.ID.create()
      const firstReply = SessionMessage.ID.create()
      const user = (id: SessionMessage.ID, seq: number) => ({
        id,
        session_id: sessionID,
        type: "user" as const,
        seq,
        time_created: seq,
        data: { time: { created: seq }, text: "go" } as NonNullable<(typeof SessionMessageTable.$inferInsert)["data"]>,
      })
      const assistant = (id: SessionMessage.ID, seq: number, from?: string, to?: string) => ({
        id,
        session_id: sessionID,
        type: "assistant" as const,
        seq,
        time_created: seq,
        data: {
          time: { created: seq },
          agent: "build",
          model: { id: "model", providerID: "provider" },
          content: [],
          snapshot: { start: from, end: to },
        } as NonNullable<(typeof SessionMessageTable.$inferInsert)["data"]>,
      })
      const database = yield* Database.Service
      yield* database.db
        .insert(SessionMessageTable)
        .values([
          user(firstPrompt, 1),
          assistant(firstReply, 2, start, start),
          assistant(SessionMessage.ID.create(), 3, start, middle),
          user(secondPrompt, 4),
          assistant(SessionMessage.ID.create(), 5, middle, end),
        ])
        .run()
        .pipe(Effect.orDie)

      const diff = (messageID: SessionMessage.ID) =>
        request(`/api/session/${sessionID}/message/${messageID}/diff`).pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(Diffs)),
          Effect.map((body) => body.data.map((item) => [String(item.path), item.status, item.additions, item.deletions])),
        )
      expect(yield* diff(firstPrompt)).toEqual([["first.txt", "modified", 1, 1]])
      expect(yield* diff(secondPrompt)).toEqual([["second.txt", "modified", 1, 1]])
    }),
  30_000,
)
