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
// ── THE COUNT IS SETTLED, NEVER ATTEMPTED ────────────────────────────────────────────────────────────
// `promoted` counts `EmitOut.emitted === true` and nothing else. The measured failure this exists to
// prevent: 8 mine processes × 5 sites reported 40 candidates committed with 5 durable, every process
// exiting 0. A count of what was tried is not a count of what happened.

import type { Hash } from "@atlas/contracts"
import { DegenerateAnchorError } from "@atlas/knowledge"
import type { GroundedFact, StoreProjection } from "@atlas/knowledge"
import type { EmitOut } from "@atlas/tools"
import type { CommitRefusal } from "./sidecar.js"
import type { DiskStore } from "./store.js"

/** A staged row whose `contentHash` names bytes the CAS cannot return. NOT a skip and NOT a batch throw: the
 *  row is real, its fact is unreadable, and a curator has to know WHICH row so they can re-mine it. `mine`
 *  puts the bytes before it publishes the row, so this state means the CAS was pruned/corrupted underneath. */
export const REJECTED_CANDIDATE_UNREADABLE =
  "candidate bytes absent from CAS — the staged row names a contentHash the store cannot return, so there is no fact to promote"

/** A staged row whose grounding names no single containing unit, so `primaryAnchorId` cannot mint an
 *  identity for it. `governed-emit.ts` throws `DegenerateAnchorError` by design at that gate; ONE such row
 *  must not take the batch down with it, so it is caught here and filed as this row's own refusal. */
export const REJECTED_DEGENERATE_CANDIDATE =
  "degenerate anchor — the staged candidate's grounding names no single containing unit, so no identity can be minted for it"

/** What the promotion door is composed over: the durable store the staging sidecar lives beside, and the
 *  GOVERNED EMIT LEG itself — passed in already bound (with `origin:'promoted'`) by the composition root, so
 *  this module composes the door rather than constructing a second one that could drift from `atlas-emit`. */
export interface GovernedPromoteDeps {
  readonly store: DiskStore
  /** `createGovernedEmit({…, origin: 'promoted'}).emit` — the SAME leg `atlas-emit` binds, never a copy. */
  readonly emit: (node: GroundedFact, at: Hash) => EmitOut
}

/** One staged row's outcome. `settled` is the DURABLE fact: the door answered `emitted:true`. */
export interface PromotedRow {
  readonly nodeKey: string
  readonly settled: boolean
  /** The CAS address the durable write landed on (present iff `settled`). */
  readonly id?: string
  /** The refusal — the emit door's own `rejected` string, or one of this module's two per-row refusals. */
  readonly rejected?: string
}

/** The fold of one promotion pass. */
export interface PromoteOut {
  /** Did the STAGING READ settle? `false` ⇒ nothing was read and nothing was attempted — see `refusal`. */
  readonly read: boolean
  /** Why the staging read refused (`unreadable` / `untrusted` / `contended`). Present iff `read` is false. */
  readonly refusal?: CommitRefusal
  /** Rows FOUND in staging. `0` with `read:true` is an honest empty staging; `read:false` is NOT that. */
  readonly candidates: number
  /** Rows the door made DURABLE. Settled, never attempted. */
  readonly promoted: number
  /** Rows the door (or this module) refused. `promoted + refused === candidates`, always. */
  readonly refused: number
  /** Per-row outcomes, in the staging projection's own iteration order. */
  readonly rows: readonly PromotedRow[]
}

/** Is this the identity refusal `governed-emit.ts` throws by design at gate 2.1? Matched on the NAMED class
 *  AND on its `name`, because a cross-package `instanceof` is defeated by a duplicated module instance and a
 *  silent `false` here would turn one bad row into a batch-killing throw — the failure this guard prevents. */
function isDegenerateAnchor(e: unknown): boolean {
  return e instanceof DegenerateAnchorError || (e as { name?: unknown } | null)?.name === "DegenerateAnchorError"
}

/**
 * Build the governed promotion leg. `promote(at)` reads the staging sidecar ONCE, rehydrates each staged
 * row's whole `GroundedFact` from CAS, and presents it to the governed emit door — one row, one decision.
 *
 * TOTAL over the batch: a row that cannot be read, and a row whose anchor is degenerate, are each filed as
 * THAT ROW's refusal and the pass continues. Nothing else is caught — an `ENOSPC` from the commit, an
 * identity-schema throw, a defect in Atlas: those propagate, because laundering one into a per-row
 * "refusal" would report a broken disk as a governance decision about a candidate.
 */
export function createGovernedPromote(deps: GovernedPromoteDeps): { readonly promote: (at: Hash) => PromoteOut } {
  const promote = (at: Hash): PromoteOut => {
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

    const rows: PromotedRow[] = []
    for (const row of staged.out.current.values()) {
      // 3. REHYDRATE — `store.get(contentHash)` returns the WHOLE fact `mine` put before it published the
      //    row (the CAS bytes ARE the fact), which is structurally the `GroundedFact` `emit(node, at)` takes.
      //    `get` is total: a miss / tampered / oversized / traversal read all answer `undefined`.
      const fact = deps.store.get(row.contentHash as unknown as Hash) as GroundedFact | undefined
      if (fact === undefined) {
        rows.push({ nodeKey: row.nodeKey, settled: false, rejected: REJECTED_CANDIDATE_UNREADABLE })
        continue
      }
      // 4. THE GOVERNED DOOR, ONE ROW AT A TIME. Every gate is the emit door's: the truth door re-derives the
      //    citation, KNOW-11 authz refuses an actor outside `atlas:mined`, the ARCH-10 incumbent guard prices
      //    the write against whatever node the minted identity actually resolves to, and KNOW-8 ratification
      //    runs because `origin:'promoted'` took the fast path off the table.
      try {
        const out = deps.emit(fact, at)
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

    // 5. THE FOLD — `promoted` is the count of rows the store actually holds because of this call.
    const promoted = rows.filter((r) => r.settled).length
    return { read: true, candidates: rows.length, promoted, refused: rows.length - promoted, rows }
  }
  return { promote }
}
