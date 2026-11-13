// The host runs these closed adapters. Offers remain gated by the actual built Deep run tier.
// probe:race is live: Go only, `go test -race`, nothing installed.
export const phase5Options = [
  { id: "probe:mutants", rung: "probe", cost: "high" },
  { id: "probe:interleave", rung: "probe", cost: "high" },
  { id: "probe:property", rung: "probe", cost: "high" },
] as const
export const releaseProfile = {
  id: "release",
  node: "lucy-review-release",
  stage: "code",
  tier: "deep",
  overlays: false,
  lenses: {
    quick: ["correctness-logic", "tests"],
    standard: ["correctness-logic", "correctness-edges", "correctness-reliability", "tests", "security"],
    deep: [
      "security-release",
      "correctness-logic",
      "correctness-edges",
      "correctness-reliability",
      "tests",
      "security",
      "correctness-concurrency",
    ],
  },
  variants: 0,
}
