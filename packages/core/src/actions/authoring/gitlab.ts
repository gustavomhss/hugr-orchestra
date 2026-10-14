import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsContract } from "../contract"
import { ActionsGitLabNative } from "../gitlab/native"
import { Branch, Review, Version, Write, branch, bytes, decode, error, native, sourcePath } from "./input"
import type { Services } from "./input"
import { absent, actor, before, current, get, guard, reviewURL, written } from "./remote"
import type { Plan } from "./remote"

const Ref = Schema.Struct({ name: Schema.NonEmptyString, commit: Schema.Struct({ id: ActionsGitLabNative.SHA }) })
const File = Schema.Struct({ file_path: Schema.NonEmptyString, branch: Schema.NonEmptyString })
const Merge = Schema.Struct({
  id: ActionsGitLabNative.ID, iid: ActionsGitLabNative.ID, project_id: ActionsGitLabNative.ID,
  source_project_id: ActionsGitLabNative.ID, target_project_id: ActionsGitLabNative.ID,
  source_branch: Schema.NonEmptyString, target_branch: Schema.NonEmptyString, sha: ActionsGitLabNative.SHA,
  title: Schema.NonEmptyString, description: Schema.NullOr(Schema.String), state: Schema.Literal("opened"), web_url: Schema.NonEmptyString,
})

export const plan = Effect.fn("ActionsAuthoring.gitlab")(function* (
  services: Services, binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json,
): Effect.fn.Return<Plan, import("../error").ActionsError> {
  const command = yield* guard(binding, () => {
    const value = intent.kind === "source.branch" ? decode(binding, Branch, payload)
      : intent.kind === "source.write" ? decode(binding, Write, payload) : decode(binding, Review, payload)
    if (value.provider !== "gitlab") throw error(binding, "invalid_input", "Source command provider differs from the bound project")
    if ("text" in value) bytes(value.text)
    return value
  })
  const path = yield* guard(binding, () => sourcePath(binding, intent.target.path))
  const root = yield* guard(binding, () => ActionsGitLabNative.projectPath(binding))
  const project = yield* before(binding, ActionsGitLabNative.make(services.transport).project(binding))
  yield* actor(services, binding)
  if (project.archived === true || project.repository_access_level === "disabled")
    return yield* error(binding, "permission_denied", "GitLab project metadata denies source writes")
  // Missing role/scope evidence remains unknown; native authorization decides this explicit write.
  // This is an explicit repository-file proposal, not a change to the project's CI config slot.
  const ref = yield* head(services, binding, root, intent.target.ref ?? "")
  if (ref.toLowerCase() !== intent.expected?.commit?.toLowerCase())
    return yield* error(binding, "source_conflict", "GitLab source branch moved after admission")
  if (intent.kind !== "source.write" && intent.expected?.sourceVersion !== undefined) yield* current(services, binding, intent)
  if ("branch" in command) {
    if (command.branch !== intent.target.resourceID)
      return yield* error(binding, "invalid_input", "New source branch differs from admission")
    if (intent.expected?.sourceVersion === undefined)
      yield* absent(services, binding, `${root}/repository/files/${encodeURIComponent(path)}`, ref)
    return {
      request: { method: "POST", path: `${root}/repository/branches`, body: { branch: command.branch, ref } }, status: 201,
      acknowledge: (response) => guard(binding, () => {
        const value = decode(binding, Ref, response.data, true)
        if (value.name !== command.branch || value.commit.id.toLowerCase() !== ref.toLowerCase())
          throw error(binding, "outcome_unknown", "GitLab did not prove the exact new branch and base commit", "unknown")
        return { acknowledgement: { resourceID: command.branch } }
      }),
    }
  }
  if ("mode" in command) {
    if (command.mode === "update" && !intent.expected?.sourceVersion || command.mode === "create" && intent.expected?.sourceVersion !== undefined)
      return yield* error(binding, "invalid_input", "Source create/update mode conflicts with its file precondition")
    const previous = command.mode === "update" ? yield* current(services, binding, intent) : undefined
    if (previous?.text === command.text) return yield* error(binding, "invalid_input", "Source content is unchanged; no write was sent")
    const fileVersion = previous ? yield* guard(binding, () => decode(binding, Schema.fromJsonString(Version), previous.version)) : undefined
    return {
      request: { method: command.mode === "create" ? "POST" : "PUT", path: `${root}/repository/files/${encodeURIComponent(path)}`, body: {
        branch: intent.target.ref ?? "", commit_message: command.message, content: command.text,
        ...(fileVersion ? { last_commit_id: fileVersion.last_commit_id } : {}),
      } }, status: command.mode === "create" ? 201 : 200,
      acknowledge: (response) => Effect.gen(function* () {
        const value = yield* guard(binding, () => decode(binding, File, response.data, true))
        if (value.file_path !== path || value.branch !== intent.target.ref)
          return yield* error(binding, "outcome_unknown", "GitLab did not prove the written file and branch", "unknown")
        return yield* written(services, binding, intent, command.text)
      }),
    }
  }
  const base = yield* guard(binding, () => branch(binding, intent.target.resourceID ?? project.default_branch ?? ""))
  if (base === intent.target.ref) return yield* error(binding, "invalid_input", "Review head and base must differ")
  yield* head(services, binding, root, base)
  return {
    request: { method: "POST", path: `${root}/merge_requests`, body: {
      source_branch: intent.target.ref ?? "", target_branch: base, title: command.title, description: command.text,
    } }, status: 201,
    acknowledge: (response) => guard(binding, () => {
      const value = decode(binding, Merge, response.data, true)
      if (String(value.project_id) !== binding.projectID || String(value.source_project_id) !== binding.projectID || String(value.target_project_id) !== binding.projectID ||
        value.source_branch !== intent.target.ref || value.target_branch !== base || value.sha.toLowerCase() !== ref.toLowerCase() ||
        value.title !== command.title || (value.description ?? "") !== command.text)
        throw error(binding, "outcome_unknown", "GitLab did not prove the exact same-project review request", "unknown")
      const id = String(value.iid)
      return { acknowledgement: { resourceID: id }, output: { kind: "sourceReview" as const, id,
        url: reviewURL(binding, value.web_url, `/${project.path_with_namespace}/-/merge_requests/${id}`) } }
    }),
  }
})

const head = Effect.fn("ActionsAuthoring.gitlabHead")(function* (services: Services, binding: Actions.Binding, root: string, name: string) {
  yield* guard(binding, () => branch(binding, name))
  const response = yield* get(services, binding, `${root}/repository/branches/${encodeURIComponent(name)}`)
  const value = yield* guard(binding, () => native(binding, Ref, response.data))
  if (value.name !== name) return yield* error(binding, "source_conflict", "GitLab branch identity differs from admission")
  return value.commit.id
})
