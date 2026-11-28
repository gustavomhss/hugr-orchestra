import { describe, expect, test } from "bun:test"
import { ActivityQuarantine } from "../src/activity-quarantine"

const absent = { state: "absent" } as const
const unavailable = { state: "unavailable" } as const
const expected = { state: "present", identity: "expected" } as const
const other = { state: "present", identity: "other" } as const

describe("quarantine postconditions", () => {
  test("apply requires original absence and the expected quarantined identity", () => {
    expect(ActivityQuarantine.verify("apply", "expected", { original: absent, quarantine: expected })).toBe("verified")
    expect(ActivityQuarantine.verify("apply", "expected", { original: expected, quarantine: expected })).toBe("unknown")
    expect(ActivityQuarantine.verify("apply", "expected", { original: unavailable, quarantine: expected })).toBe("unknown")
    expect(ActivityQuarantine.verify("apply", "expected", { original: absent, quarantine: other })).toBe("unknown")
    expect(ActivityQuarantine.verify("apply", "expected", { original: absent, quarantine: absent })).toBe("unknown")
  })

  test("restore requires expected identity at original and quarantine absence", () => {
    expect(ActivityQuarantine.verify("restore", "expected", { original: expected, quarantine: absent })).toBe("verified")
    expect(ActivityQuarantine.verify("restore", "expected", { original: other, quarantine: absent })).toBe("unknown")
    expect(ActivityQuarantine.verify("restore", "expected", { original: expected, quarantine: expected })).toBe("unknown")
    expect(ActivityQuarantine.verify("restore", "expected", { original: expected, quarantine: unavailable })).toBe("unknown")
  })

  test("empty requires quarantine absence regardless of original", () => {
    expect(ActivityQuarantine.verify("empty", "expected", { original: expected, quarantine: absent })).toBe("verified")
    expect(ActivityQuarantine.verify("empty", "expected", { original: unavailable, quarantine: absent })).toBe("verified")
    expect(ActivityQuarantine.verify("empty", "expected", { original: absent, quarantine: expected })).toBe("unknown")
    expect(ActivityQuarantine.verify("empty", "expected", { original: absent, quarantine: unavailable })).toBe("unknown")
  })

  test("restore availability requires a record, verified out and matching identity", () => {
    const facts = { original: absent, quarantine: expected }
    expect(ActivityQuarantine.restoreState("expected", "/original", true, facts)).toBe("Restorable")
    expect(ActivityQuarantine.restoreState("expected", undefined, true, facts)).toBe("Unknown")
    expect(ActivityQuarantine.restoreState("expected", "", true, facts)).toBe("Unknown")
    expect(ActivityQuarantine.restoreState("expected", "/original", false, facts)).toBe("Unknown")
    expect(ActivityQuarantine.restoreState("expected", "/original", true, { original: unavailable, quarantine: expected })).toBe("Unknown")
    expect(ActivityQuarantine.restoreState("expected", "/original", true, { original: absent, quarantine: other })).toBe("Unknown")
    expect(ActivityQuarantine.restoreState("expected", "/original", false, { original: other, quarantine: unavailable })).toBe("Occupied")
    expect(ActivityQuarantine.restoreState("expected", undefined, true, { original: other, quarantine: expected })).toBe("Unknown")
  })

  test("empty selection refuses incomplete or duplicate active quarantine rows", () => {
    const ready = { id: "one", kind: "quarantine", state: "ready" } as const
    expect(ActivityQuarantine.emptyTargets([ready, { id: "move", kind: "move", state: "ready" }, { id: "done", kind: "quarantine", state: "finished" }])).toEqual(["one"])
    expect(ActivityQuarantine.emptyTargets([])).toBeUndefined()
    expect(ActivityQuarantine.emptyTargets([{ id: "move", kind: "move", state: "ready" }])).toBeUndefined()
    expect(ActivityQuarantine.emptyTargets([ready, { ...ready, state: "refused" }])).toBeUndefined()
    expect(ActivityQuarantine.emptyTargets([ready, { ...ready, id: "two", state: "unknown" }])).toBeUndefined()
    expect(ActivityQuarantine.emptyTargets([ready, ready])).toBeUndefined()
    expect(ActivityQuarantine.emptyTargets([ready, { ...ready, state: "finished" }])).toEqual(["one"])
  })
})
