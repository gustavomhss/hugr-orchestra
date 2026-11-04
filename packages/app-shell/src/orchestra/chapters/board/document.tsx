import { createMemo, Show } from "solid-js"
import DOMPurify from "dompurify"
import { marked } from "marked"

// A private instance cannot inherit another renderer's hooks or persistent configuration.
const purify = DOMPurify(typeof window === "undefined" ? undefined : window)

/** Board notes are untrusted documents, not web pages. No resource-bearing tags or attributes enter the DOM. */
export default function BoardDocument(props: { text: string }) {
  const html = createMemo(() => purify.isSupported ? purify.sanitize(marked.parse(props.text, { async: false }), {
    ALLOWED_TAGS: ["p", "br", "hr", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "em", "del", "s", "blockquote", "ul", "ol", "li", "pre", "code", "a", "table", "thead", "tbody", "tr", "th", "td", "details", "summary"],
    ALLOWED_ATTR: ["href", "title", "start", "colspan", "rowspan"],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  }) : "")
  return <Show when={purify.isSupported} fallback={<p class="board-discussion-source">{props.text}</p>}><div class="board-document-markdown" innerHTML={html()} /></Show>
}
