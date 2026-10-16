import { expect } from "bun:test"
import { Effect } from "effect"
import { AppProcess } from "../src/process"
import { ActionsResourceGraphQL } from "../src/actions/resources/gitlab-graphql"
import { ActionsHttpFixture } from "./fixture/actions-http"
import { ActionsTransportFixture } from "./fixture/actions-transport"
import { expectSpawn } from "./fixture/omni-expect"

const it = ActionsTransportFixture.it

it.live("cache clear uses real bound HTTPS /api/graphql with same credential snapshot actor check", Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const fixture = yield* ActionsHttpFixture.make()
  const env = { GLAB_CONFIG_DIR: fixture.config, GITLAB_TOKEN: "", GITLAB_ACCESS_TOKEN: "", OAUTH_TOKEN: "", CI_JOB_TOKEN: "", JOB_TOKEN: "", GLAB_IS_OAUTH2: "", GLAB_USE_KEYRING: "false" }
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]))
  yield* Effect.acquireRelease(Effect.sync(() => Object.assign(process.env, env)), () => Effect.sync(() => {
    Object.entries(previous).forEach(([key, value]) => value === undefined ? delete process.env[key] : process.env[key] = value)
  }))
  fixture.serverState.handler = (request, response) => {
    if (request.url === "/api/v4/user") {
      response.writeHead(200, { "Content-Type": "application/json" })
      response.end('{"username":"fixture-user"}')
      return
    }
    request.once("end", () => {
      response.writeHead(200, { "Content-Type": "application/json" })
      response.end('{"data":{"runnerCacheClear":{"errors":[]}}}')
    })
  }
  const proc = yield* AppProcess.Service
  const graphql = ActionsResourceGraphQL.make(fixture.root, proc)
  expect(yield* graphql(fixture.binding(), { kind: "cacheClear" })).toMatchObject({ status: 200, data: { data: { runnerCacheClear: { errors: [] } } } })
  expect(fixture.requests.map((request) => [request.method, request.path])).toEqual([["GET", "/api/v4/user"], ["POST", "/api/graphql"]])
  expect(fixture.requests.every((request) => request.headers["private-token"] === "synthetic-provider")).toBe(true)
  expect(fixture.requests[1].prefix.toString()).toContain('"projectId":"gid://gitlab/Project/9347"')
  expect(fixture.requests[1].prefix.toString()).toContain("runnerCacheClear")
  fixture.serverState.handler = (request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" })
    response.end('{"username":"changed-actor"}')
  }
  expect(yield* graphql(fixture.binding(), { kind: "cacheClear" }).pipe(Effect.flip)).toMatchObject({ kind: "binding_stale", disposition: "definitely_unsent" })
  expect(fixture.requests.filter((request) => request.path === "/api/graphql")).toHaveLength(1)
}), 120_000)

it.live("real GraphQL TLS peer consuming mutation before reset remains unknown, redacted and not retried", Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const fixture = yield* ActionsHttpFixture.make()
  const env = { GLAB_CONFIG_DIR: fixture.config, GITLAB_TOKEN: "", GITLAB_ACCESS_TOKEN: "", OAUTH_TOKEN: "", CI_JOB_TOKEN: "", JOB_TOKEN: "", GLAB_IS_OAUTH2: "", GLAB_USE_KEYRING: "false" }
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]))
  yield* Effect.acquireRelease(Effect.sync(() => Object.assign(process.env, env)), () => Effect.sync(() => {
    Object.entries(previous).forEach(([key, value]) => value === undefined ? delete process.env[key] : process.env[key] = value)
  }))
  fixture.serverState.handler = (request, response) => {
    if (request.url === "/api/v4/user") {
      response.writeHead(200, { "Content-Type": "application/json" })
      response.end('{"username":"fixture-user"}')
      return
    }
    request.once("end", () => request.socket.destroy())
  }
  const proc = yield* AppProcess.Service
  const error = yield* ActionsResourceGraphQL.make(fixture.root, proc)(fixture.binding(), { kind: "cacheClear" }).pipe(Effect.flip)
  expect(error).toMatchObject({ disposition: "unknown" })
  expect(JSON.stringify(error)).not.toContain("synthetic-provider")
  expect(fixture.requests.filter((request) => request.path === "/api/graphql")).toHaveLength(1)
  expect(fixture.requests[1].prefix.toString()).toContain("runnerCacheClear")
}), 120_000)
