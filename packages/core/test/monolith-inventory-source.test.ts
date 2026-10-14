import { expect, test } from "bun:test"
import path from "node:path"
import { rm } from "node:fs/promises"
import { monolithInventory } from "../../../script/monolith-inventory"
import { inventoryFixture } from "./fixture/monolith-inventory"

test("registry absence permits legacy capture but a directory never does in either source mode", async () => {
  await using fixture = await inventoryFixture()
  const git = (args: string[]) => {
    const result = Bun.spawnSync(["git", ...args], { cwd: fixture.path })
    expect(result.exitCode).toBe(0)
    return result.stdout.toString().trim()
  }
  const legacy = await monolithInventory(fixture.path)
  expect(legacy.modules.length).toBeGreaterThan(0)
  git(["init", "--quiet"])
  git(["add", "--", "package.json", "bun.lock", "packages", "foundation", "patches"])
  git(["-c", "user.name=baseline-fixture", "-c", "user.email=baseline@example.invalid", "commit", "--quiet", "-m", "legacy fixture"])
  expect((await monolithInventory(fixture.path, "HEAD")).modules).toEqual(legacy.modules)
  await Bun.write(path.join(fixture.path, "script/toolchain-registry.json/ignored.txt"), "not a registry\n")
  git(["add", "--", "script/toolchain-registry.json/ignored.txt"])
  git(["-c", "user.name=baseline-fixture", "-c", "user.email=baseline@example.invalid", "commit", "--quiet", "-m", "invalid registry directory"])
  await expect(monolithInventory(fixture.path)).rejects.toThrow("BASELINE_INVALID_INPUT_TYPE:script/toolchain-registry.json")
  await rm(path.join(fixture.path, "script/toolchain-registry.json"), { recursive: true })
  await expect(monolithInventory(fixture.path, "HEAD")).rejects.toThrow("BASELINE_INVALID_INPUT_TYPE:script/toolchain-registry.json")
  expect((await monolithInventory(fixture.path)).modules).toEqual(legacy.modules)
})

test("revision capture reads immutable Git blobs and binds revision and tree into its fingerprint", async () => {
  await using fixture = await inventoryFixture()
  await Bun.write(path.join(fixture.path, "packages/skills/.hidden/payload.txt"), "hidden snapshot asset\n")
  await Bun.write(path.join(fixture.path, "packages/README.md"), "# Package navigation\n")
  await Bun.write(path.join(fixture.path, "packages/.gitignore"), "generated-only/\n")
  const git = (args: string[]) => {
    const result = Bun.spawnSync(["git", ...args], { cwd: fixture.path })
    expect(result.exitCode).toBe(0)
    return result.stdout.toString().trim()
  }
  git(["init", "--quiet"])
  git(["add", "."])
  git(["-c", "user.name=baseline-fixture", "-c", "user.email=baseline@example.invalid", "commit", "--quiet", "-m", "fixture baseline"])
  const captured = await monolithInventory(fixture.path, "HEAD")
  expect(captured.assets[0]?.files.some((file) => file.path === "packages/skills/.hidden/payload.txt")).toBe(true)
  expect(captured.assets.map((asset) => asset.path)).toEqual(["packages/skills"])
  expect(captured.source).toEqual({ mode: "git", revision: git(["rev-parse", "HEAD"]), tree: git(["rev-parse", "HEAD^{tree}"]) })
  const originalBlob = git(["rev-parse", "HEAD:packages/schema/vendor/pinned.tgz"])
  await Bun.write(path.join(fixture.path, "packages/schema/vendor/pinned.tgz"), "replacement bytes\n")
  const replacement = git(["hash-object", "-w", "packages/schema/vendor/pinned.tgz"])
  git(["replace", originalBlob, replacement])
  expect(git(["cat-file", "blob", originalBlob])).toBe("replacement bytes")
  expect(await monolithInventory(fixture.path, "HEAD")).toEqual(captured)
  git(["replace", "-d", originalBlob])
  await Bun.write(path.join(fixture.path, "packages/schema/vendor/pinned.tgz"), "changed working copy\n")
  expect(await monolithInventory(fixture.path, "HEAD")).toEqual(captured)
  git(["add", "."])
  git(["-c", "user.name=baseline-fixture", "-c", "user.email=baseline@example.invalid", "commit", "--quiet", "-m", "change pin"])
  expect((await monolithInventory(fixture.path, "HEAD")).fingerprint).not.toBe(captured.fingerprint)
  await Bun.write(path.join(fixture.path, "packages/schema/vendor/pinned.tgz"), "pinned bytes\n")
  git(["add", "."])
  git(["-c", "user.name=baseline-fixture", "-c", "user.email=baseline@example.invalid", "commit", "--quiet", "-m", "restore pin"])
  const restored = await monolithInventory(fixture.path, "HEAD")
  if (restored.source.mode !== "git" || captured.source.mode !== "git") throw new Error("expected pinned Git capture")
  expect(restored.source.tree).toBe(captured.source.tree)
  expect(restored.inputs).toEqual(captured.inputs)
  expect(restored.fingerprint).not.toBe(captured.fingerprint)
})
