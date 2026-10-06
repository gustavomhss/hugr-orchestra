export * as GateDiff from "./diff"

import { Effect, Option } from "effect"
import type { GateShell } from "./shell"

/**
 * `relay_compute_diff` (WP3): `git diff <baseRef> -- <pathspec>`, then every nonignored untracked file as a no-index
 * diff against /dev/null, without touching the index. None when the base is missing, the workdir is not a git
 * repository or the ref is not a commit. An empty diff is still Some("").
 */
export const compute = (input: {
  readonly workdir: string
  readonly baseRef?: string
  // Whitespace-split pathspec; empty means everything.
  readonly pathspec: string
}): Effect.Effect<Option.Option<string>, never, GateShell.Git> => Effect.die("not implemented")

// The label the judge sees for the computed diff.
export const NAME = "computed.diff"
