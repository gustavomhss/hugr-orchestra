import { expect } from "bun:test"
import { Effect, type Schema } from "effect"
import { ActionsVariables } from "../../src/actions/resources/variables"
import { ActionsConfigFixture } from "./config-resource-fixture"
import { it } from "../lib/effect"

const F = ActionsConfigFixture

it.effect("GitLab native producer keeps literal Repository distinct from '*' and arbitrary scope patterns", Effect.gen(function* () {
  const binding = F.binding("gitlab")
  const fixture = F.recorded(binding)
  const scopes = ["Repository", "*", "review/*"]
  fixture.routes[`GET ${fixture.root}/variables`] = F.reply(scopes.map((environment_scope) => ({ ...F.gitlabVariable, environment_scope })))
  const domain = ActionsVariables.make(fixture.services)
  const page = yield* domain.list(binding, { kind: "variables" })
  expect(page.items.map((item) => item.scope)).toEqual(scopes)
  expect(page.items.map((item) => item.id)).toEqual(scopes.map((scope) => JSON.stringify(["TOKEN", scope, "Secret"])))
  page.items.forEach((item, index) => expect(item.data).toMatchObject({ scope: scopes[index], nativeIdentity: { scope: scopes[index] }, redacted: true }))
  const literal = yield* domain.list(binding, { kind: "variables", scope: "Repository" })
  expect(literal.items).toEqual([page.items[0]])
  const wildcard = yield* domain.list(binding, { kind: "variables", scope: "*" })
  expect(wildcard.items).toEqual([page.items[1]])
  expect(JSON.stringify(page)).not.toContain("fixture-sensitive-value")
  expect(fixture.calls.map((request) => request.path)).toEqual(Array.from({ length: 3 }, () => [fixture.root, `${fixture.root}/variables`]).flat())
  expect(fixture.writes()).toEqual([])
}))

it.effect("GitLab literal Repository is writable without aliasing native filters or environment_scope", Effect.gen(function* () {
  const binding = F.binding("gitlab")
  yield* Effect.forEach(["resource.create", "resource.update", "resource.delete"] as const, (kind) => Effect.gen(function* () {
    const fixture = F.recorded(binding)
    const path = `${fixture.root}/variables/TOKEN`
    const native = { ...F.gitlabVariable, environment_scope: "Repository" }
    fixture.routes[`GET ${path}`] = kind === "resource.create" ? F.reply(null, 404) : F.reply(native)
    fixture.routes[`POST ${fixture.root}/variables`] = F.reply(native, 201)
    fixture.routes[`PUT ${path}`] = F.reply(native)
    fixture.routes[`DELETE ${path}`] = F.reply(null, 204)
    const input: Schema.Json = kind === "resource.delete"
      ? { provider: "gitlab", name: "TOKEN", type: "Secret", scope: "Repository" }
      : { provider: "gitlab", name: "TOKEN", type: "Secret", scope: "Repository", value: "replacement", masked: true }
    expect(yield* ActionsVariables.make(fixture.services).perform(binding, F.intent(binding, kind, "variables", "TOKEN", "Repository"), input))
      .toEqual({ acknowledgement: { resourceID: "TOKEN" } })
    expect(fixture.calls.filter((request) => request.method === "GET" && request.path === path).map((request) => request.query))
      .toEqual([{ "filter[environment_scope]": "Repository" }])
    expect(fixture.writes()).toHaveLength(1)
    const write = fixture.writes()[0]
    if (kind === "resource.create") expect(write).toMatchObject({ method: "POST", path: `${fixture.root}/variables`, body: { environment_scope: "Repository" } })
    if (kind === "resource.update") expect(write).toMatchObject({ method: "PUT", path, query: { "filter[environment_scope]": "Repository" }, body: { environment_scope: "Repository" } })
    if (kind === "resource.delete") expect(write).toMatchObject({ method: "DELETE", path, query: { "filter[environment_scope]": "Repository" } })
  }), { concurrency: 1 })
}))

it.effect("GitHub reads exact known environment without depending on bounded environment catalog", Effect.gen(function* () {
  const binding = F.binding()
  const fixture = F.recorded(binding)
  const scope = "outside-first-page / 雪"
  const path = `${fixture.root}/environments/${encodeURIComponent(scope)}`
  fixture.routes[`GET ${path}`] = F.reply({ id: 9, name: scope })
  fixture.routes[`GET ${path}/variables`] = F.reply({ total_count: 1, variables: [F.variable] })
  fixture.routes[`GET ${path}/secrets`] = F.reply({ total_count: 1, secrets: [F.secret] })
  const page = yield* ActionsVariables.make(fixture.services).list(binding, { kind: "variables", scope })
  expect(page.items.map((item) => item.scope)).toEqual([scope, scope])
  expect(fixture.calls.map((request) => request.path)).toEqual([fixture.root, path, `${path}/variables`, `${path}/secrets`])
  expect(fixture.writes()).toEqual([])
}))
