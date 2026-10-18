// @atlas/adapter-io — src/memory-read.ts  (the DURABLE MEMORY READ DOORS — CAMPAIGN-11 W6)
//
// ── REFERENCE MODEL — NO PRODUCTION CALLERS ──────────────────────────────────────────────────────────
// Nothing in `packages/*/src` calls `createMemoryRead` yet; W8 wires it into the CLI/MCP transport, the
// same standing `memory-store.ts` and `memory-emit.ts` state in their own headers. Declared in
// `harness/gates/reference-model-guard.mjs` rather than pre-wired — a door hung early just to clear that
// gate is the stub the gate exists to refuse.
//
// ── WHAT THIS DOOR IS ────────────────────────────────────────────────────────────────────────────────────
// The read half of MEM-1/MEM-4/MEM-7/MEM-13, composed over the REAL durable store (`memory-store.ts`), not
// an in-memory array. MEM-1's owner-scoping (`injectFor`) and MEM-4's explicit-recall gate (`recall`) are
// consumed from `@atlas/memory` unchanged; this file's own job is the one seam that package does not own:
// turning the durable log's OWN order into MEM-7's "logged wave", and MEM-13's archived record into a
// spawn push, both grounded in real appended bytes.
//
// ── THE FRECENCY BRIDGE, AND WHY IT IS THIS ONE (a labelled DECISION, not a silent choice) ─────────────────
// `rules.ts` freezes TWO parallel representations of MEM-7 and its own comments flag the seam between them
// as UNRESOLVED: `ProjectMemoryEntry.frecency` is documented as "ONE STORED NUMBER... decayed on read/write"
// (types.ts:52-56, rules.ts's own template docs), while `rankRules`/`RuleEvent`/`HitLedger` model frecency
// as a SUM of unit-weight cited-hit events decayed from a shared head wave — and `CitedHit.ruleId` carries
// the flag "no id on ProjectMemoryEntry — the entry↔ledger identity key is unfrozen" (rules.ts:53-56). No
// citation ledger exists anywhere in this tree yet (a `hit` per MEM-7 is "a seat / cold-reviewer citing a
// rule-id as governing a decision" — an ORCHESTRA-level event this package has no source for), so the
// event-summed representation has no real data to run over. The per-entry STORED number does: it is
// written by whoever emits the record (`memory-emit.ts`'s `MEM-3` gate already reads and writes it) and it
// sits on disk right now.
//
// So this door computes an EFFECTIVE frecency as `stored * DECAY_PER_WAVE ^ age`, where `age` is the
// entry's own distance, in LOGGED POSITIONS, from the durable log's own head — never wall-clock, and never
// a value this file invents: `DECAY_PER_WAVE`, `NEAR_ZERO_FRECENCY` and `RULES_SLAB_SLOTS` are the SAME
// ratified constants `rules.ts` pins for the event-summed model, reused unchanged. `age` is measured over
// the WHOLE folded log (any append by any owner of any kind advances it), which is what makes "wave" a
// property of the LEDGER and not of one seat's activity or the clock on the wall — a rule nobody re-affirms
// ages exactly as fast whether the process sleeps for a second or a decade between reads.
//
// The bound, stated rather than glossed: `rankRules`'s cited-hit-sum model and this door's stored-value-decay
// model do NOT need to agree numerically — they are two different sources for the same invariant (MEM-7),
// and reconciling them (giving `ProjectMemoryEntry` a ledger-identity `id` and a real citation ledger to sum)
// is future work this file does not attempt, and does not silently paper over by picking one and hiding it.
//
// ── MEM-13, separately: the archived fold is a STRAIGHT PROJECTION, no bridge needed ────────────────────
// `respawn.ts` already turns the durable log's own `EventLog` into a `FoldArchive` (`foldArchiveFromRecord`)
// and a spawn push (`makeRespawn`), unchanged since W2 wired `versioned`/`respawnFromRecord` over the same
// log. This file's `spawnFold` is a thin composition of those two, turned into a named verdict rather than
// a caught throw — the same discipline `memory-emit.ts` states in its own header.

import type { DurableMemory, MemoryRead } from "./memory-store.js"
import {
  DECAY_PER_WAVE,
  NEAR_ZERO_FRECENCY,
  RULES_SLAB_SLOTS,
  injectFor,
  recall as recallOver,
  foldArchiveFromRecord,
  makeRespawn,
} from "@atlas/memory"
import type {
  Awareness,
  ClosingFold,
  MemberId,
  MemoryRecord,
  Orientation,
  ProjectMemoryEntry,
  ResumeUnit,
  TurnHeader,
} from "@atlas/memory"

/** What a read door needs: the durable store it reads over, and the seat whose Memory it is reading. */
export interface MemoryReadDeps {
  readonly store: DurableMemory
  readonly actor: MemberId
}

/** The frecency-ranked project slab (MEM-7): `injected` is the hot top-`RULES_SLAB_SLOTS`, `evicted` is
 *  every entry that decayed below `NEAR_ZERO_FRECENCY` OR lost the capacity cut, in EITHER order. Nothing
 *  is ever a third thing — every one of the seat's own `project` entries lands in exactly one bucket. */
export interface ProjectSlab {
  readonly injected: readonly ProjectMemoryEntry[]
  readonly evicted: readonly ProjectMemoryEntry[]
}

export type RuleRespawnRefusal = "unknown-rule" | "not-evicted"

export interface RuleRespawnRejected {
  readonly ok: false
  readonly refusal: RuleRespawnRefusal
  readonly reason: string
}
export interface RuleRespawnAdmitted {
  readonly ok: true
  readonly entry: ProjectMemoryEntry
}
/** MEM-7f — an evicted rule is still re-spawnable: this NEVER deletes, it only reports whether the rule
 *  the seat is asking for still exists on the (append-only) durable record and was in fact evicted. */
export type RuleRespawnVerdict = RuleRespawnAdmitted | RuleRespawnRejected

export type SpawnFoldRefusal = "no-own-fold"

export interface SpawnFoldRejected {
  readonly ok: false
  readonly refusal: SpawnFoldRefusal
  readonly reason: string
}
export interface SpawnFoldAdmitted {
  readonly ok: true
  readonly fold: ClosingFold
}
/** MEM-13 — a named verdict rather than a caught throw, matching `memory-emit.ts`'s discipline: a caller
 *  distinguishes "nothing to push" from every other failure shape, none of which is generic. */
export type SpawnFoldVerdict = SpawnFoldAdmitted | SpawnFoldRejected

export interface MemoryReadDoor {
  /** MEM-1 + MEM-4 + MEM-7, over the durable store: the running-turn header for `deps.actor` — `awareness`
   *  and `orientation` pass through unchanged (shared + derived, not this door's concern), `rules` is the
   *  seat's OWN top-`RULES_SLAB_SLOTS` project entries by effective frecency. Structurally excludes
   *  `task`/`pr`/`logbook` — `TurnHeader` has no field for them (MEM-4/A12/A31). */
  header(awareness: Awareness, orientation: Orientation): TurnHeader
  /** MEM-7 alone: the full ranked partition, injected + evicted, for `deps.actor`. */
  projectSlab(): ProjectSlab
  /** MEM-4's ONE path to consultable memory (`task`/`pr`/`logbook`) — an explicit query, never free. */
  recall(query: unknown): readonly MemoryRecord[]
  /** MEM-7f — move an evicted rule back into consideration; a no-op on the durable record itself, since
   *  nothing durable was ever removed to begin with. */
  respawnRule(ruleId: string): RuleRespawnVerdict
  /** MEM-13 — the seat's own archived closing fold for the unit it is resuming, pushed once at spawn. */
  spawnFold(unit: ResumeUnit): SpawnFoldVerdict
}

/** One of the seat's own `project` entries, plus WHERE in the folded log it currently sits — the position
 *  a re-affirming append (same `rule` text, a fresh record) moves forward, so a rule that is written again
 *  gets younger without any wall-clock read anywhere in this file. */
interface Positioned {
  readonly entry: ProjectMemoryEntry
  readonly wave: number
}

/** The seat's OWN `project` entries (MEM-1's `injectFor`, reused unchanged — zero cross-seat), one per
 *  distinct `rule` id, keyed to the LATEST record's position in the folded log (last-write-wins: a rule
 *  re-appended with new text or a new stored `frecency` is the current one, not a duplicate). */
function ownProjectPositions(read: MemoryRead, seat: MemberId): Map<string, Positioned> {
  // MEM-1's `injectFor` decides WHICH records are this seat's own (zero cross-seat, A11); this file adds
  // only the `kind === 'project'` narrowing and the record's own position in the WHOLE folded log — the
  // global index is what makes an entry age when ANYONE appends, not only when this seat does (A26).
  const own = injectFor(read.store, seat).filter((r): boolean => r.kind === "project")
  const byRule = new Map<string, Positioned>()
  for (const r of own) {
    const entry = r.entry as ProjectMemoryEntry
    const wave = read.store.indexOf(r)
    byRule.set(entry.rule, { entry, wave })
  }
  return byRule
}

/** `stored * DECAY_PER_WAVE ^ age`, `age` = the whole log's own head position minus the entry's own
 *  position — a property of the LEDGER, never `Date.now()` (see the file header's decision). */
function effectiveFrecency(stored: number, headWave: number, entryWave: number): number {
  const age = headWave - entryWave
  return stored * Math.pow(DECAY_PER_WAVE, age)
}

interface Ranked {
  readonly id: string
  readonly entry: ProjectMemoryEntry
  readonly effective: number
}

/** MEM-7 — rank the seat's own project entries by EFFECTIVE frecency, descending; a TOTAL, deterministic
 *  tie-break by rule text ASC (never insertion order). Partition: `injected` = non-near-zero, capped at
 *  `RULES_SLAB_SLOTS`; `evicted` = everything else — a near-zero entry is evicted EVEN WITH FREE SLOTS. */
function rankProjectEntries(read: MemoryRead, seat: MemberId): ProjectSlab {
  const positions = ownProjectPositions(read, seat)
  const headWave = read.store.length - 1
  const ranked: Ranked[] = [...positions.entries()]
    .map(([id, { entry, wave }]) => ({ id, entry, effective: effectiveFrecency(entry.frecency, headWave, wave) }))
    .sort((a, b) => (b.effective !== a.effective ? b.effective - a.effective : a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  const injected: ProjectMemoryEntry[] = []
  const evicted: ProjectMemoryEntry[] = []
  for (const r of ranked) {
    if (r.effective >= NEAR_ZERO_FRECENCY && injected.length < RULES_SLAB_SLOTS) injected.push(r.entry)
    else evicted.push(r.entry)
  }
  return { injected, evicted }
}

export function createMemoryRead(deps: MemoryReadDeps): MemoryReadDoor {
  return {
    header(awareness, orientation): TurnHeader {
      const read = deps.store.read()
      // The three slabs, assembled directly (MEM-1/MEM-4/MEM-7): `awareness`/`orientation` pass through
      // unchanged (shared + derived elsewhere), `rules` is the seat's OWN ranked top slab. `TurnHeader`'s
      // shape carries no `task`/`pr`/`logbook` field — the structural half of MEM-4/A12/A31.
      return { awareness, orientation, rules: rankProjectEntries(read, deps.actor).injected }
    },

    projectSlab(): ProjectSlab {
      return rankProjectEntries(deps.store.read(), deps.actor)
    },

    recall(query: unknown): readonly MemoryRecord[] {
      // MEM-4's one path to consultable memory — `recall` itself refuses an unqualified query (returns
      // nothing), so this door adds no policy of its own here; it is a straight pass-through over the
      // durable store's folded state.
      return recallOver(deps.store.read().store, query)
    },

    respawnRule(ruleId: string): RuleRespawnVerdict {
      const { injected, evicted } = rankProjectEntries(deps.store.read(), deps.actor)
      const found = evicted.find((e) => e.rule === ruleId)
      if (found !== undefined) return { ok: true, entry: found }
      if (injected.some((e) => e.rule === ruleId)) {
        return {
          ok: false,
          refusal: "not-evicted",
          reason: `MEM-7f: rule '${ruleId}' is already in the injected set for '${deps.actor}'`,
        }
      }
      return {
        ok: false,
        refusal: "unknown-rule",
        reason: `MEM-7f: no project rule '${ruleId}' exists for '${deps.actor}' — nothing to re-spawn`,
      }
    },

    spawnFold(unit: ResumeUnit): SpawnFoldVerdict {
      const archive = foldArchiveFromRecord(deps.store.read().log)
      try {
        const fold = makeRespawn(archive).spawnRecall(deps.actor, unit)
        return { ok: true, fold }
      } catch (e) {
        return {
          ok: false,
          refusal: "no-own-fold",
          reason: e instanceof Error ? e.message : String(e),
        }
      }
    },
  }
}
