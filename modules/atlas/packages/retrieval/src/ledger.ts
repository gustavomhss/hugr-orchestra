// @atlas/retrieval — src/ledger.ts  (RETR-8 hits/hitRate ledger + caps tuned by observed hits)
//
// The per-kind hits/hitRate ledger (`budget()`) + caps tuned by observed hits (`capFor`); `hits` measure
// PRECISION, never COVERAGE (that is RETR-13's MISS-oracle). Accrual is a commutative integer reduction
// (order-independent, deterministic); rows emit in the sorted frozen `InjectionKind` order. NEVER hashes/
// tokenizes. [FLAG] the cap-tuning `gain` is parametric (reference is silent — REQ-RETR-8a), not a baked
// constant; floored at the RETR-7 sweet-spot when `hitRate = 0`. `dropOrder` lives in drop.ts, not here.

import type { Budget, InjectionKind } from "@atlas/contracts"
import type { CapsApi } from "./types.js"

/**
 * Calibration from observed use, not guesswork (RETR-8). The per-kind `hits`/`hitRate` accumulator the
 * cap-table (`CapsApi`) and drop-policy (`drop.ts`) READ; `hits` measure PRECISION (served facts used),
 * never COVERAGE (that is RETR-13's MISS-oracle). (atlas-retrieval:113-117 / method-tags-ret:70-75)
 */
export interface LedgerApi {
  /** The per-kind budget ledger (RETR-6/8): each kind's cap + live `hits` + observed `hitRate`, for
   *  calibration. Pure. (atlas-retrieval:173) */
  budget(): readonly Budget[]
}

/**
 * The ratified RETR-7 sweet-spot caps under the pinned `cl100k_base` measure — the never-used FLOOR the
 * observed-hits tuning lifts from. Transcribed from atlas-retrieval:107-110 / goldens-ret.md §Fixture B
 * (Awareness `400` · Orientation `250` · projectMem `500` · own `1500` · pack `2000` ·
 * protocols.safetyCritical/advisory `500` shared · poke `150`). NOT invented.
 */
export const BASE_CAP: Readonly<Record<InjectionKind, number>> = {
  awareness: 400,
  orientation: 250,
  projectMem: 500,
  own: 1500,
  pack: 2000,
  "protocols.safetyCritical": 500,
  "protocols.advisory": 500,
  poke: 150,
}

/** The frozen `InjectionKind` vocabulary in a fixed sorted key order — the deterministic `budget()` order. */
const KINDS: readonly InjectionKind[] = (Object.keys(BASE_CAP) as InjectionKind[]).slice().sort()

/**
 * [FLAG — parametric, not baked] The default cap-tuning gain. The reference is SILENT on the tuning law
 * (REQ-RETR-8a routes the FORMULA to no pinned constant); this is a documented default, overridable per
 * `ledgerFrom`, never a hidden magic number. At `gain = 1` a fully-used kind (`hitRate = 1`) earns up to 2×
 * its sweet-spot; an unused kind stays at the floor.
 */
export const DEFAULT_TUNE_GAIN = 1

/** One served injection: the `kind` injected + whether it governed a decision this turn (a RETR-8 hit). */
export interface HitRecord {
  readonly kind: InjectionKind
  readonly hit: boolean
}

/**
 * The tuned cap: `round(base * (1 + gain*hitRate))` — deterministic, monotone in `hitRate` (hence in
 * observed hits for a fixed served count), FLOORED at `base` when `hitRate = 0` (a never-used kind is
 * untuned). Pure + total. (RETR-8a)
 */
export function tunedCap(base: number, hitRate: number, gain: number = DEFAULT_TUNE_GAIN): number {
  return Math.round(base * (1 + gain * hitRate))
}

/** The RETR-8 ledger surface: the calibration `budget()` (LedgerApi) + caps tuned by observed hits (CapsApi). */
export interface RetrLedger extends LedgerApi, CapsApi {
  budget(): readonly Budget[]
  capFor(kind: InjectionKind): number
}

/**
 * Build the RETR-8 ledger from a served-injection record set (RETR-8a/8b). `hits`/`served` accrue by a
 * COMMUTATIVE integer reduction (order-independent, deterministic); `hitRate = hits/served` (served `0` ⇒
 * `0`, never `NaN`); `capFor` tunes the ratified sweet-spot by observed `hitRate` (`gain`-parametric). The
 * emitted `budget()` rows are the drop-order oracle `src/drop.ts` reads — this facet does NOT order them.
 * Pure + total. `gain` is the documented, overridable tuning parameter (never a baked constant).
 */
export function ledgerFrom(records: readonly HitRecord[], gain: number = DEFAULT_TUNE_GAIN): RetrLedger {
  const served = new Map<InjectionKind, number>()
  const hitCount = new Map<InjectionKind, number>()
  for (const r of records) {
    served.set(r.kind, (served.get(r.kind) ?? 0) + 1)
    if (r.hit) hitCount.set(r.kind, (hitCount.get(r.kind) ?? 0) + 1)
  }
  const rateOf = (kind: InjectionKind): number => {
    const s = served.get(kind) ?? 0
    return s === 0 ? 0 : (hitCount.get(kind) ?? 0) / s // served 0 ⇒ 0, never NaN
  }
  const capFor = (kind: InjectionKind): number => tunedCap(BASE_CAP[kind], rateOf(kind), gain)
  const budget = (): readonly Budget[] =>
    KINDS.map((kind) => ({
      kind,
      capTokens: capFor(kind),
      hits: hitCount.get(kind) ?? 0,
      hitRate: rateOf(kind),
    }))
  return { budget, capFor }
}
