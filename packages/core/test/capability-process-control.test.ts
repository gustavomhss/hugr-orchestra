import { expect } from "bun:test"
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
import { Tool } from "@orchestra/core/tool/tool"
import { Capability } from "@orchestra/schema/capability"
import { Model } from "@orchestra/schema/model"
import { Provider } from "@orchestra/schema/provider"
import { DateTime, Effect, Layer, Schedule, Schema } from "effect"
import { eq } from "drizzle-orm"
import { CapabilityPolicyFixture } from "./fixture/capability-policy"
import { location } from "./fixture/location"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const tmp = await tmpdir()
const placement = location(Location.Ref.make({ directory: AbsolutePath.make(tmp.path) }))
const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node, SessionProjector.node,
  SessionStore.node, PermissionV2.node, PermissionSaved.node, AgentV2.node, Location.node, FSUtil.node, Global.node,
  LocationMutation.node, AppProcess.node, CapabilityProcessRegistry.node]), [
  [Database.node, Database.layerFromPath(join(tmp.path, "process.sqlite"))],
  [Location.node, Layer.succeed(Location.Service, Location.Service.of(placement))],
  [Global.node, Global.layerWith({ data: tmp.path, home: tmp.path })],
]))
const allow: PermissionV2.Ruleset = [{ action: "*", resource: "*", effect: "allow" }]
const child = (script: string) => [process.execPath, "-e", script]
const echo = child(`process.stdout.write("key:" + process.env.CUSTOM_API_KEY + "\\n"); process.stdin.on("data", (d) => process.stdout.write("got:" + d)); process.stdin.on("end", () => process.exit(3))`)

const setup = Effect.gen(function* () {
  const database = yield* Database.Service
  const events = yield* EventV2.Service
  const jobs = yield* CapabilityJobs.make
  const leaf = yield* CapabilityProcessControl.make({ jobs })
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
    const call = (input: Schema.Json) => Effect.gen(function* () {
      const toolCallID = `call-${++counter.n}`
      yield* events.publish(SessionEvent.Tool.Input.Started, { sessionID: context.sessionID,
        assistantMessageID: context.assistantMessageID, callID: toolCallID, name: "process_control", timestamp: DateTime.makeUnsafe(1) })
      const owner = { projectID: placement.project.id, location: { directory: placement.directory },
        sessionID: context.sessionID, agentID: context.agent }
      return yield* CapabilityInvocation.withContext({ issuer: "core", owner, invocation: { sessionID: context.sessionID, agentID: context.agent,
        assistantMessageID: context.assistantMessageID, callID: toolCallID }, rootToolName: "process_control", effectiveRules: allow, nativeDenyFloor: [] },
      Tool.settle(leaf.tools.process_control, { type: "tool-call", id: toolCallID, name: "process_control", input },
        { ...context, toolCallID }))
    })
    const output = (input: Schema.Json) => call(input).pipe(
      Effect.flatMap((result) => Schema.decodeUnknownEffect(CapabilityProcessContract.Output)(result.structured)))
    const failure = (input: Schema.Json) => call(input).pipe(Effect.flip, Effect.map((error) => error.message))
    return { context, call, output, failure }
  })
  const durable = (id: string, state: Capability.JobState) => database.db.select().from(CapabilityJobTable)
    .where(eq(CapabilityJobTable.id, Capability.JobID.make(id))).get().pipe(Effect.orDie,
      Effect.filterOrFail((row) => row?.state === state), Effect.retry(Schedule.spaced("20 millis").pipe(Schedule.take(250))))
  const count = (sessionID: string) => database.db.select().from(CapabilityJobTable).all()
    .pipe(Effect.orDie, Effect.map((rows) => rows.filter((row) => row.owner.sessionID === sessionID).length))
  return { session, durable, count }
})

it.live("pipe process lifecycle: start, input, output, wait, settle completed/failed/cancelled", () => Effect.gen(function* () {
  const f = yield* setup
  const s = yield* f.session()
  const started = yield* s.output({ action: "start", argv: echo, env: { CUSTOM_API_KEY: "bound" } })
  if (started.action !== "start") throw new Error("expected start")
  const id = started.status.process.id
  expect(started.status.state).toBe("running")
  expect((yield* s.output({ action: "list" }))).toMatchObject({ action: "list", items: [{ process: { id } }] })
  yield* s.output({ action: "write", id, data: "a" })
  yield* s.output({ action: "submit", id, data: "b" })
  const waited = yield* s.output({ action: "wait", id, cursor: 0, timeoutMs: 5000 })
  expect(waited).toMatchObject({ action: "wait", timedOut: false })
  yield* s.output({ action: "close-input", id })
  expect(yield* s.failure({ action: "write", id, data: "late" })).toContain("unsupported_operation")
  yield* f.durable(id, "failed")
  const log = yield* s.output({ action: "log", id, cursor: 0 })
  if (log.action !== "log") throw new Error("expected log")
  expect(log.chunk.text).toContain("key:bound")
  expect(log.chunk.text).toContain("got:a")
  expect(log.chunk.text).toContain("b\n")
  expect(log.status).toMatchObject({ state: "failed", input: "closed", exit: { code: 3 } })

  const ok = yield* s.output({ action: "start", argv: child(`console.log("done")`) })
  if (ok.action !== "start") throw new Error("expected start")
  yield* f.durable(ok.status.process.id, "completed")

  const long = yield* s.output({ action: "start", argv: child(`setInterval(() => {}, 1000)`) })
  if (long.action !== "start") throw new Error("expected start")
  expect(yield* s.output({ action: "stop", id: long.status.process.id })).toMatchObject({ action: "stop", outcome: "local-stop" })
  yield* f.durable(long.status.process.id, "cancelled")
}))

it.live("pty and denied bash permission create no job and no process", () => Effect.gen(function* () {
  const f = yield* setup
  const s = yield* f.session()
  const registry = yield* CapabilityProcessRegistry.Service
  const running = registry.live().size
  expect(yield* s.failure({ action: "start", argv: echo, mode: "pty" })).toContain("unsupported_operation")
  yield* CapabilityPolicyFixture.setRules([...allow, { action: "bash", resource: "*", effect: "deny" }])
  expect(yield* s.failure({ action: "start", argv: echo })).toContain("Blocked")
  yield* CapabilityPolicyFixture.setRules(allow)
  expect(yield* f.count(s.context.sessionID)).toBe(0)
  expect(registry.live().size).toBe(running)
  expect(yield* s.output({ action: "list" })).toEqual({ action: "list", items: [] })
}))

it.live("foreign and unknown IDs fail identically; transfer moves only child to parent", () => Effect.gen(function* () {
  const f = yield* setup
  const parent = yield* f.session()
  const s = yield* f.session({ parentID: parent.context.sessionID })
  const foreign = yield* f.session()
  const started = yield* s.output({ action: "start", argv: echo })
  if (started.action !== "start") throw new Error("expected start")
  const id = started.status.process.id
  const unknown = yield* foreign.failure({ action: "status", id: Capability.JobID.create() })
  expect(unknown).toContain("target_denied")
  const actions: Schema.Json[] = [{ action: "status", id }, { action: "log", id }, { action: "wait", id, timeoutMs: 0 },
    { action: "write", id, data: "x" }, { action: "submit", id, data: "x" }, { action: "close-input", id },
    { action: "stop", id }, { action: "transfer", id }]
  for (const input of actions) expect(yield* foreign.failure(input)).toBe(unknown)
  expect(yield* foreign.output({ action: "list" })).toEqual({ action: "list", items: [] })
  expect(yield* s.output({ action: "status", id })).toMatchObject({ status: { state: "running", input: "open" } })
  expect(yield* foreign.failure({ action: "transfer", id })).toBe(unknown)
  expect(yield* s.output({ action: "transfer", id })).toMatchObject({ action: "transfer", status: { state: "running" } })
  expect(yield* s.failure({ action: "status", id })).toBe(unknown)
  expect(yield* parent.output({ action: "status", id })).toMatchObject({ status: { state: "running", input: "open" } })
  expect(yield* parent.failure({ action: "transfer", id })).toBe(unknown)
  yield* parent.output({ action: "close-input", id })
  yield* f.durable(id, "failed")
}))
