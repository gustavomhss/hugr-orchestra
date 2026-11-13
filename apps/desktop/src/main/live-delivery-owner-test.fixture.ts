import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { TestContext } from "node:test"
import { createLiveDeliveryOwner } from "./live-delivery-owner.ts"
import type { LiveDeliveryOwnerOptions } from "./live-delivery-owner-contract.ts"
import { openLiveOutbox } from "./live-outbox.ts"
import { gate, info, location, peer, segment, uuid } from "./live-delivery-manager-test.fixture.ts"

export async function ownerFixture(t: TestContext) {
  assert.equal("bun" in process.versions, false)
  const root = mkdtempSync(join(tmpdir(), "live-delivery-owner-"))
  const remote = await peer(t)
  const releases: (() => void)[] = []
  const owners: ReturnType<typeof createLiveDeliveryOwner>[] = []
  t.after(async () => {
    releases.forEach((release) => release())
    await bounded(Promise.all(owners.map((owner) => owner.shutdown())), "Owner fixture shutdown did not join")
    rmSync(root, { recursive: true, force: true })
  })
  const connection = { mode: "owned" as const, epoch: {}, server: { url: remote.url, ...remote.credentials, directory: location.directory } }
  const create = (options: Partial<LiveDeliveryOwnerOptions> = {}) => {
    const owner = createLiveDeliveryOwner({ userData: root, stopCapture: async () => {}, exportData: async () => ({ ok: false, reason: "cancelled" }), ...options })
    owners.push(owner)
    return owner
  }
  const seed = () => {
    const store = openLiveOutbox(root), meeting = info("ses_owner_retained", "Retained private transcript")
    try {
      remote.infos.set(meeting.id, meeting)
      const record = store.create({ id: uuid(501), target: { profileID: store.profileID, mode: "owned", authority: remote.url, directory: location.directory }, meeting: { id: meeting.id, sessionID: meeting.sessionID, title: meeting.title, timeStarted: meeting.timeStarted } })
      store.append(record.id, segment(501, "SECRET_TRANSCRIPT_BODY"))
      store.setStatus(record.id, { status: "paused", reason: "offline", failures: 8 })
      return record
    } finally { store.close() }
  }
  return { root, remote, connection, create, seed, releaseOnCleanup: (release: () => void) => releases.push(release) }
}

export async function bounded<A>(promise: Promise<A>, label: string) {
  const expired = gate<never>(), timer = setTimeout(() => expired.reject(new Error(label)), 1500)
  try { return await Promise.race([promise, expired.promise]) }
  finally { clearTimeout(timer) }
}
