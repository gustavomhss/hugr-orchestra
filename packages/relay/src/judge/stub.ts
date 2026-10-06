export * as JudgeStub from "./stub"

import { Effect } from "effect"
import type { JudgeBallot } from "./ballot"
import type { JudgeConfig } from "./config"

// The token a context file must carry for the unforced stub to pass.
export const MARKER = "RELAY_JUDGE_OK"

/**
 * The test double (WP3): a forced verdict, or pass only when every context file contains `RELAY_JUDGE_OK`. No files
 * fail. It never evaluates the criterion.
 */
export const judge = (input: JudgeConfig.Input, forced?: "pass" | "fail"): Effect.Effect<JudgeBallot.Response> =>
  Effect.sync(() => {
    if (forced) return answer(forced, `stub forced ${forced}`)
    if (input.files.length === 0) return answer("fail", "stub: no context to inspect")
    const absent = input.files.find((file) => !file.text?.includes(MARKER))
    if (absent) return answer("fail", `stub: ${MARKER} marker absent in ${absent.name}`)
    return answer("pass", "stub: marker present in all context files")
  })

function answer(verdict: "pass" | "fail", reason: string): JudgeBallot.Response {
  return { verdict, reason, backend: "stub", available: true }
}
