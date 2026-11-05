import { render } from "solid-js/web"
import { createStore } from "solid-js/store"
import { LanguageProvider } from "@/context/language"
import { PlatformProvider } from "@/context/platform"
import { BoardWriteStatus } from "@/orchestra/chapters/board/write-status"
import "@/orchestra/theme.css"
import "@/orchestra/chapters/kit.css"
import "@/orchestra/chapters/board/board.css"

/** Real operation notice and Board overlay styles, with external state only. No application or backend replacement. */
export function mount(root: HTMLElement, full = false) {
  document.body.dataset.newLayout = "true"
  const [state, setState] = createStore({
    status: { ref: "DEMO-3 · Which provider?", message: "The answer was refused. Try again." } as
      | { ref: string; message: string }
      | undefined,
  })
  root.dataset.scrim = "untouched"
  return render(
    () => (
      <PlatformProvider value={{ platform: "web", openExternal() {}, async restart() {}, async notify() {} }}>
        <LanguageProvider locale="en">
          <div class="board-root mx-page" style={{ "min-height": full ? "240vh" : "100vh", width: "100%" }}>
            <BoardWriteStatus status={state.status} onDismiss={() => setState("status", undefined)} />
            {!full && (
              <div
                class="board-scrim"
                aria-hidden="true"
                onClick={() => {
                  root.dataset.scrim = "clicked"
                }}
              />
            )}
            <section class={full ? "board-full" : "board-peek"} role={full ? "region" : "dialog"} aria-label="DEMO-3">
              <h2>DEMO-3</h2>
              <label>
                Unsent issue note
                <textarea />
              </label>
            </section>
          </div>
        </LanguageProvider>
      </PlatformProvider>
    ),
    root,
  )
}
