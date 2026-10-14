export * as ActionsEnvironments from "./environments"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsContract } from "../contract"
import { ActionsCursor } from "../cursor"
import { ActionsConfigCommon } from "./config-common"
import { ActionsEnvironmentSchema } from "./config-environment-schema"
import { ActionsEnvironmentGitHub } from "./config-environment-github"
import { ActionsEnvironmentGitLab } from "./config-environment-gitlab"
import { ActionsDeploymentReview } from "./config-deployment-review"
import { ActionsEnvironmentReviewers } from "./config-environment-reviewers"

const C = ActionsConfigCommon
const S = ActionsEnvironmentSchema

export function make(services: ActionsConfigCommon.Services): ActionsContract.ResourceDomain {
  return {
    list: Effect.fn("ActionsEnvironments.list")(function* (binding: Actions.Binding, input: Actions.ResourceListInput) {
      const frozen = yield* C.guard(binding, () => {
        const selected = C.selection(binding, input, "environments", ["resourceID", "runID", "scope"])
        if (selected.scope !== undefined && selected.scope !== (binding.provider.kind === "github" ? "Repository" : "Project"))
          throw C.fail(binding, "invalid_input", "Environment list scope must match the native project scope")
        return selected
      })
      const project = yield* C.project(services, binding)
      if (frozen.runID !== undefined) {
        if (frozen.cursor !== undefined || frozen.limit !== undefined) return yield* C.fail(binding, "invalid_input", "Pending deployment review uses a bounded native snapshot, not list pagination")
        return yield* ActionsDeploymentReview.list(services, binding, frozen.runID, frozen.resourceID)
      }
      const selected = yield* C.guard(binding, () => C.page(binding, frozen))
      const response = yield* C.get(services, binding, { method: "GET", path: `${project.path}/environments`,
        query: { page: selected.number, per_page: selected.limit,
          ...(binding.provider.kind === "gitlab" && frozen.resourceID !== undefined ? { name: frozen.resourceID } : {}) } })
      if (binding.provider.kind === "github") {
        const native = yield* C.guard(binding, () => C.decode(binding, Schema.Struct({ total_count: Schema.Int,
          environments: Schema.Array(S.GitHub) }), response.data, true))
        const items = yield* Effect.forEach(native.environments.filter((item) => frozen.resourceID === undefined || item.name === frozen.resourceID),
          (environment) => Effect.gen(function* () {
            const refs = yield* ActionsEnvironmentGitHub.policies(services, binding, project.path, environment)
            return ActionsEnvironmentGitHub.resource(binding, environment, refs)
          }), { concurrency: 1 })
        return yield* C.guard(binding, () => ({ items, ...C.pagination(binding, selected, response, native.environments.length, native.total_count) }))
      }
      const native = yield* C.guard(binding, () => C.decode(binding, Schema.Array(S.GitLab), response.data, true))
      const protectedEnvironments = yield* ActionsEnvironmentGitLab.protections(services, binding, project.path)
      const items = yield* Effect.forEach(native.filter((environment) => frozen.resourceID === undefined || environment.name === frozen.resourceID), (environment) => Effect.gen(function* () {
        const item = ActionsEnvironmentGitLab.resource(binding, environment, protectedEnvironments, project.native)
        if (frozen.resourceID === undefined) return item
        const reviewers = yield* ActionsEnvironmentReviewers.read(services, binding, protectedEnvironments, environment.name)
        return { ...item, data: { ...C.decode(binding, Schema.Record(Schema.String, Schema.Json), item.data), reviewersReadOnly: reviewers.reviewersReadOnly,
          ...(typeof reviewers.reviewers === "string" ? { reviewers: reviewers.reviewers } : {}) } }
      }), { concurrency: 1 })
      return yield* C.guard(binding, () => ({ items,
        ...C.pagination(binding, selected, response, native.length, ActionsCursor.total(response.headers)) }))
    }),
    perform: Effect.fn("ActionsEnvironments.perform")(function* (binding: Actions.Binding, intent: Actions.OperationIntent, payload: ActionsContract.Json) {
      if (intent.kind === "deployment.review") return yield* ActionsDeploymentReview.perform(services, binding, intent, payload)
      const frozen = yield* C.guard(binding, () => {
        const capture = C.capture(binding, intent, "environments")
        const input = C.decode(binding, intent.kind === "resource.delete" ? S.Delete : S.Form, structuredClone(payload))
        if (input.provider !== binding.provider.kind || input.name !== intent.target.resourceID)
          throw C.fail(binding, "intent_conflict", "Environment provider or name changed after admission")
        return { ...capture, input }
      })
      const project = yield* C.project(services, frozen.binding, true, true)
      return frozen.binding.provider.kind === "github"
        ? yield* ActionsEnvironmentGitHub.write(services, frozen.binding, frozen.intent, frozen.input, project.path)
        : yield* ActionsEnvironmentGitLab.write(services, frozen.binding, frozen.intent, frozen.input, project.path, project.native)
    }),
  }
}
