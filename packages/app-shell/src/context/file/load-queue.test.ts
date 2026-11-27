import { expect, test } from "bun:test"
import { createFileLoadQueue } from "./load-queue"
import { readFileContent } from "./read"

test("content invalidation during a read publishes the replacement bytes before force settles", async () => {
  const first = Promise.withResolvers<Uint8Array>()
  const state = { reads: 0, content: "" }
  const sdk = {
    directory: "/repo",
    api: { file: { read: async () => (++state.reads === 1 ? first.promise : new TextEncoder().encode("B")) } },
  } as unknown as Parameters<typeof readFileContent>[0]
  const queue = createFileLoadQueue()
  const read = async () => {
    state.content = (await readFileContent(sdk, "a.txt"))!.content
  }
  const initial = queue.run("/repo\na.txt", false, read)
  const forced = queue.run("/repo\na.txt", true, read)
  first.resolve(new TextEncoder().encode("A"))
  await Promise.all([initial, forced])
  expect(state).toEqual({ reads: 2, content: "B" })
})

test("reset detaches old invalidation and cannot remove a new scope request", async () => {
  const old = Promise.withResolvers<void>()
  const next = Promise.withResolvers<void>()
  const queue = createFileLoadQueue()
  const calls: string[] = []
  const initial = queue.run("a", false, async () => {
    calls.push("old")
    await old.promise
  })
  void queue.run("a", true, async () => {
    calls.push("stale")
  })
  queue.clear()
  const current = queue.run("a", false, async () => {
    calls.push("new")
    await next.promise
  })
  old.resolve()
  await initial
  const forced = queue.run("a", true, async () => {
    calls.push("fresh")
  })
  next.resolve()
  await Promise.all([current, forced])
  expect(calls).toEqual(["old", "new", "fresh"])
})


test("force at the completion microtask still performs another read", async () => {
  const queue = createFileLoadQueue()
  const calls: string[] = []
  const first = queue.run("a", false, async () => { calls.push("A") })
  await Promise.resolve()
  const forced = queue.run("a", true, async () => { calls.push("B") })
  await Promise.all([first, forced])
  expect(calls).toEqual(["A", "B"])
})
