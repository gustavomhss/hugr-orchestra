import assert from "node:assert/strict"
import path from "node:path"
import { unlink } from "node:fs/promises"
import { Effect } from "effect"
import { FSUtil } from "@orchestra/core/fs-util"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { ClaudeCodeStorage } from "../../../src/claude-code/storage"
import { openDatabase } from "../../../src/claude-code/sqlite"

export async function verify(root: string) {
  const file = path.join(root, "driver.sqlite")
  const db = await openDatabase(file)
  const contender = await openDatabase(file)
  const primary = new Error("ROLLBACK MUST_KEEP")
  try {
    db.exec("CREATE TABLE probe (value TEXT); PRAGMA busy_timeout=1")
    contender.exec("PRAGMA busy_timeout=1")
    db.transaction(() => assert.throws(() => contender.transaction(() => {}).immediate(), /locked|busy/i)).immediate()
    assert.throws(() => db.transaction(() => { db.query("INSERT INTO probe VALUES (?)").run("lost"); throw primary }).immediate(), (error) => error === primary)
    assert.deepEqual(db.query("SELECT value FROM probe").all(), [])
    db.transaction(() => db.query("INSERT INTO probe VALUES (?)").run("kept")).immediate()
    assert.equal(db.query<{ value: string }>("SELECT value FROM probe").get()?.value, "kept")
    assert.throws(() => db.transaction(() => { db.exec("ROLLBACK"); throw primary }).immediate(), (error) =>
      error instanceof AggregateError && error.errors[0] === primary && error.errors[1] instanceof Error)
  } finally { contender.close(); db.close() }
  await unlink(file) // Windows refuses this when a retained Bun statement keeps the connection open.
  await Effect.runPromise(Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const directory = path.join(root, "archive")
    yield* fs.makeDirectory(directory)
    yield* fs.writeFileString(path.join(directory, "archive.json"), JSON.stringify({ owner: "private-test", updates: ["legacy"] }))
    yield* fs.writeFileString(path.join(directory, "archive.sqlite"), "")
    const storage = ClaudeCodeStorage.create({ fs, directory: Effect.succeed(directory), empty: () => ({ owner: "private-test", updates: [] as string[] }),
      decode: (text) => { const state = JSON.parse(text) as { owner: string; updates: string[] }; assert.equal(state.owner, "private-test"); return state } })
    assert.deepEqual((yield* storage.read).updates, ["legacy"])
    assert.equal(yield* fs.readFileString(path.join(directory, "archive.sqlite.initialized")), "initialized\n")
    assert.equal((yield* storage.modify((state) => { state.updates.push("lost"); throw primary }).pipe(Effect.result))._tag, "Failure")
    assert.deepEqual((yield* storage.read).updates, ["legacy"])
    if (process.platform !== "win32") {
      assert.equal((yield* fs.stat(directory)).mode & 0o777, 0o700)
      assert.equal((yield* fs.stat(path.join(directory, "archive.sqlite"))).mode & 0o777, 0o600)
    }
    const raw = yield* Effect.promise(() => openDatabase(path.join(directory, "archive.sqlite")))
    try {
      assert.equal(raw.query<{ application_id: number }>("PRAGMA application_id").get()?.application_id, 0x4f434343)
      assert.equal(raw.query<{ user_version: number }>("PRAGMA user_version").get()?.user_version, 1)
      raw.exec("DELETE FROM native_state")
    } finally { raw.close() }
    assert.equal((yield* storage.read.pipe(Effect.result))._tag, "Failure")
    yield* fs.remove(path.join(directory, "archive.sqlite.initialized"))
    yield* fs.makeDirectory(path.join(directory, "archive.sqlite.initialized"))
    assert.match(String(yield* storage.read.pipe(Effect.result)), /claude-code-unsafe-path/)
  }).pipe(Effect.provide(LayerNode.compile(FSUtil.node))))
}

if (!process.versions.bun) {
  // Deliberately emulate hosts with a Bun compatibility global, without changing runtime identity.
  Object.defineProperty(globalThis, "Bun", { value: {}, configurable: true })
  await verify(process.argv[2])
  console.log("NODE_PRIVATE_SQLITE_OK")
}
