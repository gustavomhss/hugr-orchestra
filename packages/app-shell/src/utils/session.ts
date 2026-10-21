import type { SessionInfo } from "@/v2-types"
import type { SessionListInput } from "@/v2-wire"
import type { ServerApi } from "@/utils/server"

import type { Session, SessionV2Info } from "@/v2-wire"

import { withTimestampedFallback } from "./session-title"
import { SessionSubagentModels } from "@orchestra/schema/session-subagent-models"
import { SessionEvent } from "@orchestra/schema/session-event"
import { Result, Schema } from "effect"
import type { SessionsGetOutput } from "@orchestra/client"

type SubagentModelPolicy = Schema.Codec.Encoded<typeof SessionSubagentModels.Policy>

export type AppSession = Session & {
  subagentModels?: SubagentModelPolicy
  // Server event timestamps fence delayed events and snapshot reads; never sent as settings.
  subagentModelsChangedAt?: number
  archiveChangedAt?: number
  subagentModelsRevision?: number
  // Local canonical-read provenance; never a backend revision or policy timestamp.
  subagentModelsReadReceipt?: number
  archiveRevision?: number
}

export type SessionManagementInfo = Pick<AppSession,
  "id" | "subagentModels" | "subagentModelsChangedAt" | "subagentModelsRevision" | "subagentModelsReadReceipt" | "archiveChangedAt" | "archiveRevision"
> & { time: Pick<AppSession["time"], "updated" | "archived"> }

export type SessionManagementEvent = { type: string; properties?: unknown; current?: unknown }

export function normalizeSessionInfo(
  input: (SessionInfo & Pick<Session, "metadata">) | SessionV2Info | SessionsGetOutput | AppSession,
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
    ...("metadata" in input && input.metadata !== undefined ? { metadata: input.metadata } : {}),
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
  if (event.type === SessionEvent.SubagentModelsChanged.type) {
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
  if (event.type === SessionEvent.ArchiveChanged.type) {
    const decoded = Schema.decodeUnknownResult(SessionEvent.ArchiveChanged.data)(event.properties)
    if (Result.isFailure(decoded)) {
      console.warn("Invalid session management event", event.type, decoded.failure.message)
      return
    }
    return {
      ...event,
      type: SessionEvent.ArchiveChanged.type,
      properties: Schema.encodeSync(SessionEvent.ArchiveChanged.data)(decoded.success),
    }
  }
}

export function applySessionManagementEvent<T extends SessionManagementInfo>(
  info: T,
  input: SessionManagementEvent,
): T | undefined {
  const event = decodeSessionManagementEvent(input)
  if (!event) return
  const current = event.current
  const durable = current && typeof current === "object" && "durable" in current ? current.durable : undefined
  const revision =
    durable && typeof durable === "object" && "seq" in durable && typeof durable.seq === "number" &&
      Number.isSafeInteger(durable.seq) && durable.seq >= 0
      ? durable.seq
      : undefined
  if (event.type === SessionEvent.SubagentModelsChanged.type) {
    const data = event.properties
    if (
      data.sessionID !== info.id ||
      (revision !== undefined && info.subagentModelsRevision !== undefined
        ? revision <= info.subagentModelsRevision
        : data.timestamp < (info.subagentModelsChangedAt ?? 0) ||
          (revision === undefined && data.timestamp === info.subagentModelsChangedAt &&
            (info.subagentModelsRevision !== undefined || info.subagentModelsReadReceipt !== undefined)))
    ) return
    // A read receipt cannot order an unobserved SSE sequence against that read; recover conflicting policy via GET.
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
  if (event.type === SessionEvent.ArchiveChanged.type) {
    const data = event.properties
    if (
      data.sessionID !== info.id ||
      data.timestamp < (info.archiveChangedAt ?? 0) ||
      (revision !== undefined && info.archiveRevision !== undefined && revision <= info.archiveRevision)
    ) return
    return {
      ...info,
      archiveChangedAt: data.timestamp,
      archiveRevision: revision,
      time: { ...info.time, archived: data.archived ?? undefined, updated: Math.max(info.time.updated, data.timestamp) },
    }
  }
}

export function mergeSessionManagementInfo<T extends SessionManagementInfo>(current: SessionManagementInfo | undefined, next: T): T & SessionManagementInfo {
  if (!current) return next
  const keepPolicy = (current.subagentModelsReadReceipt ?? 0) !== (next.subagentModelsReadReceipt ?? 0)
    ? (current.subagentModelsReadReceipt ?? 0) > (next.subagentModelsReadReceipt ?? 0)
    : current.subagentModelsRevision !== undefined && next.subagentModelsRevision !== undefined
      ? next.subagentModelsRevision < current.subagentModelsRevision ||
        (next.subagentModelsRevision === current.subagentModelsRevision &&
          (next.subagentModelsChangedAt ?? -1) <= (current.subagentModelsChangedAt ?? -1))
      : next.subagentModelsChangedAt !== undefined
        ? next.subagentModelsChangedAt <= (current.subagentModelsChangedAt ?? -1)
        : current.subagentModelsChangedAt !== undefined || current.subagentModelsRevision !== undefined ||
          current.subagentModelsReadReceipt !== undefined
  const keepArchive = current.archiveChangedAt !== undefined &&
    (next.time.updated < current.archiveChangedAt ||
      (next.time.updated === current.archiveChangedAt && current.archiveRevision !== undefined &&
        (next.archiveRevision === undefined || next.archiveRevision <= current.archiveRevision)))
  return {
    ...next,
    subagentModels: keepPolicy ? current.subagentModels : next.subagentModels,
    subagentModelsChangedAt: keepPolicy ? current.subagentModelsChangedAt : next.subagentModelsChangedAt,
    subagentModelsReadReceipt: keepPolicy ? current.subagentModelsReadReceipt : next.subagentModelsReadReceipt,
    // Carry observed sequence floors even when a later canonical read replaces policy without another SSE.
    subagentModelsRevision: current.subagentModelsRevision === undefined
      ? next.subagentModelsRevision
      : Math.max(current.subagentModelsRevision, next.subagentModelsRevision ?? current.subagentModelsRevision),
    time: {
      ...next.time,
      archived: keepArchive ? current.time.archived : next.time.archived,
      updated: keepPolicy || keepArchive ? Math.max(current.time.updated, next.time.updated) : next.time.updated,
    },
    ...(keepArchive
      ? {
          archiveChangedAt: current.archiveChangedAt,
          archiveRevision: current.archiveRevision,
        }
      : {
          archiveChangedAt: next.archiveChangedAt ?? next.time.updated,
          archiveRevision: next.archiveRevision,
        }),
  }
}

export async function listAllSessions(api: Pick<ServerApi["session"], "list">, input: Omit<SessionListInput, "cursor">) {
  const load = async (cursor?: string): Promise<AppSession[]> => {
    const result = await api.list({ ...input, limit: input.limit ?? 100, cursor })
    const sessions = result.data.map(normalizeSessionInfo)
    if (result.data.length === 0 || !result.cursor.next) return sessions
    return [...sessions, ...(await load(result.cursor.next))]
  }
  return load()
}
