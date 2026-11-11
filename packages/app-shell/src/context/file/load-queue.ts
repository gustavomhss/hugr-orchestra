// A force request arriving during a read invalidates its snapshot. All callers wait
// for the replacement read, while a scope reset leaves the old request detached.
export function createFileLoadQueue() {
  const inflight = new Map<string, { dirty: boolean; read: () => Promise<void>; promise: Promise<void> }>()
  return {
    clear: () => inflight.clear(),
    run(key: string, force: boolean, read: () => Promise<void>) {
      const pending = inflight.get(key)
      if (pending) {
        if (force) {
          pending.dirty = true
          pending.read = read
        }
        return pending.promise
      }
      const entry = { dirty: false, read, promise: Promise.resolve() }
      inflight.set(key, entry)
      entry.promise = (async () => {
        try {
          do {
            entry.dirty = false
            await entry.read()
          } while (entry.dirty && inflight.get(key) === entry)
        } finally {
          // Remove the entry in the same microtask as the final dirty check.
          if (inflight.get(key) === entry) inflight.delete(key)
        }
      })()
      return entry.promise
    },
  }
}
