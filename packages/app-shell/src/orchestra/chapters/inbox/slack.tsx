import { createStore } from "solid-js/store"
import { onCleanup, onMount, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import type { ServerSDK } from "@/context/server-sdk"
import { createSlackConnection, type SlackConnectionState } from "./slack-connection"
import { SourceMark } from "./parts"
import { SlackConversations } from "./slack-conversations"

export function SlackConnection(props: {
  api: ServerSDK["orchestra"]["server.inbox"]
  directory: string
  local: boolean
  connected: () => void
}) {
  const language = useLanguage()
  const platform = usePlatform()
  const [store, setStore] = createStore<SlackConnectionState>({ loading: false, busy: false, failed: false })
  const model = createSlackConnection({
    api: props.api,
    directory: props.directory,
    enabled: props.local,
    open: (url) => platform.openExternal(url),
    change: (state) => setStore(state),
    connected: props.connected,
  })
  onMount(() => void model.load())
  onCleanup(() => model.dispose())
  return (
    <section>
      <h3>
        <SourceMark source="slack" /> {language.t("orchestra.inbox.source.slack")}
      </h3>
      <p>{language.t("orchestra.inbox.slackPrivacy")}</p>
      <Show when={!props.local}>
        <p role="status">{language.t("orchestra.inbox.slackLocalOnly")}</p>
      </Show>
      <Show when={store.loading}>
        <p role="status">{language.t("orchestra.inbox.slackLoading")}</p>
      </Show>
      <Show when={store.account?.connected}>
        <p role="status">
          {language.t("orchestra.inbox.slackIdentity", {
            user: store.account?.user ?? "",
            team: store.account?.team ?? "",
          })}
        </p>
        <SlackConversations api={props.api} directory={props.directory} synced={props.connected} />
      </Show>
      <Show when={store.failed}>
        <p role="alert">{language.t("orchestra.inbox.slackFailed")}</p>
      </Show>
      <Show
        when={store.authorization}
        fallback={
          <button
            type="button"
            class="mx-btn"
            disabled={!props.local || store.busy || store.loading}
            onClick={() => void (store.account?.connected ? model.disconnect() : model.start())}
          >
            {language.t(store.account?.connected ? "orchestra.inbox.slackDisconnect" : "orchestra.inbox.slackConnect")}
          </button>
        }
      >
        <p role="status">{language.t("orchestra.inbox.slackWaiting")}</p>
        <a class="inbox-text-link" href={store.authorization?.url} target="_blank" rel="noreferrer">
          {language.t("orchestra.inbox.slackContinue")}
        </a>
        <button type="button" class="mx-btn" onClick={() => void model.cancel()}>
          {language.t("orchestra.inbox.cancel")}
        </button>
      </Show>
    </section>
  )
}
