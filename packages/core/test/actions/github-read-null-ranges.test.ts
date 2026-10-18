import { expect } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { GitHubReadFixture } from "../fixture/github-read"
import { it } from "../lib/effect"

const f = GitHubReadFixture
const runs = "repositories/9347/actions/runs"
const runRoute = `${runs}/30433642`
const jobsRoute = `${runRoute}/attempts/2/jobs?page=1&per_page=50`

it.effect("native nullable workflow name and run name/branch/status/conclusion remain null", Effect.gen(function* () {
  const run = { ...f.run, name: null, head_branch: null, status: null, conclusion: null }
  const fixture = f.recorded({ [runRoute]: f.response(run),
    [`${runs}?page=1&per_page=50`]: f.response({ workflow_runs: [run], total_count: 1 }),
    "repositories/9347/actions/workflows?page=1&per_page=50": f.response({ workflows: [{ ...f.workflow, name: null }], total_count: 1 }) })
  const detail = yield* fixture.adapter.run(f.binding, "30433642")
  expect(detail).toMatchObject({ name: null, ref: null, status: null, conclusion: null, updatedAt: f.run.updated_at,
    actor: "octocat", triggeringActor: "another-user", repositoryID: "9347" })
  expect((yield* fixture.adapter.runs(f.binding, {})).items[0]).toEqual(detail)
  expect((yield* fixture.adapter.workflows(f.binding, {})).items[0]).toMatchObject({ name: null, dispatchable: false, dispatchState: "unknown" })
  expect(Schema.decodeUnknownSync(Actions.Run)(detail)).toEqual(detail)
}))

it.effect("native nullable job/step states preserve runner IDs, group and labels without a bridge", Effect.gen(function* () {
  const fixture = f.recorded({ [runRoute]: f.response(f.run), [jobsRoute]: f.response({ total_count: 1,
    jobs: [{ ...f.job, status: null, conclusion: null, runner_id: "9223372036854775807", runner_group_id: 0,
      labels: ["self-hosted", "linux", "ARM64"], steps: [{ ...f.job.steps[0], status: null, conclusion: null }] }] }) })
  const job = (yield* fixture.adapter.jobs(f.binding, { runID: "30433642", attempt: 2 })).items[0]
  expect(job).toMatchObject({ status: null, conclusion: null, runnerID: "9223372036854775807", runnerGroupID: "0",
    runnerLabels: ["self-hosted", "linux", "ARM64"], kind: "job", steps: [{ status: null, conclusion: null }] })
  expect(job).not.toHaveProperty("downstreamID")
  expect(job).not.toHaveProperty("downstreamProjectID")
  expect(Schema.decodeUnknownSync(Actions.Job)(job)).toEqual(job)
}))

it.effect("missing native optional fields remain omitted rather than null or empty metadata", Effect.gen(function* () {
  const { actor, triggering_actor, updated_at, conclusion, run_started_at, run_attempt, ...run } = f.run
  const { runner_id, runner_group_id, labels, runner_name, started_at, completed_at, conclusion: omittedConclusion,
    run_attempt: omittedAttempt, ...job } = f.job
  const fixture = f.recorded({ [runRoute]: f.response(run), [jobsRoute]: f.response({ total_count: 1,
    jobs: [{ ...job, steps: [{ number: 1, name: "Waiting", status: null }] }] }),
    "repositories/9347/actions/workflows?page=1&per_page=50": f.response({ total_count: 1,
      workflows: [{ id: 161335, name: null, path: f.workflow.path, state: "active" }] }) })
  const projectedRun = yield* fixture.adapter.run(f.binding, "30433642")
  for (const field of ["actor", "triggeringActor", "updatedAt", "conclusion", "startedAt", "attempt", "finishedAt"])
    expect(projectedRun).not.toHaveProperty(field)
  const projectedJob = (yield* fixture.adapter.jobs(f.binding, { runID: "30433642", attempt: 2 })).items[0]
  for (const field of ["runnerID", "runnerGroupID", "runnerLabels", "runner", "startedAt", "finishedAt", "conclusion"])
    expect(projectedJob).not.toHaveProperty(field)
  expect(projectedJob.attempt).toBe(2)
  expect(projectedJob.steps[0]).toEqual({ number: 1, name: "Waiting", status: null })
  expect((yield* fixture.adapter.workflows(f.binding, {})).items[0]).not.toHaveProperty("updatedAt")
}))

it.effect("null runner metadata omits non-nullable optional IDs while native empty labels remain present", Effect.gen(function* () {
  const fixture = f.recorded({ [runRoute]: f.response(f.run), [jobsRoute]: f.response({ total_count: 1,
    jobs: [{ ...f.job, runner_id: null, runner_group_id: null, runner_name: null, labels: [], started_at: null, completed_at: null }] }) })
  const job = (yield* fixture.adapter.jobs(f.binding, { runID: "30433642", attempt: 2 })).items[0]
  expect(job.runnerLabels).toEqual([])
  for (const field of ["runnerID", "runnerGroupID", "runner", "startedAt", "finishedAt"]) expect(job).not.toHaveProperty(field)
}))

it.effect("native runner IDs and labels decode strictly without unsafe coercion", Effect.gen(function* () {
  for (const metadata of [{ runner_id: Number.MAX_SAFE_INTEGER + 1 }, { runner_id: "001" }, { runner_group_id: -1 },
    { runner_id: "runner-name" }, { labels: ["linux", 17] }]) {
    const fixture = f.recorded({ [runRoute]: f.response(f.run), [jobsRoute]: f.response({ total_count: 1, jobs: [{ ...f.job, ...metadata }] }) })
    expect(yield* fixture.adapter.jobs(f.binding, { runID: "30433642", attempt: 2 }).pipe(Effect.flip)).toMatchObject({ kind: "transport_failed" })
  }
}))

it.effect("explicit created bounds use documented inclusive native date/time comparisons and ranges", Effect.gen(function* () {
  for (const [input, created] of [
    [{ createdAfter: "2020-01-01" }, ">=2020-01-01"],
    [{ createdBefore: "2020-02-01" }, "<=2020-02-01"],
    [{ createdAfter: "2020-01-01", createdBefore: "2020-02-01" }, "2020-01-01..2020-02-01"],
    [{ createdAfter: "2020-01-01T01:00:00+07:00", createdBefore: "2020-02-01T00:00:00Z" }, "2020-01-01T01:00:00+07:00..2020-02-01T00:00:00Z"],
    [{ created: "*..2020-02-01" }, "*..2020-02-01"],
    [{ created: ">2020-01-01T00:00:00Z" }, ">2020-01-01T00:00:00Z"],
  ] as const) {
    const fixture = f.recorded({ [`${runs}?created=${encodeURIComponent(created)}&page=1&per_page=50`]: f.response({ total_count: 1, workflow_runs: [f.run] }) })
    expect((yield* fixture.adapter.runs(f.binding, input)).items[0].id).toBe("30433642")
    expect(fixture.calls[1].query).toEqual({ created, page: 1, per_page: 50 })
  }
}))

it.effect("ambiguous raw created plus explicit bounds reject before any provider request", Effect.gen(function* () {
  const fixture = f.recorded({ [`${runs}?created=2020-01-01&page=1&per_page=50`]: f.response({ total_count: 0, workflow_runs: [] }) })
  for (const input of [{ created: "2020-01-01", createdAfter: "2020-01-01" }, { created: "2020-01-01", createdBefore: "2020-02-01" }])
    expect(yield* fixture.adapter.runs(f.binding, input).pipe(Effect.flip)).toMatchObject({ kind: "invalid_input", disposition: "definitely_unsent" })
  expect(fixture.calls).toEqual([])
}))

it.effect("unsupported updated-time ranges fail capability_unavailable instead of silently ignored filters", Effect.gen(function* () {
  const fixture = f.recorded({ [`${runs}?page=1&per_page=50`]: f.response({ total_count: 0, workflow_runs: [] }) })
  for (const input of [{ updatedAfter: "2020-01-01" }, { updatedBefore: "2020-02-01" }, { updatedAfter: "2020-01-01", updatedBefore: "2020-02-01" }])
    expect(yield* fixture.adapter.runs(f.binding, input).pipe(Effect.flip)).toMatchObject({ kind: "capability_unavailable", disposition: "definitely_unsent" })
  expect(fixture.calls).toEqual([])
}))

it.effect("invalid or reversed native created bounds reject rather than broadening results", Effect.gen(function* () {
  const fixture = f.recorded()
  for (const input of [{ createdAfter: "2020-02-30" }, { createdBefore: "2020-01-01T24:00:00Z" },
    { createdAfter: "2020-01-01T00:00:00" }, { createdAfter: ">2020-01-01" }, { createdBefore: "" },
    { createdAfter: "2020-02-01", createdBefore: "2020-01-01" }, { created: "2020-02-01..2020-01-01" },
    { created: "2020-01-01..2020-02-01..2020-03-01" }])
    expect(yield* fixture.adapter.runs(f.binding, input).pipe(Effect.flip)).toMatchObject({ kind: "invalid_input" })
  expect(fixture.calls).toEqual([])
}))

it.effect("created range cursor binds effective filter and page size, and accepts equivalent raw selection", Effect.gen(function* () {
  const query = "created=2020-01-01..2020-02-01"
  const fixture = f.recorded({ [`${runs}?${query}&page=1&per_page=1`]: f.response({ total_count: 2, workflow_runs: [f.run] },
    { link: `<https://api.github.com/${runs}?${query}&page=2&per_page=1>; rel="next"` }),
    [`${runs}?${query}&page=2&per_page=1`]: f.response({ total_count: 2, workflow_runs: [{ ...f.run, id: 30433643 }] }) })
  const input = { createdAfter: "2020-01-01", createdBefore: "2020-02-01", limit: 1 }
  const first = yield* fixture.adapter.runs(f.binding, input)
  expect(first.next).toBeString()
  expect((yield* fixture.adapter.runs(f.binding, { ...input, cursor: first.next })).items[0].id).toBe("30433643")
  expect((yield* fixture.adapter.runs(f.binding, { created: "2020-01-01..2020-02-01", limit: 1, cursor: first.next })).items[0].id).toBe("30433643")
  const before = fixture.calls.length
  for (const changed of [{ ...input, createdAfter: "2020-01-02" }, { ...input, createdBefore: "2020-02-02" }, { ...input, limit: 2 }])
    expect(yield* fixture.adapter.runs(f.binding, { ...changed, cursor: first.next }).pipe(Effect.flip)).toMatchObject({ kind: "invalid_input" })
  expect(fixture.calls.length).toBe(before)
}))
