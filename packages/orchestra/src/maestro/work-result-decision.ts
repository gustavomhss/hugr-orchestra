export * as WorkResultDecision from "./work-result-decision"

import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { eq } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { Agent } from "@/agent/agent"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Session } from "@/session/session"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { LogicalTask } from "./logical-task"
import { SessionAuthority } from "./session-authority"

export const Parameters = Schema.Struct({
  parentSessionID: SessionID.check(Schema.isPattern(/^ses_/)),
  messageID: MessageID.check(Schema.isPattern(/^msg_/)),
  partID: PartID.check(Schema.isPattern(/^prt_/)),
  decision: MaestroEvent.WorkResult.Decided.data.fields.decision,
  reason: Schema.optional(Schema.String),
})

// Only fields needed by this consumer. Hash the raw stored JSON, including fields outside this projection.
const HostResult = Schema.Struct({
  schema: Schema.Literal("backend-work-result-v1"),
  taskId: Schema.NonEmptyString,
  memberId: Schema.Literal("backend"),
  executionSessionId: SessionID.check(Schema.isPattern(/^ses_/)),
  authoritySessionId: SessionID.check(Schema.isPattern(/^ses_/)),
  mode: Schema.Literals(["delegated", "delegated-armed"]),
  acceptance: Schema.Struct({ state: Schema.Literal("pending") }),
  verification: Schema.Struct({ state: MaestroEvent.WorkResult.Decided.data.fields.verificationState }),
  terminal: Schema.Struct({ reason: Schema.Literals(["ended", "blocked", "failed", "interrupted", "running"]) }),
})
const HostMetadata = Schema.Struct({
  sessionId: SessionID.check(Schema.isPattern(/^ses_/)),
  workResult: Schema.Json,
})

export class Denied extends Schema.TaggedErrorClass<Denied>()("WorkResultDecisionDenied", {
  reason: Schema.String,
}) {
  override get message() {
    return `${this._tag}: ${this.reason}`
  }
}

export class Conflict extends Schema.TaggedErrorClass<Conflict>()("WorkResultDecisionConflict", {
  id: Schema.String,
}) {
  override get message() {
    return `${this._tag}: ${this.id} already records a different decision or reason`
  }
}

export const record = Effect.fn("WorkResultDecision.record")(function* (input: {
  sessionID: string
  agentID: string
  target: unknown
}) {
  const agents = yield* Agent.Service
  const caller = yield* agents.get(input.agentID)
  if (caller?.id !== "maestro" || caller.native !== true)
    return yield* new Denied({ reason: "native-maestro-required" })
  const target = yield* Schema.decodeUnknownEffect(Parameters)(input.target, { onExcessProperty: "error" }).pipe(
    Effect.mapError(() => new Denied({ reason: "invalid-target" })),
  )
  const sessions = yield* Session.Service
  const callerID = yield* Schema.decodeUnknownEffect(SessionID)(input.sessionID).pipe(
    Effect.mapError(() => new Denied({ reason: "caller-session-invalid" })),
  )
  const current = yield* sessions
    .get(callerID)
    .pipe(Effect.mapError(() => new Denied({ reason: "caller-session-missing" })))
  const authority = SessionAuthority.make(sessions.get)
  const root = yield* authority(current.id, current.projectID).pipe(
    Effect.mapError((error) => new Denied({ reason: error.reason })),
  )
  if (root.rootID !== current.id) return yield* new Denied({ reason: "root-caller-required" })
  const parent = yield* authority(target.parentSessionID, current.projectID).pipe(
    Effect.mapError((error) => new Denied({ reason: error.reason })),
  )
  if (parent.rootID !== current.id) return yield* new Denied({ reason: "target-authority-mismatch" })
  const part = yield* sessions.getPart({
    sessionID: target.parentSessionID,
    messageID: target.messageID,
    partID: target.partID,
  })
  if (!part || part.type !== "tool" || part.tool !== "task") return yield* new Denied({ reason: "task-part-not-found" })
  if (part.state.status !== "completed" && part.state.status !== "error")
    return yield* new Denied({ reason: "task-part-not-final" })
  const metadata = yield* Schema.decodeUnknownEffect(HostMetadata)(part.state.metadata).pipe(
    Effect.mapError(() => new Denied({ reason: "work-result-not-projected" })),
  )
  const result = yield* Schema.decodeUnknownEffect(HostResult)(metadata.workResult).pipe(
    Effect.mapError(() => new Denied({ reason: "work-result-not-projected" })),
  )
  if (result.terminal.reason === "running") return yield* new Denied({ reason: "work-result-not-final" })
  const child = yield* authority(metadata.sessionId, current.projectID).pipe(
    Effect.mapError((error) => new Denied({ reason: error.reason })),
  )
  const worker = child.execution.agent ? yield* agents.get(child.execution.agent) : undefined
  if (
    worker?.id !== "backend" ||
    worker.native !== true ||
    child.execution.parentID !== target.parentSessionID ||
    child.rootID !== current.id
  )
    return yield* new Denied({ reason: "task-child-mismatch" })
  const binding = yield* LogicalTask.read(child.execution.id).pipe(
    Effect.mapError((error) => new Denied({ reason: error.reason })),
  )
  if (
    !binding ||
    binding.projectID !== current.projectID ||
    binding.memberID !== "backend" ||
    binding.executionSessionID !== child.execution.id ||
    binding.authoritySessionID !== current.id ||
    result.taskId !== binding.taskId ||
    result.executionSessionId !== child.execution.id ||
    result.authoritySessionId !== current.id
  )
    return yield* new Denied({ reason: "work-result-identity-mismatch" })
  if (
    target.decision === "accepted" &&
    (result.verification.state === "host-failed" || result.verification.state === "host-incomplete") &&
    !target.reason?.trim()
  )
    return yield* new Denied({ reason: "override-reason-required" })
  const wanted = {
    projectID: current.projectID,
    memberID: result.memberId,
    taskId: binding.taskId,
    authoritySessionID: current.id,
    executionSessionID: child.execution.id,
    resultRef: {
      parentSessionID: target.parentSessionID,
      messageID: target.messageID,
      partID: target.partID,
      callID: part.callID,
    },
    workResultHash: hash(metadata.workResult),
    decision: target.decision,
    verificationState: result.verification.state,
    terminalReason: result.terminal.reason,
    ...(target.reason !== undefined ? { reason: target.reason } : {}),
  }
  const id = EventV2.ID.make(
    `evt_maestro_work_result_decision_${hash([
      current.id,
      target.parentSessionID,
      target.messageID,
      target.partID,
      wanted.workResultHash,
    ])}`,
  )
  const existing = yield* read(id)
  if (existing) return yield* reconcile(existing, wanted)
  const events = yield* EventV2Bridge.Service
  return yield* events.publish(MaestroEvent.WorkResult.Decided, wanted, { id }).pipe(
    Effect.map((event) => ({ id: event.id, ...event.data })),
    Effect.catchCause((cause) =>
      Effect.gen(function* () {
        // Publication races reconcile the actual stored event, never an attempted payload or an overwrite.
        const stored = yield* read(id)
        if (!stored) return yield* Effect.failCause(cause)
        return yield* reconcile(stored, wanted)
      }),
    ),
  )
})

type Data = Schema.Schema.Type<typeof MaestroEvent.WorkResult.Decided.data>

export const read = Effect.fn("WorkResultDecision.read")(function* (id: EventV2.ID) {
  const database = yield* Database.Service
  const row = yield* database.db.select().from(EventTable).where(eq(EventTable.id, id)).get().pipe(Effect.orDie)
  if (!row) return undefined
  if (row.type !== EventV2.versionedType(MaestroEvent.WorkResult.Decided.type, 1)) return yield* new Conflict({ id })
  const data = yield* Schema.decodeUnknownEffect(MaestroEvent.WorkResult.Decided.data)(row.data).pipe(
    Effect.mapError(() => new Conflict({ id })),
  )
  if (row.aggregate_id !== data.authoritySessionID) return yield* new Conflict({ id })
  return { id: row.id, ...data }
})

function reconcile(existing: Data & { id: EventV2.ID }, wanted: Data) {
  const { id, ...stored } = existing
  return isDeepStrictEqual(stored, wanted) ? Effect.succeed(existing) : Effect.fail(new Conflict({ id }))
}

function hash(value: Schema.Json) {
  return createHash("sha256").update(stable(value), "utf8").digest("hex")
}

function stable(value: Schema.Json): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`
  return JSON.stringify(value)
}
