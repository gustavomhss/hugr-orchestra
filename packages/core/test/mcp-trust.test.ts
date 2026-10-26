// A local MCP server declared by a project's own config is a command the repository chose to run. It does not start until
// the user's global config approves the project; the status says why. A server in the user's global config is the user's own.
import path from "path"
import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-services"
import { Mcp } from "@orchestra/core/mcp"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionExecutionLocal } from "@orchestra/core/session/execution/local"
import { SessionV2 } from "@orchestra/core/session"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"
import { Database } from "../src/database/database"
import { EventV2 } from "../src/event"
import { ApplicationTools } from "../src/tool/application-tools"

const global = await tmpdir()

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
      [Global.node, Global.layerWith({ config: global.path })],
    ],
  ),
)

// A server that leaves a marker file if it is ever started.
const server = (marker: string) => ({
  type: "local",
  command: [process.execPath, "-e", `require("fs").writeFileSync(${JSON.stringify(marker)}, "started")`],
})

describe("Mcp project trust", () => {
  it.live("does not start a project's local server until the project is approved", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((dir) =>
        Effect.gen(function* () {
          const marker = path.join(dir.path, "started")
          yield* Effect.promise(() =>
            Bun.write(path.join(dir.path, "orchestra.json"), JSON.stringify({ mcp: { repo: server(marker) } })),
          )
          yield* Effect.gen(function* () {
            const mcp = yield* Mcp.Service
            const listed = yield* mcp.list()
            expect(listed.map((item) => item.name)).toEqual(["repo"])
            const status = listed[0]?.status
            expect(status?.status).toBe("failed")
            expect(status?.status === "failed" ? status.error : "").toContain("trusted_projects")
            // Connecting by hand is refused the same way.
            yield* mcp.connect("repo")
            expect(yield* Effect.promise(() => Bun.file(marker).exists())).toBe(false)
          }).pipe(
            Effect.scoped,
            Effect.provide(LocationServiceMap.Service.get(Location.Ref.make({ directory: AbsolutePath.make(dir.path) }))),
          )
        }),
      ),
    ),
  )

  it.live("a project cannot approve itself through its own trusted_projects", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((dir) =>
        Effect.gen(function* () {
          const marker = path.join(dir.path, "started")
          // The repository approves itself: this must not count.
          yield* Effect.promise(() =>
            Bun.write(
              path.join(dir.path, "orchestra.json"),
              JSON.stringify({ trusted_projects: [dir.path], mcp: { repo: server(marker) } }),
            ),
          )
          yield* Effect.gen(function* () {
            const mcp = yield* Mcp.Service
            expect((yield* mcp.list())[0]?.status.status).toBe("failed")
            expect(yield* Effect.promise(() => Bun.file(marker).exists())).toBe(false)
          }).pipe(
            Effect.scoped,
            Effect.provide(LocationServiceMap.Service.get(Location.Ref.make({ directory: AbsolutePath.make(dir.path) }))),
          )
        }),
      ),
    ),
  )
})
