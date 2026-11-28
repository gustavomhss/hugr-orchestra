import { Show } from "solid-js"
import { Portal } from "solid-js/web"
import { useLanguage } from "@/context/language"
import "./write-status.css"

export function BoardWriteStatus(props: { status?: { ref: string; message: string }; onDismiss: () => void }) {
  const language = useLanguage()
  let notice: HTMLDivElement | undefined
  let previous: HTMLElement | undefined
  const dismiss = () => {
    const restore = notice?.contains(document.activeElement) ? previous : undefined
    props.onDismiss()
    if (restore?.isConnected) restore.focus({ preventScroll: true })
  }
  // Board's container establishes a fixed-position containing block. Portal out so scrolling cannot hide the notice.
  return (
    <Show when={props.status}>
      {(status) => (
        <Portal>
          <div
            ref={notice}
            class="mx-error board-write-status"
            role="alert"
            onFocusIn={(event) => {
              // Announce late failures without autofocus. Remember where an intentional Tab/click came from.
              if (event.relatedTarget instanceof HTMLElement && !event.currentTarget.contains(event.relatedTarget))
                previous = event.relatedTarget
            }}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return
              event.preventDefault()
              event.stopPropagation()
              dismiss()
            }}
          >
            <span>
              <b>{status().ref}</b>: {status().message}
            </span>
            <button
              type="button"
              class="mx-link"
              aria-label={language.t("orchestra.board.write.dismiss")}
              onClick={dismiss}
            >
              ×
            </button>
          </div>
        </Portal>
      )}
    </Show>
  )
}
