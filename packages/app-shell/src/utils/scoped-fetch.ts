/** Keep both caller signals: Request.signal must survive a separate init.signal. */
export function createScopedFetch(fetcher: typeof globalThis.fetch, lifetime: AbortSignal): typeof globalThis.fetch {
  return Object.assign(
    (request: string | URL | Request, init?: RequestInit) => {
      const signal = AbortSignal.any([
        lifetime,
        ...(request instanceof Request ? [request.signal] : []),
        ...(init?.signal ? [init.signal] : []),
      ])
      signal.throwIfAborted()
      const cancelled = Promise.withResolvers<never>()
      const onAbort = () => cancelled.reject(signal.reason)
      signal.addEventListener("abort", onAbort, { once: true })
      const requestPromise = Promise.resolve().then(() => {
        signal.throwIfAborted()
        return fetcher(request, { ...init, signal })
      })
      return Promise.race([requestPromise, cancelled.promise])
        .then((response) => {
          signal.throwIfAborted()
          return response
        })
        .finally(() => signal.removeEventListener("abort", onAbort))
    },
    { preconnect: fetcher.preconnect },
  )
}
