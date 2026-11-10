import { Dialog } from "@kobalte/core/dialog"
import { A } from "@solidjs/router"
import { useDialog } from "@orchestra/ui/context/dialog"
import { DialogHeader, DialogV2 } from "@orchestra/ui/v2/dialog-v2"
import { Icon } from "@orchestra/ui/icon"
import { For, onCleanup, onMount, Show } from "solid-js"
import { createStore, type SetStoreFunction } from "solid-js/store"
import { useLanguage } from "@/context/language"
import type { ServerSDK } from "@/context/server-sdk"
import { MxToggle } from "../kit"
import { accounts, acquisitionFailed, actions, connectionInput, defaults, sourceGroups, type Preference, type Source } from "./model"
import { SourceMark } from "./parts"
import { SlackConnection } from "./slack"
import { WorkConnection } from "./work"
import { FeedConnections } from "./feeds"

export function InboxPreferences(props: { value: typeof defaults; change: SetStoreFunction<typeof defaults> }) {
  const language = useLanguage()
  const t = language.t
  const dialog = useDialog()
  return (
    <DialogV2 fit containerClass="mx-dialog inbox-dialog">
      <DialogHeader>
        <div>
          <Dialog.Title>{t("orchestra.inbox.customize")}</Dialog.Title>
          <Dialog.Description>{t("orchestra.inbox.preferencesBody")}</Dialog.Description>
        </div>
      </DialogHeader>
      <div class="mx-dialog-body inbox-settings">
        <section>
          <h3>{t("orchestra.inbox.appearance")}</h3>
          <For each={["compact", "preview"] as const}>
            {(key) => (
              <div class="inbox-setting">
                <span>{t(`orchestra.inbox.${key}`)}</span>
                <MxToggle
                  checked={props.value[key]}
                  label={t(`orchestra.inbox.${key}`)}
                  onChange={(value) => props.change(key, value)}
                />
              </div>
            )}
          </For>
        </section>
        <section>
          <h3>{t("orchestra.inbox.quick")}</h3>
          <p>{t("orchestra.inbox.quickBody")}</p>
          <For each={actions}>
            {(action) => (
              <div class="inbox-setting">
                <span>{t(`orchestra.inbox.action.${action}`)}</span>
                <MxToggle
                  checked={props.value.quick[action]}
                  label={t(`orchestra.inbox.action.${action}`)}
                  onChange={(value) => props.change("quick", action, value)}
                />
              </div>
            )}
          </For>
        </section>
        <label class="mx-field">
          <span>{t("orchestra.inbox.defaultAction")}</span>
          <select
            value={props.value.primary}
            onChange={(event) => props.change("primary", event.currentTarget.value as Preference)}
          >
            <For each={["auto", "reply", "open", "handoff"] as const}>
              {(value) => <option value={value}>{t(`orchestra.inbox.preference.${value}`)}</option>}
            </For>
          </select>
        </label>
      </div>
      <footer class="mx-dialog-foot">
        <button
          type="button"
          class="mx-btn"
          onClick={() => props.change({ ...defaults, quick: { ...defaults.quick } })}
        >
          {t("orchestra.inbox.reset")}
        </button>
        <button type="button" class="mx-btn primary" onClick={() => dialog.close()}>
          {t("orchestra.inbox.done")}
        </button>
      </footer>
    </DialogV2>
  )
}

export function AccountSourceList(props: {
  status: () => readonly { source: string; connected: boolean; state?: string }[]
  loading: () => boolean
  pressed: (source: string) => boolean
  busy: boolean
  choose: (source: (typeof accounts)[number]) => void
}) {
  return (
    <div class="inbox-account-list">
      <For each={accounts}>
        {(source) => (
          <AccountSourceRow
            source={source}
            status={props.status}
            loading={props.loading}
            pressed={props.pressed(source)}
            busy={props.busy}
            choose={() => props.choose(source)}
          />
        )}
      </For>
    </div>
  )
}

export function AccountSourceRow(props: {
  source: string
  status: () => readonly { source: string; connected: boolean; state?: string }[]
  loading: () => boolean
  pressed: boolean
  busy: boolean
  choose: () => void
}) {
  const language = useLanguage()
  const t = language.t
  const account = () => props.status().find((item) => item.source === props.source)
  const failed = () => acquisitionFailed(account())
  return (
    <button type="button" aria-pressed={props.pressed} disabled={props.busy} onClick={() => props.choose()}>
      <SourceMark source={props.source as Source} />
      <strong>{t(`orchestra.inbox.source.${props.source as Source}`)}</strong>
      <Show when={failed()}>
        <span role="alert">{t("orchestra.inbox.acquisitionFailed")}</span>
      </Show>
      <Show when={account()?.connected && !failed()}>
        <Icon name="check" size="small" />
        <span>{t("orchestra.inbox.stored")}</span>
      </Show>
      <Show when={!props.loading() && !account()?.connected}>
        <span>{t("orchestra.inbox.notConnected")}</span>
      </Show>
    </button>
  )
}

export function InboxConnections(props: {
  api: ServerSDK["orchestra"]["server.inbox"]
  directory: string
  connected: () => void
  preview?: boolean
  chooseSource?: (source: Source) => void
  local?: boolean
}) {
  const language = useLanguage()
  const t = language.t
  const dialog = useDialog()
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  const [store, setStore] = createStore({
    status: [] as readonly { source: string; connected: boolean; state?: string }[],
    source: "mail" as (typeof accounts)[number],
    account: "gmail" as "gmail" | "outlook",
    token: "",
    email: "",
    site: "",
    busy: false,
    loading: true,
    failed: false,
    unavailable: false,
    connectionRevision: 0,
  })
  const loadAccounts = () => {
    if (props.preview || controller.signal.aborted) return
    return props.api
      .accounts({ location: { directory: props.directory } }, { signal: controller.signal })
      .then((result) => !controller.signal.aborted && setStore({ status: result.data, loading: false }))
      .catch(() => !controller.signal.aborted && setStore("unavailable", true))
  }
  onMount(() => void loadAccounts())

  const connect = async (event: SubmitEvent) => {
    event.preventDefault()
    if (props.preview || store.busy || !store.token.trim()) return
    setStore({ busy: true, failed: false })
    const source = store.source
    const saved = await props.api
      .connect(
        {
          location: { directory: props.directory },
          ...connectionInput({ source, token: store.token, email: store.email, site: store.site, account: store.account }),
        },
        { signal: controller.signal },
      )
      .then(
        () => true,
        () => false,
      )
    if (controller.signal.aborted) return
    setStore({ busy: false, failed: !saved })
    if (!saved) return
    setStore({
      token: "",
      email: "",
      site: "",
      connectionRevision: store.connectionRevision + 1,
    })
    props.connected()
    await loadAccounts()
  }

  return (
    <DialogV2 fit containerClass={`mx-dialog inbox-dialog${props.preview ? " inbox-catalog-dialog" : ""}`}>
      <DialogHeader>
        <div>
          <Dialog.Title>{t("orchestra.inbox.sources")}</Dialog.Title>
          <Dialog.Description>
            {t(props.preview ? "orchestra.inbox.previewSources" : "orchestra.inbox.sourcesBody")}
          </Dialog.Description>
        </div>
      </DialogHeader>
      <div class="mx-dialog-body inbox-settings">
        <Show when={props.preview}>
          <p class="inbox-catalog-note">{t("orchestra.inbox.catalogPreview")}</p>
          <div class="inbox-source-catalog">
            <For each={sourceGroups}>
              {(group) => (
                <section>
                  <h3>{t(group.title)}</h3>
                  <div>
                    <For each={group.sources}>
                      {(source) => (
                        <button
                          type="button"
                          onClick={() => {
                            props.chooseSource?.(source)
                            dialog.close()
                          }}
                        >
                          <SourceMark source={source} />
                          <span class="inbox-source-copy">
                            <strong>{t(`orchestra.inbox.source.${source}`)}</strong>
                            <small>{t(`orchestra.inbox.capability.${source}`)}</small>
                          </span>
                          <span class="inbox-source-arrow" aria-hidden="true">
                            <Icon name="arrow-right" size="small" />
                          </span>
                        </button>
                      )}
                    </For>
                  </div>
                </section>
              )}
            </For>
          </div>
        </Show>
        <Show when={!props.preview}>
          <SlackConnection
            api={props.api}
            directory={props.directory}
            local={props.local === true}
            connected={props.connected}
          />
          <Show when={store.unavailable}>
            <p role="alert">{t("orchestra.inbox.accountsFailed")}</p>
          </Show>
          <AccountSourceList
            status={() => store.status}
            loading={() => store.loading}
            pressed={(source) => store.source === source}
            busy={store.busy}
            choose={(source) => setStore({ source, token: "", site: "", failed: false })}
          />
          <form id="inbox-connect" class="inbox-connect" autocomplete="off" onSubmit={(event) => void connect(event)}>
            <Show when={store.source === "mail" || store.source === "calendar"}>
              <label class="mx-field">
                <span>{t("orchestra.inbox.account")}</span>
                <select
                  disabled={store.busy}
                  value={store.account}
                  onChange={(event) => setStore("account", event.currentTarget.value as "gmail" | "outlook")}
                >
                  <option value="gmail">
                    {t(store.source === "calendar" ? "orchestra.inbox.googleCalendar" : "orchestra.inbox.gmail")}
                  </option>
                  <option value="outlook">{t("orchestra.inbox.outlook")}</option>
                </select>
              </label>
            </Show>
            <Show when={store.source === "jira"}>
              <label class="mx-field">
                <span>{t("orchestra.inbox.email")}</span>
                <input
                  type="email"
                  required
                  disabled={store.busy}
                  value={store.email}
                  onInput={(event) => setStore("email", event.currentTarget.value)}
                />
              </label>
            </Show>
            <label class="mx-field">
              <span>
                {t(
                  store.source === "linear"
                    ? "orchestra.inbox.linearKey"
                    : store.source === "discord"
                      ? "orchestra.inbox.discordToken"
                      : "orchestra.inbox.token",
                )}
              </span>
              <input
                type="password"
                required
                disabled={store.busy}
                value={store.token}
                onInput={(event) => setStore("token", event.currentTarget.value)}
              />
            </label>
            <Show when={store.source === "jira" || store.source === "gitlab"}>
              <label class="mx-field">
                <span>{t(store.source === "gitlab" ? "orchestra.inbox.gitlabSite" : "orchestra.inbox.site")}</span>
                <input
                  type="url"
                  required={store.source === "jira"}
                  disabled={store.busy}
                  value={store.site}
                  onInput={(event) => setStore("site", event.currentTarget.value)}
                />
              </label>
            </Show>
            <Show when={store.failed}>
              <p role="alert">{t("orchestra.inbox.connectFailed")}</p>
            </Show>
          </form>
          <Show
            when={
              store.status.some((item) => item.source === store.source && item.connected) &&
              (store.source === "github" ||
                store.source === "linear" ||
                store.source === "mail" ||
                store.source === "teams" ||
                store.source === "discord" ||
                store.source === "gitlab" ||
                store.source === "trello" ||
                store.source === "sentry" ||
                store.source === "pagerduty" ||
                store.source === "calendar")
                ? store.source
                : undefined
            }
            keyed
          >
            {(source) => (
              <Show when={store.connectionRevision + 1} keyed>
                {(_revision) => (
                  <WorkConnection
                    source={source}
                    api={props.api}
                    directory={props.directory}
                    synced={() => {
                      props.connected()
                      void loadAccounts()
                    }}
                  />
                )}
              </Show>
            )}
          </Show>
          <FeedConnections api={props.api} directory={props.directory} synced={props.connected} />
          <A class="inbox-text-link" href="/orchestra/integrations" onClick={() => dialog.close()}>
            {t("orchestra.inbox.botBindings")} <Icon name="arrow-right" size="small" />
          </A>
        </Show>
      </div>
      <footer class="mx-dialog-foot">
        <button type="button" class="mx-btn" onClick={() => dialog.close()}>
          {t("orchestra.inbox.close")}
        </button>
        <Show when={!props.preview}>
          <button
            type="submit"
            form="inbox-connect"
            class="mx-btn primary"
            disabled={store.busy || !store.token.trim()}
          >
            {t("orchestra.inbox.connect")}
          </button>
        </Show>
      </footer>
    </DialogV2>
  )
}
