import { expect } from "bun:test"
import { Effect } from "effect"
import { GitLabCommandFixture } from "./gitlab-command-fixture"
import { it } from "../lib/effect"

const binding = GitLabCommandFixture.binding
const mr = { id: 4001, iid: 42, project_id: 21, target_project_id: 21, source_project_id: 21,
  sha: GitLabCommandFixture.commit, source_branch: "feature/release", state: "opened" }

it.effect("GitLab MR launch uses native IID route and exact merge_request_event identity, distinct from branch dispatch", Effect.gen(function* () {
  const fixture = GitLabCommandFixture.make({ routes: [{ path: "projects/21/merge_requests/42", reply: () => Effect.succeed({ status: 200, headers: {}, data: mr }) }],
    write: () => Effect.succeed({ status: 201, headers: {}, data: { ...GitLabCommandFixture.pipeline, id: 501, source: "merge_request_event", ref: "refs/merge-requests/42/head" } }) })
  expect(yield* fixture.service.perform(binding, GitLabCommandFixture.intent("pipeline.mergeRequest", { resourceID: "42", ref: "feature/release" }, { commit: mr.sha }),
    { provider: "gitlab" })).toEqual({ acknowledgement: { runID: "501" } })
  expect(fixture.requests.at(-1)).toEqual({ method: "POST", path: "projects/21/merge_requests/42/pipelines" })
  expect(fixture.state.writes).toBe(1)
}))

it.effect("GitLab zero-input MR creation delegates native external CI but keeps explicit source proof exact", Effect.gen(function* () {
  const fixture = GitLabCommandFixture.make({ project: { ...GitLabCommandFixture.project, ci_config_path: "https://ci.example.com/native.yml" },
    routes: [{ path: "projects/21/merge_requests/42", reply: () => Effect.succeed({ status: 200, headers: {}, data: mr }) }],
    write: () => Effect.succeed({ status: 201, headers: {}, data: { ...GitLabCommandFixture.pipeline, id: 501, source: "merge_request_event", ref: "refs/merge-requests/42/head" } }) })
  expect(yield* fixture.service.perform(binding, GitLabCommandFixture.intent("pipeline.mergeRequest", { resourceID: "42" }), { provider: "gitlab" }))
    .toEqual({ acknowledgement: { runID: "501" } })
  expect(fixture.state.writes).toBe(1)
  expect(fixture.requests.some((request) => request.path.includes("repository/files/"))).toBe(false)
  expect(yield* fixture.service.perform(binding, GitLabCommandFixture.intent("pipeline.mergeRequest", { resourceID: "42" }, { sourceVersion: "explicit" }),
    { provider: "gitlab" }).pipe(Effect.flip)).toMatchObject({ kind: "source_unresolved", disposition: "definitely_unsent" })
  expect(fixture.state.writes).toBe(1)
}))

it.effect("GitLab MR wrong project/IID/ref/head/fork preflight prevents writes", Effect.gen(function* () {
  for (const data of [{ ...mr, project_id: 22 }, { ...mr, target_project_id: 22 }, { ...mr, iid: 43 },
    { ...mr, sha: "b".repeat(40) }, { ...mr, source_branch: "other" }, { ...mr, source_project_id: 22 }, { ...mr, state: "closed" }]) {
    const fixture = GitLabCommandFixture.make({ routes: [{ path: "projects/21/merge_requests/42", reply: () => Effect.succeed({ status: 200, headers: {}, data }) }] })
    expect(yield* fixture.service.perform(binding, GitLabCommandFixture.intent("pipeline.mergeRequest", { resourceID: "42", ref: "feature/release" }, { commit: mr.sha }),
      { provider: "gitlab" }).pipe(Effect.flip)).toMatchObject({ disposition: "definitely_unsent" })
    expect(fixture.state.writes).toBe(0)
  }
  const fixture = GitLabCommandFixture.make()
  expect(yield* fixture.service.perform(binding, GitLabCommandFixture.intent("pipeline.mergeRequest", { resourceID: "not-an-iid" }), { provider: "gitlab" }).pipe(Effect.flip))
    .toMatchObject({ kind: "invalid_input", disposition: "definitely_unsent" })
  expect(fixture.requests).toEqual([])
}))

it.effect("GitLab MR returned branch pipeline or unrelated MR is outcome-unknown, not guessed attribution", Effect.gen(function* () {
  for (const result of [{ ...GitLabCommandFixture.pipeline, id: 501, source: "api", ref: "main" },
    { ...GitLabCommandFixture.pipeline, id: 501, source: "merge_request_event", ref: "refs/merge-requests/43/head" },
    { ...GitLabCommandFixture.pipeline, id: 501, project_id: 22, source: "merge_request_event", ref: "refs/merge-requests/42/head" }]) {
    const fixture = GitLabCommandFixture.make({ routes: [{ path: "projects/21/merge_requests/42", reply: () => Effect.succeed({ status: 200, headers: {}, data: mr }) }],
      write: () => Effect.succeed({ status: 201, headers: {}, data: result }) })
    expect(yield* fixture.service.perform(binding, GitLabCommandFixture.intent("pipeline.mergeRequest", { resourceID: "42" }), { provider: "gitlab" }).pipe(Effect.flip))
      .toMatchObject({ kind: "outcome_unknown", disposition: "unknown" })
    expect(fixture.state.writes).toBe(1)
  }
}))
