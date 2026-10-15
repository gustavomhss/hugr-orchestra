import { expect } from "bun:test"
import { CapabilityArtifactPinTable, CapabilityArtifactReferenceTable, CapabilityRequestTable } from "@orchestra/core/capability/sql"
import { Capability } from "@orchestra/schema/capability"
import { CapabilityManagement } from "@orchestra/schema/capability-management"
import { Effect, Schema } from "effect"
import { it } from "../../core/test/lib/effect"
import { CapabilityArtifactsHttpFixture } from "./capability-artifacts-http-fixture"

const body = new TextEncoder().encode("mutation body")
const receipt = (response: Response) => Effect.gen(function* () {
  expect(response.status).toBe(200)
  return yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString.pipe(
    Schema.decodeTo(CapabilityManagement.Receipt)))(yield* Effect.promise(() => response.text()))
})
const deniedBody = (response: Response) => Effect.gen(function* () {
  expect(response.status).toBe(403)
  expect(yield* Effect.promise(() => response.json())).toEqual(CapabilityArtifactsHttpFixture.denied)
})

it.live("HTTP mutations require an idempotency key before Core and never write without it", () => Effect.gen(function* () {
  const f = yield* CapabilityArtifactsHttpFixture.make()
  const auth = yield* f.issue()
  const seeded = yield* f.seed({ data: body })
  const url = f.url(seeded.ref)
  const requests = [
    { path: `${url}/share`, method: "POST", payload: { targetSessionID: f.peerID } },
    { path: `${url}/pin`, method: "PUT", payload: { pinned: true } },
    { path: url, method: "DELETE", payload: undefined },
  ]
  yield* Effect.forEach(requests, (entry) => Effect.gen(function* () {
    const missing = yield* f.request(entry.path, { auth, method: entry.method, payload: entry.payload })
    expect([entry.path, missing.status]).toEqual([entry.path, 400])
    // Authorization rejects malformed keys before schema decoding, with the constant denial.
    yield* deniedBody(yield* f.request(entry.path, { auth, method: entry.method, payload: entry.payload,
      headers: { "idempotency-key": "" } }))
    yield* deniedBody(yield* f.request(entry.path, { auth, method: entry.method, payload: entry.payload, key: "bad key!" }))
  }))
  expect(yield* f.database.db.select().from(CapabilityRequestTable).all()).toEqual([])
  expect((yield* f.database.db.select().from(CapabilityArtifactReferenceTable).all()).length).toBe(1)
  yield* Effect.forEach([{ pinned: "yes" }, { pinned: true, extra: 1 }], (payload) =>
    f.request(`${url}/pin`, { auth, method: "PUT", payload, key: "strict" }).pipe(
      Effect.map((response) => expect(response.status).toBe(400))))
}), 30_000)

it.live("HTTP share, pin and remove return Receipts; exact retries reuse the requestID", () => Effect.gen(function* () {
  const f = yield* CapabilityArtifactsHttpFixture.make()
  const auth = yield* f.issue()
  const seeded = yield* f.seed({ data: body })
  const url = f.url(seeded.ref)
  const shared = yield* receipt(yield* f.request(`${url}/share`, { auth, key: "share-1", payload: { targetSessionID: f.peerID } }))
  expect(shared).toMatchObject({ reused: false, data: { artifact: seeded.ref, targetSessionID: f.peerID } })
  const retried = yield* receipt(yield* f.request(`${url}/share`, { auth, key: "share-1", payload: { targetSessionID: f.peerID } }))
  expect(retried).toEqual({ ...shared, reused: true })
  expect((yield* f.request(f.url(seeded.ref, f.peerID), { auth })).status).toBe(200)
  yield* deniedBody(yield* f.request(`${url}/share`, { auth, key: "share-1", payload: { targetSessionID: f.sessionID } }))

  const pinned = yield* receipt(yield* f.request(`${url}/pin`, { auth, method: "PUT", key: "pin-1", payload: { pinned: true } }))
  expect(pinned).toMatchObject({ reused: false, data: { artifact: seeded.ref, pinned: true } })
  expect((yield* f.database.db.select().from(CapabilityArtifactPinTable).all()).length).toBe(1)
  const blocked = yield* f.request(url, { auth, method: "DELETE", key: "remove-pinned" })
  expect(blocked.status).toBe(409)
  expect(yield* Effect.promise(() => blocked.json())).toEqual({ _tag: "ConflictError", message: "Artifact reference is pinned" })
  const item = yield* f.request(url, { auth })
  expect(yield* Effect.promise(() => item.json())).toMatchObject({ pinned: true })

  yield* receipt(yield* f.request(`${url}/pin`, { auth, method: "PUT", key: "pin-2", payload: { pinned: false } }))
  const removed = yield* receipt(yield* f.request(url, { auth, method: "DELETE", key: "remove-1" }))
  expect(removed).toMatchObject({ reused: false, data: { artifact: seeded.ref, removed: true } })
  // The reference is gone, yet an exact retry reconciles through the ledger instead of failing.
  const again = yield* receipt(yield* f.request(url, { auth, method: "DELETE", key: "remove-1" }))
  expect(again).toEqual({ ...removed, reused: true })
  yield* deniedBody(yield* f.request(url, { auth }))
  yield* deniedBody(yield* f.request(url, { auth, method: "DELETE", key: "remove-2" }))
}), 30_000)

it.live("HTTP mutations collapse foreign, unreferenced and unauthorized targets to one 403", () => Effect.gen(function* () {
  const f = yield* CapabilityArtifactsHttpFixture.make()
  const auth = yield* f.issue()
  const seeded = yield* f.seed({ data: body })
  const foreignOwned = yield* f.seed({ data: body, owner: f.foreign })
  const readOnly = yield* f.issue({ placements: "instance", actions: ["artifact.read"] })
  const url = f.url(seeded.ref)
  const cases = [
    { path: `${f.url(foreignOwned.ref)}/pin`, method: "PUT", payload: { pinned: true }, auth },
    { path: `${f.url({ id: Capability.ArtifactID.create(), revision: 0 })}/pin`, method: "PUT", payload: { pinned: true }, auth },
    { path: `${url}/share`, method: "POST", payload: { targetSessionID: f.foreignSessionID }, auth },
    { path: `${url}/pin`, method: "PUT", payload: { pinned: true }, auth: readOnly },
    { path: url, method: "DELETE", payload: undefined, auth: readOnly },
    { path: f.url(seeded.ref, f.peerID), method: "DELETE", payload: undefined, auth },
  ]
  yield* Effect.forEach(cases, (entry, index) => f.request(entry.path, { auth: entry.auth, method: entry.method,
    payload: entry.payload, key: `denied-${index}` }).pipe(Effect.flatMap(deniedBody)))
  expect((yield* f.database.db.select().from(CapabilityArtifactReferenceTable).all()).map((row) => row.session_id))
    .toEqual([f.sessionID, f.sessionID])
}), 30_000)
