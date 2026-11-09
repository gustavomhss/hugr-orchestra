import { A } from "@solidjs/router"
import { useDialog } from "@orchestra/ui/context/dialog"
import { DropdownMenu } from "@orchestra/ui/dropdown-menu"
import { Icon } from "@orchestra/ui/icon"
import { createEffect, createMemo, For, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { Persist, persisted } from "@/utils/persist"
import type { ChapterPageProps } from "../../chapter-route"
import { MxPage } from "../kit"
import { InboxConnections, InboxPreferences } from "./controls"
import {
  defaults,
  initials,
  itemActions,
  itemKind,
  liveSources,
  openHref,
  primaryAction,
  replyKind,
  shown,
  sources,
  type Action,
  type Item,
  type Kind,
  type Source,
  type View,
} from "./model"
import { ActionMark, InboxMark, OpenItem, RefreshMark, SourceMark } from "./parts"
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
  const [store, setStore] = createStore({
    items: [] as readonly Item[],
    loading: false,
    failed: false,
    busy: false,
    feedback: undefined as "saved" | "sent" | "triaged" | "refused" | "previewAction" | undefined,
    view: (preview ? "all" : "waiting") as View,
    kind: "all" as Kind,
    source: "all" as Source | "all",
    query: "",
    selected: undefined as string | undefined,
    composing: undefined as string | undefined,
    drafts: {} as Record<string, string>,
    confirmation: undefined as { id: string; text: string; thread: string } | undefined,
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
  const location = () => ({ directory: props.directory })
  const refresh = () => setStore("revision", (value) => value + 1)

  createEffect(() => {
    const directory = props.directory
    store.revision
    if (!directory && !preview) return
    const controller = new AbortController()
    onCleanup(() => controller.abort())
    setStore({ loading: true, failed: false })
    void (async () => {
      if (import.meta.env.DEV && preview) {
        const { items } = await import("./fixture")
        if (!controller.signal.aborted) setStore({ items, loading: false })
        return
      }
      const result = await api().list({ location: { directory } }, { signal: controller.signal })
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

  const next = (item: Item) => primaryAction(item, preferences.primary)
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
              disabled={!props.directory && !preview}
              onClick={() =>
                dialog.show(() => (
                  <InboxConnections
                    api={api()}
                    directory={props.directory}
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
          when={props.directory || preview}
          fallback={
            <div class="inbox-empty">
              <InboxMark />
              <h2>{t("orchestra.inbox.noProject")}</h2>
              <p>{t("orchestra.inbox.noProjectBody")}</p>
              <A class="inbox-button outlined" href="/">
                {t("orchestra.inbox.chooseProject")}
              </A>
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
                <section class="inbox-item" id="inbox-item" aria-label={item.actor} data-kind={itemKind(item)}>
                  <div class="inbox-item-toolbar">
                    <button
                      type="button"
                      class="inbox-button inbox-back"
                      onClick={() => setStore({ selected: undefined, confirmation: undefined })}
                    >
                      <Icon name="arrow-left" size="small" />
                      {t("orchestra.inbox.back")}
                    </button>
                    <span class="inbox-via">
                      <SourceMark source={item.source} />
                      {t(`orchestra.inbox.source.${item.source}`)}
                      <span class="inbox-item-kind">
                        {t(
                          itemKind(item) === "contact"
                            ? "orchestra.inbox.kind.contact"
                            : itemKind(item) === "message"
                              ? "orchestra.inbox.message"
                              : "orchestra.inbox.notification",
                        )}
                      </span>
                    </span>
                    <Show when={openHref(item)}>
                      <OpenItem item={item} />
                    </Show>
                    <Show when={item.source !== "whatsapp"}>
                      <DropdownMenu placement="bottom-end">
                        <DropdownMenu.Trigger
                          class="inbox-icon-button"
                          aria-label={t("orchestra.inbox.more")}
                          disabled={store.busy}
                        >
                          <Icon name="dot-grid" size="small" />
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.Content>
                            <For each={itemActions(item)}>
                              {(action) => (
                                <DropdownMenu.Item onSelect={() => void triage(action, item.id)}>
                                  <ActionMark action={action} />
                                  <DropdownMenu.ItemLabel>
                                    {t(`orchestra.inbox.action.${action}`)}
                                  </DropdownMenu.ItemLabel>
                                </DropdownMenu.Item>
                              )}
                            </For>
                            <DropdownMenu.Separator />
                            <DropdownMenu.Item onSelect={() => setStore("composing", item.id)}>
                              <Icon name="pencil-line" size="small" />
                              <DropdownMenu.ItemLabel>
                                {t(!item.reply ? "orchestra.inbox.note" : "orchestra.inbox.draft")}
                              </DropdownMenu.ItemLabel>
                            </DropdownMenu.Item>
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu>
                    </Show>
                  </div>
                  <div class="inbox-item-body">
                    <header class="inbox-person">
                      <Show
                        when={itemKind(item) === "message"}
                        fallback={
                          <span class="inbox-event-mark">
                            <Icon
                              name={
                                item.notice === "decision" || item.notice === "approval"
                                  ? "brain"
                                  : item.notice === "ci" || item.notice === "incident"
                                    ? "warning"
                                    : item.notice === "review"
                                      ? "review"
                                      : itemKind(item) === "contact"
                                        ? "link"
                                        : "status"
                              }
                            />
                          </span>
                        }
                      >
                        <span class="inbox-avatar" aria-hidden="true">
                          {initials(item.actor)}
                        </span>
                      </Show>
                      <div>
                        <h2>{item.actor}</h2>
                        <p>
                          {item.context ??
                            t("orchestra.inbox.via", { source: t(`orchestra.inbox.source.${item.source}`) })}
                        </p>
                      </div>
                    </header>
                    <Show when={item.notice}>
                      <span class="inbox-detail-notice">{t(`orchestra.inbox.notice.${item.notice}`)}</span>
                    </Show>
                    <Show when={item.title}>
                      <h3 class="inbox-item-title">{item.title}</h3>
                    </Show>
                    <p class="inbox-message">
                      {item.source === "whatsapp" ? t("orchestra.inbox.whatsappBody") : item.snippet}
                    </p>
                    <Show when={item.personId || item.commitmentId}>
                      <div class="inbox-context">
                        <Icon name={item.commitmentId ? "link" : "check-small"} size="small" />
                        {t(item.commitmentId ? "orchestra.inbox.commitment" : "orchestra.inbox.person")}
                      </div>
                    </Show>
                    <Show
                      when={store.composing !== item.id}
                      fallback={
                        <div class="inbox-composer">
                          <Show
                            when={!store.confirmation}
                            fallback={
                              <div class="inbox-confirmation">
                                <h3>{t("orchestra.inbox.confirmTitle")}</h3>
                                <dl>
                                  <dt>{t("orchestra.inbox.to")}</dt>
                                  <dd>{item.source === "mail" ? item.actor : store.confirmation?.thread}</dd>
                                </dl>
                                <Show when={item.source === "mail"}>
                                  <dl>
                                    <dt>{t("orchestra.inbox.thread")}</dt>
                                    <dd>{store.confirmation?.thread}</dd>
                                  </dl>
                                </Show>
                                <p class="inbox-confirm-text">{store.confirmation?.text}</p>
                                <div class="inbox-composer-actions">
                                  <button
                                    type="button"
                                    class="inbox-button"
                                    disabled={store.busy}
                                    onClick={() => setStore("confirmation", undefined)}
                                  >
                                    {t("orchestra.inbox.edit")}
                                  </button>
                                  <button
                                    type="button"
                                    class="inbox-button primary"
                                    disabled={store.busy}
                                    onClick={() => {
                                      const pair = store.confirmation
                                      if (!pair || pair.id !== item.id || pair.thread !== item.threadId) return
                                      void act(
                                        () =>
                                          api()
                                            .send({ location: location(), id: pair.id, text: pair.text, click: true })
                                            .then((result) => {
                                              if (!result.data.sent) throw new Error("send-refused")
                                              setStore("drafts", pair.id, "")
                                            }),
                                        "sent",
                                      )
                                    }}
                                  >
                                    {t(
                                      replyKind(item.source) === "comment"
                                        ? "orchestra.inbox.sendComment"
                                        : "orchestra.inbox.send",
                                    )}
                                    <Icon name="arrow-right" size="small" />
                                  </button>
                                </div>
                              </div>
                            }
                          >
                            <label class="inbox-compose-label" for={`reply-${item.id}`}>
                              {t(
                                !item.reply
                                  ? "orchestra.inbox.composeDraft"
                                  : replyKind(item.source) === "comment"
                                    ? "orchestra.inbox.composeComment"
                                    : "orchestra.inbox.compose",
                              )}
                            </label>
                            <textarea
                              id={`reply-${item.id}`}
                              autofocus
                              value={store.drafts[item.id] ?? ""}
                              placeholder={t("orchestra.inbox.placeholder")}
                              disabled={store.busy}
                              onInput={(event) => setStore("drafts", item.id, event.currentTarget.value)}
                            />
                            <div class="inbox-composer-actions">
                              <button
                                type="button"
                                class="inbox-button"
                                disabled={store.busy || !store.drafts[item.id]?.trim()}
                                onClick={() =>
                                  void act(
                                    () =>
                                      api().draft({
                                        location: location(),
                                        id: item.id,
                                        text: store.drafts[item.id] ?? "",
                                      }),
                                    "saved",
                                  )
                                }
                              >
                                {t("orchestra.inbox.saveDraft")}
                              </button>
                              <button
                                type="button"
                                class="inbox-button"
                                disabled={store.busy}
                                onClick={() => setStore("composing", undefined)}
                              >
                                {t("orchestra.inbox.cancel")}
                              </button>
                              <Show when={item.reply}>
                                <button
                                  type="button"
                                  class="inbox-button primary"
                                  disabled={store.busy || !store.drafts[item.id]?.trim()}
                                  onClick={() =>
                                    setStore("confirmation", {
                                      id: item.id,
                                      text: store.drafts[item.id] ?? "",
                                      thread: item.threadId,
                                    })
                                  }
                                >
                                  {t(
                                    replyKind(item.source) === "comment"
                                      ? "orchestra.inbox.reviewComment"
                                      : "orchestra.inbox.review",
                                  )}
                                  <Icon name="arrow-right" size="small" />
                                </button>
                              </Show>
                            </div>
                            <Show when={item.source === "mail"}>
                              <button
                                type="button"
                                class="inbox-button"
                                disabled={store.busy || !store.drafts[item.id]?.trim()}
                                onClick={() =>
                                  void act(
                                    () =>
                                      api().originDraft({
                                        location: location(),
                                        id: item.id,
                                        text: store.drafts[item.id] ?? "",
                                      }),
                                    "saved",
                                  )
                                }
                              >
                                <Icon name="open-file" size="small" />
                                {t("orchestra.inbox.origin")}
                              </button>
                            </Show>
                          </Show>
                          <p class="inbox-privacy">
                            <Icon name="shield" size="small" />
                            {t("orchestra.inbox.draftPrivacy")}
                          </p>
                        </div>
                      }
                    >
                      <div class="inbox-next">
                        <span class="inbox-section-label">{t("orchestra.inbox.next")}</span>
                        <p>
                          {t(
                            item.source === "whatsapp"
                              ? "orchestra.inbox.whatsappHint"
                              : item.source === "board"
                                ? "orchestra.inbox.boardHint"
                                : next(item) === "handoff"
                                  ? "orchestra.inbox.handoffHint"
                                  : next(item) === "open"
                                    ? !item.reply
                                      ? "orchestra.inbox.inspectHint"
                                      : itemKind(item) === "notification"
                                        ? "orchestra.inbox.notificationHint"
                                        : "orchestra.inbox.openHint"
                                    : replyKind(item.source) === "comment"
                                      ? "orchestra.inbox.commentHint"
                                      : "orchestra.inbox.replyHint",
                          )}
                        </p>
                        <div class="inbox-next-actions">
                          <Show
                            when={next(item) === "open"}
                            fallback={
                              <button
                                type="button"
                                class="inbox-button primary"
                                disabled={store.busy}
                                onClick={() =>
                                  next(item) === "handoff"
                                    ? void triage("handoff", item.id)
                                    : setStore("composing", item.id)
                                }
                              >
                                <Icon name={next(item) === "handoff" ? "brain" : "arrow-undo-down"} size="small" />
                                {t(
                                  next(item) === "handoff"
                                    ? "orchestra.inbox.action.handoff"
                                    : replyKind(item.source) === "comment"
                                      ? "orchestra.inbox.comment"
                                      : "orchestra.inbox.reply",
                                )}
                              </button>
                            }
                          >
                            <OpenItem item={item} primary />
                          </Show>
                          <Show when={item.reply && next(item) !== "reply"}>
                            <button type="button" class="inbox-button" onClick={() => setStore("composing", item.id)}>
                              {t(
                                replyKind(item.source) === "comment"
                                  ? "orchestra.inbox.comment"
                                  : "orchestra.inbox.reply",
                              )}
                            </button>
                          </Show>
                          <For
                            each={itemActions(item).filter(
                              (action) =>
                                item.source !== "whatsapp" && preferences.quick[action] && action !== next(item),
                            )}
                          >
                            {(action) => (
                              <button
                                type="button"
                                class="inbox-button"
                                disabled={store.busy}
                                onClick={() => void triage(action, item.id)}
                              >
                                <ActionMark action={action} />
                                {t(`orchestra.inbox.action.${action}`)}
                              </button>
                            )}
                          </For>
                        </div>
                      </div>
                    </Show>
                  </div>
                </section>
              )}
            </Show>
          </div>
        </Show>
      </MxPage>
    </div>
  )
}
