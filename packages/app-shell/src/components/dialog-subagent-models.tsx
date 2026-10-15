import { createMemo, createResource, onCleanup, type Component } from "solid-js"
import { createStore } from "solid-js/store"
import { useQuery } from "@tanstack/solid-query"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { useSync } from "@/context/sync"
import { directoryKey } from "@/context/global-sync/utils"
import { sessionManagementUnsupported } from "@/utils/session-management-errors"
import type { ServerProtocol } from "@/utils/server-protocol"
import { SubagentModelPicker } from "./subagent-model-picker"
import { createSessionModelPolicy } from "./session-model-policy"

type DialogSnapshot = { protocol?: ServerProtocol; error?: unknown }

export const DialogSubagentModels: Component<{ sessionID?: string; directory: string; pendingKey?: string }> = (props) => {
  const serverSDK = useServerSDK()
  const serverSync = useServerSync()
  const sync = useSync()
  const origin = serverSDK()
  const directoryState = sync()
  const serverState = serverSync()
  const directory = props.directory
  const sessionID = props.sessionID
  const pendingKey = props.pendingKey ?? directory
  const life = { active: true }
  onCleanup(() => { life.active = false })
  const owns = () => life.active && serverSDK().scope === origin.scope && sync().directory === directory
  const catalog = useQuery(() => serverState.queryOptions.providers(directoryKey(directory)))
  const [state, setState] = createStore({ unsupported: false })
  const policy = sessionID ? createSessionModelPolicy({
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
  }) : undefined
  const [snapshot, actions] = createResource(async (): Promise<DialogSnapshot> => {
    setState("unsupported", false)
    return origin.protocol.then(async (protocol) => {
      if (protocol === "v2" && policy) await policy.load()
      return { protocol }
    }).catch((error: unknown) => ({ protocol: origin.protocolKind(), error }))
  })
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
        protocol() === "v2"
          ? !!snapshot() && !failure() && !snapshot.loading
          : !sessionID || !!directoryState.session.get(sessionID)
      }
      readRules={() => sessionID ? directoryState.session.get(sessionID)?.permission ?? [] : []}
      writeRules={async (permission) => {
        if (!owns() || !sessionID) throw new DOMException("", "AbortError")
        const result = await origin.client.session.update({ sessionID, directory, permission })
        if (!result.data) throw new Error("Session update returned no data")
        return result.data.permission ?? []
      }}
      policy={{
        read: () => policy?.read() ?? { policy: { mode: "inherit" } },
        write: (next) => {
          if (!owns() || !policy) return Promise.reject(new DOMException("", "AbortError"))
          return policy.write(next).catch((error: unknown) => {
            if (life.active && sessionManagementUnsupported(error)) setState("unsupported", true)
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
