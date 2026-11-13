import { createMemo, createSignal, For, Match, Show, Switch } from "solid-js"
import { useLanguage } from "@/context/language"
import { MxBadge } from "../../kit"
import { progress, type Snapshot } from "../model"
import { byStage, range, shipLine, waits, type Forecast } from "../plan"
import { Rows } from "./rows"
import { Ring, done, localDate, narrow, outlook, stageKey, walk } from "./shared"
import { Burnup, Timeline } from "./timeline"

type Epic = Snapshot["epics"][number]

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
