import { expect } from "bun:test"
import { Effect, Schema } from "effect"
import { diagnostics, limits, read } from "../../src/actions/source/document"
import { GitLabReadFixture } from "./gitlab-read-fixture"
import { GitLabCommandFixture } from "./gitlab-command-fixture"
import { it } from "../lib/effect"

const binding = GitLabCommandFixture.binding
const target = { workflowID: "gitlab:project:21:pipeline", ref: "main" }
const header = "spec:\n  inputs:\n    environment:\n      type: string\n      options: [test, prod]\n    checks:\n      type: boolean\n      default: false\n    count:\n      type: number\n      default: 0\n    jobs:\n      type: array\n      default: []\n---\nbuild:\n  script: echo '$[[ inputs.environment ]]'\n"

it.effect("GitLab native dispatch emits one branch/ref-bound pipeline POST with exact typed inputs and native variables", Effect.gen(function* () {
  const fixture = GitLabCommandFixture.make({ text: header, write: GitLabCommandFixture.created })
  const intent = GitLabCommandFixture.intent("workflow.dispatch", target, { commit: GitLabCommandFixture.commit,
    sourceVersion: JSON.stringify({ blob_id: GitLabReadFixture.file(".gitlab-ci.yml", header).blob_id, last_commit_id: GitLabReadFixture.lastCommit }) })
  const payload = { provider: "gitlab", ref: "main", inputs: { environment: "prod", checks: true, count: 4, jobs: ["linux", { os: "windows" }] },
    variables: [{ key: "CONFIG", value: "synthetic-file-value", variable_type: "file" }] }
  const result = yield* fixture.service.perform(binding, intent, payload)
  expect(result).toEqual({ acknowledgement: { runID: "501" } })
  expect(fixture.state.writes).toBe(1)
  expect(fixture.requests.at(-1)).toEqual({ method: "POST", path: "projects/21/pipeline", body: {
    ref: "main", inputs: payload.inputs, variables: payload.variables,
  } })
  expect(fixture.requests.some((request) => request.path === "metadata")).toBe(true)
  expect(fixture.requests.filter((request) => request.path.includes("repository/files/")).every((request) => request.query?.ref === GitLabCommandFixture.commit)).toBe(true)
}))

it.effect("GitLab tag dispatch and custom local CI preserve exact native path; native defaults are not overwritten", Effect.gen(function* () {
  const fixture = GitLabCommandFixture.make({ text: "spec:\n  inputs:\n    checks:\n      type: boolean\n      default: false\n---\nbuild:\n  script: true\n",
    project: { ...GitLabCommandFixture.project, ci_config_path: "ci/custom.yml" }, write: GitLabCommandFixture.created })
  expect(yield* fixture.service.perform(binding, GitLabCommandFixture.intent("workflow.dispatch", { ...target, ref: "v1", path: "ci/custom.yml" }),
    { provider: "gitlab", ref: "v1" })).toEqual({ acknowledgement: { runID: "501" } })
  expect(fixture.requests.map((request) => request.path)).toContain("projects/21/repository/tags/v1")
  expect(fixture.requests.map((request) => request.path)).toContain("projects/21/repository/files/ci%2Fcustom.yml")
  expect(fixture.requests.at(-1)?.body).toEqual({ ref: "v1" })
}))

it.effect("GitLab inputs version guard mutation rejects old native metadata despite newer client version", Effect.gen(function* () {
  const fixture = GitLabCommandFixture.make({ version: "17.11.0-ee", text: header, write: GitLabCommandFixture.created })
  expect(yield* fixture.service.perform({ ...binding, provider: { ...binding.provider, version: "99.0.0" } },
    GitLabCommandFixture.intent("workflow.dispatch", target), { provider: "gitlab", ref: "main", inputs: { environment: "test" } }).pipe(Effect.flip))
    .toMatchObject({ kind: "capability_unavailable", disposition: "definitely_unsent" })
  expect(fixture.state.writes).toBe(0)
}))

it.effect("GitLab input names/types/options/defaults and opaque headers fail before mutation", Effect.gen(function* () {
  for (const inputs of Array.of<Schema.JsonObject>({}, { environment: "prod", unknown: true }, { environment: true }, { environment: "invalid" },
    { environment: "prod", checks: "true" }, { environment: "prod", count: "4" }, { environment: "prod", jobs: "linux" })) {
    const fixture = GitLabCommandFixture.make({ text: header, write: GitLabCommandFixture.created })
    expect(yield* fixture.service.perform(binding, GitLabCommandFixture.intent("workflow.dispatch", target), { provider: "gitlab", ref: "main", inputs }).pipe(Effect.flip))
      .toMatchObject({ kind: "invalid_input", disposition: "definitely_unsent" })
    expect(fixture.state.writes).toBe(0)
  }
  for (const text of ["spec:\n  include: config.yml\n---\nbuild:\n  script: true\n", "spec:\n  inputs:\n    x:\n      type: boolean\n      default: string\n---\nbuild:\n  script: true\n",
    "spec:\n  inputs:\n    x:\n      rules: []\n---\nbuild:\n  script: true\n"]) {
    const fixture = GitLabCommandFixture.make({ text, write: GitLabCommandFixture.created })
    expect(yield* fixture.service.perform(binding, GitLabCommandFixture.intent("workflow.dispatch", target), { provider: "gitlab", ref: "main", inputs: {} }).pipe(Effect.flip))
      .toMatchObject({ kind: "source_unresolved", disposition: "definitely_unsent" })
    expect(fixture.state.writes).toBe(0)
  }
}))

it.effect("GitLab plain zero-input creation delegates opaque CI resolution; explicit input/source proof remains mandatory", Effect.gen(function* () {
  for (const ci_config_path of ["https://ci.example.com/native.yml", ".gitlab-ci.yml@other/project", "ci/custom.yml"]) {
    const fixture = GitLabCommandFixture.make({ project: { ...GitLabCommandFixture.project, ci_config_path },
      text: "include:\n  project: other/project\n", write: GitLabCommandFixture.created })
    expect(yield* fixture.service.perform(binding, GitLabCommandFixture.intent("workflow.dispatch", target), { provider: "gitlab", ref: "main" }))
      .toEqual({ acknowledgement: { runID: "501" } })
    expect(fixture.state.writes).toBe(1)
    expect(fixture.requests.some((request) => request.path.includes("repository/files/") || request.path.includes("repository/commits/"))).toBe(false)
    expect(yield* fixture.service.perform(binding, GitLabCommandFixture.intent("workflow.dispatch", target),
      { provider: "gitlab", ref: "main", inputs: {} }).pipe(Effect.flip)).toMatchObject({ kind: "source_unresolved", disposition: "definitely_unsent" })
    expect(fixture.state.writes).toBe(1)
  }
  const external = GitLabCommandFixture.make({ project: { ...GitLabCommandFixture.project, ci_config_path: "https://ci.example.com/native.yml" }, write: GitLabCommandFixture.created })
  expect(yield* external.service.perform(binding, GitLabCommandFixture.intent("workflow.dispatch", target, { commit: GitLabCommandFixture.commit }),
    { provider: "gitlab", ref: "main" })).toEqual({ acknowledgement: { runID: "501" } })
  expect(yield* external.service.perform(binding, GitLabCommandFixture.intent("workflow.dispatch", target, { sourceVersion: "explicit" }),
    { provider: "gitlab", ref: "main" }).pipe(Effect.flip)).toMatchObject({ kind: "source_unresolved", disposition: "definitely_unsent" })
  expect(external.state.writes).toBe(1)
}))

it.effect("GitLab unsupported constraint guard mutation cannot silently admit dev under native RE2 prod constraint", Effect.gen(function* () {
  const text = "spec:\n  inputs:\n    environment:\n      type: string\n      regex: '^prod$'\n---\nbuild:\n  script: true\n"
  const fixture = GitLabCommandFixture.make({ text, write: GitLabCommandFixture.created })
  expect(yield* fixture.service.perform(binding, GitLabCommandFixture.intent("workflow.dispatch", target),
    { provider: "gitlab", ref: "main", inputs: { environment: "dev" } }).pipe(Effect.flip))
    .toMatchObject({ kind: "source_unresolved", disposition: "definitely_unsent" })
  expect(fixture.state.writes).toBe(0)
  expect(fixture.requests.some((request) => request.path === "metadata")).toBe(false)
  for (const text of ["spec:\n  inputs:\n    environment:\n      type: string\n      rules: [{ if: '$NATIVE', options: [prod] }]\n---\nbuild:\n  script: true\n",
    "spec:\n  include: inputs.yml\n---\nbuild:\n  script: true\n", "include:\n  project: other/project\n"]) {
    const unknown = GitLabCommandFixture.make({ text, write: GitLabCommandFixture.created })
    expect(yield* unknown.service.perform(binding, GitLabCommandFixture.intent("workflow.dispatch", target),
      { provider: "gitlab", ref: "main", inputs: { environment: "dev" } }).pipe(Effect.flip))
      .toMatchObject({ kind: "source_unresolved", disposition: "definitely_unsent" })
    expect(unknown.state.writes).toBe(0)
  }
}))

it.effect("GitLab bounded document projection distinguishes no header from unknown and bounds deep headerless bodies before composition", Effect.gen(function* () {
  const simple = diagnostics()
  expect(read(GitLabCommandFixture.text, "gitlab", simple)?.header).toBeUndefined()
  expect(simple.work.compositions).toBeGreaterThan(0)
  const depth = limits.depth + 10
  const text = `build:\n  script: ${"[".repeat(depth)}0${"]".repeat(depth)}\n`
  const report = diagnostics()
  expect(read(text, "gitlab", report)).toBeUndefined()
  expect(report.work.compositions).toBe(0)
  const fixture = GitLabCommandFixture.make({ text, write: GitLabCommandFixture.created })
  expect(yield* fixture.service.perform(binding, GitLabCommandFixture.intent("workflow.dispatch", target),
    { provider: "gitlab", ref: "main", inputs: {} }).pipe(Effect.flip))
    .toMatchObject({ kind: "source_unresolved", disposition: "definitely_unsent" })
  expect(fixture.state.writes).toBe(0)
  const none = GitLabCommandFixture.make({ write: GitLabCommandFixture.created })
  expect(yield* none.service.perform(binding, GitLabCommandFixture.intent("workflow.dispatch", target),
    { provider: "gitlab", ref: "main", inputs: { undeclared: true } }).pipe(Effect.flip))
    .toMatchObject({ kind: "invalid_input", disposition: "definitely_unsent" })
  const local = GitLabCommandFixture.make({ text: "spec:\n  inputs:\n    environment: {}\n---\nbuild:\n  script: true\n", write: GitLabCommandFixture.created })
  expect(yield* local.service.perform(binding, GitLabCommandFixture.intent("workflow.dispatch", { ...target, path: ".gitlab-ci.yml" }),
    { provider: "gitlab", ref: "main" }).pipe(Effect.flip)).toMatchObject({ kind: "invalid_input", disposition: "definitely_unsent" })
  expect(local.state.writes).toBe(0)
}))

it.effect("GitLab strict payload/intent/ref and immutable project/source preconditions reject unsent", Effect.gen(function* () {
  const fixture = GitLabCommandFixture.make({ write: GitLabCommandFixture.created })
  for (const payload of Array.of<typeof Schema.Json.Type>({ provider: "github", ref: "main" }, { provider: "gitlab", ref: "other" }, { provider: "gitlab", ref: "main", kind: "run.retry" },
    { provider: "gitlab", ref: "main", variables: [{ key: "X", value: "v", extra: true }] })) {
    expect(yield* fixture.service.perform(binding, GitLabCommandFixture.intent("workflow.dispatch", target), payload).pipe(Effect.flip))
      .toMatchObject({ kind: "invalid_input", disposition: "definitely_unsent" })
  }
  expect(fixture.requests).toEqual([])
  const foreign = GitLabCommandFixture.make({ project: { ...GitLabCommandFixture.project, id: 22 }, write: GitLabCommandFixture.created })
  expect(yield* foreign.service.perform(binding, GitLabCommandFixture.intent("workflow.dispatch", target), { provider: "gitlab", ref: "main" }).pipe(Effect.flip))
    .toMatchObject({ kind: "binding_stale", disposition: "definitely_unsent" })
  expect(foreign.state.writes).toBe(0)
  for (const expected of [{ commit: "b".repeat(40) }, { sourceVersion: "stale" }, { attempt: 1 }, { resourceVersion: "unsupported" }]) {
    expect(yield* fixture.service.perform(binding, GitLabCommandFixture.intent("workflow.dispatch", target, expected), { provider: "gitlab", ref: "main" }).pipe(Effect.flip))
      .toMatchObject({ disposition: "definitely_unsent" })
  }
  expect(fixture.state.writes).toBe(0)
}))

it.effect("GitLab known denied/unknown roles and variable policy block; inherited group role permits native attempt", Effect.gen(function* () {
  for (const permissions of Array.of<typeof Schema.Json.Type>({ project_access: { access_level: 20 }, group_access: null }, {})) {
    const fixture = GitLabCommandFixture.make({ project: { ...GitLabCommandFixture.project, permissions }, write: GitLabCommandFixture.created })
    expect(yield* fixture.service.perform(binding, GitLabCommandFixture.intent("workflow.dispatch", target), { provider: "gitlab", ref: "main" }).pipe(Effect.flip))
      .toMatchObject({ disposition: "definitely_unsent" })
    expect(fixture.state.writes).toBe(0)
  }
  const inherited = GitLabCommandFixture.make({ project: { ...GitLabCommandFixture.project, permissions: { project_access: null, group_access: { access_level: 30 } } }, write: GitLabCommandFixture.created })
  expect((yield* inherited.service.perform(binding, GitLabCommandFixture.intent("workflow.dispatch", target), { provider: "gitlab", ref: "main" })).acknowledgement.runID).toBe("501")
  const denied = GitLabCommandFixture.make({ project: { ...GitLabCommandFixture.project, ci_pipeline_variables_minimum_override_role: "no_one_allowed" } })
  expect(yield* denied.service.perform(binding, GitLabCommandFixture.intent("workflow.dispatch", target), { provider: "gitlab", ref: "main", variables: [{ key: "X", value: "v" }] }).pipe(Effect.flip))
    .toMatchObject({ kind: "permission_denied", disposition: "definitely_unsent" })
  expect(denied.state.writes).toBe(0)
}))

it.effect("GitLab trigger token stays JSON-only and native trigger versus CI job token source is retained", Effect.gen(function* () {
  for (const source of ["trigger", "pipeline"]) {
    const fixture = GitLabCommandFixture.make({ write: (request) => GitLabCommandFixture.created(request, source) })
    const token = "synthetic-trigger-token"
    expect(yield* fixture.service.perform(binding, GitLabCommandFixture.intent("pipeline.trigger", target),
      { provider: "gitlab", ref: "main", token, variables: { X: "synthetic-value" } })).toEqual({ acknowledgement: { runID: "501" } })
    expect(fixture.requests.at(-1)).toEqual({ method: "POST", path: "projects/21/trigger/pipeline", body: { ref: "main", token, variables: { X: "synthetic-value" } } })
    expect(fixture.requests.every((request) => !request.path.includes(token) && request.query === undefined || request.method === "GET")).toBe(true)
    expect(fixture.state.writes).toBe(1)
  }
}))
