import assert from "node:assert/strict"
import { writeByteOverflow } from "./live-delivery-manager-byte.fixture.ts"
import { attach, rejected } from "./live-delivery-manager-actions.fixture.ts"
import { check, fixture, input, sends, stops, until } from "./live-delivery-manager-test.fixture.ts"

for (const [kind, limit] of [["identity", 128 * 1024 * 1024], ["small", 1024 * 1024]] as const) {
  check(`${kind} response exceeding${limit} UTF8 bytes blocks target and preserves queue`, async (t) => {
    const f = await fixture(t), record = kind === "identity" ? f.retained() : undefined
    const observation = { bodyBytesWritten: 0, lastWrite: 0, writeCompleted: 0, closed: false, bytesWritten: () => 0 }
    const path = kind === "identity" ? "GET /api/meeting" : "POST /api/meeting/start"
    f.remote.handlers.set(path, async (_, response) => {
      await writeByteOverflow(response, limit, observation, f.remote.state.failures)
    })
    const manager = attach(f)
    try {
      if (record) { manager.retry(record.id); await until(() => manager.snapshot().items[0]?.status === "blocked", "oversized GET", 7000); assert.equal(f.store.summary(record.id).pendingCount, 1) }
      if (!record) await assert.rejects(manager.start(input(), new AbortController().signal), rejected("target"))
      await until(() => f.remote.requests[0]?.closed === true, "oversized response reader cancelled", 1000)
      assert.equal(sends(f).length, 0); assert.equal(stops(f).length, 0); assert.equal(f.remote.requests[0]?.closed, true)
    } catch (error) {
      const snapshot = manager.snapshot()
      console.error(JSON.stringify({ kind: "live-delivery-byte-cap-diagnostic", response: kind, ...observation, bytesWritten: observation.bytesWritten(), snapshot: { state: snapshot.state, items: snapshot.items.map((item) => ({ status: item.status, reason: item.reason, failures: item.failures, pendingCount: item.pendingCount, pendingBytes: item.pendingBytes, activeProducer: item.activeProducer, unsaved: item.unsaved })), unconfirmedCount: snapshot.unconfirmedStarts.length } }))
      throw error
    }
  })
}
