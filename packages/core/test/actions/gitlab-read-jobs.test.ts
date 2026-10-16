import { expect } from "bun:test"
import { Effect, Schema } from "effect"
import { Actions } from "@orchestra/schema/actions"
import { ActionsError } from "../../src/actions/error"
import { it } from "../lib/effect"
import { GitLabReadFixture } from "./gitlab-read-fixture"

const binding = GitLabReadFixture.binding
const pipelineRoute = { path: "projects/21/pipelines/287", data: GitLabReadFixture.pipeline }

it.effect("GitLab retry mutation: include_retried preserves distinct native jobs without invented predecessor/attempt/steps", Effect.gen(function* () {
  // Optional retried attributes are injected to test preservation, not claimed
  // as part of the recorded REST example. Hosts omitting them remain unknown.
  const previous = { ...GitLabReadFixture.job, retried: true }
  const current = { ...GitLabReadFixture.job, id: 9, status: "success", retried: false, allow_failure: true }
  const parallel = { ...GitLabReadFixture.job, id: 10, status: "preparing", runner: null }
  const fixture = GitLabReadFixture.make([pipelineRoute,
    { path: "projects/21/pipelines/287/jobs", reply: (request) => Effect.succeed({ status: 200, headers: { "x-next-page": "" },
      data: request.query?.include_retried === true ? [current, previous, parallel] : [current, parallel] }) },
  ])
  const page = yield* fixture.adapter.jobs(binding, { runID: "287" })
  expect(page.items.map((job) => job.id)).toEqual(["9", "8", "10"])
  expect(page.items[1]).toMatchObject({ retried: true, stage: "test", runner: "32", runnerID: "32", kind: "job", status: "failed", conclusion: "failed", allowFailure: false })
  expect(page.items[0]).toMatchObject({ retried: false, allowFailure: true })
  expect(page.items[2]).not.toHaveProperty("retried")
  expect(page.items[2]).not.toHaveProperty("conclusion")
  page.items.forEach((job) => {
    expect(job.steps).toEqual([])
    expect(job).not.toHaveProperty("retryOf")
    expect(job).not.toHaveProperty("definitionID")
    expect(job).not.toHaveProperty("attempt")
  })
  expect(Schema.decodeUnknownOption(Actions.JobPage)(page)._tag).toBe("Some")
  expect(fixture.requests.at(-1)?.query).toEqual({ page: 1, per_page: 50, include_retried: true })
  expect(page).not.toHaveProperty("total")
}))

it.effect("GitLab jobs/bridges pages stay independent and retain native downstream identity", Effect.gen(function* () {
  const fixture = GitLabReadFixture.make([pipelineRoute,
    { path: "projects/21/pipelines/287/jobs", query: { page: 1, per_page: 50, include_retried: true }, data: [GitLabReadFixture.job], headers: { "x-next-page": "2", "x-total": "2" } },
    { path: "projects/21/pipelines/287/jobs", query: { page: 2, per_page: 50, include_retried: true }, data: [{ ...GitLabReadFixture.job, id: 9 }], headers: { "x-next-page": "", "x-total": "2" } },
    { path: "projects/21/pipelines/287/bridges", query: { page: 1, per_page: 50 }, data: [{ ...GitLabReadFixture.job, id: 50,
      status: "pending", downstream_pipeline: { id: 600, project_id: 99 } }], headers: { "x-next-page": "2" } },
    { path: "projects/21/pipelines/287/bridges", query: { page: 2, per_page: 50 }, data: [{ ...GitLabReadFixture.job, id: 51, downstream_pipeline: null }], headers: { "x-next-page": "" } },
  ])
  const first = yield* fixture.adapter.jobs(binding, { runID: "287" })
  const second = yield* fixture.adapter.jobs(binding, { runID: "287", cursor: first.next })
  const third = yield* fixture.adapter.jobs(binding, { runID: "287", cursor: second.next })
  const fourth = yield* fixture.adapter.jobs(binding, { runID: "287", cursor: third.next })
  expect([first, second, third, fourth].flatMap((page) => page.items.map((job) => job.id))).toEqual(["8", "9", "50", "51"])
  expect(third.items[0]).toMatchObject({ runID: "287", downstreamID: "600", downstreamProjectID: "99", kind: "bridge", status: "pending" })
  expect(first.items[0].kind).toBe("job")
  expect(fourth.items[0].kind).toBe("bridge")
  expect(fourth.items[0]).not.toHaveProperty("downstreamID")
  expect(fourth.items[0]).not.toHaveProperty("downstreamProjectID")
  expect(fourth).not.toHaveProperty("next")
  expect([first, second, third, fourth].every((page) => !("total" in page))).toBe(true)
  expect(fixture.requests.filter((request) => /\/(?:jobs|bridges)$/.test(request.path)).map((request) => [request.path, request.query?.page]))
    .toEqual([["projects/21/pipelines/287/jobs", 1], ["projects/21/pipelines/287/jobs", 2], ["projects/21/pipelines/287/bridges", 1], ["projects/21/pipelines/287/bridges", 2]])
  const before = fixture.requests.length
  expect(yield* fixture.adapter.jobs(binding, { runID: "288", cursor: first.next }).pipe(Effect.flip)).toMatchObject({ kind: "invalid_input" })
  expect(fixture.requests).toHaveLength(before)
}))

it.effect("GitLab null job status and native runner ID stay exact; required job tags are not runner labels", Effect.gen(function* () {
  const fixture = GitLabReadFixture.make([pipelineRoute,
    { path: "projects/21/pipelines/287/jobs", data: [{ ...GitLabReadFixture.job, status: null,
      tag_list: ["docker runner", "ubuntu18"], runner: { id: 32, description: null, runner_type: "group_type", name: null } },
      { ...GitLabReadFixture.job, id: 9, status: null, runner: null }], headers: { "x-next-page": "" } },
    { path: "projects/21/pipelines/287/bridges", data: [{ ...GitLabReadFixture.job, id: 50, status: null,
      downstream_pipeline: { id: 600 } }], headers: { "x-next-page": "" } },
  ])
  const jobs = yield* fixture.adapter.jobs(binding, { runID: "287" })
  expect(jobs.items[0]).toMatchObject({ kind: "job", status: null, runnerID: "32" })
  expect(jobs.items[1]).not.toHaveProperty("runnerID")
  const bridges = yield* fixture.adapter.jobs(binding, { runID: "287", cursor: jobs.next })
  expect(bridges.items[0]).toMatchObject({ kind: "bridge", status: null, downstreamID: "600" })
  expect(bridges.items[0]).not.toHaveProperty("downstreamProjectID")
  for (const job of [...jobs.items, ...bridges.items]) {
    expect(job).not.toHaveProperty("conclusion")
    expect(job).not.toHaveProperty("runnerLabels")
    expect(job).not.toHaveProperty("runnerGroupID")
    expect(job).not.toHaveProperty("retryOf")
    expect(job).not.toHaveProperty("attempt")
    expect(Schema.decodeUnknownOption(Actions.Job)(job)._tag).toBe("Some")
  }
}))

it.effect("GitLab job ownership, unsafe native IDs, attempts and broken page metadata fail explicitly", Effect.gen(function* () {
  for (const pipeline of [{ ...GitLabReadFixture.job.pipeline, id: 288 }, { ...GitLabReadFixture.job.pipeline, project_id: 22 }]) {
    const fixture = GitLabReadFixture.make([pipelineRoute, { path: "projects/21/pipelines/287/jobs", data: [{ ...GitLabReadFixture.job, pipeline }] }])
    expect(yield* fixture.adapter.jobs(binding, { runID: "287" }).pipe(Effect.flip)).toMatchObject({ kind: "binding_stale" })
  }
  for (const runID of ["0", "-1", "branch", "287/jobs", "01"]) {
    const fixture = GitLabReadFixture.make()
    expect(yield* fixture.adapter.jobs(binding, { runID }).pipe(Effect.flip)).toMatchObject({ kind: "invalid_input" })
    expect(fixture.requests).toEqual([])
  }
  const fixture = GitLabReadFixture.make()
  expect(yield* fixture.adapter.jobs(binding, { runID: "287", attempt: 1 }).pipe(Effect.flip)).toMatchObject({ kind: "capability_unavailable" })
  expect(fixture.requests).toEqual([])
  for (const headers of Array.of<Record<string, string>>({ "x-next-page": "0" }, { "x-next-page": "1" }, { "x-next-page": "50001" }, { "x-total": "unknown" })) {
    const fixture = GitLabReadFixture.make([pipelineRoute, { path: "projects/21/pipelines/287/jobs", data: [], headers }])
    expect(yield* fixture.adapter.jobs(binding, { runID: "287" }).pipe(Effect.flip)).toMatchObject({ kind: "transport_failed" })
  }
}))

it.effect("GitLab bridge denial does not silently erase downstream jobs", Effect.gen(function* () {
  const denied = new ActionsError({ kind: "permission_denied", message: "Native bridge read denied" })
  const fixture = GitLabReadFixture.make([pipelineRoute,
    { path: "projects/21/pipelines/287/jobs", data: [], headers: { "x-next-page": "" } },
    { path: "projects/21/pipelines/287/bridges", reply: () => Effect.fail(denied) },
  ])
  const first = yield* fixture.adapter.jobs(binding, { runID: "287" })
  expect(first.next).toBeString()
  expect(yield* fixture.adapter.jobs(binding, { runID: "287", cursor: first.next }).pipe(Effect.flip)).toBe(denied)
}))
