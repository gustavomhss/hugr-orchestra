import { createMemo, createSignal, For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { columns, progress, type Issue, type Snapshot } from "../model"
import { byEpic, byStage, filtered, seats, tally, type Filter, type Grouping } from "../plan"
import { Rows } from "./rows"
import { Ring, Seat, done, stageKey, walk } from "./shared"

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
