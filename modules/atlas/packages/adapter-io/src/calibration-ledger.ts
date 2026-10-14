// @atlas/adapter-io — src/calibration-ledger.ts  (the PRODUCTION legs for RETR-8's budget + RETR-13's MISS-oracle)
//
// The two frozen @atlas/retrieval calibration surfaces — the per-kind hits/hitRate `ledger.ts` budget and the
// per-territory off-atlas `offatlas.ts` MISS-oracle — become RUNNING CODE here. Before this module the REF-
// MODEL ledger was closed for the whole product (the zero-caller state `own-source.ts`'s header reported at
// `hits: 0`); the `atlas budget` / `atlas territories` read commands are what the two frozen facets are
// composed into. NOTHING is reimplemented: `ledgerFrom`/`offAtlasFrom` are the ONE implementation, and this
// file answers only (a) where the record sets come from and (b) the OPEN-DEFINE threshold binding.
//
// ── THE FEEDS, STATED HONESTLY RATHER THAN FABRICATED ─────────────────────────────────────────────────
// Both frozen facets read a record set (`HitRecord {kind, hit}` for RETR-8; `TurnRecord {territory,
// offAtlas}` for RETR-13). THE PRODUCT HAS NO WRITER FOR EITHER SET, and neither is invented here:
//
//   `budget`  — the per-KIND served-injection ledger. The ONE in-process served-use ledger that exists in
//   this product is the #321 USE-OR-SEAL bound (`compose.ts` `bindHits`), which logs a hit per ADVISORY NODE
//   each time it is served in a pack. It is NOT a RETR-8 feed, for three measured reasons: it accrues PER-
//   NODEKEY (there is no node→InjectionKind mapping anywhere in the store, and `InjectionKind` is the frozen
//   kind vocabulary `budget()` reads), it logs on EVERY serve rather than only on a governed DECISION (the
//   RETR-8 `hit` flag), and it is IN-PROCESS memory that resets between CLI invocations (nothing durable).
//   Rewiring it would mean inventing the kind mapping the caller cannot provide. So the served record set is
//   the honest zero `[]`, exactly as `own-source.ts` renders `hits: 0`, and the command says so.
//
//   `territories` — the per-territory off-atlas turns. A turn record is one seat's served turn + whether it
//   had to `Read`/`Grep` OUTSIDE the surfaced scope-set. No served-turn log exists anywhere in the product;
//   the query serve path records neither territory nor off-atlas-ness. Records: the honest zero `[]`.
//   The `known` vocabulary — territories that are REGISTERED even if never served — is REAL and is read,
//   never invented: the admin-declared `authz.scopes` keys, the same governance-scope vocabulary
//   `own-source.ts`'s `terrainOwner` reads for "who owns this scope". A registered-but-unserved territory
//   is exactly the SCN-RETR-13d/e shape: rate 0, never a throw.
//
// ── THE ONE OPEN-DEFINE BINDING ───────────────────────────────────────────────────────────────────────
// The frozen `crossesThreshold(territory, θ)` is PARAMETRIC (REQ-RETR-13b's θ is a DEFINE dependency, silent
// in the reference). This is the ONE place the parameter is bound to a value — the `USE_THRESHOLD`-style
// named-single-place discipline the WP asked for; nothing downstream re-derives it. It is an OPEN-DEFINE
// placeholder, not a ratified measurement: the golden binds it at 0.3 only once DEFINE supplies the number.

import { ledgerFrom, offAtlasFrom } from "@atlas/retrieval"
import type { OffAtlasThreshold, OffatlasApi, RetrLedger } from "@atlas/retrieval"
import type { AtlasPolicy } from "./policy.js"

/**
 * [OPEN DEFINE — RETR-13b] The off-atlas rate at which a territory's missed reads raise a calibration
 * prompt. The reference clause is SILENT on the number (routed to DEFINE in `req-ret.md` §[NEEDS
 * RECONCILIATION]); bound HERE, in exactly one place, as the documented default — the frozen predicate
 * `offAtlasRate > θ` stays parametric underneath and S3's golden replaces this value once DEFINE supplies it.
 * Mirrors the `USE_THRESHOLD` single-binding discipline in `@atlas/knowledge` `src/lifecycle/hits.ts`.
 */
export const OFF_ATLAS_THRESHOLD: OffAtlasThreshold = 0.3

/** The RETR-8 budget REPORT: the frozen ledger built over the served-injection record set + how many
 *  records that set held (the CLI renders the honest-zero feed note from the count, never a guess). */
export interface BudgetReport {
  readonly ledger: RetrLedger
  readonly servedRecords: number
}

/** The composition-root RETR-8 leg: `atlas budget` renders this. THUNK — re-derived per call. */
export type BudgetLeg = () => BudgetReport

/** The composition-root RETR-13 leg: `atlas territories` renders this. THUNK — re-derived per call. */
export type TerritoriesLeg = () => OffatlasApi

/**
 * THE RETR-8 production leg. The served-injection record set is the honest zero `[]`, for the reason in the
 * header: no production writer records served injections per KIND anywhere durable. `ledgerFrom([])` still
 * emits every kind at the ratified BASE_CAP floor with hitRate 0 (never NaN) — the "0 served — caps at
 * sweet-spot" rendering the repo's honest-zero culture demands, never an invented rate. The feed is the
 * RETR-8 writer, the next work-package; the seam exists to receive it.
 */
export function budgetLeg(): BudgetLeg {
  return (): BudgetReport => ({ ledger: ledgerFrom([]), servedRecords: 0 })
}

/**
 * THE RETR-13 production leg. Turn records: honest zero `[]` (no served-turn log exists — see the header).
 * `known`: the ADMIN-DECLARED governance scopes (`authz.scopes` keys), read once at build — the registered-
 * territories vocabulary, sorted for determinism, so `offAtlas()` answers `served = 0 · rate 0` for every
 * registered territory (SCN-RETR-13d/e), never a throw.
 */
export function territoriesLeg(policy: AtlasPolicy): TerritoriesLeg {
  const known: readonly string[] = Object.keys(policy.authz.scopes).sort()
  return (): OffatlasApi => offAtlasFrom([], known)
}
