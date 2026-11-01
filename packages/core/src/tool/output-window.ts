export * as OutputWindow from "./output-window"

/**
 * Keeps the start and the end of an output stream within `limit` characters (UTF-16 code units, the unit the PTY ring
 * counts) and drops the middle. A command that fails after a long run usually says why in its last lines, so a window
 * that kept only the start would hide the cause.
 */
export function make(limit: number) {
  const headMax = Math.ceil(limit / 2)
  const tailMax = limit - headMax
  const state = { head: "", tail: "", dropped: 0, tailStarted: false }

  // Never cut between the halves of a surrogate pair.
  const trimTail = () => {
    const excess = state.tail.length - tailMax
    if (excess <= 0) return
    const start = isLowSurrogate(state.tail.charCodeAt(excess)) ? excess + 1 : excess
    state.dropped += start
    state.tail = state.tail.slice(start)
  }

  return {
    push(chunk: string) {
      const room = headMax - state.head.length
      // Once the tail has started the head is closed, so the two halves stay in order.
      const take = state.tailStarted || room <= 0 ? 0 : headCut(chunk, room)
      state.head += chunk.slice(0, take)
      const rest = chunk.slice(take)
      if (rest === "") return
      state.tailStarted = true
      state.tail += rest
      // Trim in batches: slicing on every chunk would cost O(limit) per chunk.
      if (state.tail.length > tailMax * 2) trimTail()
    },
    /** Characters dropped from the middle. */
    get dropped() {
      trimTail()
      return state.dropped
    },
    /** Characters held. */
    get size() {
      return state.head.length + Math.min(state.tail.length, tailMax)
    },
    /** The window as text: the start, a note of what was dropped, then the end. `clean` runs on each half. */
    text(clean: (text: string) => string = (text) => text) {
      trimTail()
      if (state.dropped === 0) return clean(state.head + state.tail)
      return `${clean(state.head)}\n[${state.dropped} characters omitted from the middle of the output]\n${clean(state.tail)}`
    },
  }
}

function headCut(chunk: string, room: number) {
  if (room >= chunk.length) return chunk.length
  return isHighSurrogate(chunk.charCodeAt(room - 1)) ? room - 1 : room
}

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff
const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff
