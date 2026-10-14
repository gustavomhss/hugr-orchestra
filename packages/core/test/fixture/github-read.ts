export * as GitHubReadFixture from "./github-read"

import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema, Stream } from "effect"
import { ActionsContract } from "../../src/actions/contract"
import { ActionsError } from "../../src/actions/error"
import { ActionsGitHubRead } from "../../src/actions/github"
import { ActionsCli } from "../../src/actions/transport/cli"
import { ActionsProcess } from "../../src/actions/transport/process"
import { ActionsResponse } from "../../src/actions/transport/response"
import { AppProcess } from "../../src/process"
import { LayerNode } from "../../src/effect/layer-node"
import { testEffect } from "../lib/effect"

export const it = testEffect(LayerNode.compile(AppProcess.node))
export const binding: Actions.Binding = { id: Actions.BindingID.make("ab_github_read"), revision: 3,
  provider: { kind: "github", hostname: "github.com", apiOrigin: "https://api.github.com" }, projectID: "9347",
  projectPath: "acme/old-name", remote: "origin", account: "octocat", directory: "/fixture" }
export const repo = { id: 9347, node_id: "R_fixture", name: "renamed", full_name: "acme/renamed", private: true,
  default_branch: "main", permissions: { admin: false, maintain: false, push: true, pull: true },
  html_url: "https://github.com/acme/renamed", url: "https://api.github.com/repos/acme/renamed" }

// Native wire-shape recordings derived from official response examples, sanitized
// for this fixture. They are not a live-provider compatibility claim.
// https://docs.github.com/en/rest/actions/workflows#list-repository-workflows
export const workflow = { id: 161335, node_id: "W_fixture", name: "CI", path: ".github/workflows/build.yml", state: "active",
  created_at: "2020-01-08T23:48:37Z", updated_at: "2020-01-08T23:50:21Z",
  url: "https://api.github.com/repos/acme/renamed/actions/workflows/161335",
  html_url: "https://github.com/acme/renamed/blob/main/.github/workflows/build.yml",
  badge_url: "https://github.com/acme/renamed/workflows/CI/badge.svg" }
export const sha = "009b18f8f80ddc7ad177bd321cd60a47d64b78de"
// https://docs.github.com/en/rest/actions/workflow-runs#get-a-workflow-run
export const run = { id: 30433642, name: "CI", node_id: "WR_fixture", head_branch: "main", head_sha: sha,
  path: ".github/workflows/build.yml", run_number: 7, run_attempt: 3, event: "pull_request", status: "completed", conclusion: "neutral",
  workflow_id: 161335, check_suite_id: 414944374, check_suite_node_id: "CS_fixture", display_title: "Keep native result",
  url: "https://api.github.com/repos/acme/renamed/actions/runs/30433642", html_url: "https://github.com/acme/renamed/actions/runs/30433642",
  created_at: "2020-01-22T19:33:08Z", updated_at: "2020-01-22T19:33:20Z", run_started_at: "2020-01-22T19:33:10Z",
  actor: { id: 1, login: "octocat", type: "User" }, triggering_actor: { id: 2, login: "another-user", type: "User" },
  repository: repo, head_repository: { ...repo, id: 9999, full_name: "fork/renamed" },
  referenced_workflows: [{ path: "acme/shared/.github/workflows/build.yml@main", sha }],
  head_commit: { id: sha, tree_id: "006878d046937883b626c70a427531536387501a", message: "native fixture" }, pull_requests: [],
  jobs_url: "https://api.github.com/repos/acme/renamed/actions/runs/30433642/jobs",
  logs_url: "https://api.github.com/repos/acme/renamed/actions/runs/30433642/logs" }
// https://docs.github.com/en/rest/actions/workflow-jobs#list-jobs-for-a-workflow-run-attempt
export const job = { id: 399444496, run_id: 30433642, run_attempt: 2, node_id: "J_fixture", head_sha: sha,
  name: "test (ubuntu-latest, 20)", status: "completed", conclusion: "failure", created_at: "2020-01-22T19:33:08Z",
  started_at: "2020-01-22T19:33:10Z", completed_at: "2020-01-22T19:33:20Z", runner_id: 17,
  runner_name: "hosted-17", runner_group_id: 1, runner_group_name: "Default", labels: ["ubuntu-latest"],
  head_branch: "main", workflow_name: "CI", run_url: "https://api.github.com/repos/acme/renamed/actions/runs/30433642",
  url: "https://api.github.com/repos/acme/renamed/actions/jobs/399444496", html_url: "https://github.com/acme/renamed/runs/399444496",
  check_run_url: "https://api.github.com/repos/acme/renamed/check-runs/399444496",
  steps: [{ number: 1, name: "Set up job", status: "completed", conclusion: "success", started_at: "2020-01-22T19:33:10Z", completed_at: "2020-01-22T19:33:11Z" },
    { number: 2, name: "Test", status: "completed", conclusion: "failure", started_at: "2020-01-22T19:33:11Z", completed_at: "2020-01-22T19:33:20Z" }] }
export const text = "\uFEFFname: CI\non: [push]\n# raw comment café\njobs: {}\n"
export const content = { type: "file", name: "build.yml", path: workflow.path,
  sha: createHash("sha1").update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest("hex"), size: Buffer.byteLength(text),
  encoding: "base64", content: Buffer.from(text).toString("base64").replace(/(.{60})/g, "$1\n"),
  url: `https://api.github.com/repos/acme/renamed/contents/${workflow.path}`, git_url: null, html_url: null, download_url: null }

export const response = (data: unknown, headers: Readonly<Record<string, string | undefined>> = {}): ActionsContract.Response => ({
  status: 200, data: Schema.decodeUnknownSync(Schema.Json)(data),
  headers: Object.fromEntries(Object.entries(headers).filter((entry): entry is [string, string] => entry[1] !== undefined)),
})
export const key = (input: ActionsContract.Request) => `${input.path}${input.query ? `?${new URLSearchParams(Object.entries(input.query).map(([key, value]) => [key, String(value)]))}` : ""}`

export function recorded(initial: Record<string, ActionsContract.Response | ActionsError> = {}) {
  const routes: Record<string, ActionsContract.Response | ActionsError> = { "repositories/9347": response(repo), ...initial }
  const calls: ActionsContract.Request[] = []
  const state: { after?: (request: ActionsContract.Request) => void } = {}
  const transport: ActionsContract.Transport = {
    resolve: () => Effect.die("Read adapter must use immutable native repository ID"),
    request: (_, input) => Effect.suspend(() => {
      calls.push(input)
      const result = routes[key(input)]
      if (!result) return Effect.die(`Unrecorded GitHub request: ${key(input)}`)
      state.after?.(input)
      return result instanceof ActionsError ? Effect.fail(result) : Effect.succeed(result)
    }), bytes: () => Stream.die("Unexpected transfer"), upload: () => Effect.die("Unexpected upload"),
  }
  return { adapter: ActionsGitHubRead.make({ transport }), transport, routes, calls, state }
}

// Repository A renames after ID lookup. Repository B reuses its old display path
// and returns complete, valid native payloads there, not a transport error.
export function pathReuse() {
  const textB = "name: Repository B\non: [push]\njobs: {}\n"
  const second = { repo: { ...repo, id: 9999 }, workflow: { ...workflow, id: 161336, name: "Repository B" },
    commit: "f".repeat(40), text: textB, content: { ...content,
      sha: createHash("sha1").update(`blob ${Buffer.byteLength(textB)}\0`).update(textB).digest("hex"),
      size: Buffer.byteLength(textB), content: Buffer.from(textB).toString("base64") } }
  const fixture = recorded({
    "repositories/9347/actions/workflows?page=1&per_page=50": response({ total_count: 1, workflows: [workflow] }),
    "repositories/9347/actions/workflows?page=1&per_page=1": response({ total_count: 1, workflows: [workflow] }),
    "repositories/9347/commits/main": response({ sha }),
    [`repositories/9347/contents/${workflow.path}?ref=${sha}`]: response(content),
    "repositories/9347/actions/runs?page=1&per_page=50": response({ total_count: 1, workflow_runs: [run] }),
    "repositories/9347/actions/runs/30433642": response(run),
    "repositories/9347/actions/runs/30433642/attempts/3/jobs?page=1&per_page=50": response({ total_count: 1, jobs: [{ ...job, run_attempt: 3 }] }),
    "repos/acme/renamed/actions/workflows?page=1&per_page=50": response({ total_count: 1, workflows: [second.workflow] }),
    "repos/acme/renamed/commits/main": response({ sha: second.commit }),
    [`repos/acme/renamed/contents/${workflow.path}?ref=${second.commit}`]: response(second.content),
  })
  fixture.state.after = (request) => {
    if (request.path !== "repositories/9347") return
    fixture.routes[request.path] = response({ ...repo, full_name: "acme/stable-a" })
  }
  return { ...fixture, second }
}

// W1's real GitHub metadata boundary: literal args, inherited raw subprocess,
// bounded capture and HTTP/JSON decoder. Only CLI/provider replies are fixtures.
export const subprocess = Effect.fnUntraced(function* () {
  const root = yield* Effect.acquireRelease(Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), "github-read-"))),
    (root) => Effect.promise(() => fs.rm(root, { recursive: true, force: true })))
  const proc = yield* AppProcess.Service
  const calls: ActionsContract.Request[] = []
  const request = Effect.fnUntraced(function* (binding: Actions.Binding, input: ActionsContract.Request) {
    calls.push(input)
    const endpoint = yield* ActionsCli.endpoint(binding.provider, input)
    const command = ActionsCli.command(root, binding.provider, process.execPath,
      [path.resolve(import.meta.dirname, "github-read-cli.ts"), root, ...ActionsCli.args(binding.provider, input, endpoint, true)], "ignore")
    return yield* ActionsProcess.capture(proc, binding.provider, command).pipe(Effect.flatMap((result) => ActionsResponse.parse(binding.provider, result)))
  })
  const transport: ActionsContract.Transport = { request, resolve: () => Effect.die("Unexpected resolve"),
    bytes: () => Stream.die("Unexpected bytes"), upload: () => Effect.die("Unexpected upload") }
  return { root, calls, adapter: ActionsGitHubRead.make({ transport }),
    reply: (routes: Record<string, { status?: number; data?: ActionsContract.Json; raw?: string; padding?: number; code?: number; headers?: Record<string, string> }>) =>
      Effect.promise(() => Bun.write(path.join(root, "routes.json"), JSON.stringify(routes))) }
})
