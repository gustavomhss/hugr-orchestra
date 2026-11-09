import { DropdownMenu } from "@orchestra/ui/dropdown-menu"
import { Icon } from "@orchestra/ui/icon"
import { For, Show } from "solid-js"
import type { SetStoreFunction } from "solid-js/store"
import { useLanguage } from "@/context/language"
import type { ServerSDK } from "@/context/server-sdk"
import {
  defaults,
  initials,
  itemActions,
  itemKind,
  openHref,
  primaryAction,
  replyKind,
  type Action,
  type InboxStore,
  type Item,
  type Preference,
} from "./model"
import { ActionMark, OpenItem, SourceMark } from "./parts"

export function InboxDetail(props: {
  item: Item
  store: InboxStore
  setStore: SetStoreFunction<InboxStore>
  api: ServerSDK["orchestra"]["server.inbox"]
  directory: string
  quick: typeof defaults.quick
  primary: Preference
  act: (run: () => Promise<unknown>, feedback: "saved" | "sent" | "triaged") => Promise<void>
  triage: (action: Action, id: string) => unknown
}) {
  const t = useLanguage().t
  const item = props.item
  const store = props.store
  const setStore = props.setStore
  const location = () => ({ directory: props.directory })
  const next = (entry: Item) => primaryAction(entry, props.primary)
  const api = () => props.api
  const act = props.act
  const triage = props.triage
  return (
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
                      <DropdownMenu.ItemLabel>{t(`orchestra.inbox.action.${action}`)}</DropdownMenu.ItemLabel>
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
              {item.context ?? t("orchestra.inbox.via", { source: t(`orchestra.inbox.source.${item.source}`) })}
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
                      next(item) === "handoff" ? void triage("handoff", item.id) : setStore("composing", item.id)
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
                    replyKind(item.source) === "comment" ? "orchestra.inbox.comment" : "orchestra.inbox.reply",
                  )}
                </button>
              </Show>
              <For
                each={itemActions(item).filter(
                  (action) => item.source !== "whatsapp" && props.quick[action] && action !== next(item),
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
  )
}
