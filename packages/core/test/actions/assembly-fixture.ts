import { expect } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema, Stream } from "effect"
import { ChildProcess } from "effect/unstable/process"
import path from "node:path"
import { make } from "../../src/actions"
import { ActionsContract } from "../../src/actions/contract"
import { ActionsOperations } from "../../src/actions/operations"
import { ActionsState } from "../../src/actions/state"
import { Database } from "../../src/database/database"
import { LayerNode } from "../../src/effect/layer-node"
import { FSUtil } from "../../src/fs-util"
import { AppProcess } from "../../src/process"
import { testEffect } from "../lib/effect"
import { openDatabase } from "./operations-fixture"

export const it = testEffect(LayerNode.compile(LayerNode.group([FSUtil.node, AppProcess.node])))
export const github: Actions.Provider = { kind: "github", hostname: "github.com", apiOrigin: "https://api.github.com" }
export const gitlab: Actions.Provider = { kind: "gitlab", hostname: "gitlab.com", apiOrigin: "https://gitlab.com" }
export const runID = "9007199254740993123"
export const jobID = "9007199254740993456"
export const githubPath = ".github/workflows/ci.yml"
export const githubText =
  "on: workflow_dispatch\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps: [{run: echo build}]\n  test:\n    needs: build\n    runs-on: ubuntu-latest\n    steps: [{run: echo test}]\n"
export const gitlabText =
  "stages: [build, test]\nbuild: {stage: build, script: echo build}\ntest: {stage: test, needs: [build], script: echo test}\n"

export const git = Effect.fnUntraced(function* (directory: string, args: string[]) {
  const processService = yield* AppProcess.Service
  const result = yield* processService.run(ChildProcess.make("git", args, { cwd: directory, stdin: "ignore" }))
  expect(result.exitCode, result.stderr.toString()).toBe(0)
  expect(result.stdoutTruncated).toBe(false)
  return result.stdout.toString().trim()
})

export const fixture = Effect.fnUntraced(function* (
  input: {
    git?: boolean
    githubText?: string
    gitlabText?: string
  } = {},
) {
  const fs = yield* FSUtil.Service
  // Windows platform FS can retain an 8.3 temp path; trusted binding identity uses native realpath.
  const root = yield* ActionsState.canonical(yield* fs.makeTempDirectoryScoped())
  const directory = path.join(root, "repo")
  const stateDirectory = path.join(root, "data")
  yield* fs.makeDirectory(directory)
  yield* fs.makeDirectory(stateDirectory)
  const text = { github: input.githubText ?? githubText, gitlab: input.gitlabText ?? gitlabText }
  yield* fs.writeWithDirs(path.join(directory, githubPath), text.github)
  yield* fs.writeFileString(path.join(directory, ".gitlab-ci.yml"), text.gitlab)
  if (input.git !== false) {
    yield* git(directory, ["init", "-b", "main"])
    yield* git(directory, ["add", githubPath, ".gitlab-ci.yml"])
    yield* git(directory, [
      "-c",
      "user.name=Actions Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-m",
      "fixture sources",
    ])
    yield* git(directory, ["remote", "add", "origin", "https://github.com/acme/widgets.git"])
    yield* git(directory, ["remote", "add", "gitlab", "https://gitlab.com/acme/widgets.git"])
  }
  const commit = input.git === false ? "a".repeat(40) : yield* git(directory, ["rev-parse", "HEAD"])
  const blobs =
    input.git === false
      ? { github: "b".repeat(40), gitlab: "c".repeat(40) }
      : {
          github: yield* git(directory, ["rev-parse", `HEAD:${githubPath}`]),
          gitlab: yield* git(directory, ["rev-parse", "HEAD:.gitlab-ci.yml"]),
        }
  const database = (yield* openDatabase(path.join(root, "actions.sqlite"))).database
  const native: { github: Schema.JsonObject; gitlab: Schema.JsonObject } = {
    github: {
      id: runID,
      workflow_id: "42",
      repository: { id: 1234, full_name: "acme/widgets" },
      name: null,
      head_branch: null,
      head_sha: commit,
      event: "workflow_dispatch",
      status: null,
      conclusion: null,
      run_attempt: 4,
      created_at: "2026-10-12T00:00:00Z",
      html_url: "https://github.com/acme/widgets/actions/runs/1",
    },
    gitlab: { id: runID, project_id: 5678, sha: commit, ref: null, source: "web", status: null, name: null },
  }
  const requests: { binding: Actions.Binding; input: ActionsContract.Request }[] = []
  const resolutions: { provider: Actions.Provider; projectPath: string }[] = []
  const transport: ActionsContract.Transport = {
    resolve: (provider, projectPath) =>
      Effect.sync(() => {
        resolutions.push({ provider: structuredClone(provider), projectPath })
        return { projectID: provider.kind === "github" ? "1234" : "5678", projectPath, account: "fixture-actor" }
      }),
    request: (binding, request) =>
      Effect.sync(() => {
        expect(request.method).toBe("GET")
        expect(request.body).toBeUndefined()
        requests.push({ binding: structuredClone(binding), input: structuredClone(request) })
        return { status: 200, headers: {}, data: structuredClone(response(binding, request)) }
      }),
    bytes: () => Stream.die("Unexpected byte transport in read assembly"),
    upload: () => Effect.die("Unexpected provider write in read assembly"),
  }
  const base = { directory, stateDirectory, projectID: "core-project", workspaceID: "workspace-original", transport }
  const options = { ...base }
  const open = (overrides: Partial<typeof base> = {}) =>
    make({ ...base, ...overrides }).pipe(Effect.provideService(Database.Service, database))
  const api = yield* make(options).pipe(Effect.provideService(Database.Service, database))
  const operations = yield* ActionsOperations.make(base).pipe(Effect.provideService(Database.Service, database))
  const create = (provider: Actions.Provider = github) =>
    api.bindings.create({
      remote: provider.kind === "github" ? "origin" : "gitlab",
      provider,
      projectPath: "acme/widgets",
    })
  const file = (binding: Actions.Binding) =>
    path.join(
      stateDirectory,
      "actions",
      base.projectID,
      ActionsState.locationKey(binding.directory, binding.workspaceID),
      "bindings.json",
    )
  const clone = Effect.fnUntraced(function* () {
    const target = path.join(root, "clone")
    yield* git(root, ["clone", "--no-hardlinks", directory, target])
    expect(yield* git(target, ["rev-parse", "HEAD"])).toBe(commit)
    yield* git(target, ["remote", "set-url", "origin", "https://github.com/acme/widgets.git"])
    yield* git(target, ["remote", "add", "gitlab", "https://gitlab.com/acme/widgets.git"])
    return target
  })
  return {
    root,
    directory,
    stateDirectory,
    fs,
    database,
    api,
    operations,
    options,
    open,
    create,
    file,
    clone,
    transport,
    requests,
    resolutions,
    native,
    text,
    commit,
    blobs,
  }

  function response(binding: Actions.Binding, request: ActionsContract.Request): ActionsContract.Json {
    if (binding.provider.kind === "github") {
      const prefix = "repositories/1234"
      if (request.path === prefix) return { id: 1234, full_name: "acme/widgets", default_branch: "main" }
      if (request.path === `${prefix}/actions/workflows`)
        return { total_count: 1, workflows: [{ id: 42, name: null, path: githubPath, state: "active" }] }
      if (request.path === `${prefix}/actions/runs`) return { total_count: 1, workflow_runs: [native.github] }
      if (request.path === `${prefix}/actions/runs/${runID}`) return native.github
      if (request.path === `${prefix}/actions/runs/${runID}/attempts/4/jobs`)
        return {
          total_count: 1,
          jobs: [
            {
              id: jobID,
              run_id: runID,
              run_attempt: 4,
              name: "build",
              status: null,
              conclusion: null,
              runner_id: 0,
              runner_name: null,
              steps: [{ number: 1, name: "Compile", status: null, conclusion: null }],
            },
          ],
        }
      if (request.path.startsWith(`${prefix}/commits/`)) return { sha: commit }
      if (request.path === `${prefix}/contents/${githubPath}`) {
        expect(request.query?.ref).toBe(commit)
        return {
          type: "file",
          path: githubPath,
          sha: blobs.github,
          size: Buffer.byteLength(text.github),
          encoding: "base64",
          content: Buffer.from(text.github).toString("base64"),
        }
      }
    }
    if (binding.provider.kind === "gitlab") {
      const prefix = "projects/5678"
      if (request.path === prefix)
        return { id: 5678, path_with_namespace: "acme/widgets", name: null, ci_config_path: null }
      if (request.path === `${prefix}/pipelines`) return [native.gitlab]
      if (request.path === `${prefix}/pipelines/${runID}`) return native.gitlab
      if (request.path === `${prefix}/pipelines/${runID}/jobs`)
        return [
          {
            id: jobID,
            name: "build",
            status: null,
            stage: "build",
            allow_failure: false,
            pipeline: { id: runID, project_id: 5678 },
            retried: true,
            runner: null,
          },
        ]
      if (request.path === `${prefix}/pipelines/${runID}/bridges`)
        return [
          {
            id: "9007199254740993789",
            name: "child",
            status: "success",
            stage: "test",
            allow_failure: false,
            pipeline: { id: runID, project_id: 5678 },
            downstream_pipeline: { id: "9007199254740993999", project_id: "6789" },
          },
        ]
      if (request.path.startsWith(`${prefix}/repository/commits/`)) return { id: commit }
      if (request.path === `${prefix}/repository/files/.gitlab-ci.yml`) {
        expect(request.query?.ref).toBe(commit)
        return {
          file_path: ".gitlab-ci.yml",
          encoding: "base64",
          content: Buffer.from(text.gitlab).toString("base64"),
          blob_id: blobs.gitlab,
          commit_id: commit,
          last_commit_id: commit,
        }
      }
    }
    throw new Error(`Unexpected ${binding.provider.kind} read: ${request.path}`)
  }
})

export function intent(
  binding: Actions.Binding,
  commit: string,
  overrides: Partial<Actions.OperationIntent> = {},
): Actions.OperationIntent {
  return {
    clientID: crypto.randomUUID(),
    binding: { id: binding.id, revision: binding.revision },
    kind: "workflow.dispatch",
    target: {
      workflowID: binding.provider.kind === "github" ? "42" : `gitlab:project:${binding.projectID}:pipeline`,
      ref: "refs/heads/main",
    },
    expected: { commit },
    ...overrides,
  }
}
