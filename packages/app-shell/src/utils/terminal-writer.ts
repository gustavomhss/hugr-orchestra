// DEC mode 2026 (synchronized output): a program brackets one frame between set and reset so the terminal paints it
// whole. The emulator's render loop does not honor it, so the writer holds a frame until it closes, then writes it in one
// call. The timeout keeps a program that never resets from freezing the screen.
const SYNC_MODE = /\x1b\[\?2026([hl])/g
const SYNC_MODE_LENGTH = 8
export const SYNC_TIMEOUT_MS = 250

export function terminalWriter(
  write: (data: string, done?: VoidFunction) => void,
  schedule: (flush: VoidFunction) => void = queueMicrotask,
  syncTimeoutMs = SYNC_TIMEOUT_MS,
) {
  let chunks: string[] | undefined
  let waits: VoidFunction[] | undefined
  let scheduled = false
  let writing = false
  let syncing = false
  let tail = ""
  let timer: ReturnType<typeof setTimeout> | undefined

  // Follows the mode across chunks. The tail is one char shorter than a sequence, so it holds a split one's start but
  // never a whole one, and no sequence is counted twice.
  const track = (data: string) => {
    const text = tail + data
    for (const match of text.matchAll(SYNC_MODE)) syncing = match[1] === "h"
    tail = text.slice(-(SYNC_MODE_LENGTH - 1))
  }

  const release = () => {
    syncing = false
    if (timer) clearTimeout(timer)
    timer = undefined
    if (!chunks?.length || scheduled || writing) return
    scheduled = true
    schedule(tick)
  }

  const settle = () => {
    if (scheduled || writing || chunks?.length) return
    const list = waits
    if (!list?.length) return
    waits = undefined
    for (const fn of list) {
      fn()
    }
  }

  const run = (force: boolean) => {
    if (writing) return
    scheduled = false
    if (syncing && !force) return
    const items = chunks
    if (!items?.length) {
      settle()
      return
    }
    chunks = undefined
    writing = true
    write(items.join(""), () => {
      writing = false
      if (chunks?.length) {
        if (scheduled) return
        scheduled = true
        schedule(tick)
        return
      }
      settle()
    })
  }

  const tick = () => run(false)

  const push = (data: string) => {
    if (!data) return
    track(data)
    if (chunks) chunks.push(data)
    else chunks = [data]

    if (syncing) {
      timer ??= setTimeout(release, syncTimeoutMs)
      return
    }
    if (timer) {
      clearTimeout(timer)
      timer = undefined
    }
    if (scheduled || writing) return
    scheduled = true
    schedule(tick)
  }

  const flush = (done?: VoidFunction) => {
    if (!scheduled && !writing && !chunks?.length) {
      done?.()
      return
    }
    if (done) {
      if (waits) waits.push(done)
      else waits = [done]
    }
    run(true)
  }

  return { push, flush }
}
