// @atlas/cli — src/cli-verdict.ts  (CLI-1b/3b: the entrypoint's own verdict + process-outcome helpers)
//
// GODFILE RELIEF (WP-10.A2-a.CLI): pulled out of cli.ts VERBATIM — a byte/behaviour-preserving extraction,
// not a redesign. cli.ts was at 599/600 LOC (the godfile-guard hard limit) before the `slots`/`draft`
// dispatch this WP adds; these five small, cohesive helpers (two verdict builders + the three
// process-outcome primitives every command's dispatch calls at its tail) had no dependency on anything
// ELSE in cli.ts — only on `@atlas/tools` types and the co-located `render.ts` — so moving them here changes
// no behaviour and cli.ts imports them back unchanged in shape. See cli.ts's own header for the command
// dispatch this module is a sibling of.

import type { Guidance, Verdict } from "@atlas/tools"
import { renderVerdict } from "./render.js"
import type { CliVerdict } from "./render.js"

/** A structured error verdict for a CLI-layer failure (parse / unwired command) — guidance always present. */
export function errorVerdict(message: string): Verdict {
  const guidance: Guidance = {
    next: message,
    invariant: "CLI-1b: a malformed invocation yields a structured error + guidance + non-zero exit, never a crash",
  }
  return { ok: false, rejected: message, guidance }
}

/**
 * A structured GOVERNANCE-REFUSAL verdict for a gate that fired at the entrypoint. Distinct from
 * {@link errorVerdict} in BOTH of the things a caller reads.
 *
 * The INVARIANT line, because `errorVerdict`'s says "a malformed invocation" — and this invocation was not
 * malformed. Stamping the usage-error invariant on a governance refusal is the same blame-shift this seat
 * removed from the handler's catch, one layer up.
 */
export function refusalVerdict(message: string): Verdict {
  const guidance: Guidance = {
    next: message,
    invariant:
      "CLI-3b: a governed refusal exits 2 — the invocation was well-formed and a gate declined it, so re-running it with different arguments will not help; exit 1 is reserved for a usage/wiring error",
  }
  return { ok: false, rejected: message, guidance }
}

/** Append one advisory line to a rendered outcome, or return it unchanged. Pure. */
export function withNote(cv: CliVerdict, note: string | undefined): CliVerdict {
  return note === undefined ? cv : { exitCode: cv.exitCode, stdout: `${cv.stdout}${note}\n` }
}

/** The ONE process-outcome path: write a `CliVerdict`'s stdout and return its exit code (uniform bytes —
 *  every command's outcome, whether a rendered handler `Verdict` or a `mine`/`doctor` `CliVerdict`, exits
 *  through here). */
export function emitCli(cv: CliVerdict): number {
  process.stdout.write(cv.stdout)
  return cv.exitCode
}

/** Render a verdict to a `CliVerdict`, then emit it over the one process-outcome path. */
export function emit(verdict: Verdict): number {
  return emitCli(renderVerdict(verdict))
}
