import { createMemo, createSignal, For, Match, Show, Switch } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { MxBadge } from "../kit"
import { columns, monogram, progress, steps, type Issue, type Snapshot } from "./model"
import {
  archivable,
  bars,
  byEpic,
  byStage,
  day,
  filtered,
  frame,
  needsYou,
  range,
  scopeLog,
  seats,
  segment,
  shipLine,
  tally,
  utcDate,
  waits,
  type Filter,
  type Forecast,
  type Grouping,
  type Segment,
  type Summary,
  type View,
} from "./plan"
import "./views.css"

// The board's other views (CONTRACT.md §7, slice E2): the projects overview, the list, the epic page and the timeline.
// They read the same snapshot as the board; the owner still only answers, opens and archives. Spend, agents and the
// briefing prose are not in the E1 data, so they are not drawn.
type Language = ReturnType<typeof useLanguage>
type Epic = Snapshot["epics"][number]

const stageKey = {
  backlog: "orchestra.board.stage.backlog",
  ready: "orchestra.board.stage.ready",
  building: "orchestra.board.stage.building",
  review: "orchestra.board.stage.review",
  queue: "orchestra.board.stage.queue",
  shipped: "orchestra.board.stage.shipped",
  intake: "orchestra.board.stage.intake",
  cut: "orchestra.board.stage.cut",
} as const
const healthKey = {
  on_track: "orchestra.board.health.onTrack",
  at_risk: "orchestra.board.health.atRisk",
  waiting_on_owner: "orchestra.board.health.waiting",
  paused: "orchestra.board.health.paused",
} as const
const viewKey = {
  board: "orchestra.board.view.board",
  timeline: "orchestra.board.view.timeline",
  list: "orchestra.board.view.list",
} as const
const segmentKey = {
  all: "orchestra.board.overview.all",
  running: "orchestra.board.overview.runningTab",
  shipped: "orchestra.board.overview.shippedTab",
  archived: "orchestra.board.overview.archivedTab",
} as const

export function ViewSwitch(props: { view: View; onChange: (view: View) => void }) {
  const t = useLanguage().t
  return (
    <div class="board-segments" role="group" aria-label={t("orchestra.board.view.label")}>
      <For each={["board", "timeline", "list"] as const}>
        {(view) => (
          <button type="button" aria-pressed={props.view === view} onClick={() => props.onChange(view)}>
            {t(viewKey[view])}
          </button>
        )}
      </For>
    </div>
  )
}

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

// The list: every live issue in one dense table, filtered by what needs the owner, a stage or a seat, and grouped by
// epic (closest to done first) or by stage. Shipped rows fold. J and K walk the visible rows; Enter opens the peek.
export function ListView(props: {
  snapshot: Snapshot
  focused?: string
  peek?: string
  onOpen: (ref: string) => void
  onEpic: (epic: number) => void
}) {
  const language = useLanguage()
  const t = language.t
  const [which, setWhich] = createSignal<Filter>("all")
  const [grouping, setGrouping] = createSignal<Grouping>("epic")
  const [unfolded, setUnfolded] = createSignal<ReadonlySet<string>>(new Set())
  const toggle = (key: string) =>
    setUnfolded((current) => {
      const next = new Set(current)
      if (!next.delete(key)) next.add(key)
      return next
    })
  const rows = createMemo(() => filtered(props.snapshot, which()))
  const filters = createMemo(() => [
    { id: "all" as Filter, label: t("orchestra.board.list.all") },
    { id: "needs" as Filter, label: t("orchestra.board.list.needs") },
    { id: "building" as Filter, label: t("orchestra.board.stage.building") },
    { id: "review" as Filter, label: t("orchestra.board.stage.review") },
    ...seats(props.snapshot.issues).map((seat) => ({ id: `seat:${seat}` as Filter, label: seat })),
  ])
  const plan = createMemo(() => tally(props.snapshot.issues))

  return (
    <section class="board-table-view" aria-label={t("orchestra.board.view.list")}>
      <div class="board-table-bar">
        <div class="board-filters" role="group" aria-label={t("orchestra.board.list.filter")}>
          <For each={filters()}>
            {(item) => (
              <button
                type="button"
                class="board-filter"
                data-tone={item.id === "needs" ? "warm" : undefined}
                aria-pressed={which() === item.id}
                onClick={() => setWhich(item.id)}
              >
                <Show when={item.id.startsWith("seat:")}>
                  <Seat seat={item.label} />
                </Show>
                {item.label}
                <span class="board-filter-count">{filtered(props.snapshot, item.id).length}</span>
              </button>
            )}
          </For>
        </div>
        <span class="board-spacer" />
        <span class="board-count">
          {grouping() === "epic" ? t("orchestra.board.list.closest") : t("orchestra.board.list.flow")}
          {" · "}
          {t("orchestra.board.shippedOf", { shipped: plan().shipped, total: plan().total })}
        </span>
        <div class="board-segments" role="group" aria-label={t("orchestra.board.list.group")}>
          <button type="button" aria-pressed={grouping() === "epic"} onClick={() => setGrouping("epic")}>
            {t("orchestra.board.list.byEpic")}
          </button>
          <button type="button" aria-pressed={grouping() === "stage"} onClick={() => setGrouping("stage")}>
            {t("orchestra.board.list.byStage")}
          </button>
        </div>
      </div>

      <div class="board-table" onKeyDown={(event) => walk(event, props.peek, props.onOpen)}>
        <div class="board-table-head" aria-hidden="true">
          <span>{t("orchestra.board.list.columns.id")}</span>
          <span>{t("orchestra.board.list.columns.title")}</span>
          <span>{t("orchestra.board.list.columns.seat")}</span>
          <span>{t("orchestra.board.list.columns.progress")}</span>
          <span>{t("orchestra.board.list.columns.size")}</span>
          <span>{t("orchestra.board.list.columns.age")}</span>
          <span>{t("orchestra.board.list.columns.pr")}</span>
        </div>
        <Show
          when={rows().length > 0}
          fallback={<p class="board-table-empty board-quiet">{t("orchestra.board.list.empty")}</p>}
        >
          <Show
            when={grouping() === "epic"}
            fallback={
              <For each={byStage(rows())}>
                {(group) => (
                  <div class="board-table-group" data-stage={group.stage}>
                    <Show when={group.stage !== "shipped"}>
                      <div class="board-table-group-head">
                        <Ring stage={group.stage} />
                        <span class="board-table-group-name">{t(stageKey[group.stage])}</span>
                        <span class="board-count">
                          {language.plural("orchestra.board.list.issues", group.issues.length)}
                        </span>
                      </div>
                    </Show>
                    <Rows
                      snapshot={props.snapshot}
                      issues={group.issues}
                      fold={group.stage}
                      unfolded={unfolded()}
                      onToggle={toggle}
                      focused={props.focused}
                      onOpen={props.onOpen}
                    />
                  </div>
                )}
              </For>
            }
          >
            <For each={byEpic(props.snapshot, rows())}>
              {(group) => (
                <div class="board-table-group">
                  <div class="board-table-group-head">
                    <Show
                      when={group.epic}
                      fallback={<span class="board-table-group-name">{t("orchestra.board.list.noEpic")}</span>}
                    >
                      {(epic) => (
                        <>
                          <button
                            type="button"
                            class="board-table-group-name board-table-epic"
                            onClick={() => props.onEpic(epic().number)}
                          >
                            {epic().title}
                          </button>
                          <span class="board-id">{epic().ref}</span>
                        </>
                      )}
                    </Show>
                    <span class="board-count">
                      {t("orchestra.board.shippedOf", { shipped: group.shipped, total: group.total })}
                    </span>
                    <span class="board-spacer" />
                    <Show when={group.epic}>
                      {(epic) => (
                        <>
                          <StageBar issues={props.snapshot.issues.filter((issue) => issue.epic === epic().number)} />
                          <span class="board-count board-table-done">
                            {done(
                              language,
                              props.snapshot.epicForecasts.find((item) => item.epic === epic().number)?.forecast,
                            )}
                          </span>
                        </>
                      )}
                    </Show>
                  </div>
                  <Rows
                    snapshot={props.snapshot}
                    issues={group.issues}
                    fold={`epic:${group.epic?.number ?? "none"}`}
                    unfolded={unfolded()}
                    onToggle={toggle}
                    focused={props.focused}
                    onOpen={props.onOpen}
                  />
                </div>
              )}
            </For>
          </Show>
        </Show>
      </div>
    </section>
  )
}

// One epic, read top down: what it is for, where it stands, its issues by stage, and on the rail its forecast, how it
// has shipped, what it waits on and what Maestro asked about it.
export function EpicPage(props: {
  snapshot: Snapshot
  epic: Epic
  focused?: string
  peek?: string
  onOpen: (ref: string) => void
  onEpic: (epic: number) => void
}) {
  const language = useLanguage()
  const t = language.t
  const [tab, setTab] = createSignal<"issues" | "timeline">("issues")
  const [unfolded, setUnfolded] = createSignal<ReadonlySet<string>>(new Set())
  const issues = createMemo(() => props.snapshot.issues.filter((issue) => issue.epic === props.epic.number))
  const plan = createMemo(() => progress(issues()))
  const forecast = createMemo(
    () =>
      props.snapshot.epicForecasts.find((item) => item.epic === props.epic.number) ?? {
        forecast: { kind: "done" } as Forecast,
        setsDate: false,
      },
  )
  const asks = createMemo(() =>
    props.snapshot.questions.filter(
      (question) =>
        question.status === "open" &&
        (question.epic === props.epic.number || issues().some((issue) => issue.number === question.issue)),
    ),
  )
  const outside = createMemo(() => waits(props.snapshot, issues()))
  const ships = createMemo(() => shipLine(issues()))
  const begun = createMemo(() => Math.min(...issues().map((issue) => issue.stageEnteredAt), Date.now()))

  return (
    <div class="board-epic-page">
      <header class="board-head">
        <div>
          <div class="board-eyebrow">
            {props.snapshot.project.name} · {t("orchestra.board.epic.eyebrow")}
          </div>
          <div class="board-title-row">
            <h1 id="board-epic-title">{props.epic.title}</h1>
            <span class="board-id board-epic-ref">{props.epic.ref}</span>
            <Show when={props.epic.status === "shipped"}>
              <MxBadge tone="good">{t("orchestra.board.forecast.done")}</MxBadge>
            </Show>
          </div>
          <div class="board-sub">
            {t("orchestra.board.shippedOf", { shipped: plan().shipped, total: plan().total })}
            <span class="board-dot" aria-hidden="true" />
            {t("orchestra.board.forecast.range", { range: outlook(language, forecast().forecast) })}
          </div>
        </div>
        <div class="board-head-end">
          <div class="board-segments" role="group" aria-label={t("orchestra.board.epic.tabs")}>
            <button type="button" aria-pressed={tab() === "issues"} onClick={() => setTab("issues")}>
              {t("orchestra.board.epic.issues")}
            </button>
            <button type="button" aria-pressed={tab() === "timeline"} onClick={() => setTab("timeline")}>
              {t("orchestra.board.epic.timeline")}
            </button>
          </div>
        </div>
      </header>

      <Show
        when={tab() === "issues"}
        fallback={
          <Timeline snapshot={props.snapshot} epic={props.epic.number} onOpen={props.onOpen} onEpic={props.onEpic} />
        }
      >
        <div class="board-epic-body">
          <div class="board-epic-main" onKeyDown={(event) => walk(event, props.peek, props.onOpen)}>
            <section class="board-brief" aria-label={t("orchestra.board.brief")}>
              <Show when={props.epic.goal}>
                <p>{props.epic.goal}</p>
              </Show>
              <div class="board-metric">
                <span class="board-bar" aria-hidden="true">
                  <For each={plan().stages}>
                    {(item) => (
                      <Show when={item.count > 0}>
                        <i data-stage={item.stage} style={{ "flex-grow": item.count }} />
                      </Show>
                    )}
                  </For>
                </span>
                <span class="board-legend">
                  <For each={plan().stages}>
                    {(item) => (
                      <span data-stage={item.stage}>
                        <i aria-hidden="true" />
                        {t(stageKey[item.stage])} {item.count}
                      </span>
                    )}
                  </For>
                </span>
              </div>
            </section>
            <Show
              when={plan().total > 0}
              fallback={
                <div class="mx-empty">
                  <strong>{t("orchestra.board.epic.empty")}</strong>
                </div>
              }
            >
              <For each={byStage(issues())}>
                {(group) => (
                  <section class="board-epic-stage" data-stage={group.stage}>
                    <Show when={group.stage !== "shipped"}>
                      <h3 class="board-epic-stage-head">
                        <Ring stage={group.stage} />
                        {t(stageKey[group.stage])}
                        <span class="board-count">{group.issues.length}</span>
                        <span class="board-spacer" />
                        <Show when={group.stage === "ready" || group.stage === "backlog"}>
                          <span class="board-quiet">{t("orchestra.board.epic.order")}</span>
                        </Show>
                      </h3>
                    </Show>
                    <div class="board-table">
                      <Rows
                        snapshot={props.snapshot}
                        issues={group.issues}
                        fold={`epic-page:${group.stage}`}
                        unfolded={unfolded()}
                        onToggle={(key) => setUnfolded((current) => (current.has(key) ? new Set() : new Set([key])))}
                        focused={props.focused}
                        onOpen={props.onOpen}
                      />
                    </div>
                  </section>
                )}
              </For>
            </Show>
          </div>

          <aside class="board-epic-rail">
            <section class="board-rail" aria-labelledby="board-epic-forecast">
              <h3 id="board-epic-forecast">{t("orchestra.board.epic.forecast")}</h3>
              <Show
                when={narrow(forecast().forecast, "dates")}
                fallback={<p class="board-epic-figure">{outlook(language, forecast().forecast)}</p>}
              >
                {(dates) => (
                  <>
                    <p class="board-epic-figure" data-late={(dates().vsTarget?.p50 ?? 0) > 0}>
                      {range(dates().p50, dates().p85, language.intl())}
                      <Show when={dates().vsTarget}>
                        {(target) => (
                          <small>
                            {target().p50 > 0
                              ? language.plural("orchestra.board.forecast.late", target().p50)
                              : target().p50 < 0
                                ? language.plural("orchestra.board.forecast.early", -target().p50)
                                : t("orchestra.board.forecast.onTarget")}
                          </small>
                        )}
                      </Show>
                    </p>
                    <p class="board-epic-pole" data-sets={forecast().setsDate}>
                      {forecast().setsDate ? t("orchestra.board.epic.setsDate") : t("orchestra.board.epic.notPole")}
                    </p>
                    <p class="board-quiet">{t("orchestra.board.epic.includes")}</p>
                  </>
                )}
              </Show>
            </section>

            <section class="board-rail" aria-labelledby="board-epic-progress">
              <h3 id="board-epic-progress">
                {t("orchestra.board.epic.progress")}
                <span class="board-spacer" />
                <span class="board-count">
                  {t("orchestra.board.epic.since", { date: localDate(language, begun()) })}
                </span>
              </h3>
              <Switch>
                <Match when={ships().length === 0}>
                  <p class="board-quiet">{t("orchestra.board.epic.noShips")}</p>
                </Match>
                {/* One ship draws a single step; a sentence says the same thing honestly. */}
                <Match when={ships().length === 1 && issues().find((issue) => issue.stage === "shipped")}>
                  {(issue) => (
                    <p class="board-epic-ships-note">
                      {t("orchestra.board.epic.oneShip", {
                        ref: issue().ref,
                        date: localDate(language, issue().stageEnteredAt),
                      })}
                    </p>
                  )}
                </Match>
                <Match when={true}>
                  <Ships from={begun()} top={plan().total} ships={ships()} />
                  <p class="board-quiet">
                  {t("orchestra.board.epic.chart", {
                    count: ships().length,
                      date: localDate(language, ships().at(-1)?.at ?? Date.now()),
                    })}
                  </p>
                </Match>
              </Switch>
            </section>

            <section class="board-rail" aria-labelledby="board-epic-waits">
              <h3 id="board-epic-waits">
                {t("orchestra.board.epic.waits")}
                <span class="board-spacer" />
                <Show when={outside().length > 0}>
                  <span class="board-count">
                    {language.plural("orchestra.board.epic.waitsCount", outside().length)}
                  </span>
                </Show>
              </h3>
              <Show
                when={outside().length > 0}
                fallback={<p class="board-quiet">{t("orchestra.board.epic.waitsNone")}</p>}
              >
                <ul class="board-epic-list">
                  <For each={outside()}>
                    {(item) => (
                      <li>
                        <button
                          type="button"
                          class="board-epic-item"
                          onClick={() => props.onOpen(item.on?.ref ?? item.ref)}
                        >
                          <Ring stage={item.on?.stage ?? "backlog"} />
                          <span class="board-id">{item.ref}</span>
                          <span class="board-epic-item-title">{item.on?.title ?? item.ref}</span>
                          <span class="board-quiet">{t("orchestra.board.epic.waitsFor", { ref: item.for.ref })}</span>
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </section>

            <section class="board-rail" aria-labelledby="board-epic-asks">
              <h3 id="board-epic-asks">{t("orchestra.board.epic.questions")}</h3>
              <Show
                when={asks().length > 0}
                fallback={
                  <p class="board-epic-calm">
                    <Ring stage="shipped" />
                    {t("orchestra.board.epic.questionsNone")}
                  </p>
                }
              >
                <ul class="board-epic-list">
                  <For each={asks()}>
                    {(question) => {
                      const issue = () => props.snapshot.issues.find((item) => item.number === question.issue)
                      return (
                        <li>
                          <button
                            type="button"
                            class="board-epic-item board-epic-ask"
                            disabled={!issue()}
                            onClick={() => issue() && props.onOpen(issue()?.ref ?? "")}
                          >
                            <span class="board-epic-item-title">{question.text}</span>
                            <Show when={issue()}>{(item) => <span class="board-id">{item().ref}</span>}</Show>
                          </button>
                        </li>
                      )
                    }}
                  </For>
                </ul>
              </Show>
            </section>
          </aside>
        </div>
      </Show>
    </div>
  )
}

// The timeline: one bar per epic over whole ISO weeks. Shipped work runs up to today, the rest up to the median
// forecast, and the P50–P85 window fades out. Bars open into their issues. The scope line shows how the plan grew.
export function Timeline(props: {
  snapshot: Snapshot
  epic?: number
  onOpen: (ref: string) => void
  onEpic: (epic: number) => void
}) {
  const language = useLanguage()
  const t = language.t
  const now = Date.now()
  const view = createMemo(() => frame(props.snapshot, now))
  const list = createMemo(() =>
    bars(props.snapshot).filter((bar) => props.epic === undefined || bar.epic.number === props.epic),
  )
  const [open, setOpen] = createSignal<ReadonlySet<number>>(new Set(props.epic === undefined ? [] : [props.epic]))
  const toggle = (epic: number) =>
    setOpen((current) => {
      const next = new Set(current)
      if (!next.delete(epic)) next.add(epic)
      return next
    })
  const at = (value: number) => `${view().at(value)}%`
  const span = (from: number, to: number) => ({
    "inset-inline-start": at(Math.min(from, to)),
    "inline-size": `max(4px, ${Math.abs(view().at(to) - view().at(from))}%)`,
  })
  const scope = createMemo(() => props.snapshot.scope.toSorted((a, b) => a.at - b.at))
  const changes = createMemo(() => scopeLog(scope()))
  const issueCount = createMemo(() => list().reduce((sum, bar) => sum + bar.total, 0))

  return (
    <section class="board-timeline" aria-label={t("orchestra.board.timeline.label")}>
      <div class="board-legend board-timeline-legend" aria-hidden="true">
        <span data-tone="shipped">
          <i />
          {t("orchestra.board.timeline.shipped")}
        </span>
        <span data-tone="left">
          <i />
          {t("orchestra.board.timeline.left")}
        </span>
        <span data-tone="cone">
          <i />
          {t("orchestra.board.timeline.cone")}
        </span>
      </div>
      <Show
        when={list().length > 0}
        fallback={
          <div class="mx-empty">
            <strong>{t("orchestra.board.timeline.none")}</strong>
          </div>
        }
      >
        <div class="board-timeline-chart">
          <div class="board-timeline-lines" aria-hidden="true">
            <For each={view().weeks}>
              {(week) => <i class="board-timeline-rule" style={{ "inset-inline-start": at(week.at) }} />}
            </For>
            <Show when={props.snapshot.forecast.targetDate}>
              {(target) => (
                <i class="board-timeline-target" style={{ "inset-inline-start": at(target()) }}>
                  <span>{t("orchestra.board.timeline.target", { date: localDate(language, target()) })}</span>
                </i>
              )}
            </Show>
            <i class="board-timeline-today" style={{ "inset-inline-start": at(now) }}>
              <span>{t("orchestra.board.timeline.today")}</span>
            </i>
          </div>
          <div class="board-timeline-row board-timeline-axis">
            <span class="board-timeline-label board-count">
              {language.plural("orchestra.board.timeline.epics", list().length)}
              {" · "}
              {language.plural("orchestra.board.timeline.issues", issueCount())}
            </span>
            <div class="board-timeline-track">
              <For each={view().weeks}>
                {(week) => (
                  <span class="board-timeline-week" style={{ "inset-inline-start": at(week.at) }}>
                    <b>{utcDate(week.at, language.intl())}</b>
                    {t("orchestra.board.timeline.week", { week: week.week })}
                  </span>
                )}
              </For>
            </div>
          </div>
          <For each={list()}>
            {(bar) => {
              const shippedIssues = () => bar.issues.filter((issue) => issue.stage === "shipped")
              return (
                <>
                  <div class="board-timeline-row board-timeline-epic" data-open={open().has(bar.epic.number)}>
                    <div class="board-timeline-label">
                      <button
                        type="button"
                        class="board-icon-button board-timeline-toggle"
                        aria-expanded={open().has(bar.epic.number)}
                        aria-label={t(
                          open().has(bar.epic.number)
                            ? "orchestra.board.timeline.collapse"
                            : "orchestra.board.timeline.expand",
                          {
                            title: bar.epic.title,
                          },
                        )}
                        onClick={() => toggle(bar.epic.number)}
                      >
                        <Chevron />
                      </button>
                      <span class="board-timeline-name">
                        <button
                          type="button"
                          class="board-timeline-epic-name"
                          onClick={() => props.onEpic(bar.epic.number)}
                        >
                          {bar.epic.title}
                        </button>
                        <span class="board-quiet">
                          <span class="board-id">{bar.epic.ref}</span>
                          {" · "}
                          {t("orchestra.board.timeline.of", { shipped: bar.shipped, total: bar.total })}
                        </span>
                      </span>
                    </div>
                    <div class="board-timeline-track">
                      <Switch>
                        <Match when={narrow(bar.forecast, "dates")}>
                          {(dates) => (
                            <>
                              <Show when={bar.shipped > 0}>
                                <i class="board-timeline-bar" data-tone="shipped" style={span(bar.start, now)}>
                                  <span>
                                    {t("orchestra.board.timeline.of", { shipped: bar.shipped, total: bar.total })}
                                  </span>
                                </i>
                              </Show>
                              <i
                                class="board-timeline-bar"
                                data-tone="left"
                                style={span(bar.shipped > 0 ? now : bar.start, dates().p50)}
                              />
                              <i class="board-timeline-bar" data-tone="cone" style={span(dates().p50, dates().p85)} />
                              <span class="board-timeline-tag" style={{ "inset-inline-start": at(dates().p85) }}>
                                {range(dates().p50, dates().p85, language.intl())}
                                <Show when={bar.setsDate && props.epic === undefined}>
                                  <em>{t("orchestra.board.timeline.setsDate")}</em>
                                </Show>
                              </span>
                            </>
                          )}
                        </Match>
                        <Match when={bar.forecast.kind === "done"}>
                          <i
                            class="board-timeline-bar"
                            data-tone="shipped"
                            style={span(bar.start, bar.last ?? bar.start)}
                          >
                            <span>{t("orchestra.board.timeline.of", { shipped: bar.shipped, total: bar.total })}</span>
                          </i>
                          <span class="board-timeline-tag" style={{ "inset-inline-start": at(bar.last ?? bar.start) }}>
                            {t("orchestra.board.forecast.done")}
                          </span>
                        </Match>
                        <Match when={true}>
                          <Show when={bar.shipped > 0}>
                            <i class="board-timeline-bar" data-tone="shipped" style={span(bar.start, now)}>
                              <span>
                                {t("orchestra.board.timeline.of", { shipped: bar.shipped, total: bar.total })}
                              </span>
                            </i>
                          </Show>
                          <span class="board-timeline-tag" data-tone="quiet" style={{ "inset-inline-start": at(now) }}>
                            {outlook(language, bar.forecast)}
                          </span>
                        </Match>
                      </Switch>
                    </div>
                  </div>
                  <Show when={open().has(bar.epic.number)}>
                    <Show when={shippedIssues().length > 0}>
                      <div class="board-timeline-row board-timeline-issue">
                        <span class="board-timeline-label board-timeline-sub">
                          <Ring stage="shipped" />
                          {t("orchestra.board.timeline.shippedRun", {
                            count: shippedIssues().length,
                            range: localRange(language, bar.start, bar.last ?? bar.start),
                          })}
                        </span>
                        <div class="board-timeline-track">
                          <i
                            class="board-timeline-bar"
                            data-tone="shipped"
                            data-size="thin"
                            style={span(bar.start, bar.last ?? bar.start)}
                          />
                        </div>
                      </div>
                    </Show>
                    <For each={bar.issues.filter((issue) => issue.stage !== "shipped")}>
                      {(issue) => {
                        const work = () => steps(issue)
                        const active = () => issue.stage === "building" || issue.stage === "review"
                        return (
                          <div class="board-timeline-row board-timeline-issue" data-stage={issue.stage}>
                            <button
                              type="button"
                              class="board-timeline-label board-timeline-sub"
                              onClick={() => props.onOpen(issue.ref)}
                            >
                              <Ring stage={issue.stage} />
                              <span class="board-id">{issue.ref}</span>
                              <span class="board-timeline-issue-title">{issue.title}</span>
                            </button>
                            <div class="board-timeline-track">
                              <Show when={active()}>
                                <i
                                  class="board-timeline-bar"
                                  data-tone="active"
                                  data-size="thin"
                                  style={span(issue.stageEnteredAt, now)}
                                />
                              </Show>
                              <span
                                class="board-timeline-tag"
                                data-tone="quiet"
                                style={{ "inset-inline-start": at(now) }}
                              >
                                {active() && work().total > 0
                                  ? t("orchestra.board.stage.of", { current: work().done, total: work().total })
                                  : t(stageKey[issue.stage])}
                              </span>
                            </div>
                          </div>
                        )
                      }}
                    </For>
                  </Show>
                </>
              )
            }}
          </For>
        </div>
      </Show>

      <Show when={props.epic === undefined}>
        <section class="board-rail board-timeline-scope" aria-labelledby="board-timeline-scope">
          <h3 id="board-timeline-scope">
            {t("orchestra.board.timeline.scope")}
            <span class="board-spacer" />
            <Show when={scope().at(-1)}>
              {(last) => (
                <span class="board-count">
                  {t("orchestra.board.timeline.scopeNow", { shipped: last().shipped, scope: last().scope })}
                </span>
              )}
            </Show>
          </h3>
          <Show
            when={scope().length > 0}
            fallback={<p class="board-quiet">{t("orchestra.board.timeline.scopeNone")}</p>}
          >
            <Burnup
              from={view().start}
              to={view().end}
              now={now}
              top={Math.max(...scope().map((point) => point.scope))}
              lines={[
                { tone: "scope", points: scope().map((point) => ({ at: point.at, value: point.scope })) },
                { tone: "shipped", points: scope().map((point) => ({ at: point.at, value: point.shipped })) },
              ]}
            />
            <Show when={changes().length > 0}>
              <ul class="board-scope-log">
                <For each={changes()}>
                  {(change) => (
                    <li>
                      <span class="board-count">{localDate(language, change.at)}</span>
                      <b data-grew={change.delta > 0}>
                        {change.delta >= 0
                          ? t("orchestra.board.timeline.grew", { count: change.delta })
                          : t("orchestra.board.timeline.shrank", { count: -change.delta })}
                      </b>
                      <span>{change.reason}</span>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </Show>
        </section>
      </Show>
    </section>
  )
}

// Step lines over a time span: the plan's scope and what has shipped, each held flat until the next change and carried
// to `now`. The shipped line also fills beneath itself.
function Burnup(props: {
  from: number
  to: number
  now?: number
  top: number
  lines: { tone: "scope" | "shipped"; points: { at: number; value: number }[] }[]
}) {
  const x = (at: number) =>
    ((Math.min(props.to, Math.max(props.from, at)) - props.from) / Math.max(1, props.to - props.from)) * 100
  const y = (value: number) => 38 - (value / Math.max(1, props.top)) * 34
  const path = (points: { at: number; value: number }[]) => {
    const end = props.now ?? props.to
    return [...points, { at: end, value: points.at(-1)?.value ?? 0 }]
      .flatMap((point, index, all) => [
        ...(index > 0 ? [`${x(point.at)},${y(all[index - 1].value)}`] : []),
        `${x(point.at)},${y(point.value)}`,
      ])
      .join(" ")
  }
  return (
    <svg class="board-burnup" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      <line class="board-burnup-base" x1="0" x2="100" y1="38" y2="38" />
      <For each={props.lines}>
        {(line) => (
          <>
            <Show when={line.tone === "shipped"}>
              <polygon
                class="board-burnup-fill"
                points={`${x(line.points[0]?.at ?? props.from)},38 ${path(line.points)} ${x(props.now ?? props.to)},38`}
              />
            </Show>
            <polyline
              class="board-burnup-line"
              data-tone={line.tone}
              points={path(line.points)}
              vector-effect="non-scaling-stroke"
            />
          </>
        )}
      </For>
    </svg>
  )
}

// The epic's ships as a stepped line with a dot per ship, from the first stage entry to today, with labelled ends.
function Ships(props: { from: number; top: number; ships: readonly { at: number; count: number }[] }) {
  const language = useLanguage()
  const t = language.t
  const now = Date.now()
  const x = (at: number) => ((at - props.from) / Math.max(1, now - props.from)) * 100
  const y = (count: number) => ((38 - (count / Math.max(1, props.top)) * 34) / 40) * 100
  return (
    <div class="board-ships">
      <span class="board-ships-top">{props.top}</span>
      <div class="board-ships-plot">
        <Burnup
          from={props.from}
          to={now}
          top={props.top}
          lines={[{ tone: "shipped", points: props.ships.map((point) => ({ at: point.at, value: point.count })) }]}
        />
        <For each={props.ships}>
          {(point) => (
            <i
              class="board-ships-dot"
              style={{ "inset-inline-start": `${x(point.at)}%`, "inset-block-start": `${y(point.count)}%` }}
            />
          )}
        </For>
      </div>
      <span class="board-ships-axis">
        <span>{localDate(language, props.from)}</span>
        <span>{t("orchestra.board.timeline.today")}</span>
      </span>
    </div>
  )
}

// Issue rows shared by the list and the epic page. Open rows show; shipped rows fold behind one count.
function Rows(props: {
  snapshot: Snapshot
  issues: readonly Issue[]
  fold: string
  unfolded: ReadonlySet<string>
  onToggle: (key: string) => void
  focused?: string
  onOpen: (ref: string) => void
}) {
  const language = useLanguage()
  const rest = () => props.issues.filter((issue) => issue.stage !== "shipped")
  const shipped = () => props.issues.filter((issue) => issue.stage === "shipped")
  const row = (issue: Issue) => (
    <IssueRow snapshot={props.snapshot} issue={issue} focused={props.focused} onOpen={props.onOpen} />
  )
  return (
    <>
      <For each={rest()}>{row}</For>
      <Show when={shipped().length > 0}>
        <button
          type="button"
          class="board-table-fold"
          aria-expanded={props.unfolded.has(props.fold)}
          onClick={() => props.onToggle(props.fold)}
        >
          <Ring stage="shipped" />
          {language.plural("orchestra.board.list.folded", shipped().length)}
          <Chevron />
        </button>
        <Show when={props.unfolded.has(props.fold)}>
          <For each={shipped()}>{row}</For>
        </Show>
      </Show>
    </>
  )
}

function IssueRow(props: { snapshot: Snapshot; issue: Issue; focused?: string; onOpen: (ref: string) => void }) {
  const language = useLanguage()
  const t = language.t
  const work = () => steps(props.issue)
  const open = () => props.issue.stage !== "shipped"
  const after = () =>
    props.issue.dependsOn.find((ref) => props.snapshot.issues.find((item) => item.ref === ref)?.stage !== "shipped")
  const days = () => Math.max(0, Math.floor((Date.now() - props.issue.stageEnteredAt) / day))
  return (
    <button
      type="button"
      class="board-table-row"
      classList={{ "board-open": props.focused === props.issue.ref }}
      data-ref={props.issue.ref}
      data-stage={props.issue.stage}
      onClick={() => props.onOpen(props.issue.ref)}
    >
      <span class="board-table-id">
        <Ring stage={props.issue.stage} />
        <span class="board-id">{props.issue.ref}</span>
      </span>
      <span class="board-table-title">
        <span class="board-table-name">{props.issue.title}</span>
        <Switch>
          <Match when={open() && needsYou(props.snapshot, props.issue)}>
            <span class="board-table-asked">{t("orchestra.board.list.asked")}</span>
          </Match>
          <Match when={open() && work().now}>{(now) => <span class="board-table-note">{now()}</span>}</Match>
          <Match when={open() && after()}>
            {(ref) => (
              <span class="board-table-note">
                {t("orchestra.board.after")} <span class="board-mono">{ref()}</span>
              </span>
            )}
          </Match>
        </Switch>
      </span>
      <span class="board-table-seat">
        <Seat seat={props.issue.seat} />
      </span>
      <span class="board-table-progress">
        <Switch
          fallback={
            <span class="board-quiet">
              {props.issue.stage === "building" || props.issue.stage === "review"
                ? t(stageKey[props.issue.stage])
                : t("orchestra.board.list.notStarted")}
            </span>
          }
        >
          <Match when={!open()}>
            <span class="board-quiet">
              {t("orchestra.board.list.shippedOn", { date: localDate(language, props.issue.stageEnteredAt) })}
            </span>
          </Match>
          <Match when={work().total > 0}>
            <span class="board-track" aria-hidden="true">
              <For each={props.issue.steps}>
                {(item) => <i data-state={item.status === "skipped" ? "done" : item.status} />}
              </For>
            </span>
            <span class="board-count">
              {t("orchestra.board.stage.of", { current: work().done, total: work().total })}
            </span>
          </Match>
        </Switch>
      </span>
      <span class="board-table-size">
        <Show when={props.issue.estimate}>
          {(size) => (
            <span class="board-size" title={t("orchestra.board.estimate", { size: size().toUpperCase() })}>
              {size().toUpperCase()}
            </span>
          )}
        </Show>
      </span>
      <span class="board-count">
        {days() === 0 ? t("orchestra.board.list.today") : language.plural("orchestra.board.list.age", days())}
      </span>
      <span class="board-count board-mono">{props.issue.prNumber ? `#${props.issue.prNumber}` : ""}</span>
    </button>
  )
}

function StageBar(props: { issues: readonly Issue[] }) {
  return (
    <span class="board-bar board-table-bar-mini" aria-hidden="true">
      <For each={progress(props.issues).stages}>
        {(item) => (
          <Show when={item.count > 0}>
            <i data-stage={item.stage} style={{ "flex-grow": item.count }} />
          </Show>
        )}
      </For>
    </span>
  )
}

function Ring(props: { stage: string }) {
  return (
    <svg class="board-ring" data-stage={props.stage} viewBox="0 0 14 14" aria-hidden="true">
      <circle class="board-ring-track" cx="7" cy="7" r="5.6" />
      <Show when={props.stage === "building" || props.stage === "review"}>
        <circle
          class="board-ring-fill"
          cx="7"
          cy="7"
          r="1.8"
          stroke-dasharray={props.stage === "building" ? "5.65 11.3" : "8.5 11.3"}
          transform="rotate(-90 7 7)"
        />
      </Show>
      <Show when={props.stage === "shipped"}>
        <path class="board-ring-check" d="m4.4 7.2 1.8 1.8 3.6-3.8" />
      </Show>
    </svg>
  )
}

function Seat(props: { seat: string | null }) {
  const t = useLanguage().t
  return (
    <Show when={props.seat}>
      {(seat) => (
        <span class="board-seat" title={seat()} aria-label={t("orchestra.board.seat", { seat: seat() })}>
          {monogram(seat())}
        </span>
      )}
    </Show>
  )
}

function Chevron() {
  return (
    <svg class="board-chevron" viewBox="0 0 12 12" aria-hidden="true">
      <path d="m3 4.5 3 3 3-3" />
    </svg>
  )
}

// J and K (or the arrows) walk the rows that are on screen, in the order they read; with the peek open it follows.
function walk(
  event: KeyboardEvent & { currentTarget: HTMLElement },
  peek: string | undefined,
  onOpen: (ref: string) => void,
) {
  if (event.metaKey || event.ctrlKey || event.altKey) return
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  const delta = key === "j" || key === "ArrowDown" ? 1 : key === "k" || key === "ArrowUp" ? -1 : 0
  if (delta === 0) return
  const rows = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-ref]")]
  const index = rows.findIndex((row) => row === document.activeElement)
  const next = rows[index === -1 ? 0 : Math.min(rows.length - 1, Math.max(0, index + delta))]
  if (!next) return
  event.preventDefault()
  event.stopPropagation()
  next.focus()
  if (peek && next.dataset.ref) onOpen(next.dataset.ref)
}

function narrow<K extends Forecast["kind"]>(forecast: Forecast, kind: K) {
  return forecast.kind === kind ? (forecast as Extract<Forecast, { kind: K }>) : undefined
}

function outlook(language: Language, forecast: Forecast) {
  if (forecast.kind === "done") return language.t("orchestra.board.forecast.done")
  if (forecast.kind === "waits") return language.t("orchestra.board.forecast.waits", { on: forecast.on })
  if (forecast.kind === "insufficient")
    return language.t("orchestra.board.forecast.insufficient", { needed: forecast.needed, shipped: forecast.shipped })
  return range(forecast.p50, forecast.p85, language.intl())
}

// An epic's line in the list: "done ~Nov 3 – 5" when it has dates, the plain outlook otherwise.
function done(language: Language, forecast: Forecast | undefined) {
  if (!forecast) return ""
  if (forecast.kind === "dates")
    return language.t("orchestra.board.list.doneBy", { range: range(forecast.p50, forecast.p85, language.intl()) })
  return outlook(language, forecast)
}

// Stage entries are real instants, not UTC midnights, so they read in the owner's time zone.
function localDate(language: Language, at: number) {
  return new Intl.DateTimeFormat(language.intl(), { month: "short", day: "numeric" }).format(at)
}

function localRange(language: Language, from: number, to: number) {
  return new Intl.DateTimeFormat(language.intl(), { month: "short", day: "numeric" }).formatRange(from, to)
}

// Declared refusals arrive as the server's tagged JSON body; anything else (transport, parse) has no words to show.
function refusal(error: unknown) {
  if (typeof error !== "object" || error === null || !("_tag" in error) || !("message" in error)) return
  return typeof error.message === "string" && error.message ? error.message : undefined
}
