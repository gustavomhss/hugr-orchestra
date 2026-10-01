import { expect, test } from "bun:test"
import type { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv"
import { createRequire } from "node:module"
import type { JSONSchema7 } from "ai"
import { jsonSchema } from "../../src/continuity/artifact"
import { responseSchema } from "../../src/continuity/output-schema"
import type { HandoffBody, SourceCatalogue } from "../../src/continuity/types"
import { SessionID } from "../../src/session/schema"
import { body, catalogue, note, run, source } from "./artifact-fixture"

// Resolve MCP's installed AJV, not an undeclared direct dependency. Use its
// 2020 compiler so exported prefixItems are validated, not silently ignored.
// Live OpenAI acceptance is outside this local validator's reach.
const require = createRequire(import.meta.resolve("@modelcontextprotocol/sdk/validation/ajv"))
type AjvInstance = NonNullable<ConstructorParameters<typeof AjvJsonSchemaValidator>[0]>
const { default: Ajv2020 }: { default: new (options: { strict: boolean }) => AjvInstance } =
  await import(require.resolve("ajv/dist/2020.js"))
const ajv = new Ajv2020({ strict: false })
function validate(cat = catalogue()) {
  return validator(responseSchema(cat))
}

function validator(schema: JSONSchema7, engine = ajv) {
  const compiled = engine.compile(schema)
  return (input: unknown) => ({ valid: compiled(input) })
}

const units = [
  source(),
  source({ id: "tool", role: "tool" }),
  source({ id: "preview", extent: "preview" }),
  source({ id: "unknown-wrapper", role: "tool", extent: "unknown", kind: "json", value: { state: "completed" } }),
  source({ id: "cleared", extent: "cleared" }),
  source({ id: "unavailable", extent: "unavailable" }),
  source({ id: "missing", value: undefined }),
  source({ id: "blank", value: " \n" }),
  source({ id: "not-recoverable", recoverable: false }),
]

test("exact source/reason pairs match decoder eligibility and trust", () => {
  const cat = catalogue(units)
  const check = validate(cat)
  for (const [id, reason, accepted] of [
    ["S01", "constraint", true], ["tool", "constraint", false], ["preview", "constraint", false],
    ["tool", "evidence", true], ["preview", "evidence", true], ["preview", "identifier", true],
    ["unknown-wrapper", "evidence", false], ["cleared", "evidence", false],
    ["unavailable", "evidence", false], ["missing", "evidence", false], ["blank", "evidence", false],
    ["FOREIGN", "evidence", false], ["S01/text/0:100", "identifier", false],
  ] as const) {
    const candidate = body({ exact: [{ source: id, reason }] })
    expect(check(candidate).valid).toBe(accepted)
    expect(run(candidate, cat).ok).toBe(accepted)
  }
})

function citations(id: string): HandoffBody[] {
  return [
    body({ notes: [note({ sources: [id] })] }),
    body({ notes: [note({ sources: ["S01", id] })] }),
    body({ reference_only: [{ source: id, purpose: "history", retrieve_when: "needed" }] }),
    body({ omissions: [{ sources: [id], reason: "resolved", replacement_sources: [] }] }),
    body({ omissions: [{ sources: ["S01", id], reason: "resolved", replacement_sources: [] }] }),
    body({ omissions: [{ sources: ["S01"], reason: "superseded", replacement_sources: [id] }] }),
    body({ status: "needs_context", issues: [{ code: "missing_source", detail: "Missing context", sources: [id] }] }),
  ]
}

test("every citation position accepts known IDs and rejects foreign, pointers and offsets", () => {
  const check = validate(catalogue(units))
  for (const candidate of citations("S01")) expect(check(candidate).valid).toBe(true)
  for (const id of ["FOREIGN", "S010", "S01/path", "S01:0:10", " S01", "S01\n", ""]) {
    for (const candidate of citations(id)) expect(check(candidate).valid).toBe(false)
  }
  // Notes can cite unavailable evidence without selecting it as exact.
  expect(check(body({ notes: [note({ sources: ["unknown-wrapper", "cleared"] })] })).valid).toBe(true)
})

test("reference_only requires both operational recall and source recoverability", () => {
  const candidate = body({ reference_only: [{ source: "tool", purpose: "history", retrieve_when: "needed" }] })
  const cat = catalogue(units)
  expect(validate(cat)(candidate).valid).toBe(true)
  expect(run(candidate, cat).ok).toBe(true)
  expect(validate(cat)(body({ reference_only: [{ source: "not-recoverable", purpose: "x", retrieve_when: "x" }] })).valid).toBe(false)
  expect(validate({ ...cat, canRecall: false })(candidate).valid).toBe(false)
  expect(run(candidate, { ...cat, canRecall: false })).toEqual({ ok: false, reason: "unsupported_reference" })
  const disabled = responseSchema({ ...cat, canRecall: false })
  expect(schema(disabled.properties?.reference_only).maxItems).toBe(0)
  expect(schema(responseSchema(catalogue([source({ recoverable: false })])).properties?.reference_only).maxItems).toBe(0)
})

test("no constraint branch when only tool or preview exact sources exist", () => {
  const result = responseSchema(catalogue([source({ role: "tool" }), source({ id: "preview", extent: "preview" })]))
  const branches = schema(schema(result.properties?.exact).items).anyOf
  expect(branches).toHaveLength(1)
  expect(JSON.stringify(branches)).not.toContain('"constraint"')
  expect(validate(catalogue([source({ role: "tool" })]))(body()).valid).toBe(false)
})

test("no eligible exact sources forbids selections; empty catalogue permits named needs_context", () => {
  const absent = catalogue([source({ extent: "unknown" })])
  expect(schema(responseSchema(absent).properties?.exact).maxItems).toBe(0)
  expect(validate(absent)(body()).valid).toBe(false)
  const cat = catalogue([])
  const result = responseSchema(cat)
  for (const key of ["exact", "notes", "reference_only", "omissions"]) expect(schema(result.properties?.[key]).maxItems).toBe(0)
  const failure = body({ status: "needs_context", exact: [], issues: [{ code: "empty_handoff", detail: "No supplied context", sources: [] }] })
  expect(validate(cat)(failure).valid).toBe(true)
  expect(run(failure, cat)).toEqual({ ok: false, reason: "needs_context" })
  expect(run(body({ exact: [] }), cat)).toEqual({ ok: false, reason: "empty_handoff" })
  for (const candidate of citations("S01")) expect(validate(cat)(candidate).valid).toBe(false)
  expect(validate(cat)(body({ ...failure, issues: [{ ...failure.issues[0], sources: ["FOREIGN"] }] })).valid).toBe(false)
})

test("projection preserves closed required objects, notes kinds/states and leaves export intact", () => {
  const original = structuredClone(jsonSchema)
  const result = responseSchema(catalogue())
  expect(result.type).toBe("object")
  expect(result.anyOf).toBeUndefined()
  expect(result.required).toEqual(schema(jsonSchema).required)
  expect(result.additionalProperties).toBe(false)
  const variants = schema(schema(result.properties?.notes).items).anyOf
  const originals = schema(schema(schema(jsonSchema).properties?.notes).items).anyOf
  expect(variants).toHaveLength(originals?.length ?? 0)
  variants?.forEach((variant, index) => {
    const entry = schema(variant)
    const base = schema(originals?.[index])
    expect(entry.required).toEqual(base.required)
    expect(entry.additionalProperties).toBe(false)
    const state = schema(base.properties?.state)
    expect(entry.properties?.state).toEqual(schema(base.properties?.kind).enum?.includes("work")
      ? { ...state, enum: state.enum?.filter((value) => value !== "verified") } : state)
    expect(entry.properties?.kind).toEqual(base.properties?.kind)
    expect(schema(entry.properties?.sources).minItems).toBe(schema(base.properties?.sources).minItems)
  })
  const check = validate()
  expect(check({ ...body(), invented: "wrapper" }).valid).toBe(false)
  expect(check({ ...body(), exact: [{ source: "S01", reason: "constraint", value: "invented" }] }).valid).toBe(false)
  expect(check(body({ notes: [note({ kind: "intent", state: "verified" })] })).valid).toBe(false)
  expect(check(body({ notes: [note({ text: "" })] })).valid).toBe(false)
  expect(check(body({ notes: [note({ sources: [] })] })).valid).toBe(false)
  for (const key of Object.keys(body())) {
    const incomplete: Record<string, unknown> = { ...body() }
    delete incomplete[key]
    expect(check(incomplete).valid).toBe(false)
  }
  schema(result.properties?.status).enum = ["changed"]
  expect(jsonSchema).toEqual(original)
  expect(schema(responseSchema(catalogue()).properties?.status).enum).toEqual(["ready", "needs_context"])
})

test("status/issues cross-field rules remain local guard", () => {
  const inconsistent = body({ issues: [{ code: "missing_source", detail: "No source", sources: [] }] })
  expect(validate()(inconsistent).valid).toBe(true)
  expect(run(inconsistent)).toEqual({ ok: false, reason: "unexpected_issues" })
  const missing = body({ status: "needs_context" })
  expect(validate()(missing).valid).toBe(true)
  expect(run(missing)).toEqual({ ok: false, reason: "missing_issue" })
})

test("invalid host catalogues throw named failures", () => {
  expect(() => responseSchema(catalogue([source(), source()]))).toThrow("ContinuityCatalogueInvalid: duplicate_source S01")
  expect(() => responseSchema(catalogue([source({ parentID: SessionID.make("ses_foreign") })]))).toThrow("ContinuityCatalogueInvalid: foreign_parent S01")
})

test("missing or changed decoder schema positions fail by name", () => {
  const base = schema(jsonSchema)
  if (!base.properties) throw new Error("fixture requires generated properties")
  const saved = structuredClone(base.properties)
  try {
    delete base.properties.exact
    expect(() => responseSchema(catalogue())).toThrow("ContinuitySchemaBaseChanged: root")
    base.properties.exact = { type: "array", items: { type: "string" } }
    expect(() => responseSchema(catalogue())).toThrow("ContinuitySchemaBaseChanged: exact.items")
  } finally {
    base.properties = saved
  }
})

test("finite trie membership is exact for gaps, prefixes, metacharacters and 1760 sources", () => {
  const ids = [...Array.from({ length: 1760 }, (_, index) => `S${String(index + 1).padStart(3, "0")}`),
    "S", "Sa", "Sa+b", "a.b", "a*b", "a?b", "a^b", "a$b", "a(b)", "a[b]", "a{b}", "a|b", "a\\b", "dash-id", "slash/id"]
  const cat: SourceCatalogue = catalogue(ids.map((id) => source({ id })))
  const result = responseSchema(cat)
  const branches = schema(schema(result.properties?.exact).items).anyOf
  if (!branches?.length) throw new Error("fixture requires exact branches")
  const allowed = schema(schema(branches[0]).properties?.source).pattern
  if (!allowed) throw new Error("fixture requires finite pattern")
  const regex = new RegExp(allowed)
  const known = new Set(ids)
  for (const id of ids) expect(regex.test(id)).toBe(true)
  for (const id of [...ids.flatMap((id) => [id + "x", "x" + id, id + "\n", id + "/text:0:1"]),
    ...Array.from({ length: 2001 }, (_, index) => `S${String(index).padStart(3, "0")}`),
    "axb", "ab", "a", "b", "Saab", "Saaab", "", "S000", "S1761", "S9999"]) {
    expect(regex.test(id)).toBe(known.has(id))
  }
  const check = validator(result)
  expect(check(body({ exact: [{ source: "S1760", reason: "constraint" }] })).valid).toBe(true)
  expect(check(body({ exact: [{ source: "S1761", reason: "constraint" }] })).valid).toBe(false)
  const gapped = validate(catalogue([source({ id: "S001" }), source({ id: "S003" })]))
  expect(gapped(body({ exact: [{ source: "S002", reason: "evidence" }] })).valid).toBe(false)
  expect(JSON.stringify(result)).not.toContain("(?=")
  expect(JSON.stringify(result)).not.toContain("(?!")
  expect(JSON.stringify(result).length).toBeLessThan(15000)
})

test("independent AJV instances preserve canonical nonempty strings including newline and Unicode", () => {
  const canonical = validator(schema(jsonSchema), new Ajv2020({ strict: false }))
  const projected = validator(responseSchema(catalogue()), new Ajv2020({ strict: false }))
  for (const text of ["", "x", "\n", "\r\n", "🙂", "é", "e\u0301", "\u0000", " "]) {
    const candidates = [
      body({ notes: [note({ text })] }),
      body({ reference_only: [{ source: "S01", purpose: text, retrieve_when: "needed" }] }),
      body({ reference_only: [{ source: "S01", purpose: "history", retrieve_when: text }] }),
      body({ status: "needs_context", issues: [{ code: "missing_source", detail: text, sources: [] }] }),
    ]
    for (const candidate of candidates) {
      expect(canonical(candidate).valid).toBe(text.length > 0)
      expect(projected(candidate).valid).toBe(canonical(candidate).valid)
    }
  }
})

test("homogeneous nonempty arrays preserve minItems and validate every selected source", () => {
  const cat = catalogue([source(), source({ id: "S02" })])
  const canonical = validator(schema(jsonSchema), new Ajv2020({ strict: false }))
  const projected = validator(responseSchema(cat), new Ajv2020({ strict: false }))
  for (const sources of [[], ["S01"], ["S01", "S02"], ["S02", "S01"], ["S01", "FOREIGN"], ["FOREIGN", "S01"], [""]]) {
    const candidates = [
      body({ notes: [note({ sources })] }),
      body({ omissions: [{ sources, reason: "resolved", replacement_sources: [] }] }),
    ]
    for (const candidate of candidates) {
      expect(canonical(candidate).valid).toBe(sources.length > 0 && sources.every((id) => id.length > 0))
      expect(projected(candidate).valid).toBe(sources.length > 0 && sources.every((id) => ["S01", "S02"].includes(id)))
    }
  }
})

test("schema-position walk sees canonical unsupported keywords and none in derived schema", () => {
  const canonical = keywordPaths(jsonSchema)
  expect(canonical.some((path) => path.endsWith(".allOf"))).toBe(true)
  expect(canonical.some((path) => path.endsWith(".prefixItems"))).toBe(true)
  expect(canonical.some((path) => path.endsWith(".minLength"))).toBe(true)
  expect(keywordPaths({ type: "string", allOf: [{ minLength: 1 }] })).toEqual(["root.allOf", "root.allOf[0].minLength"])
  for (const cat of [catalogue(), catalogue([]), catalogue(units)]) expect(keywordPaths(responseSchema(cat))).toEqual([])
})

test("unfamiliar allOf, direct minLength, conflicting patterns and tuple prefixes fail by stable path", () => {
  const element = { type: "string", allOf: [{ minLength: 1 }] }
  for (const [value, suffix] of [
    [{ type: "string", allOf: [] }, ".allOf"],
    [{ type: "string", allOf: false }, ".allOf"],
    [{ type: "string", allOf: undefined }, ".allOf"],
    [{ type: "string", allOf: [{ minLength: 2 }] }, ".allOf"],
    [{ type: "string", allOf: [{ minLength: 1, maxLength: 4 }] }, ".allOf"],
    [{ type: "string", allOf: [{ minLength: 1 }, { pattern: "x" }] }, ".allOf"],
    [{ type: "object", allOf: [{ minLength: 1 }] }, ".allOf"],
    [{ ...element, pattern: "x" }, ".allOf.pattern"],
    [{ type: "string", minLength: 2 }, ".minLength"],
    [{ type: "string", minLength: 1, pattern: "x" }, ".minLength.pattern"],
    [{ type: "array", minLength: 1 }, ".minLength"],
    [{ type: "array", minItems: 1, prefixItems: [], items: element }, ".prefixItems"],
    [{ type: "array", minItems: 1, prefixItems: [element, element], items: element }, ".prefixItems"],
    [{ type: "array", minItems: 0, prefixItems: [element], items: element }, ".prefixItems"],
    [{ type: "array", prefixItems: [element], items: element }, ".prefixItems"],
    [{ type: "array", minItems: 1, prefixItems: [{ ...element, maxLength: 4 }], items: element }, ".prefixItems"],
    [{ type: "array", minItems: 1, prefixItems: [element], items: false }, ".prefixItems"],
  ] as const) {
    withProbe(value, () => expect(() => responseSchema(catalogue())).toThrow(`ContinuitySchemaUnsupported: root.properties.projection_probe${suffix}`))
  }
  const base = schema(jsonSchema)
  try {
    base.allOf = [{ minLength: 1 }]
    expect(() => responseSchema(catalogue())).toThrow("ContinuitySchemaUnsupported: root.allOf")
  } finally {
    delete base.allOf
  }
})

test("projection visits properties, definitions, items and unions, not enum/const data", () => {
  const data = { allOf: [{ minLength: 9 }], prefixItems: ["payload"], minLength: 3 }
  withProbe({ type: "object", const: data, enum: [data], properties: {
    text: { type: "string", minLength: 1 },
    list: { type: "array", items: { anyOf: [{ type: "string", allOf: [{ minLength: 1 }] }, { type: "null" }] } },
  }, $defs: { text: { type: "string", allOf: [{ minLength: 1 }] } } }, () => {
    const probe = schema(responseSchema(catalogue()).properties?.projection_probe)
    expect(probe.const).toEqual(data)
    expect(probe.enum).toEqual([data])
    expect(schema(probe.properties?.text).pattern).toBe("[\\s\\S]")
    expect(schema(probe.$defs?.text).pattern).toBe("[\\s\\S]")
    expect(keywordPaths(probe)).toEqual([])
  })
})

function withProbe(value: unknown, check: () => void) {
  const base = schema(jsonSchema)
  if (!base.properties || !base.required) throw new Error("fixture requires closed root")
  const required = base.required
  base.properties.projection_probe = schema(value)
  base.required = [...required, "projection_probe"]
  try {
    check()
  } finally {
    delete base.properties.projection_probe
    base.required = required
  }
}

function keywordPaths(value: unknown, path = "root"): string[] {
  if (typeof value === "boolean") return []
  const entry = schema(value)
  const paths = ["allOf", "prefixItems", "minLength"].filter((key) => Object.hasOwn(entry, key)).map((key) => `${path}.${key}`)
  for (const key of ["properties", "$defs"] as const) {
    Object.entries(entry[key] ?? {}).forEach(([name, child]) => paths.push(...keywordPaths(child, `${path}.${key}.${name}`)))
  }
  if (entry.items !== undefined) paths.push(...keywordPaths(entry.items, `${path}.items`))
  for (const key of ["anyOf", "allOf", "prefixItems"] as const) {
    entry[key]?.forEach((child, index) => paths.push(...keywordPaths(child, `${path}.${key}[${index}]`)))
  }
  return paths
}

function schema(value: unknown): JSONSchema7 & { prefixItems?: JSONSchema7[] } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Expected schema object")
  return value
}
