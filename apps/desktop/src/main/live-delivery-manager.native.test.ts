import { expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
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

const sessionID = SessionSchema.ID.make("ses_manager_bridge")
const controlSession = SessionSchema.ID.make("ses_manager_control")
const segment = { id: "cd84522b-caf9-4cdd-8f74-7d94d4ba1eac", track: "me" as const, text: "Fixture transcript retained for delivery.", startMs: 0, endMs: 100 }
const reportSchema = Schema.Struct({ phase: Schema.Literals(["held", "recovered", "done", "fixture-error"]), pid: Schema.Number, node: Schema.String, profileID: Schema.optional(Schema.String), meetingID: Schema.optional(Schema.String), localID: Schema.optional(Schema.String), pending: Schema.optional(Schema.Number), reason: Schema.optional(Schema.String) })
const markerSchema = Schema.Struct({ pid: Schema.Number, profileID: Schema.String, localID: Schema.String, meetingID: Schema.String, segmentID: Schema.String })
type Mode = "pending" | "redirect307" | "redirect308"
type Report = Schema.Schema.Type<typeof reportSchema>

function withPeer(mode: Mode, body: (peer: Peer) => Effect.Effect<void, unknown, AppProcess.Service>) {
  return Effect.scoped(Effect.gen(function* () {
    const root = yield* Effect.acquireRelease(Effect.promise(() => mkdtemp(join(tmpdir(), "live-manager-core-"))), (root) => Effect.promise(() => rm(root, { recursive: true, force: true })))
    yield* Effect.promise(() => mkdir(join(root, "userData")))
    const graph = AppNodeBuilder.build(LayerNode.group([Database.node, SessionMeeting.node, MeetingContext.node, AppProcess.node]), [[Database.node, Database.layerFromPath(join(root, "core.sqlite"))]])
    return yield* Effect.gen(function* () {
      const peer = yield* corePeer(root, mode)
      // Independent actual Core setup control precedes the absent/new manager actor.
      const started = yield* Effect.promise(() => peer.post("/api/meeting/start", { sessionID: controlSession, title: "Core control", consent: "unknown" }))
      expect(started.status).toBe(200)
      const control = Schema.decodeUnknownSync(Location.response(Meeting.Info))(yield* Effect.promise(() => started.json()))
      yield* Effect.promise(async () => {
        const item = { ...segment, id: "82473019-3e51-4f7a-b858-853eb5e51a37" }
        expect((await peer.post("/api/meeting/segments", { meetingID: control.data.id, segments: [item] }, true)).status).toBe(204)
        expect((await peer.post("/api/meeting/segments", { meetingID: control.data.id, segments: [item] }, true)).status).toBe(204)
        expect((await peer.post("/api/meeting/stop", { meetingID: control.data.id })).status).toBe(200)
        expect((await peer.post("/api/meeting/segments", { meetingID: control.data.id, segments: [item] }, true)).status).toBe(400)
        expect((await peer.detail(control.data.id)).segments).toEqual([item])
      })
      return yield* body(peer)
    }).pipe(Effect.provide(graph))
  }))
}

function corePeer(root: string, mode: Mode) {
  return Effect.gen(function* () {
    const database = yield* Database.Service, meetings = yield* SessionMeeting.Service
    yield* database.db.insert(ProjectTable).values({ id: Project.ID.global, worktree: AbsolutePath.make(root), sandboxes: [] }).run().pipe(Effect.orDie)
    yield* database.db.insert(SessionTable).values([sessionID, controlSession].map((id) => ({ id, project_id: Project.ID.global, slug: id, directory: root, title: "Delivery proof", version: "test" }))).run().pipe(Effect.orDie)
    const location = new Location.Info({ directory: AbsolutePath.make(root), project: { id: Project.ID.global, directory: AbsolutePath.make(root) } })
    const authorization = `Basic ${Buffer.from("fixture:meeting-proof").toString("base64")}`
    const reports: Report[] = [], requests: { path: string; status: number; ids: string[]; meetingID?: string; located: boolean; authenticated: boolean; diagnostic: boolean }[] = []
    const state = { restored: false, release: false, committedAppendFailure: false, foreignRequests: 0, foreignText: false, foreignCredentials: false }
    const foreign = yield* Effect.acquireRelease(Effect.sync(() => Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
      state.foreignRequests++; state.foreignCredentials ||= request.headers.has("authorization"); state.foreignText ||= (await request.text()).includes(segment.text)
      return new Response(null, { status: 204 })
    } })), (server) => Effect.sync(() => { server.stop(true) }))
    const server = yield* Effect.acquireRelease(Effect.sync(() => Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
      const url = new URL(request.url)
      if (url.pathname === "/fixture/report") { reports.push(Schema.decodeUnknownSync(reportSchema)(await request.json())); return new Response(null, { status: 204 }) }
      if (url.pathname === "/fixture/command") return Response.json({ release: state.release })
      const authenticated = request.headers.get("authorization") === authorization, located = url.searchParams.get("location[directory]") === root, diagnostic = request.headers.has("x-fixture-diagnostic")
      if (!authenticated || !located) return new Response("FIXTURE_AUTH_OR_LOCATION", { status: 401 })
      const record = (status: number, ids: string[] = [], meetingID?: string) => { requests.push({ path: url.pathname, status, ids, meetingID, located, authenticated, diagnostic }) }
      const respond = <A>(result: Result.Result<A, SessionMeeting.MeetingError>, ids: string[] = [], meetingID?: string) => {
        if (Result.isFailure(result)) { record(400, ids, meetingID); return Response.json({ name: "MeetingError", data: { reason: result.failure.reason } }, { status: 400 }) }
        record(200, ids, meetingID); return Response.json({ location, data: result.success })
      }
      if (url.pathname === "/api/meeting/start") return respond(await Effect.runPromise(meetings.start(Schema.decodeUnknownSync(Meeting.StartInput)(await request.json())).pipe(Effect.result)))
      if (url.pathname === "/api/meeting/stop") { const payload = Schema.decodeUnknownSync(Meeting.StopInput)(await request.json()); return respond(await Effect.runPromise(meetings.stop(payload).pipe(Effect.result)), [], payload.meetingID) }
      if (url.pathname === "/api/meeting" && request.method === "GET") return respond(await Effect.runPromise(meetings.get(Schema.decodeUnknownSync(Meeting.ReadQuery)({ meetingID: url.searchParams.get("meetingID") })).pipe(Effect.result)))
      if (url.pathname === "/api/meeting/segments") {
        const payload = Schema.decodeUnknownSync(Meeting.AppendInput)(await request.json()), ids = payload.segments.map((item) => item.id)
        if (!diagnostic && mode === "pending" && !state.restored) { record(503, ids, payload.meetingID); return new Response(null, { status: 503 }) }
        if (!diagnostic && mode !== "pending") { const status = mode === "redirect307" ? 307 : 308; record(status, ids, payload.meetingID); return new Response(null, { status, headers: { location: `http://127.0.0.1:${foreign.port}/foreign` } }) }
        const result = await Effect.runPromise(meetings.append(payload).pipe(Effect.result))
        if (Result.isFailure(result)) return respond(result, ids, payload.meetingID)
        if (!diagnostic && mode === "pending" && state.restored && !state.committedAppendFailure) { state.committedAppendFailure = true; record(503, ids, payload.meetingID); return new Response(null, { status: 503 }) }
        record(204, ids, payload.meetingID); return new Response(null, { status: 204 })
      }
      return new Response("FIXTURE_UNSUPPORTED_ROUTE", { status: 404 })
    } })), (server) => Effect.sync(() => { server.stop(true) }))
    const url = `http://127.0.0.1:${server.port}`
    const endpoint = (path: string) => { const value = new URL(path, url); value.searchParams.set("location[directory]", root); return value }
    const post = (path: string, body: unknown, diagnostic = false) => fetch(endpoint(path), { method: "POST", headers: { authorization, "content-type": "application/json", ...(diagnostic ? { "x-fixture-diagnostic": "1" } : {}) }, body: JSON.stringify(body) })
    const detail = async (id: string) => { const target = endpoint("/api/meeting"); target.searchParams.set("meetingID", id); const response = await fetch(target, { headers: { authorization } }); expect(response.status).toBe(200); return Schema.decodeUnknownSync(Location.response(Meeting.Detail))(await response.json()).data }
    return { root, userData: join(root, "userData"), url, reports, requests, state, post, detail }
  })
}
type Peer = Effect.Success<ReturnType<typeof corePeer>>
type Actor = { pid: number; kill: () => Promise<void>; alive: () => Promise<boolean>; wait: (predicate: () => boolean | Promise<boolean>, label: string) => Promise<void>; collect: () => Promise<{ success: boolean; code: number | null; stdout: string; stderr: string }> }

function withActor(peer: Peer, mode: Mode | "recover", body: (actor: Actor) => Promise<void>) {
  return Effect.scoped(Effect.gen(function* () {
    const node = Bun.which("node")
    if (!node) return yield* Effect.die("Hosted Node required")
    const proc = yield* AppProcess.Service
    const child = yield* proc.spawn(ChildProcess.make(node, ["--experimental-strip-types", join(import.meta.dir, "live-delivery-manager.fixture.ts"), mode, peer.url, peer.userData, peer.root, sessionID], { cwd: peer.root, env: {}, extendEnv: false, stdin: "ignore", stdout: "pipe", stderr: "pipe" }))
    const output = yield* Stream.runCollect(child.stdout).pipe(Effect.forkChild), errors = yield* Stream.runCollect(child.stderr).pipe(Effect.forkChild)
    const actor: Actor = {
      pid: Number(child.pid), kill: () => Effect.runPromise(child.kill({ killSignal: "SIGKILL" })), alive: () => Effect.runPromise(child.isRunning),
      wait: async (predicate, label) => {
        const end = Date.now() + 3000
        while (!(await predicate())) { if (!(await Effect.runPromise(child.isRunning)) || Date.now() >= end) throw new Error(`Owned Node did not reach ${label}`); await Bun.sleep(5) }
      },
      collect: () => Effect.runPromise(Effect.gen(function* () {
        const exit = yield* child.exitCode.pipe(Effect.result), stdout = Buffer.concat([...(yield* Fiber.join(output))]).toString("utf8"), stderr = Buffer.concat([...(yield* Fiber.join(errors))]).toString("utf8")
        expect(yield* child.isRunning).toBe(false)
        return { success: Result.isSuccess(exit), code: Result.isSuccess(exit) ? Number(exit.success) : null, stdout, stderr }
      }).pipe(Effect.timeout("3 seconds"))),
    }
    return yield* Effect.promise(() => body(actor)).pipe(Effect.ensuring(
      child.isRunning.pipe(Effect.flatMap((running) => running ? child.kill({ forceKillAfter: "1 second" }) : Effect.void), Effect.andThen(child.isRunning), Effect.flatMap((running) => running ? Effect.die("Owned Node still running") : Effect.void), Effect.andThen(Fiber.await(output)), Effect.andThen(Fiber.await(errors)), Effect.timeout("3 seconds"), Effect.orDie),
    ))
  }))
}

test("actual Core pending503 remains open, then abrupt Node restart retries same durable ID before stop", async () => {
  expectSpawn(import.meta.path)
  await Effect.runPromise(withPeer("pending", (peer) => Effect.gen(function* () {
    yield* withActor(peer, "pending", async (actor) => {
      await actor.wait(async () => peer.reports.some((report) => report.phase === "held") && await Bun.file(join(peer.userData, "ready.json")).exists(), "committed paused marker")
      const report = peer.reports.find((report) => report.phase === "held")!
      const marker = Schema.decodeUnknownSync(markerSchema)(JSON.parse(await readFile(join(peer.userData, "ready.json"), "utf8")))
      expect(marker.pid).toBe(actor.pid); expect(report.pid).toBe(actor.pid); expect(await actor.alive()).toBe(true)
      const before = await peer.detail(marker.meetingID)
      expect(before.meeting.timeEnded).toBeNull(); expect(before.segments).toEqual([])
      expect(peer.requests.some((request) => request.status === 503 && request.meetingID === marker.meetingID && request.ids[0] === segment.id)).toBe(true)
      expect(peer.requests.filter((request) => request.path.endsWith("/stop") && !request.diagnostic && request.meetingID === marker.meetingID)).toEqual([])
      console.log(JSON.stringify({ kind: "manager-core-pending", pending: 1, coreEnded: false, storedSegments: 0, actualPID: actor.pid, markerPID: marker.pid }))
      await actor.kill(); const stopped = await actor.collect()
      expect(stopped.stdout).not.toContain("live-delivery-normal-exit"); expect(stopped.stderr).not.toContain("observer-private-secret")
      expect(await Bun.file(join(peer.userData, "normal-exit")).exists()).toBe(false)
    })
    yield* withActor(peer, "recover", async (actor) => {
      await actor.wait(() => peer.reports.some((report) => report.phase === "recovered"), "actual reopen")
      const recovered = peer.reports.find((report) => report.phase === "recovered")!
      const original = peer.reports.find((report) => report.phase === "held")!
      const marker = Schema.decodeUnknownSync(markerSchema)(JSON.parse(await readFile(join(peer.userData, "ready.json"), "utf8")))
      expect(recovered.localID).toBe(original.localID); expect(recovered.meetingID).toBe(original.meetingID); expect(recovered.pending).toBe(1)
      expect(recovered.profileID).toBe(marker.profileID); expect(recovered.pid).not.toBe(original.pid)
      peer.state.restored = true; peer.state.release = true
      await actor.wait(() => peer.reports.some((report) => report.phase === "done"), "drain and close")
      const result = await actor.collect(); expect(result.success && result.code === 0, result.stderr).toBe(true); expect(result.stderr).not.toContain("observer-private-secret")
      const detail = await peer.detail(recovered.meetingID!)
      expect(detail.segments).toEqual([segment]); expect(detail.meeting.timeEnded).not.toBeNull()
      expect(peer.state.committedAppendFailure).toBe(true)
      const requests = peer.requests.filter((request) => !request.diagnostic)
      expect(requests.findIndex((request) => request.path.endsWith("/stop") && request.meetingID === recovered.meetingID)).toBeGreaterThan(requests.findIndex((request) => request.status === 204 && request.ids.includes(segment.id)))
      expect(requests.every((request) => request.authenticated && request.located)).toBe(true)
      expect(peer.requests.filter((request) => request.path.endsWith("/start"))).toHaveLength(2)
      console.log(JSON.stringify({ kind: "manager-core-recovered", sameLocalID: recovered.localID === original.localID, sameProfile: recovered.profileID === marker.profileID, committedAppendFailure: peer.state.committedAppendFailure, storedSegments: detail.segments.length, coreEnded: detail.meeting.timeEnded !== null, node: recovered.node }))
    })
  })))
}, 12000)

for (const status of [307, 308] as const) test(`actual Core append${status} cannot forward transcript/credentials or prematurely stop`, async () => {
  expectSpawn(import.meta.path)
  await Effect.runPromise(withPeer(status === 307 ? "redirect307" : "redirect308", (peer) => withActor(peer, status === 307 ? "redirect307" : "redirect308", async (actor) => {
    await actor.wait(() => peer.reports.some((report) => report.phase === "held"), "blocked redirect")
    const report = peer.reports.find((report) => report.phase === "held")!
    const before = await peer.detail(report.meetingID!)
    expect(before.meeting.timeEnded).toBeNull(); expect(before.segments).toEqual([])
    expect(peer.requests.some((request) => request.status === status && request.ids.includes(segment.id))).toBe(true)
    expect(peer.state.foreignRequests).toBe(0); expect(peer.state.foreignText).toBe(false); expect(peer.state.foreignCredentials).toBe(false)
    console.log(JSON.stringify({ kind: "manager-core-redirect", status, foreignRequests: peer.state.foreignRequests, foreignText: peer.state.foreignText, foreignCredentials: peer.state.foreignCredentials, coreEnded: false, storedSegments: 0, node: report.node }))
    peer.state.release = true
    await actor.wait(() => peer.reports.some((report) => report.phase === "done"), "joined manager shutdown")
    const result = await actor.collect(); expect(result.success && result.code === 0, result.stderr).toBe(true)
    expect(result.stderr).not.toContain("observer-private-secret")
    expect(peer.requests.filter((request) => request.path.endsWith("/stop") && !request.diagnostic && request.meetingID === report.meetingID)).toEqual([])
  })))
}, 10000)
