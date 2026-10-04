import type {
  Agent,
  AssistantMessage,
  Config,
  Message,
  Part,
  ToolPart,
  ToolStateCompleted,
} from "@opencode-ai/sdk/v2/client"
import type { SessionMessageAssistantTool, SessionMessageInfo } from "@opencode-ai/client/promise"

// Session message APIs retain tool results, not a current Maestro read projection. Session history
// exposes Session events; the legacy /sync/history dump is unscoped across aggregates. These are
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
  reason?: "unreadable" | "foreign" | "synthetic" | "superseded"
  messageID: string
  turnID?: string
  time?: number
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

export function readGovernance(input: {
  sessionID: string
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
    const byID = new Map(parts.map((part) => [part.id, part]))
    // V2 call IDs are opaque; the shared part store sorts them lexically. Preserve server content order.
    const ordered = source ? Array.from(source.keys()).flatMap((id) => byID.get(id) ?? []) : parts
    return ordered.flatMap((part) => {
      const record =
        part.type === "tool" ? governanceRecord(input.sessionID, message, part, source?.get(part.id)) : undefined
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

export function maestroCapability(agents: readonly Agent[], loaded: boolean) {
  if (agents.some((agent) => agent.name === "maestro" && agent.native !== false)) return "available"
  if (!loaded) return "checking"
  return "unavailable"
}

// Project config is only read from servers on the v1 protocol; elsewhere its absence says nothing.
export function ownSource(config: Config | undefined, reported: boolean) {
  if (!reported || !config || Object.keys(config).length === 0) return { state: "unknown" as const }
  const atlas = config.maestro?.atlas
  if (!atlas) return { state: "missing" as const }
  return { state: "configured" as const, projectID: atlas.projectID, directory: atlas.directory }
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
  message: AssistantMessage,
  part: ToolPart,
  source?: SessionMessageAssistantTool,
): GovernanceRecord | undefined {
  const tool = tools.get(part.tool)
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
  if (part.state.status === "pending") return { ...base, state: "running", time: message.time.created }
  if (part.state.status === "running") return { ...base, state: "running", time: part.state.time.start }
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
  const id = text(state.metadata[tool.id])
  const extra = tool.extra ? text(state.metadata[tool.extra]) : undefined
  if (tool.kind === "lucy") {
    // Lucy's verdict is only reported in the server-written output, as "<VERDICT>: <receipt>".
    if (!id) return { state: "hold", extra, detail: state.output || undefined }
    const verdict = verdicts.find((verdict) => state.output === `${verdict}: ${id}`)
    if (!verdict || state.metadata.truncated === true) return { state: "hold", reason: "unreadable" }
    return { state: "recorded", id, outcome: verdict, extra }
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
  return { state: outcome === "HOLD" ? "hold" : "recorded", id, outcome, extra }
}

function text(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function timestamp(value: number | undefined) {
  return value !== undefined && Number.isFinite(value) && Math.abs(value) <= 8.64e15 ? value : undefined
}
