import { expect } from "bun:test"
import { ToolCall } from "@orchestra/llm"
import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { DateTime, Deferred, Effect, Fiber, Layer, Option, Queue, Schema } from "effect"
import { HttpClient, HttpClientRequest, HttpRouter } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { AgentV2 } from "@orchestra/core/agent"
import { MoveSession } from "@orchestra/core/control-plane/move-session"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { SessionEvent } from "@orchestra/core/session/event"
import { Prompt } from "@orchestra/core/session/prompt"
import { FSUtil } from "@orchestra/core/fs-util"
import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import { ProjectV2 } from "@orchestra/core/project"
import { AppProcess } from "@orchestra/core/process"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionRunCoordinator } from "@orchestra/core/session/run-coordinator"
import { SessionStore } from "@orchestra/core/session/store"
import { SessionSubagentModels } from "@orchestra/core/session/subagent-models"
import { SessionProcess } from "@orchestra/core/session-process"
import { TaskBackground } from "@orchestra/core/tool/task-background"
import { Tool } from "@orchestra/core/tool/tool"
import { makeSessionGroup } from "@orchestra/protocol/groups/session"
import { SchemaErrorMiddleware } from "@orchestra/protocol/middleware/schema-error"
import { tmpdir } from "@orchestra/core/test/fixture/tmpdir"
import { testEffect } from "@orchestra/core/test/lib/effect"
import { ServerAuth } from "../src/auth"
import { SessionHandler } from "../src/handlers/session"
import { authorizationLayer } from "../src/middleware/authorization"
import { SessionLocationMiddleware, sessionLocationLayer } from "../src/middleware/session-location"
import { schemaErrorLayer } from "../src/middleware/schema-error"

const it = testEffect(Layer.empty)

it.live("real revert HTTP routes return 409 while a tool owns the Session and preserve its files and history", () =>
  Effect.gen(function* () {
    const tmp = yield* Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    )
    const started = yield* Queue.unbounded<SessionV2.ID>()
    const release = yield* Deferred.make<void>()
    const tool = Tool.make({
      description: "Blocked HTTP test operation",
      input: Schema.Struct({}),
      output: Schema.Struct({}),
      execute: (_, context) =>
        Queue.offer(started, context.sessionID).pipe(Effect.andThen(Deferred.await(release)), Effect.as({})),
    })
    const coordinator = yield* SessionRunCoordinator.make<SessionV2.ID, never>({
      drain: (sessionID) =>
        Tool.settle(tool, ToolCall.make({ type: "tool-call", id: "call_http_busy", name: "blocked", input: {} }), {
          sessionID,
          agent: AgentV2.ID.make("general"),
          assistantMessageID: SessionMessage.ID.make("msg_http_busy"),
          toolCallID: "call_http_busy",
        }).pipe(Effect.orDie, Effect.asVoid),
    })
    const execution = Layer.succeed(
      SessionExecution.Service,
      SessionExecution.Service.of({
        active: coordinator.active,
        resume: coordinator.run,
        wake: coordinator.wake,
        interrupt: coordinator.interrupt,
        exclusive: coordinator.exclusive,
        withRunner: () => Effect.die("unused by revert"),
      }),
    )
    yield* Effect.gen(function* () {
      const sessions = yield* SessionV2.Service
      const store = yield* SessionStore.Service
      const session = yield* sessions.create({
        location: Location.Ref.make({ directory: AbsolutePath.make(tmp.path) }),
      })
      const events = yield* EventV2.Service
      const boundary = SessionMessage.ID.make(`msg_${session.id}_boundary`)
      const later = SessionMessage.ID.make(`msg_${session.id}_later`)
      yield* events.publish(SessionEvent.Prompted, {
        sessionID: session.id,
        messageID: boundary,
        timestamp: DateTime.makeUnsafe(1),
        prompt: Prompt.make({ text: "boundary" }),
        delivery: "steer",
      })
      yield* events.publish(SessionEvent.Prompted, {
        sessionID: session.id,
        messageID: later,
        timestamp: DateTime.makeUnsafe(2),
        prompt: Prompt.make({ text: "later" }),
        delivery: "steer",
      })
      yield* events.publish(SessionEvent.RevertEvent.Staged, {
        sessionID: session.id,
        timestamp: DateTime.makeUnsafe(3),
        revert: { messageID: boundary, diff: "retain prior revert", files: [] },
      })
      const staged = (yield* sessions.get(session.id)).revert
      const marker = `${tmp.path}/marker.txt`
      yield* Effect.promise(() => Bun.write(marker, "untouched"))
      const before = yield* store.entries(session.id)
      const owner = yield* coordinator.run(session.id).pipe(Effect.forkChild)
      yield* Queue.take(started)
      const replies = yield* Effect.forEach(["stage", "clear", "commit"] as const, (operation) =>
        post(
          `/api/session/${session.id}/revert/${operation}`,
          operation === "stage" ? { messageID: boundary } : undefined,
        ).pipe(
          Effect.flatMap((response) =>
            response.status === 204
              ? Effect.succeed({ status: response.status, body: undefined })
              : response.json.pipe(Effect.map((body) => ({ status: response.status, body }))),
          ),
        ),
      )
      const during = yield* store.entries(session.id)
      const content = yield* Effect.promise(() => Bun.file(marker).text())
      const duringRevert = (yield* sessions.get(session.id)).revert
      yield* Deferred.succeed(release, undefined)
      yield* Fiber.join(owner)
      replies.forEach((reply) => {
        expect(reply.status).toBe(409)
        expect(reply.body).toMatchObject({ _tag: "ConflictError" })
      })
      expect(before).toHaveLength(2)
      expect(during).toEqual(before)
      expect(duringRevert).toEqual(staged)
      expect(content).toBe("untouched")
      expect((yield* post(`/api/session/${session.id}/revert/clear`)).status).toBe(204)
      expect((yield* post(`/api/session/${session.id}/revert/commit`)).status).toBe(204)
      expect((yield* post(`/api/session/${session.id}/revert/stage`, { messageID: boundary })).status).toBe(200)
    }).pipe(Effect.provide(server(execution)), Effect.ensuring(Deferred.succeed(release, undefined)))
  }),
)

function server(execution: Layer.Layer<SessionExecution.Service>) {
  const projects = Layer.succeed(
    ProjectV2.Service,
    ProjectV2.Service.of({
      resolve: (directory) => Effect.succeed({ id: ProjectV2.ID.global, directory }),
      list: () => Effect.succeed([]),
      directories: () => Effect.succeed([]),
      commit: () => Effect.void,
    }),
  )
  const services = AppNodeBuilder.build(
    LayerNode.group([
      Database.node,
      EventV2.node,
      LocationServiceMap.node,
      AppProcess.node,
      FSUtil.node,
      SessionStore.node,
      SessionExecution.node,
      SessionV2.node,
      SessionSubagentModels.node,
      SessionProcess.node,
      MoveSession.node,
      TaskBackground.node,
    ]),
    [
      [ProjectV2.node, projects],
      [SessionExecution.node, execution],
    ],
  )
  const routes = HttpApiBuilder.layer(
    HttpApi.make("server").add(makeSessionGroup(SessionLocationMiddleware)).middleware(SchemaErrorMiddleware),
  ).pipe(
    Layer.provide(SessionHandler),
    Layer.provide(sessionLocationLayer),
    Layer.provide(schemaErrorLayer),
    Layer.provide(authorizationLayer),
    Layer.provide(ServerAuth.Config.configLayer({ username: "orchestra", password: Option.none() })),
  )
  return HttpRouter.serve(routes, { disableListenLog: true, disableLogger: true }).pipe(
    Layer.provideMerge(NodeHttpServer.layerTest),
    Layer.provideMerge(NodeServices.layer),
    Layer.provideMerge(services),
  )
}
function post(path: string, body?: unknown) {
  const url = new URL(path, "http://localhost")
  const request = new Request(
    url,
    body === undefined
      ? { method: "POST" }
      : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
  )
  return HttpClientRequest.fromWeb(request).pipe(HttpClientRequest.setUrl(url.pathname), HttpClient.execute)
}
