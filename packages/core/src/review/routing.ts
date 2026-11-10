export * as ReviewRouting from "./routing"

import { Schema } from "effect"
import { NonNegativeInt, PositiveInt } from "@orchestra/schema/schema"
import { Hash } from "../util/hash"

// The routing record: what the host chose for one review before any model read the change (design §8.2), plus what a
// model added, each addition with its quote. Every id (profile, tier, overlay, language, lens, pack, lane) is a catalog
// id of the running build, so ids stay open strings and a later phase adds values without a schema change.

export const VERSION = "route-v1"

export const Digest = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/))

// Where a host entry came from. `pin` is the project's tier pin (design §5.3).
const HostSource = Schema.Literals(["request", "pin", "risk", "path", "content", "catalog"])

/** One entry: chosen by the host from a signal, or added by a model with the quote that justifies it. */
function entry<const Fields extends Schema.Struct.Fields>(fields: Fields) {
  return Schema.Union([
    Schema.Struct({ ...fields, source: HostSource }),
    Schema.Struct({ ...fields, source: Schema.Literal("model"), quote: Schema.NonEmptyString }),
  ])
}

export const Overlay = entry({
  id: Schema.NonEmptyString,
  // The path or added line that suggested it.
  signal: Schema.optional(Schema.NonEmptyString),
  // A content overlay the lead confirmed (the quoted range) or declined (the reason); declines stay on the card.
  confirmed: Schema.optional(Schema.NonEmptyString),
  declined: Schema.optional(Schema.NonEmptyString),
})
export type Overlay = typeof Overlay.Type

export const Language = entry({ id: Schema.NonEmptyString, signal: Schema.optional(Schema.NonEmptyString) })
export type Language = typeof Language.Type

export const Lens = entry({
  id: Schema.NonEmptyString,
  node: Schema.NonEmptyString,
  // What routed it: `profile`, `overlay:<id>`, `tier:<id>`.
  because: Schema.NonEmptyString,
})
export type Lens = typeof Lens.Type

export const Pack = entry({
  id: Schema.NonEmptyString,
  lane: Schema.NonEmptyString,
  // `routed` until the host's analyze step runs it.
  status: Schema.Literals(["routed", "ran", "skipped", "not-run"]),
  reason: Schema.optional(Schema.NonEmptyString),
})
export type Pack = typeof Pack.Type

/** Host-enforced counts for one review (design §8.3, §8.4). */
export interface Budget extends Schema.Schema.Type<typeof Budget> {}
export const Budget = Schema.Struct({
  lensChildren: NonNegativeInt,
  samples: PositiveInt,
  verifiers: NonNegativeInt,
  itemsPerLens: NonNegativeInt,
  loadsPerSession: NonNegativeInt,
  candidatesPerChild: NonNegativeInt,
  candidatesPerVerifier: NonNegativeInt,
  toolCallsPerSession: PositiveInt,
  probeAttempts: NonNegativeInt,
})

/** Where a Session departed from its route: a candidate citing no node, a refused load or tool, a spent budget, a cap drop. */
export interface Deviation extends Schema.Schema.Type<typeof Deviation> {}
export const Deviation = Schema.Struct({
  kind: Schema.NonEmptyString,
  stage: Schema.Literals(["route", "analyze", "entry", "hunt", "merge", "verify", "finish"]),
  session: Schema.optional(Schema.NonEmptyString),
  detail: Schema.NonEmptyString,
  ref: Schema.optional(Schema.NonEmptyString),
})

export interface Record extends Schema.Schema.Type<typeof Record> {}
export const Record = Schema.Struct({
  version: Schema.Literal(VERSION),
  catalog: Digest,
  profile: Schema.Struct({ id: Schema.NonEmptyString, source: HostSource }),
  tier: Schema.Struct({
    // The tier the host routed and runs.
    id: Schema.NonEmptyString,
    source: HostSource,
    // The tier asked for, when it differs from the one run (a Deep request runs Standard until Deep is built).
    requested: Schema.optional(Schema.NonEmptyString),
    // The §5.3 risk triggers that fired, e.g. "path: db/migrations/0042.sql".
    signals: Schema.Array(Schema.NonEmptyString),
    // The lead's one-step raise, with the line that justifies it; the host's choice above stays as routed.
    raise: Schema.optional(
      Schema.Struct({ id: Schema.NonEmptyString, source: Schema.Literal("model"), quote: Schema.NonEmptyString }),
    ),
  }),
  overlays: Schema.Array(Overlay),
  languages: Schema.Array(Language),
  lenses: Schema.Array(Lens),
  packs: Schema.Array(Pack),
  budget: Budget,
  deviations: Schema.Array(Deviation),
}).annotate({ identifier: "Review.RoutingRecord", parseOptions: { onExcessProperty: "error" } })

/** The tier the review runs: the lead's raise when there is one, else the routed tier. */
export function tier(record: Record) {
  return record.tier.raise?.id ?? record.tier.id
}

/**
 * The digest of what the host chose: SHA-256 over the canonical record without `deviations`, model entries and the
 * tier raise. Keys sort by UTF-16 code unit, array order is kept and absent optional fields never appear, so the same
 * choice always gives the same digest.
 */
export function digest(record: Record) {
  const host = <T extends { readonly source: string }>(entries: ReadonlyArray<T>) =>
    entries.filter((item) => item.source !== "model")
  return Hash.sha256(
    canonical({
      version: record.version,
      catalog: record.catalog,
      profile: record.profile,
      tier: { id: record.tier.id, source: record.tier.source, requested: record.tier.requested, signals: record.tier.signals },
      overlays: host(record.overlays),
      languages: host(record.languages),
      lenses: host(record.lenses),
      packs: host(record.packs),
      budget: record.budget,
    }),
  )
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter((item) => item[1] !== undefined)
      .sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0))
      .map((item) => `${JSON.stringify(item[0])}:${canonical(item[1])}`)
      .join(",")}}`
  return JSON.stringify(value)
}
