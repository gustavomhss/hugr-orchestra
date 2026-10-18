export * as ActionsResourceFixture from "./actions-resource-runtime"

import { createServer, request } from "node:http"
import { Actions } from "@orchestra/schema/actions"
import { Effect, Option, Schema, Stream } from "effect"
import { ActionsContract } from "../../src/actions/contract"
import { ActionsError } from "../../src/actions/error"
import { ActionsResourceGraphQL } from "../../src/actions/resources/gitlab-graphql"

export const commit = "a".repeat(40)
export const blob = "b".repeat(40)
export const githubRunner = { id: 71, name: "build-linux", os: "linux", status: "online", busy: false,
  labels: [{ name: "self-hosted", type: "read-only" }, { name: "Linux", type: "read-only" }, { name: "X64", type: "read-only" }, { name: "build", type: "custom" }] }
export const gitlabRunner = { id: 71, description: "build-linux", runner_type: "project_type", status: "online", paused: false,
  job_execution_status: "idle", tag_list: ["linux", "x64", "build"], locked: false, projects: [{ id: 9347 }] }
export const schedule = { id: 13, description: "Nightly", cron: "17 2 * * *", cron_timezone: "UTC", ref: "refs/heads/dev", active: true,
  updated_at: "2026-10-13T00:00:00Z", owner: { id: 913, username: "fixture-user" }, inputs: [], variables: [] }
export const cache = { id: 87, key: "deps-lock", ref: "refs/heads/dev", version: "native-cache-version", size_in_bytes: 456,
  created_at: "2026-10-12T00:00:00Z", last_accessed_at: "2026-10-13T00:00:00Z" }
export type Observed = { readonly method: string; readonly path: string; readonly query: Readonly<Record<string, string>>; readonly body: ActionsContract.Json }
export type Reply = { readonly status?: number; readonly headers?: Readonly<Record<string, string>>; readonly data?: ActionsContract.Json; readonly reset?: boolean }

export const make = Effect.fnUntraced(function* (provider: Actions.ProviderKind = "github") {
  const requests: Observed[] = []
  const state = { handler: undefined as ((request: Observed) => Reply | Promise<Reply> | undefined) | undefined,
    ownerProjectID: "9347", metadataVersion: "18.1.0", username: "fixture-user", source: "name: Nightly\non:\n  push:\n  schedule:\n    - cron: '17 2 * * *' # keep cron comment\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok # keep job comment\n" }
  const native = (observed: Observed): Reply => {
    if (observed.path === "user") return { data: { id: 913, login: state.username, username: state.username } }
    if (observed.path === "metadata") return { data: { version: state.metadataVersion } }
    if (observed.path === "repositories/9347") return { data: { id: 9347, full_name: "acme/widget", default_branch: "dev", private: true,
      permissions: { push: true, admin: true }, archived: false }, headers: { "x-oauth-scopes": "repo, workflow" } }
    if (observed.path === "projects/9347") return { data: { id: 9347, path_with_namespace: "acme/widget", name: "widget", default_branch: "dev",
      ci_config_path: null, jobs_enabled: true, archived: false, permissions: { project_access: { access_level: 40 }, group_access: null } } }
    if (observed.path.includes("/commits/")) return { data: { sha: commit, id: commit } }
    if (observed.path === "repositories/9347/actions/runners") return { data: { total_count: 1, runners: [githubRunner] } }
    if (observed.path === "repositories/9347/actions/runners/71") return observed.method === "DELETE" ? { status: 204 } : { data: githubRunner }
    if (observed.path === "repositories/9347/actions/runners/71/labels") return { data: { labels: [{ name: "gpu", type: "custom" }] } }
    if (observed.path === "projects/9347/runners") return { data: [gitlabRunner], headers: { "x-next-page": "", "x-total": "1" } }
    if (observed.path === "runners/71") return { data: gitlabRunner }
    if (observed.path === "api/graphql") return { data: Schema.is(Schema.Struct({ kind: Schema.Literal("cacheClear") }))(observed.body)
      ? { data: { runnerCacheClear: { errors: [] } } } : { data: { runner: { id: "gid://gitlab/Ci::Runner/71", runnerType: "PROJECT_TYPE",
        ownerProject: { id: `gid://gitlab/Project/${state.ownerProjectID}` }, tagList: gitlabRunner.tag_list } } } }
    if (observed.path === "repositories/9347/actions/caches") return { data: { total_count: 1, actions_caches: [cache] } }
    if (observed.path === "repositories/9347/actions/caches/87") return { status: 204 }
    if (observed.path === "repositories/9347/actions/cache/usage") return { data: { full_name: "acme/widget", active_caches_size_in_bytes: 456, active_caches_count: 1 } }
    if (observed.path === "projects/9347/pipeline_schedules") return observed.method === "GET" ? { data: [schedule], headers: { "x-next-page": "", "x-total": "1" } } : { data: schedule, status: 201 }
    if (observed.path === "projects/9347/pipeline_schedules/13") return { data: schedule }
    if (observed.path === "repositories/9347/actions/workflows/24") return { data: { id: 24, path: ".github/workflows/nightly.yml", name: "Nightly", state: "active" } }
    if (observed.path === "fixture/workflows") return { data: { items: [{ id: "24", bindingID: binding.id, name: "Nightly", path: ".github/workflows/nightly.yml", state: "active", dispatchable: false }], capturedAt: Date.now() } }
    if (observed.path === "fixture/source") return { data: { bindingID: binding.id, path: observed.query.path,
      ref: observed.query.ref, commit, version: blob, text: state.source, editable: true } }
    return { status: 404, data: { message: "Unknown fixture endpoint" } }
  }
  const server = yield* Effect.acquireRelease(Effect.promise(() => new Promise<ReturnType<typeof createServer>>((resolve, reject) => {
    const handle = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on("data", (chunk: Buffer) => chunks.push(chunk))
      request.once("end", () => {
        const address = new URL(request.url ?? "/", "http://localhost")
        const body = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Json))(Buffer.concat(chunks).toString() || "null")
        const observed = { method: request.method ?? "GET", path: address.pathname.replace(/^\//, ""), query: Object.fromEntries(address.searchParams), body: Option.isSome(body) ? body.value : null }
        requests.push(observed)
        void Promise.resolve(state.handler?.(observed) ?? native(observed)).then((reply) => {
          if (reply.reset) { request.socket.destroy(); return }
          response.writeHead(reply.status ?? 200, { "content-type": "application/json", ...reply.headers })
          response.end(reply.data === undefined ? "" : JSON.stringify(reply.data))
        }, () => request.socket.destroy())
      })
    })
    handle.once("error", reject)
    handle.listen(0, "127.0.0.1", () => resolve(handle))
  })), (handle) => Effect.promise(() => new Promise<void>((resolve) => { handle.closeAllConnections(); handle.close(() => resolve()) })))
  const address = server.address()
  if (!address || typeof address === "string") return yield* Effect.die("Resource fixture listener did not allocate a TCP port")
  const binding = Actions.Binding.make({ id: Actions.BindingID.make("ab_resource-fixture"), revision: 1, projectID: "9347", projectPath: "acme/widget",
    account: "fixture-user", directory: "/fixture", remote: "origin", provider: provider === "github"
      ? { kind: "github", hostname: "github.com", apiOrigin: "https://api.github.com" }
      : { kind: "gitlab", hostname: "gitlab.com", apiOrigin: "https://gitlab.com/api/v4", version: "99.0.0" } })
  const send: ActionsContract.Transport["request"] = (_binding, input) => Effect.tryPromise({
    try: async (signal) => {
      const url = new URL(input.path, `http://127.0.0.1:${address.port}/`)
      Object.entries(input.query ?? {}).forEach(([key, value]) => url.searchParams.set(key, String(value)))
      // A transport fixture must not replay DELETE after the peer consumed it.
      // Bun fetch retries reusable idempotent connections; a fresh raw request does not.
      return new Promise<ActionsContract.Response>((resolve, reject) => {
        const sent = request(url, { method: input.method, signal, agent: false,
          headers: input.body === undefined ? undefined : { "Content-Type": "application/json" } }, (response) => {
          const chunks: Buffer[] = []
          response.on("data", (chunk: Buffer) => chunks.push(chunk))
          response.once("error", reject)
          response.once("end", () => {
            const result = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Json))(Buffer.concat(chunks).toString() || "null")
            if (Option.isNone(result)) { reject(new Error("Invalid fixture JSON")); return }
            resolve({ status: response.statusCode ?? 0, headers: Object.fromEntries(Object.entries(response.headers)
              .flatMap(([key, value]) => value === undefined ? [] : [[key, Array.isArray(value) ? value.join(", ") : value]])), data: result.value })
          })
        })
        sent.once("error", reject)
        sent.end(input.body === undefined ? undefined : JSON.stringify(input.body))
      })
    }, catch: () => new ActionsError({ kind: "transport_failed", message: "Fixture connection failed", disposition: "unknown" }),
  })
  const transport: ActionsContract.Transport = { request: send, resolve: () => Effect.fail(new ActionsError({ kind: "invalid_input", message: "Unused fixture resolve" })),
    bytes: () => Stream.fail(new ActionsError({ kind: "invalid_input", message: "Unused fixture bytes" })),
    upload: () => Effect.fail(new ActionsError({ kind: "invalid_input", message: "Unused fixture upload" })) }
  const reader: ActionsContract.ReadAdapter = {
    source: (binding, input) => send(binding, { method: "GET", path: "fixture/source", query: input }).pipe(Effect.map((response) => Schema.decodeUnknownSync(Actions.Source)(response.data))),
    workflows: (binding) => send(binding, { method: "GET", path: "fixture/workflows" }).pipe(Effect.map((response) => Schema.decodeUnknownSync(Actions.WorkflowPage)(response.data))),
    capabilities: () => Effect.succeed([]), run: () => Effect.fail(new ActionsError({ kind: "invalid_input", message: "Unused fixture run" })),
    runs: () => Effect.fail(new ActionsError({ kind: "invalid_input", message: "Unused fixture runs" })), jobs: () => Effect.fail(new ActionsError({ kind: "invalid_input", message: "Unused fixture jobs" })),
  }
  const graphql: ActionsResourceGraphQL.Request = (binding, input) => send(binding, { method: "POST", path: "api/graphql", body: input })
  return { binding, transport, reader, graphql, state, requests }
})

export function intent(binding: Actions.Binding, kind: Actions.OperationKind, resourceKind: Actions.ResourceKind, resourceID?: string, expected?: Actions.OperationExpected): Actions.OperationIntent {
  return { clientID: "resource-fixture", binding: { id: binding.id, revision: binding.revision }, kind,
    target: { resourceKind, ...(resourceID === undefined ? {} : { resourceID }) }, ...(expected === undefined ? {} : { expected }) }
}
