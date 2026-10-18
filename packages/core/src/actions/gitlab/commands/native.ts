export * as GitLabCommandNative from "./native"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsContract } from "../../contract"
import { ActionsGitLabNative } from "../native"
import { GitLabCommandShared } from "./shared"

export const Project = Schema.Struct({ ...ActionsGitLabNative.Project.fields,
  ci_pipeline_variables_minimum_override_role: Schema.optional(Schema.String),
  ci_restrict_pipeline_cancellation_role: Schema.optional(Schema.String), merge_pipelines_enabled: Schema.optional(Schema.Boolean),
})
export const Job = Schema.Struct({ ...ActionsGitLabNative.Job.fields,
  ref: Schema.String, commit: Schema.Struct({ id: ActionsGitLabNative.SHA }),
  pipeline: Schema.Struct({ id: ActionsGitLabNative.ID, project_id: ActionsGitLabNative.ID, sha: ActionsGitLabNative.SHA, ref: Schema.String }),
  archived: Schema.optional(Schema.Boolean), erased_at: Schema.optional(Schema.NullOr(Schema.String)),
  user: Schema.optional(Schema.NullOr(Schema.Struct({ username: Schema.String }))),
})
export const Ref = Schema.Struct({ name: Schema.NonEmptyString, commit: Schema.Struct({ id: ActionsGitLabNative.SHA }) })
export const MergeRequest = Schema.Struct({ id: ActionsGitLabNative.ID, iid: ActionsGitLabNative.ID, project_id: ActionsGitLabNative.ID,
  source_project_id: ActionsGitLabNative.ID, target_project_id: ActionsGitLabNative.ID, sha: ActionsGitLabNative.SHA,
  source_branch: Schema.NonEmptyString, state: Schema.String,
})

export function make(transport: ActionsContract.Transport) {
  const read = ActionsGitLabNative.make(transport)
  return { ...read,
    project: Effect.fn("ActionsGitLabCommands.project")(function* (binding: Actions.Binding) {
      const response = yield* read.get(binding, ActionsGitLabNative.projectPath(binding))
      return yield* ActionsGitLabNative.checked(binding, () => {
        const project = GitLabCommandShared.native(binding, Project, response.data)
        if (String(project.id) !== binding.projectID) throw GitLabCommandShared.error(binding, "binding_stale", "GitLab native project differs from the admitted project")
        return project
      })
    }),
    ref: Effect.fn("ActionsGitLabCommands.ref")(function* (binding: Actions.Binding, ref: string) {
      const response = yield* read.get(binding, `${ActionsGitLabNative.projectPath(binding)}/repository/branches/${encodeURIComponent(ref)}`)
        .pipe(Effect.catch((error) => error.kind === "not_found"
          ? read.get(binding, `${ActionsGitLabNative.projectPath(binding)}/repository/tags/${encodeURIComponent(ref)}`) : Effect.fail(error)))
      return yield* ActionsGitLabNative.checked(binding, () => {
        const result = GitLabCommandShared.native(binding, Ref, response.data)
        if (result.name !== ref) throw GitLabCommandShared.error(binding, "source_conflict", "GitLab native branch/tag ref differs from the admitted ref")
        return result.commit.id
      })
    }),
  }
}

export function role(binding: Actions.Binding, project: typeof Project.Type, minimum: number) {
  if (project.archived === true || project.jobs_enabled === false || project.builds_access_level === "disabled" || project.repository_access_level === "disabled")
    throw GitLabCommandShared.error(binding, "permission_denied", "GitLab native project is archived or execution is disabled")
  const levels = [project.permissions?.project_access, project.permissions?.group_access]
    .filter((value) => value !== undefined).map((value) => value?.access_level ?? 0)
  if (levels.some((value) => ![0, 5, 10, 15, 20, 30, 40, 50].includes(value)))
    throw GitLabCommandShared.error(binding, "capability_unavailable", "GitLab observed role is not a qualified native access level")
  const level = Math.max(0, ...levels)
  if (level >= minimum) return level
  if (levels.length !== 2) throw GitLabCommandShared.error(binding, "capability_unavailable", "GitLab effective project/group write role is not observed")
  throw GitLabCommandShared.error(binding, "permission_denied", "GitLab native project/group role denies this execution command")
}

export function variables(binding: Actions.Binding, project: typeof Project.Type, level: number, present: boolean) {
  if (!present) return
  const minimum = project.ci_pipeline_variables_minimum_override_role
  if (minimum === "no_one_allowed" || minimum === "owner" && level < 50 || minimum === "maintainer" && level < 40 || minimum === "developer" && level < 30)
    throw GitLabCommandShared.error(binding, "permission_denied", "GitLab native pipeline-variable override policy denies this command")
}

export function cancellation(binding: Actions.Binding, project: typeof Project.Type, level: number) {
  if (project.ci_restrict_pipeline_cancellation_role === "no_one" || project.ci_restrict_pipeline_cancellation_role === "maintainer" && level < 40)
    throw GitLabCommandShared.error(binding, "permission_denied", "GitLab native cancellation policy denies this command")
}
