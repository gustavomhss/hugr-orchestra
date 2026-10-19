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
  // `prompt` with `source` for mentions, so prompts go through the repo's own client. So do the routes whose bodies or
  // answers differ from the bundled contract (compact, move, synthetic).
  const orchestra = Orchestra.make(options)
  // The composer sends its agent and model with each request, as V1 took them per message; the V2 Session keeps one
  // selection, so it is switched first. The server records nothing when the selection is unchanged.
  const select = async (sessionID: string, value: object, requestOptions?: { signal?: AbortSignal }) => {
    if ("agent" in value && typeof value.agent === "string" && value.agent)
      await orchestra.sessions.switchAgent({ sessionID, agent: value.agent }, requestOptions)
    const model = "model" in value ? selectedModel(value.model, "variant" in value ? value.variant : undefined) : undefined
    if (model) await orchestra.sessions.switchModel({ sessionID, model }, requestOptions)
  }
  return {
    ...api,
    session: {
      ...api.session,
      command: async (value, requestOptions) => {
        await select(value.sessionID, value, requestOptions)
        return api.session.command(value, requestOptions)
      },
      compact: async (value) => {
        await select(value.sessionID, value)
        await orchestra.sessions.compact({ sessionID: value.sessionID })
        return {
          admittedSeq: 0,
          id: value.id ?? "",
          sessionID: value.sessionID,
          timeCreated: Date.now(),
          type: "compaction" as const,
        }
      },
      move: (value, requestOptions) =>
        orchestra.sessions.move(
          {
            sessionID: value.sessionID,
            location: { directory: value.directory, workspaceID: value.workspaceID },
          },
          requestOptions,
        ),
      synthetic: (value, requestOptions) =>
        orchestra.sessions
          .synthetic(
            { sessionID: value.sessionID, id: value.id ?? undefined, text: value.text, resume: value.resume ?? undefined },
            requestOptions,
          )
          .then((recorded) => ({
            admittedSeq: 0,
            id: recorded.id,
            sessionID: value.sessionID,
            timeCreated: Date.now(),
            type: "synthetic" as const,
            data: { text: value.text },
            delivery: value.delivery ?? "steer",
          })),
      prompt: async (value, requestOptions) => {
        await select(value.sessionID, value, requestOptions)
        return orchestra.sessions
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
          }))
      },
    },
  }
}

// `{ providerID, modelID }` from the composer or `{ providerID, id, variant }` from a command.
function selectedModel(value: unknown, variant: unknown) {
  if (!value || typeof value !== "object" || !("providerID" in value) || typeof value.providerID !== "string") return
  const id = "id" in value && typeof value.id === "string" ? value.id : "modelID" in value ? value.modelID : undefined
  if (typeof id !== "string") return
  const chosen = "variant" in value && typeof value.variant === "string" ? value.variant : variant
  return { providerID: value.providerID, id, ...(typeof chosen === "string" ? { variant: chosen } : {}) }
}

export type ServerApi = OpenCodeClient
