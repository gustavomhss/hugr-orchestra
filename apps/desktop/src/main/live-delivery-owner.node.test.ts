import assert from "node:assert/strict"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import { DatabaseSync } from "node:sqlite"
import type { DeliveryExport, LiveDeliveryCompletion, LiveDeliveryProducer } from "./live-delivery-contract.ts"
import { bounded, ownerFixture } from "./live-delivery-owner-test.fixture.ts"
import { envelope, gate, input, json, location, segment, until } from "./live-delivery-manager-test.fixture.ts"

test("owner: storage-open refusal disables admission without remote start", { timeout: 8000 }, async (t) => {
  const f = await ownerFixture(t)
  writeFileSync(join(f.root, "live-outbox"), "not a directory")
  const owner = f.create()
  await owner.setConnection(f.connection)
  assert.equal(owner.canStart(), false)
  assert.deepEqual(await owner.recovery.snapshot(), { state: "storage-error", canStart: false, items: [], unconfirmedStarts: [] })
  await assert.rejects(owner.manager.start(input(), new AbortController().signal))
  assert.equal(f.remote.requests.length, 0)
})

test("owner: repeated connection lookups keep the published resource epoch", { timeout: 8000 }, async (t) => {
  const f = await ownerFixture(t), owner = f.create()
  assert.equal(owner.canStart(), false)
  await owner.setConnection(f.connection)
  assert.equal(owner.canStart(), true)
  const first = await owner.connection(new AbortController().signal)
  const second = await owner.connection(new AbortController().signal)
  assert.equal(first.epoch, f.connection.epoch)
  assert.equal(second.epoch, first.epoch)
  assert.deepEqual(second.server, f.connection.server)
  const producer = await owner.manager.start(input(), new AbortController().signal)
  assert.equal(producer.append(segment()), "accepted")
  producer.abandon()
  assert.ok(f.remote.requests.some((request) => request.path === "/api/meeting/start" && request.authorized && request.directory === location.directory))
})

test("owner: invalidate closes start admission synchronously and joins capture before replacement publication", { timeout: 8000 }, async (t) => {
  const f = await ownerFixture(t), entered = gate(), release = gate()
  f.releaseOnCleanup(() => release.resolve())
  const owner = f.create({ stopCapture: async (reason) => { if (reason !== "rotation") return; entered.resolve(); await release.promise } })
  await owner.setConnection(f.connection)
  const invalidating = owner.invalidate()
  assert.equal(owner.canStart(), false)
  await assert.rejects(bounded(owner.manager.start(input(), new AbortController().signal), "start waited through closed admission"))
  await bounded(entered.promise, "capture stop not entered")
  let settled = false
  const joined = invalidating.then(() => { settled = true })
  const replacement = { ...f.connection, epoch: {} }
  const publishing = owner.setConnection(replacement)
  await Promise.resolve()
  assert.equal(settled, false)
  assert.equal(owner.canStart(), false)
  assert.equal(f.remote.requests.length, 0)
  release.resolve()
  await bounded(Promise.all([joined, publishing]), "rotation did not join")
  assert.equal((await owner.connection(new AbortController().signal)).epoch, replacement.epoch)
  assert.equal(owner.canStart(), true)
})

test("owner: broker waiter abort and quit settle without late publication reopening admission", { timeout: 8000 }, async (t) => {
  const f = await ownerFixture(t), owner = f.create(), abort = new AbortController()
  const cancelled = owner.connection(abort.signal)
  abort.abort()
  await assert.rejects(bounded(cancelled, "aborted waiter retained"))
  const pending = owner.connection(new AbortController().signal)
  const outcome = pending.then(() => "resolved", () => "rejected")
  await bounded(owner.shutdown(), "shutdown did not join broker waiter")
  assert.equal(await bounded(outcome, "quit waiter retained"), "rejected")
  // Either explicit refusal or a closed no-op is allowed; neither may reopen the owner.
  await owner.setConnection(f.connection).then(() => "closed no-op", () => "refused")
  assert.equal(owner.canStart(), false)
  await assert.rejects(owner.connection(new AbortController().signal))
  await assert.rejects(owner.manager.start(input(), new AbortController().signal))
  assert.equal(f.remote.requests.length, 0)
})

test("owner: rotation aborts and joins an actual in-flight HTTP start", { timeout: 8000 }, async (t) => {
  const f = await ownerFixture(t), entered = gate(), release = gate()
  f.releaseOnCleanup(() => release.resolve())
  f.remote.handlers.set("POST /api/meeting/start", async (_, response) => {
    entered.resolve()
    await release.promise
    if (!response.destroyed) json(response, envelope({ id: "mtg_late", sessionID: input().sessionID, title: input().title, timeStarted: 1700000000000, timeEnded: null }))
  })
  const owner = f.create()
  await owner.setConnection(f.connection)
  const starting = owner.manager.start(input(), new AbortController().signal).then((producer) => ({ producer }), (error: unknown) => ({ error }))
  await bounded(entered.promise, "actual start did not enter HTTP")
  const rotating = owner.invalidate()
  assert.equal(owner.canStart(), false)
  await until(() => f.remote.requests[0]?.closed === true, "rotation cancelled actual startup HTTP")
  const outcome = await bounded(starting, "rotation did not join start")
  assert.ok("error" in outcome)
  await bounded(rotating, "rotation did not join cancelled startup")
  release.resolve()
  assert.equal(owner.canStart(), false)
  assert.equal((await owner.recovery.snapshot()).items.some((item) => item.activeProducer), false)
})

test("owner: recovery snapshot exposes only metadata while Finish remains local intent", { timeout: 8000 }, async (t) => {
  const f = await ownerFixture(t), record = f.seed(), owner = f.create(), completions: LiveDeliveryCompletion[] = []
  owner.onComplete((completion) => completions.push(completion))
  await owner.setConnection(f.connection)
  const snapshot = await owner.recovery.snapshot(), item = snapshot.items[0]
  assert.ok(item)
  assert.deepEqual(Object.keys(item).sort(), ["activeProducer", "closeRequested", "id", "meetingID", "pendingBytes", "pendingCount", "reason", "sealed", "sessionID", "status", "timeStarted", "title", "unsaved"].sort())
  assert.equal(item.id, record.id)
  assert.equal(item.pendingCount, 1)
  const serialized = JSON.stringify(snapshot)
  for (const secret of ["SECRET_TRANSCRIPT_BODY", "private-secret", f.remote.url, location.directory, "profileID", "target", "password"]) assert.equal(serialized.includes(secret), false)
  assert.deepEqual(await owner.recovery.finish(record.id), { ok: true })
  const after = (await owner.recovery.snapshot()).items[0]
  assert.equal(after?.closeRequested, true)
  assert.equal(after?.sealed, true)
  assert.equal(after?.status, "paused")
  assert.equal(after?.pendingCount, 1)
  assert.deepEqual(completions, [])
  assert.equal(f.remote.requests.length, 0)
})

test("owner: completion fires only after actual HTTP confirmed end and durable deletion", { timeout: 8000 }, async (t) => {
  const f = await ownerFixture(t), entered = gate(), release = gate(), completions: LiveDeliveryCompletion[] = []
  f.releaseOnCleanup(() => release.resolve())
  f.remote.handlers.set("POST /api/meeting/stop", async (_, response, request) => {
    entered.resolve()
    await release.promise
    const meeting = f.remote.infos.get(String(request.body.meetingID))
    assert.ok(meeting)
    json(response, envelope({ ...meeting, timeEnded: meeting.timeStarted + 1000 }))
  })
  const owner = f.create()
  const unsubscribe = owner.onComplete((completion) => completions.push(completion))
  await owner.setConnection(f.connection)
  const producer = await owner.manager.start(input(), new AbortController().signal)
  assert.equal(producer.append(segment()), "accepted")
  assert.deepEqual(producer.requestClose(), { ok: true })
  assert.deepEqual(producer.seal(), { ok: true })
  await bounded(entered.promise, "remote stop not reached")
  assert.deepEqual(completions, [])
  assert.equal((await owner.recovery.snapshot()).items[0]?.id, producer.localID)
  release.resolve()
  await until(() => completions.length === 1, "confirmed completion")
  assert.deepEqual(completions, [{ localID: producer.localID, sessionID: input().sessionID, meetingID: producer.meetingID }])
  assert.deepEqual((await owner.recovery.snapshot()).items, [])
  const sql = new DatabaseSync(join(f.root, "live-outbox", "outbox.sqlite"))
  try { assert.equal(sql.prepare("SELECT count(*) AS n FROM outbox_record").get()?.n, 0) }
  finally { sql.close() }
  unsubscribe()
})

test("owner: quit waits capture final append and seal before closing actual SQLite Store", { timeout: 8000 }, async (t) => {
  const f = await ownerFixture(t), entered = gate(), release = gate()
  f.releaseOnCleanup(() => release.resolve())
  f.remote.handlers.set("POST /api/meeting/segments", (_, response) => json(response, {}, 503))
  let producer: LiveDeliveryProducer | undefined
  const owner = f.create({ stopCapture: async (reason) => {
    assert.equal(reason, "quit")
    entered.resolve()
    await release.promise
    assert.ok(producer)
    assert.equal(producer.append(segment(71)), "accepted")
    assert.deepEqual(producer.requestClose(), { ok: true })
    assert.deepEqual(producer.seal(), { ok: true })
  } })
  await owner.setConnection(f.connection)
  producer = await owner.manager.start(input(), new AbortController().signal)
  const shutting = owner.shutdown()
  assert.equal(owner.canStart(), false)
  await bounded(entered.promise, "quit capture stop missing")
  let joined = false
  const shutdown = shutting.then(() => { joined = true })
  await Promise.resolve()
  assert.equal(joined, false)
  assert.equal(owner.manager.export(producer.localID).kind, "stored")
  const latePublication = owner.setConnection({ ...f.connection, epoch: {} }).then(() => "closed no-op", () => "refused")
  assert.equal(owner.canStart(), false)
  release.resolve()
  await bounded(Promise.all([shutdown, latePublication]), "quit did not join final callback/publication")
  assert.equal(owner.manager.export(producer.localID).kind, "storage-unavailable")
  assert.equal(owner.canStart(), false)
})

test("owner: recovery export resolves opaque ID in Main and aborts/joins export on quit", { timeout: 8000 }, async (t) => {
  const f = await ownerFixture(t), record = f.seed(), entered = gate(), aborted = gate(), release = gate()
  f.releaseOnCleanup(() => release.resolve())
  const received: DeliveryExport[] = []
  const owner = f.create({ exportData: async (data, signal) => {
    received.push(data)
    entered.resolve()
    if (!signal.aborted) await new Promise<void>((resolve) => signal.addEventListener("abort", () => { aborted.resolve(); resolve() }, { once: true }))
    await release.promise
    return { ok: false, reason: "cancelled" }
  } })
  assert.deepEqual(await owner.recovery.export("../not-an-id"), { ok: false, reason: "conflict" })
  assert.deepEqual(received, [])
  const exporting = owner.recovery.export(record.id)
  await bounded(entered.promise, "export adapter not entered")
  assert.equal(received.length, 1)
  const exported = received[0]
  assert.ok(exported && exported.kind === "stored")
  assert.equal(exported.data.record.id, record.id)
  assert.deepEqual(exported.data.segments, [segment(501, "SECRET_TRANSCRIPT_BODY")])
  let joined = false
  const shutdown = owner.shutdown().then(() => { joined = true })
  assert.equal(owner.canStart(), false)
  await bounded(aborted.promise, "quit did not abort export")
  assert.equal(joined, false)
  release.resolve()
  assert.deepEqual(await bounded(exporting, "export not joined"), { ok: false, reason: "cancelled" })
  await bounded(shutdown, "quit did not join export")
})
