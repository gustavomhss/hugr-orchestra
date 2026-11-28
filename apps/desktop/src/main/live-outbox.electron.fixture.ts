import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"
import { app } from "electron"
import type { DatabaseSync } from "node:sqlite"
import type { LiveOutbox } from "./live-outbox-contract"

void capability().then(async (report) => {
  await new Promise<void>((resolve, reject) => process.stdout.write(`live-outbox-electron-proof:${JSON.stringify(report)}\n`, (error) => error ? reject(error) : resolve()))
  app.exit(0)
}).catch((error: unknown) => {
  process.stderr.write(`${JSON.stringify({ kind: "live-outbox-electron-failure", name: error instanceof Error ? error.name : "unknown", message: error instanceof Error ? error.message.slice(0, 512) : "unknown" })}\n`, () => app.exit(1))
})

async function capability() {
  let store: LiveOutbox | undefined
  let checker: DatabaseSync | undefined
  try {
    const root = process.env.LIVE_OUTBOX_ELECTRON_ROOT, version = process.env.LIVE_OUTBOX_ELECTRON_VERSION
    assert.ok(root && version)
    assert.equal(process.env.ELECTRON_RUN_AS_NODE, undefined)
    assert.equal(process.type, "browser")
    assert.equal(process.versions.electron, version)
    assert.ok(process.pid > 0)
    const profile = join(root, "profile")
    app.setPath("userData", profile)
    app.commandLine.appendSwitch("disable-gpu")
    await app.whenReady()
    assert.equal(app.getPath("userData"), profile)
    // A missing Electron builtin must reach this owned failure/exit path, not fail entry loading.
    const require = createRequire(join(root, "main.cjs"))
    const { openLiveOutbox } = require(join(root, "store.cjs")) as typeof import("./live-outbox")
    const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite")
    const recordID = "00000000-0000-4000-8000-000000000001"
    const segment = { id: "00000000-0000-4000-8000-000000000002", track: "me" as const, text: "Electron SQLite retained café e\u0301", startMs: 0, endMs: 100 }
    store = openLiveOutbox(profile)
    const profileID = store.profileID
    const created = store.create({ id: recordID, target: { profileID, mode: "owned", authority: "http://127.0.0.1:43123", directory: "/remote/exact/../workspace" }, meeting: { id: "mtg_electron_capability", sessionID: "ses_electron_capability", timeStarted: 1700000000000, title: "Electron capability" } })
    assert.equal(store.append(recordID, segment), "accepted")
    const before = store.summary(recordID)
    assert.equal(before.pendingCount, 1); assert.equal(before.rememberedCount, 1)
    store.close(); store = undefined
    store = openLiveOutbox(profile)
    assert.equal(store.profileID, profileID)
    const reopened = store.summary(recordID), batch = store.batch(recordID)
    assert.deepEqual(reopened, before)
    assert.deepEqual(batch.record, store.export(recordID).record)
    assert.equal(batch.record.id, created.id)
    assert.deepEqual(batch.ids, [segment.id]); assert.deepEqual(batch.segments, [segment])
    const segmentDigest = createHash("sha256").update(JSON.stringify(batch.segments[0]), "utf8").digest("hex")
    const reopenedProfileID = store.profileID
    store.close(); store = undefined
    checker = new DatabaseSync(join(profile, "live-outbox", "outbox.sqlite"), { readOnly: true })
    const rows = checker.prepare("PRAGMA integrity_check").all()
    assert.equal(rows.length, 1); assert.equal(rows[0]?.integrity_check, "ok")
    const sqlite = checker.prepare("SELECT sqlite_version() AS version").get()?.version
    assert.equal(typeof sqlite, "string")
    checker.close(); checker = undefined
    return { kind: "live-outbox-electron-capability", pid: process.pid, ppid: process.ppid, processType: process.type,
      electron: process.versions.electron, node: process.versions.node, sqlite, ...(process.versions.sqlite ? { runtimeSQLite: process.versions.sqlite } : {}), userData: app.getPath("userData"),
      profileID, reopenedProfileID, recordID: reopened.id, segmentID: batch.ids[0], batchIDs: batch.ids,
      pendingCount: reopened.pendingCount, rememberedCount: reopened.rememberedCount, segmentDigest, integrity: rows[0]?.integrity_check,
      storeBundleHash: createHash("sha256").update(readFileSync(join(root, "store.cjs"))).digest("hex"), mainBundleHash: createHash("sha256").update(readFileSync(join(root, "main.cjs"))).digest("hex") }
  } finally {
    try { store?.close() } finally { checker?.close() }
  }
}
