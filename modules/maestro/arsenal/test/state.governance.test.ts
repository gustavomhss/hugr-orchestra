import { expect, test } from "bun:test"
import { mkdir, symlink } from "node:fs/promises"
import { join } from "node:path"
import { readState, scopedPath, updateState, STATE_BYTES } from "../src/governance/state.ts"
import { fixture } from "./fixtures.governance.ts"
import { rethrow } from "./rejection.ts"
test("state serializes concurrent writes without lost updates", async () => {
  const f = await fixture()
  await Promise.all(Array.from({ length: 20 }, () => updateState(f.context, "count", "wave", (current) => (typeof current === "number" ? current : 0) + 1)))
  expect(await readState(f.context, "count", "wave")).toBe(20)
})
test("state rejects missing, malformed, oversized and directory acquisitions by name", async () => {
  const f = await fixture()
  expect(await rethrow(readState(f.context, "count", "missing"))).toThrow("STATE_READ_FAILED: ENOENT")
  await updateState(f.context, "count", "wave", () => 1)
  const file = join(f.state, "project", "count", "wave.json")
  await Bun.write(file, "bad json")
  expect(await rethrow(readState(f.context, "count", "wave"))).toThrow("STATE_JSON_INVALID")
  await Bun.write(file, " ".repeat(STATE_BYTES + 1))
  expect(await rethrow(readState(f.context, "count", "wave"))).toThrow("STATE_OVERFLOW")
  await mkdir(join(f.state, "project", "count", "directory.json"))
  expect(await rethrow(readState(f.context, "count", "directory"))).toThrow("STATE_NOT_REGULAR")
})
test("state canonical IDs and physical symlink boundary reject escape", async () => {
  const f = await fixture()
  expect(await rethrow(updateState({ ...f.context, projectID: "../escape" }, "count", "wave", () => 1))).toThrow("INVALID_ID")
  expect(await rethrow(updateState(f.context, "count", "../escape", () => 1))).toThrow("INVALID_ID")
  await symlink(f.root, join(f.state, "project"))
  expect(await rethrow(updateState(f.context, "count", "wave", () => 1))).toThrow("PATH_SYMLINK_DENIED")
  expect(await Bun.file(join(f.root, "count", "wave.json")).exists()).toBe(false)
})
test("state denies repo-local storage and busy locks instead of reporting empty success", async () => {
  const f = await fixture()
  expect(await rethrow(updateState({ ...f.context, stateDirectory: f.root }, "count", "wave", () => 1))).toThrow("STATE_ROOT_INSIDE_REPOSITORY")
  await updateState(f.context, "count", "wave", () => 1)
  await Bun.write(join(f.state, "project", "count", "wave.json.lock"), "busy")
  expect(await rethrow(updateState(f.context, "count", "wave", () => 2))).toThrow("STATE_LOCK_FAILED: EEXIST")
  expect(await readState(f.context, "count", "wave")).toBe(1)
})
test("state rechecks physical boundary after async authorization", async () => {
  const f = await fixture()
  const context = { ...f.context, async authorize(request: Parameters<typeof f.context.authorize>[0]) {
    if (request.effect === "write") await symlink(f.root, join(f.state, "project"))
  } }
  expect(await rethrow(updateState(context, "count", "wave", () => 1))).toThrow("PATH_SYMLINK_DENIED")
  expect(await Bun.file(join(f.root, "count", "wave.json")).exists()).toBe(false)
})
test("state root above the repository is refused because project state could land inside it", async () => {
  const f = await fixture()
  const repo = join(f.directory, "project", "count")
  await mkdir(repo, { recursive: true })
  expect(await rethrow(updateState({ ...f.context, directory: repo, stateDirectory: f.directory }, "count", "wave", () => 1))).toThrow("STATE_ROOT_INSIDE_REPOSITORY")
  expect(await Bun.file(join(repo, "wave.json")).exists()).toBe(false)
})
// Only Windows reads these as parents, other drives and UNC roots; POSIX reads the same strings as file names.
test.if(process.platform === "win32")("Windows scoped paths refuse backslash parents, other drives and UNC roots", async () => {
  const f = await fixture()
  const drive = f.root.toUpperCase().startsWith("C:") ? "D:" : "C:"
  await Promise.all(["..\\outside", `${drive}\\outside`, "\\\\server\\share\\outside"].map(async (path) => expect(await rethrow(scopedPath(f.root, path))).toThrow("PATH_ESCAPE")))
})
test.if(process.platform !== "win32")("POSIX scoped paths keep a backslash as a file name character", async () => {
  const f = await fixture()
  expect(await scopedPath(f.root, "..\\outside")).toBe(join(f.root, "..\\outside"))
})
