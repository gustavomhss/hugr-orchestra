// @atlas/cli — src/reverify.ts  (CLI-11: the `atlas verify-store` REVERIFY-GATE door)
//
// The CLI leg of the whole-store re-verification pass (versioned-store chapter, step 3). It owns exactly
// two things: driving the composition root's `reverify` thunk once, and projecting its `ReverifyReport` to
// a `CliVerdict`. Every classification decision belongs to `@atlas/adapter-io`'s `reverify-store.ts` — read
// that module's header first; it carries the three-bucket narrative and why `unverifiable` can never render
// as a pass.
//
// WHY THIS FILE EXISTS AT ALL, RATHER THAN A LEG ON THE HANDLER — the same answer `promote.ts`/`own.ts` give:
// `verify-store` opens no new governed surface (`GOVERNANCE_SURFACE` stays 5, `WRITE_PATHS` untouched), so
// there is no `Tool` token to dispatch and nothing for `WiredHandler.handle` to route. Intercepted at the
// entrypoint, exactly as `verify-fact`/`own`/`relations`/`negations` are.
//
// THE EXIT CODE IS THE WHOLE CONTRACT A SCRIPT HAS WITH THIS COMMAND:
//   0  the pass ran and found nothing `broken`/`unverifiable` — INCLUDING the honest empty case (0 sealed
//      facts in the store; see `nextLine` for why that is distinguished from "verified N, all clean")
//   2  the pass ran and found at least one `broken` or `unverifiable` row — a governance-shaped refusal, not
//      a usage error: the invocation was fine, the STORE failed to re-prove itself
// There is no exit-1 leg reached from a SUCCESSFUL pass — reaching `reverifyVerdict` means the runtime
// composed and the loop over `driftFacts` completed; exit 1 is reserved for an uncomposed runtime (cli.ts).

import type { ReverifyReport } from "@atlas/adapter-io"
import type { CliVerdict } from "./render.js"

/** The invariant line every `verify-store` outcome carries — the one property a reader should check the
 *  bytes against. Names all three buckets so a reader cannot mistake "0 broken" for "everything checked
 *  out": `unverifiable` is reported on this SAME line, never folded into a pass. */
const INVARIANT =
  "REVERIFY-GATE: every `seal:'proven'` fact is re-proved against the LIVE index via its OWN recorded witness — re-proven / broken / unverifiable, three buckets that never merge; a witness-less `proven` seal is `unverifiable`, never a pass"

/**
 * Project one finished re-verification pass to the CLI's process outcome. PURE — a function of the
 * `ReverifyReport` alone (no clock, no paths, no re-reading of the store).
 *
 * THE COUNT IS WHAT HAPPENED, NEVER WHAT WAS ATTEMPTED (this repo has been bitten by the inverse — see
 * `governed-promote.ts`'s header, task #130): `sealedProven` is the denominator this pass actually looped
 * over (the durable store's own `driftFacts` readback), and the three buckets below always sum to it.
 */
export function reverifyVerdict(out: ReverifyReport): CliVerdict {
  // `dangling` joins the refusal condition: a fact served as proven whose bytes are GONE is not a pass
  // under any reading, and it is the one fault this gate used to report as an empty, healthy store.
  const rejected = out.broken > 0 || out.unverifiable > 0 || out.dangling > 0
  const lines = [
    `status: ${rejected ? "rejected" : "ok"}`,
    `next: ${nextLine(out)}`,
    `invariant: ${INVARIANT}`,
    `verify-store: ${out.sealedProven} sealed-proven fact(s) — ${out.reProven} re-proven, ${out.broken} broken, ${out.unverifiable} unverifiable, ${out.dangling} dangling`,
    // Per-row, in the durable store's own readback order. A batch verdict that names no row is unactionable —
    // the exact row a `broken`/`unverifiable` verdict points to, and why, is the whole payoff of this door.
    ...out.rows.map((r) => `  ${r.outcome} ${r.nodeKey}: ${r.reason}`),
  ]
  return { exitCode: rejected ? 2 : 0, stdout: `${lines.join("\n")}\n` }
}

/** The one actionable sentence, derived from the pass's own numbers — never a guess about the wiring.
 *
 *  THE EMPTY STORE IS AN HONEST ZERO, NOT A SILENT SKIP. `sealedProven === 0` prints its OWN sentence, never
 *  the "all clean" sentence a populated-and-passing store gets — the two must never read alike, because a
 *  script that greps for "0 broken" cannot otherwise tell "verified 500, all good" from "verified nothing,
 *  the store is empty" (the honesty requirement this WP names by name). */
function nextLine(out: ReverifyReport): string {
  if (out.sealedProven === 0) {
    return "the durable store holds NO seal:'proven' fact — nothing to re-verify (an honest zero, not a skip); `atlas mine` + `atlas promote` are what seal a fact `proven`"
  }
  if (out.unverifiable > 0) {
    return `${out.unverifiable} sealed-proven fact(s) carry NO witness (or an incomplete one) — nothing could be replayed for them; read the rows below${out.broken > 0 ? `, alongside ${out.broken} that replayed and did NOT re-prove` : ""}`
  }
  if (out.broken > 0) {
    return `${out.broken} sealed-proven fact(s) no longer re-prove against the live index — the store has drifted from what it claims; read the rows below`
  }
  return `all ${out.reProven} sealed-proven fact(s) replayed PROVEN against the live index — the durable store re-proves itself`
}

/**
 * Drive ONE whole-store re-verification pass and project it. `reverify` is the composition root's thunk
 * (`ComposedRuntime.reverify`), injected rather than constructed here for the same reason `promote`/`own`
 * are: the CLI must not stand up a second runtime, or the store re-verified stops being the one every other
 * command reads.
 */
export function runReverify(reverify: () => ReverifyReport): CliVerdict {
  return reverifyVerdict(reverify())
}
