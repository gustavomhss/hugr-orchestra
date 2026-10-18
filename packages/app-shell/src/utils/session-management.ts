import { createSignal } from "solid-js"
import { Orchestra } from "@orchestra/client"
import type { OrchestraClient } from "@/compat/sdk-v2-client"
import type { ServerConnection } from "@/context/server"
import type { ServerProtocol } from "./server-protocol"
import { authTokenFromCredentials } from "./server"
import type { ModelPolicySnapshot, SubagentModelPolicy } from "@/components/subagent-model-rules"
import { SessionManagementUnsupported } from "./session-management-errors"
import { normalizeSessionInfo, type AppSession } from "./session"
import { directoryKey } from "@/context/global-sync/utils"

/** Construct once inside the server SDK: fetch must carry that context's abort signal. */
export function createSessionManagementForServer(input: {
  server: ServerConnection.HttpBase
  fetch: typeof globalThis.fetch
  protocol: Promise<ServerProtocol>
  legacy: Pick<OrchestraClient, "session">
  signal?: AbortSignal
}) {
  const http = { ...input.server }
  const fetcher = input.fetch
  const protocol = input.protocol
  const legacy = input.legacy
  const lifetime = input.signal
  const headers = http.password
    ? { Authorization: `Basic ${authTokenFromCredentials({ username: http.username, password: http.password })}` }
    : undefined
  const client = Orchestra.make({
    baseUrl: http.url,
    // Declared 404s can be decoded to domain errors without their HTTP status. Classify at the transport boundary.
    fetch: Object.assign(
      async (request: string | URL | Request, init?: RequestInit) => {
        const response = await fetcher(request, init)
        if (response.status === 404 && response.headers.get("content-type")?.includes("application/json")) {
          const body: unknown = await response.clone().json().catch(() => undefined)
          if (body && typeof body === "object" && "_tag" in body && body._tag === "SessionNotFoundError") return response
        }
        if (response.status === 404 || response.status === 405 || response.status === 501) {
          await response.body?.cancel().catch(() => {})
          throw new SessionManagementUnsupported()
        }
        return response
      },
      { preconnect: fetcher.preconnect },
    ),
    headers,
  })
  // The desktop sidecar answers /global/health, so it reads as V1, but it also serves the V2 session routes.
  // A numeric pid from /api/health proves them. Only archive uses them here: V1 cannot clear time.archived.
  // Probe lazily, once per server context, so servers whose archive UI never renders see no extra request.
  // An answer is kept; a request that never got one is asked again next time.
  const [archiveRouted, setArchiveRouted] = createSignal(false)
  let archiveProbe: Promise<boolean> | undefined
  const archiveRoutes = () => {
    if (archiveProbe) return archiveProbe
    archiveProbe = protocol.then(async (kind) => {
      if (kind === "v2") return true
      const response = await fetcher(new URL("/api/health", http.url), { headers }).catch(() => undefined)
      if (!response) {
        archiveProbe = undefined
        return false
      }
      const body: unknown = response.ok
        ? await response.json().catch(() => undefined)
        : await response.body?.cancel().catch(() => undefined)
      return !!body && typeof body === "object" && "pid" in body && typeof body.pid === "number"
    })
    void archiveProbe.then((routed) => setArchiveRouted(routed), () => {})
    return archiveProbe
  }
  const writes = new Map<string, Promise<SubagentModelPolicy>>()
  const versions = new Map<string, number>()
  lifetime?.addEventListener("abort", () => {
    writes.clear()
    versions.clear()
  }, { once: true })
  return {
    /** Resolves true when archive, restore and the archived list can use the V2 session routes. */
    archiveRoutes,
    hasArchiveRoutes() {
      void archiveRoutes()
      return archiveRouted()
    },
    listArchived(directory: string) {
      return runSessionManagementOperation(lifetime, async () => {
        if (!(await archiveRoutes())) throw new SessionManagementUnsupported()
        lifetime?.throwIfAborted()
        const sessions: AppSession[] = []
        let cursor: string | undefined
        while (true) {
          const page = await client.sessions.list({ directory, includeArchived: true, order: "desc", limit: 100, cursor })
          lifetime?.throwIfAborted()
          sessions.push(...page.data.map(normalizeSessionInfo))
          if (!page.data.length || !page.cursor.next) break
          cursor = page.cursor.next
        }
        return sessions.filter((session) =>
          session.time.archived !== undefined && directoryKey(session.directory) === directoryKey(directory),
        )
      })
    },
    getSubagentModels(sessionID: string): Promise<SubagentModelPolicy> {
      return runSessionManagementOperation(lifetime, async () => {
        if ((await protocol) !== "v2") throw new SessionManagementUnsupported()
        lifetime?.throwIfAborted()
        const policy = await client.sessions.getSubagentModels({ sessionID })
        lifetime?.throwIfAborted()
        return policy
      })
    },
    readSubagentModels(sessionID: string): Promise<ModelPolicySnapshot> {
      return runSessionManagementOperation(lifetime, async () => {
        if ((await protocol) !== "v2") throw new SessionManagementUnsupported()
        lifetime?.throwIfAborted()
        // The full snapshot anchors policy freshness; policy-only GET/PUT responses have no revision.
        const snapshot = await client.sessions.get({ sessionID })
        lifetime?.throwIfAborted()
        return { policy: snapshot.subagentModels ?? { mode: "inherit" }, timestamp: snapshot.time.updated }
      })
    },
    setSubagentModels(sessionID: string, policy: SubagentModelPolicy): Promise<SubagentModelPolicy> {
      if (lifetime?.aborted) return Promise.reject(lifetime.reason)
      versions.set(sessionID, (versions.get(sessionID) ?? 0) + 1)
      const previous = writes.get(sessionID)
      const write = runSessionManagementOperation(lifetime, async () => {
        // Only an explicit new write may retry a failed predecessor; dispatch waits must retain its failure.
        await (previous ? previous.catch(() => undefined) : Promise.resolve())
        lifetime?.throwIfAborted()
        if ((await protocol) !== "v2") throw new SessionManagementUnsupported()
        lifetime?.throwIfAborted()
        const acknowledged = await client.sessions.setSubagentModels({ sessionID, policy })
        lifetime?.throwIfAborted()
        if (writes.get(sessionID) === write) writes.delete(sessionID)
        return acknowledged
      })
      writes.set(sessionID, write)
      void write.catch(() => {})
      return write
    },
    subagentModelsWriteVersion(id: string): number {
      return versions.get(id) ?? 0
    },
    waitSubagentModels(id: string): Promise<void> {
      // Capture the barrier before lifecycle cleanup can clear the map; a disposed lifetime still rejects the wait.
      const current = writes.get(id)
      return runSessionManagementOperation(lifetime, async () => {
        let write = current ?? writes.get(id)
        while (write) {
          const failure = await write.then(() => undefined, (error: unknown) => ({ error }))
          lifetime?.throwIfAborted()
          const latest = writes.get(id)
          if (latest && latest !== write) {
            write = latest
            continue
          }
          if (failure && latest === write) throw failure.error
          return
        }
      })
    },
    archive(sessionID: string, archived: boolean, directory: string) {
      return runSessionManagementOperation(lifetime, async () => {
        if (!(await archiveRoutes())) {
          lifetime?.throwIfAborted()
          if (!archived) throw new SessionManagementUnsupported()
          await legacy.session.update({ sessionID, directory, time: { archived: Date.now() } })
          return
        }
        lifetime?.throwIfAborted()
        await client.sessions.archive({ sessionID, archived })
      })
    },
  }
}

export type SessionManagement = ReturnType<typeof createSessionManagementForServer>

/** Race the complete generated operation, including protocol selection and response body decoding. */
async function runSessionManagementOperation<T>(lifetime: AbortSignal | undefined, load: () => Promise<T>): Promise<T> {
  lifetime?.throwIfAborted()
  if (!lifetime) return load()
  const cancelled = Promise.withResolvers<never>()
  const onAbort = () => cancelled.reject(lifetime.reason)
  lifetime.addEventListener("abort", onAbort, { once: true })
  const operation = Promise.resolve().then(() => {
    lifetime.throwIfAborted()
    return load()
  })
  return Promise.race([operation, cancelled.promise])
    .then((value) => {
      lifetime.throwIfAborted()
      return value
    })
    .finally(() => lifetime.removeEventListener("abort", onAbort))
}
