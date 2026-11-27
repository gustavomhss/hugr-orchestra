import { expect, test } from "bun:test"
import { WorktreeReading } from "../src/orchestra/chapters/activity/worktree-reading"
import { readingAge } from "../src/orchestra/chapters/activity/reading"
import { bounded, row, setup, snapshot } from "./activity-worktree-fixture"

test("W10 unread, complete zero and partial readings retain separate monotonic ages and named source", async () => {
  const fixture = setup()
  const operations: Promise<void>[] = []
  const state = fixture.controller.state
  const age = (sampledAt?: number) =>
    readingAge({
      sampledAt,
      readAt: state.snapshot?.readAt ?? NaN,
      receivedAt: state.receivedAt ?? NaN,
      now: state.now,
    })
  try {
    const initial = fixture.controller.refresh()
    operations.push(initial)
    ;(await fixture.next()).respond(snapshot("0", { readAt: 9_001_000 }))
    await bounded(initial)
    expect(Object.hasOwn(state.snapshot!.records[0]!, "logical")).toBe(false)
    expect(Object.hasOwn(state.snapshot!.records[0]!, "attempt")).toBe(false)
    expect(age()).toBeUndefined()

    const complete = {
      startedAt: 8_999_999,
      sampledAt: 9_000_000,
      state: "complete",
      observedBytes: 0,
      entries: 1,
      issueCount: 0,
      issues: [],
    } as const
    const first = fixture.controller.read("a")
    operations.push(first)
    ;(await fixture.next()).respond(
      snapshot("1", {
        readAt: 9_001_000,
        records: [row("a", { logical: { bytes: 0, sampledAt: 9_000_000 }, attempt: complete }), row("b")],
      }),
    )
    await bounded(first)
    expect(state.snapshot!.records[0]!.logical?.bytes).toBe(0)
    expect(state.snapshot!.source).toBe("node.fs.lstat")
    expect(age(state.snapshot!.records[0]!.logical?.sampledAt)).toBe(1000)
    fixture.clock.now = 1100
    fixture.controller.tick()
    expect(age(state.snapshot!.records[0]!.logical?.sampledAt)).toBe(2000)

    fixture.clock.now = 2100
    const partial = {
      ...complete,
      sampledAt: 9_002_500,
      state: "partial",
      observedBytes: 7,
      entries: 2,
      issueCount: 1,
      issues: [{ path: "/registered/a/link", reason: "symlink" }],
    } as const
    const retry = fixture.controller.read("a")
    operations.push(retry)
    ;(await fixture.next()).respond(
      snapshot("2", {
        readAt: 9_003_000,
        records: [
          row("a", { logical: { bytes: 0, sampledAt: 9_000_000 }, attempt: partial }),
          row("b", { attempt: partial }),
        ],
      }),
    )
    await bounded(retry)
    expect(state.snapshot!.records[0]!.logical).toEqual({ bytes: 0, sampledAt: 9_000_000 })
    expect(state.snapshot!.records[0]!.attempt).toEqual(partial)
    expect(Object.hasOwn(state.snapshot!.records[1]!, "logical")).toBe(false)
    expect(state.snapshot!.source).toBe("node.fs.lstat")
    fixture.clock.now = 3100
    fixture.controller.tick()
    expect(age(state.snapshot!.records[0]!.logical?.sampledAt)).toBe(4000)
    expect(age(state.snapshot!.records[0]!.attempt?.sampledAt)).toBe(1500)

    for (const revision of ["2", "1"]) {
      fixture.clock.now += 1000
      const older = fixture.controller.read("a")
      operations.push(older)
      ;(await fixture.next()).respond(snapshot(revision, { readAt: 99_000_000, records: [] }))
      await bounded(older)
      expect(state.receivedAt).toBe(2100)
      expect(state.snapshot!.records).toHaveLength(2)
      expect(state.snapshot!.records[0]!.logical?.sampledAt).toBe(9_000_000)
      expect(state.snapshot!.records[0]!.attempt?.sampledAt).toBe(9_002_500)
    }
    fixture.controller.tick()
    expect(age(state.snapshot!.records[0]!.logical?.sampledAt)).toBe(6000)
    expect(age(state.snapshot!.records[0]!.attempt?.sampledAt)).toBe(3500)
    const failed = fixture.controller.read("a")
    operations.push(failed)
    ;(await fixture.next()).fail(new Error("current read failed"))
    await bounded(failed)
    expect(state.reads.a?.failed).toBe(true)
    expect(fixture.reports).toHaveLength(1)
    expect(state.receivedAt).toBe(2100)
    expect(age(state.snapshot!.records[0]!.logical?.sampledAt)).toBe(6000)
  } finally {
    fixture.dispose()
    await bounded(Promise.allSettled(operations))
  }
})

test("W10 missing and noncanonical wire revisions fail without replacing a successful inventory", async () => {
  const fixture = setup()
  const operations: Promise<void>[] = []
  try {
    const initial = fixture.controller.refresh()
    operations.push(initial)
    ;(await fixture.next()).respond(snapshot("0"))
    await bounded(initial)
    const before = fixture.controller.state.snapshot
    const receivedAt = fixture.controller.state.receivedAt
    const invalid = [undefined, "", "01", "-1", "1.5", "1\n", 1]
    for (const revision of invalid) {
      fixture.clock.now += 1000
      const operation = fixture.controller.refresh()
      operations.push(operation)
      ;(await fixture.next()).respond({ ...snapshot("1", { records: [] }), snapshotRevision: revision })
      await bounded(operation)
      expect(fixture.controller.state.snapshot).toEqual(before)
      expect(fixture.controller.state.receivedAt).toBe(receivedAt)
      expect(fixture.controller.state.inventory.failed).toBe(true)
      expect(fixture.controller.state.inventory.busy).toBe(false)
    }
    expect(fixture.reports).toHaveLength(invalid.length)
    const recovered = fixture.controller.refresh()
    operations.push(recovered)
    ;(await fixture.next()).respond(snapshot("1", { records: [] }))
    await bounded(recovered)
    expect(fixture.controller.state.inventory).toEqual({ busy: false, failed: false })
    expect(fixture.controller.state.snapshot!.records).toEqual([])
    expect(fixture.controller.state.receivedAt).toBe(fixture.clock.now)
  } finally {
    fixture.dispose()
    await bounded(Promise.allSettled(operations))
  }
})

test("W11 filtering preserves opaque cross-project rows, blank owners and registered facts", () => {
  const rows = [row("a", { directory: "/Shared/Worktree" }), row("b", { directory: "/Shared/Worktree" })]
  expect(WorktreeReading.matching(rows, "  ")).toEqual(rows)
  expect(WorktreeReading.matching(rows, " shared/worktree ")).toEqual(rows)
  const filtered = WorktreeReading.matching(rows, "PROJECT-B")
  expect(filtered).toHaveLength(1)
  expect(filtered[0]).toBe(rows[1])
  expect(filtered[0]!.recordID).toBe("b")
  expect(filtered[0]!.owner).toBe("")
  expect(WorktreeReading.matching(rows, "not-registered")).toEqual([])
  expect(WorktreeReading.matching([], "")).toEqual([])
  expect(
    rows.map((record) => ({ id: record.recordID, owner: record.owner, logical: Object.hasOwn(record, "logical") })),
  ).toEqual([
    { id: "a", owner: "", logical: false },
    { id: "b", owner: "", logical: false },
  ])
  expect(rows[0]!.directory).toBe("/Shared/Worktree")
  expect(rows[1]!.directory).toBe("/Shared/Worktree")
})
