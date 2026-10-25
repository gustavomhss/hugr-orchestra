import { createMemo, For, Match, onMount, Show, Switch } from "solid-js"
import { useLanguage } from "@/context/language"
import { MxBadge } from "./kit"
import { type Api, createScheduleAgentsModel, type Label, type Row } from "./schedule-agents-model"

const prefix = "orchestra.schedule.agents"

// Schedules an agent made with schedule_manage, below the user's own. Create and edit stay with the owning agent,
// so each card offers pause or resume, run now and delete, and links back to the owning Session.
export function AgentSchedules(props: { api: Api; openSession: (sessionID: string) => void }) {
  const language = useLanguage()
  const model = createScheduleAgentsModel(props.api)
  const state = model.state
  onMount(() => void model.load())
  const formats = createMemo(() => {
    const locale = language.intl()
    const cache = new Map<string, Intl.DateTimeFormat>()
    return (time: number, timeZone: string) => {
      const format =
        cache.get(timeZone) ?? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone })
      cache.set(timeZone, format)
      return format.format(time)
    }
  })
  // Model labels carry dates as epoch ms; they read in the schedule's own zone, like its next slot.
  const text = (label: Label, row: Row) =>
    language.t(
      label.key,
      label.params && typeof label.params.date === "number"
        ? { ...label.params, date: formats()(label.params.date, row.timezone) }
        : label.params,
    )
  // A failed mutation resends its own idempotency key; a failed list loads again.
  const retry = () => (state.pending ? model.retry() : model.load())
  const retryButton = () => (
    <button type="button" class="mx-link" disabled={state.busy || state.status === "loading"} onClick={() => void retry()}>
      {language.t("orchestra.schedule.retry")}
    </button>
  )

  return (
    <section class="schedule-agents" aria-labelledby="orchestra-schedule-agents">
      <h3 class="mx-section" id="orchestra-schedule-agents">
        {language.t(`${prefix}.title`)}
      </h3>
      <Show when={state.failure && state.rows.length > 0 && state.failure}>
        {(failure) => (
          <p class="mx-error" role="alert">
            {language.t(`${prefix}.failure.${failure()}`)} {retryButton()}
          </p>
        )}
      </Show>
      <Show when={state.started}>
        {(started) => (
          <p class="mx-note" role="status">
            <button type="button" class="mx-link" onClick={() => props.openSession(started().sessionID)}>
              {language.t("orchestra.schedule.openSession")}
            </button>
          </p>
        )}
      </Show>
      <Switch>
        <Match when={state.status === "loading" && state.rows.length === 0}>
          <div class="mx-empty">{language.t("orchestra.schedule.loading")}</div>
        </Match>
        <Match when={state.status === "error" && state.rows.length === 0 && state.failure}>
          {(failure) => (
            <div class="mx-empty">
              {language.t(`${prefix}.failure.${failure()}`)} {retryButton()}
            </div>
          )}
        </Match>
        <Match when={state.rows.length === 0}>
          <div class="mx-empty">{language.t(`${prefix}.empty`)}</div>
        </Match>
        <Match when={true}>
          <div class="mx-grid">
            <For each={state.rows}>
              {(row) => (
                <article class="mx-card" aria-labelledby={`schedule-agent-${row.id}`} data-slot="schedule-agent">
                  <div class="mx-card-top">
                    <span class="mx-mark">
                      <svg class="schedule-ic" viewBox="0 0 16 16" aria-hidden="true">
                        <circle cx="8" cy="8" r="6" />
                        <path d="M8 4v4l3 2" />
                      </svg>
                    </span>
                    <h3 id={`schedule-agent-${row.id}`}>
                      <bdi>{row.name}</bdi>
                    </h3>
                  </div>
                  <p>{row.prompt}</p>
                  <button
                    type="button"
                    class="mx-link schedule-agent-owner"
                    onClick={() => props.openSession(row.owner.sessionID)}
                  >
                    {language.t(`${prefix}.owner`, { sessionID: row.owner.sessionID, agent: row.owner.agentID })}
                  </button>
                  <div class="mx-meta">
                    <MxBadge>{text(row.cadence, row)}</MxBadge>
                    <MxBadge
                      tone={row.status.key.endsWith(".enabled") ? "good" : row.actions.includes("resume") ? undefined : "bad"}
                    >
                      {text(row.status, row)}
                    </MxBadge>
                  </div>
                  <p>
                    <Show when={row.next}>
                      {(next) => (
                        <>
                          {language.t("orchestra.schedule.next", { date: formats()(next(), row.timezone) })}
                          <br />
                        </>
                      )}
                    </Show>
                    <small>
                      {row.timezone} · {text(row.runs, row)}
                      <Show when={row.skipped}>{(skipped) => <> · {text(skipped(), row)}</>}</Show>
                    </small>
                  </p>
                  <Show when={row.last}>
                    {(last) => (
                      <p class={last().error === undefined ? "mx-note" : "mx-note schedule-missed"}>
                        {text(last().label, row)}
                        <Show when={last().error}>{(error) => <> · {error()}</>}</Show>
                        <Show when={last().sessionID}>
                          {(sessionID) => (
                            <>
                              {" "}
                              ·{" "}
                              <button type="button" class="mx-link" onClick={() => props.openSession(sessionID())}>
                                {language.t("orchestra.schedule.openSession")}
                              </button>
                            </>
                          )}
                        </Show>
                      </p>
                    )}
                  </Show>
                  <Show
                    when={state.confirm === row.id}
                    fallback={
                      <footer class="mx-card-foot">
                        <div>
                          <For each={row.actions}>
                            {(action) => (
                              <>
                                <button
                                  type="button"
                                  class="mx-btn"
                                  disabled={state.busy}
                                  onClick={() => {
                                    if (action === "remove") return model.requestRemove(row.id)
                                    void model[action](row.id)
                                  }}
                                >
                                  {language.t(`${prefix}.action.${action}`)}
                                </button>{" "}
                              </>
                            )}
                          </For>
                        </div>
                      </footer>
                    }
                  >
                    {/* Delete confirms in place: the card stays in view while the owner's schedule goes away. */}
                    <footer class="mx-card-foot schedule-agent-confirm" role="group" aria-labelledby={`schedule-agent-confirm-${row.id}`}>
                      <p id={`schedule-agent-confirm-${row.id}`}>
                        <strong>{language.t(`${prefix}.confirm.title`)}</strong>
                        <br />
                        <small>{language.t(`${prefix}.confirm.subtitle`)}</small>
                      </p>
                      <div>
                        <button type="button" class="mx-btn" disabled={state.busy} onClick={() => model.cancelRemove()}>
                          {language.t("orchestra.schedule.cancel")}
                        </button>{" "}
                        <button
                          type="button"
                          class="mx-btn primary"
                          disabled={state.busy}
                          onClick={() => void model.confirmRemove()}
                        >
                          {language.t(`${prefix}.action.remove`)}
                        </button>
                      </div>
                    </footer>
                  </Show>
                </article>
              )}
            </For>
          </div>
        </Match>
      </Switch>
    </section>
  )
}
