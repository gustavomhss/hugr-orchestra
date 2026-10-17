import { expect, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query"
import { createComponent, createRoot } from "solid-js"
import { createStore } from "solid-js/store"
import { createServerManagementController } from "../src/components/dialog-select-server"
import { ServerConnection } from "../src/context/server"

function setup() {
  const original: ServerConnection.Http = { type: "http", http: { url: "https://old.test" } }
  const [state, setState] = createStore({ servers: [original], active: ServerConnection.key(original), default: ServerConnection.key(original) as ServerConnection.Key | null })
  const checked = Promise.withResolvers<{ healthy: boolean }>()
  const started = Promise.withResolvers<void>()
  const writes: string[] = []
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { gcTime: 0 } } })
  let controller!: ReturnType<typeof createServerManagementController>
  const dispose = createRoot((dispose) => {
    createComponent(QueryClientProvider, { client: queryClient, get children() {
      controller = createServerManagementController({
        navigate: () => { writes.push("navigate") },
        server: {
          get list() { return state.servers }, get key() { return state.active },
          get current() { return state.servers.find((item) => ServerConnection.key(item) === state.active) },
          add(conn) { writes.push("add"); setState("servers", (items) => [...items.filter((item) => item.http.url !== conn.http.url), conn]); setState("active", ServerConnection.key(conn)); return conn },
          remove(key) { writes.push("remove"); setState("servers", (items) => items.filter((item) => ServerConnection.key(item) !== key)) },
          setActive(key) { setState("active", key) },
        },
        tabs: { removeServer: () => { writes.push("tabs") } },
        global: { servers: { list: () => state.servers, health: {} }, ensureServerCtx: () => { throw new Error("unexpected bootstrap") } },
        platform: { platform: "web", openExternal() {}, notify: async () => {}, restart: async () => {},
          getDefaultServer: async () => state.default, setDefaultServer: async (key) => { writes.push("default"); setState("default", key) } },
        language: { t: (key) => key },
        settings: { general: { newLayoutDesigns: () => true } },
        checkServerHealth: () => { started.resolve(); return checked.promise },
      }, { navigateOnAdd: false })
      return null
    } })
    return dispose
  })
  return { state, original, controller, checked, started, writes, dispose: () => { dispose(); queryClient.clear() } }
}

test("editing the default server URL migrates default, active and current together", async () => {
  const fixture = setup()
  try {
    fixture.controller.startEdit(fixture.original)
    fixture.controller.handleFormChange()("https://new.test")
    fixture.controller.submitForm()
    await fixture.started.promise
    fixture.checked.resolve({ healthy: true })
    await until(() => !fixture.controller.isFormMode())
    expect(fixture.state.default).toBe("https://new.test")
    expect(fixture.state.active).toBe("https://new.test")
    expect(fixture.state.servers.map((item) => item.http.url)).toEqual(["https://new.test"])
  } finally { fixture.dispose() }
})

for (const mode of ["add", "edit"] as const) {
  test(`closing ${mode} before health reply prevents late writes`, async () => {
    const fixture = setup()
    if (mode === "add") fixture.controller.startAdd()
    if (mode === "edit") fixture.controller.startEdit(fixture.original)
    fixture.controller.handleFormChange()("https://new.test")
    fixture.controller.submitForm()
    await fixture.started.promise
    fixture.dispose()
    fixture.checked.resolve({ healthy: true })
    // Drain the mutation's promise chain, not a network/timer retry.
    for (let turn = 0; turn < 20; turn++) await Promise.resolve()
    expect(fixture.writes).toEqual([])
    expect(fixture.state.default).toBe("https://old.test")
  })
}

async function until(check: () => boolean) {
  for (let turn = 0; turn < 100 && !check(); turn++) await new Promise((resolve) => setTimeout(resolve, 0))
  expect(check()).toBe(true)
}
