import { useSearchParams } from "@solidjs/router"
import { createMemo, createResource, onCleanup, type Accessor } from "solid-js"
import { useSDK } from "@/context/sdk"
import { useServerSDK } from "@/context/server-sdk"
import { useSync } from "@/context/sync"
import { useTabs } from "@/context/tabs"
import { ScopedKey, type ServerScope } from "@/utils/server-scope"
import { clearPending, pendingPolicy } from "../draft-subagent-models"

export const draftSessionKey = (scope: ServerScope, directory: string, draftID?: string) =>
  ScopedKey.from(scope, "subagent-models", directory, draftID ? "draft" : "workspace", draftID ?? "")

export function useDraftSessionKey() {
  const sdk = useSDK()
  const tabs = useTabs()
  const [search] = useSearchParams<{ draftId?: string }>()
  return createMemo(() => {
    const key = draftSessionKey(sdk().scope, sdk().directory, search.draftId)
    const tab = tabs.store.find((tab) => tab.type === "draft" && tab.draftID === search.draftId)
    if (!tab) return key
    return tabs.state(tab, `subagent-models:${key}`, () => {
      onCleanup(() => clearPending(key))
      return key
    })
  })
}

/** V2 labels read canonical policy; legacy wildcard permissions cannot describe it. */
export function useSubagentModelPolicy(sessionID: Accessor<string | undefined>, pendingKey: Accessor<string>) {
  const serverSDK = useServerSDK()
  const sync = useSync()
  const [snapshot] = createResource(
    () => {
      const server = serverSDK()
      const id = sessionID()
      if (!id || server.protocolKind() !== "v2") return
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
