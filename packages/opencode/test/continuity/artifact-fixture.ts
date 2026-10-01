import { decode } from "../../src/continuity/artifact"
import type { ArtifactEnvelope, ExactReason, HandoffBody, SourceCatalogue, SourceUnit } from "../../src/continuity/types"
import { MessageID, PartID, SessionID } from "../../src/session/schema"

export const parentID = SessionID.make("ses_parent")
export const envelope: ArtifactEnvelope = {
  version: 1, kind: "continuity_handoff", parentID, producerID: SessionID.make("ses_producer"),
  boundary: MessageID.make("msg_boundary"), coveredThrough: MessageID.make("msg_head"), tailStart: MessageID.make("msg_tail"),
}
export const literal = "Do NOT publish; read-only replay at 12.50 MiB, except local synthetic scope.\r\nSHA AbC001—keep Case."

export function source(overrides: Partial<SourceUnit> = {}): SourceUnit {
  return {
    id: "S01", parentID, locator: { messageID: MessageID.make("msg_original"), partID: PartID.make("prt_original"),
      field: "part", path: ["text"] }, role: "user", kind: "text", origin: "head", order: 1,
    actor: null, scope: "local synthetic", extent: "full", recoverable: true, digest: "digest-01", exit: null,
    value: literal, ...overrides,
  }
}

export function toolReceipt(overrides: Partial<SourceUnit> = {}): SourceUnit {
  return source({ role: "tool", exit: 0, locator: { ...source().locator, path: ["state", "output"] }, ...overrides })
}

export function catalogue(units: SourceUnit[] = [source()]): SourceCatalogue {
  return { parentID, units, previous: null, canRecall: true }
}

export function body(overrides: Partial<HandoffBody> = {}): HandoffBody {
  return { status: "ready", exact: [{ source: "S01", reason: "constraint" }], notes: [],
    reference_only: [], omissions: [], issues: [], ...overrides }
}

export function run(value: unknown = body(), cat = catalogue(), budget = 10000) {
  return decode({ text: JSON.stringify(value), catalogue: cat, envelope, maxTokens: budget })
}

export function note(overrides: Partial<HandoffBody["notes"][number]> = {}): HandoffBody["notes"][number] {
  return { kind: "unknown", state: "unknown", text: "Production outcome remains unknown.", actor: null,
    scope: null, sources: ["S01"], ...overrides }
}

export function prior(overrides: Partial<SourceUnit> = {}, reason: ExactReason = "constraint") {
  const first = run(body({ exact: [{ source: "S01", reason }] }), catalogue([source(overrides)]))
  if (!first.ok) throw new Error(first.reason)
  return { ...catalogue([source({ ...overrides, origin: "prior" })]), previous: first.artifact }
}
