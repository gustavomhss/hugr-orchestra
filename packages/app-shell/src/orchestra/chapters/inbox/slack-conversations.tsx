import { createStore } from "solid-js/store"
import { For, onCleanup, onMount, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import type { ServerSDK } from "@/context/server-sdk"
import { createSlackScope, type SlackScopeState } from "./slack-scope"

export function SlackConversations(props: {
  api: ServerSDK["orchestra"]["server.inbox"]
  directory: string
  synced: () => void
}) {
  const language = useLanguage()
  const [store, setStore] = createStore<SlackScopeState>({ selected: [], busy: false, failed: false, dirty: false })
  const model = createSlackScope({
    api: props.api,
    directory: props.directory,
    synced: props.synced,
    change: (value) => setStore(value),
  })
  onMount(() => void model.load())
  onCleanup(() => model.dispose())
  return (
    <div class="inbox-slack-scope">
      <p>{language.t("orchestra.inbox.slackScopeBody")}</p>
      <Show when={store.failed}>
        <p role="alert">{language.t("orchestra.inbox.slackScopeFailed")}</p>
      </Show>
      <Show
        when={store.scope}
        fallback={
          <button type="button" class="mx-btn" disabled={store.busy} onClick={() => void model.load()}>
            {language.t("orchestra.inbox.slackLoading")}
          </button>
        }
      >
        <fieldset disabled={store.busy}>
          <legend>{language.t("orchestra.inbox.slackConversations")}</legend>
          <For each={store.scope?.conversations}>
            {(conversation) => (
              <label>
                <input
                  type="checkbox"
                  checked={store.selected.includes(conversation.id)}
                  onChange={(event) => model.toggle(conversation.id, event.currentTarget.checked)}
                />
                {conversation.kind === "channel" || conversation.kind === "private" ? "#" : ""}
                {conversation.name}
              </label>
            )}
          </For>
        </fieldset>
        <p>{language.t("orchestra.inbox.slackEmptySelection")}</p>
        <button
          type="button"
          class="mx-btn"
          disabled={store.busy || !store.selected.length}
          onClick={() => model.clear()}
        >
          {language.t("orchestra.inbox.slackClearSelection")}
        </button>
        <button type="button" class="mx-btn" disabled={store.busy || store.dirty} onClick={() => void model.discover()}>
          {language.t(store.scope?.cursor ? "orchestra.inbox.slackMoreConversations" : "orchestra.inbox.slackDiscover")}
        </button>
        <button type="button" class="mx-btn" disabled={store.busy || !store.dirty} onClick={() => void model.save()}>
          {language.t("orchestra.inbox.slackSaveSelection")}
        </button>
        <button
          type="button"
          class="mx-btn"
          disabled={store.busy || store.dirty || !store.scope?.selected.length}
          onClick={() => void model.sync()}
        >
          {language.t(
            store.scope?.state === "pending" ? "orchestra.inbox.slackResumeSync" : "orchestra.inbox.slackSync",
          )}
        </button>
        <Show when={store.scope?.state}>
          {(state) => <p role="status">{language.t(`orchestra.inbox.slackSync.${state()}`)}</p>}
        </Show>
        <Show when={store.scope?.retryAt}>
          {(at) => (
            <p role="status">
              {language.t("orchestra.inbox.slackRetryAt", { time: new Date(at()).toLocaleTimeString() })}
            </p>
          )}
        </Show>
      </Show>
    </div>
  )
}
