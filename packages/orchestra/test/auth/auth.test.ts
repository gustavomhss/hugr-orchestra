import { describe, expect } from "bun:test"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { join } from "node:path"
import { Effect, Exit } from "effect"
import { Auth } from "../../src/auth"
import { testEffect } from "../lib/effect"
import { assertPrivateFile, broadenPrivateFile } from "../../../core/test/fixture/private-file"

const it = testEffect(LayerNode.compile(LayerNode.group([Auth.node, FSUtil.node])))

describe("Auth", () => {
  it.instance("auth and revision replacements publish private complete files with exact credential shape", () =>
    Effect.gen(function* () {
      const auth = yield* Auth.Service
      const key = "private-publication-fixture"
      const value = new Auth.Api({ type: "api", key: "fixture-only" })
      yield* auth.set(key, value)
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
