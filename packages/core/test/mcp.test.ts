// The Location's MCP service: a stdio server from a V1-shaped profile config connects through omni, its tools join
// the Location's tool registry and its resources list; disconnect removes them; add and remove edit the profile's own
// config file; OAuth is refused for a local server and for a server that is not configured.
import fs from "fs/promises"
import path from "path"
import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { LocationServiceMap } from "@orchestra/core/location-services"
import { Location } from "@orchestra/core/location"
import { Mcp } from "@orchestra/core/mcp"
import { AbsolutePath } from "@orchestra/core/schema"
import { ConfigMCP } from "@orchestra/schema/config-mcp"
import { SessionV2 } from "@orchestra/core/session"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionExecutionLocal } from "@orchestra/core/session/execution/local"
import { expectSpawn } from "./fixture/omni-expect"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"
import { Database } from "../src/database/database"
import { EventV2 } from "../src/event"
import { ApplicationTools } from "../src/tool/application-tools"
import { ToolRegistry } from "../src/tool/registry"

const fixture = path.join(import.meta.dir, "..", "..", "..", "apps", "orchestra", "test", "fixture", "mcp-omni-stdio.ts")

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
    [[SessionExecution.node, SessionExecutionLocal.node]],
  ),
)

describe("Mcp", () => {
  it.live(
    "connects a configured stdio server, registers its tools, and edits the profile config",
    () =>
      Effect.acquireRelease(
        Effect.promise(() => tmpdir()),
        (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()),
      ).pipe(
        Effect.flatMap((dir) =>
          Effect.gen(function* () {
            expectSpawn(import.meta.path)
            yield* Effect.promise(() =>
              Bun.write(
                path.join(dir.path, "orchestra.json"),
                JSON.stringify({
                  mcp: {
                    fixture: {
                      type: "local",
                      command: [process.execPath, fixture, "probe"],
                      environment: { MCP_OMNI_RESOURCE: "fixture://note" },
                    },
                  },
                }),
              ),
            )
            yield* Effect.gen(function* () {
              const mcp = yield* Mcp.Service
              const registry = yield* ToolRegistry.Service
              const status = Effect.fn(function* (name: string) {
                return (yield* mcp.list()).find((server) => server.name === name)?.status.status
              })
              yield* Effect.gen(function* () {
                for (let attempt = 0; attempt < 200 && (yield* status("fixture")) !== "connected"; attempt++)
                  yield* Effect.sleep("100 millis")
              })
              expect(yield* status("fixture")).toBe("connected")
              expect((yield* registry.materialize()).definition("fixture_probe")).toBeDefined()
              expect(yield* mcp.resources()).toEqual({
                resources: [{ server: "fixture", name: "fixture note", uri: "fixture://note", mimeType: "text/plain" }],
                templates: [{ server: "fixture", name: "fixture notes", uriTemplate: "fixture://note/{id}" }],
              })
              expect(yield* mcp.startAuth("fixture").pipe(Effect.flip)).toBeInstanceOf(Mcp.AuthError)
              expect(yield* mcp.removeAuth("missing").pipe(Effect.flip)).toBeInstanceOf(Mcp.NotFoundError)

              yield* mcp.disconnect("fixture")
              expect(yield* status("fixture")).toBe("disabled")
              expect((yield* registry.materialize()).definition("fixture_probe")).toBeUndefined()
              expect((yield* mcp.resources()).resources).toEqual([])

              yield* mcp.add("saved", new ConfigMCP.Local({ type: "local", command: ["bun", "--version"], disabled: true }))
              expect(yield* status("saved")).toBe("disabled")
              const written = yield* Effect.promise(() => fs.readFile(path.join(dir.path, "orchestra.json"), "utf8"))
              expect(JSON.parse(written).mcp.saved).toEqual({ type: "local", command: ["bun", "--version"], enabled: false })

              yield* mcp.remove("saved")
              expect(yield* status("saved")).toBeUndefined()
              expect(yield* mcp.remove("saved").pipe(Effect.flip)).toBeInstanceOf(Mcp.NotFoundError)
            }).pipe(
              Effect.scoped,
              Effect.provide(LocationServiceMap.Service.get(Location.Ref.make({ directory: AbsolutePath.make(dir.path) }))),
            )
          }),
        ),
      ),
    30_000,
  )
})
