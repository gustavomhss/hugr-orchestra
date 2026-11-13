import { createMemo, createSignal, For, Match, Show, Switch } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { MxBadge } from "../../kit"
import { columns } from "../model"
import { archivable, day, range, segment, utcDate, type Segment, type Summary } from "../plan"
import { done, localDate, narrow, outlook } from "./shared"

const healthKey = {
  on_track: "orchestra.board.health.onTrack",
  at_risk: "orchestra.board.health.atRisk",
  waiting_on_owner: "orchestra.board.health.waiting",
  paused: "orchestra.board.health.paused",
} as const

const segmentKey = {
  all: "orchestra.board.overview.all",
  running: "orchestra.board.overview.runningTab",
  shipped: "orchestra.board.overview.shippedTab",
  archived: "orchestra.board.overview.archivedTab",
} as const

// The projects overview: one row per project with its progress and its forecast. Archived projects are fetched only
// when the owner asks for them.
export function Overview(props: {
  projects: readonly Summary[]
  onOpen: (key: string) => void
  onChanged: () => void
}) {
  const language = useLanguage()
  const t = language.t
  const sdk = useServerSDK()
  const api = () => sdk().orchestra["server.board"]
  const [which, setWhich] = createSignal<Segment>("all")
  const [archived, setArchived] = createSignal<readonly Summary[] | "failed">()
  const [busy, setBusy] = createSignal<string>()
  const [failure, setFailure] = createSignal<string>()
  const loadArchived = () => {
    setArchived(undefined)
    return api()
      .list({ archived: true })
      .then(
        (result) => setArchived(result),
        () => setArchived("failed"),
      )
  }
  const choose = (next: Segment) => {
    setWhich(next)
    setFailure(undefined)
    if (next === "archived") void loadArchived()
  }
  const change = (key: string, action: "archive" | "unarchive") => {
    setBusy(key)
    setFailure(undefined)
    return api()
      [action]({ key })
      .then(
        () => {
          props.onChanged()
          if (which() === "archived") void loadArchived()
        },
        (error) => setFailure(refusal(error) ?? t("orchestra.board.overview.failed")),
      )
      .finally(() => setBusy(undefined))
  }
  const shown = createMemo(() => {
    if (which() !== "archived") return segment(props.projects, which())
    const list = archived()
    return typeof list === "object" ? segment(list, "archived") : []
  })
  const visible = createMemo(() => segment(props.projects, "all"))

  return (
    <div class="board-overview">
      <div class="board-overview-bar">
        <span class="board-overview-counts">
          {language.plural("orchestra.board.overview.count", visible().length)}
          <span class="board-dot" aria-hidden="true" />
          {t("orchestra.board.overview.running", { count: segment(visible(), "running").length })}
        </span>
        <span class="board-spacer" />
        <div class="board-segments" role="group" aria-label={t("orchestra.board.overview.segment")}>
          <For each={["all", "running", "shipped", "archived"] as const}>
            {(item) => (
              <button type="button" aria-pressed={which() === item} onClick={() => choose(item)}>
                {t(segmentKey[item])}
              </button>
            )}
          </For>
        </div>
      </div>
      <Show when={failure()}>
        {(text) => (
          <p class="mx-error" role="alert">
            {text()}
          </p>
        )}
      </Show>
      <Switch>
        <Match when={which() === "archived" && archived() === "failed"}>
          <div class="mx-empty">
            <strong>{t("orchestra.board.overview.archivedFailed")}</strong>
            <button type="button" class="mx-btn" onClick={() => void loadArchived()}>
              {t("orchestra.board.retry")}
            </button>
          </div>
        </Match>
        <Match when={which() === "archived" && archived() === undefined}>
          <p class="board-quiet board-loading">{t("orchestra.board.overview.loadingArchived")}</p>
        </Match>
        {/* With nothing live the bar stays, so archived projects remain one click away. */}
        <Match when={which() !== "archived" && visible().length === 0}>
          <div class="mx-empty">
            <strong>{t("orchestra.board.empty.title")}</strong>
            <p>{t("orchestra.board.empty.body")}</p>
          </div>
        </Match>
        <Match when={shown().length === 0}>
          <div class="mx-empty">
            <strong>
              {which() === "archived" ? t("orchestra.board.overview.noneArchived") : t("orchestra.board.overview.none")}
            </strong>
          </div>
        </Match>
        <Match when={true}>
          <div class="board-overview-rows">
            <For each={shown()}>
              {(summary) => {
                const total = () => columns.reduce((sum, stage) => sum + (summary.stages[stage] ?? 0), 0)
                const shipped = () => summary.stages.shipped ?? 0
                const status = () => summary.project.status
                return (
                  <div
                    class="board-project board-overview-row"
                    data-key={summary.project.key}
                    data-status={status()}
                    onClick={() => status() !== "archived" && props.onOpen(summary.project.key)}
                  >
                    <div class="board-overview-name">
                      <span class="board-title-row">
                        <button
                          type="button"
                          class="board-overview-title"
                          disabled={status() === "archived"}
                          aria-label={`${t("orchestra.board.overview.open")} ${summary.project.name}`}
                        >
                          {summary.project.name}
                        </button>
                        <span class="board-id">{summary.project.key}</span>
                        <Switch>
                          <Match when={status() === "shipped"}>
                            <MxBadge tone="good">{t("orchestra.board.forecast.done")}</MxBadge>
                          </Match>
                          <Match when={status() !== "archived"}>
                            <span class="board-health" data-health={summary.health}>
                              <MxBadge tone={summary.health === "on_track" ? "good" : undefined}>
                                {t(healthKey[summary.health])}
                              </MxBadge>
                            </span>
                          </Match>
                        </Switch>
                      </span>
                      <Show when={summary.project.goal}>
                        <p class="board-overview-goal">{summary.project.goal}</p>
                      </Show>
                    </div>
                    <div class="board-overview-cell">
                      <span class="board-overview-figure">
                        <b>{total() ? Math.round((shipped() / total()) * 100) : 0}%</b>
                        {t("orchestra.board.project.shipped", { shipped: shipped(), total: total() })}
                      </span>
                      <span class="board-bar" aria-hidden="true">
                        <For each={columns.toReversed()}>
                          {(stage) => (
                            <Show when={(summary.stages[stage] ?? 0) > 0}>
                              <i data-stage={stage} style={{ "flex-grow": summary.stages[stage] }} />
                            </Show>
                          )}
                        </For>
                      </span>
                    </div>
                    <div class="board-overview-cell">
                      <Switch>
                        <Match when={status() === "paused"}>
                          <span class="board-quiet">{t("orchestra.board.forecast.paused")}</span>
                        </Match>
                        <Match when={narrow(summary.forecast.forecast, "dates")}>
                          {(dates) => (
                            <Window
                              p50={dates().p50}
                              p85={dates().p85}
                              late={(dates().vsTarget?.p85 ?? 0) > 0}
                              target={summary.forecast.targetDate}
                            />
                          )}
                        </Match>
                        <Match when={true}>
                          <span class="board-overview-figure">{outlook(language, summary.forecast.forecast)}</span>
                          <Show when={summary.forecast.targetDate}>
                            {(target) => (
                              <span class="board-quiet">
                                {t("orchestra.board.target", { date: localDate(language, target()) })}
                              </span>
                            )}
                          </Show>
                        </Match>
                      </Switch>
                    </div>
                    <div class="board-overview-end">
                      <Show when={summary.openQuestions > 0 && status() !== "archived"}>
                        <span class="board-chip board-overview-asks">
                          {language.plural("orchestra.board.project.questions", summary.openQuestions)}
                        </span>
                      </Show>
                      <Switch>
                        <Match when={status() === "archived"}>
                          <button
                            type="button"
                            class="mx-btn"
                            disabled={busy() === summary.project.key}
                            onClick={(event) => (
                              event.stopPropagation(),
                              void change(summary.project.key, "unarchive")
                            )}
                          >
                            {t("orchestra.board.overview.unarchive")}
                          </button>
                        </Match>
                        <Match when={archivable(status())}>
                          <button
                            type="button"
                            class="mx-btn"
                            disabled={busy() === summary.project.key}
                            onClick={(event) => (event.stopPropagation(), void change(summary.project.key, "archive"))}
                          >
                            {t("orchestra.board.overview.archive")}
                          </button>
                        </Match>
                      </Switch>
                    </div>
                  </div>
                )
              }}
            </For>
          </div>
        </Match>
      </Switch>
    </div>
  )
}

// A P50–P85 window on a short scale that also holds the target, so "late" reads at a glance.
function Window(props: { p50: number; p85: number; late: boolean; target: number | null }) {
  const language = useLanguage()
  const t = language.t
  const low = () => Math.min(props.p50, props.target ?? props.p50) - 2 * day
  const high = () => Math.max(props.p85, props.target ?? props.p85) + 2 * day
  const at = (value: number) => `${((value - low()) / (high() - low())) * 100}%`
  return (
    <>
      <span class="board-overview-figure" data-late={props.late}>
        {range(props.p50, props.p85, language.intl())}
        <Show when={props.target}>
          {(target) => (
            <span class="board-quiet">{t("orchestra.board.target", { date: localDate(language, target()) })}</span>
          )}
        </Show>
      </span>
      <span
        class="board-window"
        data-late={props.late}
        role="img"
        aria-label={t("orchestra.board.forecast.track", {
          p50: utcDate(props.p50, language.intl()),
          p85: utcDate(props.p85, language.intl()),
        })}
      >
        <i
          class="board-window-cone"
          style={{
            "inset-inline-start": at(props.p50),
            "inline-size": `calc(${at(props.p85)} - ${at(props.p50)} + 3px)`,
          }}
        />
        <Show when={props.target}>
          {(target) => <i class="board-window-target" style={{ "inset-inline-start": at(target()) }} />}
        </Show>
      </span>
    </>
  )
}

// Declared refusals arrive as the server's tagged JSON body; anything else (transport, parse) has no words to show.
function refusal(error: unknown) {
  if (typeof error !== "object" || error === null || !("_tag" in error) || !("message" in error)) return
  return typeof error.message === "string" && error.message ? error.message : undefined
}
