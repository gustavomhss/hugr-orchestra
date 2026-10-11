export * as ProcessControlFixture from "./capability-process-control"

import { join } from "node:path"
import { AgentV2 } from "@orchestra/core/agent"
import { CapabilityInvocation } from "@orchestra/core/capability/invocation"
import { CapabilityJobs } from "@orchestra/core/capability/job/index"
import { CapabilityProcessControl } from "@orchestra/core/capability/process-control/index"
import { CapabilityProcessContract } from "@orchestra/core/capability/process-control/contract"
import { CapabilityProcessRegistry } from "@orchestra/core/capability/process-control/registry"
import { CapabilityJobTable } from "@orchestra/core/capability/sql"
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
import { AppProcess } from "@orchestra/core/process"
import { Project } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionProjector } from "@orchestra/core/session/projector"
import { SessionTable } from "@orchestra/core/session/sql"
import { SessionStore } from "@orchestra/core/session/store"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Tool } from "@orchestra/core/tool/tool"
import { Tools } from "@orchestra/core/tool/tools"
import { Capability } from "@orchestra/schema/capability"
import { Model } from "@orchestra/schema/model"
import { Provider } from "@orchestra/schema/provider"
import { DateTime, Effect, Layer, Schedule, Schema } from "effect"
import { eq } from "drizzle-orm"
import { CapabilityPolicyFixture } from "./capability-policy"
import { location } from "./location"
import { tmpdir } from "./tmpdir"

export const tmp = await tmpdir()
const placement = location(Location.Ref.make({ directory: AbsolutePath.make(tmp.path) }))
export const layer = AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node, SessionProjector.node,
  SessionStore.node, PermissionV2.node, PermissionSaved.node, AgentV2.node, Location.node, FSUtil.node, Global.node,
  LocationMutation.node, AppProcess.node, CapabilityProcessRegistry.node, ToolRegistry.node]), [
  [Database.node, Database.layerFromPath(join(tmp.path, "process.sqlite"))],
  [Location.node, Layer.succeed(Location.Service, Location.Service.of(placement))],
  [Global.node, Global.layerWith({ data: tmp.path, home: tmp.path })],
])
export const allow: PermissionV2.Ruleset = [{ action: "*", resource: "*", effect: "allow" }]
export const child = (script: string) => [process.execPath, "-e", script]
export const echo = child(`process.stdout.write("key:" + process.env.CUSTOM_API_KEY + "\\n"); process.stdin.on("data", (d) => process.stdout.write("got:" + d)); process.stdin.on("end", () => process.exit(3))`)

export const setup = Effect.gen(function* () {
  const database = yield* Database.Service
  const events = yield* EventV2.Service
  const registry = yield* ToolRegistry.Service
  const tools = yield* Tools.Service
  const jobs = yield* CapabilityJobs.make
  const leaf = yield* CapabilityProcessControl.make({ jobs })
  yield* tools.register(leaf.tools)
  yield* database.db.insert(ProjectTable).values({ id: Project.ID.global, worktree: placement.directory, sandboxes: [] })
    .onConflictDoNothing().run().pipe(Effect.orDie)
  yield* CapabilityPolicyFixture.setRules(allow)
  const session = (options: { parentID?: SessionV2.ID } = {}) => Effect.gen(function* () {
    const context = { sessionID: SessionV2.ID.create(), agent: AgentV2.ID.make("test"), assistantMessageID: SessionMessage.ID.create() }
    yield* database.db.insert(SessionTable).values({ id: context.sessionID, project_id: Project.ID.global, directory: placement.directory,
      slug: "p", title: "p", version: "test", agent: "test", parent_id: options.parentID }).run().pipe(Effect.orDie)
    yield* events.publish(SessionEvent.Step.Started, { ...context, timestamp: DateTime.makeUnsafe(1), agent: "test",
      model: { id: Model.ID.make("model"), providerID: Provider.ID.make("provider") } })
    const counter = { n: 0 }
    const bound = <A, E>(input: Schema.Json, run: (call: { toolCallID: string; input: Schema.Json }) => Effect.Effect<A, E>) =>
      Effect.gen(function* () {
        const toolCallID = `call-${++counter.n}`
        yield* events.publish(SessionEvent.Tool.Input.Started, { sessionID: context.sessionID,
          assistantMessageID: context.assistantMessageID, callID: toolCallID, name: "process_control", timestamp: DateTime.makeUnsafe(1) })
        const owner = { projectID: placement.project.id, location: { directory: placement.directory },
          sessionID: context.sessionID, agentID: context.agent }
        return yield* CapabilityInvocation.withContext({ issuer: "core", owner, invocation: { sessionID: context.sessionID,
          agentID: context.agent, assistantMessageID: context.assistantMessageID, callID: toolCallID },
        rootToolName: "process_control", effectiveRules: allow, nativeDenyFloor: [] }, run({ toolCallID, input }))
      })
    const call = (input: Schema.Json) => bound(input, (next) => Tool.settle(leaf.tools.process_control,
      { type: "tool-call", id: next.toolCallID, name: "process_control", input }, { ...context, toolCallID: next.toolCallID }))
    // Through ToolRegistry: ToolSafety.before, askBefore and hooks run exactly as for a model call.
    const settle = (input: Schema.Json) => bound(input, (next) => registry.materialize(allow).pipe(Effect.flatMap((tools) =>
      tools.settle({ ...context, call: { type: "tool-call", id: next.toolCallID, name: "process_control", input } }))))
    const output = (input: Schema.Json) => call(input).pipe(
      Effect.flatMap((result) => Schema.decodeUnknownEffect(CapabilityProcessContract.Output)(result.structured)))
    const failure = (input: Schema.Json) => call(input).pipe(Effect.flip, Effect.map((error) => error.message))
    return { context, call, settle, output, failure }
  })
  const rows = (sessionID: string) => database.db.select().from(CapabilityJobTable).all()
    .pipe(Effect.orDie, Effect.map((all) => all.filter((row) => row.owner.sessionID === sessionID)))
  const durable = (id: string, state: Capability.JobState) => database.db.select().from(CapabilityJobTable)
    .where(eq(CapabilityJobTable.id, Capability.JobID.make(id))).get().pipe(Effect.orDie,
      Effect.filterOrFail((row) => row?.state === state), Effect.retry(Schedule.spaced("20 millis").pipe(Schedule.take(250))))
  const count = (sessionID: string) => rows(sessionID).pipe(Effect.map((all) => all.length))
  return { session, durable, count, rows }
})
