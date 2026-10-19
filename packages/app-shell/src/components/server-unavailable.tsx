import { ButtonV2 } from "@orchestra/ui/v2/button-v2"
import { type Accessor, type ParentProps, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { ServerConnection, useServer } from "@/context/server"

// Rendered in place of a server-scoped subtree whose connection did not resolve, so consumers keep their
// non-null contract and nothing has to throw from a memo.
export function ServerUnavailable(props: { onRetry: () => void }) {
  const language = useLanguage()
  return (
    <div role="alert" data-slot="server-unavailable" class="size-full flex-1 min-h-0 flex items-center justify-center">
      <div class="px-6 flex flex-col items-center justify-center text-center gap-4">
        <div class="text-16-medium text-text max-w-md">{language.t("error.serverSDK.noServerAvailable")}</div>
        <ButtonV2 variant="neutral" size="normal" onClick={props.onRetry}>
          {language.t("orchestra.chat.loadFailed.retry")}
        </ButtonV2>
      </div>
    </div>
  )
}

// Gates the server providers: children mount only once a connection resolves (the explicit one, else the
// selected server). Retry re-selects the first known server, or reloads when there is none.
export function ServerRequired(
  props: ParentProps<{ server?: Accessor<ServerConnection.Any | undefined>; value?: unknown }>,
) {
  // A provided value carries its own connection, and providers given one never read the app's server context
  // (owner-scoped dialogs render without it), so neither does this gate.
  if (props.value) return props.children
  const server = useServer()
  const retry = () => {
    const first = server.list[0]
    if (!first) return location.reload()
    server.setActive(ServerConnection.key(first))
  }
  return (
    <Show when={props.server?.() ?? server.current} fallback={<ServerUnavailable onRetry={retry} />}>
      {props.children}
    </Show>
  )
}
