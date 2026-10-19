import type { SessionPrompt } from "./prompt"
import type { Schema } from "effect"
import { isRecord } from "@/util/record"

/** Original schema-encoded request, before defaults, attachments or plugins. IDs bind separately. */
export function fromEncoded(input: typeof SessionPrompt.PromptInput.Encoded) {
  const { sessionID: _, messageID: __, noReply: ___, ...request } = input
  return JSON.stringify(canonical(request))
}

// Build plain JSON values ourselves: inherited or supplied toJSON methods must never run.
function canonical(value: unknown): typeof Schema.Json.Type {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (Array.isArray(value)) return value.map(canonical)
  if (isRecord(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)))
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .flatMap((key) => (value[key] === undefined ? [] : [[key, canonical(value[key])]])),
    )
  throw new Error("Prompt identity requires JSON-compatible values")
}

export * as PromptIdentity from "./prompt-identity"
