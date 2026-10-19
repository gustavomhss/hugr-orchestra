import { describe, expect, test } from "bun:test"
import { type AtlasEvent, createAtlasModel } from "../atlas-model"
import { atlasFixture } from "../atlas-model.fixture"
import { activityRows, countRows, eventText, eventTime, shownRows } from "./activity-data"

const event = (patch: Partial<AtlasEvent>): AtlasEvent => ({
  at: 0,
  who: "backend",
  kind: "memory",
  ok: true,
  unit: "T-1",
  ...patch,
})

describe("atlas activity data", () => {
  test("adds one code row per commit and keeps code rows out of All", () => {
    const rows = activityRows(createAtlasModel(atlasFixture()))
    expect(rows).toEqual([{ id: "c0", kind: "code", sha: "c0ffee1", subject: "fix x", facts: 1 }])
    expect(shownRows(rows, "all")).toEqual([])
    expect(shownRows(rows, "code").map((row) => row.id)).toEqual(["c0"])
    expect((["reads", "memory", "holds", "code"] as const).map((show) => countRows(rows, show))).toEqual([0, 0, 0, 1])
  })

  test("filters agent events by kind", () => {
    const rows = [
      { id: "e0", kind: "read" as const, event: event({ kind: "read", action: "catalog" }) },
      { id: "e1", kind: "resume" as const, event: event({ kind: "resume" }) },
      { id: "e2", kind: "hold" as const, event: event({ kind: "hold", ok: false }) },
    ]
    expect(shownRows(rows, "all").map((row) => row.id)).toEqual(["e0", "e1", "e2"])
    expect(shownRows(rows, "memory").map((row) => row.id)).toEqual(["e1"])
    expect(shownRows(rows, "reads").map((row) => row.id)).toEqual(["e0"])
    expect(shownRows(rows, "holds").map((row) => row.id)).toEqual(["e2"])
  })

  test("words each event kind with the seat's name", () => {
    expect(eventText(event({}))).toEqual({ key: "orchestra.atlas.activity.event.saved", params: { name: "Backend" } })
    expect(eventText(event({ ok: false })).key).toBe("orchestra.atlas.activity.event.notSaved")
    expect(eventText(event({ recall: true })).key).toBe("orchestra.atlas.activity.event.recalled")
    expect(eventText(event({ kind: "resume", who: "jimmy" }))).toEqual({
      key: "orchestra.atlas.activity.event.resumed",
      params: { name: "Jimmy" },
    })
    expect(eventText(event({ kind: "resume", ok: false })).key).toBe("orchestra.atlas.activity.event.noCheckpoint")
    expect(eventText(event({ kind: "hold", ok: false })).key).toBe("orchestra.atlas.activity.event.held")
    expect(eventText(event({ kind: "read", who: "archie", action: "anchor", target: "WP-1", units: ["a", "b"] }))).toEqual({
      key: "orchestra.atlas.activity.event.froze",
      params: { name: "Archie", count: 2, target: "WP-1" },
    })
    expect(eventText(event({ kind: "read", action: "catalog" })).key).toBe("orchestra.atlas.activity.event.catalog")
    expect(eventText(event({ kind: "read", action: "unit", target: "packages/a" }))).toEqual({
      key: "orchestra.atlas.activity.event.briefing",
      params: { name: "Backend", unit: "packages/a" },
    })
  })

  test("formats times in UTC", () => {
    expect(eventTime(Date.UTC(2026, 9, 11, 14, 5))).toEqual({ day: "Oct 11", clock: "14:05" })
  })
})
