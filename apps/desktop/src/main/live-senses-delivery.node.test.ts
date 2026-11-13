import assert from "node:assert/strict"
import { after, test } from "node:test"
import { setImmediate } from "node:timers/promises"
import { attach } from "./live-delivery-manager-actions.fixture.ts"
import { bounded, loadSensesBoundary, sensesFixture } from "./live-senses-delivery.fixture.ts"
import { fixture, gate, input, segment, sends, stops, until } from "./live-delivery-manager-test.fixture.ts"

const boundary = loadSensesBoundary()
after(() => boundary.dispose())

// The Node test runner isolates this file; no capture/STT owner is shared across concurrent tests.
test("CONTROL senses integration uses real SQLite admission and actual manager HTTP delivery", { timeout: 10_000 }, async (t) => {
  const f = await fixture(t), manager = attach(f)
  const producer = await manager.start(input(), new AbortController().signal)
  assert.equal(producer.append(segment()), "accepted")
  assert.equal(f.sql.prepare("SELECT count(*) AS n FROM outbox_receipt WHERE id=?").get(segment().id)?.n, 1)
  assert.equal(producer.requestClose().ok, true)
  assert.equal(producer.seal().ok, true)
  await until(() => manager.snapshot().items.length === 0, "Real manager did not confirm delivery completion")
  assert.equal(sends(f).length, 1)
  assert.equal(stops(f).length, 1)
  assert.ok(f.remote.requests.every((request) => request.authorized && request.directory))
})

test("senses joins final STT and cutter flush before seal; local stop is memoized before callbacks and does not await ACK", { timeout: 10_000 }, async (t) => {
  const f = await sensesFixture(t, boundary.load)
  const ack = f.hold(), stt = f.hold(), appendEntered = gate()
  f.remote.handlers.set("POST /api/meeting/segments", async (_, response) => {
    appendEntered.resolve()
    await ack.promise
    response.writeHead(204); response.end()
  })
  const senses = await f.start()
  assert.ok("localID" in senses && typeof senses.localID === "string", "Senses must expose its durable producer identity")
  const id = senses.localID
  assert.equal(id, await f.localID())
  assert.equal(f.store.summary(id).meeting.id, senses.meetingID)
  f.piece("before")
  f.state.sttClose = stt.promise
  f.state.finalDuringStop = { kind: "piece", piece: { track: "me", text: "last final", startMs: 100, endMs: 200, final: true } }
  const reentry: { stop?: ReturnType<typeof senses.stop> } = {}
  f.state.beforeCaptureStop = () => {
    assert.equal(f.store.summary(id).closeRequested, true, "Close intent must be durable before capture cleanup")
    assert.equal(f.store.summary(id).sealed, false)
    reentry.stop = senses.stop()
    void reentry.stop.catch(() => undefined)
  }
  const first = senses.stop()
  void first.catch(() => undefined)
  const second = senses.stop()
  void second.catch(() => undefined)
  assert.equal(first, second)
  assert.equal(reentry.stop, first, "Synchronous callback must observe the already-published stop promise")
  await bounded(f.state.sttEntered.promise, "STT cleanup was not reached")
  assert.equal(f.state.captureJoined, true)
  assert.equal(f.store.summary(id).sealed, false, "An outstanding final callback prevents sealing")
  assert.equal(f.store.summary(id).pendingCount, 0, "The open segment is not flushed before STT joins")
  assert.equal(stops(f).length, 0)
  stt.resolve()
  const stopped = await bounded(first, "Local senses stop incorrectly awaited remote ACK")
  assert.equal(stopped.unsent, 1, "Unsent is pending metadata, not remote completion")
  assert.equal(f.state.captureStops, 1)
  assert.equal(f.state.transcriberStops, 1)
  assert.equal(f.store.summary(id).sealed, true)
  assert.equal(f.manager.snapshot().items[0]?.activeProducer, false)
  assert.deepEqual(f.store.export(id).segments.map((item) => item.text), ["before last final"])
  await bounded(appendEntered.promise, "Real delivery append did not start")
  assert.equal(stops(f).length, 0, "No remote stop may precede the held append ACK")
  ack.resolve()
  await until(() => f.manager.snapshot().items.length === 0, "Real ACK and ended proof did not complete the record")
  assert.equal(stops(f).length, 1)
})

for (const failure of ["sqlite", "quota"] as const) {
  test(`senses ${failure} admission refusal synchronously stops capture and preserves an incomplete warning`, { timeout: 10_000 }, async (t) => {
    const f = await sensesFixture(t, boundary.load)
    const senses = await f.start()
    assert.ok("localID" in senses && typeof senses.localID === "string")
    const id = senses.localID
    if (failure === "sqlite") f.sql.exec("CREATE TRIGGER refuse_senses_append BEFORE INSERT ON outbox_segment BEGIN SELECT RAISE(ABORT,'real senses admission refusal'); END")
    f.piece(failure === "quota" ? "x".repeat(300 * 1024) : "must not disappear silently")
    f.endSpeech()
    assert.equal(f.state.captureStops, 1, "Producer failure signal must stop capture immediately")
    await bounded(f.state.captureClosed.promise, "Capture remained open after refused durable admission")
    await until(() => f.manager.snapshot().items[0]?.activeProducer === false, "Failed producer lease was not abandoned/joined")
    const item = f.manager.snapshot().items.find((record) => record.id === id)
    assert.ok(item)
    assert.equal(item.status, "storage-error")
    assert.equal(item.sealed, false, "Failed admission must not claim all final segments were sealed")
    assert.notEqual(item.unsaved, "none", "Recent audio is incomplete even if one failed segment is retained")
    assert.equal(item.reason, failure === "quota" ? "quota" : "storage")
    const exported = f.manager.export(id)
    assert.ok(exported.kind === "stored" || exported.kind === "storage-unavailable")
    if (failure === "sqlite") assert.equal(exported.unsaved?.text, "must not disappear silently")
    if (failure === "quota") assert.equal(exported.unsavedUnavailable, true)
    assert.equal(f.store.summary(id).pendingCount, 0)
    assert.equal(stops(f).length, 0, "Admission failure is not permission to stop/delete the remote record")
    const stopped = await senses.stop()
    assert.equal(stopped.unsent, 0, "Zero pending does not certify the missing tail was saved")
    assert.notEqual(f.manager.snapshot().items.find((record) => record.id === id)?.unsaved, "none")
  })
}

test("abort during microphone permission settles before the native dialog and a late grant cannot start capture", { timeout: 10_000 }, async (t) => {
  const f = await sensesFixture(t, boundary.load)
  const permission = f.holdPermission()
  const starting = f.start()
  const rejected = starting.then(() => assert.fail("Cancelled permission wait unexpectedly started senses"), (error: unknown) => error)
  await bounded(f.state.permissionEntered.promise, "Permission request was not entered")
  f.controller.abort()
  assert.ok(await bounded(rejected, "Cancellation waited for the unresolved native permission dialog") instanceof Error)
  assert.equal(f.state.captureStarts, 0)
  assert.equal(f.remote.requests.length, 0)
  assert.equal(f.manager.snapshot().items.length, 0)
  permission.resolve(true)
  await setImmediate()
  await setImmediate()
  assert.equal(f.state.captureStarts, 0)
  assert.equal(f.remote.requests.length, 0, "Late permission cannot create a meeting")
})

test("abort during capture acquisition joins and closes the late handle before rejecting startup", { timeout: 10_000 }, async (t) => {
  const f = await sensesFixture(t, boundary.load)
  const acquisition = f.hold(), closed = f.hold()
  f.state.acquisition = acquisition.promise
  f.state.captureClose = closed.promise
  const observed = { settled: false }
  const starting = f.start()
  const rejected = starting.then(() => assert.fail("Cancelled late capture unexpectedly installed senses"), (error: unknown) => {
    observed.settled = true
    return error
  })
  await bounded(f.state.captureEntered.promise, "Capture acquisition was not entered")
  const id = await f.localID()
  f.controller.abort()
  await setImmediate()
  assert.equal(observed.settled, false, "A late capture resource remains owned until it has been joined")
  acquisition.resolve()
  await until(() => f.state.captureStops === 1, "Late capture handle was not closed")
  assert.equal(observed.settled, false, "Startup rejection must wait for actual capture cleanup")
  assert.equal(f.state.captureJoined, false)
  closed.resolve()
  assert.ok(await bounded(rejected, "Late capture cleanup did not settle cancelled startup") instanceof Error)
  assert.equal(f.state.captureJoined, true)
  assert.equal(f.state.captureStops, 1)
  assert.equal(f.state.transcriberStops, 1)
  assert.equal(f.manager.snapshot().items.find((record) => record.id === id)?.activeProducer ?? false, false)
  assert.equal(f.remote.requests.filter((request) => request.path === "/api/meeting/start").length, 1)
})
