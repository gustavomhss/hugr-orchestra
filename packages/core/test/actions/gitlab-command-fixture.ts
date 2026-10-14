export * as GitLabCommandFixture from "./gitlab-command-fixture"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Stream } from "effect"
import { ActionsContract } from "../../src/actions/contract"
import { ActionsError } from "../../src/actions/error"
import { ActionsGitLabRead } from "../../src/actions/gitlab"
import { ActionsGitLabCommands } from "../../src/actions/gitlab/commands"
import { GitLabReadFixture } from "./gitlab-read-fixture"

export const binding = GitLabReadFixture.binding
export const commit = GitLabReadFixture.commit
export const project = { ...GitLabReadFixture.project, ci_pipeline_variables_minimum_override_role: "developer" }
export const pipeline = { ...GitLabReadFixture.pipeline, status: "failed" }
export const job = { ...GitLabReadFixture.job, archived: false, erased_at: null, user: { username: "root" } }
export const text = "build:\n  script: echo fixture\n"
export const intent = (kind: Actions.OperationKind, target: Actions.OperationTarget, expected?: Actions.OperationExpected) =>
  Actions.OperationIntent.make({ clientID: "native-command-fixture", binding: { id: binding.id, revision: binding.revision }, kind, target,
    ...(expected === undefined ? {} : { expected }) })
export type Route = { path: string; method?: ActionsContract.Request["method"]; reply: (request: ActionsContract.Request) => Effect.Effect<ActionsContract.Response, ActionsError> }

export function make(options: { project?: ActionsContract.Json; pipeline?: ActionsContract.Json; job?: ActionsContract.Json;
  text?: string; version?: string; routes?: readonly Route[]; write?: (request: ActionsContract.Request) => Effect.Effect<ActionsContract.Response, ActionsError> } = {}) {
  const requests: ActionsContract.Request[] = []
  const state = { project: options.project ?? project, pipeline: options.pipeline ?? pipeline, job: options.job ?? job,
    text: options.text ?? text, version: options.version ?? "18.4.0-ee", writes: 0 }
  const unused = new ActionsError({ kind: "invalid_input", message: "Command fixture forbids unexpected transfer or resolution" })
  const transport: ActionsContract.Transport = { resolve: () => Effect.fail(unused), bytes: () => Stream.fail(unused), upload: () => Effect.fail(unused),
    request: (_binding, request) => Effect.suspend(() => {
      requests.push(request)
      if (request.method !== "GET") state.writes++
      const route = options.routes?.find((route) => route.path === request.path && (route.method ?? "GET") === request.method)
      if (route) return route.reply(request)
      if (request.method !== "GET") return options.write?.(request) ?? Effect.fail(new ActionsError({ kind: "transport_failed", message: "Unrecorded native fixture write", disposition: "unknown" }))
      const success = (data: ActionsContract.Json) => Effect.succeed({ status: 200, headers: {}, data })
      if (request.path === "metadata") return success({ version: state.version, revision: "fixture", enterprise: true })
      if (request.path === "projects/21") return success(state.project)
      if (request.path === "projects/21/pipelines/287") return success(state.pipeline)
      if (request.path === "projects/21/jobs/8") return success(state.job)
      if (request.path.startsWith("projects/21/repository/branches/")) {
        const name = decodeURIComponent(request.path.slice("projects/21/repository/branches/".length))
        if (name === "main" || name === "feature/release") return success({ name, protected: false, commit: { id: commit } })
      }
      if (request.path === "projects/21/repository/tags/v1") return success({ name: "v1", protected: false, commit: { id: commit } })
      if (request.path === `projects/21/repository/commits/${commit}` || request.path === "projects/21/repository/commits/main") return success({ id: commit })
      if (request.path.startsWith("projects/21/repository/files/")) {
        const path = decodeURIComponent(request.path.slice("projects/21/repository/files/".length))
        return success(GitLabReadFixture.file(path, state.text))
      }
      return Effect.fail(new ActionsError({ kind: "not_found", message: "Native fixture target not found", disposition: "definitely_rejected" }))
    }) }
  const reader = ActionsGitLabRead.make({ transport })
  return { transport, reader, service: ActionsGitLabCommands.make({ transport, reader }), state, requests }
}

export const created = (request: ActionsContract.Request, source = "api") => Effect.succeed({ status: 201, headers: {}, data: {
  ...pipeline, id: 501, status: "pending", source, ref: request.body && typeof request.body === "object" && "ref" in request.body && typeof request.body.ref === "string" ? request.body.ref : "main",
} })
