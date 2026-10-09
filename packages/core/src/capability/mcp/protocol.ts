import { Buffer } from "node:buffer"
import { Capability } from "@orchestra/schema/capability"
import type { Schema } from "effect"
import type { CapabilityDiscovery } from "../catalog/discovery"

export const versions = ["2025-03-26", "2025-06-18", "2025-11-25"] as const
export type Version = typeof versions[number]
export type CallResult = Readonly<{
  content: readonly Schema.Json[]
  structuredContent?: Schema.Json
  isError: boolean
}>
export type Message =
  | { kind: "response"; result: Schema.Json }
  | { kind: "notification" }
  | { kind: "request"; id: string | number; method: string }

export function failure(code: Capability.ErrorCode = "acquisition_failed", reason = "transport") {
  return new Capability.Failure({ code, message: `MCP ${reason} failed` })
}

/** Only expected failures become typed errors. Programming/allocation errors remain defects. */
export function expected(error: unknown): Capability.Failure {
  if (error instanceof Capability.Failure) return error
  throw error
}

export function object(value: Schema.Json): value is Schema.JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

/** JSON parsing does not recursively copy schemas or compile them. Depth bounds protect later hashing. */
export function parse(text: string): Schema.Json {
  const value: unknown = (() => {
    try { return JSON.parse(text) }
    catch (error) {
      if (error instanceof SyntaxError) throw failure("acquisition_failed", "JSON")
      throw error
    }
  })()
  const pending: { value: unknown; depth: number }[] = [{ value, depth: 0 }]
  while (pending.length) {
    const item = pending.pop()
    if (!item) break
    if (item.depth > 64) throw failure("quota_exceeded", "JSON depth")
    if (item.value === null || typeof item.value === "string" || typeof item.value === "boolean") continue
    if (typeof item.value === "number" && Number.isFinite(item.value)) continue
    if (typeof item.value !== "object") throw failure("acquisition_failed", "JSON value")
    Object.values(item.value).forEach((child) => pending.push({ value: child, depth: item.depth + 1 }))
  }
  // JSON.parse produced only JSON values; the traversal above also rejected non-finite numbers.
  return value as Schema.Json
}

export function message(value: Schema.Json, id: number): Message {
  if (!object(value) || value.jsonrpc !== "2.0") throw failure("acquisition_failed", "envelope")
  if (Object.hasOwn(value, "method")) {
    if (typeof value.method !== "string" || !value.method || Object.hasOwn(value, "result") || Object.hasOwn(value, "error") ||
      (value.params !== undefined && !object(value.params))) throw failure("acquisition_failed", "envelope")
    if (!Object.hasOwn(value, "id")) return { kind: "notification" }
    if (typeof value.id !== "string" && (typeof value.id !== "number" || !Number.isSafeInteger(value.id)))
      throw failure("acquisition_failed", "request ID")
    return { kind: "request", id: value.id, method: value.method }
  }
  if (value.id !== id || Object.hasOwn(value, "result") === Object.hasOwn(value, "error"))
    throw failure("acquisition_failed", "correlation")
  if (Object.hasOwn(value, "error")) {
    if (!object(value.error) || !Number.isSafeInteger(value.error.code) || typeof value.error.message !== "string")
      throw failure("acquisition_failed", "error envelope")
    throw failure("acquisition_failed", "remote error")
  }
  return { kind: "response", result: value.result }
}

export function initialize(value: Schema.Json): Version {
  if (!object(value) || typeof value.protocolVersion !== "string" ||
    !versions.some((version) => version === value.protocolVersion)) throw failure("unsupported_operation", "version")
  if (!object(value.capabilities) || !object(value.capabilities.tools)) throw failure("unsupported_operation", "tools capability")
  if (value.capabilities.tools.listChanged !== undefined && typeof value.capabilities.tools.listChanged !== "boolean")
    throw failure("acquisition_failed", "capabilities")
  if (!object(value.serverInfo) || typeof value.serverInfo.name !== "string" || typeof value.serverInfo.version !== "string" ||
    (value.instructions !== undefined && typeof value.instructions !== "string")) throw failure("acquisition_failed", "initialization")
  return value.protocolVersion as Version
}

export function page(value: Schema.Json) {
  if (!object(value) || !Array.isArray(value.tools)) throw failure("acquisition_failed", "tool list")
  if (value.nextCursor !== undefined && (typeof value.nextCursor !== "string" || !value.nextCursor ||
    Buffer.byteLength(value.nextCursor) > 4096)) throw failure("acquisition_failed", "cursor")
  const tools = value.tools.map((tool): CapabilityDiscovery.VendorTool => {
    if (!object(tool) || typeof tool.name !== "string" || !tool.name.trim() || tool.name.length > 256 ||
      (tool.description !== undefined && (typeof tool.description !== "string" || tool.description.length > 2048)) ||
      (tool.title !== undefined && typeof tool.title !== "string") || !schema(tool.inputSchema) ||
      (tool.outputSchema !== undefined && !schema(tool.outputSchema)) ||
      (tool.annotations !== undefined && !object(tool.annotations)) ||
      (tool.execution !== undefined && (!object(tool.execution) ||
        (tool.execution.taskSupport !== undefined && !["forbidden", "optional", "required"].includes(String(tool.execution.taskSupport))))))
      throw failure("acquisition_failed", "tool entry")
    return { name: tool.name, summary: tool.description ?? "", inputSchema: tool.inputSchema,
      ...(tool.outputSchema === undefined ? {} : { outputSchema: tool.outputSchema }) }
  })
  return { tools, raw: value.tools, nextCursor: value.nextCursor as string | undefined }
}

function schema(value: Schema.Json | undefined): value is Schema.Json {
  // Boolean schemas are intentionally preserved for the local vendor-schema validator.
  return value !== undefined && (typeof value === "boolean" || object(value))
}

export function callResult(value: Schema.Json): CallResult {
  if (!object(value) || !Array.isArray(value.content) ||
    (value.structuredContent !== undefined && !object(value.structuredContent)) ||
    (value.isError !== undefined && typeof value.isError !== "boolean") || !value.content.every(content))
    throw failure("acquisition_failed", "call result")
  return { content: value.content, isError: value.isError ?? false,
    ...(value.structuredContent === undefined ? {} : { structuredContent: value.structuredContent }) }
}

function content(value: Schema.Json) {
  if (!object(value)) return false
  if (value.type === "text") return typeof value.text === "string"
  if (value.type === "image" || value.type === "audio") return typeof value.data === "string" && typeof value.mimeType === "string"
  if (value.type === "resource_link") return typeof value.uri === "string" && typeof value.name === "string"
  if (value.type === "resource") return object(value.resource) && typeof value.resource.uri === "string" &&
    ((typeof value.resource.text === "string" && value.resource.blob === undefined) ||
      (typeof value.resource.blob === "string" && value.resource.text === undefined)) &&
    (value.resource.mimeType === undefined || typeof value.resource.mimeType === "string")
  return false
}

/** Counts exact encoded bytes before allocating a serialized request; no custom serializers/accessors. */
export function encode(value: Schema.Json, limit: number) {
  const budget = { bytes: 0 }
  const seen = new Set<object>()
  const add = (count: number) => {
    budget.bytes += count
    if (budget.bytes > limit) throw failure("quota_exceeded", "request bytes")
  }
  const string = (text: string) => {
    add(2)
    for (let index = 0; index < text.length; index++) {
      const code = text.charCodeAt(index)
      if (code === 34 || code === 92 || [8, 9, 10, 12, 13].includes(code)) { add(2); continue }
      if (code < 32) { add(6); continue }
      if (code >= 0xd800 && code <= 0xdbff && text.charCodeAt(index + 1) >= 0xdc00 && text.charCodeAt(index + 1) <= 0xdfff) {
        add(4); index++; continue
      }
      add(code >= 0xd800 && code <= 0xdfff ? 6 : code < 128 ? 1 : code < 2048 ? 2 : 3)
    }
  }
  const visit = (value: Schema.Json, depth: number): void => {
    if (depth > 64) throw failure("quota_exceeded", "request depth")
    if (value === null) { add(4); return }
    if (typeof value === "string") { string(value); return }
    if (typeof value === "boolean") { add(value ? 4 : 5); return }
    if (typeof value === "number" && Number.isFinite(value)) { add(String(value).length); return }
    if (typeof value !== "object" || seen.has(value) || "toJSON" in value ||
      (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null))
      throw failure("unsupported_operation", "request JSON")
    seen.add(value)
    const keys = Object.keys(value)
    if (Array.isArray(value) && (keys.length !== value.length || keys.some((key, index) => key !== String(index))))
      throw failure("unsupported_operation", "request array")
    add(2 + Math.max(0, keys.length - 1))
    keys.forEach((key) => {
      const property = Object.getOwnPropertyDescriptor(value, key)
      if (!property || !("value" in property)) throw failure("unsupported_operation", "request property")
      if (!Array.isArray(value)) { string(key); add(1) }
      visit(property.value, depth + 1)
    })
    seen.delete(value)
  }
  visit(value, 0)
  return JSON.stringify(value)
}
