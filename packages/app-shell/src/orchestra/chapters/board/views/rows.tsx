import { For, Match, Show, Switch } from "solid-js"
import { useLanguage } from "@/context/language"
import { progress, steps, type Issue, type Snapshot } from "../model"
import { day, needsYou } from "../plan"
import { Chevron, Ring, Seat, done, localDate, stageKey } from "./shared"

// Issue rows shared by the list and the epic page. Open rows show; shipped rows fold behind one count.
export function Rows(props: {
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
        <span class="board-table-name" title={props.issue.title}>{props.issue.title}</span>
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
