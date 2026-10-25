import type { DirectorySDK } from "@/context/sdk"
import type { DirectorySync } from "@/context/sync"
import type { ServerSync } from "@/context/server-sync"
import type { ServerScope } from "@/utils/server-scope"
import type { FollowupDraft } from "./submit"
import type { Platform } from "@/context/platform"
import { createStore } from "solid-js/store"
import { Persist, persisted } from "@/utils/persist"

export type QueuedPromptIdentity = { serverScopeKey: ServerScope; directory: string; sessionID: string }
export type QueuedPromptSource = QueuedPromptIdentity & { version: 1; runtimeSourceToken?: string }
export type QueuedPromptRuntime = QueuedPromptIdentity & {
  api: DirectorySDK["api"]["session"]
  serverSync: ServerSync
  sync: DirectorySync
  current: () => boolean
  before: (signal?: AbortSignal) => Promise<boolean>
}
export type QueuedPrompt = FollowupDraft & { id: string }

export function createQueuedPromptStore(owner: Pick<QueuedPromptIdentity, "serverScopeKey" | "directory">, platform?: Platform) {
  return persisted({
    ...Persist.serverWorkspace(owner.serverScopeKey, owner.directory, "followup", ["followup.v1"]),
    migrate: (value) => migrateQueuedPromptStore(value, owner.serverScopeKey, owner.directory),
  }, createStore<{
    items: Record<string, QueuedPrompt[] | undefined>
    failed: Record<string, string | undefined>
    paused: Record<string, boolean | undefined>
    edit: Record<string, Pick<QueuedPrompt, "id" | "prompt" | "context"> | undefined>
  }>({ items: {}, failed: {}, paused: {}, edit: {} }), platform)
}

/** Runtime capabilities never enter persisted state. A revoked live token cannot silently bind new credentials. */
export function createQueuedPromptSources() {
  const epoch = crypto.randomUUID()
  const runtimes = new Map<string, { runtime: QueuedPromptRuntime; owner: object }>()
  return {
    capture(runtime: QueuedPromptRuntime, owner: object): QueuedPromptSource {
      const runtimeSourceToken = `${epoch}:${crypto.randomUUID()}`
      runtimes.set(runtimeSourceToken, { runtime, owner })
      return { version: 1, serverScopeKey: runtime.serverScopeKey, directory: runtime.directory, sessionID: runtime.sessionID, runtimeSourceToken }
    },
    releaseOwner(owner: object) {
      runtimes.forEach((entry, token) => { if (entry.owner === owner) runtimes.delete(token) })
    },
    release(source: QueuedPromptSource) {
      if (source.runtimeSourceToken) runtimes.delete(source.runtimeSourceToken)
    },
    resolve(source: unknown, payload: Pick<FollowupDraft, "sessionID" | "sessionDirectory">, current?: QueuedPromptRuntime, deliberate = false) {
      const identity = queuedPromptSource(source, payload)
      if (!identity) return
      const token = identity.runtimeSourceToken
      if (token?.startsWith(`${epoch}:`)) {
        const entry = runtimes.get(token)
        if (!entry || !sameIdentity(identity, entry.runtime)) return
        if (!entry.runtime.current()) { runtimes.delete(token); return }
        return entry.runtime
      }
      if (!deliberate || !current || !sameIdentity(identity, current) || !current.current()) return
      return current
    },
  }
}

export const queuedPromptSources = createQueuedPromptSources()

function sameIdentity(left: QueuedPromptIdentity, right: QueuedPromptIdentity) {
  return left.serverScopeKey === right.serverScopeKey && left.directory === right.directory && left.sessionID === right.sessionID
}

/** Accept old serialized source identity, but discard every old capability/property. */
export function queuedPromptSource(source: unknown, payload: Pick<FollowupDraft, "sessionID" | "sessionDirectory">): QueuedPromptSource | undefined {
  if (!source || typeof source !== "object" || Array.isArray(source)) return
  if ("version" in source && source.version !== 1) return
  const scope = "serverScopeKey" in source ? source.serverScopeKey : "scope" in source ? source.scope : undefined
  const directory = "directory" in source ? source.directory : payload.sessionDirectory
  const sessionID = "sessionID" in source ? source.sessionID : payload.sessionID
  if (typeof scope !== "string" || typeof directory !== "string" || typeof sessionID !== "string" ||
    directory !== payload.sessionDirectory || sessionID !== payload.sessionID) return
  const token = "runtimeSourceToken" in source ? source.runtimeSourceToken : undefined
  if (token !== undefined && (typeof token !== "string" || !token)) return
  return { version: 1, serverScopeKey: scope as ServerScope, directory, sessionID, ...(token ? { runtimeSourceToken: token } : {}) }
}

/** The actual followup store writes this allow-listed DTO, not the submission's runtime object graph. */
export function queuedPromptPayload(draft: FollowupDraft, id: string, legacyOwner?: QueuedPromptIdentity): QueuedPrompt {
  return {
    id, sessionID: draft.sessionID, sessionDirectory: draft.sessionDirectory,
    prompt: draft.prompt, context: draft.context, agent: draft.agent, model: draft.model,
    variant: draft.variant, delivery: draft.delivery,
    source: queuedPromptSource(draft.source ?? legacyOwner, draft),
  }
}

export function migrateQueuedPromptStore(value: unknown, serverScopeKey: ServerScope, directory: string) {
  if (!value || typeof value !== "object" || !("items" in value) || !value.items || typeof value.items !== "object") return value
  return { ...value, items: Object.fromEntries(Object.entries(value.items).map(([sessionID, items]) => [sessionID,
    Array.isArray(items) ? items.flatMap((item: unknown) => {
      if (!item || typeof item !== "object" || !("id" in item) || typeof item.id !== "string" ||
        !("sessionID" in item) || item.sessionID !== sessionID || !("sessionDirectory" in item) ||
        typeof item.sessionDirectory !== "string" || !("prompt" in item) || !Array.isArray(item.prompt) ||
        !("context" in item) || !Array.isArray(item.context) || !("agent" in item) || typeof item.agent !== "string" ||
        !("model" in item) || !item.model || typeof item.model !== "object") return []
      return [queuedPromptPayload(item as FollowupDraft, item.id, {
        serverScopeKey, directory, sessionID,
      })]
    }) : undefined,
  ])) }
}
