import { useDialog } from "@orchestra/ui/context/dialog"
import { Icon } from "@orchestra/ui/icon"
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { Persist, persisted } from "@/utils/persist"
import type { ChapterPageProps } from "../../chapter-route"
import { MxPage } from "../kit"
import { InboxConnections, InboxPreferences } from "./controls"
import {
  defaults,
  itemKind,
  liveSources,
  shown,
  sources,
  type Action,
  type InboxStore,
  type Item,
  type Kind,
  type Source,
  type View,
} from "./model"
import { InboxDetail } from "./inbox-detail"
import { InboxMark, RefreshMark, SourceMark } from "./parts"
import "./inbox.css"

export default function Inbox(props: ChapterPageProps) {
  const language = useLanguage()
  const t = language.t
  const sdk = useServerSDK()
  const dialog = useDialog()
  const api = () => sdk().orchestra["server.inbox"]
  const preview =
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("preview") === "inbox"
  // Preferences contain only presentation choices. Message text stays out of browser persistence.
  const [preferences, setPreferences] = persisted(
    Persist.global("inbox.preferences"),
    createStore({ ...defaults, quick: { ...defaults.quick } }),
  )
  const [store, setStore] = createStore<InboxStore>({
    items: [],
    loading: false,
    failed: false,
    busy: false,
    feedback: undefined,
    view: (preview ? "all" : "waiting") as View,
    kind: "all" as Kind,
    source: "all" as Source | "all",
    query: "",
    selected: undefined,
    composing: undefined,
    drafts: {},
    confirmation: undefined,
    revision: 0,
  })
  const visible = createMemo(() => shown(store.items, store.view, store.source, store.query, store.kind))
  const counts = createMemo(() => ({
    all: shown(store.items, store.view, store.source, store.query).length,
    message: shown(store.items, store.view, store.source, store.query, "message").length,
    notification: shown(store.items, store.view, store.source, store.query, "notification").length,
  }))
  const selected = createMemo(() => visible().find((item) => item.id === store.selected) ?? visible()[0])
  const attention = createMemo(() => ({
    waiting: shown(store.items, "waiting", store.source, store.query, store.kind).length,
    all: shown(store.items, "all", store.source, store.query, store.kind).length,
  }))
  // The inbox belongs to the installation, not the project selected in the sidebar.
  const [installDirectory, setInstallDirectory] = createSignal("")
  const directory = () => (preview ? props.directory : installDirectory())
  const location = () => ({ directory: directory() })
  const refresh = () => setStore("revision", (value) => value + 1)

  createEffect(() => {
    if (preview) return
    const controller = new AbortController()
    onCleanup(() => controller.abort())
    void sdk()
      .orchestra.location.paths({ signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setInstallDirectory(result.home)
      })
      .catch(() => {
        if (!controller.signal.aborted) setStore({ failed: true, loading: false })
      })
  })

  createEffect(() => {
    const current = directory()
    store.revision
    if (!current && !preview) return
    const controller = new AbortController()
    onCleanup(() => controller.abort())
    setStore({ loading: true, failed: false })
    void (async () => {
      if (import.meta.env.DEV && preview) {
        const { items } = await import("./fixture")
        if (!controller.signal.aborted) setStore({ items, loading: false })
        return
      }
      const result = await api().list({ location: { directory: current } }, { signal: controller.signal })
      if (!controller.signal.aborted) setStore({ items: result.data, loading: false })
    })().catch(() => !controller.signal.aborted && setStore({ loading: false, failed: true }))
  })

  const act = async (run: () => Promise<unknown>, feedback: "saved" | "sent" | "triaged") => {
    if (store.busy) return
    if (preview) {
      setStore({ feedback: "previewAction", confirmation: undefined, composing: undefined })
      return
    }
    setStore({ busy: true, feedback: undefined })
    const done = await run().then(
      () => true,
      () => false,
    )
    setStore({ busy: false, feedback: done ? feedback : "refused" })
    if (!done) return
    setStore({ confirmation: undefined, composing: undefined })
    refresh()
  }

  const triage = (action: Action, id: string) => {
    if (preview) {
      setStore({
        items:
          action === "archive"
            ? store.items.filter((item) => item.id !== id)
            : store.items.map((item) => (item.id === id ? { ...item, waiting: false } : item)),
        feedback: "previewAction",
      })
      return
    }
    const input = { location: location(), id }
    const run = {
      handoff: () => api().handoff({ location: location(), ids: [id] }),
      remind: () => api().remind(input),
      read: () => api().read(input),
      archive: () => api().archive(input),
    }
    return act(run[action], "triaged")
  }

  const choose = (id: string) =>
    setStore({ selected: id, confirmation: undefined, composing: undefined, feedback: undefined })

  return (
    <div class="inbox-page">
      <MxPage
        id="inbox"
        eyebrow={t("orchestra.inbox.eyebrow")}
        title={t("orchestra.inbox.title")}
        description={t("orchestra.inbox.description")}
        action={
          <div class="inbox-header-actions">
            <button
              type="button"
              class="inbox-icon-button"
              aria-label={t("orchestra.inbox.customize")}
              title={t("orchestra.inbox.customize")}
              onClick={() => dialog.show(() => <InboxPreferences value={preferences} change={setPreferences} />)}
            >
              <Icon name="sliders" size="small" />
            </button>
            <button
              type="button"
              class="inbox-icon-button"
              aria-label={t("orchestra.inbox.sources")}
              title={t("orchestra.inbox.sources")}
              disabled={!directory() && !preview}
              onClick={() =>
                dialog.show(() => (
                  <InboxConnections
                    api={api()}
                    directory={directory()}
                    connected={refresh}
                    preview={preview}
                    local={["localhost", "127.0.0.1", "[::1]"].includes(new URL(props.server.http.url).hostname)}
                    chooseSource={(source) =>
                      setStore({
                        source,
                        kind: "all",
                        view: "all",
                        selected: undefined,
                        composing: undefined,
                        confirmation: undefined,
                      })
                    }
                  />
                ))
              }
            >
              <Icon name="link" size="small" />
            </button>
          </div>
        }
      >
        <Show
          when={directory() || preview}
          fallback={
            <div class="inbox-empty">
              <InboxMark />
              <h2>{t(store.failed ? "orchestra.inbox.failed" : "orchestra.inbox.loading")}</h2>
            </div>
          }
        >
          <Show when={preview}>
            <div class="inbox-preview-note">
              <span>{t("orchestra.inbox.designPreview")}</span>
              {t("orchestra.inbox.previewBody")}
            </div>
          </Show>
          <div class="inbox-toolbar">
            <div class="inbox-views" role="group" aria-label={t("orchestra.inbox.title")}>
              <For each={["all", "message", "notification"] as const}>
                {(kind) => (
                  <button
                    type="button"
                    aria-pressed={store.kind === kind}
                    onClick={() =>
                      setStore({ kind, confirmation: undefined, selected: undefined, composing: undefined })
                    }
                  >
                    <Icon
                      name={kind === "message" ? "speech-bubble" : kind === "notification" ? "status" : "bullet-list"}
                      size="small"
                    />
                    {t(`orchestra.inbox.kind.${kind}`)}
                    <span>{counts()[kind]}</span>
                  </button>
                )}
              </For>
            </div>
            <select
              class="inbox-source-filter inbox-status-filter"
              aria-label={t("orchestra.inbox.statusFilter")}
              value={store.view}
              onChange={(event) =>
                setStore({ view: event.currentTarget.value as View, confirmation: undefined, selected: undefined })
              }
            >
              <option value="waiting">
                {t("orchestra.inbox.waiting")} · {attention().waiting}
              </option>
              <option value="all">
                {t("orchestra.inbox.all")} · {attention().all}
              </option>
            </select>
            <label class="inbox-search">
              <Icon name="magnifying-glass" size="small" />
              <input
                type="search"
                placeholder={t("orchestra.inbox.search")}
                aria-label={t("orchestra.inbox.search")}
                value={store.query}
                onInput={(event) => setStore({ query: event.currentTarget.value, confirmation: undefined })}
              />
            </label>
            <select
              class="inbox-source-filter"
              aria-label={t("orchestra.inbox.sourceFilter")}
              value={store.source}
              onChange={(event) =>
                setStore({ source: event.currentTarget.value as Source | "all", confirmation: undefined })
              }
            >
              <option value="all">{t("orchestra.inbox.allSources")}</option>
              <For each={preview ? sources : liveSources}>
                {(source) => <option value={source}>{t(`orchestra.inbox.source.${source}`)}</option>}
              </For>
            </select>
            <button
              type="button"
              class="inbox-icon-button"
              aria-label={t("orchestra.inbox.refresh")}
              title={t("orchestra.inbox.refresh")}
              disabled={store.loading || store.busy}
              onClick={refresh}
            >
              <RefreshMark />
            </button>
          </div>
          <Show when={store.feedback}>
            {(feedback) => (
              <div
                class="inbox-feedback"
                role={feedback() === "refused" ? "alert" : "status"}
                data-error={feedback() === "refused"}
              >
                {t(`orchestra.inbox.${feedback()}`)}
              </div>
            )}
          </Show>
          <div
            class="inbox-workspace"
            data-selected={Boolean(store.selected)}
            data-compact={preferences.compact}
            aria-busy={store.loading}
          >
            <div class="inbox-list-pane">
              <div class="inbox-list-heading">
                <span>{t(`orchestra.inbox.kind.${store.kind}`)}</span>
                <span>{visible().length}</span>
              </div>
              <Show
                when={!store.failed}
                fallback={
                  <div class="inbox-empty small" role="alert">
                    <Icon name="warning" />
                    <h2>{t("orchestra.inbox.failed")}</h2>
                    <button type="button" class="inbox-button outlined" onClick={refresh}>
                      {t("orchestra.inbox.retry")}
                    </button>
                  </div>
                }
              >
                <Show
                  when={visible().length > 0}
                  fallback={
                    <div class="inbox-empty small" role="status">
                      <InboxMark />
                      <h2>
                        {t(
                          store.loading
                            ? "orchestra.inbox.loading"
                            : store.query || store.source !== "all"
                              ? "orchestra.inbox.noMatches"
                              : "orchestra.inbox.empty",
                        )}
                      </h2>
                      <Show when={!store.loading}>
                        <p>
                          {t(
                            store.query || store.source !== "all"
                              ? "orchestra.inbox.noMatchesBody"
                              : "orchestra.inbox.emptyBody",
                          )}
                        </p>
                        <Show when={store.query || store.source !== "all"}>
                          <button
                            type="button"
                            class="inbox-button"
                            onClick={() => setStore({ source: "all", query: "" })}
                          >
                            {t("orchestra.inbox.clearFilters")}
                          </button>
                        </Show>
                      </Show>
                    </div>
                  }
                >
                  <div class="inbox-list" role="list" aria-label={t("orchestra.inbox.title")}>
                    <For each={visible()}>
                      {(item) => (
                        <div role="listitem">
                          <button
                            type="button"
                            class="inbox-row"
                            data-kind={itemKind(item)}
                            aria-current={selected()?.id === item.id ? "true" : undefined}
                            aria-controls="inbox-item"
                            disabled={store.busy}
                            onClick={() => choose(item.id)}
                          >
                            <span class="inbox-row-top">
                              <SourceMark source={item.source} />
                              <span class="inbox-row-actor">{item.actor}</span>
                              <Show when={store.kind === "all"}>
                                <span class="inbox-kind" data-kind={itemKind(item)}>
                                  <Icon
                                    name={
                                      itemKind(item) === "message"
                                        ? "speech-bubble"
                                        : itemKind(item) === "contact"
                                          ? "link"
                                          : "status"
                                    }
                                    size="small"
                                  />
                                  {t(
                                    itemKind(item) === "contact"
                                      ? "orchestra.inbox.kind.contact"
                                      : itemKind(item) === "message"
                                        ? "orchestra.inbox.message"
                                        : "orchestra.inbox.notification",
                                  )}
                                </span>
                              </Show>
                              <Show when={item.waiting}>
                                <span class="inbox-unread" aria-label={t("orchestra.inbox.waiting")} />
                              </Show>
                            </span>
                            <Show when={item.title}>
                              <span class="inbox-row-title">{item.title}</span>
                            </Show>
                            <Show when={preferences.preview}>
                              <span class="inbox-row-preview">
                                {item.source === "whatsapp"
                                  ? t("orchestra.inbox.whatsappHint")
                                  : itemKind(item) === "notification"
                                    ? (item.context ?? item.snippet)
                                    : item.snippet}
                              </span>
                            </Show>
                            <span class="inbox-row-meta">
                              <span>{t(`orchestra.inbox.source.${item.source}`)}</span>
                              <Show when={item.notice}>
                                <span class="inbox-notice-label">{t(`orchestra.inbox.notice.${item.notice}`)}</span>
                              </Show>
                              <Show when={item.commitmentId}>
                                <Icon name="link" size="small" />
                              </Show>
                              <Show when={store.drafts[item.id]}>
                                <Icon name="pencil-line" size="small" />
                              </Show>
                            </span>
                          </button>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
              </Show>
              <div class="inbox-list-foot">
                <Icon name="shield" size="small" />
                {t(preview ? "orchestra.inbox.previewLocal" : "orchestra.inbox.local")}
              </div>
            </div>
            <Show
              when={selected()}
              keyed
              fallback={
                <div class="inbox-empty inbox-idle">
                  <InboxMark />
                  <h2>{t("orchestra.inbox.select")}</h2>
                  <p>{t("orchestra.inbox.selectBody")}</p>
                </div>
              }
            >
              {(item) => (
                <InboxDetail
                  item={item}
                  store={store}
                  setStore={setStore}
                  api={api()}
                  directory={directory()}
                  quick={preferences.quick}
                  primary={preferences.primary}
                  act={act}
                  triage={triage}
                />
              )}
            </Show>
          </div>
        </Show>
      </MxPage>
    </div>
  )
}
