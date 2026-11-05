export * as FabricContextsFixture from "./fabric-contexts-fixture"

import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Orchestra } from "@orchestra/client"
import { CapabilityOperator } from "@orchestra/core/capability/operator/index"
import { ClaudeCodeAccount } from "@orchestra/core/claude-code-account"
import type { CapabilityOperatorContract } from "@orchestra/core/capability/operator/contract"
import { Database } from "@orchestra/core/database/database"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Global } from "@orchestra/core/global"
import type { Host } from "@orchestra/core/host"
import { Project } from "@orchestra/core/project"
import { PermissionSaved } from "@orchestra/core/permission/saved"
import { FabricContextsGroup } from "@orchestra/protocol/groups/fabric-contexts"
import { AbsolutePath } from "@orchestra/schema/schema"
import { Context, Effect, Layer, Option } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { ServerAuth } from "../src/auth"
import { ServerFabricContexts } from "../src/fabric-contexts"
import { FabricContextsHandler } from "../src/handlers/fabric-contexts"
import { Authorization, authorizationLayer } from "../src/middleware/authorization"
import { capabilityAuthorizationLayer } from "../src/middleware/capability-authorization"
import { SchemaErrorMiddleware, schemaErrorLayer } from "../src/middleware/schema-error"
import { ServerOperator } from "../src/operator"
import { createEmbeddedRoutes, createRoutes } from "../src/routes"

const TestApi = HttpApi.make("server").add(FabricContextsGroup)
  .middleware(Authorization).middleware(SchemaErrorMiddleware)

export function make(options: {
  password?: string
  principal?: string
  scope?: CapabilityOperatorContract.GrantScope
  filename?: string
  root?: AbsolutePath
  mode?: "focused" | "default" | "embedded"
} = {}) {
  return Effect.gen(function* () {
    const directory = yield* Effect.promise(() => mkdtemp(path.join(os.tmpdir(), "fabric-context-http-")))
    yield* Effect.addFinalizer(() => Effect.promise(() => rm(directory, { recursive: true, force: true })))
    const filename = options.filename ?? path.join(directory, "orchestra.db")
    const root = options.root ?? AbsolutePath.make(path.join(directory, "contexts"))
    const globals = Global.make({ home: directory, data: directory, config: path.join(directory, "config"),
      cache: path.join(directory, "cache"), state: path.join(directory, "state"), tmp: path.join(directory, "tmp"),
      bin: path.join(directory, "bin"), log: path.join(directory, "log"), repos: path.join(directory, "repos") })
    const services = yield* Layer.build(Layer.fresh(LayerNode.compile(
      LayerNode.group([Database.node, Project.node, Global.node, PermissionSaved.node, ClaudeCodeAccount.node]),
      [[Database.node, Database.layerFromPath(filename)], [Global.node, Layer.succeed(Global.Service, globals)]],
    )))
    const database = Context.get(services, Database.Service)
    const projects = Context.get(services, Project.Service)
    const operators = yield* CapabilityOperator.make({ principal: options.principal ?? "fabric-http-operator",
      scope: options.scope ?? { placements: "instance", actions: ["*"] } })
    const host: readonly Host.Contribution[] = [{ id: "fabric-http-fixture", replacements: [
      [Database.node, Layer.succeed(Database.Service, database)],
      [Project.node, Layer.succeed(Project.Service, projects)],
      [Global.node, Layer.succeed(Global.Service, globals)],
    ] }]
    const configured = { operator: operators, fabricContexts: { root }, host }
    const routes = options.mode === "default" ? createRoutes({ ...configured, password: options.password })
      : options.mode === "embedded" ? createEmbeddedRoutes(configured)
      : HttpApiBuilder.layer(TestApi, { openapiPath: "/openapi.json" }).pipe(
        Layer.provide(FabricContextsHandler), Layer.provide(authorizationLayer),
        Layer.provide(capabilityAuthorizationLayer), Layer.provide(schemaErrorLayer),
        Layer.provide(Layer.succeed(ServerFabricContexts.Config, { root })),
        Layer.provide(Layer.succeed(ServerOperator.Service, operators)),
        Layer.provide(ServerAuth.Config.configLayer({ username: "orchestra", password: Option.fromUndefinedOr(options.password) })),
        Layer.provide(Layer.succeedContext(services)),
      )
    const web = HttpRouter.toWebHandler(Layer.fresh(routes.pipe(Layer.provide(HttpServer.layerServices))), { disableLogger: true })
    yield* Effect.addFinalizer(() => Effect.promise(() => web.dispose()))
    const handler = (request: Request) => web.handler(request, services)
    // This transport is already in-process; there is no socket to preconnect.
    const transport = Object.assign((input: RequestInfo | URL, init?: RequestInit) => handler(new Request(input, init)),
      { preconnect: () => undefined })
    const client = (auth: string) => Orchestra.make({ baseUrl: "http://fabric.fixture.local",
      headers: { authorization: auth }, fetch: transport })
    const request = (url: string, input: {
      method?: string; auth?: string; key?: string; payload?: unknown; headers?: Record<string, string>
    } = {}) => Effect.promise(() => handler(new Request(new URL(url, "http://fabric.fixture.local"), {
      method: input.method ?? (input.payload === undefined ? "GET" : "POST"),
      headers: { "content-type": "application/json", ...input.headers,
        ...(input.auth === undefined ? {} : { authorization: input.auth }),
        ...(input.key === undefined ? {} : { "idempotency-key": input.key }) },
      body: input.payload === undefined ? undefined : JSON.stringify(input.payload),
    })))
    const issue = (scope?: CapabilityOperatorContract.GrantScope) => operators.issue({ origin: "sdk", scope }).pipe(
      Effect.map((issued) => ({ ...issued, header: `Bearer ${issued.bearer}` })))
    const basic = `Basic ${Buffer.from(`orchestra:${options.password ?? "synthetic-password"}`).toString("base64")}`
    const local = <A, E, R>(effect: Effect.Effect<A, E, R>, key = randomUUID()) =>
      operators.withRequest(operators.configured, { requestID: randomUUID(), idempotencyKey: key }, effect)
        .pipe(Effect.provide(services))
    expect(database.storageID).toBeDefined()
    return { directory, filename, root, database, projects, services, operators, handler, client, request, issue, basic, local }
  })
}
