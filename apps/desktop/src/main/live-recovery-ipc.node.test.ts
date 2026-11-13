import assert from "node:assert/strict"
import { access } from "node:fs/promises"
import { join } from "node:path"
import { after, test } from "node:test"
import type { LiveRecoveryAction, LiveRecoveryPort, LiveRecoverySnapshot } from "@orchestra/app/live"
import { bounded, ownerFixture } from "./live-delivery-owner-test.fixture.ts"
import { gate } from "./live-delivery-manager-test.fixture.ts"
import { exportLiveRecovery } from "./live-recovery-export.ts"
import { legacyChannels, loadRecoveryIpc, localID, recoveryChannels, routing } from "./live-recovery-ipc.fixture.ts"
import { openLiveOutbox } from "./live-outbox.ts"

const boundary = loadRecoveryIpc()
after(() => boundary.dispose())
const modules = await boundary.load()
const trusted = "oc://renderer/index.html"
const metadata: LiveRecoverySnapshot = { state: "ready", canStart: true, items: [], unconfirmedStarts: [] }
function recovery() {
  const calls: { action: string; args: unknown[] }[] = []
  const behavior: { snapshot(): Promise<LiveRecoverySnapshot>; action(): Promise<LiveRecoveryAction> } = {
    snapshot: async () => metadata, action: async () => ({ ok: true }),
  }
  const invoke = (action: string, args: unknown[]) => { calls.push({ action, args }); return behavior.action() }
  const port: LiveRecoveryPort = {
    snapshot: () => { calls.push({ action: "snapshot", args: [] }); return behavior.snapshot() },
    retry: (...args) => invoke("retry", args), finish: (...args) => invoke("finish", args),
    export: (...args) => invoke("export", args), discard: (...args) => invoke("discard", args),
  }
  return { calls, behavior, port }
}

test("IPC origin control: actual packaged/development origin policy has the known allow/deny results", () => {
  assert.equal("bun" in process.versions, false)
  assert.equal(modules.origins.isRendererOrigin(trusted, undefined), true)
  assert.equal(modules.origins.isRendererOrigin("oc://other/index.html", undefined), false)
  assert.equal(modules.origins.isRendererOrigin("https://foreign.invalid", undefined), false)
  const dev = modules.origins.rendererDevUrl(false, "http://localhost:5173")
  assert.equal(modules.origins.isRendererOrigin("http://localhost:5173/window", dev), true)
  assert.equal(modules.origins.isRendererOrigin("http://localhost:5174/window", dev), false)
  assert.equal(modules.origins.isRendererOrigin("http://localhost:5173/window", modules.origins.rendererDevUrl(true, dev)), false)
})

for (const entry of [
  { name: "packaged renderer", url: trusted, dev: undefined, allowed: true },
  { name: "configured development origin", url: "http://localhost:5173/other", dev: "http://localhost:5173", allowed: true },
  { name: "foreign packaged host", url: "oc://other/index.html", dev: undefined, allowed: false },
  { name: "foreign HTTPS", url: "https://foreign.invalid", dev: undefined, allowed: false },
  { name: "file URL", url: "file:///private/renderer.html", dev: undefined, allowed: false },
  { name: "different development port", url: "http://localhost:5174", dev: "http://localhost:5173", allowed: false },
  { name: "development URL disabled in packaged app", url: "http://localhost:5173", dev: modules.origins.rendererDevUrl(true, "http://localhost:5173"), allowed: false },
  { name: "missing sender frame", url: undefined, dev: "http://localhost:5173", allowed: false },
]) test(`IPC guard: ${entry.name}`, () => {
  const event = { senderFrame: entry.url === undefined ? null : { url: entry.url } }
  if (entry.allowed) { assert.doesNotThrow(() => modules.trust.requireTrustedSender(event, entry.dev, "get-live-recovery")); return }
  assert.throws(() => modules.trust.requireTrustedSender(event, entry.dev, "get-live-recovery"), /Untrusted IPC sender/)
})

test("Live IPC routes every legacy and recovery registration through the supplied trusted handle", async () => {
  const r = recovery(), fixture = routing(modules, r.port)
  assert.deepEqual([...fixture.handlers.keys()].sort(), [...legacyChannels, ...recoveryChannels].sort())
  for (const channel of [...legacyChannels, ...recoveryChannels]) {
    await assert.rejects(fixture.invoke(channel, "https://foreign.invalid", localID), /Untrusted IPC sender/)
    await assert.rejects(fixture.invoke(channel, undefined, localID), /Untrusted IPC sender/)
  }
  assert.deepEqual(r.calls, [])
  assert.deepEqual(fixture.calls, [])
  const args: Record<string, unknown[]> = {
    "start-live-meeting": ["Routing title"], "set-live-transcription-key": [""], "request-live-permission": ["microphone"],
    "rename-live-meeting": ["mtg_routing", "Renamed"], "set-live-settings": [{ language: "en" }], "set-live-hotkey": ["start-stop", "Ctrl+M"],
  }
  for (const channel of legacyChannels) await fixture.invoke(channel, trusted, ...(args[channel] ?? []))
  assert.deepEqual(fixture.calls, ["start", "stop", "rename", "settings"])
  assert.deepEqual(await fixture.invoke("get-live-recovery", trusted), metadata)
})

test("Live recovery IPC forwards only the exact opaque ID and never renderer export paths/transcripts", async () => {
  const r = recovery(), fixture = routing(modules, r.port, "http://localhost:5173")
  for (const action of ["retry", "finish", "export", "discard"])
    assert.deepEqual(await fixture.invoke(`${action}-live-recovery`, "http://localhost:5173/window", localID), { ok: true })
  assert.deepEqual(r.calls, ["retry", "finish", "export", "discard"].map((action) => ({ action, args: [localID] })))
  const extra = await fixture.invoke("export-live-recovery", trusted, localID, "/renderer/chosen/path", { transcript: "renderer supplied" })
  // Strict rejection or ignored extra arguments are both safe; Main must never forward them.
  if (extra && typeof extra === "object" && "ok" in extra && extra.ok === true) {
    assert.deepEqual(r.calls[4], { action: "export", args: [localID] })
    return
  }
  assert.deepEqual(extra, { ok: false, reason: "conflict" })
  assert.equal(r.calls.length, 4)
})

test("Live recovery IPC rejects path-like and nonstring IDs before invoking recovery", async () => {
  const r = recovery(), fixture = routing(modules, r.port)
  for (const action of ["retry", "finish", "export", "discard"]) {
    for (const invalid of ["../outbox.sqlite", "/private/export.json", "C:\\private\\export.json", "", 7, null, undefined, [localID], { id: localID }])
      assert.deepEqual(await fixture.invoke(`${action}-live-recovery`, trusted, invalid), { ok: false, reason: "conflict" })
  }
  assert.deepEqual(r.calls, [])
})

test("Live recovery IPC refuses snapshot failure instead of fabricating an empty successful snapshot", async () => {
  const r = recovery(), fixture = routing(modules, r.port)
  r.behavior.snapshot = async () => { throw new Error("private-db-path-password") }
  await assert.rejects(fixture.invoke("get-live-recovery", trusted), (error: unknown) => {
    assert.ok(error instanceof Error)
    assert.ok(error.message.length > 0)
    assert.equal(error.message.includes("private-db-path-password"), false)
    return true
  })
  assert.deepEqual(r.calls, [{ action: "snapshot", args: [] }])
})

test("Live recovery IPC contains private action errors and preserves ordinary public refusals", async () => {
  const r = recovery(), fixture = routing(modules, r.port)
  r.behavior.action = async () => { throw new Error("private-native-path-token") }
  for (const action of ["retry", "finish", "export", "discard"])
    assert.deepEqual(await fixture.invoke(`${action}-live-recovery`, trusted, localID), { ok: false, reason: "storage" })
  r.behavior.action = async () => ({ ok: false, reason: "active" })
  assert.deepEqual(await fixture.invoke("finish-live-recovery", trusted, localID), { ok: false, reason: "active" })
})

for (const late of ["resolved", "rejected"] as const) test(`actual owner quit joins cancelled export before an uncancellable chooser settles; late ${late} choice never writes`, { timeout: 8000 }, async (t) => {
  const f = await ownerFixture(t), record = f.seed(), chosen = gate<string | undefined>(), entered = gate(), chooserSettled = gate()
  const destination = join(f.root, "late-choice.json")
  f.releaseOnCleanup(() => chosen.resolve(undefined))
  const owner = f.create({ exportData: (data, signal) => exportLiveRecovery(data, { signal, choose: async () => {
    entered.resolve()
    try { return await chosen.promise }
    finally { chooserSettled.resolve() }
  } }) })
  const exporting = owner.recovery.export(record.id)
  await bounded(entered.promise, "native chooser not entered")
  await bounded(owner.shutdown(), "quit waited for uncancellable chooser")
  assert.deepEqual(await bounded(exporting, "export not joined by quit"), { ok: false, reason: "cancelled" })
  if (late === "resolved") chosen.resolve(destination)
  if (late === "rejected") chosen.reject(new Error("late private chooser rejection"))
  await bounded(chooserSettled.promise, "late chooser not observed")
  await new Promise<void>((resolve) => setTimeout(resolve, 30))
  await assert.rejects(access(destination), { code: "ENOENT" })
  const reopened = openLiveOutbox(f.root)
  try { assert.equal(reopened.summary(record.id).pendingCount, 1) }
  finally { reopened.close() }
})
