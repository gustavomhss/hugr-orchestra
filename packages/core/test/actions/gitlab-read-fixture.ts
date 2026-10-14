export * as GitLabReadFixture from "./gitlab-read-fixture"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Stream } from "effect"
import { ActionsContract } from "../../src/actions/contract"
import { ActionsError } from "../../src/actions/error"
import { ActionsGitLabRead } from "../../src/actions/gitlab"

// Recorded official API example shapes, with deterministic project/job identities.
// https://docs.gitlab.com/api/projects/#retrieve-a-project
// https://docs.gitlab.com/api/pipelines/#retrieve-a-single-pipeline
// https://docs.gitlab.com/api/jobs/#list-all-jobs-by-pipeline
// https://docs.gitlab.com/api/repository_files/#retrieve-a-file-from-a-repository
// Fixtures prove adapter behavior, not compatibility with a live GitLab version.
export const binding = Actions.Binding.make({ id: Actions.BindingID.make("ab_gitlabread"), revision: 1, remote: "origin",
  projectID: "21", projectPath: "test-group/test-project", account: "root", directory: "/fixture",
  provider: { kind: "gitlab", hostname: "gitlab.example.com", apiOrigin: "https://gitlab.example.com" } })
export const project = {
  id: 21, name: "Test Project", path_with_namespace: "test-group/test-project", ci_config_path: null,
  default_branch: "main", archived: false, jobs_enabled: true, builds_access_level: "enabled",
  permissions: { project_access: { access_level: 30, notification_level: 3 }, group_access: null },
}
export const commit = "50f0acb76a40e34a4ff304f7347dcc6587da8a14"
export const lastCommit = "570e7b2abdd848b95f2f578043fc23bd6f6fd24d"
export const pipeline = {
  id: 287, iid: 144, project_id: 21, name: "Build pipeline", sha: commit, ref: "main", status: "success", source: "push",
  created_at: "2022-09-21T01:05:07.200Z", updated_at: "2022-09-21T01:05:50.185Z",
  web_url: "https://gitlab.example.com/test-group/test-project/-/pipelines/287",
  before_sha: "8a24fb3c5877a6d0b611ca41fc86edc174593e2b", tag: false, yaml_errors: null,
  user: { id: 1, username: "root", name: "Administrator", state: "active" },
  started_at: "2022-09-21T01:05:14.197Z", finished_at: "2022-09-21T01:05:50.175Z",
  committed_at: null, duration: 34, queued_duration: 6, coverage: null,
  detailed_status: { icon: "status_success", text: "passed", label: "passed", group: "success" }, archived: false,
}
export const job = {
  id: 8, name: "rspec:other", stage: "test", status: "failed", allow_failure: false,
  pipeline: { id: 287, project_id: 21, ref: "main", sha: commit, status: "success" },
  commit: { id: commit, message: "Test the CI integration.", short_id: "50f0acb7" },
  ref: "main", source: "push", tag: false, artifacts: [], failure_reason: "script_failure",
  created_at: "2015-12-24T15:51:21.727Z", started_at: "2015-12-24T17:54:24.729Z", finished_at: "2015-12-24T17:54:24.921Z",
  runner: { id: 32, description: "", active: true, paused: false, is_shared: true, runner_type: "instance_type", name: null },
}
export function file(path: string, text: string, algorithm: "sha1" | "sha256" = "sha1") {
  return { file_name: path.split("/").at(-1) ?? path, file_path: path, size: Buffer.byteLength(text), encoding: "base64",
    content: Buffer.from(text).toString("base64"), ref: commit,
    blob_id: new Bun.CryptoHasher(algorithm).update(Buffer.concat([Buffer.from(`blob ${Buffer.byteLength(text)}\0`), Buffer.from(text)])).digest("hex"),
    commit_id: commit, last_commit_id: lastCommit, execute_filemode: false }
}

export type Route = { readonly path: string; readonly query?: ActionsContract.Request["query"]; readonly headers?: Record<string, string> } &
  ({ readonly data: ActionsContract.Json } | { readonly reply: (input: ActionsContract.Request) => Effect.Effect<ActionsContract.Response, ActionsError> })

export function make(routes: readonly Route[] = [], projectData: ActionsContract.Json = project, metadata: ActionsContract.Json = { version: "18.4.0-ee", revision: "fixture", enterprise: true }) {
  const requests: ActionsContract.Request[] = []
  const unused = new ActionsError({ kind: "transport_failed", message: "Read adapter attempted a non-read fixture operation" })
  const transport: ActionsContract.Transport = {
    resolve: () => Effect.fail(unused), bytes: () => Stream.fail(unused), upload: () => Effect.fail(unused),
    request: (_binding, input) => Effect.suspend(() => {
      requests.push(input)
      if (input.method !== "GET" || input.body !== undefined) return Effect.fail(unused)
      if (input.path === "projects/21") return Effect.succeed({ status: 200, headers: {}, data: projectData })
      const route = routes.find((route) => route.path === input.path && (route.query === undefined ||
        JSON.stringify(Object.entries(route.query).sort()) === JSON.stringify(Object.entries(input.query ?? {}).sort())))
      if (input.path === "metadata" && !route) return Effect.succeed({ status: 200, headers: {}, data: metadata })
      if (!route) return Effect.fail(new ActionsError({ kind: "transport_failed", message: `Unrecorded fixture endpoint: ${input.path}` }))
      if ("reply" in route) return route.reply(input)
      return Effect.succeed({ status: 200, headers: route.headers ?? {}, data: route.data })
    }),
  }
  return { transport, adapter: ActionsGitLabRead.make({ transport }), requests }
}
