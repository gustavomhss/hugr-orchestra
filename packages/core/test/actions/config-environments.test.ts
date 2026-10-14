import { expect } from "bun:test"
import { Effect, Schema } from "effect"
import { ActionsEnvironments } from "../../src/actions/resources/environments"
import { ActionsError } from "../../src/actions/error"
import { ActionsConfigFixture } from "./config-resource-fixture"
import { it } from "../lib/effect"

const F = ActionsConfigFixture

it.effect("GitHub lists native reviewer identities and branch/tag patterns, not display-name guesses", Effect.gen(function* () {
  const binding = F.binding()
  const fixture = F.recorded(binding)
  fixture.routes[`GET ${fixture.root}/environments`] = F.reply({ total_count: 1, environments: [{ ...F.githubEnvironment,
    deployment_branch_policy: { protected_branches: false, custom_branch_policies: true } }] })
  fixture.routes[`GET ${fixture.root}/environments/production/deployment-branch-policies`] = F.reply({ total_count: 2,
    branch_policies: [{ id: 1, name: "v*", type: "branch" }, { id: 2, name: "v*", type: "tag" }] })
  const page = yield* ActionsEnvironments.make(fixture.services).list(binding, { kind: "environments" })
  expect(page.items[0]).toMatchObject({ name: "production", scope: "Repository", data: {
    refs: "v*", reviewers: "reviewer", preventSelfReview: true, reviewerIdentities: [{ type: "User", id: "4", login: "reviewer" }],
    nativeIdentity: { id: "9", projectID: "123", bindingRevision: 3 } } })
  expect(page.items[0].data).toMatchObject({ refPolicies: [{ type: "branch" }, { type: "tag" }] })
}))

it.effect("GitHub resolves native user membership before one protection write and paired branch/tag phases", Effect.gen(function* () {
  const binding = F.binding()
  const fixture = F.recorded(binding)
  const path = `${fixture.root}/environments/production`
  fixture.routes[`GET ${path}`] = F.reply(F.githubEnvironment)
  fixture.routes["GET users/reviewer"] = F.reply({ id: 4, login: "reviewer", name: "Display name must not address writes" })
  fixture.routes[`GET ${fixture.root}/collaborators/reviewer/permission`] = F.reply({ permission: "read", user: { id: 4, login: "reviewer" } })
  fixture.routes[`PUT ${path}`] = F.reply(F.githubEnvironment)
  fixture.routes[`POST ${path}/deployment-branch-policies`] = F.reply({ id: 5, name: "v*", type: "branch" }, 201)
  const domain = ActionsEnvironments.make(fixture.services)
  const result = yield* domain.perform(binding, F.intent(binding, "resource.update", "environments", "production", "Repository"), {
    provider: "github", name: "production", reviewers: "reviewer", refs: "v*", timer: 12, preventSelfReview: true })
  expect(result).toEqual({ acknowledgement: { resourceID: "production" } })
  expect(fixture.writes().map((request) => request.body)).toEqual([
    { wait_timer: 12, prevent_self_review: true, reviewers: [{ type: "User", id: 4 }], deployment_branch_policy: { protected_branches: false, custom_branch_policies: true } },
    { name: "v*", type: "branch" }, { name: "v*", type: "tag" },
  ])
  const lookup = fixture.calls.findIndex((request) => request.path.endsWith("/permission"))
  expect(lookup).toBeGreaterThan(0)
  expect(fixture.calls.findIndex((request) => request.method === "PUT")).toBeGreaterThan(lookup)
}))

it.effect("unproved reviewer and denied native admin role fail before environment writer", Effect.gen(function* () {
  const binding = F.binding()
  const fixture = F.recorded(binding)
  fixture.routes[`GET ${fixture.root}/environments/production`] = F.reply(F.githubEnvironment)
  const domain = ActionsEnvironments.make(fixture.services)
  const intent = F.intent(binding, "resource.update", "environments", "production", "Repository")
  const form = { provider: "github", name: "production", reviewers: "Review Person", refs: "*", timer: 0, preventSelfReview: true }
  expect((yield* domain.perform(binding, intent, form).pipe(Effect.flip)).kind).toBe("source_unresolved")
  fixture.routes[`GET ${fixture.root}`] = F.reply({ id: 123, permissions: { push: true, admin: false } })
  expect((yield* domain.perform(binding, intent, { ...form, reviewers: "" }).pipe(Effect.flip)).kind).toBe("permission_denied")
  expect(fixture.writes()).toEqual([])
}))

it.effect("later ref-policy rejection reports partial phase; no pretend environment success", Effect.gen(function* () {
  const binding = F.binding()
  const fixture = F.recorded(binding)
  const path = `${fixture.root}/environments/production`
  fixture.routes[`GET ${path}`] = F.reply(F.githubEnvironment)
  fixture.routes[`PUT ${path}`] = F.reply(F.githubEnvironment)
  fixture.routes[`POST ${path}/deployment-branch-policies`] = F.reply({ message: "ref denied" }, 403)
  const error = yield* ActionsEnvironments.make(fixture.services).perform(binding,
    F.intent(binding, "resource.update", "environments", "production", "Repository"),
    { provider: "github", name: "production", reviewers: "", refs: "v*", timer: 0, preventSelfReview: false }).pipe(Effect.flip)
  expect(error).toMatchObject({ kind: "outcome_unknown", disposition: "unknown" })
  expect(error.message).toContain("phase 'add branch ref policy'")
  expect(fixture.writes()).toHaveLength(2)
}))

it.effect("GitLab GET protected policy supplies IDs, metadata and actual project-scoped self-review evidence", Effect.gen(function* () {
  const binding = F.binding("gitlab")
  const fixture = F.recorded(binding)
  fixture.routes[`GET ${fixture.root}/environments`] = F.reply([F.gitlabEnvironment], 200, { "x-next-page": "", "x-total": "1" })
  fixture.routes[`GET ${fixture.root}/protected_environments`] = F.reply([F.protectedEnvironment])
  const page = yield* ActionsEnvironments.make(fixture.services).list(binding, { kind: "environments" })
  expect(page.items[0]).toMatchObject({ status: "stopped", scope: "Project", data: { tier: "production", description: "Production",
    preventSelfReview: true, preventSelfReviewScope: "Project", refs: { state: "source_unresolved" },
    reviewerIdentities: [{ user_id: 4, required_approvals: 1, policyName: "production" }] } })
  fixture.routes[`GET ${fixture.root}/protected_environments`] = F.reply({ message: "plan denied" }, 403)
  expect((yield* ActionsEnvironments.make(fixture.services).list(binding, { kind: "environments" }).pipe(Effect.flip)).kind).toBe("permission_denied")
}))

it.effect("GitLab native environment metadata plus reviewer-rule update retain deploy role; ref/self-review gaps fail unsent", Effect.gen(function* () {
  const binding = F.binding("gitlab")
  const fixture = F.recorded(binding)
  fixture.routes[`GET ${fixture.root}/environments`] = F.reply([F.gitlabEnvironment])
  fixture.routes[`GET ${fixture.root}/protected_environments`] = F.reply([F.protectedEnvironment])
  fixture.routes[`GET ${fixture.root}/protected_environments/production`] = F.reply(F.protectedEnvironment)
  fixture.routes["GET users"] = F.reply([{ id: 4, username: "reviewer" }])
  fixture.routes[`GET ${fixture.root}/members/all/4`] = F.reply({ id: 4, username: "reviewer", access_level: 30 })
  fixture.routes[`PUT ${fixture.root}/environments/9`] = F.reply(F.gitlabEnvironment)
  fixture.routes[`PUT ${fixture.root}/protected_environments/production`] = F.reply(F.protectedEnvironment)
  const domain = ActionsEnvironments.make(fixture.services)
  const intent = F.intent(binding, "resource.update", "environments", "production", "Project")
  const form = { provider: "gitlab", name: "production", reviewers: "reviewer", refs: "*", preventSelfReview: true, description: "New description", tier: "staging" }
  expect((yield* domain.perform(binding, intent, { ...form, refs: "dev" }).pipe(Effect.flip)).message).toContain("Field 'refs'")
  expect((yield* domain.perform(binding, intent, { ...form, preventSelfReview: false }).pipe(Effect.flip)).message).toContain("Field 'preventSelfReview'")
  expect(fixture.writes()).toEqual([])
  yield* domain.perform(binding, intent, form)
  expect(fixture.writes().map((request) => request.body)).toEqual([
    { description: "New description", tier: "staging" }, { approval_rules: [{ id: 12, _destroy: true }, { user_id: 4, required_approvals: 1 }] },
  ])
  expect(fixture.calls.find((request) => request.path === "users")?.query).toEqual({ username: "reviewer" })
}))

it.effect("GitLab environment deletion uses observed numeric ID and requires stopped native state", Effect.gen(function* () {
  const binding = F.binding("gitlab")
  const fixture = F.recorded(binding)
  fixture.routes[`GET ${fixture.root}/environments`] = F.reply([{ ...F.gitlabEnvironment, state: "available" }])
  fixture.routes[`GET ${fixture.root}/protected_environments`] = F.reply([])
  fixture.routes[`DELETE ${fixture.root}/environments/9`] = F.reply(null, 204)
  const domain = ActionsEnvironments.make(fixture.services)
  const intent = F.intent(binding, "resource.delete", "environments", "production", "Project")
  const form = { provider: "gitlab", name: "production" }
  expect((yield* domain.perform(binding, intent, form).pipe(Effect.flip)).kind).toBe("capability_unavailable")
  expect(fixture.writes()).toEqual([])
  fixture.routes[`GET ${fixture.root}/environments`] = F.reply([F.gitlabEnvironment])
  expect(yield* domain.perform(binding, intent, form)).toEqual({ acknowledgement: { resourceID: "production" } })
  expect(fixture.writes()[0].path).toBe(`${fixture.root}/environments/9`)
}))

it.effect("deployment reviews use GitHub pending_deployments and GitLab deployment approval, never job play", Effect.gen(function* () {
  yield* Effect.forEach(["github", "gitlab"] as const, (provider) => Effect.gen(function* () {
    const binding = F.binding(provider)
    const fixture = F.recorded(binding)
    fixture.routes[`GET ${fixture.root}/actions/runs/247/pending_deployments`] = F.reply([F.pending])
    fixture.routes[`POST ${fixture.root}/actions/runs/247/pending_deployments`] = F.reply([])
    fixture.routes[`GET ${fixture.root}/deployments`] = F.reply([F.deployment])
    fixture.routes[`GET ${fixture.root}/deployments/78`] = F.reply(F.deployment)
    fixture.routes[`POST ${fixture.root}/deployments/78/approval`] = F.reply({ status: "approved" }, 201)
    const domain = ActionsEnvironments.make(fixture.services)
    const page = yield* domain.list(binding, { kind: "environments", runID: "247", resourceID: "production" })
    const version = Schema.decodeUnknownSync(Schema.Struct({ resourceVersion: Schema.String }))(page.items[0].data).resourceVersion
    const intent = { ...F.intent(binding, "deployment.review", "environments", "production", provider === "github" ? "Repository" : "Project"),
      target: { resourceKind: "environments" as const, resourceID: "production", scope: provider === "github" ? "Repository" : "Project", runID: "247" },
      expected: { resourceVersion: version, commit: "a".repeat(40), ...(provider === "github" ? { attempt: 1 } : {}) } }
    expect(yield* domain.perform(binding, intent, { provider, decision: "Approve", comment: "Reviewed release" }))
      .toEqual({ acknowledgement: { runID: "247", resourceID: "production" } })
    expect(fixture.writes()[0]).toMatchObject(provider === "github"
      ? { path: `${fixture.root}/actions/runs/247/pending_deployments`, body: { environment_ids: [9], state: "approved" } }
      : { path: `${fixture.root}/deployments/78/approval`, body: { status: "approved" } })
    expect(fixture.calls.some((request) => request.path.includes("/jobs/"))).toBe(false)
  }))
}))

it.effect("deployment ownership mismatch and native ineligible reviewer never reach approval writer", Effect.gen(function* () {
  const binding = F.binding()
  const fixture = F.recorded(binding)
  fixture.routes[`GET ${fixture.root}/actions/runs/247/pending_deployments`] = F.reply([{ ...F.pending, current_user_can_approve: false }])
  const intent = { ...F.intent(binding, "deployment.review", "environments", "production", "Repository"),
    target: { resourceKind: "environments" as const, resourceID: "production", scope: "Repository", runID: "247" } }
  const error = yield* ActionsEnvironments.make(fixture.services).perform(binding, intent, { provider: "github", decision: "Reject", comment: "Not eligible" }).pipe(Effect.flip)
  expect(error.kind).toBe("permission_denied")
  expect(fixture.writes()).toEqual([])
}))

it.effect("GitHub environment creation handles real transport 404 and encoded native name", Effect.gen(function* () {
  const binding = F.binding()
  const fixture = F.recorded(binding)
  const name = "review/feature"
  const path = `${fixture.root}/environments/review%2Ffeature`
  fixture.routes[`GET ${path}`] = new ActionsError({ kind: "not_found", message: "Provider request failed (HTTP 404)", disposition: "definitely_rejected" })
  fixture.routes[`PUT ${path}`] = F.reply({ ...F.githubEnvironment, name })
  const result = yield* ActionsEnvironments.make(fixture.services).perform(binding,
    F.intent(binding, "resource.create", "environments", name, "Repository"),
    { provider: "github", name, reviewers: "", refs: "*", timer: 0, preventSelfReview: false })
  expect(result).toEqual({ acknowledgement: { resourceID: name } })
  expect(fixture.writes()).toHaveLength(1)
  expect(fixture.writes()[0].path).toBe(path)
}))

it.effect("GitLab refuses to invent deploy access policy when form only supplies reviewer names", Effect.gen(function* () {
  const binding = F.binding("gitlab")
  const fixture = F.recorded(binding)
  fixture.routes[`GET ${fixture.root}/environments`] = F.reply([])
  fixture.routes[`GET ${fixture.root}/protected_environments`] = F.reply([])
  fixture.routes["GET users"] = F.reply([{ id: 4, username: "reviewer" }])
  fixture.routes[`GET ${fixture.root}/members/all/4`] = F.reply({ id: 4, username: "reviewer", access_level: 30 })
  const error = yield* ActionsEnvironments.make(fixture.services).perform(binding,
    F.intent(binding, "resource.create", "environments", "production", "Project"),
    { provider: "gitlab", name: "production", reviewers: "reviewer", refs: "*", preventSelfReview: true }).pipe(Effect.flip)
  expect(error.kind).toBe("source_unresolved")
  expect(error.message).toContain("cannot invent deploy permissions")
  expect(fixture.writes()).toEqual([])
}))
