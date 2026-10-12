import { createMemo, createResource, type Component } from "solid-js"
import { useQuery } from "@tanstack/solid-query"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { useSync } from "@/context/sync"
import { directoryKey } from "@/context/global-sync/utils"
import { SubagentModelPicker } from "./subagent-model-picker"

export const DialogSubagentModels: Component<{ sessionID?: string; directory: string; pendingKey?: string }> = (
  props,
) => {
  const serverSDK = useServerSDK()
  const serverSync = useServerSync()
  const sync = useSync()
  const catalog = useQuery(() => serverSync().queryOptions.providers(directoryKey(props.directory)))
  const [protocol] = createResource(() => serverSDK().protocol.catch(() => "unavailable" as const))
  const providers = createMemo(() => {
    if (!catalog.isSuccess) return []
    const connected = new Set(catalog.data?.connected)
    return [...(catalog.data?.all.values() ?? [])].filter((provider) => connected.has(provider.id))
  })
  return (
    <SubagentModelPicker
      sessionID={props.sessionID}
      directory={props.directory}
      pendingKey={props.pendingKey ?? props.directory}
      providers={providers()}
      status={catalog.status}
      supported={protocol() === undefined ? undefined : protocol() === "v1"}
      rulesReady={!props.sessionID || !!sync().session.get(props.sessionID)}
      readRules={() => (props.sessionID ? (sync().session.get(props.sessionID)?.permission ?? []) : [])}
      writeRules={async (permission) => {
        const result = await serverSDK().client.session.update({
          sessionID: props.sessionID!,
          directory: props.directory,
          permission,
        })
        if (!result.data) throw new Error("Session update returned no data")
        return result.data.permission ?? []
      }}
      onRetry={() => void catalog.refetch()}
    />
  )
}
