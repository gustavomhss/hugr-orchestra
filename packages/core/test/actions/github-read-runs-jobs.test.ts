import { expect } from "bun:test"
import { Effect } from "effect"
import { GitHubReadFixture } from "../fixture/github-read"
import { it } from "../lib/effect"

const f = GitHubReadFixture
const runRoute = "repositories/9347/actions/runs/30433642"
const attemptRoute = `${runRoute}/attempts/2/jobs?page=1&per_page=50`

it.effect("native SHA-256 run commits and filter stay exact; abbreviated commits reject before request", Effect.gen(function* () {
  const commit = "a".repeat(64)
  const fixture = f.recorded({ [`repositories/9347/actions/runs?head_sha=${commit}&page=1&per_page=50`]:
    f.response({ total_count: 1, workflow_runs: [{ ...f.run, head_sha: commit }] }) })
  expect((yield* fixture.adapter.runs(f.binding, { commit })).items[0].commit).toBe(commit)
  const before = fixture.calls.length
  expect(yield* fixture.adapter.runs(f.binding, { commit: "a".repeat(63) }).pipe(Effect.flip)).toMatchObject({ kind: "invalid_input" })
  expect(fixture.calls.length).toBe(before)
}))

it.effect("run native filters, owning repository, actor and attempt survive projection", Effect.gen(function* () {
  const route = `repositories/9347/actions/workflows/161335/runs?branch=feature%2Fbuild&event=pull_request&status=neutral&head_sha=${f.sha}&actor=octocat&created=2020-01-01..2020-02-01&page=1&per_page=50`
  const fixture = f.recorded({ [route]: f.response({ total_count: 1, workflow_runs: [f.run] }), [runRoute]: f.response(f.run) })
  const page = yield* fixture.adapter.runs(f.binding, { workflowID: "161335", ref: "feature/build", event: "pull_request",
    status: "neutral", commit: f.sha, actor: "octocat", created: "2020-01-01..2020-02-01" })
  expect(page.items[0]).toMatchObject({ id: "30433642", workflowID: "161335", ref: "main", commit: f.sha,
    status: "completed", conclusion: "neutral", event: "pull_request", actor: "octocat", attempt: 3,
    createdAt: f.run.created_at, startedAt: f.run.run_started_at, updatedAt: f.run.updated_at,
    triggeringActor: "another-user", repositoryID: "9347" })
  expect(page.items[0].finishedAt).toBeUndefined()
  expect(yield* fixture.adapter.run(f.binding, "30433642")).toEqual(page.items[0])
}))

it.effect("run detail wrong native run or owning repository rejects; fork head repository stays distinct", Effect.gen(function* () {
  for (const [data, kind] of [[{ ...f.run, id: 1 }, "transport_failed"],
    [{ ...f.run, repository: { ...f.repo, id: 9999 } }, "binding_stale"],
    [{ ...f.run, workflow_id: "name-not-id" }, "transport_failed"]] as const) {
    const fixture = f.recorded({ [runRoute]: f.response(data) })
    expect(yield* fixture.adapter.run(f.binding, "30433642").pipe(Effect.flip)).toMatchObject({ kind })
  }
  const fixture = f.recorded({ [runRoute]: f.response(f.run) })
  expect((yield* fixture.adapter.run(f.binding, "30433642")).id).toBe("30433642")
}))

it.effect("explicit attempt path proves omitted native attempt; optional step times stay absent", Effect.gen(function* () {
  const { run_attempt, ...job } = f.job
  const fixture = f.recorded({ [runRoute]: f.response(f.run), [attemptRoute]: f.response({ total_count: 1,
    jobs: [{ ...job, runner_name: null, steps: [{ number: 0, name: "Pending step", status: "queued", conclusion: null }] }] }) })
  const page = yield* fixture.adapter.jobs(f.binding, { runID: "30433642", attempt: 2 })
  expect(page.items[0].attempt).toBe(2)
  expect(page.items[0].runner).toBeUndefined()
  expect(page.items[0].steps[0]).toEqual({ number: 0, name: "Pending step", status: "queued", conclusion: null })
}))

it.effect("run pagination cursor rejects changed native actor or workflow selection", Effect.gen(function* () {
  const route = "repositories/9347/actions/workflows/161335/runs"
  const fixture = f.recorded({ [`${route}?actor=octocat&page=1&per_page=1`]: f.response({ total_count: 2, workflow_runs: [f.run] },
    { link: `<https://api.github.com/${route}?actor=octocat&page=2&per_page=1>; rel="next"` }) })
  const first = yield* fixture.adapter.runs(f.binding, { workflowID: "161335", actor: "octocat", limit: 1 })
  expect(first.next).toBeString()
  expect(yield* fixture.adapter.runs(f.binding, { workflowID: "161335", actor: "another", limit: 1, cursor: first.next }).pipe(Effect.flip)).toMatchObject({ kind: "invalid_input" })
  expect(yield* fixture.adapter.runs(f.binding, { workflowID: "161336", actor: "octocat", limit: 1, cursor: first.next }).pipe(Effect.flip)).toMatchObject({ kind: "invalid_input" })
}))

it.effect("attempt-specific native jobs use attempts path and preserve steps/runner without guessed definition", Effect.gen(function* () {
  const fixture = f.recorded({ [runRoute]: f.response(f.run), [attemptRoute]: f.response({ total_count: 1, jobs: [f.job] }) })
  const page = yield* fixture.adapter.jobs(f.binding, { runID: "30433642", attempt: 2 })
  expect(page.items[0]).toMatchObject({ id: "399444496", runID: "30433642", name: "test (ubuntu-latest, 20)", attempt: 2,
    status: "completed", conclusion: "failure", kind: "job", runner: "hosted-17", runnerID: "17", runnerGroupID: "1",
    runnerLabels: ["ubuntu-latest"], startedAt: f.job.started_at, finishedAt: f.job.completed_at,
    steps: [{ number: 1, name: "Set up job", status: "completed", conclusion: "success" },
      { number: 2, name: "Test", status: "completed", conclusion: "failure" }] })
  expect(page.items[0]).not.toHaveProperty("definitionID")
  expect(fixture.calls.map((call) => f.key(call))).toEqual(["repositories/9347", runRoute, attemptRoute])
}))

it.effect("current jobs pin resolved attempt; cursor cannot cross current attempt after rerun", Effect.gen(function* () {
  const route = `${runRoute}/attempts/3/jobs?page=1&per_page=50`
  const fixture = f.recorded({ [runRoute]: f.response(f.run), [route]: f.response({ total_count: 51, jobs: [{ ...f.job, run_attempt: 3 }] },
    { link: `<https://api.github.com/${runRoute}/attempts/3/jobs?page=2&per_page=50>; rel="next"` }),
    [`${runRoute}/attempts/3/jobs?page=2&per_page=50`]: f.response({ total_count: 51, jobs: [{ ...f.job, id: 399444497, run_attempt: 3 }] }) })
  const first = yield* fixture.adapter.jobs(f.binding, { runID: "30433642" })
  expect(first.items[0].attempt).toBe(3)
  fixture.routes[runRoute] = f.response({ ...f.run, run_attempt: 4 })
  expect(yield* fixture.adapter.jobs(f.binding, { runID: "30433642", cursor: first.next }).pipe(Effect.flip)).toMatchObject({ kind: "invalid_input" })
  expect(yield* fixture.adapter.jobs(f.binding, { runID: "30433642", attempt: 2, cursor: first.next }).pipe(Effect.flip)).toMatchObject({ kind: "invalid_input" })
  expect((yield* fixture.adapter.jobs(f.binding, { runID: "30433642", attempt: 3, cursor: first.next })).items[0])
    .toMatchObject({ id: "399444497", attempt: 3 })
}))

it.effect("rerun racing current jobs leaves the resolved attempt pinned instead of requesting latest", Effect.gen(function* () {
  const route = `${runRoute}/attempts/3/jobs?page=1&per_page=50`
  const fixture = f.recorded({ [runRoute]: f.response(f.run), [route]: f.response({ total_count: 1, jobs: [{ ...f.job, run_attempt: 3 }] }),
    [`${runRoute}/jobs?filter=latest&page=1&per_page=50`]: f.response({ total_count: 1, jobs: [{ ...f.job, run_attempt: 4 }] }) })
  fixture.state.after = (request) => {
    if (request.path !== runRoute) return
    fixture.routes[runRoute] = f.response({ ...f.run, run_attempt: 4 })
  }
  expect((yield* fixture.adapter.jobs(f.binding, { runID: "30433642" })).items[0].attempt).toBe(3)
  expect(fixture.calls.map((call) => f.key(call))).toEqual(["repositories/9347", runRoute, route])
}))

it.effect("missing current run_attempt fails named while a proved explicit attempt remains readable", Effect.gen(function* () {
  const { run_attempt, ...run } = f.run
  const fixture = f.recorded({ [runRoute]: f.response(run), [attemptRoute]: f.response({ total_count: 1, jobs: [f.job] }),
    [`${runRoute}/jobs?filter=latest&page=1&per_page=50`]: f.response({ total_count: 1, jobs: [f.job] }) })
  expect(yield* fixture.adapter.jobs(f.binding, { runID: "30433642" }).pipe(Effect.flip)).toMatchObject({ kind: "capability_unavailable" })
  expect(fixture.calls.map((call) => f.key(call))).toEqual(["repositories/9347", runRoute])
  expect((yield* fixture.adapter.jobs(f.binding, { runID: "30433642", attempt: 2 })).items[0].attempt).toBe(2)
}))

it.effect("pinned current attempt fills omitted job attempt and rejects conflicting native run/attempt", Effect.gen(function* () {
  const { run_attempt, ...job } = f.job
  const route = `${runRoute}/attempts/3/jobs?page=1&per_page=50`
  const fixture = f.recorded({ [runRoute]: f.response(f.run), [route]: f.response({ total_count: 1, jobs: [job] }) })
  expect((yield* fixture.adapter.jobs(f.binding, { runID: "30433642" })).items[0].attempt).toBe(3)
  for (const conflicting of [{ ...f.job, run_attempt: 4 }, { ...f.job, run_id: 1, run_attempt: 3 }]) {
    fixture.routes[route] = f.response({ total_count: 1, jobs: [conflicting] })
    expect(yield* fixture.adapter.jobs(f.binding, { runID: "30433642" }).pipe(Effect.flip)).toMatchObject({ kind: "transport_failed" })
  }
}))

it.effect("wrong job run ID or attempt rejects rather than flattening execution history", Effect.gen(function* () {
  for (const job of [{ ...f.job, run_id: 1 }, { ...f.job, run_attempt: 3 }, { ...f.job, id: "0001" }]) {
    const fixture = f.recorded({ [runRoute]: f.response(f.run), [attemptRoute]: f.response({ total_count: 1, jobs: [job] }) })
    expect(yield* fixture.adapter.jobs(f.binding, { runID: "30433642", attempt: 2 }).pipe(Effect.flip)).toMatchObject({ kind: "transport_failed" })
  }
  const fixture = f.recorded()
  for (const attempt of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    expect(yield* fixture.adapter.jobs(f.binding, { runID: "30433642", attempt }).pipe(Effect.flip)).toMatchObject({ kind: "invalid_input" })
  }
  expect(fixture.calls).toEqual([])
}))
