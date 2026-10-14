import { expect } from "bun:test"
import { Effect, Schema } from "effect"
import { ActionsRunners } from "../src/actions/resources/runners"
import { ActionsResourceFixture } from "./fixture/actions-resource-runtime"
import { it } from "./lib/effect"

const Metadata = Schema.Struct({ resourceVersion: Schema.String, labels: Schema.Array(Schema.String), inherited: Schema.Boolean, editable: Schema.Boolean })

it.live("GitHub runner label writes preserve native read-only labels and reject ignored fields", Effect.gen(function* () {
  const fixture = yield* ActionsResourceFixture.make()
  const runners = ActionsRunners.make(fixture)
  const page = yield* runners.list(fixture.binding, { kind: "runners" })
  const metadata = Schema.decodeUnknownSync(Metadata)(page.items[0].data)
  const intent = ActionsResourceFixture.intent(fixture.binding, "resource.update", "runners", "71", { resourceVersion: metadata.resourceVersion })
  const result = yield* runners.perform(fixture.binding, intent, { provider: "github", name: "build-linux", labels: "self-hosted, Linux, X64, gpu", platform: "Linux x64" })
  expect(result.acknowledgement).toEqual({ resourceID: "71" })
  expect(fixture.requests.find((request) => request.method === "PUT")?.body).toEqual({ labels: ["gpu"] })
  expect(fixture.requests.every((request) => !request.path.startsWith("repos/"))).toBe(true)
  expect(yield* runners.perform(fixture.binding, intent, { provider: "github", name: "renamed", labels: "gpu", platform: "Linux x64" }).pipe(Effect.flip))
    .toMatchObject({ kind: "capability_unavailable", disposition: "definitely_unsent" })
  expect(yield* runners.perform(fixture.binding, intent, { provider: "github", name: "build-linux", labels: "gpu", platform: "Linux x64", ignored: true }).pipe(Effect.flip))
    .toMatchObject({ kind: "invalid_input", disposition: "definitely_unsent" })
  expect(fixture.requests.filter((request) => request.method === "PUT")).toHaveLength(1)
}))

it.live("JIT enrollment maps mock platform into native labels and exposes configuration only in CommandOutput", Effect.gen(function* () {
  const fixture = yield* ActionsResourceFixture.make()
  fixture.state.handler = (request) => request.path.endsWith("generate-jitconfig") ? { status: 201, data: {
    runner: { ...ActionsResourceFixture.githubRunner, name: "arm-builder", os: "osx", labels: [
      { name: "self-hosted", type: "custom" }, { name: "macOS", type: "custom" }, { name: "ARM64", type: "custom" }, { name: "build", type: "custom" },
    ] }, encoded_jit_config: "synthetic-secret-jit", unexpected_secret: "synthetic-extra-secret",
  } } : undefined
  const runners = ActionsRunners.make(fixture)
  const intent = ActionsResourceFixture.intent(fixture.binding, "resource.create", "runners")
  const result = yield* runners.perform(fixture.binding, intent, { provider: "github", name: "arm-builder", labels: "build", platform: "macOS ARM64", runnerGroupID: 19 })
  expect(result.acknowledgement).toEqual({ resourceID: "71" })
  expect(result.output).toEqual({ kind: "runnerJit", runnerID: "71", encodedConfiguration: "synthetic-secret-jit" })
  expect(JSON.stringify(result.acknowledgement)).not.toContain("synthetic")
  expect(fixture.requests.find((request) => request.path.endsWith("generate-jitconfig"))?.body)
    .toEqual({ name: "arm-builder", runner_group_id: 19, labels: ["self-hosted", "macOS", "ARM64", "build"] })
  expect(yield* runners.perform(fixture.binding, intent, { provider: "github", name: "arm-builder", labels: "build", platform: "macOS ARM64" }).pipe(Effect.flip))
    .toMatchObject({ kind: "invalid_input", disposition: "definitely_unsent" })
  expect(fixture.requests.filter((request) => request.path.endsWith("generate-jitconfig"))).toHaveLength(1)
}))

it.live("registration-token enrollment does not pretend a native runner registration was created", Effect.gen(function* () {
  const fixture = yield* ActionsResourceFixture.make()
  fixture.state.handler = (request) => request.path.endsWith("registration-token")
    ? { status: 201, data: { token: "synthetic-registration-token", expires_at: "2026-10-13T01:00:00Z" } } : undefined
  const result = yield* ActionsRunners.make(fixture).perform(fixture.binding,
    ActionsResourceFixture.intent(fixture.binding, "runner.register", "runners"), { provider: "github", enrollment: "token" })
  expect(result.acknowledgement).toEqual({ unattributed: true })
  expect(result.output).toEqual({ kind: "runnerToken", token: "synthetic-registration-token", expiresAt: "2026-10-13T01:00:00Z" })
}))

it.live("GitLab origin and write restrictions follow native ownerProject, never tag guesses or assignment order", Effect.gen(function* () {
  const fixture = yield* ActionsResourceFixture.make("gitlab")
  fixture.state.ownerProjectID = "9999"
  const runners = ActionsRunners.make(fixture)
  const page = yield* runners.list(fixture.binding, { kind: "runners" })
  expect(Schema.decodeUnknownSync(Metadata)(page.items[0].data)).toMatchObject({ inherited: true, editable: false, labels: ["linux", "x64", "build"] })
  expect(yield* runners.perform(fixture.binding, ActionsResourceFixture.intent(fixture.binding, "resource.delete", "runners", "71"), { provider: "gitlab" }).pipe(Effect.flip))
    .toMatchObject({ kind: "permission_denied", disposition: "definitely_unsent" })
  expect(fixture.requests.some((request) => request.method === "DELETE")).toBe(false)
  expect(fixture.requests.some((request) => request.path === "runners" || request.path === "runners/all")).toBe(false)
  fixture.state.ownerProjectID = "9347"
  const owned = yield* runners.list(fixture.binding, { kind: "runners" })
  const metadata = Schema.decodeUnknownSync(Metadata)(owned.items[0].data)
  fixture.state.handler = (request) => request.method === "DELETE" ? { status: 204 } : undefined
  expect(yield* runners.perform(fixture.binding,
    ActionsResourceFixture.intent(fixture.binding, "runner.remove", "runners", "71", { resourceVersion: metadata.resourceVersion }), { provider: "gitlab" }))
    .toEqual({ acknowledgement: { resourceID: "71" } })
}))

it.live("GitLab enrollment uses user/runners project scope and native observed version rather than client version", Effect.gen(function* () {
  const fixture = yield* ActionsResourceFixture.make("gitlab")
  fixture.state.handler = (request) => request.path === "user/runners"
    ? { status: 201, data: { id: 91, token: "synthetic-runner-token", token_expires_at: null } } : undefined
  const runners = ActionsRunners.make(fixture)
  const intent = ActionsResourceFixture.intent(fixture.binding, "runner.register", "runners")
  const payload = { provider: "gitlab", name: "private-arm", labels: "build", platform: "Linux ARM64" }
  const result = yield* runners.perform(fixture.binding, intent, payload)
  expect(result.acknowledgement).toEqual({ resourceID: "91" })
  expect(result.output).toEqual({ kind: "runnerToken", runnerID: "91", token: "synthetic-runner-token" })
  expect(fixture.requests.find((request) => request.path === "user/runners")?.body)
    .toEqual({ runner_type: "project_type", project_id: "9347", description: "private-arm", tag_list: ["linux", "ARM64", "build"], locked: true, run_untagged: false })
  fixture.state.metadataVersion = "15.0.0"
  expect(yield* runners.perform(fixture.binding, intent, payload).pipe(Effect.flip)).toMatchObject({ kind: "capability_unavailable", disposition: "definitely_unsent" })
  expect(fixture.requests.filter((request) => request.path === "user/runners")).toHaveLength(1)
}))

it.live("resource snapshot capture survives caller mutation while native preflight is awaiting", Effect.gen(function* () {
  const fixture = yield* ActionsResourceFixture.make()
  const binding = { ...fixture.binding, provider: { ...fixture.binding.provider } }
  const intent = { ...ActionsResourceFixture.intent(binding, "resource.update", "runners", "71"), target: { resourceKind: "runners" as const, resourceID: "71" } }
  const payload = { provider: "github", name: "build-linux", labels: "gpu", platform: "Linux x64" }
  fixture.state.handler = (request) => {
    if (request.path !== "repositories/9347") return
    binding.projectID = "9999"
    intent.target.resourceID = "72"
    payload.labels = "changed-after-admission"
    return { data: { id: 9347, full_name: "acme/widget", permissions: { push: true, admin: true }, private: true }, headers: { "x-oauth-scopes": "repo" } }
  }
  expect(yield* ActionsRunners.make(fixture).perform(binding, intent, payload)).toEqual({ acknowledgement: { resourceID: "71" } })
  expect(fixture.requests.find((request) => request.method === "PUT")).toMatchObject({ path: "repositories/9347/actions/runners/71/labels", body: { labels: ["gpu"] } })
}))
