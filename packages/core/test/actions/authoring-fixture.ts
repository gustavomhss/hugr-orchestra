export * as AuthoringFixture from "./authoring-fixture"

import { Actions } from "@orchestra/schema/actions"
import { createHash } from "node:crypto"
import { Effect, Schema, Stream } from "effect"
import { ActionsAuthoring } from "../../src/actions/authoring/index"
import { ActionsContract } from "../../src/actions/contract"
import { ActionsError } from "../../src/actions/error"
import { ActionsGitHubRead } from "../../src/actions/github/index"
import { ActionsGitLabRead } from "../../src/actions/gitlab/index"

export const commit = "1".repeat(40)
export const nextCommit = "2".repeat(40)
export const original = "# source stays literal\r\non: push\r\njobs: {build: {steps: []}}\r\n"
export const draft = "\uFEFF# changed source stays literal\r\non: push\r\njobs: {build: {steps: [], unknown: value}}\r\n"
export const branch = "actions-update-ci"
export const blob = (text: string) => createHash("sha1").update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest("hex")
export const binding = (provider: Actions.ProviderKind) => Actions.Binding.make({
  id: Actions.BindingID.make(`ab_authoring_${provider}`), revision: 1, remote: "fork", projectID: "21", projectPath: "owner/project",
  directory: "/authoring-fixture", account: "author", provider: { kind: provider,
    hostname: provider === "github" ? "github.com" : "gitlab.com",
    apiOrigin: provider === "github" ? "https://api.github.com" : "https://gitlab.com/api/v4" },
})
export const path = (provider: Actions.ProviderKind) => provider === "github" ? ".github/workflows/ci.yml" : ".gitlab-ci.yml"
export const version = (provider: Actions.ProviderKind, text = original, lastCommit = commit) => provider === "github"
  ? blob(text) : JSON.stringify({ blob_id: blob(text), last_commit_id: lastCommit })
export const intent = (provider: Actions.ProviderKind, kind: Actions.OperationKind, target: Actions.OperationTarget,
  expected: Actions.OperationExpected = { commit, sourceVersion: version(provider) }) => Actions.OperationIntent.make({
    clientID: `fixture-${kind}`, binding: { id: binding(provider).id, revision: 1 }, kind, target, expected,
  })

export function makeJson(value: unknown): Schema.JsonObject {
  return Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json)))(JSON.stringify(value))
}

export function make(provider: Actions.ProviderKind, options: {
  readonly path?: string
  readonly configPath?: string | null
  readonly write?: (request: ActionsContract.Request) => Effect.Effect<ActionsContract.Response, ActionsError>
  readonly read?: (request: ActionsContract.Request) => ActionsContract.Json | undefined
  readonly readResponse?: (request: ActionsContract.Request) => Effect.Effect<ActionsContract.Response, ActionsError> | undefined
  readonly postReadFails?: boolean
} = {}) {
  const bound = binding(provider)
  const requests: ActionsContract.Request[] = []
  const state = { commit, text: original, exists: true, lastCommit: commit, writes: 0 }
  const fail = new ActionsError({ kind: "transport_failed", message: "Unrecorded authoring fixture route", disposition: "unknown" })
  const success = (data: ActionsContract.Json, status = 200) => {
    const response: ActionsContract.Response = { status, headers: {}, data }
    return Effect.succeed(response)
  }
  const transport: ActionsContract.Transport = {
    resolve: () => Effect.fail(fail), bytes: () => Stream.fail(fail), upload: () => Effect.fail(fail),
    request: (_binding, request) => Effect.suspend(() => {
      requests.push(request)
      if (request.method !== "GET") {
        state.writes++
        if (options.write) return options.write(request)
        if (request.path.endsWith("/git/refs")) return success({ ref: `refs/heads/${branch}`, object: { type: "commit", sha: commit } }, 201)
        if (request.path.endsWith("/repository/branches")) return success({ name: branch, commit: { id: commit } }, 201)
        if (request.path.endsWith("/pulls")) return success({ id: 91, number: 9, html_url: "https://github.com/owner/project/pull/9",
          state: "open", title: "Update CI", body: "Review text", head: { ref: branch, sha: state.commit, repo: { id: 21 } },
          base: { ref: "dev", repo: { id: 21 } } }, 201)
        if (request.path.endsWith("/merge_requests")) return success({ id: 91, iid: 9, project_id: 21, source_project_id: 21, target_project_id: 21,
          source_branch: branch, target_branch: "dev", sha: state.commit, state: "opened", title: "Update CI", description: "Review text",
          web_url: "https://gitlab.com/owner/project/-/merge_requests/9" }, 201)
        const existed = state.exists
        state.commit = nextCommit
        state.lastCommit = nextCommit
        state.text = draft
        state.exists = true
        return provider === "github" ? success({ content: { type: "file", path: options.path ?? path(provider), sha: blob(draft) }, commit: { sha: nextCommit } }, existed ? 200 : 201)
          : success({ file_path: options.path ?? path(provider), branch }, existed ? 200 : 201)
      }
      if (state.writes && options.postReadFails) return Effect.fail(fail)
      const response = options.readResponse?.(request)
      if (response !== undefined) return response
      const overridden = options.read?.(request)
      if (overridden !== undefined) return success(overridden)
      if (request.path === "user") return success({ id: 7, login: "author", username: "author", harmless_extra: true })
      if (request.path === "repositories/21") return success({ id: 21, full_name: "owner/project", default_branch: "dev", permissions: { push: true } })
      if (request.path === "projects/21") return success({ id: 21, name: "Project", path_with_namespace: "owner/project",
        ci_config_path: options.configPath ?? null, default_branch: "dev", permissions: { project_access: { access_level: 40 }, group_access: null } })
      if (request.path.includes("/git/ref/heads/")) return success({ ref: `refs/heads/${request.path.split("/heads/")[1]}`,
        object: { type: "commit", sha: state.commit }, harmless_extra: true })
      if (request.path.includes("/repository/branches/")) return success({ name: decodeURIComponent(request.path.split("/branches/")[1]),
        commit: { id: state.commit }, protected: false })
      if (request.path.includes("/commits/")) return success({ sha: state.commit, id: state.commit })
      if (request.path.includes("/contents/") || request.path.includes("/repository/files/")) {
        if (!state.exists) return Effect.fail(new ActionsError({ kind: "not_found", message: "Native file missing", disposition: "definitely_rejected" }))
        const content = Buffer.from(state.text).toString("base64")
        return provider === "github" ? success({ type: "file", path: options.path ?? path(provider), sha: blob(state.text), size: Buffer.byteLength(state.text), encoding: "base64", content })
          : success({ file_path: options.path ?? path(provider), encoding: "base64", content, blob_id: blob(state.text), commit_id: state.commit, last_commit_id: state.lastCommit })
      }
      return Effect.fail(fail)
    }),
  }
  const reader = provider === "github" ? ActionsGitHubRead.make({ transport }) : ActionsGitLabRead.make({ transport })
  return { binding: bound, state, requests, transport, reader, service: ActionsAuthoring.make({ transport, reader }) }
}
