import { onCleanup, Show } from "solid-js"
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
  const language = useLanguage()
  const title = () =>
    ({
      bookmarks: language.t("orchestra.dock.library.bookmarks"),
      history: language.t("orchestra.dock.library.history"),
      downloads: language.t("orchestra.dock.library.downloads"),
    })[props.kind]
  const downloadState = (state: Download["state"]) =>
    ({
      progressing: language.t("orchestra.dock.download.state.progressing"),
      paused: language.t("orchestra.dock.download.state.paused"),
      completed: language.t("orchestra.dock.download.state.completed"),
      cancelled: language.t("orchestra.dock.download.state.cancelled"),
      interrupted: language.t("orchestra.dock.download.state.interrupted"),
    })[state]
  return (
    <div ref={(element) => onCleanup(props.register(element))} class="zen-library" role="dialog" aria-label={title()}>
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
            {props.entries.length === 0 && <p>{language.t("orchestra.dock.library.empty")}</p>}
          </>
        }
      >
        {props.downloads.map((download) => (
          <div class="zen-download">
            <span>{download.filename}</span>
            <small>
              {download.state === "progressing" && download.totalBytes > 0
                ? `${Math.round((download.receivedBytes / download.totalBytes) * 100)}%`
                : downloadState(download.state)}
            </small>
            {download.state === "completed" ? (
              <button class="zen-open-button" type="button" onClick={() => props.onOpenDownload(download.id)}>
                {language.t("orchestra.dock.download.open")}
              </button>
            ) : download.state === "progressing" || download.state === "paused" ? (
              <button class="zen-open-button" type="button" onClick={() => props.onCancelDownload(download.id)}>
                {language.t("orchestra.dock.download.cancel")}
              </button>
            ) : null}
          </div>
        ))}
        {props.downloads.length === 0 && <p>{language.t("orchestra.dock.library.noDownloads")}</p>}
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
  const language = useLanguage()
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
        aria-label={language.t("orchestra.dock.find.label")}
        placeholder={language.t("orchestra.dock.find.label")}
      />
      <span>{props.result ? `${props.result.activeMatchOrdinal}/${props.result.matches}` : ""}</span>
      <button type="button" aria-label={language.t("orchestra.dock.find.previous")} onClick={() => props.onFind(false)}>
        &#8593;
      </button>
      <button type="submit" aria-label={language.t("orchestra.dock.find.next")}>
        &#8595;
      </button>
      <button type="button" aria-label={language.t("orchestra.dock.find.close")} onClick={props.onClose}>
        x
      </button>
    </form>
  )
}
