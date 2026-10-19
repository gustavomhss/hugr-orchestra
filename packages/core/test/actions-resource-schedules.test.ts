import { expect } from "bun:test"
import { Effect } from "effect"
import { ActionsError } from "../src/actions/error"
import { ActionsSchedules } from "../src/actions/resources/schedules"
import { ActionsScheduleYaml } from "../src/actions/resources/schedule-yaml"
import { ActionsResourceFixture } from "./fixture/actions-resource-runtime"
import { it } from "./lib/effect"

it.live("GitLab schedule forms map every mock field to native schedule and variable endpoints", Effect.gen(function* () {
  const fixture = yield* ActionsResourceFixture.make("gitlab")
  fixture.state.handler = (request) => request.path.endsWith("/variables") ? { status: 201, data: { key: "target", value: "all", variable_type: "env_var", raw: false } } : undefined
  const result = yield* ActionsSchedules.make(fixture).perform(fixture.binding,
    { ...ActionsResourceFixture.intent(fixture.binding, "resource.create", "schedules"), target: { resourceKind: "schedules", ref: "dev" } },
    { provider: "gitlab", name: "Nightly", cron: "17 2 * * *", zone: "UTC", ref: "dev", input: "target=all", enabled: true })
  expect(result).toEqual({ acknowledgement: { resourceID: "13" } })
  expect(fixture.requests.filter((request) => request.method !== "GET").map((request) => [request.path, request.body])).toEqual([
    ["projects/9347/pipeline_schedules", { description: "Nightly", cron: "17 2 * * *", cron_timezone: "UTC", ref: "dev", active: true }],
    ["projects/9347/pipeline_schedules/13/variables", { key: "target", value: "all", variable_type: "env_var" }],
  ])
}))

it.live("partial schedule creation and variable rejection stays outcome_unknown; no rollback or retry", Effect.gen(function* () {
  const fixture = yield* ActionsResourceFixture.make("gitlab")
  fixture.state.handler = (request) => request.path.endsWith("/variables") ? { status: 403, data: { message: "synthetic-secret-rejection" } } : undefined
  const error = yield* ActionsSchedules.make(fixture).perform(fixture.binding,
    { ...ActionsResourceFixture.intent(fixture.binding, "resource.create", "schedules"), target: { resourceKind: "schedules", ref: "dev" } },
    { provider: "gitlab", name: "Nightly", cron: "17 2 * * *", zone: "UTC", ref: "dev", input: "target=synthetic-secret-value" }).pipe(Effect.flip)
  expect(error).toMatchObject({ kind: "outcome_unknown", disposition: "unknown" })
  expect(JSON.stringify(error)).not.toContain("synthetic-secret")
  expect(fixture.requests.filter((request) => request.method !== "GET").map((request) => request.path))
    .toEqual(["projects/9347/pipeline_schedules", "projects/9347/pipeline_schedules/13/variables"])
}))

it.live("explicit empty schedule variable field clears observed native keys using 202 deletion acknowledgements", Effect.gen(function* () {
  const fixture = yield* ActionsResourceFixture.make("gitlab")
  fixture.state.handler = (request): ActionsResourceFixture.Reply | undefined => {
    if (request.path.endsWith("/variables/target")) return { status: 202, data: { key: "target", value: "synthetic-private-value", variable_type: "env_var" } }
    if (request.method === "GET" && request.path.endsWith("/pipeline_schedules/13"))
      return { data: { ...ActionsResourceFixture.schedule, variables: [{ key: "target", value: "synthetic-private-value", variable_type: "env_var" }] } }
  }
  const schedules = ActionsSchedules.make(fixture)
  const page = yield* schedules.list(fixture.binding, { kind: "schedules", resourceID: "13" })
  expect(JSON.stringify(page)).not.toContain("synthetic-private-value")
  expect(yield* schedules.perform(fixture.binding,
    { ...ActionsResourceFixture.intent(fixture.binding, "resource.update", "schedules", "13"), target: { resourceKind: "schedules", resourceID: "13", ref: "dev" } },
    { provider: "gitlab", name: "Nightly", cron: "17 2 * * *", zone: "UTC", ref: "dev", input: "" }))
    .toEqual({ acknowledgement: { resourceID: "13" } })
  expect(fixture.requests.filter((request) => request.method !== "GET").map((request) => [request.method, request.path]))
    .toEqual([["PUT", "projects/9347/pipeline_schedules/13"], ["DELETE", "projects/9347/pipeline_schedules/13/variables/target"]])
}))

it.live("GitLab schedule pause, play and take ownership keep owner and caller identities distinct", Effect.gen(function* () {
  const fixture = yield* ActionsResourceFixture.make("gitlab")
  fixture.state.handler = (request): ActionsResourceFixture.Reply | undefined => {
    if (request.path.endsWith("/play")) return { status: 201, data: { message: "201 Created" } }
    if (request.path.endsWith("/take_ownership")) return { status: 201, data: ActionsResourceFixture.schedule }
    if (request.method === "PUT") return { data: { ...ActionsResourceFixture.schedule, active: false } }
  }
  const schedules = ActionsSchedules.make(fixture)
  expect(yield* schedules.perform(fixture.binding, ActionsResourceFixture.intent(fixture.binding, "resource.update", "schedules", "13"), { provider: "gitlab", enabled: false }))
    .toEqual({ acknowledgement: { resourceID: "13" } })
  expect(yield* schedules.perform(fixture.binding, ActionsResourceFixture.intent(fixture.binding, "schedule.play", "schedules", "13"), { provider: "gitlab" }))
    .toEqual({ acknowledgement: { resourceID: "13", unattributed: true } })
  expect(yield* schedules.perform(fixture.binding, ActionsResourceFixture.intent(fixture.binding, "schedule.takeOwnership", "schedules", "13"), { provider: "gitlab" }))
    .toEqual({ acknowledgement: { resourceID: "13" } })
  expect(fixture.requests.find((request) => request.method === "PUT")?.body).toEqual({ active: false })
}))

it.live("schedule caller cannot edit another owner's schedule and typed inputs need native observed version", Effect.gen(function* () {
  const fixture = yield* ActionsResourceFixture.make("gitlab")
  fixture.state.handler = (request) => request.path.endsWith("/pipeline_schedules/13")
    ? { data: { ...ActionsResourceFixture.schedule, owner: { id: 99, username: "other-owner" } } } : undefined
  expect(yield* ActionsSchedules.make(fixture).perform(fixture.binding,
    ActionsResourceFixture.intent(fixture.binding, "resource.update", "schedules", "13"), { provider: "gitlab", enabled: false }).pipe(Effect.flip))
    .toMatchObject({ kind: "permission_denied", disposition: "definitely_unsent" })
  fixture.state.handler = undefined
  fixture.state.metadataVersion = "17.11.0"
  expect(yield* ActionsSchedules.make(fixture).perform(fixture.binding,
    { ...ActionsResourceFixture.intent(fixture.binding, "resource.create", "schedules"), target: { resourceKind: "schedules", ref: "dev" } },
    { provider: "gitlab", name: "Nightly", cron: "17 2 * * *", zone: "UTC", ref: "dev", input: "target=all", inputMode: "input" }).pipe(Effect.flip))
    .toMatchObject({ kind: "capability_unavailable", disposition: "definitely_unsent" })
  expect(fixture.requests.some((request) => request.method !== "GET")).toBe(false)
}))

it.live("GitHub schedule listing reads actual default-branch workflow YAML and exposes source-owned edit identity", Effect.gen(function* () {
  const fixture = yield* ActionsResourceFixture.make()
  const page = yield* ActionsSchedules.make(fixture).list(fixture.binding, { kind: "schedules" })
  expect(page.items[0]).toMatchObject({ id: "24", data: { workflowID: "24", path: ".github/workflows/nightly.yml", commit: ActionsResourceFixture.commit,
    sourceVersion: ActionsResourceFixture.blob, cron: "17 2 * * *", zone: "UTC", ref: "dev", editMode: "source" } })
  expect(fixture.requests.find((request) => request.path === "fixture/source")?.query.ref).toBe(ActionsResourceFixture.commit)
}))

it.live("GitHub schedule listing skips workflows absent from the default branch and reports an unreadable workflow per item", Effect.gen(function* () {
  const fixture = yield* ActionsResourceFixture.make()
  const workflow = (id: string, path: string) => ({ id, bindingID: fixture.binding.id, name: id, path, state: "active", dispatchable: false })
  fixture.state.handler = (request): ActionsResourceFixture.Reply | undefined => {
    if (request.path === "fixture/workflows") return { data: { capturedAt: Date.now(), items: [workflow("24", ".github/workflows/nightly.yml"),
      workflow("25", ".github/workflows/removed.yml"), workflow("26", "dynamic/github-code-scanning/codeql"), workflow("27", ".github/workflows/broken.yml")] } }
    if (request.path === "repositories/9347/contents/.github/workflows") return { data: [
      { type: "file", path: ".github/workflows/nightly.yml" }, { type: "file", path: ".github/workflows/broken.yml" }, { type: "dir", path: ".github/workflows/removed.yml" }] }
    if (request.path === "fixture/source" && request.query.path === ".github/workflows/broken.yml") return { data: { bindingID: fixture.binding.id,
      path: request.query.path, ref: request.query.ref, commit: ActionsResourceFixture.commit, version: ActionsResourceFixture.blob, text: "on:\n  schedule: []\non:\n  push:\n", editable: true } }
  }
  const page = yield* ActionsSchedules.make(fixture).list(fixture.binding, { kind: "schedules" })
  expect(page.items.map((item) => [item.id, item.status])).toEqual([["24", "Active"], ["27", undefined]])
  expect(page.items[1]?.data).toMatchObject({ workflowID: "27", path: ".github/workflows/broken.yml", unreadable: true, problem: "Schedule YAML failed the shared bounded CI document guard", problemKind: "source_unresolved" })
  expect(fixture.requests.filter((request) => request.path === "fixture/source").map((request) => request.query.path).toSorted())
    .toEqual([".github/workflows/broken.yml", ".github/workflows/nightly.yml"])
  fixture.state.handler = (request) => request.path === "repositories/9347/contents/.github/workflows" ? { status: 404, data: { message: "Not Found" } } : undefined
  expect((yield* ActionsSchedules.make(fixture).list(fixture.binding, { kind: "schedules" })).items).toEqual([])
  expect(fixture.requests.filter((request) => request.path === "repositories/9347/contents/.github/workflows").map((request) => request.query.ref))
    .toEqual([ActionsResourceFixture.commit, ActionsResourceFixture.commit])
}))

it.live("GitHub schedule listing still fails on auth, permission and rate-limit rejections", Effect.gen(function* () {
  const fixture = yield* ActionsResourceFixture.make()
  const cases = [[401, "not_authenticated"], [403, "permission_denied"], [429, "rate_limited"]] as const
  yield* Effect.forEach(cases, ([status, kind]) => Effect.gen(function* () {
    fixture.state.handler = (request) => request.path === "repositories/9347/contents/.github/workflows" ? { status, data: { message: "Rejected" } } : undefined
    expect(yield* ActionsSchedules.make(fixture).list(fixture.binding, { kind: "schedules" }).pipe(Effect.flip)).toMatchObject({ kind })
  }), { concurrency: 1 })
  fixture.state.handler = undefined
  yield* Effect.forEach(cases, ([, kind]) => Effect.gen(function* () {
    const reader = { ...fixture.reader, source: () => Effect.fail(new ActionsError({ kind, message: "Rejected", disposition: "definitely_rejected" })) }
    expect(yield* ActionsSchedules.make({ ...fixture, reader }).list(fixture.binding, { kind: "schedules" }).pipe(Effect.flip)).toMatchObject({ kind })
  }), { concurrency: 1 })
}))

it.live("GitHub schedule authoring uses injected publisher, captured workflow path and shared guarded comment-preserving YAML", Effect.gen(function* () {
  const fixture = yield* ActionsResourceFixture.make()
  const published: string[] = []
  const schedules = ActionsSchedules.make({ ...fixture, publish: (_binding, intent, source, text) => Effect.sync(() => {
    expect(intent.target.path).toBe(source.path)
    expect(source.version).toBe(ActionsResourceFixture.blob)
    published.push(text)
    return { acknowledgement: { resourceID: "24" } }
  }) })
  const intent = { ...ActionsResourceFixture.intent(fixture.binding, "resource.update", "schedules", "24"),
    target: { resourceKind: "schedules" as const, resourceID: "24", workflowID: "24", path: ".github/workflows/nightly.yml", ref: "dev" },
    expected: { sourceVersion: ActionsResourceFixture.blob, commit: ActionsResourceFixture.commit } }
  const payload = { provider: "github", name: "Nightly", cron: "22 3 * * *", zone: "UTC", ref: "dev", input: "" }
  expect(yield* schedules.perform(fixture.binding, intent, payload)).toEqual({ acknowledgement: { resourceID: "24" } })
  expect(ActionsScheduleYaml.inspect(fixture.binding, published[0])).toEqual([{ cron: "22 3 * * *" }])
  expect(published[0]).toContain("# keep cron comment")
  expect(published[0]).toContain("# keep job comment")
  expect(yield* schedules.perform(fixture.binding, { ...intent, target: { ...intent.target, path: ".github/workflows/wrong.yml" } }, payload).pipe(Effect.flip))
    .toMatchObject({ kind: "source_conflict", disposition: "definitely_unsent" })
  expect(published).toHaveLength(1)
  expect(fixture.requests.some((request) => request.method !== "GET")).toBe(false)
}))

it.live("source schedule guard rejects duplicate keys, aliases in edited trigger boundary and invalid native cron", Effect.gen(function* () {
  const fixture = yield* ActionsResourceFixture.make()
  expect(() => ActionsScheduleYaml.edit(fixture.binding, "on:\n  schedule: []\non:\n  push:\njobs: {}\n", [{ cron: "0 2 * * *" }])).toThrow()
  expect(() => ActionsScheduleYaml.edit(fixture.binding, "events: &events\n  push:\non: *events\njobs: {}\n", [{ cron: "0 2 * * *" }])).toThrow()
  expect(() => ActionsScheduleYaml.edit(fixture.binding, fixture.state.source, [{ cron: "99 2 * * *" }])).toThrow()
  expect(ActionsScheduleYaml.edit(fixture.binding, fixture.state.source, [{ cron: "0 2 * JAN MON" }])).toContain("JAN MON")
}))
