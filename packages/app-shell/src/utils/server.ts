import { Orchestra } from "@orchestra/client"
import { createOrchestraClient } from "../compat/sdk-v2-client"
import { OpenCode, type OpenCodeClient } from "../compat/vendored-client-promise"
import type { ServerConnection } from "@/context/server"
import { decode64 } from "@/utils/base64"

export function authTokenFromCredentials(input: { username?: string; password: string }) {
  return btoa(`${input.username ?? "orchestra"}:${input.password}`)
}

export function authFromToken(token: string | null) {
  const decoded = decode64(token ?? undefined)
  if (!decoded) return
  const separator = decoded.indexOf(":")
  if (separator === -1) return
  return {
    username: decoded.slice(0, separator) || "orchestra",
    password: decoded.slice(separator + 1),
  }
}

export function createSdkForServer({
  server,
  ...config
}: Omit<NonNullable<Parameters<typeof createOrchestraClient>[0]>, "baseUrl"> & {
  server: ServerConnection.HttpBase
}) {
  const auth = (() => {
    if (!server.password) return
    return {
      Authorization: `Basic ${authTokenFromCredentials({ username: server.username, password: server.password })}`,
    }
  })()

  return createOrchestraClient({
    ...config,
    headers: {
      ...(config.headers instanceof Headers ? Object.fromEntries(config.headers.entries()) : config.headers),
      ...auth,
    },
    baseUrl: server.url,
  })
}

export function createApiForServer(input: {
  server: ServerConnection.HttpBase
  fetch?: typeof globalThis.fetch
}): OpenCodeClient {
  const options = {
    baseUrl: input.server.url,
    fetch: input.fetch,
    headers: input.server.password
      ? {
          Authorization: `Basic ${authTokenFromCredentials({
            username: input.server.username,
            password: input.server.password,
          })}`,
        }
      : undefined,
  }
  const api = OpenCode.make(options)
  // The bundled client sends the prompt flat (`text`, `files`, `agents`); the Orchestra V2 server takes it nested under
  // `prompt` with `source` for mentions, so prompts go through the repo's own client.
  const orchestra = Orchestra.make(options)
  return {
    ...api,
    session: {
      ...api.session,
      prompt: (value, requestOptions) =>
        orchestra.sessions
          .prompt(
            {
              sessionID: value.sessionID,
              id: value.id,
              prompt: {
                text: value.text,
                files: value.files?.map((file) => ({
                  uri: file.uri,
                  name: file.name,
                  description: file.description,
                  source: file.mention,
                })),
                agents: value.agents?.map((agent) => ({ name: agent.name, source: agent.mention })),
              },
              delivery: value.delivery,
              resume: value.resume,
            },
            requestOptions,
          )
          .then((admitted) => ({
            admittedSeq: admitted.admittedSeq,
            id: admitted.id,
            sessionID: admitted.sessionID,
            timeCreated: admitted.timeCreated,
            type: "user" as const,
            data: { text: value.text },
            delivery: admitted.delivery,
          })),
    },
  }
}

export type ServerApi = OpenCodeClient
