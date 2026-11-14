import assert from "node:assert/strict"
import { test } from "node:test"
import type { LiveDeliveryProducer } from "./live-delivery-contract.ts"
import { createLiveDeliveryOwner } from "./live-delivery-owner.ts"
import { bounded, ownerFixture } from "./live-delivery-owner-test.fixture.ts"
import { gate, input, json, segment } from "./live-delivery-manager-test.fixture.ts"
import { openLiveOutbox } from "./live-outbox.ts"

test("owner quit fences before window flush and joins it before final capture append and Store close", { timeout: 8000 }, async (t) => {
  const f = await ownerFixture(t), flushing = gate(), release = gate()
  f.releaseOnCleanup(() => release.resolve())
  f.remote.handlers.set("POST /api/meeting/segments", (_, response) => json(response, {}, 503))
  let producer: LiveDeliveryProducer | undefined
  let captures = 0
  const owner = f.create({ stopCapture: async (reason) => {
    assert.equal(reason, "quit")
    captures++
    assert.ok(producer)
    assert.equal(producer.append(segment(81)), "accepted")
    assert.deepEqual(producer.requestClose(), { ok: true })
    assert.deepEqual(producer.seal(), { ok: true })
  } })
  await owner.setConnection(f.connection)
  producer = await owner.manager.start(input(), new AbortController().signal)
  const starts = f.remote.requests.filter((request) => request.path === "/api/meeting/start").length
  assert.equal(starts, 1)
  const refused: Promise<void>[] = []
  const shutdown = owner.shutdown(async () => {
    assert.equal(owner.canStart(), false, "Admission fence must precede calling the flush closure")
    refused.push(assert.rejects(owner.manager.start(input(), new AbortController().signal)))
    assert.equal(captures, 0)
    flushing.resolve()
    await release.promise
  })
  let settled = false
  const joined = shutdown.then(() => { settled = true })
  assert.equal(owner.canStart(), false)
  assert.equal(owner.shutdown(async () => { assert.fail("Memoized shutdown invoked a second flush") }), shutdown)
  await bounded(flushing.promise, "Window flush hook was not invoked")
  await bounded(Promise.all(refused), "Start did not refuse while window flush was held")
  assert.equal(f.remote.requests.filter((request) => request.path === "/api/meeting/start").length, starts)
  assert.equal(captures, 0, "Capture cleanup cannot start before the held window flush joins")
  assert.equal(settled, false)
  assert.equal(owner.manager.export(producer.localID).kind, "stored")
  release.resolve()
  await bounded(joined, "Quit did not join window flush and local capture cleanup")
  assert.equal(captures, 1)
  assert.equal(owner.manager.export(producer.localID).kind, "storage-unavailable")
  const reopened = openLiveOutbox(f.root)
  try {
    assert.deepEqual(reopened.export(producer.localID).segments, [segment(81)])
    assert.equal(reopened.summary(producer.localID).closeRequested, true)
    assert.equal(reopened.summary(producer.localID).sealed, true)
  } finally { reopened.close() }
})

test("owner quit retains window-flush and capture failures while closing Store and preserving accepted final data", { timeout: 8000 }, async (t) => {
  const f = await ownerFixture(t)
  f.remote.handlers.set("POST /api/meeting/segments", (_, response) => json(response, {}, 503))
  const flushFailure = new Error("window flush sentinel"), captureFailure = new Error("capture cleanup sentinel")
  let producer: LiveDeliveryProducer | undefined
  let captures = 0
  // Own the real owner here: f.create's automatic cleanup would rethrow the deliberately failed memoized shutdown.
  const owner = createLiveDeliveryOwner({ userData: f.root, exportData: async () => ({ ok: false, reason: "cancelled" }),
    stopCapture: async (reason) => {
      assert.equal(reason, "quit")
      captures++
      assert.ok(producer)
      assert.equal(producer.append(segment(82)), "accepted")
      assert.deepEqual(producer.requestClose(), { ok: true })
      assert.deepEqual(producer.seal(), { ok: true })
      throw captureFailure
    },
  })
  try {
    await owner.setConnection(f.connection)
    producer = await owner.manager.start(input(), new AbortController().signal)
    const failure = await bounded(owner.shutdown(async () => {
      assert.equal(owner.canStart(), false)
      assert.equal(captures, 0)
      throw flushFailure
    }).then(() => assert.fail("Quit incorrectly succeeded"), (error: unknown) => error), "Failed quit did not join cleanup")
    assert.ok(failure instanceof AggregateError)
    const leaves = (error: unknown): unknown[] => error instanceof AggregateError ? error.errors.flatMap(leaves) : [error]
    assert.ok(leaves(failure).includes(flushFailure), "Original window flush cause must survive")
    assert.ok(leaves(failure).includes(captureFailure), "Capture cleanup cause must survive alongside flush cause")
    assert.equal(captures, 1)
    assert.equal(owner.canStart(), false)
    await assert.rejects(owner.manager.start(input(), new AbortController().signal))
    assert.equal(f.remote.requests.filter((request) => request.path === "/api/meeting/start").length, 1)
    assert.equal(owner.manager.export(producer.localID).kind, "storage-unavailable")
    const reopened = openLiveOutbox(f.root)
    try {
      assert.deepEqual(reopened.export(producer.localID).segments, [segment(82)])
      assert.equal(reopened.summary(producer.localID).closeRequested, true)
      assert.equal(reopened.summary(producer.localID).sealed, true)
    } finally { reopened.close() }
  } finally {
    // The failure is asserted above; this join also closes resources if an earlier assertion fails.
    await owner.shutdown().catch(() => undefined)
  }
})
