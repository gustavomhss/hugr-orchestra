export * as JudgeBallot from "./ballot"

import { Effect, Schema } from "effect"

// Votes and the backend tag (`benchmark/judge.py` `_Sample`, `_Ballot`, `_sample_tag`; WP4).

// The judge's answer as the gate core reads it. `available` is false for a transport failure or a missing verdict,
// which always reads as fail.
export const Response = Schema.Struct({
  verdict: Schema.Literals(["pass", "fail"]),
  reason: Schema.String,
  backend: Schema.String,
  available: Schema.Boolean,
})
export interface Response extends Schema.Schema.Type<typeof Response> {}

export interface Sample {
  readonly verdict: "pass" | "fail"
  readonly reason: string
  readonly state: "answered" | "no-verdict" | "error"
  readonly backend: "llm"
  readonly model: string
  // File names whose context was truncated.
  readonly cuts: ReadonlyArray<string>
}

/**
 * Rendered metadata, never parsed back: `<llm|api-error>:<model>`, then `(votes:p/n)`, `(no-verdict)` and one
 * `(truncated:a,b)` per distinct cut set.
 */
export const tag = (
  sample: Sample,
  tally?: readonly [number, number],
  cutSets?: ReadonlyArray<ReadonlyArray<string>>,
): string => {
  throw new Error("not implemented")
}

/**
 * Takes `votes` samples. An unavailable sample aborts the ballot as fail and discards earlier votes. A strict majority
 * passes and a tie fails; the reason is `p/n passed · <reason>` cut to 300 characters.
 */
export const collect = <E, R>(votes: number, once: Effect.Effect<Sample, E, R>): Effect.Effect<Response, E, R> =>
  Effect.die("not implemented")
