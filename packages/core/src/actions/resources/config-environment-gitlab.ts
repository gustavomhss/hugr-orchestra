export * as ActionsEnvironmentGitLab from "./config-environment-gitlab"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsContract } from "../contract"
import { ActionsConfigCommon } from "./config-common"
import { ActionsEnvironmentSchema } from "./config-environment-schema"

const C = ActionsConfigCommon
const S = ActionsEnvironmentSchema

export const protections = Effect.fn("ActionsEnvironments.gitlabProtections")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding, root: string) {
  const response = yield* C.get(services, binding, { method: "GET", path: `${root}/protected_environments`, query: { page: 1, per_page: 100 } })
  return yield* C.guard(binding, () => {
    const native = C.decode(binding, Schema.Array(S.Protected), response.data, true)
    if (response.headers["x-next-page"] || response.headers.link?.includes("next") || native.length === 100)
      throw C.fail(binding, "metadata_truncated", "Protected environments exceed the bounded policy read")
    return native
  })
})

export function matches(pattern: string, name: string) {
  return new RegExp(`^${pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`).test(name)
}

export function resource(binding: Actions.Binding, environment: typeof S.GitLab.Type, protectedEnvironments: readonly (typeof S.Protected.Type)[],
  project: typeof C.Project.Type): Actions.Resource {
  const policies = protectedEnvironments.filter((item) => matches(item.name, environment.name))
  const metadata = { ...environment, protectedPolicies: policies }
  return { id: environment.name, name: environment.name, bindingID: binding.id, kind: "environments", scope: "Project", owner: "Project",
    status: environment.state, data: { ...metadata, nativeIdentity: C.identity(binding, environment.name, "Project", String(environment.id)),
      resourceVersion: JSON.stringify(metadata), ...(environment.description === undefined ? {} : { description: environment.description }),
      reviewerIdentities: policies.flatMap((policy) => (policy.approval_rules ?? []).map((rule) => ({ ...rule, policyName: policy.name }))),
      sourceUnresolved: "GitLab reviewer rules identify users, groups and roles by native ID; display names require lookup",
      refs: { state: "source_unresolved", source: "CI configuration rules", reason: "Protected environments do not enforce branch or tag patterns" },
      ...(project.allow_pipeline_trigger_approve_deployment === undefined ? {} : {
        preventSelfReview: !project.allow_pipeline_trigger_approve_deployment, preventSelfReviewScope: "Project",
        preventSelfReviewSource: "allow_pipeline_trigger_approve_deployment" }),
      policyScope: "Project protected environments", timer: { state: "unavailable", reason: "GitLab has no native environment wait timer" } } }
}

export const find = Effect.fn("ActionsEnvironments.gitlabFind")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding, root: string, name: string) {
  const response = yield* C.get(services, binding, { method: "GET", path: `${root}/environments`, query: { name, page: 1, per_page: 100 } })
  const native = yield* C.guard(binding, () => C.decode(binding, Schema.Array(S.GitLab), response.data, true))
  if (native.length > 1 || native.some((item) => item.name !== name) || response.headers["x-next-page"] || response.headers.link?.includes("next"))
    return yield* C.fail(binding, "source_conflict", "GitLab did not prove one exact environment name")
  return native[0]
})

export const write = Effect.fn("ActionsEnvironments.gitlabWrite")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding, intent: Actions.OperationIntent,
  input: typeof S.Form.Type | typeof S.Delete.Type, root: string, project: typeof C.Project.Type) {
  if (intent.target.scope !== "Project") return yield* C.fail(binding, "invalid_input", "GitLab environment scope must be Project")
  const environment = yield* find(services, binding, root, input.name)
  if ((intent.kind === "resource.create") !== (environment === undefined)) return yield* C.fail(binding, "source_conflict", "Environment existence changed after admission")
  const protectedEnvironments = yield* protections(services, binding, root)
  const matching = protectedEnvironments.filter((policy) => matches(policy.name, input.name))
  if (environment) yield* C.guard(binding, () => C.version(binding, intent.expected, { status: 200, headers: {}, data: null },
    { ...environment, protectedPolicies: matching }))
  if (!environment && intent.expected?.resourceVersion) return yield* C.fail(binding, "invalid_input", "A new environment has no existing resource version")
  if (intent.kind === "resource.delete") {
    if (!environment || environment.state !== "stopped") return yield* C.fail(binding, "capability_unavailable", "GitLab environment must already be stopped before deletion")
    yield* C.send(services, binding, { method: "DELETE", path: `${root}/environments/${environment.id}` }, [204])
    return { acknowledgement: { resourceID: input.name } }
  }
  if (!("reviewers" in input)) return yield* C.fail(binding, "invalid_input", "Environment update requires its mock form")
  if (input.timer !== undefined) return yield* C.fail(binding, "capability_unavailable", "GitLab has no native environment timer field")
  if (input.refs !== "*") return yield* C.fail(binding, "capability_unavailable", "Field 'refs' requires a reviewed CI rules source change; protected environments cannot enforce it")
  if (project.allow_pipeline_trigger_approve_deployment === undefined || input.preventSelfReview !== !project.allow_pipeline_trigger_approve_deployment)
    return yield* C.fail(binding, "capability_unavailable", "Field 'preventSelfReview' belongs to observed project deployment approval settings, not this environment")
  if (matching.some((policy) => policy.name !== input.name)) return yield* C.fail(binding, "capability_unavailable", "Wildcard protected policy owns this environment; configure that native policy separately")
  const existing = matching[0]
  // A successful collection lookup distinguishes absence from plan/access denial;
  // a direct read then proves the exact existing policy before changing its rules.
  const policy = existing ? yield* C.get(services, binding, { method: "GET", path: `${root}/protected_environments/${encodeURIComponent(input.name)}` }) : undefined
  const current = policy ? yield* C.guard(binding, () => C.decode(binding, S.Protected, policy.data, true)) : undefined
  if (current && JSON.stringify(current) !== JSON.stringify(existing)) return yield* C.fail(binding, "source_conflict", "Protected environment policy changed during preflight")
  const reviewers = yield* resolveReviewers(services, binding, root, input.reviewers)
  if (!current && reviewers.length) return yield* C.fail(binding, "source_unresolved",
    "Field 'reviewers' requires an existing protected environment deploy_access_levels policy; this form cannot invent deploy permissions")
  if (current?.required_approval_count && current.approval_rules === undefined)
    return yield* C.fail(binding, "capability_unavailable", "Legacy required_approval_count cannot be replaced by unobserved approval_rules")
  if (current?.approval_rules?.some((rule) => rule.user_id == null || rule.group_id != null || rule.access_level != null || rule.required_approvals !== 1))
    return yield* C.fail(binding, "capability_unavailable", "Field 'reviewers' cannot replace native group/role or multi-approval policy through a username-only form")
  const rules = reviewers.map((user_id) => ({ user_id, required_approvals: 1 }))
  const removed = (current?.approval_rules ?? []).map((rule) => ({ id: rule.id, _destroy: true }))
  const requests: { request: ActionsContract.Request; statuses: readonly number[]; phase: string }[] = [
    ...(!environment ? [{ phase: "create environment", statuses: [201], request: { method: "POST" as const, path: `${root}/environments`,
      body: { name: input.name, ...(input.description === undefined ? {} : { description: input.description }), ...(input.tier === undefined ? {} : { tier: input.tier }) } } }]
      : input.description !== undefined || input.tier !== undefined ? [{ phase: "environment metadata", statuses: [200], request: {
        method: "PUT" as const, path: `${root}/environments/${environment.id}`, body: {
          ...(input.description === undefined ? {} : { description: input.description }), ...(input.tier === undefined ? {} : { tier: input.tier }) } } }] : []),
    ...(current ? [{ phase: "protected environment approvals", statuses: [200], request: {
      method: "PUT" as const, path: `${root}/protected_environments/${encodeURIComponent(input.name)}`,
      body: { approval_rules: [...removed, ...rules] } } }] : []),
  ]
  if (removed.length > 32 || requests.length === 0) return yield* C.fail(binding, "invalid_input", "Environment mutation is empty or exceeds bounded approval changes")
  yield* C.stages(services, binding, requests)
  return { acknowledgement: { resourceID: input.name } }
})

const resolveReviewers = Effect.fn("ActionsEnvironments.gitlabReviewers")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding, root: string, names: string) {
  const reviewers = names.split(",").map((name) => name.trim()).filter(Boolean)
  if (reviewers.length > 6 || new Set(reviewers).size !== reviewers.length) return yield* C.fail(binding, "invalid_input", "Environment supports at most six exact reviewer usernames")
  return yield* Effect.forEach(reviewers, (username) => Effect.gen(function* () {
    if (!/^[A-Za-z0-9_.-]+$/.test(username)) return yield* C.fail(binding, "source_unresolved", "GitLab reviewers require exact usernames, not display names or roles")
    const response = yield* C.get(services, binding, { method: "GET", path: "users", query: { username } })
    const users = yield* C.guard(binding, () => C.decode(binding, Schema.Array(Schema.Struct({ id: C.ID, username: C.Text })), response.data, true))
    if (users.length !== 1 || users[0].username !== username || !Number.isSafeInteger(Number(users[0].id)))
      return yield* C.fail(binding, "source_unresolved", "GitLab lookup did not prove one exact reviewer username and native ID")
    const access = yield* C.get(services, binding, { method: "GET", path: `${root}/members/all/${users[0].id}` })
    const member = yield* C.guard(binding, () => C.decode(binding, Schema.Struct({ id: C.ID, username: C.Text, access_level: Schema.Int }), access.data, true))
    if (String(member.id) !== String(users[0].id) || member.username !== username || ![20, 30, 40, 50].includes(member.access_level))
      return yield* C.fail(binding, "source_unresolved", "GitLab project membership did not prove eligible reviewer access")
    return Number(member.id)
  }), { concurrency: 1 })
})
