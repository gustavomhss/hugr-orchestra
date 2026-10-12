import type { AssistantMessage, Message, Part } from "@orchestra/sdk/v2/client"

type Parts = Record<string, Part[] | undefined>

type Provider = {
  id: string
  name?: string
  models: Record<string, Model | undefined>
}

type Model = {
  name?: string
  cost?: { input: number; output: number }
  limit: {
    context: number
  }
}

type Context = {
  message: AssistantMessage
  provider?: Provider
  model?: Model
  providerLabel: string
  modelLabel: string
  limit: number | undefined
  input: number | undefined
  total: number
  usage: number | null
}

const tokenTotal = (msg: AssistantMessage) => {
  return msg.tokens.input + msg.tokens.output + msg.tokens.reasoning + msg.tokens.cache.read + msg.tokens.cache.write
}

const lastAssistantWithTokens = (messages: Message[], parts: Parts) => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role !== "assistant") continue
    if (syntheticAssistant(msg, parts)) continue
    if (!msg.tokens?.cache) continue
    if ("tokensAvailable" in msg && msg.tokensAvailable === false) continue
    if (!Number.isFinite(tokenTotal(msg))) continue
    if (tokenTotal(msg) <= 0 && msg.time.completed === undefined) continue
    return msg
  }
}

const build = (messages: Message[] = [], providers: Provider[] = [], parts: Parts = {}, metadata?: Record<string, unknown>): Context | undefined => {
  const message = lastAssistantWithTokens(messages, parts)
  if (!message) return undefined

  const provider = providers.find((item) => item.id === message.providerID)
  const model = provider?.models[message.modelID]
  const host = hostUsage(metadata, message)
  const limit = host?.context?.maxTokens ?? host?.contextWindow ?? model?.limit.context
  const total = host?.context?.totalTokens ?? tokenTotal(message)

  return {
    message,
    provider,
    model,
    providerLabel: provider?.name ?? message.providerID,
    modelLabel: model?.name ?? message.modelID,
    limit,
    // The snapshot has no input/output split; old assistant input would misstate post-compaction context.
    input: host?.context ? undefined : message.tokens.input,
    total,
    usage: host?.context?.percentage ?? (limit ? Math.round((total / limit) * 100) : null),
  }
}

export function getSessionContext(messages: Message[] = [], providers: Provider[] = [], parts: Parts = {}, metadata?: Record<string, unknown>) {
  return build(messages, providers, parts, metadata)
}

export function getSessionCost(
  cost: number | null | undefined,
  messages: Message[] | undefined,
  providers: Provider[],
  parts: Parts = {},
  metadata?: Record<string, unknown>,
) {
  const native = messages?.filter((message): message is AssistantMessage =>
    message.role === "assistant" && !syntheticAssistant(message, parts) && nativeMessage(metadata, message)) ?? []
  const host = metadata?.claudeCode
  const reported = native.length && record(host) && typeof host.cost === "number" && Number.isFinite(host.cost) && host.cost >= 0
    ? host.cost : undefined
  // Loaded messages may be only a page. Preserve the aggregate and use native + ordinary charges as a floor.
  const mixed = reported === undefined ? undefined : reported + (messages ?? []).reduce((sum, message) =>
    sum + (message.role === "assistant" && !syntheticAssistant(message, parts) && !nativeMessage(metadata, message) &&
      Number.isFinite(message.cost) && message.cost >= 0 ? message.cost : 0), 0)
  if (cost === undefined || cost === null || !Number.isFinite(cost))
    return reported !== undefined && messages?.every((message) => message.role !== "assistant" ||
      syntheticAssistant(message, parts) || nativeMessage(metadata, message)) ? reported : undefined
  if (!messages) return cost !== 0 ? cost : undefined
  // A zero aggregate is also the server default when pricing or cost reports are absent.
  const unknown = messages.some((message) => {
    if (message.role !== "assistant") return false
    if (syntheticAssistant(message, parts)) return false
    if (reported !== undefined && nativeMessage(metadata, message)) return false
    if ("costAvailable" in message && message.costAvailable === false) return true
    if (!Number.isFinite(message.cost)) return true
    if (message.cost !== 0) return false
    const model = providers.find((provider) => provider.id === message.providerID)?.models[message.modelID]
    if (!model?.cost) return true
    if ("costAvailable" in model && model.costAvailable === false) return true
    return !Number.isFinite(model.cost.input) || !Number.isFinite(model.cost.output)
  })
  return unknown ? undefined : Math.max(cost, mixed ?? cost)
}

// The host reports native usage durably. The UI's V2 provider catalog can be absent or stale and is separate from
// the legacy provider catalog the host updates, so a matching SDK model report takes precedence over list pricing.
function hostUsage(metadata: Record<string, unknown> | undefined, message: AssistantMessage) {
  const host = metadata?.claudeCode
  if (!nativeMessage(metadata, message) || !record(host) || !record(host.modelUsage)) return
  const usage = host.modelUsage[message.modelID] ?? Object.values(host.modelUsage).find((value) =>
    record(value) && value.canonicalModel === message.modelID)
  if (!record(usage)) return
  return {
    context: record(host.context) &&
      typeof host.context.totalTokens === "number" && Number.isFinite(host.context.totalTokens) && host.context.totalTokens >= 0 &&
      typeof host.context.maxTokens === "number" && Number.isFinite(host.context.maxTokens) && host.context.maxTokens > 0 &&
      typeof host.context.percentage === "number" && Number.isFinite(host.context.percentage) &&
      host.context.percentage >= 0
      ? { totalTokens: host.context.totalTokens, maxTokens: host.context.maxTokens, percentage: host.context.percentage } : undefined,
    contextWindow: typeof usage.contextWindow === "number" && Number.isFinite(usage.contextWindow) && usage.contextWindow > 0
      ? usage.contextWindow : undefined,
  }
}

// Native UUIDs are keyed by Orchestra message ID, independent of provider/model identity.
function nativeMessage(metadata: Record<string, unknown> | undefined, message: AssistantMessage) {
  const host = metadata?.claudeCode
  return record(host) && record(host.uuids) && typeof host.uuids[message.id] === "string" && host.uuids[message.id] !== ""
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function syntheticAssistant(message: AssistantMessage, parts: Parts) {
  if ("synthetic" in message && message.synthetic === true) return true
  if (message.finish !== undefined || message.cost !== 0 || !message.tokens?.cache || tokenTotal(message) !== 0)
    return false
  const content = parts[message.id]
  if (content?.length !== 1 || content[0].type !== "tool" || content[0].tool !== "bash") return false
  // V1 shellImpl has no message-level marker; its synthetic parent is the wire provenance.
  return (
    parts[message.parentID]?.some(
      (part) =>
        part.type === "text" && part.synthetic === true && part.text === "The following tool was executed by the user",
    ) === true
  )
}
