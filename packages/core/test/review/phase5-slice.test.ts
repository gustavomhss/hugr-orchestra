import { describe, expect, test } from "bun:test"
import { phase5Options, releaseProfile } from "../../src/review/catalog/phase5"

describe("phase 5 catalog slice", () => {
  test("names the four probe options and the release profile", () => {
    expect(phase5Options.map((option) => option.id)).toEqual([
      "probe:mutants",
      "probe:interleave",
      "probe:race",
      "probe:property",
    ])
    expect(releaseProfile.id).toBe("release")
    expect(releaseProfile.node).toBe("lucy-review-release")
  })
})
