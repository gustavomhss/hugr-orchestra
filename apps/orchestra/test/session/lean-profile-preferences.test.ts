import { expect } from "bun:test"
import path from "node:path"
import { Effect, Exit, type FileSystem } from "effect"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { LeanProfilePreferences } from "../../src/session/lean-profile-preferences"
import { tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([FSUtil.node, CrossSpawnSpawner.node])))
const fixture = Effect.gen(function* () {
  const tmp = yield* tmpdirScoped()
  const fs = yield* FSUtil.Service
  const global = Global.make({ data: path.join(tmp, "private"), state: path.join(tmp, "state") })
  const directories = [path.join(tmp, "one"), path.join(tmp, "two")]
  yield* Effect.forEach(directories, (dir) => fs.makeDirectory(dir))
  return { fs, global, owners: directories.map((directory) => ({ projectID: "global", directory })) }
})

it.live("profile identity and item preferences remain independent across reloads and concurrent writes", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    yield* Effect.gen(function* () {
      const first = yield* LeanProfilePreferences.read(f.owners[0])
      expect(first.enabled).toBeUndefined()
      expect(first.items).toEqual({})
      expect(first.scope.profileID).not.toBe((yield* LeanProfilePreferences.read(f.owners[1])).scope.profileID)
      yield* Effect.all([
        LeanProfilePreferences.update(f.owners[0], { itemID: "cargo", enabled: false }),
        LeanProfilePreferences.update(f.owners[0], { itemID: "pytest", enabled: true }),
        LeanProfilePreferences.update(f.owners[0], { enabled: false }),
      ], { concurrency: "unbounded" })
      const saved = yield* LeanProfilePreferences.read(f.owners[0])
      expect(saved.enabled).toBe(false)
      expect(saved.items).toEqual({ cargo: false, pytest: true })
      const other = yield* LeanProfilePreferences.read(f.owners[1])
      expect(other.enabled).toBeUndefined()
      expect(other.items).toEqual({})
      const git = { ...f.owners[0], projectID: "same-git-project" }
      yield* LeanProfilePreferences.update(git, { enabled: true })
      expect((yield* LeanProfilePreferences.read({ ...git, directory: f.owners[1].directory })).enabled).toBeUndefined()
      expect((yield* LeanProfilePreferences.read(f.owners[0])).enabled).toBe(false)
      const file = path.join(f.global.data, "lean", "profiles", `${saved.scope.profileID}.json`)
      if (process.platform !== "win32") expect((yield* f.fs.stat(file)).mode & 0o777).toBe(0o600)
      expect((yield* f.fs.readDirectory(path.dirname(file))).filter((name) => name.endsWith(".tmp"))).toEqual([])
    }).pipe(Effect.provideService(Global.Service, f.global))
  }),
)

it.live("bad, oversized, unsupported and unreadable preferences fail instead of defaulting", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    yield* Effect.gen(function* () {
      const state = yield* LeanProfilePreferences.update(f.owners[0], { enabled: true })
      const file = path.join(f.global.data, "lean", "profiles", `${state.scope.profileID}.json`)
      for (const text of ["{", " ".repeat(4097), '{"version":2,"items":{}}',
        '{"version":1,"enabled":"true","items":{}}', '{"version":1,"items":{"unknown":true}}',
        '{"version":1,"items":{"cargo":0}}', '{"version":1,"items":{},"extra":true}']) {
        yield* f.fs.writeFileString(file, text)
        expect((yield* LeanProfilePreferences.read(f.owners[0]).pipe(Effect.flip))).toBeInstanceOf(LeanProfilePreferences.Unavailable)
        expect((yield* LeanProfilePreferences.update(f.owners[0], { enabled: false }).pipe(Effect.flip))).toBeInstanceOf(LeanProfilePreferences.Unavailable)
        expect(yield* f.fs.readFileString(file)).toBe(text)
      }
      yield* f.fs.remove(file)
      yield* f.fs.makeDirectory(file)
      expect((yield* LeanProfilePreferences.read(f.owners[0]).pipe(Effect.flip))).toBeInstanceOf(LeanProfilePreferences.Unavailable)
    }).pipe(Effect.provideService(Global.Service, f.global))
  }),
)

it.live("native alias identity stays exact and saved preferences survive removal of the profile directory", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const original = LeanProfilePreferences.make(f.fs, f.global)
    yield* original.update(f.owners[0], { enabled: false })
    const directory = path.join(f.owners[0].directory, "..", "alias")
    yield* f.fs.symlink(f.owners[0].directory, directory)
    const alias = { ...f.owners[0], directory }
    const saved = yield* original.update(alias, { enabled: true })
    expect(saved.scope.directory).toBe(directory)
    const read = yield* original.read(alias)
    expect(read.scope).toEqual(saved.scope)
    expect(read.enabled).toBe(true)
    expect((yield* original.read(f.owners[0])).enabled).toBe(false)
    yield* f.fs.remove(f.owners[0].directory, { recursive: true })
    expect((yield* original.read(alias)).scope.directory).toBe(directory)
    expect((yield* original.read(f.owners[0])).enabled).toBe(false)
  }),
)

it.live("partial write and rename failures close owned handles, remove temporary files and preserve primary plus cleanup errors", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const preferences = LeanProfilePreferences.make(f.fs, f.global)
    const saved = yield* preferences.update(f.owners[0], { enabled: true })
    const root = path.join(f.global.data, "lean", "profiles")
    const file = path.join(root, `${saved.scope.profileID}.json`)
    const before = yield* f.fs.readFileString(file)
    for (const stage of ["partial", "rename", "cleanup"]) {
      const handles: FileSystem.File[] = []
      const fs: FSUtil.Interface = {
        ...f.fs,
        open: (file, options) => f.fs.open(file, options).pipe(Effect.map((handle) => {
          if (options?.flag !== "wx") return handle
          handles.push(handle)
          return { ...handle, writeAll: (buffer: Uint8Array) => stage === "rename" ? handle.writeAll(buffer)
            : handle.writeAll(buffer.subarray(0, 7)).pipe(Effect.andThen(Effect.die(new Error("partial-write-primary")))) }
        })),
        rename: stage === "rename" ? () => Effect.die(new Error("rename-primary")) : f.fs.rename,
        remove: (file, options) => stage === "cleanup" && file.endsWith(".tmp")
          ? f.fs.remove(file, options).pipe(Effect.andThen(Effect.die(new Error("temporary-cleanup-secondary"))))
          : f.fs.remove(file, options),
      }
      const failure = yield* LeanProfilePreferences.make(fs, f.global).update(f.owners[0], { enabled: false }).pipe(Effect.flip)
      expect(failure.message).toContain(stage === "rename" ? "rename-primary" : "partial-write-primary")
      if (stage === "cleanup") expect(failure.message).toContain("temporary-cleanup-secondary")
      expect(yield* f.fs.readFileString(file)).toBe(before)
      expect((yield* f.fs.readDirectory(root)).filter((name) => name.endsWith(".tmp"))).toEqual([])
      expect(handles).toHaveLength(1)
      expect(Exit.isFailure(yield* handles[0].stat.pipe(Effect.exit))).toBe(true)
    }
  }),
)
