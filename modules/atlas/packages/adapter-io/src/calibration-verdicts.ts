// @atlas/adapter-io — src/calibration-verdicts.ts  (WP-3-RETR — `atlas budget` / `atlas territories` verdicts)
//
// The RETR-8 budget + RETR-13 MISS-oracle READ_legs as verdicts (the `{ ok, guidance, data }` envelope the
// CLI renders), same siting as `memory-verdicts.ts` (`atlas memory-*`). Each is a THUNK the composition
// root closes over its own repo. TOTAL: the honest-zero feed renders the ratified floor / zero rate, never
// a throw — the SAME honesty discipline `own-source.ts` names at `hits: 0`.

import type { Verdict, Guidance } from "@atlas/tools"
import type { OffAtlas, OffatlasApi, RetrLedger } from "@atlas/retrieval"
import type { BudgetReport, TerritoriesLeg } from "./calibration-ledger.js"
import { OFF_ATLAS_THRESHOLD } from "./calibration-ledger.js"

// ── budget (RETR-8) ─────────────────────────────────────────────────────────────────────────────────────

const BUDGET_INVARIANT =
  "RETR-8: atlas-budget renders the per-kind hits/hitRate calibration ledger — caps tuned by OBSERVED use, never invented; a kind with zero served records stays at its ratified sweet-spot floor (hitRate 0, never NaN)"

/** The budget verdict — the frozen `ledgerFrom` over the served-injection record set (honest zero: the
 *  served-injection WRITER is the next WP, so every kind renders at its BASE_CAP floor with `servedRecords
 *  = 0`). Never throws. */
export function budgetVerdict(budget: () => BudgetReport): Verdict<BudgetReport> {
  const data = budget()
  const guidance: Guidance = {
    next:
      data.servedRecords === 0
        ? "ratified BASE_CAP floor — 0 served injections recorded (the RETR-8 writer is the next work-package; nothing fabricated here)"
        : `${data.servedRecords} served injection(s) — caps tuned by observed hitRate`,
    invariant: BUDGET_INVARIANT,
  }
  return { ok: true, guidance, data }
}

// ── territories (RETR-13) ─────────────────────────────────────────────────────────────────────────────────

const TERRITORIES_INVARIANT =
  "RETR-13: atlas-territories renders the per-territory off-atlas MISS-oracle — off-atlas rate = offAtlasReads/served, no-served-history ⇒ rate 0 (never a throw), and a rate crossing the OPEN-DEFINE threshold raises a calibration prompt"

/** One territory's MISS-oracle row + whether it CROSSES the OPEN-DEFINE threshold (the calibration-prompt
 *  signal, computed HERE from the ONE bound threshold — never re-derived downstream). */
export interface TerritoryRow extends OffAtlas {
  readonly crosses: boolean
}

/** The territory verdict DATA: the per-territory MISS-oracle rows, each carrying its crossing flag against
 *  the ONE bound `OFF_ATLAS_THRESHOLD`, plus the threshold itself (so a reader sees the number being
 *  applied). */
export interface TerritoriesData {
  readonly rows: readonly TerritoryRow[]
  readonly threshold: number
}

/** The territories verdict — the MISS-oracle over the served-turn record set (honest zero: no served-turn
 *  log exists) + the registered (admin-declared) territories. A registered-but-unserved territory renders
 *  rate 0; NEVER a throw. The threshold cross is computed HERE on the ONE bound value. */
export function territoriesVerdict(territories: TerritoriesLeg): Verdict<TerritoriesData> {
  const api = territories()
  const rows: TerritoryRow[] = api.offAtlas().map((t) => ({
    ...t,
    crosses: api.crossesThreshold(t.territory, OFF_ATLAS_THRESHOLD),
  }))
  const data: TerritoriesData = { rows, threshold: OFF_ATLAS_THRESHOLD }
  const crossed = rows.filter((r) => r.crosses)
  const guidance: Guidance = {
    next:
      crossed.length === 0
        ? `no territory crosses the off-atlas threshold (${OFF_ATLAS_THRESHOLD}) — no calibration prompt`
        : `OPEN-DEFINE threshold ${OFF_ATLAS_THRESHOLD} crossed by ${crossed.length} territory(-ies): ${crossed.map((r) => r.territory).join(", ")} — author the missing tag/edge`,
    invariant: TERRITORIES_INVARIANT,
  }
  return { ok: true, guidance, data }
}
