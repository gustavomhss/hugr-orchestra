import type { usePrompt } from "@/context/prompt"
import type { DirectorySDK } from "@/context/sdk"
import type { ServerSync } from "@/context/server-sync"
import { ScopedKey, type ServerScope } from "@/utils/server-scope"

type PromptTarget = ReturnType<ReturnType<typeof usePrompt>["capture"]>

export type PendingPrompt = {
  abort: AbortController
  cleanup: VoidFunction
  draft?: {
    key: string
    target: PromptTarget
    scope: ServerScope
    directory: string
    sessionID: string
    api: DirectorySDK["api"]["session"]
    serverState: ServerSync
  }
}

export const pending = new Map<string, Set<PendingPrompt>>()

export function trackPendingPrompt(scope: ServerScope, sessionID: string, job: PendingPrompt) {
  const key = ScopedKey.from(scope, sessionID)
  const jobs = pending.get(key) ?? new Set<PendingPrompt>()
  jobs.add(job)
  pending.set(key, jobs)
  return () => {
    jobs.delete(job)
    if (pending.get(key) === jobs && jobs.size === 0) pending.delete(key)
  }
}

export function interruptPendingSession(
  scope: ServerScope,
  sessionID: string,
  api: DirectorySDK["api"]["session"],
  state: ServerSync,
  failed: (error: unknown) => void,
) {
  state.session.set("todo", sessionID, [])
  const key = ScopedKey.from(scope, sessionID)
  const jobs = pending.get(key)
  if (jobs) {
    pending.delete(key)
    state.session.set("session_status", sessionID, { type: "idle" })
    ;[...jobs].reverse().forEach((job) => { job.abort.abort(); job.cleanup() })
  }
  // The run may have ended or kept going while events were missed: read its status back instead of keeping a stale spinner.
  const readBack = (report: boolean) =>
    readBackStatus(
      Promise.resolve()
        .then(() => api.active())
        .then((active) =>
          state.session.set("session_status", sessionID, active[sessionID] ? { type: "busy" } : { type: "idle" }),
        ),
      (error) => {
        console.error(error)
        if (report) failed(error)
      },
    )
  return api.interrupt({ sessionID }).then(
    () => readBack(true),
    (error: unknown) => {
      failed(error)
      return readBack(false)
    },
  )
}

/** The status read after stop. Failure is reported and does not reject, so a stop that landed is not lost. */
export function readBackStatus(read: Promise<unknown>, report: (error: unknown) => void) {
  return read.then(
    () => undefined,
    (error: unknown) => {
      report(error)
    },
  )
}
