import { afterEach, expect, setSystemTime, test } from "bun:test"
import { createRequire } from "node:module"
import path from "node:path"
import { createComponent, type JSX, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { render } from "solid-js/web"
import { QueryClient } from "@tanstack/solid-query"
import { MemoryRouter } from "@solidjs/router"
import type { RelayDocument, RelayDocumentFields } from "@/orchestra/relay/client"
import type { RelaySource } from "@/orchestra/relay/source"
import type { SaveState } from "@/orchestra/relay/editor-head"
import { documentFields, type Flow, flowFromDocument, moveNodes, removeNodes } from "@/orchestra/relay/graph"

// Compile the real component graph with Solid, isolated from other Bun tests' JSX loaders.
const solid = createRequire(Bun.resolveSync("vite-plugin-solid", import.meta.dir))
Bun.plugin({
  name: "solid-workflow-authoring",
  setup(build) {
    build.onLoad({ filter: /\.tsx?\?workflow-authoring$/ }, async (args) => {
      const file = args.path.replace(/\?workflow-authoring$/, "")
      const source = await Bun.file(file).text()
      const code = file.endsWith(".tsx")
        ? (await solid("@babel/core").transformAsync(source, {
            filename: file,
            presets: [[solid("babel-preset-solid"), { generate: "dom" }]],
            parserOpts: { plugins: ["jsx", "typescript"] },
            configFile: false,
            babelrc: false,
          })).code
        : source
      return {
        contents: code.replace(/(from\s+)(["'])([^"']+)\2/g, (match: string, lead: string, _quote: string, spec: string) => {
          const resolved = Bun.resolveSync(spec, path.dirname(file))
          return /\.tsx?$/.test(resolved) && !resolved.includes("node_modules")
            ? `${lead}${JSON.stringify(`${resolved}?workflow-authoring`)}`
            : match
        }),
        loader: "ts",
      }
    })
  },
})
const load = (specifier: string) => import(`${Bun.resolveSync(specifier, import.meta.dir)}?workflow-authoring`)
const { PlatformProvider }: typeof import("@/context/platform") = await load("@/context/platform")
const { LanguageProvider }: typeof import("@/context/language") = await load("@/context/language")
const { createSdkForServer }: typeof import("@/utils/server") = await load("@/utils/server")
const { createRelayClient, decodeDocument }: typeof import("@/orchestra/relay/client") = await load("@/orchestra/relay/client")
const { CreateWorkflowDialog }: typeof import("@/orchestra/relay/create") = await load("@/orchestra/relay/create")
const { WorkflowLibrary }: typeof import("@/orchestra/relay/library") = await load("@/orchestra/relay/library")
const { WorkflowDetails }: typeof import("@/orchestra/relay/details-workflow") = await load("@/orchestra/relay/details-workflow")
const { SaveStatus }: typeof import("@/orchestra/relay/editor-head") = await load("@/orchestra/relay/editor-head")
const { Editor }: typeof import("@/orchestra/relay/editor") = await load("@/orchestra/relay/editor")
const { rememberDocument }: typeof import("@/orchestra/relay/cache") = await load("@/orchestra/relay/cache")
const { DraftScope, openDraft, profileDrafts, BURST_MS, DRAFT_LIMIT, HISTORY_LIMIT }: typeof import("@/orchestra/relay/drafts") = await load("@/orchestra/relay/drafts")
const { runVersion }: typeof import("@/orchestra/relay/history") = await load("@/orchestra/relay/history")
const { decodeRun }: typeof import("@/orchestra/relay/runs") = await load("@/orchestra/relay/runs")
const { DeleteDialog, RemoveNodesDialog }: typeof import("@/orchestra/relay/dialogs") = await load("@/orchestra/relay/dialogs")
const { PublishDialog }: typeof import("@/orchestra/relay/dialogs") = await load("@/orchestra/relay/dialogs")

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).reverse().forEach((cleanup) => cleanup()))
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
async function until(ready: () => boolean) {
  const deadline = Date.now() + 2_000
  while (!ready() && Date.now() < deadline) await tick()
  expect(ready()).toBe(true)
}

function mount(view: () => JSX.Element, direction = "ltr") {
  const host = document.createElement("div")
  host.style.direction = direction
  document.body.append(host)
  document.documentElement.style.direction = direction
  const dispose = render(() => createComponent(MemoryRouter, { root: () => createComponent(PlatformProvider, {
    value: { platform: "web", openExternal() {}, restart: async () => {}, notify: async () => {} },
    get children() { return createComponent(LanguageProvider, { locale: "en", get children() { return view() } }) },
  }) }), host)
  cleanups.push(() => { dispose(); host.remove(); document.documentElement.style.removeProperty("direction") })
  return document.body
}
function doc(id = "template", fields: Partial<RelayDocument> = {}) {
  return decodeDocument({
    id, name: "Review workflow", nodes: [
      { id: "start", name: "Start", type: "relay.startTrigger", position: [0, 0], parameters: {} },
      { id: "review", name: "Review", type: "relay.execute", position: [100, 0], parameters: { instructions: "Review changes" } },
    ],
    connections: { Start: { main: [[{ node: "Review", type: "main", index: 0 }]] } },
    tags: [], meta: { relay: { schema: 1, kind: "workflow", profile: "wp-execute" } },
    active: false, activeVersionId: null, activeVersion: null, isArchived: false,
    versionId: "v1", versionCounter: 1, checksum: "c".repeat(64), runnable: true,
    createdAt: "2026-10-07T00:00:00Z", updatedAt: "2026-10-07T00:00:00Z", ...fields,
  })
}

function setup(respond?: (request: Request) => Promise<Response>) {
  const documents = [doc(), doc("blocked", { name: "Unavailable", runnable: false })]
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  const key = (...parts: string[]) => ["workflow-authoring", ...parts]
  queryClient.setQueryData(key("documents"), documents)
  cleanups.push(() => queryClient.clear())
  const requests: Request[] = []
  const fetcher = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init)
    requests.push(request.clone())
    if (respond) return respond(request)
    const body: RelayDocumentFields = await request.json()
    return Response.json({ location: { directory: "/repo" }, data: doc("saved", { ...body, tags: [] }) })
  }, { preconnect: fetch.preconnect })
  const client = createRelayClient({ sdk: createSdkForServer({ server: { url: "http://localhost:4096" }, directory: "/repo", fetch: fetcher }), directory: "/repo" })
  const source = {
    client, queryClient: () => queryClient, key,
    list: () => queryClient.getQueryData<RelayDocument[]>(key("documents")) ?? [],
    documents: { isSuccess: true, isPending: false, isError: false },
    runs: { data: [] }, runsState: () => "ready", invalidate() {},
  } as unknown as RelaySource
  const flows = new Map(documents.map((document) => [document.id, flowFromDocument(document, "workflow")]))
  return { source, flows, requests, queryClient, key }
}

function field(host: HTMLElement, value: string) {
  const input = host.querySelector<HTMLInputElement>('input[name="name"]')!
  expect(input).not.toBeNull()
  input.value = value
  input.dispatchEvent(new Event("input", { bubbles: true }))
  return input
}

function submit(host: HTMLElement) {
  host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
}

test("create preserves a custom name when selecting a template and caches its saved result before navigation", async () => {
  const api = setup()
  const opened: string[] = []
  const host = mount(() => createComponent(CreateWorkflowDialog, {
    ...api, initial: "blank", onClose() {},
    onCreated(id) {
      expect(api.source.list().find((item) => item.id === id)?.name).toBe("Sprint review")
      opened.push(id)
    },
  }))
  await tick()
  const input = field(host, "Sprint review")
  host.querySelector<HTMLButtonElement>('[data-template="template"]')!.click()
  expect(input.value).toBe("Sprint review")
  submit(host)
  await until(() => opened.length > 0 || !!host.querySelector(".mx-error"))
  expect(host.querySelector(".mx-error")?.textContent).toBeUndefined()
  expect(opened).toEqual(["saved"])
  expect(api.requests).toHaveLength(1)
  const created = await api.requests[0].json()
  expect(created).toMatchObject({
    name: "Sprint review", nodes: doc().nodes, connections: doc().connections,
    meta: { relay: { kind: "workflow" } },
  })
  // The copy is the user's own workflow, so it drops the profile mark that lists templates.
  expect(created.meta.relay).not.toHaveProperty("profile")
  // A template that cannot run is not offered.
  expect(host.querySelector('[data-template="blocked"]')).toBeNull()
})

test("create validates name, keeps inputs after refusal, locks pending submission, and retries once", async () => {
  const response = Promise.withResolvers<Response>()
  const api = setup(async () => (await response.promise).clone())
  const closed: boolean[] = []
  const opened: string[] = []
  const host = mount(() => createComponent(CreateWorkflowDialog, { ...api, initial: "template", onClose: () => closed.push(true), onCreated: (id) => opened.push(id) }))
  const input = field(host, "   ")
  submit(host)
  expect(api.requests).toHaveLength(0)
  expect(input.getAttribute("aria-invalid")).toBe("true")
  expect(document.activeElement).toBe(input)
  expect(host.querySelector(`#${input.getAttribute("aria-describedby")}`)?.textContent).toBe("Name the workflow.")
  field(host, "Keep my draft")
  submit(host)
  submit(host)
  await until(() => api.requests.length === 1)
  host.querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))
  expect(api.requests).toHaveLength(1)
  expect(closed).toEqual([])
  expect(input.disabled).toBe(true)
  expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true)
  response.resolve(Response.json({ _tag: "RelayUnavailableError", code: "unavailable", message: "Storage unavailable; retry." }, { status: 503 }))
  await until(() => !input.disabled)
  expect(host.querySelector(".mx-error")?.textContent).toBe("Storage unavailable; retry.")
  expect(input.value).toBe("Keep my draft")
  expect(input.disabled).toBe(false)
  expect(host.querySelector('[data-template="template"]')?.getAttribute("aria-checked")).toBe("true")
  expect(opened).toEqual([])
  submit(host)
  await until(() => api.requests.length === 2 && !input.disabled)
  expect(api.requests).toHaveLength(2)
  expect(await api.requests[1].json()).toEqual(await api.requests[0].json())
})

test("a missing template never silently creates blank; choosing blank explicitly recovers", async () => {
  const api = setup()
  const opened: string[] = []
  const host = mount(() => createComponent(CreateWorkflowDialog, { ...api, initial: "removed", onClose() {}, onCreated: (id) => opened.push(id) }))
  field(host, "Explicit choice")
  submit(host)
  await tick()
  expect(api.requests).toHaveLength(0)
  expect(host.querySelector('[data-template="blank"]')?.getAttribute("tabindex")).toBe("0")
  host.querySelector<HTMLButtonElement>('[data-template="blank"]')!.click()
  submit(host)
  await tick()
  expect(opened).toEqual(["saved"])
  const body = await api.requests[0].json()
  expect(body.name).toBe("Explicit choice")
  expect(body.nodes).toHaveLength(1)
  expect(body.meta).toEqual({ relay: { schema: 1, kind: "workflow" } })
})

for (const direction of ["ltr", "rtl"]) {
  test(`template radios support ${direction} arrows and preserve typed name`, async () => {
    const api = setup()
    const host = mount(() => createComponent(CreateWorkflowDialog, { ...api, initial: "blank", onClose() {}, onCreated() {} }), direction)
    const input = field(host, "Typed name")
    const blank = host.querySelector<HTMLButtonElement>('[data-template="blank"]')!
    const template = host.querySelector<HTMLButtonElement>('[data-template="template"]')!
    blank.focus()
    blank.dispatchEvent(new KeyboardEvent("keydown", { key: direction === "rtl" ? "ArrowLeft" : "ArrowRight", bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(template)
    expect(template.getAttribute("aria-checked")).toBe("true")
    expect(blank.tabIndex).toBe(-1)
    template.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(blank)
    expect(input.value).toBe("Typed name")
  })
}

test("Escape cancels without saving and restores trigger focus", async () => {
  const api = setup()
  const [state, setState] = createStore({ open: false })
  const trigger = document.createElement("button")
  document.body.append(trigger)
  cleanups.push(() => trigger.remove())
  const host = mount(() => createComponent(Show, { get when() { return state.open }, get children() {
    return createComponent(CreateWorkflowDialog, { ...api, initial: "blank", onClose: () => setState("open", false), onCreated() {} })
  } }))
  trigger.focus()
  setState("open", true)
  await until(() => document.activeElement === host.querySelector('input[name="name"]'))
  host.querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))
  await until(() => document.activeElement === trigger)
  expect(host.querySelector('[role="dialog"]')).toBeNull()
  expect(document.activeElement).toBe(trigger)
  expect(api.requests).toHaveLength(0)
})

test("step rename preserves spaces while typing and serialized connections follow the valid name", () => {
  const [state, setState] = createStore({ flow: flowFromDocument(doc(), "workflow") })
  const host = mount(() => createComponent(WorkflowDetails, {
    get flow() { return state.flow }, get node() { return state.flow.nodes[1] },
    run: undefined, frozen: undefined, issues: [], skills: [], save: undefined,
    onChange: (flow) => setState("flow", flow), onNav() {}, onClose() {}, onReview() {},
  }))
  const input = document.querySelector<HTMLInputElement>('[data-component="relay-node-details"] input[data-autofocus]')!
  expect(input).not.toBeNull()
  input.value = "Review"
  for (const character of " changes") {
    input.value += character
    input.dispatchEvent(new Event("input", { bubbles: true }))
  }
  expect(input.value).toBe("Review changes")
  expect(state.flow.nodes[1].name).toBe("Review changes")
  expect(documentFields(state.flow).connections.Start.main[0][0].node).toBe("Review changes")
  input.value = "Start"
  input.dispatchEvent(new Event("input", { bubbles: true }))
  expect(input.value).toBe("Start")
  expect(input.getAttribute("aria-invalid")).toBe("true")
  expect(document.getElementById(input.getAttribute("aria-describedby")!)?.textContent).toBe("Use a name no other node has.")
  expect(state.flow.nodes[1].name).toBe("Review changes")
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))
  expect(input.value).toBe("Review changes")
  expect(input.getAttribute("aria-invalid")).toBe("false")
})

test("failed saves show the server error and explicit retry; conflicts keep reload distinct", () => {
  const [state, setState] = createStore({ save: { state: "error", dirty: true, error: "Disk full" } as SaveState, retries: 0 })
  const host = mount(() => createComponent(SaveStatus, {
    get save() { return state.save }, onRetry: () => setState("retries", (value) => value + 1), onReload() {},
  }))
  expect(host.textContent).toContain("Disk full")
  expect(host.textContent).not.toContain("Saving…")
  expect(host.querySelector("button")!.textContent).toBe("Try again")
  host.querySelector("button")!.click()
  expect(state.retries).toBe(1)
  expect([...host.querySelectorAll("button")].map((button) => button.textContent)).toEqual(["Try again", "Discard changes"])
  // A transport failure names the server, not the browser's raw message.
  setState("save", { error: "Failed to fetch", reason: "offline" })
  expect(host.textContent).toContain("Can't reach the Orchestra server.")
  expect(host.textContent).not.toContain("Failed to fetch")
  setState("save", { state: "conflict", error: "", reason: undefined })
  // Without the editor's draft scope only the discard is offered.
  expect([...host.querySelectorAll("button")].map((button) => button.textContent)).toEqual(["Discard mine"])
})

test("Keep mine in the save status overwrites a conflict with a forced save of the local flow", async () => {
  const api = setup(async (request) => {
    const body = await request.json()
    if (!body.force) return Response.json({ message: "The workflow changed.", _tag: "RelayConflictError" }, { status: 409 })
    return Response.json({ location: { directory: "/repo" }, data: doc("template", { ...body, versionId: "v3", versionCounter: 3, checksum: "e".repeat(64) }) })
  })
  const draft = openDraft(api.source, doc(), "workflow")!
  draft.rename("Mine")
  await draft.flush()
  expect(draft.state.save).toMatchObject({ state: "conflict", dirty: true, error: "" })
  const host = mount(() => createComponent(DraftScope, { draft, go() {}, get children() {
    return createComponent(SaveStatus, { get save() { return draft.state.save }, onReload() {} })
  } }))
  expect([...host.querySelectorAll("button")].map((button) => button.textContent)).toEqual(["Keep mine", "Save mine as a copy", "Discard mine"])
  host.querySelector("button")!.click()
  await until(() => draft.state.save.state === "saved" && !draft.state.save.dirty)
  expect(await api.requests.at(-1)!.json()).toMatchObject({ name: "Mine", versionId: "v1", force: true })
  expect(draft.state.base.versionId).toBe("v3")
  draft.release()
})

test("a server that cannot be reached reads as offline, and focus tries the write again", async () => {
  const server = { down: true }
  const api = setup(async (request) => {
    if (server.down) throw new TypeError("Failed to fetch")
    return Response.json({ location: { directory: "/repo" }, data: doc("template", { ...await request.json(), versionId: "v2", checksum: "d".repeat(64) }) })
  })
  const draft = openDraft(api.source, doc(), "workflow")!
  draft.rename("Offline edit")
  await draft.flush()
  expect(draft.state.save).toMatchObject({ state: "error", dirty: true, reason: "offline" })
  server.down = false
  window.dispatchEvent(new Event("focus"))
  await until(() => draft.state.save.state === "saved" && !draft.state.save.dirty)
  expect(draft.state.save.reason).toBeUndefined()
  draft.release()
})

test("a document deleted elsewhere stops retrying and leaves as a copy of the local flow", async () => {
  const api = setup(async (request) => request.method === "POST"
    ? Response.json({ location: { directory: "/repo" }, data: doc("copied", { ...await request.json(), tags: [] }) })
    : Response.json({ _tag: "RelayNotFoundError", code: "not-found", message: "Resource not found" }, { status: 404 }))
  const draft = openDraft(api.source, doc(), "workflow")!
  draft.edit(moveNodes(draft.state.flow, new Map([["start", [7, 7]]])))
  await draft.flush()
  expect(draft.state.save).toMatchObject({ state: "error", dirty: true, reason: "missing" })
  draft.rename("Still mine")
  await draft.flush()
  expect(api.requests.filter((request) => request.method === "PATCH")).toHaveLength(1)
  const created = await draft.copy("Still mine copy")
  expect(created.id).toBe("copied")
  const sent: { name: string; nodes: { id: string; position: number[] }[] } = await api.requests.at(-1)!.json()
  expect(sent.name).toBe("Still mine copy")
  expect(sent.nodes.find((node) => node.id === "start")?.position).toEqual([7, 7])
  expect(api.source.list().some((item) => item.id === "copied")).toBe(true)
  expect(draft.active()).toBe(false)
  draft.release()
})

test("unsaved drafts are kept locally as the page goes and come back in the next page", async () => {
  const kept = () => Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index) ?? "")
    .filter((name) => name.startsWith("orchestra-relay-draft:"))
  cleanups.push(() => kept().forEach((name) => localStorage.removeItem(name)))
  const api = setup(async () => Response.json({ message: "Offline" }, { status: 503 }))
  const draft = openDraft(api.source, doc(), "workflow")!
  draft.rename("Kept locally")
  await draft.flush()
  draft.release()
  window.dispatchEvent(new Event("pagehide"))
  expect(kept()).toHaveLength(1)
  // The next page: a new query client for the same server profile.
  const next = setup(async (request) => Response.json({
    location: { directory: "/repo" }, data: doc("template", { ...await request.json(), versionId: "v2", checksum: "d".repeat(64) }),
  }))
  const [restored] = profileDrafts(next.source)
  expect(restored).not.toBe(draft)
  expect(restored.state.name).toBe("Kept locally")
  expect(restored.state.save).toMatchObject({ state: "error", dirty: true, error: "Offline" })
  await restored.flush()
  expect(restored.state.save).toMatchObject({ state: "saved", dirty: false })
  expect(kept()).toHaveLength(0)
  expect(profileDrafts(next.source)).toHaveLength(0)
  draft.discard()
})

test("duplicate opens only after its saved document is in the library cache", async () => {
  const api = setup()
  const opened: string[] = []
  const host = mount(() => createComponent(WorkflowLibrary, {
    ...api, route: { page: "library", kind: "workflow", tab: "list", create: false }, profile: "Test", close() {},
    go(path) {
      expect(api.source.list().find((item) => item.id === "saved")?.name).toBe("Review workflow copy")
      opened.push(path)
    },
  }))
  host.querySelector<HTMLButtonElement>('[data-document="template"] button[aria-haspopup="menu"]')!.click()
  const duplicate = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((button) => button.textContent?.includes("Duplicate"))!
  expect(duplicate).toBeDefined()
  duplicate.click()
  await tick()
  expect(opened).toEqual(["/orchestra/workflows/saved"])
  expect(api.requests).toHaveLength(1)
})

test("a stale list response cannot overwrite the newly created document", async () => {
  const api = setup()
  const response = Promise.withResolvers<RelayDocument[]>()
  const stale = api.queryClient.fetchQuery({ queryKey: api.key("documents"), queryFn: () => response.promise }).catch(() => undefined)
  await rememberDocument(api.queryClient, api.key("documents"), doc("saved"))
  response.resolve([doc()])
  await stale
  expect(api.source.list().map((item) => item.id)).toEqual(["saved", "template", "blocked"])
  await rememberDocument(api.queryClient, api.key("documents"), doc("saved", { name: "Updated" }))
  expect(api.source.list().map((item) => item.id)).toEqual(["saved", "template", "blocked"])
  expect(api.source.list()[0].name).toBe("Updated")
})

test("editor load failures offer retry instead of declaring the workflow missing", () => {
  const api = setup()
  const attempts: boolean[] = []
  const source = { ...api.source, list: () => [], documents: { isError: true, isPending: false, error: new Error("Connection lost"), refetch: () => attempts.push(true) } } as unknown as RelaySource
  const host = mount(() => createComponent(Editor, {
    source, directory: "/repo", route: { page: "editor", kind: "workflow", id: "saved", tab: "editor", add: false },
    profile: "Test", go() {}, close() {}, openSession() {}, crumbs() {},
  }))
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Connection lost")
  expect(host.querySelector('[data-mx-page="orchestra-relay-missing"]')).toBeNull()
  expect(host.querySelector("button")!.textContent).toBe("Try again")
  host.querySelector("button")!.click()
  expect(attempts).toEqual([true])
})

test("pending draft survives unmount, late refusal, scoped reopen and successful explicit retry", async () => {
  const response = Promise.withResolvers<Response>()
  const api = setup(async (request) => api.requests.length === 1 ? response.promise : Response.json({
    location: { directory: "/repo" }, data: doc("template", { ...await request.json(), versionId: "v2", checksum: "d".repeat(64) }),
  }))
  const draft = openDraft(api.source, doc(), "workflow")!
  draft.rename("Retained name")
  expect(window.dispatchEvent(new Event("beforeunload", { cancelable: true }))).toBe(false)
  const saving = draft.flush()
  draft.release()
  expect(profileDrafts(api.source)).toHaveLength(1)
  response.resolve(Response.json({ message: "Disk full", _tag: "RelayUnavailableError" }, { status: 503 }))
  await saving
  const restored = openDraft(api.source, doc(), "workflow")!
  expect(restored).toBe(draft)
  expect(restored.state.name).toBe("Retained name")
  expect(restored.state.save).toMatchObject({ state: "error", dirty: true, error: "Disk full" })
  const other = openDraft({ ...api.source, key: (...parts) => ["other-profile", ...parts] }, doc(), "workflow")!
  expect(other.state.name).toBe("Review workflow")
  other.release()
  await restored.flush()
  expect(restored.state.save).toMatchObject({ state: "saved", dirty: false })
  restored.release()
  expect(window.dispatchEvent(new Event("beforeunload", { cancelable: true }))).toBe(true)
  expect(profileDrafts(api.source)).toHaveLength(0)
  expect(api.requests).toHaveLength(2)
})

test("a failed draft keeps blocking unload after its editor releases it, until it is discarded", async () => {
  const api = setup(async () => Response.json({ message: "Offline" }, { status: 503 }))
  const blocked = () => !window.dispatchEvent(new Event("beforeunload", { cancelable: true }))
  const draft = openDraft(api.source, doc(), "workflow")!
  draft.rename("Unsaved")
  await draft.flush()
  expect(draft.state.save.state).toBe("error")
  expect(blocked()).toBe(true)
  draft.release()
  expect(blocked()).toBe(true)
  expect(profileDrafts(api.source)).toHaveLength(1)
  const reopened = openDraft(api.source, doc(), "workflow")!
  expect(reopened).toBe(draft)
  reopened.discard()
  reopened.release()
  expect(blocked()).toBe(false)
})

test("undo and redo walk a bounded history, persist through autosave and clear redo on a new edit", async () => {
  const api = setup()
  const draft = openDraft(api.source, doc(), "workflow")!
  let now = 1_000_000
  setSystemTime(new Date(now))
  cleanups.push(() => setSystemTime())
  // Each call lands in its own undo step.
  const step = (flow: Flow) => {
    now += BURST_MS + 1
    setSystemTime(new Date(now))
    draft.edit(flow)
  }
  const start = () => draft.state.flow.nodes.find((node) => node.id === "start")!
  expect(draft.canUndo()).toBe(false)
  step(removeNodes(draft.state.flow, ["review"]))
  step(moveNodes(draft.state.flow, new Map([["start", [40, 40]]])))
  expect(draft.state.flow.nodes).toHaveLength(1)
  expect(start().x).toBe(40)
  draft.undo()
  expect(start().x).toBe(0)
  expect(draft.state.flow.nodes).toHaveLength(1)
  draft.undo()
  expect(draft.state.flow.nodes).toHaveLength(2)
  expect([draft.canUndo(), draft.canRedo()]).toEqual([false, true])
  draft.redo()
  expect(draft.state.flow.nodes).toHaveLength(1)
  expect(draft.state.save.dirty).toBe(true)
  step(moveNodes(draft.state.flow, new Map([["start", [8, 8]]])))
  expect(draft.canRedo()).toBe(false)
  await draft.flush()
  expect((await api.requests.at(-1)!.json()).nodes).toHaveLength(1)
  // The echo of its own save keeps the history.
  draft.undo()
  expect(start().x).toBe(0)
  draft.undo()
  expect(draft.state.flow.nodes).toHaveLength(2)
  Array.from({ length: HISTORY_LIMIT + 10 }, (_, index) => index).forEach((index) =>
    step(moveNodes(draft.state.flow, new Map([["start", [index, index]]]))),
  )
  const undone = Array.from({ length: HISTORY_LIMIT + 10 }, () => draft.canUndo() && (draft.undo(), true)).filter(Boolean)
  expect(undone).toHaveLength(HISTORY_LIMIT)
  draft.discard()
  draft.release()
})

test("rapid edits share one undo step", () => {
  const api = setup()
  const draft = openDraft(api.source, doc(), "workflow")!
  setSystemTime(new Date(1_000_000))
  cleanups.push(() => setSystemTime())
  ;[1, 2, 3].forEach((x) => draft.edit(moveNodes(draft.state.flow, new Map([["start", [x, x]]]))))
  expect(draft.state.flow.nodes.find((node) => node.id === "start")!.x).toBe(3)
  draft.undo()
  expect(draft.state.flow.nodes.find((node) => node.id === "start")!.x).toBe(0)
  expect(draft.canUndo()).toBe(false)
  draft.discard()
  draft.release()
})

test("a rename is its own undo step and a burst is timed from its first edit", () => {
  const api = setup()
  const draft = openDraft(api.source, doc(), "workflow")!
  setSystemTime(new Date(1_000_000))
  cleanups.push(() => setSystemTime())
  const start = () => draft.state.flow.nodes.find((node) => node.id === "start")!
  draft.rename("Renamed")
  expect(draft.canUndo()).toBe(true)
  // Edits 300 ms apart: the third is more than BURST_MS after the first, so it starts a new step.
  ;[1, 2, 3].forEach((x) => {
    setSystemTime(new Date(1_000_000 + x * 300))
    draft.edit(moveNodes(draft.state.flow, new Map([["start", [x, x]]])))
  })
  draft.undo()
  expect(start().x).toBe(2)
  draft.undo()
  expect([start().x, draft.state.name]).toEqual([0, "Renamed"])
  draft.undo()
  expect(draft.state.name).toBe("Review workflow")
  expect(draft.canUndo()).toBe(false)
  draft.redo()
  expect(draft.state.name).toBe("Renamed")
  draft.discard()
  draft.release()
})

test("deleting several nodes asks first and confirming runs the removal", async () => {
  const calls: string[] = []
  const host = mount(() => createComponent(RemoveNodesDialog, {
    count: 3, onConfirm: () => calls.push("confirm"), onClose: () => calls.push("close"),
  }))
  expect(host.textContent).toContain("Delete 3 nodes?")
  host.querySelector<HTMLButtonElement>('button[type="submit"]')!.click()
  await until(() => calls.length === 2)
  expect(calls).toEqual(["confirm", "close"])
})

test("profile capacity refuses another draft without evicting failed work", async () => {
  const api = setup(async () => Response.json({ message: "Offline" }, { status: 503 }))
  for (const index of Array.from({ length: DRAFT_LIMIT }, (_, index) => index)) {
    const draft = openDraft(api.source, doc(`draft-${index}`), "workflow")!
    draft.rename(`Unsaved ${index}`)
    await draft.flush()
    draft.release()
  }
  expect(openDraft(api.source, doc("extra"), "workflow")).toBeUndefined()
  expect(profileDrafts(api.source)).toHaveLength(DRAFT_LIMIT)
  const first = openDraft(api.source, doc("draft-0"), "workflow")!
  expect(first.state.name).toBe("Unsaved 0")
  first.discard()
  first.release()
  const extra = openDraft(api.source, doc("extra"), "workflow")!
  expect(extra).toBeDefined()
  extra.release()
  profileDrafts(api.source).forEach((draft) => draft.discard())
})

test("history resolves immutable IDs and legacy counters through actual version routes", async () => {
  const version = { ...doc(), workflowId: "template", versionId: "immutable-id", versionCounter: 3 }
  const api = setup(async (request) => Response.json({ location: { directory: "/repo" }, data: new URL(request.url).pathname.endsWith("/version") ? [version] : version }))
  const run = (value: string | number | undefined) => decodeRun({ runID: "r", documentID: "template", status: "completed", version: value })[0]
  expect((await runVersion(api.source.client, run("immutable-id")))?.versionId).toBe("immutable-id")
  expect((await runVersion(api.source.client, run(3)))?.versionId).toBe("immutable-id")
  expect(await runVersion(api.source.client, run(99))).toBeNull()
  expect(await runVersion(api.source.client, run(undefined))).toBeNull()
  expect(api.requests.map((request) => new URL(request.url).pathname)).toEqual([
    "/api/relay/document/template/version/immutable-id", "/api/relay/document/template/version", "/api/relay/document/template/version",
  ])
})

test("successful Delete dialog releases failed draft capacity through the shared entrypoint", async () => {
  const api = setup(async (request) => request.method === "DELETE" ? new Response(null, { status: 204 }) : Response.json({ message: "Offline" }, { status: 503 }))
  for (const index of Array.from({ length: DRAFT_LIMIT }, (_, index) => index)) {
    const draft = openDraft(api.source, doc(`failed-${index}`), "workflow")!
    draft.rename(`Unsaved ${index}`)
    await draft.flush()
    draft.release()
  }
  expect(openDraft(api.source, doc("extra"), "workflow")).toBeUndefined()
  const removed: boolean[] = []
  const host = mount(() => createComponent(DeleteDialog, {
    source: api.source, document: doc("failed-0"), kind: "workflow", onClose() {}, onDeleted: () => removed.push(true),
  }))
  host.querySelector<HTMLButtonElement>('button[type="submit"]')!.click()
  await until(() => removed.length === 1)
  expect(profileDrafts(api.source).some((draft) => draft.state.base.id === "failed-0")).toBe(false)
  const extra = openDraft(api.source, doc("extra"), "workflow")!
  expect(extra).toBeDefined()
  extra.release()
  profileDrafts(api.source).forEach((draft) => draft.discard())
})

test("Delete dialog prevents a completed late save from re-inserting its removed document", async () => {
  const response = Promise.withResolvers<Response>()
  const api = setup(async (request) => request.method === "DELETE" ? new Response(null, { status: 204 }) : response.promise)
  const draft = openDraft(api.source, doc(), "workflow")!
  draft.rename("Late write")
  const saving = draft.flush()
  draft.release()
  const removed: boolean[] = []
  const host = mount(() => createComponent(DeleteDialog, {
    source: api.source, document: doc(), kind: "workflow", onClose() {}, onDeleted: () => removed.push(true),
  }))
  host.querySelector<HTMLButtonElement>('button[type="submit"]')!.click()
  await until(() => removed.length === 1)
  response.resolve(Response.json({ location: { directory: "/repo" }, data: doc("template", { name: "Late write", versionId: "v2", versionCounter: 2 }) }))
  await saving
  expect(api.source.list().map((item) => item.id)).toEqual(["blocked"])
  expect(profileDrafts(api.source)).toHaveLength(0)
  expect(window.dispatchEvent(new Event("beforeunload", { cancelable: true }))).toBe(true)
})

test("final fixes: reload preserves edits made after its GET started while caching the fetched version", async () => {
  const response = Promise.withResolvers<Response>()
  const api = setup(async (request) => request.method === "GET" ? response.promise : Response.json({ message: "Changed elsewhere" }, { status: 409 }))
  const draft = openDraft(api.source, doc(), "workflow")!
  draft.rename("Before reload")
  await draft.flush()
  const loading = draft.reload()
  draft.rename("Typed during reload")
  response.resolve(Response.json({ location: { directory: "/repo" }, data: doc("template", { name: "Remote v2", versionId: "v2", versionCounter: 2 }) }))
  await loading
  expect(draft.state.name).toBe("Typed during reload")
  expect(draft.state.save).toMatchObject({ state: "conflict", dirty: true })
  expect(api.source.list()[0].name).toBe("Remote v2")
  draft.discard()
  draft.release()
})

for (const entry of ["create", "clone"]) {
  test(`lifetime owner: disposed ${entry} caches success without navigating`, async () => {
    const response = Promise.withResolvers<Response>()
    const api = setup(async () => response.promise)
    const [state, setState] = createStore({ open: true })
    const opened: string[] = []
    const host = mount(() => createComponent(Show, { get when() { return state.open }, get children() {
      return entry === "create"
        ? createComponent(CreateWorkflowDialog, { ...api, initial: "blank", onClose() {}, onCreated: (id) => opened.push(id) })
        : createComponent(WorkflowLibrary, { ...api, route: { page: "library", kind: "workflow", tab: "list", create: false }, profile: "Test", close() {}, go: (path) => opened.push(path) })
    } }))
    if (entry === "create") submit(host)
    if (entry === "clone") {
      host.querySelector<HTMLButtonElement>('[data-document="template"] button[aria-haspopup="menu"]')!.click()
      ;[...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((button) => button.textContent?.includes("Duplicate"))!.click()
    }
    await until(() => api.requests.length === 1)
    setState("open", false)
    response.resolve(Response.json({ location: { directory: "/repo" }, data: doc("saved") }))
    await until(() => api.source.list().some((document) => document.id === "saved"))
    expect(opened).toEqual([])
  })
}

test("final fixes: pending publish locks dismissal and late ACK preserves newer cache and deleted lifetime", async () => {
  const response = Promise.withResolvers<Response>()
  const api = setup(async () => response.promise)
  const closed: boolean[] = []
  const draft = openDraft(api.source, doc(), "workflow")!
  const host = mount(() => createComponent(PublishDialog, {
    source: api.source, document: doc(), flow: flowFromDocument(doc(), "workflow"), active: draft.active,
    onClose: () => closed.push(true),
  }))
  submit(host)
  await until(() => api.requests.length === 1)
  expect(host.querySelector<HTMLButtonElement>('button[aria-label="Close"]')?.disabled).toBe(true)
  host.querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))
  expect(closed).toEqual([])
  const known = doc("template", { name: "Known v2", versionId: "v2", versionCounter: 2 })
  api.queryClient.setQueryData(api.key("documents"), [known])
  response.resolve(Response.json({ location: { directory: "/repo" }, data: doc("template", { activeVersionId: "v1" }) }))
  await until(() => closed.length === 1)
  expect(api.source.list()[0].name).toBe("Known v2")
  draft.discard()
  draft.release()
})
