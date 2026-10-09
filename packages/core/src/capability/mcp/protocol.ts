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
  | { kind: "error" }
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
  requireJson(value)
  return value
}

function requireJson(value: unknown): asserts value is Schema.Json {
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
}

export function message(value: Schema.Json, id: number): Message {
  if (!object(value) || value.jsonrpc !== "2.0") throw failure("acquisition_failed", "envelope")
  if (Object.hasOwn(value, "method")) {
    if (typeof value.method !== "string" || !value.method || Object.hasOwn(value, "result") || Object.hasOwn(value, "error") ||
      (value.params !== undefined && (!object(value.params) || !metadata(value.params)))) throw failure("acquisition_failed", "envelope")
    requireTraffic(value)
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
    return { kind: "error" }
  }
  if (!object(value.result) || !metadata(value.result)) throw failure("acquisition_failed", "result envelope")
  return { kind: "response", result: value.result }
}

function requireTraffic(value: Schema.JsonObject) {
  const params = object(value.params) ? value.params : undefined
  const request = Object.hasOwn(value, "id")
  if (request && params && object(params._meta) && params._meta.progressToken !== undefined &&
    typeof params._meta.progressToken !== "string" && !finite(params._meta.progressToken))
    throw failure("acquisition_failed", "request metadata")
  if (value.method === "ping" && !request) throw failure("acquisition_failed", "ping")
  if (value.method === "notifications/progress" && (request || !params ||
    (typeof params.progressToken !== "string" && !finite(params.progressToken)) || !finite(params.progress) ||
    (params.total !== undefined && !finite(params.total)) || (params.message !== undefined && typeof params.message !== "string")))
    throw failure("acquisition_failed", "progress notification")
  if (value.method === "notifications/message" && (request || !params ||
    !["debug", "info", "notice", "warning", "error", "critical", "alert", "emergency"].some((level) => level === params.level) ||
    !Object.hasOwn(params, "data") || (params.logger !== undefined && typeof params.logger !== "string")))
    throw failure("acquisition_failed", "logging notification")
  if (value.method === "notifications/tools/list_changed" && (request || params && Object.keys(params).some((key) => key !== "_meta")))
    throw failure("acquisition_failed", "list notification")
}

function finite(value: Schema.Json | undefined) {
  return typeof value === "number" && Number.isFinite(value)
}

export function initialize(value: Schema.Json): Version {
  if (!object(value)) throw failure("acquisition_failed", "initialization")
  const version = versions.find((version) => version === value.protocolVersion)
  if (!version) throw failure("unsupported_operation", "version")
  if (!object(value.capabilities) || !object(value.capabilities.tools)) throw failure("unsupported_operation", "tools capability")
  if (value.capabilities.tools.listChanged !== undefined && typeof value.capabilities.tools.listChanged !== "boolean")
    throw failure("acquisition_failed", "capabilities")
  if (!object(value.serverInfo) || typeof value.serverInfo.name !== "string" || typeof value.serverInfo.version !== "string" ||
    ["title", "description", "websiteUrl"].some((key) => object(value.serverInfo) &&
      value.serverInfo[key] !== undefined && typeof value.serverInfo[key] !== "string") ||
    !icons(value.serverInfo.icons) ||
    (value.instructions !== undefined && typeof value.instructions !== "string")) throw failure("acquisition_failed", "initialization")
  return version
}

export function page(value: Schema.Json) {
  if (!object(value) || !Array.isArray(value.tools)) throw failure("acquisition_failed", "tool list")
  if (value.nextCursor !== undefined && (typeof value.nextCursor !== "string" || !value.nextCursor ||
    Buffer.byteLength(value.nextCursor) > 4096)) throw failure("acquisition_failed", "cursor")
  const tools = value.tools.map((tool): CapabilityDiscovery.VendorTool => {
    if (!object(tool) || typeof tool.name !== "string" || !tool.name.trim() || tool.name.length > 256 ||
      (tool.description !== undefined && (typeof tool.description !== "string" || tool.description.length > 2048)) ||
      (tool.title !== undefined && typeof tool.title !== "string") || !metadata(tool) || !schema(tool.inputSchema) ||
      (tool.outputSchema !== undefined && !schema(tool.outputSchema)) ||
      (tool.annotations !== undefined && (!object(tool.annotations) ||
        ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"].some((key) =>
          object(tool.annotations) && tool.annotations[key] !== undefined && typeof tool.annotations[key] !== "boolean") ||
        (tool.annotations.title !== undefined && typeof tool.annotations.title !== "string"))) ||
      !icons(tool.icons) ||
      (tool.execution !== undefined && (!object(tool.execution) ||
        (tool.execution.taskSupport !== undefined && tool.execution.taskSupport !== "forbidden" &&
          tool.execution.taskSupport !== "optional" && tool.execution.taskSupport !== "required"))))
      throw failure("acquisition_failed", "tool entry")
    if (object(tool.execution) && tool.execution.taskSupport === "required")
      throw failure("unsupported_operation", "task-required tool")
    return { name: tool.name, summary: tool.description ?? "", inputSchema: tool.inputSchema,
      ...(tool.outputSchema === undefined ? {} : { outputSchema: tool.outputSchema }) }
  })
  return { tools, raw: value.tools, nextCursor: typeof value.nextCursor === "string" ? value.nextCursor : undefined }
}

function schema(value: Schema.Json | undefined): value is Schema.Json {
  // Boolean roots are a native extension, not conforming MCP object-form schemas.
  return value !== undefined && (typeof value === "boolean" || object(value) && value.type === "object" &&
    (value.$schema === undefined || typeof value.$schema === "string") &&
    (value.properties === undefined || object(value.properties)) &&
    (value.required === undefined || Array.isArray(value.required) && value.required.every((key) => typeof key === "string")))
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
  if (!object(value) || !metadata(value) || !annotations(value.annotations)) return false
  if (value.type === "text") return typeof value.text === "string"
  if (value.type === "image" || value.type === "audio") return typeof value.data === "string" && typeof value.mimeType === "string"
  if (value.type === "resource_link") return typeof value.uri === "string" && typeof value.name === "string" &&
    ["title", "description", "mimeType"].every((key) => value[key] === undefined || typeof value[key] === "string") &&
    (value.size === undefined || typeof value.size === "number") && icons(value.icons)
  if (value.type === "resource") return object(value.resource) && typeof value.resource.uri === "string" &&
    (typeof value.resource.text === "string" || typeof value.resource.blob === "string") &&
    (value.resource.mimeType === undefined || typeof value.resource.mimeType === "string") && metadata(value.resource)
  return false
}

function metadata(value: Schema.JsonObject) {
  return value._meta === undefined || object(value._meta)
}

function annotations(value: Schema.Json | undefined) {
  return value === undefined || object(value) &&
    (value.audience === undefined || Array.isArray(value.audience) && value.audience.every((role) => role === "user" || role === "assistant")) &&
    (value.priority === undefined || typeof value.priority === "number" && value.priority >= 0 && value.priority <= 1) &&
    (value.lastModified === undefined || typeof value.lastModified === "string")
}

function icons(value: Schema.Json | undefined) {
  return value === undefined || Array.isArray(value) && value.every((icon) => object(icon) && typeof icon.src === "string" &&
    (icon.mimeType === undefined || typeof icon.mimeType === "string") &&
    (icon.sizes === undefined || Array.isArray(icon.sizes) && icon.sizes.every((size) => typeof size === "string")) &&
    (icon.theme === undefined || icon.theme === "light" || icon.theme === "dark"))
}

/** Descriptor-checked detached JSON, bounded before copying or serializing; never execute accessors/toJSON. */
export function snapshot(value: Schema.Json, limit: number) {
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
  const copy = (value: Schema.Json, depth: number): Schema.Json => {
    if (depth > 64) throw failure("quota_exceeded", "request depth")
    if (value === null) { add(4); return value }
    if (typeof value === "string") { string(value); return value }
    if (typeof value === "boolean") { add(value ? 4 : 5); return value }
    if (typeof value === "number" && Number.isFinite(value)) { add(String(value).length); return value }
    if (typeof value !== "object" || seen.has(value) ||
      (Array.isArray(value) && Object.getPrototypeOf(value) !== Array.prototype) ||
      (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null))
      throw failure("unsupported_operation", "request JSON")
    const serializer = Object.getOwnPropertyDescriptor(value, "toJSON")
    if (serializer && (!("value" in serializer) || typeof serializer.value === "function"))
      throw failure("unsupported_operation", "request serializer")
    seen.add(value)
    const keys = Object.keys(value)
    if (Array.isArray(value) && (keys.length !== value.length || keys.some((key, index) => key !== String(index))))
      throw failure("unsupported_operation", "request array")
    add(2 + Math.max(0, keys.length - 1))
    const result: Schema.Json = Array.isArray(value) ? [] : Object.create(null)
    keys.forEach((key) => {
      const property = Object.getOwnPropertyDescriptor(value, key)
      if (!property || !("value" in property)) throw failure("unsupported_operation", "request property")
      if (!Array.isArray(value)) { string(key); add(1) }
      Object.defineProperty(result, key, { value: copy(property.value, depth + 1), enumerable: true })
    })
    seen.delete(value)
    return Object.freeze(result)
  }
  return copy(value, 0)
}

export function encode(value: Schema.Json, limit: number) {
  return JSON.stringify(snapshot(value, limit))
}
