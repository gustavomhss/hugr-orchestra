import type { JSONSchema7 } from "ai"
import { isDeepStrictEqual } from "node:util"
import { estimateExact, jsonSchema, verificationReceipt } from "./artifact"
import type { SourceCatalogue } from "./types"

// Equivalent projection of the decoder exporter before catalogue specialization:
// OpenAI bans allOf; its published subset excludes prefixItems. Preserve their
// known nonempty/homogeneous meanings, and fail by path on unfamiliar forms.
// Status/issues, duplicate selections, prior protection and semantic grounding
// still belong to decode. OpenAI forbids a root anyOf; do not encode them there.
export function responseSchema(catalogue: SourceCatalogue): JSONSchema7 {
  const ids = new Set<string>()
  for (const unit of catalogue.units) {
    if (ids.has(unit.id)) throw new Error(`ContinuityCatalogueInvalid: duplicate_source ${unit.id}`)
    if (unit.parentID !== catalogue.parentID)
      throw new Error(`ContinuityCatalogueInvalid: foreign_parent ${unit.id}`)
    if (!unit.id.trim()) throw new Error("ContinuityCatalogueInvalid: empty_source")
    ids.add(unit.id)
  }
  const cloned = structuredClone(jsonSchema)
  project(cloned, "root")
  const result = closedObject(cloned, "root")
  if (result.anyOf !== undefined) changed("root.anyOf")
  const exact = array(result.properties.exact, "exact")
  const selection = closedObject(exact.items, "exact.items")
  const selector = string(selection.properties.source, "exact.items.source")
  const reason = string(selection.properties.reason, "exact.items.reason")
  if (JSON.stringify(reason.enum) !== JSON.stringify(["constraint", "identifier", "evidence"]))
    changed("exact.items.reason.enum")
  const eligible = catalogue.units.filter((unit) => estimateExact(unit) !== null)
  const constraints = eligible.filter((unit) => unit.extent === "full" && unit.role === "user")
  if (!eligible.length) exact.maxItems = 0
  if (eligible.length) {
    // Each branch clones the closed decoder object: source/reason are a pair,
    // never independent enums that would authorize tool/preview constraints.
    exact.items = { anyOf: [
      ...(constraints.length ? [{
        ...structuredClone(selection), properties: {
          ...structuredClone(selection.properties),
          source: { ...structuredClone(selector), pattern: pattern(constraints.map((unit) => unit.id)) },
          reason: { ...structuredClone(reason), enum: ["constraint"] },
        },
      }] : []),
      {
        ...structuredClone(selection), properties: {
          ...structuredClone(selection.properties),
          source: { ...structuredClone(selector), pattern: pattern(eligible.map((unit) => unit.id)) },
          reason: { ...structuredClone(reason), enum: ["identifier", "evidence"] },
        },
      },
    ] }
  }
  const known = [...ids]
  const notes = array(result.properties.notes, "notes")
  const noteItems = object(notes.items, "notes.items")
  const variants = noteItems.anyOf
  if (!variants?.length) changed("notes.items.anyOf")
  // Native generation is a subset of decoder acceptance: verified citations
  // must all be supplied completion receipts in the same known exact scope.
  // execution_completed remains distinct; eligibility is not objective entailment.
  const receipts = new Map<string, string[]>()
  catalogue.units.forEach((unit) => {
    if (!verificationReceipt(unit) || !unit.scope?.trim()) return
    receipts.set(unit.scope, [...(receipts.get(unit.scope) ?? []), unit.id])
  })
  noteItems.anyOf = variants.flatMap((variant, index) => {
    const entry = closedObject(variant, `notes.items.anyOf[${index}]`)
    selectors(entry.properties.sources, known, `notes.items.anyOf[${index}].sources`)
    if (JSON.stringify(string(entry.properties.kind, `notes.items.anyOf[${index}].kind`).enum) !== '["work"]')
      return [entry]
    const state = string(entry.properties.state, `notes.items.anyOf[${index}].state`)
    if (!Array.isArray(state.enum) || !state.enum.every((value) => typeof value === "string") ||
      !state.enum.includes("verified") || state.enum.length < 2) changed(`notes.items.anyOf[${index}].state.enum`)
    const verified = structuredClone(entry)
    state.enum = state.enum.filter((value) => value !== "verified")
    return [entry, ...[...receipts].map(([scope, sources]) => {
      const selected = structuredClone(verified)
      selected.properties.state = { ...string(selected.properties.state, "verified.state"), enum: ["verified"] }
      selected.properties.scope = { type: "string", const: scope }
      selectors(selected.properties.sources, sources, "verified.sources")
      return selected
    })]
  })
  const refs = array(result.properties.reference_only, "reference_only")
  const reference = closedObject(refs.items, "reference_only.items")
  const recallable = catalogue.canRecall ? catalogue.units.filter((unit) => unit.recoverable).map((unit) => unit.id) : []
  const refSource = string(reference.properties.source, "reference_only.items.source")
  if (recallable.length) refSource.pattern = pattern(recallable)
  if (!recallable.length) refs.maxItems = 0
  const omissions = array(result.properties.omissions, "omissions")
  const omission = closedObject(omissions.items, "omissions.items")
  selectors(omission.properties.sources, known, "omissions.items.sources")
  selectors(omission.properties.replacement_sources, known, "omissions.items.replacement_sources")
  const issue = closedObject(array(result.properties.issues, "issues").items, "issues.items")
  selectors(issue.properties.sources, known, "issues.items.sources")
  if (!known.length) {
    notes.maxItems = 0
    omissions.maxItems = 0
  }
  return result
}

type SchemaObject = JSONSchema7 & { prefixItems?: JSONSchema7[] }

// Visit only schema positions. enum/const payloads are data, not grammar.
// A single any-character match means >=1 character, including newline/Unicode;
// whitespace trimming remains a decoder semantic rule, not this projection.
function project(value: unknown, path: string): void {
  if (typeof value === "boolean") return
  const result = object(value, path)
  if (Object.hasOwn(result, "allOf")) {
    const branches = result.allOf
    if (result.type !== "string" || !Array.isArray(branches) || branches.length !== 1 ||
      !isObject(branches[0]) || Object.keys(branches[0]).length !== 1 || branches[0].minLength !== 1)
      unsupported(`${path}.allOf`)
    nonempty(result, `${path}.allOf`)
    delete result.allOf
  }
  if (Object.hasOwn(result, "minLength")) {
    if (result.type !== "string" || result.minLength !== 1) unsupported(`${path}.minLength`)
    nonempty(result, `${path}.minLength`)
    delete result.minLength
  }
  if (Object.hasOwn(result, "prefixItems")) {
    const prefixes = result.prefixItems
    if (result.type !== "array" || !Array.isArray(prefixes) || prefixes.length !== 1 ||
      !isObject(result.items) || result.minItems !== 1 || !isDeepStrictEqual(prefixes[0], result.items))
      unsupported(`${path}.prefixItems`)
    delete result.prefixItems
  }
  for (const key of ["properties", "$defs"] as const) {
    const entries = result[key]
    if (entries === undefined) continue
    if (!isProperties(entries)) unsupported(`${path}.${key}`)
    Object.entries(entries).forEach(([name, entry]) => project(entry, `${path}.${key}.${name}`))
  }
  if (result.items !== undefined) project(result.items, `${path}.items`)
  if (result.anyOf !== undefined) {
    if (!Array.isArray(result.anyOf) || !result.anyOf.length) unsupported(`${path}.anyOf`)
    result.anyOf.forEach((entry, index) => project(entry, `${path}.anyOf[${index}]`))
  }
}

function nonempty(schema: SchemaObject, path: string) {
  if (schema.pattern !== undefined && schema.pattern !== "[\\s\\S]") unsupported(`${path}.pattern`)
  schema.pattern = "[\\s\\S]"
}

function unsupported(path: string): never {
  throw new Error(`ContinuitySchemaUnsupported: ${path}`)
}

function isObject(value: unknown): value is SchemaObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function object(value: unknown, path: string): SchemaObject {
  if (!isObject(value)) changed(path)
  return value
}

function closedObject(value: unknown, path: string) {
  const result = object(value, path)
  const properties = result.properties
  if (result.type !== "object" || result.additionalProperties !== false || !isProperties(properties) ||
    !Array.isArray(result.required) || !result.required.every((key) => typeof key === "string") ||
    result.required.length !== Object.keys(properties).length ||
    !Object.keys(properties).every((key) => result.required?.includes(key))) changed(path)
  return { ...result, properties }
}

function isProperties(value: unknown): value is NonNullable<JSONSchema7["properties"]> {
  return isObject(value) && Object.values(value).every((entry) => typeof entry === "boolean" || isObject(entry))
}

function array(value: unknown, path: string) {
  const result = object(value, path)
  if (result.type !== "array" || !isObject(result.items)) changed(path)
  return result
}

function string(value: unknown, path: string) {
  const result = object(value, path)
  if (result.type !== "string") changed(path)
  return result
}

function selectors(value: unknown, ids: string[], path: string) {
  const result = array(value, path)
  const item = string(result.items, `${path}.items`)
  if (!ids.length) {
    result.maxItems = 0
    return
  }
  const allowed = pattern(ids)
  item.pattern = allowed
}

function changed(path: string): never {
  throw new Error(`ContinuitySchemaBaseChanged: ${path}`)
}

// Finite prefix trie, not an S-number grammar. No source enums (OpenAI's global
// enum limit is 1000); escaped literals admit only this catalogue, including gaps.
// Both anchors matter: selectors cannot carry invented pointer/offset suffixes.
function pattern(ids: string[]): string {
  type Trie = { end: boolean; children: Map<string, Trie> }
  const root: Trie = { end: false, children: new Map() }
  for (const id of ids) {
    let node = root
    for (const char of id) {
      const next = node.children.get(char) ?? { end: false, children: new Map<string, Trie>() }
      node.children.set(char, next)
      node = next
    }
    node.end = true
  }
  const encode = (node: Trie): string => {
    const digits = new Map<string, string>()
    const branches = [...node.children].flatMap(([char, child]) => {
      const suffix = encode(child)
      if (!/^[0-9]$/.test(char)) return [char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + suffix]
      digits.set(suffix, (digits.get(suffix) ?? "") + char)
      return []
    })
    digits.forEach((chars, suffix) => branches.push((chars.length === 1 ? chars : `[${chars}]`) + suffix))
    if (node.end) branches.push("")
    return branches.length === 1 ? branches[0] : `(?:${branches.join("|")})`
  }
  return `^(?:${encode(root)})$`
}
