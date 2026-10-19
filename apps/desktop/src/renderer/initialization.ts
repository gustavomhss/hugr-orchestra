import type { ServerConnection } from "../../../../packages/app-shell/src/context/server"

export function initializationData<A>(state: (() => A | undefined) & { error: unknown }, remoteHealthy = false) {
  if (state.error !== undefined) {
    const failure = markLocalServerStartup(state.error)
    if (!remoteHealthy) throw failure
    return undefined
  }
  return state()
}

// Only a configured connection that answers a real health probe can replace the failed sidecar.
export async function recoverRemoteServer(
  raw: string | null,
  preferred: string | null | undefined,
  healthy: (http: ServerConnection.HttpBase) => Promise<boolean>,
) {
  const { Option, Schema } = await import("effect")
  const value = Option.getOrUndefined(Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(raw ?? "{}"))
  if (!value || typeof value !== "object" || !("list" in value) || !Array.isArray(value.list)) return
  const servers = value.list.flatMap((item): ServerConnection.Http[] => {
    const record = typeof item === "string" ? { url: item } : item
    if (!record || typeof record !== "object") return []
    if ("type" in record && record.type !== "http") return []
    const http = "http" in record ? record.http : record
    if (
      !http ||
      typeof http !== "object" ||
      !("url" in http) ||
      typeof http.url !== "string" ||
      !URL.canParse(http.url)
    )
      return []
    if (!["http:", "https:"].includes(new URL(http.url).protocol)) return []
    return [
      {
        type: "http",
        http: {
          url: http.url,
          username: "username" in http && typeof http.username === "string" ? http.username : undefined,
          password: "password" in http && typeof http.password === "string" ? http.password : undefined,
        },
      },
    ]
  })
  const ordered = [
    ...servers.filter((server) => server.http.url === preferred),
    ...servers.filter((server) => server.http.url !== preferred),
  ]
  for (const server of ordered) {
    if (await healthy(server.http).catch(() => false)) return server
  }
}

function markLocalServerStartup(error: unknown) {
  const failure = error instanceof Error ? error : new Error(String(error))
  const prefix = "Error invoking remote method 'await-initialization': Error: "
  if (failure.message.startsWith(prefix)) {
    const previous = failure.message
    failure.message = failure.message.slice(prefix.length)
    if (failure.stack) failure.stack = failure.stack.replace(`Error: ${previous}`, `Error: ${failure.message}`)
  }
  Object.defineProperty(failure, "localServerStartup", { value: true })
  return failure
}

export function initializationReady<A>(state: (() => A | undefined) & { error: unknown; loading: boolean }) {
  if (state.loading) return false
  initializationData(state)
  return true
}
