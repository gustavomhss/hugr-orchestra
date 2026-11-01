import fs from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"
import { NodeFileSystem } from "@effect/platform-node"
import { Effect, FileSystem, Layer } from "effect"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNodePlatform } from "@orchestra/core/effect/app-node-platform"
import { FSUtil } from "@orchestra/core/fs-util"
import { tmpdir } from "./fixture/tmpdir"

// The real filesystem with three hooks that record what a hardened write must not leave to chance. `chmod` does
// nothing, so the mode a file has at rename time is the mode it was created with. `plant` runs just before a write
// opens its file, standing in for an attacker who wins the race for the temp name.
const watched = (options: { renames: Array<{ from: string; mode: number }>; plant?: (file: string) => Promise<void> }) =>
  Layer.effect(
    FileSystem.FileSystem,
    Effect.gen(function* () {
      const real = yield* FileSystem.FileSystem
      return FileSystem.FileSystem.of({
        ...real,
        chmod: () => Effect.void,
        writeFileString: (file, data, writeOptions) =>
          Effect.promise(async () => options.plant?.(file)).pipe(
            Effect.andThen(real.writeFileString(file, data, writeOptions)),
          ),
        rename: (from, to) =>
          Effect.promise(() => fs.stat(from)).pipe(
            Effect.tap((info) => Effect.sync(() => void options.renames.push({ from, mode: info.mode & 0o777 }))),
            Effect.andThen(real.rename(from, to)),
          ),
      })
    }),
  ).pipe(Layer.provide(NodeFileSystem.layer))

const run = <A, E>(
  options: Parameters<typeof watched>[0],
  body: (fs: FSUtil.Interface) => Effect.Effect<A, E>,
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      return yield* body(yield* FSUtil.Service)
    }).pipe(Effect.provide(AppNodeBuilder.build(FSUtil.node, [[LayerNodePlatform.filesystem, watched(options)]]))),
  )

const posix = test.skipIf(process.platform === "win32")

describe("FSUtil temp files", () => {
  posix("writeAtomic creates the temp file with the final mode, not a wider one", async () => {
    await using tmp = await tmpdir()
    const renames: Array<{ from: string; mode: number }> = []
    await run({ renames }, (fs) => fs.writeAtomic(path.join(tmp.path, "secret.json"), "{}", 0o600))
    expect(renames.map((entry) => entry.mode)).toEqual([0o600])
    expect((await fs.stat(path.join(tmp.path, "secret.json"))).mode & 0o777).toBe(0o600)
  })

  posix("writeWithDirs creates the file with the final mode, not a wider one", async () => {
    await using tmp = await tmpdir()
    const file = path.join(tmp.path, "nested", "secret.txt")
    await run({ renames: [] }, (fs) => fs.writeWithDirs(file, "secret", 0o600))
    expect((await fs.stat(file)).mode & 0o777).toBe(0o600)
  })

  test("writeAtomic names the temp file at random", async () => {
    await using tmp = await tmpdir()
    const target = path.join(tmp.path, "config.json")
    const renames: Array<{ from: string; mode: number }> = []
    await run({ renames }, (fs) => fs.writeAtomic(target, "a").pipe(Effect.andThen(fs.writeAtomic(target, "b"))))

    const names = renames.map((entry) => path.basename(entry.from))
    expect(new Set(names).size).toBe(2)
    for (const name of names) {
      expect(name).toMatch(/^config\.json\.[0-9a-f-]{36}\.tmp$/)
    }
    expect(await fs.readdir(tmp.path)).toEqual(["config.json"])
  })

  posix("writeAtomic does not follow a link planted at its temp path", async () => {
    await using tmp = await tmpdir()
    const victim = path.join(tmp.path, "victim.txt")
    const target = path.join(tmp.path, "config.json")
    await Bun.write(victim, "untouched")

    const planted: string[] = []
    const renames: Array<{ from: string; mode: number }> = []
    const exit = await run(
      {
        renames,
        plant: async (file) => {
          if (!file.endsWith(".tmp")) return
          planted.push(file)
          await fs.symlink(victim, file)
        },
      },
      (service) => service.writeAtomic(target, "attacker-chosen", 0o600).pipe(Effect.exit),
    )

    expect(planted).toHaveLength(1)
    expect(exit._tag).toBe("Failure")
    expect(await Bun.file(victim).text()).toBe("untouched")
    expect(await Bun.file(target).exists()).toBe(false)
    expect(renames).toEqual([])
  })
})
