export * as Mcp from "./mcp"

// The Location's MCP servers: connects the configured servers, adds their tools to the Location's tool registry behind
// V2 permissions, lists and reads their resources and prompts, and edits the profile's own config files. Remote servers
// connect with the OAuth tokens V1 stored (`mcp-auth.json`); one without valid tokens reports `needs_auth` until a
// sign-in completes.

import path from "node:path"
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js"
import type { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import {
  CallToolResultSchema,
  ToolListChangedNotificationSchema,
  type CallToolResult,
  type ListToolsResult,
  type ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js"
import { ToolFailure, type ToolContent } from "@orchestra/llm"
import { ConfigMCP } from "@orchestra/schema/config-mcp"
import { Mcp } from "@orchestra/schema/mcp"
import { Context, Deferred, Duration, Effect, Exit, Layer, Schema, Scope } from "effect"
import { Config } from "./config"
import { makeLocationNode } from "./effect/app-node"
import { FSUtil } from "./fs-util"
import { Location } from "./location"
import { McpAuth } from "./mcp/auth"
import { McpCatalog } from "./mcp/catalog"
import { McpClient } from "./mcp/client"
import { McpOAuthCallback } from "./mcp/oauth-callback"
import { McpOAuthPendingProvider, McpOAuthProvider, OAUTH_CALLBACK_PATH } from "./mcp/oauth-provider"
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

export class AuthError extends Schema.TaggedErrorClass<AuthError>()("Mcp.AuthError", {
  message: Schema.String,
}) {}

export class RequestError extends Schema.TaggedErrorClass<RequestError>()("Mcp.RequestError", {
  message: Schema.String,
}) {}

/** One prompt a connected server offers, with the server that offers it. */
export type Prompt = Awaited<ReturnType<typeof McpCatalog.prompts>>[number] & { server: string }

export interface Interface {
  /**
   * Starts the configured servers on first use and waits until each one connected or failed. Servers start lazily, as
   * in V1, so a process that opens Locations without running V2 turns, such as the V1 server, never spawns them.
   */
  readonly ready: () => Effect.Effect<void>
  readonly list: () => Effect.Effect<Mcp.Server[]>
  readonly connect: (name: string) => Effect.Effect<void, NotFoundError>
  readonly disconnect: (name: string) => Effect.Effect<void, NotFoundError>
  /** Writes the server into the profile's own config file, then connects it. */
  readonly add: (name: string, config: ConfigMCP.Local | ConfigMCP.Remote) => Effect.Effect<void, ConfigError>
  /** Removes the server from every profile file that defines it, then disconnects it. */
  readonly remove: (name: string) => Effect.Effect<void, NotFoundError | ConfigError>
  /** Each configured server's resolved transport and endpoint; headers, environment and OAuth never leave core. */
  readonly config: () => Effect.Effect<Record<string, Mcp.Entry>>
  /** Each server of the profile's own config files exactly as written, so `{env:...}` references stay unresolved. */
  readonly entries: () => Effect.Effect<Record<string, Mcp.Entry>, ConfigError>
  /** The tool names of each connected server that lists tools. */
  readonly tools: () => Effect.Effect<Record<string, string[]>>
  /** The resources and resource templates of the connected servers. */
  readonly resources: () => Effect.Effect<Mcp.ResourceCatalog>
  /** Reads a resource by URI from the connected server that lists it; undefined when no connected server lists it. */
  readonly readResource: (uri: string) => Effect.Effect<ReadResourceResult["contents"] | undefined, RequestError>
  /** The prompts of the connected servers. */
  readonly prompts: () => Effect.Effect<Prompt[]>
  /** Renders a server's prompt with its arguments and returns the text of its messages. */
  readonly getPrompt: (
    server: string,
    name: string,
    args: Record<string, string>,
  ) => Effect.Effect<string, NotFoundError | RequestError>
  /**
   * Starts an OAuth sign-in for a remote server and returns the URL the owner opens. The local callback server
   * completes the sign-in in the background and reconnects the server; an already authorized server reconnects at once
   * and returns an empty URL.
   */
  readonly startAuth: (name: string) => Effect.Effect<Mcp.AuthStart, NotFoundError | AuthError>
  /** Completes a started sign-in with an authorization code the caller received, then reconnects the server. */
  readonly finishAuth: (name: string, code: string) => Effect.Effect<Mcp.Status, NotFoundError | AuthError>
  /** Forgets the server's stored OAuth credentials and cancels a sign-in in progress. */
  readonly removeAuth: (name: string) => Effect.Effect<void, NotFoundError>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/Mcp") {}

type Entry = {
  status: Mcp.Status
  client?: Client
  // Holds the server's tool registrations; closing it removes them.
  tools?: Scope.Closeable
  // The names of the tools the server listed, while it is connected.
  toolNames?: string[]
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
    const auth = yield* McpAuth.Service
    const layerScope = yield* Scope.Scope
    const entries = new Map<string, Entry>()
    // Sign-ins waiting for their authorization code, by server.
    const pending = new Map<string, { transport: StreamableHTTPClientTransport; provider: McpOAuthPendingProvider }>()
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
      current.toolNames = undefined
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
      if (!client) {
        current.status = opened.status
        return
      }
      const listed = client.getServerCapabilities()?.tools ? yield* McpCatalog.defs(client, request) : []
      if (current.generation !== generation) return yield* Effect.promise(() => client.close().catch(() => undefined))
      // Connected is reported only once the server's tools are in the registry.
      current.client = client
      current.tools = yield* register(name, client, listed ?? [], request)
      current.toolNames = (listed ?? []).map((def) => def.name)
      current.status = opened.status
      client.onclose = () => {
        if (current.client !== client) return
        const scope = current.tools
        current.client = undefined
        current.tools = undefined
        current.toolNames = undefined
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
            current.toolNames = defs.map((def) => def.name)
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
      // Stored tokens authorize the connection; a server without them fails unauthorized instead of redirecting.
      const init = {
        ...(server.oauth === false
          ? {}
          : { authProvider: new McpOAuthProvider(name, server.url, oauthConfig(server), { onRedirect: () => {} }, auth) }),
        ...(server.headers ? { requestInit: { headers: server.headers } } : {}),
      }
      const oauth = server.oauth !== false
      const streamable = yield* attach(new StreamableHTTPClientTransport(url, init), startup).pipe(Effect.result)
      if (streamable._tag === "Success")
        return { client: streamable.success, status: { status: "connected" } as Mcp.Status }
      const denied = authStatus(streamable.failure, oauth)
      if (denied) return { client: undefined, status: denied }
      return yield* attach(new SSEClientTransport(url, init), startup).pipe(
        Effect.map((client) => ({ client, status: { status: "connected" } as Mcp.Status })),
        Effect.catch((error) =>
          Effect.succeed({ client: undefined, status: authStatus(error, oauth) ?? failed(error.message) }),
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
      yield* ready()
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

    const resolved = Effect.fn("Mcp.config")(function* () {
      return Object.fromEntries(
        Array.from((yield* configured()).servers, ([name, server]): [string, Mcp.Entry] => [
          name,
          server.type === "local" ? { type: "local", command: [...server.command] } : { type: "remote", url: server.url },
        ]),
      )
    })

    const profile = Effect.fn("Mcp.entries")(function* () {
      return yield* McpProjectConfig.entries(location.directory).pipe(
        Effect.provideService(FSUtil.Service, fs),
        Effect.mapError((error) => new ConfigError({ message: error.message })),
      )
    })

    const inventory = Effect.fn("Mcp.tools")(function* () {
      yield* ready()
      return Object.fromEntries(
        Array.from(entries).flatMap(([name, current]) =>
          current.client && current.toolNames ? [[name, current.toolNames] as const] : [],
        ),
      )
    })

    const connected = () =>
      Array.from(entries).flatMap(([server, current]) => (current.client ? [{ server, client: current.client }] : []))

    const resources = Effect.fn("Mcp.resources")(function* () {
      yield* ready()
      const listed = yield* Effect.forEach(
        connected(),
        (item) =>
          Effect.all([
            Effect.tryPromise(() => McpCatalog.resources(item.client, DEFAULT_TIMEOUT)).pipe(Effect.orElseSucceed(() => [])),
            Effect.tryPromise(() => McpCatalog.resourceTemplates(item.client, DEFAULT_TIMEOUT)).pipe(
              Effect.orElseSucceed(() => []),
            ),
          ]).pipe(
            Effect.map(([found, templates]) => ({
              resources: found.map((resource) => ({
                server: item.server,
                name: resource.name,
                uri: resource.uri,
                ...described(resource),
              })),
              templates: templates.map((template) => ({
                server: item.server,
                name: template.name,
                uriTemplate: template.uriTemplate,
                ...described(template),
              })),
            })),
          ),
        { concurrency: "unbounded" },
      )
      return {
        resources: listed.flatMap((item) => item.resources),
        templates: listed.flatMap((item) => item.templates),
      }
    })

    const readResource = Effect.fn("Mcp.readResource")(function* (uri: string) {
      const owner = (yield* resources()).resources.find((resource) => resource.uri === uri)
      const client = owner && entries.get(owner.server)?.client
      if (!client) return undefined
      const result = yield* Effect.tryPromise({
        try: () => client.readResource({ uri }, { timeout: DEFAULT_TIMEOUT }),
        catch: (error) => new RequestError({ message: messageOf(error) }),
      })
      return result.contents
    })

    const prompts = Effect.fn("Mcp.prompts")(function* () {
      yield* ready()
      const listed = yield* Effect.forEach(
        connected(),
        (item) =>
          Effect.tryPromise(() => McpCatalog.prompts(item.client, DEFAULT_TIMEOUT)).pipe(
            Effect.map((found) => found.map((prompt) => ({ ...prompt, server: item.server }))),
            Effect.orElseSucceed(() => []),
          ),
        { concurrency: "unbounded" },
      )
      return listed.flat()
    })

    const getPrompt = Effect.fn("Mcp.getPrompt")(function* (server: string, name: string, args: Record<string, string>) {
      yield* ready()
      const client = entries.get(server)?.client
      if (!client) return yield* new NotFoundError({ name: server })
      const result = yield* Effect.tryPromise({
        try: () => client.getPrompt({ name, arguments: args }, { timeout: DEFAULT_TIMEOUT }),
        catch: (error) => new RequestError({ message: messageOf(error) }),
      })
      return result.messages.map((message) => (message.content.type === "text" ? message.content.text : "")).join("\n")
    })

    const abandon = (name: string) =>
      Effect.suspend(() => {
        McpOAuthCallback.cancelPending(name)
        const flow = pending.get(name)
        pending.delete(name)
        return flow ? Effect.promise(() => flow.transport.close().catch(() => undefined)) : Effect.void
      })

    const startAuth = Effect.fn("Mcp.startAuth")(function* (name: string) {
      const server = (yield* configured()).servers.get(name)
      if (!server) return yield* new NotFoundError({ name })
      if (server.type !== "remote" || server.oauth === false)
        return yield* new AuthError({ message: `MCP server ${name} does not support OAuth` })
      if (!URL.canParse(server.url)) return yield* new AuthError({ message: `Invalid MCP URL for "${name}"` })
      // A newer sign-in replaces an unfinished one; cancel before the callback server starts, since an idle one stops.
      yield* abandon(name)
      const config = oauthConfig(server)
      const redirectUri =
        config.redirectUri ??
        (config.callbackPort ? `http://127.0.0.1:${config.callbackPort}${OAUTH_CALLBACK_PATH}` : undefined)
      yield* Effect.tryPromise({
        try: () => McpOAuthCallback.ensureRunning(redirectUri),
        catch: (error) => new AuthError({ message: `OAuth callback server failed: ${messageOf(error)}` }),
      })
      const oauthState = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("")
      yield* auth.updateOAuthState(name, oauthState)
      const redirect: { url?: URL } = {}
      const provider = new McpOAuthPendingProvider(
        name,
        server.url,
        { ...config, redirectUri },
        { onRedirect: (url) => void (redirect.url = url) },
        auth,
      )
      const transport = new StreamableHTTPClientTransport(new URL(server.url), {
        authProvider: provider,
        ...(server.headers ? { requestInit: { headers: server.headers } } : {}),
      })
      const client = McpClient.createClient(location.directory)
      const attempt = yield* Effect.tryPromise({ try: () => client.connect(transport), catch: (error) => error }).pipe(
        Effect.result,
      )
      if (attempt._tag === "Success") {
        yield* Effect.promise(() => provider.commit())
        yield* Effect.promise(() => client.close().catch(() => undefined))
        yield* auth.clearOAuthState(name)
        yield* connect(name).pipe(Effect.ignore)
        return { authorizationUrl: "", oauthState }
      }
      if (!(attempt.failure instanceof UnauthorizedError) || !redirect.url) {
        yield* Effect.promise(() => transport.close().catch(() => undefined))
        return yield* new AuthError({ message: messageOf(attempt.failure) })
      }
      pending.set(name, { transport, provider })
      // The browser's redirect reaches the local callback server; completion runs in the Location's scope, so the
      // request that started the sign-in may end first.
      yield* Effect.tryPromise(() => McpOAuthCallback.waitForCallback(oauthState, name)).pipe(
        Effect.flatMap((code) =>
          Effect.gen(function* () {
            const stored = yield* auth.getOAuthState(name)
            yield* auth.clearOAuthState(name)
            if (stored !== oauthState) return yield* new AuthError({ message: "OAuth state mismatch" })
            return yield* finishAuth(name, code)
          }),
        ),
        Effect.ignore,
        Effect.forkIn(layerScope),
      )
      return { authorizationUrl: redirect.url.toString(), oauthState }
    })

    const finishAuth = Effect.fn("Mcp.finishAuth")(function* (name: string, code: string) {
      if (!(yield* configured()).servers.has(name)) return yield* new NotFoundError({ name })
      const flow = pending.get(name)
      if (!flow) return yield* new AuthError({ message: `No pending OAuth flow for MCP server: ${name}` })
      pending.delete(name)
      McpOAuthCallback.cancelPending(name)
      const finished = yield* Effect.tryPromise({
        try: () => flow.transport.finishAuth(code),
        catch: (error) => error,
      }).pipe(Effect.result)
      yield* Effect.promise(() => flow.transport.close().catch(() => undefined))
      if (finished._tag === "Failure") return failed(`OAuth completion failed: ${messageOf(finished.failure)}`)
      yield* Effect.promise(() => flow.provider.commit())
      yield* auth.clearCodeVerifier(name)
      yield* connect(name)
      return entries.get(name)?.status ?? ({ status: "disabled" } as Mcp.Status)
    })

    const removeAuth = Effect.fn("Mcp.removeAuth")(function* (name: string) {
      if (!(yield* configured()).servers.has(name)) return yield* new NotFoundError({ name })
      yield* abandon(name)
      yield* auth.remove(name)
    })

    yield* Effect.addFinalizer(() =>
      Effect.all([
        Effect.forEach(Array.from(pending.keys()), abandon, { discard: true }),
        Effect.forEach(entries.values(), (current) => release(current), { concurrency: "unbounded", discard: true }),
      ]).pipe(Effect.asVoid),
    )
    const started = yield* Deferred.make<void>()
    let starting = false
    // The first caller forks the start into the Location's scope, so its interruption never abandons a half start.
    // The fork starts immediately: with no server to connect, the start finishes without a scheduler hop, so a
    // drain woken by a prompt still reaches its provider turn before the prompt returns.
    const ready = () =>
      Effect.suspend(() => {
        if (starting) return Deferred.await(started)
        starting = true
        return configured().pipe(
          Effect.flatMap((found) =>
            Effect.forEach(found.servers.keys(), (name) => connect(name).pipe(Effect.ignore), {
              concurrency: "unbounded",
              discard: true,
            }),
          ),
          Effect.ensuring(Deferred.succeed(started, undefined)),
          Effect.forkIn(layerScope, { startImmediately: true }),
          Effect.andThen(Deferred.await(started)),
        )
      })

    return Service.of({
      ready,
      list,
      connect,
      disconnect,
      add,
      remove,
      config: resolved,
      entries: profile,
      tools: inventory,
      resources,
      readResource,
      prompts,
      getPrompt,
      startAuth,
      finishAuth,
      removeAuth,
    })
  }),
)

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [Config.node, Location.node, ToolRegistry.toolsNode, PermissionV2.node, FSUtil.node, McpAuth.node],
})

function failed(error: string): Mcp.Status {
  return { status: "failed", error }
}

function unauthorized(error: Error) {
  return error.name === "UnauthorizedError" || /\b401\b|unauthorized/i.test(error.message)
}

// As V1: an OAuth failure needs a sign-in, unless the server cannot register a client and needs a configured client ID.
function authStatus(error: Error, oauth: boolean): Mcp.Status | undefined {
  if (!unauthorized(error) && !(oauth && error.message.includes("OAuth"))) return undefined
  if (/registration|client_id/.test(error.message))
    return {
      status: "needs_client_registration",
      error: "The server does not support dynamic client registration. Set oauth.client_id in its MCP config.",
    }
  return { status: "needs_auth" }
}

function oauthConfig(server: ConfigMCP.Remote) {
  const oauth = server.oauth === false ? undefined : server.oauth
  return {
    clientId: oauth?.client_id,
    clientSecret: oauth?.client_secret,
    scope: oauth?.scope,
    callbackPort: oauth?.callback_port,
    redirectUri: oauth?.redirect_uri,
  }
}

function described(item: { description?: string; mimeType?: string }) {
  return {
    ...(item.description === undefined ? {} : { description: item.description }),
    ...(item.mimeType === undefined ? {} : { mimeType: item.mimeType }),
  }
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error)
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
