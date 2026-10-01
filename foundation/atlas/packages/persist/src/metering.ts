// @atlas/persist — src/metering.ts  (full per-agent metering constructor — PERSIST-6)
//
// `meter(wp) → Metering` populates the COMPLETE accounting record: TOTAL over the 11-field schema, so no
// required field reads back `undefined` even for an opaque/partial `wp` (kept `unknown` — orchestrator-owned).
// The `transcriptSha` pointer is minted through the SEALED @atlas/kernel `asHash` seam — no raw hashing here.

import type { Hash } from "@atlas/contracts"
import { asHash } from "@atlas/kernel"
import type { Metering } from "./types.js"

/** The per-agent metering constructor (PERSIST-6): `meter(wp)` populates a full `Metering` record — no
 *  required field left `undefined`. `wp` is a higher-layer work-package, kept `unknown`. (atlas-persist:104) */
export interface MeteringApi {
  meter(wp: unknown): Metering
}

/** Narrow the deliberately-`unknown` work-package to the fields the metering schema reads. */
type WpShape = Partial<Metering>

/**
 * Build the COMPLETE accounting record for a WP (SCN-PERSIST-6-1). Every required field is populated from
 * the `wp` when present and a schema-typed default otherwise, so the returned `Metering` is total — 0
 * missing field, including `retries`/`reworks` and `tokensCache`. Numeric counters default to `0`, string
 * fields to `''`, `gates` to an empty list, and `transcriptSha` to the sealed empty `Hash`.
 */
export function meter(wp: unknown): Metering {
  const w: WpShape = typeof wp === "object" && wp !== null ? (wp as WpShape) : {}
  return {
    model: typeof w.model === "string" ? w.model : "",
    tokensIn: typeof w.tokensIn === "number" ? w.tokensIn : 0,
    tokensOut: typeof w.tokensOut === "number" ? w.tokensOut : 0,
    tokensCache: typeof w.tokensCache === "number" ? w.tokensCache : 0,
    toolUses: typeof w.toolUses === "number" ? w.toolUses : 0,
    wallTime: typeof w.wallTime === "number" ? w.wallTime : 0,
    retries: typeof w.retries === "number" ? w.retries : 0,
    reworks: typeof w.reworks === "number" ? w.reworks : 0,
    gates: Array.isArray(w.gates) ? (w.gates as readonly string[]) : [],
    verdict: typeof w.verdict === "string" ? w.verdict : "",
    transcriptSha: typeof w.transcriptSha === "string" ? (w.transcriptSha as Hash) : asHash(""),
  }
}

// differential-vs-oracle (compile-time): the facet conforms to the co-located frozen MeteringApi.
const _apiCheck: MeteringApi = { meter }
void _apiCheck
