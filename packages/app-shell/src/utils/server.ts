import { Orchestra } from "@orchestra/client"
import { createOrchestraClient } from "@orchestra/sdk/v2/client"
import { OpenCode, type OpenCodeClient } from "../compat/vendored-client-promise"
import type { ServerConnection } from "@/context/server"
import { decode64 } from "@/utils/base64"

type LegacyPromptValue = {
  sessionID: string
  id?: string
  text: string
  files?: ReadonlyArray<{ uri: string; name?: string; description?: string; mention?: { text: string; start: number; end: number } }>
  agents?: ReadonlyArray<{ name: string; mention?: { text: string; start: number; end: number } }>
  delivery?: string
  resume?: boolean
  agent?: string
  model?: unknown
  variant?: unknown
}

type LegacyCommandValue = {
  sessionID: string
  id?: string
  command: string
  arguments?: string
  files?: unknown
  agents?: unknown
  delivery?: string
  resume?: boolean
  agent?: string
  model?: unknown
  variant?: unknown
}

type LegacySyntheticValue = {
  sessionID: string
  id?: string
  text: string
  delivery?: string
  resume?: boolean
}

type LegacyCompactValue = {
  sessionID: string
  id?: string
  agent?: string
  model?: unknown
  variant?: unknown
}

type LegacyStageValue = { sessionID: string; messageID: string }

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
}) {
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
  const orchestra = Orchestra.make(options)
  const select = async (sessionID: string, value: object, requestOptions?: { signal?: AbortSignal }) => {
    if ("agent" in value && typeof value.agent === "string" && value.agent)
      await orchestra.sessions.switchAgent({ sessionID, agent: value.agent }, requestOptions)
    const model = "model" in value ? selectedModel(value.model, "variant" in value ? value.variant : undefined) : undefined
    if (model) await orchestra.sessions.switchModel({ sessionID, model }, requestOptions)
  }
  return {
    health: orchestra.health,
    location: orchestra.location,
    agent: {
      list: (value?: Parameters<typeof orchestra.agents.list>[0], requestOptions?: Parameters<typeof orchestra.agents.list>[1]) =>
        orchestra.agents.list(value, requestOptions),
      getFile: (value: Parameters<typeof orchestra.agents.getFile>[0], requestOptions?: Parameters<typeof orchestra.agents.getFile>[1]) =>
        orchestra.agents.getFile(value, requestOptions),
      updateFile: (value: Parameters<typeof orchestra.agents.updateFile>[0], requestOptions?: Parameters<typeof orchestra.agents.updateFile>[1]) =>
        orchestra.agents.updateFile(value, requestOptions),
    },
    session: {
      list: (value?: Parameters<typeof orchestra.sessions.list>[0], requestOptions?: Parameters<typeof orchestra.sessions.list>[1]) =>
        orchestra.sessions.list(value, requestOptions),
      create: (value?: Parameters<typeof orchestra.sessions.create>[0], requestOptions?: Parameters<typeof orchestra.sessions.create>[1]) =>
        orchestra.sessions.create(value, requestOptions),
      active: (requestOptions?: Parameters<typeof orchestra.sessions.active>[0]) => orchestra.sessions.active(requestOptions),
      get: (value: Parameters<typeof orchestra.sessions.get>[0], requestOptions?: Parameters<typeof orchestra.sessions.get>[1]) =>
        orchestra.sessions.get(value, requestOptions),
      remove: (value: Parameters<typeof orchestra.sessions.remove>[0], requestOptions?: Parameters<typeof orchestra.sessions.remove>[1]) =>
        orchestra.sessions.remove(value, requestOptions),
      fork: (value: Parameters<typeof orchestra.sessions.fork>[0], requestOptions?: Parameters<typeof orchestra.sessions.fork>[1]) =>
        orchestra.sessions.fork(value, requestOptions),
      switchAgent: (value: Parameters<typeof orchestra.sessions.switchAgent>[0], requestOptions?: Parameters<typeof orchestra.sessions.switchAgent>[1]) =>
        orchestra.sessions.switchAgent(value, requestOptions),
      switchModel: (value: Parameters<typeof orchestra.sessions.switchModel>[0], requestOptions?: Parameters<typeof orchestra.sessions.switchModel>[1]) =>
        orchestra.sessions.switchModel(value, requestOptions),
      rename: (value: Parameters<typeof orchestra.sessions.rename>[0], requestOptions?: Parameters<typeof orchestra.sessions.rename>[1]) =>
        orchestra.sessions.rename(value, requestOptions),
      move: (value: Parameters<typeof orchestra.sessions.move>[0], requestOptions?: Parameters<typeof orchestra.sessions.move>[1]) =>
        orchestra.sessions.move(value, requestOptions),
      prompt: async (value: LegacyPromptValue, requestOptions?: { signal?: AbortSignal }) => {
        await select(value.sessionID, value, requestOptions)
        return orchestra.sessions
          .prompt(
            {
              sessionID: value.sessionID,
              id: value.id,
              prompt: {
                text: value.text,
                files: value.files?.map((file: { uri: string; name?: string; description?: string; mention?: { text: string; start: number; end: number } }) => ({
                  uri: file.uri,
                  name: file.name,
                  description: file.description,
                  source: file.mention,
                })),
                agents: value.agents?.map((agent: { name: string; mention?: { text: string; start: number; end: number } }) => ({ name: agent.name, source: agent.mention })),
              },
              delivery: value.delivery as "steer" | "queue" | undefined,
              resume: value.resume,
            },
            requestOptions,
          )
          .then((admitted: Awaited<ReturnType<typeof orchestra.sessions.prompt>>) => ({
            admittedSeq: admitted.admittedSeq,
            id: admitted.id,
            sessionID: admitted.sessionID,
            timeCreated: admitted.timeCreated,
            type: "user" as const,
            data: { text: value.text },
            delivery: admitted.delivery,
          }))
      },
      command: async (value: LegacyCommandValue, requestOptions?: { signal?: AbortSignal }) => {
        await select(value.sessionID, value, requestOptions)
        return orchestra.sessions
          .command(value as Parameters<typeof orchestra.sessions.command>[0], requestOptions)
          .then((admitted: Awaited<ReturnType<typeof orchestra.sessions.prompt>>) => ({
            admittedSeq: admitted.admittedSeq,
            id: admitted.id,
            sessionID: admitted.sessionID,
            timeCreated: admitted.timeCreated,
            type: "user" as const,
            data: { text: `/${value.command} ${value.arguments ?? ""}`.trim() },
            delivery: admitted.delivery,
          }))
      },
      skill: (value: Parameters<typeof orchestra.sessions.skill>[0], requestOptions?: Parameters<typeof orchestra.sessions.skill>[1]) =>
        orchestra.sessions.skill(value, requestOptions),
      synthetic: (value: LegacySyntheticValue, requestOptions?: { signal?: AbortSignal }) =>
        orchestra.sessions
          .synthetic(
            { sessionID: value.sessionID, id: value.id ?? undefined, text: value.text, resume: value.resume ?? undefined },
            requestOptions,
          )
          .then((recorded: Awaited<ReturnType<typeof orchestra.sessions.synthetic>>) => ({
            admittedSeq: 0,
            id: recorded.id,
            sessionID: value.sessionID,
            timeCreated: Date.now(),
            type: "synthetic" as const,
            data: { text: value.text },
            delivery: value.delivery ?? "steer",
          })),
      shell: (value: Parameters<typeof orchestra.sessions.shell>[0], requestOptions?: Parameters<typeof orchestra.sessions.shell>[1]) =>
        orchestra.sessions.shell(value, requestOptions),
      compact: async (value: LegacyCompactValue) => {
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
      wait: (value: Parameters<typeof orchestra.sessions.wait>[0], requestOptions?: Parameters<typeof orchestra.sessions.wait>[1]) =>
        orchestra.sessions.wait(value, requestOptions),
      revert: {
        stage: async (value: LegacyStageValue, requestOptions?: { signal?: AbortSignal }) => {
          await orchestra.sessions.stage(value, requestOptions)
          return { messageID: value.messageID }
        },
        clear: (value: Parameters<typeof orchestra.sessions.clear>[0], requestOptions?: Parameters<typeof orchestra.sessions.clear>[1]) =>
          orchestra.sessions.clear(value, requestOptions),
        commit: (value: Parameters<typeof orchestra.sessions.commit>[0], requestOptions?: Parameters<typeof orchestra.sessions.commit>[1]) =>
          orchestra.sessions.commit(value, requestOptions),
      },
      context: (value: Parameters<typeof orchestra.sessions.context>[0], requestOptions?: Parameters<typeof orchestra.sessions.context>[1]) =>
        orchestra.sessions.context(value, requestOptions),
      history: (value: Parameters<typeof orchestra.sessions.history>[0], requestOptions?: Parameters<typeof orchestra.sessions.history>[1]) =>
        orchestra.sessions.history(value, requestOptions),
      events: (value: Parameters<typeof orchestra.sessions.events>[0], requestOptions?: Parameters<typeof orchestra.sessions.events>[1]) =>
        orchestra.sessions.events(value, requestOptions),
      interrupt: (value: Parameters<typeof orchestra.sessions.interrupt>[0], requestOptions?: Parameters<typeof orchestra.sessions.interrupt>[1]) =>
        orchestra.sessions.interrupt(value, requestOptions),
      message: (value: Parameters<typeof orchestra.sessions.message>[0], requestOptions?: Parameters<typeof orchestra.sessions.message>[1]) =>
        orchestra.sessions.message(value, requestOptions),
      processes: (value: Parameters<typeof orchestra.sessions.processes>[0], requestOptions?: Parameters<typeof orchestra.sessions.processes>[1]) =>
        orchestra.sessions.processes(value, requestOptions),
      processStop: (value: Parameters<typeof orchestra.sessions.processStop>[0], requestOptions?: Parameters<typeof orchestra.sessions.processStop>[1]) =>
        orchestra.sessions.processStop(value, requestOptions),
      getSubagentModels: (value: Parameters<typeof orchestra.sessions.getSubagentModels>[0], requestOptions?: Parameters<typeof orchestra.sessions.getSubagentModels>[1]) =>
        orchestra.sessions.getSubagentModels(value, requestOptions),
      setSubagentModels: (value: Parameters<typeof orchestra.sessions.setSubagentModels>[0], requestOptions?: Parameters<typeof orchestra.sessions.setSubagentModels>[1]) =>
        orchestra.sessions.setSubagentModels(value, requestOptions),
      getPermission: (value: Parameters<typeof orchestra.sessions.getPermission>[0], requestOptions?: Parameters<typeof orchestra.sessions.getPermission>[1]) =>
        orchestra.sessions.getPermission(value, requestOptions),
      setPermission: (value: Parameters<typeof orchestra.sessions.setPermission>[0], requestOptions?: Parameters<typeof orchestra.sessions.setPermission>[1]) =>
        orchestra.sessions.setPermission(value, requestOptions),
      todo: (value: Parameters<typeof orchestra.sessions.todo>[0], requestOptions?: Parameters<typeof orchestra.sessions.todo>[1]) =>
        orchestra.sessions.todo(value, requestOptions),
      generate: (value: Parameters<typeof orchestra.sessions.generate>[0], requestOptions?: Parameters<typeof orchestra.sessions.generate>[1]) =>
        orchestra.sessions.generate(value, requestOptions),
      archive: (value: Parameters<typeof orchestra.sessions.archive>[0], requestOptions?: Parameters<typeof orchestra.sessions.archive>[1]) =>
        orchestra.sessions.archive(value, requestOptions),
    },
    message: {
      list: (value: Parameters<typeof orchestra.messages.list>[0], requestOptions?: Parameters<typeof orchestra.messages.list>[1]) =>
        orchestra.messages.list(value, requestOptions),
    },
    model: {
      list: (value?: Parameters<typeof orchestra.models.list>[0], requestOptions?: Parameters<typeof orchestra.models.list>[1]) =>
        orchestra.models.list(value, requestOptions),
      default: (value?: Parameters<typeof orchestra.models.default>[0], requestOptions?: Parameters<typeof orchestra.models.default>[1]) =>
        orchestra.models.default(value, requestOptions),
    },
    provider: {
      list: (value?: Parameters<typeof orchestra.providers.list>[0], requestOptions?: Parameters<typeof orchestra.providers.list>[1]) =>
        orchestra.providers.list(value, requestOptions),
      get: (value: Parameters<typeof orchestra.providers.get>[0], requestOptions?: Parameters<typeof orchestra.providers.get>[1]) =>
        orchestra.providers.get(value, requestOptions),
    },
    integration: {
      list: (value?: Parameters<typeof orchestra.integrations.list>[0], requestOptions?: Parameters<typeof orchestra.integrations.list>[1]) =>
        orchestra.integrations.list(value, requestOptions),
      get: (value: Parameters<typeof orchestra.integrations.get>[0], requestOptions?: Parameters<typeof orchestra.integrations.get>[1]) =>
        orchestra.integrations.get(value, requestOptions),
      connect: {
        key: (value: Parameters<typeof orchestra.integrations.connectKey>[0], requestOptions?: Parameters<typeof orchestra.integrations.connectKey>[1]) =>
          orchestra.integrations.connectKey(value, requestOptions),
      },
      oauth: {
        connect: (value: Parameters<typeof orchestra.integrations.connectOauth>[0], requestOptions?: Parameters<typeof orchestra.integrations.connectOauth>[1]) =>
          orchestra.integrations.connectOauth(value, requestOptions),
        status: (value: Parameters<typeof orchestra.integrations.oauthStatus>[0], requestOptions?: Parameters<typeof orchestra.integrations.oauthStatus>[1]) =>
          orchestra.integrations.oauthStatus(value, requestOptions),
        complete: (value: Parameters<typeof orchestra.integrations.oauthComplete>[0], requestOptions?: Parameters<typeof orchestra.integrations.oauthComplete>[1]) =>
          orchestra.integrations.oauthComplete(value, requestOptions),
        cancel: (value: Parameters<typeof orchestra.integrations.oauthCancel>[0], requestOptions?: Parameters<typeof orchestra.integrations.oauthCancel>[1]) =>
          orchestra.integrations.oauthCancel(value, requestOptions),
      },
    },
    mcp: {
      list: (value?: Parameters<typeof orchestra.mcp.list>[0], requestOptions?: Parameters<typeof orchestra.mcp.list>[1]) =>
        orchestra.mcp.list(value, requestOptions),
      add: (value: Parameters<typeof orchestra.mcp.add>[0], requestOptions?: Parameters<typeof orchestra.mcp.add>[1]) =>
        orchestra.mcp.add(value, requestOptions),
      remove: (value: Parameters<typeof orchestra.mcp.remove>[0], requestOptions?: Parameters<typeof orchestra.mcp.remove>[1]) =>
        orchestra.mcp.remove(value, requestOptions),
      connect: (value: Parameters<typeof orchestra.mcp.connect>[0], requestOptions?: Parameters<typeof orchestra.mcp.connect>[1]) =>
        orchestra.mcp.connect(value, requestOptions),
      disconnect: (value: Parameters<typeof orchestra.mcp.disconnect>[0], requestOptions?: Parameters<typeof orchestra.mcp.disconnect>[1]) =>
        orchestra.mcp.disconnect(value, requestOptions),
      resource: {
        catalog: (value?: Parameters<typeof orchestra.mcp.resources>[0], requestOptions?: Parameters<typeof orchestra.mcp.resources>[1]) =>
          orchestra.mcp.resources(value, requestOptions),
      },
    },
    credential: {
      update: (value: Parameters<typeof orchestra.credentials.update>[0], requestOptions?: Parameters<typeof orchestra.credentials.update>[1]) =>
        orchestra.credentials.update(value, requestOptions),
      remove: (value: Parameters<typeof orchestra.credentials.remove>[0], requestOptions?: Parameters<typeof orchestra.credentials.remove>[1]) =>
        orchestra.credentials.remove(value, requestOptions),
    },
    project: {
      list: (requestOptions?: Parameters<typeof orchestra.projects.list>[0]) => orchestra.projects.list(requestOptions),
      current: (value?: Parameters<typeof orchestra.location.get>[0], requestOptions?: Parameters<typeof orchestra.location.get>[1]) =>
        orchestra.location.get(value, requestOptions).then((info: Awaited<ReturnType<typeof orchestra.location.get>>) => info.project),
      directories: (value: { projectID: string }, requestOptions?: Parameters<typeof orchestra.projects.directories>[1]) =>
        orchestra.projects.directories({ projectID: value.projectID }, requestOptions),
      update: (value: Parameters<typeof orchestra.projects.update>[0], requestOptions?: Parameters<typeof orchestra.projects.update>[1]) =>
        orchestra.projects.update(value, requestOptions),
      initGit: (value?: Parameters<typeof orchestra.projects.initGit>[0], requestOptions?: Parameters<typeof orchestra.projects.initGit>[1]) =>
        orchestra.projects.initGit(value, requestOptions),
    },
    permission: {
      request: {
        list: (value?: Parameters<typeof orchestra.permissions.listRequests>[0], requestOptions?: Parameters<typeof orchestra.permissions.listRequests>[1]) =>
          orchestra.permissions.listRequests(value, requestOptions),
      },
      saved: {
        list: (value?: Parameters<typeof orchestra.permissions.listSaved>[0], requestOptions?: Parameters<typeof orchestra.permissions.listSaved>[1]) =>
          orchestra.permissions.listSaved(value, requestOptions),
        remove: (value: Parameters<typeof orchestra.permissions.removeSaved>[0], requestOptions?: Parameters<typeof orchestra.permissions.removeSaved>[1]) =>
          orchestra.permissions.removeSaved(value, requestOptions),
      },
      create: (value: Parameters<typeof orchestra.permissions.create>[0], requestOptions?: Parameters<typeof orchestra.permissions.create>[1]) =>
        orchestra.permissions.create(value, requestOptions),
      list: (value: Parameters<typeof orchestra.permissions.list>[0], requestOptions?: Parameters<typeof orchestra.permissions.list>[1]) =>
        orchestra.permissions.list(value, requestOptions),
      get: (value: Parameters<typeof orchestra.permissions.get>[0], requestOptions?: Parameters<typeof orchestra.permissions.get>[1]) =>
        orchestra.permissions.get(value, requestOptions),
      reply: (value: Parameters<typeof orchestra.permissions.reply>[0], requestOptions?: Parameters<typeof orchestra.permissions.reply>[1]) =>
        orchestra.permissions.reply(value, requestOptions),
    },
    file: {
      read: (value: Parameters<typeof orchestra.files.read>[0], requestOptions?: Parameters<typeof orchestra.files.read>[1]) =>
        orchestra.files.read(value, requestOptions),
      list: (value?: Parameters<typeof orchestra.files.list>[0], requestOptions?: Parameters<typeof orchestra.files.list>[1]) =>
        orchestra.files.list(value, requestOptions),
      find: (value: Parameters<typeof orchestra.files.find>[0], requestOptions?: Parameters<typeof orchestra.files.find>[1]) =>
        orchestra.files.find(value, requestOptions),
    },
    command: {
      list: (value?: Parameters<typeof orchestra.commands.list>[0], requestOptions?: Parameters<typeof orchestra.commands.list>[1]) =>
        orchestra.commands.list(value, requestOptions),
    },
    skill: {
      list: (value?: Parameters<typeof orchestra.skills.list>[0], requestOptions?: Parameters<typeof orchestra.skills.list>[1]) =>
        orchestra.skills.list(value, requestOptions),
    },
    event: {
      subscribe: (requestOptions?: Parameters<typeof orchestra.events.subscribe>[0]) => orchestra.events.subscribe(requestOptions),
    },
    pty: orchestra.ptys,
    question: {
      request: {
        list: (value?: Parameters<typeof orchestra.questions.listRequests>[0], requestOptions?: Parameters<typeof orchestra.questions.listRequests>[1]) =>
          orchestra.questions.listRequests(value, requestOptions),
      },
      list: (value: Parameters<typeof orchestra.questions.list>[0], requestOptions?: Parameters<typeof orchestra.questions.list>[1]) =>
        orchestra.questions.list(value, requestOptions),
      reply: (value: Parameters<typeof orchestra.questions.reply>[0], requestOptions?: Parameters<typeof orchestra.questions.reply>[1]) =>
        orchestra.questions.reply(value, requestOptions),
      reject: (value: Parameters<typeof orchestra.questions.reject>[0], requestOptions?: Parameters<typeof orchestra.questions.reject>[1]) =>
        orchestra.questions.reject(value, requestOptions),
    },
    reference: {
      list: (value?: Parameters<typeof orchestra.references.list>[0], requestOptions?: Parameters<typeof orchestra.references.list>[1]) =>
        orchestra.references.list(value, requestOptions),
    },
    projectCopy: {
      create: (value: Parameters<typeof orchestra.projectCopies.create>[0], requestOptions?: Parameters<typeof orchestra.projectCopies.create>[1]) =>
        orchestra.projectCopies.create(value, requestOptions),
      remove: (value: Parameters<typeof orchestra.projectCopies.remove>[0], requestOptions?: Parameters<typeof orchestra.projectCopies.remove>[1]) =>
        orchestra.projectCopies.remove(value, requestOptions),
      refresh: (value: Parameters<typeof orchestra.projectCopies.refresh>[0], requestOptions?: Parameters<typeof orchestra.projectCopies.refresh>[1]) =>
        orchestra.projectCopies.refresh(value, requestOptions),
    },
    vcs: orchestra.vcs,
    config: orchestra.config,
  } as unknown as OpenCodeClient
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
