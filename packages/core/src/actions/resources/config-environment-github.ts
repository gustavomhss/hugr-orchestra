export * as ActionsEnvironmentGitHub from "./config-environment-github"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsContract } from "../contract"
import { ActionsConfigCommon } from "./config-common"
import { ActionsEnvironmentSchema } from "./config-environment-schema"

const C = ActionsConfigCommon
const S = ActionsEnvironmentSchema

export const policies = Effect.fn("ActionsEnvironments.githubPolicies")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding, root: string,
  environment: typeof S.GitHub.Type) {
  if (!environment.deployment_branch_policy?.custom_branch_policies) return []
  const response = yield* C.get(services, binding, { method: "GET", path: `${root}/environments/${encodeURIComponent(environment.name)}/deployment-branch-policies`,
    query: { per_page: 100, page: 1 } })
  return yield* C.guard(binding, () => {
    const value = C.decode(binding, S.BranchPolicies, response.data, true)
    if (value.branch_policies.length !== value.total_count || response.headers.link?.includes('rel="next"') || response.headers["x-next-page"])
      throw C.fail(binding, "metadata_truncated", "Environment ref policies exceed the bounded configuration read")
    return value.branch_policies
  })
})

export function resource(binding: Actions.Binding, environment: typeof S.GitHub.Type, refs: readonly (typeof S.BranchPolicy.Type)[]): Actions.Resource {
  const reviewers = environment.protection_rules.find((rule) => rule.type === "required_reviewers")
  const names = (reviewers?.reviewers ?? []).map((reviewer) => reviewer.type === "User" ? reviewer.reviewer.login
    : reviewer.reviewer.slug === undefined ? undefined : `team:${reviewer.reviewer.slug}`)
  const metadata = { ...environment, refPolicies: refs }
  return { id: environment.name, bindingID: binding.id, kind: "environments", name: environment.name, scope: "Repository", owner: "Project",
    data: { ...metadata, nativeIdentity: C.identity(binding, environment.name, "Repository", String(environment.id)),
      resourceVersion: JSON.stringify(metadata), reviewers: names.filter((name) => name !== undefined).join(", "),
      reviewerIdentities: (reviewers?.reviewers ?? []).map((reviewer) => ({ type: reviewer.type, id: String(reviewer.reviewer.id),
        ...(reviewer.reviewer.login ? { login: reviewer.reviewer.login } : {}), ...(reviewer.reviewer.slug ? { slug: reviewer.reviewer.slug } : {}) })),
      ...(names.some((name) => name === undefined) ? { sourceUnresolved: "Native reviewer name was not returned; use reviewerIdentities" } : {}),
      refs: environment.deployment_branch_policy === null ? "*" : environment.deployment_branch_policy.protected_branches ? "Protected branches"
        : Array.from(new Set(refs.map((policy) => policy.name))).join(", "),
      timer: environment.protection_rules.find((rule) => rule.type === "wait_timer")?.wait_timer ?? 0,
      ...(reviewers?.prevent_self_review === undefined ? {} : { preventSelfReview: reviewers.prevent_self_review }),
      description: "Repository deployment environment" } }
}

export const write = Effect.fn("ActionsEnvironments.githubWrite")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding, intent: Actions.OperationIntent,
  input: typeof S.Form.Type | typeof S.Delete.Type, root: string) {
  if (intent.target.scope !== "Repository") return yield* C.fail(binding, "invalid_input", "GitHub environment scope must be Repository")
  const path = `${root}/environments/${encodeURIComponent(input.name)}`
  const response = yield* C.get(services, binding, { method: "GET", path }, true)
  if ((intent.kind === "resource.create") !== (response.status === 404)) return yield* C.fail(binding, "source_conflict", "Environment existence changed after admission")
  const native = response.status === 200 ? yield* C.guard(binding, () => C.decode(binding, S.GitHub, response.data, true)) : undefined
  if (native && native.name !== input.name) return yield* C.fail(binding, "source_conflict", "Native environment name changed after admission")
  const current = native ? yield* policies(services, binding, root, native) : []
  if (native) yield* C.guard(binding, () => C.version(binding, intent.expected, response, { ...native, refPolicies: current }))
  if (!native && intent.expected?.resourceVersion) return yield* C.fail(binding, "invalid_input", "A new environment has no existing resource version")
  if (intent.kind === "resource.delete") {
    yield* C.send(services, binding, { method: "DELETE", path }, [204])
    return { acknowledgement: { resourceID: input.name } }
  }
  if (!("reviewers" in input)) return yield* C.fail(binding, "invalid_input", "Environment update requires its mock form")
  if (input.description !== undefined || input.tier !== undefined) return yield* C.fail(binding, "capability_unavailable", "GitHub environments do not expose description or tier fields")
  const protectedOnly = input.refs === "Protected branches" && native?.deployment_branch_policy?.protected_branches === true
  const wanted = protectedOnly ? ["*"] : S.patterns(input.refs)
  if (!wanted.length || wanted.length > 8 || wanted.some((ref) => /[\s\x00-\x1f\x7f]/.test(ref)) || (wanted.includes("*") && wanted.length !== 1))
    return yield* C.fail(binding, "invalid_input", "Environment requires at most eight exact branch/tag patterns, or '*' alone")
  const required = yield* resolveReviewers(services, binding, root, input.reviewers)
  const desired = wanted[0] === "*" ? [] : wanted.flatMap((name) => [{ name, type: "branch" }, { name, type: "tag" }])
  const changes = desired.filter((policy) => !current.some((item) => item.name === policy.name && item.type === policy.type))
  const deleted = current.filter((policy) => !desired.some((item) => item.name === policy.name && item.type === policy.type))
  const currentTimer = native?.protection_rules.find((rule) => rule.type === "wait_timer")?.wait_timer
  const timer = input.timer ?? currentTimer
  if (current.length > 32) return yield* C.fail(binding, "metadata_truncated", "Environment policy mutation exceeds its bounded native phases")
  // Ref patterns require separate native endpoints. Validate the entire plan before
  // the first write; a later rejection explicitly reports partial application.
  yield* C.stages(services, binding, [
    { phase: "protection", statuses: [200], request: { method: "PUT", path, body: {
      // Do not request a paid timer feature merely to send its absent zero default.
      ...(timer !== undefined && (timer > 0 || currentTimer !== undefined) ? { wait_timer: timer } : {}),
      prevent_self_review: input.preventSelfReview, reviewers: required,
      deployment_branch_policy: protectedOnly ? { protected_branches: true, custom_branch_policies: false }
        : desired.length ? { protected_branches: false, custom_branch_policies: true } : null } } },
    ...deleted.map((policy) => ({ phase: `remove ref policy ${policy.id}`, statuses: [204], request: {
      method: "DELETE" as const, path: `${path}/deployment-branch-policies/${policy.id}` } })),
    ...changes.map((policy) => ({ phase: `add ${policy.type} ref policy`, statuses: [200, 201], request: {
      method: "POST" as const, path: `${path}/deployment-branch-policies`, body: policy } })),
  ])
  return { acknowledgement: { resourceID: input.name } }
})

const resolveReviewers = Effect.fn("ActionsEnvironments.githubReviewers")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding, root: string, names: string) {
  const reviewers = names.split(",").map((name) => name.trim()).filter(Boolean)
  if (reviewers.length > 6 || new Set(reviewers).size !== reviewers.length) return yield* C.fail(binding, "invalid_input", "GitHub supports up to six distinct environment reviewers")
  return yield* Effect.forEach(reviewers, (name) => Effect.gen(function* () {
    if (name.startsWith("team:")) {
      const slug = name.slice(5)
      if (!/^[A-Za-z0-9-]+$/.test(slug)) return yield* C.fail(binding, "source_unresolved", "Team reviewers require exact 'team:slug' identity")
      const response = yield* C.get(services, binding, { method: "GET", path: `${root}/teams`, query: { per_page: 100, page: 1 } })
      const teams = yield* C.guard(binding, () => C.decode(binding, Schema.Array(Schema.Struct({ id: C.ID, slug: C.Text })), response.data, true))
      const matches = teams.filter((team) => team.slug === slug)
      if (matches.length !== 1 || response.headers.link?.includes("next") || teams.length === 100 || !Number.isSafeInteger(Number(matches[0].id)))
        return yield* C.fail(binding, "source_unresolved", "Repository team list did not prove one exact reviewer identity")
      return { type: "Team", id: Number(matches[0].id) }
    }
    if (!/^[A-Za-z0-9-]+$/.test(name)) return yield* C.fail(binding, "source_unresolved", "User reviewers require an exact login, not a display name")
    const response = yield* C.get(services, binding, { method: "GET", path: `users/${encodeURIComponent(name)}` })
    const user = yield* C.guard(binding, () => C.decode(binding, Schema.Struct({ id: C.ID, login: C.Text }), response.data, true))
    if (user.login.toLowerCase() !== name.toLowerCase() || !Number.isSafeInteger(Number(user.id)))
      return yield* C.fail(binding, "source_unresolved", "Native user lookup did not prove the exact reviewer login and ID")
    const access = yield* C.get(services, binding, { method: "GET", path: `${root}/collaborators/${encodeURIComponent(user.login)}/permission` })
    const permission = yield* C.guard(binding, () => C.decode(binding, Schema.Struct({ permission: C.Text,
      user: Schema.Struct({ id: C.ID, login: C.Text }) }), access.data, true))
    if (String(permission.user.id) !== String(user.id) || permission.user.login.toLowerCase() !== user.login.toLowerCase() || !["read", "write", "admin"].includes(permission.permission))
      return yield* C.fail(binding, "source_unresolved", "Native repository lookup did not prove eligible reviewer access")
    return { type: "User", id: Number(user.id) }
  }), { concurrency: 1 })
})
