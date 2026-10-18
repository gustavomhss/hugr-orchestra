import { expect, test } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { createRoot, createSignal } from "solid-js"
import { createActionsAPI } from "../src/orchestra/actions/api"
import { readNavigation, synchronizeNavigation } from "../src/orchestra/actions/entry-routing"
import { createActionsModel, type ActionsPreferences } from "../src/orchestra/actions/model"

const directory = "/repo/native-links"
const binding = (id: string): Actions.Binding => ({ id: Actions.BindingID.make(id), revision: 1, remote: "origin", projectID: "1",
  projectPath: "owner/repo", directory, provider: { kind: "github", hostname: "github.com", apiOrigin: "https://api.github.com" } })
const located = (data: unknown) => Response.json({ location: { directory }, data })
const page = (items: readonly unknown[]) => ({ items, capturedAt: 1 })

/** Fake only native HTTP; the model, its request owner and the URL synchronizer's Solid effects stay real. */
function fixture(query: Record<string, string>, preferences?: ActionsPreferences) {
  const writes: Record<string, string | undefined>[] = []
  const removed = new Set<string>()
  const fetch = Object.assign(async (value: string | URL | Request, init?: RequestInit) => {
    const request = new Request(value, init)
    const url = new URL(request.url)
    const id = url.pathname.includes("ab_b") ? "ab_b" : "ab_a"
    if (request.method === "DELETE") { removed.add(id); return located(null) }
    if (url.pathname === "/api/actions/binding") return located([binding("ab_a"), binding("ab_b")].filter((item) => !removed.has(item.id)))
    if (url.pathname.endsWith("/capabilities")) return located([])
    if (url.pathname.startsWith("/api/actions/resource/")) return located(page([{ id: "cache-1", kind: "caches", bindingID: id, name: "cache", data: {} }]))
    if (url.pathname.startsWith("/api/actions/workflow/")) return located(page([]))
    if (url.pathname.startsWith("/api/actions/run/")) return located(page([]))
    throw new Error(`Unexpected test route ${url.pathname}`)
  }, { preconnect() {} })
  const mounted: { model?: ReturnType<typeof createActionsModel> } = {}
  const api = createActionsAPI({ server: { type: "http", http: { url: "http://localhost:4096" } }, fetch, directory })
  const dispose = createRoot((dispose) => {
    // Like the chapter, wanted reads what the model last persisted.
    const [wanted, setWanted] = createSignal(preferences?.bindingID)
    const model = createActionsModel({ api, save: async () => undefined, preferences: { ...preferences, save: (value) => setWanted(value.bindingID) } })
    synchronizeNavigation({ model, scope: "scope", query: () => query, write: (value) => writes.push(value), wanted })
    mounted.model = model
    return dispose
  })
  return { mounted, writes, [Symbol.dispose]: dispose }
}

// Links load from the model's own first read; poll instead of refresh(), which would force a second read.
async function settle(done: () => boolean, tries = 200): Promise<void> {
  if (done() || tries === 0) return
  await Bun.sleep(1)
  return settle(done, tries - 1)
}

test("a scoped resource link and its reload load the resource instead of staying idle", async () => {
  const query = { actionsScope: "scope", actionsBinding: "ab_a", actionsView: "resources", actionsResource: "caches" }
  using view = fixture(query, readNavigation(query))
  await settle(() => view.mounted.model?.state.resources.status === "ready")
  expect(view.mounted.model?.state.resources.value?.items.map((item) => item.id)).toEqual(["cache-1"])
  expect(view.mounted.model?.state.route).toEqual(readNavigation(query)?.route)
  expect(view.writes).toEqual([])
})

test("an unscoped link applies only when its binding belongs to this directory", async () => {
  using owned = fixture({ actionsBinding: "ab_b", actionsView: "resources", actionsResource: "caches" })
  await settle(() => owned.mounted.model?.state.resources.status === "ready")
  expect(owned.mounted.model?.state.binding?.id).toBe(Actions.BindingID.make("ab_b"))
  expect(owned.mounted.model?.state.route).toMatchObject({ view: "resources", resourceKind: "caches" })
  using foreign = fixture({ actionsBinding: "ab_elsewhere", actionsView: "resources", actionsResource: "caches" })
  await settle(() => foreign.writes.length > 0)
  expect(foreign.mounted.model?.state.route.view).toBe("library")
  expect(foreign.writes.at(-1)).toMatchObject({ actionsView: "library", actionsBinding: "ab_a", actionsScope: "scope" })
})

test("a stale persisted binding still lets a deep link apply and the URL be written", async () => {
  const stale = { bindingID: Actions.BindingID.make("ab_removed"), route: { view: "library" as const } }
  using linked = fixture({ actionsBinding: "ab_b", actionsView: "resources", actionsResource: "caches" }, stale)
  await settle(() => linked.mounted.model?.state.resources.status === "ready")
  expect(linked.mounted.model?.state.binding?.id).toBe(Actions.BindingID.make("ab_b"))
  expect(linked.mounted.model?.state.resources.value?.items.map((item) => item.id)).toEqual(["cache-1"])
  expect(linked.mounted.model?.state.route).toMatchObject({ view: "resources", resourceKind: "caches" })
  using unlinked = fixture({}, stale)
  await settle(() => unlinked.writes.length > 0)
  expect(unlinked.mounted.model?.state.binding).toBeUndefined()
  expect(unlinked.writes.at(-1)).toMatchObject({ actionsView: "library", actionsScope: "scope" })
})

test("removing a binding selected after mount still lets the URL follow the selection", async () => {
  using view = fixture({}, { bindingID: Actions.BindingID.make("ab_a"), route: { view: "library" } })
  await settle(() => view.mounted.model?.state.workflows.status === "ready")
  view.mounted.model?.selectBinding(Actions.BindingID.make("ab_b"))
  await settle(() => view.writes.at(-1)?.actionsBinding === "ab_b")
  await view.mounted.model?.removeBinding()
  await settle(() => view.writes.at(-1)?.actionsView === "settings")
  expect(view.mounted.model?.state.binding).toBeUndefined()
  expect(view.writes.at(-1)).toMatchObject({ actionsView: "settings", actionsBinding: undefined, actionsScope: "scope" })
})
