import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import { closeSync, fsyncSync, openSync, readFileSync, writeFileSync } from "node:fs"
import { openLiveOutbox } from "./live-outbox.ts"

const mode = process.argv[2]
const directory = process.argv[3]
const marker = process.argv[4]
assert.ok(directory && marker && (mode === "commit" || mode === "reopen"))
assert.equal("bun" in process.versions, false)
const segment = {
  id: "c81e07b6-dfb1-4af1-8baa-f773a106a42a", track: "me" as const,
  text: "Committed crash fixture café e\u0301.", startMs: 0, endMs: 100,
}
const sha256 = createHash("sha256").update(JSON.stringify(segment), "utf8").digest("hex")
const store = openLiveOutbox(directory)

if (mode === "commit") {
  const record = store.create({
    id: randomUUID(),
    target: { profileID: store.profileID, mode: "owned", authority: "http://127.0.0.1:43123", directory: "/remote/exact/../workspace" },
    meeting: { id: "mtg_crash_fixture", sessionID: "ses_crash_fixture", timeStarted: 1700000000000, title: "Crash proof" },
  })
  store.requestClose(record.id)
  assert.equal(store.append(record.id, segment), "accepted")
  // This independent observation follows the synchronous committed return. Never close the store before abrupt death.
  const handle = openSync(marker, "wx", 0o600)
  try {
    writeFileSync(handle, JSON.stringify({ pid: process.pid, profileID: store.profileID, recordID: record.id, segmentID: segment.id, sha256, node: process.version }))
    fsyncSync(handle)
  } finally { closeSync(handle) }
  process.kill(process.pid, "SIGKILL")
  throw new Error("Self SIGKILL unexpectedly returned")
}

if (mode === "reopen") {
  const evidence = JSON.parse(readFileSync(marker, "utf8"))
  assert.equal(store.profileID, evidence.profileID)
  const summary = store.summary(evidence.recordID)
  assert.equal(summary.pendingCount, 1)
  assert.equal(summary.rememberedCount, 1)
  assert.equal(summary.closeRequested, true)
  assert.equal(summary.sealed, false)
  assert.equal(summary.status, "interrupted")
  assert.equal(summary.target.directory, "/remote/exact/../workspace")
  assert.equal(summary.meeting.id, "mtg_crash_fixture")
  assert.deepEqual(store.batch(evidence.recordID).segments, [segment])
  assert.deepEqual(store.batch(evidence.recordID).ids, [evidence.segmentID])
  assert.deepEqual(store.export(evidence.recordID).receipts, [{ id: segment.id, sha256, acknowledged: false }])
  assert.equal(evidence.sha256, sha256)
  store.close()
  console.log(JSON.stringify({ kind: "live-outbox-reopened", pid: process.pid, profileID: evidence.profileID, recordID: evidence.recordID, segmentID: segment.id, sha256, pendingCount: summary.pendingCount, rememberedCount: summary.rememberedCount, node: process.version }))
}
