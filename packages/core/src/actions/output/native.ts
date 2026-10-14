export * as OutputNative from "./native"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Option, Schema } from "effect"
import { ActionsContract } from "../contract"
import { ActionsError } from "../error"
import { ActionsCursor } from "../cursor"
import { ActionsResponse } from "../transport/response"

export const ID = Schema.Union([
  Schema.String.check(Schema.isPattern(/^[1-9]\d{0,127}$/)),
  Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })),
])
export const Count = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }))
export const Positive = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }))
export const Text = Schema.String.check(Schema.isMaxLength(4096))
export const Time = Schema.String.check(Schema.isMaxLength(64),
  Schema.isPattern(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/),
  Schema.makeFilter((value: string) => Number.isFinite(Date.parse(value)) ? undefined : "Invalid native timestamp"))
export const Artifact = Schema.Struct({
  id: ID, name: Text, size_in_bytes: Count, expired: Schema.Boolean,
  created_at: Schema.optionalKey(Time), updated_at: Schema.optionalKey(Time), expires_at: Schema.optionalKey(Schema.NullOr(Time)),
  digest: Schema.optionalKey(Schema.NullOr(Schema.String.check(Schema.isPattern(/^sha256:[a-f0-9]{64}$/i)))),
  workflow_run: Schema.Struct({ id: ID, repository_id: ID, head_repository_id: Schema.optionalKey(ID),
    head_branch: Schema.optionalKey(Schema.NullOr(Text)), head_sha: Schema.optionalKey(Text) }),
})
export const GitHubJob = Schema.Struct({ id: ID, run_id: ID, run_attempt: Positive, name: Text })
export const GitHubAttempt = Schema.Struct({ id: ID, run_attempt: Positive, repository: Schema.Struct({ id: ID }) })
export const GitLabFile = Schema.Struct({ file_type: Text, size: Count, filename: Text, file_format: Schema.optionalKey(Schema.NullOr(Text)) })
const EmptyArtifactFile = Schema.Struct({}).annotate({ parseOptions: { onExcessProperty: "error" } })
export const GitLabJob = Schema.Struct({
  id: ID, name: Text, status: Schema.NullOr(Text), pipeline: Schema.Struct({ id: ID, project_id: ID }),
  artifacts: Schema.Array(GitLabFile).check(Schema.isMaxLength(1000)),
  artifacts_file: Schema.optionalKey(Schema.NullOr(Schema.Union([Schema.Struct({ filename: Text, size: Count }), EmptyArtifactFile]))),
  artifacts_expire_at: Schema.optionalKey(Schema.NullOr(Time)), erased_at: Schema.optionalKey(Schema.NullOr(Time)),
})

export function error(binding: Actions.Binding, kind: Actions.ErrorKind, message: string) {
  return new ActionsError({ kind, message, bindingID: binding.id, provider: binding.provider.kind,
    disposition: kind === "invalid_input" || kind === "capability_unavailable" ? "definitely_unsent" : "unknown" })
}

export function checked<A>(binding: Actions.Binding, body: () => A) {
  return Effect.try({ try: body, catch: (cause) => cause instanceof ActionsError ? cause
    : error(binding, "transport_failed", "CI output metadata could not be interpreted safely") })
}

export function decode<A>(binding: Actions.Binding, schema: Schema.Decoder<A>, data: unknown): A {
  const decoded = Schema.decodeUnknownOption(schema)(data)
  if (Option.isNone(decoded)) throw error(binding, "transport_failed", "Provider returned invalid native CI output metadata")
  return decoded.value
}

export function id(binding: Actions.Binding, value: string) {
  if (typeof value !== "string" || !/^[1-9]\d{0,127}$/.test(value))
    throw error(binding, "invalid_input", "CI output target ID must be a canonical positive decimal")
  return value
}

export function root(binding: Actions.Binding) {
  return `${binding.provider.kind === "github" ? "repositories" : "projects"}/${id(binding, binding.projectID)}`
}

export function selection(binding: Actions.Binding, input: object, schema: Schema.Top, fields: readonly string[]) {
  if (Option.isNone(Schema.decodeUnknownOption(Schema.toType(schema))(input)) || Object.keys(input).some((key) => !fields.includes(key)))
    throw error(binding, "invalid_input", "CI output selection contains invalid or unsupported fields")
}

export function filePath(binding: Actions.Binding, value: string) {
  if (!value || value.length > 4096 || /[\\%?#{}:\x00-\x1f\x7f]/.test(value) ||
    value.split("/").some((part) => !part || part === "." || part === ".."))
    throw error(binding, "invalid_input", "Artifact file path must be an exact archive-relative native path")
  return value.split("/").map(encodeURIComponent).join("/")
}

export const get = Effect.fn("ActionsOutput.get")(function* (transport: ActionsContract.Transport, binding: Actions.Binding, path: string, query?: ActionsContract.Request["query"]) {
  const response = yield* transport.request(binding, { method: "GET", path, ...(query ? { query } : {}) })
  if (response.status !== 200) return yield* ActionsResponse.failure(binding.provider, 1, Buffer.alloc(0), response.status, { ...response.headers })
  yield* checked(binding, () => {
    if (Buffer.byteLength(JSON.stringify(response.data)) > 2 * 1024 * 1024)
      throw error(binding, "metadata_truncated", "CI output metadata capture limit exceeded")
  })
  return response
})

export const project = Effect.fn("ActionsOutput.project")(function* (transport: ActionsContract.Transport, binding: Actions.Binding) {
  const path = yield* checked(binding, () => root(binding))
  const response = yield* get(transport, binding, path)
  yield* checked(binding, () => {
    if (String(decode(binding, Schema.Struct({ id: ID }), response.data).id) !== binding.projectID)
      throw error(binding, "binding_stale", "CI output project identity differs from the immutable binding")
  })
  return path
})

export const run = Effect.fn("ActionsOutput.run")(function* (reader: ActionsContract.ReadAdapter, binding: Actions.Binding, runID: string) {
  yield* checked(binding, () => id(binding, runID))
  const value = yield* reader.run(binding, runID)
  return yield* checked(binding, () => {
    if (Buffer.byteLength(JSON.stringify(value)) > 2 * 1024 * 1024)
      throw error(binding, "metadata_truncated", "CI output run metadata capture limit exceeded")
    const run = decode(binding, Actions.Run, value)
    if (run.attempt !== undefined && (!Number.isSafeInteger(run.attempt) || run.attempt < 1))
      throw error(binding, "transport_failed", "CI output run metadata returned an invalid attempt")
    if (run.id !== runID || run.bindingID !== binding.id || (run.repositoryID !== undefined && run.repositoryID !== binding.projectID))
      throw error(binding, "binding_stale", "CI output run does not belong to this binding and run selection")
    return run
  })
})

export function pagination(binding: Actions.Binding, request: ActionsContract.Request, scope: string,
  filters: Readonly<Record<string, unknown>>, response: ActionsContract.Response, page: number, count: number, limit: number, nativeTotal?: number) {
  const next = ActionsCursor.next(response.headers)
  const headerTotal = ActionsCursor.total(response.headers)
  const total = nativeTotal ?? headerTotal
  const fail = () => error(binding, "transport_failed", "Provider returned invalid CI output pagination metadata")
  if (count > limit || (next !== undefined && (next !== page + 1 || count === 0)) ||
    (nativeTotal !== undefined && headerTotal !== undefined && nativeTotal !== headerTotal)) throw fail()
  if (response.headers.link !== undefined) {
    const origin = binding.provider.apiOrigin.replace(/\/api\/v4\/?$/, "")
    const base = binding.provider.kind === "gitlab" ? `${origin}/api/v4` : origin
    const expected = new URL(`${base}/${request.path}`)
    response.headers.link.split(",").forEach((part) => {
      const match = /^\s*<([^>]+)>;\s*rel="?(next|prev|first|last)"?\s*$/.exec(part)
      const url = match && URL.parse(match[1])
      if (!url || url.origin !== expected.origin || url.pathname !== expected.pathname || url.username || url.password || url.hash) throw fail()
      const value = url.searchParams.get("page")
      if (!value || !/^[1-9]\d*$/.test(value) || Number(value) > 100_000) throw fail()
      const wanted = { ...request.query, page: Number(value) }
      if (Array.from(url.searchParams).length !== Object.keys(wanted).length ||
        Object.entries(wanted).some(([key, value]) => url.searchParams.get(key) !== String(value))) throw fail()
    })
    if (ActionsCursor.next({ link: response.headers.link }) !== next) throw fail()
  }
  if (total !== undefined && (total < (page - 1) * limit + count ||
    (next === undefined && total > page * limit) || (next !== undefined && total <= page * limit))) throw fail()
  if (next === undefined && total === undefined && count === limit && response.headers.link === undefined && response.headers["x-next-page"] === undefined) throw fail()
  return { ...(next === undefined ? {} : { next: ActionsCursor.encode(binding, scope, filters, next) }),
    ...(total === undefined ? {} : { total }), capturedAt: Date.now() }
}

export function gitlabOwner(binding: Actions.Binding, job: typeof GitLabJob.Type, jobID?: string, runID?: string) {
  if (String(job.pipeline.project_id) !== binding.projectID || (jobID !== undefined && String(job.id) !== jobID) ||
    (runID !== undefined && String(job.pipeline.id) !== runID))
    throw error(binding, "binding_stale", "GitLab artifact job does not belong to the selected project, pipeline and job")
}

export function artifactOwner(binding: Actions.Binding, artifact: typeof Artifact.Type, artifactID?: string, runID?: string) {
  if (String(artifact.workflow_run.repository_id) !== binding.projectID || (artifactID !== undefined && String(artifact.id) !== artifactID) ||
    (runID !== undefined && String(artifact.workflow_run.id) !== runID))
    throw error(binding, "binding_stale", "GitHub artifact does not belong to the selected repository, run and artifact")
}

export function gitlabState(job: typeof GitLabJob.Type) {
  if (job.erased_at) return "erased"
  if (job.artifacts_expire_at && Date.parse(job.artifacts_expire_at) <= Date.now()) return "expired"
  if (gitlabArchive(job)) return "available"
  return "unavailable"
}

export function gitlabArchive(job: typeof GitLabJob.Type) {
  const file = job.artifacts_file
  if (file && "filename" in file && typeof file.filename === "string" && "size" in file && typeof file.size === "number" && file.filename)
    return { filename: file.filename, size: file.size }
  const artifact = job.artifacts.find((file) => file.file_type === "archive" && !!file.filename)
  return artifact && { filename: artifact.filename, size: artifact.size }
}
