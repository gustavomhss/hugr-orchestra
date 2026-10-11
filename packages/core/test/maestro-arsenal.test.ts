import { describe, expect } from "bun:test"
import path from "node:path"
import fs from "node:fs/promises"
import { Effect, Exit, Layer, Scope } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { LocationMutation } from "@orchestra/core/location-mutation"
import { PermissionV2 } from "@orchestra/core/permission"
import { PermissionSaved } from "@orchestra/core/permission/saved"
import { ProjectTable } from "@orchestra/core/project/sql"
import { SessionV2 } from "@orchestra/core/session"
import { SessionTable } from "@orchestra/core/session/sql"
import { SessionStore } from "@orchestra/core/session/store"
import { MaestroArsenal } from "@orchestra/core/tool/maestro-arsenal"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Tool } from "@orchestra/core/tool/tool"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { tempLocationLayer } from "./fixture/location"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"
import { executeTool, toolDefinitions, toolIdentity } from "./lib/tool"

const data = Layer.unwrap(
  Effect.acquireRelease(
    Effect.promise(() => tmpdir()),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
  ).pipe(Effect.map((tmp) => Global.layerWith({ data: tmp.path }))),
)

export const hostLayer = AppNodeBuilder.build(
  LayerNode.group([
    FSUtil.node,
    Global.node,
    Location.node,
    Database.node,
    EventV2.node,
    AgentV2.node,
    SessionStore.node,
    PermissionSaved.node,
    PermissionV2.node,
    ToolRegistry.node,
    ToolRegistry.toolsNode,
    ToolOutputStore.node,
    LocationMutation.node,
  ]),
  [
    [Location.node, tempLocationLayer],
    [Global.node, data],
    [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
  ],
)

export const sessionID = SessionV2.ID.make("ses_arsenal_native")
export const maestro = AgentV2.ID.make("maestro")
export const setup = Effect.fn("ArsenalTest.setup")(function* (rules: PermissionV2.Ruleset) {
  const database = yield* Database.Service
  const location = yield* Location.Service
  yield* database.db
    .insert(ProjectTable)
    .values({ id: location.project.id, worktree: location.directory, sandboxes: [] })
    .onConflictDoNothing()
    .run()
    .pipe(Effect.orDie)
  yield* database.db
    .insert(SessionTable)
    .values({
      id: sessionID,
      project_id: location.project.id,
      slug: "arsenal",
      directory: location.directory,
      title: "arsenal",
      version: "test",
      agent: maestro,
    })
    .onConflictDoNothing()
    .run()
    .pipe(Effect.orDie)
  const agents = yield* AgentV2.Service
  yield* agents.transform((editor) =>
    editor.update(maestro, (agent) => {
      agent.permissions = [...rules]
    }),
  )
  return agents
})

const it = testEffect(hostLayer)

describe("Maestro Arsenal host boundary", () => {
  it.live("registers canonical tools within the real Tools scope and rejects non-Maestro invocations", () =>
    Effect.gen(function* () {
      const agents = yield* setup([{ action: "*", resource: "*", effect: "allow" }])
      const registry = yield* ToolRegistry.Service
      const scope = yield* Scope.make()
      yield* MaestroArsenal.registerScoped({
        nativeMaestro: (id) => agents.get(id).pipe(Effect.map((agent) => agent?.id === maestro)),
      }).pipe(Scope.provide(scope))
      expect((yield* toolDefinitions(registry)).map((definition) => definition.name).sort()).toEqual(
        Object.values(MaestroArsenal.names).sort(),
      )
      expect(
        yield* executeTool(registry, {
          sessionID,
          ...toolIdentity,
          call: { type: "tool-call", id: "identity", name: MaestroArsenal.names.catalog, input: {} },
        }),
      ).toEqual({ type: "error", value: "Maestro Arsenal requires native Maestro identity." })
      yield* Scope.close(scope, Exit.void)
      expect(yield* toolDefinitions(registry)).toEqual([])
      expect(
        yield* executeTool(registry, {
          sessionID,
          ...toolIdentity,
          call: { type: "tool-call", id: "closed", name: MaestroArsenal.names.catalog, input: {} },
        }),
      ).toEqual({ type: "error", value: `Unknown tool: ${MaestroArsenal.names.catalog}` })
    }),
  )

  it.live("fences traversal, existing and dangling symlinks, and separates project state", () =>
    Effect.gen(function* () {
      const location = yield* Location.Service
      const filesystem = yield* FSUtil.Service
      const global = yield* Global.Service
      yield* Effect.promise(() => fs.symlink(global.data, path.join(location.directory, "escape"), "dir"))
      yield* Effect.promise(() =>
        fs.symlink(path.join(global.data, "missing"), path.join(location.directory, "dangling")),
      )
      expect(yield* MaestroArsenal.fence(filesystem, location.directory, "new/nested.txt")).toBe(
        path.join(location.directory, "new/nested.txt"),
      )
      yield* Effect.forEach(["../outside", "escape/file", "dangling/file", global.data], (target) =>
        Effect.gen(function* () {
          expect(yield* MaestroArsenal.fence(filesystem, location.directory, target).pipe(Effect.flip)).toBeInstanceOf(
            Tool.Failure,
          )
        }),
      )
      const first = MaestroArsenal.stateDirectory(global.data, "../first")
      const second = MaestroArsenal.stateDirectory(global.data, "second")
      expect(first).not.toBe(second)
      expect(FSUtil.contains(global.data, first)).toBe(true)
      expect(yield* MaestroArsenal.fence(filesystem, global.data, first)).toBe(first)
    }),
  )

  it.live("uses real PermissionV2 resources; denied reads, writes and processes cannot reach effects", () =>
    Effect.gen(function* () {
      const agents = yield* setup([{ action: "*", resource: "*", effect: "deny" }])
      const permission = yield* PermissionV2.Service
      const filesystem = yield* FSUtil.Service
      const location = yield* Location.Service
      const global = yield* Global.Service
      const host = {
        directory: location.directory,
        stateDirectory: MaestroArsenal.stateDirectory(global.data, location.project.id),
        ask: (action: string, resources: readonly string[]) =>
          permission
            .assert({
              action,
              resources,
              sessionID,
              agent: maestro,
              source: { type: "tool" as const, messageID: toolIdentity.assistantMessageID, callID: "authorization" },
            })
            .pipe(Effect.mapError(() => new Tool.Failure({ message: "denied" }))),
      }
      const marker = path.join(location.directory, "marker")
      const command = `bun -e 'Bun.write(${JSON.stringify(marker)}, "process")'`
      yield* Effect.forEach(["read", "write", "process"] as const, (effect) =>
        Effect.gen(function* () {
          expect(
            yield* MaestroArsenal.authorize(filesystem, host, {
              effect,
              paths: [marker],
              commands: effect === "process" ? [command] : [],
            }).pipe(Effect.andThen(filesystem.writeFileString(marker, effect)), Effect.flip),
          ).toBeInstanceOf(Tool.Failure)
          expect(yield* filesystem.exists(marker)).toBe(false)
        }),
      )
      const processMarker = path.join(location.directory, "process-marker")
      const argv = [process.execPath, "-e", `await Bun.write(${JSON.stringify(processMarker)}, "process")`]
      const processCommand = argv.join(" ")
      const launch = Effect.promise(async () => {
        const child = Bun.spawn(argv, { cwd: location.directory, stdout: "ignore", stderr: "ignore" })
        expect(await child.exited).toBe(0)
      })
      yield* agents.transform((editor) =>
        editor.update(maestro, (agent) => {
          agent.permissions = [
            { action: "read", resource: "*", effect: "allow" },
            { action: "bash", resource: "*", effect: "deny" },
          ]
        }),
      )
      expect(
        yield* MaestroArsenal.authorize(filesystem, host, {
          effect: "process",
          paths: [location.directory],
          commands: [processCommand],
        }).pipe(Effect.andThen(launch), Effect.flip),
      ).toBeInstanceOf(Tool.Failure)
      expect(yield* filesystem.exists(processMarker)).toBe(false)
      yield* agents.transform((editor) =>
        editor.update(maestro, (agent) => {
          agent.permissions = [
            { action: "read", resource: "*", effect: "allow" },
            { action: "bash", resource: processCommand, effect: "allow" },
          ]
        }),
      )
      yield* MaestroArsenal.authorize(filesystem, host, {
        effect: "process",
        paths: [location.directory],
        commands: [processCommand],
      })
      yield* launch
      expect(yield* filesystem.readFileString(processMarker)).toBe("process")
      yield* agents.transform((editor) =>
        editor.update(maestro, (agent) => {
          agent.permissions = [{ action: "edit", resource: "marker", effect: "allow" }]
        }),
      )
      yield* MaestroArsenal.authorize(filesystem, host, { effect: "write", paths: [marker], commands: [] })
      yield* filesystem.writeFileString(marker, "approved")
      expect(yield* filesystem.readFileString(marker)).toBe("approved")
      expect(
        yield* MaestroArsenal.authorize(filesystem, host, {
          effect: "write",
          paths: [path.join(global.data, "outside")],
          commands: [],
        }).pipe(Effect.flip),
      ).toBeInstanceOf(Tool.Failure)
    }),
  )
})
