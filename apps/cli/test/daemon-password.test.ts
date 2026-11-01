import fs from "fs/promises"
import { describe, expect, test } from "bun:test"
import { mkdtemp } from "fs/promises"
import { tmpdir } from "os"
import path from "path"
import { NodeFileSystem } from "@effect/platform-node"
import { Effect, FileSystem, Layer } from "effect"

// The daemon keeps its password under the state directory, so the test gives it a private one before it loads.
process.env.XDG_STATE_HOME = await mkdtemp(path.join(tmpdir(), "daemon-password-"))
const { Daemon } = await import("../src/services/daemon")
const { Global } = await import("@orchestra/core/global")

const passwordFile = path.join(Global.Path.state, "password")

// The real filesystem, recording the files the daemon renames into place and, when asked, planting a link where it
// is about to create a file, as an attacker who wins the race for the temp name would.
const watched = (renames: Array<{ from: string; mode: number }>, plant?: (file: string) => Promise<void>) =>
  Layer.effect(
    FileSystem.FileSystem,
    Effect.gen(function* () {
      const real = yield* FileSystem.FileSystem
      return FileSystem.FileSystem.of({
        ...real,
        writeFileString: (file, data, options) =>
          Effect.promise(async () => plant?.(file)).pipe(Effect.andThen(real.writeFileString(file, data, options))),
        rename: (from, to) =>
          Effect.promise(() => fs.stat(from)).pipe(
            Effect.tap((info) => Effect.sync(() => void renames.push({ from, mode: info.mode & 0o777 }))),
            Effect.andThen(real.rename(from, to)),
          ),
      })
    }),
  ).pipe(Layer.provide(NodeFileSystem.layer))

const password = (renames: Array<{ from: string; mode: number }>, value: string, plant?: (file: string) => Promise<void>) =>
  Effect.gen(function* () {
    const daemon = yield* Daemon.Service
    return yield* daemon.password(value)
  }).pipe(Effect.provide(Daemon.layer.pipe(Layer.provide(watched(renames, plant)))), Effect.runPromise)

const posix = test.skipIf(process.platform === "win32")

describe("daemon password file", () => {
  test("is written through a random temp name and replaced whole", async () => {
    const renames: Array<{ from: string; mode: number }> = []
    await password(renames, "first")
    await password(renames, "second")

    expect(await Bun.file(passwordFile).text()).toBe("second")
    expect(renames.map((entry) => path.basename(entry.from))).not.toContain("password.tmp")
    expect(new Set(renames.map((entry) => entry.from)).size).toBe(2)
    expect((await fs.readdir(Global.Path.state)).filter((name) => name.endsWith(".tmp"))).toEqual([])
  })

  posix("is never readable by others, not even before the rename", async () => {
    const renames: Array<{ from: string; mode: number }> = []
    await password(renames, "secret")

    expect(renames.map((entry) => entry.mode)).toEqual([0o600])
    expect((await fs.stat(passwordFile)).mode & 0o777).toBe(0o600)
  })

  posix("does not follow a link planted at its temp path", async () => {
    const victim = path.join(Global.Path.state, "victim.txt")
    await Bun.write(victim, "untouched")
    await Bun.write(passwordFile, "kept")

    const renames: Array<{ from: string; mode: number }> = []
    await expect(
      password(renames, "attacker-chosen", async (file) => {
        if (file.endsWith(".tmp")) await fs.symlink(victim, file)
      }),
    ).rejects.toThrow()

    expect(await Bun.file(victim).text()).toBe("untouched")
    expect(await Bun.file(passwordFile).text()).toBe("kept")
    expect(renames).toEqual([])
  })
})
