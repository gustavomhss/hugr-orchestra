import { expect, test } from "bun:test"
import { createRequire } from "node:module"
import { createComponent } from "solid-js"
import { render } from "solid-js/web"
import { QueryClient } from "@tanstack/solid-query"
import { flowFromDocument, issues } from "@/orchestra/relay/graph"
import type { RelaySource } from "@/orchestra/relay/source"

// Drive production JSX with the app's Solid compiler, not Bun's React transform.
const solid = createRequire(Bun.resolveSync("vite-plugin-solid", import.meta.dir))
Bun.plugin({
  name: "solid-relay-policy",
  setup(build) {
    build.onLoad({ filter: /\.tsx$/ }, async (args) => {
      const result = await solid("@babel/core").transformAsync(await Bun.file(args.path).text(), {
        filename: args.path,
        presets: [[solid("babel-preset-solid"), { generate: "dom" }]],
        parserOpts: { plugins: ["jsx", "typescript"] }, configFile: false, babelrc: false,
      })
      return { contents: result.code, loader: "ts" }
    })
  },
})
const { PlatformProvider } = await import("@/context/platform")
const { createSdkForServer } = await import("@/utils/server")
const { createRelayClient, decodeDocument } = await import("@/orchestra/relay/client")
const { createRunClient, decodeRun } = await import("@/orchestra/relay/runs")
const { LanguageProvider } = await import("@/context/language")
const { EditorHead } = await import("@/orchestra/relay/editor-head")
const { Receipt } = await import("@/orchestra/relay/receipt")

test("Relay UI cannot POST start, release or check; authoring and recorded GETs survive", async () => {
  const requests: Request[] = []
  const directory = "/repo"
  const server = { url: "http://localhost:4096" }
  const doc = decodeDocument({
    id: "d", name: "Workflow", nodes: [], connections: {}, tags: [], meta: {}, isArchived: false, active: false,
    activeVersionId: "v1", activeVersion: null, versionId: "v1", versionCounter: 1, checksum: "c",
    createdAt: "2026-10-07T00:00:00Z", updatedAt: "2026-10-07T00:00:00Z", runnable: true,
  })
  const run = decodeRun({ runID: "r1", documentID: "d", status: "parked", steps: [], failing: ["shell", "judge"] })[0]
  const fetcher = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init)
    requests.push(request)
    const path = new URL(request.url).pathname
    return Response.json({ location: { directory }, data: path.endsWith("/audit")
      ? { status: "pass", rows: [{ label: "Recorded", value: "hash" }] }
      : path.endsWith("/ledger") ? [] : path.includes("/run") ? run : doc })
  }, { preconnect: fetch.preconnect })
  const client = createRelayClient({ sdk: createSdkForServer({ server, directory, fetch: fetcher }), directory })
  const runClient = createRunClient({ server, directory, fetch: fetcher })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const source = { client, runClient, queryClient: () => queryClient, key: (...parts: string[]) => parts,
    invalidate: () => undefined } as RelaySource
  const flow = flowFromDocument(doc, "workflow")
  const host = document.createElement("div")
  document.body.append(host)
  const dispose = render(() => createComponent(PlatformProvider, {
    value: { platform: "web", openExternal() {}, restart: async () => {}, notify: async () => {} },
    get children() { return createComponent(LanguageProvider, { locale: "en", get children() { return [
      createComponent(EditorHead, {
        kind: "workflow", document: doc, name: doc.name, tab: "editor", runCount: 1,
        save: { state: "saved", dirty: false, error: "" }, issues: [], canPublish: true, menu: [],
        go() {}, onIssue() {}, onTest() {}, onInstall() {}, onReload() {},
        onRename: (name) => void client.save(doc, { name }), onPublish: () => void client.publish(doc),
      }),
      createComponent(Receipt, { run, document: doc, flow, source, onOpenStep() {}, onCanvas() {}, onSession() {} }),
    ] } }) },
  }), host)
  try {
    await new Promise((resolve) => setTimeout(resolve, 100))
    const buttons = () => [...host.querySelectorAll<HTMLButtonElement>("button")]
    const start = buttons().find((button) => button.textContent === "Run")!
    expect(start).toBeDefined()
    expect(start.disabled).toBe(true)
    start.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    // Also drive a restored legacy release form: absence alone cannot hide a live callback.
    const reason = host.querySelector("textarea")
    if (reason) {
      reason.value = "Fixed"
      reason.dispatchEvent(new Event("input", { bubbles: true }))
    }
    buttons().filter((button) => /Release|Refresh recorded audit/.test(button.textContent ?? "")).forEach((button) => button.click())
    const name = host.querySelector<HTMLInputElement>(".wf-name")!
    name.value = "Renamed"
    name.dispatchEvent(new Event("change", { bubbles: true }))
    buttons().find((button) => button.textContent === "Publish")!.click()
    const before = requests.length
    expect(issues(flow).some((issue) => issue.code === "no-steps")).toBe(true)
    expect(requests.length).toBe(before)
    await runClient.run("r1")
    await runClient.ledger("r1")
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(requests.map((request) => [request.method, new URL(request.url).pathname])).toContainEqual(["PATCH", "/api/relay/document/d"])
    expect(requests.map((request) => [request.method, new URL(request.url).pathname])).toContainEqual(["POST", "/api/relay/document/d/publish"])
    expect(requests.filter((request) => new URL(request.url).pathname.includes("/run")).map((request) => request.method)).toEqual(["GET", "GET", "GET", "GET"])
    expect(requests.filter((request) => request.method === "POST").map((request) => new URL(request.url).pathname)).toEqual(["/api/relay/document/d/publish"])
    expect(host.textContent).toContain("Recorded")
  } finally {
    dispose()
    queryClient.clear()
    host.remove()
  }
})
