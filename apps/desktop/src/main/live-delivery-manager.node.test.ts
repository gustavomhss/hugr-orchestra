import assert from "node:assert/strict"
import { test, type TestContext } from "node:test"
import { createLiveDeliveryManager, LiveDeliveryError } from "./live-delivery-manager.ts"
import type { DeliveryFailureReason, LiveDeliveryOptions } from "./live-delivery-contract.ts"
import { byteLength, detail, envelope, fixture, gate, info, json, location, pause, peer, segment, sizedDetail, until, uuid } from "./live-delivery-manager-control.node.test.ts"

type Fixture = Awaited<ReturnType<typeof fixture>>
function check(name: string, body: (t: TestContext) => void | Promise<void>) { test(name, { timeout: 8000 }, body) }
async function bounded<A>(promise: Promise<A>, label: string) {
  const expired = gate<never>(), timer = setTimeout(() => expired.reject(new Error(label)), 1000)
  try { return await Promise.race([promise, expired.promise]) } finally { clearTimeout(timer) }
}
function attach(f: Fixture, options: Partial<Omit<LiveDeliveryOptions, "store">> = {}) {
  const manager = createLiveDeliveryManager({ store: f.store, connection: async () => f.current.value, sleep: async () => { await pause(1) }, ...options })
  f.own(() => manager.shutdown())
  return manager
}
const input = (index = 1) => ({ sessionID: `ses_manager_${index}`, title: "Delivery proof" })
const sends = (f: Fixture) => f.remote.requests.filter((request) => request.path === "/api/meeting/segments")
const stops = (f: Fixture) => f.remote.requests.filter((request) => request.path === "/api/meeting/stop")
function rejected(reason: DeliveryFailureReason) {
  return (error: unknown) => {
    assert.ok(error instanceof LiveDeliveryError); assert.equal(error.reason, reason)
    assert.ok(error.message.length > 0 && error.message.length <= 128)
    assert.ok(!error.message.includes("private-secret") && !error.message.includes(segment().text)); assert.equal(error.cause, undefined)
    return true
  }
}
async function started(t: TestContext, options: Parameters<typeof attach>[1] = {}) {
  const f = await fixture(t), manager = attach(f, options), producer = await manager.start(input(), new AbortController().signal)
  return { ...f, manager, producer }
}

check("start commits exact resolved tuple before exposing a producer, then accepted append is synchronously durable", async (t) => {
  const f = await started(t), item = segment()
  assert.match(f.producer.localID, /^[0-9a-f-]{36}$/)
  assert.equal(f.store.summary(f.producer.localID).meeting.id, f.producer.meetingID)
  assert.equal(f.store.summary(f.producer.localID).target.directory, location.directory)
  assert.equal(f.producer.append(item), "accepted")
  assert.equal(f.sql.prepare("SELECT count(*) AS n FROM outbox_receipt WHERE id=?").get(item.id)?.n, 1)
  assert.equal(f.producer.append(item), "duplicate")
  assert.ok(f.remote.requests.every((request) => request.authorized && request.directory === location.directory))
  f.producer.abandon()
})

check("omitted requested directory captures the exact returned Location, never a locally normalized path", async (t) => {
  const f = await fixture(t)
  f.current.value = { ...f.current.value, server: { ...f.current.value.server, directory: undefined } }
  const manager = attach(f), producer = await manager.start(input(), new AbortController().signal)
  assert.equal(f.store.summary(producer.localID).target.directory, location.directory)
  producer.abandon()
})

check("concurrent and retained same-Session starts refuse active without another remote start", async (t) => {
  const f = await fixture(t), entered = gate(), release = gate()
  f.remote.handlers.set("POST /api/meeting/start", async (_, response) => { entered.resolve(); await release.promise; json(response, envelope(info())) })
  const manager = attach(f), first = manager.start(input(), new AbortController().signal)
  f.own(() => release.resolve())
  try {
    await entered.promise
    await assert.rejects(manager.start(input(), new AbortController().signal), rejected("active"))
  } finally { release.resolve() }
  const producer = await first; producer.abandon()
  await assert.rejects(manager.start(input(), new AbortController().signal), rejected("active"))
  assert.equal(f.remote.requests.filter((request) => request.path.endsWith("/start")).length, 1)
})

check("128 pending starts consume bounded capacity and never-resolving resolver cannot block shutdown", async (t) => {
  const f = await fixture(t), never = gate<never>(), manager = attach(f, { connection: () => never.promise })
  const pending = Array.from({ length: 128 }, (_, index) => manager.start(input(index), new AbortController().signal).then(() => "unexpected", (error: unknown) => error))
  await assert.rejects(manager.start(input(129), new AbortController().signal), rejected("quota"))
  await bounded(manager.shutdown(), "Shutdown waited for resource-free resolver")
  assert.equal((await Promise.all(pending)).every((error) => error instanceof LiveDeliveryError), true)
  assert.equal(f.remote.requests.length, 0)
})

check("full durable capacity refuses before any remote start", async (t) => {
  const f = await fixture(t)
  Array.from({ length: 128 }, (_, index) => f.retained(index, []))
  const manager = attach(f)
  await assert.rejects(manager.start(input(200), new AbortController().signal), rejected("quota"))
  assert.equal(f.remote.requests.length, 0)
})

check("128 capacity is the SUM of durable records, volatile unconfirmed identities and pending starts", async (t) => {
  const f = await fixture(t), never = gate<typeof f.current.value>(), state = { hold: false, waiting: false }
  Array.from({ length: 126 }, (_, index) => f.retained(index, []))
  f.remote.handlers.set("POST /api/meeting/start", (_, response) => { response.destroy() })
  const manager = attach(f, { connection: async () => { if (state.hold) { state.waiting = true; return never.promise } return f.current.value } })
  await assert.rejects(manager.start(input(200), new AbortController().signal), rejected("offline"))
  assert.equal(manager.snapshot().unconfirmedStarts.length, 1)
  state.hold = true
  const pending = manager.start(input(201), new AbortController().signal).then(() => "unexpected", (error: unknown) => error)
  await until(() => state.waiting, "pending start consumes final capacity")
  await assert.rejects(manager.start(input(202), new AbortController().signal), rejected("quota"))
  await bounded(manager.shutdown(), "Mixed-capacity shutdown awaited resolver")
  assert.ok(await pending instanceof LiveDeliveryError)
})

check("Start rechecks actual quota after FIFO permit wait, before issuing any remote POST", async (t) => {
  const f = await fixture(t), records = [f.retained(1), f.retained(2)], release = gate(), observation = { resolves: 0 }
  f.own(() => release.resolve())
  f.remote.handlers.set("GET /api/meeting", async (request, response) => { await release.promise; if (!response.destroyed) json(response, detail(f.remote.infos.get(new URL(request.url ?? "/", f.remote.url).searchParams.get("meetingID")!)!)) })
  const manager = attach(f, { connection: async () => { observation.resolves++; return f.current.value } })
  records.forEach((record) => manager.retry(record.id)); await until(() => f.remote.requests.length === 2, "two real HTTP permits held")
  const before = observation.resolves
  const pending = manager.start(input(200), new AbortController().signal).then(() => "unexpected", (error: unknown) => error)
  await until(() => observation.resolves > before, "Start resolved before waiting for permit")
  Array.from({ length: 126 }, (_, index) => f.retained(index + 3, []))
  release.resolve()
  assert.ok(rejected("quota")(await pending)); assert.equal(f.remote.requests.filter((request) => request.path.endsWith("/start")).length, 0)
})

check("title UTF8 bound is checked before HTTP", async (t) => {
  const f = await fixture(t), manager = attach(f)
  await assert.rejects(manager.start({ ...input(), title: "é".repeat(2048) + "x" }, new AbortController().signal), rejected("quota"))
  assert.equal(f.remote.requests.length, 0)
})

check("exact4KiB UTF8 start title is accepted without normalization or truncation", async (t) => {
  const f = await fixture(t), manager = attach(f), title = "é".repeat(2048)
  const producer = await manager.start({ ...input(), title }, new AbortController().signal)
  assert.equal(f.store.summary(producer.localID).meeting.title, title); producer.abandon()
})

for (const mismatch of ["directory", "workspaceID", "sessionID", "started", "ended"] as const) check(`start ${mismatch} mismatch cannot return a producer or transmit text`, async (t) => {
  const f = await fixture(t), value = envelope(info())
  const body = mismatch === "directory" ? { ...value, location: { ...value.location, directory: "/foreign" } }
    : mismatch === "workspaceID" ? { ...value, location: { ...value.location, workspaceID: "wrk_explicit" } }
    : { ...value, data: { ...value.data, ...(mismatch === "sessionID" ? { sessionID: "ses_foreign" } : mismatch === "started" ? { timeStarted: null } : { timeEnded: 1700000001000 }) } }
  f.remote.handlers.set("POST /api/meeting/start", (_, response) => json(response, body))
  const manager = attach(f)
  await assert.rejects(manager.start(input(), new AbortController().signal), rejected("target"))
  assert.equal(manager.snapshot().items.some((item) => item.activeProducer), false)
  assert.equal(sends(f).length, 0); assert.equal(stops(f).length, 0)
})

check("lost start response leaves explicit unknown identity and never automatically repeats POST start", async (t) => {
  const f = await fixture(t)
  f.remote.handlers.set("POST /api/meeting/start", (_, response) => { response.destroy() })
  const manager = attach(f)
  await assert.rejects(manager.start(input(), new AbortController().signal), rejected("offline"))
  await pause(60)
  const unknown = manager.snapshot().unconfirmedStarts[0]
  assert.ok(unknown); assert.equal(unknown.meeting, undefined)
  assert.deepEqual(manager.retry(unknown.id), { ok: false, reason: "target" })
  assert.equal(manager.export(unknown.id).kind, "unconfirmed")
  assert.equal(f.remote.requests.filter((request) => request.path.endsWith("/start")).length, 1)
  assert.deepEqual(await manager.discard(unknown.id), { ok: true }); assert.equal(stops(f).length, 0)
})

check("valid start ACK with failed local create never returns producer; explicit retry adopts same identity without new start", async (t) => {
  const f = await fixture(t)
  f.sql.exec("CREATE TRIGGER deny_create BEFORE INSERT ON outbox_record BEGIN SELECT RAISE(ABORT,'private-secret'); END")
  const manager = attach(f)
  await assert.rejects(manager.start(input(), new AbortController().signal), rejected("storage"))
  const known = manager.snapshot().unconfirmedStarts[0]
  assert.ok(known?.meeting); assert.equal(known.meeting.id, info().id)
  assert.equal(manager.snapshot().items.some((item) => item.activeProducer), false)
  f.sql.exec("DROP TRIGGER deny_create")
  assert.deepEqual(manager.retry(known.id), { ok: true })
  await until(() => manager.snapshot().unconfirmedStarts.length === 0 && manager.snapshot().items.length === 0, "known tuple adopted and closed")
  assert.equal(f.remote.requests.filter((request) => request.path.endsWith("/start")).length, 1)
})

check("caller cancellation observed after real local tuple commit closes/seals known start without exposing producer", async (t) => {
  const f = await fixture(t), abort = new AbortController()
  let returned = false
  const manager = attach(f, { onChange: () => { if (!returned && f.sql.prepare("SELECT count(*) AS n FROM outbox_record").get()?.n === 1) abort.abort() } })
  await assert.rejects(manager.start(input(), abort.signal).then((producer) => { returned = true; return producer }), rejected("cancelled"))
  await until(() => manager.snapshot().items.length === 0, "cancelled known start remotely closed")
  assert.equal(returned, false); assert.equal(stops(f).length, 1); assert.equal(manager.snapshot().unconfirmedStarts.length, 0)
})

check("observer exception cannot turn a committed append into refusal or delete retained evidence", async (t) => {
  const f = await started(t, { onChange: () => { throw new Error("observer-private-secret") } })
  assert.equal(f.producer.append(segment()), "accepted")
  assert.equal(f.sql.prepare("SELECT count(*) AS n FROM outbox_receipt").get()?.n, 1)
  assert.ok(!JSON.stringify(f.manager.snapshot()).includes("observer-private-secret"))
  f.producer.abandon()
})

check("OPEN recovery performs no automatic network; Retry delivers without inventing close intent or capture", async (t) => {
  const f = await fixture(t), record = f.retained(), manager = attach(f)
  await pause(50); assert.equal(f.remote.requests.length, 0)
  assert.equal(manager.snapshot().items[0]?.status, "interrupted"); assert.equal(manager.snapshot().items[0]?.activeProducer, false)
  assert.deepEqual(manager.retry(record.id), { ok: true })
  await until(() => f.store.summary(record.id).pendingCount === 0, "explicit recovered delivery")
  assert.equal(stops(f).length, 0); assert.equal(f.store.summary(record.id).closeRequested, false)
})

check("recovered close intent seals without producer and drains before remote completion", async (t) => {
  const f = await fixture(t), record = f.retained(1, [segment()], true), manager = attach(f)
  await until(() => manager.snapshot().items.length === 0, "recovered close drains")
  assert.ok(f.remote.requests.findIndex((request) => request.path.endsWith("/stop")) > f.remote.requests.findIndex((request) => request.path.endsWith("/segments")))
  assert.deepEqual(f.store.list(), []); assert.equal(stops(f)[0]?.meetingID, record.meeting.id)
})

check("producer stays valid across HTTP retry/epoch rotation; close intent alone still accepts final until seal", async (t) => {
  const f = await started(t)
  assert.deepEqual(f.producer.requestClose(), { ok: true })
  assert.equal(f.producer.append(segment(1)), "accepted")
  f.current.value = { ...f.current.value, epoch: {} }
  assert.deepEqual(f.manager.retry(f.producer.localID), { ok: true })
  assert.equal(f.producer.signal.aborted, false); assert.equal(f.producer.append(segment(2)), "accepted")
  assert.equal(stops(f).length, 0)
  assert.deepEqual(f.producer.seal(), { ok: true }); assert.equal(f.producer.append(segment(3)), "refused")
  await until(() => f.manager.snapshot().items.length === 0, "joined producer sealed and closed")
})

check("Finish and discard refuse an active producer; abandon releases without fabricating close/seal", async (t) => {
  const f = await started(t)
  assert.deepEqual(f.manager.finish(f.producer.localID), { ok: false, reason: "active" })
  assert.deepEqual(await f.manager.discard(f.producer.localID), { ok: false, reason: "active" })
  f.producer.abandon(); assert.equal(f.store.summary(f.producer.localID).sealed, false)
  assert.equal(f.store.summary(f.producer.localID).closeRequested, false)
  assert.equal(f.producer.append(segment()), "refused"); assert.equal(stops(f).length, 0)
  assert.deepEqual(f.manager.finish(f.producer.localID), { ok: true })
  await until(() => f.manager.snapshot().items.length === 0, "explicit Finish completes")
})

check("requestClose remains durable when seal fails; failed seal releases lease but does not authorize remote close", async (t) => {
  const f = await started(t)
  assert.deepEqual(f.producer.requestClose(), { ok: true })
  f.sql.exec("CREATE TRIGGER deny_seal BEFORE UPDATE ON outbox_record BEGIN SELECT RAISE(ABORT,'private-secret'); END")
  assert.deepEqual(f.producer.seal(), { ok: false, reason: "storage" })
  assert.equal(f.store.summary(f.producer.localID).closeRequested, true); assert.equal(f.store.summary(f.producer.localID).sealed, false)
  assert.equal(f.manager.snapshot().items[0]?.activeProducer, false); assert.equal(stops(f).length, 0)
  f.sql.exec("DROP TRIGGER deny_seal")
})

check("Finish partial failure preserves committed close intent and does not schedule remote close", async (t) => {
  const f = await fixture(t), record = f.retained(1, []), manager = attach(f)
  f.sql.exec("CREATE TRIGGER deny_finish_seal BEFORE UPDATE ON outbox_record WHEN json_extract(NEW.body,'$.sealed')=1 BEGIN SELECT RAISE(ABORT,'private-secret'); END")
  assert.deepEqual(manager.finish(record.id), { ok: false, reason: "storage" })
  assert.equal(f.store.summary(record.id).closeRequested, true); assert.equal(f.store.summary(record.id).sealed, false)
  await pause(40); assert.equal(stops(f).length, 0)
  f.sql.exec("DROP TRIGGER deny_finish_seal")
})

check("GLOBAL first unsaved body is retained once; second failed producer is unavailable and neither revives on Retry", async (t) => {
  const f = await started(t), second = await f.manager.start(input(2), new AbortController().signal)
  const base = segment(1, ""), room = 256 * 1024 - byteLength(base)
  const first = { ...base, text: "é".repeat(Math.floor(room / 2)) + "x".repeat(room % 2) }, release = gate()
  f.own(() => release.resolve())
  f.sql.exec("CREATE TRIGGER deny_segment BEFORE INSERT ON outbox_segment BEGIN SELECT RAISE(ABORT,'private-secret'); END")
  assert.equal(byteLength(first), 256 * 1024); assert.equal(f.producer.append(first), "refused"); assert.equal(second.append(segment(2)), "refused")
  assert.equal(f.producer.signal.aborted, true); assert.equal(second.signal.aborted, true)
  assert.equal(f.manager.snapshot().items.find((item) => item.id === f.producer.localID)?.unsaved, "retained")
  assert.equal(f.manager.snapshot().items.find((item) => item.id === second.localID)?.unsaved, "unavailable")
  const exported = f.manager.export(f.producer.localID)
  assert.ok(exported.kind === "stored"); assert.deepEqual(exported.unsaved, first)
  const secondExport = f.manager.export(second.localID)
  assert.ok(secondExport.kind === "stored"); assert.equal(secondExport.unsaved, undefined); assert.equal(secondExport.unsavedUnavailable, true)
  f.sql.exec("DROP TRIGGER deny_segment")
  assert.equal(f.store.append(f.producer.localID, first), "accepted") // Actual persisted retry state, not a fake store return.
  f.remote.handlers.set("POST /api/meeting/segments", async (_, response) => { await release.promise; if (!response.destroyed) { response.writeHead(204); response.end() } })
  assert.deepEqual(f.manager.retry(f.producer.localID), { ok: true })
  await until(() => f.manager.snapshot().items.find((item) => item.id === f.producer.localID)?.unsaved === "none", "unsaved committed")
  assert.equal(f.store.summary(f.producer.localID).pendingCount, 1)
  assert.equal(f.producer.append(segment(3)), "refused"); assert.equal(second.append(segment(4)), "refused")
  release.resolve(); await until(() => f.store.summary(f.producer.localID).pendingCount === 0, "real ACK after duplicate admission")
  f.producer.abandon(); second.abandon()
  assert.deepEqual(f.manager.finish(second.localID), { ok: false, reason: "storage" })
})

check("exact256KiB projected UTF8 segment is synchronously accepted intact", async (t) => {
  const f = await started(t), base = segment(1, ""), room = 256 * 1024 - byteLength(base)
  const item = { ...base, text: "é".repeat(Math.floor(room / 2)) + "x".repeat(room % 2) }
  assert.equal(byteLength(item), 256 * 1024); assert.equal(f.producer.append(item), "accepted")
  assert.deepEqual(f.store.export(f.producer.localID).segments, [item]); f.producer.abandon()
})

check("oversized body is explicitly unavailable, never truncated/retained/accepted, and cannot Finish", async (t) => {
  const f = await started(t), item = segment(1, "x".repeat(256 * 1024))
  assert.ok(byteLength(item) > 256 * 1024); assert.equal(f.producer.append(item), "refused")
  assert.equal(f.producer.signal.aborted, true); f.producer.abandon()
  const exported = f.manager.export(f.producer.localID)
  assert.ok(exported.kind === "stored"); assert.equal(exported.unsaved, undefined); assert.equal(exported.unsavedUnavailable, true)
  assert.equal(f.store.summary(f.producer.localID).rememberedCount, 0); assert.equal(stops(f).length, 0)
  assert.equal(f.manager.finish(f.producer.localID).ok, false)
})

check("malformed local segment maps invalid to controlled conflict, never acceptance/raw exception", async (t) => {
  const f = await started(t)
  assert.equal(f.producer.append({ ...segment(), startMs: NaN }), "refused")
  assert.equal(f.manager.snapshot().items[0]?.reason, "conflict"); assert.equal(f.store.summary(f.producer.localID).rememberedCount, 0)
  assert.equal(f.manager.snapshot().items[0]?.unsaved, "unavailable")
  f.producer.abandon()
})

check("failed discard preserves both durable and volatile truth after joining cancelled sender", async (t) => {
  const f = await started(t)
  f.sql.exec("CREATE TRIGGER deny_segment BEFORE INSERT ON outbox_segment BEGIN SELECT RAISE(ABORT,'private-secret'); END")
  assert.equal(f.producer.append(segment()), "refused"); f.producer.abandon()
  f.sql.exec("DROP TRIGGER deny_segment; CREATE TRIGGER deny_discard BEFORE DELETE ON outbox_record BEGIN SELECT RAISE(ABORT,'private-secret'); END")
  assert.deepEqual(await f.manager.discard(f.producer.localID), { ok: false, reason: "storage" })
  const exported = f.manager.export(f.producer.localID)
  assert.ok(exported.kind === "stored"); assert.deepEqual(exported.unsaved, segment())
  assert.equal(f.store.list().length, 1); assert.equal(stops(f).length, 0)
  f.sql.exec("DROP TRIGGER deny_discard")
  assert.deepEqual(await f.manager.discard(f.producer.localID), { ok: true }); assert.equal(f.store.list().length, 0)
})

check("corrupt metadata reports storage-error with last-known metadata rather than an ordinary empty queue", async (t) => {
  const f = await fixture(t), record = f.retained(), manager = attach(f)
  assert.equal(manager.snapshot().items[0]?.id, record.id)
  f.sql.exec("UPDATE outbox_record SET body_bytes=body_bytes-1")
  const snapshot = manager.snapshot()
  assert.equal(snapshot.state, "storage-error"); assert.equal(snapshot.items[0]?.id, record.id)
  assert.equal(manager.export(record.id).kind, "storage-unavailable")
  assert.deepEqual(await manager.discard(record.id), { ok: false, reason: "storage" })
  f.sql.exec("UPDATE outbox_record SET body_bytes=body_bytes+1")
})

check("actual foreign-profile record cannot replay through another profile's manager", async (t) => {
  const source = await fixture(t), record = source.retained(1, []), destination = await fixture(t), manager = attach(destination)
  const row = source.sql.prepare("SELECT body,body_bytes FROM outbox_record WHERE id=?").get(record.id)
  assert.ok(row && typeof row.body === "string" && typeof row.body_bytes === "number")
  assert.notEqual(source.store.profileID, destination.store.profileID)
  destination.sql.prepare("INSERT INTO outbox_record(id,body,body_bytes) VALUES(?,?,?)").run(record.id, row.body, row.body_bytes)
  assert.equal(manager.snapshot().state, "storage-error")
  assert.equal(manager.retry(record.id).ok, false); assert.equal(destination.remote.requests.length, 0); assert.equal(source.remote.requests.length, 0)
})

check("exact ACK prefix preserves an append made while HTTP is held; body remains128/1MiB bounded", async (t) => {
  const f = await started(t), entered = gate(), release = gate()
  f.own(() => release.resolve())
  f.remote.handlers.set("POST /api/meeting/segments", async (_, response) => { entered.resolve(); await release.promise; if (!response.destroyed) { response.writeHead(204); response.end() } })
  assert.equal(f.producer.append(segment(1)), "accepted"); await entered.promise
  const inFlight = f.remote.requests.length
  assert.equal(f.producer.append(segment(2)), "accepted"); await pause(30)
  assert.equal(f.remote.requests.length, inFlight)
  release.resolve()
  await until(() => f.store.summary(f.producer.localID).pendingCount === 0, "both prefixes ACKed")
  assert.deepEqual(sends(f).flatMap((request) => (request.body.segments as { id: string }[]).map((item) => item.id)), [uuid(1), uuid(2)])
  assert.ok(sends(f).every((request) => byteLength(request.body) <= 1024 * 1024 && (request.body.segments as unknown[]).length <= 128))
  f.producer.abandon()
})

for (const budget of ["items", "bytes"] as const) check(`actual HTTP drain respects ${budget} bound over a larger durable backlog`, async (t) => {
  const f = await fixture(t)
  const items = budget === "items" ? Array.from({ length: 129 }, (_, index) => segment(index + 10)) : Array.from({ length: 6 }, (_, index) => {
    const value = segment(index + 10, "")
    return { ...value, text: "x".repeat(256 * 1024 - byteLength(value)) }
  })
  const closeRequested = budget === "bytes", record = f.retained(1, items, closeRequested), manager = attach(f)
  if (!closeRequested) manager.retry(record.id)
  await until(() => closeRequested ? manager.snapshot().items.length === 0 : f.store.summary(record.id).pendingCount === 0, "bounded backlog drained")
  assert.ok(sends(f).length >= 2)
  assert.ok(sends(f).every((request) => byteLength(request.body) <= 1024 * 1024 && (request.body.segments as unknown[]).length <= 128))
  assert.deepEqual(sends(f).flatMap((request) => request.body.segments as typeof items), items)
  if (closeRequested) assert.ok(f.remote.requests.findIndex((request) => request.path.endsWith("/stop")) > f.remote.requests.findLastIndex((request) => request.path.endsWith("/segments")))
  if (!closeRequested) assert.equal(stops(f).length, 0)
})

check("ACK deletion failure retains exact data and latches storage-error instead of HTTP progress loop", async (t) => {
  const f = await fixture(t), record = f.retained(), manager = attach(f)
  f.sql.exec("CREATE TRIGGER deny_ack BEFORE DELETE ON outbox_segment BEGIN SELECT RAISE(ABORT,'private-secret'); END")
  assert.deepEqual(manager.retry(record.id), { ok: true })
  await until(() => manager.snapshot().items[0]?.status === "storage-error", "ACK storage failure")
  assert.deepEqual(f.store.batch(record.id).segments, [segment()]); const count = sends(f).length
  await pause(60); assert.equal(sends(f).length, count); assert.equal(stops(f).length, 0)
  f.sql.exec("DROP TRIGGER deny_ack")
})

check("eight consecutive transient failures pause with exact seven backoffs; append/GET do not reset, Retry/progress do", async (t) => {
  const f = await fixture(t), delays: number[] = []
  f.remote.handlers.set("POST /api/meeting/segments", (_, response) => { response.writeHead(503); response.end() })
  const manager = attach(f, { sleep: async (ms) => { delays.push(ms) } }), producer = await manager.start(input(), new AbortController().signal)
  producer.append(segment(1))
  await until(() => manager.snapshot().items[0]?.status === "paused", "eighth failure pause")
  assert.deepEqual(delays, [250, 500, 1000, 2000, 4000, 8000, 8000]); assert.equal(sends(f).length, 8)
  assert.equal(f.store.summary(producer.localID).failures, 8); assert.equal(producer.append(segment(2)), "accepted")
  await pause(60); assert.equal(sends(f).length, 8); assert.equal(f.store.summary(producer.localID).failures, 8)
  f.remote.handlers.delete("POST /api/meeting/segments"); assert.deepEqual(manager.retry(producer.localID), { ok: true })
  await until(() => f.store.summary(producer.localID).pendingCount === 0, "explicit Retry durable progress")
  assert.equal(f.store.summary(producer.localID).failures, 0); producer.abandon()
})

for (const [status, reason] of [[401, "authentication"], [403, "authentication"], [404, "missing"], [418, "conflict"]] as const) {
  check(`HTTP${status} blocks ${reason} without retry timer or lost text`, async (t) => {
    const f = await fixture(t), record = f.retained()
    f.remote.handlers.set("GET /api/meeting", (_, response) => { response.writeHead(status); response.end("private-secret") })
    const manager = attach(f); manager.retry(record.id)
    await until(() => manager.snapshot().items[0]?.status === "blocked", "terminal HTTP status")
    assert.equal(manager.snapshot().items[0]?.reason, reason); assert.deepEqual(f.store.batch(record.id).segments, [segment()])
    const count = f.remote.requests.length; await pause(60); assert.equal(f.remote.requests.length, count); assert.equal(sends(f).length, 0)
  })
}

for (const [remoteReason, reason] of [["missing_meeting", "missing"], ["missing_session", "missing"], ["active", "conflict"], ["unavailable", "conflict"]] as const) {
  check(`HTTP400 MeetingError ${remoteReason} maps bounded ${reason}`, async (t) => {
    const f = await fixture(t), record = f.retained()
    f.remote.handlers.set("GET /api/meeting", (_, response) => json(response, { name: "MeetingError", data: { reason: remoteReason } }, 400))
    const manager = attach(f); manager.retry(record.id)
    await until(() => manager.snapshot().items[0]?.status === "blocked", "MeetingError classification")
    assert.equal(manager.snapshot().items[0]?.reason, reason); assert.equal(sends(f).length, 0)
  })
}

for (const status of [408, 429, 500]) check(`HTTP${status} is transient until eighth failure, not permanent loss`, async (t) => {
  const f = await fixture(t), record = f.retained()
  f.remote.handlers.set("GET /api/meeting", (_, response) => { response.writeHead(status); response.end() })
  const manager = attach(f); manager.retry(record.id)
  await until(() => manager.snapshot().items[0]?.status === "paused", "transient response pause")
  assert.equal(f.store.summary(record.id).failures, 8); assert.deepEqual(f.store.batch(record.id).segments, [segment()])
})

for (const field of ["directory", "meetingID", "sessionID", "timeStarted", "workspaceID", "malformed"] as const) {
  check(`GET identity ${field} mismatch blocks before transcript`, async (t) => {
    const f = await fixture(t), record = f.retained(), value = detail(info())
    const body = field === "directory" ? { ...value, location: { ...value.location, directory: "/different" } }
      : field === "workspaceID" ? { ...value, location: { ...value.location, workspaceID: "wrk_explicit" } }
      : { ...value, data: { ...value.data, meeting: { ...value.data.meeting, ...(field === "meetingID" ? { id: "mtg_foreign" } : field === "sessionID" ? { sessionID: "ses_foreign" } : field === "timeStarted" ? { timeStarted: 1 } : { timeStarted: "bad" }) } } }
    f.remote.handlers.set("GET /api/meeting", (_, response) => json(response, body))
    const manager = attach(f); manager.retry(record.id)
    await until(() => manager.snapshot().items[0]?.status === "blocked", "identity mismatch")
    assert.equal(manager.snapshot().items[0]?.reason, "target"); assert.equal(sends(f).length, 0); assert.equal(stops(f).length, 0)
  })
}

check("observed pending-ID content conflict blocks before POST; GET matching segment never acknowledges it", async (t) => {
  const f = await fixture(t), record = f.retained()
  f.remote.handlers.set("GET /api/meeting", (_, response) => json(response, detail(info(), [segment(1, "different")])) )
  const manager = attach(f); manager.retry(record.id)
  await until(() => manager.snapshot().items[0]?.status === "blocked", "observed conflict")
  assert.equal(manager.snapshot().items[0]?.reason, "conflict"); assert.equal(sends(f).length, 0)
  assert.equal(f.store.summary(record.id).pendingCount, 1)
})

check("ambiguous append forces a fresh GET and detects changed content before retransmission", async (t) => {
  const f = await fixture(t), record = f.retained()
  f.remote.handlers.set("POST /api/meeting/segments", (_, response) => {
    f.remote.handlers.set("GET /api/meeting", (_, response) => json(response, detail(info(), [segment(1, "remote conflict")])) )
    response.destroy()
  })
  const manager = attach(f); manager.retry(record.id)
  await until(() => manager.snapshot().items[0]?.status === "blocked", "post-ambiguity GET conflict")
  assert.equal(manager.snapshot().items[0]?.reason, "conflict"); assert.equal(sends(f).length, 1); assert.equal(f.store.summary(record.id).pendingCount, 1)
})

check("matching GET content is never ACK; lost append ACK retries same immutable body until actual204", async (t) => {
  const f = await fixture(t), record = f.retained()
  f.remote.handlers.set("GET /api/meeting", (_, response) => json(response, detail(info(), [segment()])))
  let attempts = 0
  f.remote.handlers.set("POST /api/meeting/segments", (_, response) => { if (attempts++ === 0) { response.destroy(); return } response.writeHead(204); response.end() })
  const manager = attach(f); manager.retry(record.id)
  await until(() => f.store.summary(record.id).pendingCount === 0, "actual append ACK")
  assert.equal(sends(f).length, 2); assert.deepEqual(sends(f)[0]?.body, sends(f)[1]?.body)
  assert.ok(f.remote.requests.filter((request) => request.method === "GET").length >= 2)
})

for (const mode of ["dropped-stop-ack", "ended-stop-response"] as const) check(`${mode} MUST reconcile empty pending through exact ended GET`, async (t) => {
  const f = await fixture(t), record = f.retained(1, [], true), ended = { ...info(), timeEnded: 1700000001000 }
  f.remote.handlers.set("POST /api/meeting/stop", (_, response) => {
    f.remote.handlers.set("GET /api/meeting", (_, response) => json(response, detail(ended)))
    if (mode === "dropped-stop-ack") { response.destroy(); return }
    json(response, { name: "MeetingError", data: { reason: "ended" } }, 400)
  })
  const manager = attach(f)
  await until(() => manager.snapshot().items.length === 0, "remote ended reconciliation")
  assert.equal(f.store.list().length, 0); assert.equal(stops(f).length, 1)
  assert.ok(f.remote.requests.at(-1)?.method === "GET")
  assert.equal(stops(f)[0]?.meetingID, record.meeting.id)
})

for (const mismatch of ["meetingID", "sessionID", "started", "directory", "not-ended"] as const) check(`stop200 ${mismatch} mismatch never deletes local completion evidence`, async (t) => {
  const f = await fixture(t), record = f.retained(1, [], true), value = envelope({ ...info(), timeEnded: 1700000001000 })
  const body = mismatch === "directory" ? { ...value, location: { ...value.location, directory: "/foreign" } }
    : { ...value, data: { ...value.data, ...(mismatch === "meetingID" ? { id: "mtg_foreign" } : mismatch === "sessionID" ? { sessionID: "ses_foreign" } : mismatch === "started" ? { timeStarted: 1 } : { timeEnded: null }) } }
  f.remote.handlers.set("POST /api/meeting/stop", (_, response) => json(response, body))
  const manager = attach(f)
  await until(() => manager.snapshot().items[0]?.status === "blocked", "invalid stop proof")
  assert.equal(manager.snapshot().items[0]?.reason, "target"); assert.equal(f.store.list()[0]?.id, record.id)
})

check("remote ended with unproven pending is blocked and retained, never a fabricated completion", async (t) => {
  const f = await fixture(t), record = f.retained(1, [segment()], true)
  f.remote.handlers.set("GET /api/meeting", (_, response) => json(response, detail({ ...info(), timeEnded: 1700000001000 })))
  const manager = attach(f)
  await until(() => manager.snapshot().items[0]?.status === "blocked", "ended retained record")
  assert.equal(manager.snapshot().items[0]?.reason, "ended"); assert.deepEqual(f.store.batch(record.id).segments, [segment()])
  assert.equal(stops(f).length, 0); assert.equal(sends(f).length, 0)
})

check("trusted same-profile/mode loopback port+credentials rotation validates GET before TEXT and keeps producer usable", async (t) => {
  const f = await started(t), second = await peer(t)
  second.infos.set(info().id, info())
  second.credentials.password = "rotated-secret"
  f.current.value = { mode: "owned", epoch: {}, server: { ...f.current.value.server, url: second.url, password: "rotated-secret" } }
  assert.equal(f.producer.append(segment()), "accepted")
  await until(() => f.store.summary(f.producer.localID).pendingCount === 0, "rotated target ACK")
  assert.equal(second.requests[0]?.method, "GET"); assert.equal(second.requests[0]?.directory, location.directory)
  assert.ok(second.requests.every((request) => request.authorized))
  assert.equal(f.store.summary(f.producer.localID).target.authority, f.remote.url)
  assert.equal(f.producer.signal.aborted, false); f.producer.abandon()
})

for (const change of ["mode", "remote-url", "userinfo", "query", "path"] as const) check(`untrusted connection ${change} blocks before HTTP replay`, async (t) => {
  const f = await fixture(t), record = f.retained()
  f.current.value = { ...f.current.value, epoch: {}, ...(change === "mode" ? { mode: "shared" as const } : { server: { ...f.current.value.server, url: change === "remote-url" ? "http://example.invalid" : change === "userinfo" ? `http://private-secret@127.0.0.1:${new URL(f.remote.url).port}` : change === "query" ? `${f.remote.url}?x=1` : `${f.remote.url}/elsewhere` } }) }
  const manager = attach(f); manager.retry(record.id)
  await until(() => manager.snapshot().items[0]?.status === "blocked", "untrusted connection")
  assert.equal(manager.snapshot().items[0]?.reason, "target"); assert.equal(f.remote.requests.length, 0)
})

for (const operation of ["start", "read", "append", "stop"] as const) for (const status of [301, 307, 308]) {
  check(`manual ${status} ${operation} never reaches foreign peer or authorizes close`, async (t) => {
    const f = await fixture(t), foreign = await peer(t)
    const path = operation === "start" ? "POST /api/meeting/start" : operation === "read" ? "GET /api/meeting" : operation === "append" ? "POST /api/meeting/segments" : "POST /api/meeting/stop"
    f.remote.handlers.set(path, (_, response) => { response.writeHead(status, { location: `${foreign.url}/foreign` }); response.end() })
    const record = operation === "start" ? undefined : f.retained(1, operation === "stop" ? [] : [segment()], operation === "stop")
    const manager = attach(f)
    if (operation === "start") await assert.rejects(manager.start(input(), new AbortController().signal), rejected("target"))
    if (record && operation !== "stop") manager.retry(record.id)
    await until(() => f.remote.requests.some((request) => `${request.method} ${request.path}` === path), "redirect request")
    await pause(40); assert.equal(foreign.requests.length, 0)
    if (record) { assert.equal(manager.snapshot().items[0]?.status, "blocked"); assert.equal(manager.snapshot().items[0]?.reason, "target"); assert.equal(f.store.list().length, 1) }
  })
}

check("same-authority redirect is also manual and never follows Location", async (t) => {
  const f = await fixture(t), record = f.retained()
  f.remote.handlers.set("GET /api/meeting", (_, response) => { response.writeHead(302, { location: `${f.remote.url}/forbidden` }); response.end() })
  const manager = attach(f); manager.retry(record.id)
  await until(() => manager.snapshot().items[0]?.status === "blocked", "same-authority redirect")
  assert.equal(f.remote.requests.some((request) => request.path === "/forbidden"), false)
})

check("held old-epoch append ACK cannot delete/status-overwrite after connection rotation; producer still accepts final", async (t) => {
  const f = await fixture(t), entered = gate(), release = gate(), backoff = gate()
  const observation = { released: false, checkedAfterResponse: false }
  const manager = attach(f, { connection: async () => { if (observation.released) observation.checkedAfterResponse = true; return f.current.value } })
  const producer = await manager.start(input(), new AbortController().signal)
  f.own(() => { release.resolve(); backoff.resolve() })
  f.remote.handlers.set("POST /api/meeting/segments", async (_, response) => { entered.resolve(); await release.promise; if (!response.destroyed) { response.writeHead(204); response.end() } })
  producer.append(segment(1)); await entered.promise
  const second = await peer(t)
  second.infos.set(info().id, info())
  second.handlers.set("GET /api/meeting", async (_, response) => { await backoff.promise; if (!response.destroyed) json(response, detail(info())) })
  f.current.value = { ...f.current.value, epoch: {}, server: { ...f.current.value.server, url: second.url } }
  observation.released = true; release.resolve()
  await until(() => observation.checkedAfterResponse && sends(f)[0]?.closed === true, "post-response current connection check")
  assert.equal(f.store.summary(producer.localID).pendingCount, 1)
  assert.equal(producer.append(segment(2)), "accepted"); assert.deepEqual(manager.retry(producer.localID), { ok: true })
  backoff.resolve(); producer.abandon()
})

check("two global HTTP permits are FIFO across records and cancelled queued discard consumes neither request nor failure", async (t) => {
  const f = await fixture(t), records = [1, 2, 3, 4].map((index) => f.retained(index)), release = gate()
  f.remote.handlers.set("GET /api/meeting", async (request, response) => { await release.promise; if (!response.destroyed) json(response, detail(f.remote.infos.get(new URL(request.url ?? "/", f.remote.url).searchParams.get("meetingID")!)!)) })
  const manager = attach(f)
  f.own(() => release.resolve())
  records.forEach((record) => manager.retry(record.id))
  await until(() => f.remote.requests.length === 2, "two occupied permits")
  assert.ok(f.remote.state.maxActive <= 2)
  assert.deepEqual(await manager.discard(records[2]!.id), { ok: true })
  release.resolve()
  await until(() => f.store.summary(records[3]!.id).pendingCount === 0, "fourth FIFO entry drains")
  assert.equal(f.remote.requests.some((request) => request.meetingID === records[2]!.meeting.id), false)
  assert.deepEqual(f.remote.requests.slice(0, 3).map((request) => request.meetingID), [records[0]!.meeting.id, records[1]!.meeting.id, records[3]!.meeting.id])
  assert.ok(f.remote.state.maxActive <= 2)
})

for (const outcome of ["resolve", "reject"] as const) check(`uncooperative backoff holds no HTTP permit; late ${outcome} cannot rearm after shutdown`, async (t) => {
  const f = await fixture(t), first = f.retained(1), second = f.retained(2), never = gate()
  f.remote.handlers.set("POST /api/meeting/segments", (_, response, request) => { response.writeHead(request.body.meetingID === first.meeting.id ? 503 : 204); response.end() })
  const manager = attach(f, { sleep: () => never.promise }); manager.retry(first.id)
  await until(() => f.store.summary(first.id).failures === 1, "first backoff entered")
  manager.retry(second.id); await until(() => f.store.summary(second.id).pendingCount === 0, "other record uses released permit")
  await bounded(manager.shutdown(), "Shutdown awaited uncooperative backoff")
  const count = f.remote.requests.length
  if (outcome === "resolve") never.resolve()
  if (outcome === "reject") never.reject(new Error("late-private-secret"))
  await pause(20); assert.equal(f.remote.requests.length, count)
})

for (const outcome of ["resolve", "reject"] as const) check(`cancelled uncooperative resolver late ${outcome} never sends/rearms after shutdown`, async (t) => {
  const f = await fixture(t), delayed = gate<typeof f.current.value>(), abort = new AbortController()
  const manager = attach(f, { connection: () => delayed.promise }), pending = manager.start(input(), abort.signal)
  const observed = pending.then(() => "unexpected", (error: unknown) => error)
  abort.abort(); assert.ok(await observed instanceof LiveDeliveryError)
  await manager.shutdown()
  if (outcome === "resolve") delayed.resolve(f.current.value)
  if (outcome === "reject") delayed.reject(new Error("late-private-secret"))
  await pause(30); assert.equal(f.remote.requests.length, 0); assert.equal(manager.snapshot().state, "closed")
})

check("discard closes generation before joining held HTTP and late ACK cannot recreate local state", async (t) => {
  const f = await fixture(t), record = f.retained(), entered = gate(), release = gate()
  f.remote.handlers.set("POST /api/meeting/segments", async (_, response) => { entered.resolve(); await release.promise; if (!response.destroyed) { response.writeHead(204); response.end() } })
  const manager = attach(f); f.own(() => release.resolve()); manager.retry(record.id); await entered.promise
  const discarded = manager.discard(record.id); release.resolve()
  assert.deepEqual(await discarded, { ok: true }); assert.deepEqual(f.store.list(), [])
  const count = f.remote.requests.length; await pause(60); assert.equal(f.remote.requests.length, count); assert.equal(stops(f).length, 0)
})

check("shutdown is memoized, aborts actual body reader, closes store, and no request or mutation occurs afterward", async (t) => {
  const f = await fixture(t), record = f.retained()
  f.remote.handlers.set("GET /api/meeting", (_, response) => { response.writeHead(200); response.write("{") })
  const manager = attach(f); manager.retry(record.id); await until(() => f.remote.requests.length === 1, "actual response headers")
  const first = manager.shutdown(), second = manager.shutdown()
  assert.equal(first, second); await first
  assert.equal(manager.snapshot().state, "closed"); assert.equal(f.remote.requests[0]?.closed, true)
  assert.throws(() => f.store.list()); const count = f.remote.requests.length; await pause(60); assert.equal(f.remote.requests.length, count)
})

test("REAL10s deadline includes streamed body after received headers; injected backoff cannot shorten it", { timeout: 14000 }, async (t) => {
  const f = await fixture(t), record = f.retained(), never = gate(), entered = gate<number>()
  f.remote.handlers.set("GET /api/meeting", (_, response) => { response.writeHead(200); response.write("{"); entered.resolve(Date.now()) })
  const manager = attach(f, { sleep: () => never.promise }); manager.retry(record.id)
  const begin = await entered.promise
  await until(() => f.store.summary(record.id).failures === 1, "real10s body deadline", 11500)
  assert.ok(Date.now() - begin >= 9000 && Date.now() - begin <= 11500)
  await until(() => f.remote.requests[0]?.closed === true, "deadline body socket closed")
  assert.equal(f.remote.requests[0]?.closed, true); assert.equal(manager.snapshot().items[0]?.reason, "deadline")
  await manager.shutdown(); never.resolve()
})

test("REAL10s deadline also covers a peer that receives the request but never sends headers", { timeout: 14000 }, async (t) => {
  const f = await fixture(t), record = f.retained(), never = gate(), entered = gate<number>()
  f.remote.handlers.set("GET /api/meeting", () => { entered.resolve(Date.now()) })
  const manager = attach(f, { sleep: () => never.promise }); manager.retry(record.id)
  const begin = await entered.promise
  await until(() => f.store.summary(record.id).failures === 1, "real10s headers deadline", 11500)
  assert.ok(Date.now() - begin >= 9000 && Date.now() - begin <= 11500)
  await until(() => f.remote.requests[0]?.closed === true, "deadline headers socket closed")
  assert.equal(f.remote.requests[0]?.closed, true); assert.equal(manager.snapshot().items[0]?.reason, "deadline")
  await manager.shutdown(); never.resolve()
})

check("valid exact128MiB GET is inclusive and permits the pending batch after matching identity", async (t) => {
  const f = await fixture(t), record = f.retained()
  f.remote.handlers.set("GET /api/meeting", (_, response) => sizedDetail(response, 128 * 1024 * 1024))
  const manager = attach(f); manager.retry(record.id)
  await until(() => f.store.summary(record.id).pendingCount === 0, "inclusive128MiB identity body", 7000)
  assert.equal(sends(f).length, 1); assert.equal(f.remote.requests[0]?.closed, true)
})

for (const [kind, limit] of [["identity", 128 * 1024 * 1024], ["small", 1024 * 1024]] as const) {
  check(`${kind} response exceeding${limit} UTF8 bytes blocks target and preserves queue`, async (t) => {
    const f = await fixture(t), record = kind === "identity" ? f.retained() : undefined
    const path = kind === "identity" ? "GET /api/meeting" : "POST /api/meeting/start"
    f.remote.handlers.set(path, async (_, response) => {
      response.writeHead(200, { "content-type": "application/json" }); response.write('{"padding":"')
      const chunk = "é".repeat(32 * 1024)
      for (let bytes = 0; bytes <= limit && !response.destroyed; bytes += Buffer.byteLength(chunk)) {
        if (!response.write(chunk)) await new Promise<void>((resolve) => {
          const ready = () => { response.off("drain", ready); response.off("close", ready); resolve() }
          response.once("drain", ready); response.once("close", ready)
        })
      }
      // Intentionally leave this valid JSON prefix open: only byte-cap enforcement can block before10s.
    })
    const manager = attach(f)
    if (record) { manager.retry(record.id); await until(() => manager.snapshot().items[0]?.status === "blocked", "oversized GET", 7000); assert.equal(f.store.summary(record.id).pendingCount, 1) }
    if (!record) await assert.rejects(manager.start(input(), new AbortController().signal), rejected("target"))
    await until(() => f.remote.requests[0]?.closed === true, "oversized response reader cancelled", 1000)
    assert.equal(sends(f).length, 0); assert.equal(stops(f).length, 0); assert.equal(f.remote.requests[0]?.closed, true)
  })
}
