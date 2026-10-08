import { Schema } from "effect"

export class Failure extends Schema.TaggedErrorClass<Failure>()("CapabilityArtifacts.Failure", {
  code: Schema.Literals([
    "invalid_input", "artifact_not_found", "revision_conflict", "artifact_corrupt",
    "artifact_io_failed", "artifact_storage_failed", "reference_pinned",
  ]),
  message: Schema.String,
}) {}

export function failure(code: Failure["code"], message: string) {
  return new Failure({ code, message })
}
