import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import { Agent } from "@orchestra/schema/agent"
import { Capability } from "@orchestra/schema/capability"
import { Project } from "@orchestra/schema/project"
import { AbsolutePath } from "@orchestra/schema/schema"
import { SessionID } from "@orchestra/schema/session-id"
import { SessionMessage } from "@orchestra/schema/session-message"
import { eq, sql } from "drizzle-orm"
import { Deferred, Effect, Exit, Fiber, Tracer } from "effect"
import { CapabilityArtifacts } from "../src/capability/artifact"
import { CapabilityArtifactMutations } from "../src/capability/artifact/management-mutation"
import type { CapabilityOperatorContract } from "../src/capability/operator/contract"
import { CapabilityOperator } from "../src/capability/operator/index"
import type { CapabilityRequestContract } from "../src/capability/operator/request-contract"
import { CapabilityArtifactPinTable, CapabilityArtifactReferenceTable, CapabilityArtifactTable, CapabilityRequestTable } from "../src/capability/sql"
import { Database } from "../src/database/database"
import { AppNodeBuilder } from "../src/effect/app-node-builder"
import { LayerNode } from "../src/effect/layer-node"
import { EventV2 } from "../src/event"
import { ProjectTable } from "../src/project/sql"
import { SessionTable } from "../src/session/sql"
import { testEffect } from "./lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node])))
const placement: CapabilityOperatorContract.Placement = {
  projectID: Project.ID.global, location: { directory: AbsolutePath.make("/artifact-management") },
}
const foreign: CapabilityOperatorContract.Placement = {
  projectID: Project.ID.global, location: { directory: AbsolutePath.make("/foreign-artifact-management") },
}

function fixture(scope: (ids: { artifact: Capability.ArtifactRef; peer: SessionID }) => CapabilityOperatorContract.GrantScope =
  () => ({ placements: "instance", actions: ["*"] })) {
  return Effect.gen(function* () {
    const database = yield* Database.Service
    const db = database.db
    yield* db.insert(ProjectTable).values({ id: placement.projectID, worktree: placement.location.directory, sandboxes: [] })
      .onConflictDoNothing().run()
    const session = (at = placement) => Effect.gen(function* () {
      const id = SessionID.create()
      yield* db.insert(SessionTable).values({ id, project_id: at.projectID, directory: at.location.directory,
        slug: "artifacts", title: "artifacts", version: "test", agent: "persisted-actor" }).run()
      return id
    })
    const source = yield* session()
    const peer = yield* session()
    const outsider = yield* session(foreign)
    const artifact: Capability.ArtifactRef = { id: Capability.ArtifactID.create(), revision: 0 }
    yield* db.insert(CapabilityArtifactTable).values({ ...artifact,
      owner: { ...placement, sessionID: source, agentID: Agent.ID.make("persisted-actor") },
      producer: { sessionID: source, agentID: Agent.ID.make("persisted-actor"),
        assistantMessageID: SessionMessage.ID.create(), callID: "call" },
      mime: "text/plain", kind: "document", hash: "a".repeat(64), bytes: 1, verification: "observed", metadata: {} }).run()
    yield* db.insert(CapabilityArtifactReferenceTable).values({ artifact_id: artifact.id, revision: 0, session_id: source }).run()
    const operators = yield* CapabilityOperator.make({ principal: `artifacts-${randomUUID()}`, scope: scope({ artifact, peer }) })
    const mutations = yield* CapabilityArtifactMutations.make({ operators })
    const run = <A, E, R>(effect: Effect.Effect<A, E, R>, key = "key") =>
      operators.withRequest(operators.configured, { requestID: randomUUID(), idempotencyKey: key }, effect)
    const references = (sessionID: SessionID) => db.select().from(CapabilityArtifactReferenceTable)
      .where(eq(CapabilityArtifactReferenceTable.session_id, sessionID)).all()
    const receipts = () => db.select().from(CapabilityRequestTable).all()
    return { db, mutations, run, source, peer, outsider, artifact, references, receipts }
  })
}

/** Runs `change` in a real immediate writer that starts exactly when the facade enters the ledger commit,
 * after its pre-ledger authority and placement checks, and holds the lock until the change is committed. */
function interleaved<A, E, R>(database: Database.Interface, effect: Effect.Effect<A, E, R>,
  change: (tx: CapabilityRequestContract.Transaction) => Effect.Effect<unknown, unknown>) {
  return Effect.gen(function* () {
    const scope = yield* Effect.scope
    const locked = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const state: { writer?: Fiber.Fiber<void, unknown> } = {}
    const tracer = Tracer.make({ span: (options) => {
      if (options.name === "CapabilityArtifactMutations.commit" && !state.writer)
        state.writer = Effect.runFork(database.db.transaction((tx) => Effect.gen(function* () {
          yield* change(tx)
          yield* Deferred.succeed(locked, undefined)
          yield* Deferred.await(release)
        }), { behavior: "immediate" })).pipe(Fiber.runIn(scope))
      return new Tracer.NativeSpan(options)
    } })
    const pending = yield* effect.pipe(Effect.withTracer(tracer), Effect.forkChild)
    yield* Deferred.await(locked)
    yield* Deferred.succeed(release, undefined)
    if (state.writer) yield* Fiber.await(state.writer)
    return yield* Fiber.await(pending)
  })
}

function codes<A, E>(exit: Exit.Exit<A, E>) {
  if (!Exit.isFailure(exit)) throw new Error("Expected failed Exit")
  return exit.cause.reasons.map((reason) => {
    if (reason._tag !== "Fail" || !(reason.error instanceof Capability.Failure || reason.error instanceof CapabilityArtifacts.Failure))
      throw new Error("Expected typed artifact failure")
    return reason.error.code
  })
}

it.live("share is idempotent, conflicts on a changed payload and never writes twice", () => Effect.gen(function* () {
  const f = yield* fixture()
  const first = yield* f.run(f.mutations.share(f.source, f.artifact, { targetSessionID: f.peer }))
  expect(first.reused).toBe(false)
  expect(first.data).toEqual({ artifact: f.artifact, targetSessionID: f.peer })
  expect(yield* f.references(f.peer)).toHaveLength(1)
  // Remove the written row: an exact retry must replay the receipt, not insert again.
  yield* f.db.delete(CapabilityArtifactReferenceTable).where(eq(CapabilityArtifactReferenceTable.session_id, f.peer)).run()
  const retry = yield* f.run(f.mutations.share(f.source, f.artifact, { targetSessionID: f.peer }))
  expect(retry).toEqual({ requestID: first.requestID, reused: true, data: first.data })
  expect(yield* f.references(f.peer)).toHaveLength(0)
  expect(codes(yield* f.run(f.mutations.share(f.source, f.artifact, { targetSessionID: f.source })).pipe(Effect.exit)))
    .toEqual(["outcome_unknown"])
  expect(yield* f.receipts()).toHaveLength(1)
}))

it.live("share refuses a cross-placement or missing target Session without writing", () => Effect.gen(function* () {
  const f = yield* fixture()
  expect(codes(yield* f.run(f.mutations.share(f.source, f.artifact, { targetSessionID: f.outsider })).pipe(Effect.exit)))
    .toEqual(["artifact_unavailable"])
  expect(codes(yield* f.run(f.mutations.share(f.source, f.artifact, { targetSessionID: SessionID.create() }), "missing")
    .pipe(Effect.exit))).toEqual(["artifact_unavailable"])
  expect(yield* f.references(f.outsider)).toHaveLength(0)
  expect(yield* f.receipts()).toHaveLength(0)
}))

it.live("share needs authority over both the artifact and the target Session", () => Effect.gen(function* () {
  const artifactOnly = yield* fixture((ids) => ({ placements: "instance", actions: ["artifact.share"],
    resources: [{ kind: "artifact", id: ids.artifact.id }] }))
  const sessionOnly = yield* fixture((ids) => ({ placements: "instance", actions: ["artifact.share"],
    resources: [{ kind: "session", id: ids.peer }] }))
  yield* Effect.forEach([artifactOnly, sessionOnly], (f) => Effect.gen(function* () {
    expect(codes(yield* f.run(f.mutations.share(f.source, f.artifact, { targetSessionID: f.peer })).pipe(Effect.exit)))
      .toEqual(["artifact_unavailable"])
    expect(yield* f.references(f.peer)).toHaveLength(0)
  }))
  expect(yield* artifactOnly.receipts()).toHaveLength(0)
}))

it.live("pin mirrors Core pin SQL and replays without a second write", () => Effect.gen(function* () {
  const f = yield* fixture()
  const first = yield* f.run(f.mutations.pin(f.source, f.artifact, { pinned: true }))
  expect(first.data).toEqual({ artifact: f.artifact, pinned: true })
  expect((yield* f.references(f.source))[0].pinned).toBe(true)
  expect(yield* f.db.select().from(CapabilityArtifactPinTable).all()).toHaveLength(1)
  yield* f.db.delete(CapabilityArtifactPinTable).run()
  expect(yield* f.run(f.mutations.pin(f.source, f.artifact, { pinned: true }))).toEqual({ ...first, reused: true })
  expect(yield* f.db.select().from(CapabilityArtifactPinTable).all()).toHaveLength(0)
  yield* f.run(f.mutations.pin(f.source, f.artifact, { pinned: false }), "unpin")
  expect((yield* f.references(f.source))[0].pinned).toBe(false)
}))

it.live("removeReference refuses pinned rows and reconciles an exact retry after the row is gone", () => Effect.gen(function* () {
  const f = yield* fixture()
  yield* f.run(f.mutations.pin(f.source, f.artifact, { pinned: true }), "pin")
  expect(codes(yield* f.run(f.mutations.removeReference(f.source, f.artifact)).pipe(Effect.exit))).toEqual(["reference_pinned"])
  expect(yield* f.references(f.source)).toHaveLength(1)
  // A pin row alone still protects the reference.
  yield* f.db.update(CapabilityArtifactReferenceTable).set({ pinned: false }).run()
  expect(codes(yield* f.run(f.mutations.removeReference(f.source, f.artifact)).pipe(Effect.exit))).toEqual(["reference_pinned"])
  yield* f.run(f.mutations.pin(f.source, f.artifact, { pinned: false }), "unpin")
  const removed = yield* f.run(f.mutations.removeReference(f.source, f.artifact))
  expect(removed.data).toEqual({ artifact: f.artifact, removed: true })
  expect(yield* f.references(f.source)).toHaveLength(0)
  expect(yield* f.run(f.mutations.removeReference(f.source, f.artifact))).toEqual({ ...removed, reused: true })
  // A fresh key needs the reference.
  expect(codes(yield* f.run(f.mutations.removeReference(f.source, f.artifact), "fresh").pipe(Effect.exit)))
    .toEqual(["artifact_unavailable"])
  // Replay still rechecks placement and the record.
  yield* f.db.update(SessionTable).set({ directory: foreign.location.directory }).where(eq(SessionTable.id, f.source)).run()
  expect(codes(yield* f.run(f.mutations.removeReference(f.source, f.artifact)).pipe(Effect.exit))).toEqual(["artifact_unavailable"])
  yield* f.db.update(SessionTable).set({ directory: placement.location.directory }).where(eq(SessionTable.id, f.source)).run()
  yield* f.db.delete(CapabilityArtifactTable).run()
  expect(codes(yield* f.run(f.mutations.removeReference(f.source, f.artifact)).pipe(Effect.exit))).toEqual(["artifact_unavailable"])
}))

it.live("a failing receipt write rolls back the domain mutation and leaves no receipt", () => Effect.gen(function* () {
  const f = yield* fixture()
  yield* f.db.run(sql.raw(`CREATE TRIGGER artifact_receipt_abort BEFORE INSERT ON capability_request
    WHEN NEW.action = 'artifact.share' BEGIN SELECT RAISE(ABORT, 'RECEIPT_ABORT'); END`))
  yield* Effect.gen(function* () {
    expect(codes(yield* f.run(f.mutations.share(f.source, f.artifact, { targetSessionID: f.peer })).pipe(Effect.exit)))
      .toEqual(["outcome_unknown"])
    expect(yield* f.references(f.peer)).toHaveLength(0)
    expect(yield* f.receipts()).toHaveLength(0)
  }).pipe(Effect.ensuring(f.db.run("DROP TRIGGER artifact_receipt_abort").pipe(Effect.orDie)))
  expect((yield* f.run(f.mutations.share(f.source, f.artifact, { targetSessionID: f.peer }))).reused).toBe(false)
  expect(yield* f.references(f.peer)).toHaveLength(1)
}))

it.live("verify rejects a source Session moved after the pre-ledger check", () => Effect.gen(function* () {
  const f = yield* fixture()
  const database = yield* Database.Service
  expect(codes(yield* interleaved(database, f.run(f.mutations.pin(f.source, f.artifact, { pinned: true })),
    (tx) => tx.update(SessionTable).set({ directory: foreign.location.directory }).where(eq(SessionTable.id, f.source)).run())))
    .toEqual(["artifact_unavailable"])
  expect((yield* f.references(f.source))[0].pinned).toBe(false)
  expect(yield* f.db.select().from(CapabilityArtifactPinTable).all()).toHaveLength(0)
  expect(yield* f.receipts()).toHaveLength(0)
}))

it.live("a fresh write fails when the source reference disappears after the pre-ledger check", () => Effect.gen(function* () {
  const f = yield* fixture()
  const database = yield* Database.Service
  expect(codes(yield* interleaved(database, f.run(f.mutations.share(f.source, f.artifact, { targetSessionID: f.peer })),
    (tx) => tx.delete(CapabilityArtifactReferenceTable).where(eq(CapabilityArtifactReferenceTable.session_id, f.source)).run())))
    .toEqual(["artifact_unavailable"])
  expect(yield* f.references(f.peer)).toHaveLength(0)
  expect(yield* f.receipts()).toHaveLength(0)
}))

it.live("pin with a changed payload under the same key conflicts and leaves state unchanged", () => Effect.gen(function* () {
  const f = yield* fixture()
  yield* f.run(f.mutations.pin(f.source, f.artifact, { pinned: true }))
  expect(codes(yield* f.run(f.mutations.pin(f.source, f.artifact, { pinned: false })).pipe(Effect.exit)))
    .toEqual(["outcome_unknown"])
  expect((yield* f.references(f.source))[0].pinned).toBe(true)
  expect(yield* f.db.select().from(CapabilityArtifactPinTable).all()).toHaveLength(1)
  expect(yield* f.receipts()).toHaveLength(1)
}))
