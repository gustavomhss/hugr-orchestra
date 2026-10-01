// @atlas/memory — src/rules.ts  (WP-6.25-a.MEM · MEM-3 + MEM-7)
//
// The project Rules-slab — the ONLY WRITTEN injected memory (slab 3 of the turn-header). MEM-3: the injected
// `project` set is CAPPED (member `~500` / orchestrator `~800` tok); a would-exceed write is a STRUCTURED
// rejection (honest `tokens`-vs-`cap` receipt), never a silent overflow. MEM-7: the injected set is the
// TOP-12 by `frecency`, a SINGLE time-decayed score of LOGGED CITED hits (decay over logged WAVES, never
// wall-clock); a ~zero-frecency entry is EVICTED to the archive (retained, re-spawnable — no memory dies).
// SEAM (sealed @atlas/kernel, KERNEL-4): the versioned store's insert-only floor + record identity go through
// the kernel `createLog` / `id` seam ALONE. Bounds are ratified PINNED BOUNDS carried as PROSE→named constants.

import { id, createLog } from "@atlas/kernel"
import type { Event, EventLog } from "@atlas/kernel"
import type { Hash, Budget } from "@atlas/contracts"
import type { ProjectMemoryEntry } from "./types.js"

// ── frozen cap + frecency surfaces, co-located here (was ref/cap.ts · ref/frecency.ts) ─────────────────────

/**
 * The structured cap-gate verdict (MEM-3) — an honest receipt (`tokens` vs `cap`), never a silent boolean
 * overflow. A would-exceed write yields `accepted:false` and is rejected fail-closed.
 *
 * [PINNED —rejection payload not frozen] The reference freezes "a structured rejection", not a concrete
 * shape; the honest receipt (summed `tokens` + the `cap`) is transcribed — no invented error record.
 */
export interface CapVerdict {
  readonly accepted: boolean
  readonly tokens: number // Σ tok(e) over the injected set (pinned tokenizer — a trusted primitive)
  readonly cap: number // the ratified per-member bound (~500 member / ~800 orchestrator)
}

export interface CapApi {
  /** The cap gate: sums the pinned tokenizer over the injected `project` set and ACCEPTS iff `≤ cap`,
   *  else a structured REJECT (never a silent overflow — MEM-3). Pure + total. (method-tags-mem:39)
   *
   *  [FLAG — the per-MEMBER total cap is a scalar, not a `Budget` field] contracts `Budget` is per
   *  `InjectionKind` (`capTokens` per surface); the MEM-3 cap is a per-MEMBER TOTAL over the whole
   *  injected `project` set. It is transcribed as the `cap: number` argument here (NOT a `Budget` leg);
   *  `Budget` remains the per-surface ledger. Flagged if a per-member-total field is later added. */
  capGate(entries: readonly ProjectMemoryEntry[], cap: number): CapVerdict

  /** The per-surface budget ledger for a memory injection surface (reuses contracts `Budget` unchanged —
   *  no extra memory field needed at this seam). Reads the cap + observed hit-rate for the drop-order.
   *
   *  [PINNED —`surface` key] transcribed as the `Budget.kind` (`InjectionKind`) it wraps; the concrete
   *  read is a WP concern. */
  surfaceBudget(surface: Budget["kind"]): Budget
}

/**
 * One logged, CITED hit — a ledger event where a seat / cold-reviewer cited a rule-id as governing a
 * decision (MEM-7). The DENOMINATOR of the frecency score.
 *
 * [FLAG — `ruleId` is NOT a frozen field of `ProjectMemoryEntry`] MEM-7 cites a "rule-id" in the ledger,
 * but the frozen `ProjectMemoryEntry` template (`{rule, scope, grounding?, frecency}`) carries NO id
 * field. Transcribed as `ruleId: string`; flagged UPWARD for the reference to surface the entry↔ledger
 * identity key the citation binds to.
 *
 * [PINNED — `wave` unit] the decay step is over LOGGED ledger events / waves, never wall-clock; the
 * ordering key is `wave: number` — a logical ledger position (monotone event-count), never wall-clock
 * (MEM-7), consistent with knowledge/hits.
 */
export interface CitedHit {
  readonly ruleId: string // [FLAG] no id on ProjectMemoryEntry — the entry↔ledger key is unfrozen
  readonly wave: number // [PINNED] logical ledger position (monotone event-count), never wall-clock (MEM-7)
}

/** The append-only ledger of cited hits the frecency score decays over (MEM-7). */
export type HitLedger = readonly CitedHit[]

/**
 * The rank/evict result (MEM-7). `injected` = the top-slots hot set; `evicted` = decayed-to-~zero entries
 * moved to the archive (retained, re-spawnable — never deleted). A total, deterministic partition.
 */
export interface FrecencyRanking {
  readonly injected: readonly ProjectMemoryEntry[] // top-N by frecency — the hot set
  readonly evicted: readonly ProjectMemoryEntry[] // ~zero-frecency — archived, versioned, re-spawnable
}

export interface FrecencyApi {
  /** The single time-decayed frecency score of an entry = `decay(Σ cited-hit events)` over the ledger;
   *  decayed on read/write; near-zero ⇒ eviction (MEM-7). Pure + deterministic. (method-tags-mem:67) */
  score(entry: ProjectMemoryEntry, ledger: HitLedger): number

  /** Rank the injected set: sort-desc by `score`, take the top slots; partition off the ~zero-frecency
   *  evictions to the archive. TOTAL order with a deterministic tie-break; an old-popular rule cannot pin
   *  a slot; no memory deleted (MEM-7). Pure + deterministic. (method-tags-mem:67) */
  rank(entries: readonly ProjectMemoryEntry[], ledger: HitLedger): FrecencyRanking
}

// ── ratified pinned bounds (PROSE → named constants) ─────────────────────────────────────────────────────

/** Member injected-`project` token cap (MEM-3, `~500`). Enforced fail-closed by `capGate`. */
export const MEMBER_TOK_CAP = 500
/** Orchestrator injected-`project` token cap (MEM-3, `~800`). */
export const ORCH_TOK_CAP = 800
/** The injected slot count — the top-12 by frecency (ratified PROSE bound). */
export const RULES_SLAB_SLOTS = 12
/** The per-logged-wave decay factor (SCN-MEM-7b-1 fixture bound: `decay 0.5/wave`). */
export const DECAY_PER_WAVE = 0.5
/**
 * The `~zero` frecency eviction floor: an entry whose decayed score falls BELOW this is evicted to the
 * archive (MEM-7c), even with free slots. Set between the golden's evicted (`≈0.05` / `≈0.098`) and
 * retained (a live single fresh hit `= 1.0`) bands — any value in `(0.098, 1.0)` honours both `-1` goldens.
 */
export const NEAR_ZERO_FRECENCY = 0.1

// ── MEM-3: the injected-cap gate ─────────────────────────────────────────────────────────────────────────

/** The pinned tokenizer (a trusted primitive, Refuse-to-model): a whitespace word-count over `rule`. */
export function tok(entry: ProjectMemoryEntry): number {
  const t = entry.rule.trim()
  return t === "" ? 0 : t.split(/\s+/).length
}

/** A `project` rule whose tokenizer size is EXACTLY `toks` (fixture helper — an `id`-labelled `toks`-word rule). */
export function ruleOfTokens(id: string, toks: number): ProjectMemoryEntry {
  const words = toks <= 0 ? "" : Array.from({ length: toks }, () => id).join(" ")
  return { rule: words, scope: "*", frecency: 0 }
}

/**
 * MEM-3 — the cap gate: sum the pinned tokenizer over the injected `project` set and ACCEPT iff `≤ cap`,
 * else a STRUCTURED reject (`accepted:false`) carrying the honest `tokens`-vs-`cap` receipt — NEVER a silent
 * overflow or truncation. Pure + total.
 */
export function capGate(entries: readonly ProjectMemoryEntry[], cap: number): CapVerdict {
  const tokens = entries.reduce((n, e) => n + tok(e), 0)
  return { accepted: tokens <= cap, tokens, cap }
}

/** The per-surface budget ledger for a memory injection surface (reuses contracts `Budget` unchanged). */
export function surfaceBudget(surface: Budget["kind"]): Budget {
  const capTokens = surface === "projectMem" ? MEMBER_TOK_CAP : 0
  return { kind: surface, capTokens, hits: 0, hitRate: 0 }
}

// ── MEM-7: cited hits + the frecency score ───────────────────────────────────────────────────────────────

/**
 * One raw ledger event. `governing:true` = a seat / cold-reviewer CITED this rule-id as GOVERNING a decision
 * (a real hit); `governing:false` = a mere read / mention (NOT a hit — the cited-only increment law).
 * `wave` is the PINNED logical ledger position (a monotone event-count, never wall-clock — MEM-7).
 */
export interface RuleEvent {
  readonly ruleId: string
  readonly wave: number
  readonly governing: boolean
}

/** Project the cited-as-governing sub-ledger (MEM-7a) — mentions dropped ⇒ the frozen `HitLedger`. */
export function citedHits(events: readonly RuleEvent[]): HitLedger {
  return events.filter((e) => e.governing).map((e): CitedHit => ({ ruleId: e.ruleId, wave: e.wave }))
}

/** The count of CITED hits for a rule-id (MEM-7a) — the real denominator; a mention never bumps it. */
export function citedHitCount(ruleId: string, events: readonly RuleEvent[]): number {
  return events.filter((e) => e.governing && e.ruleId === ruleId).length
}

/** The current wave = the head logical ledger position (max event-count); an empty ledger is wave 0. */
function currentWave(ledger: HitLedger): number {
  return ledger.reduce((w, h) => (h.wave > w ? h.wave : w), 0)
}

/**
 * MEM-7 — the single time-decayed frecency score of an ENTRY's cited-hit ledger: `Σ decay^(now − wave)`
 * over the (entry-scoped) `HitLedger`, `now` = the ledger's head wave. Recency-weighted, so an old-popular
 * rule (many hits, all far in the past) decays to ~zero and CANNOT pin a slot (no LFU ossification). Pure +
 * deterministic — no wall-clock enters the ranking.
 *
 * The frozen `score(entry, ledger)` passes the entry's OWN cited-hit sub-ledger (the caller scopes it — the
 * ref FLAG that `ProjectMemoryEntry` carries no id is bridged at the `RuleRecord` layer, see `rankRules`).
 */
export function score(_entry: ProjectMemoryEntry, ledger: HitLedger): number {
  const now = currentWave(ledger)
  return ledger.reduce((s, h) => s + Math.pow(DECAY_PER_WAVE, now - h.wave), 0)
}

/**
 * The wave-correct frecency of a rule-id against the SHARED ledger: its cited hits decayed to the ledger's
 * head wave (`now` = the whole ledger's latest event, NOT the rule's own latest hit). This is the recency-
 * comparable score the ranker uses — the frozen `score(entry, ledger)` above is entry-scoped only because
 * the frozen entry carries no id (the ref FLAG), so it cannot itself carry the global head wave.
 */
export function frecencyOf(ruleId: string, events: readonly RuleEvent[]): number {
  const ledger = citedHits(events)
  const now = currentWave(ledger)
  return ledger.filter((h) => h.ruleId === ruleId).reduce((s, h) => s + Math.pow(DECAY_PER_WAVE, now - h.wave), 0)
}

// ── MEM-7: the top-12 frecency ranker + ~zero eviction (RuleRecord bridges the entry↔ledger key) ─────────

/**
 * A project rule as ranked — the frozen `ProjectMemoryEntry` PLUS its ledger identity `id` (the rule-id a
 * `CitedHit` cites). This pairing bridges the `CitedHit` FLAG (the entry carries no id) at the WP layer;
 * `id` is NOT invented onto the frozen entry type.
 */
export interface RuleRecord {
  readonly id: string
  readonly entry: ProjectMemoryEntry
}

/** Score a record against the FULL ledger: its own cited hits decayed to the ledger's shared head wave. */
function scoreOf(record: RuleRecord, ledger: HitLedger, now: number): number {
  return ledger.filter((h) => h.ruleId === record.id).reduce((s, h) => s + Math.pow(DECAY_PER_WAVE, now - h.wave), 0)
}

/**
 * MEM-7 — rank the injected Rules-slab. Score every record over the shared ledger (one `now` = the ledger
 * head), sort DESC by score with a TOTAL, deterministic tie-break by rule-id ASC (never insertion-order),
 * then partition: `injected` = the non-`~zero` records up to the top-`RULES_SLAB_SLOTS`; `evicted` =
 * everything else (records that decayed to `~zero`, PLUS any capacity overflow beyond the slot count). A
 * `~zero` record is evicted EVEN WITH FREE SLOTS (MEM-7c) so no old-popular rule pins a slot (MEM-7d);
 * eviction moves nothing off the versioned store — see `makeRuleStore` (MEM-7f). Pure + deterministic.
 */
export function rankRules(
  records: readonly RuleRecord[],
  events: readonly RuleEvent[],
): {
  readonly injected: readonly RuleRecord[]
  readonly evicted: readonly RuleRecord[]
} {
  const ledger = citedHits(events)
  const now = currentWave(ledger)
  const scored = records.map((r) => ({ r, s: scoreOf(r, ledger, now) }))
  scored.sort((a, b) => (b.s !== a.s ? b.s - a.s : a.r.id < b.r.id ? -1 : a.r.id > b.r.id ? 1 : 0))

  const injected: RuleRecord[] = []
  const evicted: RuleRecord[] = []
  for (const { r, s } of scored) {
    if (s >= NEAR_ZERO_FRECENCY && injected.length < RULES_SLAB_SLOTS) injected.push(r)
    else evicted.push(r) // ~zero (evict-at-near-zero) OR capacity overflow — a total partition
  }
  return { injected, evicted }
}

// ── MEM-7e/f: the versioned, insert-only store — evict-to-archive, never delete ──────────────────────────

/** The rule store: active (injected-eligible) vs archive (evicted, retained) over ONE insert-only log. */
export interface RuleStore {
  insert(record: RuleRecord): void
  applyRanking(events: readonly RuleEvent[]): void
  active(): readonly RuleRecord[]
  archive(): readonly RuleRecord[]
  archiveQuery(id: string): RuleRecord | undefined
  respawn(id: string): void
  attemptDelete(id: string): never
  size(): number
}

/** Wrap a record as a content-keyed kernel `Event` (KERNEL-4 log entry); identity via the SEALED `id` seam. */
function toEvent(record: RuleRecord): Event {
  const contentHash: Hash = id(record)
  return { id: contentHash, seq: 0, contentHash, fresh: true, supersedes: [], payload: record }
}

/**
 * MEM-7e/f — the versioned Rules store over the SEALED kernel insert-only log (KERNEL-4). Every record ever
 * inserted is admitted ONCE by content id and NEVER removed: `applyRanking` partitions the active set into
 * active vs archive by frecency (evict-to-archive, retained + re-spawnable), `respawn` moves an archived
 * record back to active, and `attemptDelete` is REJECTED fail-closed. `size()` = the log length, which is
 * monotone non-decreasing across all waves (no eviction / archival churn ever shrinks it).
 */
export function makeRuleStore(): RuleStore {
  const log = createLog()
  let snapshot: EventLog = new Map()
  const activeIds = new Set<string>()
  const archivedIds = new Set<string>()
  const byId = new Map<string, RuleRecord>()

  const record = (id: string): RuleRecord | undefined => byId.get(id)
  const list = (ids: Set<string>): RuleRecord[] =>
    [...ids].map((i) => record(i)).filter((r): r is RuleRecord => r !== undefined)

  return {
    insert(rec: RuleRecord): void {
      snapshot = log.append(toEvent(rec)) // insert-only: the versioned floor grows, never shrinks
      byId.set(rec.id, rec)
      activeIds.add(rec.id)
      archivedIds.delete(rec.id)
    },
    applyRanking(events: readonly RuleEvent[]): void {
      const { injected, evicted } = rankRules(list(activeIds), events)
      activeIds.clear()
      for (const r of injected) activeIds.add(r.id)
      for (const r of evicted) archivedIds.add(r.id) // evicted → archive (retained, not deleted)
    },
    active: () => list(activeIds),
    archive: () => list(archivedIds),
    archiveQuery: (id: string) => (archivedIds.has(id) ? record(id) : undefined),
    respawn(id: string): void {
      if (!archivedIds.has(id)) return // re-spawnable solely from the retained versioned record
      archivedIds.delete(id)
      activeIds.add(id)
    },
    attemptDelete(id: string): never {
      throw new Error(`memory is never deleted: hard-remove of rule '${id}' rejected (insert-only store)`)
    },
    size: () => snapshot.size, // the versioned log length — monotone non-decreasing (MEM-7f)
  }
}

// ── frozen-oracle conformance (compile-time differential-vs-oracle) ──────────────────────────────────────

/** Bind the built surface to the FROZEN `CapApi` (`capGate` + `surfaceBudget`). */
export function makeCapApi(): CapApi {
  return { capGate, surfaceBudget }
}

/**
 * Bind the built surface to the FROZEN `FrecencyApi`. `score` decays the entry's own
 * cited-hit sub-ledger; `rank` bridges the FLAGGED entry↔ledger key by reading each entry's `rule` line as
 * its rule-id (the WP-layer identity), then partitions injected vs evicted — mapped back to the frozen
 * `ProjectMemoryEntry` partition.
 */
export function makeFrecencyApi(): FrecencyApi {
  return {
    score,
    rank(entries: readonly ProjectMemoryEntry[], ledger: HitLedger): FrecencyRanking {
      const events: RuleEvent[] = ledger.map((h) => ({ ruleId: h.ruleId, wave: h.wave, governing: true }))
      const records = entries.map((entry): RuleRecord => ({ id: entry.rule, entry }))
      const { injected, evicted } = rankRules(records, events)
      return { injected: injected.map((r) => r.entry), evicted: evicted.map((r) => r.entry) }
    },
  }
}

const _capCheck: () => CapApi = makeCapApi
const _frecencyCheck: () => FrecencyApi = makeFrecencyApi
void _capCheck
void _frecencyCheck
