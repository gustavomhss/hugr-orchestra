export * as JudgeStub from "./stub"

import { Effect } from "effect"
import type { JudgeBallot } from "./ballot"
import type { JudgeConfig } from "./config"

/**
 * The test double (WP3): a forced verdict, or pass only when every context file contains `RELAY_JUDGE_OK`. No files
 * fail. It never evaluates the criterion.
 */
export const judge = (input: JudgeConfig.Input, forced?: "pass" | "fail"): Effect.Effect<JudgeBallot.Response> =>
  Effect.die("not implemented")
