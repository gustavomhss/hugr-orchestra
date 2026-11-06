export * as BoundedJson from "./json"

import type { Admission, Limits } from "./contracts"
import type { Schema } from "effect"
import { parseTree } from "jsonc-parser"
import type { Node, ParseError } from "jsonc-parser"
import { isAlias, isMap, isScalar, isSeq, parseDocument } from "yaml"

type Budget = { remaining: number }

export function admit(value: unknown, profile: "workspace" | "package", limits?: Partial<Limits>): Admission {
  const bounded = effectiveLimits(profile, limits)
  if (!bounded) return problem("", "limit")
  return clone(value, "", 0, bounded, new WeakSet(), { remaining: bounded.maxBytes })
}

export function parse(text: string, format: "json" | "yaml", profile: "workspace" | "package", limits?: Partial<Limits>): Admission {
  const bounded = effectiveLimits(profile, limits)
  if (!bounded) return problem("", "limit")
  if (typeof text !== "string") return problem("")
  if (text.length > bounded.maxBytes || new TextEncoder().encode(text).length > bounded.maxBytes) return problem("", "limit")
  return format === "json" ? decodeJson(text, bounded) : format === "yaml" ? decodeYaml(text, bounded) : problem("")
}

function effectiveLimits(profile: "workspace" | "package", limits?: Partial<Limits>): Limits | undefined {
  if (profile !== "workspace" && profile !== "package") return
  // Only trusted callers select a profile; overrides can lower but never raise its ceilings.
  const seed = profile === "workspace" ? { maxBytes: 262144, maxDepth: 16 } : { maxBytes: 524288, maxDepth: 17 }
  const maxBytes = limits?.maxBytes === undefined ? seed.maxBytes : limits.maxBytes
  const maxDepth = limits?.maxDepth === undefined ? seed.maxDepth : limits.maxDepth
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || !Number.isSafeInteger(maxDepth) || maxDepth <= 0) return
  return { maxBytes: Math.min(seed.maxBytes, maxBytes), maxDepth: Math.min(seed.maxDepth, maxDepth) }
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

function scalar(value: unknown, path: string, budget: Budget): Admission {
  if (typeof value === "string") return chargeString(value, budget) ? { ok: true, value } : problem(path, "limit")
  if (value === null || typeof value === "boolean") {
    budget.remaining -= value === false ? 5 : 4
    return budget.remaining >= 0 ? { ok: true, value } : problem(path, "limit")
  }
  if (typeof value !== "number" || !Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) return problem(path)
  // Only validated primitive numbers are serialized, never an untrusted object.
  budget.remaining -= JSON.stringify(value).length
  return budget.remaining >= 0 ? { ok: true, value } : problem(path, "limit")
}

function chargeString(value: string, budget: Budget) {
  budget.remaining -= 2
  if (budget.remaining < 0) return false
  // Count JSON escapes and UTF-8 directly, stopping before allocating any encoded string.
  for (let index = 0; index < value.length; index += 1) {
    const char = value.charCodeAt(index)
    const next = value.charCodeAt(index + 1)
    const paired = char >= 0xd800 && char <= 0xdbff && next >= 0xdc00 && next <= 0xdfff
    const bytes = char < 0x20
      ? char === 8 || char === 9 || char === 10 || char === 12 || char === 13 ? 2 : 6
      : char === 0x22 || char === 0x5c ? 2
      : char < 0x80 ? 1
      : char < 0x800 ? 2
      : paired ? 4
      : char >= 0xd800 && char <= 0xdfff ? 6 : 3
    budget.remaining -= bytes
    if (budget.remaining < 0) return false
    index += paired ? 1 : 0
  }
  return true
}

function chargeMember(key: string, index: number, array: boolean, budget: Budget) {
  budget.remaining -= (index === 0 ? 0 : 1) + (array ? 0 : 1)
  return budget.remaining >= 0 && (array || chargeString(key, budget))
}

function invalidMember(path: string, key: string, budget: Budget): Admission {
  // Error-only admission also bounds arbitrary non-index array keys; valid keys are charged in the value walk.
  return chargeMember(key, 0, false, budget) ? problem(pointer(path, key)) : problem(path, "limit")
}

function clone(value: unknown, path: string, depth: number, limits: Limits, ancestors: WeakSet<object>, budget: Budget): Admission {
  if (value === null || typeof value !== "object") return scalar(value, path, budget)
  if (depth >= limits.maxDepth) return problem(path, "limit")
  if (ancestors.has(value)) return problem(path)
  budget.remaining -= 2
  if (budget.remaining < 0) return problem(path, "limit")
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
    if (!descriptor || !("value" in descriptor)) return invalidMember(path, key, budget)
    if (array && key === "length") continue
    if (!descriptor.enumerable) return invalidMember(path, key, budget)
    if (array && (!/^(0|[1-9][0-9]*)$/.test(key) || typeof length !== "number" || Number(key) >= length)) return invalidMember(path, key, budget)
  }
  ancestors.add(value)
  const output: Schema.Json = array ? [] : {}
  const entries = keys.filter((key): key is string => typeof key === "string" && (!array || key !== "length"))
  for (const [index, key] of entries.entries()) {
    if (!chargeMember(key, index, array, budget)) return problem(path, "limit")
    const childPath = pointer(path, key)
    const child: unknown = shape.descriptors[key]?.value
    const result = clone(child, childPath, depth + 1, limits, ancestors, budget)
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
  return root ? jsonNode(root, "", 0, limits, { remaining: limits.maxBytes }) : problem("")
}

function jsonNode(node: Node, path: string, depth: number, limits: Limits, budget: Budget): Admission {
  if (node.type !== "object" && node.type !== "array") {
    const value: unknown = node.value
    return scalar(value, path, budget)
  }
  if (depth >= limits.maxDepth) return problem(path, "limit")
  budget.remaining -= 2
  if (budget.remaining < 0) return problem(path, "limit")
  const output: Schema.Json = node.type === "array" ? [] : {}
  const keys = new Set<string>()
  for (const [index, child] of (node.children ?? []).entries()) {
    const key: unknown = node.type === "array" ? String(index) : child.children?.[0]?.value
    const entry = node.type === "array" ? child : child.children?.[1]
    if (typeof key !== "string" || !entry || keys.has(key)) return problem(path)
    keys.add(key)
    if (!chargeMember(key, index, node.type === "array", budget)) return problem(path, "limit")
    const childPath = pointer(path, key)
    const result = jsonNode(entry, childPath, depth + 1, limits, budget)
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
  return yamlNode(document.contents, "", 0, limits, { remaining: limits.maxBytes })
}

function yamlNode(node: unknown, path: string, depth: number, limits: Limits, budget: Budget): Admission {
  if (node === null) return scalar(null, path, budget)
  if (isAlias(node)) return problem(path)
  if (!isScalar(node) && !isMap(node) && !isSeq(node)) return problem(path)
  if (node.tag !== undefined || node.anchor !== undefined) return problem(path)
  if (isScalar(node)) return scalar(node.value, path, budget)
  if (depth >= limits.maxDepth) return problem(path, "limit")
  budget.remaining -= 2
  if (budget.remaining < 0) return problem(path, "limit")
  const output: Schema.Json = isSeq(node) ? [] : {}
  const keys = new Set<string>()
  if (isSeq(node)) {
    for (const [index, child] of node.items.entries()) {
      if (!chargeMember(String(index), index, true, budget)) return problem(path, "limit")
      const childPath = pointer(path, String(index))
      const result = yamlNode(child, childPath, depth + 1, limits, budget)
      if (!result.ok) return result
      Object.defineProperty(output, String(index), { value: result.value, enumerable: true, writable: true, configurable: true })
    }
    return { ok: true, value: output }
  }
  for (const [index, pair] of node.items.entries()) {
    if (!isScalar(pair.key) || typeof pair.key.value !== "string" || pair.key.tag !== undefined || pair.key.anchor !== undefined) return problem(path)
    const key = pair.key.value
    if (keys.has(key)) return problem(path)
    keys.add(key)
    if (!chargeMember(key, index, false, budget)) return problem(path, "limit")
    const childPath = pointer(path, key)
    const result = yamlNode(pair.value, childPath, depth + 1, limits, budget)
    if (!result.ok) return result
    Object.defineProperty(output, key, { value: result.value, enumerable: true, writable: true, configurable: true })
  }
  return { ok: true, value: output }
}
