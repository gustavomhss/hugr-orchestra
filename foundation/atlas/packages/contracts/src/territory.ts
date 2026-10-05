// @atlas/contracts — territory.ts
//
// The CANONICAL territories-manifest shape (ownership + criticality overlay, NOT the file tree).
// The richer knowledge shape (TerritoryView) is a DIFFERENT type in @atlas/knowledge, not here.

import type { Tier } from "./tier.js"

/** The atomic unit of governance. Declaration order is significant (overlap tiebreak). `tier` is
 *  human-ratified; `owner` MAY be generated (INDEX-15). (atlas-index lines 76-78)
 *
 *  FLAG (out-of-membership field types): the reference types `owner: seat` and `globs: Glob[]`.
 *  Neither `seat` nor `Glob` is in the ratified contracts membership, and both are nominal strings
 *  owned elsewhere (a seat id / a glob pattern). Transcribed here as their underlying `string`
 *  form — NOT invented as new exported contract types. */
export interface Territory {
  readonly name: string
  readonly owner: string // reference: `seat` (nominal seat id) — see FLAG above
  readonly tier: Tier
  readonly globs: readonly string[] // reference: `Glob[]` (glob pattern) — see FLAG above
}
