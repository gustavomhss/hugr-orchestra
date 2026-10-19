// Pure formatting helpers from specs/atlas-ui/mock/ui.js. They return text (or, for `highlight`, escaped HTML).

export const num = (n: number) => n.toLocaleString("en-US")
export const short = (hex: string | null | undefined, n = 8) => (hex ? hex.slice(0, n) : "")
// A stable 16-hex-digit FNV-1a fingerprint of a seed (A.hash).
export function hash(seed: string) {
  const state = { h: 2166136261 }
  return Array.from({ length: 2 }, (_, i) => {
    for (const c of `${seed}:${i}`) state.h = Math.imul(state.h ^ c.charCodeAt(0), 16777619) >>> 0
    return state.h.toString(16).padStart(8, "0")
  }).join("")
}
// The display name of a seat: its id with a capital first letter; actor ids with a colon stay as they are.
export const seatName = (id: string) => (id.includes(":") ? id : id.charAt(0).toUpperCase() + id.slice(1))

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }
export const esc = (value: string) => value.replace(/[&<>"']/g, (c) => ESCAPES[c])
// Tiny TypeScript-ish highlighter for code previews (keywords, strings, comments, types). It escapes first, so its
// output is safe for innerHTML.
export const highlight = (line: string) =>
  esc(line)
    .replace(/(\/\/.*)$/, '<span class="tk-c">$1</span>')
    .replace(/(&quot;.*?&quot;|`.*?`)/g, '<span class="tk-s">$1</span>')
    .replace(/\b(export|const|function|return|if|yield|import|from|type|await|async|new|throw|readonly)\b/g, '<span class="tk-k">$1</span>')
    .replace(/\b([A-Z][A-Za-z0-9]+)\b/g, '<span class="tk-t">$1</span>')
