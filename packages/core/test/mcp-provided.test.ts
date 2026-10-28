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

function provided(name: string, key: string, tool: string): McpProvided.Server {
  return {
    name,
    key,
    connect: () => {
      connects.push(`${name}@${key}`)
      const [client, side] = InMemoryTransport.createLinkedPair()
      const server = new Server({ name, version: "1.0.0" }, { capabilities: { tools: {} } })
      server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [{ name: tool, description: "Answers pong", inputSchema: { type: "object", properties: {} } }],
      }))
      server.setRequestHandler(CallToolRequestSchema, async () => ({ content: [{ type: "text", text: "pong" }] }))
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

test("the default service provides no servers", async () => {
  const servers = await Effect.runPromise(
    McpProvided.Service.pipe(
      Effect.flatMap((service) => service.servers()),
      Effect.provide(McpProvided.layer),
    ),
  )
  expect(servers).toEqual([])
})
