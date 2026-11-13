import assert from "node:assert/strict"
import { after, test } from "node:test"
import { setImmediate } from "node:timers/promises"
import type { MeetingServer } from "./live-meeting-client.ts"
import { bounded } from "./live-delivery-owner-test.fixture.ts"
import { gate, pause, until } from "./live-delivery-manager-test.fixture.ts"
import { loadLoopBoundary, loopFixture } from "./live-loop-delivery.fixture.ts"

const boundary = loadLoopBoundary()
after(() => boundary.dispose())

// This file runs in its own Node process. Only Electron UI, capture and STT boundaries are controlled.
test("Loop refuses closed owner admission before creating a Session, including concurrent starts", { timeout: 10_000 }, async (t) => {
  const f = await loopFixture(t, boundary.load, false)
  const results = await bounded(Promise.all([f.loop.start("first"), f.loop.start("second")]), "Closed admission waited for a connection")
  assert.ok(results.every((result) => !result.ok))
  assert.equal(f.sessions().length, 0)
  assert.equal(f.state.captures, 0)
  assert.equal(f.state.serverLookups, 0, "Admission is checked before waiting on server readiness")
  await f.owner.setConnection(f.connection)
  await f.running()
  const before = f.sessions().length
  const rotating = f.owner.invalidate()
  const refused = await bounded(f.loop.start("during rotation"), "Rotation admission did not reject")
  assert.equal(refused.ok, false)
  await bounded(rotating, "Rotation did not join local stop")
  assert.equal(f.sessions().length, before)
  assert.equal(f.summaries().length, 0)
})

test("Loop stop joins a pending actual Senses startup and its late capture handle", { timeout: 10_000 }, async (t) => {
  const f = await loopFixture(t, boundary.load)
  const acquisition = f.hold(), close = f.hold()
  f.state.acquisition = acquisition.promise
  f.state.close = close.promise
  const observed = { start: false, stop: false }
  const starting = f.loop.start().finally(() => { observed.start = true })
  void starting.catch(() => undefined)
  await bounded(f.state.captureEntered.promise, "Actual Senses capture acquisition was not entered")
  const stopping = f.loop.stop("rotation").finally(() => { observed.stop = true })
  void stopping.catch(() => undefined)
  await setImmediate()
  assert.deepEqual(observed, { start: false, stop: false })
  acquisition.resolve()
  await until(() => f.state.captureStops === 1, "Late capture handle was not stopped")
  assert.deepEqual(observed, { start: false, stop: false }, "Neither owner operation can outlive its acquired handle")
  close.resolve()
  assert.equal((await bounded(starting, "Cancelled startup did not join")).ok, false)
  await bounded(stopping, "Loop stop returned neither joined startup nor cleanup")
  assert.equal(f.state.captureStops, 1)
  assert.equal(f.state.sttStops, 1)
  assert.ok(f.owner.manager.snapshot().items.every((item) => !item.activeProducer))
  await until(() => f.follows().every((request) => request.closed), "Cancelled startup left a follow transport open")
  assert.equal(f.summaries().length, 0)
})

test("user stop returns before real append ACK; only confirmed foreground completion sends one summary", { timeout: 10_000 }, async (t) => {
  const f = await loopFixture(t, boundary.load), ack = f.hold()
  f.remote.handlers.set("POST /api/meeting/segments", async (_, response) => { await ack.promise; response.writeHead(204); response.end() })
  await f.running()
  const foreground = f.owner.manager.snapshot().items[0]
  assert.ok(foreground)
  f.piece()
  await bounded(f.loop.stop(), "Local stop waited for remote ACK")
  await until(() => f.remote.requests.some((request) => request.path === "/api/meeting/segments"), "Real append was not attempted")
  const pending = f.owner.manager.snapshot().items.find((item) => item.id === foreground.id)
  assert.ok(pending)
  assert.equal(pending.sealed, true)
  assert.equal(pending.activeProducer, false)
  assert.equal(pending.pendingCount, 1)
  assert.equal(f.state.completions.length, 0)
  assert.equal(f.summaries().length, 0, "Unconfirmed local stop must not prompt a saved summary")
  assert.equal(f.remote.requests.filter((request) => request.path === "/api/meeting/stop").length, 0)
  ack.resolve()
  await until(() => f.summaries().length === 1, "Actual committed completion did not prompt the foreground summary")
  assert.deepEqual(f.state.completions, [{ localID: foreground.id, sessionID: foreground.meeting.sessionID, meetingID: foreground.meeting.id }])
  assert.equal(f.owner.manager.snapshot().items.length, 0)
  assert.equal(f.summaries()[0]?.path, `/api/session/${foreground.meeting.sessionID}/prompt`)
  await f.loop.stop()
  await setImmediate()
  assert.equal(f.summaries().length, 1)
})

test("completion after physical seal but before Loop's stop continuation is retained until local close", { timeout: 10_000 }, async (t) => {
  const f = await loopFixture(t, boundary.load), continuation = f.hold()
  f.state.postSeal = continuation.promise
  await f.running()
  const foreground = f.owner.manager.snapshot().items[0]
  assert.ok(foreground)
  const stopping = f.loop.stop()
  void stopping.catch(() => undefined)
  await bounded(f.state.postSealEntered.promise, "Actual Senses did not seal and join resources")
  assert.equal(f.state.captureStops, 1)
  assert.equal(f.state.sttStops, 1)
  await until(() => f.state.completions.length === 1, "Real manager did not commit completion")
  assert.equal(f.owner.manager.snapshot().items.length, 0)
  assert.equal(f.summaries().length, 0, "The Loop local-close marker is still behind its held continuation")
  continuation.resolve()
  await bounded(stopping, "Loop continuation did not close locally")
  await until(() => f.summaries().length === 1, "Early confirmed completion was lost")
  assert.equal(f.summaries()[0]?.path, `/api/session/${foreground.meeting.sessionID}/prompt`)
  await f.loop.stop()
  assert.equal(f.summaries().length, 1)
})

test("a real old completion after replacement cannot summarize either the old or new foreground Session", { timeout: 10_000 }, async (t) => {
  const f = await loopFixture(t, boundary.load), ack = f.hold()
  f.remote.handlers.set("POST /api/meeting/segments", async (_, response) => { await ack.promise; response.writeHead(204); response.end() })
  await f.running("old")
  const old = f.owner.manager.snapshot().items[0]
  assert.ok(old)
  f.piece("old retained content")
  await bounded(f.loop.stop(), "Old local stop awaited ACK")
  await f.running("new")
  const current = f.owner.manager.snapshot().items.find((item) => item.id !== old.id)
  assert.ok(current)
  ack.resolve()
  await until(() => f.state.completions.some((item) => item.localID === old.id), "Old actual delivery did not complete")
  await setImmediate()
  assert.equal(f.summaries().length, 0)
  assert.equal(f.loop.runState().running, true)
  assert.equal(f.follows()[0]?.closed, true)
  await f.loop.stop("quit")
  assert.equal(f.summaries().length, 0)
})

for (const reason of ["rotation", "quit"] as const) {
  test(`${reason} aborts and joins actual prompt and follow before stop returns, suppressing summary`, { timeout: 10_000 }, async (t) => {
    const f = await loopFixture(t, boundary.load), reply = f.hold()
    await f.running()
    const foreground = f.owner.manager.snapshot().items[0]
    assert.ok(foreground)
    f.remote.handlers.set(`POST /api/session/${foreground.meeting.sessionID}/prompt`, async (_, response) => { await reply.promise; response.writeHead(204); response.end() })
    f.fire({ kind: "ask", question: "Held actual prompt" })
    await until(() => f.prompts().length === 1, "Actual question prompt did not reach HTTP")
    const prompt = f.prompts()[0], follow = f.follows()[0]
    assert.ok(prompt && follow)
    await bounded(f.loop.stop(reason), "Stop did not cancel and join outstanding Session IO")
    await until(() => prompt.closed && follow.closed, "Joined cancellation left prompt/follow transports open")
    assert.equal(f.state.captureStops, 1)
    assert.equal(f.state.sttStops, 1)
    await until(() => f.state.completions.length === 1, "Actual sealed producer did not complete")
    assert.equal(f.summaries().length, 0)
    reply.resolve()
    await setImmediate()
    assert.equal(f.summaries().length, 0)
  })
}

test("rotation during an already pending user stop immediately suppresses its eventual summary", { timeout: 10_000 }, async (t) => {
  const f = await loopFixture(t, boundary.load), continuation = f.hold()
  f.state.postSeal = continuation.promise
  await f.running()
  const user = f.loop.stop()
  void user.catch(() => undefined)
  await bounded(f.state.postSealEntered.promise, "Actual local physical cleanup was not joined")
  const rotating = f.owner.invalidate()
  void rotating.catch(() => undefined)
  await setImmediate()
  await until(() => f.follows().every((request) => request.closed), "Rotation must cancel follow before local cleanup finishes")
  continuation.resolve()
  await bounded(Promise.all([user, rotating]), "Rotation did not join the existing user stop")
  assert.equal(f.summaries().length, 0)
})

test("actual Loop rename uses owner cancellation for its held response body", { timeout: 10_000 }, async (t) => {
  const f = await loopFixture(t, boundary.load), reply = f.hold()
  await f.running()
  const running = f.loop.runState()
  assert.equal(running.running, true)
  assert.ok(running.running)
  const meetingID = running.meetingID
  f.remote.handlers.set("PATCH /api/meeting", async (_, response) => {
    response.writeHead(200, { "content-type": "application/json" }); response.write('{"data":{"title":"')
    await reply.promise
    response.end('late"}}')
  })
  const renamed = f.loop.rename(meetingID, "new title").then(() => false, () => true)
  await until(() => f.remote.requests.some((request) => request.method === "PATCH"), "Actual rename was not entered")
  await bounded(f.loop.stop("rotation"), "Rotation did not join owned rename")
  assert.equal(await bounded(renamed, "Rename body ignored owner cancellation"), true)
  await until(() => f.remote.requests.filter((request) => request.method === "PATCH").every((request) => request.closed), "Rename response remained open")
  assert.equal(f.summaries().length, 0)
})

test("actual Loop rename bounds a held successful response body at its real 10s deadline", { timeout: 16_000 }, async (t) => {
  const f = await loopFixture(t, boundary.load), reply = f.hold()
  await f.running()
  const running = f.loop.runState()
  assert.ok(running.running)
  f.remote.handlers.set("PATCH /api/meeting", async (_, response) => {
    response.writeHead(200, { "content-type": "application/json" }); response.write('{"data":{"title":"')
    await reply.promise; response.end('late"}}')
  })
  const began = Date.now(), expired = gate<never>()
  const timer = setTimeout(() => expired.reject(new Error("Rename body exceeded its 10s request deadline")), 12_000)
  t.after(() => clearTimeout(timer))
  const renamed = f.loop.rename(running.meetingID, "deadline title").then(() => false, () => true)
  await until(() => f.remote.requests.some((request) => request.method === "PATCH"), "Actual rename did not reach HTTP")
  assert.equal(await Promise.race([renamed, expired.promise]).finally(() => clearTimeout(timer)), true)
  assert.ok(Date.now() - began >= 9000, "A real request deadline, rather than an unrelated early failure, must reject rename")
  await until(() => f.remote.requests.filter((request) => request.method === "PATCH").every((request) => request.closed), "Expired rename body remained open")
  await f.loop.stop("quit")
})

// The factory's optional signal is frozen; actual source gets it in B2, without changing existing callers.
function clientFactory(value: Awaited<ReturnType<typeof boundary.load>>) {
  const factory: (server: MeetingServer, signal?: AbortSignal) => ReturnType<typeof value.sessionClient> = value.sessionClient
  return factory
}

test("Session create and prompt observe their owner signal through headers and response bodies", { timeout: 10_000 }, async (t) => {
  const f = await loopFixture(t, boundary.load), reply = f.hold(), owner = f.controller()
  f.remote.handlers.set("POST /api/session", async (_, response) => {
    response.writeHead(200, { "content-type": "application/json" }); response.write('{"data":{"id":"')
    await reply.promise; response.end('late"}}')
  })
  f.remote.handlers.set("POST /api/session/ses_owned/prompt", async (_, response) => { await reply.promise; response.writeHead(204); response.end() })
  const client = clientFactory(f.implementation)(f.connection.server, owner.signal)
  const created = client.create().then(() => false, () => true)
  const prompted = client.prompt("ses_owned", { text: "owned" }, "steer").then(() => false, () => true)
  await until(() => f.sessions().length === 1 && f.prompts().length === 1, "Actual owned requests did not enter HTTP")
  owner.abort()
  assert.deepEqual(await bounded(Promise.all([created, prompted]), "Session IO ignored its owner abort"), [true, true])
  await until(() => [...f.sessions(), ...f.prompts()].every((request) => request.closed), "Aborted HTTP bodies remained open")
})

test("real 10s deadlines bound create body, prompt and SSE headers, while established SSE remains owner-lived", { timeout: 25_000 }, async (t) => {
  const f = await loopFixture(t, boundary.load), release = f.hold(), owner = f.controller(), followOwner = f.controller()
  f.remote.handlers.set("POST /api/session", async (_, response) => {
    response.writeHead(200, { "content-type": "application/json" }); response.write('{"data":{"id":"')
    await release.promise; response.end('late"}}')
  })
  f.remote.handlers.set("POST /api/session/ses_deadline/prompt", async (_, response) => { await release.promise; response.writeHead(204); response.end() })
  // The first follow has an actual body; the second has not received headers. No clock or fetch replacement.
  const entered = { follows: 0 }
  f.remote.handlers.set("GET /api/event", async (_, response) => {
    entered.follows++
    if (entered.follows === 1) { response.writeHead(200, { "content-type": "text/event-stream" }); response.write(": established\n\n") }
    await release.promise
    response.end()
  })
  const client = clientFactory(f.implementation)(f.connection.server, owner.signal)
  const began = Date.now()
  const created = client.create().then(() => ({ rejected: false, elapsed: Date.now() - began }), () => ({ rejected: true, elapsed: Date.now() - began }))
  const prompted = client.prompt("ses_deadline", { text: "deadline" }, "steer").then(() => ({ rejected: false, elapsed: Date.now() - began }), () => ({ rejected: true, elapsed: Date.now() - began }))
  const established = client.follow("ses_established", () => {}, followOwner.signal)
  void established.catch(() => undefined)
  await until(() => f.follows().length === 1, "Established SSE did not connect")
  const waiting = client.follow("ses_headers", () => {}, followOwner.signal)
  void waiting.catch(() => undefined)
  await until(() => f.follows().length === 2, "Held SSE headers were not entered")
  const opened = Date.now()
  const [body, headers] = f.follows()
  assert.ok(body && headers)
  const expired = gate<never>()
  const timer = setTimeout(() => expired.reject(new Error("Owned 10s HTTP deadline did not settle actual create/prompt")), 12_000)
  t.after(() => clearTimeout(timer))
  const outcomes = await Promise.race([Promise.all([created, prompted]), expired.promise]).finally(() => clearTimeout(timer))
  assert.ok(outcomes.every((outcome) => outcome.rejected && outcome.elapsed >= 9000), "Actual 10s deadlines must reject; unrelated immediate errors are not proof")
  assert.equal(f.sessions().length, 1)
  assert.equal(f.prompts().length, 1)
  await until(() => headers.closed, "SSE header handshake exceeded its 10s deadline", 2000)
  if (Date.now() - opened < 10_500) await pause(10_500 - (Date.now() - opened))
  assert.equal(body.closed, false, "A successful SSE handshake must remove the 10s timer from its long-lived body")
  owner.abort()
  // Factory ownership must stop established bodies/retry waits, even with a separately un-aborted follow signal.
  await bounded(Promise.all([established, waiting]), "Factory owner abort did not join actual SSE bodies/retries")
  assert.equal(followOwner.signal.aborted, false)
  await until(() => f.follows().every((request) => request.closed), "Owner abort left an SSE request open")
})
