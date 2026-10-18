export * as GitHubCommandFixture from "./github-command"

import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Actions } from "@orchestra/schema/actions"
import { Effect, Stream } from "effect"
import { ActionsContract } from "../../src/actions/contract"
import { ActionsError } from "../../src/actions/error"
import { ActionsGitHubRead } from "../../src/actions/github"
import { ActionsGitHubCommands } from "../../src/actions/github/commands"
import { ActionsCli } from "../../src/actions/transport/cli"
import { ActionsProcess } from "../../src/actions/transport/process"
import { ActionsResponse } from "../../src/actions/transport/response"
import { AppProcess } from "../../src/process"
import { LayerNode } from "../../src/effect/layer-node"
import { testEffect } from "../lib/effect"
import { GitHubReadFixture } from "./github-read"

export const it = testEffect(LayerNode.compile(AppProcess.node))
export const binding = GitHubReadFixture.binding
export const root = `repositories/${binding.projectID}`
export const pathName = GitHubReadFixture.workflow.path
export const commit = "a".repeat(40)
export const text = `name: Native Dispatch
on:
  workflow_dispatch:
    inputs:
      message:
        type: string
        required: true
      flag:
        type: boolean
        default: false
      count:
        type: number
        default: 3
      choice:
        type: choice
        options: [blue, green]
        default: blue
      environment:
        type: environment
        default: prod
jobs:
  native:
    runs-on: ubuntu-latest
    steps:
      - run: echo fixture
`
export const content = (text: string) => ({ ...GitHubReadFixture.content, path: pathName,
  sha: createHash("sha1").update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest("hex"),
  size: Buffer.byteLength(text), content: Buffer.from(text).toString("base64") })
export const run = { ...GitHubReadFixture.run, conclusion: "failure" }
export const job = { ...GitHubReadFixture.job, run_attempt: run.run_attempt }
export const reply = GitHubReadFixture.response
export const key = (request: ActionsContract.Request) => `${request.method} ${GitHubReadFixture.key(request)}`
export const intent = (kind: Actions.OperationKind = "workflow.dispatch", target: Actions.OperationTarget = { workflowID: "161335", ref: "release" }, expected: Actions.OperationExpected = {}) =>
  Actions.OperationIntent.make({ clientID: "command-owner", binding: { id: binding.id, revision: binding.revision }, kind, target, expected })
export const dispatch = { provider: "github", ref: "release", inputs: { message: "native fixture" } } as const

export function recorded() {
  const routes: Record<string, ActionsContract.Response | ActionsError> = {
    [`GET ${root}`]: reply(GitHubReadFixture.repo, { "x-oauth-scopes": "repo", "x-github-api-version-selected": "2026-03-10" }),
    "GET user": reply({ id: 1, login: binding.account }),
    [`GET ${root}/actions/workflows/161335`]: reply(GitHubReadFixture.workflow, { etag: '"workflow-v1"' }),
    [`GET ${root}/commits/main`]: reply({ sha: GitHubReadFixture.sha }),
    [`GET ${root}/commits/release`]: reply({ sha: commit }),
    [`GET ${root}/commits/${run.head_sha}`]: reply({ sha: run.head_sha }),
    [`GET ${root}/contents/${pathName}?ref=${GitHubReadFixture.sha}`]: reply(content(text)),
    [`GET ${root}/contents/${pathName}?ref=${commit}`]: reply(content(text)),
    [`GET ${root}/environments/prod`]: reply({ id: 41, name: "prod" }),
    [`POST ${root}/actions/workflows/161335/dispatches`]: reply({ workflow_run_id: 9101,
      run_url: `https://api.github.com/${root}/actions/runs/9101`, html_url: "https://github.com/acme/renamed/actions/runs/9101" }),
    [`PUT ${root}/actions/workflows/161335/enable`]: { status: 204, headers: {}, data: null },
    [`PUT ${root}/actions/workflows/161335/disable`]: { status: 204, headers: {}, data: null },
    [`GET ${root}/actions/runs/30433642`]: reply(run, { etag: '"run-v1"' }),
    [`POST ${root}/actions/runs/30433642/rerun`]: { status: 201, headers: {}, data: null },
    [`POST ${root}/actions/runs/30433642/rerun-failed-jobs`]: { status: 204, headers: {}, data: null },
    [`POST ${root}/actions/runs/30433642/cancel`]: { status: 202, headers: {}, data: null },
    [`POST ${root}/actions/runs/30433642/force-cancel`]: { status: 202, headers: {}, data: null },
    [`DELETE ${root}/actions/runs/30433642`]: { status: 204, headers: {}, data: null },
    [`POST ${root}/actions/runs/30433642/approve`]: { status: 201, headers: {}, data: null },
    [`GET ${root}/actions/jobs/399444496`]: reply(job, { etag: '"job-v1"' }),
    [`POST ${root}/actions/jobs/399444496/rerun`]: { status: 201, headers: {}, data: null },
  }
  const calls: ActionsContract.Request[] = []
  const state: { after?: (request: ActionsContract.Request) => void } = {}
  const transport: ActionsContract.Transport = {
    resolve: () => Effect.die("Command must not resolve a mutable repository path"),
    request: (_, request) => Effect.suspend(() => {
      calls.push(request)
      const response = routes[key(request)]
      if (!response) return Effect.die(`Unrecorded command request: ${key(request)}`)
      state.after?.(request)
      return response instanceof ActionsError ? Effect.fail(response) : Effect.succeed(response)
    }), bytes: () => Stream.die("Unexpected transfer"), upload: () => Effect.die("Unexpected upload"),
  }
  const reader = ActionsGitHubRead.make({ transport })
  return { routes, calls, state, transport, reader, commands: ActionsGitHubCommands.make({ transport, reader }),
    writes: () => calls.filter((request) => request.method !== "GET") }
}

// Real W1 inherited spawner/capture/decoder. Provider and gh replies remain synthetic.
export const subprocess = Effect.fnUntraced(function* () {
  const root = yield* Effect.acquireRelease(Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), "github-command-"))),
    (root) => Effect.promise(() => fs.rm(root, { recursive: true, force: true })))
  const proc = yield* AppProcess.Service
  const requests: ActionsContract.Request[] = []
  const request = Effect.fnUntraced(function* (binding: Actions.Binding, input: ActionsContract.Request) {
    requests.push(input)
    const endpoint = yield* ActionsCli.endpoint(binding.provider, input)
    const body = input.body === undefined ? Stream.empty : Stream.make(new TextEncoder().encode(JSON.stringify(input.body)))
    const command = ActionsCli.command(root, binding.provider, process.execPath,
      [path.resolve(import.meta.dirname, "github-command-cli.ts"), root, ...ActionsCli.args(binding.provider, input, endpoint, true)], input.body === undefined ? "ignore" : "pipe")
    return yield* ActionsProcess.capture(proc, binding.provider, command, body).pipe(Effect.flatMap((result) => ActionsResponse.parse(binding.provider, result)))
  })
  const transport: ActionsContract.Transport = { request, resolve: () => Effect.die("Unexpected mutable resolve"),
    bytes: () => Stream.die("Unexpected bytes"), upload: () => Effect.die("Unexpected upload") }
  const reader = ActionsGitHubRead.make({ transport })
  return { root, requests, commands: ActionsGitHubCommands.make({ transport, reader }),
    reply: (routes: Record<string, { status?: number; data?: ActionsContract.Json; raw?: string; headers?: Readonly<Record<string, string>>; code?: number }>) =>
      Effect.promise(() => Bun.write(path.join(root, "routes.json"), JSON.stringify(routes))),
    calls: () => Effect.promise(() => Bun.file(path.join(root, "calls.jsonl")).text()) }
})
