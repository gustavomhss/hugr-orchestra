export * as CapabilityArtifactMutations from "./management-mutation"

import { Capability } from "@orchestra/schema/capability"
import { CapabilityArtifactManagement } from "@orchestra/schema/capability-artifact-management"
import { SessionID } from "@orchestra/schema/session-id"
import { and, eq } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { Database } from "../../database/database"
import { capture, decode } from "../connection/input"
import type { CapabilityOperatorContract } from "../operator/contract"
import { CapabilityRequest } from "../operator/request"
import type { CapabilityRequestContract } from "../operator/request-contract"
import { CapabilityArtifactPinTable, CapabilityArtifactReferenceTable, CapabilityArtifactTable } from "../sql"
import { failure } from "./error"
import type { CapabilityArtifacts } from "./index"
import type { CapabilityArtifactManagementContract } from "./management-contract"
import { ownedBy, pureAuthorityRejection, sessionPlacement, unavailable } from "./management-shared"

type Transaction = CapabilityRequestContract.Transaction
type Placement = CapabilityOperatorContract.Placement

export const make = (options: CapabilityArtifactManagementContract.Options) => Effect.gen(function* () {
  const operators = Object.freeze({ ...options.operators })
  const database = yield* Database.Service
  const requests = yield* CapabilityRequest.make({ operators })
  const db = database.db

  const authorize = (target: CapabilityOperatorContract.Target) => operators.require(target).pipe(
    Effect.catchCauseIf(pureAuthorityRejection, () => Effect.fail(unavailable())))

  const mutation = Effect.fn("CapabilityArtifactMutations.mutation")(function* (action: string,
    value: Readonly<{ sessionID: SessionID; artifact: Capability.ArtifactRef; input: Schema.Json }>,
    write: (tx: Transaction, placement: Placement) => Effect.Effect<Schema.Json, CapabilityArtifacts.Error>, sharedWith?: SessionID,
  ) {
    const placement = yield* sessionPlacement(db, value.sessionID)
    const target = { action, placement, resource: { kind: "artifact", id: value.artifact.id } }
    yield* authorize(target)
    // Share also needs authority over the target Session at its own stored placement; the ledger target stays the artifact.
    // Intentional: target authority runs before replay, so a share retry after the target Session is deleted is unavailable.
    if (sharedWith !== undefined) yield* authorize({ action, placement: yield* sessionPlacement(db, sharedWith),
      resource: { kind: "session", id: sharedWith } })
    // Replay reconciles after the reference is gone, but never across a moved Session or a collected record.
    const verify = (tx: Transaction) => Effect.gen(function* () {
      if (!samePlacement(placement, yield* sessionPlacement(tx, value.sessionID))) return yield* unavailable()
      const row = yield* record(tx, value.artifact)
      if (!row || !ownedBy(row.owner, placement)) return yield* unavailable()
    })
    return yield* requests.commit(target, value, (tx) => write(tx, placement), verify).pipe(
      Effect.withSpan("CapabilityArtifactMutations.commit"),
      Effect.catchCauseIf(pureAuthorityRejection, () => Effect.fail(unavailable())))
  })

  const share: CapabilityArtifactManagementContract.Mutations["share"] = (sessionID, artifact, input) => {
    const captured = capture({ sessionID, artifact, input }, payload(CapabilityArtifactManagement.ShareInput))
    return Effect.gen(function* () {
      if (!captured.ok) return yield* invalid()
      const value = captured.value
      return yield* mutation("artifact.share", value, (tx, placement) => Effect.gen(function* () {
        yield* requireReference(tx, value.artifact, value.sessionID)
        if (!samePlacement(placement, yield* sessionPlacement(tx, value.input.targetSessionID))) return yield* unavailable()
        yield* tx.insert(CapabilityArtifactReferenceTable).values({ artifact_id: value.artifact.id,
          revision: value.artifact.revision, session_id: value.input.targetSessionID }).onConflictDoNothing().run()
        return { artifact: value.artifact, targetSessionID: value.input.targetSessionID }
      }), value.input.targetSessionID)
    })
  }

  const pin: CapabilityArtifactManagementContract.Mutations["pin"] = (sessionID, artifact, input) => {
    const captured = capture({ sessionID, artifact, input }, payload(CapabilityArtifactManagement.PinInput))
    return Effect.gen(function* () {
      if (!captured.ok) return yield* invalid()
      const value = captured.value
      const ref = value.artifact
      return yield* mutation("artifact.pin", value, (tx) => Effect.gen(function* () {
        yield* requireReference(tx, ref, value.sessionID)
        // Same SQL as the Core pin. An operator has no issued owner, so the pin row carries the record owner.
        const row = yield* record(tx, ref)
        if (!row) return yield* unavailable()
        if (value.input.pinned) yield* tx.insert(CapabilityArtifactPinTable).values({ artifact_id: ref.id,
          revision: ref.revision, session_id: value.sessionID, owner: row.owner }).onConflictDoNothing().run()
        if (!value.input.pinned) yield* tx.delete(CapabilityArtifactPinTable).where(pinKey(ref, value.sessionID)).run()
        yield* tx.update(CapabilityArtifactReferenceTable).set({ pinned: value.input.pinned })
          .where(referenceKey(ref, value.sessionID)).run()
        return { artifact: ref, pinned: value.input.pinned }
      }))
    })
  }

  const removeReference: CapabilityArtifactManagementContract.Mutations["removeReference"] = (sessionID, artifact) => {
    const captured = capture({ sessionID, artifact, input: null }, payload(Schema.Null))
    return Effect.gen(function* () {
      if (!captured.ok) return yield* invalid()
      const value = captured.value
      const ref = value.artifact
      return yield* mutation("artifact.reference.delete", value, (tx) => Effect.gen(function* () {
        const reference = yield* requireReference(tx, ref, value.sessionID)
        const pinned = yield* tx.select({ sessionID: CapabilityArtifactPinTable.session_id }).from(CapabilityArtifactPinTable)
          .where(pinKey(ref, value.sessionID)).get()
        if (reference.pinned || pinned) return yield* failure("reference_pinned", "Artifact reference must be unpinned before deletion")
        yield* tx.delete(CapabilityArtifactReferenceTable).where(referenceKey(ref, value.sessionID)).run()
        return { artifact: ref, removed: true }
      }))
    })
  }

  return Object.freeze({ share, pin, removeReference }) satisfies CapabilityArtifactManagementContract.Mutations
})

function payload<S extends Schema.Top>(input: S) {
  return decode(Schema.Struct({ sessionID: SessionID, artifact: Capability.ArtifactRef, input }))
}

function record(tx: Transaction, ref: Capability.ArtifactRef) {
  return tx.select({ owner: CapabilityArtifactTable.owner }).from(CapabilityArtifactTable)
    .where(and(eq(CapabilityArtifactTable.id, ref.id), eq(CapabilityArtifactTable.revision, ref.revision))).get()
}

function invalid() {
  return failure("invalid_input", "Artifact management input is invalid")
}

const requireReference = Effect.fn("CapabilityArtifactMutations.reference")(function* (
  tx: Transaction, ref: Capability.ArtifactRef, sessionID: SessionID,
) {
  const row = yield* tx.select({ pinned: CapabilityArtifactReferenceTable.pinned }).from(CapabilityArtifactReferenceTable)
    .where(referenceKey(ref, sessionID)).get()
  if (!row) return yield* unavailable()
  return row
})

function samePlacement(left: Placement, right: Placement) {
  return left.projectID === right.projectID && left.location.directory === right.location.directory &&
    left.location.workspaceID === right.location.workspaceID
}

function referenceKey(ref: Capability.ArtifactRef, sessionID: SessionID) {
  return and(eq(CapabilityArtifactReferenceTable.artifact_id, ref.id),
    eq(CapabilityArtifactReferenceTable.revision, ref.revision), eq(CapabilityArtifactReferenceTable.session_id, sessionID))
}

function pinKey(ref: Capability.ArtifactRef, sessionID: SessionID) {
  return and(eq(CapabilityArtifactPinTable.artifact_id, ref.id),
    eq(CapabilityArtifactPinTable.revision, ref.revision), eq(CapabilityArtifactPinTable.session_id, sessionID))
}
