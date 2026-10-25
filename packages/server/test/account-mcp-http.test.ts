import { describe, expect, test } from "bun:test"
import { Catalog } from "@orchestra/core/catalog"
import { ClaudeCodeAccount } from "@orchestra/core/claude-code-account"
import { Credential } from "@orchestra/core/credential"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Integration } from "@orchestra/core/integration"
import { Location } from "@orchestra/core/location"
import { Mcp } from "@orchestra/core/mcp"
import { ProjectV2 } from "@orchestra/core/project"
import { AbsolutePath } from "@orchestra/core/schema"
import { IntegrationGroup } from "@orchestra/protocol/groups/integration"
import { McpGroup } from "@orchestra/protocol/groups/mcp"
import { ProviderGroup } from "@orchestra/protocol/groups/provider"
import { Authorization } from "@orchestra/protocol/middleware/authorization"
import { SchemaErrorMiddleware } from "@orchestra/protocol/middleware/schema-error"
import { Context, Effect, Layer, Option } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { ServerAuth } from "../src/auth"
import { IntegrationHandler } from "../src/handlers/integration"
import { McpHandler } from "../src/handlers/mcp"
import { ProviderHandler } from "../src/handlers/provider"
import { LocationMiddleware, type LocationServices } from "../src/location"
import { authorizationLayer } from "../src/middleware/authorization"
import { schemaErrorLayer } from "../src/middleware/schema-error"

const api = HttpApi.make("server")
  .add(IntegrationGroup.middleware(LocationMiddleware))
  .add(McpGroup.middleware(LocationMiddleware))
  .add(ProviderGroup.middleware(LocationMiddleware))
  .middleware(Authorization)
  .middleware(SchemaErrorMiddleware)
const auth = ServerAuth.headers({ username: "orchestra", password: "secret" })

const location = Location.Service.of({
  directory: AbsolutePath.make("/repo"),
  project: { id: ProjectV2.ID.make("prj_one"), directory: AbsolutePath.make("/repo") },
} as unknown as Location.Interface)

// Real Integration and Credential services behind the routes. The MCP service is the one stand-in: the core MCP test
// drives the real one over a stdio server, and these routes only have to carry its answers.
function serve(input: { account?: ClaudeCodeAccount.Interface; mcp?: Partial<Mcp.Interface> } = {}) {
  return Effect.gen(function* () {
    const real = yield* Layer.build(
      AppNodeBuilder.build(LayerNode.group([Integration.node, Credential.node, EventV2.node])),
    )
    const account = input.account ?? Context.get(yield* Layer.build(ClaudeCodeAccount.layer), ClaudeCodeAccount.Service)
    const context = real.pipe(
      Context.add(Location.Service, location),
      Context.add(Mcp.Service, Mcp.Service.of({ ...input.mcp } as unknown as Mcp.Interface)),
      Context.add(Catalog.Service, {} as unknown as Catalog.Interface),
      Context.add(ClaudeCodeAccount.Service, account),
    )
    const routes = HttpApiBuilder.layer(api).pipe(
      Layer.provide(Layer.mergeAll(IntegrationHandler, McpHandler, ProviderHandler)),
      Layer.provide(Layer.succeedContext(context)),
      // The production middleware boots a Location's services per request; here it hands every route this fixture's.
      Layer.provide(
        Layer.succeed(
          LocationMiddleware,
          LocationMiddleware.of((effect) =>
            effect.pipe(Effect.provide(context as unknown as Context.Context<LocationServices>)),
          ),
        ),
      ),
      Layer.provide(authorizationLayer),
      Layer.provide(schemaErrorLayer),
      Layer.provide(ServerAuth.Config.configLayer({ username: "orchestra", password: Option.some("secret") })),
      Layer.provide(HttpServer.layerServices),
    )
    const web = yield* Effect.acquireRelease(
      Effect.sync(() => HttpRouter.toWebHandler(routes, { disableLogger: true })),
      (web) => Effect.promise(() => web.dispose()),
    )
    const request = (pathname: string, init: RequestInit = {}) =>
      Effect.promise(() =>
        web.handler(
          new Request(new URL(pathname, "http://orchestra.test"), {
            ...init,
            headers: { ...auth, "content-type": "application/json" },
          }),
          context,
        ),
      )
    return { request, context }
  })
}

const json = (response: Response) => Effect.promise(() => response.json())

describe("provider auth removal", () => {
  test("removes every stored credential of one provider and keeps the others", () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const server = yield* serve()
          const integrations = Context.get(server.context, Integration.Service)
          const credentials = Context.get(server.context, Credential.Service)
          const anthropic = Integration.ID.make("anthropic")
          const openai = Integration.ID.make("openai")
          yield* integrations.connection.key({ integrationID: anthropic, key: "a", label: "Work" })
          yield* integrations.connection.key({ integrationID: anthropic, key: "b", label: "Personal" })
          yield* integrations.connection.key({ integrationID: openai, key: "c" })

          const response = yield* server.request("/api/integration/anthropic/connection?location[directory]=/repo", {
            method: "DELETE",
          })

          expect(response.status).toBe(204)
          expect(yield* credentials.list(anthropic)).toEqual([])
          expect(yield* credentials.list(openai)).toHaveLength(1)
        }),
      ),
    ))
})

describe("Claude Code sign-in routes", () => {
  test("a server without the Claude Code engine reports signed out and refuses to sign in", () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const server = yield* serve()
          expect(yield* json(yield* server.request("/api/provider/claude-code/account"))).toEqual({ signedIn: false })
          const login = yield* server.request("/api/provider/claude-code/login", { method: "POST" })
          expect(login.status).toBe(503)
          expect(yield* json(login)).toMatchObject({ message: "Claude Code is not available on this server" })
          const code = yield* server.request("/api/provider/claude-code/login/code", {
            method: "POST",
            body: JSON.stringify({ code: "x#y" }),
          })
          expect(yield* json(code)).toBe(false)
        }),
      ),
    ))

  test("the routes carry the engine's account, fallback URL and pasted code", () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const sent: string[] = []
          const server = yield* serve({
            account: ClaudeCodeAccount.Service.of({
              account: Effect.succeed({ signedIn: true, email: "owner@example.com", subscription: "max" }),
              startLogin: Effect.succeed({ url: "https://claude.com/cai/oauth/authorize?state=s" }),
              sendCode: (code) => Effect.sync(() => (sent.push(code), true)),
            }),
          })
          expect(yield* json(yield* server.request("/api/provider/claude-code/account"))).toEqual({
            signedIn: true,
            email: "owner@example.com",
            subscription: "max",
          })
          expect(yield* json(yield* server.request("/api/provider/claude-code/login", { method: "POST" }))).toEqual({
            url: "https://claude.com/cai/oauth/authorize?state=s",
          })
          const code = yield* server.request("/api/provider/claude-code/login/code", {
            method: "POST",
            body: JSON.stringify({ code: "good#state" }),
          })
          expect(yield* json(code)).toBe(true)
          expect(sent).toEqual(["good#state"])
        }),
      ),
    ))

  test("a failed sign-in answers 503 with the binary's own reason", () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const server = yield* serve({
            account: ClaudeCodeAccount.Service.of({
              account: Effect.succeed({ signedIn: false }),
              startLogin: Effect.fail(new ClaudeCodeAccount.LoginError({ message: "managed settings forbid this login" })),
              sendCode: () => Effect.succeed(false),
            }),
          })
          const login = yield* server.request("/api/provider/claude-code/login", { method: "POST" })
          expect(login.status).toBe(503)
          expect(yield* json(login)).toMatchObject({ message: "managed settings forbid this login" })
        }),
      ),
    ))
})

describe("MCP config and tools routes", () => {
  test("return the resolved servers, the file entries and each server's tool names", () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const entry = { type: "local" as const, command: ["bun", "serve.ts"] }
          const server = yield* serve({
            mcp: {
              config: () => Effect.succeed({ servers: { docs: entry, remote: { type: "remote", url: "https://x.test" } }, entries: { docs: entry } }),
              toolNames: () => Effect.succeed({ docs: ["search", "fetch"] }),
            },
          })
          const config = yield* json(yield* server.request("/api/mcp/config?location[directory]=/repo"))
          expect(config).toMatchObject({
            data: { servers: { docs: entry, remote: { type: "remote", url: "https://x.test" } }, entries: { docs: entry } },
          })
          const tools = yield* json(yield* server.request("/api/mcp/tool?location[directory]=/repo"))
          expect(tools).toMatchObject({ data: { docs: ["search", "fetch"] } })
        }),
      ),
    ))

  test("a profile file the server cannot read answers 400 with the reason", () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const server = yield* serve({
            mcp: { config: () => Effect.fail(new Mcp.ConfigError({ message: "orchestra.json: invalid JSON" })) },
          })
          const response = yield* server.request("/api/mcp/config?location[directory]=/repo")
          expect(response.status).toBe(400)
          expect(yield* json(response)).toMatchObject({ message: "orchestra.json: invalid JSON" })
        }),
      ),
    ))
})
