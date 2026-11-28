import { For } from "solid-js"
import { useLanguage } from "@/context/language"

export type IssueArea = "overview" | "conversation" | "executions" | "history"

export function IssueTabs(props: { id: string; value: IssueArea; onChange: (area: IssueArea) => void }) {
  const language = useLanguage()
  const areas = ["overview", "conversation", "executions", "history"] as const
  return (
    <div class="board-issue-tabs" role="tablist" aria-label={language.t("orchestra.board.workspace.areas")}
      onKeyDown={(event) => {
        const index = areas.indexOf(props.value)
        const next = event.key === "Home" ? 0 : event.key === "End" ? areas.length - 1
          : event.key === "ArrowRight" ? (index + 1) % areas.length
            : event.key === "ArrowLeft" ? (index + areas.length - 1) % areas.length : undefined
        if (next === undefined) return
        event.stopPropagation()
        event.preventDefault()
        props.onChange(areas[next])
        event.currentTarget.querySelector<HTMLButtonElement>(`[data-area="${areas[next]}"]`)?.focus()
      }}>
      <For each={areas}>{(area) => (
        <button type="button" role="tab" id={`${props.id}-tab-${area}`} data-area={area}
          aria-controls={`${props.id}-panel-${area}`} aria-selected={props.value === area}
          tabIndex={props.value === area ? 0 : -1} onClick={() => props.onChange(area)}>
          {language.t(`orchestra.board.workspace.${area}`)}
        </button>
      )}</For>
    </div>
  )
}
