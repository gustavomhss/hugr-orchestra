import { createHash, randomUUID } from "node:crypto"
import { chmodSync, closeSync, existsSync, lstatSync, mkdirSync, openSync } from "node:fs"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import type { LiveOutbox, OutboxErrorReason, OutboxRecord, OutboxTarget } from "./live-outbox-contract"
import type { MeetingSegment } from "./live-meeting-client"

const MAX_BYTES = 64 * 1024 * 1024
const MAX_IDS = 100000
const MAX_RECORDS = 128
const MAX_METADATA = 16 * 1024
const MAX_SEGMENT = 256 * 1024
const MAX_BATCH = 1024 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const SHA256 = /^[0-9a-f]{64}$/
const TABLES = [
  "CREATE TABLE outbox_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)",
  "CREATE TABLE outbox_record(id TEXT PRIMARY KEY,body TEXT NOT NULL,body_bytes INTEGER NOT NULL CHECK(body_bytes>=0))",
  "CREATE TABLE outbox_receipt(id TEXT PRIMARY KEY,record_id TEXT NOT NULL REFERENCES outbox_record(id) ON DELETE CASCADE,sha256 TEXT NOT NULL,body_bytes INTEGER NOT NULL CHECK(body_bytes>=0),UNIQUE(record_id,id))",
  "CREATE TABLE outbox_segment(seq INTEGER PRIMARY KEY AUTOINCREMENT,record_id TEXT NOT NULL,id TEXT NOT NULL UNIQUE,body TEXT NOT NULL,body_bytes INTEGER NOT NULL CHECK(body_bytes>=0),FOREIGN KEY(record_id,id) REFERENCES outbox_receipt(record_id,id) ON DELETE CASCADE)",
]
const INDEXES = [
  "CREATE INDEX outbox_segment_record_seq ON outbox_segment(record_id,seq)",
  "CREATE INDEX outbox_receipt_record ON outbox_receipt(record_id)",
]
// Reject oversized corrupt bodies inside SQLite before materializing transcript strings in Node.
const PENDING = `SELECT s.id,s.record_id,CASE WHEN length(CAST(s.body AS BLOB))<=${MAX_SEGMENT} THEN s.body END AS body,s.body_bytes,r.record_id AS receipt_record_id,r.sha256,r.body_bytes AS receipt_bytes FROM outbox_segment s LEFT JOIN outbox_receipt r ON r.id=s.id WHERE s.record_id=?`

export class OutboxError extends Error {
  readonly reason: OutboxErrorReason

  constructor(reason: OutboxErrorReason) {
    super("Live delivery storage refused the operation.")
    this.name = "OutboxError"
    this.reason = reason
  }
}

export function openLiveOutbox(userData: string): LiveOutbox {
  const db = openDatabase(userData)
  try {
    const profileID = initialize(db)
    db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON")
    if (db.prepare("PRAGMA journal_mode").get()?.journal_mode !== "wal") throw new OutboxError("storage")
    let closed = false

    function usage() {
      const row = db.prepare("SELECT (SELECT COALESCE(sum(body_bytes),0) FROM outbox_record)+(SELECT COALESCE(sum(body_bytes),0) FROM outbox_segment)+(SELECT COALESCE(sum(body_bytes),0) FROM outbox_receipt) AS used,(SELECT count(*) FROM outbox_record) AS records,(SELECT count(*) FROM outbox_receipt) AS ids,EXISTS(SELECT 1 FROM outbox_record WHERE body_bytes!=length(CAST(body AS BLOB))) OR EXISTS(SELECT 1 FROM outbox_segment WHERE body_bytes!=length(CAST(body AS BLOB))) OR EXISTS(SELECT 1 FROM outbox_receipt WHERE body_bytes!=length(CAST(json_object('recordID',record_id,'segmentID',id,'sha256',sha256) AS BLOB))) AS inconsistent").get()
      if (row?.inconsistent !== 0) throw new OutboxError("storage")
      return { used: integer(row?.used), records: integer(row?.records), ids: integer(row?.ids) }
    }

    function access<A>(write: boolean, body: () => A): A {
      if (closed) throw new OutboxError("closed")
      try {
        db.exec(write ? "BEGIN IMMEDIATE" : "BEGIN")
        try {
          usage()
          const result = body()
          if (write) {
            const current = usage()
            if (current.used > MAX_BYTES || current.records > MAX_RECORDS || current.ids > MAX_IDS) throw new OutboxError("quota")
          }
          db.exec("COMMIT")
          return result
        } catch (error) {
          db.exec("ROLLBACK")
          throw error
        }
      } catch (error) { throw error instanceof OutboxError ? error : new OutboxError("storage") }
    }

    function readRecord(id: string): OutboxRecord {
      const row = db.prepare(`SELECT CASE WHEN length(CAST(body AS BLOB))<=${MAX_METADATA} THEN body END AS body,body_bytes FROM outbox_record WHERE id=?`).get(id)
      if (!row) throw new OutboxError("missing")
      try {
        if (typeof row.body !== "string" || bytes(row.body) !== row.body_bytes || bytes(row.body) > MAX_METADATA) throw new OutboxError("storage")
        const record = recordValue(JSON.parse(row.body), profileID)
        if (record.id !== id || JSON.stringify(record) !== row.body) throw new OutboxError("storage")
        return record
      } catch { throw new OutboxError("storage") }
    }

    function writeRecord(record: OutboxRecord) {
      const body = JSON.stringify(recordValue(record, profileID))
      if (bytes(body) > MAX_METADATA) throw new OutboxError("quota")
      db.prepare("UPDATE outbox_record SET body=?,body_bytes=? WHERE id=?").run(body, bytes(body), record.id)
    }

    function summary(record: OutboxRecord) {
      const row = db.prepare("SELECT (SELECT count(*) FROM outbox_segment WHERE record_id=?) AS pending,(SELECT COALESCE(sum(body_bytes),0) FROM outbox_segment WHERE record_id=?) AS bytes,(SELECT count(*) FROM outbox_receipt WHERE record_id=?) AS remembered").get(record.id, record.id, record.id)
      const pendingCount = integer(row?.pending), pendingBytes = integer(row?.bytes), rememberedCount = integer(row?.remembered)
      if (pendingCount > rememberedCount || rememberedCount > MAX_IDS || pendingBytes > MAX_BYTES) throw new OutboxError("storage")
      return { ...record, pendingCount, pendingBytes, rememberedCount }
    }

    function records() {
      const rows = db.prepare("SELECT id FROM outbox_record ORDER BY rowid").all()
      if (rows.length > MAX_RECORDS) throw new OutboxError("storage")
      return rows.map((row) => {
        if (!validUUID(row.id)) throw new OutboxError("storage")
        return readRecord(row.id)
      })
    }

    access(false, () => {
      const current = usage()
      if (current.used > MAX_BYTES || current.records > MAX_RECORDS || current.ids > MAX_IDS) throw new OutboxError("storage")
      records()
    })

    return {
      profileID,
      assertCanCreate: () => access(false, () => {
        const current = usage()
        if (current.records >= MAX_RECORDS || current.ids >= MAX_IDS || MAX_BYTES - current.used < MAX_METADATA) throw new OutboxError("quota")
      }),
      create: (input) => access(true, () => {
        const value = object(input), target = targetValue(value.target), meeting = object(value.meeting)
        if (target.profileID !== profileID) throw new OutboxError("conflict")
        const record = recordValue({
          id: value.id, target, meeting, closeRequested: false, sealed: false, status: "interrupted", failures: 0,
        }, profileID)
        const body = JSON.stringify(record)
        if (bytes(body) > MAX_METADATA) throw new OutboxError("quota")
        if (db.prepare("SELECT id FROM outbox_record WHERE id=?").get(record.id)) throw new OutboxError("conflict")
        db.prepare("INSERT INTO outbox_record(id,body,body_bytes) VALUES(?,?,?)").run(record.id, body, bytes(body))
        return summary(record)
      }),
      append: (id, input) => access(true, () => {
        const record = readRecord(id), segment = segmentValue(input), body = JSON.stringify(segment)
        if (bytes(body) > MAX_SEGMENT) throw new OutboxError("quota")
        const sha256 = digest(body), receipt = db.prepare("SELECT id,record_id,sha256,body_bytes FROM outbox_receipt WHERE id=?").get(segment.id)
        if (receipt) {
          checkReceipt(receipt)
          if (receipt.record_id !== id || receipt.sha256 !== sha256) throw new OutboxError("conflict")
          const pending = db.prepare(`${PENDING} AND s.id=?`).get(id, segment.id)
          if (pending) pendingValue(pending)
          return "duplicate" as const
        }
        if (record.sealed) throw new OutboxError("closed")
        db.prepare("INSERT INTO outbox_receipt(id,record_id,sha256,body_bytes) VALUES(?,?,?,?)").run(segment.id, id, sha256, receiptBytes(id, segment.id, sha256))
        db.prepare("INSERT INTO outbox_segment(record_id,id,body,body_bytes) VALUES(?,?,?,?)").run(id, segment.id, body, bytes(body))
        return "accepted" as const
      }),
      requestClose: (id) => access(true, () => {
        const record = readRecord(id)
        if (!record.closeRequested) writeRecord({ ...record, closeRequested: true })
      }),
      seal: (id) => access(true, () => {
        const record = readRecord(id)
        if (!record.sealed) writeRecord({ ...record, sealed: true })
      }),
      acknowledge: (id, ids) => access(true, () => {
        const record = readRecord(id)
        if (!Array.isArray(ids) || ids.length > 128 || ids.some((item) => !validUUID(item)) || new Set(ids).size !== ids.length) throw new OutboxError("invalid")
        if (!ids.length) return
        ids.forEach((item) => {
          const receipt = db.prepare("SELECT id,record_id,sha256,body_bytes FROM outbox_receipt WHERE id=?").get(item)
          if (!receipt || receipt.record_id !== id) throw new OutboxError("conflict")
          checkReceipt(receipt)
        })
        const present = ids.filter((item) => db.prepare("SELECT id FROM outbox_segment WHERE record_id=? AND id=?").get(id, item))
        // Retained receipts distinguish a repeated ACK from progress; a no-op must not reset retry state.
        if (!present.length) return
        const prefix = db.prepare(`${PENDING} ORDER BY s.seq LIMIT ?`).all(id, ids.length)
        if (present.length !== ids.length || prefix.length !== ids.length || prefix.some((row, index) => row.id !== ids[index])) throw new OutboxError("conflict")
        prefix.forEach(pendingValue)
        ids.forEach((item) => db.prepare("DELETE FROM outbox_segment WHERE record_id=? AND id=?").run(id, item))
        writeRecord({ ...record, failures: 0 })
      }),
      complete: (id, confirmed) => access(true, () => {
        const record = readRecord(id), proof = object(confirmed), target = targetValue(proof.target)
        if (!record.closeRequested || !record.sealed || summary(record).pendingCount) throw new OutboxError("closed")
        if (JSON.stringify(target) !== JSON.stringify(record.target) || proof.meetingID !== record.meeting.id || proof.sessionID !== record.meeting.sessionID || proof.timeStarted !== record.meeting.timeStarted || !finite(proof.timeEnded)) throw new OutboxError("conflict")
        db.prepare("DELETE FROM outbox_record WHERE id=?").run(id)
      }),
      setStatus: (id, input) => access(true, () => {
        const record = readRecord(id), value = object(input)
        writeRecord(recordValue({ ...record, status: value.status, reason: value.reason, failures: value.failures }, profileID))
      }),
      summary: (id) => access(false, () => summary(readRecord(id))),
      list: () => access(false, () => records().map(summary)),
      batch: (id) => access(false, () => {
        const record = readRecord(id), segments: MeetingSegment[] = []
        let used = bytes(JSON.stringify({ meetingID: record.meeting.id, segments: [] }))
        for (const row of db.prepare(`${PENDING} ORDER BY s.seq LIMIT 128`).iterate(id)) {
          const segment = pendingValue(row), extra = bytes(JSON.stringify(segment)) + (segments.length ? 1 : 0)
          if (used + extra > MAX_BATCH) break
          segments.push(segment)
          used += extra
        }
        return { record, segments, ids: segments.map((segment) => segment.id) }
      }),
      export: (id) => access(false, () => {
        const record = readRecord(id), segments = db.prepare(`${PENDING} ORDER BY s.seq`).all(id).map(pendingValue)
        const pending = new Set(segments.map((segment) => segment.id))
        const receipts = db.prepare("SELECT id,record_id,sha256,body_bytes FROM outbox_receipt WHERE record_id=? ORDER BY rowid").all(id).map((row) => {
          checkReceipt(row)
          return { id: String(row.id), sha256: String(row.sha256), acknowledged: !pending.has(String(row.id)) }
        })
        return { record, segments, receipts }
      }),
      discard: (id) => access(true, () => {
        readRecord(id)
        db.prepare("DELETE FROM outbox_record WHERE id=?").run(id)
      }),
      close() {
        if (closed) return
        try { db.close(); closed = true } catch { throw new OutboxError("storage") }
      },
    }
  } catch {
    try { db.close() } catch { throw new OutboxError("storage") }
    throw new OutboxError("storage")
  }
}

function openDatabase(userData: string) {
  try {
    const directory = join(userData, "live-outbox"), filename = join(directory, "outbox.sqlite")
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    if (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink()) throw new OutboxError("storage")
    if (process.platform !== "win32") chmodSync(directory, 0o700)
    for (const entry of [filename, `${filename}-wal`, `${filename}-shm`]) {
      const stat = lstatSync(entry, { throwIfNoEntry: false })
      if (stat && (!stat.isFile() || stat.isSymbolicLink())) throw new OutboxError("storage")
    }
    if (!existsSync(filename)) closeSync(openSync(filename, "wx", 0o600))
    if (process.platform !== "win32") chmodSync(filename, 0o600)
    return new DatabaseSync(filename)
  } catch { throw new OutboxError("storage") }
}

function initialize(db: DatabaseSync) {
  db.exec("PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL; BEGIN IMMEDIATE")
  try {
    const version = db.prepare("PRAGMA user_version").get()?.user_version
    const objects = db.prepare("SELECT type,name,sql FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'").all()
    const tables = objects.filter((row) => row.type === "table")
    if (objects.some((row) => row.type === "view")) throw new OutboxError("storage")
    if (version === 0 && !tables.length) {
      if (objects.length) throw new OutboxError("storage")
      db.exec([...TABLES, ...INDEXES, "PRAGMA user_version=1"].join(";"))
      db.prepare("INSERT INTO outbox_meta(key,value) VALUES('profile_id',?)").run(randomUUID())
    }
    if (version !== 0 || tables.length) {
      const normalize = (sql: string) => sql.replace(/\s+/g, "").toLowerCase()
      if (version !== 1 || tables.length !== TABLES.length || tables.some((row) => typeof row.sql !== "string" || !TABLES.some((expected) => normalize(expected) === normalize(String(row.sql))))) throw new OutboxError("storage")
      const indexes = objects.filter((row) => row.type === "index" && row.sql !== null)
      if (INDEXES.some((expected) => !indexes.some((row) => typeof row.sql === "string" && normalize(row.sql) === normalize(expected)))) throw new OutboxError("storage")
    }
    const profile = db.prepare("SELECT value FROM outbox_meta WHERE key='profile_id'").get()?.value
    if (!validUUID(profile) || db.prepare("SELECT count(*) AS count FROM outbox_meta").get()?.count !== 1 || db.prepare("PRAGMA quick_check(1)").get()?.quick_check !== "ok" || db.prepare("PRAGMA foreign_key_check").get()) throw new OutboxError("storage")
    db.exec("COMMIT")
    return profile
  } catch {
    db.exec("ROLLBACK")
    throw new OutboxError("storage")
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new OutboxError("invalid")
  return value as Record<string, unknown>
}

function validUUID(value: unknown): value is string { return typeof value === "string" && value.length === 36 && UUID.test(value) }
function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) }
function bytes(value: string) { return Buffer.byteLength(value, "utf8") }
function digest(body: string) { return createHash("sha256").update(body, "utf8").digest("hex") }
function receiptBytes(recordID: string, segmentID: string, sha256: string) { return bytes(JSON.stringify({ recordID, segmentID, sha256 })) }

function integer(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new OutboxError("storage")
  return value
}

function targetValue(input: unknown): OutboxTarget {
  const value = object(input)
  if (!validUUID(value.profileID) || (value.mode !== "owned" && value.mode !== "shared") || typeof value.authority !== "string" || typeof value.directory !== "string" || !value.directory) throw new OutboxError("invalid")
  const url = URL.parse(value.authority)
  if (!url || !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.origin !== value.authority) throw new OutboxError("invalid")
  return { profileID: value.profileID, mode: value.mode, authority: value.authority, directory: value.directory }
}

function recordValue(input: unknown, profileID: string): OutboxRecord {
  const value = object(input), meeting = object(value.meeting), target = targetValue(value.target)
  const status = (["sending", "paused", "blocked", "interrupted", "storage-error"] as const).find((status) => status === value.status)
  const reason = (["offline", "deadline", "authentication", "target", "missing", "ended", "conflict", "storage", "quota", "shutdown"] as const).find((reason) => reason === value.reason)
  if (!validUUID(value.id) || target.profileID !== profileID || typeof meeting.id !== "string" || !meeting.id || typeof meeting.sessionID !== "string" || !meeting.sessionID || !finite(meeting.timeStarted) || typeof meeting.title !== "string" || typeof value.closeRequested !== "boolean" || typeof value.sealed !== "boolean" || !status || (value.reason !== undefined && !reason) || typeof value.failures !== "number" || !Number.isSafeInteger(value.failures) || value.failures < 0) throw new OutboxError("invalid")
  if (bytes(meeting.title) > 4096) throw new OutboxError("quota")
  return {
    id: value.id, target,
    meeting: { id: meeting.id, sessionID: meeting.sessionID, timeStarted: meeting.timeStarted, title: meeting.title },
    closeRequested: value.closeRequested, sealed: value.sealed, status,
    ...(reason ? { reason } : {}), failures: value.failures,
  }
}

function segmentValue(input: unknown): MeetingSegment {
  const value = object(input)
  if (!validUUID(value.id) || (value.track !== "me" && value.track !== "them") || typeof value.text !== "string" || !finite(value.startMs) || !finite(value.endMs)) throw new OutboxError("invalid")
  return { id: value.id, track: value.track, text: value.text, startMs: value.startMs, endMs: value.endMs }
}

function checkReceipt(row: Record<string, unknown>) {
  if (!validUUID(row.id) || !validUUID(row.record_id) || typeof row.sha256 !== "string" || row.sha256.length !== 64 || !SHA256.test(row.sha256) || row.body_bytes !== receiptBytes(row.record_id, row.id, row.sha256)) throw new OutboxError("storage")
}

function pendingValue(row: Record<string, unknown>): MeetingSegment {
  try {
    if (typeof row.body !== "string" || bytes(row.body) !== row.body_bytes || bytes(row.body) > MAX_SEGMENT || row.record_id !== row.receipt_record_id) throw new OutboxError("storage")
    const segment = segmentValue(JSON.parse(row.body))
    checkReceipt({ id: row.id, record_id: row.receipt_record_id, sha256: row.sha256, body_bytes: row.receipt_bytes })
    if (segment.id !== row.id || JSON.stringify(segment) !== row.body || digest(row.body) !== row.sha256) throw new OutboxError("storage")
    return segment
  } catch { throw new OutboxError("storage") }
}
