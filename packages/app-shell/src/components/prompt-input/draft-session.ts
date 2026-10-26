import { useSearchParams } from "@solidjs/router"
import { createEffect, createMemo, createResource, onCleanup, untrack, type Accessor } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import type { Platform } from "@/context/platform"
import { useSDK } from "@/context/sdk"
import { useServerSDK } from "@/context/server-sdk"
import { useSync } from "@/context/sync"
import { useTabs } from "@/context/tabs"
import { Persist, persisted } from "@/utils/persist"
import { ScopedKey, type ServerScope } from "@/utils/server-scope"
import { clearPending, pendingPolicy, restorePending } from "../draft-subagent-models"
import { sameModelPolicy, type SubagentModelPolicy } from "../subagent-model-rules"

export const draftSessionKey = (scope: ServerScope, directory: string, draftID?: string) =>
  ScopedKey.from(scope, "subagent-models", directory, draftID ? "draft" : "workspace", draftID ?? "")

export function useDraftSessionKey() {
  const sdk = useSDK()
  const tabs = useTabs()
  const [search] = useSearchParams<{ draftId?: string }>()
  return createMemo(() => {
    const draftID = search.draftId
    const key = draftSessionKey(sdk().scope, sdk().directory, draftID)
    if (!draftID) return key
    const tab = tabs.store.find((tab) => tab.type === "draft" && tab.draftID === draftID)
    if (!tab) return key
    // Tab memory outlives composer mounts, but is disposed on close and promotion.
    return tabs.state(tab, `subagent-models:${key}`, () => {
      persistPending(draftID, key)
      onCleanup(() => clearPending(key))
      return key
    })
  })
}

/** A draft's subagent model choices are saved with the draft (same storage and cleanup as its prompt), so a reload
    or restart keeps them. The record names the key it was made under: a draft moved to another directory starts
    over, as it does in memory. */
export function persistPending(draftID: string, key: string, platform?: Platform) {
  const [saved, setSaved, , ready] = persisted(
    Persist.draft(draftID, "subagent-models"),
    createStore<{ key: string; policy: SubagentModelPolicy }>({ key: "", policy: { mode: "inherit" } }),
    platform,
  )
  const restored = { done: false }
  // Only this key's own edits re-run the effect; saved is read untracked, so two keys of one draft cannot ping-pong.
  createEffect(() => {
    if (!ready()) return
    untrack(() => {
      if (restored.done) return
      restored.done = true
      if (saved.key === key) restorePending(key, saved.policy)
    })
    const policy = pendingPolicy(key)
    untrack(() => {
      // Under another key's record, an untouched (inherit) draft leaves that record alone.
      const unchanged = saved.key === key ? sameModelPolicy(policy, saved.policy) : policy.mode === "inherit"
      if (!unchanged) setSaved(reconcile({ key, policy }))
    })
  })
}

export function createDraftSessionState(input: {
  sessionID: Accessor<string | undefined>
  pendingKey?: Accessor<string>
}) {
  const pendingKey = input.pendingKey ?? useDraftSessionKey()
  return { pendingKey, ...useSubagentModelPolicy(input.sessionID, pendingKey) }
}

/** Canonical GETs, rather than delayed event projections, own policy labels. */
export function useSubagentModelPolicy(sessionID: Accessor<string | undefined>, pendingKey: Accessor<string>) {
  const serverSDK = useServerSDK()
  const sync = useSync()
  const [snapshot] = createResource(
    () => {
      const server = serverSDK()
      const id = sessionID()
      if (!id) return
      return { server, id, updated: sync().session.get(id)?.time.updated }
    },
    (source) => source.server.sessionManagement.readSubagentModels(source.id)
      .then((snapshot) => ({ source, snapshot, error: undefined }))
      .catch((error: unknown) => ({ source, snapshot: undefined, error })),
  )
  const current = () => {
    const result = snapshot()
    if (!result || snapshot.loading || result.source.server !== serverSDK() || result.source.id !== sessionID()) return
    return result
  }
  return {
    loading: () => snapshot.loading,
    error: () => current()?.error,
    policy: () => sessionID() ? current()?.snapshot?.policy : pendingPolicy(pendingKey()),
  }
}
