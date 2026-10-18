export * as OutputVersion from "./version"

import { ActionsResourceNative } from "../resources/native"
import { OutputNative } from "./native"

export function github(value: typeof OutputNative.Artifact.Type) {
  return ActionsResourceNative.version({ id: String(value.id), runID: String(value.workflow_run.id), repositoryID: String(value.workflow_run.repository_id),
    size: value.size_in_bytes, expired: value.expired, digest: value.digest ?? null, createdAt: value.created_at ?? null,
    updatedAt: value.updated_at ?? null, expiryObserved: value.expires_at !== undefined, expiresAt: value.expires_at ?? null })
}

export function gitlab(value: typeof OutputNative.GitLabJob.Type) {
  return ActionsResourceNative.version({ id: String(value.id), runID: String(value.pipeline.id), projectID: String(value.pipeline.project_id),
    archive: value.artifacts_file ?? null, artifacts: value.artifacts, erasedAt: value.erased_at ?? null,
    expiryObserved: value.artifacts_expire_at !== undefined, expiresAt: value.artifacts_expire_at ?? null })
}
