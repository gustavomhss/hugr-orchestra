export * as AtlasKnowledge from "./atlas-knowledge"

import { Buffer } from "node:buffer"
import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { eq } from "drizzle-orm"
import { Context, Effect, FileSystem, Layer, Option, Schema } from "effect"
import { Database } from "@orchestra/core/database/database"
import { filesystem } from "@orchestra/core/effect/app-node-platform"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { MessageTable, SessionMessageTable } from "@orchestra/core/session/sql"
import { AtlasKnowledge } from "@orchestra/schema/atlas-knowledge"
import { ProjectID } from "@orchestra/schema/project-id"
import { SessionID } from "@orchestra/schema/session-id"
import { SessionMessage } from "@orchestra/schema/session-message"
import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { Git } from "@/git"
import { Session } from "@/session/session"
import { MessageID } from "@/session/schema"
import { Skill } from "@/skill"
import { AtlasDiscovery } from "./atlas-discovery"
import { AtlasMemory } from "./atlas-memory"
import { readAtlasSource } from "./atlas-source"

export const Invocation = Schema.Struct({
  action: Schema.Literal("anchor"),
  target: AtlasKnowledge.Target,
  units: Schema.Array(AtlasKnowledge.UnitID).check(
    Schema.isMinLength(1), Schema.isMaxLength(AtlasKnowledge.MAX_UNITS),
    Schema.isUnique(),
  ),
}).annotate({ parseOptions: { onExcessProperty: "error" } })

export class Held extends Schema.TaggedErrorClass<Held>()("AtlasKnowledgeHeld", {
  reason: Schema.String,
  evidence: Schema.Array(Schema.String),
}) {}

type Call = {
  messageID: string
  sessionID: string
  agent: string | undefined
  owned: boolean
  callID: string
  tool: string
  status: string
  providerExecuted: boolean
  input: unknown
  anchor: unknown
}
type Observed = { legacy: Call[]; modern: Call[]; legacyMessages: string[]; modernMessages: string[] }

const make = Effect.gen(function* () {
  const agents = yield* Agent.Service
  const sessions = yield* Session.Service
  const database = yield* Database.Service
  const context = yield* Effect.context<Config.Service | Git.Service | FileSystem.FileSystem | Skill.Service>()

  const placement = Effect.fn("AtlasKnowledge.placement")(function* (sessionID: SessionID, projectID: ProjectID) {
    const agent = yield* agents.get("archie")
    if (AtlasMemory.owner(agent) !== "archie" || agent?.mode !== "subagent")
      return yield* held("native-archie-required", [sessionID])
    const session = yield* sessions.get(sessionID).pipe(
      Effect.mapError(() => held("author-session-unavailable", [sessionID])),
    )
    if (session.projectID !== projectID || session.agent !== "archie")
      return yield* held("author-session-binding-mismatch", [sessionID, projectID])
    return session
  })

  // Read both durable projections, including anchors older than a context compaction.
  const calls = Effect.fn("AtlasKnowledge.calls")(function* (sessionID: SessionID) {
    const messages = yield* sessions.messages({ sessionID }).pipe(
      Effect.mapError(() => held("author-history-unavailable", [sessionID])),
    )
    const legacy = messages.flatMap((message) => message.parts.flatMap((part): Call[] => part.type !== "tool" ? [] : [{
      messageID: message.info.id, sessionID: message.info.sessionID,
      agent: message.info.role === "assistant" ? message.info.agent : undefined,
      owned: message.info.role === "assistant" && !message.info.error && message.info.finish !== "error" &&
        part.sessionID === sessionID && part.messageID === message.info.id,
      callID: part.callID, tool: part.tool, status: part.state.status,
      providerExecuted: part.metadata?.providerExecuted === true,
      input: part.state.input,
      anchor: "metadata" in part.state ? record(record(part.state.metadata)?.atlasContext)?.anchor : undefined,
    }]))
    const rows = yield* database.db.select().from(SessionMessageTable)
      .where(eq(SessionMessageTable.session_id, sessionID)).all().pipe(Effect.orDie)
    const modern = yield* Effect.forEach(rows, Effect.fnUntraced(function* (row) {
      const message = yield* Schema.decodeUnknownEffect(SessionMessage.Message)({ ...row.data, id: row.id, type: row.type })
        .pipe(Effect.mapError(() => held("author-history-invalid", [row.id])))
      return message.type !== "assistant" ? [] : message.content.flatMap((part): Call[] => part.type !== "tool" ? [] : [{
        messageID: message.id, sessionID: row.session_id, agent: message.agent,
        owned: !message.error && message.finish !== "error", callID: part.id, tool: part.name,
        status: part.state.status, providerExecuted: part.provider?.executed === true, input: part.state.input,
        // structured.metadata is host output; provider result/resultMetadata is never host evidence.
        anchor: "structured" in part.state ? record(record(part.state.structured.metadata)?.atlasContext)?.anchor : undefined,
      }])
    }))
    return { legacy, modern: modern.flat(), legacyMessages: messages.map((message) => message.info.id),
      modernMessages: rows.map((row) => row.id) }
  })

  const observe = Effect.fn("AtlasKnowledge.observe")(function* (sessionID: SessionID, matches: (call: Call) => boolean) {
    const observed = yield* calls(sessionID)
    const selected = yield* selectCall(observed, matches)
    const legacy = yield* database.db.select({ sessionID: MessageTable.session_id }).from(MessageTable)
      .where(eq(MessageTable.id, MessageID.make(selected.messageID))).get().pipe(Effect.orDie)
    const modern = yield* database.db.select({ sessionID: SessionMessageTable.session_id }).from(SessionMessageTable)
      .where(eq(SessionMessageTable.id, SessionMessage.ID.make(selected.messageID))).get().pipe(Effect.orDie)
    if ((legacy && legacy.sessionID !== sessionID) || (modern && modern.sessionID !== sessionID))
      return yield* held("anchor-projection-mismatch", [selected.messageID])
    return selected
  }, Effect.catchDefect((error) => Effect.fail(held("author-history-unavailable", [String(error)]))))

  const acquire = Effect.fn("AtlasKnowledge.acquire")(function* (session: Session.Info, units: readonly string[]) {
    const before = yield* readAtlasSource(session)
    const loaded = yield* Effect.forEach(units, Effect.fnUntraced(function* (id) {
      const unit = yield* AtlasDiscovery.unit(session, id)
      if (unit.projectID !== session.projectID || unit.unit !== id || unit.sourceIdentity !== before.identityHash ||
        unit.sourceRevision !== before.context.sourceRevision || unit.receipt.sourceRevision !== unit.sourceRevision ||
        unit.coverage.state !== "complete" || unit.coverage.freshness !== "FRESH" || unit.coverage.truncated !== false)
        return yield* held("unit-acquisition-mismatch", [id])
      return {
        unit: unit.unit, name: unit.name, sourceIdentity: unit.sourceIdentity, sourceRevision: unit.receipt.sourceRevision,
        contentHash: unit.contentHash, receiptHash: unit.receiptHash, bodyHash: digest(unit.content), content: unit.content,
      } satisfies AtlasKnowledge.Unit
    }))
    if (loaded.reduce((bytes, unit) => bytes + Buffer.byteLength(unit.content, "utf8"), 0) > AtlasKnowledge.MAX_BYTES)
      return yield* held("knowledge-body-budget-exceeded", units)
    const after = yield* readAtlasSource(session)
    if (after.identityHash !== before.identityHash || after.directory !== before.directory)
      return yield* held("source-changed-during-anchor", [before.identityHash, after.identityHash])
    return loaded
  }, Effect.provide(context), Effect.mapError((error) => error instanceof Held ? error : held(error.reason, error.evidence)))

  return {
    anchor: Effect.fn("AtlasKnowledge.anchor")(function* (input: {
      session: Session.Info; assistantMessageID: string; callID: string
      target: AtlasKnowledge.Target; units: readonly string[]
    }) {
      const invocation = Option.getOrUndefined(Schema.decodeUnknownOption(Invocation)({
        action: "anchor", target: input.target, units: input.units,
      }))
      if (!invocation) return yield* held("anchor-selection-invalid", [])
      const messageID = Option.getOrUndefined(Schema.decodeUnknownOption(SessionMessage.ID)(input.assistantMessageID))
      if (!messageID || !input.callID) return yield* held("anchor-call-identity-invalid", [])
      const session = yield* placement(input.session.id, input.session.projectID)
      if (session.directory !== input.session.directory) return yield* held("author-session-binding-mismatch", [session.id])
      const call = yield* observe(session.id, (call) => call.messageID === messageID && call.callID === input.callID)
      if (!nativeCall(call, session.id) || call.status !== "running" || !isDeepStrictEqual(call.input, invocation))
        return yield* held("anchor-invocation-mismatch", [input.callID])
      const payload = {
        projectID: session.projectID, authorSessionID: session.id, assistantMessageID: messageID,
        callID: input.callID, memberID: "archie" as const, target: invocation.target,
        units: yield* acquire(session, invocation.units),
      }
      return { reference: reference(payload), ...payload }
    }),
    resolve: Effect.fn("AtlasKnowledge.resolve")(function* (input: {
      projectID: ProjectID; authorSessionID: SessionID; reference: AtlasKnowledge.Reference
    }) {
      if (!Schema.is(AtlasKnowledge.Reference)(input.reference)) return yield* held("anchor-reference-invalid", [])
      const session = yield* placement(input.authorSessionID, input.projectID)
      const call = yield* observe(session.id, (call) => record(call.anchor)?.reference === input.reference)
      const anchor = Option.getOrUndefined(Schema.decodeUnknownOption(AtlasKnowledge.Anchor)(call.anchor))
      const invocation = Option.getOrUndefined(Schema.decodeUnknownOption(Invocation)(call.input))
      if (!nativeCall(call, session.id) || call.status !== "completed" || !anchor || !invocation ||
        anchor.projectID !== input.projectID || anchor.authorSessionID !== session.id ||
        anchor.assistantMessageID !== call.messageID || anchor.callID !== call.callID ||
        !isDeepStrictEqual(anchor.target, invocation.target) ||
        !isDeepStrictEqual(anchor.units.map((unit) => unit.unit), invocation.units))
        return yield* held("anchor-invocation-mismatch", [input.reference])
      if (anchor.units.reduce((bytes, unit) => bytes + Buffer.byteLength(unit.content, "utf8"), 0) > AtlasKnowledge.MAX_BYTES)
        return yield* held("knowledge-body-budget-exceeded", [input.reference])
      if (reference(anchor) !== input.reference || anchor.units.some((unit) => digest(unit.content) !== unit.bodyHash))
        return yield* held("anchor-digest-mismatch", [input.reference])
      const units = yield* acquire(session, invocation.units)
      if (!isDeepStrictEqual(units, anchor.units)) return yield* held("anchor-source-drift", [input.reference])
      return anchor
    }),
  }
})

export type Interface = Effect.Success<typeof make>
export class Service extends Context.Service<Service, Interface>()("@orchestra/AtlasKnowledge") {}
export const layer = Layer.effect(Service, make)
export const node = LayerNode.make({
  service: Service, layer,
  deps: [Agent.node, Session.node, Database.node, Config.node, Git.node, Skill.node, filesystem],
})

function held(reason: string, evidence: readonly string[]) { return new Held({ reason, evidence }) }
function record(value: unknown) {
  return Option.getOrUndefined(Schema.decodeUnknownOption(Schema.Record(Schema.String, Schema.Unknown))(value))
}
function nativeCall(call: Call, sessionID: SessionID) {
  return call.owned && call.sessionID === sessionID && call.agent === "archie" &&
    call.tool === "atlas_context" && !call.providerExecuted
}

const selectCall = Effect.fn("AtlasKnowledge.selectCall")(function* (
  observed: Observed, matches: (call: Call) => boolean,
) {
  const legacy = observed.legacy.filter(matches)
  const modern = observed.modern.filter(matches)
  if (legacy.length > 1 || modern.length > 1) return yield* held("anchor-duplicate", [])
  const selected = legacy[0] ?? modern[0]
  if (!selected) return yield* held("anchor-not-found", [])
  if ((observed.legacyMessages.includes(selected.messageID) && !observed.legacy.some((call) =>
    call.messageID === selected.messageID && call.callID === selected.callID)) ||
    (observed.modernMessages.includes(selected.messageID) && !observed.modern.some((call) =>
      call.messageID === selected.messageID && call.callID === selected.callID)))
    return yield* held("anchor-projection-mismatch", [selected.messageID])
  // A counterpart with a changed/removed reference must not disappear from validation.
  const counterparts = [...observed.legacy, ...observed.modern].filter((call) =>
    call.messageID === selected.messageID && call.callID === selected.callID)
  if (counterparts.some((call) => !isDeepStrictEqual(call, selected)))
    return yield* held("anchor-projection-mismatch", [selected.messageID, selected.callID])
  return selected
})

export function digest(content: string) { return createHash("sha256").update(content, "utf8").digest("hex") }

export function reference(anchor: Omit<AtlasKnowledge.Anchor, "reference">) {
  return digest(AtlasKnowledge.canonical(anchor))
}
