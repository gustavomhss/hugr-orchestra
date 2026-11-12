import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect, Fiber, Result, Schema, Stream } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Database } from "@orchestra/core/database/database"
import { AppProcess } from "@orchestra/core/process"
import { Project } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { MeetingContext } from "@orchestra/core/session/meeting-context"
import { SessionMeeting } from "@orchestra/core/session/meeting"
import { SessionSchema } from "@orchestra/core/session/schema"
import { SessionTable } from "@orchestra/core/session/sql"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { Location } from "@orchestra/schema/location"
import { Meeting } from "@orchestra/schema/meeting"
import { fixtureCredentials, fixtureSegment, type DeliveryReport } from "./live-delivery.fixture"

type Mode = "normal" | "transient" | "ended" | "pending" | "redirect307" | "redirect308"
const sessionID = SessionSchema.ID.make("ses_delivery_proof")
const reportSchema = Schema.Struct({
  phase: Schema.Literals(["started", "appended", "failed", "recovered", "stop-called", "stop-settled", "stop-rejected", "fixture-error"]),
  meetingID: Schema.optional(Schema.String), pending: Schema.optional(Schema.Number),
})

async function until(predicate: () => boolean | Promise<boolean>, label: string, milliseconds = 5000) {
  const deadline = Date.now() + milliseconds
  while (Date.now() < deadline) {
    if (await predicate()) return
    await Bun.sleep(10)
  }
  throw new Error(`Timed out observing ${label}`)
}

function withPeer<A, E>(mode: Mode, body: (peer: Peer) => Effect.Effect<A, E>) {
  return Effect.scoped(Effect.gen(function* () {
    const directory = yield* Effect.acquireRelease(
      Effect.promise(() => mkdtemp(join(tmpdir(), "meeting-delivery-"))),
      (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
    )
    const graph = AppNodeBuilder.build(LayerNode.group([Database.node, SessionMeeting.node, MeetingContext.node, AppProcess.node]), [
      [Database.node, Database.layerFromPath(join(directory, "meeting.sqlite"))],
    ])
    return yield* Effect.gen(function* () {
      const peer = yield* peerFor(directory, mode)
      const proc = yield* AppProcess.Service
      const child = yield* proc.spawn(ChildProcess.make(process.execPath, [
        join(import.meta.dir, "live-delivery.fixture.ts"), mode.startsWith("redirect") ? "redirect" : mode,
        peer.url, sessionID, directory,
      ], { cwd: directory, env: {}, extendEnv: false, stdin: "ignore", stdout: "pipe", stderr: "pipe" }))
      const output = yield* Stream.runCollect(child.stdout).pipe(Effect.forkChild)
      const errors = yield* Stream.runCollect(child.stderr).pipe(Effect.forkChild)
      return yield* body(peer).pipe(Effect.ensuring(
        child.kill({ forceKillAfter: "1 second" }).pipe(
          Effect.andThen(child.isRunning),
          Effect.flatMap((running) => running ? Effect.die("Owned fixture still running after kill") : Effect.void),
          Effect.andThen(Fiber.await(output)), Effect.andThen(Fiber.await(errors)),
          Effect.timeout("3 seconds"), Effect.orDie,
        ),
      ))
    }).pipe(Effect.provide(graph))
  }))
}

function peerFor(directory: string, mode: Mode) {
  return Effect.gen(function* () {
    const database = yield* Database.Service
    const meetings = yield* SessionMeeting.Service
    yield* database.db.insert(ProjectTable).values({ id: Project.ID.global, worktree: AbsolutePath.make(directory), sandboxes: [] }).run().pipe(Effect.orDie)
    yield* database.db.insert(SessionTable).values({
      id: sessionID, project_id: Project.ID.global, slug: "delivery", directory, title: "Delivery proof", version: "test",
    }).run().pipe(Effect.orDie)
    const location = new Location.Info({ directory: AbsolutePath.make(directory), project: { id: Project.ID.global, directory: AbsolutePath.make(directory) } })
    const authorization = `Basic ${Buffer.from(`${fixtureCredentials.username}:${fixtureCredentials.password}`).toString("base64")}`
    const reports: DeliveryReport[] = []
    const seen: { path: string; status: number; ids: string[]; meetingID?: string; reason?: string; diagnostic: boolean; authenticated: boolean; located: boolean }[] = []
    const foreign = { requests: 0, credentials: false, text: false }
    const network = { restored: false, failures: mode === "transient" ? 1 : 0 }
    const destination = yield* Effect.acquireRelease(Effect.sync(() => Bun.serve({
      hostname: "127.0.0.1", port: 0,
      async fetch(request) {
        foreign.requests++
        foreign.credentials ||= request.headers.has("authorization")
        foreign.text ||= (await request.text()).includes(fixtureSegment.text)
        return new Response(null, { status: 204 })
      },
    })), (server) => Effect.sync(() => { server.stop(true) }))
    const server = yield* Effect.acquireRelease(Effect.sync(() => Bun.serve({
      hostname: "127.0.0.1", port: 0,
      async fetch(request) {
        const url = new URL(request.url)
        if (url.pathname === "/fixture/report") {
          reports.push(Schema.decodeUnknownSync(reportSchema)(await request.json()))
          return new Response(null, { status: 204 })
        }
        const authenticated = request.headers.get("authorization") === authorization
        const located = url.searchParams.get("location[directory]") === directory
        if (!authenticated || !located)
          return new Response("FIXTURE_AUTH_OR_LOCATION", { status: 401 })
        Schema.decodeUnknownSync(Location.Ref)({ directory: url.searchParams.get("location[directory]") })
        const diagnostic = request.headers.has("x-fixture-diagnostic")
        const record = (status: number, ids: string[] = [], reason?: string, meetingID?: string) => {
          seen.push({ path: url.pathname, status, ids, meetingID, reason, diagnostic, authenticated, located })
        }
        const response = <A>(result: Result.Result<A, SessionMeeting.MeetingError>, payload: typeof Meeting.Info | typeof Meeting.Detail, ids: string[] = [], meetingID?: string) => {
          if (Result.isFailure(result)) {
            record(400, ids, result.failure.reason, meetingID)
            return Response.json({ name: "MeetingError", data: { reason: result.failure.reason } }, { status: 400 })
          }
          record(200)
          return Response.json(Schema.decodeUnknownSync(Location.response(payload))({ location, data: result.success }))
        }
        if (url.pathname === "/api/meeting/start") {
          const payload = Schema.decodeUnknownSync(Meeting.StartInput)(await request.json())
          return response(await Effect.runPromise(meetings.start(payload).pipe(Effect.result)), Meeting.Info)
        }
        if (url.pathname === "/api/meeting/segments") {
          const payload = Schema.decodeUnknownSync(Meeting.AppendInput)(await request.json())
          const ids = payload.segments.map((segment) => segment.id)
          if (!diagnostic && ((mode === "pending" && !network.restored) || network.failures-- > 0)) {
            record(503, ids, undefined, payload.meetingID)
            return new Response("Temporarily unavailable", { status: 503 })
          }
          if (!diagnostic && mode.startsWith("redirect")) {
            const status = mode === "redirect307" ? 307 : 308
            record(status, ids, undefined, payload.meetingID)
            return new Response(null, { status, headers: { location: `http://127.0.0.1:${destination.port}/foreign` } })
          }
          const appended = await Effect.runPromise(meetings.append(payload).pipe(Effect.result))
          if (Result.isFailure(appended)) return response(appended, Meeting.Info, ids, payload.meetingID)
          record(204, ids, undefined, payload.meetingID)
          return new Response(null, { status: 204 })
        }
        if (url.pathname === "/api/meeting/stop") {
          const payload = Schema.decodeUnknownSync(Meeting.StopInput)(await request.json())
          return response(await Effect.runPromise(meetings.stop(payload).pipe(Effect.result)), Meeting.Info)
        }
        if (url.pathname === "/api/meeting" && request.method === "GET") {
          const payload = Schema.decodeUnknownSync(Meeting.ReadQuery)({ meetingID: url.searchParams.get("meetingID") })
          return response(await Effect.runPromise(meetings.get(payload).pipe(Effect.result)), Meeting.Detail)
        }
        return new Response("FIXTURE_UNKNOWN_ROUTE", { status: 404 })
      },
    })), (server) => Effect.sync(() => { server.stop(true) }))
    const url = `http://127.0.0.1:${server.port}`
    const headers = { authorization, "content-type": "application/json", "x-fixture-diagnostic": "1" }
    const meetingID = () => {
      const id = reports.find((report) => report.phase === "started")?.meetingID
      if (!id) throw new Error("FIXTURE_MISSING_MEETING_ID")
      return Meeting.ID.make(id)
    }
    const detail = async () => {
      const endpoint = new URL("/api/meeting", url)
      endpoint.searchParams.set("meetingID", meetingID())
      endpoint.searchParams.set("location[directory]", directory)
      const response = await fetch(endpoint, { headers })
      if (!response.ok) throw new Error("FIXTURE_GET_FAILED")
      return Schema.decodeUnknownSync(Location.response(Meeting.Detail))(await response.json()).data
    }
    const endedProbe = async () => {
      const endpoint = new URL("/api/meeting/segments", url)
      endpoint.searchParams.set("location[directory]", directory)
      const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify({ meetingID: meetingID(), segments: [fixtureSegment] }) })
      const body: { data?: { reason?: string } } = await response.json()
      if (response.status !== 400 || body.data?.reason !== "ended") throw new Error("FIXTURE_CORE_DID_NOT_REFUSE_ENDED")
    }
    return { url, reports, seen, foreign, network, meetingID, detail, endedProbe }
  })
}

type Peer = Effect.Success<ReturnType<typeof peerFor>>

test("control: actual Core meeting receives an authenticated located segment before stop", async () => {
  expectSpawn(import.meta.path)
  await Effect.runPromise(withPeer("normal", (peer) => Effect.promise(async () => {
    await until(() => peer.reports.some((report) => report.phase === "stop-settled"), "normal stop")
    const detail = await peer.detail()
    expect(detail.segments).toEqual([fixtureSegment])
    expect(detail.meeting.timeEnded).not.toBeNull()
    expect(peer.seen.filter((request) => !request.diagnostic).map((request) => request.path)).toEqual(["/api/meeting/start", "/api/meeting/segments", "/api/meeting/stop"])
    expect(peer.seen.every((request) => request.authenticated && request.located)).toBe(true)
  })))
}, 30_000)

test("control: transient HTTP failure retries the same ID against real Core before stop", async () => {
  expectSpawn(import.meta.path)
  await Effect.runPromise(withPeer("transient", (peer) => Effect.promise(async () => {
    await until(() => peer.reports.some((report) => report.phase === "stop-settled"), "transient retry", 8000)
    const appends = peer.seen.filter((request) => request.path === "/api/meeting/segments")
    expect(appends.map((request) => request.status)).toEqual([503, 204])
    expect(appends.map((request) => request.ids)).toEqual([[fixtureSegment.id], [fixtureSegment.id]])
    expect(peer.reports.some((report) => report.phase === "failed" && report.pending === 1)).toBe(true)
    expect(peer.reports.some((report) => report.phase === "recovered")).toBe(true)
    const detail = await peer.detail()
    expect(detail.segments).toEqual([fixtureSegment])
    expect(detail.meeting.timeEnded).not.toBeNull()
  })))
}, 30_000)

test("control: actual Core HTTP refuses a client append after the meeting ended", async () => {
  expectSpawn(import.meta.path)
  await Effect.runPromise(withPeer("ended", (peer) => Effect.promise(async () => {
    await until(() => peer.reports.some((report) => report.phase === "failed"), "ended refusal")
    expect(peer.seen.some((request) => request.path === "/api/meeting/segments" && request.status === 400 && request.reason === "ended" && !request.diagnostic)).toBe(true)
    expect(peer.seen.find((request) => request.path === "/api/meeting/segments")?.ids).toEqual([fixtureSegment.id])
    const detail = await peer.detail()
    expect(detail.meeting.timeEnded).not.toBeNull()
    expect(detail.segments).toEqual([])
  })))
}, 30_000)

test("known pending segments prevent remote close and recover through the same client before final stop", async () => {
  expectSpawn(import.meta.path)
  await Effect.runPromise(withPeer("pending", (peer) => Effect.promise(async () => {
    await until(() => peer.reports.some((report) => report.phase === "stop-called") && peer.seen.some((request) => request.status === 503), "known failed append before stop")
    const deadline = Date.now() + 500
    while (!peer.reports.some((report) => report.phase === "stop-settled") && Date.now() < deadline) await Bun.sleep(10)
    const before = await peer.detail()
    const failures = peer.seen.filter((request) => request.status === 503)
    if (before.segments.length !== 0 || !peer.reports.some((report) => report.phase === "failed" && report.pending === 1) ||
      failures.some((request) => request.meetingID !== peer.meetingID() || request.ids.length !== 1 || request.ids[0] !== fixtureSegment.id))
      throw new Error("FIXTURE_MISSING_KNOWN_PENDING_SEGMENT")
    // This diagnostic only runs on the broken path. It never supplies delivery on the fixed path.
    if (before.meeting.timeEnded !== null) await peer.endedProbe()
    console.log("meeting-close witness", { failedAppends: peer.seen.filter((request) => request.status === 503).length, ended: before.meeting.timeEnded !== null, storedSegments: before.segments.length })
    expect(before.meeting.timeEnded).toBeNull()
    expect(peer.seen.filter((request) => request.path === "/api/meeting/stop" && !request.diagnostic)).toEqual([])
    peer.network.restored = true
    await until(async () => {
      const detail = await peer.detail()
      return detail.meeting.timeEnded !== null && detail.segments.some((segment) => segment.id === fixtureSegment.id)
    }, "client delivery and close after connectivity restored", 8000)
    expect((await peer.detail()).segments).toEqual([fixtureSegment])
    const requests = peer.seen.filter((request) => !request.diagnostic)
    const appended = requests.findIndex((request) => request.path === "/api/meeting/segments" && request.status === 204)
    const stopped = requests.findIndex((request) => request.path === "/api/meeting/stop")
    expect(appended).toBeGreaterThanOrEqual(0)
    expect(stopped).toBeGreaterThan(appended)
    const count = requests.length
    await Bun.sleep(2200)
    expect(peer.seen.filter((request) => !request.diagnostic)).toHaveLength(count)
  })))
}, 30_000)

for (const status of [307, 308] as const) {
  test(`append ${status} cannot forward a pending transcript or credentials to another authority`, async () => {
    expectSpawn(import.meta.path)
    await Effect.runPromise(withPeer(status === 307 ? "redirect307" : "redirect308", (peer) => Effect.promise(async () => {
      await until(() => peer.seen.some((request) => request.status === status) && (peer.foreign.requests > 0 || peer.reports.some((report) => report.phase === "failed")), "redirect response observed")
      const detail = await peer.detail()
      if (detail.meeting.timeEnded !== null || detail.segments.length !== 0) throw new Error("FIXTURE_REDIRECT_CORE_STATE_INVALID")
      if (!peer.seen.some((request) => request.status === status && request.meetingID === peer.meetingID() && request.ids.includes(fixtureSegment.id)))
        throw new Error("FIXTURE_REDIRECT_IDENTITY_INVALID")
      console.log("meeting-redirect witness", { status, foreignRequests: peer.foreign.requests, foreignText: peer.foreign.text, foreignCredentials: peer.foreign.credentials })
      expect(peer.foreign.requests).toBe(0)
      expect(peer.foreign.text).toBe(false)
      expect(peer.foreign.credentials).toBe(false)
      expect(peer.seen.filter((request) => request.path === "/api/meeting/stop")).toEqual([])
    })))
  }, 30_000)
}
