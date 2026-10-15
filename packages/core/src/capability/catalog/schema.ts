export * as CapabilityVendorSchema from "./schema"

import { createHash } from "node:crypto"
import type { Options, ValidateFunction } from "ajv"
import type { FormatName } from "ajv-formats"
import { Effect, Schema } from "effect"
import { Capability } from "@orchestra/schema/capability"

export const bounds = Object.freeze({ maxNodes: 4096, maxDepth: 64, maxBytes: 262144 })
// Explicit validation formats only. Annotation-only formats (password/binary) are not validators.
export const formats: readonly FormatName[] = Object.freeze([
  "date", "time", "date-time", "duration", "uri", "uri-reference", "uri-template", "email", "hostname",
  "ipv4", "ipv6", "regex", "uuid", "json-pointer", "json-pointer-uri-fragment", "relative-json-pointer",
])
export type Coverage = Readonly<{ input: "validated"; output: "validated" | "unvalidated" }>
export type Validation =
  | Readonly<{ valid: true; value: Schema.Json; coverage: "validated" | "unvalidated" }>
  | Readonly<{ valid: false; failure: Capability.Failure }>
export type Validator = Readonly<{
  schemaHash: string
  inputSchema: Schema.Json
  outputSchema?: Schema.Json
  coverage: Coverage
  validateInput: (value: unknown) => Validation
  validateOutput: (value: unknown) => Validation
}>

/** The only heavy boundary: no Ajv import or compilation during module/service construction.
 * Canonical leaves must check validateInput before dispatch and validateOutput before projection.
 */
export const compile = Effect.fn("CapabilityVendorSchema.compile")(function* (
  inputSchema: Schema.Json,
  outputSchema?: Schema.Json,
): Effect.fn.Return<Validator, Capability.Failure> {
  const input = snapshot(inputSchema)
  if (input instanceof Capability.Failure) return yield* input
  const output = outputSchema === undefined ? undefined : snapshot(outputSchema)
  if (output instanceof Capability.Failure) return yield* output
  const inputDialect = dialect(input)
  const outputDialect = output === undefined ? undefined : dialect(output)
  if (inputDialect instanceof Capability.Failure) return yield* inputDialect
  if (outputDialect instanceof Capability.Failure) return yield* outputDialect
  const options: Options = {
    strict: true, allowUnionTypes: true, coerceTypes: false, useDefaults: false, removeAdditional: false,
    validateFormats: true, allErrors: false, ownProperties: true, logger: false,
  }
  const { default: addFormats } = yield* Effect.tryPromise({
    try: () => import("ajv-formats"), catch: unsupported,
  })
  const build = Effect.fnUntraced(function* (schema: Schema.Json, draft: Draft) {
    const engine = yield* Effect.tryPromise({
      try: async () => {
        if (draft === "2020-12") {
          const { Ajv2020 } = await import("ajv/dist/2020.js")
          return new Ajv2020(options)
        }
        if (draft === "2019-09") {
          const { Ajv2019 } = await import("ajv/dist/2019.js")
          return new Ajv2019(options)
        }
        const { Ajv } = await import("ajv")
        return new Ajv(options)
      }, catch: unsupported,
    })
    return yield* Effect.try({
      try: () => {
        addFormats(engine, { formats: [...formats], mode: "full", keywords: false })
        const checked = requireSchema(schema, engine)
        return engine.compile<Schema.Json>(checked)
      }, catch: unsupported,
    })
  })
  const validateInput = yield* build(input, inputDialect)
  const validateOutput = output === undefined || outputDialect === undefined ? undefined : yield* build(output, outputDialect)
  return Object.freeze({
    schemaHash: hash({ input, output: output ?? null, outputPresent: output !== undefined }),
    inputSchema: input,
    ...(output === undefined ? {} : { outputSchema: output }),
    coverage: Object.freeze({ input: "validated", output: output === undefined ? "unvalidated" : "validated" }),
    validateInput: (value: unknown) => validate(value, validateInput),
    validateOutput: (value: unknown) => validate(value, validateOutput),
  })
})

type Draft = "07" | "2019-09" | "2020-12"

function dialect(schema: Schema.Json): Draft | Capability.Failure {
  if (typeof schema === "boolean") return "07"
  if (!schema || typeof schema !== "object" || isArray(schema)) return unsupported()
  if (schema.$schema === undefined || schema.$schema === "http://json-schema.org/draft-07/schema#" ||
    schema.$schema === "https://json-schema.org/draft-07/schema#") return "07"
  if (schema.$schema === "https://json-schema.org/draft/2019-09/schema") return "2019-09"
  if (schema.$schema === "https://json-schema.org/draft/2020-12/schema") return "2020-12"
  return unsupported()
}

// Ajv strictSchema rejects active unknown keywords. Inspect every schema position too: unused $defs
// must not conceal unsupported keywords, formats, async validation or external reference acquisition.
function requireSchema(schema: Schema.Json, engine: { RULES: { keywords: { [name: string]: boolean | undefined } } }): boolean | Record<string, Schema.Json> {
  if (typeof schema === "boolean") return schema
  if (!schema || typeof schema !== "object" || isArray(schema)) throw unsupported()
  Object.entries(schema).forEach(([key, value]) => {
    if (!engine.RULES.keywords[key]) throw unsupported()
    if (key === "$async" || key === "$vocabulary") throw unsupported()
    if (["$ref", "$dynamicRef", "$recursiveRef"].includes(key) &&
      (typeof value !== "string" || !value.startsWith("#"))) throw unsupported()
    if (key === "format" && (typeof value !== "string" || !formats.some((format) => format === value))) throw unsupported()
    if (key === "$schema" && dialect(schema) instanceof Capability.Failure) throw unsupported()
    if (["properties", "patternProperties", "$defs", "definitions", "dependentSchemas"].includes(key)) {
      if (!value || typeof value !== "object" || isArray(value)) throw unsupported()
      Object.values(value).forEach((child) => requireSchema(child, engine))
    }
    if (["allOf", "anyOf", "oneOf", "prefixItems"].includes(key)) {
      if (!isArray(value)) throw unsupported()
      value.forEach((child) => requireSchema(child, engine))
    }
    if (["not", "if", "then", "else", "contains", "propertyNames", "additionalProperties", "unevaluatedProperties",
      "additionalItems", "unevaluatedItems", "items"].includes(key)) {
      if (key === "items" && isArray(value)) value.forEach((child) => requireSchema(child, engine))
      else requireSchema(value, engine)
    }
    if (key === "dependencies" && value && typeof value === "object" && !isArray(value))
      Object.values(value).filter((child) => !isArray(child)).forEach((child) => requireSchema(child, engine))
  })
  return schema
}

function validate(value: unknown, validator?: ValidateFunction<Schema.Json>): Validation {
  const json = snapshot(value)
  if (json instanceof Capability.Failure || (validator && !validator(json))) return {
    valid: false, failure: new Capability.Failure({ code: "unsupported_schema", message: "Vendor value does not match supported schema" }),
  }
  return { valid: true, value: json, coverage: validator ? "validated" : "unvalidated" }
}

/** Bounded JSON copy before recursive schema parsing or serialization. Reject cycles/non-JSON values. */
export function snapshot(value: unknown): Schema.Json | Capability.Failure {
  const budget = { nodes: 0, bytes: 0 }
  const path = new WeakSet<object>()
  const copy = (value: unknown, depth: number): Schema.Json | Capability.Failure => {
    budget.nodes++
    if (depth > bounds.maxDepth || budget.nodes > bounds.maxNodes) return unsupported()
    if (value === null || typeof value === "boolean") return value
    if (typeof value === "number") return Number.isFinite(value) ? value : unsupported()
    if (typeof value === "string") {
      budget.bytes += Buffer.byteLength(value)
      return budget.bytes > bounds.maxBytes ? unsupported() : value
    }
    if (typeof value !== "object" || path.has(value)) return unsupported()
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
      return unsupported()
    path.add(value)
    const entries = Object.entries(value)
    if (entries.length > bounds.maxNodes - budget.nodes) return unsupported()
    if (Array.isArray(value) && (entries.length !== value.length || entries.some(([key], index) => key !== String(index))))
      return unsupported()
    const result: Schema.Json = Array.isArray(value) ? [] : {}
    const error = entries.some(([key, item]) => {
      budget.bytes += Buffer.byteLength(key)
      if (budget.bytes > bounds.maxBytes) return true
      const child = copy(item, depth + 1)
      if (child instanceof Capability.Failure) return true
      Object.defineProperty(result, key, { value: child, enumerable: true, configurable: false, writable: false })
      return false
    })
    path.delete(value)
    return error ? unsupported() : Object.freeze(result)
  }
  const result = copy(value, 0)
  if (result instanceof Capability.Failure) return result
  return Buffer.byteLength(JSON.stringify(result)) > bounds.maxBytes ? unsupported() : result
}

export function hash(value: Schema.Json): string {
  const canonical = (value: Schema.Json): string => {
    if (!value || typeof value !== "object") return JSON.stringify(value)
    if (isArray(value)) return `[${value.map(canonical).join(",")}]`
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
  }
  return createHash("sha256").update(canonical(value)).digest("hex")
}

function isArray(value: Schema.Json): value is Schema.JsonArray {
  return Array.isArray(value)
}

function unsupported() {
  return new Capability.Failure({ code: "unsupported_schema", message: "Vendor schema is unsupported" })
}
