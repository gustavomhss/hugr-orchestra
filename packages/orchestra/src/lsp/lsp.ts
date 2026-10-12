import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import * as LSPClient from "./client"
import { LSPOwnership } from "./ownership"
import path from "path"
import { pathToFileURL, fileURLToPath } from "url"
import * as LSPServer from "./server"
import { Config } from "@/config/config"
import { confined, spawn as lspspawn } from "./launch"
import { ToolSafetySandbox } from "@orchestra/core/tool-safety-sandbox"
import { Effect, Layer, Context, Schema } from "effect"
import { InstanceState } from "@/effect/instance-state"
import { containsPath } from "@/project/instance-context"
import { NonNegativeInt } from "@orchestra/core/schema"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { LspEvent } from "@orchestra/schema/lsp-event"
import { CancellationTokenSource } from "vscode-jsonrpc"

export const Event = LspEvent

const Position = Schema.Struct({
  line: NonNegativeInt,
  character: NonNegativeInt,
})

export const Range = Schema.Struct({
  start: Position,
  end: Position,
}).annotate({ identifier: "Range" })
export type Range = typeof Range.Type

export const Symbol = Schema.Struct({
  name: Schema.String,
  kind: NonNegativeInt,
  location: Schema.Struct({
    uri: Schema.String,
    range: Range,
  }),
}).annotate({ identifier: "Symbol" })
export type Symbol = typeof Symbol.Type

export const DocumentSymbol = Schema.Struct({
  name: Schema.String,
  detail: Schema.optional(Schema.String),
  kind: NonNegativeInt,
  range: Range,
  selectionRange: Range,
}).annotate({ identifier: "DocumentSymbol" })
export type DocumentSymbol = typeof DocumentSymbol.Type

export const Status = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  root: Schema.String,
  status: Schema.Literals(["connected", "error"]),
}).annotate({ identifier: "LSPStatus" })
export type Status = typeof Status.Type

enum SymbolKind {
  File = 1,
  Module = 2,
  Namespace = 3,
  Package = 4,
  Class = 5,
  Method = 6,
  Property = 7,
  Field = 8,
  Constructor = 9,
  Enum = 10,
  Interface = 11,
  Function = 12,
  Variable = 13,
  Constant = 14,
  String = 15,
  Number = 16,
  Boolean = 17,
  Array = 18,
  Object = 19,
  Key = 20,
  Null = 21,
  EnumMember = 22,
  Struct = 23,
  Event = 24,
  Operator = 25,
  TypeParameter = 26,
}

const kinds = [
  SymbolKind.Class,
  SymbolKind.Function,
  SymbolKind.Method,
  SymbolKind.Interface,
  SymbolKind.Variable,
  SymbolKind.Constant,
  SymbolKind.Struct,
  SymbolKind.Enum,
]

const filterExperimentalServers = (servers: Record<string, LSPServer.Info>, flags: RuntimeFlags.Info) => {
  if (flags.experimentalLspTy) {
    if (servers["pyright"]) {
      delete servers["pyright"]
    }
  } else {
    if (servers["ty"]) {
      delete servers["ty"]
    }
  }
}

type LocInput = { file: string; line: number; character: number }

export type DiscoveryQuery = LocInput & {
  operation: "goToDefinition" | "findReferences" | "hover" | "documentSymbol" | "workspaceSymbol" | "goToImplementation" | "prepareCallHierarchy" | "incomingCalls" | "outgoingCalls"
  query?: string
}
export type DiscoveryResult = {
  result: unknown[]
  coverage: {
    state: "complete" | "partial" | "unavailable"
    scope: "read-only-active-or-explicit-configured-servers"
    omitted: number
    servers: { id: string; root: string; state: "complete" | "partial" | "unavailable"; reason?: string; documentVersion?: number }[]
  }
}
class DiscoveryQueryError extends Schema.TaggedErrorClass<DiscoveryQueryError>()("LspDiscoveryQueryError", { reason: Schema.String }) {}

interface State {
  closing: boolean
  clients: LSPClient.Info[]
  servers: Record<string, LSPServer.Info>
  broken: Set<string>
  spawning: Map<string, Promise<LSPClient.Info | undefined>>
  configured: Set<string>
}

export interface Interface {
  readonly discoveryQuery: (input: DiscoveryQuery) => Effect.Effect<DiscoveryResult>
  readonly init: () => Effect.Effect<void>
  readonly status: () => Effect.Effect<Status[]>
  readonly hasClients: (file: string) => Effect.Effect<boolean>
  readonly touchFile: (input: string, diagnostics?: "document" | "full") => Effect.Effect<void>
  readonly diagnostics: () => Effect.Effect<Record<string, LSPClient.Diagnostic[]>>
  readonly hover: (input: LocInput) => Effect.Effect<any>
  readonly definition: (input: LocInput) => Effect.Effect<any[]>
  readonly references: (input: LocInput) => Effect.Effect<any[]>
  readonly implementation: (input: LocInput) => Effect.Effect<any[]>
  readonly documentSymbol: (uri: string) => Effect.Effect<(DocumentSymbol | Symbol)[]>
  readonly workspaceSymbol: (query: string) => Effect.Effect<Symbol[]>
  readonly prepareCallHierarchy: (input: LocInput) => Effect.Effect<any[]>
  readonly incomingCalls: (input: LocInput) => Effect.Effect<any[]>
  readonly outgoingCalls: (input: LocInput) => Effect.Effect<any[]>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/LSP") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const flags = yield* RuntimeFlags.Service
    const events = yield* EventV2Bridge.Service

    const state = yield* InstanceState.make<State>(
      Effect.fn("LSP.state")(function* (ctx) {
        const cfg = yield* config.get()

        const servers: Record<string, LSPServer.Info> = {}
        const configured = new Set<string>()

        if (!cfg.lsp) {
          yield* Effect.logInfo("all LSPs are disabled")
        } else {
          for (const server of Object.values(LSPServer)) {
            servers[server.id] = server
          }

          filterExperimentalServers(servers, flags)

          if (cfg.lsp !== true) {
            for (const [name, item] of Object.entries(cfg.lsp)) {
              const existing = servers[name]
              if (item.disabled) {
                yield* Effect.logInfo(`LSP server ${name} is disabled`)
                delete servers[name]
                continue
              }
              servers[name] = {
                ...existing,
                id: name,
                root: existing?.root ?? (async (_file, ctx) => ctx.directory),
                extensions: item.extensions ?? existing?.extensions ?? [],
                // A configured command is trusted like any configured program, unless it runs workspace code: the program
                // lives in the workspace, is a runner (npx, uv run, ...) or is a version-manager shim.
                spawn: async (root) => ({
                  process: (await ToolSafetySandbox.runsWorkspaceCode(ctx.directory, item.command[0], item.command.slice(1), root))
                    ? await confined(item.command[0], item.command.slice(1), { cwd: root, env: { ...process.env, ...item.env } })
                    : lspspawn(item.command[0], item.command.slice(1), { cwd: root, env: { ...process.env, ...item.env } }),
                  initialization: item.initialization,
                }),
              }
              configured.add(name)
            }
          }

          yield* Effect.logInfo("enabled LSP servers", {
            serverIds: Object.values(servers)
              .map((server) => server.id)
              .join(", "),
          })
        }

        const s: State = {
          closing: false,
          clients: [],
          servers,
          broken: new Set(),
          spawning: new Map(),
          configured,
        }

        yield* Effect.addFinalizer(() => Effect.promise(() => LSPOwnership.close(s)))

        return s
      }),
    )

    const getClients = Effect.fnUntraced(function* (file: string, readOnly = false) {
      const ctx = yield* InstanceState.context
      if (!containsPath(file, ctx)) return [] as LSPClient.Info[]
      const s = yield* InstanceState.get(state)
      const clients = yield* Effect.promise(async () => {
        const extension = path.parse(file).ext || file
        const result: LSPClient.Info[] = []
        let updated = 0

        await LSPOwnership.prune(s)
        if (s.closing) return { result, updated }
        for (const server of Object.values(s.servers)) {
          if (readOnly && !s.configured.has(server.id) && !s.clients.some((client) => client.serverID === server.id)) continue
          if (server.extensions.length && !server.extensions.includes(extension)) continue

          const root = await server.root(file, ctx)
          if (s.closing) break
          if (!root) continue
          if (s.broken.has(root + server.id)) continue

          const match = s.clients.find((x) => x.root === root && x.serverID === server.id)
          if (match?.connected) {
            result.push(match)
            continue
          }

          // Discovery never activates an implicit installer. Owner-configured commands and existing clients are usable.
          if (readOnly && !s.configured.has(server.id)) continue

          const inflight = s.spawning.get(root + server.id)
          if (inflight) {
            const client = await inflight
            if (!client) continue
            result.push(client)
            continue
          }

          const task = LSPOwnership.schedule(s, { server, root, key: root + server.id, ctx, flags })
          s.spawning.set(root + server.id, task)

          task.finally(() => {
            if (s.spawning.get(root + server.id) === task) {
              s.spawning.delete(root + server.id)
            }
          })

          const client = await task
          if (!client) continue

          result.push(client)
          updated++
        }

        return { result, updated }
      })
      yield* Effect.forEach(Array.from({ length: clients.updated }), () => events.publish(Event.Updated, {}), {
        discard: true,
      })
      return clients.result
    })

    const run = Effect.fnUntraced(function* <T>(file: string, fn: (client: LSPClient.Info) => Promise<T>) {
      const clients = yield* getClients(file)
      return yield* Effect.promise(() => Promise.all(clients.map((x) => fn(x))))
    })

    const runAll = Effect.fnUntraced(function* <T>(fn: (client: LSPClient.Info) => Promise<T>) {
      const s = yield* InstanceState.get(state)
      return yield* Effect.promise(() => Promise.all(s.clients.filter((client) => client.connected).map((x) => fn(x))))
    })

    const init = Effect.fn("LSP.init")(function* () {
      yield* InstanceState.get(state)
    })

    const status = Effect.fn("LSP.status")(function* () {
      const ctx = yield* InstanceState.context
      const s = yield* InstanceState.get(state)
      const result: Status[] = []
      for (const client of s.clients) {
        result.push({
          id: client.serverID,
          name: s.servers[client.serverID].id,
          root: path.relative(ctx.directory, client.root),
          status: client.connected ? "connected" : "error",
        })
      }
      return result
    })

    const hasClients = Effect.fn("LSP.hasClients")(function* (file: string) {
      const ctx = yield* InstanceState.context
      const s = yield* InstanceState.get(state)
      return yield* Effect.promise(async () => {
        const extension = path.parse(file).ext || file
        for (const server of Object.values(s.servers)) {
          if (server.extensions.length && !server.extensions.includes(extension)) continue
          const root = await server.root(file, ctx)
          if (!root) continue
          if (s.broken.has(root + server.id)) continue
          return true
        }
        return false
      })
    })

    const touchFile = Effect.fn("LSP.touchFile")(function* (input: string, diagnostics?: "document" | "full") {
      yield* Effect.logInfo("touching file", { file: input })
      const clients = yield* getClients(input)
      yield* Effect.promise(() =>
        Promise.all(
          clients.map(async (client) => {
            const after = Date.now()
            const version = await client.notify.open({ path: input })
            if (!diagnostics) return
            return client.waitForDiagnostics({
              path: input,
              version,
              mode: diagnostics,
              after,
            })
          }),
        ).catch(() => {}),
      )
    })

    const diagnostics = Effect.fn("LSP.diagnostics")(function* () {
      const results: Record<string, LSPClient.Diagnostic[]> = {}
      const all = yield* runAll(async (client) => client.diagnostics)
      for (const result of all) {
        for (const [p, diags] of result.entries()) {
          const arr = results[p] || []
          arr.push(...diags)
          results[p] = arr
        }
      }
      return results
    })

    const hover = Effect.fn("LSP.hover")(function* (input: LocInput) {
      return yield* run(input.file, (client) =>
        client.connection
          .sendRequest("textDocument/hover", {
            textDocument: { uri: pathToFileURL(input.file).href },
            position: { line: input.line, character: input.character },
          })
          .catch(() => null),
      )
    })

    const definition = Effect.fn("LSP.definition")(function* (input: LocInput) {
      const results = yield* run(input.file, (client) =>
        client.connection
          .sendRequest("textDocument/definition", {
            textDocument: { uri: pathToFileURL(input.file).href },
            position: { line: input.line, character: input.character },
          })
          .catch(() => null),
      )
      return results.flat().filter(Boolean)
    })

    const references = Effect.fn("LSP.references")(function* (input: LocInput) {
      const results = yield* run(input.file, (client) =>
        client.connection
          .sendRequest("textDocument/references", {
            textDocument: { uri: pathToFileURL(input.file).href },
            position: { line: input.line, character: input.character },
            context: { includeDeclaration: true },
          })
          .catch(() => []),
      )
      return results.flat().filter(Boolean)
    })

    const implementation = Effect.fn("LSP.implementation")(function* (input: LocInput) {
      const results = yield* run(input.file, (client) =>
        client.connection
          .sendRequest("textDocument/implementation", {
            textDocument: { uri: pathToFileURL(input.file).href },
            position: { line: input.line, character: input.character },
          })
          .catch(() => null),
      )
      return results.flat().filter(Boolean)
    })

    const documentSymbol = Effect.fn("LSP.documentSymbol")(function* (uri: string) {
      const file = fileURLToPath(uri)
      const results = yield* run(file, (client) =>
        client.connection.sendRequest("textDocument/documentSymbol", { textDocument: { uri } }).catch(() => []),
      )
      return (results.flat() as (DocumentSymbol | Symbol)[]).filter(Boolean)
    })

    const workspaceSymbol = Effect.fn("LSP.workspaceSymbol")(function* (query: string) {
      const results = yield* runAll((client) =>
        client.connection
          .sendRequest<Symbol[]>("workspace/symbol", { query })
          .then((result) => result.filter((x) => kinds.includes(x.kind)).slice(0, 10))
          .catch(() => [] as Symbol[]),
      )
      return results.flat()
    })

    const prepareCallHierarchy = Effect.fn("LSP.prepareCallHierarchy")(function* (input: LocInput) {
      const results = yield* run(input.file, (client) =>
        client.connection
          .sendRequest("textDocument/prepareCallHierarchy", {
            textDocument: { uri: pathToFileURL(input.file).href },
            position: { line: input.line, character: input.character },
          })
          .catch(() => []),
      )
      return results.flat().filter(Boolean)
    })

    const callHierarchyRequest = Effect.fnUntraced(function* (
      input: LocInput,
      direction: "callHierarchy/incomingCalls" | "callHierarchy/outgoingCalls",
    ) {
      const results = yield* run(input.file, async (client) => {
        const items = await client.connection
          .sendRequest<unknown[] | null>("textDocument/prepareCallHierarchy", {
            textDocument: { uri: pathToFileURL(input.file).href },
            position: { line: input.line, character: input.character },
          })
          .catch(() => [] as unknown[])
        if (!items?.length) return []
        return client.connection.sendRequest(direction, { item: items[0] }).catch(() => [])
      })
      return results.flat().filter(Boolean)
    })

    const incomingCalls = Effect.fn("LSP.incomingCalls")(function* (input: LocInput) {
      return yield* callHierarchyRequest(input, "callHierarchy/incomingCalls")
    })

    const outgoingCalls = Effect.fn("LSP.outgoingCalls")(function* (input: LocInput) {
      return yield* callHierarchyRequest(input, "callHierarchy/outgoingCalls")
    })

    const discoveryQuery = Effect.fn("LSP.discoveryQuery")(function* (input: DiscoveryQuery): Effect.fn.Return<DiscoveryResult> {
      const instance = yield* InstanceState.context
      const s = yield* InstanceState.get(state)
      const expected = yield* Effect.forEach(Object.values(s.servers).filter((server) =>
        (s.configured.has(server.id) || s.clients.some((client) => client.serverID === server.id)) &&
        (!server.extensions.length || server.extensions.includes(path.extname(input.file)))),
        (server) => Effect.tryPromise({ try: () => server.root(input.file, instance), catch: () => new DiscoveryQueryError({ reason: "root_unavailable" }) }).pipe(
          Effect.map((root) => ({ id: server.id, root })),
          Effect.catch(() => Effect.succeed({ id: server.id, root: undefined, failed: true })),
        ))
      const clients = yield* getClients(input.file, true)
      const request = (client: LSPClient.Info, method: string, params: Record<string, unknown>) => Effect.acquireUseRelease(
        Effect.sync(() => new CancellationTokenSource()),
        (token) => Effect.tryPromise({ try: (signal) => {
          const abort = () => token.cancel()
          signal.addEventListener("abort", abort, { once: true })
          return client.connection.sendRequest<unknown>(method, params, token.token).finally(() => signal.removeEventListener("abort", abort))
        }, catch: () => new DiscoveryQueryError({ reason: "request_failed" }) }).pipe(
          Effect.timeoutOrElse({ duration: "20 seconds", orElse: () => Effect.fail(new DiscoveryQueryError({ reason: "query_timeout" })) }),
        ),
        (token) => Effect.sync(() => token.dispose()),
      )
      const results = yield* Effect.forEach(clients, (client) => Effect.gen(function* () {
        const documentVersion = yield* Effect.tryPromise({ try: () => client.notify.open({ path: input.file }),
          catch: () => new DiscoveryQueryError({ reason: "document_open_failed" }) })
        const params = { textDocument: { uri: pathToFileURL(input.file).href }, position: { line: input.line, character: input.character } }
        const method = {
          goToDefinition: "textDocument/definition", findReferences: "textDocument/references", hover: "textDocument/hover",
          documentSymbol: "textDocument/documentSymbol", workspaceSymbol: "workspace/symbol", goToImplementation: "textDocument/implementation",
          prepareCallHierarchy: "textDocument/prepareCallHierarchy", incomingCalls: "textDocument/prepareCallHierarchy", outgoingCalls: "textDocument/prepareCallHierarchy",
        }[input.operation]
        const raw = yield* request(client, method, input.operation === "workspaceSymbol" ? { query: input.query ?? "" }
          : input.operation === "findReferences" ? { ...params, context: { includeDeclaration: true } } : params)
        const items = raw === null ? [] : Array.isArray(raw) ? raw : [raw]
        const hierarchy = input.operation === "incomingCalls" || input.operation === "outgoingCalls"
        const values = hierarchy ? (yield* Effect.forEach(items.slice(0, 16), (item) => request(client,
          input.operation === "incomingCalls" ? "callHierarchy/incomingCalls" : "callHierarchy/outgoingCalls", { item }), { concurrency: 4 }))
          .flatMap((value) => value === null ? [] : Array.isArray(value) ? value : [value]) : items
        const omitted = Math.max(0, values.length - 100) + (hierarchy ? Math.max(0, items.length - 16) : 0)
        return { result: values.slice(0, 100), omitted, server: { id: client.serverID, root: client.root,
          state: omitted ? "partial" as const : "complete" as const, documentVersion } }
      }).pipe(Effect.catch((error) => Effect.succeed({ result: [], omitted: 0,
        server: { id: client.serverID, root: client.root, state: "unavailable" as const, reason: error.reason } }))), { concurrency: 4 })
      const missing = expected.flatMap((server) => server.root === undefined && !("failed" in server) ? []
        : clients.some((client) => client.serverID === server.id && client.root === server.root) ? []
        : [{ id: server.id, root: server.root ?? instance.directory, state: "unavailable" as const,
          reason: "failed" in server ? "root_unavailable" : "client_unavailable" }])
      const servers = [...results.map((value) => value.server), ...missing]
      return { result: results.flatMap((value) => value.result), coverage: {
        state: !servers.length || servers.every((server) => server.state === "unavailable") ? "unavailable"
          : servers.every((server) => server.state === "complete") ? "complete" : "partial",
        scope: "read-only-active-or-explicit-configured-servers", omitted: results.reduce((total, value) => total + value.omitted, 0), servers,
      } }
    })

    return Service.of({
      discoveryQuery,
      init,
      status,
      hasClients,
      touchFile,
      diagnostics,
      hover,
      definition,
      references,
      implementation,
      documentSymbol,
      workspaceSymbol,
      prepareCallHierarchy,
      incomingCalls,
      outgoingCalls,
    })
  }),
)

export * as Diagnostic from "./diagnostic"

export const node = LayerNode.make({
  service: Service,
  layer: layer,
  deps: [Config.node, RuntimeFlags.node, FSUtil.node, EventV2Bridge.node],
})

export * as LSP from "./lsp"
