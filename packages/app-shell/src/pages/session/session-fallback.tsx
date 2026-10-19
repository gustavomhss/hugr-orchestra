import { createMemo, Show } from "solid-js"
import { Spinner } from "@orchestra/ui/spinner"
import { ButtonV2 } from "@orchestra/ui/v2/button-v2"
import { useLanguage } from "@/context/language"
import { ServerConnection, serverName, useServer } from "@/context/server"
import { useTabs } from "@/context/tabs"
import { ErrorPage } from "@/pages/error"
import { formatServerError, isLocalSessionNotFoundError, isSessionNotFoundError } from "@/utils/server-errors"

function isCurrentSessionNotFoundError(error: unknown, sessionID: string | undefined) {
  if (!sessionID) return false
  return isSessionNotFoundError(error, sessionID) || isLocalSessionNotFoundError(error, sessionID)
}

export function SessionErrorFallback(props: {
  error: unknown
  sessionID?: string
  serverKey?: ServerConnection.Key
  onRetry?: () => void
}) {
  const language = useLanguage()
  const server = useServer()
  const tabs = useTabs()
  const displayServer = createMemo(() => {
    const key = props.serverKey ?? server.key
    const conn = server.list.find((item) => ServerConnection.key(item) === key)
    return conn ? serverName(conn) : key
  })
  const closeTab = () => {
    if (!props.sessionID) return
    tabs.removeSessionTab({ server: props.serverKey ?? server.key, sessionId: props.sessionID })
  }
  if (isCurrentSessionNotFoundError(props.error, props.sessionID)) {
    return (
      <div class="flex-1 min-h-0 overflow-hidden">
        <div class="h-full px-6 pb-42 -mt-4 flex flex-col items-center justify-center text-center gap-4">
          <div class="flex flex-col items-center gap-2">
            <div class="text-16-medium text-text max-w-md">{language.t("session.error.notFound")}</div>
            <div class="text-13-regular text-text-weak max-w-md">
              {language.t("session.error.notFound.description")}
            </div>
          </div>
          <Show when={props.sessionID}>
            {(sessionID) => (
              <div class="max-w-full flex flex-col items-center gap-1">
                <div class="max-w-full text-11-regular text-text-faint break-all">{displayServer()}</div>
                <code class="max-w-full rounded-[4px] px-1 py-0.5 font-mono text-xs font-medium leading-4 text-text-base break-all bg-[color-mix(in_oklch,var(--v2-text-text-base)_8%,transparent)]">
                  {sessionID()}
                </code>
              </div>
            )}
          </Show>
          <ButtonV2 variant="neutral" size="normal" icon="xmark-small" onClick={closeTab}>
            {language.t("session.error.notFound.closeTab")}
          </ButtonV2>
        </div>
      </div>
    )
  }
  // A session that fails to load must not take the whole app to the crash page: it gets its own Retry.
  if (props.onRetry) {
    console.error("Failed to load session", props.error)
    return (
      <div class="flex-1 min-h-0 overflow-hidden">
        <div
          role="alert"
          class="h-full px-6 pb-42 -mt-4 flex flex-col items-center justify-center text-center gap-4"
        >
          <div class="flex flex-col items-center gap-2">
            <div class="text-16-medium text-text max-w-md">{language.t("orchestra.chat.loadFailed.title")}</div>
            <div class="text-13-regular text-text-weak max-w-md">
              {language.t("orchestra.chat.loadFailed.description")}
            </div>
            <div class="text-12-regular text-text-faint max-w-md break-words">
              {formatServerError(props.error, language.t)}
            </div>
          </div>
          <ButtonV2 variant="neutral" size="normal" onClick={props.onRetry}>
            {language.t("orchestra.chat.loadFailed.retry")}
          </ButtonV2>
        </div>
      </div>
    )
  }
  return <ErrorPage error={props.error} />
}

export function SessionLoading() {
  const language = useLanguage()
  return (
    <div
      role="status"
      data-session-layout="loading"
      class="size-full flex-1 min-h-0 flex items-center justify-center gap-2 text-13-regular text-text-weak"
    >
      <Spinner class="size-4" />
      <span>{language.t("common.loading")}</span>
    </div>
  )
}
