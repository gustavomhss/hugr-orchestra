import { type Accessor, type ParentProps } from "solid-js"
import { ModelsProvider } from "@/context/models"
import { ServerSDKProvider, useServerSDK } from "@/context/server-sdk"
import { ServerSyncProvider, useServerSync } from "@/context/server-sync"

export function useProviderDialogScope(directory: Accessor<string | null | undefined>) {
  const serverSDK = useServerSDK()
  const serverSync = useServerSync()

  return () => {
    const sdk = serverSDK()
    const sync = serverSync()
    const value = directory()
    return {
      directory: () => value,
      // show() replaces the Settings root under its original opener. Rebind its actual runtime,
      // not a server key that could resolve to edited credentials while a secret form is open.
      Provider: (props: ParentProps) => (
        <ServerSDKProvider value={sdk}>
          <ServerSyncProvider value={sync}>
            <ModelsProvider directory={() => value}>{props.children}</ModelsProvider>
          </ServerSyncProvider>
        </ServerSDKProvider>
      ),
    }
  }
}
