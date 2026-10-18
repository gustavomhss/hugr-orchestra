import { expect } from "bun:test"
import { Effect } from "effect"
import { ActionsError } from "../../src/actions/error"
import { GitHubCommandFixture } from "../fixture/github-command"
import { it } from "../lib/effect"

const f = GitHubCommandFixture
const runPath = `${f.root}/actions/runs/30433642`
const jobPath = `${f.root}/actions/jobs/399444496`

it.effect("native all/failed retries write once and acknowledge original run without inventing an attempt", Effect.gen(function* () {
  for (const [kind, mode, suffix] of [["run.retry", "all", "rerun"], ["run.retryFailed", "failed", "rerun-failed-jobs"]] as const) {
    const fixture = f.recorded()
    expect(yield* fixture.commands.perform(f.binding, f.intent(kind, { runID: "30433642", ref: "main" },
      { commit: f.run.head_sha, attempt: 3 }), { provider: "github", mode, enableDebugLogging: true }))
      .toEqual({ acknowledgement: { runID: "30433642" } })
    expect(fixture.writes()).toEqual([{ method: "POST", path: `${runPath}/${suffix}`, body: { enable_debug_logging: true } }])
    expect(fixture.calls.some((request) => request.path.includes("/commits/"))).toBe(false)
  }
}))

it.effect("retry stale commit/attempt/ref and nonterminal state reject before write", Effect.gen(function* () {
  for (const intent of [f.intent("run.retry", { runID: "30433642" }, { attempt: 2 }),
    f.intent("run.retry", { runID: "30433642" }, { commit: "f".repeat(40) }),
    f.intent("run.retry", { runID: "30433642", ref: "release" })]) {
    const fixture = f.recorded()
    expect(yield* fixture.commands.perform(f.binding, intent, { provider: "github", mode: "all" }).pipe(Effect.flip))
      .toMatchObject({ kind: "source_conflict", disposition: "definitely_unsent" })
    expect(fixture.writes()).toEqual([])
  }
  const fixture = f.recorded()
  fixture.routes[`GET ${runPath}`] = f.reply({ ...f.run, status: "in_progress" })
  expect(yield* fixture.commands.perform(f.binding, f.intent("run.retry", { runID: "30433642" }), { provider: "github", mode: "all" }).pipe(Effect.flip))
    .toMatchObject({ kind: "capability_unavailable", disposition: "definitely_unsent" })
  expect(fixture.writes()).toEqual([])
}))

it.effect("retry source-version guard reads original immutable commit rather than a mutable branch", Effect.gen(function* () {
  const fixture = f.recorded()
  expect(yield* fixture.commands.perform(f.binding, f.intent("run.retry", { runID: "30433642", path: f.pathName },
    { attempt: 3, commit: f.run.head_sha, sourceVersion: f.content(f.text).sha }), { provider: "github", mode: "all" }))
    .toEqual({ acknowledgement: { runID: "30433642" } })
  expect(fixture.calls.filter((request) => request.path.includes("/commits/")).map((request) => request.path)).toEqual([`${f.root}/commits/${f.run.head_sha}`])
}))

it.effect("cancel and force-cancel use native routes and observed API-version support", Effect.gen(function* () {
  for (const [kind, suffix] of [["run.cancel", "cancel"], ["run.forceCancel", "force-cancel"]] as const) {
    const fixture = f.recorded()
    fixture.routes[`GET ${runPath}`] = f.reply({ ...f.run, status: "in_progress", conclusion: null })
    expect(yield* fixture.commands.perform(f.binding, f.intent(kind, { runID: "30433642" }, { attempt: 3 }), { provider: "github" }))
      .toEqual({ acknowledgement: { runID: "30433642" } })
    expect(fixture.writes()).toEqual([{ method: "POST", path: `${runPath}/${suffix}` }])
  }
  const fixture = f.recorded()
  fixture.routes[`GET ${runPath}`] = f.reply({ ...f.run, status: "in_progress" })
  fixture.routes[`GET ${f.root}`] = f.reply(f.run.repository)
  expect(yield* fixture.commands.perform(f.binding, f.intent("run.forceCancel", { runID: "30433642" }), { provider: "github" }).pipe(Effect.flip))
    .toMatchObject({ kind: "capability_unavailable", disposition: "definitely_unsent" })
  expect(fixture.writes()).toEqual([])
}))

it.effect("cancel lost response is unknown and is never automatically retried", Effect.gen(function* () {
  const fixture = f.recorded()
  fixture.routes[`GET ${runPath}`] = f.reply({ ...f.run, status: "in_progress" })
  fixture.routes[`POST ${runPath}/cancel`] = new ActionsError({ kind: "transport_failed", message: "connection lost after write" })
  expect(yield* fixture.commands.perform(f.binding, f.intent("run.cancel", { runID: "30433642" }), { provider: "github" }).pipe(Effect.flip))
    .toMatchObject({ kind: "outcome_unknown", disposition: "unknown" })
  expect(fixture.writes()).toEqual([{ method: "POST", path: `${runPath}/cancel` }])
}))

it.effect("delete and public-fork approval retain distinct native terminal/approval conditions", Effect.gen(function* () {
  const fixture = f.recorded()
  expect(yield* fixture.commands.perform(f.binding, f.intent("run.delete", { runID: "30433642" }), { provider: "github" }))
    .toEqual({ acknowledgement: { runID: "30433642" } })
  expect(fixture.writes()).toEqual([{ method: "DELETE", path: runPath }])
  fixture.routes[`GET ${runPath}`] = f.reply({ ...f.run, conclusion: "action_required", repository: { ...f.run.repository, private: false },
    head_repository: { ...f.run.head_repository, fork: true } })
  expect(yield* fixture.commands.perform(f.binding, f.intent("run.approveFork", { runID: "30433642" }), { provider: "github" }))
    .toEqual({ acknowledgement: { runID: "30433642" } })
  expect(fixture.writes()[1]).toEqual({ method: "POST", path: `${runPath}/approve` })
  fixture.routes[`GET ${runPath}`] = f.reply({ ...f.run, conclusion: "action_required", repository: { ...f.run.repository, private: false },
    head_repository: { ...f.run.repository, fork: false } })
  expect(yield* fixture.commands.perform(f.binding, f.intent("run.approveFork", { runID: "30433642" }), { provider: "github" }).pipe(Effect.flip))
    .toMatchObject({ kind: "capability_unavailable", disposition: "definitely_unsent" })
  expect(fixture.writes()).toHaveLength(2)
}))

it.effect("job retry proves native job/run/repository/source/attempt and keeps old target acknowledgement", Effect.gen(function* () {
  const fixture = f.recorded()
  expect(yield* fixture.commands.perform(f.binding, f.intent("job.retry", { jobID: "399444496", runID: "30433642" },
    { commit: f.run.head_sha, attempt: 3, resourceVersion: '"job-v1"' }), { provider: "github", enableDebugLogging: false }))
    .toEqual({ acknowledgement: { jobID: "399444496", runID: "30433642" } })
  expect(fixture.writes()).toEqual([{ method: "POST", path: `${jobPath}/rerun`, body: { enable_debug_logging: false } }])
}))

it.effect("job wrong run, stale attempt/source and unobserved attempt fail before write", Effect.gen(function* () {
  for (const native of [{ ...f.job, run_id: 999 }, { ...f.job, run_attempt: 2 }, { ...f.job, head_sha: "f".repeat(40) }]) {
    const fixture = f.recorded()
    fixture.routes[`GET ${jobPath}`] = f.reply(native)
    expect((yield* fixture.commands.perform(f.binding, f.intent("job.retry", { jobID: "399444496", runID: "30433642" }), { provider: "github" }).pipe(Effect.flip)).disposition)
      .toBe("definitely_unsent")
    expect(fixture.writes()).toEqual([])
  }
  const fixture = f.recorded()
  const { run_attempt, ...job } = f.job
  fixture.routes[`GET ${jobPath}`] = f.reply(job)
  expect(yield* fixture.commands.perform(f.binding, f.intent("job.retry", { jobID: "399444496" }), { provider: "github" }).pipe(Effect.flip))
    .toMatchObject({ kind: "capability_unavailable", disposition: "definitely_unsent" })
  expect(fixture.writes()).toEqual([])
}))

it.effect("workflow enable/disable preserve native toggle routes and resource-version guard", Effect.gen(function* () {
  const fixture = f.recorded()
  for (const [kind, enabled, suffix] of [["workflow.enable", true, "enable"], ["workflow.disable", false, "disable"]] as const) {
    expect(yield* fixture.commands.perform(f.binding, f.intent(kind, { workflowID: "161335" }, { resourceVersion: '"workflow-v1"' }), { provider: "github", enabled }))
      .toEqual({ acknowledgement: {} })
    expect(fixture.writes().at(-1)).toEqual({ method: "PUT", path: `${f.root}/actions/workflows/161335/${suffix}` })
  }
  expect(yield* fixture.commands.perform(f.binding, f.intent("workflow.disable", { workflowID: "161335" }, { resourceVersion: '"stale"' }), { provider: "github", enabled: false }).pipe(Effect.flip))
    .toMatchObject({ kind: "source_conflict", disposition: "definitely_unsent" })
  expect(fixture.writes()).toHaveLength(2)
}))
