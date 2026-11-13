import { For } from "solid-js"
import { useLanguage } from "@/context/language"
import type { View } from "../plan"

const viewKey = {
  board: "orchestra.board.view.board",
  timeline: "orchestra.board.view.timeline",
  list: "orchestra.board.view.list",
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
