import { Orchestra } from "@orchestra/client"
import type { OrchestraClient } from "@orchestra/sdk/v2/client"
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
}) {
  const http = { ...input.server }
  const fetcher = input.fetch
  const protocol = input.protocol
  const legacy = input.legacy
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
    headers: http.password
      ? { Authorization: `Basic ${authTokenFromCredentials({ username: http.username, password: http.password })}` }
      : undefined,
  })
  return {
    async listArchived(directory: string) {
      if ((await protocol) !== "v2") throw new SessionManagementUnsupported()
      const sessions: AppSession[] = []
      let cursor: string | undefined
      while (true) {
        const page = await client.sessions.list({ directory, includeArchived: true, order: "desc", limit: 100, cursor })
        sessions.push(...page.data.map(normalizeSessionInfo))
        if (!page.data.length || !page.cursor.next) break
        cursor = page.cursor.next
      }
      return sessions.filter((session) =>
        session.time.archived !== undefined && directoryKey(session.directory) === directoryKey(directory),
      )
    },
    async getSubagentModels(sessionID: string): Promise<SubagentModelPolicy> {
      if ((await protocol) !== "v2") throw new SessionManagementUnsupported()
      return await client.sessions.getSubagentModels({ sessionID })
    },
    async readSubagentModels(sessionID: string): Promise<ModelPolicySnapshot> {
      if ((await protocol) !== "v2") throw new SessionManagementUnsupported()
      // The full snapshot anchors policy freshness; policy-only GET/PUT responses have no revision.
      const snapshot = await client.sessions.get({ sessionID })
      return { policy: snapshot.subagentModels ?? { mode: "inherit" }, timestamp: snapshot.time.updated }
    },
    async setSubagentModels(sessionID: string, policy: SubagentModelPolicy): Promise<SubagentModelPolicy> {
      if ((await protocol) !== "v2") throw new SessionManagementUnsupported()
      return await client.sessions.setSubagentModels({ sessionID, policy })
    },
    async archive(sessionID: string, archived: boolean, directory: string) {
      if ((await protocol) === "v1") {
        if (!archived) throw new SessionManagementUnsupported()
        await legacy.session.update({
          sessionID,
          directory,
          time: { archived: Date.now() },
        })
        return
      }
      await client.sessions.archive({ sessionID, archived })
    },
  }
}

export type SessionManagement = ReturnType<typeof createSessionManagementForServer>
