import { expect, test } from "bun:test"
import { renameSync } from "node:fs"
import { mkdir, lstat } from "node:fs/promises"
import { join, parse, sep } from "node:path"
import { artifactPosix } from "../script/artifact-posix"
import type { ArtifactPosixInput } from "../script/artifact-posix"
import { artifactFixture } from "./artifact-fs.test"

if (process.platform !== "linux" && process.platform !== "darwin")
  throw new Error("Actual POSIX artifact race lane required")

async function operations(): Promise<ArtifactPosixInput> {
  if (process.platform === "linux") {
    const { artifactLinuxOperations } = await import("../script/artifact-linux")
    return artifactLinuxOperations()
  }
  const { artifactDarwinOperations } = await import("../script/artifact-darwin")
  return artifactDarwinOperations()
}

// PUB-NS-001: declared human-authorized scope exception; owner selected
// "Build controlado (Recommended)". See PRODUCER-BOUNDARY.md for provenance.
// These retained examples assert known limitations outside that boundary.
// The hostile same-UID writer runs after the check, before the real primitive;
// no global filesystem APIs are patched and no cases are skipped.
test("POSIX limitation: hostile namespace writer can replace staging entry before publication", () =>
  artifactFixture(async (input) => {
    const calls = await operations()
    const state = { interleavings: 0 }
    const native = artifactPosix({
      ...calls,
      publish: (parent, name, output) => {
        renameSync(join(input.root, name), join(input.root, "saved-stage"))
        renameSync(join(input.root, "external", "foreign"), join(input.root, name))
        state.interleavings++
        return calls.publish(parent, name, output)
      },
    })
    const start = parse(input.root).root
    const pins = [native.root(start)]
    input.root
      .slice(start.length)
      .split(sep)
      .filter(Boolean)
      .forEach((name) => pins.push(native.directory(pins.at(-1)!, name)))
    const parent = pins.at(-1)!
    const stage = native.directory(parent, "stage", { create: true, exclusive: true, removable: true })
    await mkdir(join(input.root, "external", "foreign"))
    const external = native.directory(parent, "external")
    const foreign = native.directory(external, "foreign")
    try {
      native.write(stage, "captured", Buffer.from("captured bytes"), false)
      native.write(foreign, "foreign", Buffer.from("foreign bytes"), false)
      native.publish(parent, "stage", stage, "output")
      const output = native.directory(parent, "output")
      try {
        expect(state.interleavings).toBe(1)
        expect(output.identity).toBe(foreign.identity)
        expect(output.identity).not.toBe(stage.identity)
        expect(native.list(output)).toEqual(["foreign"])
        expect(native.read(output, "foreign").bytes).toEqual(Buffer.from("foreign bytes"))
        expect(native.read(stage, "captured").bytes).toEqual(Buffer.from("captured bytes"))
      } finally {
        native.closeDirectory(output)
      }
    } finally {
      native.closeDirectory(foreign)
      native.closeDirectory(external)
      native.closeDirectory(stage)
      pins.reverse().forEach((pin) => native.closeDirectory(pin))
      native.close()
    }
  }))

test("POSIX limitation: hostile namespace writer can redirect name-based cleanup", () =>
  artifactFixture(async (input) => {
    const calls = await operations()
    const state = { interleavings: 0 }
    const native = artifactPosix({
      ...calls,
      unlink: (parent, name, directory) => {
        if (directory && name === "stage") {
          renameSync(join(input.root, name), join(input.root, "saved-stage"))
          renameSync(join(input.root, "external", "foreign"), join(input.root, name))
          state.interleavings++
        }
        return calls.unlink(parent, name, directory)
      },
    })
    const start = parse(input.root).root
    const pins = [native.root(start)]
    input.root
      .slice(start.length)
      .split(sep)
      .filter(Boolean)
      .forEach((name) => pins.push(native.directory(pins.at(-1)!, name)))
    const parent = pins.at(-1)!
    const stage = native.directory(parent, "stage", { create: true, exclusive: true, removable: true })
    const path = join(input.root, "external", "foreign")
    await mkdir(path)
    const identity = await lstat(path, { bigint: true })
    try {
      native.removeDirectory(parent, "stage", stage)
      expect(state.interleavings).toBe(1)
      await expect(lstat(join(input.root, "stage"))).rejects.toMatchObject({ code: "ENOENT" })
      const saved = await lstat(join(input.root, "saved-stage"), { bigint: true })
      expect(`${saved.dev}:${saved.ino}`).toBe(stage.identity)
      expect(`${identity.dev}:${identity.ino}`).not.toBe(stage.identity)
      expect(native.list(stage)).toEqual([])
    } finally {
      native.closeDirectory(stage)
      pins.reverse().forEach((pin) => native.closeDirectory(pin))
      native.close()
    }
  }))
