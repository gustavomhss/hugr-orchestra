import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { test, type TestContext } from "node:test"
import { openLiveOutbox, OutboxError } from "./live-outbox.ts"
import { pragmaTrigger } from "./live-outbox-control.node.test.ts"
import type { OutboxErrorReason, RemoteClosed } from "./live-outbox-contract.ts"
import type { MeetingSegment } from "./live-meeting-client.ts"

const LIMIT = 64 * 1024 * 1024
const SEGMENT = 256 * 1024
const uuid = (index: number) => `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`
const segment = (index: number, text = "retained café e\u0301") => ({ id: uuid(index), track: "me" as const, text, startMs: 0, endMs: 100 })
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), "utf8")
const digest = (value: MeetingSegment) => createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex")
const receiptBytes = (recordID: string, item: MeetingSegment) => bytes({ recordID, segmentID: item.id, sha256: digest(item) })

function refused(operation: () => unknown, reason?: OutboxErrorReason) {
  assert.throws(operation, (error: unknown) => {
    assert.ok(error instanceof OutboxError)
    assert.ok(["storage", "quota", "invalid", "conflict", "missing", "closed"].includes(error.reason))
    if (reason) assert.equal(error.reason, reason)
    assert.ok(error.message.length > 0 && error.message.length <= 128)
    assert.ok(!error.message.includes("retained café") && !error.message.includes("private-secret"))
    assert.equal(error.cause, undefined)
    return true
  })
}

function temporary(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "live-outbox-node-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return root
}

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "live-outbox-node-"))
  const owned: { close(): void }[] = []
  t.after(() => {
    try { owned.reverse().forEach((handle) => handle.close()) }
    finally { rmSync(root, { recursive: true, force: true }) }
  })
  const open = () => { const store = openLiveOutbox(root); owned.push(store); return store }
  const store = open()
  const filename = join(root, "live-outbox", "outbox.sqlite")
  const sql = new DatabaseSync(filename)
  owned.push(sql)
  sql.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=0")
  const input = (index = 0) => ({
    id: uuid(index), target: { profileID: store.profileID, mode: "owned" as const, authority: "http://127.0.0.1:43123", directory: "/remote/literal/../workspace" },
    meeting: { id: `mtg_fixture_${index}`, sessionID: `ses_fixture_${index}`, timeStarted: 1700000000000, title: "Meeting café" },
  })
  const record = store.create(input())
  const usage = () => {
    const row = sql.prepare("SELECT (SELECT COALESCE(sum(body_bytes),0) FROM outbox_record)+(SELECT COALESCE(sum(body_bytes),0) FROM outbox_segment)+(SELECT COALESCE(sum(body_bytes),0) FROM outbox_receipt) AS used,(SELECT count(*) FROM outbox_record) AS records,(SELECT count(*) FROM outbox_segment) AS pending,(SELECT count(*) FROM outbox_receipt) AS remembered").get()
    return { used: Number(row?.used), records: Number(row?.records), pending: Number(row?.pending), remembered: Number(row?.remembered) }
  }
  const confirmed = (): RemoteClosed => ({ target: record.target, meetingID: record.meeting.id, sessionID: record.meeting.sessionID, timeStarted: record.meeting.timeStarted, timeEnded: record.meeting.timeStarted + 1000 })
  return { root, filename, store, sql, open, input, record, usage, confirmed }
}

// The exact frozen SQL ports permit boundary setup in one real transaction, not 100000 fsynced public appends.
function seed(sql: DatabaseSync, recordID: string, items: ReadonlyArray<MeetingSegment>, acknowledged = false) {
  const receipt = sql.prepare("INSERT INTO outbox_receipt(id,record_id,sha256,body_bytes) VALUES(?,?,?,?)")
  const pending = sql.prepare("INSERT INTO outbox_segment(record_id,id,body,body_bytes) VALUES(?,?,?,?)")
  sql.exec("BEGIN IMMEDIATE")
  try {
    items.forEach((item) => {
      receipt.run(item.id, recordID, digest(item), receiptBytes(recordID, item))
      if (!acknowledged) pending.run(recordID, item.id, JSON.stringify(item), bytes(item))
    })
    sql.exec("COMMIT")
  } catch (error) { sql.exec("ROLLBACK"); throw error }
}

function padded(index: number, size: number) {
  const item = segment(index, "")
  return { ...item, text: "x".repeat(size - bytes(item)) }
}

function seedTo(sql: DatabaseSync, recordID: string, current: number, target: number) {
  const items: MeetingSegment[] = []
  const fee = receiptBytes(recordID, segment(1000, ""))
  const full = SEGMENT + fee
  const minimum = bytes(segment(1000, "")) + fee
  const count = Math.floor((target - current) / full)
  for (let index = 0; index < count; index++) items.push(padded(1000 + index, SEGMENT))
  const remainder = target - current - count * full
  if (remainder >= minimum) items.push(padded(1000 + count, remainder - fee))
  if (remainder > 0 && remainder < minimum) {
    items[0] = padded(1000, SEGMENT - minimum + remainder)
    items.push(padded(1000 + count, minimum - fee))
  }
  seed(sql, recordID, items)
}

test("initializes one stable lowercase profile with versioned schema, WAL, FULL and private paths", (t) => {
  const f = fixture(t)
  assert.match(f.store.profileID, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.equal(f.sql.prepare("PRAGMA user_version").get()?.user_version, 1)
  assert.equal(f.sql.prepare("PRAGMA journal_mode").get()?.journal_mode, "wal")
  assert.equal(f.sql.prepare("SELECT value FROM outbox_meta WHERE key='profile_id'").get()?.value, f.store.profileID)
  f.sql.exec(pragmaTrigger("outbox_record"))
  f.store.create(f.input(1)) // The trigger inspects the STORE connection, not the observer connection's default.
  if (process.platform !== "win32") {
    assert.equal(statSync(join(f.root, "live-outbox")).mode & 0o777, 0o700)
    assert.equal(statSync(f.filename).mode & 0o777, 0o600)
  }
  f.store.close()
  assert.equal(f.open().profileID, f.store.profileID)
})

test("commits append synchronously, reopens exact Unicode content and exports immutable digest evidence", (t) => {
  const f = fixture(t), item = segment(1), original = { ...item }
  assert.equal(f.store.append(f.record.id, item), "accepted")
  assert.equal(f.sql.prepare("SELECT body_bytes FROM outbox_segment").get()?.body_bytes, bytes(original))
  item.text = "changed after admission"
  f.store.close()
  const reopened = f.open(), exported = reopened.export(f.record.id)
  assert.deepEqual(exported.segments, [original])
  assert.deepEqual(exported.receipts, [{ id: original.id, sha256: digest(original), acknowledged: false }])
  assert.equal(reopened.summary(f.record.id).pendingBytes, bytes(original))
  assert.equal(reopened.summary(f.record.id).rememberedCount, 1)
})

test("new records are interrupted, open, unsealed and keep exact historical target and remote tuple", (t) => {
  const f = fixture(t)
  assert.equal(f.record.status, "interrupted"); assert.equal(f.record.failures, 0)
  assert.equal(f.record.closeRequested, false); assert.equal(f.record.sealed, false)
  assert.equal(f.record.pendingCount, 0); assert.equal(f.record.rememberedCount, 0)
  assert.deepEqual(f.record.target, f.input().target); assert.deepEqual(f.record.meeting, f.input().meeting)
  assert.equal(f.record.target.directory, "/remote/literal/../workspace")
})

test("same ID and exact digest before ACK is an uncharged duplicate", (t) => {
  const f = fixture(t), item = segment(1)
  f.store.append(f.record.id, item); const before = f.usage()
  assert.equal(f.store.append(f.record.id, { ...item }), "duplicate")
  assert.deepEqual(f.usage(), before); assert.deepEqual(f.store.batch(f.record.id).ids, [item.id])
})

test("digest and quota use schema-projected fields independent of input key order or extra properties", (t) => {
  const f = fixture(t), item = segment(1)
  assert.equal(Reflect.apply(f.store.append, f.store, [f.record.id, { endMs: item.endMs, text: item.text, privateSecret: "private-secret", track: item.track, id: item.id, startMs: item.startMs }]), "accepted")
  assert.deepEqual(f.store.export(f.record.id).segments, [item])
  assert.deepEqual(f.store.export(f.record.id).receipts, [{ id: item.id, sha256: digest(item), acknowledged: false }])
  const usage = f.usage()
  assert.equal(f.store.append(f.record.id, item), "duplicate"); assert.deepEqual(f.usage(), usage)
})

test("ACK retains ID/digest and exact duplicate cannot requeue already acknowledged text", (t) => {
  const f = fixture(t), item = segment(1)
  f.store.append(f.record.id, item); f.store.acknowledge(f.record.id, [item.id]); const before = f.usage()
  assert.equal(f.store.append(f.record.id, item), "duplicate")
  assert.deepEqual(f.usage(), before); assert.equal(f.store.summary(f.record.id).pendingCount, 0)
  assert.deepEqual(f.store.export(f.record.id).segments, [])
  assert.deepEqual(f.store.export(f.record.id).receipts, [{ id: item.id, sha256: digest(item), acknowledged: true }])
})

test("changed content, including Unicode normalization, conflicts after ACK", (t) => {
  const f = fixture(t), item = segment(1, "e\u0301")
  f.store.append(f.record.id, item); f.store.acknowledge(f.record.id, [item.id]); const before = f.usage()
  refused(() => f.store.append(f.record.id, { ...item, text: "é" }), "conflict")
  assert.deepEqual(f.usage(), before)
})

test("an acknowledged ID remains owned by its retained record", (t) => {
  const f = fixture(t), item = segment(1)
  f.store.append(f.record.id, item); f.store.acknowledge(f.record.id, [item.id]); const other = f.store.create(f.input(2))
  refused(() => f.store.append(other.id, item), "conflict")
  assert.equal(f.store.summary(other.id).rememberedCount, 0)
})

test("close intent accepts final segments until a separate durable seal; exact sealed duplicate is idempotent", (t) => {
  const f = fixture(t), item = segment(1)
  f.store.requestClose(f.record.id); f.store.requestClose(f.record.id)
  assert.equal(f.store.append(f.record.id, item), "accepted")
  assert.equal(f.store.summary(f.record.id).sealed, false)
  f.store.seal(f.record.id); f.store.seal(f.record.id); f.store.close()
  const reopened = f.open()
  assert.equal(reopened.summary(f.record.id).closeRequested, true); assert.equal(reopened.summary(f.record.id).sealed, true)
  assert.equal(reopened.append(f.record.id, item), "duplicate")
  refused(() => reopened.append(f.record.id, segment(2)), "closed")
})

test("ACK deletes exact captured prefix while preserving a later append and committed progress resets failures", (t) => {
  const f = fixture(t), a = segment(1), b = segment(2), c = segment(3)
  f.store.append(f.record.id, a); f.store.append(f.record.id, b); const snapshot = f.store.batch(f.record.id)
  f.store.append(f.record.id, c); f.store.setStatus(f.record.id, { status: "paused", reason: "offline", failures: 7 })
  f.store.acknowledge(f.record.id, snapshot.ids)
  assert.deepEqual(f.store.batch(f.record.id).segments, [c]); assert.equal(f.store.summary(f.record.id).failures, 0)
  assert.equal(f.store.summary(f.record.id).rememberedCount, 3)
})

test("wrong order, non-prefix and partial absent/pending ACKs refuse without mutation", (t) => {
  const f = fixture(t), a = segment(1), b = segment(2)
  f.store.append(f.record.id, a); f.store.append(f.record.id, b); const before = f.usage()
  refused(() => f.store.acknowledge(f.record.id, [b.id])); refused(() => f.store.acknowledge(f.record.id, [b.id, a.id]))
  assert.deepEqual(f.usage(), before); f.store.acknowledge(f.record.id, [a.id])
  const pending = f.store.export(f.record.id)
  refused(() => f.store.acknowledge(f.record.id, [a.id, b.id])); assert.deepEqual(f.store.export(f.record.id), pending)
})

test("empty or fully repeated ACK is not progress and never resets failures or metadata", (t) => {
  const f = fixture(t), item = segment(1)
  f.store.append(f.record.id, item); f.store.acknowledge(f.record.id, [item.id])
  f.store.setStatus(f.record.id, { status: "paused", reason: "deadline", failures: 8 }); const before = f.store.summary(f.record.id), usage = f.usage()
  f.store.acknowledge(f.record.id, []); f.store.acknowledge(f.record.id, [item.id])
  assert.deepEqual(f.store.summary(f.record.id), before); assert.deepEqual(f.usage(), usage)
})

test("complete needs both producer flags and an empty queue", (t) => {
  const f = fixture(t), item = segment(1)
  refused(() => f.store.complete(f.record.id, f.confirmed()))
  f.store.requestClose(f.record.id); refused(() => f.store.complete(f.record.id, f.confirmed()))
  f.store.append(f.record.id, item); f.store.seal(f.record.id); refused(() => f.store.complete(f.record.id, f.confirmed()))
  assert.equal(f.store.summary(f.record.id).pendingCount, 1)
})

test("complete checks every immutable historical target/tuple field and finite ended, then frees all quota", (t) => {
  const f = fixture(t), item = segment(1)
  f.store.append(f.record.id, item); f.store.acknowledge(f.record.id, [item.id]); f.store.requestClose(f.record.id); f.store.seal(f.record.id)
  const proof = f.confirmed()
  for (const changed of [{ ...proof, meetingID: "mtg_foreign" }, { ...proof, sessionID: "ses_foreign" }, { ...proof, timeStarted: proof.timeStarted + 1 },
    { ...proof, timeEnded: NaN }, { ...proof, timeEnded: null }, ...["profileID", "mode", "authority", "directory"].map((key) => ({ ...proof, target: { ...proof.target, [key]: key === "authority" ? "http://127.0.0.1:43124" : "foreign" } }))])
    refused(() => Reflect.apply(f.store.complete, f.store, [f.record.id, changed]))
  f.store.complete(f.record.id, proof)
  assert.deepEqual(f.store.list(), []); assert.deepEqual(f.usage(), { used: 0, records: 0, pending: 0, remembered: 0 })
})

test("discard transactionally removes pending text and retained receipts without remote proof", (t) => {
  const f = fixture(t)
  f.store.append(f.record.id, segment(1)); f.store.append(f.record.id, segment(2)); f.store.acknowledge(f.record.id, [uuid(1)])
  f.store.discard(f.record.id); assert.deepEqual(f.usage(), { used: 0, records: 0, pending: 0, remembered: 0 })
})

test("128 retained records is inclusive and discarding frees a slot", (t) => {
  const f = fixture(t), original = f.store.export(f.record.id).record
  const insert = f.sql.prepare("INSERT INTO outbox_record(id,body,body_bytes) VALUES(?,?,?)")
  f.sql.exec("BEGIN IMMEDIATE")
  for (let index = 1; index < 127; index++) { const record = { ...original, id: uuid(index) }; insert.run(record.id, JSON.stringify(record), bytes(record)) }
  f.sql.exec("COMMIT"); f.store.assertCanCreate(); f.store.create(f.input(127))
  assert.equal(f.store.list().length, 128); refused(() => f.store.assertCanCreate(), "quota"); refused(() => f.store.create(f.input(128)), "quota")
  f.store.discard(uuid(1)); f.store.assertCanCreate(); f.store.create(f.input(128)); assert.equal(f.store.list().length, 128)
})

test("100000 remembered IDs includes ACKed receipts; one-transaction near-limit fixture exercises real final admission", (t) => {
  const f = fixture(t)
  seed(f.sql, f.record.id, Array.from({ length: 99999 }, (_, index) => segment(index + 1, "bulk")), true)
  assert.equal(f.store.summary(f.record.id).rememberedCount, 99999)
  const other = f.store.create(f.input(1)), last = segment(100000, "last")
  assert.equal(f.store.append(other.id, last), "accepted"); f.store.acknowledge(other.id, [last.id])
  assert.equal(f.store.summary(other.id).pendingCount, 0); assert.equal(f.usage().remembered, 100000)
  refused(() => f.store.assertCanCreate(), "quota")
  assert.equal(f.store.append(other.id, last), "duplicate")
  refused(() => f.store.append(f.record.id, segment(100001)), "quota"); refused(() => f.store.append(other.id, segment(100002)), "quota")
})

test("64MiB includes receipt bytes and preflight's 16KiB floor is not a reservation", (t) => {
  const f = fixture(t), current = Number(f.usage()?.used)
  seedTo(f.sql, f.record.id, current, LIMIT - 16384)
  assert.equal(f.usage()?.used, LIMIT - 16384); const before = f.usage()
  f.store.assertCanCreate(); f.store.assertCanCreate(); assert.deepEqual(f.usage(), before)
  const fee = receiptBytes(f.record.id, segment(999, "")), item = padded(999, 16384 - fee)
  assert.equal(f.store.append(f.record.id, item), "accepted"); assert.equal(f.usage()?.used, LIMIT)
  refused(() => f.store.assertCanCreate(), "quota"); refused(() => f.store.append(f.record.id, segment(998)), "quota")
  const record = f.store.export(f.record.id).record
  refused(() => f.store.setStatus(f.record.id, { status: "paused", reason: "authentication", failures: 8 }), "quota")
  assert.deepEqual(f.store.export(f.record.id).record, record); assert.equal(f.usage().used, LIMIT)
  const batch = f.store.batch(f.record.id), released = batch.segments.reduce((sum, item) => sum + bytes(item), 0)
  const remembered = f.store.summary(f.record.id).rememberedCount
  f.store.acknowledge(f.record.id, batch.ids); assert.equal(f.usage()?.used, LIMIT - released)
  assert.equal(f.store.summary(f.record.id).rememberedCount, remembered); assert.equal(f.store.append(f.record.id, segment(998)), "accepted")
})

test("metadata16KiB and title4KiB use UTF8 bytes with inclusive boundaries", (t) => {
  const f = fixture(t), record = f.store.export(f.record.id).record, input = f.input(1)
  const base = { ...record, id: input.id, target: { ...input.target, directory: "/" } }
  const target = { ...input.target, directory: "/" + "x".repeat(16384 - bytes(base)) }
  f.store.create({ ...input, target }); assert.equal(f.sql.prepare("SELECT body_bytes FROM outbox_record WHERE id=?").get(input.id)?.body_bytes, 16384)
  refused(() => f.store.create({ ...f.input(2), target: { ...target, directory: target.directory + "x" } }))
  f.store.create({ ...f.input(3), meeting: { ...f.input(3).meeting, title: "é".repeat(2048) } })
  refused(() => f.store.create({ ...f.input(4), meeting: { ...f.input(4).meeting, title: "é".repeat(2048) + "x" } }))
})

test("256KiB serialized Unicode segment is accepted intact; one more UTF8 byte refuses", (t) => {
  const f = fixture(t), base = segment(1, ""), remaining = SEGMENT - bytes(base)
  const item = { ...base, text: "é".repeat(Math.floor(remaining / 2)) + "x".repeat(remaining % 2) }
  assert.equal(bytes(item), SEGMENT); assert.equal(f.store.append(f.record.id, item), "accepted")
  assert.deepEqual(f.store.export(f.record.id).segments, [item]); assert.equal(f.store.summary(f.record.id).pendingBytes, SEGMENT)
  refused(() => f.store.append(f.record.id, { ...item, id: uuid(2), text: item.text + "x" }))
})

test("batch keeps sequence and at most128 IDs, and ACK cannot exceed128", (t) => {
  const f = fixture(t), items = Array.from({ length: 129 }, (_, index) => segment(200 - index))
  seed(f.sql, f.record.id, items)
  assert.deepEqual(f.store.batch(f.record.id).ids, items.slice(0, 128).map((item) => item.id))
  refused(() => f.store.acknowledge(f.record.id, items.map((item) => item.id)))
  f.store.acknowledge(f.record.id, f.store.batch(f.record.id).ids); assert.deepEqual(f.store.batch(f.record.id).segments, items.slice(128))
})

test("batch1MiB wire budget includes envelope and commas, not only segment bodies", (t) => {
  const f = fixture(t), items = [1, 2, 3, 4].map((index) => padded(index, SEGMENT))
  seed(f.sql, f.record.id, items); const batch = f.store.batch(f.record.id)
  assert.equal(batch.ids.length, 3); assert.ok(bytes({ meetingID: f.record.meeting.id, segments: batch.segments }) <= 1024 * 1024)
  assert.ok(bytes({ meetingID: f.record.meeting.id, segments: items }) > 1024 * 1024)
})

for (const mutation of ["append", "ack", "status"] as const) {
  test(`real SQLite ${mutation} trigger failure rolls back text, metadata, receipts and quota`, (t) => {
    const f = fixture(t), item = segment(1)
    if (mutation !== "append") f.store.append(f.record.id, item)
    f.store.setStatus(f.record.id, { status: "paused", reason: "offline", failures: 5 })
    const before = f.store.export(f.record.id), usage = f.usage(), status = f.store.summary(f.record.id)
    f.sql.exec(`CREATE TRIGGER fault BEFORE ${mutation === "append" ? "INSERT ON outbox_segment" : mutation === "ack" ? "DELETE ON outbox_segment" : "UPDATE ON outbox_record"} BEGIN SELECT RAISE(ABORT,'private-secret'); END`)
    const operation = () => mutation === "append" ? f.store.append(f.record.id, item) : mutation === "ack" ? f.store.acknowledge(f.record.id, [item.id]) : f.store.setStatus(f.record.id, { status: "blocked", reason: "storage", failures: 8 })
    refused(operation, "storage"); assert.deepEqual(f.usage(), usage); assert.deepEqual(f.store.export(f.record.id), before); assert.deepEqual(f.store.summary(f.record.id), status)
    f.sql.exec("DROP TRIGGER fault"); operation()
    if (mutation === "append") assert.equal(f.store.summary(f.record.id).pendingCount, 1)
    if (mutation === "ack") { assert.equal(f.store.summary(f.record.id).pendingCount, 0); assert.equal(f.store.summary(f.record.id).failures, 0) }
    if (mutation === "status") { f.store.close(); assert.equal(f.open().summary(f.record.id).status, "blocked") }
  })
}

test("external IMMEDIATE writer causes typed refusal without losing admission, and retry works after rollback", (t) => {
  const f = fixture(t), before = f.usage()
  f.sql.exec("BEGIN IMMEDIATE")
  try { refused(() => f.store.append(f.record.id, segment(1)), "storage") } finally { f.sql.exec("ROLLBACK") }
  assert.deepEqual(f.usage(), before); assert.equal(f.store.append(f.record.id, segment(1)), "accepted")
})

for (const damage of ["body", "bytes", "digest", "orphan"] as const) {
  test(`pending ${damage} inconsistency refuses batch/export without inventing or deleting evidence`, (t) => {
    const f = fixture(t), item = segment(1)
    f.store.append(f.record.id, item)
    if (damage === "body") { const body = JSON.stringify({ ...item, text: "private-secret" }); f.sql.prepare("UPDATE outbox_segment SET body=?,body_bytes=?").run(body, Buffer.byteLength(body)) }
    if (damage === "bytes") f.sql.exec("UPDATE outbox_segment SET body_bytes=body_bytes+1")
    if (damage === "digest") f.sql.exec(`UPDATE outbox_receipt SET sha256='${"0".repeat(64)}'`)
    if (damage === "orphan") f.sql.exec("PRAGMA foreign_keys=OFF; DELETE FROM outbox_receipt; PRAGMA foreign_keys=ON")
    const usage = f.usage()
    refused(() => f.store.batch(f.record.id), "storage"); refused(() => f.store.export(f.record.id), "storage"); assert.deepEqual(f.usage(), usage)
  })
}

test("invalid UUID, segment fields/times and mismatched target are typed refusals without mutation", (t) => {
  const f = fixture(t), item = segment(1), before = f.usage()
  for (const id of ["not-a-uuid", "ABCDABCD-ABCD-4ABC-8ABC-ABCDEFABCDEF"])
    refused(() => f.store.append(f.record.id, { ...item, id }), "invalid")
  for (const value of [{ ...item, startMs: NaN }, { ...item, endMs: Infinity }, { ...item, track: "other" }, { ...item, text: 42 }])
    refused(() => Reflect.apply(f.store.append, f.store, [f.record.id, value]), "invalid")
  for (const target of [{ ...f.input(1).target, profileID: uuid(800) }, { ...f.input(1).target, authority: "http://private-secret@localhost" }, { ...f.input(1).target, authority: "HTTP://LOCALHOST:80/" }])
    refused(() => f.store.create({ ...f.input(1), target }))
  assert.deepEqual(f.usage(), before)
})

test("unknown records refuse and closed handles refuse every operation while close itself is idempotent", (t) => {
  const f = fixture(t)
  refused(() => f.store.summary(uuid(900)), "missing"); f.store.close(); f.store.close()
  for (const operation of [() => f.store.assertCanCreate(), () => f.store.create(f.input(2)), () => f.store.append(f.record.id, segment(1)),
    () => f.store.requestClose(f.record.id), () => f.store.seal(f.record.id), () => f.store.acknowledge(f.record.id, []),
    () => f.store.complete(f.record.id, f.confirmed()), () => f.store.setStatus(f.record.id, { status: "paused", failures: 1 }),
    () => f.store.summary(f.record.id), () => f.store.list(), () => f.store.batch(f.record.id), () => f.store.export(f.record.id), () => f.store.discard(f.record.id)]) refused(operation, "closed")
})

for (const damage of ["missing-profile", "invalid-profile", "version"] as const) {
  test(`recognized database ${damage} refuses reopen without reinitialization`, (t) => {
    const f = fixture(t); f.store.close()
    if (damage === "missing-profile") f.sql.exec("DELETE FROM outbox_meta WHERE key='profile_id'")
    if (damage === "invalid-profile") f.sql.exec("UPDATE outbox_meta SET value='invalid' WHERE key='profile_id'")
    if (damage === "version") f.sql.exec("PRAGMA user_version=2")
    const before = f.sql.prepare("SELECT * FROM outbox_meta").all()
    refused(() => f.open(), "storage"); assert.deepEqual(f.sql.prepare("SELECT * FROM outbox_meta").all(), before)
    assert.equal(f.sql.prepare("SELECT count(*) AS n FROM outbox_record").get()?.n, 1)
  })
}

test("corrupt, foreign schema and unexpected directory/database/WAL types are refused without deletion", (t) => {
  for (const kind of ["corrupt", "foreign", "directory-file", "database-directory"] as const) {
    const root = temporary(t), directory = join(root, "live-outbox"), filename = join(directory, "outbox.sqlite")
    if (kind === "directory-file") { writeFileSync(directory, "private-secret"); refused(() => openLiveOutbox(root), "storage"); assert.equal(readFileSync(directory, "utf8"), "private-secret"); continue }
    mkdirSync(directory)
    if (kind === "database-directory") { mkdirSync(filename); refused(() => openLiveOutbox(root), "storage"); assert.ok(statSync(filename).isDirectory()); continue }
    if (kind === "corrupt") { writeFileSync(filename, "private-secret"); refused(() => openLiveOutbox(root), "storage"); assert.equal(readFileSync(filename, "utf8"), "private-secret"); continue }
    const sql = new DatabaseSync(filename)
    try { sql.exec("CREATE TABLE foreign_data(value TEXT);INSERT INTO foreign_data VALUES('sentinel')"); refused(() => openLiveOutbox(root), "storage"); assert.equal(sql.prepare("SELECT value FROM foreign_data").get()?.value, "sentinel") } finally { sql.close() }
  }
  const root = temporary(t), filename = join(root, "live-outbox", "outbox.sqlite")
  const store = openLiveOutbox(root)
  store.close() // No observer connection retains the initialized database's WAL.
  mkdirSync(`${filename}-wal`)
  refused(() => openLiveOutbox(root), "storage"); assert.ok(statSync(`${filename}-wal`).isDirectory())
})

test("unreadable record metadata is a storage refusal, never an apparently empty list", (t) => {
  const f = fixture(t)
  f.sql.exec("UPDATE outbox_record SET body='private-secret',body_bytes=14")
  refused(() => f.store.list(), "storage"); refused(() => f.store.summary(f.record.id), "storage")
  assert.equal(f.sql.prepare("SELECT count(*) AS n FROM outbox_record").get()?.n, 1)
})
