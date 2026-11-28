// Servers a product module provides in process (McpProvided) connect without config, join the tool registry, and leave
// it when the module stops listing them; a new key reconnects the server behind the same name.
import fs from "fs/promises"
import os from "os"
import { describe, expect, test } from "bun:test"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import { Cause, Deferred, Effect, Exit, Fiber, Layer } from "effect"
import { makeLocationNode } from "@orchestra/core/effect/app-node"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { LocationServiceMap } from "@orchestra/core/location-services"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { Mcp } from "@orchestra/core/mcp"
import { AgentV2 } from "@orchestra/core/agent"
import { PermissionV2 } from "@orchestra/core/permission"
import { SessionMessage } from "@orchestra/core/session/message"
import { McpProvided } from "@orchestra/core/mcp/provided"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionExecutionLocal } from "@orchestra/core/session/execution/local"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"
import { Database } from "../src/database/database"
import { EventV2 } from "../src/event"
import { ApplicationTools } from "../src/tool/application-tools"
import { ToolRegistry } from "../src/tool/registry"
import { Tools } from "../src/tool/tools"

const listed: McpProvided.Server[] = []
const connects: string[] = []
const calls: string[] = []
const permissions: PermissionV2.AssertInput[] = []
const active = new Map<string, Server>()
const advertised = new Map<string, string[]>()
let pause: { entered: Deferred.Deferred<void>; release: Deferred.Deferred<void> } | undefined
const registrationLayer = Layer.effect(Tools.Service, Effect.gen(function* () {
  const registry = yield* ToolRegistry.Service
  return Tools.Service.of({
    register: registry.register,
    registerMcp: (authority, raw, make) => Effect.gen(function* () {
      const id = yield* registry.registerMcp(authority, raw, make)
      const barrier = pause
      if (barrier && authority.kind === "provided" && authority.name === "cancel") {
        yield* Deferred.succeed(barrier.entered, undefined)
        yield* Deferred.await(barrier.release)
      }
      return id
    }),
  })
}))

// tools() preserves raw names; toolIds() is the parallel accepted inventory, never a legacy alias.
const toolID = Effect.fn(function* (server: string, raw: string) {
  const mcp = yield* Mcp.Service
  const tools = yield* mcp.tools()
  const ids = yield* mcp.toolIds()
  const index = tools[server]?.indexOf(raw) ?? -1
  expect(index).toBeGreaterThanOrEqual(0)
  expect(ids[server]).toHaveLength(tools[server]?.length ?? 0)
  const id = ids[server]?.[index]
  expect(id).toMatch(/^mcp_[A-Za-z0-9_-]{43}$/)
  if (id === undefined) return yield* Effect.die(new Error("Accepted MCP tool has no effective id"))
  return id
})

function provided(name: string, key: string, tool: string): McpProvided.Server {
  return {
    name,
    key,
    connect: () => {
      connects.push(`${name}@${key}`)
      const [client, side] = InMemoryTransport.createLinkedPair()
      const server = new Server({ name, version: "1.0.0" }, { capabilities: { tools: {} } })
      server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: (advertised.get(name) ?? [tool]).map((name) => ({ name, inputSchema: { type: "object" as const, properties: {} } })),
      }))
      server.setRequestHandler(CallToolRequestSchema, async (request) => {
        calls.push(`${name}/${request.params.name}`)
        return { content: [{ type: "text", text: "pong" }] }
      })
      active.set(name, server)
      void server.connect(side)
      return client
    },
  }
}

const config = await fs.mkdtemp(`${os.tmpdir()}/orchestra-mcp-provided-`)
const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([
      ApplicationTools.node,
      Database.node,
      EventV2.node,
      LocationServiceMap.node,
      SessionV2.node,
      SessionExecution.node,
    ]),
    [
      [SessionExecution.node, SessionExecutionLocal.node],
      [Global.node, Global.layerWith({ config })],
      [ToolRegistry.toolsNode, makeLocationNode({ service: Tools.Service, layer: registrationLayer, deps: [ToolRegistry.node] })],
      [PermissionV2.node, Layer.mock(PermissionV2.Service, { assert: (input) => Effect.sync(() => { permissions.push(input) }) })],
      [McpProvided.node, Layer.succeed(McpProvided.Service, McpProvided.Service.of({ servers: () => Effect.sync(() => [...listed]) }))],
    ],
  ),
)

describe("McpProvided", () => {
  it.live(
    "connects listed servers, reconnects a new key and drops a server that is no longer listed",
    () =>
      Effect.acquireRelease(
        Effect.promise(() => tmpdir()),
        (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()),
      ).pipe(
        Effect.flatMap((dir) =>
          Effect.gen(function* () {
            const mcp = yield* Mcp.Service
            const registry = yield* ToolRegistry.Service
            listed.splice(0, listed.length, provided("dock-linux", "tab:1", "look"))
            yield* mcp.ready()
            const originalID = (yield* mcp.toolIds())["dock-linux"][0]
            expect(originalID).toMatch(/^mcp_[A-Za-z0-9_-]{43}$/)
            expect((yield* registry.materialize()).definition(originalID)).toBeDefined()
            expect(yield* mcp.tools()).toEqual({ "dock-linux": ["look"] })

            // Same name, same key: no reconnect. A new key (a reloaded tab) reconnects and serves the new tools.
            yield* mcp.ready()
            expect(connects).toEqual(["dock-linux@tab:1"])
            listed.splice(0, listed.length, provided("dock-linux", "tab:2", "find"))
            yield* mcp.ready()
            expect(connects).toEqual(["dock-linux@tab:1", "dock-linux@tab:2"])
            expect(yield* mcp.tools()).toEqual({ "dock-linux": ["find"] })
            const nextID = (yield* mcp.toolIds())["dock-linux"][0]
            expect(nextID).not.toBe(originalID)

            listed.splice(0, listed.length)
            yield* mcp.ready()
            expect(yield* mcp.tools()).toEqual({})
            expect((yield* registry.materialize()).definition(nextID)).toBeUndefined()
          }).pipe(
            Effect.scoped,
            Effect.provide(LocationServiceMap.Service.get(Location.Ref.make({ directory: AbsolutePath.make(dir.path) }))),
          ),
        ),
      ),
    30_000,
  )
})

for (const [first, second] of [
  [["a_b", "c"], ["a", "b_c"]],
  [["punct.one", "read"], ["punct_one", "read"]],
  [["single", "read.item"], ["single", "read_item"]],
] as const) {
  it.live(`keeps distinct raw MCP pairs ${first.join("/")} and ${second.join("/")} independently callable`, () =>
    Effect.acquireRelease(Effect.promise(() => tmpdir()), (dir) => Effect.promise(() => dir[Symbol.asyncDispose]())).pipe(
      Effect.flatMap((dir) => Effect.gen(function* () {
        calls.length = 0
        permissions.length = 0
        advertised.clear()
        const mcp = yield* Mcp.Service
        const registry = yield* ToolRegistry.Service
        const call = (name: string): ToolRegistry.ExecuteInput => ({
          sessionID: SessionV2.ID.make("ses_mcp_collision"), agent: AgentV2.ID.make("maestro"),
          assistantMessageID: SessionMessage.ID.make("msg_mcp_collision"),
          call: { type: "tool-call", id: `call-${calls.length}-${name}`, name, input: {} },
        })
        listed.splice(0, listed.length, provided(first[0], "one", first[1]), provided("unrelated", "one", "ping"))
        yield* mcp.ready()
        const firstID = yield* toolID(first[0], first[1])
        const unrelatedID = yield* toolID("unrelated", "ping")
        const frozen = yield* registry.materialize()
        expect((yield* frozen.settle(call(firstID))).result.type).toBe("text")
        expect(calls).toEqual([first.join("/")])
        expect(permissions[0]).toMatchObject({ action: firstID, metadata: { server: first[0], tool: first[1] } })
        if (first[0] === second[0]) {
          advertised.set(first[0], [first[1], second[1]])
          // Same provided key "one": refresh the catalog, rather than switching authority.
          yield* mcp.connect(first[0])
        } else {
          listed.push(provided(second[0], "one", second[1]))
          yield* mcp.ready()
          // A second server does not replace the first registration, including captured definitions.
          expect((yield* frozen.settle(call(firstID))).result.type).toBe("text")
          expect(calls.at(-1)).toBe(first.join("/"))
          expect(permissions.at(-1)).toMatchObject({ action: firstID, metadata: { server: first[0], tool: first[1] } })
        }
        const secondID = yield* toolID(second[0], second[1])
        expect(secondID).not.toBe(firstID)
        expect(yield* toolID(first[0], first[1])).toBe(firstID)
        expect(yield* toolID("unrelated", "ping")).toBe(unrelatedID)
        const both = yield* registry.materialize()
        yield* Effect.forEach([
          { id: firstID, server: first[0], raw: first[1] },
          { id: secondID, server: second[0], raw: second[1] },
          { id: unrelatedID, server: "unrelated", raw: "ping" },
        ], (entry) => Effect.gen(function* () {
          expect((yield* both.settle(call(entry.id))).result.type).toBe("text")
          expect(calls.at(-1)).toBe(`${entry.server}/${entry.raw}`)
          expect(permissions.at(-1)).toMatchObject({ action: entry.id, metadata: { server: entry.server, tool: entry.raw } })
        }))
        expect(calls.slice(-3)).toEqual([first.join("/"), second.join("/"), "unrelated/ping"])
        expect(permissions).toHaveLength(calls.length)
        if (first[0] !== second[0]) {
          yield* mcp.disconnect(second[0])
        } else {
          advertised.set(first[0], [first[1]])
          yield* mcp.connect(first[0])
        }
        const restored = yield* registry.materialize()
        expect(restored.definition(firstID)).toBeDefined()
        expect(restored.definition(secondID)).toBeUndefined()
        expect((yield* restored.settle(call(firstID))).result.type).toBe("text")
        expect(calls.at(-1)).toBe(first.join("/"))
        expect(permissions.at(-1)).toMatchObject({ action: firstID, metadata: { server: first[0], tool: first[1] } })
        expect((yield* restored.settle(call(unrelatedID))).result.type).toBe("text")
        expect(calls.at(-1)).toBe("unrelated/ping")
        expect(permissions.at(-1)).toMatchObject({ action: unrelatedID, metadata: { server: "unrelated", tool: "ping" } })
        // List-changed installs a new scope before closing the old scope for this same pair.
        const identity = restored.registrationIdentity(firstID)
        yield* Effect.promise(() => active.get(first[0])!.sendToolListChanged())
        for (let attempt = 0; attempt < 100; attempt++) {
          if ((yield* registry.materialize()).registrationIdentity(firstID) !== identity) break
          yield* Effect.sleep("10 millis")
        }
        const refreshed = yield* registry.materialize()
        expect(refreshed.registrationIdentity(firstID)).not.toBe(identity)
        expect(yield* toolID(first[0], first[1])).toBe(firstID)
        expect((yield* refreshed.settle(call(firstID))).result.type).toBe("text")
        expect(calls.at(-1)).toBe(first.join("/"))
        expect(permissions.at(-1)).toMatchObject({ action: firstID, metadata: { server: first[0], tool: first[1] } })
        listed.splice(0, listed.length)
        yield* mcp.ready()
        expect(yield* mcp.toolIds()).toEqual({})
        const removed = yield* registry.materialize()
        expect(removed.definition(firstID)).toBeUndefined()
        expect(removed.definition(secondID)).toBeUndefined()
        expect(removed.definition(unrelatedID)).toBeUndefined()
      }).pipe(Effect.ensuring(Effect.sync(() => { listed.splice(0, listed.length) })), Effect.scoped,
        Effect.provide(LocationServiceMap.Service.get(Location.Ref.make({ directory: AbsolutePath.make(dir.path) }))))),
    ), 30_000,
  )
}

it.live("cancelled public connect releases its installed opaque registration without touching another server", () =>
  Effect.acquireRelease(Effect.promise(() => tmpdir()), (dir) => Effect.promise(() => dir[Symbol.asyncDispose]())).pipe(
    Effect.flatMap((dir) => Effect.gen(function* () {
      calls.length = 0
      permissions.length = 0
      advertised.clear()
      listed.splice(0, listed.length, provided("cancel_b", "one", "c"), provided("cancel", "one", "b_c"))
      const mcp = yield* Mcp.Service
      const registry = yield* ToolRegistry.Service
      yield* mcp.ready()
      const baseID = yield* toolID("cancel_b", "c")
      const candidateID = yield* toolID("cancel", "b_c")
      expect(candidateID).not.toBe(baseID)
      const installed = yield* registry.materialize()
      const identity = installed.registrationIdentity(baseID)
      expect(identity).toBeDefined()
      expect(installed.definition(candidateID)).toBeDefined()
      yield* mcp.disconnect("cancel")
      const materialized = yield* registry.materialize()
      expect(materialized.registrationIdentity(baseID)).toBe(identity)
      expect(materialized.definition(candidateID)).toBeUndefined()
      pause = { entered: yield* Deferred.make<void>(), release: yield* Deferred.make<void>() }
      const connecting = yield* mcp.connect("cancel").pipe(Effect.forkChild)
      yield* Deferred.await(pause.entered)
      const pending = yield* registry.materialize()
      expect(pending.registrationIdentity(baseID)).toBe(identity)
      expect(pending.definition(candidateID)).toBeDefined()
      yield* Fiber.interrupt(connecting)
      const interrupted = yield* Fiber.await(connecting)
      expect(Exit.isFailure(interrupted)).toBe(true)
      if (Exit.isFailure(interrupted)) expect(Cause.hasInterruptsOnly(interrupted.cause)).toBe(true)
      pause = undefined
      const restored = yield* registry.materialize()
      // This must hold BEFORE explicit disconnect: that cleanup must not mask the interrupted connect's leak.
      expect(restored.definition(candidateID)).toBeUndefined()
      expect(restored.registrationIdentity(baseID)).toBe(identity)
      const result = yield* restored.settle({
        sessionID: SessionV2.ID.make("ses_mcp_cancel"), agent: AgentV2.ID.make("maestro"),
        assistantMessageID: SessionMessage.ID.make("msg_mcp_cancel"),
        call: { type: "tool-call", id: "cancel-recovered", name: baseID, input: {} },
      })
      expect(result.result.type).toBe("text")
      expect(calls).toEqual(["cancel_b/c"])
      expect(permissions).toHaveLength(1)
      expect(permissions[0]).toMatchObject({ action: baseID, metadata: { server: "cancel_b", tool: "c" } })
      yield* mcp.disconnect("cancel")
      expect((yield* registry.materialize()).registrationIdentity(baseID)).toBe(identity)
      listed.splice(0, listed.length)
      yield* mcp.ready()
    }).pipe(Effect.ensuring(Effect.sync(() => { pause = undefined; listed.splice(0, listed.length) })), Effect.scoped,
      Effect.provide(LocationServiceMap.Service.get(Location.Ref.make({ directory: AbsolutePath.make(dir.path) }))))),
  ), 30_000,
)

test("the default service provides no servers", async () => {
  const servers = await Effect.runPromise(
    McpProvided.Service.pipe(
      Effect.flatMap((service) => service.servers()),
      Effect.provide(McpProvided.layer),
    ),
  )
  expect(servers).toEqual([])
})
