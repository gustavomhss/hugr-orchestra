// @atlas/retrieval — src/offatlas.ts  (RETR-13 per-territory off-atlas MISS-oracle)
//
// The MISS-oracle: per territory an OFF-ATLAS RATE = `offAtlasReads / served` — the fraction of served
// turns a seat had to Read/Grep OUTSIDE the surfaced scope-set. Measures COVERAGE (the silent failure the
// drift-oracle cannot see), where RETR-8 `hits` measure PRECISION. Accrual is a commutative integer
// reduction; rows emit in sorted territory order (deterministic); NEVER hashes/tokenizes. No served
// history ⇒ rate `0`, never a throw. [FLAG] the trigger threshold θ is an OPEN DEFINE dependency — taken
// as an explicit parameter (`offAtlasRate > θ`), never a baked constant.

import type { OffAtlas } from "./types.js"

/**
 * [OPEN DEFINE — RETR-13] The off-atlas rate value that triggers a calibration prompt. The reference is
 * SILENT on this number (an open DEFINE reconciliation); transcribed as a parameter — a `number` —
 * NEVER a baked constant. S3's golden binds the concrete value once DEFINE supplies it.
 */
export type OffAtlasThreshold = number

/**
 * The MISS-oracle — off-atlas coverage per territory (RETR-13). Logs, per territory, an OFF-ATLAS RATE =
 * `offAtlasReads / served`; measures COVERAGE (the silent failure the drift-oracle cannot see). A
 * territory with no served history yields rate `0`, never a throw. (atlas-retrieval:154-162)
 *
 * [OPEN DEFINE — RETR-13 threshold is PARAMETRIC] The value that triggers the calibration prompt
 * (REQ-RETR-13b) is routed to DEFINE (`req-ret.md` §[NEEDS RECONCILIATION]); it is SILENT in the
 * reference clause and MUST NOT be invented at S2. `crossesThreshold` takes it as an explicit parameter.
 */
export interface OffatlasApi {
  /** Per-territory coverage ledger (the MISS-oracle, RETR-13): each territory's `served` /
   *  `offAtlasReads` / `offAtlasRate`. Deterministic; a territory with no served history reports rate
   *  `0`, never a throw. (atlas-retrieval:174) */
  offAtlas(): readonly OffAtlas[]

  /** The threshold-crossing predicate (RETR-13), written PARAMETRIC over the OPEN-DEFINE threshold: a
   *  territory whose off-atlas rate crosses `threshold` MUST raise a calibration prompt to author the
   *  missing tag/edge. Pure + total (no served history ⇒ `false`, never a throw). The concrete
   *  `threshold` is an OPEN DEFINE dependency — supplied at DEFINE, bound by S3's golden, NOT invented
   *  here. (method-tags-ret:109-110)
   *
   *  [FLAG — `territory` arg type] transcribed as `string` (the territory name / governance key),
   *  matching `OffAtlas.territory`. */
  crossesThreshold(territory: string, threshold: OffAtlasThreshold): boolean
}

/** One served turn for a territory + whether the seat had to `Read`/`Grep` OUTSIDE the surfaced scope-set. */
export interface TurnRecord {
  readonly territory: string
  readonly offAtlas: boolean
}

/**
 * Build the RETR-13 off-atlas MISS-oracle from a served-turn record set. `served`/`offAtlasReads` accrue by
 * a COMMUTATIVE integer reduction (deterministic, order-independent). `known` names territories to include
 * with `served = 0` even when never served (a registered-but-unserved territory reports rate `0`, never a
 * throw — SCN-RETR-13d/e). Pure + total.
 *   - `offAtlas()`        — one row per (served ∪ known) territory, in sorted territory order.
 *   - `crossesThreshold`  — `offAtlasRate > threshold` (θ is a PARAMETER, an OPEN DEFINE dependency).
 */
export function offAtlasFrom(turns: readonly TurnRecord[], known: readonly string[] = []): OffatlasApi {
  const served = new Map<string, number>()
  const offReads = new Map<string, number>()
  for (const t of turns) {
    served.set(t.territory, (served.get(t.territory) ?? 0) + 1)
    if (t.offAtlas) offReads.set(t.territory, (offReads.get(t.territory) ?? 0) + 1)
  }
  for (const k of known) if (!served.has(k)) served.set(k, 0) // registered-but-unserved ⇒ served 0

  const rateOf = (territory: string): number => {
    const s = served.get(territory) ?? 0
    return s === 0 ? 0 : (offReads.get(territory) ?? 0) / s // no served history ⇒ 0, never NaN / throw
  }

  const offAtlas = (): readonly OffAtlas[] =>
    [...served.keys()].sort().map((territory) => ({
      territory,
      served: served.get(territory) ?? 0,
      offAtlasReads: offReads.get(territory) ?? 0,
      offAtlasRate: rateOf(territory),
    }))

  const crossesThreshold = (territory: string, threshold: OffAtlasThreshold): boolean => rateOf(territory) > threshold // parametric over the OPEN-DEFINE θ; total (unknown territory ⇒ rate 0)

  return { offAtlas, crossesThreshold }
}
