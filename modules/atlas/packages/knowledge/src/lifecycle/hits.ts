// @atlas/knowledge — src/hits.ts  (WP-6.18.KNOW · served-fact hits ledger + door-2 calibration + decay/re-entry)
//
// KNOW-17 (atlas-knowledge:67, 224-227; method-tags-knw:131-136): usefulness is a-posteriori. A served
// fact accrues a logged `hit` each time it governs a decision; a served fact with ZERO hits across the
// decay window DECAYS out of the served/pack set (archived to CAS, never deleted — KNOW-12) and MAY
// re-enter on a later hit; and the Door-2 admission threshold is a FUNCTION of observed hits, never the
// proposer's self-assessment. This module implements the FROZEN `HitsApi` (co-located below) and owns the
// door-2 calibration OVER the ledger — the KNOW-17 seam consumed by RETR (RETR-8) and GEN (GEN-16).
//
// ── ARCH-D3b item 2 (WP-D3B-B.USE-OR-SEAL, INV-AUTH-16, method-tags-auth:146-152) ─────────────────────
// Beyond the KNOW-17 ledger, this module is the USE-OR-SEAL growth DECISION (owner ruling 2026-09-03:
// "who approves is the ORCHESTRATOR, approving only with evidence… neither is mandatory"). AN ADVISORY
// NODE RISES BY ONE OF TWO SUFFICIENT EVIDENCES — the fixed plain named `USE_THRESHOLD` (a per-node
// served-counter reaching it, no calibrated function of anything) or a human SEAL (a ratify-token
// endorsement, independent of the counter) — and NEVER by default. `decay` stays KNOW-17: a node earning
// neither stays advisory and it decays by non-use. `seal(nodeId)` records the deliberate endorsement on
// the SAME ledger (its `window` is untouched — a seal is evidence, not a ledger event); `servedClass(id)`
// is `(hits ≥ USE_THRESHOLD) ∨ sealed ? 'governing' : 'advisory'` — the class the grow path serves the
// node at, never a default rise.
//
// SEAM (sealed lower layers; build-ahead injection — the same discipline `bindReconcile`/`bindFreshness`/
// `produce` use; no raw hashing, no clock, no IO here):
//   • the served/pack SNAPSHOT is upstream-owned (produce/router) — INJECTED as `servedSet`, consumed
//     read-only; the decay pass iterates it, never recomputes it.
//   • the CAS archive is KERNEL-owned (KNOW-12, archive.ts) — INJECTED as `archive`, a sink that only
//     RECEIVES; decay archives and NEVER deletes. Re-entry re-spawns from it on a later hit.
//   • the door-2 threshold `f(hits)` is the SECOND OPEN-DEFINE constant (DecayConfig.threshold, co-located)
//     — it MUST be PARAMETRIC, so it is INJECTED as `calibrate`, never a baked-in constant. This module
//     applies it to OBSERVED hits (the ledger), never to a proposer self-score.
// The `window` is the oracle-pinned logical LEDGER event-count (a monotone `number`, KNOW-17 ↔ MEM-7),
// never wall-clock. The decay FLOOR is the spec-pinned ZERO-hit boundary (KNOW-17/A-16) — NOT the
// unpinned door-2 admission threshold, which stays parametric and flows only through `door2Threshold`.
//
// SCOPE (card exclusions): does NOT own the RETR per-kind hitRate ledger (RETR-8) nor the RETR off-atlas
// ledger (RETR-13); does NOT define the pack cap/drop order. GEN/RETR CONSUME this contract downstream.

import type { NodeKey } from "@atlas/contracts"

// ── frozen HitsApi surface, co-located here (was ref/hits.ts) ─────────────────────────────────────────

/**
 * [OPEN DEFINE — parametric, threshold UNPINNED] The KNOW-17 decay window + the door-2 admission
 * threshold as a FUNCTION of observed hits (`threshold==f(hits)`, method-tags-knw:135). PARAMETRIC — a
 * config the decay pass takes, never a baked-in constant; the threshold value is NOT frozen (calibrates
 * on observed downstream hits). The decay-window unit is a logical LEDGER event-count (`number`).
 */
export interface DecayConfig {
  /** logical ledger position (monotone event-count), never wall-clock. */
  readonly window: number // PINNED → number (ledger event-count)
  readonly threshold: number // [OPEN DEFINE] door-2 threshold == f(hits) — parametric, value unpinned
}

/**
 * The minimal honest per-node hit-ledger record (KNOW-17). [PINNED — oracle-pin-map §hits] the minimal
 * `{nodeKey, hits, window}`: the node cited, its observed hit-count, and the ledger `window` position.
 */
export interface LedgerEntry {
  readonly nodeKey: NodeKey
  readonly hits: number
  readonly window: number // logical ledger position (monotone event-count), never wall-clock
}

export interface HitsApi {
  /** Log a `hit` citing a served fact's node-id (a fact governed a decision — KNOW-17). Append-only
   *  ledger event. Returns the minimal honest per-node ledger record `{nodeKey, hits, window}`. */
  logHit(nodeId: NodeKey): LedgerEntry

  /** Decay pass (parametric — `cfg`): a fact with 0 hits in the window is archived to CAS (never
   *  deleted — KNOW-12) and may re-enter on a later hit. The door-2 threshold is `f(hits)`, never a
   *  self-score (method-tags-knw:135). Pure + total. The result is the decayed/retained node-id sets. */
  decay(cfg: DecayConfig): { readonly decayed: readonly NodeKey[]; readonly retained: readonly NodeKey[] }
}

/**
 * [USE-OR-SEAL — the FIXED named constant, owner-ratified 2026-09-03 (INV-AUTH-16, method-tags-auth:146)].
 * The plain positive integer at which an advisory node's served-counter rises it implicitly — NOT a
 * calibrated function of anything (REQ-AUTH-16b: "the fixed named constant … one tunable place in the
 * code — never a calibrated function of anything"). Deliberately DISTINCT from the parametric door-2
 * `threshold` (`DecayConfig.threshold` above): that knob is a KNOW-17 admission threshold (`f(hits)`);
 * THIS one is the USE-OR-SEAL rise trigger, a plain named integer in exactly one place. The `seal` leg
 * (REQ-AUTH-16c) is the alternative sufficient evidence, independent of this counter.
 */
export const USE_THRESHOLD = 8

/**
 * The served class of an advisory node under the USE-OR-SEAL growth path (INV-AUTH-16): the node rises to
 * the next class by ONE of two sufficient evidences — a served-counter reaching `USE_THRESHOLD`, or a
 * human ratify-token SEAL — and NEVER by default (REQ-AUTH-16d). The `serve` path serves the node at this
 * class; `decay` (KNOW-17) remains the only way a node neither grew is handled after non-use.
 */
export type ServedClass = "advisory" | "governing"

/**
 * The DEFINE-supplied Door-2 admission threshold as a FUNCTION of observed hits (`threshold==f(hits)`,
 * method-tags-knw:135; DecayConfig.threshold, co-located). PARAMETRIC — injected, never a baked-in
 * constant; the VALUE is not frozen (it calibrates on observed downstream hits, not the proposer's
 * score). This module applies it to the ledger's OBSERVED hit-count, never to a self-assessment.
 */
export type Calibrate = (observedHits: number) => number

/**
 * The injected lower-layer seams (build-ahead). None is recomputed here.
 *   - `servedSet`  — the current served/pack snapshot (produce/router-owned); the decay pass iterates it.
 *   - `archive`    — the CAS archive sink (KNOW-12); decay hands a decayed node-id here. Never deletes.
 *   - `calibrate`  — the parametric door-2 `f(hits)` (OPEN-DEFINE); applied to observed hits.
 */
export interface HitsDeps {
  readonly servedSet: () => Iterable<NodeKey>
  readonly archive: (nodeKey: NodeKey) => void
  readonly calibrate: Calibrate
}

/**
 * The bound KNOW-17 surface: the frozen `HitsApi` (ledger accrual + decay/re-entry) plus the door-2
 * calibration `door2Threshold` OVER the ledger. `door2Threshold` realizes the `threshold==f(hits)`
 * relationship the frozen `DecayConfig.threshold` documents, computed from OBSERVED hits.
 */
export interface BoundHits extends HitsApi {
  /** The Door-2 admission threshold for `nodeId` = `calibrate(observed hits)` (KNOW-17b). A pure
   *  function of the ledger's observed hit-count — NEVER the proposer's self-assessment. */
  door2Threshold(nodeId: NodeKey): number

  /** USE-OR-SEAL (INV-AUTH-16c): a human ratify-token ENDORSEMENT recorded for `nodeId`. Alternative
   *  sufficient evidence, INDEPENDENT of the usage counter (REQ-AUTH-16c — a seal alone rises the node).
   *  A seal is evidence, not a ledger event — it does NOT advance the `window` (that stays the KNOW-17
   *  logical event-count, untouched by a seal). Deliberately no signature beyond the node: the LEDGER has
   *  no opinion on ratify-token validity — the caller (a governed ratify door) attests that first. */
  seal(nodeId: NodeKey): void

  /** USE-OR-SEAL (INV-AUTH-16): the class an advisory node is SERVED at — 'governing' iff the counter
   *  reached `USE_THRESHOLD` (REQ-AUTH-16b) OR the node is sealed (REQ-AUTH-16c), else 'advisory'. NEVER
   *  a default rise (REQ-AUTH-16d — a node earning neither is served advisory and decays by KNOW-17). The
   *  grow path serves the node at this class. Pure + total over the ledger. */
  servedClass(nodeId: NodeKey): ServedClass
}

/**
 * Bind the KNOW-17 hits ledger to the injected lower-layer seams.
 *
 * The returned surface owns an append-only per-node hit ledger (`hits`), a monotone ledger event-count
 * (`window`), and the set of decayed (archived, re-spawnable) node-ids:
 *   - `logHit(nodeId)`     — accrues one hit; if the node was decayed it RE-ENTERS (re-spawn from CAS,
 *                            KNOW-17d); returns the minimal `{nodeKey, hits, window}` record.
 *   - `decay(cfg)`         — over the served/pack snapshot, a fact with ZERO hits (the spec-pinned floor)
 *                            is archived to CAS (never deleted — KNOW-17c/KNOW-12) and dropped; the rest
 *                            are retained. Returns the decayed/retained node-id sets.
 *   - `door2Threshold(id)` — `calibrate(observed hits)`, the door-2 `f(hits)` (KNOW-17b).
 *
 * Deterministic: the `window` is a logical event-count (no clock); no IO, no hashing here.
 */
export function bindHits(deps: HitsDeps): BoundHits {
  const ledger = new Map<NodeKey, number>() // nodeKey → observed hits in the current window
  const decayed = new Set<NodeKey>() // decayed node-ids, archived in CAS, re-spawnable
  const sealed = new Set<NodeKey>() // USE-OR-SEAL: human ratify-token endorsements (INV-AUTH-16c)
  let window = 0 // logical ledger event-count (monotone), never wall-clock

  const observedHits = (nodeId: NodeKey): number => ledger.get(nodeId) ?? 0

  const logHit = (nodeId: NodeKey): LedgerEntry => {
    if (typeof nodeId !== "string" || nodeId.length === 0) {
      throw new TypeError("hits.logHit: malformed node-id") // fail-closed on malformed input
    }
    window += 1 // append-only ledger event advances the window position
    // KNOW-17d re-entry: a decayed (archived) fact re-enters the served set on a later hit.
    decayed.delete(nodeId)
    const hits = observedHits(nodeId) + 1
    ledger.set(nodeId, hits)
    return { nodeKey: nodeId, hits, window }
  }

  const seal = (nodeId: NodeKey): void => {
    if (typeof nodeId !== "string" || nodeId.length === 0) {
      throw new TypeError("hits.seal: malformed node-id") // fail-closed on malformed input
    }
    sealed.add(nodeId) // a seal is evidence, not a ledger event — the window does NOT advance
  }

  const servedClass = (nodeId: NodeKey): ServedClass => {
    if (typeof nodeId !== "string" || nodeId.length === 0) {
      throw new TypeError("hits.servedClass: malformed node-id") // fail-closed on malformed input
    }
    // ONE of two sufficient evidences rises the node (INV-AUTH-16): the fixed counter (REQ-AUTH-16b)
    // reaching `USE_THRESHOLD`, or a human seal (REQ-AUTH-16c). Anything else stays advisory (REQ-16d).
    if (sealed.has(nodeId)) return "governing"
    return observedHits(nodeId) >= USE_THRESHOLD ? "governing" : "advisory"
  }

  const decay = (cfg: DecayConfig): { readonly decayed: readonly NodeKey[]; readonly retained: readonly NodeKey[] } => {
    if (!Number.isFinite(cfg.window) || cfg.window < 0) {
      throw new TypeError("hits.decay: malformed decay window") // fail-closed on malformed config
    }
    const out: NodeKey[] = []
    const kept: NodeKey[] = []
    for (const nodeId of deps.servedSet()) {
      if (observedHits(nodeId) === 0) {
        // KNOW-17c: 0 hits in window ⇒ archived to CAS (never deleted), dropped from the served set.
        deps.archive(nodeId)
        decayed.add(nodeId)
        out.push(nodeId)
      } else {
        kept.push(nodeId)
      }
    }
    return { decayed: out, retained: kept }
  }

  const door2Threshold = (nodeId: NodeKey): number => deps.calibrate(observedHits(nodeId))

  return { logHit, decay, door2Threshold, seal, servedClass }
}
