import { For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { actionKey, actorKey, stageKey } from "./keys"
import { canUndo, type Issue, type Page } from "./model"

function activitySeat(writer: unknown) {
  return writer && typeof writer === "object" && "seat" in writer && typeof writer.seat === "string"
    ? writer.seat : undefined
}

export function IssueHistory(props: {
  issueID: string
  activity: Page["activity"]
  busy: boolean
  active: boolean
  onUndo: (id: string) => void
  time: (ms: number) => string
}) {
  const t = useLanguage().t
  const activity = () => props.activity.toReversed()
  const stageLabel = (value: unknown) => typeof value === "string" && Object.hasOwn(stageKey, value)
    ? t(stageKey[value as Issue["stage"]]) : t("orchestra.board.workspace.unknown")
  return (
    <section class="board-sec board-issue-panel" role="tabpanel" id={`${props.issueID}-panel-history`} aria-labelledby={`${props.issueID}-tab-history`} hidden={!props.active} tabIndex={0}>
      <h3>
        {t("orchestra.board.sec.activity")}
        <span class="board-count">{props.activity.length}</span>
      </h3>
      <Show when={activity().length > 0} fallback={<p class="board-quiet">{t("orchestra.board.activity.none")}</p>}>
        <ol class="board-activity">
          <For each={activity()}>
            {(entry) => (
              <li>
                <span>
                  <b>{entry.actor === "seat" ? activitySeat(entry.after?.writer) ?? t(actorKey.seat) : t(actorKey[entry.actor])}</b> {t(actionKey[entry.action])}
                   <Show when={entry.action === "issue.move.request"}>
                    <span class="board-why"> · {stageLabel(entry.after?.requestedStage)}</span>
                   </Show>
                   <Show when={entry.before?.stage !== entry.after?.stage && entry.before?.stage != null && entry.after?.stage != null}>
                     <span class="board-why"> · {stageLabel(entry.before?.stage)} → {stageLabel(entry.after?.stage)}</span>
                   </Show>
                  <Show when={entry.reason}>{(reason) => <span class="board-why"> · {reason()}</span>}</Show>
                </span>
                <span class="board-activity-end">
                  <Show when={entry.undoneBy !== null}>
                    <span class="board-chip">{t("orchestra.board.undone")}</span>
                  </Show>
                  <Show when={canUndo(entry)}>
                    <button type="button" class="mx-link" disabled={props.busy} onClick={() => void props.onUndo(entry.id)}>
                      {t("orchestra.board.undo")}
                    </button>
                  </Show>
                  <span class="board-quiet">{props.time(entry.timeCreated)}</span>
                </span>
              </li>
            )}
          </For>
        </ol>
      </Show>
    </section>
  )
}
