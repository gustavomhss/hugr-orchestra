import { Database } from "@orchestra/core/database/database"
import { MessageTable, PartTable, SessionMessageTable } from "@orchestra/core/session/sql"
import { SessionV1 } from "@orchestra/core/v1/session"
import { SessionMessage } from "@orchestra/schema/session-message"
import { UpstreamAttribution } from "@orchestra/schema/upstream-attribution"
import { eq } from "drizzle-orm"
import { Effect, Option, Schema } from "effect"
import { isDeepStrictEqual } from "node:util"
import { Agent } from "@/agent/agent"
import { MessageV2 } from "@/session/message-v2"
import { MessageID, SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import { NotFoundError } from "@/storage/storage"
import { BackendResult } from "./backend-result"
import { LogicalTask } from "./logical-task"
import { roster } from "./roster"
import { Seats } from "./seats"
import { UpstreamResult } from "./upstream-result"

export class Denied extends Schema.TaggedErrorClass<Denied>()("UpstreamAttributionDenied", {
  code: Schema.Literals([
    "UPSTREAM_ATTRIBUTION_MISSING", "UPSTREAM_ATTRIBUTION_PROJECT_MISMATCH",
    "UPSTREAM_ATTRIBUTION_REGISTRY_MISMATCH", "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH",
    "UPSTREAM_ATTRIBUTION_AUTHOR_MISMATCH", "UPSTREAM_ATTRIBUTION_TASK_MISMATCH",
    "UPSTREAM_ATTRIBUTION_PROPOSAL_UNAVAILABLE",
  ]),
  message: Schema.String,
}) {}

const decodeRecord = Schema.decodeUnknownOption(Schema.Record(Schema.String, Schema.Unknown))
const decodeMessage = Schema.decodeUnknownSync(SessionMessage.Message)
const decodeAttribution = Schema.decodeUnknownSync(UpstreamAttribution.V1)
// Private host port, not a worker DTO: Relay must write this on the exact native Task only after durable
// delivery, capturing the returned assistant before async work, and preserve it against stale Task completion.
// WorkResult is compared with BackendResult's actual stored-source assembly below, not redefined here.
const Settlement = Schema.Struct({
  parentMessageID: SessionMessage.ID,
  parentCallID: Schema.NonEmptyString,
  workResult: Schema.Record(Schema.String, Schema.Unknown),
  deliveryMessageID: SessionMessage.ID,
  deliveryPartID: Schema.optional(Schema.NonEmptyString),
})
const decodeSettlement = Schema.decodeUnknownOption(Settlement)

type Call = {
  id: string
  name: string
  status: string
  input: Record<string, unknown> | undefined
  metadata: Record<string, unknown> | undefined
  providerExecuted: boolean
}
type Evidence = {
  id: string
  sessionID: SessionID
  completed: boolean
  role: string
  agent: string | undefined
  error: boolean
  finish: string | undefined
  texts: string[]
  tools: Call[]
  owned: boolean
  legacy?: SessionV1.WithParts
}

/** Observe stored proposals; background delivery requires Relay's private exact Task settlement port. */
export const observe = Effect.fn("UpstreamProvenance.observe")(function* (
  input: Pick<UpstreamAttribution.V1, "projectID" | "parentSessionID" | "parentMessageID" | "parentCallID" | "authorSessionID" | "authorMessageID" | "logicalTaskID">,
) {
  if (!input.parentCallID || !input.logicalTaskID)
    return yield* new Denied({ code: "UPSTREAM_ATTRIBUTION_MISSING", message: "Task call and logical Task references are required" })
  const agents = yield* Agent.Service
  const agent = yield* agents.get("walt")
  const seat = Seats.find("walt")
  if (!agent || agent.id !== "walt" || agent.native !== true || agent.mode !== "subagent" ||
    !seat || seat.profileKey !== "upstream" || seat.workResult !== UpstreamResult.SCHEMA ||
    roster.find((member) => member.memberId === agent.id)?.nativeProfile !== "upstream")
    return yield* new Denied({ code: "UPSTREAM_ATTRIBUTION_REGISTRY_MISMATCH", message: "Native walt upstream seat is unavailable or inconsistent" })

  const sessions = yield* Session.Service
  const parent = yield* sessions.get(input.parentSessionID).pipe(Effect.catchIf(NotFoundError.isInstance, missing))
  const child = yield* sessions.get(input.authorSessionID).pipe(Effect.catchIf(NotFoundError.isInstance, missing))
  if (parent.projectID !== input.projectID || child.projectID !== input.projectID)
    return yield* new Denied({ code: "UPSTREAM_ATTRIBUTION_PROJECT_MISMATCH", message: "Parent and author Sessions must belong to the expected Project" })
  if (child.id === parent.id || child.parentID !== parent.id)
    return yield* new Denied({ code: "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH", message: "Author Session is not a direct child of the authority Session" })
  if (child.agent !== agent.id)
    return yield* new Denied({ code: "UPSTREAM_ATTRIBUTION_AUTHOR_MISMATCH", message: "Author Session does not belong to native walt" })

  const authority = yield* readMessage(parent.id, input.parentMessageID, "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH")
  if (!authority.owned || authority.role !== "assistant" || authority.agent !== "maestro")
    return yield* new Denied({ code: "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH", message: "Authority must be an actual owned Maestro assistant" })
  const calls = authority.tools.filter((call) => call.id === input.parentCallID)
  const call = calls[0]
  if (calls.length !== 1 || !call || call.name !== "task" || call.input?.subagent_type !== agent.id || call.providerExecuted)
    return yield* new Denied({ code: "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH", message: "Authority must contain one exact native Task dispatch to walt" })
  const initial = record(call.metadata?.workResult)
  const background = call.metadata?.background === true || record(initial?.terminal)?.reason === "running"
  if (authority.error || authority.finish === "error" || call.status !== "completed" || call.metadata?.interrupted === true ||
    ["failed", "error", "interrupted"].includes(String(record(initial?.terminal)?.reason)))
    return yield* new Denied({ code: "UPSTREAM_ATTRIBUTION_PROPOSAL_UNAVAILABLE", message: "Parent or Task failed, was interrupted, or has not completed" })
  // Caller-settable synthetic notices, process-local job status, timestamps, and matching bytes cannot establish
  // the returned assistant identity or host delivery. Do not infer a settlement from any of those facts.
  const settlement = background
    ? Option.getOrUndefined(decodeSettlement(call.metadata?.upstreamSettlement, { onExcessProperty: "error" }))
    : undefined
  if (background && (!settlement || settlement.parentMessageID !== authority.id || settlement.parentCallID !== call.id))
    return yield* new Denied({
      code: "UPSTREAM_ATTRIBUTION_PROPOSAL_UNAVAILABLE",
      message: "HOLD: background attribution requires exact host Task settlement and a referenced durable delivery",
    })
  const snapshot = settlement?.workResult ?? initial
  if (settlement && record(snapshot?.terminal)?.reason !== "ended")
    return yield* new Denied({ code: "UPSTREAM_ATTRIBUTION_PROPOSAL_UNAVAILABLE", message: "HOLD: captured host Task did not end successfully" })
  if (!call.metadata || call.metadata.parentSessionId !== parent.id || call.metadata.sessionId !== child.id)
    return yield* new Denied({ code: "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH", message: "Host Task placement does not match the parent and author Sessions" })

  const logical = yield* LogicalTask.read(child.id)
  if (!logical) return yield* new Denied({ code: "UPSTREAM_ATTRIBUTION_MISSING", message: "Retained logical Task binding is missing" })
  if (logical.projectID !== input.projectID)
    return yield* new Denied({ code: "UPSTREAM_ATTRIBUTION_PROJECT_MISMATCH", message: "Retained logical Task belongs to another Project" })
  // The binding has already passed LogicalTask admission. Do not redeclare its user-named Task grammar.
  if (logical.taskId.startsWith("ses_") || logical.taskId === child.id || logical.taskId !== input.logicalTaskID ||
    logical.executionSessionID !== child.id || logical.authoritySessionID !== parent.id || logical.memberID !== agent.id)
    return yield* new Denied({ code: "UPSTREAM_ATTRIBUTION_TASK_MISMATCH", message: "Retained logical Task identity, execution, member, or authority does not match" })

  const author = yield* readMessage(child.id, input.authorMessageID, "UPSTREAM_ATTRIBUTION_AUTHOR_MISMATCH")
  if (!author.owned || author.role !== "assistant" || author.agent !== agent.id)
    return yield* new Denied({ code: "UPSTREAM_ATTRIBUTION_AUTHOR_MISMATCH", message: "Proposal must be an actual owned walt assistant" })
  const proposal = author.legacy ? BackendResult.assemble(author.legacy, [], seat) : modernProposal(author)
  if (!proposal || (background && (!author.completed || author.finish === "error")) || !proposal.card.parsed || proposal.outcome !== "done" || proposal.terminal.reason !== "ended" || proposal.blockers.length)
    return yield* new Denied({ code: "UPSTREAM_ATTRIBUTION_PROPOSAL_UNAVAILABLE", message: "Author has no unique parsed successful terminal upstream proposal" })
  if (!snapshot || snapshot.schema !== UpstreamResult.SCHEMA)
    return yield* new Denied({ code: "UPSTREAM_ATTRIBUTION_PROPOSAL_UNAVAILABLE", message: "Host Task work result is missing or incompatible" })
  if (snapshot.taskId !== logical.taskId)
    return yield* new Denied({ code: "UPSTREAM_ATTRIBUTION_TASK_MISMATCH", message: "Host Task work result selects another logical Task" })

  if (!matchesWorkResult(snapshot, proposal, logical.taskId))
    return yield* new Denied({ code: "UPSTREAM_ATTRIBUTION_PROPOSAL_UNAVAILABLE", message: "Host Task completion does not select this exact successful proposal" })
  if (settlement) yield* readDelivery(parent.id, child.id, settlement)

  return decodeAttribution({
    schema: "maestro-upstream-attribution-v1", projectID: parent.projectID, memberID: agent.id, profile: seat.profileKey,
    authorSessionID: child.id, authorMessageID: author.id, parentSessionID: parent.id,
    parentMessageID: authority.id, parentCallID: call.id, logicalTaskID: logical.taskId,
  })
})

function missing(error: NotFoundError) {
  return new Denied({ code: "UPSTREAM_ATTRIBUTION_MISSING", message: error.message })
}

const readDelivery = Effect.fn("UpstreamProvenance.readDelivery")(function* (
  parentID: SessionID, childID: SessionID, settlement: typeof Settlement.Type,
) {
  const database = yield* Database.Service
  const current = yield* database.db.select().from(SessionMessageTable)
    .where(eq(SessionMessageTable.id, settlement.deliveryMessageID)).get().pipe(Effect.orDie)
  const retained = yield* database.db.select().from(MessageTable)
    .where(eq(MessageTable.id, MessageID.make(settlement.deliveryMessageID))).get().pipe(Effect.orDie)
  const denied = new Denied({ code: "UPSTREAM_ATTRIBUTION_PROPOSAL_UNAVAILABLE", message: "HOLD: referenced host delivery is missing, invalid, conflicting, or belongs to another Session" })
  if ((!current && !retained) || (current && current.session_id !== parentID) || (retained && retained.session_id !== parentID))
    return yield* denied
  const modern = current ? Option.getOrUndefined(Schema.decodeUnknownOption(SessionMessage.Message)({
    ...current.data, id: current.id, type: current.type,
  })) : undefined
  if (current && (!modern || modern.type !== "synthetic" || modern.sessionID !== parentID || !modern.text || record(current.data)?.error))
    return yield* denied
  if (!retained) {
    if (settlement.deliveryPartID !== undefined) return yield* denied
    return
  }
  if (!settlement.deliveryPartID || record(retained.data)?.error) return yield* denied
  const parts = yield* database.db.select().from(PartTable)
    .where(eq(PartTable.message_id, retained.id)).all().pipe(Effect.orDie)
  const legacy = Option.getOrUndefined(Schema.decodeUnknownOption(SessionV1.WithParts)({
    info: { ...retained.data, id: retained.id, sessionID: retained.session_id },
    parts: parts.map((part) => ({ ...part.data, id: part.id, sessionID: part.session_id, messageID: part.message_id })),
  }))
  if (!legacy || legacy.info.role !== "user" || legacy.parts.some((part) =>
    part.sessionID !== parentID || part.messageID !== retained.id || (part.type === "tool" && part.state.status === "error")))
    return yield* denied
  const selected = legacy.parts.filter((part) => part.id === settlement.deliveryPartID)
  const part = selected[0]
  if (selected.length !== 1 || !part || part.type !== "text" || part.synthetic !== true || part.ignored === true ||
    !part.text || (part.time && part.time.end === undefined)) return yield* denied
  const source = record(part.metadata?.source)
  if (source?.type !== "task-return" || source.task_id !== childID || source.state !== "completed" ||
    !isDeepStrictEqual(part.metadata?.workResult, settlement.workResult)) return yield* denied
  // V2 projection drops arbitrary synthetic metadata. Authority is the Task receipt, never the synthetic flag.
  // If both stores retain this identity, require the same delivered text and reject either unfavorable view.
  if (modern && (modern.type !== "synthetic" || modern.text !== part.text)) return yield* denied
})

const readMessage = Effect.fn("UpstreamProvenance.readMessage")(function* (
  sessionID: SessionID, selectedID: SessionMessage.ID, code: Denied["code"],
) {
  const database = yield* Database.Service
  const current = yield* database.db.select().from(SessionMessageTable)
    .where(eq(SessionMessageTable.id, selectedID)).get().pipe(Effect.orDie)
  const retained = yield* database.db.select({ owner: MessageTable.session_id }).from(MessageTable)
    .where(eq(MessageTable.id, MessageID.make(selectedID))).get().pipe(Effect.orDie)
  if ((current && current.session_id !== sessionID) || (retained && retained.owner !== sessionID))
    return yield* new Denied({ code, message: "Referenced projection belongs to another Session" })
  const modern = current ? modernEvidence(current.session_id, decodeMessage({ ...current.data, id: current.id, type: current.type })) : undefined
  const legacy = retained ? legacyEvidence(yield* MessageV2.get({ sessionID, messageID: MessageID.make(selectedID) })
    .pipe(Effect.catchIf(NotFoundError.isInstance, missing))) : undefined
  if (modern && legacy && !isDeepStrictEqual(comparable(modern), comparable(legacy)))
    return yield* new Denied({ code, message: "V1 and V2 projections disagree on the same message identity" })
  if (modern) return modern
  if (legacy) return legacy
  return yield* new Denied({ code: "UPSTREAM_ATTRIBUTION_MISSING", message: "Referenced message is missing" })
})

function comparable(message: Evidence) {
  const { legacy, ...facts } = message
  return facts
}

function legacyEvidence(message: SessionV1.WithParts): Evidence {
  return {
    id: message.info.id, sessionID: message.info.sessionID,
    completed: message.info.role === "assistant" && message.info.time.completed !== undefined,
    role: message.info.role, agent: message.info.role === "assistant" ? message.info.agent : undefined,
    error: message.info.role === "assistant" && !!message.info.error,
    finish: message.info.role === "assistant" ? message.info.finish : undefined,
    texts: message.parts.flatMap((part) => part.type === "text" ? [part.text] : []),
    tools: message.parts.flatMap((part) => part.type === "tool" ? [{
      id: part.callID, name: part.tool, status: part.state.status, input: record(part.state.input),
      metadata: "metadata" in part.state ? record(part.state.metadata) : undefined,
      providerExecuted: part.metadata?.providerExecuted === true,
    }] : []),
    owned: message.parts.every((part) => part.sessionID === message.info.sessionID && part.messageID === message.info.id),
    legacy: message,
  }
}

function modernEvidence(sessionID: SessionID, message: SessionMessage.Message): Evidence {
  const assistant = message.type === "assistant" ? message : undefined
  return {
    id: message.id, sessionID,
    completed: assistant?.time.completed !== undefined,
    role: assistant ? "assistant" : message.type === "synthetic" || message.type === "user" ? "user" : message.type,
    agent: assistant?.agent, error: !!assistant?.error, finish: assistant?.finish,
    texts: assistant ? assistant.content.flatMap((item) => item.type === "text" ? [item.text] : []) : "text" in message ? [message.text] : [],
    tools: assistant?.content.flatMap((item) => item.type === "tool" ? [{
      id: item.id, name: item.name, status: item.state.status, input: record(item.state.input),
      // ToolOutput's structured value is persisted verbatim; a JSON legacy result retains its metadata envelope.
      // Provider resultMetadata and state.result are provider-owned transport, never host Task metadata.
      metadata: "structured" in item.state ? record(item.state.structured.metadata) : undefined,
      providerExecuted: item.provider?.executed === true,
    }] : []) ?? [],
    owned: message.type !== "synthetic" || message.sessionID === sessionID,
  }
}

function modernProposal(author: Evidence): BackendResult.WorkResult | undefined {
  const card = UpstreamResult.parse(author.texts.join("\n"))
  if (!card || author.error || !author.completed || !author.finish || ["tool-calls", "unknown", "error"].includes(author.finish) ||
    author.tools.some((tool) => tool.status !== "completed")) return
  return {
    schema: UpstreamResult.SCHEMA, card: { parsed: true, messageID: author.id }, outcome: card.outcome,
    changes: [], checks: [], blockers: card.blockers, risks: card.risks, nextActions: card.nextActions,
    artifacts: card.artifacts, terminal: { reason: card.outcome === "blocked" || card.blockers.length ? "blocked" : "ended" },
    memory: { reads: [], writes: [] }, author: { memberId: "walt", executionSessionID: author.sessionID, messageID: author.id },
  }
}

function record(value: unknown) { return Option.getOrUndefined(decodeRecord(value)) }
function matchesWorkResult(value: unknown, proposal: BackendResult.WorkResult, taskID: string) {
  const stored = record(value)
  return stored !== undefined && Object.entries({ ...proposal, taskId: taskID }).every(([key, expected]) => isDeepStrictEqual(stored[key], expected))
}

export * as UpstreamProvenance from "./upstream-provenance"
