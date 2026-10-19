export * as Mcp from "./mcp"

// The Location's MCP servers: connects the configured servers, adds their tools to the Location's tool registry behind
// V2 permissions, and edits the profile's own config files. Remote servers connect without OAuth: one that asks for it
// reports `needs_auth`.

import path from "node:path"
import type { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import {
  CallToolResultSchema,
  ToolListChangedNotificationSchema,
  type CallToolResult,
  type ListToolsResult,
} from "@modelcontextprotocol/sdk/types.js"
import { ToolFailure, type ToolContent } from "@orchestra/llm"
import { ConfigMCP } from "@orchestra/schema/config-mcp"
import { Mcp } from "@orchestra/schema/mcp"
import { Context, Duration, Effect, Exit, Layer, Schema, Scope } from "effect"
import { Config } from "./config"
import { makeLocationNode } from "./effect/app-node"
import { FSUtil } from "./fs-util"
import { Location } from "./location"
import { McpCatalog } from "./mcp/catalog"
import { McpClient } from "./mcp/client"
import { McpProjectConfig } from "./mcp/project-config"
import { McpStdio } from "./mcp/stdio"
import { PermissionV2 } from "./permission"
import { ToolRegistry } from "./tool/registry"
import { Tool } from "./tool/tool"
import { Tools } from "./tool/tools"

const DEFAULT_TIMEOUT = 30_000

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("Mcp.NotFoundError", {
  name: Schema.String,
}) {}

export class ConfigError extends Schema.TaggedErrorClass<ConfigError>()("Mcp.ConfigError", {
  message: Schema.String,
}) {}

export interface Interface {
  readonly list: () => Effect.Effect<Mcp.Server[]>
  readonly connect: (name: string) => Effect.Effect<void, NotFoundError>
  readonly disconnect: (name: string) => Effect.Effect<void, NotFoundError>
  /** Writes the server into the profile's own config file, then connects it. */
  readonly add: (name: string, config: ConfigMCP.Local | ConfigMCP.Remote) => Effect.Effect<void, ConfigError>
  /** Removes the server from every profile file that defines it, then disconnects it. */
  readonly remove: (name: string) => Effect.Effect<void, NotFoundError | ConfigError>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/Mcp") {}

type Entry = {
  status: Mcp.Status
  client?: Client
  // Holds the server's tool registrations; closing it removes them.
  tools?: Scope.Closeable
  // Bumped by every connect and disconnect; an attempt that finishes under a newer generation is stale.
  generation: number
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const location = yield* Location.Service
    const tools = yield* Tools.Service
    const permission = yield* PermissionV2.Service
    const fs = yield* FSUtil.Service
    const entries = new Map<string, Entry>()
    // Project config documents are read once per Location open; servers added or removed here overlay them.
    const added = new Map<string, ConfigMCP.Local | ConfigMCP.Remote>()
    const removed = new Set<string>()

    const configured = Effect.fnUntraced(function* () {
      const documents = (yield* config.entries()).filter((entry): entry is Config.Document => entry.type === "document")
      const servers = new Map(documents.flatMap((document) => Object.entries(document.info.mcp?.servers ?? {})))
      for (const [name, server] of added) servers.set(name, server)
      for (const name of removed) servers.delete(name)
      return { servers, timeout: Config.latest(documents, "mcp")?.timeout }
    })

    const entry = (name: string) => {
      const existing = entries.get(name)
      if (existing) return existing
      const created: Entry = { status: { status: "disabled" }, generation: 0 }
      entries.set(name, created)
      return created
    }

    const release = (current: Entry) => {
      const client = current.client
      const scope = current.tools
      current.client = undefined
      current.tools = undefined
      return Effect.all([
        scope ? Scope.close(scope, Exit.void) : Effect.void,
        client ? Effect.promise(() => client.close().catch(() => undefined)) : Effect.void,
      ]).pipe(Effect.asVoid)
    }

    const register = Effect.fnUntraced(function* (
      name: string,
      client: Client,
      defs: ListToolsResult["tools"],
      timeout: number,
    ) {
      const scope = yield* Scope.make()
      // One registration per tool, so a tool whose name the registry refuses leaves the others available.
      yield* Effect.forEach(
        defs,
        (def) =>
          tools
            .register({ [McpCatalog.toolName(name, def.name)]: mcpTool(name, client, def, timeout) })
            .pipe(Effect.ignore),
        { discard: true },
      ).pipe(Scope.provide(scope))
      return scope
    })

    const mcpTool = (server: string, client: Client, def: ListToolsResult["tools"][number], timeout: number) =>
      Tool.dynamic({
        description: def.description ?? "",
        inputSchema: { ...def.inputSchema, type: "object", properties: def.inputSchema.properties ?? {} },
        execute: (input, context) =>
          Effect.gen(function* () {
            yield* permission.assert({
              action: McpCatalog.toolName(server, def.name),
              resources: ["*"],
              save: ["*"],
              metadata: { server, tool: def.name },
              sessionID: context.sessionID,
              agent: context.agent,
              source: { type: "tool", messageID: context.assistantMessageID, callID: context.toolCallID },
            })
            const result = yield* Effect.tryPromise((signal) =>
              client.callTool(
                { name: def.name, arguments: isObject(input) ? input : {} },
                CallToolResultSchema,
                // The MCP SDK only sends a progress token when `onprogress` is set, which enables timeout resets.
                { signal, timeout, resetTimeoutOnProgress: true, onprogress: () => {} },
              ),
            )
            if (result.isError) return yield* Effect.fail(new Error(text(result) || "MCP tool returned an error"))
            return { structured: result.structuredContent ?? {}, content: content(result) }
          }).pipe(Effect.mapError((error) => new ToolFailure({ message: error.message }))),
      })

    const connect = Effect.fn("Mcp.connect")(function* (name: string) {
      const found = yield* configured()
      const server = found.servers.get(name)
      if (!server) return yield* new NotFoundError({ name })
      const current = entry(name)
      const generation = ++current.generation
      yield* release(current)
      if (server.disabled) {
        current.status = { status: "disabled" }
        return
      }
      const startup = server.timeout?.startup ?? found.timeout?.startup ?? DEFAULT_TIMEOUT
      const request = server.timeout?.request ?? found.timeout?.request ?? DEFAULT_TIMEOUT
      const opened = yield* open(name, server, startup)
      const client = opened.client
      if (current.generation !== generation) {
        if (client) yield* Effect.promise(() => client.close().catch(() => undefined))
        return
      }
      current.status = opened.status
      if (!client) return
      current.client = client
      const listed = client.getServerCapabilities()?.tools ? yield* McpCatalog.defs(client, request) : []
      current.tools = yield* register(name, client, listed ?? [], request)
      client.onclose = () => {
        if (current.client !== client) return
        const scope = current.tools
        current.client = undefined
        current.tools = undefined
        current.status = { status: "failed", error: "Connection closed" }
        if (scope) Effect.runFork(Scope.close(scope, Exit.void))
      }
      if (!client.getServerCapabilities()?.tools) return
      client.setNotificationHandler(ToolListChangedNotificationSchema, () =>
        Effect.runPromise(
          Effect.gen(function* () {
            if (current.client !== client) return
            const defs = yield* McpCatalog.defs(client, request)
            if (!defs || current.client !== client) return
            const previous = current.tools
            current.tools = yield* register(name, client, defs, request)
            if (previous) yield* Scope.close(previous, Exit.void)
          }),
        ),
      )
    })

    const open = Effect.fnUntraced(function* (name: string, server: ConfigMCP.Local | ConfigMCP.Remote, startup: number) {
      if (server.type === "local") {
        const transport = new McpStdio.OmniStdioTransport({
          command: server.command[0] ?? "",
          args: server.command.slice(1),
          cwd: server.cwd ? path.resolve(location.directory, server.cwd) : location.directory,
          env: { ...process.env, ...server.environment },
          log: (line) => Effect.runFork(Effect.logDebug("MCP stderr", { server: name, line })),
        })
        return yield* attach(transport, startup).pipe(
          Effect.map((client) => ({ client, status: { status: "connected" } as Mcp.Status })),
          Effect.catch((error) =>
            Effect.succeed({ client: undefined, status: failed(McpStdio.failure(transport, error)) }),
          ),
        )
      }
      if (!URL.canParse(server.url)) return { client: undefined, status: failed(`Invalid MCP URL for "${name}"`) }
      const url = new URL(server.url)
      const init = server.headers ? { requestInit: { headers: server.headers } } : undefined
      const streamable = yield* attach(new StreamableHTTPClientTransport(url, init), startup).pipe(Effect.result)
      if (streamable._tag === "Success")
        return { client: streamable.success, status: { status: "connected" } as Mcp.Status }
      if (unauthorized(streamable.failure)) return { client: undefined, status: { status: "needs_auth" } as Mcp.Status }
      return yield* attach(new SSEClientTransport(url, init), startup).pipe(
        Effect.map((client) => ({ client, status: { status: "connected" } as Mcp.Status })),
        Effect.catch((error) =>
          Effect.succeed({
            client: undefined,
            status: unauthorized(error) ? ({ status: "needs_auth" } as Mcp.Status) : failed(error.message),
          }),
        ),
      )
    })

    // Connects a client over the transport; on failure the transport is closed, on success the client owns it.
    const attach = (transport: Transport, startup: number) =>
      Effect.tryPromise({
        try: () => {
          const client = McpClient.createClient(location.directory)
          return client.connect(transport).then(() => client)
        },
        catch: (error) => (error instanceof Error ? error : new Error(String(error))),
      }).pipe(
        Effect.timeoutOrElse({
          duration: Duration.millis(startup),
          orElse: () => Effect.fail(new Error(`MCP server did not start within ${startup} ms`)),
        }),
        Effect.tapError(() => Effect.promise(() => transport.close().catch(() => undefined))),
      )

    const disconnect = Effect.fn("Mcp.disconnect")(function* (name: string) {
      if (!(yield* configured()).servers.has(name)) return yield* new NotFoundError({ name })
      const current = entry(name)
      current.generation++
      yield* release(current)
      current.status = { status: "disabled" }
    })

    const list = Effect.fn("Mcp.list")(function* () {
      return Array.from((yield* configured()).servers.keys(), (name) => ({
        name,
        status: entries.get(name)?.status ?? { status: "disabled" as const },
      }))
    })

    const add = Effect.fn("Mcp.add")(function* (name: string, server: ConfigMCP.Local | ConfigMCP.Remote) {
      if (!McpProjectConfig.validName(name)) return yield* new ConfigError({ message: `Invalid MCP server name: ${name}` })
      yield* McpProjectConfig.write(location.directory, name, legacy(server)).pipe(
        Effect.provideService(FSUtil.Service, fs),
        Effect.mapError((error) => new ConfigError({ message: error.message })),
      )
      added.set(name, server)
      removed.delete(name)
      yield* connect(name).pipe(Effect.ignore)
    })

    const remove = Effect.fn("Mcp.remove")(function* (name: string) {
      const files = yield* McpProjectConfig.remove(location.directory, name).pipe(
        Effect.provideService(FSUtil.Service, fs),
        Effect.mapError((error) => new ConfigError({ message: error.message })),
      )
      if (files.length === 0 && !added.has(name)) return yield* new NotFoundError({ name })
      added.delete(name)
      removed.add(name)
      const current = entries.get(name)
      entries.delete(name)
      if (current) {
        current.generation++
        yield* release(current)
      }
    })

    yield* Effect.addFinalizer(() =>
      Effect.forEach(entries.values(), (current) => release(current), { concurrency: "unbounded", discard: true }),
    )
    // Servers connect in the background so a slow server never delays the Location's other services.
    yield* Effect.forEach(
      (yield* configured()).servers.keys(),
      (name) => connect(name).pipe(Effect.ignore),
      { concurrency: "unbounded", discard: true },
    ).pipe(Effect.forkScoped)

    return Service.of({ list, connect, disconnect, add, remove })
  }),
)

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [Config.node, Location.node, ToolRegistry.toolsNode, PermissionV2.node, FSUtil.node],
})

function failed(error: string): Mcp.Status {
  return { status: "failed", error }
}

function unauthorized(error: Error) {
  return error.name === "UnauthorizedError" || /\b401\b|unauthorized/i.test(error.message)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function text(result: CallToolResult) {
  return result.content
    .flatMap((item) => (item.type === "text" && item.text.trim() ? [item.text] : []))
    .join("\n\n")
}

function content(result: CallToolResult): ToolContent[] {
  if (result.content.length === 0 && result.structuredContent !== undefined)
    return [{ type: "text", text: JSON.stringify(result.structuredContent) }]
  return result.content.map((item): ToolContent => {
    if (item.type === "text") return { type: "text", text: item.text }
    if (item.type === "image" || item.type === "audio")
      return { type: "file", uri: `data:${item.mimeType};base64,${item.data}`, mime: item.mimeType }
    return { type: "text", text: JSON.stringify(item) }
  })
}

function legacy(server: ConfigMCP.Local | ConfigMCP.Remote): McpProjectConfig.Written {
  const enabled = server.disabled === undefined ? {} : { enabled: !server.disabled }
  if (server.type === "local")
    return {
      type: "local",
      command: [...server.command],
      ...(server.cwd === undefined ? {} : { cwd: server.cwd }),
      ...(server.environment === undefined ? {} : { environment: server.environment }),
      ...enabled,
    }
  return {
    type: "remote",
    url: server.url,
    ...(server.headers === undefined ? {} : { headers: server.headers }),
    ...enabled,
  }
}
