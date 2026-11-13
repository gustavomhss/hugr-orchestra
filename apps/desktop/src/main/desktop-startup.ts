export type StartupFence = {
  acquire<A>(start: (signal: AbortSignal) => Promise<A>, adopt: (resource: A) => void, release: (resource: A) => Promise<void>): Promise<A>
  close(): Promise<void>
}

// Main must own every asynchronous acquisition until synchronous adoption or joined late-resource cleanup.
export function createStartupFence(): StartupFence {
  const jobs = new Set<Promise<unknown>>()
  const failures: unknown[] = []
  const cancellation = new AbortController()
  const state = { closed: false, closing: undefined as Promise<void> | undefined }
  return {
    acquire(start, adopt, release) {
      if (state.closed) return Promise.reject(new Error("Desktop startup is closed"))
      // Defer start until its job is visible to a close reentered by the acquisition itself.
      const job = Promise.resolve().then(async () => {
        if (state.closed) throw new Error("Desktop startup is closed")
        const resource = await start(cancellation.signal).catch((error: unknown) => {
          // A confirmed cancellation uses the exact signal reason; a failed stop must remain observable.
          if (state.closed && error !== cancellation.signal.reason) failures.push(error)
          throw error
        })
        try {
          if (state.closed) throw new Error("Desktop startup closed during acquisition")
          adopt(resource)
          return resource
        } catch (error) {
          try { await release(resource) } catch (cleanup) {
            failures.push(cleanup)
            throw new AggregateError([error, cleanup], "Desktop startup adoption and cleanup failed")
          }
          throw error
        }
      })
      jobs.add(job)
      job.then(() => jobs.delete(job), () => jobs.delete(job))
      return job
    },
    close() {
      if (state.closing) return state.closing
      state.closed = true
      // Publish the close before aborting: an acquisition's abort handler may reenter close synchronously.
      const closing = Promise.withResolvers<void>()
      state.closing = closing.promise
      cancellation.abort()
      void Promise.allSettled([...jobs]).then(() => {
        if (failures.length) throw new AggregateError([...failures], "Desktop startup cleanup failed")
      }).then(closing.resolve, closing.reject)
      return state.closing
    },
  }
}
