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
    expanded: false,
    closed: false,
    status: { ref: "DEMO-3 · Which provider?", message: "The answer was refused. Try again." } as
      | { ref: string; message: string }
      | undefined,
  })
  root.dataset.scrim = "untouched"
  root.dataset.escape = "untouched"
  const show = () => setState("status", { ref: "DEMO-3 · Which provider?", message: "The answer was refused. Try again." })
  root.addEventListener("fixture:failure", show)
  const dispose = render(
    () => (
      <PlatformProvider value={{ platform: "web", openExternal() {}, async restart() {}, async notify() {} }}>
        <LanguageProvider locale="en">
          {/* Model the real chapter's containing block and 38px in-flow marker above its clipped page. */}
          <div style={{ display: "flex", "flex-direction": "column", height: full ? "auto" : "100vh", contain: full ? "none" : "layout", overflow: full ? "visible" : "hidden" }}>
            <div style={{ height: "38px", "flex-shrink": 0 }}>Chapter marker</div>
            <div class="board-root mx-page" style={{ "min-height": full ? "240vh" : "0", width: "100%" }} onKeyDown={(event) => {
              if (event.key !== "Escape") return
              root.dataset.escape = "received"
              setState("closed", true)
            }}>
              <BoardWriteStatus status={state.status} onDismiss={() => setState("status", undefined)} />
              {!full && !state.expanded && !state.closed && (
                <div
                  class="board-scrim"
                  aria-hidden="true"
                  onClick={() => {
                    root.dataset.scrim = "clicked"
                  }}
                />
              )}
              {!state.closed && (
                <section class={full || state.expanded ? "board-full" : "board-peek"} role={full || state.expanded ? "region" : "dialog"} aria-label="DEMO-3">
                  {!full && !state.expanded && (
                    <div class="board-detail-top">
                      <span>DEMO-3</span><span class="board-spacer" />
                      <button type="button" class="mx-btn" onClick={() => setState("expanded", true)}>Open full page</button>
                    </div>
                  )}
                  <h2>DEMO-3</h2>
                  <label>
                    Unsent issue note
                    <textarea />
                  </label>
                </section>
              )}
            </div>
          </div>
        </LanguageProvider>
      </PlatformProvider>
    ),
    root,
  )
  return () => { root.removeEventListener("fixture:failure", show); dispose() }
}
