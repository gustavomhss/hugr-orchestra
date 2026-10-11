import { describe, expect } from "bun:test"
import { chmod, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { Agent } from "@orchestra/schema/agent"
import { Capability } from "@orchestra/schema/capability"
import { Project } from "@orchestra/schema/project"
import { AbsolutePath } from "@orchestra/schema/schema"
import { SessionID } from "@orchestra/schema/session-id"
import { SessionMessage } from "@orchestra/schema/session-message"
import { WorkspaceID } from "@orchestra/schema/workspace-id"
import { sql } from "drizzle-orm"
import { Cause, Effect, Exit } from "effect"
import { CapabilityArtifacts } from "../src/capability/artifact/index"
import { CapabilityArtifactManagement } from "../src/capability/artifact/management"
import { CapabilityOperator } from "../src/capability/operator/index"
import type { CapabilityOperatorContract } from "../src/capability/operator/contract"
import { CapabilityArtifactPinTable, CapabilityArtifactReferenceTable, CapabilityArtifactTable } from "../src/capability/sql"
import { Database } from "../src/database/database"
import { AppNodeBuilder } from "../src/effect/app-node-builder"
import { LayerNode } from "../src/effect/layer-node"
import { EventV2 } from "../src/event"
import { FSUtil } from "../src/fs-util"
import { Global } from "../src/global"
import { ProjectTable } from "../src/project/sql"
import { SessionTable } from "../src/session/sql"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node, FSUtil.node, Global.node])))
const home: CapabilityOperatorContract.Placement = { projectID: Project.ID.global, location: { directory: AbsolutePath.make("/artifact-home") } }
const away: CapabilityOperatorContract.Placement = { projectID: Project.ID.global, location: { directory: AbsolutePath.make("/artifact-away") } }
const secret = "artifact-host-private"

function fixture(scope: CapabilityOperatorContract.GrantScope = { placements: "instance", actions: ["*"] }, now?: () => number) {
  return Effect.gen(function* () {
    const database = yield* Database.Service
    const tmp = yield* Effect.acquireRelease(Effect.promise(() => tmpdir()), (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()))
    const options = { root: join(tmp.path, "blobs") }
    const storage = yield* CapabilityArtifacts.storage(options)
    const operators = yield* CapabilityOperator.make({ principal: `artifact-${randomUUID()}`, scope, ...(now ? { now } : {}) })
    const management = yield* CapabilityArtifactManagement.make({ operators, artifacts: options })
    yield* database.db.insert(ProjectTable).values({ id: home.projectID, worktree: home.location.directory, sandboxes: [] })
      .onConflictDoNothing().run()
    const session = (placement = home) => Effect.gen(function* () {
      const id = SessionID.create()
      yield* database.db.insert(SessionTable).values({ id, project_id: placement.projectID, directory: placement.location.directory,
        workspace_id: placement.location.workspaceID, slug: "artifact", title: "artifact", version: "test", agent: "actor" }).run()
      return id
    })
    const sessionID = yield* session()
    // Real CAS publication plus the same SQL rows the model facade writes.
    const publish = (text: string, input: { owner?: CapabilityOperatorContract.Placement; id?: Capability.ArtifactID;
      revision?: number; sessions?: readonly SessionID[] } = {}) => Effect.gen(function* () {
      const data = new TextEncoder().encode(text)
      const ref = Capability.ArtifactRef.make({ id: input.id ?? Capability.ArtifactID.create(), revision: input.revision ?? 0 })
      const owner = input.owner ?? home
      const hash = yield* storage.blobs.publish(data, "text/plain")
      yield* database.db.insert(CapabilityArtifactTable).values({ ...ref, mime: "text/plain", kind: "document", hash,
        bytes: data.byteLength, verification: "observed", metadata: { secret }, time_created: 1_000,
        owner: { projectID: owner.projectID, location: owner.location, sessionID, agentID: Agent.ID.make("actor") },
        producer: { sessionID, agentID: Agent.ID.make(secret), assistantMessageID: SessionMessage.ID.create(), callID: secret } }).run()
      yield* Effect.forEach(input.sessions ?? [sessionID], (session) => database.db.insert(CapabilityArtifactReferenceTable)
        .values({ artifact_id: ref.id, revision: ref.revision, session_id: session }).run())
      return { ref, data, hash }
    })
    const run = <A, E, R>(effect: Effect.Effect<A, E, R>, authority = operators.configured) =>
      operators.withRequest(authority, { requestID: randomUUID() }, effect)
    return { database, operators, management, sessionID, session, publish, run, root: options.root }
  })
}

function failures<A, E>(exit: Exit.Exit<A, E>) {
  if (!Exit.isFailure(exit)) throw new Error("Expected failed Exit")
  return exit.cause.reasons.map((reason) => {
    if (reason._tag !== "Fail" || !(reason.error instanceof CapabilityArtifacts.Failure)) throw new Error("Expected artifact failure")
    expect(JSON.stringify(reason.error)).not.toContain(secret)
    return { code: reason.error.code, message: reason.error.message }
  })
}
function invalid<A, E>(exit: Exit.Exit<A, E>) {
  expect(failures(exit).map((failure) => failure.code)).toEqual(["invalid_input"])
}
// A defect must survive unchanged: only pure authority rejections collapse to artifact_unavailable.
function survives<A, E>(exit: Exit.Exit<A, E>) {
  if (!Exit.isFailure(exit)) throw new Error("Expected failed Exit")
  expect(exit.cause.reasons.some((reason) => reason._tag === "Die")).toBe(true)
  expect(exit.cause.reasons.some((reason) => reason._tag === "Fail" && reason.error instanceof CapabilityArtifacts.Failure)).toBe(false)
  return exit.cause
}
const unavailable = [{ code: "artifact_unavailable" as const, message: "Capability artifact is unavailable" }]

describe("CapabilityArtifactManagement reads", () => {
  it.live("a Session and artifact differing only by workspaceID are invisible to list and unavailable to get", () => Effect.gen(function* () {
    const f = yield* fixture()
    const workspace = { ...home, location: { ...home.location, workspaceID: WorkspaceID.create() } }
    const other = { ...home, location: { ...home.location, workspaceID: WorkspaceID.create() } }
    const scoped = yield* f.session(workspace)
    const plain = yield* f.publish("plain", { sessions: [f.sessionID, scoped] })
    const owned = yield* f.publish("owned", { owner: workspace, sessions: [f.sessionID, scoped] })
    const sibling = yield* f.publish("sibling", { owner: other, sessions: [f.sessionID, scoped] })
    expect((yield* f.run(f.management.list(f.sessionID, {}))).items.map((item) => item.artifact)).toEqual([plain.ref])
    expect((yield* f.run(f.management.list(scoped, {}))).items.map((item) => item.artifact)).toEqual([owned.ref])
    expect((yield* f.run(f.management.get(scoped, owned.ref))).artifact).toEqual(owned.ref)
    yield* Effect.forEach([[f.sessionID, owned], [f.sessionID, sibling], [scoped, plain], [scoped, sibling]] as const,
      ([session, item]) => f.run(f.management.get(session, item.ref)).pipe(Effect.exit,
        Effect.map((exit) => expect(failures(exit)).toEqual(unavailable))))
  }))

  it.live("malformed cursors and out-of-range limits are invalid_input", () => Effect.gen(function* () {
    const f = yield* fixture()
    const ref = (yield* f.publish("a")).ref
    yield* Effect.forEach([{ after: "nope" }, { after: `${ref.id}:01` }, { after: `${ref.id}:-1` }, { after: `${ref.id}` },
      { limit: 33 }, { limit: 0 }, { limit: 1.5 }],
    (query) => f.run(f.management.list(f.sessionID, query)).pipe(Effect.exit, Effect.map(invalid)))
  }))

  it.live("operator defects, alone or mixed with a denial, are not collapsed into artifact_unavailable", () => Effect.gen(function* () {
    const clock = { broken: false }
    // The real operator calls its injected clock inside require; a throwing clock is a genuine defect on that path.
    const f = yield* fixture(undefined, () => {
      if (clock.broken) throw new Error("clock defect")
      return Date.now()
    })
    const ref = (yield* f.publish("a")).ref
    const broken = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      f.run(Effect.sync(() => { clock.broken = true }).pipe(Effect.andThen(effect), Effect.ensuring(Effect.sync(() => { clock.broken = false }))))
    survives(yield* broken(f.management.get(f.sessionID, ref)).pipe(Effect.exit))
    survives(yield* broken(f.management.list(f.sessionID, {})).pipe(Effect.exit))
    survives(yield* broken(f.management.content(f.sessionID, ref)).pipe(Effect.exit))
    // No real operator path yields Fail and Die in one Cause, so this wrapper combines a defect with a real denial.
    const denied = yield* f.operators.issue({ origin: "sdk", scope: { placements: [away], actions: ["*"] } })
    const mixed = yield* CapabilityArtifactManagement.make({ operators: { ...f.operators,
      require: (target) => f.operators.require(target).pipe(
        Effect.catchCause((cause) => Effect.failCause(Cause.combine(cause, Cause.die("operator defect"))))) },
    artifacts: { root: f.root } })
    const cause = survives(yield* f.run(mixed.get(f.sessionID, ref), denied.authority).pipe(Effect.exit))
    expect(cause.reasons.some((reason) => reason._tag === "Fail" && reason.error instanceof Capability.Failure &&
      reason.error.code === "target_denied")).toBe(true)
    survives(yield* f.run(mixed.list(f.sessionID, {}), denied.authority).pipe(Effect.exit))
  }))

  it.live("pages by (id, revision) with limit+1 and a cursor naming only the last returned item", () => Effect.gen(function* () {
    const f = yield* fixture()
    const first = yield* f.publish("a")
    const second = yield* f.publish("b", { id: first.ref.id, revision: 1 })
    const third = yield* f.publish("c")
    const fourth = yield* f.publish("d")
    yield* f.publish("away", { owner: away })
    yield* f.publish("other session", { sessions: [yield* f.session()] })
    const page = yield* f.run(f.management.list(f.sessionID, { limit: 2 }))
    expect(page.items.map((item) => item.artifact)).toEqual([first.ref, second.ref])
    expect(page.after).toBe(`${second.ref.id}:1`)
    expect(page.after).not.toContain(third.ref.id)
    expect(page.coverage).toBe("live")
    const next = yield* f.run(f.management.list(f.sessionID, { after: page.after, limit: 2 }))
    expect(next).toEqual({ items: next.items, coverage: "live" })
    expect(next.items.map((item) => item.artifact)).toEqual([third.ref, fourth.ref])
    const all = yield* f.run(f.management.list(f.sessionID, {}))
    expect(all.items).toHaveLength(4)
    expect(Object.keys(all.items[0]).sort()).toEqual(["artifact", "bytes", "hash", "kind", "mime", "pinned", "timeCreated", "verification"])
    expect(all.items[0]).toEqual({ artifact: first.ref, mime: "text/plain", kind: "document", hash: first.hash, bytes: 1,
      verification: "observed", timeCreated: 1_000, pinned: false })
    expect(JSON.stringify(all)).not.toContain(secret)
    expect(failures(yield* f.run(f.management.list(SessionID.create(), {})).pipe(Effect.exit))).toEqual(unavailable)
  }))

  it.live("placement mismatch, foreign Session references and denied scope share the missing failure", () => Effect.gen(function* () {
    const f = yield* fixture()
    const own = yield* f.publish("own")
    const moved = yield* f.publish("moved", { owner: away })
    const foreign = yield* f.publish("foreign", { sessions: [yield* f.session()] })
    const missing = failures(yield* f.run(f.management.get(f.sessionID, { id: Capability.ArtifactID.create(), revision: 0 })).pipe(Effect.exit))
    expect(missing).toEqual(unavailable)
    expect(failures(yield* f.run(f.management.get(f.sessionID, moved.ref)).pipe(Effect.exit))).toEqual(missing)
    expect(failures(yield* f.run(f.management.content(f.sessionID, moved.ref)).pipe(Effect.exit))).toEqual(missing)
    expect(failures(yield* f.run(f.management.get(f.sessionID, foreign.ref)).pipe(Effect.exit))).toEqual(missing)
    expect((yield* f.run(f.management.list(f.sessionID, {}))).items.map((item) => item.artifact)).toEqual([own.ref])
    const listOnly = yield* f.operators.issue({ origin: "sdk", scope: { placements: [home], actions: ["artifact.list"] } })
    expect(failures(yield* f.run(f.management.get(f.sessionID, own.ref), listOnly.authority).pipe(Effect.exit))).toEqual(missing)
    const elsewhere = yield* f.operators.issue({ origin: "sdk", scope: { placements: [away], actions: ["*"] } })
    expect(failures(yield* f.run(f.management.list(f.sessionID, {}), elsewhere.authority).pipe(Effect.exit))).toEqual(missing)
    const otherResource = yield* f.operators.issue({ origin: "cli", scope: { placements: "instance", actions: ["artifact.read"],
      resources: [{ kind: "artifact", id: moved.ref.id }] } })
    expect(failures(yield* f.run(f.management.content(f.sessionID, own.ref), otherResource.authority).pipe(Effect.exit))).toEqual(missing)
  }))

  it.live("pinned comes from the reference flag or this Session's pin row", () => Effect.gen(function* () {
    const f = yield* fixture()
    const other = yield* f.session()
    const flagged = yield* f.publish("flag")
    const rowPinned = yield* f.publish("row")
    const elsewhere = yield* f.publish("elsewhere", { sessions: [f.sessionID, other] })
    const plain = yield* f.publish("plain")
    yield* f.database.db.update(CapabilityArtifactReferenceTable).set({ pinned: true })
      .where(sql`${CapabilityArtifactReferenceTable.artifact_id} = ${flagged.ref.id}`).run()
    const owner = { projectID: home.projectID, location: home.location, sessionID: f.sessionID, agentID: Agent.ID.make("actor") }
    yield* f.database.db.insert(CapabilityArtifactPinTable).values([
      { artifact_id: rowPinned.ref.id, revision: 0, session_id: f.sessionID, owner },
      { artifact_id: elsewhere.ref.id, revision: 0, session_id: other, owner },
    ]).run()
    const pinned = yield* Effect.forEach([flagged, rowPinned, elsewhere, plain],
      (item) => f.run(f.management.get(f.sessionID, item.ref)).pipe(Effect.map((artifact) => artifact.pinned)))
    expect(pinned).toEqual([true, true, false, false])
    expect((yield* f.run(f.management.list(f.sessionID, {}))).items.map((item) => item.pinned)).toEqual(pinned)
    expect((yield* f.run(f.management.get(other, elsewhere.ref))).pinned).toBe(true)
  }))

  it.live("content returns verified bytes and maps a tampered blob to artifact_corrupt", () => Effect.gen(function* () {
    const f = yield* fixture()
    const good = yield* f.publish("verified ✓")
    const result = yield* f.run(f.management.content(f.sessionID, good.ref))
    expect(result.data).toEqual(good.data)
    expect(result.artifact).toEqual(yield* f.run(f.management.get(f.sessionID, good.ref)))
    const path = join(f.root, good.hash)
    yield* Effect.promise(async () => {
      await chmod(path, 0o600)
      await writeFile(path, new TextEncoder().encode("tampered ✓"))
      await chmod(path, 0o400)
    })
    expect(failures(yield* f.run(f.management.content(f.sessionID, good.ref)).pipe(Effect.exit)))
      .toEqual([{ code: "artifact_corrupt", message: "Artifact blob is unavailable or corrupt" }])
  }))
})
