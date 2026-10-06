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
): string =>
  [
    `${sample.state === "error" ? "api-error" : sample.backend}:${sample.model}`,
    tally ? `(votes:${tally[0]}/${tally[1]})` : "",
    sample.state === "no-verdict" ? "(no-verdict)" : "",
    ...(cutSets ?? [sample.cuts]).filter((cuts) => cuts.length > 0).map((cuts) => `(truncated:${cuts.join(",")})`),
  ].join("")

/**
 * Takes `votes` samples. An unavailable sample aborts the ballot as fail and discards earlier votes. A strict majority
 * passes and a tie fails; the reason is `p/n passed · <reason>` cut to 300 characters.
 */
export const collect = <E, R>(votes: number, once: Effect.Effect<Sample, E, R>): Effect.Effect<Response, E, R> =>
  Effect.gen(function* () {
    const count = Math.max(1, votes)
    const samples: Sample[] = []
    while (samples.length < count) {
      const sample = yield* once
      // Transport failures and missing verdicts cannot vote about the artifact.
      if (sample.state !== "answered")
        return { verdict: "fail", reason: sample.reason, backend: tag(sample), available: false } as const
      samples.push(sample)
    }
    const first = samples[0]!
    if (count === 1) return { verdict: first.verdict, reason: first.reason, backend: tag(first), available: true }
    const passes = samples.filter((sample) => sample.verdict === "pass").length
    // A tie fails: an unproven control is a failed control.
    const verdict = passes * 2 > count ? "pass" : "fail"
    const chosen = samples.find((sample) => sample.verdict === verdict) ?? first
    return {
      verdict,
      reason: Array.from(`${passes}/${count} passed · ${chosen.reason}`).slice(0, 300).join(""),
      backend: tag(first, [passes, count], distinct(samples.map((sample) => sample.cuts))),
      available: true,
    } as const
  })

// Python's `sorted({cuts for cuts in ... if cuts})`: distinct non-empty cut sets, ordered as tuples of code points.
// Fixed-width hex code points joined on NUL, which no file name contains, sort exactly that way as plain strings.
function distinct(cutSets: ReadonlyArray<ReadonlyArray<string>>) {
  const keyed = new Map(
    cutSets
      .filter((cuts) => cuts.length > 0)
      .map((cuts) => [
        Array.from(cuts.join("\0"), (char) => char.codePointAt(0)!.toString(16).padStart(6, "0")).join(""),
        cuts,
      ]),
  )
  return [...keyed.keys()].sort().map((key) => keyed.get(key)!)
}
