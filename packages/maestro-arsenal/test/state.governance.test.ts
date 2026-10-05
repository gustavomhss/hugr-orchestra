import { expect, test } from "bun:test"
import { mkdir, symlink } from "node:fs/promises"
import { join } from "node:path"
import { readState, updateState, STATE_BYTES } from "../src/governance/state.ts"
import { fixture } from "./fixtures.governance.ts"
test("state serializes concurrent writes without lost updates", async () => {
  const f = await fixture()
  await Promise.all(Array.from({ length: 20 }, () => updateState(f.context, "count", "wave", (current) => (typeof current === "number" ? current : 0) + 1)))
  expect(await readState(f.context, "count", "wave")).toBe(20)
})
test("state rejects missing, malformed, oversized and directory acquisitions by name", async () => {
  const f = await fixture()
  await expect(readState(f.context, "count", "missing")).rejects.toThrow("STATE_READ_FAILED: ENOENT")
  await updateState(f.context, "count", "wave", () => 1)
  const file = join(f.state, "project", "count", "wave.json")
  await Bun.write(file, "bad json")
  await expect(readState(f.context, "count", "wave")).rejects.toThrow("STATE_JSON_INVALID")
  await Bun.write(file, " ".repeat(STATE_BYTES + 1))
  await expect(readState(f.context, "count", "wave")).rejects.toThrow("STATE_OVERFLOW")
  await mkdir(join(f.state, "project", "count", "directory.json"))
  await expect(readState(f.context, "count", "directory")).rejects.toThrow("STATE_NOT_REGULAR")
})
test("state canonical IDs and physical symlink boundary reject escape", async () => {
  const f = await fixture()
  await expect(updateState({ ...f.context, projectID: "../escape" }, "count", "wave", () => 1)).rejects.toThrow("INVALID_ID")
  await expect(updateState(f.context, "count", "../escape", () => 1)).rejects.toThrow("INVALID_ID")
  await symlink(f.root, join(f.state, "project"))
  await expect(updateState(f.context, "count", "wave", () => 1)).rejects.toThrow("PATH_SYMLINK_DENIED")
  expect(await Bun.file(join(f.root, "count", "wave.json")).exists()).toBe(false)
})
test("state denies repo-local storage and busy locks instead of reporting empty success", async () => {
  const f = await fixture()
  await expect(updateState({ ...f.context, stateDirectory: f.root }, "count", "wave", () => 1)).rejects.toThrow("STATE_ROOT_INSIDE_REPOSITORY")
  await updateState(f.context, "count", "wave", () => 1)
  await Bun.write(join(f.state, "project", "count", "wave.json.lock"), "busy")
  await expect(updateState(f.context, "count", "wave", () => 2)).rejects.toThrow("STATE_LOCK_FAILED: EEXIST")
  expect(await readState(f.context, "count", "wave")).toBe(1)
})
test("state rechecks physical boundary after async authorization", async () => {
  const f = await fixture()
  const context = { ...f.context, async authorize(request: Parameters<typeof f.context.authorize>[0]) {
    if (request.effect === "write") await symlink(f.root, join(f.state, "project"))
  } }
  await expect(updateState(context, "count", "wave", () => 1)).rejects.toThrow("PATH_SYMLINK_DENIED")
  expect(await Bun.file(join(f.root, "count", "wave.json")).exists()).toBe(false)
})
