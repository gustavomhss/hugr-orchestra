import type { ServerConnection } from "@/context/server"
import { authTokenFromCredentials } from "./server"

export type ServerProtocol = "v1" | "v2"

function headers(server: ServerConnection.HttpBase) {
  if (!server.password) return
  return {
    Authorization: `Basic ${authTokenFromCredentials({ username: server.username, password: server.password })}`,
  }
}

async function probe(server: ServerConnection.HttpBase, fetch: typeof globalThis.fetch, path: string) {
  const response = await fetch(new URL(path, server.url), {
    headers: headers(server),
    signal: AbortSignal.timeout(5_000),
  })
  if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return
  const value: unknown = await response.json()
  if (!value || typeof value !== "object") return
  return value
}

// A probe that gets no answer (its 5 s timeout or a network error) says nothing about the protocol. The result is kept
// for the connection's lifetime, so reading that as "not V1" would leave a V1 server that answered late, as a busy
// machine's first request can, on the V2 API until reload. Ask again before falling back.
const probeAttempts = 3

function answer(
  server: ServerConnection.HttpBase,
  fetch: typeof globalThis.fetch,
  path: string,
  attempt = 1,
): Promise<object | undefined> {
  return probe(server, fetch, path).catch(() =>
    attempt < probeAttempts ? answer(server, fetch, path, attempt + 1) : undefined,
  )
}

export async function detectServerProtocol(
  server: ServerConnection.HttpBase,
  fetch: typeof globalThis.fetch,
): Promise<ServerProtocol> {
  const legacy = await answer(server, fetch, "/global/health")
  if (legacy && "healthy" in legacy && legacy.healthy === true) return "v1"

  const current = await answer(server, fetch, "/api/health")
  if (current && "pid" in current && typeof current.pid === "number") return "v2"
  if (current && "healthy" in current && current.healthy === true) return "v1"
  return "v2"
}
