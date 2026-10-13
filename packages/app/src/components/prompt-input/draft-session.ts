import { useSearchParams } from "@solidjs/router"
import { createMemo, onCleanup } from "solid-js"
import { useSDK } from "@/context/sdk"
import { useTabs } from "@/context/tabs"
import { ScopedKey, type ServerScope } from "@/utils/server-scope"
import { clearPending } from "../draft-subagent-models"

export const draftSessionKey = (scope: ServerScope, directory: string, draftID?: string) =>
  ScopedKey.from(scope, draftID ? "draft" : "workspace", draftID ?? directory)

export function useDraftSessionKey() {
  const sdk = useSDK()
  const tabs = useTabs()
  const [search] = useSearchParams<{ draftId?: string }>()
  return createMemo(() => {
    const key = draftSessionKey(sdk().scope, sdk().directory, search.draftId)
    if (!search.draftId) return key
    const tab = tabs.store.find((tab) => tab.type === "draft" && tab.draftID === search.draftId)
    if (!tab) return key
    // Tab memory outlives composer mounts, but is disposed on close and promotion.
    return tabs.state(tab, `subagent-models:${key}`, () => {
      onCleanup(() => clearPending(key))
      return key
    })
  })
}
