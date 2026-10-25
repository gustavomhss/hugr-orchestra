import {
  RequestError,
  type Agent,
  type AgentSideConnection,
  type CancelNotification,
  type ContentBlock,
  type McpServer,
  type PermissionOption,
  type PromptRequest,
  type SessionNotification,
} from "@agentclientprotocol/sdk"
import path from "path"
import { InstallationVersion } from "@orchestra/core/installation/version"
import type { McpAddInput, MessagesListOutput, Orchestra } from "@orchestra/client"
import { buildConfigOptions, parseModelSelection, type ConfigOptionProvider } from "./config-option"
import { runTurn, type Event } from "../turn"

type Client = ReturnType<typeof Orchestra.make>
type Update = SessionNotification["update"]
type Message = MessagesListOutput["data"][number]

export const AuthMethodID = "orchestra-login"

const permissionOptions: PermissionOption[] = [
  { optionId: "once", kind: "allow_once", name: "Allow once" },
  { optionId: "always", kind: "allow_always", name: "Always allow" },
  { optionId: "reject", kind: "reject_once", name: "Reject" },
]

type State = {
  cwd: string
  model?: { providerID: string; modelID: string }
  variant?: string
  modeId?: string
  cancelled?: AbortController
}

/** An ACP agent served by an Orchestra server: each ACP session is one Orchestra session. */
export class OrchestraAgent implements Agent {
  private readonly sessions = new Map<string, State>()
  private readonly registeredMcp = new Set<string>()

  constructor(
    private readonly client: Client,
    private readonly connection: Pick<AgentSideConnection, "sessionUpdate" | "requestPermission">,
  ) {}

  async initialize() {
    return {
      protocolVersion: 1,
      agentCapabilities: {
        loadSession: true,
        mcpCapabilities: { http: true, sse: true },
        promptCapabilities: { embeddedContext: true, image: true },
        sessionCapabilities: { close: {}, fork: {}, list: {}, resume: {} },
      },
      authMethods: [{ id: AuthMethodID, name: "Login with Orchestra", description: "Run `orchestra auth login` in the terminal" }],
      agentInfo: { name: "Orchestra", version: InstallationVersion },
    }
  }

  async authenticate(params: { methodId: string }) {
    if (params.methodId !== AuthMethodID) throw RequestError.invalidParams({ methodId: params.methodId }, "Unknown auth method")
    return {}
  }

  async newSession(params: { cwd: string; mcpServers: McpServer[] }) {
    const catalog = await this.catalog(params.cwd)
    const model = catalog.defaultModel
    const created = await this.client.sessions.create({
      location: { directory: params.cwd },
      agent: catalog.defaultMode,
      model: model ? { providerID: model.providerID, id: model.modelID } : undefined,
    })
    this.sessions.set(created.id, { cwd: params.cwd, model, modeId: created.agent ?? catalog.defaultMode })
    await this.registerMcp(params.cwd, params.mcpServers)
    return { sessionId: created.id, configOptions: await this.options(created.id) }
  }

  async loadSession(params: { sessionId: string; cwd: string; mcpServers: McpServer[] }) {
    await this.adopt(params.sessionId, params.cwd)
    await this.registerMcp(params.cwd, params.mcpServers)
    for (const message of await this.history(params.sessionId)) {
      for (const update of replay(message)) await this.connection.sessionUpdate({ sessionId: params.sessionId, update })
    }
    return { configOptions: await this.options(params.sessionId) }
  }

  async resumeSession(params: { sessionId: string; cwd: string; mcpServers?: McpServer[] }) {
    await this.adopt(params.sessionId, params.cwd)
    await this.registerMcp(params.cwd, params.mcpServers ?? [])
    return { configOptions: await this.options(params.sessionId) }
  }

  async listSessions(params: { cwd?: string | null; cursor?: string | null }) {
    const page = await this.client.sessions.list({
      limit: 100,
      order: "desc",
      directory: params.cwd ?? undefined,
      cursor: params.cursor ?? undefined,
    })
    return {
      sessions: page.data
        .filter((item) => !item.parentID)
        .map((item) => ({
          sessionId: item.id,
          cwd: item.location.directory,
          title: item.title,
          updatedAt: new Date(item.time.updated).toISOString(),
        })),
      ...(page.cursor.next ? { nextCursor: page.cursor.next } : {}),
    }
  }

  async closeSession(params: { sessionId: string }) {
    await this.client.sessions.interrupt({ sessionID: params.sessionId }).catch(() => undefined)
    this.sessions.delete(params.sessionId)
    return {}
  }

  async unstable_forkSession(params: { sessionId: string; cwd: string; mcpServers?: McpServer[] }) {
    const forked = await this.client.sessions.fork({ sessionID: params.sessionId }).catch(notFound(params.sessionId))
    await this.adopt(forked.id, params.cwd)
    await this.registerMcp(params.cwd, params.mcpServers ?? [])
    return { sessionId: forked.id, configOptions: await this.options(forked.id) }
  }

  async setSessionMode(params: { sessionId: string; modeId: string }) {
    await this.setMode(params.sessionId, params.modeId)
    return {}
  }

  async unstable_setSessionModel(params: { sessionId: string; modelId: string }) {
    await this.setModel(params.sessionId, params.modelId)
    return {}
  }

  async setSessionConfigOption(params: { sessionId: string; configId: string; value: string | boolean }) {
    const state = this.state(params.sessionId)
    const value = String(params.value)
    if (params.configId === "mode") await this.setMode(params.sessionId, value)
    else if (params.configId === "model") await this.setModel(params.sessionId, value)
    else if (params.configId === "effort") {
      if (!state.model) throw RequestError.invalidParams({ configId: params.configId }, "No model selected")
      state.variant = value === "default" ? undefined : value
      await this.client.sessions.switchModel({
        sessionID: params.sessionId,
        model: { providerID: state.model.providerID, id: state.model.modelID, variant: state.variant },
      })
    } else throw RequestError.invalidParams({ configId: params.configId }, "Unknown config option")
    return { configOptions: await this.options(params.sessionId) }
  }

  async prompt(params: PromptRequest) {
    const state = this.state(params.sessionId)
    const cancelled = new AbortController()
    state.cancelled = cancelled
    const tools = new Map<string, string>()
    const failures: string[] = []
    const prompt = promptContent(params.prompt)
    const finished = await runTurn(this.client, {
      sessionID: params.sessionId,
      location: { directory: state.cwd },
      signal: cancelled.signal,
      submit: () => this.client.sessions.prompt({ sessionID: params.sessionId, prompt }),
      onEvent: (event) => {
        if (event.type === "session.next.step.failed") failures.push((event.data as { error: { message: string } }).error.message)
        const update = toUpdate(event, tools)
        if (update) void this.connection.sessionUpdate({ sessionId: params.sessionId, update })
      },
      onPermission: async (request) => {
        const result = await this.connection.requestPermission({
          sessionId: params.sessionId,
          toolCall: {
            toolCallId: request.source?.callID ?? request.id,
            title: request.action,
            kind: "other",
            status: "pending",
            rawInput: request.metadata,
          },
          options: permissionOptions,
        })
        const id = result.outcome.outcome === "selected" ? result.outcome.optionId : "reject"
        return id === "once" || id === "always" ? id : "reject"
      },
    }).catch((error: Error) => {
      if (cancelled.signal.aborted) return "cancelled" as const
      throw RequestError.internalError({ message: error.message }, error.message)
    })
    state.cancelled = undefined
    if (cancelled.signal.aborted || finished === "cancelled") return { stopReason: "cancelled" as const }
    if (failures.length) throw RequestError.internalError({ message: failures.join("\n") }, failures.join("\n"))
    if (!finished) throw RequestError.internalError({}, "The prompt was not processed")
    return { stopReason: "end_turn" as const }
  }

  async cancel(params: CancelNotification) {
    this.sessions.get(params.sessionId)?.cancelled?.abort()
    await this.client.sessions.interrupt({ sessionID: params.sessionId }).catch(() => undefined)
  }

  private state(sessionId: string) {
    const state = this.sessions.get(sessionId)
    if (!state) throw RequestError.resourceNotFound(sessionId)
    return state
  }

  /** Reads a stored session into this agent's live state, restoring the model and mode it last used. */
  private async adopt(sessionId: string, cwd: string) {
    const stored = await this.client.sessions.get({ sessionID: sessionId }).catch(notFound(sessionId))
    const catalog = await this.catalog(cwd)
    this.sessions.set(sessionId, {
      cwd,
      model: stored.model ? { providerID: stored.model.providerID, modelID: stored.model.id } : catalog.defaultModel,
      variant: stored.model?.variant,
      modeId: stored.agent ?? catalog.defaultMode,
    })
  }

  private async history(sessionId: string) {
    const messages: Message[] = []
    let cursor: string | undefined
    do {
      const page = await this.client.messages.list({ sessionID: sessionId, limit: 200, order: "asc", cursor }).catch(notFound(sessionId))
      messages.push(...page.data)
      cursor = page.cursor.next ?? undefined
    } while (cursor)
    return messages
  }

  private async setMode(sessionId: string, modeId: string) {
    const state = this.state(sessionId)
    const catalog = await this.catalog(state.cwd)
    if (!catalog.modes.some((mode) => mode.id === modeId)) throw RequestError.invalidParams({ modeId }, "Unknown mode")
    await this.client.sessions.switchAgent({ sessionID: sessionId, agent: modeId })
    state.modeId = modeId
  }

  private async setModel(sessionId: string, modelId: string) {
    const state = this.state(sessionId)
    const catalog = await this.catalog(state.cwd)
    const selection = parseModelSelection(modelId, catalog.providers)
    if (!selection.model.modelID) throw RequestError.invalidParams({ modelId }, "Unknown model")
    await this.client.sessions.switchModel({
      sessionID: sessionId,
      model: { providerID: selection.model.providerID, id: selection.model.modelID, variant: selection.variant },
    })
    state.model = selection.model
    state.variant = selection.variant
  }

  private async options(sessionId: string) {
    const state = this.state(sessionId)
    const catalog = await this.catalog(state.cwd)
    const model = state.model ?? catalog.defaultModel
    if (!model) return []
    return buildConfigOptions({
      providers: catalog.providers,
      currentModel: model,
      currentVariant: state.variant,
      modes: catalog.modes,
      currentModeId: state.modeId ?? catalog.defaultMode,
    })
  }

  private async catalog(cwd: string) {
    const location = { directory: cwd }
    const [models, defaults, agents] = await Promise.all([
      this.client.models.list({ location }),
      this.client.models.default({ location }).catch(() => undefined),
      this.client.agents.list({ location }),
    ])
    const providers = new Map<string, ConfigOptionProvider>()
    models.data
      .filter((model) => model.enabled)
      .forEach((model) => {
        const provider = providers.get(model.providerID) ?? { id: model.providerID, name: model.providerID, models: {} }
        provider.models[model.id] = {
          id: model.id,
          name: model.name,
          variants: Object.fromEntries(model.variants.map((variant) => [variant.id, variant.body])),
        }
        providers.set(model.providerID, provider)
      })
    const first = models.data.find((model) => model.enabled)
    const picked = defaults?.data ?? first
    const modes = agents.data
      .filter((agent) => agent.mode !== "subagent" && !agent.hidden)
      .map((agent) => ({ id: agent.id, name: agent.name ?? agent.id, description: agent.description }))
    return {
      providers: [...providers.values()],
      modes,
      defaultMode: modes[0]?.id,
      defaultModel: picked ? { providerID: picked.providerID, modelID: picked.id } : undefined,
    }
  }

  /** Each server is registered once per working directory; remote servers keep their headers. */
  private async registerMcp(cwd: string, servers: ReadonlyArray<McpServer>) {
    for (const server of servers) {
      const key = `${cwd}\n${server.name}`
      if (this.registeredMcp.has(key)) continue
      await this.client.mcp.add({ server: server.name, location: { directory: cwd }, config: mcpConfig(server) })
      this.registeredMcp.add(key)
    }
  }
}

function notFound(sessionId: string) {
  return () => {
    throw RequestError.resourceNotFound(sessionId)
  }
}

export function mcpConfig(server: McpServer): McpAddInput["config"] {
  if ("command" in server)
    return {
      type: "local",
      command: [server.command, ...server.args],
      ...(server.env.length ? { environment: Object.fromEntries(server.env.map((item) => [item.name, item.value])) } : {}),
    }
  return {
    type: "remote",
    url: server.url,
    ...(server.headers.length ? { headers: Object.fromEntries(server.headers.map((item) => [item.name, item.value])) } : {}),
  }
}

/** ACP content blocks to an Orchestra prompt: text joins, images and links become attachments. */
export function promptContent(blocks: ReadonlyArray<ContentBlock>) {
  const files: Array<{ uri: string; name?: string }> = []
  const text = blocks
    .flatMap((block) => {
      if (block.type === "text") return [block.text]
      if (block.type === "image") {
        const uri = block.data ? `data:${block.mimeType};base64,${block.data}` : block.uri
        if (uri) files.push({ uri, name: "image" })
        return []
      }
      if (block.type === "resource_link") {
        files.push({ uri: block.uri, name: block.name })
        return []
      }
      if (block.type === "resource") {
        const resource = block.resource
        if ("text" in resource) return [`<context uri="${resource.uri}">\n${resource.text}\n</context>`]
        files.push({ uri: resource.uri, name: path.basename(resource.uri) })
      }
      return []
    })
    .join("\n")
  return { text, ...(files.length ? { files } : {}) }
}

/** One durable session event as an ACP update; events that carry nothing a client shows return undefined. */
export function toUpdate(event: Event, tools: Map<string, string>): Update | undefined {
  const data = event.data as Record<string, any>
  switch (event.type) {
    case "session.next.text.ended":
      return data.text ? { sessionUpdate: "agent_message_chunk", content: { type: "text", text: data.text } } : undefined
    case "session.next.reasoning.ended":
      return data.text ? { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: data.text } } : undefined
    case "session.next.tool.called":
      tools.set(data.callID, data.tool)
      return { sessionUpdate: "tool_call", toolCallId: data.callID, title: data.tool, kind: "other", status: "in_progress", rawInput: data.input }
    case "session.next.tool.success":
      return {
        sessionUpdate: "tool_call_update",
        toolCallId: data.callID,
        status: "completed",
        content: toolContent(data.content),
        rawOutput: data.structured,
      }
    case "session.next.tool.failed":
      return {
        sessionUpdate: "tool_call_update",
        toolCallId: data.callID,
        status: "failed",
        content: [{ type: "content", content: { type: "text", text: data.error.message } }],
      }
  }
  return undefined
}

function toolContent(content: ReadonlyArray<{ type: string; text?: string }>) {
  return content.flatMap((item) =>
    item.type === "text" && item.text ? [{ type: "content" as const, content: { type: "text" as const, text: item.text } }] : [],
  )
}

/** A stored message as the updates that recreate it on a client that loads the session. */
export function replay(message: Message): Update[] {
  if (message.type === "user" || message.type === "synthetic")
    return message.text ? [{ sessionUpdate: "user_message_chunk", content: { type: "text", text: message.text } }] : []
  if (message.type !== "assistant") return []
  return message.content.flatMap((part): Update[] => {
    if (part.type === "text") return [{ sessionUpdate: "agent_message_chunk", content: { type: "text", text: part.text } }]
    if (part.type === "reasoning") return [{ sessionUpdate: "agent_thought_chunk", content: { type: "text", text: part.text } }]
    if (part.type !== "tool") return []
    const base = { toolCallId: part.id, title: part.name, kind: "other" as const }
    if (part.state.status === "completed")
      return [{ sessionUpdate: "tool_call", ...base, status: "completed", rawInput: part.state.input, content: toolContent(part.state.content) }]
    if (part.state.status === "error")
      return [{ sessionUpdate: "tool_call", ...base, status: "failed", rawInput: part.state.input }]
    return [{ sessionUpdate: "tool_call", ...base, status: "in_progress" }]
  })
}
