export * as ScheduleFixture from "./capability-schedule"

import { join } from "node:path"
import { AgentV2 } from "@orchestra/core/agent"
import { CapabilityInvocation } from "@orchestra/core/capability/invocation"
import { CapabilitySchedule } from "@orchestra/core/capability/schedule/index"
import { CapabilityScheduleContract } from "@orchestra/core/capability/schedule/contract"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Location } from "@orchestra/core/location"
import { PermissionV2 } from "@orchestra/core/permission"
import { PermissionSaved } from "@orchestra/core/permission/saved"
import { Project, ProjectV2 } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { ScheduledTask } from "@orchestra/core/scheduled-task"
import { ScheduledTaskPort } from "@orchestra/core/scheduled-task/port"
import { ScheduledTaskTable } from "@orchestra/core/scheduled-task/sql"
import { SessionV2 } from "@orchestra/core/session"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionProjector } from "@orchestra/core/session/projector"
import { SessionTable } from "@orchestra/core/session/sql"
import { SessionStore } from "@orchestra/core/session/store"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Tools } from "@orchestra/core/tool/tools"
import { Model } from "@orchestra/schema/model"
import { Provider } from "@orchestra/schema/provider"
import { DateTime, Effect, Layer, Schema } from "effect"
import { CapabilityPolicyFixture } from "./capability-policy"
import { location } from "./location"
import { tmpdir } from "./tmpdir"

export const tmp = await tmpdir()
const placement = location(Location.Ref.make({ directory: AbsolutePath.make(tmp.path) }))
const execution = Layer.succeed(SessionExecution.Service, SessionExecution.Service.of({
  active: Effect.succeed(new Set()), resume: () => Effect.void, interrupt: () => Effect.void, wake: () => Effect.void,
  exclusive: (_, effect) => Effect.asSome(effect), withRunner: () => Effect.die("No Session runner in this fixture") }))
const projects = Layer.succeed(ProjectV2.Service, ProjectV2.Service.of({
  resolve: (directory) => Effect.succeed({ id: ProjectV2.ID.global, directory }),
  directories: () => Effect.succeed([]), list: () => Effect.succeed([]), commit: () => Effect.void }))
export const layer = AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node, SessionProjector.node,
  SessionStore.node, SessionV2.node, ScheduledTask.node, ScheduledTaskPort.node, PermissionV2.node, PermissionSaved.node, AgentV2.node,
  Location.node, ToolRegistry.node]), [
  [Database.node, Database.layerFromPath(join(tmp.path, "schedule.sqlite"))],
  [Location.node, Layer.succeed(Location.Service, Location.Service.of(placement))],
  [ProjectV2.node, projects],
  [SessionExecution.node, execution],
])
export const allow: PermissionV2.Ruleset = [{ action: "*", resource: "*", effect: "allow" }]

export const setup = Effect.gen(function* () {
  const database = yield* Database.Service
  const events = yield* EventV2.Service
  const registry = yield* ToolRegistry.Service
  const tools = yield* Tools.Service
  const leaf = yield* CapabilitySchedule.make()
  yield* tools.register(leaf.tools)
  yield* database.db.insert(ProjectTable).values({ id: Project.ID.global, worktree: placement.directory, sandboxes: [] })
    .onConflictDoNothing().run().pipe(Effect.orDie)
  yield* CapabilityPolicyFixture.setRules(allow)
  const session = Effect.gen(function* () {
    const context = { sessionID: SessionV2.ID.create(), agent: AgentV2.ID.make("test"), assistantMessageID: SessionMessage.ID.create() }
    yield* database.db.insert(SessionTable).values({ id: context.sessionID, project_id: Project.ID.global,
      directory: placement.directory, slug: "s", title: "s", version: "test", agent: "test" }).run().pipe(Effect.orDie)
    yield* events.publish(SessionEvent.Step.Started, { ...context, timestamp: DateTime.makeUnsafe(1), agent: "test",
      model: { id: Model.ID.make("model"), providerID: Provider.ID.make("provider") } })
    const counter = { n: 0 }
    // Through ToolRegistry, so permission ask/deny and settlement run exactly as for a model call.
    // `callID` replays an earlier call ID, as a retried settlement of the same tool call would.
    const call = (input: Schema.Json, callID?: string) => Effect.gen(function* () {
      const toolCallID = callID ?? `call-${++counter.n}`
      if (!callID) yield* events.publish(SessionEvent.Tool.Input.Started, { sessionID: context.sessionID,
        assistantMessageID: context.assistantMessageID, callID: toolCallID, name: CapabilitySchedule.name,
        timestamp: DateTime.makeUnsafe(1) })
      const owner = { projectID: placement.project.id, location: { directory: placement.directory },
        sessionID: context.sessionID, agentID: context.agent }
      return yield* CapabilityInvocation.withContext({ issuer: "core", owner, invocation: { sessionID: context.sessionID,
        agentID: context.agent, assistantMessageID: context.assistantMessageID, callID: toolCallID },
      rootToolName: CapabilitySchedule.name, effectiveRules: allow, nativeDenyFloor: [] },
      registry.materialize(allow).pipe(Effect.flatMap((materialized) => materialized.settle({ ...context,
        call: { type: "tool-call", id: toolCallID, name: CapabilitySchedule.name, input } }))))
    })
    const output = (input: Schema.Json, callID?: string) => call(input, callID).pipe(Effect.flatMap((settled) =>
      settled.result.type === "error" ? Effect.die(new Error(String(settled.result.value)))
        : Schema.decodeUnknownEffect(CapabilityScheduleContract.Output)(settled.output?.structured)))
    const failure = (input: Schema.Json) => call(input).pipe(Effect.map((settled) =>
      settled.result.type === "error" ? String(settled.result.value) : "unexpected success"))
    return { context, output, failure, last: () => `call-${counter.n}` }
  })
  const rows = database.db.select().from(ScheduledTaskTable).all().pipe(Effect.orDie)
  return { session, rows }
})
