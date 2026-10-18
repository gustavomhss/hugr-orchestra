import { expect } from "bun:test"
import { Effect, Schema } from "effect"
import { Actions } from "@orchestra/schema/actions"
import { ActionsCursor } from "../../src/actions/cursor"
import { it } from "../lib/effect"
import { GitLabReadFixture } from "./gitlab-read-fixture"

const binding = GitLabReadFixture.binding

it.effect("GitLab catalog retains native config path and one stable project pipeline identity", Effect.gen(function* () {
  const factory = GitLabReadFixture.make()
  expect(factory.requests).toEqual([])
  expect(Object.keys(factory.adapter).sort()).toEqual(["capabilities", "jobs", "run", "runs", "source", "workflows"])
  for (const path of [null, "", "ci/custom.yml", ".gitlab-ci.yml@group/other:release", "https://config.example.com/build.yml"]) {
    const fixture = GitLabReadFixture.make([], { ...GitLabReadFixture.project, ci_config_path: path })
    const catalog = yield* fixture.adapter.workflows(binding, {})
    expect(catalog.items).toHaveLength(1)
    expect(Schema.decodeUnknownOption(Actions.WorkflowPage)(catalog)._tag).toBe("Some")
    expect(catalog.items[0]).toMatchObject({ id: "gitlab:project:21:pipeline", path: path === null || path === "" ? ".gitlab-ci.yml" : path,
      defaultRef: "main", dispatchable: false, dispatchState: "unknown" })
    if (path?.includes("@") || path?.startsWith("https:")) expect(catalog.items[0].state).toBe("source_unresolved")
    expect(fixture.requests).toEqual([{ method: "GET", path: "projects/21" }])
  }
  const unknown = GitLabReadFixture.make([], { id: 21, name: "Hidden settings", path_with_namespace: "test-group/test-project" })
  expect((yield* unknown.adapter.workflows(binding, {})).items[0]).toMatchObject({ path: "", state: "source_unresolved" })
  const disabled = GitLabReadFixture.make([], { ...GitLabReadFixture.project, builds_access_level: "disabled" })
  expect((yield* disabled.adapter.workflows(binding, {})).items[0]).toMatchObject({ state: "disabled", dispatchState: "unavailable" })
  expect((yield* factory.adapter.workflows(binding, { query: "does not match" })).total).toBe(0)
}))

it.effect("GitLab workflow default ref preserves observed native branch and omits unknown or empty values", Effect.gen(function* () {
  for (const default_branch of ["release/current", "", null]) {
    const fixture = GitLabReadFixture.make([], { ...GitLabReadFixture.project, default_branch })
    const workflow = (yield* fixture.adapter.workflows(binding, {})).items[0]
    if (default_branch) expect(workflow.defaultRef).toBe(default_branch)
    if (!default_branch) expect(workflow).not.toHaveProperty("defaultRef")
    expect(fixture.requests).toEqual([{ method: "GET", path: "projects/21" }])
  }
}))

it.effect("GitLab nullable project name remains native null without a synthesized searchable name", Effect.gen(function* () {
  const fixture = GitLabReadFixture.make([], { ...GitLabReadFixture.project, name: null })
  expect((yield* fixture.adapter.workflows(binding, {})).items[0].name).toBeNull()
  expect((yield* fixture.adapter.workflows(binding, { query: "null" })).items).toEqual([])
  expect((yield* fixture.adapter.workflows(binding, { query: ".gitlab-ci.yml" })).items[0].name).toBeNull()
}))

it.effect("GitLab native identity mutation: wrong project fails before catalog or pipeline reads", Effect.gen(function* () {
  const fixture = GitLabReadFixture.make([{ path: "projects/21/pipelines/287", data: GitLabReadFixture.pipeline }],
    { ...GitLabReadFixture.project, id: 22 })
  expect(yield* fixture.adapter.run(binding, "287").pipe(Effect.flip)).toMatchObject({ kind: "binding_stale", bindingID: binding.id })
  expect(fixture.requests.map((request) => request.path)).toEqual(["projects/21"])
  for (const projectID of ["group/project", "0", "-1", "01", "1.5", "1e3", "21/other"]) {
    const fixture = GitLabReadFixture.make()
    expect(yield* fixture.adapter.workflows({ ...binding, projectID }, {}).pipe(Effect.flip)).toMatchObject({ kind: "invalid_input", disposition: "definitely_unsent" })
    expect(fixture.requests).toEqual([])
  }
  const malformed = GitLabReadFixture.make([], { ...GitLabReadFixture.project, id: Number.MAX_SAFE_INTEGER + 1 })
  expect(yield* malformed.adapter.workflows(binding, {}).pipe(Effect.flip)).toMatchObject({ kind: "transport_failed" })
}))

it.effect("GitLab source branch mutation: resolve commit first, retain blob/version and exact UTF-8", Effect.gen(function* () {
  const path = "ci/config #release.yml"
  const text = "\ufeff# comments stay\r\nbuild:\r\n  script: 'printf olá'\r\n"
  const fixture = GitLabReadFixture.make([
    { path: "projects/21/repository/commits/feature%2Frelease", data: { id: GitLabReadFixture.commit } },
    { path: "projects/21/repository/files/ci%2Fconfig%20%23release.yml", reply: (request) => Effect.succeed({ status: 200, headers: {},
      data: request.query?.ref === GitLabReadFixture.commit ? GitLabReadFixture.file(path, text)
        : { ...GitLabReadFixture.file(path, "branch moved"), commit_id: "b".repeat(40) } }) },
  ], { ...GitLabReadFixture.project, ci_config_path: path })
  const source = yield* fixture.adapter.source(binding, { path, ref: "feature/release" })
  expect(source).toMatchObject({ text, commit: GitLabReadFixture.commit, path, ref: "feature/release", editable: false })
  expect(JSON.parse(source.version)).toEqual({ blob_id: GitLabReadFixture.file(path, text).blob_id, last_commit_id: GitLabReadFixture.lastCommit })
  expect(fixture.requests).toEqual([
    { method: "GET", path: "projects/21" },
    { method: "GET", path: "projects/21/repository/commits/feature%2Frelease" },
    { method: "GET", path: "projects/21/repository/files/ci%2Fconfig%20%23release.yml", query: { ref: GitLabReadFixture.commit } },
  ])
}))

it.effect("GitLab external/project includes and custom configs never substitute default source", Effect.gen(function* () {
  for (const path of ["ci/custom.yml", ".gitlab-ci.yml@group/other", "https://config.example.com/build.yml"]) {
    const fixture = GitLabReadFixture.make([], { ...GitLabReadFixture.project, ci_config_path: path })
    expect(yield* fixture.adapter.source(binding, { path: ".gitlab-ci.yml", ref: "main" }).pipe(Effect.flip)).toMatchObject({ kind: "source_unresolved" })
    expect(fixture.requests.map((request) => request.path)).toEqual(["projects/21"])
    if (path.includes("@") || path.startsWith("https:")) {
      expect(yield* fixture.adapter.source(binding, { path, ref: "main" }).pipe(Effect.flip)).toMatchObject({ kind: "source_unresolved" })
      expect(fixture.requests.map((request) => request.path)).toEqual(["projects/21"])
    }
  }
  const fixture = GitLabReadFixture.make([
    { path: "projects/21/repository/commits/main", data: { id: GitLabReadFixture.commit } },
    { path: "projects/21/repository/files/templates%2Ftests.yml", data: GitLabReadFixture.file("templates/tests.yml", "test:\n  script: true\n") },
  ])
  expect((yield* fixture.adapter.source(binding, { path: "templates/tests.yml", ref: "main" })).path).toBe("templates/tests.yml")
}))

it.effect("GitLab malformed source identity/base64/UTF-8 return exact named failures", Effect.gen(function* () {
  const path = ".gitlab-ci.yml"
  for (const specimen of Array.of<{ data: typeof Schema.Json.Type; kind: Actions.ErrorKind }>(
    { data: { ...GitLabReadFixture.file(path, "text"), file_path: "wrong.yml" }, kind: "source_conflict" },
    { data: { ...GitLabReadFixture.file(path, "text"), commit_id: "b".repeat(40) }, kind: "source_conflict" },
    { data: { ...GitLabReadFixture.file(path, "text"), content: "invalid!base64" }, kind: "source_unresolved" },
    { data: { ...GitLabReadFixture.file(path, "text"), content: Buffer.from([0xff, 0xfe]).toString("base64") }, kind: "source_unresolved" },
    { data: { ...GitLabReadFixture.file(path, "text"), blob_id: "mutable-branch" }, kind: "transport_failed" },
  )) {
    const fixture = GitLabReadFixture.make([
      { path: "projects/21/repository/commits/main", data: { id: GitLabReadFixture.commit } },
      { path: "projects/21/repository/files/.gitlab-ci.yml", data: specimen.data },
    ])
    const error = yield* fixture.adapter.source(binding, { path, ref: "main" }).pipe(Effect.flip)
    expect(error.kind).toBe(specimen.kind)
  }
}))

it.effect("GitLab immutable historical/local-include source survives changed current config without claiming definition history", Effect.gen(function* () {
  const text = "# historical file or local include\nold_job:\n  script: echo old\n"
  for (const ci_config_path of ["new-config.yml", ".gitlab-ci.yml@group/other", "https://config.example.com/build.yml"]) {
    const fixture = GitLabReadFixture.make([
      { path: `projects/21/repository/commits/${GitLabReadFixture.commit}`, data: { id: GitLabReadFixture.commit } },
      { path: "projects/21/repository/files/.gitlab-ci.yml", query: { ref: GitLabReadFixture.commit }, data: GitLabReadFixture.file(".gitlab-ci.yml", text) },
    ], { ...GitLabReadFixture.project, ci_config_path })
    const source = yield* fixture.adapter.source(binding, { path: ".gitlab-ci.yml", ref: GitLabReadFixture.commit })
    expect(source).toMatchObject({ path: ".gitlab-ci.yml", commit: GitLabReadFixture.commit, text })
    const workflow = (yield* fixture.adapter.workflows(binding, {})).items[0]
    expect(workflow.path).toBe(ci_config_path)
    expect(workflow.id).toBe("gitlab:project:21:pipeline")
  }
}))

it.effect("GitLab capabilities observe project permissions and label client version advisory without granting unproved writes", Effect.gen(function* () {
  const fixture = GitLabReadFixture.make()
  const capabilities = yield* fixture.adapter.capabilities({ ...binding, provider: { ...binding.provider, version: "18.4.0" } })
  expect(capabilities.find((item) => item.operation === "workflows.read")).toMatchObject({ state: "available", scope: "projects/21" })
  expect(capabilities.find((item) => item.operation === "runs.read")).toMatchObject({ state: "unknown" })
  const dispatch = capabilities.find((item) => item.operation === "workflow.dispatch")
  expect(dispatch).toMatchObject({ state: "unknown" })
  expect(dispatch?.reason).toContain("access levels 30")
  expect(dispatch?.reason).toContain("18.4.0")
  expect(dispatch?.reason).toContain("advisory client version")
  expect(dispatch?.reason).toContain("native version unobserved")
  expect(capabilities.filter((item) => Actions.OperationKind.literals.some((operation) => operation === item.operation))
    .every((item) => item.state === "unknown")).toBe(true)
  expect(fixture.requests.map((request) => request.path)).toEqual(["projects/21"])
  const cursor = ActionsCursor.encode(binding, "gitlab.workflows", { limit: 50 }, 2)
  expect(yield* fixture.adapter.workflows(binding, { cursor }).pipe(Effect.flip)).toMatchObject({ kind: "invalid_input" })
}))

it.effect("GitLab raw blob SHA-1/SHA-256 fidelity uses independent Git object goldens and exact byte length", Effect.gen(function* () {
  // Computed by real `git hash-object --stdin` for "test content\n", including a
  // SHA-256-format Git repository. These constants do not use fixture hashing.
  for (const blob_id of ["d670460b4b4aece5915caf5c68d12f560a9fe3e4", "13b7e821533d3fe3728a3c4560606a65aab99f4390b9df0714f9075c0ef4c2d6"]) {
    const fixture = GitLabReadFixture.make([
      { path: "projects/21/repository/commits/main", data: { id: GitLabReadFixture.commit } },
      { path: "projects/21/repository/files/.gitlab-ci.yml", data: { ...GitLabReadFixture.file(".gitlab-ci.yml", "test content\n"), blob_id } },
    ])
    const source = yield* fixture.adapter.source(binding, { path: ".gitlab-ci.yml", ref: "main" })
    expect(source.text).toBe("test content\n")
    expect(JSON.parse(source.version).blob_id).toBe(blob_id)
  }
  const text = "\ufeff# UTF-8 byte count: café\r\n"
  const fixture = GitLabReadFixture.make([
    { path: "projects/21/repository/commits/main", data: { id: GitLabReadFixture.commit } },
    { path: "projects/21/repository/files/.gitlab-ci.yml", data: GitLabReadFixture.file(".gitlab-ci.yml", text, "sha256") },
  ])
  expect((yield* fixture.adapter.source(binding, { path: ".gitlab-ci.yml", ref: "main" })).text).toBe(text)
}))

it.effect("GitLab blob fidelity mutation: converted UTF-8 view cannot impersonate the identified raw blob", Effect.gen(function* () {
  // Latin-1 raw bytes 63 61 66 e9 0a have this real Git SHA-1. The API view
  // transcodes the same text to UTF-8, 63 61 66 c3 a9 0a: valid text, wrong blob.
  for (const data of [
    { ...GitLabReadFixture.file(".gitlab-ci.yml", "café\n"), size: 5, blob_id: "6f83395d973c448cdb70a7b21f7fc8018797acf6" },
    { ...GitLabReadFixture.file(".gitlab-ci.yml", "changed text\n", "sha256"), blob_id: "13b7e821533d3fe3728a3c4560606a65aab99f4390b9df0714f9075c0ef4c2d6" },
  ]) {
    const fixture = GitLabReadFixture.make([
      { path: "projects/21/repository/commits/main", data: { id: GitLabReadFixture.commit } },
      { path: "projects/21/repository/files/.gitlab-ci.yml", data },
    ])
    expect(yield* fixture.adapter.source(binding, { path: ".gitlab-ci.yml", ref: "main" }).pipe(Effect.flip))
      .toMatchObject({ kind: "source_unresolved", message: "GitLab decoded source bytes do not match the identified raw Git blob" })
    expect(fixture.requests.at(-1)?.query).toEqual({ ref: GitLabReadFixture.commit })
  }
}))
