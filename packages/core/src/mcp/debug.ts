import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js"
import type { ConfigMCP } from "@orchestra/schema/config-mcp"
import type { Mcp } from "@orchestra/schema/mcp"
import { Effect } from "effect"
import { InstallationVersion } from "../installation/version"
import type { Location } from "../location"
import type { McpAuth } from "./auth"
import { McpClient } from "./client"
import { McpOAuthProvider, oauthConfig, unauthorized } from "./oauth-provider"

export function inspect(
  name: string,
  server: ConfigMCP.Remote,
  auth: McpAuth.Interface,
  directory: Location.Interface["directory"],
  timeout: number,
) {
  return Effect.gen(function* () {
    const oauth = server.oauth !== false
    const stored = oauth ? yield* auth.get(name) : undefined
    const base = {
      name,
      url: server.url,
      oauth,
      ...(stored?.tokens
        ? {
            tokens: {
              access:
                stored.tokens.accessToken.length > 8
                  ? `${stored.tokens.accessToken.slice(0, 4)}***${stored.tokens.accessToken.slice(-4)}`
                  : "***",
              expiresAt: stored.tokens.expiresAt,
              refreshToken: stored.tokens.refreshToken !== undefined,
            },
          }
        : {}),
      ...(stored?.clientInfo
        ? { client: { id: stored.clientInfo.clientId, secretExpiresAt: stored.clientInfo.clientSecretExpiresAt } }
        : {}),
    } satisfies Mcp.Debug
    // OAuth explicitly disabled: there is no sign-in to debug.
    if (!oauth) return base
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(server.url, {
          method: "POST",
          headers: {
            ...server.headers,
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "initialize",
            params: {
              protocolVersion: LATEST_PROTOCOL_VERSION,
              capabilities: {},
              clientInfo: { name: "orchestra-debug", version: InstallationVersion },
            },
            id: 1,
          }),
          signal: AbortSignal.timeout(timeout),
        }),
      catch: messageOf,
    }).pipe(Effect.result)
    if (response._tag === "Failure") return { ...base, error: response.failure }
    const answer = response.success
    const wwwAuthenticate = answer.headers.get("www-authenticate") ?? undefined
    const body = yield* Effect.promise(() => answer.text().catch(() => ""))
    const http = {
      status: answer.status,
      statusText: answer.statusText,
      wwwAuthenticate,
      ...(answer.ok ? { serverInfo: serverInfo(body) } : { body: body.slice(0, 500) || undefined }),
    }
    if (answer.status !== 401 || !oauth) return { ...base, http }
    const binding = yield* auth.checkout(name, server.url).pipe(Effect.result)
    if (binding._tag === "Failure")
      return { ...base, http, flow: { result: "error" as const, message: binding.failure.message } }
    const provider = new McpOAuthProvider(
      name,
      server.url,
      oauthConfig(server),
      { onRedirect: () => {} },
      auth,
      binding.success,
    )
    const attempt = yield* Effect.tryPromise({
      try: async () => {
        const client = McpClient.createClient(directory)
        await client.connect(
          new StreamableHTTPClientTransport(new URL(server.url), {
            authProvider: provider,
            ...(server.headers ? { requestInit: { headers: server.headers } } : {}),
          }),
        )
        await client.close()
      },
      catch: (error) => (error instanceof Error ? error : new Error(String(error))),
    }).pipe(Effect.result)
    if (attempt._tag === "Success") return { ...base, http, flow: { result: "authenticated" as const } }
    const registered =
      (yield* Effect.promise(() => provider.clientInformation().catch(() => undefined))) !== undefined
    return {
      ...base,
      http,
      flow: unauthorized(attempt.failure)
        ? { result: "unauthorized" as const, message: attempt.failure.message, clientRegistered: registered }
        : { result: "error" as const, message: attempt.failure.message },
    }
  })
}

function serverInfo(body: string) {
  try {
    const info = JSON.parse(body)?.result?.serverInfo
    return info ? JSON.stringify(info) : undefined
  } catch {
    return undefined
  }
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
