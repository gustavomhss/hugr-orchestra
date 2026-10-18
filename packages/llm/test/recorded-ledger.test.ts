import { expect, test } from "bun:test"
import { existsSync, readdirSync } from "node:fs"
import path from "node:path"
import { unrecorded } from "./recorded-utils"

const recordings = path.resolve(import.meta.dir, "fixtures", "recordings")

// recorded-runner fails a replayed case with no cassette unless the ledger names it, and fails a ledgered case that
// has one. This checks the ledger itself from the fixture tree, so a stale entry fails even when its case is filtered.
test("the unrecorded ledger names only cassettes that do not exist, each with a reason", () => {
  // The reading engages the real tree: the directory holds cassettes, and a known one is seen.
  const prefixes = readdirSync(recordings)
  expect(prefixes.length).toBeGreaterThan(5)
  expect(existsSync(path.join(recordings, "gemini", "gemini-2-5-flash-image.json"))).toBe(true)
  const entries = Object.entries(unrecorded)
  expect(entries.length).toBeGreaterThan(0)
  expect(entries.filter(([cassette]) => existsSync(path.join(recordings, `${cassette}.json`))).map(([cassette]) => cassette))
    .toEqual([])
  expect(entries.filter(([, reason]) => !reason.trim()).map(([cassette]) => cassette)).toEqual([])
})
