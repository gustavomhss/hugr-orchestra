import { expect } from "bun:test"
import { NodeHttpServer } from "@effect/platform-node"
import { Deferred, Effect, Layer } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { HttpRouter } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceRef } from "@/effect/instance-ref"
import { Permission } from "@/permission"
import { SessionContinuity } from "@/continuity/service"
import { Session } from "@/session/session"
import { SessionRevert } from "@/session/revert"
import { SessionRunState } from "@/session/run-state"
import { SessionSummary } from "@/session/summary"
import { SessionPrompt } from "@/session/prompt"
import { SessionCompaction } from "@/session/compaction"
import { SessionStatus } from "@/session/status"
import { SessionShare } from "@/share/session"
import { Todo } from "@/session/todo"
import { sessionHandlers } from "@/server/routes/instance/httpapi/handlers/session"
import { SessionApi } from "@/server/routes/instance/httpapi/groups/session"
import { Authorization } from "@/server/routes/instance/httpapi/middleware/authorization"
import { schemaErrorLayer } from "@/server/routes/instance/httpapi/middleware/schema-error"
import { InstanceContextMiddleware } from "@/server/routes/instance/httpapi/middleware/instance-context"
import { WorkspaceRouteContext, WorkspaceRoutingMiddleware } from "@/server/routes/instance/httpapi/middleware/workspace-routing"
import { TestInstance } from "../fixture/fixture"
import { it } from "../lib/effect"
import { requestInDirectory } from "../server/httpapi-layer"
import { FIRST, SECOND, applyFirst, begin, complete, entered, environment, held, prepare, seed, terminal } from "./service-fixture"

// Real session schemas and handlers, with local test transport/context. Untested
// prompt/share/permission endpoints throw if accidentally invoked; no model API.
const api = HttpApi.make("opencode-instance").addHttpApi(SessionApi)
const serve = Effect.gen(function* () {
  const instance = yield* InstanceRef
  if (!instance) throw new Error("Expected test instance")
  const routes = HttpApiBuilder.layer(api).pipe(
    Layer.provide(sessionHandlers),
    Layer.provide(schemaErrorLayer),
    Layer.provide([
      Layer.succeed(Authorization, Authorization.of((effect) => effect)),
      Layer.succeed(InstanceContextMiddleware, InstanceContextMiddleware.of((effect) => effect.pipe(Effect.provideService(InstanceRef, instance)))),
      Layer.succeed(WorkspaceRoutingMiddleware, WorkspaceRoutingMiddleware.of((effect) => effect.pipe(
        Effect.provideService(WorkspaceRouteContext, { directory: instance.directory })))),
      Layer.mock(SessionShare.Service, {}), Layer.mock(SessionPrompt.Service, {}),
      Layer.mock(SessionCompaction.Service, {}), Layer.mock(Permission.Service, {}),
      Layer.mock(SessionStatus.Service, {}), Layer.mock(Todo.Service, {}),
    ]),
  )
  return yield* Layer.build(HttpRouter.serve(routes, { disableListenLog: true, disableLogger: true }).pipe(
    Layer.provideMerge(NodeHttpServer.layerTest),
  ))
})

for (const action of ["edit", "delete-part", "delete-message", "revert-unrevert", "delete-session"] as const) {
  it.instance(`G5 actual HTTP ${action} invalidates applied memory and held pre-change result`, () => Effect.gen(function* () {
    const first = yield* held(FIRST)
    const stale = yield* held(SECOND)
    yield* Effect.gen(function* () {
      const server = yield* serve
      const instance = yield* TestInstance
      const sessions = yield* Session.Service
      const continuity = yield* SessionContinuity.Service
      const sessionID = yield* seed()
      yield* applyFirst(sessionID, first)
      yield* complete(yield* begin(sessionID, "HTTP_CHANGE_PENDING"), "PENDING_REPLY", 50_000)
      const hit = yield* entered(stale)
      const history = yield* sessions.messages({ sessionID })
      const source = history[0]
      const part = source.parts[0]
      if (part.type !== "text") throw new Error("Expected editable text")
      const root = `/session/${sessionID}`
      const request = (suffix: string, method: string, body?: unknown) => requestInDirectory(root + suffix, instance.directory, {
        method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
      }).pipe(Effect.provide(server))
      expect((yield* request("", "GET")).status).toBe(200)
      expect((yield* prepare(sessionID)).system[0]).toContain(FIRST)
      if (action === "edit") {
        const response = yield* request(`/message/${source.info.id}/part/${part.id}`, "PATCH", { ...part, text: "EDITED_VIA_REAL_ROUTE" })
        expect(response.status).toBe(200)
        expect(yield* response.json).toMatchObject({ id: part.id, text: "EDITED_VIA_REAL_ROUTE" })
      }
      if (action === "delete-part") expect((yield* request(`/message/${source.info.id}/part/${part.id}`, "DELETE")).status).toBe(200)
      if (action === "delete-message") expect((yield* request(`/message/${source.info.id}`, "DELETE")).status).toBe(200)
      if (action === "revert-unrevert") {
        expect((yield* request("/revert", "POST", { messageID: source.info.id })).status).toBe(200)
        expect((yield* sessions.get(sessionID)).revert?.messageID).toBe(source.info.id)
        expect((yield* prepare(sessionID)).system).toEqual([])
        expect((yield* request("/unrevert", "POST")).status).toBe(200)
        expect((yield* sessions.get(sessionID)).revert).toBeUndefined()
      }
      if (action === "delete-session") {
        expect((yield* request("", "DELETE")).status).toBe(200)
        expect((yield* request("", "GET")).status).toBe(404)
        expect(yield* Deferred.isDone(stale.closed)).toBe(true)
        expect(yield* Deferred.isDone(stale.release)).toBe(false)
        // Cached pre-delete history cannot resurrect the deleted session's memory.
        expect(yield* continuity.prepare({ sessionID, messages: history, canRecall: true })).toEqual({ messages: history, system: [] })
      }
      if (action !== "delete-session") {
        const native = yield* sessions.messages({ sessionID })
        expect(yield* prepare(sessionID)).toEqual({ messages: native, system: [] })
        if (action === "edit") expect(native[0].parts[0]).toMatchObject({ text: "EDITED_VIA_REAL_ROUTE" })
        if (action === "delete-part") expect(native.flatMap((message) => message.parts).some((entry) => entry.id === part.id)).toBe(false)
        if (action === "delete-message") expect(native.some((message) => message.info.id === source.info.id)).toBe(false)
      }
      yield* Deferred.succeed(stale.release, undefined)
      yield* terminal(hit.jobID, action === "delete-session" ? "cancelled" : "completed", action === "delete-session" ? undefined : "discarded")
      const native = action === "delete-session" ? history : yield* sessions.messages({ sessionID })
      expect(yield* continuity.prepare({ sessionID, messages: native, canRecall: true })).toEqual({ messages: native, system: [] })
    }).pipe(Effect.provide(environment([first, stale], { node: LayerNode.group([SessionRevert.node, SessionRunState.node, SessionSummary.node]) })))
  }), { git: true }, 60_000)
}
