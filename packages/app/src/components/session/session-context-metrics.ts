import type { AssistantMessage, Message } from "@opencode-ai/sdk/v2/client"

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
  input: number
  total: number
  usage: number | null
}

const tokenTotal = (msg: AssistantMessage) => {
  return msg.tokens.input + msg.tokens.output + msg.tokens.reasoning + msg.tokens.cache.read + msg.tokens.cache.write
}

const lastAssistantWithTokens = (messages: Message[]) => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role !== "assistant") continue
    if ("synthetic" in msg && msg.synthetic === true) continue
    if (!msg.tokens?.cache) continue
    if ("tokensAvailable" in msg && msg.tokensAvailable === false) continue
    if (!Number.isFinite(tokenTotal(msg))) continue
    if (tokenTotal(msg) <= 0 && msg.time.completed === undefined) continue
    return msg
  }
}

const build = (messages: Message[] = [], providers: Provider[] = []): Context | undefined => {
  const message = lastAssistantWithTokens(messages)
  if (!message) return undefined

  const provider = providers.find((item) => item.id === message.providerID)
  const model = provider?.models[message.modelID]
  const limit = model?.limit.context
  const total = tokenTotal(message)

  return {
    message,
    provider,
    model,
    providerLabel: provider?.name ?? message.providerID,
    modelLabel: model?.name ?? message.modelID,
    limit,
    input: message.tokens.input,
    total,
    usage: limit ? Math.round((total / limit) * 100) : null,
  }
}

export function getSessionContext(messages: Message[] = [], providers: Provider[] = []) {
  return build(messages, providers)
}

export function getSessionCost(
  cost: number | null | undefined,
  messages: Message[] | undefined,
  providers: Provider[],
) {
  if (cost === undefined || cost === null || !Number.isFinite(cost)) return undefined
  if (!messages) return cost !== 0 ? cost : undefined
  // A zero aggregate is also the server default when pricing or cost reports are absent.
  const unknown = messages.some((message) => {
    if (message.role !== "assistant") return false
    if ("synthetic" in message && message.synthetic === true) return false
    if ("costAvailable" in message && message.costAvailable === false) return true
    if (!Number.isFinite(message.cost)) return true
    if (message.cost !== 0) return false
    const model = providers.find((provider) => provider.id === message.providerID)?.models[message.modelID]
    if (!model?.cost) return true
    if ("costAvailable" in model && model.costAvailable === false) return true
    return !Number.isFinite(model.cost.input) || !Number.isFinite(model.cost.output)
  })
  return unknown ? undefined : cost
}
