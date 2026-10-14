export * as OutputTarget from "./target"

import { Actions } from "@orchestra/schema/actions"
import { Effect } from "effect"
import { ActionsContract } from "../contract"
import { ActionsError } from "../error"
import { OutputNative } from "./native"
import { OutputHeaders } from "./headers"

export type Target = { readonly request: ActionsContract.BoundRequest; readonly info: Actions.TransferInfo }

export const resolve = Effect.fn("ActionsOutput.target")(function* (
  transport: ActionsContract.Transport, reader: ActionsContract.ReadAdapter, binding: Actions.Binding, input: Actions.TransferInput,
): Effect.fn.Return<Target, ActionsError> {
  yield* OutputNative.checked(binding, () => {
    OutputNative.selection(binding, input, Actions.TransferInput, ["kind", "id", "runID", "attempt", "path"])
    OutputNative.id(binding, input.id)
    if (input.runID !== undefined) OutputNative.id(binding, input.runID)
    if (input.attempt !== undefined && (!Number.isSafeInteger(input.attempt) || input.attempt < 1))
      throw OutputNative.error(binding, "invalid_input", "CI output attempt must be a safe positive native integer")
    if (input.kind === "secureFile") throw OutputNative.error(binding, "capability_unavailable", "Secure Files are outside CI output")
    if (input.path !== undefined) {
      OutputNative.filePath(binding, input.path)
      if (binding.provider.kind !== "gitlab" || input.kind !== "artifact")
        throw OutputNative.error(binding, "capability_unavailable", "Direct artifact file reads require the native GitLab job API")
    }
    if (binding.provider.kind === "gitlab" && (input.kind === "runLog" || input.attempt !== undefined))
      throw OutputNative.error(binding, "capability_unavailable", "GitLab exposes job traces and immutable job IDs, not pipeline logs or numeric run attempts")
    if (binding.provider.kind === "github" && input.kind === "artifact" && input.attempt !== undefined)
      throw OutputNative.error(binding, "capability_unavailable", "GitHub artifact metadata does not attribute an artifact to a numeric run attempt")
    if (input.kind === "runLog" && input.runID !== undefined && input.id !== input.runID)
      throw OutputNative.error(binding, "invalid_input", "Run log ID must equal the selected run ID")
  })
  const root = yield* OutputNative.project(transport, binding)
  if (binding.provider.kind === "gitlab") {
    const response = yield* OutputNative.get(transport, binding, `${root}/jobs/${input.id}`)
    const job = yield* OutputNative.checked(binding, () => {
      const job = OutputNative.decode(binding, OutputNative.GitLabJob, response.data)
      OutputNative.gitlabOwner(binding, job, input.id, input.runID)
      if (job.erased_at) throw OutputNative.error(binding, "not_found", "GitLab job output was erased")
      if (input.kind === "artifact" && OutputNative.gitlabState(job) === "expired")
        throw OutputNative.error(binding, "not_found", "GitLab job artifacts are expired or unavailable")
      if (input.kind === "artifact" && !OutputNative.gitlabArchive(job))
        throw OutputNative.error(binding, "capability_unavailable", "GitLab job has no native downloadable artifact archive")
      return job
    })
    yield* OutputNative.run(reader, binding, String(job.pipeline.id))
    const archive = OutputNative.gitlabArchive(job)
    const path = input.path === undefined ? undefined : yield* OutputNative.checked(binding, () => OutputNative.filePath(binding, input.path ?? ""))
    return { request: { method: "GET", path: `${root}/jobs/${input.id}/${input.kind === "jobLog" ? "trace" : `artifacts${path === undefined ? "" : `/${path}`}`}` },
      info: { filename: OutputHeaders.filename(input.kind === "jobLog" ? `job-${input.id}.log`
        : input.path ?? archive?.filename ?? `job-${input.id}-artifacts.zip`, `job-${input.id}.bin`),
        contentType: input.kind === "jobLog" || path !== undefined ? "text/plain" : "application/zip",
        ...(input.kind === "artifact" && path === undefined && archive ? { size: archive.size } : {}) } }
  }
  if (input.kind === "artifact") {
    const response = yield* OutputNative.get(transport, binding, `${root}/actions/artifacts/${input.id}`)
    const artifact = yield* OutputNative.checked(binding, () => {
      const value = OutputNative.decode(binding, OutputNative.Artifact, response.data)
      OutputNative.artifactOwner(binding, value, input.id, input.runID)
      if (value.expired) throw OutputNative.error(binding, "not_found", "GitHub artifact has expired")
      return value
    })
    yield* OutputNative.run(reader, binding, String(artifact.workflow_run.id))
    return { request: { method: "GET", path: `${root}/actions/artifacts/${input.id}/zip` },
      info: { filename: OutputHeaders.filename(`${artifact.name}.zip`, `artifact-${input.id}.zip`), contentType: "application/zip",
        size: artifact.size_in_bytes, ...(artifact.digest ? { digest: artifact.digest } : {}) } }
  }
  if (input.kind === "jobLog") {
    const response = yield* OutputNative.get(transport, binding, `${root}/actions/jobs/${input.id}`)
    const job = yield* OutputNative.checked(binding, () => {
      const value = OutputNative.decode(binding, OutputNative.GitHubJob, response.data)
      if (String(value.id) !== input.id || (input.runID !== undefined && String(value.run_id) !== input.runID) ||
        (input.attempt !== undefined && value.run_attempt !== input.attempt))
        throw OutputNative.error(binding, "binding_stale", "GitHub log job differs from the selected job, run or attempt")
      return value
    })
    yield* requireAttempt(transport, reader, binding, root, String(job.run_id), job.run_attempt)
    return { request: { method: "GET", path: `${root}/actions/jobs/${input.id}/logs` },
      info: { filename: `job-${input.id}-attempt-${job.run_attempt}.log`, contentType: "text/plain" } }
  }
  const run = yield* OutputNative.run(reader, binding, input.id)
  const attempt = input.attempt ?? run.attempt
  if (attempt === undefined) return yield* OutputNative.error(binding, "capability_unavailable", "GitHub run metadata did not identify the log attempt")
  yield* requireAttempt(transport, reader, binding, root, input.id, attempt, run)
  return { request: { method: "GET", path: `${root}/actions/runs/${input.id}/attempts/${attempt}/logs` },
    info: { filename: `run-${input.id}-attempt-${attempt}-logs.zip`, contentType: "application/zip" } }
})

const requireAttempt = Effect.fn("ActionsOutput.attempt")(function* (
  transport: ActionsContract.Transport, reader: ActionsContract.ReadAdapter, binding: Actions.Binding, root: string,
  runID: string, attempt: number, observed?: Actions.Run,
) {
  const run = observed ?? (yield* OutputNative.run(reader, binding, runID))
  if (run.attempt === undefined || attempt > run.attempt)
    return yield* OutputNative.error(binding, "binding_stale", "Selected GitHub log attempt does not exist on this run")
  const response = yield* OutputNative.get(transport, binding, `${root}/actions/runs/${runID}/attempts/${attempt}`)
  yield* OutputNative.checked(binding, () => {
    const value = OutputNative.decode(binding, OutputNative.GitHubAttempt, response.data)
    if (String(value.id) !== runID || String(value.repository.id) !== binding.projectID || value.run_attempt !== attempt)
      throw OutputNative.error(binding, "binding_stale", "GitHub native log attempt belongs to a different repository, run or attempt")
  })
})
