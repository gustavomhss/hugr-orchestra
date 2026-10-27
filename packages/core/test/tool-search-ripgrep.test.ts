import { describe, expect } from "bun:test"
import os from "os"
import path from "path"
import { Effect, Layer } from "effect"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { PermissionV2 } from "@orchestra/core/permission"
import { RipgrepBinary } from "@orchestra/core/ripgrep/binary"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { GlobTool } from "@orchestra/core/tool/glob"
import { GrepTool } from "@orchestra/core/tool/grep"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { location } from "./fixture/location"
import { testEffect } from "./lib/effect"
import { executeTool, toolIdentity } from "./lib/tool"

// The grep and glob tools without ripgrep: the model sees why the search could not run, not only that it failed.

const asserted: { action: string; resources: readonly string[] }[] = []

const permission = Layer.succeed(
  PermissionV2.Service,
  PermissionV2.Service.of({
    evaluate: () => Effect.die("unused permission evaluation"),
    authorize: () => Effect.die("unused permission authorization"),
    askExplicit: () => Effect.die("unused"),
    assert: (input) => Effect.sync(() => void asserted.push({ action: input.action, resources: input.resources })),
    ask: () => Effect.die("unused"),
    reply: () => Effect.die("unused"),
    cancelSession: () => Effect.void,
    get: () => Effect.die("unused"),
    forSession: () => Effect.die("unused"),
    list: () => Effect.die("unused"),
  }),
)

const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([ToolRegistry.node, ToolRegistry.toolsNode, GrepTool.node, GlobTool.node]), [
    [PermissionV2.node, permission],
    [Location.node, Layer.succeed(Location.Service, Location.Service.of(location({ directory: AbsolutePath.make(process.cwd()) })))],
    [
      RipgrepBinary.node,
      RipgrepBinary.nodeWith({
        system: () => undefined,
        directory: path.join(os.tmpdir(), `orchestra-no-ripgrep-${process.pid}`),
        download: false,
      }),
    ],
    [Global.node, Global.layerWith({ data: Global.Path.data })],
    [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
  ]),
)

const sessionID = SessionV2.ID.make("ses_search_tool_test")

describe("grep and glob tools without ripgrep", () => {
  it.effect("report ripgrep's reason", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const grep = yield* executeTool(registry, {
        sessionID,
        ...toolIdentity,
        call: { type: "tool-call", id: "call-grep", name: GrepTool.name, input: { pattern: "needle" } },
      })
      const glob = yield* executeTool(registry, {
        sessionID,
        ...toolIdentity,
        call: { type: "tool-call", id: "call-glob", name: GlobTool.name, input: { pattern: "**/*.ts" } },
      })

      expect(grep).toMatchObject({ type: "error" })
      expect(String(grep.value)).toContain("Unable to grep for needle: ")
      expect(String(grep.value)).toContain(RipgrepBinary.DISABLE_DOWNLOAD)
      expect(glob).toMatchObject({ type: "error" })
      expect(String(glob.value)).toContain("Unable to find files matching **/*.ts: ")
      expect(String(glob.value)).toContain(RipgrepBinary.DISABLE_DOWNLOAD)
    }),
  )

  it.effect("ask for external_directory approval before searching an absolute path outside the Location", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const outside = path.join(os.tmpdir(), "orchestra-outside-search")
      yield* Effect.forEach(
        [
          { name: GrepTool.name, input: { pattern: "needle", path: outside } },
          { name: GlobTool.name, input: { pattern: "*.ts", path: outside } },
        ],
        (call) =>
          Effect.gen(function* () {
            asserted.length = 0
            yield* executeTool(registry, {
              sessionID,
              ...toolIdentity,
              call: { type: "tool-call", id: `call-${call.name}`, name: call.name, input: call.input },
            })
            expect(asserted.map((item) => item.action)).toEqual(["external_directory", call.name])
            expect(asserted[0]?.resources[0]).toEndWith("/*")
          }),
        { discard: true },
      )
    }),
  )
})
