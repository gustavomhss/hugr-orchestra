// Adapted from TechLead a68e7af92c7ed5aaf8b6574b7ad2f705fb38eeb5.
// Copyright 2026 HuGR Labs. Apache-2.0 (http://www.apache.org/licenses/LICENSE-2.0).
// Changed: fail-closed schemas, unknown fields, finite numbers, bounds, tuples and unions.
import type { JsonSchema } from "./contract"
import { isProxy } from "node:util/types"

export type ValidateResult = { ok: true } | { ok: false; errors: string[] }
const keywords = new Set(["type", "description", "properties", "required", "additionalProperties", "items", "additionalItems", "minItems", "maxItems", "uniqueItems", "minProperties", "maxProperties", "minLength", "maxLength", "pattern", "minimum", "maximum", "enum", "const", "anyOf", "oneOf", "allOf", "not", "$schema", "title", "default"])
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)

export function validateArgs(schema: unknown, args: unknown): ValidateResult {
  // Check the complete JSON domain before enum/const/uniqueItems serialization, including unknown fields.
  // Descriptor inspection rejects accessors without invoking user code; proxies never reach the walker.
  const inputIssue = jsonIssue(args, "args", new Set())
  if (inputIssue) return { ok: false, errors: [inputIssue] }
  const schemaIssue = jsonIssue(schema, "schema", new Set())
  if (schemaIssue) return { ok: false, errors: [schemaIssue] }
  const errors: string[] = []
  const visit = (raw: unknown, value: unknown, path: string, depth: number): void => {
    if (depth > 64) { errors.push(`${path}: maximum schema depth exceeded`); return }
    if (!record(raw) || !Object.keys(raw).length) { errors.push(`${path}: missing or malformed schema`); return }
    const unsupported = Object.keys(raw).filter((key) => !keywords.has(key))
    if (unsupported.length) { errors.push(`${path}: unsupported schema keyword ${unsupported.join(", ")}`); return }
    const schema = raw as JsonSchema
    if (schema.required !== undefined && (!Array.isArray(schema.required) || schema.required.some((key) => typeof key !== "string"))) { errors.push(`${path}: malformed required schema`); return }
    if (schema.properties !== undefined && !record(schema.properties)) { errors.push(`${path}: malformed properties schema`); return }
    if (schema.enum !== undefined && !Array.isArray(schema.enum)) { errors.push(`${path}: malformed enum schema`); return }
    for (const key of ["minimum", "maximum", "minItems", "maxItems", "minLength", "maxLength", "minProperties", "maxProperties"] as const) {
      const bound = schema[key]
      if (bound !== undefined && (typeof bound !== "number" || !Number.isFinite(bound) || key !== "minimum" && key !== "maximum" && (!Number.isSafeInteger(bound) || bound < 0))) { errors.push(`${path}: malformed ${key} schema`); return }
    }
    for (const key of ["anyOf", "oneOf", "allOf"] as const) {
      if (schema[key] === undefined) continue
      const alternatives = schema[key]
      if (!Array.isArray(alternatives) || !alternatives.length) { errors.push(`${path}: malformed ${key}`); return }
      const results = alternatives.map((item) => validateArgs(item, value))
      const passes = results.filter((result) => result.ok).length
      if (key === "anyOf" && !passes || key === "oneOf" && passes !== 1 || key === "allOf" && passes !== alternatives.length) errors.push(`${path}: ${key} constraint failed`)
    }
    if (schema.not && validateArgs(schema.not, value).ok) errors.push(`${path}: forbidden value`)
    if (schema.enum && !schema.enum.some((item) => JSON.stringify(item) === JSON.stringify(value))) errors.push(`${path}: value outside enum`)
    if (Object.hasOwn(schema, "const") && JSON.stringify(schema.const) !== JSON.stringify(value)) errors.push(`${path}: const mismatch`)
    const type = schema.type ?? (schema.required || schema.properties || schema.additionalProperties !== undefined ? "object" : undefined)
    if (!type) {
      if (!schema.anyOf && !schema.oneOf && !schema.allOf && !schema.not && !schema.enum && !Object.hasOwn(schema, "const")) errors.push(`${path}: schema declares no constraint`)
      return
    }
    const valid = type === "object" ? record(value) : type === "array" ? Array.isArray(value) : type === "null" ? value === null : type === "integer" ? typeof value === "number" && Number.isSafeInteger(value) : type === "number" ? typeof value === "number" && Number.isFinite(value) : ["string", "boolean"].includes(type) && typeof value === type
    if (!valid) { errors.push(`${path}: expected ${type}`); return }
    if (typeof value === "number") {
      if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: minimum ${schema.minimum}`)
      if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: maximum ${schema.maximum}`)
    }
    if (typeof value === "string") {
      if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: minLength ${schema.minLength}`)
      if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path}: maxLength ${schema.maxLength}`)
      if (schema.pattern !== undefined) {
        if (typeof schema.pattern !== "string") { errors.push(`${path}: malformed pattern schema`); return }
        try {
          if (!new RegExp(schema.pattern, "u").test(value)) errors.push(`${path}: pattern mismatch`)
        } catch {
          errors.push(`${path}: malformed pattern schema`)
        }
      }
    }
    if (record(value)) {
      const props = schema.properties ?? {}
      if (schema.minProperties !== undefined && Object.keys(value).length < schema.minProperties) errors.push(`${path}: minProperties ${schema.minProperties}`)
      if (schema.maxProperties !== undefined && Object.keys(value).length > schema.maxProperties) errors.push(`${path}: maxProperties ${schema.maxProperties}`)
      schema.required?.forEach((key) => { if (!Object.hasOwn(value, key)) errors.push(`${path}.${key}: required field is missing`) })
      Object.entries(value).forEach(([key, item]) => {
        if (Object.hasOwn(props, key)) { visit(props[key], item, `${path}.${key}`, depth + 1); return }
        if (record(schema.additionalProperties)) { visit(schema.additionalProperties, item, `${path}.${key}`, depth + 1); return }
        if (schema.additionalProperties === false) errors.push(`${path}.${key}: unknown field`)
      })
    }
    if (Array.isArray(value)) {
      if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: minItems ${schema.minItems}`)
      if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: maxItems ${schema.maxItems}`)
      if (schema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) errors.push(`${path}: duplicate items`)
      if (Array.isArray(schema.items)) {
        const tuple = schema.items
        if (value.length > tuple.length && schema.additionalItems !== true) errors.push(`${path}: excess tuple items`)
        value.forEach((item, i) => { if (tuple[i]) visit(tuple[i], item, `${path}[${i}]`, depth + 1) })
        return
      }
      if (!schema.items) { errors.push(`${path}: array schema lacks items`); return }
      value.forEach((item, i) => visit(schema.items, item, `${path}[${i}]`, depth + 1))
    }
  }
  visit(schema, args, "args", 0)
  return errors.length ? { ok: false, errors } : { ok: true }
}

function jsonIssue(value: unknown, path: string, ancestors: Set<object>, depth = 0): string | undefined {
  if (depth > 64) return `${path}: maximum JSON depth exceeded`
  if (value === null || typeof value === "string" || typeof value === "boolean") return
  if (typeof value === "number") return Number.isFinite(value) ? undefined : `${path}: non-finite number is not a JSON value`
  if (typeof value !== "object") return `${path}: unsupported ${typeof value}; expected JSON value`
  if (isProxy(value)) return `${path}: proxy is not a plain JSON value`
  if (ancestors.has(value)) return `${path}: cyclic reference is not a JSON value`
  const array = Array.isArray(value)
  const prototype = Object.getPrototypeOf(value)
  if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return `${path}: expected plain JSON ${array ? "array" : "object"}`
  ancestors.add(value)
  const descriptors = Object.getOwnPropertyDescriptors(value)
  for (const key of Reflect.ownKeys(descriptors)) {
    if (array && key === "length") continue
    if (typeof key === "symbol") return `${path}[${String(key)}]: symbol key is not a JSON field`
    const fieldPath = array && /^(0|[1-9]\d*)$/.test(key) ? `${path}[${key}]` : `${path}.${key}`
    const property = descriptors[key]
    if (!("value" in property)) return `${fieldPath}: accessor is not a plain JSON field`
    const issue = jsonIssue(property.value, fieldPath, ancestors, depth + 1)
    if (issue) return issue
    if (!property.enumerable || array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) return `${fieldPath}: property is not represented in JSON`
  }
  if (array) {
    for (let i = 0; i < value.length; i++) {
      if (!Object.hasOwn(descriptors, String(i))) return `${path}[${i}]: missing array element is not a JSON value`
    }
  }
  ancestors.delete(value)
}
