import { expect } from "bun:test"
import { Effect } from "effect"
import { ActionsError } from "../../src/actions/error"
import { OutputFixture } from "./output-fixture"
import { it } from "../lib/effect"

const f = OutputFixture

it.effect("GH native global/run artifact pages retain immutable root, cursor binding/revision/run/name and safe native data", Effect.gen(function* () {
  const fixture = f.make(f.github, {
    "repositories/9347/actions/runs/30433642/artifacts?name=result&page=1&per_page=1": f.response({ total_count: 2, artifacts: [f.artifact] },
      { link: '<https://api.github.com/repositories/9347/actions/runs/30433642/artifacts?name=result&page=2&per_page=1>; rel="next"' }),
    "repositories/9347/actions/runs/30433642/artifacts?name=result&page=2&per_page=1": f.response({ total_count: 2, artifacts: [{ ...f.artifact, id: 12, expired: true }] }),
    "repositories/9347/actions/artifacts?page=1&per_page=50": f.response({ total_count: 1, artifacts: [f.artifact] }),
  })
  const selection = { kind: "artifacts", runID: "30433642", limit: 1, query: "result" } as const
  const first = yield* fixture.service.artifacts(f.github, selection)
  expect(first.items[0]).toMatchObject({ id: "11", bindingID: f.github.id, kind: "artifacts", scope: "30433642", status: "available" })
  expect(first.items[0].data).toMatchObject({ size_in_bytes: 17, workflow_run: { id: 30433642, repository_id: 9347 } })
  expect(JSON.stringify(first)).not.toContain("synthetic-url-secret")
  expect(JSON.stringify(first)).not.toContain("synthetic-token")
  expect(first.next).toBeDefined()
  const second = yield* fixture.service.artifacts(f.github, { ...selection, cursor: first.next })
  expect(second.items[0].status).toBe("expired")
  expect(second.next).toBeUndefined()
  expect(second.total).toBe(2)
  const before = fixture.requests.length
  const variants = [{ binding: { ...f.github, revision: 2 }, input: selection },
    { binding: f.github, input: { ...selection, runID: "30433643" } },
    { binding: f.github, input: { ...selection, query: "other" } }]
  yield* Effect.forEach(variants, (variant) => fixture.service.artifacts(variant.binding, { ...variant.input, cursor: first.next }).pipe(
    Effect.flip, Effect.tap((error) => Effect.sync(() => expect(error.kind).toBe("invalid_input")))))
  expect(fixture.requests.length).toBe(before)
  expect((yield* fixture.service.artifacts(f.github, { kind: "artifacts" })).items).toHaveLength(1)
  expect(fixture.requests.every((request) => request.method === "GET" && request.path.startsWith("repositories/9347"))).toBe(true)
}))

it.effect("GL native job artifact inventory preserves pipeline cursor, retries, erased/expiry/no-artifact states and unknown totals", Effect.gen(function* () {
  const fixture = f.make(f.gitlab, {
    "projects/21/pipelines/287/jobs?include_retried=true&page=1&per_page=4": f.response([
      f.job, { ...f.job, id: 9, artifacts_expire_at: "2000-01-01T00:00:00Z" },
      { ...f.job, id: 10, erased_at: "2026-01-01T00:00:00Z", artifacts: [], artifacts_file: null },
      { ...f.job, id: 11, artifacts: [], artifacts_file: null, artifacts_expire_at: null },
    ], { "x-next-page": "2" }),
    "projects/21/pipelines/287/jobs?include_retried=true&page=2&per_page=4": f.response([], { "x-next-page": "" }),
  })
  const first = yield* fixture.service.artifacts(f.gitlab, { kind: "artifacts", runID: "287", limit: 4 })
  expect(first.items.map((item) => item.status)).toEqual(["available", "expired", "erased", "unavailable"])
  expect(first.items.map((item) => item.id)).toEqual(["8", "9", "10", "11"])
  expect(first.items.every((item) => item.scope === "287" && item.bindingID === f.gitlab.id)).toBe(true)
  expect(first.total).toBeUndefined()
  expect(JSON.stringify(first)).not.toContain("synthetic-url-secret")
  expect(JSON.stringify(first)).not.toContain("synthetic-token")
  const second = yield* fixture.service.artifacts(f.gitlab, { kind: "artifacts", runID: "287", limit: 4, cursor: first.next })
  expect(second.items).toEqual([])
  expect(second.next).toBeUndefined()
}))

it.effect("native authorization, wrong ownership, malformed/truncated metadata and incomplete pagination never become empty artifact pages", Effect.gen(function* () {
  const denied = new ActionsError({ kind: "permission_denied", message: "Provider request failed (HTTP 403)", retryAfter: 3 })
  const nativePath = "projects/21/jobs?page=1&per_page=50"
  const forbidden = f.make(f.gitlab, { [nativePath]: denied })
  expect(yield* forbidden.service.artifacts(f.gitlab, { kind: "artifacts" }).pipe(Effect.flip)).toMatchObject({ kind: "permission_denied", retryAfter: 3 })
  const cases = [
    { data: [{ ...f.job, pipeline: { id: 287, project_id: 22 } }], kind: "binding_stale" },
    { data: [{ ...f.job, artifacts: "wrong" }], kind: "transport_failed" },
    { data: "x".repeat(2 * 1024 * 1024 + 1), kind: "metadata_truncated" },
  ] as const
  yield* Effect.forEach(cases, (value) => f.make(f.gitlab, { [nativePath]: f.response(value.data) }).service.artifacts(f.gitlab, { kind: "artifacts" })
    .pipe(Effect.flip, Effect.tap((error) => Effect.sync(() => expect(error.kind).toBe(value.kind)))))
  const incomplete = f.make(f.gitlab, { "projects/21/jobs?page=1&per_page=1": f.response([f.job]) })
  expect(yield* incomplete.service.artifacts(f.gitlab, { kind: "artifacts", limit: 1 }).pipe(Effect.flip)).toMatchObject({ kind: "transport_failed" })
  expect(yield* forbidden.service.artifacts(f.gitlab, { kind: "artifacts", ref: "main" }).pipe(Effect.flip)).toMatchObject({ kind: "invalid_input" })
}))

it.effect("GL empty artifact_file and trace/report inventory stay native; log storage is not advertised as downloadable archive", Effect.gen(function* () {
  const fixture = f.make(f.gitlab, { "projects/21/jobs?page=1&per_page=50": f.response([
    { ...f.job, artifacts_file: {}, artifacts: [{ file_type: "trace", size: 17, filename: "job.log", file_format: "raw" }] },
    { ...f.job, id: 9, artifacts_file: null, artifacts: [{ file_type: "junit", size: 17, filename: "report.xml", file_format: "gzip" }] },
  ], { "x-next-page": "" }) })
  const result = yield* fixture.service.artifacts(f.gitlab, { kind: "artifacts" })
  expect(result.items.map((item) => item.status)).toEqual(["unavailable", "unavailable"])
  expect(result.items[0].data).toMatchObject({ artifacts_file: {}, artifacts: [{ file_type: "trace" }] })
  expect(result.items[1].data).toMatchObject({ artifacts: [{ file_type: "junit" }] })
}))
