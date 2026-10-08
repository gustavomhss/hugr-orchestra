import { expect } from "bun:test"
import { Database } from "bun:sqlite"
import path from "node:path"
import { Effect, Schema } from "effect"
import { FSUtil } from "@orchestra/core/fs-util"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { ClaudeCodeStorage } from "@/claude-code/storage"
import { testEffect } from "../lib/effect"
import { TestInstance } from "../fixture/fixture"

const it = testEffect(LayerNode.compile(FSUtil.node))
const stateSchema = Schema.Struct({ owner: Schema.Literal("child-process-test"), updates: Schema.mutable(Schema.Array(Schema.String)) })
const decode = (text: string) => Schema.decodeUnknownSync(stateSchema)(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(text))
it.instance("SQLite retains both acknowledged child-process writes when A resumes after B commits", () => Effect.gen(function* () {
  const instance = yield* TestInstance
  const fs = yield* FSUtil.Service
  const storage = ClaudeCodeStorage.create({ fs, directory: Effect.succeed(instance.directory),
    empty: () => ({ owner: "child-process-test", updates: [] as string[] }),
    decode })
  yield* storage.read
  const spawn = (name: string) => Bun.spawn([process.execPath, path.join(import.meta.dir, "sqlite-writer.ts"), instance.directory, name], {
    cwd: path.resolve(import.meta.dir, "../.."), stdin: "pipe", stdout: "pipe", stderr: "pipe",
  })
  const a = spawn("A")
  const b = spawn("B")
  yield* Effect.addFinalizer(() => Effect.sync(() => { a.kill(); b.kill() }))
  const ar = a.stdout.getReader()
  const br = b.stdout.getReader()
  expect(new TextDecoder().decode((yield* Effect.promise(() => ar.read())).value)).toContain("READY")
  expect(new TextDecoder().decode((yield* Effect.promise(() => br.read())).value)).toContain("READY")
  b.stdin.write("commit")
  b.stdin.end()
  expect(yield* Effect.promise(() => b.exited)).toBe(0)
  expect((yield* storage.read).updates).toEqual(["B"])
  a.stdin.write("commit")
  a.stdin.end()
  expect(yield* Effect.promise(() => a.exited)).toBe(0)
  expect((yield* storage.read).updates).toEqual(["B", "A"])
  // Windows stat exposes synthetic POSIX bits; durability assertions run on every platform.
  if (process.platform !== "win32") expect((yield* fs.stat(path.join(instance.directory, "archive.sqlite"))).mode & 0o777).toBe(0o600)
}), 120_000)

it.instance("an existing empty SQLite placeholder still migrates retained legacy history", () => Effect.gen(function* () {
  const instance = yield* TestInstance
  const fs = yield* FSUtil.Service
  yield* fs.writeFileString(path.join(instance.directory, "archive.json"), JSON.stringify({ owner: "child-process-test", updates: ["legacy"] }))
  // Another initializer may have created the file and paused before its transaction.
  yield* fs.writeFileString(path.join(instance.directory, "archive.sqlite"), "")
  const storage = ClaudeCodeStorage.create({ fs, directory: Effect.succeed(instance.directory),
    empty: () => ({ owner: "child-process-test" as const, updates: [] as string[] }), decode })
  expect((yield* storage.read).updates).toEqual(["legacy"])
  expect((yield* storage.read).updates).toEqual(["legacy"])
}), 60_000)

for (const backup of ["", "{bad json", JSON.stringify({ owner: "foreign", updates: ["retained"] })])
  it.instance(`failed legacy migration cannot become successful empty context on retry: ${backup}`, () => Effect.gen(function* () {
    const instance = yield* TestInstance
    const fs = yield* FSUtil.Service
    yield* fs.writeFileString(path.join(instance.directory, "archive.json"), backup)
    const storage = ClaudeCodeStorage.create({ fs, directory: Effect.succeed(instance.directory),
      empty: () => ({ owner: "child-process-test" as const, updates: [] as string[] }), decode })
    expect(yield* storage.read.pipe(Effect.isFailure)).toBe(true)
    expect(yield* storage.read.pipe(Effect.isFailure)).toBe(true)
    expect(yield* fs.readFileString(path.join(instance.directory, "archive.json"))).toBe(backup)
  }), 60_000)

it.instance("foreign SQLite schema is rejected without inserting an owned state", () => Effect.gen(function* () {
  const instance = yield* TestInstance
  const fs = yield* FSUtil.Service
  const database = new Database(path.join(instance.directory, "archive.sqlite"))
  yield* Effect.addFinalizer(() => Effect.sync(() => database.close()))
  database.exec("CREATE TABLE unrelated (value TEXT); INSERT INTO unrelated VALUES ('retained');")
  const storage = ClaudeCodeStorage.create({ fs, directory: Effect.succeed(instance.directory),
    empty: () => ({ owner: "child-process-test" as const, updates: [] as string[] }), decode })
  expect(yield* storage.read.pipe(Effect.isFailure)).toBe(true)
  expect(database.query("SELECT value FROM unrelated").get()).toEqual({ value: "retained" })
  expect(database.query("SELECT name FROM sqlite_master WHERE type='table'").all()).toEqual([{ name: "unrelated" }])
}), 60_000)

it.instance("missing row in an initialized owned database fails instead of recreating empty history", () => Effect.gen(function* () {
  const instance = yield* TestInstance
  const fs = yield* FSUtil.Service
  const storage = ClaudeCodeStorage.create({ fs, directory: Effect.succeed(instance.directory),
    empty: () => ({ owner: "child-process-test" as const, updates: [] as string[] }), decode })
  yield* storage.modify((state) => state.updates.push("acknowledged"))
  const database = new Database(path.join(instance.directory, "archive.sqlite"))
  yield* Effect.addFinalizer(() => Effect.sync(() => database.close()))
  expect(database.query("SELECT payload FROM native_state").get()).toBeDefined()
  database.exec("DELETE FROM native_state")
  expect(yield* storage.read.pipe(Effect.isFailure)).toBe(true)
  expect(yield* storage.read.pipe(Effect.isFailure)).toBe(true)
}), 60_000)
