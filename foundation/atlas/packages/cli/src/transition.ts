// @atlas/cli — src/transition.ts  (#234: the `atlas transition` PRODUCER door)
//
// The CLI leg of the reachable 2-rev transition producer (ADR-0015 D4). It owns exactly two things: driving the
// composition root's `transition` leg once over a (unit, revBefore, revAfter) triple, and projecting its
// `TransitionRun` to a `CliVerdict`. Every git read, every admit, every durable byte belongs to `adapter-io`
// (`transition-source.ts` — the producer reads REAL rev content through the arbitrary-rev index, admits a
// JUSTIFIED transition with NO oracle, D-T1, and persists it atomically). Read that header for the shipped-path
// narrative + the two flagged limits (the direct `commitProjection` persist, and the mechanically-derived
// derivation prose).
//
// THE EXIT CODE IS THE WHOLE CONTRACT A SCRIPT HAS WITH THIS COMMAND, so it is derived, never chosen:
//   0  a transition was admitted from the two revs and the GOVERNED door committed it durably.
//   2  the producer ABSTAINED (the unit did not resolve at a rev, or its content did not change ⇒ no
//      transition) OR the GOVERNED emit door REFUSED the write (KNOW-11 authz / ARCH-9 anchor / unratified).
//      Nothing was fabricated, and on a governed refusal nothing was written.

import type { TransitionRun } from "@atlas/adapter-io"
import type { CliVerdict } from "./render.js"

/** The invariant line every produce outcome carries. */
const INVARIANT =
  "#234 D4: a transition is an IMMUTABLE ADVISORY HISTORICAL record admitted from TWO real revs where the unit changed — sealed `justified` NEVER `proven` (no HEAD oracle exists, D-T1), grounded on the rev-pair (never re-checked at HEAD, D-T2), superseded not falsified by a later transition on the same lineage (D-T3); rename/move is OUT of scope (D-T4)"

/** Project one finished produce-and-persist pass to the CLI's process outcome. PURE — a function of the
 *  `TransitionRun` alone, so the same outcome renders byte-identically. */
export function transitionVerdict(run: TransitionRun): CliVerdict {
  if (!run.admitted) {
    return {
      exitCode: 2,
      stdout:
        "status: rejected\n" +
        `next: no transition produced for '${run.unitKey}' across ${run.revBefore}→${run.revAfter} — ` +
        `${run.reason ?? "the producer abstained"}. A transition needs the SAME unit lineage present at BOTH ` +
        `revs with DIFFERENT content (rename/move is out of scope, D-T4).\n` +
        `invariant: ${INVARIANT}\n`,
    }
  }
  const settled = run.persisted === true
  return {
    exitCode: settled ? 0 : 2,
    stdout:
      `status: ${settled ? "ok" : "rejected"}\n` +
      `next: ${
        settled
          ? `justified transition on '${run.unitKey}' is durable (${run.id ?? ""}) — read it back with \`atlas transitions ${run.unitKey}\`; a later transition on this lineage supersedes it (D-T3)`
          : `the GOVERNED emit door REFUSED the write: ${run.reason ?? "unknown"} — nothing was written. Check that ATLAS_ACTOR is a member of the unit's scope (KNOW-11 authz) and holds a ratify token`
      }\n` +
      `invariant: ${INVARIANT}\n` +
      `transition: ${run.unitKey} @ ${run.shaBefore?.slice(0, 12) ?? "?"} → ${run.shaAfter?.slice(0, 12) ?? "?"} (seal: justified)\n`,
  }
}

/**
 * Drive ONE produce-and-persist pass and project it. `transition` is the composition root's leg
 * (`ComposedRuntime`), injected rather than constructed here for the same reason `promote`/`deriveRelations`
 * are: the CLI must not stand up a second runtime, or the store it persists into stops being the store
 * `atlas transitions` reads back.
 */
export function runTransitionCli(
  transition: (unit: string, revBefore: string, revAfter: string) => TransitionRun,
  unit: string,
  revBefore: string,
  revAfter: string,
): CliVerdict {
  if (unit.length === 0 || revBefore.length === 0 || revAfter.length === 0) {
    return {
      exitCode: 1,
      stdout:
        "status: error\n" +
        "next: `atlas transition <unit> <revBefore> <revAfter>` requires a unit lineage key and two git revs\n" +
        `invariant: ${INVARIANT}\n`,
    }
  }
  return transitionVerdict(transition(unit, revBefore, revAfter))
}
