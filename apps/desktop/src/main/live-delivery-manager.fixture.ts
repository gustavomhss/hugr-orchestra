import assert from "node:assert/strict"
import { closeSync, fsyncSync, openSync, renameSync, writeFileSync, writeSync } from "node:fs"
import { join } from "node:path"
import { createLiveDeliveryManager, LiveDeliveryError } from "./live-delivery-manager.ts"
import { openLiveOutbox } from "./live-outbox.ts"

const mode = process.argv[2], url = process.argv[3], userData = process.argv[4], directory = process.argv[5], sessionID = process.argv[6]
assert.ok(mode && url && userData && directory && sessionID)
assert.ok(["pending", "recover", "redirect307", "redirect308"].includes(mode))
assert.equal("bun" in process.versions, false)
const segment = { id: "cd84522b-caf9-4cdd-8f74-7d94d4ba1eac", track: "me" as const, text: "Fixture transcript retained for delivery.", startMs: 0, endMs: 100 }
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
async function until(predicate: () => boolean, label: string) {
  const end = Date.now() + 3000
  while (!predicate()) { if (Date.now() >= end) throw new Error(label); await pause(5) }
}
async function report(body: Record<string, unknown>) {
  const response = await fetch(new URL("/fixture/report", url), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, pid: process.pid, node: process.version }) })
  assert.equal(response.status, 204)
}
async function command() {
  const end = Date.now() + 5000
  while (Date.now() < end) {
    const response = await fetch(new URL("/fixture/command", url))
    const data: { release: boolean } = await response.json()
    if (data.release) return
    await pause(5)
  }
  throw new Error("Fixture command not released")
}

if (mode === "pending") process.once("exit", () => {
  writeFileSync(join(userData, "normal-exit"), "live-delivery-normal-exit", { flag: "wx", mode: 0o600 })
  writeSync(1, "live-delivery-normal-exit\n")
})

const store = openLiveOutbox(userData)
const epoch = {}
const manager = createLiveDeliveryManager({
  store, connection: async () => ({ mode: "owned", epoch, server: { url, username: "fixture", password: "meeting-proof", directory } }),
  sleep: async () => { await pause(5) },
  onChange: () => { throw new Error("observer-private-secret") },
})

try {
  if (mode === "recover") {
    const record = store.list()[0]
    assert.ok(record); assert.equal(record.closeRequested, true); assert.equal(record.sealed, true)
    await until(() => manager.snapshot().items[0]?.status === "paused", "Recovered campaign did not pause")
    assert.equal(manager.snapshot().items[0]?.activeProducer, false)
    await report({ phase: "recovered", meetingID: record.meeting.id, localID: record.id, profileID: store.profileID, pending: record.pendingCount })
    await command(); assert.deepEqual(manager.retry(record.id), { ok: true })
    await until(() => manager.snapshot().items.length === 0, "Recovered queue did not complete")
    await report({ phase: "done", pending: 0 })
    await manager.shutdown()
  }
  if (mode !== "recover") {
    const producer = await manager.start({ sessionID, title: "Delivery proof" }, new AbortController().signal)
    assert.equal(store.summary(producer.localID).meeting.id, producer.meetingID)
    assert.equal(producer.append(segment), "accepted")
    assert.deepEqual(producer.requestClose(), { ok: true }); assert.deepEqual(producer.seal(), { ok: true })
    await until(() => manager.snapshot().items[0]?.status === (mode === "pending" ? "paused" : "blocked"), "Campaign did not settle")
    const record = store.summary(producer.localID)
    assert.equal(record.pendingCount, 1); assert.equal(record.rememberedCount, 1)
    await report({ phase: "held", meetingID: producer.meetingID, localID: producer.localID, pending: 1 })
    if (mode === "pending") {
      const idle = new Promise<void>((resolve) => setTimeout(resolve, 5000))
      const marker = join(userData, "ready.json"), handle = openSync(`${marker}.pending`, "wx", 0o600)
      try { writeFileSync(handle, JSON.stringify({ pid: process.pid, profileID: store.profileID, localID: producer.localID, meetingID: producer.meetingID, segmentID: segment.id })); fsyncSync(handle) }
      finally { closeSync(handle) }
      renameSync(`${marker}.pending`, marker)
      await idle // Parent must kill before normal exit; no store.close or self-kill on this path.
    }
    if (mode !== "pending") { await command(); await manager.shutdown(); await report({ phase: "done", pending: 1 }) }
  }
} catch (error) {
  await report({ phase: "fixture-error", reason: error instanceof LiveDeliveryError ? error.reason : "fixture" })
  await manager.shutdown(); process.exitCode = 1
}
