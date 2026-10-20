import { createEffect, createMemo, createResource, onCleanup, type Component } from "solid-js"
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
  const directory = props.directory
  const sessionID = props.sessionID
  const pendingKey = props.pendingKey ?? directory
  const catalog = useQuery(() => serverState.queryOptions.providers(directoryKey(directory)))
  const [state, setState] = createStore({ unsupported: false, active: true })
  const owns = () => state.active && serverSDK() === origin && sync() === directoryState &&
    sync().directory === directory && props.directory === directory && props.sessionID === sessionID &&
    (props.pendingKey ?? props.directory) === pendingKey
  onCleanup(() => setState("active", false))
  createEffect(() => {
    if (!owns()) setState("active", false)
  })
  const policy = sessionID
    ? createSessionModelPolicy({
        sessionID,
        management: origin.sessionManagement,
        owns,
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
    () => ({ source: origin, sessionID }),
    ({ source, sessionID }) => {
      if (!owns()) return { source, protocol: source.protocolKind(), error: new DOMException("", "AbortError") }
      setState("unsupported", false)
      return source.protocol
        .then(async (protocol) => {
          if (!owns()) throw new DOMException("", "AbortError")
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
      sessionID={sessionID}
      directory={directory}
      pendingKey={pendingKey}
      providers={providers()}
      status={catalog.status}
      protocol={protocol()}
      supported={!owns() || unsupported() ? false : failure() || snapshot.loading ? undefined : !!snapshot()}
      loadFailed={!!failure() && !unsupported()}
      rulesReady={
        owns() && (protocol() === "v2"
          ? !!snapshot() && !failure() && !snapshot.loading
          : !sessionID || !!directoryState.session.get(sessionID))
      }
      readRules={() => (sessionID ? (directoryState.session.get(sessionID)?.permission ?? []) : [])}
      writeRules={async (permission) => {
        if (!owns() || !sessionID) throw new DOMException("", "AbortError")
        const result = await origin.orchestra.sessions.setPermission({ sessionID, permission })
        if (!owns()) throw new DOMException("", "AbortError")
        return [...(result ?? [])]
      }}
      policy={{
        read: () => policy?.read() ?? { policy: { mode: "inherit" } },
        write: (next) => {
          if (!owns() || !policy) return Promise.reject(new DOMException("", "AbortError"))
          return policy
            .write(next)
            .catch((error: unknown) => {
              if (owns() && sessionManagementUnsupported(error)) setState("unsupported", true)
              throw error
            })
        },
      }}
      onRetry={() => {
        if (!owns()) return
        void catalog.refetch()
        void actions.refetch()
      }}
    />
  )
}
