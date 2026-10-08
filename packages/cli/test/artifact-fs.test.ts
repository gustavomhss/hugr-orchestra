import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, parse, sep } from "node:path"
import { admitArtifacts, artifactNative } from "../script/artifact-fs"
import type { ArtifactManifest } from "../script/artifact-fs"
import type { ArtifactNative } from "../script/artifact-native"
import { verifyCliArtifact } from "../../desktop/src/main/cli-artifacts"

const version = "boundary-test"
const target = "linux-arm64"
const bytes = Buffer.concat([Buffer.from([0, 255, 128]), Buffer.alloc(128 * 1024, 42)])

export async function artifactFixture(
  run: (input: { root: string; dist: string; out: string; bin: string }) => Promise<void>,
) {
  const root = await realpath(
    await mkdtemp(join(process.env.ORCHESTRA_ARTIFACT_TEST_ROOT ?? tmpdir(), "artifact-boundary-")),
  )
  const input = {
    root,
    dist: join(root, "dist"),
    out: join(root, "destination", "new", "artifacts"),
    bin: join(root, `dist/cli-${target}/bin`),
  }
  await mkdir(input.bin, { recursive: true })
  await mkdir(join(root, "destination"))
  await writeFile(join(input.bin, "orchestra"), bytes)
  await writeFile(
    join(input.dist, `cli-${target}/package.json`),
    JSON.stringify({ name: `@orchestra/cli-${target}`, version, os: ["linux"], cpu: ["arm64"] }),
  )
  await mkdir(join(root, "external"))
  await writeFile(join(root, "external", "orchestra"), "external bytes must stay untouched")
  await writeFile(join(root, "external", "sentinel"), "external sentinel")
  return run(input).finally(() => rm(root, { recursive: true, force: true }))
}

async function oracle(directory: string): Promise<Record<string, string>> {
  return Object.assign(
    {},
    ...(await Promise.all(
      (await readdir(directory, { withFileTypes: true })).map(async (entry) => {
        if (entry.isDirectory())
          return Object.fromEntries(
            Object.entries(await oracle(join(directory, entry.name))).map(([key, value]) => [
              join(entry.name, key),
              value,
            ]),
          )
        return { [entry.name]: (await readFile(join(directory, entry.name))).toString("hex") }
      }),
    )),
  )
}

function manifest(): ArtifactManifest {
  return {
    schema: 1,
    version,
    artifacts: [{ target, file: `orchestra-${target}`, sha256: createHash("sha256").update(bytes).digest("hex") }],
  }
}

async function pinDirectory(native: ArtifactNative, path: string) {
  const root = parse(path).root
  const pins = [native.root(root)]
  path
    .slice(root.length)
    .split(sep)
    .filter(Boolean)
    .forEach((name) => pins.push(native.directory(pins[pins.length - 1], name)))
  return { directory: pins[pins.length - 1], close: () => pins.reverse().forEach((pin) => native.closeDirectory(pin)) }
}

test("source ancestor swap to same-inode symlink is rejected between admission and capture", () =>
  artifactFixture(async (input) => {
    const filesystem = await admitArtifacts({ ...input, targets: [target] })
    try {
      const inode = (await lstat(join(input.bin, "orchestra"), { bigint: true })).ino
      const saved = join(input.root, "external", "original-bin")
      await rename(input.bin, saved)
      await symlink(saved, input.bin, process.platform === "win32" ? "junction" : "dir")
      expect((await lstat(join(input.bin, "orchestra"), { bigint: true })).ino).toBe(inode)
      const before = await oracle(join(input.root, "external"))
      expect(() => filesystem.capture()).toThrow()
      expect(await oracle(join(input.root, "external"))).toEqual(before)
      expect(await readdir(join(input.root, "destination"))).toEqual([])
    } finally {
      filesystem.cleanup()
    }
  }))

test("source ancestor swap after capture aborts final publication without external writes", () =>
  artifactFixture(async (input) => {
    const filesystem = await admitArtifacts({ ...input, targets: [target] })
    try {
      expect(filesystem.capture()[0].bytes).toEqual(bytes)
      await rename(input.bin, join(input.root, "saved-bin"))
      await symlink(join(input.root, "external"), input.bin, process.platform === "win32" ? "junction" : "dir")
      const before = await oracle(join(input.root, "external"))
      expect(() => filesystem.publish(manifest())).toThrow()
      expect(await oracle(join(input.root, "external"))).toEqual(before)
      expect(await readdir(join(input.root, "destination"))).toEqual([])
    } finally {
      filesystem.cleanup()
    }
  }))

test("write ancestor swap before mkdir aborts publication without external writes", () =>
  artifactFixture(async (input) => {
    const filesystem = await admitArtifacts({ ...input, targets: [target] })
    try {
      filesystem.capture()
      await rename(join(input.root, "destination"), join(input.root, "saved-destination"))
      await symlink(
        join(input.root, "external"),
        join(input.root, "destination"),
        process.platform === "win32" ? "junction" : "dir",
      )
      const before = await oracle(join(input.root, "external"))
      expect(() => filesystem.publish(manifest())).toThrow()
      expect(await oracle(join(input.root, "external"))).toEqual(before)
      expect(await readdir(join(input.root, "saved-destination"))).toEqual([])
    } finally {
      filesystem.cleanup()
    }
  }))

test("native read stays anchored when pinned bin path is redirected after acquisition", () =>
  artifactFixture(async (input) => {
    const native = await artifactNative()
    const pinned = await pinDirectory(native, input.bin)
    try {
      await rename(input.bin, join(input.root, "saved-bin"))
      await symlink(join(input.root, "external"), input.bin, process.platform === "win32" ? "junction" : "dir")
      const before = await oracle(join(input.root, "external"))
      expect(await readFile(join(input.bin, "orchestra"), "utf8")).toBe("external bytes must stay untouched")
      expect(native.read(pinned.directory, "orchestra").bytes).toEqual(bytes)
      expect(await oracle(join(input.root, "external"))).toEqual(before)
    } finally {
      pinned.close()
      native.close()
    }
  }))

test("native write and cleanup stay anchored after staging path ancestor swap", () =>
  artifactFixture(async (input) => {
    const native = await artifactNative()
    const pinned = await pinDirectory(native, join(input.root, "destination"))
    const stage = native.directory(pinned.directory, "staging", { create: true, exclusive: true, removable: true })
    const state = { parent: "destination" }
    try {
      const moved = await rename(join(input.root, "destination"), join(input.root, "saved-destination")).then(
        () => true,
        (error: NodeJS.ErrnoException) => {
          // Windows refuses moving an ancestor while a DELETE-capable staging
          // handle is open. Kernel denial is the stronger post-stage boundary.
          if (process.platform !== "win32" || error.code !== "EPERM") throw error
          expect(error.code).toBe("EPERM")
          return false
        },
      )
      if (moved) {
        state.parent = "saved-destination"
        await symlink(
          join(input.root, "external"),
          join(input.root, "destination"),
          process.platform === "win32" ? "junction" : "dir",
        )
      }
      const before = await oracle(join(input.root, "external"))
      native.write(stage, "new-file", bytes, true)
      expect(await readFile(join(input.root, state.parent, "staging/new-file"))).toEqual(bytes)
      native.removeFile(stage, "new-file")
      native.removeDirectory(pinned.directory, "staging", stage)
      expect(await oracle(join(input.root, "external"))).toEqual(before)
    } finally {
      native.closeDirectory(stage)
      pinned.close()
      native.close()
    }
    expect(await readdir(join(input.root, state.parent))).toEqual([])
  }))

test("native source boundary publishes exact raw bytes accepted by actual Desktop reader", () =>
  artifactFixture(async (input) => {
    const before = await oracle(input.dist)
    const filesystem = await admitArtifacts({ ...input, targets: [target] })
    try {
      expect(JSON.parse(filesystem.capture()[0].metadata.toString())).toEqual({
        name: `@orchestra/cli-${target}`,
        version,
        os: ["linux"],
        cpu: ["arm64"],
      })
      expect(filesystem.publish(manifest())).toEqual(manifest())
    } finally {
      filesystem.cleanup()
    }
    expect(await verifyCliArtifact(input.out, target)).toEqual({
      path: join(input.out, `orchestra-${target}`),
      version,
    })
    expect(await readFile(join(input.out, `orchestra-${target}`))).toEqual(bytes)
    expect(await oracle(input.dist)).toEqual(before)
  }))
