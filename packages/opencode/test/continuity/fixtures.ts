import { z } from "zod"
import { MessageID, PartID, SessionID } from "@/session/schema"
import type { ArtifactEnvelope, ExactReason, HandoffBody, JsonValue, MaterializedArtifact, SourceDescriptor, SourceUnit } from "@/continuity/types"

export type WireSourceUnit = Omit<SourceUnit, "digest">

// Fixture selection reads actual vendor/request data; it never invents source handles.
const value: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.null(), z.boolean(), z.number(), z.string(), z.array(value), z.record(z.string(), value),
]))
const source = z.object({
  id: z.string().min(1), parentID: z.string().transform((value) => SessionID.make(value)),
  locator: z.object({
    messageID: z.string().transform((value) => MessageID.make(value)), partID: z.string().transform((value) => PartID.make(value)).nullable(),
    field: z.enum(["part", "system"]), path: z.array(z.union([z.string(), z.number()])),
  }),
  role: z.enum(["user", "assistant", "tool"]), kind: z.enum(["text", "json", "file"]),
  origin: z.enum(["head", "prior"]), order: z.number(), actor: z.string().nullable(), scope: z.string().nullable(),
  extent: z.enum(["full", "preview", "cleared", "unknown", "unavailable"]), recoverable: z.boolean(),
  digest: z.string(), exit: z.number().nullable(), value: value.optional(),
})
const leaf = source.pick({ id: true, kind: true, order: true, extent: true, recoverable: true, value: true })
  .extend({ path: source.shape.locator.shape.path, exactTokens: z.number().int().positive().nullable(),
    citationTokens: z.number().int().positive() }).strict()
const group = source.pick({ role: true, actor: true, scope: true, origin: true, exit: true }).extend({
  locator: source.shape.locator.omit({ path: true }).strict(), units: z.array(leaf).min(1),
}).strict()
const catalogue = z.object({
  parentID: z.string().transform((value) => SessionID.make(value)), groups: z.array(group).min(1),
  previous: z.unknown(), canRecall: z.boolean(),
}).strict()
const input = z.object({
  source: catalogue,
  budget: z.object({ maxTokens: z.literal(6000), fixedTokens: z.number().int().nonnegative() }).strict(),
  envelope: z.object({
    version: z.literal(1), kind: z.literal("continuity_handoff"),
    parentID: z.string().transform((value) => SessionID.make(value)), producerID: z.string().transform((value) => SessionID.make(value)),
    boundary: z.string().transform((value) => MessageID.make(value)), coveredThrough: z.string().transform((value) => MessageID.make(value)),
    tailStart: z.string().transform((value) => MessageID.make(value)),
  }),
  bodySchema: z.object({ type: z.literal("object"), properties: z.object({
    status: z.unknown(), exact: z.unknown(), notes: z.unknown(), reference_only: z.unknown(), omissions: z.unknown(), issues: z.unknown(),
  }) }),
})
const messages = z.object({ messages: z.array(z.object({ role: z.string(), content: z.unknown() })) })
const prior = z.object({ body: z.object({ exact: z.array(z.object({
  source: z.string(), reason: z.enum(["constraint", "identifier", "evidence"]),
})) }) }).nullable()
const frame = z.object({
  frame: z.literal("continuity_exact_v1"), source: z.string(), reason: z.enum(["constraint", "identifier", "evidence"]),
  format: z.enum(["text", "json"]), value, provenance: source.omit({ value: true }).strict(),
}).strict()
const columns = ["message_id", "part_id", "field", "path", "role", "kind", "origin", "order", "actor", "scope",
  "extent", "recoverable", "digest", "exit"]
const compactProvenance = z.tuple([
  source.shape.locator.shape.messageID, source.shape.locator.shape.partID, source.shape.locator.shape.field,
  source.shape.locator.shape.path, source.shape.role, source.shape.kind, source.shape.origin, source.shape.order,
  source.shape.actor, source.shape.scope, source.shape.extent, source.shape.recoverable, source.shape.digest, source.shape.exit,
])
const compactFrame = frame.omit({ provenance: true }).extend({ frame: z.literal("continuity_exact_v2"),
  provenance: compactProvenance }).strict()
const compactSource = z.object({ source: z.string(), provenance: compactProvenance }).strict()
const projected = source.omit({ value: true, digest: true, locator: true }).extend({
  locator: source.shape.locator.pick({ field: true, path: true }).strict(),
}).strict()
const projectedColumns = ["field", "path", "role", "kind", "origin", "order", "actor", "scope", "extent", "recoverable", "exit"]
const indexed = z.array(z.number().int().nonnegative()).length(11)
const indexedFrame = frame.omit({ provenance: true }).extend({ frame: z.literal("continuity_exact_v3"), provenance: indexed }).strict()
const indexedSource = z.object({ source: z.string(), provenance: indexed }).strict()
const header = z.object({
  version: z.literal(1), kind: z.literal("continuity_handoff"),
  parent_session_id: z.string().transform((value) => SessionID.make(value)),
  producer_id: z.string().transform((value) => SessionID.make(value)),
  boundary: z.string().transform((value) => MessageID.make(value)),
  covered_through: z.string().transform((value) => MessageID.make(value)),
  tail_start: z.string().transform((value) => MessageID.make(value)),
}).strict()

export function readHostHeader(text: string) {
  const headers = text.split("\n").filter((line) => line.startsWith('{"version":1,"kind":"continuity_handoff"'))
    .map((line) => header.parse(JSON.parse(line)))
  if (headers.length !== 1) throw new Error("missing or ambiguous materialized artifact header")
  return headers[0]
}

export function readExactFrames(text: string) {
  const frames = text.split("\n").filter((line) => /^\{"frame":"continuity_exact_v[123]"/.test(line))
    .map((line) => {
      const raw = JSON.parse(line)
      if (raw.frame === "continuity_exact_v1") {
        const parsed = frame.parse(raw)
        return { ...parsed, provenance: readerDescriptor(parsed.provenance) }
      }
      if (raw.frame === "continuity_exact_v3") {
        const parsed = indexedFrame.parse(raw)
        return { ...parsed, provenance: expandIndexed(text, parsed.source, parsed.provenance) }
      }
      const parsed = compactFrame.parse(raw)
      return { ...parsed, provenance: readerDescriptor(expandProvenance(text, parsed.source, parsed.provenance)) }
    })
  if (!frames.length) throw new Error("missing materialized exact frames")
  if (new Set(frames.map((entry) => entry.source)).size !== frames.length) throw new Error("duplicate materialized exact source")
  if (frames.some((entry) => entry.source !== entry.provenance.id || entry.format === "text" && typeof entry.value !== "string")) {
    throw new Error("materialized exact frame/provenance mismatch")
  }
  return frames
}

function expandProvenance(text: string, id: string, data: z.infer<typeof compactProvenance>) {
  const definitions = text.split("\n").filter((line) => line.startsWith('{"provenance_columns":'))
  if (definitions.length !== 1 || JSON.stringify(JSON.parse(definitions[0]).provenance_columns) !== JSON.stringify(columns))
    throw new Error("missing or unsupported provenance columns")
  const [messageID, partID, field, path, role, kind, origin, order, actor, scope, extent, recoverable, digest, exit] = data
  return source.omit({ value: true }).strict().parse({ id, parentID: readHostHeader(text).parent_session_id,
    locator: { messageID, partID, field, path }, role, kind, origin, order, actor, scope, extent, recoverable, digest, exit })
}

export function readRenderedSources(text: string) {
  const exact = text.includes('{"frame":"continuity_exact_v') ? readExactFrames(text).map((frame) => frame.provenance) : []
  const citations = text.split("\n").filter((line) => line.startsWith('{"source":')).map((line) => {
    const raw = JSON.parse(line)
    if (text.includes('{"provenance_dictionary":')) {
      const parsed = indexedSource.parse(raw)
      return expandIndexed(text, parsed.source, parsed.provenance)
    }
    const parsed = compactSource.parse(raw)
    return readerDescriptor(expandProvenance(text, parsed.source, parsed.provenance))
  })
  if (new Set([...exact, ...citations].map((source) => source.id)).size !== exact.length + citations.length)
    throw new Error("duplicate rendered source")
  if (text.includes('{"provenance_dictionary":')) {
    const table = JSON.parse(text.split("\n").find((line) => line.startsWith('{"provenance_dictionary":'))!)
    const used = new Set(text.split("\n").filter((line) => line.startsWith('{"source":') || line.startsWith('{"frame":"continuity_exact_v3"'))
      .flatMap((line) => indexed.parse(JSON.parse(line).provenance)))
    if (used.size !== table.provenance_dictionary.length) throw new Error("unused provenance dictionary entry")
  }
  return [...exact, ...citations]
}

export function readerDescriptor(source: SourceDescriptor) {
  const { digest, locator, ...fields } = source
  return { ...fields, locator: { field: locator.field, path: locator.path } }
}

function expandIndexed(text: string, id: string, tuple: number[]) {
  const headers = text.split("\n").filter((line) => line.startsWith('{"provenance_columns":'))
  if (headers.length !== 1 || JSON.stringify(JSON.parse(headers[0])) !== JSON.stringify({ provenance_columns: projectedColumns }))
    throw new Error("missing or unsupported provenance columns")
  const tables = text.split("\n").filter((line) => line.startsWith('{"provenance_dictionary":'))
  if (tables.length !== 1) throw new Error("missing or ambiguous provenance dictionary")
  const dictionary = z.object({ provenance_dictionary: z.array(value) }).strict().parse(JSON.parse(tables[0])).provenance_dictionary
  if (new Set(dictionary.map((entry) => JSON.stringify(entry))).size !== dictionary.length || tuple.some((index) => index >= dictionary.length))
    throw new Error("invalid provenance dictionary")
  const [field, path, role, kind, origin, order, actor, scope, extent, recoverable, exit] = tuple.map((index) => dictionary[index])
  return projected.parse({ id, parentID: readHostHeader(text).parent_session_id, locator: { field, path },
    role, kind, origin, order, actor, scope, extent, recoverable, exit })
}

export function readRetrievalLocators(text: string) {
  const body = z.object({ reference_only: z.array(z.object({ source: z.string() })) }).parse(JSON.parse(text.split("\n").at(-1)!))
  const expected = [...new Set(body.reference_only.map((reference) => reference.source))]
  const tables = text.split("\n").filter((line) => line.startsWith('{"retrieval_locators":'))
  if (tables.length !== (expected.length ? 1 : 0)) throw new Error("missing or foreign retrieval locator table")
  const locators = tables.length ? z.object({ retrieval_locators: z.array(z.object({ source: z.string(),
    locator: source.shape.locator.strict() }).strict()) }).strict().parse(JSON.parse(tables[0])).retrieval_locators : []
  if (new Set(locators.map((entry) => entry.source)).size !== locators.length ||
    JSON.stringify(locators.map((entry) => entry.source).sort()) !== JSON.stringify(expected.sort()))
    throw new Error("missing or foreign retrieval mapping")
  const sources = readRenderedSources(text)
  for (const entry of locators) {
    const unit = sources.find((source) => source.id === entry.source)
    if (!unit?.recoverable || entry.locator.field !== unit.locator.field ||
      JSON.stringify(entry.locator.path) !== JSON.stringify(unit.locator.path)) throw new Error("invalid retrieval mapping")
  }
  return locators
}

export function uniqueExact(selections: HandoffBody["exact"]): HandoffBody["exact"] {
  const rank = { constraint: 0, identifier: 1, evidence: 2 }
  const chosen = new Map<string, HandoffBody["exact"][number]>()
  for (const entry of selections) {
    const previous = chosen.get(entry.source)
    if (!previous || rank[entry.reason] < rank[previous.reason]) chosen.set(entry.source, entry)
  }
  return [...chosen.values()].sort((left, right) => rank[left.reason] - rank[right.reason])
}

export function readSourceCatalogue(data: unknown) {
  const parsed: unknown = typeof data === "string" ? JSON.parse(data) : data
  const request = input.parse(parsed)
  if (request.source.parentID !== request.envelope.parentID || request.envelope.producerID === request.envelope.parentID) {
    throw new Error("maintenance source/envelope ownership mismatch")
  }
  const costs = request.source.groups.flatMap((group) => group.units.map((unit) => [unit.id, unit.exactTokens] as const))
  const citations = request.source.groups.flatMap((group) => group.units.map((unit) => [unit.id, unit.citationTokens] as const))
  const units: WireSourceUnit[] = request.source.groups.flatMap(({ units, locator, ...shared }) => units.map(({ path, exactTokens, citationTokens, ...unit }) => ({
    ...shared, ...unit, parentID: request.source.parentID, locator: { ...locator, path },
  }))).sort((left, right) => left.order - right.order)
  if (new Set(units.map((unit) => unit.id)).size !== units.length ||
    new Set(units.map((unit) => unit.order)).size !== units.length ||
    units.some((unit) => !/^S(?:0[0-9]{2}|[1-9][0-9]{2,})$/.test(unit.id) || unit.id === "S000" ||
      !Number.isSafeInteger(unit.order) || unit.order < 0 ||
      !unit.locator.path.every((item) => typeof item === "string" || Number.isSafeInteger(item) && item >= 0) ||
      (unit.locator.field === "system" ? unit.locator.partID !== null || unit.locator.path.length !== 0 : !unit.locator.partID))) {
    throw new Error("invalid grouped source identity or locator")
  }
  return { parentID: request.source.parentID, canRecall: request.source.canRecall, previous: request.source.previous,
    units, exactTokens: Object.fromEntries(costs), citationTokens: Object.fromEntries(citations), budget: request.budget }
}

export function readEnvelope(data: string): ArtifactEnvelope {
  return input.parse(JSON.parse(data)).envelope
}

export function wireInput(data: unknown) {
  const turns = messages.parse(data).messages.filter((message) => message.role === "user")
  if (turns.length !== 1) throw new Error("maintenance must have exactly one data turn")
  const content = turns[0].content
  if (typeof content === "string") return content
  const parts = z.array(z.object({ type: z.literal("text"), text: z.string() })).parse(content)
  if (parts.length !== 1) throw new Error("maintenance must have exactly one JSON text part")
  return parts[0].text
}

function hasLiteral(value: JsonValue | undefined, literal: string): boolean {
  if (typeof value === "string") return value === literal
  if (!value || typeof value !== "object") return false
  return Object.values(value).some((entry) => hasLiteral(entry, literal))
}

export function selectSource(units: WireSourceUnit[], literal: string) {
  const scalars = units.filter((unit) => unit.extent === "full" && unit.value === literal)
  const matches = scalars.length ? scalars : units.filter((unit) => unit.extent === "full" && hasLiteral(unit.value, literal))
  if (matches.length !== 1) throw new Error(`expected one complete source with exact literal: ${literal}`)
  return matches[0]
}

export function bodyFromRequest(data: unknown, literal: string, retire?: string, reason: ExactReason = "identifier"): HandoffBody {
  const current = readSourceCatalogue(data)
  const selected = selectSource(current.units, literal)
  const previous = retire === undefined ? undefined : selectSource(current.units.filter((unit) => unit.origin === "prior"), retire)
  const carried = prior.parse(current.previous)?.body.exact.filter((entry) => entry.source !== previous?.id) ?? []
  return {
    status: "ready",
    exact: uniqueExact([...carried, { source: selected.id, reason: carried.find((entry) => entry.source === selected.id)?.reason ?? reason }]),
    notes: previous
      ? [{ kind: "decision", state: "accepted", text: literal, actor: selected.actor, scope: selected.scope, sources: [previous.id, selected.id] }]
      : selected.role === "tool"
        ? [{ kind: "work", state: selected.exit !== null && selected.exit !== 0 ? "failed" : "unknown",
          text: literal, actor: selected.actor, scope: selected.scope, sources: [selected.id] }]
        : [{ kind: "intent", state: "requested", text: literal, actor: selected.actor, scope: selected.scope, sources: [selected.id] }],
    reference_only: [],
    omissions: previous ? [{ sources: [previous.id], reason: "superseded", replacement_sources: [selected.id] }] : [],
    issues: [],
  }
}

// Context store tests exercise selection, not model decoding. All ownership fields stay explicit.
export function ownedArtifact(envelope: ArtifactEnvelope, text: string, render: (artifact: MaterializedArtifact) => string): MaterializedArtifact {
  const source: SourceUnit = {
    id: "S001", parentID: envelope.parentID,
    locator: { messageID: envelope.coveredThrough, partID: PartID.make("prt_context"), field: "part", path: ["text"] },
    role: "user", kind: "text", origin: "head", order: 0, actor: null, scope: null,
    extent: "full", recoverable: false, digest: new Bun.CryptoHasher("sha256").update(JSON.stringify(text)).digest("hex"), exit: null,
  }
  const body: HandoffBody = {
    status: "ready", exact: [{ source: source.id, reason: "identifier" }], notes: [], reference_only: [], omissions: [], issues: [],
  }
  const exact = [{ source: source.id, reason: "identifier" as const, value: text }]
  const artifact = { envelope, body, exact, sources: [source], text: "" }
  artifact.text = render(artifact)
  return artifact
}
