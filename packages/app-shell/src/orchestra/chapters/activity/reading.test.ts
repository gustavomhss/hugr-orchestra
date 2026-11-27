import { expect, test } from "bun:test"
import {
  address,
  recordedOwner,
  recordedRow,
  recordedTrees,
  selectSession,
  states,
  tabs,
  unread,
  view,
  readingAge,
  type ActivityRow,
} from "./reading"

const tree = (patch: Partial<ActivityRow> = {}): ActivityRow => ({
  supervisorId: "tree-1",
  owner: "session-a",
  state: "alive",
  reading: undefined,
  ...patch,
})

test("reading age cancels remote clock offsets and continues while a refresh is failing", () => {
  expect(readingAge({ sampledAt: 9_000_000, readAt: 9_001_000, receivedAt: 100, now: 2600 })).toBe(3500)
  expect(readingAge({ sampledAt: 1000, readAt: 2000, receivedAt: 100, now: 2600 })).toBe(3500)
  expect(readingAge({ sampledAt: undefined, readAt: 2000, receivedAt: 100, now: 2600 })).toBeUndefined()
  expect(readingAge({ sampledAt: 1000, readAt: NaN, receivedAt: 100, now: 2600 })).toBeUndefined()
})

test("a missing source is unread, never zero", () => {
  const missing = view([tree()], "")
  expect(missing.rows[0]?.value).toBe(unread)
  expect(missing.rows[0]?.source).toBe(unread)
  expect(missing.rows[0]?.ageMs).toBeUndefined()
  expect(missing.rows[0]?.value).not.toBe("0")
  expect(missing.rows[0]?.id).toBe("tree-1")

  const blankSource = view([tree({ reading: { source: "", value: "0", ageMs: 1 } })], "")
  expect(blankSource.rows[0]?.value).toBe(unread)

  const namedZero = view([tree({ reading: { source: "rss", value: "0", ageMs: 4 } })], "")
  expect(namedZero.rows[0]?.value).toBe("0")
  expect(namedZero.rows[0]?.source).toBe("rss")
  expect(namedZero.rows[0]?.ageMs).toBe(4)
})

test("owner is only the recorded session name", () => {
  expect(recordedOwner(undefined)).toBe("")
  expect(recordedOwner("")).toBe("")
  expect(recordedOwner("session-a")).toBe("session-a")
  const row = view([tree({ owner: recordedOwner(undefined) })], "")
  expect(row.rows[0]?.owner).toBe("")
})

test("selecting a session does not fill an empty owner or change the string", () => {
  const rows = [tree({ owner: "" }), tree({ supervisorId: "tree-2", owner: "Alpha" })]
  const selected = selectSession(rows, "Alpha")
  expect(selected[0]?.owner).toBe("")
  expect(selected[1]?.owner).toBe("Alpha")
  expect(view(rows, "", "Trees").rows.map((row) => row.owner)).toEqual(
    view(rows, "", "Quarantine").rows.map((row) => row.owner),
  )
})

test("a recorded spawn is the supervisor id, and an empty owner stays empty", () => {
  const row = recordedRow({ supervisorId: "7", owner: "" })
  expect(row?.supervisorId).toBe("7")
  expect(row?.owner).toBe("")
  expect(view(row ? [row] : [], "").rows[0]?.id).toBe("7")
  expect(recordedRow({ supervisorId: "", owner: "nope" })).toBeUndefined()
})

test("a pid is not the address", () => {
  expect(address({ pid: 42 })).toBe("")
  expect(address({ supervisorId: "tree-9", pid: 42 })).toBe("tree-9")
  const shown = view([tree({ supervisorId: address({ pid: 42 }) })], "")
  expect(shown.rows[0]?.id).toBe(unread)
  expect(shown.rows[0]?.confirm).toBe(false)
})

test("inspection failure is unknown, not unread", () => {
  const shown = view([tree({ state: "unknown" })], "")
  expect(shown.rows[0]?.state).toBe("unknown")
  expect(states).toEqual(["alive", "exiting", "zombie", "gone", "unknown", "suspended", "partial"])
})

test("the first sample and machine pressure stay unread", () => {
  expect(recordedTrees()).toEqual([])
  const first = view(recordedTrees(), "")
  expect(first.pressure).toBe(unread)
  expect(first.filterMiss).toBe(false)
  expect(first.rows).toEqual([
    { id: unread, owner: "", state: unread, value: unread, source: unread, ageMs: undefined, confirm: false },
  ])
})

test("a filter miss is not an empty machine", () => {
  const missed = view([tree({ reading: { source: "rss", value: "12", ageMs: 1 } })], "nope")
  expect(missed.filterMiss).toBe(true)
  expect(missed.rows).toEqual([])
  expect(missed.pressure).toBe(unread)
})

test("tab names stay the closed English set", () => {
  expect(view([], "").tabs).toEqual([
    "Trees",
    "Worktrees",
    "Cache",
    "Docker",
    "Temporary",
    "Logs",
    "IN/OUT",
    "Quarantine",
  ])
  expect(tabs).toContain("IN/OUT")
})
