import { Capability } from "@orchestra/schema/capability"
import { AbsolutePath } from "@orchestra/schema/schema"
import type { SessionID } from "@orchestra/schema/session-id"
import { eq } from "drizzle-orm"
import { type Cause, Effect } from "effect"
import type { Database } from "../../database/database"
import { SessionTable } from "../../session/sql"
import type { CapabilityOperatorContract } from "../operator/contract"
import type { CapabilityRequestContract } from "../operator/request-contract"
import { failure } from "./error"

// Missing rows, placement mismatch and pure authority rejection share this one constant: no existence oracle.
export function unavailable() {
  return failure("artifact_unavailable", "Capability artifact is unavailable")
}

export function pureAuthorityRejection<E>(cause: Cause.Cause<E>) {
  return cause.reasons.length > 0 && cause.reasons.every((reason) => reason._tag === "Fail" &&
    reason.error instanceof Capability.Failure && ["invocation_binding_missing", "invocation_binding_mismatch",
      "target_denied", "authentication_required", "authentication_revoked"].includes(reason.error.code))
}

/** The Session is a selector only: placement always comes from its stored row. */
export const sessionPlacement = Effect.fn("CapabilityArtifactManagement.sessionPlacement")(function* (
  tx: CapabilityRequestContract.Transaction | Database.Interface["db"], sessionID: SessionID,
) {
  const row = yield* tx.select({ projectID: SessionTable.project_id, directory: SessionTable.directory,
    workspaceID: SessionTable.workspace_id }).from(SessionTable).where(eq(SessionTable.id, sessionID)).get()
  if (!row) return yield* unavailable()
  const placement: CapabilityOperatorContract.Placement = Object.freeze({ projectID: row.projectID,
    location: Object.freeze({ directory: AbsolutePath.make(row.directory), ...(row.workspaceID == null ? {} : { workspaceID: row.workspaceID }) }) })
  return placement
})

export function ownedBy(owner: Capability.Owner, placement: CapabilityOperatorContract.Placement) {
  return owner.projectID === placement.projectID && owner.location.directory === placement.location.directory &&
    owner.location.workspaceID === placement.location.workspaceID
}
