import { describe, expect, test } from "bun:test"
import { ActivityFootprintHypothesis } from "../src/activity-footprint-hypothesis"

const baseline = { sampledAt: 10, source: "footprint" as const, bytes: 100 }
const rise = { sampledAt: 20, source: "footprint" as const, bytes: 120 }
const stable = { sampledAt: 30, source: "footprint" as const, bytes: 120 }
const higher = { sampledAt: 40, source: "footprint" as const, bytes: 130 }

describe("footprint hypothesis evidence", () => {
  test("requires recorded work completion and a post-work rise from a measured baseline", () => {
    expect(ActivityFootprintHypothesis.evaluate({ samples: [baseline, rise, stable, higher] })).toBe("insufficient")
    expect(ActivityFootprintHypothesis.evaluate({ workFinishedAt: 20, samples: [baseline, rise, stable, higher] })).toBe("insufficient")
    expect(ActivityFootprintHypothesis.evaluate({ workFinishedAt: 5, samples: [baseline, rise, stable, higher] })).toBe("insufficient")
    expect(ActivityFootprintHypothesis.evaluate({ workFinishedAt: 10, samples: [baseline, { ...rise, bytes: 100 }, { ...stable, bytes: 100 }, { ...higher, bytes: 100 }] })).toBe("insufficient")
  })

  test("requires two strictly later footprint confirmations after the rise", () => {
    expect(ActivityFootprintHypothesis.evaluate({ workFinishedAt: 10, samples: [baseline, rise, stable] })).toBe("insufficient")
    expect(ActivityFootprintHypothesis.evaluate({ workFinishedAt: 10, samples: [baseline, rise, stable, { ...higher, sampledAt: 30 }] })).toBe("insufficient")
  })

  test("rejects a footprint series with unsorted, duplicate, or invalid observations", () => {
    expect(ActivityFootprintHypothesis.evaluate({ workFinishedAt: 10, samples: [baseline, rise, higher, stable] })).toBe("insufficient")
    expect(ActivityFootprintHypothesis.evaluate({ workFinishedAt: 10, samples: [baseline, { ...baseline, bytes: 110 }, rise, stable, higher] })).toBe("insufficient")
    expect(ActivityFootprintHypothesis.evaluate({ workFinishedAt: 10, samples: [{ ...baseline, bytes: -1 }, rise, stable, higher] })).toBe("insufficient")
  })

  test("a subsequent footprint decrease keeps the evidence insufficient even if it stays high", () => {
    expect(ActivityFootprintHypothesis.evaluate({ workFinishedAt: 10, samples: [baseline, rise, { ...stable, bytes: 110 }, higher, { ...higher, sampledAt: 50 }] })).toBe("insufficient")
    expect(ActivityFootprintHypothesis.evaluate({ workFinishedAt: 10, samples: [baseline, rise, stable, higher, { ...higher, sampledAt: 50, bytes: 125 }] })).toBe("insufficient")
  })

  test("RSS cannot provide a baseline, rise, or confirmation", () => {
    const rss = [baseline, rise, stable, higher].map((sample) => ({ ...sample, source: "rss" as const }))
    expect(ActivityFootprintHypothesis.evaluate({ workFinishedAt: 10, samples: rss })).toBe("insufficient")
    expect(ActivityFootprintHypothesis.evaluate({ workFinishedAt: 10, samples: [rss[0]!, rise, stable, higher] })).toBe("insufficient")
    expect(ActivityFootprintHypothesis.evaluate({ workFinishedAt: 10, samples: [baseline, rss[1]!, stable, higher] })).toBe("insufficient")
    expect(ActivityFootprintHypothesis.evaluate({ workFinishedAt: 10, samples: [baseline, rise, rss[2]!, higher] })).toBe("insufficient")
  })

  test("accepts a post-work rise followed by two stable or rising footprint measurements", () => {
    expect(ActivityFootprintHypothesis.evaluate({ workFinishedAt: 10, samples: [baseline, rise, stable, higher] })).toBe("compatible-with-logical-leak")
    expect(ActivityFootprintHypothesis.evaluate({ workFinishedAt: 10, samples: [baseline, rise, stable, { ...higher, bytes: 120 }] })).toBe("compatible-with-logical-leak")
  })

  test("ignores intervening RSS samples without erasing footprint evidence", () => {
    expect(ActivityFootprintHypothesis.evaluate({ workFinishedAt: 10, samples: [baseline, { sampledAt: 15, source: "rss", bytes: 500 }, rise, { sampledAt: 25, source: "rss", bytes: 1 }, stable, higher] })).toBe("compatible-with-logical-leak")
  })
})
