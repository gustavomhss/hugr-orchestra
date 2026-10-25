export * as CapabilityArtifactManagement from "./management"

import { Capability } from "@orchestra/schema/capability"
import { CapabilityArtifactManagement } from "@orchestra/schema/capability-artifact-management"
import { SessionID } from "@orchestra/schema/session-id"
import { and, eq, gt, or, sql } from "drizzle-orm"
import { Effect, Option, Schema } from "effect"
import { Database } from "../../database/database"
import { capture, decode } from "../connection/input"
import type { CapabilityOperatorContract } from "../operator/contract"
import { CapabilityArtifactPinTable, CapabilityArtifactReferenceTable, CapabilityArtifactTable } from "../sql"
import { failure } from "./error"
import { CapabilityArtifacts } from "./index"
import type { CapabilityArtifactManagementContract } from "./management-contract"
import { CapabilityArtifactMutations } from "./management-mutation"
import { ownedBy, pureAuthorityRejection, sessionPlacement, unavailable } from "./management-shared"

// Owner is loaded only for the placement check; producer and user metadata are never selected.
const columns = {
  id: CapabilityArtifactTable.id, revision: CapabilityArtifactTable.revision, owner: CapabilityArtifactTable.owner,
  mime: CapabilityArtifactTable.mime, kind: CapabilityArtifactTable.kind, hash: CapabilityArtifactTable.hash,
  bytes: CapabilityArtifactTable.bytes, verification: CapabilityArtifactTable.verification,
  timeCreated: CapabilityArtifactTable.time_created, flag: CapabilityArtifactReferenceTable.pinned,
  pin: CapabilityArtifactPinTable.session_id,
}

export function make(options: CapabilityArtifactManagementContract.Options) {
  const operators = Object.freeze({ ...options.operators })
  return Effect.gen(function* () {
    const database = yield* Database.Service
    const storage = yield* CapabilityArtifacts.storage(options.artifacts)
    const mutations = yield* CapabilityArtifactMutations.make(options)
    const db = database.db

    const authorize = (target: CapabilityOperatorContract.Target) => operators.require(target).pipe(
      Effect.catchCauseIf(pureAuthorityRejection, () => Effect.fail(unavailable())),
    )
    const validate = (binding: CapabilityOperatorContract.Binding, target: CapabilityOperatorContract.Target) =>
      operators.validate(binding, target).pipe(Effect.catchCauseIf(pureAuthorityRejection, () => Effect.fail(unavailable())))

    const rows = (sessionID: SessionID) => db.select(columns).from(CapabilityArtifactReferenceTable)
      .innerJoin(CapabilityArtifactTable, and(eq(CapabilityArtifactTable.id, CapabilityArtifactReferenceTable.artifact_id),
        eq(CapabilityArtifactTable.revision, CapabilityArtifactReferenceTable.revision)))
      .leftJoin(CapabilityArtifactPinTable, and(eq(CapabilityArtifactPinTable.artifact_id, CapabilityArtifactReferenceTable.artifact_id),
        eq(CapabilityArtifactPinTable.revision, CapabilityArtifactReferenceTable.revision),
        eq(CapabilityArtifactPinTable.session_id, sessionID)))

    const resolve = Effect.fn("CapabilityArtifactManagement.resolve")(function* (sessionID: SessionID, ref: Capability.ArtifactRef) {
      const placement = yield* sessionPlacement(db, sessionID)
      const target = { action: "artifact.read", placement, resource: { kind: "artifact", id: ref.id } }
      const binding = yield* authorize(target)
      const row = yield* rows(sessionID).where(and(eq(CapabilityArtifactReferenceTable.session_id, sessionID),
        eq(CapabilityArtifactReferenceTable.artifact_id, ref.id), eq(CapabilityArtifactReferenceTable.revision, ref.revision))).get()
      if (!row || !ownedBy(row.owner, placement)) return yield* unavailable()
      return { row, artifact: yield* project(row), binding, target }
    })

    const list: CapabilityArtifactManagementContract.Interface["list"] = (supplied, input) => {
      const captured = capture({ sessionID: supplied, input },
        decode(Schema.Struct({ sessionID: SessionID, input: CapabilityArtifactManagement.ArtifactQuery })))
      return Effect.gen(function* () {
        if (!captured.ok) return yield* failure("invalid_input", "Artifact query is invalid")
        const sessionID = captured.value.sessionID
        const placement = yield* sessionPlacement(db, sessionID)
        const target = { action: "artifact.list", placement, resource: { kind: "session", id: sessionID } }
        const binding = yield* authorize(target)
        const limit = captured.value.input.limit ?? 16
        const after = captured.value.input.after === undefined ? undefined : cursor(captured.value.input.after)
        const found = yield* rows(sessionID).where(and(
          eq(CapabilityArtifactReferenceTable.session_id, sessionID),
          sql`json_extract(${CapabilityArtifactTable.owner}, '$.projectID') = ${placement.projectID}`,
          sql`json_extract(${CapabilityArtifactTable.owner}, '$.location.directory') = ${placement.location.directory}`,
          sql`json_extract(${CapabilityArtifactTable.owner}, '$.location.workspaceID') IS ${placement.location.workspaceID ?? null}`,
          after === undefined ? undefined : or(gt(CapabilityArtifactReferenceTable.artifact_id, after.id),
            and(eq(CapabilityArtifactReferenceTable.artifact_id, after.id), gt(CapabilityArtifactReferenceTable.revision, after.revision))),
        )).orderBy(CapabilityArtifactReferenceTable.artifact_id, CapabilityArtifactReferenceTable.revision).limit(limit + 1).all()
        const items = yield* Effect.forEach(found.slice(0, limit), project)
        yield* validate(binding, target)
        // The cursor names the last returned item only, never the probed extra row.
        const last = found[limit - 1]
        return Object.freeze({ items: Object.freeze(items), coverage: "live" as const,
          ...(found.length > limit ? { after: `${last.id}:${last.revision}` } : {}) })
      })
    }

    const get: CapabilityArtifactManagementContract.Interface["get"] = (sessionID, ref) => {
      const captured = capture({ sessionID, ref }, decode(Schema.Struct({ sessionID: SessionID, ref: Capability.ArtifactRef })))
      return Effect.gen(function* () {
        if (!captured.ok) return yield* failure("invalid_input", "Artifact reference is invalid")
        const found = yield* resolve(captured.value.sessionID, captured.value.ref)
        yield* validate(found.binding, found.target)
        return found.artifact
      })
    }

    const content: CapabilityArtifactManagementContract.Interface["content"] = (sessionID, ref) => {
      const captured = capture({ sessionID, ref }, decode(Schema.Struct({ sessionID: SessionID, ref: Capability.ArtifactRef })))
      return Effect.gen(function* () {
        if (!captured.ok) return yield* failure("invalid_input", "Artifact reference is invalid")
        const found = yield* resolve(captured.value.sessionID, captured.value.ref)
        // ArtifactBlobs.read verifies size, SHA-256 and MIME; any mismatch is artifact_corrupt.
        const data = yield* storage.blobs.read(found.row.hash, found.row.bytes, found.row.mime)
        yield* validate(found.binding, found.target)
        return Object.freeze({ artifact: found.artifact, data })
      })
    }

    return Object.freeze({ list, get, content, ...mutations }) satisfies CapabilityArtifactManagementContract.Interface
  })
}

export type Interface = CapabilityArtifactManagementContract.Interface

function project(row: { id: Capability.ArtifactID; revision: number; mime: string; kind: string; hash: string; bytes: number;
  verification: Capability.Verification; timeCreated: number; flag: boolean; pin: SessionID | null }) {
  const decoded = Schema.decodeUnknownOption(Schema.toType(CapabilityArtifactManagement.Artifact))({
    artifact: { id: row.id, revision: row.revision }, mime: row.mime, kind: row.kind, hash: row.hash, bytes: row.bytes,
    verification: row.verification, timeCreated: row.timeCreated, pinned: row.flag || row.pin !== null,
  })
  return Option.isNone(decoded) ? Effect.fail(unavailable())
    : Effect.succeed(Object.freeze({ ...decoded.value, artifact: Object.freeze(decoded.value.artifact) }))
}

function cursor(value: string) {
  const split = value.lastIndexOf(":")
  return { id: Capability.ArtifactID.make(value.slice(0, split)), revision: Number(value.slice(split + 1)) }
}
