import { Orchestra } from "@orchestra/client"
import type { ServerConnection } from "@/context/server"
import type { ModelPolicySnapshot, SubagentModelPolicy } from "@/components/subagent-model-rules"
import type { ServerProtocol } from "./server-protocol"
import { authTokenFromCredentials } from "./server"
import { SessionManagementUnsupported } from "./session-management-errors"

export type SessionManagement = {
  getSubagentModels: (id: string) => Promise<SubagentModelPolicy>
  readSubagentModels: (id: string) => Promise<ModelPolicySnapshot>
  setSubagentModels: (id: string, policy: SubagentModelPolicy) => Promise<SubagentModelPolicy>
  waitSubagentModels: (id: string) => Promise<void>
}

/** The server SDK owns the captured credentials, scoped fetch and write barriers. */
export function createSessionManagementForServer(input: {
  server: ServerConnection.HttpBase
  fetch: typeof globalThis.fetch
  protocol: Promise<ServerProtocol>
  signal?: AbortSignal
}): SessionManagement {
  const http = { ...input.server }
  const fetcher = input.fetch
  const protocol = input.protocol
  const lifetime = input.signal
  const client = Orchestra.make({
    baseUrl: http.url,
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
    headers: http.password
      ? { Authorization: `Basic ${authTokenFromCredentials({ username: http.username, password: http.password })}` }
      : undefined,
  })
  const writes = new Map<string, Promise<SubagentModelPolicy>>()
  return {
    getSubagentModels(id) {
      return runSessionManagementOperation(lifetime, async () => {
        if ((await protocol) !== "v2") throw new SessionManagementUnsupported()
        lifetime?.throwIfAborted()
        const policy = await client.sessions.getSubagentModels({ sessionID: id })
        lifetime?.throwIfAborted()
        return policy
      })
    },
    readSubagentModels(id) {
      return runSessionManagementOperation<ModelPolicySnapshot>(lifetime, async () => {
        if ((await protocol) !== "v2") throw new SessionManagementUnsupported()
        lifetime?.throwIfAborted()
        const snapshot = await client.sessions.get({ sessionID: id })
        lifetime?.throwIfAborted()
        return { policy: snapshot.subagentModels ?? { mode: "inherit" }, timestamp: snapshot.time.updated }
      })
    },
    setSubagentModels(id, policy) {
      const previous = writes.get(id)
      // A failed predecessor permits an explicit retry; dispatch waits never swallow it.
      const write = runSessionManagementOperation(lifetime, async () => {
        await (previous ? previous.catch(() => undefined) : Promise.resolve())
        lifetime?.throwIfAborted()
        if ((await protocol) !== "v2") throw new SessionManagementUnsupported()
        lifetime?.throwIfAborted()
        const acknowledged = await client.sessions.setSubagentModels({ sessionID: id, policy })
        lifetime?.throwIfAborted()
        if (writes.get(id) === write) writes.delete(id)
        return acknowledged
      })
      writes.set(id, write)
      // Retain the original rejected promise as the barrier, even when its caller closes.
      void write.catch(() => {})
      return write
    },
    waitSubagentModels(id) {
      return runSessionManagementOperation(lifetime, async () => {
        while (true) {
          const write = writes.get(id)
          if (!write) return
          await write
          lifetime?.throwIfAborted()
          if (writes.get(id) === write) return
        }
      })
    },
  }
}

/** Race the complete generated operation, including body decoding after fetch resolves. */
async function runSessionManagementOperation<T>(lifetime: AbortSignal | undefined, load: () => Promise<T>): Promise<T> {
  if (!lifetime) return load()
  const cancelled = Promise.withResolvers<never>()
  const onAbort = () => cancelled.reject(lifetime.reason)
  lifetime.addEventListener("abort", onAbort, { once: true })
  const operation = Promise.resolve().then(() => {
    lifetime.throwIfAborted()
    return load()
  })
  return Promise.race([operation, cancelled.promise]).finally(() => lifetime.removeEventListener("abort", onAbort))
}
