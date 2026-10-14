import type { AppSession } from "@/utils/session"

/** Server-local snapshot recovery shares request and lifetime ownership with the content cache. */
export function createSessionRecovery(input: {
  requests: Map<string, Promise<AppSession>>
  generations: Map<string, object>
  read: (sessionID: string) => AppSession | undefined
  request: (sessionID: string) => Promise<AppSession>
  retain: (info: AppSession) => AppSession
  busy: (sessionID: string) => boolean
}) {
  const generation = (sessionID: string) => {
    const current = input.generations.get(sessionID)
    if (current) return current
    const created = {}
    input.generations.set(sessionID, created)
    return created
  }
  const resolve = (sessionID: string, options?: { force?: boolean }) => {
    const cached = input.read(sessionID)
    if (cached && !options?.force) return Promise.resolve(cached)
    const pending = input.requests.get(sessionID)
    if (pending) return pending
    const active = generation(sessionID)
    const resolved = input.request(sessionID).then((result) => {
      if (input.generations.get(sessionID) !== active) throw new DOMException("Session recovery superseded", "AbortError")
      return input.retain(result)
    })
    input.requests.set(sessionID, resolved)
    const cleanup = () => {
      if (input.requests.get(sessionID) === resolved) input.requests.delete(sessionID)
      if (
        input.generations.get(sessionID) === active &&
        !input.read(sessionID) &&
        !input.requests.has(sessionID) &&
        !input.busy(sessionID)
      )
        input.generations.delete(sessionID)
    }
    void resolved.then(cleanup, cleanup)
    return resolved
  }
  return { generation, resolve }
}
