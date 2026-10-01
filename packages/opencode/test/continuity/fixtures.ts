import { z } from "zod"
import { MessageID, PartID, SessionID } from "@/session/schema"
import type { ArtifactEnvelope, ExactReason, HandoffBody, JsonValue, MaterializedArtifact, SourceUnit } from "@/continuity/types"

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
const leaf = source.pick({ id: true, kind: true, order: true, extent: true, recoverable: true, digest: true, value: true })
  .extend({ path: source.shape.locator.shape.path }).strict()
const group = source.pick({ role: true, actor: true, scope: true, origin: true, exit: true }).extend({
  locator: source.shape.locator.omit({ path: true }).strict(), units: z.array(leaf).min(1),
}).strict()
const catalogue = z.object({
  parentID: z.string().transform((value) => SessionID.make(value)), groups: z.array(group).min(1),
  previous: z.unknown(), canRecall: z.boolean(),
}).strict()
const input = z.object({
  source: catalogue,
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
  const frames = text.split("\n").filter((line) => line.startsWith('{"frame":"continuity_exact_v1"'))
    .map((line) => frame.parse(JSON.parse(line)))
  if (!frames.length) throw new Error("missing materialized exact frames")
  if (new Set(frames.map((entry) => entry.source)).size !== frames.length) throw new Error("duplicate materialized exact source")
  if (frames.some((entry) => entry.source !== entry.provenance.id || entry.format === "text" && typeof entry.value !== "string")) {
    throw new Error("materialized exact frame/provenance mismatch")
  }
  return frames
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
  const units: SourceUnit[] = request.source.groups.flatMap(({ units, locator, ...shared }) => units.map(({ path, ...unit }) => ({
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
  return { parentID: request.source.parentID, canRecall: request.source.canRecall, previous: request.source.previous, units }
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

export function selectSource(units: SourceUnit[], literal: string) {
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
