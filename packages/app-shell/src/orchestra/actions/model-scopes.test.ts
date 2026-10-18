import { describe, expect, test } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { createRoot } from "solid-js"
import { createActionsAPI, type ActionsScope } from "./api"
import { createActionsModel, type ActionsPreference } from "./model"

const binding: Actions.Binding = { id: Actions.BindingID.make("ab_scope_a"), revision: 7, remote: "origin", directory: "/repo/model-scopes",
  projectID: "42", projectPath: "org/repo", account: "account-a", provider: { kind: "github", hostname: "github.com", apiOrigin: "https://api.github.com" } }
const other: Actions.Binding = { ...binding, id: Actions.BindingID.make("ab_scope_b"), projectID: "99", projectPath: "org/other", account: "account-b" }
const route = { view: "resources" as const, resourceKind: "variables" as const }

function fixture() {
  const catalog = { bindings: [binding, other] }
  const saved: ActionsPreference[] = []
  const resources: Array<{ target: ActionsScope; query: Actions.ResourceListInput }> = []
  const api = {
    ...createActionsAPI({ directory: binding.directory, server: { type: "http", http: { url: "http://scope.invalid" } },
      fetch: Object.assign(async () => { throw new Error("Unexpected network request") }, { preconnect() {} }) }),
    async bindings() { return catalog.bindings },
    async capabilities() { return [] },
    async workflows() { return { items: [], capturedAt: 1 } },
    async runs() { return { items: [], capturedAt: 1 } },
    async connect() { return other },
    async resources(target: ActionsScope, query: Actions.ResourceListInput): Promise<Actions.ResourcePage> {
      resources.push({ target, query })
      return { capturedAt: 1, items: [{ id: "TOKEN", bindingID: target.bindingID, kind: query.kind, name: "TOKEN", data: {} }] }
    },
  }
  const mounted = createRoot((dispose) => ({ model: createActionsModel({ api, save: async () => undefined, preferences: {
    bindingID: binding.id, route, filters: { query: "TOKEN" }, save: (value) => saved.push(value),
  } }), dispose }))
  return { ...mounted, catalog, saved, resources, [Symbol.dispose]() { mounted.dispose() } }
}

describe("Actions binding-owned resource scope", () => {
  test.each(["select", "connect", "missing"] as const)("%s binding transition clears environment scope before new account reads or persistence", async (change) => {
    using scope = fixture()
    await scope.model.refresh()
    scope.model.filter({ scope: "production-a" })
    await scope.model.refresh()
    expect(scope.resources.at(-1)?.query.scope).toBe("production-a")
    expect(scope.saved.at(-1)?.filters?.scope).toBe("production-a")
    const before = scope.resources.length
    const persisted = scope.saved.length
    if (change === "select") scope.model.selectBinding(other.id)
    if (change === "connect") await scope.model.connect({ remote: "origin", provider: other.provider, projectPath: other.projectPath })
    if (change === "missing") {
      scope.catalog.bindings = [other]
      await scope.model.refresh()
      expect(scope.model.state.binding).toBeUndefined()
      expect(scope.model.state.filters.scope).toBeUndefined()
      scope.model.selectBinding(other.id)
    }
    await scope.model.refresh()
    scope.model.navigate(route)
    await scope.model.refresh()
    expect(scope.model.state.binding?.id).toBe(other.id)
    expect(scope.model.state.filters.query).toBe("TOKEN")
    expect(scope.model.state.filters.scope).toBeUndefined()
    expect(scope.model.state.resources.value?.items[0].bindingID).toBe(other.id)
    const newReads = scope.resources.slice(before)
    expect(newReads.length).toBeGreaterThan(0)
    expect(newReads.every((read) => read.target.bindingID === other.id && read.query.kind === "variables" && read.query.scope === undefined)).toBe(true)
    const newPreferences = scope.saved.slice(persisted)
    expect(newPreferences.length).toBeGreaterThan(0)
    expect(newPreferences.every((value) => value.filters?.scope === undefined)).toBe(true)
  })

  test("same-binding revision refresh retains exact environment selection instead of treating it as account change", async () => {
    using scope = fixture()
    await scope.model.refresh()
    scope.model.filter({ scope: "production-a" })
    await scope.model.refresh()
    expect(scope.resources.at(-1)?.query.scope).toBe("production-a")
    scope.catalog.bindings = [{ ...binding, revision: 8 }, other]
    await scope.model.refresh()
    expect(scope.model.state.binding?.revision).toBe(8)
    expect(scope.model.state.filters.scope).toBe("production-a")
    expect(scope.resources.at(-1)).toMatchObject({ target: { bindingID: binding.id, revision: 8 }, query: { kind: "variables", scope: "production-a" } })
    expect(scope.saved.at(-1)?.filters?.scope).toBe("production-a")
  })
})
