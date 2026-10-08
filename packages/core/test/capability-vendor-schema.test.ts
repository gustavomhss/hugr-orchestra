import { describe, expect } from "bun:test"
import { CapabilityVendorSchema } from "@orchestra/core/capability/catalog/schema"
import { Capability } from "@orchestra/schema/capability"
import { Effect, Schema } from "effect"
import { it } from "./lib/effect"

describe("CapabilityVendorSchema real Ajv", () => {
  it.live("validates draft-07 local refs, unions and explicit formats without coercion/defaults/removal", () => Effect.gen(function* () {
    const schema = {
      type: "object", properties: {
        count: { type: ["integer", "null"], minimum: 1, default: 2 },
        email: { $ref: "#/$defs/email" },
      }, required: ["count", "email"], additionalProperties: false,
      $defs: { email: { type: "string", format: "email" } },
    }
    const validator = yield* CapabilityVendorSchema.compile(schema, { type: "integer", minimum: 0 })
    expect(validator.validateInput({ count: 1, email: "a@example.test" }).valid).toBe(true)
    expect(validator.validateInput({ count: null, email: "a@example.test" }).valid).toBe(true)
    const invalid = [
      { count: "1", email: "a@example.test" }, { count: 0, email: "a@example.test" },
      { count: 1, email: "not-email" }, { email: "a@example.test" },
      { count: 1, email: "a@example.test", extra: true },
    ]
    invalid.forEach((input) => {
      const before = structuredClone(input)
      expect(validator.validateInput(input).valid).toBe(false)
      expect(input).toEqual(before)
    })
    expect(validator.validateOutput(0)).toEqual({ valid: true, value: 0, coverage: "validated" })
    expect(validator.validateOutput("0").valid).toBe(false)
    expect(validator.validateOutput(-1).valid).toBe(false)
    expect(validator.coverage).toEqual({ input: "validated", output: "validated" })
  }))

  it.live("uses 2019-09 and 2020-12 engines for their real validation vocabularies", () => Effect.gen(function* () {
    const v2019 = yield* CapabilityVendorSchema.compile({
      $schema: "https://json-schema.org/draft/2019-09/schema", type: "object",
      properties: { name: { type: "string" }, address: { type: "string" } },
      dependentRequired: { name: ["address"] }, unevaluatedProperties: false,
    })
    expect(v2019.validateInput({ name: "N", address: "A" }).valid).toBe(true)
    expect(v2019.validateInput({ name: "N" }).valid).toBe(false)
    expect(v2019.validateInput({ extra: 1 }).valid).toBe(false)
    const v2020 = yield* CapabilityVendorSchema.compile({
      $schema: "https://json-schema.org/draft/2020-12/schema", type: "array",
      prefixItems: [{ type: "string" }, { type: "integer" }], minItems: 2, maxItems: 2, items: false,
    })
    expect(v2020.validateInput(["x", 1]).valid).toBe(true)
    expect(v2020.validateInput([1, "x"]).valid).toBe(false)
    expect(v2020.validateInput(["x", 1, 2]).valid).toBe(false)
  }))

  it.live("rejects unsupported dialects, keywords, formats and external refs even in unused definitions", () => Effect.gen(function* () {
    const schemas: Schema.Json[] = [
      { $schema: "http://json-schema.org/draft-04/schema#", type: "string" },
      { $schema: "https://vendor.test/schema", type: "string" },
      { type: "string", vendorValidator: true }, { type: "string", format: "vendor-secret-format" },
      { type: "string", format: "password" }, { $ref: "https://vendor.test/private-schema" },
      { $ref: "other.json#/$defs/x" }, { $async: true, type: "string" },
      { type: "string", $defs: { unused: { format: "not-supported" } } },
      { type: "string", $defs: { unused: { $ref: "https://vendor.test/schema" } } },
      { type: "string", $defs: { unused: { unknownKeyword: true } } },
      { $ref: "#/$defs/missing" }, { type: "array", prefixItems: [{ type: "string" }] },
    ]
    yield* Effect.forEach(schemas, (schema) => Effect.gen(function* () {
      const failure = yield* CapabilityVendorSchema.compile(schema).pipe(Effect.flip)
      expect(failure).toBeInstanceOf(Capability.Failure)
      expect(failure.code).toBe("unsupported_schema")
      expect(failure.message).toBe("Vendor schema is unsupported")
      expect(failure.message).not.toContain("vendor.test")
    }))
  }))

  it.live("hash ignores object key order; input/output and absence change hash; snapshots cannot drift", () => Effect.gen(function* () {
    const original = { type: "string", minLength: 2 }
    const first = yield* CapabilityVendorSchema.compile(original)
    const reordered = yield* CapabilityVendorSchema.compile({ minLength: 2, type: "string" })
    expect(first.schemaHash).toBe(reordered.schemaHash)
    expect(first.schemaHash).toMatch(/^[0-9a-f]{64}$/)
    const changed = yield* CapabilityVendorSchema.compile({ type: "string", minLength: 3 })
    const output = yield* CapabilityVendorSchema.compile(original, true)
    expect(changed.schemaHash).not.toBe(first.schemaHash)
    expect(output.schemaHash).not.toBe(first.schemaHash)
    original.minLength = 99
    expect(first.validateInput("xx").valid).toBe(true)
    expect(Object.isFrozen(first.inputSchema)).toBe(true)
    expect(first.coverage.output).toBe("unvalidated")
    expect(first.validateOutput({ provider: "opaque" })).toEqual({
      valid: true, value: { provider: "opaque" }, coverage: "unvalidated",
    })
    expect(first.validateOutput(undefined).valid).toBe(false)
  }))

  it.live("bounds schema bytes/nodes/depth before recursive compilation; rejects non-JSON and cycles", () => Effect.gen(function* () {
    const deep = Array.from({ length: 70 }).reduce<Schema.Json>((child) => ({ allOf: [child] }), true)
    yield* Effect.forEach([
      deep, { enum: Array.from({ length: 5000 }, (_, n) => n) },
      { description: "x".repeat(CapabilityVendorSchema.bounds.maxBytes + 1) },
    ], (schema) => CapabilityVendorSchema.compile(schema).pipe(Effect.flip, Effect.map((failure) => {
      expect(failure.code).toBe("unsupported_schema")
    })))
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    ;[cyclic, Number.NaN, new Date(), { value: undefined }].forEach((value) => {
      expect(CapabilityVendorSchema.snapshot(value)).toBeInstanceOf(Capability.Failure)
    })
    const falseSchema = yield* CapabilityVendorSchema.compile(false)
    expect(falseSchema.validateInput({}).valid).toBe(false)
    const trueSchema = yield* CapabilityVendorSchema.compile(true)
    expect(trueSchema.validateInput({}).valid).toBe(true)
  }))
})
