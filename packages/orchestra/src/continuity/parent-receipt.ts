export * as ParentReceipt from "./parent-receipt"

import type { ParentRequest } from "./fork"
import type { SessionV1 } from "@orchestra/core/v1/session"
import type { MessageID } from "@/session/schema"
import type { Provider } from "@/provider/provider"
import type { MemorySnapshot } from "./memory-types"
import { fingerprint } from "./model"
import { asSchema, jsonSchema } from "ai"
import { createHash } from "node:crypto"
import { LLMPrepared } from "@/session/llm/prepared"

// Process-local host receipts are not a provider/user flag and cannot be forged by a JSON request.
const receipts = new WeakMap<ParentRequest, { response: MessageID; provider: string; model: string; prefix: string; plan?: LLMPrepared.Plan; sources: { id: MessageID; digest: string }[]; input?: number }>()

export function capture(parent: ParentRequest, response: MessageID, sources: SessionV1.WithParts[]) {
  if (sources.length !== parent.messageIDs.length || sources.some((source, index) => source.info.id !== parent.messageIDs[index])) return parent
  const input = LLMPrepared.snapshot(parent.input)
  const entries = Object.entries(input.tools).map(([name, tool]) => {
    const schema = asSchema(tool.inputSchema)
    if (schema.jsonSchema instanceof Promise) return undefined
    return [name, { ...tool, inputSchema: jsonSchema(structuredClone(schema.jsonSchema), { validate: schema.validate }) }] as const
  })
  if (entries.some((entry) => !entry)) return parent
  input.tools = Object.fromEntries(entries.filter((entry) => entry !== undefined))
  const captured = { input, messageIDs: [...parent.messageIDs] }
  receipts.set(captured, { response, provider: input.model.providerID, model: input.model.id, prefix: signature(captured), plan: input.prepared,
    sources: sources.map((source) => ({ id: source.info.id, digest: fingerprint(source) })) })
  return captured
}

export function complete(parent: ParentRequest, message: SessionV1.Assistant) {
  const receipt = receipts.get(parent)
  if (!receipt || receipt.response !== message.id || receipt.provider !== message.providerID || receipt.model !== message.modelID ||
    message.sessionID !== parent.input.sessionID || message.time.completed === undefined) return
  const input = message.tokens.input + message.tokens.cache.read + message.tokens.cache.write
  if (Number.isFinite(input) && input > 0) receipt.input = input
}

export function usage(parent: ParentRequest, snapshot: MemorySnapshot, model: Provider.Model) {
  return matches(parent, snapshot, model) ? receipts.get(parent)?.input : undefined
}

export function matches(parent: ParentRequest, snapshot: MemorySnapshot, model: Provider.Model) {
  const receipt = receipts.get(parent)
  const history = snapshot.covered ?? [...snapshot.head, ...snapshot.tail]
  const last = history.findLast((message) => message.info.role === "assistant")?.info
  if (!receipt || parent.input.prepared !== receipt.plan || parent.input.sessionID !== snapshot.sessionID || signature(parent) !== receipt.prefix || !receipt.input || !last || last.role !== "assistant" || receipt.response !== last.id || receipt.response !== snapshot.boundary ||
    receipt.provider !== model.providerID || receipt.model !== model.id || last.providerID !== model.providerID || last.modelID !== model.id) return false
  const positions = parent.messageIDs.map((id) => history.findIndex((message) => message.info.id === id))
  return positions.every((position, index) => position >= 0 && (index === 0 || position > positions[index - 1])) &&
    receipt.sources.every((source, index) => source.id === parent.messageIDs[index] &&
      history[positions[index]].info.sessionID === snapshot.sessionID && source.digest === fingerprint(history[positions[index]]))
}

function signature(parent: ParentRequest) {
  const input = parent.input
  const tools = Object.entries(input.tools).map(([name, tool]) => ({ name,
    definition: Object.fromEntries(Object.entries(tool).filter(([key]) => !["inputSchema", "execute"].includes(key))), schema: asSchema(tool.inputSchema).jsonSchema }))
  return createHash("sha256").update(JSON.stringify({ sessionID: input.sessionID, parentSessionID: input.parentSessionID,
    contextMemory: input.contextMemory, purpose: input.purpose, model: input.model, user: input.user, agent: input.agent, permission: input.permission,
    system: input.system, messages: input.messages, tools, responseSchema: input.responseSchema, toolChoice: input.toolChoice,
    small: input.small, retries: input.retries, params: input.preflightParams, ids: parent.messageIDs })).digest("hex")
}
