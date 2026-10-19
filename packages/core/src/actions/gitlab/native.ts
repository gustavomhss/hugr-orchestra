export * as ActionsGitLabNative from "./native"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Option, Schema } from "effect"
import { ActionsContract } from "../contract"
import { ActionsCursor } from "../cursor"
import { ActionsError } from "../error"

// Native response contracts: https://docs.gitlab.com/api/projects/
// https://docs.gitlab.com/api/pipelines/ and https://docs.gitlab.com/api/jobs/
// https://docs.gitlab.com/api/repository_files/
export const ID = Schema.Union([
  Schema.String.check(Schema.isPattern(/^[1-9]\d*$/)),
  Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })),
])
export const SHA = Schema.String.check(Schema.isPattern(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i))
const nullableText = Schema.optional(Schema.NullOr(Schema.String))
const access = Schema.NullOr(Schema.Struct({ access_level: Schema.Int }))
export const Project = Schema.Struct({
  id: ID, path_with_namespace: Schema.NonEmptyString, name: Schema.NullOr(Schema.String),
  ci_config_path: nullableText, default_branch: nullableText,
  jobs_enabled: Schema.optional(Schema.Boolean), builds_access_level: Schema.optional(Schema.String),
  repository_access_level: Schema.optional(Schema.String), archived: Schema.optional(Schema.Boolean),
  permissions: Schema.optional(Schema.Struct({ project_access: Schema.optional(access), group_access: Schema.optional(access) })),
})
export const Pipeline = Schema.Struct({
  id: ID, iid: Schema.optional(ID), project_id: ID, sha: SHA, ref: Schema.NullOr(Schema.String), source: Schema.NonEmptyString, status: Schema.NullOr(Schema.NonEmptyString),
  name: nullableText, web_url: nullableText, created_at: nullableText, updated_at: nullableText,
  started_at: nullableText, finished_at: nullableText,
  duration: Schema.optional(Schema.NullOr(Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)))),
  user: Schema.optional(Schema.NullOr(Schema.Struct({ id: ID, username: Schema.NonEmptyString }))),
})
export const Job = Schema.Struct({
  id: ID, name: Schema.String, status: Schema.NullOr(Schema.NonEmptyString), stage: Schema.String, allow_failure: Schema.Boolean,
  pipeline: Schema.Struct({ id: ID, project_id: ID }),
  started_at: nullableText, finished_at: nullableText, retried: Schema.optional(Schema.Boolean),
  runner: Schema.optional(Schema.NullOr(Schema.Struct({ id: ID, description: nullableText }))),
})
export const Bridge = Schema.Struct({
  ...Job.fields,
  downstream_pipeline: Schema.NullOr(Schema.Struct({ id: ID, project_id: Schema.optional(ID) })),
})
export const Commit = Schema.Struct({ id: SHA })
export const File = Schema.Struct({
  file_path: Schema.NonEmptyString, encoding: Schema.Literal("base64"), content: Schema.String,
  blob_id: SHA, commit_id: SHA, last_commit_id: SHA,
})
const Metadata = Schema.Struct({ version: Schema.optional(Schema.NullOr(Schema.String)) })
export const VersionObservation = Schema.Struct({
  version: Schema.NonEmptyString, hostname: Schema.NonEmptyString, apiOrigin: Schema.NonEmptyString, observedAt: Schema.Number,
})

export function make(transport: ActionsContract.Transport) {
  const get = Effect.fn("ActionsGitLabRead.get")(function* (binding: Actions.Binding, path: string, query?: ActionsContract.Request["query"]) {
    yield* checked(binding, () => projectPath(binding))
    const response = yield* transport.request(binding, { method: "GET", path, ...(query ? { query } : {}) })
    if (response.status !== 200) return yield* error(binding, "transport_failed", "GitLab read did not return HTTP 200")
    return response
  })
  const project = Effect.fn("ActionsGitLabRead.project")(function* (binding: Actions.Binding) {
    const path = yield* checked(binding, () => projectPath(binding))
    const response = yield* get(binding, path)
    return yield* checked(binding, () => {
      const value = decode(binding, Project, response.data, "project")
      if (String(value.id) !== binding.projectID) throw error(binding, "binding_stale", "GitLab project identity differs from the bound native project")
      return value
    })
  })
  const pipeline = Effect.fn("ActionsGitLabRead.pipeline")(function* (binding: Actions.Binding, id: string) {
    const path = yield* checked(binding, () => `${projectPath(binding)}/pipelines/${nativeID(binding, id, "pipeline ID")}`)
    const response = yield* get(binding, path)
    return yield* checked(binding, () => {
      const value = decode(binding, Pipeline, response.data, "pipeline")
      requirePipeline(binding, value, id)
      return value
    })
  })
  const metadata = Effect.fn("ActionsGitLabRead.metadata")(function* (binding: Actions.Binding) {
    const target = yield* checked(binding, () => {
      const host = URL.parse(`https://${binding.provider.hostname}`)
      const origin = URL.parse(binding.provider.apiOrigin)
      if (!host || !origin || host.host !== binding.provider.hostname || host.pathname !== "/" || host.username || host.password || host.search || host.hash ||
        origin.protocol !== "https:" || origin.host !== host.host || origin.username || origin.password || origin.search || origin.hash ||
        (binding.provider.apiOrigin !== host.origin && binding.provider.apiOrigin !== `${host.origin}/api/v4`))
        throw error(binding, "host_mismatch", "GitLab metadata requires the exact canonical bound HTTPS host and API origin")
      return { hostname: binding.provider.hostname, apiOrigin: binding.provider.apiOrigin }
    })
    // Authenticated W1 transport supplies this observation, never client Provider.version.
    // https://docs.gitlab.com/api/metadata/
    const response = yield* get(binding, "metadata")
    return yield* checked(binding, () => {
      const value = decode(binding, Metadata, response.data, "instance metadata")
      if (!value.version) throw error(binding, "capability_unavailable", "GitLab metadata did not establish a native instance version")
      return VersionObservation.make({ ...target, version: value.version, observedAt: Date.now() })
    })
  })
  return { get, project, pipeline, metadata }
}

export function requireVersion(binding: Actions.Binding, observation: typeof VersionObservation.Type, minimum: readonly number[], feature: string) {
  if (observation.hostname !== binding.provider.hostname || observation.apiOrigin !== binding.provider.apiOrigin)
    throw error(binding, "host_mismatch", "GitLab version observation belongs to a different bound host or API origin")
  const version = /^(\d+)\.(\d+)\.(\d+)(?:-(?:ee|ce))?$/.exec(observation.version)
  if (!version || !version.slice(1).every((part) => Number.isSafeInteger(Number(part))) ||
    Number(version[1]) < minimum[0] || (Number(version[1]) === minimum[0] && Number(version[2]) < minimum[1]))
    throw error(binding, "capability_unavailable", `GitLab ${feature} requires native metadata proving GitLab ${minimum.join(".")} or newer`)
}

export function checked<A>(binding: Actions.Binding, body: () => A) {
  return Effect.try({ try: body, catch: (cause) => cause instanceof ActionsError ? cause
    : error(binding, "transport_failed", "GitLab read metadata could not be interpreted safely") })
}

export function decode<S extends Schema.Decoder<unknown>>(binding: Actions.Binding, schema: S, data: unknown, label: string): S["Type"] {
  const result = Schema.decodeUnknownOption(schema)(data)
  if (Option.isNone(result)) throw error(binding, "transport_failed", `GitLab returned invalid native ${label} metadata`)
  return result.value
}

export function error(binding: Actions.Binding, kind: Actions.ErrorKind, message: string) {
  return new ActionsError({ kind, message, bindingID: binding.id, provider: "gitlab",
    disposition: kind === "invalid_input" || kind === "capability_unavailable" ? "definitely_unsent" : "unknown" })
}

export function projectPath(binding: Actions.Binding) {
  if (binding.provider.kind !== "gitlab") throw error(binding, "invalid_input", "GitLab read requires a GitLab binding")
  return `projects/${nativeID(binding, binding.projectID, "project ID")}`
}

export function nativeID(binding: Actions.Binding, id: string, label: string) {
  if (typeof id !== "string" || !/^[1-9]\d*$/.test(id)) throw error(binding, "invalid_input", `GitLab ${label} must be a positive native numeric string`)
  return id
}

// One project pipeline/config slot, NOT a GitHub-style definition ID or a historical file path.
export function workflowID(binding: Actions.Binding) { return `gitlab:project:${binding.projectID}:pipeline` }

export function configPath(project: typeof Project.Type) {
  // Empty/null explicitly mean unset. An omitted field means it was not observed.
  return project.ci_config_path === null || project.ci_config_path === "" ? ".gitlab-ci.yml" : project.ci_config_path
}

export function localPath(path: string) {
  return !!path && !/[:@\x00-\x1f\x7f\\]/.test(path) && !path.startsWith("/") &&
    !path.split("/").some((part) => !part || part === "." || part === "..") && !/[?*{}$]/.test(path)
}

export function requirePipeline(binding: Actions.Binding, pipeline: typeof Pipeline.Type, id?: string) {
  if (String(pipeline.project_id) !== binding.projectID || (id !== undefined && String(pipeline.id) !== id))
    throw error(binding, "binding_stale", "GitLab pipeline does not belong to the requested native project and pipeline")
}

export function conclusion(status: string | null) {
  return status !== null && ["success", "failed", "canceled", "skipped"].includes(status) ? status : undefined
}

export function selection(binding: Actions.Binding, input: object, fields: readonly string[], schema: Schema.Top) {
  if (typeof input !== "object" || input === null || Option.isNone(Schema.decodeUnknownOption(Schema.toType(schema))(input)))
    throw error(binding, "invalid_input", "GitLab read selection does not match the Actions input schema")
  const unsupported = Object.keys(input).find((key) => !fields.includes(key))
  if (unsupported) throw error(binding, "invalid_input", `GitLab read filter '${unsupported}' is not represented by this Actions contract`)
}

export function pagination(binding: Actions.Binding, scope: string, filters: Readonly<Record<string, unknown>>, headers: Readonly<Record<string, string>>, page: number) {
  const next = ActionsCursor.next(headers)
  if (next !== undefined && next <= page) throw error(binding, "transport_failed", "GitLab pagination did not advance")
  const total = ActionsCursor.total(headers)
  return { ...(next === undefined ? {} : { next: ActionsCursor.encode(binding, scope, filters, next) }),
    ...(total === undefined ? {} : { total }) }
}
