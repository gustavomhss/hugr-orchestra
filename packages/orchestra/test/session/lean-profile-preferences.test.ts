import { expect } from "bun:test"
import path from "node:path"
import { Effect } from "effect"
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
