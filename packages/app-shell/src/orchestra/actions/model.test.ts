import { describe, expect, test } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { createRoot } from "solid-js"
import { createActionsAPI } from "./api"
import { createActionsModel, type ActionsPreferences } from "./model"

const directory = "/repo/native"
const binding = (id = "ab_a"): Actions.Binding => ({
  id: Actions.BindingID.make(id), revision: 7, remote: "origin", projectID: "1", projectPath: "owner/repo", directory,
  provider: { kind: "github", hostname: "github.com", apiOrigin: "https://api.github.com" },
})
const workflow = (id = "ab_a"): Actions.Workflow => ({ id: "11", bindingID: Actions.BindingID.make(id), name: "CI",
  path: ".github/workflows/native.yml", state: "active", dispatchable: true })
const run = (id = "101", bindingID = "ab_a"): Actions.Run => ({ id, bindingID: Actions.BindingID.make(bindingID), workflowID: "11", name: "CI",
  ref: "main", commit: "a".repeat(40), event: "push", status: "completed", conclusion: "failure", attempt: 2 })
const located = (data: unknown) => Response.json({ location: { directory }, data })
const page = (items: readonly unknown[], next?: string) => ({ items, capturedAt: 1, ...(next ? { next } : {}) })

function deferred<T>() {
  const result: { resolve?: (value: T) => void } = {}
  const promise = new Promise<T>((resolve) => { result.resolve = resolve })
  return { promise, resolve(value: T) { result.resolve?.(value) } }
}

// Deep links load from the model's own first read; poll instead of refresh(), which would force a second read.
async function settle(done: () => boolean, tries = 200): Promise<void> {
  if (done() || tries === 0) return
  await Bun.sleep(1)
  return settle(done, tries - 1)
}

function fixture(respond?: (request: Request) => Response | void | Promise<Response | void>, preferences?: ActionsPreferences) {
  const requests: Request[] = []
  const fetch = Object.assign(async (value: string | URL | Request, init?: RequestInit) => {
    const request = new Request(value, init)
    requests.push(request.clone())
    const response = await respond?.(request)
    if (response) return response
    const url = new URL(request.url)
    const id = url.pathname.includes("ab_b") ? "ab_b" : "ab_a"
    if (url.pathname === "/api/actions/binding") return located([binding(), binding("ab_b")])
    if (url.pathname.endsWith("/capabilities")) return located([])
    if (url.pathname.endsWith("/graph")) return located({ state: "complete", jobs: [], diagnostics: [],
      source: { bindingID: id, path: url.searchParams.get("path"), ref: url.searchParams.get("ref"),
        commit: run().commit, version: "b".repeat(40), text: "jobs: {}", editable: false } })
    if (url.pathname.startsWith("/api/actions/workflow/")) return located(page([workflow(id)], "next-workflows"))
    if (url.pathname.endsWith("/jobs")) return located(page([{ id: "202", bindingID: id, runID: "101", name: "build", status: "completed", attempt: Number(url.searchParams.get("attempt") ?? 2), steps: [] }]))
    if (url.pathname.startsWith("/api/actions/run/")) return located(url.pathname.endsWith(id) ? page([run("101", id)], "next-runs") : run(url.pathname.split("/").at(-1), id))
    throw new Error(`Unexpected test route ${request.method} ${url.pathname}`)
  }, { preconnect: globalThis.fetch.preconnect })
  const api = createActionsAPI({ server: { type: "http", http: { url: "http://localhost:4096" } }, fetch, directory })
  const mounted = createRoot((dispose) => ({ model: createActionsModel({ api, save: async () => undefined, preferences }), dispose }))
  return { ...mounted, requests, [Symbol.dispose]() { mounted.dispose() } }
}

describe("Actions view-owned model", () => {
  test("rapid binding changes abort old reads and a late old response cannot overwrite new identity", async () => {
    const old = deferred<Response>()
    const started = deferred<AbortSignal>()
    const pending = { hold: false }
    using scope = fixture((request) => {
      const url = new URL(request.url)
      if (pending.hold && url.pathname === "/api/actions/workflow/ab_a") { started.resolve(request.signal); return old.promise }
    })
    await scope.model.refresh()
    pending.hold = true
    const reading = scope.model.refresh()
    const signal = await started.promise
    scope.model.selectBinding(Actions.BindingID.make("ab_b"))
    await scope.model.refresh()
    expect(signal.aborted).toBe(true)
    expect(scope.model.state.binding?.id).toBe(Actions.BindingID.make("ab_b"))
    expect(scope.model.state.workflows.value?.items[0].bindingID).toBe(Actions.BindingID.make("ab_b"))
    old.resolve(located(page([workflow()])))
    await reading
    expect(scope.model.state.workflows.value?.items[0].bindingID).toBe(Actions.BindingID.make("ab_b"))
    expect(scope.model.state.route).toEqual({ view: "library" })
  })

  test("pagination replaces one page and refresh deduplicates while retaining that cursor", async () => {
    using scope = fixture((request) => {
      const url = new URL(request.url)
      if (!url.pathname.startsWith("/api/actions/workflow/")) return
      const name = url.searchParams.get("cursor") || "first"
      return located(page([{ ...workflow(), id: name, name }], `after-${name}`))
    })
    await scope.model.refresh()
    await scope.model.more("workflows")
    expect(scope.model.state.workflows.value?.items.map((item) => item.id)).toEqual(["after-first"])
    await scope.model.more("workflows")
    expect(scope.model.state.workflows.value?.items.map((item) => item.id)).toEqual(["after-after-first"])
    const requestsBefore = scope.requests.length
    await Promise.all([scope.model.refresh(), scope.model.refresh()])
    const requested = scope.requests.slice(requestsBefore).filter((request) => new URL(request.url).pathname.startsWith("/api/actions/workflow/"))
    expect(requested).toHaveLength(1)
    expect(new URL(requested[0].url).searchParams.get("cursor")).toBe("after-after-first")
  })

  test("late more response cannot replace a new filtered page or its cursor", async () => {
    const old = deferred<Response>()
    const started = deferred<void>()
    using scope = fixture((request) => {
      const url = new URL(request.url)
      if (!url.pathname.startsWith("/api/actions/workflow/")) return
      if (url.searchParams.get("cursor") === "old-next") { started.resolve(); return old.promise }
      return located(page([{ ...workflow(), id: "old", name: "old" }, { ...workflow(), id: "new", name: "new" }], "old-next"))
    })
    await scope.model.refresh()
    const reading = scope.model.more("workflows")
    await started.promise
    scope.model.filter({ query: "new" })
    await scope.model.refresh()
    old.resolve(located(page([{ ...workflow(), id: "obsolete" }], "obsolete-next")))
    await reading
    // The model keeps the whole native page; query filtering is presentation-owned since d8ee00372.
    expect(scope.model.state.workflows.value?.items.map((item) => item.id)).toEqual(["old", "new"])
    await scope.model.more("workflows")
    const request = scope.requests.filter((request) => new URL(request.url).pathname.startsWith("/api/actions/workflow/")).at(-1)
    expect(request && new URL(request.url).searchParams.get("cursor")).toBe("old-next")
    expect(request && new URL(request.url).searchParams.get("query")).toBeNull()
  })

  test("run graph reads its exact commit and attempt jobs without fetching other detail tabs", async () => {
    using scope = fixture()
    await scope.model.refresh()
    const before = scope.requests.length
    scope.model.navigate({ view: "run", runID: "101", attempt: 1, path: workflow().path, ref: "wrong-current-ref", tab: "graph" })
    await scope.model.refresh()
    const requests = scope.requests.slice(before)
    const graph = requests.find((request) => new URL(request.url).pathname.endsWith("/graph"))
    expect(graph && new URL(graph.url).searchParams.get("ref")).toBe(run().commit)
    expect(graph && new URL(graph.url).searchParams.get("path")).toBe(workflow().path)
    expect(scope.model.state.route.attempt).toBe(1)
    expect(scope.model.state.graph.status).toBe("ready")
    expect(scope.model.state.jobs.value?.items[0].attempt).toBe(1)
    expect(requests.some((request) => /\/source$|\/resource\/|\/transfer\//.test(new URL(request.url).pathname))).toBe(false)
  })

  test("missing API exposes unsupported while Local stays reachable; native auth error remains distinct", async () => {
    using absent = fixture(() => new Response("Not Found", { status: 404 }))
    await absent.model.refresh()
    expect(absent.model.state.unsupported).toBe(true)
    expect(absent.model.state.bindings.status).toBe("error")
    absent.model.navigate({ view: "local" })
    const before = absent.requests.length
    await absent.model.refresh()
    expect(absent.model.state.route.view).toBe("local")
    expect(absent.requests.length).toBe(before)
    using denied = fixture(() => Response.json({ _tag: "ActionsError", kind: "not_authenticated", message: "secret credential" }, { status: 400 }))
    await denied.model.refresh()
    expect(denied.model.state.unsupported).toBe(false)
    expect(denied.model.state.bindings.error?.kind).toBe("not_authenticated")
    expect(JSON.stringify(denied.model.state.bindings.error)).not.toContain("secret")
  })

  test("workflow graph without an explicit ref remains source_unresolved instead of reading guessed current config", async () => {
    using scope = fixture()
    await scope.model.refresh()
    const before = scope.requests.length
    scope.model.navigate({ view: "workflow", workflowID: "11", path: workflow().path, tab: "graph" })
    await scope.model.refresh()
    expect(scope.model.state.graph.status).toBe("error")
    expect(scope.model.state.graph.error?.kind).toBe("source_unresolved")
    expect(scope.requests.slice(before).some((request) => /\/graph$|\/source$/.test(new URL(request.url).pathname))).toBe(false)
  })

  test("workflow graph resolves catalog default ref without using latest run branch or loading history", async () => {
    using scope = fixture((request) => {
      if (new URL(request.url).pathname === "/api/actions/workflow/ab_a") return located(page([{ ...workflow(), defaultRef: "release/current" }]))
    })
    await scope.model.refresh()
    const before = scope.requests.length
    scope.model.navigate({ view: "workflow", workflowID: "11", tab: "graph" })
    await scope.model.refresh()
    const graph = scope.requests.slice(before).find((request) => new URL(request.url).pathname.endsWith("/graph"))
    expect(graph && new URL(graph.url).searchParams.get("ref")).toBe("release/current")
    expect(scope.model.state.route.ref).toBe("release/current")
    expect(scope.model.state.route.path).toBe(workflow().path)
    expect(scope.requests.slice(before).some((request) => /\/run\/|\/jobs$|\/source$/.test(new URL(request.url).pathname))).toBe(false)
    scope.model.navigate({ ...scope.model.state.route, ref: "feature/explicit" })
    await scope.model.refresh()
    expect(scope.model.state.graph.value?.source.ref).toBe("feature/explicit")
  })

  test("restored workflow graph completes identity from newly loaded catalog, not a guessed branch", async () => {
    using scope = fixture((request) => {
      if (new URL(request.url).pathname === "/api/actions/workflow/ab_a") return located(page([{ ...workflow(), defaultRef: "release/current" }]))
    }, { bindingID: Actions.BindingID.make("ab_a"), route: { view: "workflow", workflowID: "11", tab: "graph" } })
    await scope.model.refresh()
    expect(scope.model.state.graph.status).toBe("ready")
    expect(scope.model.state.graph.value?.source.path).toBe(workflow().path)
    expect(scope.model.state.graph.value?.source.ref).toBe("release/current")
    expect(scope.requests.some((request) => /\/run\/|\/jobs$|\/source$/.test(new URL(request.url).pathname))).toBe(false)
  })

  test("workflow executions send exact workflow filter separately from source ref and reject wrong native workflow", async () => {
    using scope = fixture()
    await scope.model.refresh()
    scope.model.navigate({ view: "runs", workflowID: "11", ref: "release/source" })
    await scope.model.refresh()
    const request = scope.requests.filter((request) => new URL(request.url).pathname === "/api/actions/run/ab_a").at(-1)
    expect(request && new URL(request.url).searchParams.get("workflowID")).toBe("11")
    expect(request && new URL(request.url).searchParams.get("ref")).toBeNull()
    using wrong = fixture((request) => {
      if (new URL(request.url).searchParams.get("workflowID")) return located(page([{ ...run(), workflowID: "22" }]))
    })
    await wrong.model.refresh()
    wrong.model.navigate({ view: "runs", workflowID: "11" })
    await wrong.model.refresh()
    expect(wrong.model.state.runs.status).toBe("error")
    expect(wrong.model.state.runs.error?.kind).toBe("binding_stale")
  })

  test("late connection acknowledgement cannot retarget a user who already left for Local", async () => {
    const started = deferred<void>()
    const allow = deferred<Response>()
    using scope = fixture((request) => {
      if (new URL(request.url).pathname === "/api/actions/binding" && request.method === "POST") {
        started.resolve()
        return allow.promise
      }
    })
    await scope.model.refresh()
    const connecting = scope.model.connect({ remote: "origin", provider: binding().provider, projectPath: "owner/other" })
    await started.promise
    scope.model.navigate({ view: "local" })
    allow.resolve(located({ ...binding("ab_connected"), projectPath: "owner/other" }))
    await connecting
    expect(scope.model.state.route).toEqual({ view: "local" })
    expect(scope.model.state.binding?.id).toBe(Actions.BindingID.make("ab_a"))
    expect(scope.model.state.submitting).toBe(false)
  })

  test("Solid owner disposal aborts a pending preview, stale output cannot repopulate state, disposed model cannot restart", async () => {
    const pulling = deferred<void>()
    const metrics = { cancels: 0 }
    using scope = fixture((request) => {
      if (!new URL(request.url).pathname.startsWith("/api/actions/transfer/")) return
      return new Response(new ReadableStream<Uint8Array>({ pull() { pulling.resolve() }, cancel() { metrics.cancels++ } }, { highWaterMark: 0 }))
    })
    await scope.model.refresh()
    scope.model.navigate({ view: "run", runID: "101", attempt: 2, tab: "jobs" })
    await scope.model.refresh()
    const reading = scope.model.previewLog("202")
    await pulling.promise
    scope.dispose()
    await reading
    expect(metrics.cancels).toBe(1)
    expect(scope.model.state.log.status).toBe("idle")
    const before = scope.requests.length
    scope.model.navigate({ view: "library" })
    await scope.model.refresh()
    await scope.model.more("runs")
    expect(scope.requests.length).toBe(before)
  })

  test("preferences contain identifiers only, source document and operation payload never persist", async () => {
    const saved: unknown[] = []
    using scope = fixture(undefined, { save: (value) => saved.push(value) })
    await scope.model.refresh()
    scope.model.navigate({ view: "run", runID: "101", attempt: 2, path: workflow().path, tab: "graph" })
    await scope.model.refresh()
    expect(saved.length).toBeGreaterThan(0)
    expect(saved.every((value) => typeof value === "object" && value !== null && Object.keys(value).every((key) => ["bindingID", "route", "filters"].includes(key)))).toBe(true)
    expect(JSON.stringify(saved)).not.toContain("jobs: {}")
    expect(scope.model.state.graph.value?.source.text).toBe("jobs: {}")
  })

  test("each mock resource tab reads only its selected native page; pagination replaces that page", async () => {
    using scope = fixture((request) => {
      const url = new URL(request.url)
      if (!url.pathname.startsWith("/api/actions/resource/")) return
      const kind = url.searchParams.get("kind")
      const id = url.searchParams.get("cursor") ?? "first"
      return located(page([{ id, kind, bindingID: "ab_a", name: `${kind} ${id}`, scope: "repository:1", data: { resourceVersion: "native:metadata" } }], "opaque-next"))
    })
    await scope.model.refresh()
    const kinds: Actions.ResourceKind[] = ["artifacts", "environments", "variables", "runners", "caches", "schedules"]
    for (const kind of kinds) {
      const before = scope.requests.length
      scope.model.navigate({ view: "resources", resourceKind: kind })
      await scope.model.refresh()
      const selected = scope.requests.slice(before).filter((request) => new URL(request.url).pathname.startsWith("/api/actions/resource/"))
      expect(selected).toHaveLength(1)
      expect(new URL(selected[0].url).searchParams.get("kind")).toBe(kind)
      expect(scope.model.state.resources.value?.items.map((item) => item.id)).toEqual(["first"])
    }
    await scope.model.more("artifacts")
    expect(scope.model.state.resources.value?.items.map((item) => item.id)).toEqual(["opaque-next"])
    expect(scope.model.state.artifacts.status).toBe("idle")
  })

  test("late resource response cannot replace a newly selected resource family", async () => {
    const old = deferred<Response>()
    const started = deferred<AbortSignal>()
    using scope = fixture((request) => {
      const url = new URL(request.url)
      if (!url.pathname.startsWith("/api/actions/resource/")) return
      if (url.searchParams.get("kind") === "variables") { started.resolve(request.signal); return old.promise }
      return located(page([{ id: "runner-1", bindingID: "ab_a", kind: "runners", name: "runner", data: {} }]))
    })
    await scope.model.refresh()
    scope.model.navigate({ view: "resources", resourceKind: "variables" })
    const reading = scope.model.refresh()
    const signal = await started.promise
    scope.model.navigate({ view: "resources", resourceKind: "runners" })
    await scope.model.refresh()
    expect(signal.aborted).toBe(true)
    old.resolve(located(page([{ id: "old-variable", bindingID: "ab_a", kind: "variables", name: "obsolete", data: {} }])))
    await reading
    expect(scope.model.state.resources.value?.items.map((item) => item.id)).toEqual(["runner-1"])
  })
})

describe("Actions deep links", () => {
  test("a run-only link loads the run, then completes workflow, path and commit without resetting it", async () => {
    using scope = fixture(undefined, { route: { view: "run", runID: "101" } })
    await settle(() => scope.model.state.graph.status === "ready")
    expect(scope.model.state.run.status).toBe("ready")
    expect(scope.model.state.route).toMatchObject({ view: "run", runID: "101", workflowID: "11", ref: run().commit, tab: "graph" })
    expect(scope.model.state.graph.value?.source.path).toBe(workflow().path)
    expect(scope.requests.filter((request) => new URL(request.url).pathname === "/api/actions/run/ab_a/101")).toHaveLength(1)
  })

  test("a source link without ref reads the workflow's default ref from the catalog", async () => {
    using scope = fixture((request) => {
      if (new URL(request.url).pathname === "/api/actions/workflow/ab_a") return located(page([{ ...workflow(), defaultRef: "dev" }]))
      if (new URL(request.url).pathname.endsWith("/source")) return located({ bindingID: "ab_a", path: workflow().path, ref: "dev",
        commit: run().commit, version: "b".repeat(40), text: "jobs: {}", editable: false })
    }, { route: { view: "source", workflowID: "11", path: workflow().path } })
    await settle(() => scope.model.state.source.status !== "idle" && scope.model.state.source.status !== "loading")
    expect(scope.model.state.route.ref).toBe("dev")
    const source = scope.requests.find((request) => new URL(request.url).pathname.endsWith("/source"))
    expect(source && new URL(source.url).searchParams.get("ref")).toBe("dev")
  })

  test("selecting a binding of another provider drops the provider-native run status filter", async () => {
    using scope = fixture((request) => {
      if (new URL(request.url).pathname === "/api/actions/binding")
        return located([binding(), { ...binding("ab_b"), provider: { kind: "gitlab", hostname: "gitlab.com", apiOrigin: "https://gitlab.com" } }])
    }, { bindingID: Actions.BindingID.make("ab_a"), route: { view: "runs" }, filters: { status: "failure" } })
    await scope.model.refresh()
    expect(scope.model.state.filters.status).toBe("failure")
    scope.model.selectBinding(Actions.BindingID.make("ab_b"))
    expect(scope.model.state.filters.status).toBe("")
  })
})
