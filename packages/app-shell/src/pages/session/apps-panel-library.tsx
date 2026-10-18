import { onCleanup, Show } from "solid-js"
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
  const title = () => ({ bookmarks: "Bookmarks", history: "History", downloads: "Downloads" })[props.kind]
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
            {props.entries.length === 0 && <p>Nothing here yet.</p>}
          </>
        }
      >
        {props.downloads.map((download) => (
          <div class="zen-download">
            <span>{download.filename}</span>
            <small>
              {download.state === "progressing" && download.totalBytes > 0
                ? `${Math.round((download.receivedBytes / download.totalBytes) * 100)}%`
                : download.state}
            </small>
            {download.state === "completed" ? (
              <button class="zen-open-button" type="button" onClick={() => props.onOpenDownload(download.id)}>
                Open
              </button>
            ) : download.state === "progressing" || download.state === "paused" ? (
              <button class="zen-open-button" type="button" onClick={() => props.onCancelDownload(download.id)}>
                Cancel
              </button>
            ) : null}
          </div>
        ))}
        {props.downloads.length === 0 && <p>No downloads yet.</p>}
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
        aria-label="Find in page"
        placeholder="Find in page"
      />
      <span>{props.result ? `${props.result.activeMatchOrdinal}/${props.result.matches}` : ""}</span>
      <button type="button" aria-label="Previous match" onClick={() => props.onFind(false)}>
        &#8593;
      </button>
      <button type="submit" aria-label="Next match">
        &#8595;
      </button>
      <button type="button" aria-label="Close find" onClick={props.onClose}>
        x
      </button>
    </form>
  )
}
