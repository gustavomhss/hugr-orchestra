import assert from "node:assert/strict"
import { writeByteOverflow } from "./live-delivery-manager-byte.fixture.ts"
import { test } from "node:test"
import { gate, info, location, peer, until } from "./live-delivery-manager-test.fixture.ts"

test("control: native Node fetch consumes the exact chunked UTF8 producer beyond128MiB", { timeout: 10000 }, async (t) => {
  const remote = await peer(t), limit = 128 * 1024 * 1024
  const observation = { bodyBytesWritten: 0, lastWrite: 0, writeCompleted: 0, closed: false, bytesWritten: () => 0, fetchStarted: false, headersResolved: false, status: 0, readCalls: 0, readSettled: 0, bytesRead: 0, lastRead: 0, abortRequested: false, readerJoinSettled: false }
  // Same real transport fixture as byte acceptance; this control exercises no delivery policy.
  remote.handlers.set("GET /api/meeting", async (_, response) => {
    await writeByteOverflow(response, limit, observation, remote.state.failures)
  })
  const url = new URL("/api/meeting", remote.url), abort = new AbortController()
  url.searchParams.set("location[directory]", location.directory)
  url.searchParams.set("meetingID", info().id)
  const headers = new Headers({ "content-type": "application/json" })
  headers.set("authorization", `Basic ${Buffer.from(`${remote.credentials.username}:${remote.credentials.password}`).toString("base64")}`)
  const expired = gate<never>(), timer = setTimeout(() => expired.reject(new Error("Chunked UTF8 byte boundary not reached within7s")), 7000)
  const requestTimer = setTimeout(() => abort.abort(), 10000)
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  const io = (async () => {
    observation.fetchStarted = true
    const response = await fetch(url, { method: "GET", headers, redirect: "manual", signal: abort.signal })
    observation.headersResolved = true; observation.status = response.status
    reader = response.body?.getReader()
    assert.equal(response.status, 200); assert.ok(reader)
    assert.equal(remote.requests[0]?.authorized, true); assert.equal(remote.requests[0]?.directory, location.directory)
    assert.equal(remote.requests[0]?.meetingID, info().id)
    while (observation.bytesRead <= limit) {
      observation.readCalls++
      const chunk = await reader.read().finally(() => { observation.readSettled++ })
      assert.equal(chunk.done, false)
      observation.bytesRead += chunk.value!.byteLength; observation.lastRead = Date.now()
    }
  })()
  try {
    await Promise.race([io, expired.promise])
    assert.ok(observation.headersResolved && observation.bytesRead > limit)
  } catch (error) {
    console.error(JSON.stringify({ kind: "native-chunked-UTF8-diagnostic", ...observation, bytesWritten: observation.bytesWritten() }))
    throw error
  } finally {
    clearTimeout(timer); clearTimeout(requestTimer)
    const cleanupExpired = gate<never>(), cleanupTimer = setTimeout(() => cleanupExpired.reject(new Error("native fetch IO not joined")), 1000)
    const cleanup = (async () => {
      observation.abortRequested = true; abort.abort()
      if (reader) { await Promise.allSettled([reader.cancel(), reader.closed]); reader.releaseLock() }
      await Promise.allSettled([io]); observation.readerJoinSettled = true
      await until(() => remote.requests[0]?.closed === true, "native fetch cancellation reaches actual peer close", 1000)
      assert.equal(remote.requests[0]?.closed, true)
    })()
    try { await Promise.race([cleanup, cleanupExpired.promise]) }
    catch (error) { console.error(JSON.stringify({ kind: "native-chunked-UTF8-cleanup-diagnostic", ...observation, bytesWritten: observation.bytesWritten() })); throw error }
    finally { clearTimeout(cleanupTimer) }
  }
})
