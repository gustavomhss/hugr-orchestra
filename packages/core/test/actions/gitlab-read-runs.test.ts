import { expect } from "bun:test"
import { Effect, Schema } from "effect"
import { Actions } from "@orchestra/schema/actions"
import { ActionsError } from "../../src/actions/error"
import { ActionsGitLabNative } from "../../src/actions/gitlab/native"
import { it } from "../lib/effect"
import { GitLabReadFixture } from "./gitlab-read-fixture"

const binding = GitLabReadFixture.binding

it.effect("GitLab runs retain native filters/status/source/IDs and paginate with unknown counts", Effect.gen(function* () {
  const input = { ref: "release/v2", event: "parent_pipeline", status: "waiting_for_resource", commit: GitLabReadFixture.commit, actor: "root", limit: 2 }
  const query = { ref: input.ref, source: input.event, status: input.status, sha: input.commit, username: input.actor, per_page: 2 }
  const fixture = GitLabReadFixture.make([
    { path: "projects/21/pipelines", query: { ...query, page: 1 }, data: [{ ...GitLabReadFixture.pipeline, status: input.status, source: input.event, ref: input.ref }], headers: { "x-next-page": "2" } },
    { path: "projects/21/pipelines", query: { ...query, page: 2 }, data: [], headers: { "x-next-page": "", "x-total": "1" } },
  ])
  const first = yield* fixture.adapter.runs(binding, input)
  expect(first.items[0]).toMatchObject({ id: "287", workflowID: "gitlab:project:21:pipeline", status: input.status, event: input.event, commit: input.commit, ref: input.ref })
  expect(first.items[0]).not.toHaveProperty("conclusion")
  expect(first.items[0]).not.toHaveProperty("attempt")
  expect(first).not.toHaveProperty("total")
  expect(first.next).toBeString()
  const second = yield* fixture.adapter.runs(binding, { ...input, cursor: first.next })
  expect(second).toMatchObject({ items: [], total: 1 })
  expect(second).not.toHaveProperty("next")
  expect(Schema.decodeUnknownOption(Actions.RunPage)(first)._tag).toBe("Some")
  expect(fixture.requests.filter((request) => request.path.endsWith("/pipelines")).map((request) => request.query))
    .toEqual([{ ...query, page: 1 }, { ...query, page: 2 }])
}))

it.effect("GitLab pipeline detail carries native actor/times/duration without claiming config history or attempts", Effect.gen(function* () {
  const fixture = GitLabReadFixture.make([{ path: "projects/21/pipelines/287", data: GitLabReadFixture.pipeline }],
    { ...GitLabReadFixture.project, ci_config_path: "new-config.yml" })
  const run = yield* fixture.adapter.run(binding, "287")
  expect(run).toMatchObject({ id: "287", name: "Build pipeline", status: "success", conclusion: "success", actor: "root", duration: 34,
    createdAt: GitLabReadFixture.pipeline.created_at, startedAt: GitLabReadFixture.pipeline.started_at, finishedAt: GitLabReadFixture.pipeline.finished_at,
    updatedAt: GitLabReadFixture.pipeline.updated_at, repositoryID: "21",
    workflowID: "gitlab:project:21:pipeline", url: GitLabReadFixture.pipeline.web_url })
  expect(run).not.toHaveProperty("attempt")
  expect(run).not.toHaveProperty("definitionID")
  expect(run).not.toHaveProperty("triggeringActor") // GitLab REST exposes user, not a separate retry/trigger actor.
  const catalog = yield* fixture.adapter.workflows(binding, {})
  expect(catalog.items[0].id).toBe(run.workflowID)
  expect(catalog.items[0].path).toBe("new-config.yml")
}))

it.effect("GitLab created/updated ranges map exactly and each range isolates its cursor", Effect.gen(function* () {
  const versioned = { ...binding, provider: { ...binding.provider, version: "17.11.0-ee" } }
  const input = { limit: 2, createdAfter: "2022-09-01T00:00:00Z", createdBefore: "2022-09-30T23:59:59Z",
    updatedAfter: "2022-09-01T00:00:00.123+02:00", updatedBefore: "2022-10-01T00:00:00Z" }
  const query = { per_page: 2, created_after: input.createdAfter, created_before: input.createdBefore,
    updated_after: input.updatedAfter, updated_before: input.updatedBefore }
  const fixture = GitLabReadFixture.make([
    { path: "projects/21/pipelines", query: { ...query, page: 1 }, data: [GitLabReadFixture.pipeline], headers: { "x-next-page": "2" } },
    { path: "projects/21/pipelines", query: { ...query, page: 2 }, data: [], headers: { "x-next-page": "" } },
  ])
  const first = yield* fixture.adapter.runs(versioned, input)
  expect(first.items[0]).toMatchObject({ id: "287", updatedAt: GitLabReadFixture.pipeline.updated_at, repositoryID: "21" })
  expect(first.next).toBeString()
  const before = fixture.requests.length
  for (const field of ["createdAfter", "createdBefore", "updatedAfter", "updatedBefore"]) {
    expect(yield* fixture.adapter.runs(versioned, { ...input, [field]: "2022-09-15T00:00:00Z", cursor: first.next }).pipe(Effect.flip))
      .toMatchObject({ kind: "invalid_input" })
    const omitted = Object.fromEntries(Object.entries(input).filter(([key]) => key !== field))
    expect(yield* fixture.adapter.runs(versioned, { ...omitted, cursor: first.next }).pipe(Effect.flip)).toMatchObject({ kind: "invalid_input" })
  }
  expect(fixture.requests).toHaveLength(before)
  expect((yield* fixture.adapter.runs(versioned, { ...input, cursor: first.next })).items).toEqual([])
  expect(fixture.requests.filter((request) => request.path.endsWith("/pipelines")).map((request) => request.query))
    .toEqual([{ ...query, page: 1 }, { ...query, page: 2 }])
}))

it.effect("GitLab range filters reject invalid timestamps before I/O and unsupported native metadata before pipelines", Effect.gen(function* () {
  const fixture = GitLabReadFixture.make([{ path: "projects/21/pipelines", data: [GitLabReadFixture.pipeline] }])
  for (const value of ["", "yesterday", "2022-09-01", "2022-13-01T00:00:00Z", "2022-09-01T00:00:00"]) {
    expect(yield* fixture.adapter.runs({ ...binding, provider: { ...binding.provider, version: "18.4.0" } }, { updatedAfter: value }).pipe(Effect.flip))
      .toMatchObject({ kind: "invalid_input", message: expect.stringContaining("updated_after") })
  }
  expect(fixture.requests).toEqual([])
  for (const version of [null, "", "17.10.9", "17.11.0-pre", "17.11"]) {
    const fixture = GitLabReadFixture.make([], GitLabReadFixture.project, { version })
    expect(yield* fixture.adapter.runs({ ...binding, provider: { ...binding.provider, version: "99.0.0" } }, { createdAfter: "2022-09-01T00:00:00Z" }).pipe(Effect.flip))
      .toMatchObject({ kind: "capability_unavailable" })
    expect(fixture.requests.map((request) => request.path)).toEqual(["metadata"])
  }
  const old = GitLabReadFixture.make([], GitLabReadFixture.project, { version: "12.5.9-ee" })
  expect(yield* old.adapter.runs(binding, { updatedAfter: "2022-09-01T00:00:00Z" }).pipe(Effect.flip))
    .toMatchObject({ kind: "capability_unavailable", message: expect.stringContaining("12.6") })
  expect(old.requests.map((request) => request.path)).toEqual(["metadata"])
  const supported = GitLabReadFixture.make([{ path: "projects/21/pipelines", data: [GitLabReadFixture.pipeline] }], GitLabReadFixture.project, { version: "12.6.0-ee" })
  const page = yield* supported.adapter.runs(binding, { updatedAfter: "2022-09-01T00:00:00Z" })
  expect(page.items[0].id).toBe("287")
  expect(supported.requests.at(-1)?.query).toEqual({ per_page: 50, updated_after: "2022-09-01T00:00:00Z", page: 1 })
}))

it.effect("GitLab metadata version mutation: native instance observation overrides both newer and older client claims", Effect.gen(function* () {
  const newerClient = { ...binding, provider: { ...binding.provider, version: "99.0.0" } }
  const old = GitLabReadFixture.make([{ path: "projects/21/pipelines", data: [GitLabReadFixture.pipeline] }], GitLabReadFixture.project, { version: "17.10.0-ee" })
  expect(yield* old.adapter.runs(newerClient, { createdAfter: "2022-09-01T00:00:00Z" }).pipe(Effect.flip))
    .toMatchObject({ kind: "capability_unavailable" })
  expect(old.requests).toEqual([{ method: "GET", path: "metadata" }])
  const olderClient = { ...binding, provider: { ...binding.provider, version: "8.0.0" } }
  const current = GitLabReadFixture.make([{ path: "projects/21/pipelines", data: [GitLabReadFixture.pipeline] }], GitLabReadFixture.project, { version: "17.11.0-ee" })
  expect((yield* current.adapter.runs(olderClient, { createdAfter: "2022-09-01T00:00:00Z" })).items[0].id).toBe("287")
  expect(current.requests.map((request) => request.path)).toEqual(["metadata", "projects/21", "projects/21/pipelines"])
  const before = Date.now()
  const observation = yield* ActionsGitLabNative.make(current.transport).metadata(olderClient)
  expect(observation).toMatchObject({ version: "17.11.0-ee", hostname: binding.provider.hostname, apiOrigin: binding.provider.apiOrigin })
  expect(observation.observedAt).toBeGreaterThanOrEqual(before)
  expect(observation.observedAt).toBeLessThanOrEqual(Date.now())
  expect(Schema.decodeUnknownOption(ActionsGitLabNative.VersionObservation)(observation)._tag).toBe("Some")
}))

it.effect("GitLab metadata discovery auth/rate/malformed/host errors remain named and never reach pipelines", Effect.gen(function* () {
  for (const kind of ["not_authenticated", "permission_denied", "rate_limited", "not_found", "transport_failed"] as const) {
    const error = new ActionsError({ kind, message: "Native metadata failed", retryAfter: 7 })
    const fixture = GitLabReadFixture.make([{ path: "metadata", reply: () => Effect.fail(error) }])
    expect(yield* fixture.adapter.runs(binding, { event: "push" }).pipe(Effect.flip)).toBe(error)
    expect(fixture.requests.map((request) => request.path)).toEqual(["metadata"])
  }
  for (const data of Array.of<Record<string, typeof Schema.Json.Type>>({}, { version: null }, { version: 19 })) {
    const fixture = GitLabReadFixture.make([], GitLabReadFixture.project, data)
    expect((yield* fixture.adapter.runs(binding, { event: "push" }).pipe(Effect.flip)).kind)
      .toBe("version" in data && typeof data.version === "number" ? "transport_failed" : "capability_unavailable")
    expect(fixture.requests.map((request) => request.path)).toEqual(["metadata"])
  }
  const fixture = GitLabReadFixture.make()
  expect(yield* fixture.adapter.runs({ ...binding, provider: { ...binding.provider, apiOrigin: "https://foreign.example.com" } }, { event: "push" }).pipe(Effect.flip))
    .toMatchObject({ kind: "host_mismatch" })
  expect(fixture.requests).toEqual([])
  const observation = yield* ActionsGitLabNative.make(fixture.transport).metadata(binding)
  expect(yield* ActionsGitLabNative.checked(binding, () => ActionsGitLabNative.requireVersion(binding,
    { ...observation, hostname: "foreign.example.com" }, [14, 3], "source=push")).pipe(Effect.flip)).toMatchObject({ kind: "host_mismatch" })
}))

it.effect("GitLab old source-ignoring server is rejected before list; parent_pipeline requires native 17.0", Effect.gen(function* () {
  for (const version of ["13.12.0-ee", "14.2.0-ee"]) {
    const fixture = GitLabReadFixture.make([{ path: "projects/21/pipelines", data: [GitLabReadFixture.pipeline,
      { ...GitLabReadFixture.pipeline, id: 288, source: "web" }] }], GitLabReadFixture.project, { version })
    expect(yield* fixture.adapter.runs({ ...binding, provider: { ...binding.provider, version: "99.0.0" } }, { event: "push" }).pipe(Effect.flip))
      .toMatchObject({ kind: "capability_unavailable", message: expect.stringContaining("14.3") })
    expect(fixture.requests.map((request) => request.path)).toEqual(["metadata"])
  }
  const parent = GitLabReadFixture.make([], GitLabReadFixture.project, { version: "16.11.0-ee" })
  expect(yield* parent.adapter.runs(binding, { event: "parent_pipeline" }).pipe(Effect.flip))
    .toMatchObject({ kind: "capability_unavailable", message: expect.stringContaining("17.0") })
  expect(parent.requests.map((request) => request.path)).toEqual(["metadata"])
  const unfiltered = GitLabReadFixture.make([{ path: "projects/21/pipelines", data: [GitLabReadFixture.pipeline] }])
  expect(yield* unfiltered.adapter.runs(binding, { event: "web" }).pipe(Effect.flip)).toMatchObject({ kind: "transport_failed" })
}))

it.effect("GitLab qualified closed source table preserves every supported native source and rejects unknown selection", Effect.gen(function* () {
  const table = [
    { version: "14.3.0-ee", sources: ["unknown", "push", "web", "trigger", "schedule", "api", "external", "pipeline", "chat", "webide",
      "merge_request_event", "external_pull_request_event", "ondemand_dast_scan", "ondemand_dast_validation", "security_orchestration_policy"] },
    { version: "17.0.0-ee", sources: ["parent_pipeline", "container_registry_push"] },
    { version: "17.4.0-ee", sources: ["duo_workflow"] },
    { version: "17.9.0-ee", sources: ["pipeline_execution_policy_schedule"] },
  ]
  for (const group of table) {
    for (const source of group.sources) {
      const fixture = GitLabReadFixture.make([{ path: "projects/21/pipelines", data: [{ ...GitLabReadFixture.pipeline, source }] }],
        GitLabReadFixture.project, { version: group.version })
      expect((yield* fixture.adapter.runs(binding, { event: source })).items[0].event).toBe(source)
      expect(fixture.requests.at(-1)?.query?.source).toBe(source)
    }
  }
  for (const selection of [{ event: "workflow_dispatch" }, { event: "future_unqualified_source" }]) {
    const fixture = GitLabReadFixture.make()
    expect(yield* fixture.adapter.runs(binding, selection).pipe(Effect.flip)).toMatchObject({ kind: "invalid_input" })
    expect(fixture.requests).toEqual([])
  }
  for (const selection of [{ source: "container_registry_push", version: "16.11.0-ee" }, { source: "duo_workflow", version: "17.3.0-ee" },
    { source: "pipeline_execution_policy_schedule", version: "17.8.0-ee" }]) {
    const fixture = GitLabReadFixture.make([], GitLabReadFixture.project, { version: selection.version })
    expect(yield* fixture.adapter.runs(binding, { event: selection.source }).pipe(Effect.flip)).toMatchObject({ kind: "capability_unavailable" })
    expect(fixture.requests.map((request) => request.path)).toEqual(["metadata"])
  }
}))

it.effect("GitLab null pipeline name/ref/status remain null and absent name keeps the prior display convention", Effect.gen(function* () {
  const nullable = { ...GitLabReadFixture.pipeline, name: null, ref: null, status: null, updated_at: null, user: null }
  const fixture = GitLabReadFixture.make([
    { path: "projects/21/pipelines/287", data: nullable },
    { path: "projects/21/pipelines", data: [nullable] },
    { path: "projects/21/pipelines/288", data: { id: 288, project_id: 21, sha: GitLabReadFixture.commit, ref: null, source: "push", status: null } },
  ])
  const run = yield* fixture.adapter.run(binding, "287")
  const listed = (yield* fixture.adapter.runs(binding, {})).items[0]
  for (const item of [run, listed]) {
    expect(item).toMatchObject({ name: null, ref: null, status: null, repositoryID: "21" })
    expect(item).not.toHaveProperty("conclusion")
    expect(item).not.toHaveProperty("actor")
    expect(item).not.toHaveProperty("triggeringActor")
    expect(item).not.toHaveProperty("updatedAt")
    expect(Schema.decodeUnknownOption(Actions.Run)(item)._tag).toBe("Some")
  }
  expect((yield* fixture.adapter.run(binding, "288")).name).toBe("Pipeline 288")
}))

it.effect("GitLab run cursor binds native host/project/revision/filter/page size", Effect.gen(function* () {
  const fixture = GitLabReadFixture.make([{ path: "projects/21/pipelines", data: [GitLabReadFixture.pipeline], headers: { "x-next-page": "2" } }])
  const first = yield* fixture.adapter.runs(binding, { ref: "main", limit: 2 })
  expect(first.next).toBeString()
  for (const other of [{ ...binding, revision: 2 }, { ...binding, projectID: "22" },
    { ...binding, provider: { ...binding.provider, hostname: "other.example.com" } }]) {
    const before = fixture.requests.length
    expect(yield* fixture.adapter.runs(other, { ref: "main", limit: 2, cursor: first.next }).pipe(Effect.flip)).toMatchObject({ kind: "invalid_input" })
    expect(fixture.requests).toHaveLength(before)
  }
  for (const input of [{ ref: "other", limit: 2 }, { ref: "main", limit: 3 }, { ref: "main", event: "push", limit: 2 }]) {
    expect(yield* fixture.adapter.runs(binding, { ...input, cursor: first.next }).pipe(Effect.flip)).toMatchObject({ kind: "invalid_input" })
  }
  for (const cursor of ["not-a-cursor", "", "x".repeat(2049)])
    expect(yield* fixture.adapter.runs(binding, { cursor }).pipe(Effect.flip)).toMatchObject({ kind: "invalid_input" })
}))

it.effect("GitLab unsupported filters and invalid page inputs fail before provider I/O", Effect.gen(function* () {
  const fixture = GitLabReadFixture.make()
  for (const limit of [0, 101, 1.5, Number.NaN])
    expect(yield* fixture.adapter.runs(binding, { limit }).pipe(Effect.flip)).toMatchObject({ kind: "invalid_input" })
  for (const input of [{ workflowID: "github:workflow:8" }, { status: "completed" }, { actor: "" }, { updated_after: "2026-10-01T00:00:00Z" }])
    expect(yield* fixture.adapter.runs(binding, input).pipe(Effect.flip)).toMatchObject({ kind: "invalid_input" })
  expect(yield* fixture.adapter.runs(binding, { created: ">2026-10-01" }).pipe(Effect.flip))
    .toMatchObject({ kind: "capability_unavailable", message: expect.stringContaining("created_after/created_before") })
  expect(fixture.requests).toEqual([])
}))

it.effect("GitLab list decoding, native relation, pagination and auth failures never become empty pages", Effect.gen(function* () {
  for (const data of [{ pipelines: [] }, [{ ...GitLabReadFixture.pipeline, id: -1 }], [{ ...GitLabReadFixture.pipeline, project_id: 22 }], [GitLabReadFixture.pipeline, GitLabReadFixture.pipeline]]) {
    const fixture = GitLabReadFixture.make([{ path: "projects/21/pipelines", data }])
    expect(yield* fixture.adapter.runs(binding, {}).pipe(Effect.flip)).toMatchObject({ kind: expect.stringMatching(/^(transport_failed|binding_stale)$/) })
  }
  for (const headers of Array.of<Record<string, string>>({ "x-next-page": "NaN" }, { "x-next-page": "1" }, { "x-total": "-1" }, { link: '<https://gitlab.example.com/x?cursor=keyset>; rel="next"' })) {
    const fixture = GitLabReadFixture.make([{ path: "projects/21/pipelines", data: [], headers }])
    expect(yield* fixture.adapter.runs(binding, {}).pipe(Effect.flip)).toMatchObject({ kind: "transport_failed" })
  }
  for (const kind of ["not_authenticated", "permission_denied", "rate_limited"] as const) {
    const error = new ActionsError({ kind, message: "Native read rejected", retryAfter: 3 })
    const fixture = GitLabReadFixture.make([{ path: "projects/21/pipelines", reply: () => Effect.fail(error) }])
    expect(yield* fixture.adapter.runs(binding, {}).pipe(Effect.flip)).toBe(error)
  }
  for (const data of [{ ...GitLabReadFixture.pipeline, id: 288 }, { ...GitLabReadFixture.pipeline, project_id: 22 }]) {
    const fixture = GitLabReadFixture.make([{ path: "projects/21/pipelines/287", data }])
    expect(yield* fixture.adapter.run(binding, "287").pipe(Effect.flip)).toMatchObject({ kind: "binding_stale" })
  }
}))
