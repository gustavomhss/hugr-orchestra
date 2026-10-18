import { expect } from "bun:test"
import path from "node:path"
import { Effect, Stream } from "effect"
import { ActionsContract } from "../../src/actions/contract"
import { ActionsError } from "../../src/actions/error"
import { ActionsGitLabRead } from "../../src/actions/gitlab"
import { ActionsHttp } from "../../src/actions/transport/http"
import { AppProcess } from "../../src/process"
import { LayerNode } from "../../src/effect/layer-node"
import { ActionsNetworkFixture } from "../fixture/actions-network"
import { testEffect } from "../lib/effect"
import { GitLabReadFixture } from "./gitlab-read-fixture"

const it = testEffect(LayerNode.compile(AppProcess.node))

it.live("GitLab read adapter uses W1 real HTTPS metadata seam with native shape, pinned source and denied auth", Effect.gen(function* () {
  const fixture = yield* ActionsNetworkFixture.make()
  const snapshot = { headers: { "PRIVATE-TOKEN": "synthetic-read-fixture" },
    ca: [yield* Effect.promise(() => Bun.file(path.join(fixture.root, "cert.pem")).text())], cert: undefined, key: undefined }
  const binding = { ...GitLabReadFixture.binding, provider: { ...fixture.provider, version: "17.11.0" } }
  const uncalled = new ActionsError({ kind: "invalid_input", message: "Read fixture forbids non-read operations" })
  const transport: ActionsContract.Transport = { resolve: () => Effect.fail(uncalled), upload: () => Effect.fail(uncalled), bytes: () => Stream.fail(uncalled),
    request: (binding, input) => ActionsHttp.metadata(binding.provider, snapshot, input) }
  const adapter = ActionsGitLabRead.make({ transport })
  const text = "# real HTTPS native JSON framing\r\nbuild:\r\n  script: echo olá\r\n"
  fixture.state.handler = (request, response) => {
    const url = new URL(request.url, fixture.provider.apiOrigin)
    const data = url.pathname === "/api/v4/metadata" ? { version: "17.11.0-ee", revision: "fixture", enterprise: true }
      : url.pathname === "/api/v4/projects/21" ? GitLabReadFixture.project
      : url.pathname === "/api/v4/projects/21/pipelines" ? [GitLabReadFixture.pipeline]
      : url.pathname === "/api/v4/projects/21/repository/commits/main" ? { id: GitLabReadFixture.commit }
      : url.pathname === "/api/v4/projects/21/repository/files/.gitlab-ci.yml" && url.searchParams.get("ref") === GitLabReadFixture.commit
        ? GitLabReadFixture.file(".gitlab-ci.yml", text) : undefined
    response.writeHead(data === undefined ? 400 : 200, { "Content-Type": "application/json", "X-Next-Page": "" })
    response.end(JSON.stringify(data ?? { message: "Unexpected native endpoint" }))
  }
  const runs = yield* adapter.runs(binding, { event: "push", createdAfter: "2022-09-01T00:00:00Z", updatedBefore: "2022-10-01T00:00:00Z" })
  expect(runs.items[0]).toMatchObject({ id: "287", event: "push", commit: GitLabReadFixture.commit,
    updatedAt: GitLabReadFixture.pipeline.updated_at, repositoryID: "21" })
  expect(runs).not.toHaveProperty("total")
  expect((yield* adapter.source(binding, { path: ".gitlab-ci.yml", ref: "main" })).text).toBe(text)
  expect(fixture.requests.map((request) => request.path)).toEqual([
    "/api/v4/metadata", "/api/v4/projects/21", "/api/v4/projects/21/pipelines?per_page=50&source=push&created_after=2022-09-01T00%3A00%3A00Z&updated_before=2022-10-01T00%3A00%3A00Z&page=1", "/api/v4/projects/21",
    "/api/v4/projects/21/repository/commits/main", `/api/v4/projects/21/repository/files/.gitlab-ci.yml?ref=${GitLabReadFixture.commit}`,
  ])
  expect(fixture.requests.every((request) => request.headers["private-token"] === "synthetic-read-fixture")).toBe(true)
  for (const [status, kind] of [[401, "not_authenticated"], [403, "permission_denied"]] as const) {
    fixture.state.handler = (_request, response) => { response.writeHead(status, { "Content-Type": "application/json" }); response.end('{"message":"synthetic-read-fixture"}') }
    const error = yield* adapter.workflows(binding, {}).pipe(Effect.flip)
    expect(error).toMatchObject({ kind, disposition: "definitely_rejected" })
    expect(JSON.stringify(error)).not.toContain("synthetic-read-fixture")
  }
  fixture.state.handler = (_request, response) => { response.writeHead(200, { "Content-Type": "application/json" }); response.end('{"id":21') }
  expect(yield* adapter.workflows(binding, {}).pipe(Effect.flip)).toMatchObject({ kind: "transport_failed" })
}), 30_000)

it.live("GitLab W1 real HTTPS metadata version mutation rejects newer client on old server and accepts older client on new server", Effect.gen(function* () {
  const fixture = yield* ActionsNetworkFixture.make()
  const snapshot = { headers: { "PRIVATE-TOKEN": "synthetic-metadata-fixture" },
    ca: [yield* Effect.promise(() => Bun.file(path.join(fixture.root, "cert.pem")).text())], cert: undefined, key: undefined }
  const unused = new ActionsError({ kind: "invalid_input", message: "Read fixture forbids non-read operations" })
  const transport: ActionsContract.Transport = { resolve: () => Effect.fail(unused), upload: () => Effect.fail(unused), bytes: () => Stream.fail(unused),
    request: (binding, request) => ActionsHttp.metadata(binding.provider, snapshot, request) }
  const adapter = ActionsGitLabRead.make({ transport })
  const state = { version: "17.10.0-ee" }
  fixture.state.handler = (request, response) => {
    const url = new URL(request.url, fixture.provider.apiOrigin)
    const data = url.pathname === "/api/v4/metadata" ? { version: state.version, revision: "fixture", enterprise: true }
      : url.pathname === "/api/v4/projects/21" ? GitLabReadFixture.project
      : url.pathname === "/api/v4/projects/21/pipelines" ? [GitLabReadFixture.pipeline] : undefined
    response.writeHead(data === undefined ? 404 : 200, { "Content-Type": "application/json" })
    response.end(JSON.stringify(data ?? { message: "Unexpected endpoint" }))
  }
  expect(yield* adapter.runs({ ...GitLabReadFixture.binding, provider: { ...fixture.provider, version: "99.0.0" } },
    { createdAfter: "2022-09-01T00:00:00Z" }).pipe(Effect.flip)).toMatchObject({ kind: "capability_unavailable" })
  expect(fixture.requests.map((request) => request.path)).toEqual(["/api/v4/metadata"])
  state.version = "17.11.0-ee"
  expect((yield* adapter.runs({ ...GitLabReadFixture.binding, provider: { ...fixture.provider, version: "8.0.0" } },
    { createdAfter: "2022-09-01T00:00:00Z" })).items[0].id).toBe("287")
  expect(fixture.requests.map((request) => request.path)).toEqual(["/api/v4/metadata", "/api/v4/metadata", "/api/v4/projects/21",
    "/api/v4/projects/21/pipelines?per_page=50&created_after=2022-09-01T00%3A00%3A00Z&page=1"])
  state.version = "14.2.0-ee" // Includes a native source parameter, but its finder can ignore it behind a flag.
  const before = fixture.requests.length
  expect(yield* adapter.runs({ ...GitLabReadFixture.binding, provider: { ...fixture.provider, version: "99.0.0" } },
    { event: "push" }).pipe(Effect.flip)).toMatchObject({ kind: "capability_unavailable" })
  expect(fixture.requests.slice(before).map((request) => request.path)).toEqual(["/api/v4/metadata"])
  expect(fixture.requests.every((request) => request.headers["private-token"] === "synthetic-metadata-fixture")).toBe(true)
  for (const [status, kind] of [[401, "not_authenticated"], [403, "permission_denied"], [429, "rate_limited"], [404, "not_found"]] as const) {
    fixture.state.handler = (_request, response) => {
      response.writeHead(status, { "Content-Type": "application/json", ...(status === 429 ? { "Retry-After": "5" } : {}) })
      response.end('{"message":"synthetic-metadata-fixture"}')
    }
    const before = fixture.requests.length
    const error = yield* adapter.runs({ ...GitLabReadFixture.binding, provider: fixture.provider }, { event: "push" }).pipe(Effect.flip)
    expect(error).toMatchObject({ kind })
    expect(JSON.stringify(error)).not.toContain("synthetic-metadata-fixture")
    if (status === 429) expect(error.retryAfter).toBe(5)
    expect(fixture.requests.slice(before).map((request) => request.path)).toEqual(["/api/v4/metadata"])
  }
}), 30_000)
