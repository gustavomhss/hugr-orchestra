import { For, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import type { ServerSDK } from "@/context/server-sdk"
import { createWorkSource, type WorkState, type WorkSource } from "./work-source"

export function WorkConnection(props: {
  source: WorkSource
  api: ServerSDK["orchestra"]["server.inbox"]
  directory: string
  synced: () => void
}) {
  const language = useLanguage()
  const [store, setStore] = createStore<WorkState>({ repositories: "", busy: false, failed: false, dirty: false })
  const model = createWorkSource({
    api: props.api,
    directory: props.directory,
    source: props.source,
    change: (value) => setStore(value),
    synced: props.synced,
  })
  onMount(() => void model.load())
  onCleanup(() => model.dispose())
  return (
    <section class="inbox-work-source">
      <h3>{language.t(`orchestra.inbox.source.${props.source}`)}</h3>
      <p>
        {language.t(
          props.source === "github"
            ? "orchestra.inbox.githubCollection"
            : props.source === "calendar"
              ? "orchestra.inbox.calendarCollection"
              : props.source === "trello"
                ? "orchestra.inbox.trelloCollection"
                : props.source === "sentry"
                  ? "orchestra.inbox.sentryCollection"
                  : props.source === "pagerduty"
                    ? "orchestra.inbox.pagerdutyCollection"
                    : props.source === "gitlab"
                      ? "orchestra.inbox.gitlabCollection"
                      : props.source === "linear"
                        ? "orchestra.inbox.linearCollection"
                        : props.source === "mail"
                          ? "orchestra.inbox.mailCollection"
                          : props.source === "teams"
                            ? "orchestra.inbox.teamsCollection"
                            : "orchestra.inbox.discordCollection",
        )}
      </p>
      <Show when={store.failed}>
        <p role="alert">{language.t("orchestra.inbox.workFailed")}</p>
      </Show>
      <Show when={store.preferences}>
        <label class="mx-field">
          <span>{language.t("orchestra.inbox.githubRepositories")}</span>
          <textarea
            rows={3}
            disabled={store.busy}
            value={store.repositories}
            onInput={(event) => model.repositories(event.currentTarget.value)}
          />
        </label>
        <p>{language.t("orchestra.inbox.githubRepositoriesHelp")}</p>
        <fieldset disabled={store.busy}>
          <legend>{language.t("orchestra.inbox.githubClasses")}</legend>
          <For each={["reviews", "mentions", "assignments", "ownCi"] as const}>
            {(key) => (
              <label>
                <input
                  type="checkbox"
                  checked={store.preferences?.[key]}
                  onChange={(event) => model.toggle(key, event.currentTarget.checked)}
                />
                {language.t(`orchestra.inbox.githubClass.${key}`)}
              </label>
            )}
          </For>
        </fieldset>
        <button type="button" class="mx-btn" disabled={store.busy || !store.dirty} onClick={() => void model.save()}>
          {language.t("orchestra.inbox.workSave")}
        </button>
      </Show>
      <Show when={store.communication}>
        <button type="button" class="mx-btn" disabled={store.busy} onClick={() => void model.discover()}>
          {language.t("orchestra.inbox.communicationDiscover")}
        </button>
        <fieldset disabled={store.busy} class="inbox-slack-scope">
          <legend>{language.t("orchestra.inbox.communicationSelection")}</legend>
          <For each={store.communication?.selected.filter((id) => !store.choices?.some((choice) => choice.id === id))}>
            {(id) => (
              <label>
                <input type="checkbox" checked onChange={(event) => model.select(id, event.currentTarget.checked)} />
                {id}
              </label>
            )}
          </For>
          <For each={store.choices}>
            {(choice) => (
              <label>
                <input
                  type="checkbox"
                  checked={store.communication?.selected.includes(choice.id)}
                  onChange={(event) => model.select(choice.id, event.currentTarget.checked)}
                />
                {choice.name}
              </label>
            )}
          </For>
          <Show when={store.communication?.selected.length === 0}>
            <p>{language.t("orchestra.inbox.communicationEmpty")}</p>
          </Show>
        </fieldset>
        <Show when={props.source === "mail"}>
          <label>
            <input
              type="checkbox"
              disabled={store.busy}
              checked={store.communication?.unreadOnly}
              onChange={(event) => model.unread(event.currentTarget.checked)}
            />
            {language.t("orchestra.inbox.communicationUnread")}
          </label>
        </Show>
        <button type="button" class="mx-btn" disabled={store.busy || !store.dirty} onClick={() => void model.save()}>
          {language.t("orchestra.inbox.workSave")}
        </button>
      </Show>
      <Show when={store.gitlab}>
        <label class="mx-field">
          <span>{language.t("orchestra.inbox.gitlabProjects")}</span>
          <textarea
            rows={3}
            disabled={store.busy}
            value={store.repositories}
            onInput={(event) => model.repositories(event.currentTarget.value)}
          />
        </label>
        <p>{language.t("orchestra.inbox.gitlabProjectsHelp")}</p>
        <button type="button" class="mx-btn" disabled={store.busy || !store.dirty} onClick={() => void model.save()}>
          {language.t("orchestra.inbox.workSave")}
        </button>
      </Show>
      <Show when={store.calendar}>
        {(configuration) => (
          <>
            <button type="button" class="mx-btn" disabled={store.busy} onClick={() => void model.discoverCalendars()}>
              {language.t("orchestra.inbox.calendarDiscover")}
            </button>
            <fieldset class="inbox-scope-options" disabled={store.busy}>
              <legend>{language.t("orchestra.inbox.calendarSelected")}</legend>
              <For
                each={[
                  ...new Set([...configuration().selected, ...(store.calendars?.map((calendar) => calendar.id) ?? [])]),
                ]}
              >
                {(id) => (
                  <label>
                    <input
                      type="checkbox"
                      checked={configuration().selected.includes(id)}
                      onChange={(event) => model.selectCalendar(id, event.currentTarget.checked)}
                    />
                    <span>{store.calendars?.find((calendar) => calendar.id === id)?.name ?? id}</span>
                  </label>
                )}
              </For>
            </fieldset>
            <button
              type="button"
              class="mx-btn"
              disabled={store.busy || !store.dirty}
              onClick={() => void model.save()}
            >
              {language.t("orchestra.inbox.workSave")}
            </button>
          </>
        )}
      </Show>
      <Show when={store.notification}>
        <Show when={props.source === "sentry"}>
          <label class="mx-field">
            <span>{language.t("orchestra.inbox.sentryOrganization")}</span>
            <input
              disabled={store.busy}
              value={store.notification?.organization ?? ""}
              onInput={(event) => model.sentry("organization", event.currentTarget.value)}
            />
          </label>
          <label class="mx-field">
            <span>{language.t("orchestra.inbox.sentryEnvironment")}</span>
            <input
              disabled={store.busy}
              value={store.notification?.environment ?? ""}
              onInput={(event) => model.sentry("environment", event.currentTarget.value)}
            />
          </label>
          <label class="mx-field">
            <span>{language.t("orchestra.inbox.sentryRelevance")}</span>
            <select
              disabled={store.busy}
              value={store.notification?.relevance ?? "review"}
              onChange={(event) => model.relevance(event.currentTarget.value === "assigned" ? "assigned" : "review")}
            >
              <option value="review">{language.t("orchestra.inbox.sentryReview")}</option>
              <option value="assigned">{language.t("orchestra.inbox.sentryAssigned")}</option>
            </select>
          </label>
        </Show>
        <label class="mx-field">
          <span>
            {language.t(
              props.source === "sentry"
                ? "orchestra.inbox.sentryProjects"
                : props.source === "trello"
                  ? "orchestra.inbox.trelloBoards"
                  : "orchestra.inbox.pagerdutyServices",
            )}
          </span>
          <textarea
            rows={3}
            disabled={store.busy}
            value={store.repositories}
            onInput={(event) => model.repositories(event.currentTarget.value)}
          />
        </label>
        <p>
          {language.t(
            props.source === "pagerduty"
              ? "orchestra.inbox.pagerdutyServicesHelp"
              : "orchestra.inbox.notificationScopeHelp",
          )}
        </p>
        <button type="button" class="mx-btn" disabled={store.busy || !store.dirty} onClick={() => void model.save()}>
          {language.t("orchestra.inbox.workSave")}
        </button>
      </Show>
      <div class="inbox-work-actions">
        <button
          type="button"
          class="mx-btn"
          disabled={store.busy || store.dirty || !store.account?.connected}
          onClick={() => void model.sync()}
        >
          {language.t("orchestra.inbox.workSync")}
        </button>
        <button type="button" class="mx-btn" disabled={store.busy} onClick={() => void model.load()}>
          {language.t("orchestra.inbox.workReload")}
        </button>
        <button
          type="button"
          class="mx-btn"
          disabled={store.busy || !store.account?.connected}
          onClick={() => void model.disconnect()}
        >
          {language.t("orchestra.inbox.workDisconnect")}
        </button>
      </div>
      <Show when={store.account?.state}>
        {(state) => <p role="status">{language.t(`orchestra.inbox.workState.${state()}`)}</p>}
      </Show>
      <Show when={store.account?.retryAt}>
        {(at) => (
          <p role="status">
            {language.t("orchestra.inbox.slackRetryAt", { time: new Date(at()).toLocaleTimeString() })}
          </p>
        )}
      </Show>
    </section>
  )
}
