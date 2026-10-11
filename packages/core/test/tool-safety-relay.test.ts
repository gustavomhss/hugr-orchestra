import { expect } from "bun:test"
import path from "node:path"
import { createHash } from "node:crypto"
import { Cause, Deferred, Effect, Exit, Fiber, Layer, Result, Schema } from "effect"
import { RelayHook } from "@orchestra/schema/relay-hook"
import { LedgerRead } from "@orchestra/relay/ledger/read"
import { AgentV2 } from "../src/agent"
import { Config } from "../src/config"
import { Database } from "../src/database/database"
import { AppNodeBuilder } from "../src/effect/app-node-builder"
import { LayerNode } from "../src/effect/layer-node"
import { EventV2 } from "../src/event"
import { FSUtil } from "../src/fs-util"
import { Global } from "../src/global"
import { Location } from "../src/location"
import { PermissionV2 } from "../src/permission"
import { AppProcess } from "../src/process"
import { Project } from "../src/project"
import { ProjectTable } from "../src/project/sql"
import { Relay } from "../src/relay"
import { RelayHookInstall } from "../src/relay-hook-install"
import { AbsolutePath } from "../src/schema"
import { SessionV2 } from "../src/session"
import { SessionTable } from "../src/session/sql"
import { BashTool } from "../src/tool/bash"
import { ToolRegistry } from "../src/tool/registry"
import { ToolSafety } from "../src/tool-safety"
import { location } from "./fixture/location"
import { testEffect } from "./lib/effect"
import { executeTool, toolIdentity } from "./lib/tool"

const it = testEffect(LayerNode.compile(FSUtil.node))

it.live("actual Relay before-Verify then native permission rejection leaves output ancestors absent", () =>
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "relay-safety-" }).pipe(Effect.flatMap(fs.realPath))
    const work = path.join(root, "work")
    const data = path.join(root, "data")
    const home = path.join(root, "home")
    yield* Effect.forEach([work, data, home], (directory) => fs.makeDirectory(directory), { discard: true })
    const snapshot = Schema.decodeUnknownSync(RelayHook.V1)({
      schema: "relay.hook.v1", name: "Before command", binding: "host-required", installed: false,
      nodes: [
        { id: "event", name: "Before command", type: RelayHook.NodeType.trigger, position: [0, 0], parameters: { operation: "command", timing: "before" } },
        { id: "verify", name: "Check", type: RelayHook.NodeType.verify, position: [0, 0], parameters: { message: "Neutral preflight must pass", check: "true" } },
      ],
      connections: [{ from: "event", port: 0, to: "verify" }],
    })
    const installed = yield* RelayHookInstall.install({ data, projectID: Project.ID.global, document: "doc-preflight", version: "v1", snapshot,
      sha256: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"), principal: "user:test" })
    yield* fs.writeFileString(path.join(work, "generator.cjs"), "require('fs').writeFileSync('generated/deep/out.ts','must-not-run')")
    return yield* Effect.gen(function* () {
      const database = yield* Database.Service
      const agents = yield* AgentV2.Service
      const events = yield* EventV2.Service
      const permissions = yield* PermissionV2.Service
      const safety = yield* ToolSafety.Service
      const registry = yield* ToolRegistry.Service
      const relay = yield* Relay.Service
      const sessionID = SessionV2.ID.make(`ses_relay_safety_${Date.now()}`)
      yield* database.db.insert(ProjectTable).values({ id: Project.ID.global, worktree: AbsolutePath.make(work), sandboxes: [] }).onConflictDoNothing().run().pipe(Effect.orDie)
      yield* database.db.insert(SessionTable).values({ id: sessionID, project_id: Project.ID.global, slug: "relay-safety", directory: work,
        title: "relay-safety", version: "test", agent: toolIdentity.agent }).run().pipe(Effect.orDie)
      yield* agents.transform((editor) => editor.update(toolIdentity.agent, (agent) => { agent.permissions = [] }))
      const asked = yield* Deferred.make<PermissionV2.Request>()
      const unsubscribe = yield* events.listen((event) => event.type === PermissionV2.Event.Asked.type
        ? Deferred.succeed(asked, Schema.decodeUnknownSync(PermissionV2.Request)(event.data)).pipe(Effect.asVoid) : Effect.void)
      yield* Effect.addFinalizer(() => unsubscribe)
      // Invoke the actual Core Bash leaf: its native permission must follow the real Relay prehook.
      const effect = executeTool(registry, { sessionID, ...toolIdentity,
        call: { type: "tool-call", id: "relay-safety", name: "bash", input: { command: "node generator.cjs", timeout: 5000 } },
      }).pipe(
        Effect.provideService(Location.Service, location({ directory: AbsolutePath.make(work) })),
        Effect.provideService(EventV2.Service, events),
      )
      const fiber = yield* safety.run({ tool: "bash", args: { command: "node generator.cjs", prepareParents: true }, sessionID, callID: "relay-safety",
        assistantMessageID: toolIdentity.assistantMessageID, agent: toolIdentity.agent, directory: work, projectID: Project.ID.global }, effect, () => Effect.void).pipe(
        Effect.provideService(ToolSafety.RuntimeProfile, { requireSandbox: true, writeRoots: ["generated/deep/out.ts"], managedPaths: [data],
          sandbox: { enabled: true, scratch: true, unconfinedFallback: true }, hooks: [installed.install] }),
        Effect.exit, Effect.forkScoped,
      )
      const request = yield* Effect.raceFirst(Deferred.await(asked), Fiber.join(fiber).pipe(
        Effect.flatMap((exit) => Effect.fail(new Error(`Relay/permission control returned without native ask: ${Exit.isFailure(exit) ? Cause.pretty(exit.cause) : JSON.stringify(exit.value)}`))),
      )).pipe(Effect.timeout("15 seconds"))
      expect(request.action).toBe("bash")
      const entries = yield* LedgerRead.entries(path.join(relay.paths.hooks, installed.install.installID, "ledger.jsonl"))
      expect(entries.some((entry) => entry.event === "checklist-item" && entry.wp === "verify" && entry.verdict === "pass")).toBe(true)
      expect(yield* fs.exists(path.join(work, "generated"))).toBe(false)
      yield* permissions.reply({ requestID: request.id, reply: "reject" })
      const result = yield* Fiber.join(fiber)
      expect(Exit.isFailure(result)).toBe(true)
      if (!Exit.isFailure(result)) throw new Error("Native rejection did not stop the tool")
      expect(Result.getOrUndefined(Cause.findDefect(result.cause))).toBeInstanceOf(PermissionV2.DeclinedError)
      expect(yield* fs.exists(path.join(work, "generated"))).toBe(false)
    }).pipe(Effect.provide(AppNodeBuilder.build(LayerNode.group([
      ToolSafety.node, PermissionV2.node, AgentV2.node, EventV2.node, AppProcess.node, FSUtil.node, Database.node, Relay.node,
      ToolRegistry.node, ToolRegistry.toolsNode, BashTool.node,
    ]), [
      [Global.node, Global.layerWith({ data, home })],
      [Location.node, Layer.succeed(Location.Service, location({ directory: AbsolutePath.make(work) }))],
      [Config.node, Layer.succeed(Config.Service, Config.Service.of({ entries: () => Effect.succeed([]) }))],
    ])))
  }), 60_000,
)
