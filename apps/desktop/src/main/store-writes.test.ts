import { expect, test } from "bun:test"
import { createStoreWriteBuffer } from "./store-writes"

function recordingStores() {
  const files = new Map<string, Record<string, string>>()
  const writes: string[] = []
  const open = (name: string) => ({
    set(entries: Record<string, string>) {
      writes.push(name)
      files.set(name, { ...files.get(name), ...entries })
    },
  })
  return { files, writes, open }
}

test("desktop store writes: many quick sets become one write and the final value persists", async () => {
  const stores = recordingStores()
  const buffer = createStoreWriteBuffer(stores.open, 10)
  for (let i = 0; i < 200; i++) buffer.set("a.dat", "key", `value-${i}`)
  buffer.set("a.dat", "other", "x")
  expect(stores.writes).toEqual([])
  await Bun.sleep(60)
  expect(stores.writes).toEqual(["a.dat"])
  expect(stores.files.get("a.dat")).toEqual({ key: "value-199", other: "x" })
})

test("desktop store writes: flush applies a store immediately and a quit flush keeps the last write", async () => {
  const stores = recordingStores()
  const buffer = createStoreWriteBuffer(stores.open, 10_000)
  buffer.set("a.dat", "k", "1")
  buffer.set("b.dat", "k", "2")
  buffer.flush("a.dat")
  expect(stores.files.get("a.dat")).toEqual({ k: "1" })
  expect(stores.files.has("b.dat")).toBe(false)
  buffer.set("b.dat", "k", "last")
  buffer.flush()
  expect(stores.files.get("b.dat")).toEqual({ k: "last" })
  // Nothing is left to write once everything is flushed.
  buffer.flush()
  expect(stores.writes).toEqual(["a.dat", "b.dat"])
  await Bun.sleep(20)
  expect(stores.writes).toEqual(["a.dat", "b.dat"])
})

test("desktop store writes: a key named __proto__ stays a plain entry", () => {
  const stores = recordingStores()
  const buffer = createStoreWriteBuffer(stores.open, 10_000)
  buffer.set("a.dat", "__proto__", "v")
  buffer.flush()
  expect(Object.keys(stores.files.get("a.dat") ?? {})).toEqual(["__proto__"])
})
