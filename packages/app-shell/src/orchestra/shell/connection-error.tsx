import { createMemo, For, onCleanup, Show } from "solid-js"
import { HugrSplash } from "@/orchestra/brand"
import { ConnectionRecovery } from "@/orchestra/shell/connection-recovery"
import { useLanguage } from "@/context/language"
import { ServerConnection, serverName, useServer } from "@/context/server"

// Shown instead of the app while the selected server does not answer. Like the splash it fills a frameless window,
// so it is a drag region.
export function ConnectionError(props: {
  onRetry?: () => void
  onServerSelected?: (key: ServerConnection.Key) => void
}) {
  const language = useLanguage()
  const server = useServer()
  const others = () => server.list.filter((s) => ServerConnection.key(s) !== server.key)
  const name = createMemo(() => server.name || server.key)
  const serverToken = "\u0000server\u0000"
  const unreachable = createMemo(() => language.t("app.server.unreachable", { server: serverToken }).split(serverToken))

  const timer = setInterval(() => props.onRetry?.(), 1000)
  onCleanup(() => clearInterval(timer))

  return (
    <div
      class="h-dvh w-screen overflow-y-auto flex flex-col items-center justify-center-safe bg-background-base gap-6 p-6"
      data-tauri-drag-region
    >
      <div class="shrink-0 flex flex-col items-center max-w-md text-center">
        <HugrSplash class="mb-4" />
        <p class="text-14-regular text-text-base">
          {unreachable()[0]}
          <span class="text-text-strong font-medium">{name()}</span>
          {unreachable()[1]}
        </p>
        <p class="mt-1 text-12-regular text-text-weak">{language.t("app.server.retrying")}</p>
      </div>
      <Show when={others().length > 0}>
        <div class="shrink-0 flex flex-col gap-2 w-full max-w-sm">
          <span class="text-12-regular text-text-base text-center">{language.t("app.server.otherServers")}</span>
          <div class="flex flex-col gap-1 bg-surface-base rounded-lg p-2">
            <For each={others()}>
              {(conn) => {
                const key = ServerConnection.key(conn)
                return (
                  <button
                    type="button"
                    class="flex items-center gap-3 w-full px-3 py-2 rounded-md hover:bg-surface-raised-base-hover transition-colors text-left"
                    onClick={() => props.onServerSelected?.(key)}
                  >
                    <span class="text-14-regular text-text-strong truncate">{serverName(conn)}</span>
                  </button>
                )
              }}
            </For>
          </div>
        </div>
      </Show>
      <ConnectionRecovery onServerSelected={props.onServerSelected} />
    </div>
  )
}
