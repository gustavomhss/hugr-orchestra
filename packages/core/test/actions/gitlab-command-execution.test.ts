import { expect } from "bun:test"
import { Effect } from "effect"
import { ActionsError } from "../../src/actions/error"
import { GitLabCommandFixture } from "./gitlab-command-fixture"
import { it } from "../lib/effect"

const binding = GitLabCommandFixture.binding
const runTarget = { runID: "287", ref: "main" }
const jobTarget = { ...runTarget, jobID: "8" }

it.effect("GitLab pipeline retry is failed/canceled mode, never rerun-all; cancellation only acknowledges native acceptance", Effect.gen(function* () {
  const fixture = GitLabCommandFixture.make({ write: () => Effect.succeed({ status: 200, headers: {}, data: { ...GitLabCommandFixture.pipeline, status: "pending" } }) })
  expect(yield* fixture.service.perform(binding, GitLabCommandFixture.intent("run.retry", runTarget, { commit: GitLabCommandFixture.commit }),
    { provider: "gitlab", mode: "failed" })).toEqual({ acknowledgement: { runID: "287" } })
  expect(fixture.requests.at(-1)).toEqual({ method: "POST", path: "projects/21/pipelines/287/retry" })
  const before = fixture.state.writes
  expect(yield* fixture.service.perform(binding, GitLabCommandFixture.intent("run.retry", runTarget), { provider: "gitlab", mode: "all" }).pipe(Effect.flip))
    .toMatchObject({ kind: "invalid_input", disposition: "definitely_unsent" })
  expect(fixture.state.writes).toBe(before)
  fixture.state.pipeline = { ...GitLabCommandFixture.pipeline, status: "success" }
  // Aggregate success can still contain allow-failure/manual failed jobs. The
  // native endpoint selects failed/canceled jobs; the adapter never reruns all.
  expect(yield* fixture.service.perform(binding, GitLabCommandFixture.intent("run.retry", runTarget), { provider: "gitlab", mode: "failed" }))
    .toEqual({ acknowledgement: { runID: "287" } })
  expect(fixture.requests.at(-1)).toEqual({ method: "POST", path: "projects/21/pipelines/287/retry" })
  expect(yield* fixture.service.perform(binding, GitLabCommandFixture.intent("run.cancel", runTarget), { provider: "gitlab" }))
    .toEqual({ acknowledgement: { runID: "287" } })
  expect(fixture.requests.at(-1)).toEqual({ method: "POST", path: "projects/21/pipelines/287/cancel" })
}))

it.effect("GitLab source contradiction guard mutation validates immediate top-level job commit/ref after one write", Effect.gen(function* () {
  for (const data of [{ ...GitLabCommandFixture.job, id: 9, commit: { id: "b".repeat(40) } },
    { ...GitLabCommandFixture.job, id: 9, ref: "wrong-ref" }, { ...GitLabCommandFixture.job, id: 9, ref: null }]) {
    const fixture = GitLabCommandFixture.make({ write: () => Effect.succeed({ status: 201, headers: {}, data }) })
    expect(yield* fixture.service.perform(binding, GitLabCommandFixture.intent("job.retry", jobTarget), { provider: "gitlab" }).pipe(Effect.flip))
      .toMatchObject({ kind: "outcome_unknown", disposition: "unknown" })
    expect(fixture.state.writes).toBe(1)
  }
}))

it.effect("GitLab exact-ID readback retains and validates pipeline sha/ref and top-level source contradictions", Effect.gen(function* () {
  for (const data of [{ ...GitLabCommandFixture.job, id: 9, pipeline: { ...GitLabCommandFixture.job.pipeline, sha: "b".repeat(40) } },
    { ...GitLabCommandFixture.job, id: 9, pipeline: { ...GitLabCommandFixture.job.pipeline, ref: "wrong-ref" } },
    { ...GitLabCommandFixture.job, id: 9, commit: { id: "b".repeat(40) } }, { ...GitLabCommandFixture.job, id: 9, ref: "wrong-ref" }]) {
    const fixture = GitLabCommandFixture.make({ write: () => Effect.succeed({ status: 201, headers: {}, data: { id: 9 } }),
      routes: [{ path: "projects/21/jobs/9", reply: () => Effect.succeed({ status: 200, headers: {}, data }) }] })
    expect(yield* fixture.service.perform(binding, GitLabCommandFixture.intent("job.retry", jobTarget), { provider: "gitlab" }).pipe(Effect.flip))
      .toMatchObject({ kind: "outcome_unknown", disposition: "unknown" })
    expect(fixture.state.writes).toBe(1)
    expect(fixture.requests.at(-1)?.path).toBe("projects/21/jobs/9")
  }
}))

it.effect("GitLab null native run ref remains an explicit response precondition", Effect.gen(function* () {
  const fixture = GitLabCommandFixture.make({ pipeline: { ...GitLabCommandFixture.pipeline, ref: null },
    write: () => Effect.succeed({ status: 200, headers: {}, data: { ...GitLabCommandFixture.pipeline, ref: null } }) })
  expect(yield* fixture.service.perform(binding, GitLabCommandFixture.intent("run.cancel", { runID: "287" }), { provider: "gitlab" }))
    .toEqual({ acknowledgement: { runID: "287" } })
  const wrong = GitLabCommandFixture.make({ pipeline: { ...GitLabCommandFixture.pipeline, ref: null },
    write: () => Effect.succeed({ status: 200, headers: {}, data: GitLabCommandFixture.pipeline }) })
  expect(yield* wrong.service.perform(binding, GitLabCommandFixture.intent("run.cancel", { runID: "287" }), { provider: "gitlab" }).pipe(Effect.flip))
    .toMatchObject({ kind: "outcome_unknown", disposition: "unknown" })
  expect(wrong.state.writes).toBe(1)
}))

it.effect("GitLab rename validates exact returned pipeline and owner deletion targets one immutable pipeline", Effect.gen(function* () {
  const fixture = GitLabCommandFixture.make({ write: (request) => request.method === "DELETE"
    ? Effect.succeed({ status: 204, headers: {}, data: null })
    : Effect.succeed({ status: 200, headers: {}, data: { ...GitLabCommandFixture.pipeline, name: "Release" } }) })
  expect(yield* fixture.service.perform(binding, GitLabCommandFixture.intent("run.rename", runTarget), { provider: "gitlab", name: "Release" }))
    .toEqual({ acknowledgement: { runID: "287" } })
  expect(fixture.requests.at(-1)).toEqual({ method: "PUT", path: "projects/21/pipelines/287/metadata", body: { name: "Release" } })
  expect(yield* fixture.service.perform(binding, GitLabCommandFixture.intent("run.delete", runTarget), { provider: "gitlab" }).pipe(Effect.flip))
    .toMatchObject({ kind: "permission_denied", disposition: "definitely_unsent" })
  fixture.state.project = { ...GitLabCommandFixture.project, permissions: { project_access: { access_level: 50 }, group_access: null } }
  expect(yield* fixture.service.perform(binding, GitLabCommandFixture.intent("run.delete", runTarget), { provider: "gitlab" }))
    .toEqual({ acknowledgement: { runID: "287" } })
  expect(fixture.requests.at(-1)).toEqual({ method: "DELETE", path: "projects/21/pipelines/287" })
}))

it.effect("GitLab manual play variables map native attributes and reject file variables without silent omission", Effect.gen(function* () {
  const fixture = GitLabCommandFixture.make({ job: { ...GitLabCommandFixture.job, status: "manual" },
    write: () => Effect.succeed({ status: 200, headers: {}, data: { ...GitLabCommandFixture.job, status: "pending" } }) })
  expect(yield* fixture.service.perform(binding, GitLabCommandFixture.intent("job.play", jobTarget),
    { provider: "gitlab", variables: [{ key: "X", value: "synthetic-value", variable_type: "env_var" }] }))
    .toEqual({ acknowledgement: { runID: "287", jobID: "8" } })
  expect(fixture.requests.at(-1)).toEqual({ method: "POST", path: "projects/21/jobs/8/play", body: { job_variables_attributes: [{ key: "X", value: "synthetic-value" }] } })
  expect(yield* fixture.service.perform(binding, GitLabCommandFixture.intent("job.play", jobTarget),
    { provider: "gitlab", variables: [{ key: "X", value: "file", variable_type: "file" }] }).pipe(Effect.flip))
    .toMatchObject({ kind: "capability_unavailable", disposition: "definitely_unsent" })
  expect(fixture.state.writes).toBe(1)
  fixture.state.job = GitLabCommandFixture.job
  expect(yield* fixture.service.perform(binding, GitLabCommandFixture.intent("job.play", jobTarget), { provider: "gitlab" }).pipe(Effect.flip))
    .toMatchObject({ kind: "capability_unavailable", disposition: "definitely_unsent" })
}))

it.effect("GitLab job retry keeps owning pipeline and exact replacement ID; cancel never fabricates completion", Effect.gen(function* () {
  const fixture = GitLabCommandFixture.make({ write: (request) => Effect.succeed({ status: 201, headers: {}, data: {
    ...GitLabCommandFixture.job, id: request.path.endsWith("/retry") ? 9 : 8, status: "pending",
  } }) })
  expect(yield* fixture.service.perform(binding, GitLabCommandFixture.intent("job.retry", jobTarget), { provider: "gitlab" }))
    .toEqual({ acknowledgement: { runID: "287", jobID: "9" } })
  expect(yield* fixture.service.perform(binding, GitLabCommandFixture.intent("job.cancel", jobTarget), { provider: "gitlab" }))
    .toEqual({ acknowledgement: { runID: "287", jobID: "8" } })
  expect(fixture.requests.filter((request) => request.method !== "GET").map((request) => request.path))
    .toEqual(["projects/21/jobs/8/retry", "projects/21/jobs/8/cancel"])
}))

it.effect("GitLab erase requires terminal ownership and exact post-write erasure readback", Effect.gen(function* () {
  const fixture = GitLabCommandFixture.make({ project: { ...GitLabCommandFixture.project, permissions: { project_access: null, group_access: { access_level: 40 } } },
    write: () => Effect.succeed({ status: 201, headers: {}, data: { id: 8, erased_at: "2026-10-13T00:00:00Z" } }),
    routes: [{ path: "projects/21/jobs/8", reply: () => Effect.succeed({ status: 200, headers: {}, data: {
      ...GitLabCommandFixture.job, erased_at: fixture.state.writes ? "2026-10-13T00:00:00Z" : null,
    } }) }] })
  expect(yield* fixture.service.perform(binding, GitLabCommandFixture.intent("job.erase", jobTarget), { provider: "gitlab" }))
    .toEqual({ acknowledgement: { runID: "287", jobID: "8" } })
  expect(fixture.requests.at(-1)?.path).toBe("projects/21/jobs/8")
  expect(fixture.state.writes).toBe(1)
  for (const job of [{ ...GitLabCommandFixture.job, status: "running" }, { ...GitLabCommandFixture.job, archived: true }]) {
    const rejected = GitLabCommandFixture.make({ job })
    expect(yield* rejected.service.perform(binding, GitLabCommandFixture.intent("job.erase", jobTarget), { provider: "gitlab" }).pipe(Effect.flip))
      .toMatchObject({ kind: "capability_unavailable", disposition: "definitely_unsent" })
    expect(rejected.state.writes).toBe(0)
  }
  const denied = GitLabCommandFixture.make({ job: { ...GitLabCommandFixture.job, user: { username: "other" } } })
  expect(yield* denied.service.perform(binding, GitLabCommandFixture.intent("job.erase", jobTarget), { provider: "gitlab" }).pipe(Effect.flip))
    .toMatchObject({ kind: "permission_denied", disposition: "definitely_unsent" })
  expect(denied.state.writes).toBe(0)
}))

it.effect("GitLab job foreign owner/ref and nonnative attempt fail before any write", Effect.gen(function* () {
  for (const job of [{ ...GitLabCommandFixture.job, pipeline: { ...GitLabCommandFixture.job.pipeline, project_id: 22 } },
    { ...GitLabCommandFixture.job, pipeline: { ...GitLabCommandFixture.job.pipeline, id: 288 } },
    { ...GitLabCommandFixture.job, ref: "other" }, { ...GitLabCommandFixture.job, commit: { id: "b".repeat(40) } }]) {
    const fixture = GitLabCommandFixture.make({ job })
    expect(yield* fixture.service.perform(binding, GitLabCommandFixture.intent("job.retry", jobTarget), { provider: "gitlab" }).pipe(Effect.flip))
      .toMatchObject({ kind: "binding_stale", disposition: "definitely_unsent" })
    expect(fixture.state.writes).toBe(0)
  }
  const fixture = GitLabCommandFixture.make()
  expect(yield* fixture.service.perform(binding, GitLabCommandFixture.intent("job.retry", jobTarget, { attempt: 1 }), { provider: "gitlab" }).pipe(Effect.flip))
    .toMatchObject({ kind: "capability_unavailable", disposition: "definitely_unsent" })
  expect(fixture.requests).toEqual([])
}))

it.effect("GitLab native bridge retry preserves exact returned ID and gates authenticated version", Effect.gen(function* () {
  const routes = [
    { path: "projects/21/jobs/8", reply: () => Effect.fail(new ActionsError({ kind: "not_found", message: "Native build not found" })) },
    { path: "projects/21/pipelines/287/jobs", reply: () => Effect.succeed({ status: 200, headers: { "x-next-page": "" }, data: [] }) },
    { path: "projects/21/pipelines/287/bridges", reply: () => Effect.succeed({ status: 200, headers: { "x-next-page": "" }, data: [
      { ...GitLabCommandFixture.job, downstream_pipeline: { id: 900, project_id: 99 } },
    ] }) },
  ]
  const fixture = GitLabCommandFixture.make({ routes, write: () => Effect.succeed({ status: 201, headers: {}, data: {
    ...GitLabCommandFixture.job, id: 9,
  } }) })
  expect(yield* fixture.service.perform(binding, GitLabCommandFixture.intent("job.retry", jobTarget), { provider: "gitlab" }))
    .toEqual({ acknowledgement: { runID: "287", jobID: "9" } })
  expect(fixture.state.writes).toBe(1)
  const old = GitLabCommandFixture.make({ routes, version: "16.11.0-ee" })
  expect(yield* old.service.perform({ ...binding, provider: { ...binding.provider, version: "99.0.0" } },
    GitLabCommandFixture.intent("job.retry", jobTarget), { provider: "gitlab" }).pipe(Effect.flip))
    .toMatchObject({ kind: "capability_unavailable", disposition: "definitely_unsent" })
  expect(old.state.writes).toBe(0)
}))

it.effect("GitLab write refusal versus unknown stays truthful and each execution sends once", Effect.gen(function* () {
  for (const error of [new ActionsError({ kind: "permission_denied", message: "Native refusal", disposition: "definitely_rejected" }),
    new ActionsError({ kind: "rate_limited", message: "Native retry later", retryAfter: 5, disposition: "definitely_rejected" }),
    new ActionsError({ kind: "transport_failed", message: "Native socket reset", disposition: "unknown" })]) {
    const fixture = GitLabCommandFixture.make({ write: () => Effect.fail(error) })
    expect(yield* fixture.service.perform(binding, GitLabCommandFixture.intent("run.cancel", runTarget), { provider: "gitlab" }).pipe(Effect.flip)).toBe(error)
    expect(fixture.state.writes).toBe(1)
  }
  for (const data of [{ ...GitLabCommandFixture.pipeline, id: 288 }, { ...GitLabCommandFixture.pipeline, project_id: 22 }, null]) {
    const fixture = GitLabCommandFixture.make({ write: () => Effect.succeed({ status: 200, headers: {}, data }) })
    expect(yield* fixture.service.perform(binding, GitLabCommandFixture.intent("run.cancel", runTarget), { provider: "gitlab" }).pipe(Effect.flip))
      .toMatchObject({ kind: "outcome_unknown", disposition: "unknown" })
    expect(fixture.state.writes).toBe(1)
  }
}))

it.effect("GitLab wrong dispatcher, stale binding and extra target never fabricate success", Effect.gen(function* () {
  const fixture = GitLabCommandFixture.make()
  for (const intent of [GitLabCommandFixture.intent("workflow.enable", {}), GitLabCommandFixture.intent("run.retryFailed", runTarget),
    GitLabCommandFixture.intent("run.cancel", { ...runTarget, resourceID: "42" }),
    { ...GitLabCommandFixture.intent("run.cancel", runTarget), binding: { id: binding.id, revision: 2 } }]) {
    expect(yield* fixture.service.perform(binding, intent, { provider: "gitlab" }).pipe(Effect.flip)).toMatchObject({ disposition: "definitely_unsent" })
  }
  expect(fixture.requests).toEqual([])
}))
