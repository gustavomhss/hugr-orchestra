import { createMemo, createResource, type Component } from "solid-js"
import { useQuery } from "@tanstack/solid-query"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { useSync } from "@/context/sync"
import { directoryKey } from "@/context/global-sync/utils"
import { SubagentModelPicker } from "./subagent-model-picker"
import { sessionManagementUnsupported } from "@/utils/session-management-errors"
import { createStore } from "solid-js/store"

export const DialogSubagentModels: Component<{ sessionID?: string; directory: string; pendingKey?: string }> = (
  props,
) => {
  const serverSDK = useServerSDK()
  const serverSync = useServerSync()
  const sync = useSync()
  const origin = serverSDK()
  const directoryState = sync()
  const serverState = serverSync()
  const catalog = useQuery(() => serverState.queryOptions.providers(directoryKey(props.directory)))
  const [state, setState] = createStore({ unsupported: false })
  const [snapshot, actions] = createResource(
    () => ({ source: origin, sessionID: props.sessionID }),
    ({ source, sessionID }) => {
      setState("unsupported", false)
      return source.protocol
        .then(async (protocol) => {
          const beforeRevision = sessionID ? directoryState.session.get(sessionID)?.subagentModelsRevision : undefined
          if (protocol !== "v2" || !sessionID)
            return {
              protocol, source, policy: undefined, beforeRevision,
              timestamp: undefined as number | undefined, error: undefined as unknown,
            }
          await source.sessionManagement.getSubagentModels(sessionID)
          const current = await source.sessionManagement.readSubagentModels(sessionID)
          return { protocol, source, policy: current.policy, beforeRevision, timestamp: current.timestamp, error: undefined as unknown }
        })
        .catch((error: unknown) => ({
          source, protocol: source.protocolKind(), policy: undefined,
          beforeRevision: undefined, timestamp: undefined, error,
        }))
    },
  )
  const protocol = () => snapshot()?.protocol ?? origin.protocolKind()
  const unsupported = () => state.unsupported || sessionManagementUnsupported(snapshot()?.error)
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
      protocol={protocol()}
      supported={unsupported() ? false : snapshot()?.error || snapshot.loading ? undefined : !!snapshot()}
      loadFailed={!!snapshot()?.error && !unsupported()}
      rulesReady={
        protocol() === "v2"
          ? !!snapshot() && !snapshot()?.error && !snapshot.loading
          : !props.sessionID || !!directoryState.session.get(props.sessionID)
      }
      readRules={() => (props.sessionID ? (directoryState.session.get(props.sessionID)?.permission ?? []) : [])}
      writeRules={async (permission) => {
        const source = snapshot()!.source
        const result = await source.client.session.update({
          sessionID: props.sessionID!,
          directory: props.directory,
          permission,
        })
        if (!result.data) throw new Error("Session update returned no data")
        return result.data.permission ?? []
      }}
      policy={{
        read: () => {
          const current = props.sessionID ? directoryState.session.get(props.sessionID) : undefined
          const fetched = snapshot()
          const newer =
            current?.subagentModelsChangedAt !== undefined &&
            (current.subagentModelsChangedAt > (fetched?.timestamp ?? 0) ||
              (current.subagentModelsChangedAt === fetched?.timestamp &&
                (current.subagentModelsRevision ?? -1) > (fetched?.beforeRevision ?? -1)))
          return {
            policy: (newer ? current?.subagentModels : fetched?.policy) ?? { mode: "inherit" },
            timestamp: Math.max(current?.subagentModelsChangedAt ?? 0, fetched?.timestamp ?? 0),
            revision: current?.subagentModelsRevision,
          }
        },
        write: async (policy) => {
          const source = snapshot()!.source
          const sessionID = props.sessionID!
          return source.sessionManagement
            .setSubagentModels(sessionID, policy)
            .then(async () => {
              const beforeRevision = directoryState.session.get(sessionID)?.subagentModelsRevision
              const current = await source.sessionManagement.readSubagentModels(sessionID)
              actions.mutate({ source, protocol: "v2", policy: current.policy, timestamp: current.timestamp, beforeRevision, error: undefined })
              return { ...current, revision: beforeRevision }
            })
            .catch((error: unknown) => {
              if (sessionManagementUnsupported(error)) setState("unsupported", true)
              throw error
            })
        },
      }}
      onRetry={() => {
        void catalog.refetch()
        void actions.refetch()
      }}
    />
  )
}
