import path from "node:path"
import fs from "node:fs/promises"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import { Context, Effect, Layer, Schema } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { Config } from "@orchestra/core/config"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { makeLocationNode } from "@orchestra/core/effect/app-node"
import { Global } from "@orchestra/core/global"
import { EventV2 } from "@orchestra/core/event"
import { Location } from "@orchestra/core/location"
import { Mcp } from "@orchestra/core/mcp"
import { McpAuth } from "@orchestra/core/mcp/auth"
import { McpProvided } from "@orchestra/core/mcp/provided"
import { PermissionV2 } from "@orchestra/core/permission"
import { PermissionSaved } from "@orchestra/core/permission/saved"
import { Project } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { SessionV2 } from "@orchestra/core/session"
import { SessionTable } from "@orchestra/core/session/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { Tool } from "@orchestra/core/tool/tool"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { ApplicationTools } from "@orchestra/core/tool/application-tools"
import { Tools } from "@orchestra/core/tool/tools"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { tmpdir } from "../fixture/tmpdir"
import { toolIdentity } from "../lib/tool"

export const workspace = Effect.gen(function* () {
  const tmp = yield* Effect.acquireRelease(Effect.promise(tmpdir), (tmp) =>
    Effect.promise(() => tmp[Symbol.asyncDispose]()),
  )
  const global = Global.make({
    home: tmp.path,
    data: path.join(tmp.path, "data"),
    state: path.join(tmp.path, "state"),
    config: path.join(tmp.path, "global"),
    cache: path.join(tmp.path, "cache"),
  })
  yield* Effect.promise(() =>
    Promise.all(
      [global.data, global.state, global.config, global.cache].map((directory) =>
        fs.mkdir(directory, { recursive: true }),
      ),
    ),
  )
  return {
    directory: tmp.path,
    global,
    projectID: Project.ID.make(`pro_identity_${crypto.randomUUID()}`),
    seed: path.join(global.data, "mcp-tool-identity.key"),
  }
})
export type Workspace = Effect.Success<typeof workspace>

export const graph = Effect.fn(function* (
  f: Workspace,
  options: {
    documents?: () => readonly Config.Document[]
    provided?: () => readonly McpProvided.Server[]
    rules?: PermissionV2.Ruleset
    replacements?: LayerNode.Replacements
    registered?: (id: string) => void
  } = {},
) {
  const observer = makeLocationNode({
    service: Tools.Service,
    deps: [ToolRegistry.node],
    layer: Layer.effect(
      Tools.Service,
      Effect.gen(function* () {
        const registry = yield* ToolRegistry.Service
        return Tools.Service.of({
          register: registry.register,
          // Typed delegation to the frozen future API. The baseline behavior files never request this observer.
          registerMcp: (...args: Parameters<typeof registry.registerMcp>) =>
            registry.registerMcp(...args).pipe(Effect.tap((id) => Effect.sync(() => options.registered?.(id)))),
        })
      }),
    ),
  })
  const context = yield* Layer.build(
    AppNodeBuilder.build(
      LayerNode.group([
        Mcp.node,
        McpAuth.node,
        EventV2.node,
        ToolRegistry.node,
        ToolRegistry.toolsNode,
        ApplicationTools.node,
        PermissionV2.node,
        PermissionSaved.node,
        AgentV2.node,
        Database.node,
        Config.node,
        Location.node,
      ]),
      [
        [Global.node, Global.layerWith(f.global)],
        [
          Location.node,
          Layer.succeed(Location.Service, {
            directory: AbsolutePath.make(f.directory),
            project: { id: f.projectID, directory: AbsolutePath.make(f.directory) },
          }),
        ],
        [Database.node, Database.layerFromPath(path.join(f.directory, "identity.sqlite"))],
        [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
        ...(options.documents
          ? [
              [
                Config.node,
                Layer.succeed(Config.Service, { entries: () => Effect.succeed([...options.documents!()]) }),
              ] as const,
            ]
          : []),
        ...(options.provided
          ? [
              [
                McpProvided.node,
                Layer.succeed(McpProvided.Service, { servers: () => Effect.sync(() => [...options.provided!()]) }),
              ] as const,
            ]
          : []),
        ...(options.registered ? [[ToolRegistry.toolsNode, observer] as const] : []),
        ...(options.replacements ?? []),
      ],
    ).pipe(Layer.fresh),
  )
  const database = Context.get(context, Database.Service)
  const agents = Context.get(context, AgentV2.Service)
  const sessionID = SessionV2.ID.make(`ses_identity_${crypto.randomUUID()}`)
  const agentID = AgentV2.ID.make("identity-audit")
  yield* database.db
    .insert(ProjectTable)
    .values({ id: f.projectID, worktree: f.directory, sandboxes: [] })
    .onConflictDoNothing()
    .run()
    .pipe(Effect.orDie)
  yield* database.db
    .insert(SessionTable)
    .values({
      id: sessionID,
      project_id: f.projectID,
      directory: f.directory,
      slug: "identity",
      title: "identity",
      version: "test",
      agent: agentID,
    })
    .run()
    .pipe(Effect.orDie)
  yield* agents.transform((draft) =>
    draft.update(agentID, (agent) => {
      agent.permissions = options.rules ?? [{ action: "*", resource: "*", effect: "allow" }]
    }),
  )
  return {
    context,
    sessionID,
    agentID,
    database,
    mcp: Context.get(context, Mcp.Service),
    registry: Context.get(context, ToolRegistry.Service),
    tools: Context.get(context, Tools.Service),
    applications: Context.get(context, ApplicationTools.Service),
    permission: Context.get(context, PermissionV2.Service),
    saved: Context.get(context, PermissionSaved.Service),
    config: Context.get(context, Config.Service),
    input: (name: string, id = `call_${crypto.randomUUID()}`) => ({
      sessionID,
      ...toolIdentity,
      agent: agentID,
      call: { type: "tool-call" as const, id, name, input: {} },
    }),
  }
})
export type Graph = Effect.Success<ReturnType<typeof graph>>

export const leaf = (value: string, called: string[] = []) =>
  Tool.make({
    description: "identity audit sentinel",
    input: Schema.Struct({}),
    output: Schema.String,
    execute: () =>
      Effect.sync(() => {
        called.push(value)
        return value
      }),
  })

export function provided(name: string, key: string, names: readonly string[], value: string) {
  const opened: Server[] = []
  const calls: string[] = []
  const state = { names: [...names] }
  const server: McpProvided.Server = {
    name,
    key,
    connect: () => {
      const pair = InMemoryTransport.createLinkedPair()
      const instance = new Server({ name, version: "1" }, { capabilities: { tools: { listChanged: true } } })
      instance.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: state.names.map((name) => ({
          name,
          description: "provided fixture",
          inputSchema: { type: "object", properties: {} },
        })),
      }))
      instance.setRequestHandler(CallToolRequestSchema, async (request) => {
        calls.push(request.params.name)
        return { content: [{ type: "text", text: value }] }
      })
      opened.push(instance)
      void instance.connect(pair[1])
      return pair[0]
    },
  }
  return {
    server,
    calls,
    async changed(next: readonly string[]) {
      state.names = [...next]
      await Promise.all(opened.map((server) => server.sendToolListChanged()))
    },
  }
}

export function remote(names: readonly string[], value: string, options: { oauth?: true } = {}) {
  const state = { names: [...names] }
  const calls: Array<{ method: string; name?: string; authorization: string | null; body: string }> = []
  const listeners = new Set<ReadableStreamDefaultController<Uint8Array>>()
  const listening = Promise.withResolvers<void>()
  const authCalls: Array<{ path: string; body: string }> = []
  const issuer = options.oauth
    ? Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch: async (request) => {
          const url = new URL(request.url)
          const body = await request.text()
          authCalls.push({ path: url.pathname, body })
          if (url.pathname.startsWith("/.well-known/"))
            return Response.json({
              issuer: url.origin,
              authorization_endpoint: `${url.origin}/authorize`,
              token_endpoint: `${url.origin}/token`,
              registration_endpoint: `${url.origin}/register`,
              response_types_supported: ["code"],
              grant_types_supported: ["authorization_code", "refresh_token"],
              token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
              code_challenge_methods_supported: ["S256"],
            })
          if (url.pathname === "/register")
            return Response.json(
              { ...JSON.parse(body), client_id: "identity-client", client_secret: "FICTITIOUS_DYNAMIC_SECRET" },
              { status: 201 },
            )
          if (url.pathname === "/token")
            return Response.json({
              access_token: `IDENTITY_ACCESS_${authCalls.filter((call) => call.path === "/token").length}`,
              refresh_token: "IDENTITY_REFRESH",
              token_type: "Bearer",
              expires_in: 3600,
            })
          return new Response("not found", { status: 404 })
        },
      })
    : undefined
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      const url = new URL(request.url)
      if (issuer && (url.pathname === "/metadata" || url.pathname.startsWith("/.well-known/")))
        return Response.json({ resource: `${url.origin}/mcp`, authorization_servers: [issuer.url.origin] })
      if (issuer && !/^Bearer IDENTITY_ACCESS_[0-9]+$/.test(request.headers.get("authorization") ?? ""))
        return new Response("OAuth required", {
          status: 401,
          headers: { "www-authenticate": `Bearer resource_metadata="${url.origin}/metadata"` },
        })
      if (request.method === "GET")
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              listeners.add(controller)
              listening.resolve()
            },
            cancel() {
              listeners.clear()
            },
          }),
          { headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } },
        )
      if (request.method === "DELETE") return new Response(null, { status: 204 })
      const body = await request.text()
      const message = JSON.parse(body)
      calls.push({
        method: message.method,
        name: message.params?.name,
        authorization: request.headers.get("authorization"),
        body,
      })
      if (message.id === undefined) return new Response(null, { status: 202 })
      const result =
        message.method === "initialize"
          ? {
              protocolVersion: message.params.protocolVersion,
              capabilities: { tools: { listChanged: true } },
              serverInfo: { name: "identity-fixture", version: "1" },
            }
          : message.method === "tools/list"
            ? {
                tools: state.names.map((name) => ({
                  name,
                  description: "remote fixture",
                  inputSchema: { type: "object", properties: {} },
                })),
              }
            : { content: [{ type: "text", text: value }] }
      return Response.json(
        { jsonrpc: "2.0", id: message.id, result },
        { headers: { "mcp-session-id": "identity-session" } },
      )
    },
  })
  return {
    url: `${server.url.origin}/mcp`,
    metadata: new URL(`${server.url.origin}/metadata`),
    authCalls,
    state,
    calls,
    async changed(next: readonly string[]) {
      await listening.promise
      state.names = [...next]
      for (const listener of listeners)
        listener.enqueue(
          new TextEncoder().encode(
            'event: message\ndata: {"jsonrpc":"2.0","method":"notifications/tools/list_changed"}\n\n',
          ),
        )
    },
    async [Symbol.asyncDispose]() {
      for (const listener of listeners) listener.close()
      listeners.clear()
      await server.stop(true)
      await issuer?.stop(true)
    },
  }
}

export const document = (file: string | undefined, servers: Record<string, unknown>) =>
  new Config.Document({
    type: "document",
    ...(file ? { path: file } : {}),
    info: Schema.decodeUnknownSync(Config.Info)({ mcp: { servers } }),
  })
export const names = (g: Graph) => g.registry.materialize().pipe(Effect.map((m) => m.definitions.map((d) => d.name)))
export const text = (g: Graph, name: string) =>
  g.registry.materialize().pipe(
    Effect.flatMap((m) => m.settle(g.input(name))),
    Effect.map((s) => s.result),
  )

// Imported only when a future-API acceptance case starts; existing behavioral cases remain independently runnable.
export const identity = Effect.fn(function* (
  f: Workspace,
  options: {
    filename?: string
    digest?: (canonical: string, seed: import("effect").Redacted.Redacted<Uint8Array>) => string
  } = {},
) {
  const { McpIdentity } = yield* Effect.promise(() => import("@orchestra/core/mcp/identity"))
  const { CredentialCipher } = yield* Effect.promise(() => import("@orchestra/core/credential/cipher"))
  const { EffectFlock } = yield* Effect.promise(() => import("@orchestra/core/util/effect-flock"))
  const layer = McpIdentity.layerWith({ filename: f.seed, ...options }).pipe(
    Layer.provide(
      AppNodeBuilder.build(LayerNode.group([Global.node, CredentialCipher.node, EffectFlock.node]), [
        [Global.node, Global.layerWith(f.global)],
      ]),
    ),
  )
  return { McpIdentity, layer, service: Context.get(yield* Layer.build(layer.pipe(Layer.fresh)), McpIdentity.Service) }
})
