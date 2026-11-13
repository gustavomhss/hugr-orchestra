import { assertOperationalDiskStore } from "./store-evaluation-identity.js"
// @atlas/adapter-io — src/governed-promote.ts  (KNOW-8: the governed PROMOTION door, staging → knowledge)
//
// `atlas mine` writes candidates to the STAGING sidecar (ADR-0008). Until this module existed NOTHING read
// them back: `loadStaging` had zero production callers and was deleted, and there was no `promote` command.
// So KNOW-8's measurable — "0 explorer writes reach the store except via a ratifier" — held VACUOUSLY: 0
// explorer writes reached the store by ANY route, and what enforced the separation was SEVERANCE, not
// ratification (`cli/src/mine.ts`: "mining cannot mutate governed knowledge because it cannot REACH it, not
// because a check says no"). This door is the route, and it is the ratified one.
//
// ── WHAT THIS DOOR IS NOT ────────────────────────────────────────────────────────────────────────────
// It is NOT new governed surface. `GOVERNANCE_SURFACE` stays 5 and `WRITE_PATHS` stays `{atlas-emit,
// atlas-link}`: every durable byte this module publishes goes through `createGovernedEmit(...).emit`, the
// SAME leg `wire.ts` binds to `atlas-emit`, with the SAME store, policy, truth-gate, actor and ratify token.
// ADR-0008 pre-decided this shape in as many words — a curator door "is an ordinary use of the existing emit
// door, not new surface". Nothing here re-implements a gate; the fifteen refusals of `governed-emit.ts` are
// the gates, unchanged and in their published order.
//
// ── THE ONE THING IT CHANGES ABOUT THAT LEG, AND WHY ──────────────────────────────────────────────────
// `origin: 'promoted'`. A mined candidate is `T2` (mine stamps the class from a constant), advisory (the
// mine gate builds an `AdvisoryProposal`), and grounded (it must clear the truth door), so on the
// candidate-intrinsic conjuncts alone `route` answers `auto-accept` — and `governed-emit.ts`'s `ratify()`
// call, the ONLY one on the emit leg, would never run. Promotion would then reach the durable store with no
// ratifier consulted while every document in the tree said it went through one: KNOW-8 would stop being
// vacuous and start being FALSE. `origin` is door-DERIVED (this module knows it read the row out of staging;
// the payload cannot say so either way), and it is not a forged `contested`/`lowRisk` — see
// `RatifyContext.origin` for that argument in full.
//
// ── THE STAGING READ IS THE STORE'S OWN DOCUMENTED READ-ONLY DECISION ─────────────────────────────────
// `commitStaging((p) => ({ out: p }))` — the shape `store.ts` already documents on `DiskStore.commitStaging`.
// It is genuinely read-only: `sidecar-commit.ts` returns on `decision.next === undefined` BEFORE any CAS
// `put` and before any generation is published, while still applying the untrusted / foreign-identity /
// unreadable gates on the way in. No `DiskStore` member is added — the projection-surface test enumerates
// that interface and is designed to fail on an addition.
//
// ── LIMITATION, WRITTEN DOWN RATHER THAN LEFT TO BE DISCOVERED (staging has no delete) ────────────────
// A promoted row is NOT removed from staging and is NOT marked. It cannot be: staging has no delete, and the
// two sidecars have no shared commit (`commitProjection` and `commitStaging` are separate CAS loops), so a
// "promoted" marker would be a SECOND mutable state machine that can disagree with the first — the store
// could then say a row was promoted when the projection write had refused, or the reverse. Instead the
// projection is the only record: a second `atlas promote` re-presents the same rows to the same door, where
// the incumbent guard (ADR-0007) and the KNOW-15 upsert decide what happens. What that means CONCRETELY,
// measured rather than asserted (`promote-idempotence.test.ts`): for a row that has ALREADY landed, the
// second run is a no-op in the STORE — same `nodeKey`, same `contentHash`, same claim set — and it still
// costs a full ratification, so it cannot become a silent self-commit. It is idempotent in state, not
// silent in report: the second run reports what it settled, which is the honest answer to "what did this
// invocation do", and the operator sees the same count twice rather than a fabricated 0.
//
// R2 (D15) narrows that limitation without touching staging: `promote(at, select)` presents only the rows `select.only`
// names, and never a row `select.held` holds. Both sets come from the shared review log (`review-log.ts`), read by the
// CLI before the pass, so the staging sidecar, `StoreProjection` and the wire format stay exactly as they were.
//
// ── THE COUNT IS SETTLED, NEVER ATTEMPTED ────────────────────────────────────────────────────────────
// `promoted` counts rows whose EVERY claim answered `EmitOut.emitted === true`. The failure this prevents:
// 8 mine processes × 5 sites reported 40 candidates committed with 5 durable, every process
// exiting 0. A count of what was tried is not a count of what happened.

import type { Hash } from "@atlas/contracts"
import { DegenerateAnchorError } from "@atlas/knowledge"
import type { GroundedFact, StoreProjection } from "@atlas/knowledge"
import type { EmitOut } from "@atlas/tools"
import type { CommitRefusal } from "./sidecar.js"
import type { DiskStore } from "./store.js"
import { prepareClaimReceipts, REJECTED_QUARANTINED } from "./claim-receipt.js"
import type { GovernedEmitOptions } from "./claim-receipt.js"

/** A staged row whose `contentHash` names bytes the CAS cannot return. NOT a skip and NOT a batch throw: the
 *  row is real, its fact is unreadable, and a curator has to know WHICH row so they can re-mine it. `mine`
 *  puts the bytes before it publishes the row, so this state means the CAS was pruned/corrupted underneath. */
export { REJECTED_CANDIDATE_UNREADABLE } from "./claim-receipt.js"

/** A staged row whose grounding names no single containing unit, so `primaryAnchorId` cannot mint an
 *  identity for it. `governed-emit.ts` throws `DegenerateAnchorError` by design at that gate; ONE such row
 *  must not take the batch down with it, so it is caught here and filed as this row's own refusal. */
export const REJECTED_DEGENERATE_CANDIDATE =
  "degenerate anchor — the staged candidate's grounding names no single containing unit, so no identity can be minted for it"

/** A staged candidate carrying `quarantine` (knowledge `AdvisoryNode`): `mine` admitted it only because a sound
 *  proof ABSTAINED. Refused BEFORE the emit door is consulted, so no ratifier, policy or token can promote it —
 *  the row stays staged. Owner decision D1 (genesis-hardening A8). */
export { REJECTED_QUARANTINED } from "./claim-receipt.js"

/** What the promotion door is composed over: the durable store the staging sidecar lives beside, and the
 *  GOVERNED EMIT LEG itself — passed in already bound (with `origin:'promoted'`) by the composition root, so
 *  this module composes the door rather than constructing a second one that could drift from `atlas-emit`. */
export interface GovernedPromoteDeps {
  readonly store: DiskStore
  /** `createGovernedEmit({…, origin: 'promoted'}).emit` — the SAME leg `atlas-emit` binds, never a copy. */
  readonly emit: (node: GroundedFact, at: Hash, opts?: GovernedEmitOptions) => EmitOut
}

/** One staged row's outcome. `settled` is the DURABLE fact: the door answered `emitted:true`. */
export interface PromotedRow {
  readonly nodeKey: string
  readonly settled: boolean
  /** The CAS address the durable write landed on (present iff `settled`). */
  readonly id?: string
  /** The refusal — the emit door's own `rejected` string, or a whole-place preflight refusal. */
  readonly rejected?: string
}

/** R2 (D15): which staged rows one pass presents. Passing no selection is the pass before R2: every staged row. */
export interface PromoteSelect {
  /** Present only these staged nodeKeys (`atlas promote <nodeKey...>`). Absent ⇒ every staged row. */
  readonly only?: readonly string[]
  /** Staged nodeKeys a curator holds (`atlas hold`, the review log). ALWAYS skipped, even when named in `only`. */
  readonly held: ReadonlySet<string>
}

/** The fold of one promotion pass. */
export interface PromoteOut {
  /** Did the STAGING READ settle? `false` ⇒ nothing was read and nothing was attempted — see `refusal`. */
  readonly read: boolean
  /** Why the staging read refused (`unreadable` / `untrusted` / `contended`). Present iff `read` is false. */
  readonly refusal?: CommitRefusal
  /** Rows PRESENTED to the door: found in staging, selected, not held. `0` with `read:true` and no `held`/`unknown` is an honest empty staging; `read:false` is NOT that. */
  readonly candidates: number
  /** Rows the door made DURABLE. Settled, never attempted. */
  readonly promoted: number
  /** Rows the door (or this module) refused. `promoted + refused === candidates`, always. */
  readonly refused: number
  /** Per-row outcomes, in the staging projection's own iteration order. */
  readonly rows: readonly PromotedRow[]
  /** R2: staged rows this pass skipped because a curator holds them, in staging order. Absent when none. */
  readonly held?: readonly string[]
  /** R2: nodeKeys named in `only` that no staged row carries. Absent when every named key was staged. */
  readonly unknown?: readonly string[]
}

/** Is this the identity refusal `governed-emit.ts` throws by design at gate 2.1? Matched on the NAMED class
 *  AND on its `name`, because a cross-package `instanceof` is defeated by a duplicated module instance and a
 *  silent `false` here would turn one bad row into a batch-killing throw — the failure this guard prevents. */
function isDegenerateAnchor(e: unknown): boolean {
  return e instanceof DegenerateAnchorError || (e as { name?: unknown } | null)?.name === "DegenerateAnchorError"
}

/**
 * Build the governed promotion leg. `promote(at)` reads staging ONCE, rehydrates each row's claims from
 * CAS, preflights the whole place, then presents each claim to the same governed emit door.
 * One row succeeds only if every claim settles; earlier successful emits are NOT rolled back on refusal.
 *
 * TOTAL over the batch: a row that cannot be read, and a row whose anchor is degenerate, are each filed as
 * THAT ROW's refusal and the pass continues. Nothing else is caught — an `ENOSPC` from the commit, an
 * identity-schema throw, a defect in Atlas: those propagate, because laundering one into a per-row
 * "refusal" would report a broken disk as a governance decision about a candidate.
 */
export function createGovernedPromote(deps: GovernedPromoteDeps): {
  readonly promote: (at: Hash, select?: PromoteSelect) => PromoteOut
} {
  const promote = (at: Hash, select?: PromoteSelect): PromoteOut => {
    assertOperationalDiskStore(deps.store) // Before even the staging read/lock; evaluation has its own exact admission route.
    // 1. READ STAGING — the store's own documented read-only decision. A decision with no `next` publishes
    //    nothing (`sidecar-commit.ts` returns before the CAS put), so this is a read that cannot write.
    const staged = deps.store.commitStaging<StoreProjection>((p) => ({ out: p }))

    // 2. AN UNREADABLE STAGING SIDECAR IS NOT AN EMPTY ONE. Treating "did not parse" as "0 candidates" is
    //    the amplification that once turned a torn read into a 402-node erasure, in the other direction: it
    //    would report a clean, complete promotion of nothing over a store whose candidates are still there
    //    and simply could not be read. The refusal is carried out whole, named, and `read:false`.
    if (!staged.settled) {
      return { read: false, refusal: staged.refusal, candidates: 0, promoted: 0, refused: 0, rows: [] }
    }

    // R2 — THE SELECTION, decided before any row reaches the door. A held row is never presented, even when named:
    // \"keep in staging\" must survive every pass. A named key no staged row carries is reported, not ignored.
    const all = [...staged.out.current.values()]
    const only = select?.only === undefined ? undefined : new Set(select.only)
    const held = select?.held ?? new Set<string>()
    const selected = all.filter((row) => only === undefined || only.has(row.nodeKey))
    const heldKeys = selected.filter((row) => held.has(row.nodeKey)).map((row) => row.nodeKey)
    const stagedKeys = new Set(all.map((row) => row.nodeKey))
    const unknown = only === undefined ? [] : [...only].filter((key) => !stagedKeys.has(key))

    const rows: PromotedRow[] = []
    for (const row of selected.filter((r) => !held.has(r.nodeKey))) {
      try {
        // Preflight ALL receipts and quarantine marks before presenting even the first claim.
        const prepared = prepareClaimReceipts(deps.store, row)
        if ("rejected" in prepared) {
          rows.push({ nodeKey: row.nodeKey, settled: false, rejected: prepared.rejected })
          continue
        }
        if (prepared.claims.some(({ fact }) => fact.kind === "advisory" && fact.quarantine !== undefined)) {
          rows.push({ nodeKey: row.nodeKey, settled: false, rejected: REJECTED_QUARANTINED })
          continue
        }
        // Authz, truth and ratification remain per-claim. Stop on refusal, without pretending that
        // separate successful emit commits can be rolled back as a cross-claim transaction.
        let out: EmitOut = { emitted: false }
        for (const claim of prepared.claims) {
          out = deps.emit(claim.fact, at, claim.receipt === undefined ? undefined : { claimReceipt: claim.receipt })
          if (!out.emitted) break
        }
        rows.push(
          out.emitted
            ? { nodeKey: row.nodeKey, settled: true, ...(out.id !== undefined ? { id: String(out.id) } : {}) }
            : {
                nodeKey: row.nodeKey,
                settled: false,
                ...(out.rejected !== undefined ? { rejected: out.rejected } : {}),
              },
        )
      } catch (e) {
        if (!isDegenerateAnchor(e)) throw e
        rows.push({ nodeKey: row.nodeKey, settled: false, rejected: REJECTED_DEGENERATE_CANDIDATE })
      }
    }

    // 5. THE FOLD — count fully settled rows, never individual claims or partially successful places.
    const promoted = rows.filter((r) => r.settled).length
    return {
      read: true,
      candidates: rows.length,
      promoted,
      refused: rows.length - promoted,
      rows,
      ...(heldKeys.length > 0 ? { held: heldKeys } : {}),
      ...(unknown.length > 0 ? { unknown } : {}),
    }
  }
  return { promote }
}
