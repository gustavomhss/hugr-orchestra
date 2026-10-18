import { createEffect, on, onCleanup, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import type { Bookmark, Download } from "./apps-panel-controller"

// Bookmarks, history and downloads float over the page area, where the native browser paints above HTML,
// so the popover registers as an overlay that hides the browser while it is open.
export function LibraryPopover(props: {
  kind: "bookmarks" | "history" | "downloads"
  entries: Bookmark[]
  downloads: Download[]
  register: (element: Element) => () => void
  onOpen: (entry: Bookmark) => void
  onOpenDownload: (id: string) => void
  onCancelDownload: (id: string) => void
}) {
  const t = useLanguage().t
  const title = () => t(`appDock.browser.${props.kind}`)
  // Opened from a toolbar button: focus moves into the dialog, and back to that button when it closes.
  const invoker = document.activeElement
  let popover: HTMLDivElement | undefined
  createEffect(
    on(
      () => props.kind,
      () => requestAnimationFrame(() => (popover?.querySelector("button") ?? popover)?.focus({ preventScroll: true })),
    ),
  )
  onCleanup(() =>
    requestAnimationFrame(() => {
      const focused = document.activeElement
      if (invoker instanceof HTMLElement && (!focused || focused === document.body)) invoker.focus()
    }),
  )
  return (
    <div
      ref={(element) => {
        popover = element
        onCleanup(props.register(element))
      }}
      class="zen-library"
      role="dialog"
      aria-modal="true"
      aria-label={title()}
      tabindex="-1"
      onKeyDown={(event) => {
        if (event.key !== "Tab") return
        // Modal: Tab cycles inside the dialog instead of reaching the page behind it.
        const items = [...event.currentTarget.querySelectorAll("button")]
        const current = items.findIndex((item) => item === document.activeElement)
        if (current >= 0 && current !== (event.shiftKey ? 0 : items.length - 1)) return
        event.preventDefault()
        items[event.shiftKey ? items.length - 1 : 0]?.focus()
      }}
    >
      <div class="zen-library-title">{title()}</div>
      <Show
        when={props.kind === "downloads"}
        fallback={
          <>
            {props.entries.map((entry) => (
              <button type="button" onClick={() => props.onOpen(entry)}>
                <span>{entry.title}</span>
                <small>{new URL(entry.url).hostname}</small>
              </button>
            ))}
            {props.entries.length === 0 && <p>{t("appDock.browser.library.empty")}</p>}
          </>
        }
      >
        {props.downloads.map((download) => (
          <div class="zen-download">
            <span>{download.filename}</span>
            <small>
              {download.state === "progressing" && download.totalBytes > 0
                ? `${Math.round((download.receivedBytes / download.totalBytes) * 100)}%`
                : t(`appDock.browser.download.${download.state}`)}
            </small>
            {download.state === "completed" ? (
              <button class="zen-open-button" type="button" onClick={() => props.onOpenDownload(download.id)}>
                {t("common.open")}
              </button>
            ) : download.state === "progressing" || download.state === "paused" ? (
              <button class="zen-open-button" type="button" onClick={() => props.onCancelDownload(download.id)}>
                {t("common.cancel")}
              </button>
            ) : null}
          </div>
        ))}
        {props.downloads.length === 0 && <p>{t("appDock.browser.library.noDownloads")}</p>}
      </Show>
    </div>
  )
}

// The find bar floats where the page area starts; the Dock moves the native view below it while it is open.
export function FindBar(props: {
  text: string
  result?: { activeMatchOrdinal: number; matches: number }
  onInput: (text: string) => void
  onFind: (forward: boolean) => void
  onClose: () => void
}) {
  const t = useLanguage().t
  return (
    <form
      class="zen-findbar"
      onSubmit={(event) => {
        event.preventDefault()
        props.onFind(true)
      }}
    >
      <input
        autofocus
        value={props.text}
        onInput={(event) => props.onInput(event.currentTarget.value)}
        aria-label={t("appDock.browser.find.label")}
        placeholder={t("appDock.browser.find.label")}
      />
      <span>{props.result ? `${props.result.activeMatchOrdinal}/${props.result.matches}` : ""}</span>
      <button type="button" aria-label={t("appDock.browser.find.previous")} onClick={() => props.onFind(false)}>
        &#8593;
      </button>
      <button type="submit" aria-label={t("appDock.browser.find.next")}>
        &#8595;
      </button>
      <button type="button" aria-label={t("appDock.browser.find.close")} onClick={props.onClose}>
        x
      </button>
    </form>
  )
}
