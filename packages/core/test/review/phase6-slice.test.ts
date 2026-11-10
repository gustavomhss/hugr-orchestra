import { expect, test } from "bun:test"
import { engagementProfiles } from "../../src/review/catalog/phase6"

test("engagement profiles name the three ids and nodes", () => {
  expect(engagementProfiles.map((profile) => profile.id)).toEqual(["audit", "diligence", "artifact"])
  expect(engagementProfiles.map((profile) => profile.node)).toEqual([
    "lucy-audit",
    "lucy-audit-diligence",
    "lucy-review-artifact",
  ])
})
