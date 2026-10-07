import { afterEach, describe, expect } from "bun:test"
import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import path from "node:path"
import { Config, Effect, Layer } from "effect"
import { HttpClient, HttpClientRequest, HttpRouter, HttpServer } from "effect/unstable/http"
import { layerWebSocketConstructorGlobal } from "effect/unstable/socket/Socket"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Ripgrep } from "@orchestra/core/ripgrep"
import { Database } from "@orchestra/core/database/database"
import { Workspace } from "../../src/control-plane/workspace"
import { InstanceBootstrap as InstanceBootstrapService } from "../../src/project/bootstrap-service"
import { InstanceStore } from "../../src/project/instance-store"
import { Project } from "../../src/project/project"
import { HttpApiApp } from "../../src/server/routes/instance/httpapi/server"
import { SessionPaths } from "../../src/server/routes/instance/httpapi/groups/session"
import { WriteRoots } from "../../src/maestro/write-roots"
import { Session } from "@/session/session"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

// F2.14: write-root rules bind a delegated child's write scope and only the host writes them. A client (plugins hold an
// SDK client) that could add an allow rule through create or update would widen a bound child's roots.
// Kept apart from httpapi-session.test.ts, which is over the godfile limit.

const appLayer = AppNodeBuilder.build(
  LayerNode.group([InstanceStore.node, Project.node, Session.node, Workspace.node, Database.node, Ripgrep.node]),
  [
    [
      InstanceStore.bootstrapNode,
      Layer.succeed(InstanceBootstrapService.Service, InstanceBootstrapService.Service.of({ run: Effect.void })),
    ],
  ],
)
const servedRoutes: Layer.Layer<never, Config.ConfigError, HttpServer.HttpServer> = HttpRouter.serve(
  HttpApiApp.routes,
  { disableListenLog: true, disableLogger: true },
)
const httpApiLayer = servedRoutes.pipe(
  Layer.provide(layerWebSocketConstructorGlobal),
  Layer.provideMerge(NodeHttpServer.layerTest),
  Layer.provideMerge(NodeServices.layer),
)
const it = testEffect(Layer.mergeAll(appLayer, httpApiLayer))

function request(route: string, init: RequestInit) {
  const url = new URL(route, "http://localhost")
  return HttpClientRequest.fromWeb(new Request(url, init)).pipe(
    HttpClientRequest.setUrl(url.pathname),
    HttpClient.execute,
  )
}

afterEach(async () => {
  await disposeAllInstances()
  await resetDatabase()
})

describe("session HttpApi reserved write-root rules", () => {
  it.instance(
    "create and update refuse payloads carrying reserved write-root rules and leave the Session unchanged",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const headers = { "x-orchestra-directory": test.directory, "content-type": "application/json" }
        const widen = [{ permission: WriteRoots.PERMISSION, pattern: test.directory, action: "allow" }]
        const permission = [
          { permission: WriteRoots.PERMISSION, pattern: "*", action: "deny" as const },
          { permission: WriteRoots.PERMISSION, pattern: path.join(test.directory, "src"), action: "allow" as const },
        ]
        const child = yield* Session.use.create({ title: "bound child", permission })
        const before = (yield* Session.use.list()).map((item) => item.id)

        const created = yield* request(SessionPaths.create, {
          method: "POST",
          headers,
          body: JSON.stringify({ title: "widened", permission: widen }),
        })
        expect(created.status).toBe(400)
        expect((yield* Session.use.list()).map((item) => item.id)).toEqual(before)

        for (const rules of [widen, [{ permission: WriteRoots.PERMISSION, pattern: "*", action: "deny" }]]) {
          const updated = yield* request(SessionPaths.update.replace(":sessionID", child.id), {
            method: "PATCH",
            headers,
            body: JSON.stringify({ title: "widened", permission: rules }),
          })
          expect(updated.status).toBe(400)
        }
        const after = yield* Session.use.get(child.id)
        expect(after.permission).toEqual(permission)
        expect(after.title).toBe("bound child")

        // Ordinary rules still merge, and the bound roots stay as they were.
        const merged = yield* request(SessionPaths.update.replace(":sessionID", child.id), {
          method: "PATCH",
          headers,
          body: JSON.stringify({ permission: [{ permission: "bash", pattern: "*", action: "deny" }] }),
        })
        expect(merged.status).toBe(200)
        const current = yield* Session.use.get(child.id)
        expect(WriteRoots.read(current.permission)).toEqual([path.join(test.directory, "src")])
        expect(current.permission).toContainEqual({ permission: "bash", pattern: "*", action: "deny" })
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )
})
