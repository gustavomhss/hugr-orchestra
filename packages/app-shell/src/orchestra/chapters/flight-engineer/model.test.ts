import { describe, expect, test } from "bun:test"
import {
  accelerator,
  clock,
  hearsay,
  inTab,
  jumpable,
  keycaps,
  listStatus,
  minutes,
  num,
  pollDelay,
  pollLimit,
  polling,
  refusal,
  speaker,
  visible,
  type Summary,
} from "./model"

const priya = { id: "p1", name: "Priya" }
const dan = { id: "p2", name: "Dan" }

const meeting = (input: Partial<Summary> & { counts?: Partial<Summary["counts"]> }): Summary => ({
  id: "mtg_1",
  title: "Sync",
  startedAt: 1_000_000,
  people: [],
  retention: "kept",
  consent: "announced",
  ...input,
  counts: { decisions: 0, commitments: 0, openCommitments: 0, answers: 0, ...input.counts },
})

describe("speaker", () => {
  test("me, a person and an unidentified voice", () => {
    expect(speaker("me")).toEqual({ kind: "me" })
    expect(speaker(priya)).toEqual({ kind: "person", name: "Priya" })
    expect(speaker({ unknown: 2 })).toEqual({ kind: "unknown", number: 2 })
  })
})

describe("hearsay", () => {
  test("the owner's own words are never hearsay", () => {
    expect(hearsay("me", priya)).toBe(false)
    expect(hearsay("me")).toBe(false)
  })
  test("the commitment owner speaking for themselves is not hearsay", () => {
    expect(hearsay(priya, priya)).toBe(false)
  })
  test("someone else's claim about a task is hearsay", () => {
    expect(hearsay(dan, priya)).toBe(true)
    expect(hearsay(priya, "me")).toBe(true)
    expect(hearsay({ unknown: 1 }, priya)).toBe(true)
  })
  test("an item with no owner is hearsay unless the owner said it", () => {
    expect(hearsay(dan)).toBe(true)
  })
})

describe("poll", () => {
  test("stops as soon as the card is no longer pending", () => {
    expect(polling({ status: "pending" }, 0)).toBe(true)
    expect(polling({ status: "ready" }, 0)).toBe(false)
    expect(polling({ status: "failed" }, 3)).toBe(false)
  })
  test("never runs without end", () => {
    expect(polling({ status: "pending" }, pollLimit)).toBe(false)
  })
  test("backs off to a ceiling", () => {
    expect(pollDelay(0)).toBeLessThan(pollDelay(3))
    expect(pollDelay(1000)).toBe(6000)
  })
})

describe("jumpable", () => {
  test("an ephemeral item has no quote and no start", () => {
    expect(jumpable({ quote: "", startMs: undefined })).toBe(false)
    expect(jumpable({ quote: "", startMs: 1200 })).toBe(false)
    expect(jumpable({ quote: "three retries", startMs: null })).toBe(false)
  })
  test("a kept item with a quote and a start can jump", () => {
    expect(jumpable({ quote: "three retries", startMs: 1200 })).toBe(true)
  })
})

describe("dismissed", () => {
  test("hides the item and keeps the others", () => {
    expect(visible([{ id: "a" }, { id: "b" }], new Set(["a"]))).toEqual([{ id: "b" }])
  })
})

describe("clock and length", () => {
  test("formats minutes and hours", () => {
    expect(clock(24 * 60_000 + 18_000)).toBe("24:18")
    expect(clock(3_723_000)).toBe("1:02:03")
    expect(clock(-5)).toBe("00:00")
  })
  test("a meeting without an end has no length", () => {
    expect(minutes({ startedAt: 0 })).toBeUndefined()
    expect(minutes({ startedAt: 0, endedAt: 41 * 60_000 })).toBe(41)
  })
  test("non-finite numbers count as zero", () => {
    expect(num("NaN")).toBe(0)
    expect(num(4)).toBe(4)
  })
})

describe("list", () => {
  test("tabs", () => {
    const now = 10 * 24 * 60 * 60 * 1000
    expect(inTab(meeting({ startedAt: now - 1000 }), "week", now)).toBe(true)
    expect(inTab(meeting({ startedAt: 0 }), "week", now)).toBe(false)
    expect(inTab(meeting({ counts: { openCommitments: 2 } }), "open", now)).toBe(true)
    expect(inTab(meeting({}), "open", now)).toBe(false)
  })
  test("status", () => {
    expect(listStatus(meeting({}))).toBe("recording")
    expect(listStatus(meeting({ endedAt: 5, counts: { openCommitments: 1 } }))).toBe("open")
    expect(listStatus(meeting({ endedAt: 5 }))).toBe("ended")
  })
})

describe("refusal", () => {
  test("reads the meeting error reason", () => {
    expect(refusal({ name: "MeetingError", data: { reason: "unavailable" } })).toBe("unavailable")
    expect(refusal({ name: "MeetingError", data: { reason: "running" } })).toBe("running")
    expect(refusal({ name: "MeetingError", data: { reason: "ended" } })).toBe("other")
    expect(refusal(new Error("x"))).toBe("other")
    expect(refusal(undefined)).toBe("other")
  })
})

describe("hotkeys", () => {
  test("key caps", () => {
    expect(keycaps("CommandOrControl+Shift+M", true)).toEqual(["⌘", "⇧", "M"])
    expect(keycaps("CommandOrControl+Shift+M", false)).toEqual(["Ctrl", "Shift", "M"])
    expect(keycaps("Command+\\", true)).toEqual(["⌘", "\\"])
    expect(keycaps("Command+Return", true)).toEqual(["⌘", "↩"])
  })
  test("records a press only with a modifier and a key", () => {
    const base = { metaKey: false, ctrlKey: false, altKey: false, shiftKey: false }
    expect(accelerator({ ...base, key: "Meta", metaKey: true }, true)).toBeUndefined()
    expect(accelerator({ ...base, key: "m" }, true)).toBeUndefined()
    expect(accelerator({ ...base, key: "m", metaKey: true, shiftKey: true }, true)).toBe("Command+Shift+M")
    expect(accelerator({ ...base, key: "ArrowUp", ctrlKey: true }, false)).toBe("Control+Up")
  })
})
