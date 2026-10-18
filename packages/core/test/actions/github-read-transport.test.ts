import { expect } from "bun:test"
import { createHash } from "node:crypto"
import { Effect } from "effect"
import { GitHubReadFixture } from "../fixture/github-read"

const f = GitHubReadFixture

f.it.live("W1 raw subprocess boundary reads native renamed catalog and pinned source", Effect.gen(function* () {
  const fixture = yield* f.subprocess()
  yield* fixture.reply({ "repositories/9347": { data: f.repo },
    "repositories/9347/actions/workflows?page=1&per_page=50": { data: { total_count: 1, workflows: [f.workflow] } },
    "repositories/9347/commits/main": { data: { sha: f.sha } },
    [`repositories/9347/contents/${f.workflow.path}?ref=${f.sha}`]: { data: f.content } })
  expect((yield* fixture.adapter.workflows(f.binding, {})).items[0].dispatchState).toBe("unknown")
  expect((yield* fixture.adapter.source(f.binding, { path: f.workflow.path, ref: "main" })).text).toBe(f.text)
}))

f.it.live("W1 immutable source route ignores valid repository B responses at the reused display path", Effect.gen(function* () {
  const fixture = yield* f.subprocess()
  const second = f.pathReuse().second
  yield* fixture.reply({ "repositories/9347": { data: f.repo }, "repositories/9347/commits/main": { data: { sha: f.sha } },
    [`repositories/9347/contents/${f.workflow.path}?ref=${f.sha}`]: { data: f.content },
    "repos/acme/renamed/commits/main": { data: { sha: second.commit } },
    [`repos/acme/renamed/contents/${f.workflow.path}?ref=${second.commit}`]: { data: second.content } })
  expect(yield* fixture.adapter.source(f.binding, { path: f.workflow.path, ref: "main" })).toMatchObject({ commit: f.sha, text: f.text })
  expect(fixture.calls.map((call) => f.key(call))).toEqual(["repositories/9347", "repositories/9347/commits/main",
    `repositories/9347/contents/${f.workflow.path}?ref=${f.sha}`])
}))

f.it.live("W1 exact immutable source refs reject mismatched native commits before contents", Effect.gen(function* () {
  const fixture = yield* f.subprocess()
  for (const requested of [f.sha.toUpperCase(), "a".repeat(64)]) {
    const resolved = "f".repeat(requested.length)
    yield* fixture.reply({ "repositories/9347": { data: f.repo }, [`repositories/9347/commits/${requested}`]: { data: { sha: resolved } },
      [`repositories/9347/contents/${f.workflow.path}?ref=${resolved}`]: { data: { ...f.content,
        sha: createHash(requested.length === 40 ? "sha1" : "sha256").update(`blob ${Buffer.byteLength(f.text)}\0`).update(f.text).digest("hex") } } })
    expect(yield* fixture.adapter.source(f.binding, { path: f.workflow.path, ref: requested }).pipe(Effect.flip)).toMatchObject({ kind: "source_conflict" })
  }
  expect(fixture.calls.map((call) => call.path)).toEqual(["repositories/9347", `repositories/9347/commits/${f.sha.toUpperCase()}`,
    "repositories/9347", `repositories/9347/commits/${"a".repeat(64)}`])
}))

f.it.live("W1 native metadata decoding preserves null run/job/step states and runner labels", Effect.gen(function* () {
  const fixture = yield* f.subprocess()
  yield* fixture.reply({ "repositories/9347": { data: f.repo },
    "repositories/9347/actions/runs/30433642": { data: { ...f.run, name: null, head_branch: null, status: null, conclusion: null } },
    "repositories/9347/actions/runs/30433642/attempts/3/jobs?page=1&per_page=50": { data: { total_count: 1,
      jobs: [{ ...f.job, run_attempt: 3, status: null, conclusion: null }] } },
    "repositories/9347/actions/runs/30433642/attempts/2/jobs?page=1&per_page=50": { data: { total_count: 1,
      jobs: [{ ...f.job, status: null, conclusion: null, steps: [{ ...f.job.steps[0], status: null, conclusion: null }] }] } } })
  expect(yield* fixture.adapter.run(f.binding, "30433642")).toMatchObject({ name: null, ref: null, status: null, conclusion: null,
    repositoryID: "9347", updatedAt: f.run.updated_at, triggeringActor: "another-user" })
  expect((yield* fixture.adapter.jobs(f.binding, { runID: "30433642", attempt: 2 })).items[0])
    .toMatchObject({ status: null, conclusion: null, runnerID: "17", runnerGroupID: "1", runnerLabels: ["ubuntu-latest"],
      kind: "job", steps: [{ status: null, conclusion: null }] })
  expect((yield* fixture.adapter.jobs(f.binding, { runID: "30433642" })).items[0].attempt).toBe(3)
  expect(fixture.calls.at(-1)?.path).toBe("repositories/9347/actions/runs/30433642/attempts/3/jobs")
}))

f.it.live("W1 raw auth, forbidden, truncated and malformed JSON never become empty read pages", Effect.gen(function* () {
  const fixture = yield* f.subprocess()
  const route = "repositories/9347/actions/workflows?page=1&per_page=50"
  for (const [reply, kind] of [
    [{ status: 401, data: { message: "bad credentials" }, code: 1 }, "not_authenticated"],
    [{ status: 403, data: { message: "forbidden" }, code: 1 }, "permission_denied"],
    [{ data: { workflows: [], total_count: 0 }, padding: 3 * 1024 * 1024 }, "metadata_truncated"],
    [{ raw: '{"workflows":[' }, "transport_failed"],
  ] as const) {
    yield* fixture.reply({ "repositories/9347": { data: f.repo }, [route]: reply })
    expect(yield* fixture.adapter.workflows(f.binding, {}).pipe(Effect.flip)).toMatchObject({ kind })
  }
}), 30_000)
