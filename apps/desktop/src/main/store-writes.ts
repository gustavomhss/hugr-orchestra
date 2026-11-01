// electron-store rewrites its whole file on every set, and the renderer's persist layer sets many keys in quick
// succession (typing, layout drags). Writes are held per store and applied together after a short quiet period, so a
// burst becomes one file write. Anything that reads a store, deletes from it or quits must flush first, so the last
// write is never lost and a read never sees stale data.
export const STORE_WRITE_DELAY_MS = 150

export type BufferedStore = { set(entries: Record<string, string>): void }

export function createStoreWriteBuffer(open: (name: string) => BufferedStore, delay = STORE_WRITE_DELAY_MS) {
  const pending = new Map<string, Record<string, string>>()
  let timer: ReturnType<typeof setTimeout> | undefined

  function flush(name?: string) {
    if (name === undefined) {
      clearTimeout(timer)
      timer = undefined
    }
    const names = name === undefined ? [...pending.keys()] : pending.has(name) ? [name] : []
    for (const item of names) {
      const entries = pending.get(item)
      pending.delete(item)
      if (entries) open(item).set(entries)
    }
  }

  function set(name: string, key: string, value: string) {
    const entries = pending.get(name) ?? {}
    // Own property, not assignment: a key such as "__proto__" must stay a plain entry.
    Object.defineProperty(entries, key, { value, enumerable: true, writable: true, configurable: true })
    pending.set(name, entries)
    timer ??= setTimeout(() => {
      timer = undefined
      // A failed disk write must not become an uncaught exception in main.
      try {
        flush()
      } catch (error) {
        console.error("failed to write store", error)
      }
    }, delay)
  }

  return { set, flush }
}
