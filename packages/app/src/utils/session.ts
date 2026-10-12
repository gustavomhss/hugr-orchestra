import type { SessionApi, SessionInfo, SessionListInput } from "@opencode-ai/client/promise"
import type { Session, SessionV2Info } from "@orchestra/sdk/v2/client"
import { withTimestampedFallback } from "./session-title"
import { SessionSubagentModels } from "@orchestra/schema/session-subagent-models"
import { SessionEvent } from "@orchestra/schema/session-event"
import { Schema } from "effect"
import type { SubagentModelPolicy } from "@/components/subagent-model-rules"
import type { SessionsGetOutput } from "@orchestra/client"

export type AppSession = Session & {
  subagentModels?: SubagentModelPolicy
  // Server event timestamps fence delayed events and snapshot reads; never sent as settings.
  subagentModelsChangedAt?: number
  archiveChangedAt?: number
  subagentModelsRevision?: number
  archiveRevision?: number
}

export function normalizeSessionInfo(input: SessionInfo | SessionV2Info | SessionsGetOutput | AppSession): AppSession {
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

export function applySessionManagementEvent(
  info: AppSession,
  event: { type: string; properties?: unknown; current?: unknown },
): AppSession | undefined {
  const current = event.current
  const durable = current && typeof current === "object" && "durable" in current ? current.durable : undefined
  const revision =
    durable && typeof durable === "object" && "seq" in durable && typeof durable.seq === "number"
      ? durable.seq
      : undefined
  if (event.type === SessionEvent.SubagentModelsChanged.type) {
    const data = Schema.encodeSync(SessionEvent.SubagentModelsChanged.data)(
      Schema.decodeUnknownSync(SessionEvent.SubagentModelsChanged.data)(event.properties),
    )
    if (
      data.sessionID !== info.id ||
      data.timestamp < (info.subagentModelsChangedAt ?? 0) ||
      (revision !== undefined && info.subagentModelsRevision !== undefined && revision <= info.subagentModelsRevision)
    ) return
    return {
      ...info,
      subagentModels: data.policy,
      subagentModelsChangedAt: data.timestamp,
      subagentModelsRevision: revision,
      time: { ...info.time, updated: Math.max(info.time.updated, data.timestamp) },
    }
  }
  if (event.type === SessionEvent.ArchiveChanged.type) {
    const data = Schema.encodeSync(SessionEvent.ArchiveChanged.data)(
      Schema.decodeUnknownSync(SessionEvent.ArchiveChanged.data)(event.properties),
    )
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

export function mergeSessionManagementInfo(current: AppSession | undefined, next: AppSession): AppSession {
  if (!current) return next
  const keepPolicy = current.subagentModelsChangedAt !== undefined &&
    (next.time.updated < current.subagentModelsChangedAt ||
      (next.time.updated === current.subagentModelsChangedAt && current.subagentModelsRevision !== undefined &&
        (next.subagentModelsRevision === undefined || next.subagentModelsRevision <= current.subagentModelsRevision)))
  const keepArchive = current.archiveChangedAt !== undefined &&
    (next.time.updated < current.archiveChangedAt ||
      (next.time.updated === current.archiveChangedAt && current.archiveRevision !== undefined &&
        (next.archiveRevision === undefined || next.archiveRevision <= current.archiveRevision)))
  return {
    ...next,
    ...(keepPolicy
      ? {
          subagentModels: current.subagentModels,
          subagentModelsChangedAt: current.subagentModelsChangedAt,
          subagentModelsRevision: current.subagentModelsRevision,
        }
      : {
          subagentModelsChangedAt: next.subagentModelsChangedAt ?? next.time.updated,
          subagentModelsRevision: next.subagentModelsRevision,
        }),
    ...(keepArchive
      ? {
          time: { ...next.time, archived: current.time.archived, updated: current.time.updated },
          archiveChangedAt: current.archiveChangedAt,
          archiveRevision: current.archiveRevision,
        }
      : {
          archiveChangedAt: next.archiveChangedAt ?? next.time.updated,
          archiveRevision: next.archiveRevision,
        }),
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
