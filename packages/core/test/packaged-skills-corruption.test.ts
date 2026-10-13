import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { PackagedSkills } from "../src/packaged-skills"
import { bundle, isolated, snapshot, trees } from "./fixture/packaged-skills"

test.each(Object.entries(trees.backend).flatMap(([relative, text]) =>
  ["tamper", "missing"].map((mode) => [relative, mode, text] as const),
))("refuses %s after %s without changing filesystem evidence", (relative, mode, text) => isolated(async (cache) => {
  const module = path.join(cache, "embedded.mjs")
  await bundle(path.resolve(import.meta.dirname, "../src/packaged-skills.ts"), trees, module)
  const compiled: typeof import("../src/packaged-skills") = await import(module)
  const roots = await compiled.materialize({ cache, version: "1" })
  const target = path.dirname(roots[0])
  const file = path.join(roots[1], relative)
  expect(await fs.readFile(file)).toEqual(Buffer.from(text, "utf8"))
  const clean = await snapshot(cache)
  // Same actual compiled boundary must admit the clean publication before refusing the defect.
  expect(await compiled.materialize({ cache, version: "1" })).toEqual(roots)
  expect(await snapshot(cache)).toEqual(clean)
  if (mode === "tamper") await fs.writeFile(file, "tampered")
  if (mode === "missing") await fs.unlink(file)
  const before = await snapshot(cache)
  expect(before).not.toEqual(clean)
  expect(before.length).toBeGreaterThan(1)
  const refusal = compiled.materialize({ cache, version: "1" })
  await expect(refusal).rejects.toBeInstanceOf(compiled.PackagingError)
  await expect(refusal).rejects.toMatchObject({
    name: "PackagedSkillsError",
    message: mode === "tamper"
      ? `Packaged skill bytes differ: backend/${relative}`
      : `Incomplete packaged skill tree: ${target}`,
  })
  expect(await snapshot(cache)).toEqual(before)
  if (mode === "tamper") expect(await fs.readFile(file)).toEqual(Buffer.from("tampered"))
  if (mode === "missing") await expect(fs.lstat(file)).rejects.toMatchObject({ code: "ENOENT" })
  expect(await fs.readdir(path.join(cache, "packaged-skills"))).toEqual([path.basename(target)])
}))

test.each(["tamper", "missing", "extra", "empty-directory", "hardlink", "symlink", "root-symlink"])(
  "refuses existing %s tree and leaves recursive bytes, types and links untouched",
  (mode) => isolated(async (cache) => {
    const roots = await PackagedSkills.materialize({ cache, version: "1", trees })
    const target = path.dirname(roots[0])
    const file = path.join(roots[1], "backend-implement/SKILL.md")
    const clean = await snapshot(cache)
    expect(await PackagedSkills.materialize({ cache, version: "1", trees })).toEqual(roots)
    expect(await snapshot(cache)).toEqual(clean)
    if (mode === "tamper") await fs.writeFile(file, "tampered")
    if (mode === "missing") await fs.unlink(file)
    if (mode === "extra") await fs.writeFile(path.join(target, "extra.md"), Buffer.from([0, 255, 13, 10]))
    if (mode === "empty-directory") await fs.mkdir(path.join(target, "unexpected"))
    if (mode === "hardlink") {
      await fs.rename(file, path.join(cache, "linked.md"))
      await fs.link(path.join(cache, "linked.md"), file)
      expect((await fs.lstat(file)).nlink).toBe(2)
      expect((await fs.lstat(file)).ino).toBe((await fs.lstat(path.join(cache, "linked.md"))).ino)
    }
    if (mode === "symlink") {
      const directory = path.join(roots[1], "backend-implement/references")
      await fs.rename(directory, path.join(cache, "references"))
      await fs.symlink(path.join(cache, "references"), directory, process.platform === "win32" ? "junction" : "dir")
    }
    if (mode === "root-symlink") {
      await fs.rename(target, path.join(cache, "redirected"))
      await fs.symlink(path.join(cache, "redirected"), target, process.platform === "win32" ? "junction" : "dir")
    }
    const before = await snapshot(cache)
    expect(before).not.toEqual(clean)
    const original = await fs.lstat(target)
    const refusal = PackagedSkills.materialize({ cache, version: "1", trees })
    await expect(refusal).rejects.toBeInstanceOf(PackagedSkills.PackagingError)
    await expect(refusal).rejects.toMatchObject({
      name: "PackagedSkillsError",
      message: mode === "tamper" ? "Packaged skill bytes differ: backend/backend-implement/SKILL.md"
        : mode === "missing" ? `Incomplete packaged skill tree: ${target}`
        : mode === "extra" ? "Packaged skill bytes differ: extra.md"
        : mode === "empty-directory" ? "Unexpected packaged skill directory: unexpected"
        : mode === "hardlink" ? "Non-regular or hardlinked packaged skill file: backend/backend-implement/SKILL.md"
        : mode === "symlink" ? "Symlink in packaged skill tree: backend/backend-implement/references"
        : `Invalid packaged skill directory: ${target}`,
    })
    // Snapshot the whole sandbox, including redirected trees and the other hardlink name.
    expect(await snapshot(cache)).toEqual(before)
    expect((await fs.lstat(target)).ino).toBe(original.ino)
    if (mode === "tamper") expect(await fs.readFile(file, "utf8")).toBe("tampered")
    if (mode === "missing") await expect(fs.lstat(file)).rejects.toMatchObject({ code: "ENOENT" })
    if (mode === "extra") expect(await fs.readFile(path.join(target, "extra.md"))).toEqual(Buffer.from([0, 255, 13, 10]))
    if (mode === "empty-directory") expect(await fs.readdir(path.join(target, "unexpected"))).toEqual([])
    if (mode === "hardlink") {
      expect((await fs.lstat(file)).nlink).toBe(2)
      expect((await fs.lstat(file)).ino).toBe((await fs.lstat(path.join(cache, "linked.md"))).ino)
      expect(await fs.readFile(path.join(cache, "linked.md"))).toEqual(Buffer.from(trees.backend["backend-implement/SKILL.md"]))
    }
    if (mode === "symlink" || mode === "root-symlink") {
      const link = mode === "symlink" ? path.join(roots[1], "backend-implement/references") : target
      expect((await fs.lstat(link)).isSymbolicLink()).toBe(true)
      const relative = `./${path.relative(await fs.realpath(cache), link).split(path.sep).join("/")}`
      expect(before.find((entry) => entry.path === relative))
        .toMatchObject({ type: "symlink", link: await fs.readlink(link) })
      const redirected = mode === "symlink"
        ? path.join(cache, "references/deep/contract.md")
        : path.join(cache, "redirected/backend/backend-implement/references/deep/contract.md")
      expect(await fs.readFile(redirected)).toEqual(Buffer.from(trees.backend["backend-implement/references/deep/contract.md"]))
    }
    expect(await fs.readdir(path.join(cache, "packaged-skills"))).toEqual([path.basename(target)])
  }),
)

test("filesystem snapshot observes bytes, names, empty directories, inode, mode, links and symlink text without following links", () => isolated(async (cache) => {
  const directory = path.join(cache, "observed")
  await fs.mkdir(directory)
  const file = path.join(directory, "evidence")
  await fs.writeFile(file, Buffer.from([0, 255, 13, 10]))
  const original = await snapshot(directory)
  expect(original).toHaveLength(2)
  expect(original[0]).toMatchObject({ path: ".", type: "directory", names: ["evidence"] })
  expect(original[1]).toMatchObject({ path: "./evidence", type: "file", bytes: "AP8NCg==", links: "1" })
  expect(original[1].inode).toBe(String((await fs.lstat(file, { bigint: true })).ino))
  expect(original[1].device).toBe(String((await fs.lstat(file, { bigint: true })).dev))
  expect(original[1].mode).toBe(String((await fs.lstat(file, { bigint: true })).mode))

  await fs.writeFile(file, Buffer.from([0, 254, 13, 10]))
  const changedBytes = await snapshot(directory)
  expect(changedBytes[1].bytes).not.toBe(original[1].bytes)
  await fs.chmod(file, 0o444)
  const changedMode = await snapshot(directory)
  expect(changedMode[1].mode).not.toBe(changedBytes[1].mode)
  await fs.chmod(file, 0o644)
  await fs.rename(file, path.join(cache, "retained"))
  await fs.writeFile(file, Buffer.from([0, 255, 13, 10]))
  const replaced = await snapshot(directory)
  expect(replaced[1].bytes).toBe(original[1].bytes)
  expect(replaced[1].inode).not.toBe(original[1].inode)
  await fs.link(file, path.join(cache, "hardlink"))
  expect((await snapshot(directory))[1].links).toBe("2")
  await fs.mkdir(path.join(directory, "empty"))
  const added = await snapshot(directory)
  expect(added[0].names).toEqual(["empty", "evidence"])
  expect(added[1]).toMatchObject({ path: "./empty", type: "directory", names: [] })

  await fs.mkdir(path.join(cache, "outside"))
  await fs.mkdir(path.join(cache, "other"))
  await fs.writeFile(path.join(cache, "outside/hidden"), "outside evidence")
  const link = path.join(directory, "redirected")
  await fs.symlink(path.join(cache, "outside"), link, process.platform === "win32" ? "junction" : "dir")
  const linked = await snapshot(directory)
  expect(linked.map((entry) => entry.path)).toEqual([".", "./empty", "./evidence", "./redirected"])
  expect(linked[3]).toMatchObject({ type: "symlink", link: await fs.readlink(link) })
  await fs.writeFile(path.join(cache, "outside/hidden"), "changed outside evidence")
  expect(await snapshot(directory)).toEqual(linked)
  await fs.unlink(link)
  await fs.symlink(path.join(cache, "other"), link, process.platform === "win32" ? "junction" : "dir")
  expect((await snapshot(directory))[3].link).not.toBe(linked[3].link)
  await fs.unlink(file)
  await fs.symlink(path.join(cache, "outside"), file, process.platform === "win32" ? "junction" : "dir")
  expect((await snapshot(directory))[2].type).toBe("symlink")
}))
