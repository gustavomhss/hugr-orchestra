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
const request = (path: string, init?: RequestInit) => {
  const url = new URL(path, "http://localhost")
  return HttpClientRequest.fromWeb(new Request(url, init)).pipe(
    HttpClientRequest.setUrl(url.pathname),
    HttpClient.execute,
  )
}
const post = (path: string, body: unknown) =>
  request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })

async function initRepo(directory: string) {
  await $`git init`.cwd(directory).quiet()
  await $`git config core.autocrlf false`.cwd(directory).quiet()
  await $`git config commit.gpgsign false`.cwd(directory).quiet()
  await $`git config user.email test@orchestra.test`.cwd(directory).quiet()
  await $`git config user.name Test`.cwd(directory).quiet()
  await fs.writeFile(path.join(directory, "tracked.txt"), "initial\n")
  await $`git add tracked.txt`.cwd(directory).quiet()
  await $`git commit -m root`.cwd(directory).quiet()
}

it.live(
  "real HTTP move with moveChanges carries uncommitted changes to the destination and resets the source",
  () =>
    Effect.gen(function* () {
      expectSpawn(import.meta.path)
      const tmp = yield* Effect.acquireRelease(
        Effect.promise(() => tmpdir()),
        (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
      )
      yield* Effect.promise(() => initRepo(tmp.path))
      const source = yield* Effect.promise(() => fs.realpath(tmp.path))
      const copy = `${tmp.path}-move-http`
      yield* Effect.addFinalizer(() =>
        Effect.promise(() => fs.rm(copy, { recursive: true, force: true })).pipe(Effect.ignore),
      )
      yield* Effect.promise(() => $`git worktree add --detach ${copy} HEAD`.cwd(source).quiet())
      const destination = yield* Effect.promise(() => fs.realpath(copy))
      const created = yield* post("/api/session", { location: { directory: source } }).pipe(
        Effect.flatMap(HttpClientResponse.schemaBodyJson(Info)),
      )
      yield* Effect.promise(() => fs.writeFile(path.join(source, "tracked.txt"), "changed\n"))

      const moved = yield* post(`/api/session/${created.data.id}/move`, {
        location: { directory: destination },
        moveChanges: true,
      })
      expect(moved.status).toBe(204)
      expect(yield* Effect.promise(() => fs.readFile(path.join(destination, "tracked.txt"), "utf8"))).toBe("changed\n")
      expect(yield* Effect.promise(() => fs.readFile(path.join(source, "tracked.txt"), "utf8"))).toBe("initial\n")
      const read = yield* request(`/api/session/${created.data.id}`).pipe(
        Effect.flatMap(HttpClientResponse.schemaBodyJson(Info)),
      )
      expect<string>(read.data.location.directory).toBe(destination)
    }),
  30_000,
)
