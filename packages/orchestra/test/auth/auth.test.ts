import { describe, expect } from "bun:test"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { basename, dirname, join } from "node:path"
import { lstat, readdir } from "node:fs/promises"
import { Cause, Effect, Exit, Layer } from "effect"
import { Auth } from "../../src/auth"
import { testEffect } from "../lib/effect"
import { assertPrivateFile, broadenPrivateFile, preventNativeProtection } from "../../../core/test/fixture/private-file"

const it = testEffect(LayerNode.compile(LayerNode.group([Auth.node, FSUtil.node])))

describe("Auth", () => {
  it.instance("auth and revision replacements publish private complete files with exact credential shape", () =>
    Effect.gen(function* () {
      const auth = yield* Auth.Service
      const fsys = yield* FSUtil.Service
      const key = "private-publication-fixture"
      const value = new Auth.Api({ type: "api", key: "fixture-only" })
      const sources: string[] = []
      const publications: string[] = []
      const observed = Layer.succeed(FSUtil.Service, FSUtil.Service.of({
        ...fsys,
        writeJson: (source, data, mode) => fsys.writeJson(source, data, mode).pipe(
          Effect.andThen(Effect.promise(async () => {
            sources.push(source)
            await broadenPrivateFile(source, true)
            await expect(assertPrivateFile(source)).rejects.toThrow("Private-file oracle")
          })),
        ),
        rename: (source, destination) => Effect.promise(async () => {
          // Runs at the production rename boundary, not after destination repair.
          await assertPrivateFile(source)
          const data = await Bun.file(source).json()
          if (destination.endsWith("auth.json")) expect(data[key]).toEqual({ type: "api", key: "fixture-only" })
          if (destination.endsWith("auth-revisions.json")) expect(data[key]).toMatch(/^[0-9a-f-]{36}$/i)
          publications.push(destination)
        }).pipe(Effect.andThen(fsys.rename(source, destination))),
      }))
      yield* Effect.gen(function* () {
        const store = yield* Auth.Service
        yield* store.set(key, value)
      }).pipe(Effect.provide(Layer.fresh(LayerNode.compile(Auth.node, [[FSUtil.node, observed]]))))
      expect(publications).toEqual([join(Global.Path.data, "auth-revisions.json"), join(Global.Path.data, "auth.json")])
      expect(sources).toHaveLength(2)
      yield* Effect.promise(async () => {
        for (const source of sources) expect(await readdir(Global.Path.data)).not.toContain(basename(dirname(source)))
      })
      yield* Effect.promise(async () => {
        for (const name of ["auth.json", "auth-revisions.json"]) {
          const filename = join(Global.Path.data, name)
          await assertPrivateFile(filename)
          await broadenPrivateFile(filename, true)
          await expect(assertPrivateFile(filename)).rejects.toThrow("Private-file oracle")
        }
      })
      yield* auth.set(key, value)
      yield* Effect.promise(async () => {
        await assertPrivateFile(join(Global.Path.data, "auth.json"))
        await assertPrivateFile(join(Global.Path.data, "auth-revisions.json"))
        expect((await Bun.file(join(Global.Path.data, "auth.json")).json())[key]).toEqual({ type: "api", key: "fixture-only" })
      })
      yield* auth.remove(key)
    }),
  )

  Array.of("revision", "credential").forEach((phase) => it.instance(`native auth protection failure blocks ${phase} publication and cleans scratch`, () =>
    Effect.gen(function* () {
      const auth = yield* Auth.Service
      const fsys = yield* FSUtil.Service
      const key = "native-failure-fixture"
      const old = new Auth.Api({ type: "api", key: "fixture-old" })
      const next = new Auth.Api({ type: "api", key: "fixture-next" })
      yield* auth.set(key, old)
      const before = yield* auth.snapshot(key)
      const oldContent = yield* fsys.readFileString(join(Global.Path.data, "auth.json"))
      const sources: string[] = []
      const publications: string[] = []
      const control: { release?: () => Promise<void>; source?: string } = {}
      yield* Effect.addFinalizer(() => Effect.promise(async () => { await control.release?.() }))
      const observed = Layer.succeed(FSUtil.Service, FSUtil.Service.of({
        ...fsys,
        writeJson: (source, data, mode) => fsys.writeJson(source, data, mode).pipe(
          Effect.andThen(Effect.promise(async () => {
            sources.push(source)
            if (typeof data !== "object" || data === null || !(key in data)) throw new Error("Missing native-failure fixture record")
            const kind = typeof data[key] === "string" ? "revision" : "credential"
            if (kind !== phase) return
            control.source = source
            const failure = await preventNativeProtection(source)
            control.release = async () => { await failure[Symbol.asyncDispose](); delete control.release }
            expect((await lstat(source)).isFile()).toBe(true)
          })),
        ),
        rename: (source, destination) => Effect.sync(() => { publications.push(destination) }).pipe(
          Effect.andThen(fsys.rename(source, destination)),
        ),
        remove: (filename, options) => Effect.promise(async () => { await control.release?.() }).pipe(
          Effect.andThen(fsys.remove(filename, options)),
        ),
      }))
      const result = yield* Effect.gen(function* () {
        const store = yield* Auth.Service
        yield* store.set(key, next)
      }).pipe(Effect.provide(Layer.fresh(LayerNode.compile(Auth.node, [[FSUtil.node, observed]]))), Effect.exit)
      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isSuccess(result)) throw new Error("Native protection failure was swallowed")
      expect(Cause.pretty(result.cause)).toContain("PrivateFile.protect failed")
      expect(Cause.pretty(result.cause)).toContain(process.platform === "win32" ? "ENOENT" : "EPERM")
      expect(control.source).toBeDefined()
      expect(control.release).toBeUndefined()
      expect(publications).toEqual(phase === "revision" ? [] : [join(Global.Path.data, "auth-revisions.json")])
      expect(yield* fsys.readFileString(join(Global.Path.data, "auth.json"))).toBe(oldContent)
      expect(yield* auth.get(key)).toEqual(old)
      const after = yield* auth.snapshot(key)
      if (phase === "revision") expect(after.revision).toBe(before.revision)
      if (phase === "credential") expect(after.revision).not.toBe(before.revision)
      yield* Effect.promise(async () => {
        for (const source of sources) expect(await readdir(Global.Path.data)).not.toContain(basename(dirname(source)))
      })
      yield* auth.remove(key)
    }),
  ))

  it.instance("malformed auth revisions fail closed instead of becoming initial generations", () =>
    Effect.gen(function* () {
      const auth = yield* Auth.Service
      const fsys = yield* FSUtil.Service
      const key = "malformed-generation-fixture"
      const value = new Auth.Api({ type: "api", key: "fixture-original" })
      yield* auth.set(key, value)
      const snapshot = yield* auth.snapshot(key)
      const file = join(Global.Path.data, "auth-revisions.json")
      const original = yield* fsys.readFileString(file)
      yield* Effect.acquireRelease(Effect.void, () => fsys.writeFileString(file, original).pipe(Effect.orDie))
      yield* Effect.forEach([JSON.stringify({ [key]: "initial" }), JSON.stringify({ [key]: "not-a-uuid" }), "{"], (text) =>
        Effect.gen(function* () {
          yield* fsys.writeFileString(file, text)
          expect(Exit.isFailure(yield* auth.snapshot(key).pipe(Effect.exit))).toBe(true)
          expect(Exit.isFailure(yield* auth.replaceIf(key, snapshot.value, value, snapshot.revision).pipe(Effect.exit))).toBe(true)
          expect(Exit.isFailure(yield* auth.remove(key).pipe(Effect.exit))).toBe(true)
          expect(yield* auth.get(key)).toEqual(value)
        }),
      )
    }),
  )

  it.instance("snapshot CAS detects deletion and same-value ABA without invalidation from other providers", () =>
    Effect.gen(function* () {
      const auth = yield* Auth.Service
      const key = "generation-fixture"
      const value = new Auth.Api({ type: "api", key: "fixture-original" })
      const next = new Auth.Api({ type: "api", key: "fixture-next" })
      yield* auth.remove(key)
      const absent = yield* auth.snapshot(key)
      yield* auth.set("generation-unrelated", value)
      expect(yield* auth.replaceIf(key, absent.value, value, absent.revision)).toBe(true)
      const saved = yield* auth.snapshot(key)
      yield* auth.remove(key)
      yield* auth.set(key, value)
      expect(yield* auth.replaceIf(key, saved.value, next, saved.revision)).toBe(false)
      expect(yield* auth.get(key)).toEqual(value)
      yield* auth.remove(key)
      const empty = yield* auth.snapshot(key)
      yield* auth.remove(key)
      expect(yield* auth.replaceIf(key, empty.value, next, empty.revision)).toBe(false)
      expect(yield* auth.get(key)).toBeUndefined()
      yield* auth.remove("generation-unrelated")
    }),
  )

  it.instance("set normalizes trailing slashes in keys", () =>
    Effect.gen(function* () {
      const auth = yield* Auth.Service
      yield* auth.set("https://example.com/", {
        type: "wellknown",
        key: "TOKEN",
        token: "abc",
      })
      const data = yield* auth.all()
      expect(data["https://example.com"]).toBeDefined()
      expect(data["https://example.com/"]).toBeUndefined()
    }),
  )

  it.instance("set cleans up pre-existing trailing-slash entry", () =>
    Effect.gen(function* () {
      const auth = yield* Auth.Service
      yield* auth.set("https://example.com/", {
        type: "wellknown",
        key: "TOKEN",
        token: "old",
      })
      yield* auth.set("https://example.com", {
        type: "wellknown",
        key: "TOKEN",
        token: "new",
      })
      const data = yield* auth.all()
      const keys = Object.keys(data).filter((key) => key.includes("example.com"))
      expect(keys).toEqual(["https://example.com"])
      const entry = data["https://example.com"]!
      expect(entry.type).toBe("wellknown")
      if (entry.type === "wellknown") expect(entry.token).toBe("new")
    }),
  )

  it.instance("remove deletes both trailing-slash and normalized keys", () =>
    Effect.gen(function* () {
      const auth = yield* Auth.Service
      yield* auth.set("https://example.com", {
        type: "wellknown",
        key: "TOKEN",
        token: "abc",
      })
      yield* auth.remove("https://example.com/")
      const data = yield* auth.all()
      expect(data["https://example.com"]).toBeUndefined()
      expect(data["https://example.com/"]).toBeUndefined()
    }),
  )

  it.instance("set and remove are no-ops on keys without trailing slashes", () =>
    Effect.gen(function* () {
      const auth = yield* Auth.Service
      yield* auth.set("anthropic", {
        type: "api",
        key: "sk-test",
      })
      const data = yield* auth.all()
      expect(data["anthropic"]).toBeDefined()
      yield* auth.remove("anthropic")
      const after = yield* auth.all()
      expect(after["anthropic"]).toBeUndefined()
    }),
  )
})
