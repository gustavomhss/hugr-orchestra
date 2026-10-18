import { expect } from "bun:test"
import { Effect, Schema } from "effect"
import { ActionsPolicy } from "../../src/actions/resources/policy"
import { ActionsConfigFixture } from "./config-resource-fixture"
import { it } from "../lib/effect"

const F = ActionsConfigFixture

it.effect("GitHub policy shows observed approved set and inherited retention gap; response tokens never escape", Effect.gen(function* () {
  const binding = F.binding()
  const fixture = F.recorded(binding)
  fixture.routes[`GET ${fixture.root}/actions/permissions`] = F.reply({ enabled: true, allowed_actions: "selected", selected_actions_url: "untrusted-unused" })
  fixture.routes[`GET ${fixture.root}/actions/permissions/selected-actions`] = F.reply({ github_owned_allowed: true, verified_allowed: false,
    patterns_allowed: ["acme/action@v1"], token: "must-not-escape" })
  const page = yield* ActionsPolicy.make(fixture.services).list(binding, { kind: "policy" })
  expect(page.items[0]).toMatchObject({ scope: "Repository", data: { policy: "Restricted to approved actions",
    retention: { state: "source_unresolved", writable: false }, localPolicySource: "Actions binding policy store",
    nativeSettings: { selectedActions: { patterns_allowed: ["acme/action@v1"] } } } })
  expect(JSON.stringify(page)).not.toContain("must-not-escape")
  expect(fixture.calls.every((request) => request.path === "user" || request.path.startsWith("repositories/123"))).toBe(true)
}))

it.effect("native policy update preserves enabled and observed selected action set; stale version stops writer", Effect.gen(function* () {
  const binding = F.binding()
  const fixture = F.recorded(binding)
  fixture.routes[`GET ${fixture.root}/actions/permissions`] = F.reply({ enabled: false, allowed_actions: "selected" })
  fixture.routes[`GET ${fixture.root}/actions/permissions/selected-actions`] = F.reply({ github_owned_allowed: true, verified_allowed: false, patterns_allowed: ["acme/action@v1"] })
  fixture.routes[`PUT ${fixture.root}/actions/permissions`] = F.reply(null, 204)
  const domain = ActionsPolicy.make(fixture.services)
  const page = yield* domain.list(binding, { kind: "policy" })
  const version = Schema.decodeUnknownSync(Schema.Struct({ resourceVersion: Schema.String }))(page.items[0].data).resourceVersion
  const intent = F.intent(binding, "resource.update", "policy", "project-settings", "Repository")
  const form = { provider: "github", policy: "Project default" }
  expect((yield* domain.perform(binding, { ...intent, expected: { resourceVersion: "old" } }, form).pipe(Effect.flip)).kind).toBe("source_conflict")
  expect(fixture.writes()).toEqual([])
  expect(yield* domain.perform(binding, { ...intent, expected: { resourceVersion: version } }, form)).toEqual({ acknowledgement: { resourceID: "project-settings" } })
  expect(fixture.writes()[0].body).toEqual({ enabled: false, allowed_actions: "all" })
}))

it.effect("mock retention, unsupported GitLab approved-actions policy and unknown fields fail before any native write", Effect.gen(function* () {
  yield* Effect.forEach(["github", "gitlab"] as const, (provider) => Effect.gen(function* () {
    const binding = F.binding(provider)
    const fixture = F.recorded(binding)
    const intent = F.intent(binding, "resource.update", "policy", "project-settings", provider === "github" ? "Repository" : "Project")
    const domain = ActionsPolicy.make(fixture.services)
    const error = yield* domain.perform(binding, intent, { provider, retention: 30, policy: "Project default" }).pipe(Effect.flip)
    expect(error.message).toContain("Field 'retention'")
    expect(error.disposition).toBe("definitely_unsent")
    expect((yield* domain.perform(binding, intent, { provider, enabled: true }).pipe(Effect.flip)).kind).toBe("invalid_input")
    if (provider === "gitlab") expect((yield* domain.perform(binding, intent, { provider, policy: "Restricted to approved actions" }).pipe(Effect.flip)).message).toContain("no GitLab approved-actions equivalent")
    expect(fixture.calls).toEqual([])
  }))
}))

it.effect("GitLab policy retains real CI settings, not project/runner credential fields", Effect.gen(function* () {
  const binding = F.binding("gitlab")
  const fixture = F.recorded(binding)
  fixture.routes[`GET ${fixture.root}`] = F.reply({ id: 123, keep_latest_artifact: true, build_timeout: 3600,
    ci_pipeline_variables_minimum_override_role: "maintainer", auto_cancel_pending_pipelines: "enabled", runners_token: "never-return" })
  const page = yield* ActionsPolicy.make(fixture.services).list(binding, { kind: "policy" })
  expect(page.items[0].data).toMatchObject({ nativeSettings: { keep_latest_artifact: true, build_timeout: 3600, ci_pipeline_variables_minimum_override_role: "maintainer" } })
  expect(JSON.stringify(page)).not.toContain("never-return")
}))
