export * as ActionsConfigFixture from "./config-resource-fixture"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Stream } from "effect"
import { ActionsContract } from "../../src/actions/contract"
import { ActionsError } from "../../src/actions/error"

export const time = "2026-10-12T00:00:00Z"
export const variable = { name: "MODE", value: "release", created_at: time, updated_at: time }
export const secret = { name: "TOKEN", created_at: time, updated_at: time }
export const gitlabVariable = { key: "TOKEN", value: "fixture-sensitive-value", environment_scope: "production", variable_type: "env_var",
  protected: true, masked: true, hidden: true, raw: false }
export const githubEnvironment = { id: 9, name: "production", created_at: time, updated_at: time,
  protection_rules: [{ id: 42, type: "required_reviewers", prevent_self_review: true,
    reviewers: [{ type: "User", reviewer: { id: 4, login: "reviewer" } }] }], deployment_branch_policy: null }
export const gitlabEnvironment = { id: 9, name: "production", state: "stopped", description: "Production", tier: "production", updated_at: time }
export const protectedEnvironment = { name: "production", deploy_access_levels: [{ id: 3, access_level: 40, user_id: null, group_id: null }],
  required_approval_count: 1, approval_rules: [{ id: 12, user_id: 4, group_id: null, access_level: null, required_approvals: 1 }] }
export const pending = { environment: { id: 9, name: "production" }, wait_timer: 0, wait_timer_started_at: null,
  current_user_can_approve: true, reviewers: [{ type: "User", reviewer: { id: 4, login: "reviewer" } }] }
export const deployment = { id: 78, status: "blocked", sha: "a".repeat(40), ref: "dev", environment: { id: 9, name: "production" },
  deployable: { id: 41, pipeline: { id: 247 } }, pending_approval_count: 1 }

export function binding(kind: Actions.ProviderKind = "github"): Actions.Binding {
  return { id: Actions.BindingID.make("ab_config-fixture"), revision: 3, remote: "origin", projectID: "123", projectPath: "acme/renamed",
    account: "actor", directory: "/fixture", provider: { kind, hostname: kind === "github" ? "github.com" : "gitlab.com",
      apiOrigin: kind === "github" ? "https://api.github.com" : "https://gitlab.com/api/v4", version: "99.99.99" } }
}

export function intent(binding: Actions.Binding, kind: Actions.OperationKind = "resource.update", resourceKind: Actions.ResourceKind = "variables",
  resourceID = "TOKEN", scope = binding.provider.kind === "github" ? "Repository" : "production"): Actions.OperationIntent {
  return { clientID: "config-fixture", binding: { id: binding.id, revision: binding.revision }, kind, target: { resourceKind, resourceID, scope } }
}

export function reply(data: ActionsContract.Json, status = 200, headers: Record<string, string> = {}): ActionsContract.Response {
  return { status, headers, data }
}

export function recorded(current: Actions.Binding = binding()) {
  const binding = current
  const root = `${binding.provider.kind === "github" ? "repositories" : "projects"}/${binding.projectID}`
  const routes: Record<string, ActionsContract.Response | ActionsError | ((request: ActionsContract.Request) => ActionsContract.Response | ActionsError)> = {
    [`GET ${root}`]: reply(binding.provider.kind === "github"
      ? { id: Number(binding.projectID), archived: false, private: false, permissions: { push: true, admin: true } }
      : { id: Number(binding.projectID), archived: false, permissions: { project_access: { access_level: 40 }, group_access: null },
        allow_pipeline_trigger_approve_deployment: false }),
    "GET user": reply(binding.provider.kind === "github" ? { id: 1, login: "actor" } : { id: 1, username: "actor" }),
  }
  const calls: ActionsContract.Request[] = []
  const transport: ActionsContract.Transport = {
    resolve: () => Effect.die("Configuration domains must not resolve a mutable project path"),
    request: (_, request) => Effect.gen(function* () {
      calls.push(structuredClone(request))
      const route = routes[`${request.method} ${request.path}`]
      const response = typeof route === "function" ? route(request) : route
      if (!response) return yield* Effect.die(`Unrecorded configuration request: ${request.method} ${request.path}`)
      if (response instanceof ActionsError) return yield* response
      return structuredClone(response)
    }),
    bytes: () => Stream.die("Configuration domain must not download"),
    upload: () => Effect.die("Configuration domain must not upload"),
  }
  const reader: ActionsContract.ReadAdapter = {
    capabilities: () => Effect.die("Unexpected capability read"), workflows: () => Effect.die("Unexpected workflow read"),
    source: () => Effect.die("Unexpected source read"), runs: () => Effect.die("Unexpected run list"), jobs: () => Effect.die("Unexpected job read"),
    run: (_, id) => Effect.succeed({ id, bindingID: binding.id, repositoryID: binding.projectID,
      workflowID: binding.provider.kind === "github" ? "42" : `gitlab:project:${binding.projectID}:pipeline`, name: null, ref: "dev",
      commit: "a".repeat(40), event: "push", status: binding.provider.kind === "github" ? "waiting" : "manual",
      ...(binding.provider.kind === "github" ? { attempt: 1 } : {}) }),
  }
  return { services: { transport, reader }, root, routes, calls, writes: () => calls.filter((request) => request.method !== "GET") }
}
