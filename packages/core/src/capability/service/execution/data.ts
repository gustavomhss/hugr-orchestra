export * as CapabilityServiceData from "./data"

import { Capability } from "@orchestra/schema/capability"
import type { Credential } from "@orchestra/schema/credential"
import { Option, Schema } from "effect"
import { CapabilityVendorSchema } from "../../catalog/schema"
import { CapabilityServiceSchema } from "../schema"

const Envelope = Schema.Struct({ provider: Schema.String, input: CapabilityServiceSchema.CallInput,
  context: Schema.Struct({ sessionID: Capability.InvocationRef.fields.sessionID, agent: Capability.InvocationRef.fields.agentID,
    assistantMessageID: Capability.InvocationRef.fields.assistantMessageID, toolCallID: Schema.NonEmptyString }),
})
const providers = new Set(["cloudflare", "supabase", "vercel", "neon", "railway", "sentry", "grafana", "globalping",
  "linear", "stripe", "netlify", "prisma_postgres"])

/** Descriptor-only traversal before VendorSchema.snapshot: that shared copier reads enumerable values. */
export function snapshot(value: unknown): Schema.Json | Capability.Failure {
  const seen = new Set<object>()
  const budget = { nodes: 0, bytes: 0 }
  const copy = (value: unknown, depth: number): Schema.Json | Capability.Failure => {
    if (++budget.nodes > 4096 || depth > 64) return failure("quota_exceeded")
    if (value === null || typeof value === "boolean") return value
    if (typeof value === "number") return Number.isFinite(value) ? value : failure("unsupported_schema")
    if (typeof value === "string") {
      budget.bytes += Buffer.byteLength(value)
      return budget.bytes <= 262144 ? value : failure("quota_exceeded")
    }
    if (typeof value !== "object" || seen.has(value)) return failure("unsupported_schema")
    if (Object.getPrototypeOf(value) !== (Array.isArray(value) ? Array.prototype : Object.prototype) &&
      (Array.isArray(value) || Object.getPrototypeOf(value) !== null)) return failure("unsupported_schema")
    const serializer = Object.getOwnPropertyDescriptor(value, "toJSON")
    if (serializer && (!("value" in serializer) || typeof serializer.value === "function")) return failure("unsupported_schema")
    const keys = Object.keys(value)
    if (keys.length > 4096 - budget.nodes || Array.isArray(value) &&
      (keys.length !== value.length || keys.some((key, index) => key !== String(index)))) return failure("quota_exceeded")
    seen.add(value)
    const result: Schema.Json = Array.isArray(value) ? [] : {}
    const invalid = keys.some((key) => {
      const property = Object.getOwnPropertyDescriptor(value, key)
      if (!property || !("value" in property)) return true
      budget.bytes += Buffer.byteLength(key)
      if (budget.bytes > 262144) return true
      const child = copy(property.value, depth + 1)
      if (child instanceof Capability.Failure) return true
      Object.defineProperty(result, key, { value: child, enumerable: true })
      return false
    })
    seen.delete(value)
    return invalid ? failure("unsupported_schema") : Object.freeze(result)
  }
  const copied = copy(value, 0)
  return copied instanceof Capability.Failure ? copied : CapabilityVendorSchema.snapshot(copied)
}

export function input(value: unknown) {
  const fixed = snapshot(value)
  if (fixed instanceof Capability.Failure) return fixed
  const decoded = Schema.decodeUnknownOption(Envelope)(fixed)
  if (Option.isNone(decoded)) return failure("unsupported_schema")
  const provider = decoded.value.provider.trim().toLowerCase().replaceAll("-", "_")
  if (!providers.has(provider)) return failure("unsupported_operation")
  return { ...decoded.value, provider, context: Object.freeze(decoded.value.context) }
}

export function object(value: Schema.Json): value is Schema.JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

/** Explicit host argument profile only; endpoint, headers and inferred semantic fields grant nothing. */
export function argumentsFor(supplied: Schema.Json, resource: Schema.Json) {
  const selected = snapshot(resource)
  if (selected instanceof Capability.Failure) return selected
  if (!object(supplied) || !object(selected) || Object.keys(selected).some((key) => key !== "arguments") ||
    (selected.arguments !== undefined && !object(selected.arguments))) return failure("target_denied")
  const bound = selected.arguments === undefined ? {} : selected.arguments
  if (!object(bound)) return failure("target_denied")
  if (Object.keys(bound).some((key) => Object.hasOwn(supplied, key) &&
    CapabilityVendorSchema.hash(supplied[key]) !== CapabilityVendorSchema.hash(bound[key]))) return failure("target_denied")
  return snapshot({ ...supplied, ...bound })
}

export function credentialIdentity(value: Credential.Value) {
  return value.type === "key" ? JSON.stringify([value.type, value.key])
    : JSON.stringify([value.type, value.methodID, value.access, value.refresh, value.expires])
}

/** Validate raw vendor data first. Projection intentionally need not satisfy the vendor schema after redaction. */
export function redact(value: Schema.Json, credential: Credential.Value, endpoint: string) {
  const secrets = (credential.type === "key" ? [credential.key] : [credential.access, credential.refresh])
    .concat(endpoint).filter((value) => value.length > 0).sort((a, b) => b.length - a.length)
  const state = { redacted: false }
  const text = (value: string) => secrets.reduce((value, secret) => {
    if (value.includes(secret)) state.redacted = true
    return value.replaceAll(secret, "[REDACTED]")
  }, value)
  const hidden = new Set(["headers", "authorization", "credential", "credentials", "scopes", "endpoint", "sessionID",
    "session_id", "mcp-session-id", "proof", "rules", "effectiveRules", "nativeDenyFloor", "_meta"])
  const copy = (value: Schema.Json): Schema.Json => {
    if (typeof value === "string") return text(value)
    if (!value || typeof value !== "object") return value
    if (Array.isArray(value)) return value.map(copy)
    if (!object(value)) return null
    return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
      if (hidden.has(key) || (value.type === "image" || value.type === "audio") && key === "data" || key === "blob") {
        state.redacted = true
        return []
      }
      return [[text(key), copy(item)]]
    }))
  }
  const data = copy(value)
  return { data, redacted: state.redacted }
}

export function failure(code: Capability.Failure["code"]) {
  return new Capability.Failure({ code, message: "Service call unavailable" })
}
