// @atlas/cli — src/ops-common.ts  (the helpers the ownership/operations commands share: territory, own-export, repair)
//
// Lane B-O's counterpart of review-common.ts: the same status/next/invariant shape, kept in its own file so the two
// lanes never edit one file. Exit codes: 0 ok (`opsOutcome`), 1 usage (`opsUsage`), 2 governed refusal (`opsRefusal`).

import { errorVerdict, refusalVerdict } from "./cli-verdict.js"
import { renderRefusal, renderVerdict } from "./render.js"
import type { CliVerdict } from "./render.js"

/** The guidance every routed command gives when the composition root did not stand up. */
export const NOT_COMPOSED = "atlas runtime is not composed yet — the WireConfig seams need the composition-root WP"

/** A successful outcome (exit 0) in the CLI's status/next/invariant shape, plus detail lines. */
export function opsOutcome(invariant: string, next: string, lines: readonly string[]): CliVerdict {
  return { exitCode: 0, stdout: `${["status: ok", `next: ${next}`, `invariant: ${invariant}`, ...lines].join("\n")}\n` }
}

/** A usage error (exit 1): the invocation itself was wrong. */
export function opsUsage(message: string): CliVerdict {
  return renderVerdict(errorVerdict(message))
}

/** A governed refusal (exit 2): the invocation was well-formed and a check declined it. */
export function opsRefusal(message: string): CliVerdict {
  return renderRefusal(refusalVerdict(message))
}

/** A valued flag's text, or `undefined` when absent, bare (`--x` alone folds to "true") or blank. */
export function flagValue(flags: Readonly<Record<string, string>>, name: string): string | undefined {
  const value = flags[name]
  return value === undefined || value === "true" || value.trim() === "" ? undefined : value.trim()
}
