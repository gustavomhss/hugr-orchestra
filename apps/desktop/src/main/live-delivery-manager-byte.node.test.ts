import assert from "node:assert/strict"
import { attach, rejected } from "./live-delivery-manager-actions.fixture.ts"
import { check, fixture, input, sends, stops, until } from "./live-delivery-manager-test.fixture.ts"

for (const [kind, limit] of [["identity", 128 * 1024 * 1024], ["small", 1024 * 1024]] as const) {
  check(`${kind} response exceeding${limit} UTF8 bytes blocks target and preserves queue`, async (t) => {
    const f = await fixture(t), record = kind === "identity" ? f.retained() : undefined
    const observation = { bodyBytesWritten: 0, lastWrite: 0, drain: 0, closed: false, bytesWritten: () => 0 }
    const path = kind === "identity" ? "GET /api/meeting" : "POST /api/meeting/start"
    f.remote.handlers.set(path, async (_, response) => {
      const socket = response.socket
      observation.bytesWritten = () => socket?.bytesWritten ?? 0
      response.once("close", () => { observation.closed = true })
      response.writeHead(200, { "content-type": "application/json" }); response.write('{"padding":"')
      observation.bodyBytesWritten += Buffer.byteLength('{"padding":"')
      const chunk = "é".repeat(32 * 1024)
      for (let bytes = 0; bytes <= limit && !response.destroyed; bytes += Buffer.byteLength(chunk)) {
        const ready = response.write(chunk)
        observation.bodyBytesWritten += Buffer.byteLength(chunk); observation.lastWrite = Date.now()
        if (!ready) await new Promise<void>((resolve) => {
          const drained = () => { observation.drain++; finish() }
          const finish = () => { response.off("drain", drained); response.off("close", finish); resolve() }
          response.once("drain", drained); response.once("close", finish)
        })
      }
      // Intentionally leave this valid JSON prefix open: only byte-cap enforcement can block before10s.
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
