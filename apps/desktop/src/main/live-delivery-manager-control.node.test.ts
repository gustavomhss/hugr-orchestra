import assert from "node:assert/strict"
import { test } from "node:test"
import { openLiveOutbox } from "./live-outbox.ts"
import { envelope, fixture, info, location, pause, peer, segment, sizedDetail, until, uuid } from "./live-delivery-manager-test.fixture.ts"

test("control: actual Node SQLite commits and reopens a retained manager record", { timeout: 5000 }, async (t) => {
  assert.equal("bun" in process.versions, false)
  const f = await fixture(t), record = f.retained()
  f.store.close()
  const reopened = openLiveOutbox(f.root)
  try { assert.deepEqual(reopened.batch(record.id).segments, [segment()]); assert.equal(reopened.profileID, record.target.profileID) }
  finally { reopened.close() }
})

test("control: actual Node fetch transports Basic/location and reads a complete JSON response", { timeout: 5000 }, async (t) => {
  const remote = await peer(t), url = new URL("/api/meeting/start", remote.url)
  url.searchParams.set("location[directory]", location.directory)
  const response = await fetch(url, { method: "POST", headers: { authorization: `Basic ${Buffer.from("fixture:private-secret").toString("base64")}`, "content-type": "application/json" }, body: JSON.stringify({ sessionID: "ses_control", title: "Control", consent: "unknown" }), redirect: "manual" })
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), envelope(info("ses_control", "Control")))
  assert.equal(remote.requests[0]?.authorized, true); assert.equal(remote.requests[0]?.directory, location.directory)
})

for (const status of [307, 308]) test(`control: actual Node manual redirect${status} sends nothing to foreign HTTP peer`, { timeout: 5000 }, async (t) => {
  const remote = await peer(t), foreign = await peer(t)
  remote.handlers.set("POST /api/meeting/segments", (_, response) => { response.writeHead(status, { location: `${foreign.url}/foreign` }); response.end() })
  const response = await fetch(`${remote.url}/api/meeting/segments`, { method: "POST", body: JSON.stringify({ meetingID: "mtg_control", segments: [segment()] }), redirect: "manual" })
  await response.arrayBuffer(); assert.equal(response.status, status); await pause(30); assert.equal(foreign.requests.length, 0)
})

test("control: actual Node abort cancels a response body after real headers and closes its HTTP request", { timeout: 5000 }, async (t) => {
  const remote = await peer(t), abort = new AbortController()
  remote.handlers.set("GET /api/meeting", (_, response) => { response.writeHead(200, { "content-type": "application/json" }); response.write("{") })
  const response = await fetch(`${remote.url}/api/meeting`, { signal: abort.signal, redirect: "manual" })
  const body = response.text(); abort.abort()
  await assert.rejects(body); await until(() => remote.requests[0]?.closed === true, "aborted HTTP body closed")
})

test("control: real HTTP fixture emits a valid exact128MiB legacy detail without invoking manager", { timeout: 8000 }, async (t) => {
  const remote = await peer(t)
  remote.handlers.set("GET /api/meeting", (_, response) => sizedDetail(response, 128 * 1024 * 1024))
  const response = await fetch(`${remote.url}/api/meeting`, { redirect: "manual" }), body = await response.arrayBuffer()
  assert.equal(body.byteLength, 128 * 1024 * 1024)
  const parsed = JSON.parse(Buffer.from(body).toString("utf8"))
  assert.equal(parsed.data.meeting.id, info().id); assert.equal(parsed.data.segments[0].id, uuid(900))
})
