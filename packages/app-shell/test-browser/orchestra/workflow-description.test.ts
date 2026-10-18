import { afterEach, expect, setSystemTime, test } from "bun:test"
import { createComponent, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { render } from "solid-js/web"
import { QueryClient } from "@tanstack/solid-query"
import { MemoryRouter } from "@solidjs/router"
import type { RelayDocument } from "@/orchestra/relay/client"
import type { RelaySource } from "@/orchestra/relay/source"
import { flowFromDocument } from "@/orchestra/relay/graph"
import { solidDom } from "../solid-dom"

// A workflow's description: edited on its Start step, saved with the draft, undone with it, kept locally and carried
// into a copy. The first-party graph is loaded through solidDom() so it compiles with Solid whatever ran before.
const dir = import.meta.dir
const { PlatformProvider }: typeof import("@/context/platform") = await import(solidDom("@/context/platform", dir))
const { LanguageProvider }: typeof import("@/context/language") = await import(solidDom("@/context/language", dir))
const { createSdkForServer }: typeof import("@/utils/server") = await import(solidDom("@/utils/server", dir))
const { createRelayClient, decodeDocument }: typeof import("@/orchestra/relay/client") = await import(
  solidDom("@/orchestra/relay/client", dir)
)
const { WorkflowDetails }: typeof import("@/orchestra/relay/details-workflow") = await import(
  solidDom("@/orchestra/relay/details-workflow", dir)
)
const { openDraft, profileDrafts }: typeof import("@/orchestra/relay/drafts") = await import(
  solidDom("@/orchestra/relay/drafts", dir)
)

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).reverse().forEach((cleanup) => cleanup()))

function mount(view: () => JSX.Element) {
  const host = document.createElement("div")
  document.body.append(host)
  const dispose = render(
    () =>
      createComponent(MemoryRouter, {
        root: () =>
          createComponent(PlatformProvider, {
            value: { platform: "web", openExternal() {}, restart: async () => {}, notify: async () => {} },
            get children() {
              return createComponent(LanguageProvider, {
                locale: "en",
                get children() {
                  return view()
                },
              })
            },
          }),
      }),
    host,
  )
  cleanups.push(() => {
    dispose()
    host.remove()
  })
}

function doc(id = "template", fields: Partial<RelayDocument> = {}) {
  return decodeDocument({
    id,
    name: "Review workflow",
    nodes: [
      { id: "start", name: "Start", type: "relay.startTrigger", position: [0, 0], parameters: {} },
      { id: "review", name: "Review", type: "relay.execute", position: [100, 0], parameters: { instructions: "Review" } },
    ],
    connections: { Start: { main: [[{ node: "Review", type: "main", index: 0 }]] } },
    tags: [],
    meta: { relay: { schema: 1, kind: "workflow" } },
    active: false,
    activeVersionId: null,
    activeVersion: null,
    isArchived: false,
    versionId: "v1",
    versionCounter: 1,
    checksum: "c".repeat(64),
    runnable: true,
    createdAt: "2026-10-07T00:00:00Z",
    updatedAt: "2026-10-07T00:00:00Z",
    ...fields,
  })
}

// Answers a save or a create with the document it was sent, unless `respond` says otherwise.
function setup(respond?: (request: Request) => Promise<Response>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  const key = (...parts: string[]) => ["workflow-description", ...parts]
  queryClient.setQueryData(key("documents"), [doc()])
  cleanups.push(() => queryClient.clear())
  const requests: Request[] = []
  const fetcher = Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request.clone())
      if (respond) return respond(request)
      return Response.json({
        location: { directory: "/repo" },
        data: doc("saved", { ...(await request.json()), tags: [] }),
      })
    },
    { preconnect: fetch.preconnect },
  )
  const client = createRelayClient({
    sdk: createSdkForServer({ server: { url: "http://localhost:4096" }, directory: "/repo", fetch: fetcher }),
    directory: "/repo",
  })
  const source = {
    client,
    queryClient: () => queryClient,
    key,
    list: () => queryClient.getQueryData<RelayDocument[]>(key("documents")) ?? [],
    documents: { isSuccess: true, isPending: false, isError: false },
    invalidate() {},
  } as unknown as RelaySource
  return { source, requests }
}

test("the Start step edits the workflow description and locks it in a read-only view", () => {
  const [state, setState] = createStore({
    flow: flowFromDocument(doc(), "workflow"),
    description: "Reviews code",
    readOnly: false,
  })
  mount(() =>
    createComponent(WorkflowDetails, {
      get flow() {
        return state.flow
      },
      get node() {
        return state.flow.nodes[0]
      },
      run: undefined,
      frozen: undefined,
      issues: [],
      skills: { names: [], error: false, retry() {} },
      get description() {
        return state.description
      },
      save: undefined,
      get readOnly() {
        return state.readOnly
      },
      onChange: (flow) => setState("flow", flow),
      onDescribe: (value) => setState("description", value),
      onNav() {},
      onClose() {},
      onReview() {},
    }),
  )
  const input = document.querySelector<HTMLInputElement>(
    '[data-component="relay-node-details"] input[name="description"]',
  )!
  expect(input.value).toBe("Reviews code")
  input.value = "Reviews code and ships it"
  input.dispatchEvent(new Event("input", { bubbles: true }))
  expect(state.description).toBe("Reviews code and ships it")
  expect(input.closest("fieldset")!.disabled).toBe(false)
  setState("readOnly", true)
  expect(input.closest("fieldset")!.disabled).toBe(true)
})

test("a description is saved with the draft, undone with it and carried into a copy", async () => {
  const api = setup()
  const draft = openDraft(api.source, doc("template", { description: "Reviews code" }), "workflow")!
  setSystemTime(new Date(1_000_000))
  cleanups.push(() => setSystemTime())
  // Typing reports every keystroke; edits within one burst share an undo step.
  ;["Reviews code a", "Reviews code at"].forEach((text) => draft.describe(text))
  await draft.flush()
  expect(await api.requests.at(-1)!.json()).toMatchObject({ description: "Reviews code at", versionId: "v1" })
  draft.undo()
  expect(draft.state.description).toBe("Reviews code")
  expect(draft.canUndo()).toBe(false)
  draft.redo()
  expect(draft.state.description).toBe("Reviews code at")
  await draft.copy("Review copy")
  expect(await api.requests.at(-1)!.json()).toMatchObject({ name: "Review copy", description: "Reviews code at" })
  draft.release()
})

test("a description the server did not accept is kept locally and sent when the draft comes back", async () => {
  cleanups.push(() =>
    Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index) ?? "")
      .filter((name) => name.startsWith("orchestra-relay-draft:"))
      .forEach((name) => localStorage.removeItem(name)),
  )
  const offline = setup(async () => Response.json({ message: "Offline" }, { status: 503 }))
  const draft = openDraft(offline.source, doc(), "workflow")!
  draft.describe("Kept note")
  await draft.flush()
  draft.release()
  window.dispatchEvent(new Event("pagehide"))
  // The next page: a new query client for the same server profile.
  const next = setup()
  const [restored] = profileDrafts(next.source)
  expect(restored.state.description).toBe("Kept note")
  await restored.flush()
  expect(await next.requests.at(-1)!.json()).toMatchObject({ description: "Kept note" })
  expect(profileDrafts(next.source)).toHaveLength(0)
  draft.discard()
})
