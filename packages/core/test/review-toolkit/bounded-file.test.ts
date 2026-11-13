import { expect, test } from "bun:test"
import { Effect } from "effect"
import { constants } from "node:fs"
import { stat, utimes, writeFile } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "../fixture/tmpdir"
import { ReviewBoundedFile } from "../../src/review-toolkit/bounded-file"

test.skipIf(process.platform !== "linux")("the bounded descriptor boundary refuses a real device before reading bytes", async () => {
  const result = await Effect.runPromise(ReviewBoundedFile.read("/dev", "null", 4096, () => Effect.die("device reached open boundary")))
  expect(result).toEqual({ ok: false, reason: "not-file" })
})

test.skipIf(!constants.O_NOFOLLOW || !constants.O_NONBLOCK)("bounded capture preserves exact-limit bytes and refuses excess or in-place replacement", async () => {
  await using dir = await tmpdir()
  const file = path.join(dir.path, "input")
  await writeFile(file, "safe")
  const read = (before: (file: string) => Effect.Effect<void> = () => Effect.void) =>
    Effect.runPromise(ReviewBoundedFile.read(dir.path, "input", 4, before))
  const captured = await read()
  expect(captured.ok).toBe(true)
  if (captured.ok) expect(Buffer.from(captured.bytes).toString()).toBe("safe")
  await writeFile(file, "large")
  expect(await read()).toEqual({ ok: false, reason: "too-large" })
  await writeFile(file, "safe")
  const info = await stat(file)
  expect(await read((opened) => Effect.promise(async () => {
    await writeFile(opened, "evil")
    await utimes(opened, info.atime, info.mtime)
  }))).toEqual({ ok: false, reason: "changed" })
})
