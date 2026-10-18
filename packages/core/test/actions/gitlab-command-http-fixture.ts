export * as GitLabCommandHttpFixture from "./gitlab-command-http-fixture"

import fs from "node:fs/promises"
import path from "node:path"
import { Effect } from "effect"
import { ActionsContract } from "../../src/actions/contract"
import { ChildProcess } from "effect/unstable/process"
import { ActionsGitlab } from "../../src/actions/transport/gitlab"
import { ActionsGitLabRead } from "../../src/actions/gitlab"
import { ActionsGitLabCommands } from "../../src/actions/gitlab/commands"
import { AppProcess } from "../../src/process"
import { ActionsNetworkFixture } from "../fixture/actions-network"
import { GitLabReadFixture } from "./gitlab-read-fixture"
import { GitLabCommandFixture } from "./gitlab-command-fixture"

export const make = Effect.fnUntraced(function* () {
  const network = yield* ActionsNetworkFixture.make()
  const executable = yield* network.install()
  const original = { PATH: process.env.PATH, Path: process.env.Path }
  yield* Effect.acquireRelease(Effect.sync(() => {
    process.env.PATH = `${path.dirname(executable)}${path.delimiter}${original.PATH ?? original.Path ?? ""}`
    if (process.platform === "win32") process.env.Path = process.env.PATH
  }), () => Effect.sync(() => Object.entries(original).forEach(([key, value]) => value === undefined ? delete process.env[key] : process.env[key] = value)))
  const config = path.join(network.root, "config")
  yield* Effect.promise(() => fs.mkdir(config, { mode: 0o700 }))
  yield* Effect.promise(() => fs.writeFile(path.join(config, "config.yml"), JSON.stringify({ hosts: { [network.provider.hostname]: {
    token: "synthetic-provider-command", ca_cert: path.join(network.root, "cert.pem"),
  } } }), { mode: 0o600 }))
  const proc = yield* AppProcess.Service
  const observed: string[][] = []
  const transport = ActionsGitlab.make(network.root, { ...proc, spawn: (command) => {
    if (command._tag !== "StandardCommand" || !command.command.toLowerCase().includes("glab")) return proc.spawn(command)
    observed.push([...command.args])
    if (command.args[0] !== "version" && !(command.args[0] === "config" && command.args[1] === "get"))
      return Effect.die("Command HTTPS fixture forbids CLI API/auth network calls")
    return proc.spawn(ChildProcess.make(executable, command.args, { ...command.options, env: { ...command.options.env,
      GLAB_CONFIG_DIR: config, GITLAB_TOKEN: "", GITLAB_ACCESS_TOKEN: "", OAUTH_TOKEN: "", CI_JOB_TOKEN: "", JOB_TOKEN: "", GLAB_USE_KEYRING: "false", GLAB_IS_OAUTH2: "",
    } }))
  } })
  const state = { actor: "root", status: 201, hold: false, reset: false }
  const content: { project: ActionsContract.Json; text: string; lateWrongSource: boolean } = {
    project: GitLabCommandFixture.project, text: GitLabCommandFixture.text, lateWrongSource: false,
  }
  network.state.handler = (request, response) => {
    const url = new URL(request.url, network.provider.apiOrigin)
    if (request.method !== "GET") {
      request.once("end", () => {
        if (state.reset) { request.socket.destroy(); return }
        if (state.hold) return
        response.writeHead(state.status, { "Content-Type": "application/json" })
        response.end(JSON.stringify(state.status === 201 ? url.pathname.endsWith("/jobs/8/retry") ? { id: 9 }
          : { ...GitLabCommandFixture.pipeline, id: 501, source: url.pathname.endsWith("/trigger/pipeline") ? "trigger" : "api", status: "pending" }
          : { message: "synthetic-trigger-secret" }))
      })
      return
    }
    const data = url.pathname === "/api/v4/user" ? { id: 1, username: state.actor }
      : url.pathname === "/api/v4/projects/21" ? content.project
      : url.pathname === "/api/v4/projects/21/pipelines/287" ? GitLabCommandFixture.pipeline
      : url.pathname === "/api/v4/projects/21/jobs/8" ? GitLabCommandFixture.job
      : url.pathname === "/api/v4/projects/21/jobs/9" ? { ...GitLabCommandFixture.job, id: 9,
        pipeline: { ...GitLabCommandFixture.job.pipeline, sha: content.lateWrongSource ? "b".repeat(40) : GitLabCommandFixture.commit } }
      : url.pathname === "/api/v4/projects/21/repository/branches/main" ? { name: "main", protected: false, commit: { id: GitLabCommandFixture.commit } }
      : url.pathname === `/api/v4/projects/21/repository/commits/${GitLabCommandFixture.commit}` ? { id: GitLabCommandFixture.commit }
      : url.pathname === "/api/v4/projects/21/repository/files/.gitlab-ci.yml" ? GitLabReadFixture.file(".gitlab-ci.yml", content.text) : undefined
    response.writeHead(data === undefined ? 404 : 200, { "Content-Type": "application/json" })
    response.end(JSON.stringify(data ?? { message: "Fixture native target not found" }))
  }
  const reader = ActionsGitLabRead.make({ transport })
  return { ...network, observed, state, content, service: ActionsGitLabCommands.make({ transport, reader }),
    binding: { ...GitLabCommandFixture.binding, provider: network.provider, directory: network.root } }
})
