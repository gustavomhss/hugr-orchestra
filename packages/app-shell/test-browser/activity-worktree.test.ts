import { expect, test } from "bun:test"
import { ClientError } from "@orchestra/client"
import { unwrap } from "solid-js/store"
import { bounded, row, setup, snapshot } from "./activity-worktree-fixture"

// Production controller + generated Client; deferred transport is unit evidence, not HTTP or DOM.
test("W09 manual requests use owned signals, coalesce, and admit only known row IDs", async () => {
  const fixture = setup()
  const operations: Promise<void>[] = []
  try {
    expect(fixture.calls).toHaveLength(0)
    operations.push(fixture.controller.refresh(), fixture.controller.refresh())
    const inventory = await fixture.next()
    expect(fixture.calls).toHaveLength(1)
    expect(inventory.method).toBe("GET")
    expect(inventory.url.pathname).toBe("/api/activity/worktrees")
    expect(inventory.signal).toBeInstanceOf(AbortSignal)
    inventory.respond(snapshot())
    await bounded(Promise.all(operations))
    expect(fixture.controller.state.snapshot).toEqual(snapshot())
    await bounded(fixture.controller.read("absent"))
    expect(fixture.calls).toHaveLength(1)
    operations.push(fixture.controller.read("a"), fixture.controller.read("a"))
    const a = await fixture.next()
    expect(fixture.calls).toHaveLength(2)
    expect(a.method).toBe("POST")
    expect(a.url.pathname).toBe("/api/activity/worktrees/a/read")
    expect(a.url.search).toBe("")
    expect(a.signal).toBeInstanceOf(AbortSignal)
    expect(a.signal?.aborted).toBe(false)
    expect(a.signal).not.toBe(inventory.signal)
    operations.push(fixture.controller.read("b"))
    const b = await fixture.next()
    expect(b.url.pathname).toBe("/api/activity/worktrees/b/read")
    expect(b.signal).not.toBe(a.signal)
    a.respond(snapshot("1", { records: [row("a", { logical: { bytes: 0, sampledAt: 1100 } }), row("b")] }))
    await bounded(operations[2]!)
    expect(fixture.controller.state.snapshot?.records[0]).toBeDefined()
    expect(fixture.controller.state.snapshot?.records[0]?.logical).toEqual({ bytes: 0, sampledAt: 1100 })
    b.respond(snapshot("2"))
    await bounded(Promise.all(operations))
    expect(fixture.calls.filter((call) => call.method === "POST")).toHaveLength(2)
  } finally {
    fixture.dispose()
    await bounded(Promise.allSettled(operations))
  }
})

test("W09 late inventory success and failure cannot regress newer full readings or their age anchor", async () => {
  const fixture = setup()
  const operations: Promise<void>[] = []
  try {
    operations.push(fixture.controller.refresh())
    ;(await fixture.next()).respond(snapshot())
    await bounded(operations[0]!)
    operations.push(fixture.controller.refresh())
    const old = await fixture.next()
    operations.push(fixture.controller.read("a"))
    const read = await fixture.next()
    const newer = snapshot("1", {
      readAt: 1200,
      records: [
        row("a", {
          logical: { bytes: 42, sampledAt: 1100 },
          attempt: {
            startedAt: 1090,
            sampledAt: 1100,
            state: "complete",
            observedBytes: 42,
            entries: 2,
            issueCount: 0,
            issues: [],
          },
        }),
      ],
    })
    fixture.clock.now = 200
    read.respond(newer)
    await bounded(operations[2]!)
    old.respond(snapshot())
    await bounded(operations[1]!)
    expect(fixture.controller.state.snapshot).toEqual(newer)
    expect(fixture.controller.state.receivedAt).toBe(200)
    operations.push(fixture.controller.refresh())
    const staleFailure = await fixture.next()
    operations.push(fixture.controller.read("a"))
    fixture.clock.now = 300
    const latest = snapshot("2", { records: newer.records })
    ;(await fixture.next()).respond(latest)
    await bounded(operations[4]!)
    staleFailure.fail(new Error("superseded inventory"))
    await bounded(Promise.allSettled(operations))
    expect(fixture.controller.state.snapshot).toEqual(latest)
    expect(fixture.controller.state.receivedAt).toBe(300)
    expect(fixture.controller.state.inventory).toEqual({ busy: false, failed: false })
    expect(fixture.reports).toHaveLength(0)
  } finally {
    fixture.dispose()
    await bounded(Promise.allSettled(operations))
  }
})

test("W09 concurrent full snapshots retain cumulative rows and compare decimal revisions exactly", async () => {
  const fixture = setup()
  const operations: Promise<void>[] = []
  try {
    operations.push(fixture.controller.refresh())
    ;(await fixture.next()).respond(snapshot())
    await bounded(operations[0]!)
    operations.push(fixture.controller.read("a"), fixture.controller.read("b"))
    const a = await fixture.next()
    const b = await fixture.next()
    const both = snapshot("2", {
      records: [
        row("a", { logical: { bytes: 1, sampledAt: 1001 } }),
        row("b", { logical: { bytes: 2, sampledAt: 1002 } }),
      ],
    })
    fixture.clock.now = 200
    b.respond(both)
    await bounded(operations[2]!)
    fixture.clock.now = 300
    a.respond(snapshot("1", { records: [both.records[0]!, row("b")] }))
    await bounded(operations[1]!)
    expect(fixture.controller.state.snapshot).toEqual(both)
    expect(fixture.controller.state.receivedAt).toBe(200)
    for (const revision of ["2", "9", "10", "9007199254740992", "9007199254740993"]) {
      operations.push(fixture.controller.refresh())
      fixture.clock.now += 100
      const incoming = snapshot(revision, { records: revision === "2" ? [] : both.records })
      ;(await fixture.next()).respond(incoming)
      await bounded(operations.at(-1)!)
      expect(fixture.controller.state.snapshot).toEqual(revision === "2" ? both : incoming)
      expect(fixture.controller.state.receivedAt).toBe(revision === "2" ? 200 : fixture.clock.now)
    }
    const accepted = structuredClone(unwrap(fixture.controller.state.snapshot))
    const receivedAt = fixture.controller.state.receivedAt
    operations.push(fixture.controller.refresh())
    fixture.clock.now += 100
    ;(await fixture.next()).respond(snapshot("9007199254740992", { records: [] }))
    await bounded(operations.at(-1)!)
    expect(fixture.controller.state.snapshot).toEqual(accepted)
    expect(fixture.controller.state.receivedAt).toBe(receivedAt)
  } finally {
    fixture.dispose()
    await bounded(Promise.allSettled(operations))
  }
})

test("W09 lifetime mismatch hides retired data, aborts old requests, and establishes only one fresh handshake", async () => {
  const fixture = setup()
  const operations: Promise<void>[] = []
  try {
    operations.push(fixture.controller.refresh())
    ;(await fixture.next()).respond(
      snapshot("1", {
        records: [
          row("a", {
            logical: { bytes: 10, sampledAt: 1000 },
            attempt: {
              startedAt: 990,
              sampledAt: 1000,
              state: "complete",
              observedBytes: 10,
              entries: 2,
              issueCount: 0,
              issues: [],
            },
          }),
          row("b"),
          row("c"),
          row("d"),
        ],
      }),
    )
    await bounded(operations[0]!)
    expect(fixture.controller.state.snapshot?.records[0]?.attempt).toBeDefined()
    operations.push(fixture.controller.read("d"))
    const previousError = new Error("row d unavailable")
    ;(await fixture.next()).fail(previousError)
    await bounded(Promise.allSettled([operations[1]!]))
    expect(fixture.controller.state.reads.d?.failed).toBe(true)
    expect(fixture.reports).toHaveLength(1)
    expect(fixture.reports[0]).toBeInstanceOf(ClientError)
    expect(fixture.reports[0]).toMatchObject({ reason: "Transport" })
    expect(fixture.reports[0] instanceof ClientError ? fixture.reports[0].cause : undefined).toBe(previousError)
    operations.push(
      fixture.controller.refresh(),
      fixture.controller.read("a"),
      fixture.controller.read("b"),
      fixture.controller.read("c"),
    )
    const oldInventory = await fixture.next()
    const mismatch = await fixture.next()
    const oldSuccess = await fixture.next()
    const oldError = await fixture.next()
    mismatch.respond(snapshot("90", { instanceID: "server-second", records: [] }))
    const handshake = await fixture.next()
    operations.push(fixture.controller.refresh())
    expect(handshake.method).toBe("GET")
    expect(handshake.url.pathname).toBe("/api/activity/worktrees")
    expect(fixture.controller.state.snapshot).toBeUndefined()
    expect(fixture.controller.state.receivedAt).toBeUndefined()
    expect(fixture.controller.state.inventory).toEqual({ busy: true, failed: false })
    expect(Object.values(fixture.controller.state.reads).every((status) => !status.busy && !status.failed)).toBe(true)
    expect(fixture.controller.state.reads.d?.failed ?? false).toBe(false)
    expect([oldInventory, mismatch, oldSuccess, oldError].every((call) => call.signal?.aborted)).toBe(true)
    await bounded(fixture.controller.read("a"))
    expect(fixture.calls).toHaveLength(7)
    const replacement = snapshot("0", { instanceID: "server-second" })
    fixture.clock.now = 250
    handshake.respond(replacement)
    await bounded(operations.at(-1)!)
    expect(fixture.controller.state.snapshot).toEqual(replacement)
    expect(fixture.controller.state.snapshot?.records[0]).toBeDefined()
    expect(fixture.controller.state.snapshot?.records[0]?.logical).toBeUndefined()
    expect(fixture.controller.state.snapshot?.records[0]?.attempt).toBeUndefined()
    expect(Object.hasOwn(fixture.controller.state.snapshot!.records[0]!, "attempt")).toBe(false)
    expect(Object.hasOwn(fixture.controller.state.snapshot!.records[0]!, "logical")).toBe(false)
    expect(Object.values(fixture.controller.state.reads).every((status) => !status.busy && !status.failed)).toBe(true)
    expect(fixture.controller.state.reads.d?.failed ?? false).toBe(false)
    const established = structuredClone(unwrap(fixture.controller.state))
    oldInventory.respond(snapshot("999", { instanceID: "server-third" }))
    oldSuccess.respond(snapshot("999"))
    oldError.fail(new Error("retired failure"))
    await bounded(Promise.allSettled(operations))
    expect(fixture.controller.state).toEqual(established)
    expect(fixture.reports).toHaveLength(1)
    expect(fixture.reports[0] instanceof ClientError ? fixture.reports[0].cause : undefined).toBe(previousError)
    expect(fixture.calls).toHaveLength(7)
  } finally {
    fixture.dispose()
    await bounded(Promise.allSettled(operations))
  }
})

test("W09 failed replacement handshake remains explicit and a deliberate refresh retries", async () => {
  const fixture = setup()
  const operations: Promise<void>[] = []
  try {
    operations.push(fixture.controller.refresh())
    ;(await fixture.next()).respond(snapshot())
    await bounded(operations[0]!)
    operations.push(fixture.controller.read("a"))
    ;(await fixture.next()).respond(snapshot("1", { instanceID: "server-second" }))
    const handshake = await fixture.next()
    operations.push(fixture.controller.refresh())
    const error = new Error("replacement unavailable")
    handshake.fail(error)
    await bounded(Promise.allSettled(operations))
    expect(fixture.controller.state.snapshot).toBeUndefined()
    expect(fixture.controller.state.inventory).toEqual({ busy: false, failed: true })
    expect(fixture.reports).toHaveLength(1)
    expect(fixture.reports[0]).toBeInstanceOf(ClientError)
    expect(fixture.reports[0]).toMatchObject({ reason: "Transport" })
    expect(fixture.reports[0] instanceof ClientError ? fixture.reports[0].cause : undefined).toBe(error)
    expect(fixture.calls).toHaveLength(3)
    operations.push(fixture.controller.refresh())
    const retry = await fixture.next()
    expect(retry.method).toBe("GET")
    retry.respond(snapshot("0", { instanceID: "server-second" }))
    await bounded(operations.at(-1)!)
    expect(fixture.controller.state.snapshot?.instanceID).toBe("server-second")
    expect(fixture.controller.state.inventory).toEqual({ busy: false, failed: false })
    expect(fixture.reports).toHaveLength(1)
    expect(fixture.reports[0] instanceof ClientError ? fixture.reports[0].cause : undefined).toBe(error)
  } finally {
    fixture.dispose()
    await bounded(Promise.allSettled(operations))
  }
})

test("W09 disposal aborts pending GET and POST and ignores transport outcomes that disregard abort", async () => {
  const fixture = setup()
  const operations: Promise<void>[] = []
  try {
    operations.push(fixture.controller.refresh())
    ;(await fixture.next()).respond(snapshot())
    await bounded(operations[0]!)
    operations.push(fixture.controller.refresh(), fixture.controller.read("a"))
    const inventory = await fixture.next()
    const read = await fixture.next()
    fixture.controller.dispose()
    const retired = structuredClone(unwrap(fixture.controller.state))
    expect(inventory.signal?.aborted).toBe(true)
    expect(read.signal?.aborted).toBe(true)
    inventory.respond(snapshot("99", { instanceID: "server-second" }))
    read.fail(new Error("disposed failure"))
    await bounded(Promise.allSettled(operations))
    expect(fixture.controller.state).toEqual(retired)
    expect(fixture.reports).toHaveLength(0)
    expect(fixture.calls).toHaveLength(3)
  } finally {
    fixture.dispose()
    await bounded(Promise.allSettled(operations))
  }
})

test("W12 row failures stay per target, retries coalesce, and current failures retain facts and timestamps", async () => {
  const fixture = setup()
  const operations: Promise<void>[] = []
  try {
    const initial = snapshot("1", { records: [row("a", { logical: { bytes: 9, sampledAt: 900 } }), row("b")] })
    operations.push(fixture.controller.refresh())
    ;(await fixture.next()).respond(initial)
    await bounded(operations[0]!)
    operations.push(fixture.controller.read("a"), fixture.controller.read("b"))
    const a = await fixture.next()
    const b = await fixture.next()
    const error = new Error("row a unavailable")
    fixture.clock.now = 200
    a.fail(error)
    await bounded(Promise.allSettled([operations[1]!]))
    expect(fixture.controller.state.reads.a).toEqual({ busy: false, failed: true })
    expect(fixture.controller.state.snapshot).toEqual(initial)
    expect(fixture.controller.state.receivedAt).toBe(100)
    expect(fixture.reports).toHaveLength(1)
    expect(fixture.reports[0]).toBeInstanceOf(ClientError)
    expect(fixture.reports[0]).toMatchObject({ reason: "Transport" })
    expect(fixture.reports[0] instanceof ClientError ? fixture.reports[0].cause : undefined).toBe(error)
    const latest = snapshot("2", {
      records: [initial.records[0]!, row("b", { logical: { bytes: 2, sampledAt: 1001 } })],
    })
    b.respond(latest)
    await bounded(operations[2]!)
    expect(fixture.controller.state.reads.a).toEqual({ busy: false, failed: true })
    expect(fixture.controller.state.reads.b).toEqual({ busy: false, failed: false })
    operations.push(fixture.controller.read("b"))
    const otherError = new Error("row b unavailable")
    ;(await fixture.next()).fail(otherError)
    await bounded(Promise.allSettled([operations[3]!]))
    operations.push(fixture.controller.read("a"), fixture.controller.read("a"))
    const retry = await fixture.next()
    expect(fixture.calls).toHaveLength(5)
    expect(fixture.controller.state.reads.a).toEqual({ busy: true, failed: false })
    expect(fixture.controller.state.reads.b).toEqual({ busy: false, failed: true })
    retry.respond(snapshot("3", { records: latest.records }))
    await bounded(Promise.all(operations.slice(4)))
    expect(fixture.controller.state.reads.a).toEqual({ busy: false, failed: false })
    expect(fixture.controller.state.reads.b).toEqual({ busy: false, failed: true })
    const retained = structuredClone(unwrap(fixture.controller.state.snapshot))
    const receivedAt = fixture.controller.state.receivedAt
    operations.push(fixture.controller.refresh())
    const inventoryError = new Error("inventory unavailable")
    fixture.clock.now = 500
    ;(await fixture.next()).fail(inventoryError)
    await bounded(Promise.allSettled([operations.at(-1)!]))
    expect(fixture.controller.state.inventory).toEqual({ busy: false, failed: true })
    expect(fixture.controller.state.snapshot).toEqual(retained)
    expect(fixture.controller.state.receivedAt).toBe(receivedAt)
    expect(fixture.reports).toHaveLength(3)
    fixture.reports.forEach((report, index) => {
      expect(report).toBeInstanceOf(ClientError)
      expect(report).toMatchObject({ reason: "Transport" })
      expect(report instanceof ClientError ? report.cause : undefined).toBe([error, otherError, inventoryError][index])
    })
  } finally {
    fixture.dispose()
    await bounded(Promise.allSettled(operations))
  }
})
