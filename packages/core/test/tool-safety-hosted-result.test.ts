import { expect } from "bun:test"
import { createHash } from "node:crypto"
import { mkdirSync } from "node:fs"
import path from "node:path"
import { Effect, Layer, Schema, Stream } from "effect"
import { RelayHook } from "@orchestra/schema/relay-hook"
import { Config } from "../src/config"
import { AppNodeBuilder } from "../src/effect/app-node-builder"
import { LayerNode } from "../src/effect/layer-node"
import { EventV2 } from "../src/event"
import { FSUtil } from "../src/fs-util"
import { Global } from "../src/global"
import { Location } from "../src/location"
import { Project } from "../src/project"
import { Relay } from "../src/relay"
import { RelayHookInstall } from "../src/relay-hook-install"
import { AbsolutePath } from "../src/schema"
import { SessionSchema } from "../src/session/schema"
import { MaestroArsenal } from "../src/tool/maestro-arsenal"
import { ToolRegistry } from "../src/tool/registry"
import { ToolOutputStore } from "../src/tool-output-store"
import { ToolSafety } from "../src/tool-safety"
import { ToolSafetyProfile } from "../src/tool-safety-profile"
import { expectSpawn } from "./fixture/omni-expect"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const it = testEffect(Layer.empty)

it.live("an installed hosted Verify observes two different responses to the same authorized operation", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const tmp = yield* Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()),
    )
    const data = path.join(tmp.path, "data")
    const directory = AbsolutePath.make(path.join(tmp.path, "work"))
    const projectID = Project.ID.make("hosted-response")
    const sessionID = SessionSchema.ID.make("ses_hosted_response")
    const stateDirectory = MaestroArsenal.stateDirectory(data, projectID)
    mkdirSync(directory)
    mkdirSync(stateDirectory, { recursive: true })
    const location = Location.Service.of({ directory, project: { id: projectID, directory } })
    const snapshotFor = (timing: "before" | "after") => ({
      schema: "relay.hook.v1",
      name: timing === "before" ? "Authorization receipt" : "Result receipt",
      nodes: [
        { id: "event", name: "Read", type: RelayHook.NodeType.trigger, position: [0, 0], parameters: { operation: "read", timing } },
        timing === "before"
          ? { id: "action", name: "Record authorization", type: RelayHook.NodeType.record, position: [0, 0], parameters: { message: "Started." } }
          : { id: "action", name: "Verify reply", type: RelayHook.NodeType.verify, position: [0, 0], parameters: { message: "Expected alpha.", check: `test "\${RELAY_HOOK_RESULT}" = '{"text":"alpha"}'` } },
      ],
      connections: [{ from: "event", port: 0, to: "action" }],
      binding: "host-required",
      installed: false,
    })
    yield* Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const registry = yield* ToolRegistry.Service
      const events = yield* EventV2.Service
      const load = ToolSafetyProfile.makeLoader(fs, { directory, stateDirectory, projectID })
      yield* Effect.forEach(["before", "after"] as const, (timing) => {
        const snapshot = snapshotFor(timing)
        return RelayHookInstall.install({
          data, projectID, document: `hosted-response-${timing}`, version: "v1", snapshot,
          sha256: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"),
          principal: "user:test",
        })
      })
      const authorize = (callID: string) =>
        Effect.gen(function* () {
          const hooks: { after?: (outcome: ToolSafety.HostedOutcome) => Effect.Effect<ReadonlyArray<string>, ToolSafety.Denied> } = {}
          yield* registry.hosted({
            tool: "read", args: { filePath: path.join(directory, "file.txt") },
            directory, projectDirectory: directory, projectID, sessionID, callID,
          }, Effect.void).pipe(
            Effect.provideService(ToolSafety.HostedHooks, hooks),
            Effect.provideService(ToolSafety.RuntimeProfileLoader, load),
          )
          expect(hooks.after).toBeDefined()
          return hooks.after!
        })
      const first = yield* authorize("read-alpha")
      expect(yield* first({ succeeded: true, response: { text: "alpha" } })).toEqual([])
      const second = yield* authorize("read-beta")
      expect(yield* second({ succeeded: true, response: { text: "beta" } }).pipe(Effect.flip)).toMatchObject({
        reason: "relay-hook-verify-failed",
      })
      const decisions = yield* Stream.runCollect(events.durable({ aggregateID: sessionID }).pipe(
        Stream.filter((event) => event.type === RelayHook.Decided.type),
        Stream.map((event) => Schema.decodeUnknownSync(RelayHook.Decided.data)(event.data)),
        Stream.take(4),
      )).pipe(Effect.timeout("5 seconds"))
      expect(Array.from(decisions, (decision) => [decision.callID, decision.trigger, decision.outcome])).toEqual([
        ["read-alpha", "read.before", "recorded"], ["read-alpha", "read.after", "passed"],
        ["read-beta", "read.before", "recorded"], ["read-beta", "read.after", "failed"],
      ])
    }).pipe(Effect.provide(AppNodeBuilder.build(LayerNode.group([ToolRegistry.nativeNode, EventV2.node, FSUtil.node, Relay.node]), [
      [Global.node, Global.layerWith({ data, home: tmp.path })],
      [Location.node, Layer.succeed(Location.Service, location)],
      [Config.node, Layer.succeed(Config.Service, Config.Service.of({ entries: () => Effect.succeed([]) }))],
      [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
    ])))
  }),
)
