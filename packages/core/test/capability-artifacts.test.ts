import { describe, expect } from "bun:test"
import { createHash } from "node:crypto"
import { join } from "node:path"
import { AgentV2 } from "@orchestra/core/agent"
import { CapabilityArtifacts } from "../src/capability/artifact"
import { CapabilityInvocation } from "@orchestra/core/capability/invocation"
import { CapabilityArtifactReferenceTable, CapabilityArtifactTable } from "@orchestra/core/capability/sql"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { PermissionV2 } from "@orchestra/core/permission"
import { PermissionSaved } from "@orchestra/core/permission/saved"
import { Project } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionProjector } from "@orchestra/core/session/projector"
import { SessionTable } from "@orchestra/core/session/sql"
import { SessionStore } from "@orchestra/core/session/store"
import { Capability } from "@orchestra/schema/capability"
import { WorkspaceID } from "@orchestra/schema/workspace-id"
import { eq } from "drizzle-orm"
import { Deferred, Effect, Fiber, Layer } from "effect"
import { CapabilityPolicyFixture } from "./fixture/capability-policy"
import { location } from "./fixture/location"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const host = Layer.unwrap(Effect.acquireRelease(
  Effect.promise(() => tmpdir()), (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
).pipe(Effect.map((tmp) => Layer.mergeAll(
  Layer.succeed(Location.Service, location({ directory: AbsolutePath.make(tmp.path) })),
  Global.layerWith({
    data: join(tmp.path, "data"), config: join(tmp.path, "config"), state: join(tmp.path, "state"),
    cache: join(tmp.path, "cache"), tmp: join(tmp.path, "tmp"), home: tmp.path,
    bin: join(tmp.path, "bin"), log: join(tmp.path, "log"), repos: join(tmp.path, "repos"),
  }),
))))
const it = testEffect(AppNodeBuilder.build(LayerNode.group([
  Database.node, EventV2.node, SessionProjector.node, SessionStore.node, PermissionV2.node,
  AgentV2.node, Location.node, PermissionSaved.node, FSUtil.node, Global.node,
]), [
  [Database.node, Layer.unwrap(Effect.map(Location.Service,
    (placement) => Database.layerFromPath(join(placement.directory, "artifacts.sqlite")),
  )).pipe(Layer.provide(host))], [Location.node, host], [Global.node, host],
]))
const allow: PermissionV2.Ruleset = [{ action: "artifact.*", resource: "*", effect: "allow" }]
const input: CapabilityArtifacts.Input = {
  data: new TextEncoder().encode("durable ✓"), mime: "text/plain", kind: "document", verification: "observed",
  metadata: { secret: "host-private", title: "unicode ✓" },
}

function fixture(options: Parameters<typeof CapabilityPolicyFixture.fixture>[0] = {}) {
  return Effect.gen(function* () {
    const f = yield* CapabilityPolicyFixture.fixture(options)
    const placement = yield* Location.Service
    yield* f.database.db.update(SessionTable).set({ directory: placement.directory })
      .where(eq(SessionTable.id, f.context.sessionID)).run()
    yield* CapabilityPolicyFixture.setRules(allow)
    const binding: CapabilityInvocation.HostInput = {
      ...f.binding, owner: { ...f.binding.owner, location: { directory: placement.directory } }, effectiveRules: allow,
    }
    return { ...f, binding, root: join(placement.directory, "artifacts") }
  })
}

function expectCode(error: unknown, code: CapabilityArtifacts.Failure["code"] | Capability.Failure["code"]) {
  expect(error instanceof CapabilityArtifacts.Failure || error instanceof Capability.Failure).toBe(true)
  if (!(error instanceof CapabilityArtifacts.Failure) && !(error instanceof Capability.Failure))
    throw new Error("Expected typed artifact failure")
  expect(error.code).toBe(code)
  expect(JSON.stringify(error)).not.toContain("host-private")
  expect(JSON.stringify(error)).not.toContain("orchestra-core-test-")
}

describe("CapabilityArtifacts durable lifecycle", () => {
  it.live("verified bytes, host-owned record, safe description and recreated store readback", () => Effect.gen(function* () {
    const f = yield* fixture()
    const fs = yield* FSUtil.Service
    const store = yield* CapabilityArtifacts.make({ root: f.root })
    yield* CapabilityInvocation.withContext(f.binding, Effect.gen(function* () {
      const ref = yield* store.publish(f.context, input)
      const found = yield* store.read(f.context, ref)
      expect(found.data).toEqual(input.data)
      expect(found.metadata).toMatchObject({
        ...ref, owner: f.binding.owner, producer: f.binding.invocation, mime: input.mime, kind: input.kind,
        bytes: input.data.byteLength, hash: createHash("sha256").update(input.data).digest("hex"), metadata: input.metadata,
      })
      expect(yield* fs.readFile(join(f.root, found.metadata.hash))).toEqual(input.data)
      expect(yield* store.describe(f.context, ref)).toEqual({
        ...ref, mime: input.mime, kind: input.kind, bytes: input.data.byteLength, hash: found.metadata.hash,
        verification: input.verification, timeCreated: found.metadata.time_created, pinned: false,
      })
      const placement = yield* Location.Service
      // A second SQLite connection must see committed rows, not only the publishing connection's state.
      yield* Effect.gen(function* () {
        const fresh = yield* CapabilityArtifacts.make({ root: f.root })
        expect((yield* fresh.read(f.context, ref)).data).toEqual(input.data)
        const duplicate = yield* fresh.publish(f.context, input)
        expect(duplicate.id).not.toBe(ref.id)
      }).pipe(Effect.provide(Database.layerFromPath(join(placement.directory, "artifacts.sqlite"))))
      expect(yield* fs.readDirectory(f.root)).toEqual([found.metadata.hash])
      expect(yield* f.database.db.select().from(CapabilityArtifactReferenceTable)).toHaveLength(2)
    }))
  }), 30_000)

  it.live("immutable revisions and cross-handle concurrent expected-revision CAS", () => Effect.gen(function* () {
    const f = yield* fixture()
    const store = yield* CapabilityArtifacts.make({ root: f.root })
    const sibling = yield* CapabilityArtifacts.make({ root: f.root })
    const ref = yield* CapabilityInvocation.withContext(f.binding, store.publish(f.context, input))
    const results = yield* Effect.all([store, sibling].map((s, i) => CapabilityInvocation.withContext(f.binding,
      s.update(f.context, ref, {
        ...input, data: new TextEncoder().encode(`revision-${i}`),
      }).pipe(Effect.result))), { concurrency: "unbounded" })
    expect(results.filter((result) => result._tag === "Success")).toHaveLength(1)
    expect(results.filter((result) => result._tag === "Failure")).toHaveLength(1)
    results.forEach((result) => {
      if (result._tag === "Failure") expectCode(result.failure, "revision_conflict")
      if (result._tag === "Success") expect(result.success).toEqual({ id: ref.id, revision: 1 })
    })
    yield* CapabilityInvocation.withContext(f.binding, Effect.gen(function* () {
      expect((yield* store.read(f.context, ref)).data).toEqual(input.data)
      const current = Capability.ArtifactRef.make({ id: ref.id, revision: 1 })
      expect((yield* store.read(f.context, current)).data).not.toEqual(input.data)
      expectCode(yield* store.update(f.context, ref, input).pipe(Effect.flip), "revision_conflict")
      const next = yield* store.update(f.context, current, input)
      expect(next).toEqual({ id: ref.id, revision: 2 })
      expect(yield* f.database.db.select().from(CapabilityArtifactTable)).toHaveLength(3)
      expect(yield* f.database.db.select().from(CapabilityArtifactReferenceTable)).toHaveLength(3)
    }))
  }), 30_000)

  it.live("same-project Sessions need explicit revision-specific share; origin deletion preserves recipient", () => Effect.gen(function* () {
    const f = yield* fixture()
    const other = yield* fixture()
    const store = yield* CapabilityArtifacts.make({ root: f.root, scratchTTL: 1 })
    const ref = yield* CapabilityInvocation.withContext(f.binding, store.publish(f.context, input))
    yield* CapabilityInvocation.withContext(other.binding, Effect.gen(function* () {
      const operations = [store.read(other.context, ref).pipe(Effect.asVoid),
        store.describe(other.context, ref).pipe(Effect.asVoid), store.pin(other.context, ref, true),
        store.share(other.context, ref, f.context.sessionID), store.deleteReference(other.context, ref),
        store.update(other.context, ref, input).pipe(Effect.asVoid)]
      yield* Effect.forEach(operations, (effect) => effect.pipe(Effect.flip,
        Effect.tap((error) => Effect.sync(() => expectCode(error, "artifact_not_found")))))
    }))
    yield* CapabilityInvocation.withContext(f.binding, store.share(f.context, ref, other.context.sessionID))
    yield* CapabilityInvocation.withContext(other.binding, Effect.gen(function* () {
      expect((yield* store.read(other.context, ref)).data).toEqual(input.data)
      yield* store.pin(other.context, ref, true)
      expectCode(yield* store.deleteReference(other.context, ref).pipe(Effect.flip), "reference_pinned")
    }))
    const next = yield* CapabilityInvocation.withContext(f.binding, store.update(f.context, ref, {
      ...input, data: new TextEncoder().encode("private next revision"),
    }))
    expectCode(yield* CapabilityInvocation.withContext(other.binding, store.read(other.context, next)).pipe(Effect.flip), "artifact_not_found")
    yield* f.database.db.delete(SessionTable).where(eq(SessionTable.id, f.context.sessionID)).run()
    yield* Effect.sleep("5 millis")
    yield* store.cleanup()
    expect(yield* f.database.db.select().from(CapabilityArtifactReferenceTable)).toEqual([
      expect.objectContaining({ artifact_id: ref.id, revision: 0, session_id: other.context.sessionID, pinned: true }),
    ])
    yield* CapabilityInvocation.withContext(other.binding, Effect.gen(function* () {
      expect((yield* store.read(other.context, ref)).data).toEqual(input.data)
      // Retaining the head prevents cleanup from making an old expected revision current again.
      expectCode(yield* store.update(other.context, ref, input).pipe(Effect.flip), "revision_conflict")
      yield* store.pin(other.context, ref, false)
      yield* store.deleteReference(other.context, ref)
    }))
    yield* store.cleanup()
    expect(yield* f.database.db.select().from(CapabilityArtifactTable)).toEqual([])
    const fs = yield* FSUtil.Service
    expect(yield* fs.readDirectory(f.root)).toEqual([])
  }), 30_000)

  it.live("unknown refs and invalid native roots fail before blob effects", () => Effect.gen(function* () {
    const f = yield* fixture()
    const fs = yield* FSUtil.Service
    const store = yield* CapabilityArtifacts.make({ root: f.root })
    expectCode(yield* store.publish(f.context, input).pipe(Effect.flip), "invocation_binding_missing")
    expectCode(yield* CapabilityInvocation.withContext(f.binding,
      store.publish({ ...f.context, agent: AgentV2.ID.make("foreign") }, input)).pipe(Effect.flip), "invocation_binding_mismatch")
    expect(yield* fs.exists(f.root)).toBe(false)
    const ref = yield* CapabilityInvocation.withContext(f.binding, store.publish(f.context, input))
    expect(yield* fs.exists(f.root)).toBe(true)
    yield* CapabilityInvocation.withContext(f.binding, Effect.gen(function* () {
      expectCode(yield* store.read(f.context, { id: Capability.ArtifactID.create(), revision: 0 }).pipe(Effect.flip), "artifact_not_found")
      expectCode(yield* store.read(f.context, { ...ref, revision: -1 }).pipe(Effect.flip), "invalid_input")
      const pathRef = { ...ref, path: f.root }
      expectCode(yield* store.read(f.context, pathRef).pipe(Effect.flip), "invalid_input")
    }))
    yield* Effect.forEach([
      { agent: "foreign" }, { name: "foreign-tool" }, { part: false }, { message: false },
    ], (options) => Effect.gen(function* () {
      const invalid = yield* fixture(options)
      expectCode(yield* CapabilityInvocation.withContext(invalid.binding,
        store.publish(invalid.context, input)).pipe(Effect.flip), "invocation_binding_mismatch")
    }))
    yield* f.events.publish(SessionEvent.Tool.Failed, {
      sessionID: f.context.sessionID, assistantMessageID: f.context.assistantMessageID, callID: f.context.toolCallID,
      error: { type: "unknown", message: "settled" }, provider: { executed: false }, timestamp: CapabilityPolicyFixture.timestamp,
    })
    expectCode(yield* CapabilityInvocation.withContext(f.binding, store.read(f.context, ref)).pipe(Effect.flip), "invocation_binding_mismatch")
    expect(yield* f.database.db.select().from(CapabilityArtifactTable)).toHaveLength(1)
  }), 30_000)

  it.live("foreign project, directory, workspace and unknown target never gain a reference", () => Effect.gen(function* () {
    const f = yield* fixture()
    const other = yield* fixture()
    const store = yield* CapabilityArtifacts.make({ root: f.root })
    const ref = yield* CapabilityInvocation.withContext(f.binding, store.publish(f.context, input))
    const foreignProject = Project.ID.make("foreign")
    const placement = yield* Location.Service
    yield* f.database.db.insert(ProjectTable).values({
      id: foreignProject, worktree: AbsolutePath.make(join(placement.directory, "foreign")), sandboxes: [],
    }).run()
    const variants = [
      { project_id: foreignProject }, { directory: AbsolutePath.make(join(placement.directory, "elsewhere")) },
      { workspace_id: WorkspaceID.make("wrk_foreign") },
    ]
    yield* Effect.forEach(variants, (variant) => Effect.gen(function* () {
      yield* f.database.db.update(SessionTable).set({
        project_id: placement.project.id, directory: placement.directory, workspace_id: null, ...variant,
      }).where(eq(SessionTable.id, other.context.sessionID)).run()
      expectCode(yield* CapabilityInvocation.withContext(f.binding,
        store.share(f.context, ref, other.context.sessionID)).pipe(Effect.flip), "target_denied")
      expectCode(yield* CapabilityInvocation.withContext(other.binding,
        store.read(other.context, ref)).pipe(Effect.flip), "invocation_binding_mismatch")
    }))
    expectCode(yield* CapabilityInvocation.withContext(f.binding,
      store.share(f.context, ref, SessionV2.ID.create())).pipe(Effect.flip), "target_denied")
    // Even an explicit ref is revoked by a changed placement of its recipient.
    yield* f.database.db.update(SessionTable).set({
      project_id: placement.project.id, directory: placement.directory, workspace_id: null,
    }).where(eq(SessionTable.id, other.context.sessionID)).run()
    yield* CapabilityInvocation.withContext(f.binding, store.share(f.context, ref, other.context.sessionID))
    const foreign = { ...placement, workspaceID: WorkspaceID.make("wrk_foreign") }
    yield* f.database.db.update(SessionTable).set({ workspace_id: foreign.workspaceID })
      .where(eq(SessionTable.id, other.context.sessionID)).run()
    const foreignStore = yield* CapabilityArtifacts.make({ root: f.root }).pipe(Effect.provideService(Location.Service, foreign))
    const foreignBinding = { ...other.binding, owner: { ...other.binding.owner,
      location: { directory: foreign.directory, workspaceID: foreign.workspaceID },
    } }
    expectCode(yield* CapabilityInvocation.withContext(foreignBinding,
      foreignStore.read(other.context, ref)).pipe(Effect.flip), "target_denied")
    expect(yield* f.database.db.select().from(CapabilityArtifactReferenceTable)).toHaveLength(2)
  }), 30_000)

  it.live("real policy asks use exact artifact and target Session resources; native denies block", () => Effect.gen(function* () {
    const f = yield* fixture()
    const other = yield* fixture()
    const store = yield* CapabilityArtifacts.make({ root: f.root })
    const ref = yield* CapabilityInvocation.withContext(f.binding, store.publish(f.context, input))
    const observation = yield* CapabilityPolicyFixture.observeAsked(f.context)
    const waiting = yield* CapabilityInvocation.withContext({ ...f.binding, effectiveRules: [] },
      store.share(f.context, ref, other.context.sessionID)).pipe(Effect.result, Effect.forkChild)
    const request = yield* Effect.raceFirst(Deferred.await(observation.first), Fiber.join(waiting).pipe(
      Effect.andThen(Effect.die("Artifact share bypassed permission queue")),
    ))
    expect(request).toMatchObject({
      action: "artifact.share", resources: [`artifact:${ref.id}:${ref.revision}`, `session:${other.context.sessionID}`],
      source: { type: "tool", messageID: f.context.assistantMessageID, callID: f.context.toolCallID },
    })
    expect(yield* f.database.db.select().from(CapabilityArtifactReferenceTable)).toHaveLength(1)
    yield* f.permissions.reply({ requestID: request.id, reply: "once" })
    expect((yield* Fiber.join(waiting))._tag).toBe("Success")
    expect(yield* f.database.db.select().from(CapabilityArtifactReferenceTable)).toHaveLength(2)
    const denied = { ...f.binding, nativeDenyFloor: [{ action: "artifact.read", resource: "*", effect: "deny" as const }] }
    expectCode(yield* CapabilityInvocation.withContext(denied, store.read(f.context, ref)).pipe(Effect.flip), "target_denied")
    yield* CapabilityPolicyFixture.setRules([{ action: "artifact.write", resource: "*", effect: "deny" }])
    expectCode(yield* CapabilityInvocation.withContext(f.binding, store.pin(f.context, ref, true)).pipe(Effect.flip), "target_denied")
  }).pipe(Effect.timeout("20 seconds")), 30_000)

  it.live("corrupt or missing blob fails named; failed dedup publication never inserts metadata", () => Effect.gen(function* () {
    const f = yield* fixture()
    const fs = yield* FSUtil.Service
    const store = yield* CapabilityArtifacts.make({ root: f.root })
    yield* CapabilityInvocation.withContext(f.binding, Effect.gen(function* () {
      const ref = yield* store.publish(f.context, input)
      const found = yield* store.read(f.context, ref)
      const path = join(f.root, found.metadata.hash)
      yield* fs.chmod(path, 0o600)
      yield* fs.writeFile(path, new Uint8Array(input.data.byteLength).fill(120))
      expectCode(yield* store.read(f.context, ref).pipe(Effect.flip), "artifact_corrupt")
      expectCode(yield* store.describe(f.context, ref).pipe(Effect.flip), "artifact_corrupt")
      expectCode(yield* store.publish(f.context, input).pipe(Effect.flip), "artifact_corrupt")
      expect(yield* f.database.db.select().from(CapabilityArtifactTable)).toHaveLength(1)
      yield* fs.remove(path)
      expectCode(yield* store.read(f.context, ref).pipe(Effect.flip), "artifact_corrupt")
      expectCode(yield* store.describe(f.context, ref).pipe(Effect.flip), "artifact_corrupt")
      expect(yield* fs.readDirectory(f.root)).toEqual([])
      // New valid publication is a positive control after both corruption failures.
      const good = yield* store.publish(f.context, input)
      expect((yield* store.read(f.context, good)).data).toEqual(input.data)
    }))
  }), 30_000)

  it.live("finite raw/UTF-8 bounds and quota fail before writing; real FS failure is redacted", () => Effect.gen(function* () {
    const f = yield* fixture()
    const fs = yield* FSUtil.Service
    yield* Effect.forEach([0, -1, Infinity, NaN, 1.5], (boundedBytes) => Effect.gen(function* () {
      expectCode(yield* CapabilityArtifacts.make({ root: f.root, boundedBytes }).pipe(Effect.flip), "invalid_input")
    }))
    const small = yield* CapabilityArtifacts.make({ root: f.root, boundedBytes: 8, quota: 20 })
    const valid = { ...input, data: new Uint8Array([1, 2]), mime: "application/octet-stream", metadata: null }
    yield* CapabilityInvocation.withContext(f.binding, Effect.gen(function* () {
      expectCode(yield* small.publish(f.context, input).pipe(Effect.flip), "quota_exceeded")
      expectCode(yield* small.publish(f.context, { ...valid, metadata: "✓✓✓" }).pipe(Effect.flip), "quota_exceeded")
      expectCode(yield* small.publish(f.context, { ...valid, metadata: { value: Infinity } }).pipe(Effect.flip), "invalid_input")
      expectCode(yield* small.publish(f.context, { ...valid, mime: "text/plain", data: new Uint8Array([255]) }).pipe(Effect.flip), "invalid_input")
      expectCode(yield* small.publish(f.context, { ...valid, mime: "application/json" }).pipe(Effect.flip), "invalid_input")
      expect(yield* fs.exists(f.root)).toBe(false)
      const first = yield* small.publish(f.context, valid)
      expect((yield* small.read(f.context, first)).data).toEqual(valid.data)
      expect((yield* small.read(f.context, first)).metadata.metadata).toBeNull()
      yield* small.publish(f.context, valid)
      yield* small.publish(f.context, valid)
      expectCode(yield* small.publish(f.context, valid).pipe(Effect.flip), "quota_exceeded")
      expectCode(yield* small.update(f.context, first, valid).pipe(Effect.flip), "quota_exceeded")
      expect((yield* small.read(f.context, first)).data).toEqual(valid.data)
      expect(yield* f.database.db.select().from(CapabilityArtifactTable)).toHaveLength(3)
    }))
    const blocker = join(f.root, "blocked")
    yield* fs.writeFileString(blocker, "file blocks directory")
    const broken = yield* CapabilityArtifacts.make({ root: join(blocker, "artifacts") })
    expectCode(yield* CapabilityInvocation.withContext(f.binding, broken.publish(f.context, input)).pipe(Effect.flip), "artifact_io_failed")
    expect(yield* f.database.db.select().from(CapabilityArtifactTable)).toHaveLength(3)
    expect(yield* f.database.db.select().from(CapabilityArtifactReferenceTable)).toHaveLength(3)
  }), 30_000)

  it.live("scratch TTL protects new unlinked data; cleanup removes aged orphans without touching linked bytes", () => Effect.gen(function* () {
    const f = yield* fixture()
    const fs = yield* FSUtil.Service
    const store = yield* CapabilityArtifacts.make({ root: f.root, scratchTTL: 60_000 })
    const refs = yield* CapabilityInvocation.withContext(f.binding, Effect.gen(function* () {
      const linked = yield* store.publish(f.context, input)
      const scratch = yield* store.publish(f.context, { ...input, data: new TextEncoder().encode("scratch") })
      const old = yield* store.publish(f.context, { ...input, data: new TextEncoder().encode("old") })
      yield* store.deleteReference(f.context, scratch)
      yield* store.deleteReference(f.context, old)
      return { linked, scratch, old }
    }))
    const records = yield* f.database.db.select().from(CapabilityArtifactTable)
    const old = records.find((row) => row.id === refs.old.id)
    expect(old).toBeDefined()
    if (!old) return yield* Effect.die("Expected old artifact")
    yield* f.database.db.update(CapabilityArtifactTable).set({ time_created: 1 })
      .where(eq(CapabilityArtifactTable.id, old.id)).run()
    yield* fs.utimes(join(f.root, old.hash), new Date(1), new Date(1))
    const linked = records.find((row) => row.id === refs.linked.id)
    if (!linked) return yield* Effect.die("Expected linked artifact")
    yield* f.database.db.update(CapabilityArtifactTable).set({ time_created: 1 })
      .where(eq(CapabilityArtifactTable.id, linked.id)).run()
    yield* fs.utimes(join(f.root, linked.hash), new Date(1), new Date(1))
    const orphan = "0".repeat(64)
    yield* fs.writeFileString(join(f.root, orphan), "orphan")
    yield* fs.utimes(join(f.root, orphan), new Date(1), new Date(1))
    const stage = join(f.root, "stage-crash")
    yield* fs.makeDirectory(stage)
    yield* fs.writeFileString(join(stage, "blob"), "interrupted")
    yield* fs.utimes(stage, new Date(1), new Date(1))
    yield* store.cleanup()
    expect((yield* f.database.db.select().from(CapabilityArtifactTable)).map((row) => row.id).sort())
      .toEqual([refs.linked.id, refs.scratch.id].sort())
    expect(yield* fs.exists(join(f.root, old.hash))).toBe(false)
    expect(yield* fs.exists(join(f.root, orphan))).toBe(false)
    expect(yield* fs.exists(stage)).toBe(false)
    expect((yield* CapabilityInvocation.withContext(f.binding, store.read(f.context, refs.linked))).data).toEqual(input.data)
  }), 30_000)

  it.live("default root stays in captured Global.data and blob identity never reaches describe", () => Effect.gen(function* () {
    const f = yield* fixture()
    const fs = yield* FSUtil.Service
    const global = yield* Global.Service
    const store = yield* CapabilityArtifacts.make()
    yield* CapabilityInvocation.withContext(f.binding, Effect.gen(function* () {
      const ref = yield* store.publish(f.context, { ...input, data: new Uint8Array(), mime: "application/octet-stream" })
      const description = yield* store.describe(f.context, ref)
      expect(description.bytes).toBe(0)
      expect(yield* fs.readDirectory(join(global.data, "capability-artifacts"))).toEqual([description.hash])
      expect(JSON.stringify(description)).not.toContain(global.data)
      expect((yield* store.read(f.context, ref)).data).toEqual(new Uint8Array())
    }))
  }), 30_000)
})
