import type { Admission, Limits } from "./contracts"
import type { Schema } from "effect"
import { parseTree } from "jsonc-parser"
import type { Node, ParseError } from "jsonc-parser"
import { isAlias, isMap, isScalar, isSeq, parseDocument } from "yaml"

export function admit(value: unknown, limits?: Partial<Limits>): Admission {
  const bounded = effectiveLimits(limits)
  if (!bounded) return problem("", "limit")
  const result = clone(value, "", 0, bounded, new WeakSet(), { remaining: bounded.maxBytes })
  if (!result.ok) return result
  // Only the newly admitted data is serialized, never the caller's object graph.
  if (new TextEncoder().encode(JSON.stringify(result.value)).length > bounded.maxBytes) return problem("", "limit")
  return result
}

export function parse(text: string, format: "json" | "yaml", limits?: Partial<Limits>): Admission {
  const bounded = effectiveLimits(limits)
  if (!bounded) return problem("", "limit")
  if (typeof text !== "string") return problem("")
  if (new TextEncoder().encode(text).length > bounded.maxBytes) return problem("", "limit")
  const decoded = format === "json" ? decodeJson(text, bounded) : format === "yaml" ? decodeYaml(text, bounded) : problem("")
  return decoded.ok ? admit(decoded.value, bounded) : decoded
}

function effectiveLimits(limits?: Partial<Limits>): Limits | undefined {
  const maxBytes = limits?.maxBytes === undefined ? 262144 : limits.maxBytes
  const maxDepth = limits?.maxDepth === undefined ? 16 : limits.maxDepth
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || !Number.isSafeInteger(maxDepth) || maxDepth <= 0) return
  return { maxBytes: Math.min(262144, maxBytes), maxDepth: Math.min(16, maxDepth) }
}

function problem(path: string, code: "invalid-input" | "limit" = "invalid-input"): Admission {
  return { ok: false, diagnostics: [{ path, code, messageKey: `fabric.declaration.${code}` }] }
}

function pointer(path: string, key: string) {
  return `${path}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`
}

function inspect(value: object) {
  // Reflection may throw for a revoked proxy. Do not expose that exception or its payload.
  try {
    return { prototype: Object.getPrototypeOf(value), descriptors: Object.getOwnPropertyDescriptors(value) }
  } catch {
    return undefined
  }
}

function clone(value: unknown, path: string, depth: number, limits: Limits, ancestors: WeakSet<object>, budget: { remaining: number }): Admission {
  budget.remaining -= 1
  if (budget.remaining < 0) return problem(path, "limit")
  if (value === null || typeof value === "boolean") return { ok: true, value }
  if (typeof value === "string") {
    if (new TextEncoder().encode(value).length > limits.maxBytes) return problem(path, "limit")
    return { ok: true, value }
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) return problem(path)
    return { ok: true, value }
  }
  if (typeof value !== "object") return problem(path)
  if (depth >= limits.maxDepth) return problem(path, "limit")
  if (ancestors.has(value)) return problem(path)
  const shape = inspect(value)
  if (!shape) return problem(path)
  const array = Array.isArray(value)
  if (array ? shape.prototype !== Array.prototype : shape.prototype !== Object.prototype && shape.prototype !== null) return problem(path)
  const keys = Reflect.ownKeys(shape.descriptors)
  if (keys.length > limits.maxBytes + 1) return problem(path, "limit")
  const length: unknown = shape.descriptors.length?.value
  if (array && (typeof length !== "number" || keys.length !== length + 1)) return problem(path)
  // Check every descriptor before reading any data, including non-enumerable accessors.
  for (const key of keys) {
    if (typeof key !== "string") return problem(path)
    const descriptor = shape.descriptors[key]
    if (!descriptor || !("value" in descriptor)) return problem(pointer(path, key))
    if (array && key === "length") continue
    if (!descriptor.enumerable) return problem(pointer(path, key))
    if (array && (!/^(0|[1-9][0-9]*)$/.test(key) || typeof length !== "number" || Number(key) >= length)) return problem(pointer(path, key))
  }
  ancestors.add(value)
  const output: Schema.Json = array ? [] : {}
  for (const key of keys) {
    if (typeof key !== "string" || (array && key === "length")) continue
    const child: unknown = shape.descriptors[key]?.value
    const result = clone(child, pointer(path, key), depth + 1, limits, ancestors, budget)
    if (!result.ok) return result
    // Defining own data properties keeps __proto__ and constructor inert.
    Object.defineProperty(output, key, { value: result.value, enumerable: true, writable: true, configurable: true })
  }
  ancestors.delete(value)
  return { ok: true, value: output }
}

function jsonSyntax(text: string) {
  const errors: ParseError[] = []
  try {
    const root = parseTree(text, errors, { disallowComments: true, allowTrailingComma: false, allowEmptyContent: false })
    return errors.length === 0 ? root : undefined
  } catch {
    // The library's recursive syntax parser can reject excessively nested input by throwing.
    return undefined
  }
}

function decodeJson(text: string, limits: Limits): Admission {
  const root = jsonSyntax(text)
  return root ? jsonNode(root, "", 0, limits) : problem("")
}

function jsonNode(node: Node, path: string, depth: number, limits: Limits): Admission {
  if (node.type !== "object" && node.type !== "array") {
    const value: unknown = node.value
    return admit(value, limits)
  }
  if (depth >= limits.maxDepth) return problem(path, "limit")
  const output: Schema.Json = node.type === "array" ? [] : {}
  const keys = new Set<string>()
  for (const [index, child] of (node.children ?? []).entries()) {
    const key: unknown = node.type === "array" ? String(index) : child.children?.[0]?.value
    const entry = node.type === "array" ? child : child.children?.[1]
    if (typeof key !== "string" || !entry || keys.has(key)) return problem(path)
    keys.add(key)
    const result = jsonNode(entry, pointer(path, key), depth + 1, limits)
    if (!result.ok) return result
    Object.defineProperty(output, key, { value: result.value, enumerable: true, writable: true, configurable: true })
  }
  return { ok: true, value: output }
}

function yamlSyntax(text: string) {
  try {
    return parseDocument(text, {
      version: "1.2", schema: "core", customTags: [], resolveKnownTags: false,
      strict: true, uniqueKeys: true, prettyErrors: false,
    })
  } catch {
    return undefined
  }
}

function decodeYaml(text: string, limits: Limits): Admission {
  const document = yamlSyntax(text)
  if (!document || document.errors.length || document.warnings.length || document.contents === null) return problem("")
  return yamlNode(document.contents, "", 0, limits)
}

function yamlNode(node: unknown, path: string, depth: number, limits: Limits): Admission {
  if (node === null) return { ok: true, value: null }
  if (isAlias(node)) return problem(path)
  if (!isScalar(node) && !isMap(node) && !isSeq(node)) return problem(path)
  if (node.tag !== undefined || node.anchor !== undefined) return problem(path)
  if (isScalar(node)) return admit(node.value, limits)
  if (depth >= limits.maxDepth) return problem(path, "limit")
  const output: Schema.Json = isSeq(node) ? [] : {}
  const keys = new Set<string>()
  if (isSeq(node)) {
    for (const [index, child] of node.items.entries()) {
      const result = yamlNode(child, pointer(path, String(index)), depth + 1, limits)
      if (!result.ok) return result
      Object.defineProperty(output, String(index), { value: result.value, enumerable: true, writable: true, configurable: true })
    }
    return { ok: true, value: output }
  }
  for (const pair of node.items) {
    if (!isScalar(pair.key) || typeof pair.key.value !== "string" || pair.key.tag !== undefined || pair.key.anchor !== undefined) return problem(path)
    const key = pair.key.value
    if (keys.has(key)) return problem(path)
    keys.add(key)
    const result = yamlNode(pair.value, pointer(path, key), depth + 1, limits)
    if (!result.ok) return result
    Object.defineProperty(output, key, { value: result.value, enumerable: true, writable: true, configurable: true })
  }
  return { ok: true, value: output }
}
