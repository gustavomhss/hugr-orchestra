import { expect } from "bun:test"
import { Effect } from "effect"
import { ActionsError } from "../../src/actions/error"
import { GitHubReadFixture } from "../fixture/github-read"
import { it } from "../lib/effect"

const f = GitHubReadFixture

it.effect("valid workflow payload at a reused mutable repository path cannot replace repository A", Effect.gen(function* () {
  const fixture = f.pathReuse()
  expect(fixture.second.workflow.id).toBe(161336)
  expect((yield* fixture.adapter.workflows(f.binding, {})).items[0].id).toBe("161335")
  expect(fixture.calls.map((call) => f.key(call))).toEqual(["repositories/9347", "repositories/9347/actions/workflows?page=1&per_page=50"])
}))

it.effect("all capability/run/job reads retain ID root after repository rename and path reuse", Effect.gen(function* () {
  const fixture = f.pathReuse()
  expect((yield* fixture.adapter.capabilities(f.binding)).find((capability) => capability.operation === "workflows.list")?.state).toBe("available")
  expect((yield* fixture.adapter.runs(f.binding, {})).items[0].repositoryID).toBe("9347")
  expect((yield* fixture.adapter.run(f.binding, "30433642")).repositoryID).toBe("9347")
  expect((yield* fixture.adapter.jobs(f.binding, { runID: "30433642" })).items[0]).toMatchObject({ runID: "30433642", attempt: 3 })
  expect(fixture.calls.every((call) => call.path === "repositories/9347" || call.path.startsWith("repositories/9347/"))).toBe(true)
}))

it.effect("unknown GHES immutable route support propagates native error without mutable path fallback", Effect.gen(function* () {
  const error = new ActionsError({ kind: "not_found", provider: "github", message: "Provider request failed (HTTP 404)" })
  const fixture = f.recorded({ "repositories/9347/actions/workflows?page=1&per_page=50": error,
    "repos/acme/renamed/actions/workflows?page=1&per_page=50": f.response({ total_count: 1, workflows: [f.workflow] }) })
  expect(yield* fixture.adapter.workflows({ ...f.binding, provider: { kind: "github", hostname: "github.example.com", apiOrigin: "https://github.example.com/api/v3" } }, {}).pipe(Effect.flip)).toBe(error)
  expect(fixture.calls.map((call) => call.path)).toEqual(["repositories/9347", "repositories/9347/actions/workflows"])
}))
