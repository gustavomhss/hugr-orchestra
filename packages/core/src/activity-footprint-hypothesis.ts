export * as ActivityFootprintHypothesis from "./activity-footprint-hypothesis"

export type Sample = {
  readonly sampledAt: number
  readonly source: "footprint" | "rss"
  readonly bytes: number
}

/** Takes a chronological series of one supervisor tree and the recorded completion of its work. */
export function evaluate(input: {
  readonly workFinishedAt?: number
  readonly samples: readonly Sample[]
}): "insufficient" | "compatible-with-logical-leak" {
  const finishedAt = input.workFinishedAt
  if (finishedAt === undefined || !Number.isFinite(finishedAt)) return "insufficient"

  let baseline: number | undefined
  let previous: Sample | undefined
  let elevated = 0
  for (const sample of input.samples) {
    if (sample.source !== "footprint") continue
    if (!Number.isFinite(sample.sampledAt) || !Number.isSafeInteger(sample.bytes) || sample.bytes < 0)
      return "insufficient"
    if (previous && sample.sampledAt <= previous.sampledAt) return "insufficient"
    if (elevated > 0 && previous && sample.bytes < previous.bytes) return "insufficient"
    previous = sample

    if (sample.sampledAt <= finishedAt) {
      baseline = sample.bytes
      continue
    }
    if (baseline === undefined) return "insufficient"
    if (sample.bytes > baseline) elevated++
  }
  return elevated >= 3 ? "compatible-with-logical-leak" : "insufficient"
}
