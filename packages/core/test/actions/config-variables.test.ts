import { expect } from "bun:test"
import { Effect, Schema } from "effect"
import { ActionsVariables } from "../../src/actions/resources/variables"
import { ActionsError } from "../../src/actions/error"
import { ActionsConfigFixture } from "./config-resource-fixture"
import { it } from "../lib/effect"

const F = ActionsConfigFixture

it.effect("GitHub pages combine readable variables and secret metadata with stable scoped native identity", Effect.gen(function* () {
  const binding = F.binding()
  const fixture = F.recorded(binding)
  fixture.routes[`GET ${fixture.root}/actions/variables`] = F.reply({ total_count: 2, variables: [F.variable] }, 200,
    { link: `<https://api.github.com/${fixture.root}/actions/variables?per_page=1&page=2>; rel="next"` })
  fixture.routes[`GET ${fixture.root}/actions/secrets`] = F.reply({ total_count: 1, secrets: [{ ...F.secret, value: "must-not-escape" }] })
  const domain = ActionsVariables.make(fixture.services)
  const first = yield* domain.list(binding, { kind: "variables", limit: 2 })
  expect(first.items[0]).toMatchObject({ id: JSON.stringify(["MODE", "Repository", "Variable"]), sensitive: false, data: { value: "release" } })
  expect(first.next).toBeDefined()
  expect(first.items[1]).toMatchObject({ sensitive: true, data: { redacted: true, nativeIdentity: { projectID: "123", bindingRevision: 3 } } })
  expect(JSON.stringify(first)).not.toContain("must-not-escape")
  const bad = yield* domain.list({ ...binding, revision: 4 }, { kind: "variables", limit: 2, cursor: first.next }).pipe(Effect.flip)
  expect(bad.kind).toBe("invalid_input")
  expect(fixture.writes()).toEqual([])
}))

it.effect("GitLab redacts masked/hidden values before returning, preserves independent protected flag and native scope", Effect.gen(function* () {
  const binding = F.binding("gitlab")
  const fixture = F.recorded(binding)
  fixture.routes[`GET ${fixture.root}/variables`] = F.reply([F.gitlabVariable,
    { ...F.gitlabVariable, environment_scope: "*", masked: false, hidden: false, value: "public-mode" },
    { key: "UNOBSERVED", masked: false, protected: false, environment_scope: "production", variable_type: "env_var", value: "fixture-sensitive-value" }])
  const page = yield* ActionsVariables.make(fixture.services).list(binding, { kind: "variables" })
  expect(page.items[0]).toMatchObject({ sensitive: true, scope: "production", data: { protected: true, flags: ["Protected", "Masked", "Hidden"] } })
  expect(page.items[1]).toMatchObject({ sensitive: false, scope: "*", data: { value: "public-mode", protected: true } })
  expect(page.items[2]).toMatchObject({ sensitive: true, data: { sourceUnresolved: expect.any(String) } })
  expect(JSON.stringify(page)).not.toContain("fixture-sensitive-value")
  expect(new Set(page.items.map((item) => item.id)).size).toBe(3)
}))

it.effect("strict forms, changed binding and cross-scope edits fail before native reads or writes", Effect.gen(function* () {
  const binding = F.binding()
  const form = { provider: "github", name: "TOKEN", type: "Secret", scope: "Repository", value: "replacement" }
  const cases = [
    { intent: F.intent(binding), form: { ...form, ignored: "bad" } },
    { intent: F.intent(binding), form: { ...form, value: "  " } },
    { intent: F.intent(binding), form: { ...form, scope: "production" } },
    { intent: { ...F.intent(binding), binding: { id: binding.id, revision: 2 } }, form },
    { intent: F.intent(binding), form: { ...form, masked: true } },
  ]
  yield* Effect.forEach(cases, (item) => Effect.gen(function* () {
    const fixture = F.recorded(binding)
    const error = yield* ActionsVariables.make(fixture.services).perform(binding, item.intent, item.form).pipe(Effect.flip)
    expect(error.disposition).toBe("definitely_unsent")
    expect(fixture.calls).toEqual([])
  }))
}))

it.effect("GitHub encrypts actual sealed box with observed public key; acknowledgement contains identity only", Effect.gen(function* () {
  const { default: sodium } = yield* Effect.promise(() => import("libsodium-wrappers"))
  yield* Effect.promise(() => sodium.ready)
  const keys = sodium.crypto_box_keypair()
  const binding = F.binding()
  const fixture = F.recorded(binding)
  fixture.routes[`GET ${fixture.root}/actions/secrets/TOKEN`] = F.reply(F.secret)
  fixture.routes[`GET ${fixture.root}/actions/secrets/public-key`] = F.reply({ key_id: "key-123", key: sodium.to_base64(keys.publicKey, sodium.base64_variants.ORIGINAL) })
  fixture.routes[`PUT ${fixture.root}/actions/secrets/TOKEN`] = F.reply({ value: "fixture-echo" }, 204)
  const result = yield* ActionsVariables.make(fixture.services).perform(binding, F.intent(binding), {
    provider: "github", name: "TOKEN", type: "Secret", scope: "Repository", value: "replacement-token" })
  expect(result).toEqual({ acknowledgement: { resourceID: "TOKEN" } })
  const body = Schema.decodeUnknownSync(Schema.Struct({ key_id: Schema.String, encrypted_value: Schema.String }))(fixture.writes()[0].body)
  expect(body.key_id).toBe("key-123")
  expect(new TextDecoder().decode(sodium.crypto_box_seal_open(sodium.from_base64(body.encrypted_value, sodium.base64_variants.ORIGINAL), keys.publicKey, keys.privateKey)))
    .toBe("replacement-token")
  expect(JSON.stringify(fixture.writes())).not.toContain("replacement-token")
  expect(JSON.stringify(result)).not.toContain("fixture-echo")
  sodium.memzero(keys.privateKey)
}))

it.effect("GitLab update/delete address key plus exact filter and discard provider value echo", Effect.gen(function* () {
  const binding = F.binding("gitlab")
  const fixture = F.recorded(binding)
  const path = `${fixture.root}/variables/TOKEN`
  fixture.routes[`GET ${path}`] = F.reply(F.gitlabVariable)
  fixture.routes[`PUT ${path}`] = F.reply({ ...F.gitlabVariable, value: "provider-echo" })
  fixture.routes[`DELETE ${path}`] = F.reply(null, 204)
  const domain = ActionsVariables.make(fixture.services)
  const result = yield* domain.perform(binding, F.intent(binding), { provider: "gitlab", name: "TOKEN", type: "Secret", scope: "production",
    value: "replacement", protected: true, masked: true })
  expect(result).toEqual({ acknowledgement: { resourceID: "TOKEN" } })
  expect(fixture.writes()[0]).toMatchObject({ method: "PUT", query: { "filter[environment_scope]": "production" }, body: { raw: false, variable_type: "env_var" } })
  expect(JSON.stringify(fixture.writes()[0].body)).not.toContain('"hidden"')
  yield* domain.perform(binding, F.intent(binding, "resource.delete"), { provider: "gitlab", name: "TOKEN", type: "Secret", scope: "production" })
  expect(fixture.writes()[1]).toMatchObject({ method: "DELETE", query: { "filter[environment_scope]": "production" } })
  expect(JSON.stringify(result)).not.toContain("provider-echo")
}))

it.effect("GitLab hidden create uses observed server metadata, never client version; hiding cannot change later", Effect.gen(function* () {
  const binding = F.binding("gitlab")
  const fixture = F.recorded(binding)
  fixture.routes[`GET ${fixture.root}/variables/TOKEN`] = new ActionsError({ kind: "not_found", message: "Provider request failed (HTTP 404)", disposition: "definitely_rejected" })
  fixture.routes["GET metadata"] = F.reply({ version: "17.3.0-ee" })
  const form = { provider: "gitlab", name: "TOKEN", type: "Secret", scope: "production", value: "replacement", hidden: true, masked: true }
  const domain = ActionsVariables.make(fixture.services)
  expect((yield* domain.perform(binding, F.intent(binding, "resource.create"), form).pipe(Effect.flip)).kind).toBe("capability_unavailable")
  expect(fixture.writes()).toEqual([])
  fixture.routes["GET metadata"] = F.reply({ version: "17.4.0-ee" })
  fixture.routes[`POST ${fixture.root}/variables`] = F.reply(F.gitlabVariable, 201)
  yield* domain.perform(binding, F.intent(binding, "resource.create"), form)
  expect(fixture.writes()[0].body).toMatchObject({ masked_and_hidden: true, environment_scope: "production" })
  fixture.routes[`GET ${fixture.root}/variables/TOKEN`] = F.reply(F.gitlabVariable)
  const before = fixture.writes().length
  expect((yield* domain.perform(binding, F.intent(binding), { ...form, hidden: false }).pipe(Effect.flip)).kind).toBe("capability_unavailable")
  expect(fixture.writes()).toHaveLength(before)
}))

it.effect("native authorization failure is not empty; stale scope/version cannot mutate", Effect.gen(function* () {
  const binding = F.binding("gitlab")
  const fixture = F.recorded(binding)
  fixture.routes[`GET ${fixture.root}/variables`] = F.reply({ message: "denied" }, 403)
  const domain = ActionsVariables.make(fixture.services)
  expect((yield* domain.list(binding, { kind: "variables" }).pipe(Effect.flip)).kind).toBe("permission_denied")
  const form = { provider: "gitlab", name: "TOKEN", type: "Secret", scope: "production", value: "replacement" }
  fixture.routes[`GET ${fixture.root}/variables/TOKEN`] = F.reply({ ...F.gitlabVariable, environment_scope: "staging" })
  expect((yield* domain.perform(binding, F.intent(binding), form).pipe(Effect.flip)).kind).toBe("source_conflict")
  fixture.routes[`GET ${fixture.root}/variables/TOKEN`] = F.reply(F.gitlabVariable)
  expect((yield* domain.perform(binding, { ...F.intent(binding), expected: { resourceVersion: "older" } }, form).pipe(Effect.flip)).kind).toBe("source_conflict")
  expect(fixture.writes()).toEqual([])
  fixture.routes[`GET ${fixture.root}/variables`] = new ActionsError({ kind: "not_authenticated", message: "sensitive-provider-error" })
  const error = yield* domain.list(binding, { kind: "variables" }).pipe(Effect.flip)
  expect(error.kind).toBe("not_authenticated")
  expect(error.message).not.toContain("sensitive-provider-error")
}))

it.effect("GitHub native ETag conflict blocks writer; accepted plaintext update still returns identity only", Effect.gen(function* () {
  const binding = F.binding()
  const fixture = F.recorded(binding)
  fixture.routes[`GET ${fixture.root}/actions/variables/MODE`] = F.reply(F.variable, 200, { etag: '"current"' })
  fixture.routes[`PATCH ${fixture.root}/actions/variables/MODE`] = F.reply({ value: "provider-echo" }, 204)
  const domain = ActionsVariables.make(fixture.services)
  const intent = F.intent(binding, "resource.update", "variables", "MODE", "Repository")
  const form = { provider: "github", name: "MODE", type: "Variable", scope: "Repository", value: "production" }
  expect((yield* domain.perform(binding, { ...intent, expected: { resourceVersion: '"old"' } }, form).pipe(Effect.flip)).kind).toBe("source_conflict")
  expect(fixture.writes()).toEqual([])
  expect(yield* domain.perform(binding, { ...intent, expected: { resourceVersion: '"current"' } }, form)).toEqual({ acknowledgement: { resourceID: "MODE" } })
  expect(fixture.writes()[0]).toMatchObject({ path: `${fixture.root}/actions/variables/MODE`, body: { name: "MODE", value: "production" } })
}))

it.effect("incomplete native collection fails instead of an empty-success page", Effect.gen(function* () {
  const binding = F.binding()
  const fixture = F.recorded(binding)
  fixture.routes[`GET ${fixture.root}/actions/variables`] = F.reply({ total_count: 1, variables: [] })
  expect((yield* ActionsVariables.make(fixture.services).list(binding, { kind: "variables" }).pipe(Effect.flip)).kind).toBe("metadata_truncated")
}))

it.effect("GitLab scope move requires original revision/version and addresses old filter with new native scope", Effect.gen(function* () {
  const binding = F.binding("gitlab")
  const fixture = F.recorded(binding)
  fixture.routes[`GET ${fixture.root}/variables`] = F.reply([F.gitlabVariable])
  fixture.routes[`GET ${fixture.root}/variables/TOKEN`] = (request) => request.query?.["filter[environment_scope]"] === "staging"
    ? F.reply(null, 404) : F.reply(F.gitlabVariable)
  fixture.routes[`PUT ${fixture.root}/variables/TOKEN`] = F.reply({ ...F.gitlabVariable, environment_scope: "staging", value: "provider-echo" })
  const domain = ActionsVariables.make(fixture.services)
  const page = yield* domain.list(binding, { kind: "variables" })
  const version = Schema.decodeUnknownSync(Schema.Struct({ resourceVersion: Schema.String }))(page.items[0].data).resourceVersion
  const form = { provider: "gitlab", name: "TOKEN", type: "Secret", scope: "staging", value: "replacement" }
  expect((yield* domain.perform(binding, F.intent(binding), form).pipe(Effect.flip)).kind).toBe("source_conflict")
  expect(fixture.writes()).toEqual([])
  expect(yield* domain.perform(binding, { ...F.intent(binding), expected: { resourceVersion: version } }, form)).toEqual({ acknowledgement: { resourceID: "TOKEN" } })
  expect(fixture.writes()[0]).toMatchObject({ query: { "filter[environment_scope]": "production" }, body: { environment_scope: "staging" } })
}))

it.effect("GitHub readable-variable rename uses old native key and new name; never emulates secret rename", Effect.gen(function* () {
  const binding = F.binding()
  const fixture = F.recorded(binding)
  fixture.routes[`GET ${fixture.root}/actions/variables/MODE`] = F.reply(F.variable, 200, { etag: '"current"' })
  fixture.routes[`GET ${fixture.root}/actions/variables/MODE_NEW`] = F.reply(null, 404)
  fixture.routes[`PATCH ${fixture.root}/actions/variables/MODE`] = F.reply(null, 204)
  const domain = ActionsVariables.make(fixture.services)
  const intent = { ...F.intent(binding, "resource.update", "variables", "MODE", "Repository"), expected: { resourceVersion: '"current"' } }
  expect(yield* domain.perform(binding, intent, { provider: "github", name: "MODE_NEW", type: "Variable", scope: "Repository", value: "production" }))
    .toEqual({ acknowledgement: { resourceID: "MODE_NEW" } })
  expect(fixture.writes()[0]).toMatchObject({ path: `${fixture.root}/actions/variables/MODE`, body: { name: "MODE_NEW", value: "production" } })
  const before = fixture.calls.length
  expect((yield* domain.perform(binding, intent, { provider: "github", name: "MODE_NEW", type: "Secret", scope: "Repository", value: "replacement" }).pipe(Effect.flip)).kind).toBe("capability_unavailable")
  expect(fixture.calls).toHaveLength(before)
}))
