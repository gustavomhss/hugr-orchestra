export * as ActivityFootprintHypothesis from "./activity-footprint-hypothesis"

export type Sample = {
  readonly sampledAt: number
  readonly source: "footprint" | "rss"
  readonly bytes: number
}

/** Takes a chronological series of one supervisor tree and the recorded completion of its work. */
export function evaluate(_input: {
  readonly workFinishedAt?: number
  readonly samples: readonly Sample[]
}): "insufficient" | "compatible-with-logical-leak" {
  return "insufficient"
}
