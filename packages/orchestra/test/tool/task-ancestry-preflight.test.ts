import { afterEach, expect } from "bun:test"
import { and, eq, or } from "drizzle-orm"
import { Cause, Effect, Exit } from "effect"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { SessionTable } from "@orchestra/core/session/sql"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { recordAdmission } from "@/maestro/admission-record"
import { renderPresentation } from "@/maestro/approval"
import { presentApprovalFromSession, recordApproval } from "@/maestro/approval-record"
import { SessionAuthority } from "@/maestro/session-authority"
import { taskHash } from "@/maestro/task-hash"
import { Session } from "@/session/session"
import { MessageID, PartID } from "@/session/schema"
import { TaskTool } from "@/tool/task"
import { disposeAllInstances, provideInstance, tmpdirScoped } from "../fixture/fixture"
import { awaitWithTimeout, testEffect } from "../lib/effect"
import { layer, ref, seed, stubOps } from "../maestro/governed-fixture"

const it = testEffect(layer)
afterEach(async () => { await disposeAllInstances() })

// A fresh, actually approved governed packet. Refusals must happen before its first reservation or permission ask.
const approved = Effect.gen(function* () {
  const f = yield* seed()
  yield* f.sessions.updatePart({ id: PartID.ascending(), messageID: f.user.id, sessionID: f.chat.id,
    type: "text", text: "Implement the approved work." })
  yield* recordAdmission({ sessionID: f.chat.id, messageID: f.user.id, methodVersion: "admit-request-v1",
    assessment: { kind: "work", goal: "Implement the approved work.", known: [], proposals: [], unknowns: [],
      uncertainty: "none", activeWorkEffect: "none", reason: "Explicit work request." } })
  const intent = { subagentType: "general", prompt: "implement approved work" }
  const binding = { planRevisionID: "plan_ancestry", revisionHash: "revision-hash",
    validationRecordID: "val_ancestry", validationHash: "validation-hash", contextHash: "context-hash", policyHash: "policy-hash" }
  const presentation = yield* presentApprovalFromSession({
    sessionID: f.chat.id, assistantMessageID: f.assistant.id, callID: "call_present", memberID: "maestro",
    ...binding, taskHash: taskHash({ ...intent, ...binding }), intent, methodVersion: "request-approval-v1",
    plan: "Implement the approved work.", provenance: `request ${f.user.id}`, assumptions: [],
    validationLedger: "val_ancestry: VALID", contextState: "CURRENT",
  })
  yield* f.sessions.updatePart({ id: PartID.ascending(), messageID: f.assistant.id, sessionID: f.chat.id,
    type: "tool", tool: "maestro_present_approval", callID: "call_present", state: {
      status: "completed", input: {}, output: renderPresentation(presentation), title: "Plan approval",
      metadata: {}, time: { start: 2, end: 3 },
    } })
  const at = Date.now() + 1000
  const user = yield* f.sessions.updateMessage({ id: MessageID.ascending(), role: "user", sessionID: f.chat.id,
    agent: "maestro", model: ref, time: { created: at } })
  yield* f.sessions.updatePart({ id: PartID.ascending(), messageID: user.id, sessionID: f.chat.id,
    type: "text", text: "aprovo" })
  const approval = yield* recordApproval(f.chat.id)
  expect(approval.status).toBe("APPROVED")
  if (approval.status !== "APPROVED") throw new Error("valid governed approval missing")
  const assistant = yield* f.sessions.updateMessage({ ...f.assistant, id: MessageID.ascending(),
    parentID: user.id, time: { created: at + 1000 } })
  const task = yield* TaskTool
  const asks: unknown[] = []
  const context = {
    sessionID: f.chat.id, messageID: assistant.id, callID: "call_governed_ancestry", agent: "maestro", agentID: "maestro",
    abort: new AbortController().signal, extra: { promptOps: stubOps() }, messages: [],
    metadata: () => Effect.void, ask: (request: unknown) => Effect.sync(() => { asks.push(request) }),
  }
  const database = yield* Database.Service
  const reservations = () => database.db.select().from(EventTable).where(and(
    eq(EventTable.aggregate_id, f.chat.id),
    or(eq(EventTable.type, EventV2.versionedType(MaestroEvent.Approval.Reserved.type, 1)),
      eq(EventTable.type, EventV2.versionedType(MaestroEvent.Approval.ReservedV2.type, 2)),
      eq(EventTable.type, EventV2.versionedType(MaestroEvent.Approval.Consumed.type, 1)),
      eq(EventTable.type, EventV2.versionedType(MaestroEvent.Approval.ConsumedV2.type, 2))),
  )).all().pipe(Effect.orDie)
  return { ...f, database, asks, context, reservations, def: yield* task.init(), params: {
    description: "approved work", prompt: intent.prompt, subagent_type: intent.subagentType,
    governed: { sessionID: f.chat.id, projectID: f.chat.projectID, memberID: "maestro",
      approvalMessageID: approval.decision.approvalMessageID, planRevisionID: approval.decision.planRevisionID,
      revisionHash: approval.decision.revisionHash, validationRecordID: approval.decision.validationRecordID,
      validationHash: approval.decision.validationHash, contextHash: approval.decision.contextHash,
      policyHash: approval.decision.policyHash, taskHash: approval.decision.taskHash },
  } }
})

it.instance("governed ancestry test control observes real ask and first reservation", () =>
  Effect.gen(function* () {
    const f = yield* approved
    expect(yield* f.reservations()).toEqual([])
    yield* f.def.execute(f.params, f.context)
    expect(f.asks).toHaveLength(1)
    expect((yield* f.reservations()).map((row) => row.type)).toContain(
      EventV2.versionedType(MaestroEvent.Approval.ReservedV2.type, 2),
    )
    expect(yield* f.sessions.children(f.chat.id)).toHaveLength(1)
  }), { git: true, config: { subagent_depth: 3 } },
)

const scenarios = [
  { kind: "cycle", reason: "session-parent-cycle" },
  { kind: "foreign", reason: "session-project-mismatch" },
]
scenarios.forEach((scenario) => it.instance(`governed Task refuses ${scenario.kind} ancestry before ask or reservation`, () =>
  Effect.gen(function* () {
    const f = yield* approved
    const parent = scenario.kind === "cycle"
      ? yield* f.sessions.create({ parentID: f.chat.id })
      : yield* Effect.gen(function* () {
          const directory = yield* tmpdirScoped({ git: true })
          const sessions = yield* Session.Service
          return yield* sessions.create({}).pipe(provideInstance(directory))
        })
    if (scenario.kind === "foreign") expect(parent.projectID).not.toBe(f.chat.projectID)
    yield* f.database.db.update(SessionTable).set({ parent_id: parent.id })
      .where(eq(SessionTable.id, f.chat.id)).run().pipe(Effect.orDie)
    const children = yield* f.sessions.children(f.chat.id)
    expect(yield* f.reservations()).toEqual([])
    const exit = yield* awaitWithTimeout(
      f.def.execute(f.params, f.context).pipe(Effect.exit), "Task ancestry preflight did not finish", "10 seconds",
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (!Exit.isFailure(exit)) throw new Error("invalid ancestry dispatched")
    const error = Cause.squash(exit.cause)
    expect(error).toBeInstanceOf(SessionAuthority.Denied)
    if (!(error instanceof SessionAuthority.Denied)) throw error
    expect(error.reason).toBe(scenario.reason)
    expect({ asks: f.asks, reservations: yield* f.reservations() }).toEqual({ asks: [], reservations: [] })
    expect(yield* f.sessions.children(f.chat.id)).toEqual(children)
  }), { git: true, config: { subagent_depth: 3 } },
))
