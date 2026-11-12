// Servers a product module provides in process (McpProvided) connect without config, join the tool registry, and leave
// it when the module stops listing them; a new key reconnects the server behind the same name.
import fs from "fs/promises"
import os from "os"
import { describe, expect, test } from "bun:test"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import { Effect, Layer } from "effect"
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

const listed: McpProvided.Server[] = []
const connects: string[] = []
const calls: string[] = []
const permissions: PermissionV2.AssertInput[] = []
const active = new Map<string, Server>()
const advertised = new Map<string, string[]>()

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
            expect((yield* registry.materialize()).definition("dock-linux_look")).toBeDefined()
            expect(yield* mcp.tools()).toEqual({ "dock-linux": ["look"] })

            // Same name, same key: no reconnect. A new key (a reloaded tab) reconnects and serves the new tools.
            yield* mcp.ready()
            expect(connects).toEqual(["dock-linux@tab:1"])
            listed.splice(0, listed.length, provided("dock-linux", "tab:2", "find"))
            yield* mcp.ready()
            expect(connects).toEqual(["dock-linux@tab:1", "dock-linux@tab:2"])
            expect(yield* mcp.tools()).toEqual({ "dock-linux": ["find"] })

            listed.splice(0, listed.length)
            yield* mcp.ready()
            expect(yield* mcp.tools()).toEqual({})
            expect((yield* registry.materialize()).definition("dock-linux_find")).toBeUndefined()
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
  it.live(`refuses ambiguous MCP identity ${first.join("/")} and ${second.join("/")}`, () =>
    Effect.acquireRelease(Effect.promise(() => tmpdir()), (dir) => Effect.promise(() => dir[Symbol.asyncDispose]())).pipe(
      Effect.flatMap((dir) => Effect.gen(function* () {
        calls.length = 0
        permissions.length = 0
        advertised.clear()
        const mcp = yield* Mcp.Service
        const registry = yield* ToolRegistry.Service
        const canonical = `${first[0]}_${first[1]}`.replace(/[^a-zA-Z0-9_-]/g, "_")
        const call = (name: string): ToolRegistry.ExecuteInput => ({
          sessionID: SessionV2.ID.make("ses_mcp_collision"), agent: AgentV2.ID.make("maestro"),
          assistantMessageID: SessionMessage.ID.make("msg_mcp_collision"),
          call: { type: "tool-call", id: `call-${calls.length}-${name}`, name, input: {} },
        })
        listed.splice(0, listed.length, provided(first[0], "one", first[1]), provided("unrelated", "one", "ping"))
        yield* mcp.ready()
        const frozen = yield* registry.materialize()
        expect((yield* frozen.settle(call(canonical))).result.type).toBe("text")
        expect(calls).toEqual([first.join("/")])
        expect(permissions[0]).toMatchObject({ action: canonical, metadata: { server: first[0], tool: first[1] } })
        if (first[0] === second[0]) {
          advertised.set(first[0], [first[1], second[1]])
          listed[0] = provided(first[0], "two", first[1])
        } else listed.push(provided(second[0], "one", second[1]))
        yield* mcp.ready()
        const refuse = Effect.fn(function* () {
          const materialized = yield* registry.materialize()
          const result = (yield* materialized.settle(call(canonical))).result
          expect(result.type).toBe("error")
          expect(String(result.value)).toContain("Ambiguous MCP tool identity")
          expect(String(result.value)).toContain(JSON.stringify(first))
          expect(String(result.value)).toContain(JSON.stringify(second))
          expect(calls).toEqual([first.join("/")])
          expect(permissions).toHaveLength(1)
        })
        yield* refuse()
        // A definition captured before the collision cannot execute either owner.
        expect((yield* frozen.settle(call(canonical))).result.type).toBe("error")
        expect(calls).toEqual([first.join("/")])
        yield* mcp.connect(first[0])
        yield* refuse()
        if (first[0] !== second[0]) {
          yield* mcp.connect(second[0])
          yield* refuse()
          yield* mcp.disconnect(second[0])
        } else {
          advertised.set(first[0], [first[1]])
          yield* mcp.connect(first[0])
        }
        const restored = yield* registry.materialize()
        expect((yield* restored.settle(call(canonical))).result.type).toBe("text")
        expect((yield* restored.settle(call("unrelated_ping"))).result.type).toBe("text")
        expect(calls).toEqual([first.join("/"), first.join("/"), "unrelated/ping"])
        // List-changed installs a new scope before closing the old scope for this same pair.
        const identity = restored.registrationIdentity(canonical)
        yield* Effect.promise(() => active.get(first[0])!.sendToolListChanged())
        for (let attempt = 0; attempt < 100; attempt++) {
          if ((yield* registry.materialize()).registrationIdentity(canonical) !== identity) break
          yield* Effect.sleep("10 millis")
        }
        const refreshed = yield* registry.materialize()
        expect(refreshed.registrationIdentity(canonical)).not.toBe(identity)
        expect((yield* refreshed.settle(call(canonical))).result.type).toBe("text")
        listed.splice(0, listed.length)
        yield* mcp.ready()
        expect((yield* registry.materialize()).definition(canonical)).toBeUndefined()
      }).pipe(Effect.scoped, Effect.provide(LocationServiceMap.Service.get(Location.Ref.make({ directory: AbsolutePath.make(dir.path) }))))),
    ), 30_000,
  )
}

test("the default service provides no servers", async () => {
  const servers = await Effect.runPromise(
    McpProvided.Service.pipe(
      Effect.flatMap((service) => service.servers()),
      Effect.provide(McpProvided.layer),
    ),
  )
  expect(servers).toEqual([])
})
