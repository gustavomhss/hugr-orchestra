import { For, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import type { ServerSDK } from "@/context/server-sdk"
import { createFeedSources, type FeedState } from "./feed-source"

export function FeedConnections(props: {
  api: ServerSDK["orchestra"]["server.inbox"]
  directory: string
  synced: () => void
}) {
  const language = useLanguage()
  const [store, setStore] = createStore<FeedState>({
    feeds: [],
    source: "rss",
    url: "",
    name: "",
    busy: false,
    failed: false,
  })
  const model = createFeedSources({
    api: props.api,
    directory: props.directory,
    change: (value) => setStore(value),
    synced: props.synced,
  })
  onMount(() => void model.load())
  onCleanup(() => model.dispose())
  return (
    <section class="inbox-work-source">
      <h3>{language.t("orchestra.inbox.feedsTitle")}</h3>
      <p>{language.t("orchestra.inbox.feedsBody")}</p>
      <Show when={store.failed}>
        <p role="alert">{language.t("orchestra.inbox.workFailed")}</p>
      </Show>
      <label class="mx-field">
        <span>{language.t("orchestra.inbox.feedType")}</span>
        <select
          disabled={store.busy}
          value={store.source}
          onChange={(event) => model.source(event.currentTarget.value === "youtube" ? "youtube" : "rss")}
        >
          <option value="rss">{language.t("orchestra.inbox.source.rss")}</option>
          <option value="youtube">{language.t("orchestra.inbox.source.youtube")}</option>
        </select>
      </label>
      <label class="mx-field">
        <span>
          {language.t(store.source === "youtube" ? "orchestra.inbox.feedChannel" : "orchestra.inbox.feedUrl")}
        </span>
        <input disabled={store.busy} value={store.url} onInput={(event) => model.url(event.currentTarget.value)} />
      </label>
      <label class="mx-field">
        <span>{language.t("orchestra.inbox.feedName")}</span>
        <input disabled={store.busy} value={store.name} onInput={(event) => model.name(event.currentTarget.value)} />
      </label>
      <button type="button" class="mx-btn" disabled={store.busy || !store.url.trim()} onClick={() => void model.add()}>
        {language.t("orchestra.inbox.feedAdd")}
      </button>
      <For each={store.feeds}>
        {(feed) => (
          <section class="inbox-work-source">
            <h4>{feed.name}</h4>
            <p role="status">{language.t(`orchestra.inbox.feedState.${feed.state}`)}</p>
            <p>{language.t(feed.initialized ? "orchestra.inbox.feedFollowing" : "orchestra.inbox.feedBaseline")}</p>
            <div class="inbox-work-actions">
              <button type="button" class="mx-btn" disabled={store.busy} onClick={() => void model.sync(feed.id)}>
                {language.t("orchestra.inbox.workSync")}
              </button>
              <button type="button" class="mx-btn" disabled={store.busy} onClick={() => void model.remove(feed.id)}>
                {language.t("orchestra.inbox.feedRemove")}
              </button>
            </div>
            <Show when={feed.retryAt}>
              {(at) => (
                <p>{language.t("orchestra.inbox.slackRetryAt", { time: new Date(at()).toLocaleTimeString() })}</p>
              )}
            </Show>
          </section>
        )}
      </For>
    </section>
  )
}
