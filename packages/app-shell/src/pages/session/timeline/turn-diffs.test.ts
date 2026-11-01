import { describe, expect, test } from "bun:test"
import type { SnapshotFileDiff } from "@/v2-wire"

import { createTurnDiffs, turnDiffsOf } from "./turn-diffs"

const diff = (file: string) => ({ file, patch: "", additions: 1, deletions: 0, status: "modified" }) as SnapshotFileDiff
const turns = (...ids: string[]) => ids.map((id) => ({ id }))
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

function recorder() {
  const calls: string[] = []
  return {
    calls,
    read: async (sessionID: string, messageID: string) => {
      calls.push(`${sessionID}/${messageID}`)
      return [diff(messageID)]
    },
  }
}

describe("turn diffs", () => {
  test("a second timeline for the same session does not ask for finished turns again", async () => {
    const reads = recorder()
    const cache = createTurnDiffs(reads.read)

    cache.sync({ sessionID: "ses_a", users: turns("m1", "m2"), running: false })
    await settle()
    // The timeline was unmounted and mounts again with the same history.
    cache.sync({ sessionID: "ses_a", users: turns("m1", "m2"), running: false })
    await settle()

    expect(reads.calls).toEqual(["ses_a/m1", "ses_a/m2"])
    expect(cache.files("m2")?.[0]?.file).toBe("m2")
  })

  test("fetches only the turns added while the timeline was gone", async () => {
    const reads = recorder()
    const cache = createTurnDiffs(reads.read)

    cache.sync({ sessionID: "ses_a", users: turns("m1"), running: false })
    await settle()
    cache.sync({ sessionID: "ses_a", users: turns("m1", "m2"), running: false })
    await settle()

    expect(reads.calls).toEqual(["ses_a/m1", "ses_a/m2"])
  })

  test("the last turn is fetched again once the session goes idle", async () => {
    const reads = recorder()
    const cache = createTurnDiffs(reads.read)

    cache.sync({ sessionID: "ses_a", users: turns("m1", "m2"), running: false })
    await settle()
    cache.sync({ sessionID: "ses_a", users: turns("m1", "m2"), running: true })
    await settle()
    cache.sync({ sessionID: "ses_a", users: turns("m1", "m2"), running: false })
    await settle()

    expect(reads.calls).toEqual(["ses_a/m1", "ses_a/m2", "ses_a/m2"])
  })

  test("a failed read is tried again on the next sync", async () => {
    let attempts = 0
    const cache = createTurnDiffs(async () => {
      attempts += 1
      if (attempts === 1) throw new Error("offline")
      return [diff("a")]
    })

    cache.sync({ sessionID: "ses_a", users: turns("m1"), running: false })
    await settle()
    cache.sync({ sessionID: "ses_a", users: turns("m1"), running: false })
    await settle()

    expect(attempts).toBe(2)
    expect(cache.files("m1")?.length).toBe(1)
  })

  test("keeps recent sessions and drops the oldest", async () => {
    const reads = recorder()
    const cache = createTurnDiffs(reads.read)
    const ids = Array.from({ length: 9 }, (_, index) => `ses_${index}`)

    for (const id of ids) {
      cache.sync({ sessionID: id, users: turns(`${id}_m`), running: false })
      await settle()
    }

    expect(cache.files("ses_0_m")).toBeUndefined()
    expect(cache.files("ses_8_m")).toBeDefined()
    cache.sync({ sessionID: "ses_0", users: turns("ses_0_m"), running: false })
    await settle()
    expect(reads.calls.filter((call) => call === "ses_0/ses_0_m")).toHaveLength(2)
  })

  test("one cache per server owner", () => {
    const reads = recorder()
    const first = {}
    const second = {}

    expect(turnDiffsOf(first, reads.read)).toBe(turnDiffsOf(first, reads.read))
    expect(turnDiffsOf(second, reads.read)).not.toBe(turnDiffsOf(first, reads.read))
  })
})
