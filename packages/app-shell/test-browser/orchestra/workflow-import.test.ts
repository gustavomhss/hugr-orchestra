import { afterEach, expect, test } from "bun:test"
import { createComponent, type JSX } from "solid-js"
import { render } from "solid-js/web"
import { QueryClient } from "@tanstack/solid-query"
import { MemoryRouter } from "@solidjs/router"
import type { RelayDocument } from "@/orchestra/relay/client"
import type { RelaySource } from "@/orchestra/relay/source"
import { solidDom } from "../solid-dom"

// Import reads what Download definition writes: the file round-trips into a new workflow, a pasted copy works the
// same, and a file that is not a workflow definition is refused with a reason and creates nothing.
const dir = import.meta.dir
const { PlatformProvider }: typeof import("@/context/platform") = await import(solidDom("@/context/platform", dir))
const { LanguageProvider }: typeof import("@/context/language") = await import(solidDom("@/context/language", dir))
const { createSdkForServer }: typeof import("@/utils/server") = await import(solidDom("@/utils/server", dir))
const { createRelayClient, decodeDocument }: typeof import("@/orchestra/relay/client") = await import(
  solidDom("@/orchestra/relay/client", dir)
)
const { workflowFile }: typeof import("@/orchestra/relay/import") = await import(solidDom("@/orchestra/relay/import", dir))
const { ImportWorkflowDialog }: typeof import("@/orchestra/relay/import-dialog") = await import(
  solidDom("@/orchestra/relay/import-dialog", dir)
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

function doc(id: string, fields: Partial<RelayDocument> = {}) {
  return decodeDocument({
    id,
    name: "Review workflow",
    description: "Reviews code",
    nodes: [
      { id: "start", name: "Start", type: "relay.startTrigger", position: [0, 0], parameters: { relayBrief: "Ship", relayRetryBudget: 3 } },
      { id: "review", name: "Review", type: "relay.execute", position: [100, 0], parameters: { instructions: "Review" } },
    ],
    connections: { Start: { main: [[{ node: "Review", type: "main", index: 0 }]] } },
    nodeGroups: [{ id: "phase", name: "Phase", nodeIds: ["review"] }],
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

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  const key = (...parts: string[]) => ["workflow-import", ...parts]
  queryClient.setQueryData(key("documents"), [doc("existing")])
  cleanups.push(() => queryClient.clear())
  const requests: Request[] = []
  const fetcher = Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request.clone())
      return Response.json({
        location: { directory: "/repo" },
        data: doc("imported", { ...(await request.json()), tags: [] }),
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
  const opened: string[] = []
  mount(() => createComponent(ImportWorkflowDialog, { source, onClose() {}, onCreated: (id) => opened.push(id) }))
  return { requests, opened }
}

function paste(text: string) {
  const area = document.querySelector<HTMLTextAreaElement>('textarea[name="definition"]')!
  expect(area).not.toBeNull()
  area.value = text
  area.dispatchEvent(new Event("input", { bubbles: true }))
}

const submit = () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
const errors = () => document.querySelector('[data-slot="relay-import-errors"]')?.textContent ?? ""

test("a downloaded definition imports as a new workflow with the same graph and a numbered name", async () => {
  const api = setup()
  const original = doc("original")
  paste(JSON.stringify(workflowFile(original), null, 2))
  expect(errors()).toBe("")
  submit()
  await Bun.sleep(0)
  await Bun.sleep(0)
  const sent = await api.requests.at(-1)!.json()
  expect(sent).toMatchObject({
    // The name is taken by the workflow already in the list, so the import is numbered like a new one.
    name: "Review workflow 2",
    description: "Reviews code",
    nodes: original.nodes,
    connections: original.connections,
    nodeGroups: original.nodeGroups,
    tags: [],
    meta: { relay: { schema: 1, kind: "workflow" } },
  })
  expect(api.opened).toEqual(["imported"])
})

test("a file that is not a workflow definition is refused with a reason and creates nothing", async () => {
  const api = setup()
  paste("not json")
  expect(errors()).toContain("not valid JSON")
  paste(JSON.stringify({ wps: [], macros: [] }))
  expect(errors()).toContain("compiled plan")
  paste(JSON.stringify({ ...workflowFile(doc("original")), nodes: [{ id: "start" }] }))
  expect(errors()).toContain("Step 1")
  paste(JSON.stringify({ ...workflowFile(doc("original")), meta: { relay: { kind: "hook" } } }))
  expect(errors()).toContain("hook")
  paste(
    JSON.stringify({
      ...workflowFile(doc("original")),
      connections: { Start: { main: [[{ node: "Gone", type: "main", index: 0 }]] } },
    }),
  )
  expect(errors()).toContain("not in the file")
  expect(document.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true)
  submit()
  await Bun.sleep(0)
  expect(api.requests).toHaveLength(0)
  expect(api.opened).toEqual([])
})
