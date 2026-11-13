import { For, Show } from "solid-js"

export function pathName(path: string) {
  const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"))
  if (cut < 0) return path
  return path.slice(cut + 1) || path
}

export function pathDir(path: string) {
  const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"))
  if (cut <= 0) return ""
  return path.slice(0, cut)
}

export function SourceText(props: { text: string; cuts: ReadonlyArray<{ start: number; end: number }> }) {
  return (
    <pre class="mx-log rag-source" dir="ltr" tabindex="0">
      <For each={cutPieces(props.text, props.cuts)}>
        {(piece) => (
          <Show when={piece.mark} fallback={piece.text}>
            <mark>{piece.text}</mark>
          </Show>
        )}
      </For>
    </pre>
  )
}

function cutPieces(text: string, cuts: ReadonlyArray<{ start: number; end: number }>) {
  const ordered = cuts.filter((cut) => cut.end > cut.start).sort((left, right) => left.start - right.start)
  if (ordered.length === 0) return [{ text, mark: false }]
  const pieces: Array<{ text: string; mark: boolean }> = []
  let cursor = 0
  for (const cut of ordered) {
    const start = Math.max(cursor, cut.start)
    const end = Math.max(start, cut.end)
    if (start > cursor) pieces.push({ text: text.slice(cursor, start), mark: false })
    if (end > start) pieces.push({ text: text.slice(start, end), mark: true })
    cursor = end
  }
  if (cursor < text.length) pieces.push({ text: text.slice(cursor), mark: false })
  return pieces
}
