// @atlas/cli — src/promote.ts  (CLI-7: the `atlas promote` curator door)
//
// The CLI leg of the governed PROMOTION door (KNOW-8). It owns exactly two things: driving the composition
// root's promotion leg once, and projecting its `PromoteOut` to a `CliVerdict`. Every gate, every refusal and
// every durable byte belongs to `adapter-io/governed-promote.ts` and the emit door underneath it — read that
// module's header first; it carries the KNOW-8 narrative, the `origin:'promoted'` decision, and the written-
// down limitation that staging has no delete.
//
// WHY THIS FILE EXISTS AT ALL, RATHER THAN A LEG ON THE HANDLER. `promote` opens no new governed surface:
// `GOVERNANCE_SURFACE` stays 5, `WRITE_PATHS` stays `{atlas-emit, atlas-link}`, and ADR-0008 pre-decided the
// shape ("a curator door … is an ordinary use of the existing emit door, not new surface"). So there is no
// `Tool` token to dispatch and nothing for `WiredHandler.handle` to route — the command is intercepted at the
// entrypoint, exactly as `mine`, `doctor` and `node` are, and its outcome rides the ONE process-outcome path.
//
// THE EXIT CODE IS THE WHOLE CONTRACT A SCRIPT HAS WITH THIS COMMAND, so it is derived, never chosen:
//   0  every candidate found was made durable (including the honest empty case: nothing staged, nothing to do)
//   2  a governed refusal — at least one row the door declined, or a staging read that refused
// There is no exit-1 leg here: reaching this function means the invocation parsed and the runtime composed.

import type { Hash } from "@atlas/contracts"
import type { PromoteOut } from "@atlas/adapter-io"
import type { CliVerdict } from "./render.js"

/** The invariant line every promote outcome carries — the one property a reader should check the bytes against. */
const INVARIANT =
  "KNOW-8: a staged candidate reaches governed knowledge only THROUGH the emit door, and only with a ratifier named — the count reported is what SETTLED durably, never what was attempted"

/**
 * Project one finished promotion pass to the CLI's process outcome. PURE — a function of the `PromoteOut`
 * alone (no clock, no paths, no re-reading of the store), so the same outcome renders byte-identically.
 *
 * THE COUNT IS SETTLED, NEVER ATTEMPTED, and this is the line where that is easiest to get wrong: 8 mine
 * processes × 5 sites once reported 40 candidates committed with 5 durable, each exiting 0. `promoted` here
 * is `PromoteOut.promoted`, which counts `emitted:true` and nothing else; `candidates` is reported ALONGSIDE
 * it rather than instead of it, so "found 12, promoted 3" is legible as the partial result it is.
 */
export function promoteVerdict(out: PromoteOut): CliVerdict {
  // A STAGING READ THAT REFUSED IS NOT AN EMPTY STAGING. Rendering `refusal` as "0 candidates" would tell a
  // curator their explorer produced nothing, over a sidecar whose candidates are still on disk and merely
  // unreadable — the same "treat corrupt as empty" that once erased 402 nodes, pointed the other way.
  if (!out.read) {
    return {
      exitCode: 2,
      stdout:
        "status: rejected\n" +
        `next: promote read nothing — the staging sidecar refused (${out.refusal ?? "unknown"}). ` +
        'This is NOT "0 candidates": nothing was read, so nothing could be promoted, and whatever is staged is still staged. ' +
        `${out.refusal === "untrusted" ? "Remove `.atlas/` from version control (`git rm -r --cached .atlas`, keeping `.atlas/policy.json`) and re-derive the store locally." : out.refusal === "contended" ? "Another writer held the sidecar for every attempt — re-run." : "Restore `.atlas/staging.*.json` from a backup, or re-run `atlas mine` to rebuild it."}\n` +
        `invariant: ${INVARIANT}\n`,
    }
  }

  const settled = out.promoted
  const rejected = out.refused > 0
  const lines = [
    `status: ${rejected ? "rejected" : "ok"}`,
    `next: ${nextLine(out)}`,
    `invariant: ${INVARIANT}`,
    `promote: ${settled} of ${out.candidates} staged candidate(s) promoted; ${out.refused} refused`,
    // Per-row, in the staging projection's own order. A batch verdict that names no row is unactionable: the
    // curator has to know WHICH candidate the door declined and WHY, and a refusal reason without its row is
    // exactly as useless as a row without its reason.
    ...out.rows.map((r) =>
      r.settled ? `  promoted ${r.nodeKey} -> ${r.id ?? ""}` : `  refused ${r.nodeKey}: ${r.rejected ?? "unknown"}`,
    ),
  ]
  return { exitCode: rejected ? 2 : 0, stdout: `${lines.join("\n")}\n` }
}

/** The one actionable sentence, derived from the pass's own numbers — never a guess about the wiring. */
function nextLine(out: PromoteOut): string {
  if (out.candidates === 0) {
    // HONESTLY EMPTY, and it says which emptiness it is. Staging read fine and holds nothing, which after a
    // default `atlas mine` is the expected state — that pass wires no admission machinery, so it abstains at
    // every site and stages nothing to promote.
    return "staging holds no candidates — nothing to promote. `atlas mine` stages candidates; a pass that abstained at every site staged none"
  }
  if (out.refused === 0) {
    // `atlas node <addr>` and NOT `atlas query`, deliberately, and this line was WRONG before it was
    // measured: a mined candidate is `T2` and the read pack bounds `T2` OUT (TOOLS-6), so a promoted mined
    // fact is addressable and doctor-visible but NOT served by `atlas query`. Telling a curator to query for
    // it would send them to look for something the product is correctly declining to show.
    return `${out.promoted} staged candidate(s) are now governed knowledge — \`atlas node <addr>\` reads each one back (a T2 fact is bounded OUT of the \`atlas query\` pack, TOOLS-6)`
  }
  if (out.promoted === 0) {
    return `every staged candidate was refused (${out.candidates}) — read the per-row reasons below; nothing was written`
  }
  return `${out.promoted} promoted, ${out.refused} refused — read the per-row reasons below; the refused rows are still staged`
}

/**
 * Drive ONE governed promotion pass and project it. `promote` is the composition root's leg (`ComposedRuntime`),
 * injected rather than constructed here for the same reason `handler` is: the CLI must not stand up a second
 * runtime, or the store it promotes into stops being the store `atlas query` reads.
 *
 * `at` is the anchor rev the pass runs at. It is threaded honestly rather than as a placeholder even though
 * the composed truth-gate currently IGNORES it (`compose.ts` `buildGate` re-derives freshness against the
 * `Axes` built at the repo root, not against a passed sha — the parameter is vestigial on that path). The
 * caller supplies the repo's live HEAD, so a gate that later starts reading it gets the truth rather than a
 * constant somebody has to go back and fix.
 */
export function runPromote(promote: (at: Hash) => PromoteOut, at: Hash): CliVerdict {
  return promoteVerdict(promote(at))
}
