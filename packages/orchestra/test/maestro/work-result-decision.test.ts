import { afterEach, describe, expect } from "bun:test"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { ModelV2 } from "@orchestra/core/model"
import { Npm } from "@orchestra/core/npm"
import { ProviderV2 } from "@orchestra/core/provider"
import { SessionProjector } from "@orchestra/core/session/projector"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { OrchestraEvent } from "@orchestra/protocol/groups/event"
import { eq } from "drizzle-orm"
import { Cause, Effect, Exit, Schema } from "effect"
import { createHash } from "node:crypto"
import { Agent } from "@/agent/agent"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { WorkResultDecision } from "@/maestro/work-result-decision"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import { MaestroRecordResultDecisionTool } from "@/tool/maestro-result-decision"
import { ToolRegistry } from "@/tool/registry"
import { Truncate } from "@/tool/truncate"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { disposeAllInstances, provideTmpdirInstance } from "../fixture/fixture"
import { decisionFixture } from "../fixture/work-result-decision"
import { NpmTest } from "../fake/npm"
import { testEffect } from "../lib/effect"

afterEach(disposeAllInstances)
const it = testEffect(TestAppNodeBuilder.build(LayerNode.group([
  ToolRegistry.node, SessionProjector.node, Database.node, EventV2Bridge.node, Agent.node, Session.node, CrossSpawnSpawner.node, Truncate.node,
]), [[Npm.node, NpmTest.noop], [RuntimeFlags.node, RuntimeFlags.layer({ pure: true, disableDefaultPlugins: true })]]))
const failure = (exit: Exit.Exit<unknown, unknown>) => Exit.isFailure(exit) ? Cause.pretty(exit.cause) : "succeeded"
const decisions = Effect.gen(function* () {
  const database = yield* Database.Service
  return yield* database.db.select().from(EventTable)
    .where(eq(EventTable.type, EventV2.versionedType(MaestroEvent.WorkResult.Decided.type, 1)))
    .all().pipe(Effect.orDie)
})

describe("durable WorkResult decision", () => {
  it.instance("native registry visibility and permission deny use actual agent info", () => Effect.gen(function* () {
    const agents = yield* Agent.Service
    const registry = yield* ToolRegistry.Service
    const maestro = yield* agents.get("maestro")
    const backend = yield* agents.get("backend")
    const general = yield* agents.get("general")
    if (!maestro || !backend || !general) throw new Error("native agents missing")
    const ref = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") }
    const name = MaestroRecordResultDecisionTool.id
    expect((yield* registry.tools({ ...ref, agent: maestro })).map((tool) => tool.id)).toContain(name)
    yield* Effect.forEach([backend, general, { ...maestro, native: false }], (agent) => Effect.gen(function* () {
      expect((yield* registry.tools({ ...ref, agent })).map((tool) => tool.id)).not.toContain(name)
    }))
    expect((yield* registry.tools({ ...ref, agent: maestro,
      permission: [{ permission: name, pattern: "*", action: "deny" }],
    })).map((tool) => tool.id)).not.toContain(name)
  }))

  it.instance("tool uses actual stored part; pending acceptance and terminal/verification stay intact", () => Effect.gen(function* () {
    const fixture = yield* decisionFixture({ nested: true, verification: "host-verified", terminal: "blocked" })
    const tool = yield* MaestroRecordResultDecisionTool
    const def = yield* tool.init()
    const output = yield* def.execute(fixture.target, fixture.context)
    const row = (yield* decisions)[0]
    expect(row?.aggregate_id).toBe(fixture.root.id)
    expect(row?.data).toMatchObject({ decision: "accepted", terminalReason: "blocked", verificationState: "host-verified",
      projectID: fixture.root.projectID, taskId: fixture.binding.taskId, memberID: "backend",
      authoritySessionID: fixture.root.id, executionSessionID: fixture.child.id,
      resultRef: { parentSessionID: fixture.parent.id, messageID: fixture.part.messageID, partID: fixture.part.id, callID: fixture.part.callID },
    })
    expect(output.metadata.decisionID).toBe(row?.id)
    const wire = Schema.encodeSync(OrchestraEvent)(Schema.decodeUnknownSync(OrchestraEvent)({
      id: row?.id, type: MaestroEvent.WorkResult.Decided.type, data: row?.data,
    }))
    expect(wire).toMatchObject({ type: "maestro.work_result.decided", data: row?.data })
    expect("reason" in wire.data).toBe(false)
    expect(Schema.is(MaestroEvent.WorkResult.Decided.data)({ ...row?.data, workResultHash: "caller-hash" })).toBe(false)
    const sessions = yield* Session.Service
    expect(yield* sessions.getPart({ sessionID: fixture.parent.id, messageID: fixture.part.messageID, partID: fixture.part.id })).toEqual(fixture.part)
    expect(yield* WorkResultDecision.read(EventV2.ID.make(output.metadata.decisionID))).toMatchObject(row?.data ?? {})
  }))

  it.instance("direct domain and tool refuse workers, forged payloads and extra authority/hash inputs", () => Effect.gen(function* () {
    const fixture = yield* decisionFixture()
    yield* Effect.forEach(["backend", "general", "missing"], (agentID) => Effect.gen(function* () {
      expect(failure(yield* Effect.exit(WorkResultDecision.record({ ...fixture.input, agentID })))).toContain("native-maestro-required")
    }))
    const tool = yield* MaestroRecordResultDecisionTool
    const def = yield* tool.init()
    expect(failure(yield* Effect.exit(def.execute(fixture.target, { ...fixture.context, agentID: "backend", agent: "maestro" })))).toContain("native-maestro-required")
    yield* Effect.forEach(["workResult", "projectID", "authoritySessionID", "workResultHash", "acceptance"], (key) => Effect.gen(function* () {
      const forged = { ...fixture.target, [key]: fixture.result }
      expect(failure(yield* Effect.exit(WorkResultDecision.record({ ...fixture.input, target: forged })))).toContain("invalid-target")
      expect(failure(yield* Effect.exit(def.execute(forged, fixture.context)))).toContain("unknown parameter")
    }))
    expect(yield* decisions).toHaveLength(0)
  }))

  it.instance("ownership checks refuse child callers, other roots/projects, wrong children and result identities", () => Effect.gen(function* () {
    const fixture = yield* decisionFixture({ nested: true })
    const sessions = yield* Session.Service
    expect(failure(yield* Effect.exit(WorkResultDecision.record({ ...fixture.input, sessionID: fixture.parent.id })))).toContain("root-caller-required")
    const other = yield* sessions.create({ agent: "maestro" })
    expect(failure(yield* Effect.exit(WorkResultDecision.record({ ...fixture.input, sessionID: other.id })))).toContain("target-authority-mismatch")
    const foreign = yield* provideTmpdirInstance(() => sessions.create({ agent: "maestro" }), { git: true })
    expect(foreign.projectID).not.toBe(fixture.root.projectID)
    expect(failure(yield* Effect.exit(WorkResultDecision.record({ ...fixture.input, sessionID: foreign.id })))).toContain("session-project-mismatch")
    if (fixture.part.state.status !== "completed") throw new Error("fixture not completed")
    const wrong = yield* sessions.create({ parentID: fixture.root.id, agent: "backend" })
    const general = yield* sessions.create({ parentID: fixture.parent.id, agent: "general" })
    const unbound = yield* sessions.create({ parentID: fixture.parent.id, agent: "backend" })
    yield* Effect.forEach([
      [wrong.id, "task-child-mismatch"], [general.id, "task-child-mismatch"],
      [unbound.id, "work-result-identity-mismatch"], [foreign.id, "session-project-mismatch"],
    ] as const, ([sessionId, reason]) => Effect.gen(function* () {
      if (fixture.part.state.status !== "completed") throw new Error("fixture not completed")
      yield* sessions.updatePart({ ...fixture.part, state: { ...fixture.part.state, metadata: { sessionId, workResult: fixture.result } } })
      expect(failure(yield* Effect.exit(WorkResultDecision.record(fixture.input)))).toContain(reason)
    }))
    yield* Effect.forEach(["memberId", "taskId", "authoritySessionId", "executionSessionId"], (key) => Effect.gen(function* () {
      if (fixture.part.state.status !== "completed") throw new Error("fixture not completed")
      yield* sessions.updatePart({ ...fixture.part, state: { ...fixture.part.state,
        metadata: { sessionId: fixture.child.id, workResult: { ...fixture.result, [key]: "ses_forged" } } } })
      expect(failure(yield* Effect.exit(WorkResultDecision.record(fixture.input)))).not.toBe("succeeded")
    }))
    expect(yield* decisions).toHaveLength(0)
  }))

  it.instance("missing, wrong-prefix, non-Task, running and legacy results refuse before writes", () => Effect.gen(function* () {
    const fixture = yield* decisionFixture()
    yield* Effect.forEach([
      { parentSessionID: "sesbad" }, { messageID: "msgbad" }, { partID: "prtbad" },
      { messageID: MessageID.ascending() }, { partID: PartID.ascending() },
      { parentSessionID: SessionID.make("ses_missing") },
    ], (changed) => Effect.gen(function* () {
      expect(failure(yield* Effect.exit(WorkResultDecision.record({ ...fixture.input, target: { ...fixture.target, ...changed } })))).not.toBe("succeeded")
    }))
    const sessions = yield* Session.Service
    yield* sessions.updatePart({ ...fixture.part, tool: "shell" })
    expect(failure(yield* Effect.exit(WorkResultDecision.record(fixture.input)))).toContain("task-part-not-found")
    yield* sessions.updatePart({ ...fixture.part, state: { status: "running", input: {}, time: { start: 1 } } })
    expect(failure(yield* Effect.exit(WorkResultDecision.record(fixture.input)))).toContain("task-part-not-final")
    if (fixture.part.state.status !== "completed") throw new Error("fixture not completed")
    const { memberId, ...legacy } = fixture.result
    yield* Effect.forEach([undefined, legacy, { ...fixture.result, acceptance: { state: "accepted" } }], (workResult) => Effect.gen(function* () {
      if (fixture.part.state.status !== "completed") throw new Error("fixture not completed")
      yield* sessions.updatePart({ ...fixture.part, state: { ...fixture.part.state, metadata: { sessionId: fixture.child.id, workResult } } })
      expect(failure(yield* Effect.exit(WorkResultDecision.record(fixture.input)))).toContain("work-result-not-projected")
    }))
    yield* sessions.updatePart({ ...fixture.part, state: { ...fixture.part.state,
      metadata: { sessionId: fixture.child.id, background: true, workResult: { ...fixture.result, terminal: { reason: "running" } } } } })
    expect(failure(yield* Effect.exit(WorkResultDecision.record(fixture.input)))).toContain("work-result-not-final")
    expect(yield* decisions).toHaveLength(0)
  }))

  it.instance("failed/incomplete acceptance requires nonblank reason; rejection needs none; unarmed allowed", () => Effect.gen(function* () {
    yield* Effect.forEach(["host-failed", "host-incomplete"] as const, (verification) => Effect.gen(function* () {
      const fixture = yield* decisionFixture({ verification, terminal: "failed" })
      const sessions = yield* Session.Service
      if (fixture.part.state.status !== "completed") throw new Error("fixture not completed")
      yield* sessions.updatePart({ ...fixture.part, state: { ...fixture.part.state, status: "error", error: "host failure" } })
      yield* Effect.forEach([undefined, "", " \n\t"], (reason) => Effect.gen(function* () {
        expect(failure(yield* Effect.exit(WorkResultDecision.record({ ...fixture.input, target: { ...fixture.target, reason } })))).toContain("override-reason-required")
      }))
      const accepted = yield* WorkResultDecision.record({ ...fixture.input, target: { ...fixture.target, reason: "Owner accepts known gap" } })
      expect(accepted).toMatchObject({ decision: "accepted", verificationState: verification, terminalReason: "failed" })
      const rejected = yield* decisionFixture({ verification })
      expect((yield* WorkResultDecision.record({ ...rejected.input, target: { ...rejected.target, decision: "rejected" } })).decision).toBe("rejected")
    }))
    const unarmed = yield* decisionFixture()
    expect((yield* WorkResultDecision.record(unarmed.input)).verificationState).toBe("not-host-verified")
  }))

  it.instance("exact retry is immutable; changed decision or reason conflicts", () => Effect.gen(function* () {
    const fixture = yield* decisionFixture()
    const first = yield* WorkResultDecision.record(fixture.input)
    expect(yield* WorkResultDecision.record(fixture.input)).toEqual(first)
    yield* Effect.forEach([{ decision: "rejected" }, { reason: "different" }], (changed) => Effect.gen(function* () {
      expect(failure(yield* Effect.exit(WorkResultDecision.record({ ...fixture.input, target: { ...fixture.target, ...changed } })))).toContain("WorkResultDecisionConflict")
    }))
    expect(yield* WorkResultDecision.read(EventV2.ID.make(first.id))).toEqual(first)
    expect(yield* decisions).toHaveLength(1)
  }))

  it.instance("concurrent exact retries reconcile; concurrent contradictory decisions preserve winner", () => Effect.gen(function* () {
    const same = yield* decisionFixture()
    const records = yield* Effect.all([WorkResultDecision.record(same.input), WorkResultDecision.record(same.input)], { concurrency: "unbounded" })
    expect(records[0]).toEqual(records[1])
    const fixture = yield* decisionFixture()
    const raced = yield* Effect.all([
      WorkResultDecision.record(fixture.input),
      WorkResultDecision.record({ ...fixture.input, target: { ...fixture.target, decision: "rejected" } }),
    ].map(Effect.exit), { concurrency: "unbounded" })
    expect(raced.filter(Exit.isSuccess)).toHaveLength(1)
    expect(raced.filter(Exit.isFailure)).toHaveLength(1)
    expect(raced.map(failure).join("\n")).toContain("WorkResultDecisionConflict")
    expect(yield* decisions).toHaveLength(2)
  }))

  it.instance("hash binds raw stored JSON; reordered keys retry; changed content creates new artifact", () => Effect.gen(function* () {
    const fixture = yield* decisionFixture()
    const first = yield* WorkResultDecision.record(fixture.input)
    // Independent canonical preimage, not the implementation's hash helper or focused consumer schema.
    const preimage = `{"acceptance":{"state":"pending"},"authoritySessionId":${JSON.stringify(fixture.root.id)},"blockers":[],"card":{"parsed":true},"changes":[],"checks":[],"executionSessionId":${JSON.stringify(fixture.child.id)},"memberId":"backend","memory":{"reads":[],"writes":[]},"mode":"delegated","nextActions":[],"outcome":"done","risks":[],"schema":"backend-work-result-v1","taskId":${JSON.stringify(fixture.binding.taskId)},"terminal":{"reason":"ended"},"verification":{"state":"not-host-verified"}}`
    expect(first.workResultHash).toBe(createHash("sha256").update(preimage).digest("hex"))
    const sessions = yield* Session.Service
    if (fixture.part.state.status !== "completed") throw new Error("fixture not completed")
    yield* sessions.updatePart({ ...fixture.part, state: { ...fixture.part.state, metadata: { sessionId: fixture.child.id,
      workResult: Object.fromEntries(Object.entries(fixture.result).reverse()) } } })
    expect(yield* WorkResultDecision.record(fixture.input)).toEqual(first)
    yield* sessions.updatePart({ ...fixture.part, state: { ...fixture.part.state, metadata: { sessionId: fixture.child.id,
      workResult: { ...fixture.result, risks: ["new stored risk"] } } } })
    const changed = yield* WorkResultDecision.record(fixture.input)
    expect(changed.id).not.toBe(first.id)
    expect(changed.workResultHash).not.toBe(first.workResultHash)
    expect(yield* WorkResultDecision.read(EventV2.ID.make(first.id))).toEqual(first)
    expect(yield* decisions).toHaveLength(2)
    expect(failure(yield* Effect.exit(WorkResultDecision.record({ ...fixture.input,
      target: { ...fixture.target, workResultHash: first.workResultHash } })))).toContain("invalid-target")
  }))
})
