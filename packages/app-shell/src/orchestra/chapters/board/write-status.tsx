import { Show } from "solid-js"
import { Portal } from "solid-js/web"
import { useLanguage } from "@/context/language"
import "./write-status.css"

export function BoardWriteStatus(props: { status?: { ref: string; message: string }; onDismiss: () => void }) {
  const language = useLanguage()
  // Board's container establishes a fixed-position containing block. Portal out so scrolling cannot hide the notice.
  return (
    <Show when={props.status}>
      {(status) => (
        <Portal>
          <div class="mx-error board-write-status" role="alert">
            <span>
              <b>{status().ref}</b>: {status().message}
            </span>
            <button
              type="button"
              class="mx-link"
              aria-label={language.t("orchestra.board.write.dismiss")}
              onClick={props.onDismiss}
            >
              ×
            </button>
          </div>
        </Portal>
      )}
    </Show>
  )
}
