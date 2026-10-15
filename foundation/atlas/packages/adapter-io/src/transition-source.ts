// @atlas/adapter-io — src/transition-source.ts  (the PRODUCTION feed + reachable PRODUCER for the 2-rev transition family, #234)
//
// TWO shipped seams for the ADR-0015 D4 transition family, mirroring `relation-source.ts` (#99a) and
// `negation-source.ts` (#99b):
//
//   1. THE READ LEG (`createTransitionLeg`) — `transitionsOf` (@atlas/knowledge, #234) answers "what 2-rev
//      historical transitions were admitted on this unit LINEAGE, and which one is the current head" by folding
//      a projection's `family:'transition'` rows and computing the derive-on-read supersession verdict (D-T3).
//      It reads the SAME durable projection `atlas query` reads back (`rehydrateProjection(store)`), so `atlas
//      transitions <unit>` and `atlas query` are two projections of ONE store, never a second runtime. Like
//      `relationsOf`/`negationsOf` before their edges were wired, the fold is a specification artifact until an
//      edge makes it running code — this module is that edge.
//
//   2. THE REACHABLE PRODUCER (`createTransitionProducer`) — the shipped path `atlas transition <unit>
//      <revBefore> <revAfter>` drives. Given a unit + TWO git revs, it reads the unit's REAL content at each rev
//      through the frozen `RevIndex` (`resolveAnchorAt`, rev-index.ts — the arbitrary-rev code index built in a
//      throwaway detached worktree), builds a `TransitionProposal` over the two resolved rev anchors, admits it
//      as a JUSTIFIED transition through the genesis build (`buildTransition`, D-T1 — no oracle), and PERSISTS
//      it atomically through the store's `commitProjection` door. This is a TRUE shipped path over REAL 2-rev
//      input — NOT a test injector. The one part deliberately DEFERRED (flagged, never silent): the `derivation`
//      prose is MECHANICALLY generated here (the unit changed content across the two revs), not authored by an
//      LLM that read both bodies — a full model-authored producer is out of #234's scope. The transition FACT
//      itself is fully admitted from real revs; only the richness of the justification prose is deferred.
//
// WRITE PATH (billy security cold-review, #234 — the #87/ADR-0008 gate-less-write fix): the producer routes the
// finished transition node THROUGH the governed emit door (`emit`, the `createGovernedEmit(...).emit` compose
// binds — its `kind:'transition'` branch is `governed-emit-transition.ts`), NOT a direct `commitProjection`. An
// earlier revision persisted directly and silently dropped KNOW-11 actor-scope authz + ARCH-9 anchor binding —
// a second gate-less write path into the governed projection, exactly the ratified-invariant violation ADR-0008
// closed. The door restores both gates: an actor not in the unit's scope is REFUSED, and a scope that does not
// OWN the unit is REFUSED. The transition door runs NO HEAD truth gate (a transition grounds on PAST revs, D-T2,
// which the main gate would always drift-reject) — see `governed-emit-transition.ts` for the full ladder.

import { transitionsOf } from "@atlas/knowledge"
import type { GroundedTransition, TransitionNode } from "@atlas/knowledge"
import { buildTransition, transitionWellFormed } from "@atlas/genesis"
import type { TransitionProposal } from "@atlas/genesis"
import type { GroundingEntry } from "@atlas/grounding"
import type { StructRef, Tier, Hash } from "@atlas/contracts"
import type { EmitOut, Guidance, Verdict } from "@atlas/tools"
import { unitScopeOf } from "./llm.js"
import { rehydrateProjection } from "./store.js"
import type { DiskStore } from "./store.js"
import type { RevIndex } from "./rev-index.js"

/** The composition-root READ leg: `unit` → the grounded transitions on that lineage (empty ⇒ every lineage).
 *  TOTAL — `transitionsOf` is pure + total. Re-reads the LIVE projection per call, so a transition produced in
 *  this session is visible to the very next call. */
export type TransitionLeg = (unit: string) => readonly GroundedTransition[]

/** Build the READ leg over the durable `store` — the SAME store the handler's query leg reads (so `atlas
 *  transitions` and `atlas query` are two projections of ONE store). Read-only; opens no write path. */
export function createTransitionLeg(store: DiskStore): TransitionLeg {
  return (unit) => transitionsOf(rehydrateProjection(store), unit)
}

/** The outcome of one produce-and-emit pass — a MEASURED record, never a manufactured fact. `admitted:false`
 *  carries the honest reason: the unit was not present at a rev, the content did not change (no transition), OR
 *  the GOVERNED DOOR REFUSED the write (unauthorized actor / anchor). `persisted:false` on a governed refusal is
 *  the whole point of the security fix — a gate-less path would have landed it. */
export interface TransitionRun {
  readonly admitted: boolean
  readonly unitKey: string
  readonly revBefore: string
  readonly revAfter: string
  readonly id?: string // the durable content address the door returned, present iff persisted
  readonly shaBefore?: string // the unit's content hash at revBefore, present iff both revs resolved
  readonly shaAfter?: string //  the unit's content hash at revAfter,  present iff both revs resolved
  readonly persisted?: boolean // whether the governed door COMMITTED (false ⇒ authz/anchor/ratify refusal — see reason)
  readonly reason?: string // the honest why-not / the governed door's refusal text, present iff NOT admitted-and-persisted
}

/** The governed emit door leg the producer writes THROUGH — `createGovernedEmit(...).emit` (compose binds it).
 *  Its `kind:'transition'` branch (`governed-emit-transition.ts`) applies KNOW-11 authz + ARCH-9 anchor. */
export type TransitionEmit = (node: TransitionNode, at: Hash) => EmitOut

/** The composition-root PRODUCER leg: `(unit, revBefore, revAfter)` → produce + GOVERNED-emit a justified transition. */
export type TransitionProducer = (unit: string, revBefore: string, revAfter: string) => TransitionRun

/** The FILE half of a `unitKey` (`file::item::block` → `file`) — the repo-relative path a grounding entry
 *  carries for humans/navigation. A bare file key has no `::` and is returned whole. */
function fileOf(unitKey: string): string {
  const at = unitKey.indexOf("::")
  return at === -1 ? unitKey : unitKey.slice(0, at)
}

/** One rev's resolved anchor as a `GroundingEntry` — the `StructRef` `resolveAnchorAt` returns (whose
 *  `subtreeHash` IS the unit's content hash at that rev, content-addressed) wrapped with the file path. */
function entryOf(ref: StructRef, unitKey: string): GroundingEntry {
  return { anchor: ref, path: fileOf(unitKey) }
}

/**
 * Build the REACHABLE producer over the arbitrary-rev `revIndex` + the GOVERNED emit door `emit`. The returned
 * leg reads the unit's REAL content at each of the two revs, admits a justified transition (D-T1), and routes it
 * THROUGH the governed door (`emit`) — which applies KNOW-11 authz + ARCH-9 anchor before it commits. `at` is
 * the anchor rev the write is stamped at (the repo's live HEAD); the transition door IGNORES it (D-T2), threaded
 * honestly to mirror the sound-relation derive leg.
 *
 * ABSTAIN / REFUSE, NEVER FABRICATE (all a MEASURED result, never a throw):
 *   - the unit does not resolve at a rev (a bad/unknown rev, or the unit did not exist there) ⇒ admitted:false;
 *   - the content is IDENTICAL across the two revs (`shaBefore === shaAfter`) ⇒ no transition, admitted:false;
 *   - the GOVERNED DOOR refuses (actor not in the unit's scope, or the scope does not own the unit, or the
 *     ratifier declined) ⇒ admitted:true (the fact was well-formed) but persisted:false + the door's reason.
 */
export function createTransitionProducer(revIndex: RevIndex, emit: TransitionEmit, at: Hash): TransitionProducer {
  return (unit, revBefore, revAfter) => {
    const base: TransitionRun = { admitted: false, unitKey: unit, revBefore, revAfter }
    if (typeof unit !== "string" || unit.length === 0) return { ...base, reason: "missing unit key" }

    const refBefore = revIndex.resolveAnchorAt(revBefore, unit)
    const refAfter = revIndex.resolveAnchorAt(revAfter, unit)
    if (refBefore === undefined)
      return {
        ...base,
        reason: `unit '${unit}' does not resolve at rev '${revBefore}' — nothing to ground the before-leg of a transition on`,
      }
    if (refAfter === undefined)
      return {
        ...base,
        reason: `unit '${unit}' does not resolve at rev '${revAfter}' — nothing to ground the after-leg of a transition on`,
      }

    const shaBefore = String(refBefore.subtreeHash)
    const shaAfter = String(refAfter.subtreeHash)
    const proposal: TransitionProposal = {
      kind: "transition",
      unitKey: unit,
      refBefore: entryOf(refBefore, unit),
      refAfter: entryOf(refAfter, unit),
      tier: "T2" as Tier, // the mined tier — a transition is a produced, advisory-class fact (mirrors the sound-arm tier)
      scope: unitScopeOf(unit), // KNOW-11a authz scope — the unit's own containing directory; the door authorizes against it
      // DEFERRED (flagged): mechanically-derived derivation prose, NOT an LLM that read both bodies (§header).
      derivation: `unit '${unit}' changed content across revs ${revBefore.slice(0, 12)}→${revAfter.slice(0, 12)} (subtreeHash ${shaBefore.slice(0, 12)}→${shaAfter.slice(0, 12)}); a model-authored account of WHAT changed is deferred (#234 honest limit)`,
    }

    if (!transitionWellFormed(proposal)) {
      return {
        ...base,
        shaBefore,
        shaAfter,
        reason:
          shaBefore === shaAfter
            ? `unit '${unit}' has IDENTICAL content at both revs (${shaBefore.slice(0, 12)}) — no change, so no transition`
            : "malformed transition identity",
      }
    }

    const fact = buildTransition(proposal)
    // ROUTE THROUGH THE GOVERNED DOOR — KNOW-11 authz + ARCH-9 anchor gates apply here (the security fix). A
    // refusal (unauthorized actor / anchor, or an unratified commit) is a MEASURED persisted:false, never a throw.
    const out: EmitOut = emit(fact, at)
    return {
      admitted: true,
      unitKey: unit,
      revBefore,
      revAfter,
      shaBefore,
      shaAfter,
      persisted: out.emitted,
      ...(out.emitted ? { id: String(out.id) } : { reason: out.rejected ?? "the governed door refused the write" }),
    }
  }
}

// ── THE READ VERDICT (SCHEMA + VERDICT parity source, mirrors relationsVerdict/negationsVerdict) ─────────────

/** The data payload a `transitions` read verdict carries — the transitions on the lineage plus the query unit,
 *  so an EMPTY result is a MEASURED fact (this unit, zero transitions) and never an absent line. */
export interface TransitionsData {
  readonly transitions: readonly GroundedTransition[]
  readonly unit: string
}

/** The one property a reader should check the bytes against. */
const INVARIANT =
  "TRN-1: `atlas transitions` reads GROUNDED 2-rev historical records (family:transition) off the live projection the query readback rides — one unit LINEAGE, sorted (unitKey, shaBefore, shaAfter, nodeKey) so equal input is byte-identical output, the current head marked TRANSITIONED and predecessors SUPERSEDED (derive-on-read, D-T3), never re-checked at HEAD (D-T2), never a throw, no write path"

/** The one actionable sentence, derived from the result's own numbers. */
function nextLine(unit: string, ts: readonly GroundedTransition[]): string {
  if (ts.length === 0) {
    return `no grounded transition on lineage '${unit}' — a transition is produced by \`atlas transition <unit> <revBefore> <revAfter>\` over two revs where the unit's content changed; check the unit key spelling`
  }
  const head = ts.filter((t) => t.authoring === "TRANSITIONED").length
  const superseded = ts.length - head
  return `${ts.length} transition(s) on lineage '${unit}': ${head} current (TRANSITIONED), ${superseded} SUPERSEDED — supersession is derive-on-read over the shaBefore→shaAfter chain (D-T3), the record is never falsified`
}

/**
 * The SHARED read-verdict builder — both transports call this over the SAME `TransitionLeg`, so identical
 * `unit` yields a byte-identical `Verdict`. TOTAL: a missing/empty `unit` fails CLOSED to a structured `ok:false`
 * verdict (exit 1 on the CLI), never a throw.
 */
export function transitionsVerdict(leg: TransitionLeg, unit: string): Verdict<TransitionsData> {
  if (typeof unit !== "string" || unit.length === 0) {
    const guidance: Guidance = {
      next: "`atlas transitions <unit>` requires the unit lineage key whose grounded transitions to read",
      invariant: "CLI-1b: a malformed invocation yields a structured error + guidance + non-zero exit, never a crash",
    }
    return { ok: false, rejected: "missing unit: `atlas transitions` requires a non-empty unit key", guidance }
  }
  const transitions = leg(unit)
  const guidance: Guidance = { next: nextLine(unit, transitions), invariant: INVARIANT }
  return { ok: true, guidance, data: { transitions, unit } }
}

export type { GroundedTransition, TransitionNode }
