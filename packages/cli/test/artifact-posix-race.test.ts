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

// Regression gates intentionally remain red until staging-name authority is
// resolved. Wrapping only the final native primitive inserts the actual rename
// after the production identity check, without patching global filesystem APIs.
test("POSIX critical publish interleaving must publish captured staging object", () =>
  artifactFixture(async (input) => {
    const calls = await operations()
    const native = artifactPosix({
      ...calls,
      publish: (parent, name, output) => {
        renameSync(join(input.root, name), join(input.root, "saved-stage"))
        renameSync(join(input.root, "external", "foreign"), join(input.root, name))
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
        expect(output.identity).toBe(stage.identity)
        expect(native.list(output)).toEqual(["captured"])
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

test("POSIX critical cleanup interleaving must not delete unrelated replacement entry", () =>
  artifactFixture(async (input) => {
    const calls = await operations()
    const native = artifactPosix({
      ...calls,
      unlink: (parent, name, directory) => {
        if (directory && name === "stage") {
          renameSync(join(input.root, name), join(input.root, "saved-stage"))
          renameSync(join(input.root, "external", "foreign"), join(input.root, name))
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
      const preserved = await lstat(join(input.root, "stage"), { bigint: true })
      expect({ dev: preserved.dev, ino: preserved.ino }).toEqual({ dev: identity.dev, ino: identity.ino })
    } finally {
      native.closeDirectory(stage)
      pins.reverse().forEach((pin) => native.closeDirectory(pin))
      native.close()
    }
  }))
