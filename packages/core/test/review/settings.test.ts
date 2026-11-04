import { describe, expect, test } from "bun:test"
import { ReviewSettings } from "../../src/review/settings"

describe("ReviewSettings", () => {
  test("a project without review settings pins no tier and accepts nothing", () => {
    expect(ReviewSettings.read({})).toEqual({ acceptedUnavailable: [] })
    expect(ReviewSettings.read({ review: null })).toEqual({ acceptedUnavailable: [] })
    expect(ReviewSettings.read({ review: { tier: null, acceptedUnavailable: null } })).toEqual({ acceptedUnavailable: [] })
    expect(ReviewSettings.accepted(ReviewSettings.read({}), "test")).toBe(false)
  })

  test("reads the pinned tier and the accepted unavailable checks as open strings", () => {
    const settings = ReviewSettings.read({ review: { tier: "deep", acceptedUnavailable: ["regress", "typecheck", "sandbox"] } })
    expect(settings).toEqual({ tier: "deep", acceptedUnavailable: ["regress", "typecheck", "sandbox"] })
    expect(ReviewSettings.accepted(settings, "regress")).toBe(true)
    expect(ReviewSettings.accepted(settings, "sandbox")).toBe(true)
    expect(ReviewSettings.accepted(settings, "build")).toBe(false)
  })

  test("reads a board project's stored review settings", () => {
    expect(ReviewSettings.read(ReviewSettings.fromProject({ reviewTier: null, reviewAcceptedUnavailable: [] }))).toEqual({
      acceptedUnavailable: [],
    })
    expect(
      ReviewSettings.read(ReviewSettings.fromProject({ reviewTier: "light", reviewAcceptedUnavailable: ["custom-lane"] })),
    ).toEqual({ tier: "light", acceptedUnavailable: ["custom-lane"] })
  })

  test("drops blank ids and repeats, and a blank tier pins nothing", () => {
    const settings = ReviewSettings.read({ review: { tier: "  ", acceptedUnavailable: [" test ", "", "test", "build"] } })
    expect(settings).toEqual({ acceptedUnavailable: ["test", "build"] })
    expect(ReviewSettings.accepted(settings, "test")).toBe(true)
    expect(ReviewSettings.accepted(settings, "")).toBe(false)
  })
})
