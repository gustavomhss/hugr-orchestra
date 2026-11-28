import { expect, test } from "bun:test"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { ActivityQuarantineNative } from "../src/activity-quarantine-native"
import { Omni } from "../src/omni"
import { tmpdir } from "./fixture/tmpdir"

test.skipIf(process.platform !== "win32")("empty preflights the full registered set and verifies native disposal", async () => {
  await using directory = await tmpdir()
  const native = await Omni.quarantine()
  expect(native?.quarantineDispose).toBeDefined()
  const first = path.join(directory.path, "file")
  const second = path.join(directory.path, "directory")
  await writeFile(first, "fixture")
  await mkdir(second)
  const registered = [
    { id: "fixture-one", quarantinePath: first, disposable: "file" as const },
    { id: "fixture-two", quarantinePath: second, disposable: "empty-directory" as const },
  ]
  const targets = await Promise.all(registered.map(async (entry) => ({
    id: entry.id, generation: "1", identity: (await native!.quarantineInspect(entry.quarantinePath))!,
  })))
  const rows = targets.map((target) => ({ id: target.id, kind: "quarantine" as const, state: "ready" as const }))
  const held = new Set<string>()
  const acquire: ActivityQuarantineNative.Acquire = async (target, transition) => {
    expect(transition).toBe("empty")
    const entry = registered.find((item) => item.id === target.id)
    if (!entry || target.generation !== "1") return
    held.add(entry.id)
    return { ...entry, originalPath: path.join(directory.path, entry.id + "-original"), state: "verified",
      release: async () => { held.delete(entry.id) } }
  }
  expect(await ActivityQuarantineNative.executeEmpty(acquire, [targets[0]], rows)).toBe("Refused")
  expect(await ActivityQuarantineNative.executeEmpty(
    (target, transition) => target.id === "fixture-two" ? Promise.resolve(undefined) : acquire(target, transition), targets, rows,
  )).toBe("Refused")
  expect(held.size).toBe(0)
  expect(await native!.quarantineInspect(first)).toBe(targets[0].identity)
  expect(await native!.quarantineInspect(second)).toBe(targets[1].identity)
  expect(await ActivityQuarantineNative.executeEmpty(acquire, targets, rows)).toBe("Verified")
  expect(held.size).toBe(0)
  expect(await native!.quarantineInspect(first)).toBeNull()
  expect(await native!.quarantineInspect(second)).toBeNull()
})
