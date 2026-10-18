import { randomUUID } from "node:crypto"

// Asking a window's page to save what it still holds before the window closes or the app quits. It lives apart from
// windows.ts, which cannot load without Electron, so that it can be tested with plain objects.

/** How long a close or a quit waits for a page's answer before it goes ahead without it. */
export const UNLOAD_TIMEOUT = 3_000

type Flushable = {
  isDestroyed(): boolean
  webContents: { isDestroyed(): boolean; isCrashed(): boolean; send(channel: string, id: string): void }
}

export function createWindowFlusher<W extends Flushable>() {
  const flushed = new WeakSet<W>()
  const flushing = new WeakMap<W, Promise<void>>()
  const replies = new Map<string, () => void>()
  return {
    /** Whether the window has been asked, so its close can go through. */
    flushed: (win: W) => flushed.has(win),
    /** Lets the window close without asking its page: the OS is ending the session and gives the app little time. */
    skip: (win: W) => void flushed.add(win),
    /**
     * Asks the page to save what it still holds (unsaved Relay drafts) and waits for its answer, at most UNLOAD_TIMEOUT,
     * so a hung, crashed or busy page never holds a close or a quit. Each window is asked once: it closes right after.
     */
    flush(win: W) {
      if (flushed.has(win)) return Promise.resolve()
      const asked = flushing.get(win)
      if (asked) return asked
      const next = new Promise<void>((resolve) => {
        if (win.isDestroyed() || win.webContents.isDestroyed() || win.webContents.isCrashed()) return resolve()
        const id = randomUUID()
        const done = () => {
          clearTimeout(timer)
          replies.delete(id)
          resolve()
        }
        const timer = setTimeout(done, UNLOAD_TIMEOUT)
        replies.set(id, done)
        win.webContents.send("before-unload", id)
      }).then(() => {
        flushed.add(win)
        flushing.delete(win)
      })
      flushing.set(win, next)
      return next
    },
    /** The page's answer to `flush`, through the `before-unload-done` IPC message. */
    settle(id: unknown) {
      if (typeof id === "string") replies.get(id)?.()
    },
  }
}
