import type { SessionApi, SessionInfo, SessionListInput } from "@opencode-ai/client/promise"
import type { Session } from "@orchestra/sdk/v2/client"
import { withTimestampedFallback } from "./session-title"
import type { SessionsGetOutput } from "@orchestra/client"
import { SessionSubagentModels } from "@orchestra/schema/session-subagent-models"
import { SessionEvent } from "@orchestra/schema/session-event"
import { Result, Schema } from "effect"

export type AppSession = Session & {
  subagentModels?: Schema.Codec.Encoded<typeof SessionSubagentModels.Policy>
  subagentModelsChangedAt?: number
  subagentModelsRevision?: number
  // Local canonical-read provenance, not a backend revision or policy timestamp.
  subagentModelsReadReceipt?: number
}

export type SessionManagementInfo = Pick<AppSession,
  "id" | "subagentModels" | "subagentModelsChangedAt" | "subagentModelsRevision" | "subagentModelsReadReceipt"
> & { time: Pick<AppSession["time"], "updated"> }

export type SessionManagementEvent = { type: string; properties?: unknown; current?: unknown }

export function normalizeSessionInfo(
  input: ((SessionInfo | SessionsGetOutput) & Pick<Session, "metadata">) | AppSession,
): AppSession {
  if (!("location" in input)) return input
  return {
    id: input.id,
    slug: input.id,
    projectID: input.projectID,
    workspaceID: input.location.workspaceID,
    directory: input.location.directory,
    path: input.subpath,
    parentID: input.parentID,
    cost: "costAvailable" in input && input.costAvailable === false ? undefined : input.cost,
    tokens: input.tokens,
    title: withTimestampedFallback(input),
    agent: input.agent,
    model: input.model,
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    subagentModels:
      "subagentModels" in input && input.subagentModels !== undefined
        ? Schema.encodeSync(SessionSubagentModels.Policy)(
            Schema.decodeUnknownSync(SessionSubagentModels.Policy)(input.subagentModels),
          )
        : undefined,
    version: "",
    time: input.time,
    revert: input.revert && {
      messageID: input.revert.messageID,
      partID: input.revert.partID,
      snapshot: input.revert.snapshot,
    },
  }
}

export function decodeSessionManagementEvent(event: SessionManagementEvent) {
  if (event.type !== SessionEvent.SubagentModelsChanged.type) return
  const decoded = Schema.decodeUnknownResult(SessionEvent.SubagentModelsChanged.data)(event.properties)
  if (Result.isFailure(decoded)) {
    console.warn("Invalid session management event", event.type, decoded.failure.message)
    return
  }
  return {
    ...event,
    type: SessionEvent.SubagentModelsChanged.type,
    properties: Schema.encodeSync(SessionEvent.SubagentModelsChanged.data)(decoded.success),
  }
}

export function applySessionManagementEvent<T extends SessionManagementInfo>(info: T, input: SessionManagementEvent): T | undefined {
  const event = decodeSessionManagementEvent(input)
  if (!event) return
  const current = event.current
  const durable = current && typeof current === "object" && "durable" in current ? current.durable : undefined
  const revision = durable && typeof durable === "object" && "seq" in durable && typeof durable.seq === "number"
    && Number.isSafeInteger(durable.seq) && durable.seq >= 0 ? durable.seq
    : undefined
  const data = event.properties
  if (
    data.sessionID !== info.id ||
    (revision !== undefined && info.subagentModelsRevision !== undefined
      ? revision <= info.subagentModelsRevision
      : data.timestamp < (info.subagentModelsChangedAt ?? 0) ||
        (revision === undefined && data.timestamp === info.subagentModelsChangedAt &&
          (info.subagentModelsRevision !== undefined || info.subagentModelsReadReceipt !== undefined)))
  ) return
  // A receipt orders local reads, but cannot place an unobserved SSE sequence relative to that read.
  const canonical = info.subagentModelsReadReceipt !== undefined &&
    JSON.stringify(info.subagentModels ?? { mode: "inherit" }) !== JSON.stringify(data.policy)
  return {
    ...info,
    subagentModels: canonical ? info.subagentModels : data.policy,
    subagentModelsChangedAt: data.timestamp,
    subagentModelsRevision: revision ?? info.subagentModelsRevision,
    time: { ...info.time, updated: Math.max(info.time.updated, data.timestamp) },
  }
}

export function mergeSessionManagementInfo<T extends SessionManagementInfo>(current: SessionManagementInfo | undefined, next: T): T & SessionManagementInfo {
  if (!current) return next
  const keep = (current.subagentModelsReadReceipt ?? 0) !== (next.subagentModelsReadReceipt ?? 0)
    ? (current.subagentModelsReadReceipt ?? 0) > (next.subagentModelsReadReceipt ?? 0)
    : current.subagentModelsRevision !== undefined && next.subagentModelsRevision !== undefined
      ? next.subagentModelsRevision < current.subagentModelsRevision ||
        (next.subagentModelsRevision === current.subagentModelsRevision &&
          (next.subagentModelsChangedAt ?? -1) <= (current.subagentModelsChangedAt ?? -1))
      : next.subagentModelsChangedAt !== undefined
        ? next.subagentModelsChangedAt <= (current.subagentModelsChangedAt ?? -1)
        : current.subagentModelsChangedAt !== undefined || current.subagentModelsRevision !== undefined ||
          current.subagentModelsReadReceipt !== undefined
  const policy = keep ? current : next
  return {
    ...next,
    subagentModels: policy.subagentModels,
    subagentModelsChangedAt: policy.subagentModelsChangedAt,
    subagentModelsReadReceipt: policy.subagentModelsReadReceipt,
    // A canonical read can replace the policy without claiming an unobserved durable sequence.
    subagentModelsRevision: current.subagentModelsRevision === undefined
      ? next.subagentModelsRevision
      : Math.max(current.subagentModelsRevision, next.subagentModelsRevision ?? current.subagentModelsRevision),
  }
}

export async function listAllSessions(api: Pick<SessionApi, "list">, input: Omit<SessionListInput, "cursor">) {
  const load = async (cursor?: string): Promise<AppSession[]> => {
    const result = await api.list({ ...input, limit: input.limit ?? 100, cursor })
    const sessions = result.data.map(normalizeSessionInfo)
    if (result.data.length === 0 || !result.cursor.next) return sessions
    return [...sessions, ...(await load(result.cursor.next))]
  }
  return load()
}
