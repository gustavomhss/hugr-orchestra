import { createMemo, createResource, type Component } from "solid-js"
import { useQuery } from "@tanstack/solid-query"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { useSync } from "@/context/sync"
import { directoryKey } from "@/context/global-sync/utils"
import { SubagentModelPicker } from "./subagent-model-picker"
import { sessionManagementUnsupported } from "@/utils/session-management-errors"
import { createStore } from "solid-js/store"
import { createSessionModelPolicy } from "./session-model-policy"

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
  const sessionID = props.sessionID
  const policy = sessionID
    ? createSessionModelPolicy({
        sessionID,
        management: origin.sessionManagement,
        readEvent: () => {
          const current = directoryState.session.get(sessionID)
          return current && {
            policy: current.subagentModels ?? { mode: "inherit" },
            timestamp: current.subagentModelsChangedAt ?? current.time.updated,
            revision: current.subagentModelsRevision,
          }
        },
      })
    : undefined
  const [snapshot, actions] = createResource(
    () => ({ source: origin, sessionID: props.sessionID }),
    ({ source, sessionID }) => {
      setState("unsupported", false)
      return source.protocol
        .then(async (protocol) => {
          if (protocol !== "v2" || !sessionID)
            return {
              protocol, source, error: undefined as unknown,
            }
          await policy!.load()
          return { protocol, source, error: undefined as unknown }
        })
        .catch((error: unknown) => ({
          source, protocol: source.protocolKind(), error,
        }))
    },
  )
  const protocol = () => snapshot()?.protocol ?? origin.protocolKind()
  const failure = () => snapshot()?.error ?? policy?.state.error
  const unsupported = () => state.unsupported || sessionManagementUnsupported(failure())
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
      supported={unsupported() ? false : failure() || snapshot.loading ? undefined : !!snapshot()}
      loadFailed={!!failure() && !unsupported()}
      rulesReady={
        protocol() === "v2"
          ? !!snapshot() && !failure() && !snapshot.loading
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
        read: () => policy?.read() ?? { policy: { mode: "inherit" } },
        write: (next) => {
          return policy!
            .write(next)
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
