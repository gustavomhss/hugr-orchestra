import { createMemo, createSignal, For, Match, Show, Switch } from "solid-js"
import { useLanguage } from "@/context/language"
import { steps, type Snapshot } from "../model"
import { bars, frame, range, scopeLog, utcDate } from "../plan"
import { Chevron, Ring, done, localDate, localRange, narrow, outlook, stageKey } from "./shared"

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
                              <span class="board-timeline-issue-title" title={issue.title}>{issue.title}</span>
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
export function Burnup(props: {
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
