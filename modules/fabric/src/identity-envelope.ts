export * as FabricIdentityEnvelope from "./identity-envelope"

import { Schema } from "effect"
import { FabricIdentityMaterial } from "./identity-material"
import type { FabricIdentityAttemptTable } from "./identity-attempt/sql"

// Private preparation format. Exchange deliberately binds the original revision 2, not metadata revision 3.
const Envelope = Schema.Struct({
  domain: Schema.Literal("orchestra:fabric-identity-preparation"),
  version: Schema.Literal(1),
  binding: Schema.String,
  expiresAt: Schema.Number,
  ...FabricIdentityMaterial.Material.fields,
})
export const decode = Schema.decodeUnknownOption(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Envelope)))

export function binding(row: typeof FabricIdentityAttemptTable.$inferSelect) {
  // Fixed-order tuple inside authenticated ciphertext, not a serializable authorization grant.
  return JSON.stringify([
    row.storage_id,
    row.principal,
    row.context_id,
    row.context_generation,
    row.directory,
    row.project_id,
    row.project_directory,
    row.id,
    row.revision,
    row.profile_hash,
    row.scopes,
    row.time_created,
    row.expires_at,
  ])
}
