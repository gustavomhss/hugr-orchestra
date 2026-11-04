import { Option, Schema } from "effect"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import type { Agent } from "@/v2-wire"
import type { ToolStateCompleted } from "@/v2-types"
import type { AssistantMessage, Message, Part, ToolPart } from "@/v2-wire"

import type { MaestroReviewCardFinding, MaestroReviewItem, ReviewRoutingRecord } from "@/v2-wire"
import type { SessionMessageAssistantTool } from "@/v2-wire"
import type { SessionMessageInfo } from "@/session-types"

import type { State } from "@/context/global-sync/types"
import { agentKey } from "@/context/agent-identity"

// Session message APIs retain tool results, not a current Maestro read projection. Session history
// exposes Session events. These are
// historical observations, never an authorization chain. Tool inputs and model prose never count.
export type GovernanceKind =
  | "admission"
  | "catalog"
  | "plan"
  | "context"
  | "validation"
  | "review"
  | "lucy"
  | "presentation"
  | "decision"
  | "authorization"

export type GovernanceRecord = {
  key: string
  kind: GovernanceKind
  state: "recorded" | "hold" | "running"
  id?: string
  outcome?: string
  extra?: string
  detail?: string
  output?: string
  partial?: boolean
  reason?: "unreadable" | "foreign" | "synthetic" | "superseded" | "interrupted" | "unconfirmed"
  messageID: string
  turnID?: string
  time?: number
  review?: GovernanceReview
}

// What a review receipt or a `review-result` card carries beyond its verdict. Receipts recorded before the routed
// review hold only path, line and message per finding and no digests or items; only a card holds the routing record.
export type GovernanceReview = {
  findings: readonly MaestroReviewCardFinding[]
  routingDigest?: string
  catalogDigest?: string
  items?: readonly MaestroReviewItem[]
  routing?: ReviewRoutingRecord
}

export type ApprovalState = "none" | "running" | "awaiting" | "approved" | "declined" | "pending" | "hold"

type ToolSpec = {
  kind: GovernanceKind
  id: string
  outcome?: { key: string; values: readonly string[] }
  extra?: string
}

const tools = new Map<string, ToolSpec>([
  [
    "maestro_record_admission",
    {
      kind: "admission",
      id: "messageID",
      outcome: { key: "outcome", values: ["ORIENT", "CLARIFY", "READY_TO_DRAFT"] },
    },
  ],
  ["maestro_catalog_context", { kind: "catalog", id: "catalogVersion", extra: "snapshot" }],
  ["maestro_record_plan_revision", { kind: "plan", id: "planRevisionID" }],
  [
    "maestro_record_context",
    {
      kind: "context",
      id: "contextRecordID",
      outcome: { key: "mode", values: ["GROUNDED", "UNGROUNDED"] },
      extra: "contextHash",
    },
  ],
  [
    "maestro_record_validation",
    { kind: "validation", id: "validationRecordID", outcome: { key: "outcome", values: ["VALID", "INVALID", "HOLD"] } },
  ],
  [
    "maestro_record_review",
    { kind: "review", id: "reviewReceiptID", outcome: { key: "verdict", values: ["APPROVE", "FIX_FIRST", "REJECT"] } },
  ],
  ["maestro_request_review", { kind: "lucy", id: "reviewReceiptID", extra: "childSessionID" }],
  ["maestro_present_approval", { kind: "presentation", id: "presentationID" }],
  [
    "maestro_record_approval",
    {
      kind: "decision",
      id: "approvalMessageID",
      outcome: { key: "status", values: ["APPROVED", "DECLINED", "HOLD", "PENDING"] },
    },
  ],
  ["maestro_grant_authorization", { kind: "authorization", id: "authorizationID" }],
])

const verdicts = ["APPROVE", "FIX_FIRST", "REJECT"]

// A `task` to the review seat settles with the server's strictly decoded card in `workResult`.
const reviewTask: ToolSpec = { kind: "lucy", id: "workResult" }

const receipt = MaestroEvent.Review.ReceivedV2.data.fields
const decodeReceipt = Schema.decodeUnknownOption(
  Schema.Struct({
    findings: receipt.findings,
    routingDigest: receipt.routingDigest,
    catalogDigest: receipt.catalogDigest,
    items: receipt.items,
  }),
)
const decodeCardFindings = Schema.decodeUnknownOption(
  Schema.Array(
    Schema.Struct({ ...MaestroEvent.Review.Finding.fields, message: Schema.optionalKey(Schema.NonEmptyString) }),
  ),
)

export function readGovernance(input: {
  sessionID: string
  working: boolean | undefined
  messages: readonly Message[]
  source?: readonly SessionMessageInfo[]
  parts: (messageID: string) => readonly Part[] | undefined
}) {
  const turns = new Set(
    input.messages
      .filter((message) => message.role === "user" && message.sessionID === input.sessionID)
      .map((message) => message.id),
  )
  const sources = new Map(
    (input.source ?? [])
      .filter((message) => message.type === "assistant")
      .map((message) => [
        message.id,
        new Map(message.content.filter((part) => part.type === "tool").map((part) => [part.id, part])),
      ]),
  )
  const found = input.messages.flatMap((message) => {
    if (message.role !== "assistant") return []
    const parts = input.parts(message.id) ?? []
    const source = sources.get(message.id)
    return parts.flatMap((part) => {
      const record =
        part.type === "tool"
          ? governanceRecord(input.sessionID, input.working, message, part, source?.get(part.id))
          : undefined
      return record
        ? [
            {
              ...record,
              time: timestamp(record.time),
              turnID: turns.has(message.parentID) ? message.parentID : undefined,
            },
          ]
        : []
    })
  })
  // Only supersession observed in this transcript is known; current backend validity stays unknown.
  const current = found.findLast((record) => record.kind === "presentation" && record.state === "recorded")
  const records = found.map(
    (record): GovernanceRecord =>
      record.kind === "presentation" && record.state === "recorded" && record.id !== current?.id
        ? { ...record, state: "hold", reason: "superseded" }
        : record,
  )
  const latest = (kind: GovernanceKind) => records.findLast((record) => record.kind === kind)
  const step = records.findLast((record) => record.kind === "presentation" || record.kind === "decision")
  return {
    records,
    approval: { state: approvalState(step), record: step },
    admission: latest("admission"),
    plan: latest("plan"),
    catalog: latest("catalog"),
    context: latest("context"),
    trail: records.filter((record) => ["presentation", "decision", "authorization"].includes(record.kind)).reverse(),
    evidence: records.filter((record) => ["validation", "review", "lucy"].includes(record.kind)).reverse(),
  }
}

// Statuses stay empty until their read lands, so a session without one is only idle once that read succeeded.
export function sessionWorking(working: boolean, read: State["load"]["session_status"]) {
  if (working) return true
  if (read === "ready") return false
}

export function maestroCapability(agents: readonly Agent[], read: State["load"]["agent"]) {
  if (agents.some((agent) => agentKey(agent) === "maestro" && agent.native !== false)) return "available"
  // A listed agent proves some read completed, even one outside this directory's bootstrap.
  if (read === "ready" || agents.length > 0) return "unavailable"
  if (read === "failed") return "unknown"
  return "checking"
}

function approvalState(record: GovernanceRecord | undefined): ApprovalState {
  if (!record) return "none"
  if (record.state === "running") return "running"
  if (record.state === "hold") return "hold"
  if (record.kind === "presentation") return "awaiting"
  if (record.outcome === "APPROVED") return "approved"
  if (record.outcome === "DECLINED") return "declined"
  return "pending"
}

function governanceRecord(
  sessionID: string,
  working: boolean | undefined,
  message: AssistantMessage,
  part: ToolPart,
  source?: SessionMessageAssistantTool,
): GovernanceRecord | undefined {
  const tool = tools.get(part.tool) ?? (reviewWork(part, source) ? reviewTask : undefined)
  if (!tool) return
  const base = { key: part.id, kind: tool.kind, messageID: message.id }
  if (
    part.sessionID !== sessionID ||
    message.sessionID !== sessionID ||
    part.messageID !== message.id ||
    message.agent !== (tool.kind === "review" ? "lucy" : "maestro")
  )
    return { ...base, state: "hold", reason: "foreign", time: message.time.created }
  if ("synthetic" in message && message.synthetic === true)
    return { ...base, state: "hold", reason: "synthetic", time: message.time.created }
  if (
    source &&
    (source.name !== part.tool || (part.state.status !== "pending" && source.state.status !== part.state.status))
  )
    return { ...base, state: "hold", reason: "unreadable" }
  if (part.state.status === "pending" || part.state.status === "running") {
    const time = part.state.status === "running" ? part.state.time.start : message.time.created
    // A server that stopped mid-call can leave the part open after its session went idle.
    if (working === false) return { ...base, state: "hold", reason: "interrupted", time }
    if (working === undefined) return { ...base, state: "running", reason: "unconfirmed", time }
    return { ...base, state: "running", time }
  }
  if (part.state.status === "error")
    return {
      ...base,
      state: "hold",
      detail: part.state.error || undefined,
      time: source ? source.time.completed : part.state.time.end,
    }
  // Current server uses `structured`; the vendored client normalizer still reads `metadata`.
  // Recover only confirmed output from the retained raw message, never input arguments.
  const structured = source && "structured" in source.state ? source.state.structured : undefined
  const state =
    structured !== undefined
      ? {
          ...part.state,
          metadata:
            structured && typeof structured === "object" && !Array.isArray(structured)
              ? (structured as Record<string, unknown>)
              : {},
        }
      : part.state
  const result = completed(tool, state)
  return {
    ...base,
    ...result,
    time: source ? source.time.completed : part.state.time.end,
    // Preserve the producer's catalog and presentation without parsing prose into authority.
    ...(result.state === "recorded" && (tool.kind === "catalog" || tool.kind === "presentation") && part.state.output
      ? {
          output: part.state.output.slice(0, 16_384),
          partial: state.metadata.truncated === true || part.state.output.length > 16_384,
        }
      : {}),
  }
}

function completed(
  tool: ToolSpec,
  state: ToolStateCompleted,
): Omit<GovernanceRecord, "key" | "kind" | "messageID" | "time"> {
  if (tool === reviewTask) return reviewCard(state.metadata.workResult)
  const id = text(state.metadata[tool.id])
  const extra = tool.extra ? text(state.metadata[tool.extra]) : undefined
  const review = tool.kind === "lucy" || tool.kind === "review" ? receiptReview(state.metadata) : undefined
  if (review === null) return { state: "hold", reason: "unreadable" }
  if (tool.kind === "lucy") {
    // Lucy's verdict is only reported in the server-written output, as "<VERDICT>: <receipt>".
    if (!id) return { state: "hold", extra, detail: state.output || undefined }
    const verdict = verdicts.find((verdict) => state.output === `${verdict}: ${id}`)
    if (!verdict || state.metadata.truncated === true) return { state: "hold", reason: "unreadable" }
    return { state: "recorded", id, outcome: verdict, extra, ...(review ? { review } : {}) }
  }
  const outcome = tool.outcome ? text(state.metadata[tool.outcome.key]) : undefined
  if (tool.outcome && (!outcome || !tool.outcome.values.includes(outcome)))
    return { state: "hold", reason: "unreadable" }
  if (tool.kind === "decision" && outcome) {
    const detail = state.output.startsWith(`${outcome}: `) ? state.output.slice(outcome.length + 2) : undefined
    if (outcome === "HOLD") return { state: "hold", outcome, detail }
    if (outcome === "PENDING") return { state: "recorded", outcome, detail }
    // A decision without the reply message it was bound to authorizes nothing.
    if (!id) return { state: "hold", reason: "unreadable" }
    return { state: "recorded", id, outcome }
  }
  if (!id) return { state: "hold", reason: "unreadable" }
  return { state: outcome === "HOLD" ? "hold" : "recorded", id, outcome, extra, ...(review ? { review } : {}) }
}

function reviewWork(part: ToolPart, source?: SessionMessageAssistantTool) {
  if (part.tool !== "task" || part.state.status !== "completed") return false
  // Same precedence as the completed result: the retained structured output, else the normalized metadata.
  const structured = source && "structured" in source.state ? source.state.structured : undefined
  const metadata = structured !== undefined ? object(structured) : part.state.metadata
  return object(metadata?.workResult)?.schema === "review-work-result-v1"
}

// The card the server strictly decoded (`ReviewResultV2.parse`); a card that did not decode carries no verdict.
function reviewCard(value: unknown): Omit<GovernanceRecord, "key" | "kind" | "messageID" | "time"> {
  const work = object(value)
  const card = object(work?.card)
  const result = object(work?.review)
  const id = text(card?.messageID)
  const extra = text(work?.executionSessionId)
  if (card?.parsed !== true || !id || !result) return { state: "hold", reason: "unreadable", extra }
  const findings = Option.getOrUndefined(decodeCardFindings(result.findings))
  const routing = routingRecord(result.routing)
  if (!findings || !routing) return { state: "hold", reason: "unreadable", extra }
  const routingDigest = digest(work?.routingDigest)
  const review = { findings, routing, catalogDigest: routing.catalog, ...(routingDigest ? { routingDigest } : {}) }
  if (result.outcome === "blocked") return { state: "hold", id, extra, review }
  if (result.outcome !== "done") return { state: "hold", reason: "unreadable", extra }
  // Audit, diligence and compliance profiles finish without a merge verdict.
  const verdict = verdicts.find((verdict) => verdict === result.verdict)
  return { state: "recorded", id, outcome: verdict, extra, review }
}

// Undefined when the result carries no findings (an earlier server), null when what it carries does not decode.
function receiptReview(metadata: Record<string, unknown>): GovernanceReview | null | undefined {
  if (metadata.findings === undefined) return
  return Option.getOrNull(decodeReceipt(metadata))
}

// The server decoded the full record with the card; the app checks its shape only, as it cannot import Core.
function routingRecord(value: unknown) {
  const routing = object(value)
  if (!routing || routing.version !== "route-v1" || !digest(routing.catalog)) return
  if (!text(object(routing.profile)?.id) || !text(object(routing.tier)?.id) || !object(routing.budget)) return
  if (!["overlays", "languages", "lenses", "packs", "deviations"].every((key) => Array.isArray(routing[key]))) return
  return routing as ReviewRoutingRecord
}

function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

function digest(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value) ? value : undefined
}

function text(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function timestamp(value: number | undefined) {
  return value !== undefined && Number.isFinite(value) && Math.abs(value) <= 8.64e15 ? value : undefined
}
