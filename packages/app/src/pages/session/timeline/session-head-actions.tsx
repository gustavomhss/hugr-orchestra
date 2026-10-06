import { createEffect, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useSessionLayout } from "@/pages/session/session-layout"
import { Persist, persisted } from "@/utils/persist"

// The approved conversation header's Review and Share buttons. Review shows or hides the rail
// on its Review tab; Share opens the session's existing share popover.
export function SessionHeadActions(props: {
  shareEnabled: boolean
  shareOpen: boolean
  shareRef: (el: HTMLButtonElement) => void
  onShare: () => void
}) {
  const language = useLanguage()
  const layout = useSessionLayout()
  // The approved first paint shows the rail. A global flag (Persist.global "orchestra.chat.rail") opens it
  // once per app storage; the review panel state is global too, so later choices persist in the layout.
  const [rail, setRail, , railReady] = persisted(
    Persist.global("orchestra.chat.rail"),
    createStore({ defaulted: false }),
  )
  createEffect(() => {
    if (!railReady() || rail.defaulted) return
    setRail("defaulted", true)
    layout.view().reviewPanel.open()
  })
  const toggleReview = () => {
    const panel = layout.view().reviewPanel
    if (panel.opened()) return panel.close()
    panel.open()
    layout.tabs().setActive("review")
  }
  return (
    <>
      <button
        type="button"
        data-slot="orchestra-head-action"
        data-action="session-review-toggle"
        aria-pressed={layout.view().reviewPanel.opened()}
        aria-controls="review-panel"
        onClick={toggleReview}
      >
        {language.t("orchestra.chat.review")}
      </button>
      <Show when={props.shareEnabled}>
        <button
          ref={props.shareRef}
          type="button"
          data-slot="orchestra-head-action"
          data-action="session-share"
          aria-haspopup="dialog"
          aria-expanded={props.shareOpen}
          onClick={() => props.onShare()}
        >
          {language.t("orchestra.chat.share")}
        </button>
      </Show>
    </>
  )
}
