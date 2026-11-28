import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import { closeSync, fsyncSync, openSync, readFileSync, renameSync, writeFileSync, writeSync } from "node:fs"
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
  // Any ordinary return or exception emits both witnesses; the parent must instead force abrupt death.
  process.once("exit", () => {
    writeFileSync(`${marker}.normal-exit`, "live-outbox-normal-exit", { flag: "wx", mode: 0o600 })
    writeSync(1, "live-outbox-normal-exit\n")
  })
  const idle = new Promise<void>((resolve) => setTimeout(resolve, 5000))
  // Publish only a closed, fsynced marker after the committed return and the lifetime controls above exist.
  const handle = openSync(`${marker}.pending`, "wx", 0o600)
  try {
    writeFileSync(handle, JSON.stringify({ pid: process.pid, profileID: store.profileID, recordID: record.id, segmentID: segment.id, sha256, node: process.version }))
    fsyncSync(handle)
  } finally { closeSync(handle) }
  renameSync(`${marker}.pending`, marker)
  await idle // No store.close, self-kill, or exception after COMMITTED; the owned parent must kill this live process.
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
