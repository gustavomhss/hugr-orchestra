import { createResource, Show, For } from "solid-js"
import { createStore } from "solid-js/store"
import { Dialog } from "@orchestra/ui/dialog"
import { Button } from "@orchestra/ui/button"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { sessionRecoveryLanguage } from "@/i18n/session-recovery"
import { useSessionArchive } from "@/pages/session/session-archive"
import type { SessionManagement } from "@/utils/session-management"

/** The dialog stays pinned to the server and directory where its history was opened. */
export function DialogArchivedSessions(props: { directory: string }) {
  const language = sessionRecoveryLanguage(useLanguage())
  const source = useServerSDK()()
  const directory = props.directory
  const management: SessionManagement = source.sessionManagement
  const actions = useSessionArchive({ server: source, directory })
  const [state, setState] = createStore({ restored: [] as string[] })
  const [history, resource] = createResource(() => management.listArchived(directory)
    .then((sessions) => ({
      sessions,
      error: undefined as unknown,
    }))
    .catch((error: unknown) => ({ sessions: [], error })))
  const visible = () => history()?.sessions.filter((session) => !state.restored.includes(session.id)) ?? []
  return (
    <Dialog title={language.t("session.archived.title")} description={language.t("session.archived.description")}>
      <div class="px-3 pb-3 flex flex-col gap-2">
        <Show when={history.loading}><p role="status">{language.t("orchestra.agents.loadingFile")}</p></Show>
        <Show when={history()?.error}>
          <p role="alert">{language.t("session.archived.loadFailed")}</p>
          <Button onClick={() => void resource.refetch()}>{language.t("common.retry")}</Button>
        </Show>
        <Show when={!history.loading && !history()?.error && !visible().length}>
          <p role="status">{language.t("session.archived.empty")}</p>
        </Show>
        <For each={visible()}>{(session) => (
          <div class="flex items-center gap-2" data-session-id={session.id}>
            <span class="flex-1 min-w-0 truncate"><bdi dir="auto">{session.title}</bdi></span>
            <Button disabled={actions.busy(session.id) || !actions.restorable()} onClick={() => {
              void actions.restore(session.id, session).then((restored) => {
                if (restored) setState("restored", (items) => [...items, session.id])
              })
            }}>{language.t("session.restore.title")}</Button>
          </div>
        )}</For>
      </div>
    </Dialog>
  )
}
