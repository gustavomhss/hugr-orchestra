export const phase5Options = [
  { id: "probe:mutants", rung: "probe", cost: "high" },
  { id: "probe:interleave", rung: "probe", cost: "high" },
  { id: "probe:race", rung: "probe", cost: "high" },
  { id: "probe:property", rung: "probe", cost: "high" },
]
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
