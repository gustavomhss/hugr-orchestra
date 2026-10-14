import { expect } from "bun:test"
import { Effect, Schema } from "effect"
import { ActionsCaches } from "../src/actions/resources/caches"
import { ActionsResourceFixture } from "./fixture/actions-resource-runtime"
import { it } from "./lib/effect"

it.live("GitHub caches retain native IDs, key/ref/size/access metadata and select deletion by native ID", Effect.gen(function* () {
  const fixture = yield* ActionsResourceFixture.make()
  const caches = ActionsCaches.make(fixture)
  const page = yield* caches.list(fixture.binding, { kind: "caches", query: "deps-lock", ref: "refs/heads/dev" })
  expect(page.items[0]).toMatchObject({ id: "87", name: "deps-lock", data: { nativeID: "87", ref: "refs/heads/dev", sizeInBytes: 456, lastAccessedAt: "2026-10-13T00:00:00Z" } })
  const metadata = Schema.decodeUnknownSync(Schema.Struct({ resourceVersion: Schema.String }))(page.items[0].data)
  const intent = { ...ActionsResourceFixture.intent(fixture.binding, "resource.delete", "caches", "87", { resourceVersion: metadata.resourceVersion }),
    target: { resourceKind: "caches" as const, resourceID: "87", ref: "refs/heads/dev" } }
  expect(yield* caches.perform(fixture.binding, intent, { provider: "github", name: "deps-lock", ref: "refs/heads/dev" }))
    .toEqual({ acknowledgement: { resourceID: "87" } })
  expect(fixture.requests.filter((request) => request.method === "DELETE").map((request) => request.path)).toEqual(["repositories/9347/actions/caches/87"])
  expect(yield* caches.perform(fixture.binding, { ...intent, expected: { resourceVersion: "stale-version" } }, { provider: "github", name: "deps-lock", ref: "refs/heads/dev" }).pipe(Effect.flip))
    .toMatchObject({ kind: "source_conflict", disposition: "definitely_unsent" })
  expect(fixture.requests.filter((request) => request.method === "DELETE")).toHaveLength(1)
}))

it.live("GitHub cache prefix search never authorizes deletion of another key or unproved cache ID", Effect.gen(function* () {
  const fixture = yield* ActionsResourceFixture.make()
  fixture.state.handler = (request) => request.path === "repositories/9347/actions/caches"
    ? { data: { total_count: 101, actions_caches: [{ ...ActionsResourceFixture.cache, key: "deps-lock-other" }] } } : undefined
  const caches = ActionsCaches.make(fixture)
  expect(yield* caches.perform(fixture.binding, ActionsResourceFixture.intent(fixture.binding, "resource.delete", "caches", "87"), { provider: "github", name: "deps-lock" }).pipe(Effect.flip))
    .toMatchObject({ kind: "metadata_truncated", disposition: "definitely_unsent" })
  expect(fixture.requests.some((request) => request.method === "DELETE")).toBe(false)
}))

it.live("post-send cache disconnect is outcome_unknown and never retried", Effect.gen(function* () {
  const fixture = yield* ActionsResourceFixture.make()
  fixture.state.handler = (request) => request.method === "DELETE" ? { reset: true } : undefined
  const error = yield* ActionsCaches.make(fixture).perform(fixture.binding,
    ActionsResourceFixture.intent(fixture.binding, "resource.delete", "caches", "87"), { provider: "github", name: "deps-lock" }).pipe(Effect.flip)
  expect(error).toMatchObject({ kind: "outcome_unknown", disposition: "unknown" })
  expect(fixture.requests.filter((request) => request.method === "DELETE")).toHaveLength(1)
}))

it.live("GitLab cache metadata says whole-project namespace invalidation, never fabricated per-key inventory", Effect.gen(function* () {
  const fixture = yield* ActionsResourceFixture.make("gitlab")
  const caches = ActionsCaches.make(fixture)
  const page = yield* caches.list(fixture.binding, { kind: "caches" })
  expect(page.items[0]).toMatchObject({ id: "9347", name: "Project runner caches", data: { projectWide: true, inventory: "native_unavailable", existingBlobsRetained: true, futureJobsOnly: true } })
  expect(yield* caches.perform(fixture.binding, ActionsResourceFixture.intent(fixture.binding, "cache.clear", "caches"), { provider: "gitlab" }))
    .toEqual({ acknowledgement: { resourceID: "9347" } })
  expect(fixture.requests.find((request) => request.path === "api/graphql")?.body).toEqual({ kind: "cacheClear" })
  expect(fixture.requests.some((request) => request.path === "graphql" || request.path.endsWith("/api/v4/graphql"))).toBe(false)
  expect(yield* ActionsCaches.make({ transport: fixture.transport, reader: fixture.reader }).perform(fixture.binding,
    ActionsResourceFixture.intent(fixture.binding, "cache.clear", "caches"), { provider: "gitlab" }).pipe(Effect.flip))
    .toMatchObject({ kind: "capability_unavailable", disposition: "definitely_unsent" })
}))

it.live("GraphQL cache-clear field errors cannot become pretend success", Effect.gen(function* () {
  const fixture = yield* ActionsResourceFixture.make("gitlab")
  fixture.state.handler = (request) => request.path === "api/graphql"
    ? { data: { data: { runnerCacheClear: { errors: ["synthetic-private-native-error"] } } } } : undefined
  const error = yield* ActionsCaches.make(fixture).perform(fixture.binding,
    ActionsResourceFixture.intent(fixture.binding, "cache.clear", "caches"), { provider: "gitlab" }).pipe(Effect.flip)
  expect(error).toMatchObject({ kind: "outcome_unknown", disposition: "unknown" })
  expect(JSON.stringify(error)).not.toContain("synthetic-private")
  expect(fixture.requests.filter((request) => request.path === "api/graphql")).toHaveLength(1)
}))
