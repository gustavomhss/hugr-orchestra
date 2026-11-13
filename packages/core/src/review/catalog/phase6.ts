const lenses = {
  quick: ["correctness-logic", "tests"],
  standard: ["correctness-logic", "correctness-edges", "correctness-reliability", "tests", "security"],
  deep: ["correctness-logic", "correctness-edges", "correctness-reliability", "tests", "security", "correctness-concurrency"],
}

export const engagementProfiles = [
  { id: "audit", node: "lucy-audit", stage: "outside-validation", tier: "deep", overlays: false, lenses, variants: 3 },
  { id: "diligence", node: "lucy-audit-diligence", stage: "outside-validation", tier: "deep", overlays: false, lenses, variants: 0 },
  { id: "artifact", node: "lucy-review-artifact", stage: "outside-validation", tier: "standard", overlays: false, lenses, variants: 0 },
]
