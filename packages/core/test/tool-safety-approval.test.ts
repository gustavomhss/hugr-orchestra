import { expect } from "bun:test"
import path from "path"
import { Deferred, Effect, Fiber, Layer, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppNodeBuilder } from "../src/effect/app-node-builder"
import { LayerNode } from "../src/effect/layer-node"
import { AgentV2 } from "../src/agent"
import { Database } from "../src/database/database"
import { EventV2 } from "../src/event"
import { Location } from "../src/location"
import { PermissionV2 } from "../src/permission"
import { Project } from "../src/project"
import { ProjectTable } from "../src/project/sql"
import { AppProcess } from "../src/process"
import { FSUtil } from "../src/fs-util"
import { AbsolutePath } from "../src/schema"
import { SessionV2 } from "../src/session"
import { SessionTable } from "../src/session/sql"
import { ToolSafety } from "../src/tool-safety"
import { location } from "./fixture/location"
import { tmpdir } from "./fixture/tmpdir"
import { toolIdentity } from "./lib/tool"
import { testEffect } from "./lib/effect"

const it = testEffect(Layer.empty)

it.live("askBefore push enters real native permission graph; model approval labels cannot satisfy it", () =>
  Effect.gen(function* () {
    const tmp = yield* Effect.acquireRelease(Effect.promise(() => tmpdir()), (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()))
    yield* Effect.gen(function* () {
      const database = yield* Database.Service
      const agents = yield* AgentV2.Service
      const permissions = yield* PermissionV2.Service
      const events = yield* EventV2.Service
      const processes = yield* AppProcess.Service
      const fs = yield* FSUtil.Service
      const safety = yield* ToolSafety.Service
      const sessionID = SessionV2.ID.make(`ses_approval_${Date.now()}`)
      yield* database.db.insert(ProjectTable).values({ id: Project.ID.global, worktree: AbsolutePath.make(tmp.path), sandboxes: [] }).onConflictDoNothing().run().pipe(Effect.orDie)
      yield* database.db.insert(SessionTable).values({ id: sessionID, project_id: Project.ID.global, slug: "approval", directory: tmp.path,
        title: "approval", version: "test", agent: "build" }).run().pipe(Effect.orDie)
      yield* agents.transform((editor) => editor.update(toolIdentity.agent, (agent) => { agent.permissions = [] }))
      expect((yield* permissions.ask({ sessionID, agent: toolIdentity.agent, action: "push", resources: ["git push"] })).effect).toBe("ask")
      const invocation = { tool: "bash", sessionID, callID: "approval", directory: tmp.path, projectID: Project.ID.global,
        args: { command: "git push", userApproved: true, approved: true } }
      const child = processes.run(ChildProcess.make(process.execPath, ["-e", "require('fs').writeFileSync('reached','written')"], { cwd: tmp.path }))
      const unbound = yield* Effect.flip(safety.run(invocation, child, () => Effect.void).pipe(
        Effect.provideService(ToolSafety.RuntimeProfile, { askBefore: ["push"] }),
      ))
      if (!(unbound instanceof ToolSafety.Denied)) throw unbound
      expect(unbound.reason).toBe("ask-before-native-binding-missing")
      expect(yield* fs.exists(path.join(tmp.path, "reached"))).toBe(false)
      const asked = yield* Deferred.make<PermissionV2.Request>()
      const unsubscribe = yield* events.listen((event) => event.type === PermissionV2.Event.Asked.type
        ? Deferred.succeed(asked, Schema.decodeUnknownSync(PermissionV2.Request)(event.data)).pipe(Effect.asVoid) : Effect.void)
      yield* Effect.addFinalizer(() => unsubscribe)
      const host = { ask: (request: ToolSafety.Approval) => permissions.assert({ sessionID, agent: toolIdentity.agent,
        action: request.action, resources: request.resources,
        save: [], metadata: {},
        source: { type: "tool" as const, messageID: toolIdentity.assistantMessageID, callID: invocation.callID },
      }).pipe(Effect.mapError(() => new ToolSafety.Denied({ reason: "native-permission-denied" }))) }
      const run = () => safety.run(invocation, child, () => Effect.void).pipe(
        Effect.provideService(ToolSafety.RuntimeProfile, { askBefore: ["push"] }),
        Effect.provideService(ToolSafety.NativeHost, host),
      )
      const fiber = yield* run().pipe(Effect.forkScoped)
      const request = yield* Effect.raceFirst(Deferred.await(asked), Fiber.join(fiber).pipe(
        Effect.flatMap(() => Effect.fail(new Error("NATIVE_ASK_RETURNED_WITHOUT_REPLY"))),
      )).pipe(Effect.timeout("10 seconds"))
      expect(request.action).toBe("push")
      expect(request.resources).toEqual(["git push"])
      expect(request.source).toEqual({ type: "tool", messageID: toolIdentity.assistantMessageID, callID: "approval" })
      expect(yield* fs.exists(path.join(tmp.path, "reached"))).toBe(false)
      yield* permissions.reply({ requestID: request.id, reply: "once" })
      expect((yield* Fiber.join(fiber)).exitCode).toBe(0)
      expect(yield* fs.exists(path.join(tmp.path, "reached"))).toBe(true)
      yield* fs.remove(path.join(tmp.path, "reached"))
      yield* agents.transform((editor) => editor.update(toolIdentity.agent, (agent) => { agent.permissions = [{ action: "push", resource: "*", effect: "deny" }] }))
      const rejected = yield* Effect.flip(run())
      if (!(rejected instanceof ToolSafety.Denied)) throw rejected
      expect(rejected.reason).toBe("native-permission-denied")
      expect(yield* fs.exists(path.join(tmp.path, "reached"))).toBe(false)
    }).pipe(Effect.provide(AppNodeBuilder.build(LayerNode.group([ToolSafety.node, PermissionV2.node, AgentV2.node, EventV2.node, AppProcess.node, FSUtil.node, Database.node]), [
      [Location.node, Layer.succeed(Location.Service, location({ directory: AbsolutePath.make(tmp.path) }))],
    ])))
  }),
)
