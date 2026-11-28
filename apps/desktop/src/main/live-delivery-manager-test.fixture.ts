import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { test, type TestContext } from "node:test"
import { openLiveOutbox } from "./live-outbox.ts"
import type { LiveDeliveryConnection } from "./live-delivery-contract.ts"
import type { MeetingSegment } from "./live-meeting-client.ts"

export const pause = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
export const uuid = (index: number) => `10000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`
export const segment = (index = 1, text = "Fixture retained café e\u0301") => ({ id: uuid(index), track: "me" as const, text, startMs: 0, endMs: 100 })
export const gate = <A = void>() => Promise.withResolvers<A>()
export const byteLength = (value: unknown) => Buffer.byteLength(JSON.stringify(value), "utf8")

export async function until(predicate: () => boolean, label: string, milliseconds = 3000) {
  const deadline = Date.now() + milliseconds
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`Fixture observation timed out: ${label}`)
    await pause(5)
  }
}

export type RequestRecord = { method: string; path: string; body: Record<string, unknown>; authorized: boolean; directory: string | null; meetingID?: string; closed: boolean }
export type PeerHandler = (request: IncomingMessage, response: ServerResponse, record: RequestRecord) => void | Promise<void>

// Real HTTP fault boundary only. Canned protocol DTOs never implement Core's meeting lifecycle/idempotency policy.
export async function peer(t: TestContext) {
  const requests: RequestRecord[] = []
  const handlers = new Map<string, PeerHandler>()
  const infos = new Map<string, ReturnType<typeof info>>()
  const credentials = { username: "fixture", password: "private-secret" }
  const state = { active: 0, maxActive: 0, failures: [] as unknown[] }
  const server = createServer(async (request, response) => {
    state.active++
    state.maxActive = Math.max(state.maxActive, state.active)
    const record: RequestRecord = { method: request.method ?? "", path: new URL(request.url ?? "/", "http://fixture").pathname, body: {}, authorized: request.headers.authorization === `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")}`, directory: new URL(request.url ?? "/", "http://fixture").searchParams.get("location[directory]"), closed: false }
    response.once("close", () => { record.closed = true; state.active-- })
    response.on("error", (error: NodeJS.ErrnoException) => { if (!response.destroyed || !["ECONNRESET", "EPIPE", "ERR_STREAM_PREMATURE_CLOSE", "ERR_STREAM_DESTROYED"].includes(error.code ?? "")) state.failures.push(error) })
    try {
      const chunks: Buffer[] = []
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk))
        if (chunks.reduce((sum, item) => sum + item.byteLength, 0) > 1024 * 1024) throw new Error("Fixture request exceeded wire budget")
      }
      if (chunks.length) record.body = JSON.parse(Buffer.concat(chunks).toString("utf8"))
      record.meetingID = new URL(request.url ?? "/", "http://fixture").searchParams.get("meetingID") ?? (typeof record.body.meetingID === "string" ? record.body.meetingID : undefined)
      requests.push(record)
      const handler = handlers.get(`${record.method} ${record.path}`)
      if (handler) { await handler(request, response, record); return }
      if (record.path === "/api/meeting/start") {
        const value = info(String(record.body.sessionID), String(record.body.title))
        infos.set(value.id, value)
        json(response, envelope(value))
        return
      }
      if (record.path === "/api/meeting/segments") { response.writeHead(204); response.end(); return }
      const id = record.method === "GET" ? new URL(request.url ?? "/", "http://fixture").searchParams.get("meetingID") : record.body.meetingID
      const value = infos.get(String(id))
      if (!value) { json(response, { name: "MeetingError", data: { reason: "missing_meeting" } }, 400); return }
      if (record.path === "/api/meeting/stop") { json(response, envelope({ ...value, timeEnded: value.timeStarted + 1000 })); return }
      if (record.path === "/api/meeting" && record.method === "GET") { json(response, detail(value)); return }
      throw new Error("Unsupported fixture operation")
    } catch (error) {
      state.failures.push(error)
      if (response.headersSent) { response.destroy(); return }
      if (!response.destroyed) { response.writeHead(500); response.end("FIXTURE_FAILURE") }
    }
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  assert.ok(address && typeof address === "object")
  t.after(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    assert.deepEqual(state.failures, [])
  })
  return { url: `http://127.0.0.1:${address.port}`, requests, handlers, infos, state, server, credentials }
}

export function info(sessionID = "ses_manager_1", title = "Delivery proof") {
  return { id: `mtg_${sessionID}`, sessionID, title, timeStarted: 1700000000000, timeEnded: null as number | null }
}

export const location = { directory: "/remote/exact/../workspace", project: { id: "global", directory: "/remote/exact/../workspace" } }
export const envelope = <A>(data: A) => ({ location, data })
export const detail = (meeting: ReturnType<typeof info>, segments: readonly MeetingSegment[] = []) => envelope({
  meeting, segments,
  summary: { id: meeting.id, title: meeting.title, startedAt: meeting.timeStarted, ...(meeting.timeEnded === null ? {} : { endedAt: meeting.timeEnded }), people: [], retention: "kept", consent: "unknown", counts: { decisions: 0, commitments: 0, openCommitments: 0, answers: 0 } },
  card: { status: "pending", summary: "", decisions: [], commitments: [], questions: [], suggestions: [], newPeople: [] },
})
export function json(response: ServerResponse, body: unknown, status = 200) { response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(body)) }

export async function sizedDetail(response: ServerResponse, size: number) {
  const body = JSON.stringify(detail(info(), [segment(900, "")])), split = body.indexOf('"text":""') + '"text":""'.length - 1
  const padding = size - Buffer.byteLength(body), chunk = "x".repeat(64 * 1024)
  assert.ok(split > 0 && padding >= 0)
  const write = async (text: string) => {
    if (response.destroyed) return false
    if (!response.write(text)) await new Promise<void>((resolve) => {
      const ready = () => { response.off("drain", ready); response.off("close", ready); resolve() }
      response.once("drain", ready); response.once("close", ready)
    })
    return !response.destroyed
  }
  response.writeHead(200, { "content-type": "application/json", "content-length": size })
  if (!(await write(body.slice(0, split)))) return
  for (let remaining = padding; remaining > 0; remaining -= chunk.length) if (!(await write(chunk.slice(0, Math.min(remaining, chunk.length))))) return
  if (!response.destroyed) response.end(body.slice(split))
}

export async function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "live-delivery-manager-"))
  const owned: (() => void | Promise<void>)[] = []
  t.after(async () => {
    const failures: unknown[] = []
    for (const cleanup of owned.reverse()) {
      const expired = Promise.withResolvers<never>()
      const timer = setTimeout(() => expired.reject(new Error("manager IO not joined")), 1000)
      try { await Promise.race([Promise.resolve().then(cleanup), expired.promise]) }
      catch (error) { failures.push(error) }
      finally { clearTimeout(timer) }
    }
    try { rmSync(root, { recursive: true, force: true }) }
    catch (error) { failures.push(error) }
    if (failures.length) throw new AggregateError(failures, "Fixture cleanup failed")
  })
  const remote = await peer(t)
  const store = openLiveOutbox(root)
  owned.push(() => store.close())
  const sql = new DatabaseSync(join(root, "live-outbox", "outbox.sqlite"))
  sql.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=0")
  owned.push(() => sql.close())
  const current: { value: LiveDeliveryConnection } = { value: { mode: "owned", epoch: {}, server: { url: remote.url, username: "fixture", password: "private-secret", directory: location.directory } } }
  const retained = (index = 1, items: readonly MeetingSegment[] = [segment(index)], closeRequested = false) => {
    const meeting = info(`ses_manager_${index}`)
    remote.infos.set(meeting.id, meeting)
    const record = store.create({ id: uuid(index), target: { profileID: store.profileID, mode: "owned", authority: remote.url, directory: location.directory }, meeting: { id: meeting.id, sessionID: meeting.sessionID, title: meeting.title, timeStarted: meeting.timeStarted } })
    items.forEach((item) => store.append(record.id, item))
    if (closeRequested) store.requestClose(record.id)
    return record
  }
  return { root, store, sql, remote, current, retained, own: (cleanup: () => void | Promise<void>) => owned.push(cleanup) }
}

export type Fixture = Awaited<ReturnType<typeof fixture>>
function check(name: string, body: (t: TestContext) => void | Promise<void>) { test(name, { timeout: 8000 }, body) }
const input = (index = 1) => ({ sessionID: `ses_manager_${index}`, title: "Delivery proof" })
const sends = (f: Fixture) => f.remote.requests.filter((request) => request.path === "/api/meeting/segments")
const stops = (f: Fixture) => f.remote.requests.filter((request) => request.path === "/api/meeting/stop")

export { check, input, sends, stops }
