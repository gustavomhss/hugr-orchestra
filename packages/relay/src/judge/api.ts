export * as JudgeApi from "./api"

import { Effect } from "effect"
import type { JudgeBallot } from "./ballot"
import type { JudgeConfig } from "./config"

/**
 * The Messages API backend (WP4): a forced `submit_verdict` tool call, falling back to an exact `VERDICT: PASS|FAIL`
 * last declaration. Context is cut at `maxContext` characters per file and the cut is announced; a missing file reads
 * `(file not found)`. Transport errors and missing verdicts are unavailable samples, never votes.
 */
export const judge = (config: JudgeConfig.Config, input: JudgeConfig.Input): Effect.Effect<JudgeBallot.Response> =>
  Effect.die("not implemented")
