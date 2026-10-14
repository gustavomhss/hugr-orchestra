import { expect } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { Effect } from "effect"
import { ActionsError } from "../../src/actions/error"
import { GitHubReadFixture } from "../fixture/github-read"
import { it } from "../lib/effect"

const f = GitHubReadFixture

it.effect("repository rename retains immutable identity and native workflow catalog", Effect.gen(function* () {
  const fixture = f.recorded({ "repositories/9347/actions/workflows?page=1&per_page=50": f.response({ total_count: 1, workflows: [f.workflow] }) })
  const page = yield* fixture.adapter.workflows(f.binding, {})
  expect(page.items).toEqual([{ id: "161335", bindingID: f.binding.id, name: "CI", path: f.workflow.path,
    state: "active", defaultRef: "main", dispatchable: false, dispatchState: "unknown", updatedAt: f.workflow.updated_at }])
  expect(page.total).toBe(1)
  expect(fixture.calls.map((call) => call.path)).toEqual(["repositories/9347", "repositories/9347/actions/workflows"])
  expect(Object.keys(fixture.adapter).sort()).toEqual(["capabilities", "jobs", "run", "runs", "source", "workflows"])
}))

it.effect("workflow default ref comes only from native repository metadata, including unknown or empty branches", Effect.gen(function* () {
  for (const default_branch of ["release/current", "", null]) {
    const fixture = f.recorded({ "repositories/9347": f.response({ ...f.repo, default_branch }),
      "repositories/9347/actions/workflows?page=1&per_page=50": f.response({ total_count: 1, workflows: [f.workflow] }) })
    const workflow = (yield* fixture.adapter.workflows(f.binding, {})).items[0]
    if (default_branch) expect(workflow.defaultRef).toBe(default_branch)
    if (!default_branch) expect(workflow).not.toHaveProperty("defaultRef")
    expect(fixture.calls.map((call) => call.path)).toEqual(["repositories/9347", "repositories/9347/actions/workflows"])
  }
}))

it.effect("wrong repository ID rejects before further immutable API reads", Effect.gen(function* () {
  const fixture = f.recorded({ "repositories/9347": f.response({ ...f.repo, id: 9999 }),
    "repositories/9347/actions/workflows?page=1&per_page=50": f.response({ workflows: [], total_count: 0 }) })
  expect(yield* fixture.adapter.workflows(f.binding, {}).pipe(Effect.flip)).toMatchObject({ kind: "binding_stale", bindingID: f.binding.id })
  expect(fixture.calls.map((call) => call.path)).toEqual(["repositories/9347"])
}))

it.effect("unsafe numeric native IDs fail decode while canonical large decimal IDs stay exact", Effect.gen(function* () {
  for (const id of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "0", "001", "1e3"]) {
    const fixture = f.recorded({ "repositories/9347": f.response({ ...f.repo, id }) })
    expect(yield* fixture.adapter.workflows(f.binding, {}).pipe(Effect.flip)).toMatchObject({ kind: "transport_failed" })
  }
  const id = "9223372036854775807"
  const fixture = f.recorded({ [`repositories/${id}`]: f.response({ ...f.repo, id }),
    [`repositories/${id}/actions/workflows?page=1&per_page=50`]: f.response({ total_count: 1, workflows: [{ ...f.workflow, id }] }) })
  expect((yield* fixture.adapter.workflows({ ...f.binding, projectID: id }, {})).items[0].id).toBe(id)
}))

it.effect("capabilities prove observed workflows only; classic scopes and repo push never invent token role", Effect.gen(function* () {
  const fixture = f.recorded({ "repositories/9347": f.response(f.repo, { "x-oauth-scopes": "repo, workflow" }),
    "repositories/9347/actions/workflows?page=1&per_page=1": f.response({ workflows: [], total_count: 0 }) })
  const capabilities = yield* fixture.adapter.capabilities(f.binding)
  expect(capabilities.find((cap) => cap.operation === "workflows.list")?.state).toBe("available")
  expect(capabilities.find((cap) => cap.operation === "workflow.dispatch")).toMatchObject({ state: "unknown", scope: "repository:9347" })
  expect(capabilities.find((cap) => cap.operation === "workflow.dispatch")?.reason).toContain("Observed classic OAuth scopes: repo, workflow")
  expect(capabilities.find((cap) => cap.operation === "workflow.dispatch")?.reason).toContain("push=true")
  expect(capabilities.filter((cap) => cap.state === "available").map((cap) => cap.operation)).toEqual(["workflows.list"])
}))

it.effect("auth, truncation and malformed native catalog fail instead of empty results", Effect.gen(function* () {
  for (const kind of ["not_authenticated", "permission_denied", "metadata_truncated"] as const) {
    const error = new ActionsError({ kind, message: "recorded failure" })
    const fixture = f.recorded({ "repositories/9347/actions/workflows?page=1&per_page=50": error })
    expect(yield* fixture.adapter.workflows(f.binding, {}).pipe(Effect.flip)).toBe(error)
  }
  for (const data of [{}, { total_count: 0 }, { workflows: [ { ...f.workflow, id: "001" } ] }, { workflows: [], total_count: -1 }]) {
    const fixture = f.recorded({ "repositories/9347/actions/workflows?page=1&per_page=50": f.response(data) })
    expect(yield* fixture.adapter.workflows(f.binding, {}).pipe(Effect.flip)).toMatchObject({ kind: "transport_failed" })
  }
}))

it.effect("cursor binds revision, host, project, scope, filters and effective page size", Effect.gen(function* () {
  const route = "repositories/9347/actions/workflows"
  const fixture = f.recorded({ [`${route}?page=1&per_page=1`]: f.response({ workflows: [f.workflow], total_count: 2 },
    { link: `<https://api.github.com/${route}?page=2&per_page=1>; rel="next"` }),
    [`${route}?page=2&per_page=1`]: f.response({ workflows: [{ ...f.workflow, id: "161336" }], total_count: 2 }) })
  const first = yield* fixture.adapter.workflows(f.binding, { limit: 1 })
  expect(first.next).toBeString()
  expect((yield* fixture.adapter.workflows(f.binding, { limit: 1, cursor: first.next })).items[0].id).toBe("161336")
  for (const binding of [{ ...f.binding, revision: 4 }, { ...f.binding, projectID: "1" },
    { ...f.binding, provider: { ...f.binding.provider, hostname: "github.enterprise" } }, { ...f.binding, id: Actions.BindingID.make("ab_foreign") }]) {
    expect(yield* fixture.adapter.workflows(binding, { limit: 1, cursor: first.next }).pipe(Effect.flip)).toMatchObject({ kind: "invalid_input" })
  }
  expect(yield* fixture.adapter.workflows(f.binding, { limit: 2, cursor: first.next }).pipe(Effect.flip)).toMatchObject({ kind: "invalid_input" })
  expect(yield* fixture.adapter.runs(f.binding, { limit: 1, cursor: first.next }).pipe(Effect.flip)).toMatchObject({ kind: "invalid_input" })
}))

it.effect("unknown total stays absent; full page without pagination proof fails named", Effect.gen(function* () {
  const route = "repositories/9347/actions/workflows?page=1&per_page=1"
  const fixture = f.recorded({ [route]: f.response({ workflows: [] }) })
  expect(yield* fixture.adapter.workflows(f.binding, { limit: 1 })).not.toHaveProperty("total")
  fixture.routes[route] = f.response({ workflows: [f.workflow] })
  expect(yield* fixture.adapter.workflows(f.binding, { limit: 1 }).pipe(Effect.flip)).toMatchObject({ kind: "transport_failed" })
  for (const headers of [ { link: "garbage" }, { "x-next-page": "0" }, { "x-next-page": "1" }, { "x-next-page": "3" },
    { link: '<https://evil.test/workflows?page=2&per_page=1>; rel="next"' },
    { link: '<https://api.github.com/repositories/9347/actions/workflows?page=2&per_page=50>; rel="next"' } ]) {
    fixture.routes[route] = f.response({ workflows: [f.workflow], total_count: 2 }, headers)
    expect(yield* fixture.adapter.workflows(f.binding, { limit: 1 }).pipe(Effect.flip)).toMatchObject({ kind: "transport_failed" })
  }
}))

it.effect("all native target IDs and refs reject CLI placeholders before any request", Effect.gen(function* () {
  const fixture = f.recorded()
  for (const id of ["0", "001", "1e3", "-1", "{run_id}", "1/jobs", "1?x", "1%2Fjobs"]) {
    expect(yield* fixture.adapter.run(f.binding, id).pipe(Effect.flip)).toMatchObject({ kind: "invalid_input" })
    expect(yield* fixture.adapter.runs(f.binding, { workflowID: id }).pipe(Effect.flip)).toMatchObject({ kind: "invalid_input" })
    expect(yield* fixture.adapter.jobs(f.binding, { runID: id }).pipe(Effect.flip)).toMatchObject({ kind: "invalid_input" })
  }
  for (const ref of ["{branch}", ":branch", "../main", "main?x", "main%2Fx", "a\\b", "-x", "a..b", "a b"]) {
    expect(yield* fixture.adapter.source(f.binding, { path: f.workflow.path, ref }).pipe(Effect.flip)).toMatchObject({ kind: "invalid_input" })
    expect(yield* fixture.adapter.runs(f.binding, { ref }).pipe(Effect.flip)).toMatchObject({ kind: "invalid_input" })
  }
  expect(fixture.calls).toEqual([])
}))
