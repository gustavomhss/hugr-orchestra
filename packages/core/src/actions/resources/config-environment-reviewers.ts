export * as ActionsEnvironmentReviewers from "./config-environment-reviewers"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsConfigCommon } from "./config-common"
import { ActionsEnvironmentGitLab } from "./config-environment-gitlab"
import { ActionsEnvironmentSchema } from "./config-environment-schema"

export const read = Effect.fn("ActionsEnvironmentReviewers.read")(function* (services: ActionsConfigCommon.Services,
  binding: Actions.Binding, policies: readonly (typeof ActionsEnvironmentSchema.Protected.Type)[], name: string) {
  const matching = policies.filter((policy) => ActionsEnvironmentGitLab.matches(policy.name, name))
  if (matching.some((policy) => policy.name.includes("*"))) return { reviewersReadOnly: true }
  const exact = matching.filter((policy) => policy.name === name)
  if (exact.length !== 1) return { reviewersReadOnly: true }
  const policy = exact[0]
  if (policy.required_approval_count !== undefined && policy.approval_rules === undefined && policy.required_approval_count !== 0)
    return { reviewersReadOnly: true }
  const rules = policy.approval_rules ?? []
  if (rules.length > 6 || rules.some((rule) => rule.user_id == null || rule.group_id != null || rule.access_level != null || rule.required_approvals !== 1))
    return { reviewersReadOnly: true }
  const ids = yield* ActionsConfigCommon.guard(binding, () => rules.map((rule) => ActionsConfigCommon.decode(binding, ActionsConfigCommon.ID, rule.user_id, true)))
  const usernames = yield* Effect.forEach(ids, (id) => Effect.gen(function* () {
    const response = yield* ActionsConfigCommon.get(services, binding, { method: "GET", path: `users/${encodeURIComponent(String(id))}` })
    const user = yield* ActionsConfigCommon.guard(binding, () => ActionsConfigCommon.decode(binding,
      Schema.Struct({ id: ActionsConfigCommon.ID, username: ActionsConfigCommon.Text }), response.data, true))
    if (String(user.id) !== String(id)) return yield* ActionsConfigCommon.fail(binding, "source_conflict", "GitLab reviewer lookup returned a different native ID")
    if (!/^[A-Za-z0-9_.-]+$/.test(user.username)) return yield* ActionsConfigCommon.fail(binding, "source_unresolved", "GitLab reviewer username cannot be represented by the configuration form")
    return user.username
  }), { concurrency: 1 })
  if (new Set(usernames).size !== usernames.length) return yield* ActionsConfigCommon.fail(binding, "source_unresolved", "GitLab reviewer usernames are not distinct")
  return { reviewers: usernames.join(","), reviewersReadOnly: false }
})
