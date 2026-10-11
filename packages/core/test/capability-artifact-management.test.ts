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
import { sql } from "drizzle-orm"
import { Effect, Exit } from "effect"
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

function fixture(scope: CapabilityOperatorContract.GrantScope = { placements: "instance", actions: ["*"] }) {
  return Effect.gen(function* () {
    const database = yield* Database.Service
    const tmp = yield* Effect.acquireRelease(Effect.promise(() => tmpdir()), (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()))
    const options = { root: join(tmp.path, "blobs") }
    const storage = yield* CapabilityArtifacts.storage(options)
    const operators = yield* CapabilityOperator.make({ principal: `artifact-${randomUUID()}`, scope })
    const management = yield* CapabilityArtifactManagement.make({ operators, artifacts: options })
    yield* database.db.insert(ProjectTable).values({ id: home.projectID, worktree: home.location.directory, sandboxes: [] })
      .onConflictDoNothing().run()
    const session = (placement = home) => Effect.gen(function* () {
      const id = SessionID.create()
      yield* database.db.insert(SessionTable).values({ id, project_id: placement.projectID, directory: placement.location.directory,
        slug: "artifact", title: "artifact", version: "test", agent: "actor" }).run()
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
const unavailable = [{ code: "artifact_unavailable" as const, message: "Capability artifact is unavailable" }]

describe("CapabilityArtifactManagement reads", () => {
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
