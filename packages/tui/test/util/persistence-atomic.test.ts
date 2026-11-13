import { expect, test } from "bun:test"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { writeJsonAtomic } from "../../src/util/persistence"

const scenarios = [
  { name: "CONTROL atomic persistence: serial writers without reader", concurrent: false, reader: false },
  { name: "CONTROL atomic persistence: concurrent writers without reader", concurrent: true, reader: false },
  { name: "DIAGNOSTIC atomic persistence: serial writers with reader", concurrent: false, reader: true },
  { name: "DIAGNOSTIC atomic persistence: concurrent writers with reader", concurrent: true, reader: true },
]

test.each(scenarios)("$name", async (scenario) => {
  const directory = await mkdtemp(path.join(tmpdir(), "orchestra-atomic-preference-"))
  const primary = await Promise.allSettled([exercise(directory, scenario)])
  const cleanup = await Promise.allSettled([rm(directory, { recursive: true, force: true })])
  const failures = [...primary, ...cleanup].flatMap((result) => result.status === "rejected" ? [result.reason] : [])
  if (failures.length > 0) throw new AggregateError(failures, scenario.name)
})

async function exercise(directory: string, scenario: typeof scenarios[number]) {
  const file = path.join(directory, "state.json")
  const records = Array.from({ length: 32 }, (_, id) => record(id))
  const seed = record(-1)
  const sentinel = record(32)
  const known = [seed, ...records]
  const observed: unknown[] = []
  await writeJsonAtomic(file, seed)
  // This real read is the barrier before either writer batch starts.
  if (scenario.reader) observed.push(await Bun.file(file).json())

  const state = { stop: false }
  const batch = (async () => {
    if (scenario.concurrent) return Promise.allSettled(records.map((value) => writeJsonAtomic(file, value)))
    const outcomes: PromiseSettledResult<void>[] = []
    for (const value of records) outcomes.push(...await Promise.allSettled([writeJsonAtomic(file, value)]))
    return outcomes
  })()
  // Starting the batch first leaves real writes pending when the continuous reader starts.
  const readers = Promise.allSettled(scenario.reader ? [(async () => {
    for (let count = 1; count < 4096 && !state.stop; count++) observed.push(await Bun.file(file).json())
  })()] : [])
  const batches = await Promise.allSettled([batch]).finally(async () => {
    state.stop = true
    await readers
  })
  const readerOutcomes = await readers
  const batchOutcome = batches[0]
  if (!batchOutcome) throw new Error("Expected the owned writer batch outcome")
  const writers = batchOutcome.status === "fulfilled" ? batchOutcome.value : []

  // Only this write, after all activity has joined, defines the required final order.
  const sentinels = await Promise.allSettled([writeJsonAtomic(file, sentinel)])
  const final = await Promise.allSettled([Bun.file(file).json()])
  const siblings = await Promise.allSettled([readdir(directory)])
  const failures = [...batches, ...writers, ...readerOutcomes, ...sentinels, ...final, ...siblings]
    .flatMap((result) => result.status === "rejected" ? [result.reason] : [])
  if (failures.length > 0) throw new AggregateError(failures, "Actual atomic writer/reader failures")

  expect(writers).toHaveLength(32)
  expect(writers.every((result) => result.status === "fulfilled")).toBe(true)
  if (!scenario.reader) expect(observed).toEqual([])
  if (scenario.reader) {
    expect(observed.length).toBeGreaterThanOrEqual(2)
    expect(observed.length).toBeLessThanOrEqual(4096)
  }
  observed.forEach((value) => {
    expect(typeof value).toBe("object")
    if (typeof value !== "object" || value === null || !("id" in value)) {
      throw new Error("Actual Bun JSON read did not return a complete known record")
    }
    const expected = known.find((candidate) => candidate.id === value.id)
    expect(expected).toBeDefined()
    if (!expected) throw new Error("Actual JSON read returned an unknown record id")
    expect(value).toEqual(expected)
  })
  const last = final[0]
  expect(last?.status).toBe("fulfilled")
  if (!last || last.status === "rejected") throw new Error("Expected the actual final JSON read")
  expect(last.value).toEqual(sentinel)
  const entries = siblings[0]
  expect(entries?.status).toBe("fulfilled")
  if (!entries || entries.status === "rejected") throw new Error("Expected the actual directory listing")
  expect(entries.value).toEqual(["state.json"])
}

function record(id: number) {
  return { id, body: id.toString().padStart(4, "0").repeat(8192) }
}
