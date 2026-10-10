import { expect, test } from "bun:test"
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
  if (process.platform !== "win32") {
    expect((yield* fs.stat(instance.directory)).mode & 0o777).toBe(0o700)
    for (const name of ["archive.sqlite", "archive.sqlite.initialized"])
      expect((yield* fs.stat(path.join(instance.directory, name))).mode & 0o777).toBe(0o600)
  }
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

for (const legacy of [undefined, JSON.stringify({ owner: "child-process-test", updates: ["stale-legacy"] })])
  it.instance(`acknowledged writes survive as initialization evidence after truncation: ${legacy ?? "no legacy"}`, () => Effect.gen(function* () {
    const instance = yield* TestInstance
    const fs = yield* FSUtil.Service
    if (legacy !== undefined) yield* fs.writeFileString(path.join(instance.directory, "archive.json"), legacy)
    const storage = () => ClaudeCodeStorage.create({ fs, directory: Effect.succeed(instance.directory),
      empty: () => ({ owner: "child-process-test" as const, updates: [] as string[] }), decode })
    yield* storage().modify((state) => state.updates.push("acknowledged"))
    expect((yield* storage().read).updates).toContain("acknowledged")
    expect(yield* fs.readFileString(path.join(instance.directory, "archive.sqlite.initialized"))).toBe("initialized\n")
    yield* fs.writeFileString(path.join(instance.directory, "archive.sqlite"), "")
    // New storage objects must reject both attempts, without resurrecting the stale backup.
    for (const attempt of [1, 2]) {
      const result = yield* storage().read.pipe(Effect.result)
      expect(result._tag, `attempt ${attempt}`).toBe("Failure")
      expect(String(result)).toContain("claude-code-corrupt-storage")
      if (legacy !== undefined) expect(yield* fs.readFileString(path.join(instance.directory, "archive.json"))).toBe(legacy)
    }
    const database = new Database(path.join(instance.directory, "archive.sqlite"))
    yield* Effect.addFinalizer(() => Effect.sync(() => database.close()))
    expect(database.query("SELECT name FROM sqlite_master").all()).toEqual([])
  }), 60_000)

it.instance("two child processes initialize one placeholder and retain legacy plus both writes", () => Effect.gen(function* () {
  const instance = yield* TestInstance
  const fs = yield* FSUtil.Service
  const legacy = JSON.stringify({ owner: "child-process-test", updates: ["legacy"] })
  yield* fs.writeFileString(path.join(instance.directory, "archive.json"), legacy)
  yield* fs.writeFileString(path.join(instance.directory, "archive.sqlite"), "")
  const children = ["A", "B"].map((name) => Bun.spawn([process.execPath, path.join(import.meta.dir, "sqlite-writer.ts"), instance.directory, name, "initialize"], {
    cwd: path.resolve(import.meta.dir, "../.."), stdin: "pipe", stdout: "pipe", stderr: "pipe",
  }))
  yield* Effect.addFinalizer(() => Effect.sync(() => children.forEach((child) => child.kill())))
  for (const child of children) {
    expect(new TextDecoder().decode((yield* Effect.promise(() => child.stdout.getReader().read())).value)).toContain("READY")
  }
  children.forEach((child) => { child.stdin.write("commit"); child.stdin.end() })
  for (const child of children) expect(yield* Effect.promise(() => child.exited)).toBe(0)
  const storage = ClaudeCodeStorage.create({ fs, directory: Effect.succeed(instance.directory),
    empty: () => ({ owner: "child-process-test" as const, updates: [] as string[] }), decode })
  const updates = (yield* storage.read).updates
  expect(updates[0]).toBe("legacy")
  expect(updates.slice(1).sort()).toEqual(["A", "B"])
  expect(yield* fs.readFileString(path.join(instance.directory, "archive.json"))).toBe(legacy)
}), 120_000)

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

for (const table of ["unrelated", "sqliteXforeign"])
  it.instance(`foreign SQLite schema ${table} is rejected without inserting an owned state`, () => Effect.gen(function* () {
    const instance = yield* TestInstance
    const fs = yield* FSUtil.Service
    const database = new Database(path.join(instance.directory, "archive.sqlite"))
    yield* Effect.addFinalizer(() => Effect.sync(() => database.close()))
    database.exec(`CREATE TABLE ${table} (value TEXT); INSERT INTO ${table} VALUES ('retained');`)
    const storage = ClaudeCodeStorage.create({ fs, directory: Effect.succeed(instance.directory),
      empty: () => ({ owner: "child-process-test" as const, updates: [] as string[] }), decode })
    expect(yield* storage.read.pipe(Effect.isFailure)).toBe(true)
    expect(yield* storage.read.pipe(Effect.isFailure)).toBe(true)
    expect(database.query(`SELECT value FROM ${table}`).get()).toEqual({ value: "retained" })
    expect(database.query("SELECT name FROM sqlite_master WHERE type='table'").all()).toEqual([{ name: table }])
  }), 60_000)

if (process.platform === "win32") test.skip("POSIX directory and side-file privacy modes and symlink rejection (not Windows ACL proof)", () => {})
if (process.platform !== "win32") {
  it.instance("permissive directory and retained regular SQLite files are secured before database open", () => Effect.gen(function* () {
    const instance = yield* TestInstance
    const fs = yield* FSUtil.Service
    yield* fs.chmod(instance.directory, 0o777)
    const files = ["archive.sqlite", "archive.sqlite-journal", "archive.sqlite-wal", "archive.sqlite-shm", "archive.sqlite.initialized"]
    for (const name of files) {
      yield* fs.writeFileString(path.join(instance.directory, name), "retained")
      yield* fs.chmod(path.join(instance.directory, name), 0o666)
    }
    // Fail on the legacy path after securing files, before SQLite can remove a retained journal.
    yield* fs.makeDirectory(path.join(instance.directory, "archive.json"))
    expect((yield* fs.stat(instance.directory)).mode & 0o777).toBe(0o777)
    const storage = ClaudeCodeStorage.create({ fs, directory: Effect.succeed(instance.directory),
      empty: () => ({ owner: "child-process-test" as const, updates: [] as string[] }), decode })
    expect(String(yield* storage.read.pipe(Effect.result))).toContain("claude-code-unsafe-path")
    expect((yield* fs.stat(instance.directory)).mode & 0o777).toBe(0o700)
    for (const name of files) expect((yield* fs.stat(path.join(instance.directory, name))).mode & 0o777).toBe(0o600)
  }), 60_000)

  for (const name of ["archive.sqlite", "archive.sqlite-journal", "archive.sqlite-wal", "archive.sqlite-shm", "archive.sqlite.initialized"])
    for (const kind of ["symlink", "directory"])
      it.instance(`SQLite rejects ${kind} at ${name} without touching target`, () => Effect.gen(function* () {
        const instance = yield* TestInstance
        const fs = yield* FSUtil.Service
        const target = path.join(instance.directory, "target")
        yield* fs.writeFileString(target, "retained")
        yield* fs.chmod(target, 0o644)
        if (kind === "symlink") yield* fs.symlink(target, path.join(instance.directory, name))
        if (kind === "directory") yield* fs.makeDirectory(path.join(instance.directory, name))
        const storage = ClaudeCodeStorage.create({ fs, directory: Effect.succeed(instance.directory),
          empty: () => ({ owner: "child-process-test" as const, updates: [] as string[] }), decode })
        expect(String(yield* storage.read.pipe(Effect.result))).toContain("claude-code-unsafe-path")
        expect(yield* fs.readFileString(target)).toBe("retained")
        expect((yield* fs.stat(target)).mode & 0o777).toBe(0o644)
      }), 60_000)

  it.instance("SQLite rejects noncanonical symlink directory before creating archive", () => Effect.gen(function* () {
    const instance = yield* TestInstance
    const fs = yield* FSUtil.Service
    const target = path.join(instance.directory, "target")
    const link = path.join(instance.directory, "link")
    yield* fs.makeDirectory(target, { mode: 0o755 })
    yield* fs.symlink(target, link)
    const storage = ClaudeCodeStorage.create({ fs, directory: Effect.succeed(link),
      empty: () => ({ owner: "child-process-test" as const, updates: [] as string[] }), decode })
    expect(String(yield* storage.read.pipe(Effect.result))).toContain("claude-code-unsafe-path")
    expect(yield* fs.readDirectoryEntries(target)).toEqual([])
    expect((yield* fs.stat(target)).mode & 0o777).toBe(0o755)
  }), 60_000)
}

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
