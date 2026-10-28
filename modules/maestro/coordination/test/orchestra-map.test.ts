import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Effect, Layer } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { Board } from "@orchestra/core/board/board"
import { BoardTools } from "@orchestra/core/board/tools"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { Project } from "@orchestra/core/project"
import { AbsolutePath } from "@orchestra/core/schema"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { nativeProfiles } from "../src/roster"
import { MaestroSeatsV2 } from "../src/v2/seats"
import { MaestroToolsV2 } from "../src/v2/tools"

// The `maestro-orchestra` playbook is Maestro's map of Orchestra. Every Maestro and board tool Maestro is given must be
// on it, and every such name on it must be one Maestro is given. Generic tools (task, dock_*, capability tools) are
// registered elsewhere and are not checked here.

const temporary = (prefix: string) =>
  Effect.acquireRelease(
    Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), prefix))),
    (directory) => Effect.promise(() => fs.rm(directory, { recursive: true, force: true })),
  )

const host = AppNodeBuilder.build(
  LayerNode.group([MaestroToolsV2.node, BoardTools.node, Board.node, ToolRegistry.node, Database.node, EventV2.node, AgentV2.node, Location.node]),
  [
    [Database.node, Database.layerFromPath(":memory:")],
    [Global.node, Layer.unwrap(temporary("orchestra-map-data-").pipe(Effect.map((data) => Global.layerWith({ data }))))],
    [
      Location.node,
      Layer.unwrap(
        temporary("orchestra-map-location-").pipe(
          Effect.map((directory) =>
            Layer.succeed(
              Location.Service,
              Location.Service.of({
                directory: AbsolutePath.make(directory),
                project: { id: Project.ID.global, directory: AbsolutePath.make(directory) },
              }),
            ),
          ),
        ),
      ),
    ],
    [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
  ],
) as Layer.Layer<ToolRegistry.Service>

test("the maestro-orchestra map names exactly the Maestro and board tools Maestro is given", async () => {
  const text = await Bun.file(path.join(import.meta.dir, "../playbooks/maestro-orchestra/SKILL.md")).text()
  // The first cell of each row in the "## Yours" table, between that heading and the next one.
  const section = text.split("\n## Yours\n")[1]?.split("\n## ")[0] ?? ""
  const mapped = section
    .split("\n")
    .filter((line) => line.startsWith("| `"))
    .flatMap((line) => [...line.split("|")[1].matchAll(/`([^`]+)`/g)].map((match) => match[1]))
  const owned = (name: string) => name.startsWith("maestro_") || name.startsWith("board_")
  const given = await Effect.runPromise(
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const materialized = yield* registry.materialize([
        { action: "*", resource: "*", effect: "allow" as const },
        ...MaestroSeatsV2.floor(nativeProfiles.maestro),
        ...MaestroSeatsV2.visibility("maestro"),
      ])
      return materialized.definitions.map((tool) => tool.name).filter(owned)
    }).pipe(Effect.provide(host), Effect.scoped),
  )

  // Positive controls: the table parsed, and the host registered both families.
  expect(mapped).toContain("board_read")
  expect(given).toContain("board_read")
  expect(given).toContain("maestro_workflows")
  expect(mapped.filter(owned).toSorted()).toEqual(given.toSorted())
})
