import { expect, mock, test } from "bun:test"
import { createServer } from "node:http"
import path from "node:path"
import { Process } from "../../../apps/orchestra/src/util/process"
import { Omni } from "../../core/src/omni"
import { expectSpawn } from "../../core/test/fixture/omni-expect"
import type { LeanDashboard } from "@orchestra/schema/lean-dashboard"
import type { ServerConnection } from "@/context/server"
import type { NormalizedProviderListResponse } from "@orchestra/session-ui/context"

async function child(args: string[], env = process.env) {
  const before = Omni.snapshot()
  const result = await Process.run([process.execPath, ...args], {
    cwd: path.resolve(import.meta.dir, ".."), env, nothrow: true, deadline: 180000,
  })
  const output = result.stdout.toString() + result.stderr.toString()
  expect(result.code, output).toBe(0)
  expect(output).toMatch(/\b[1-9]\d* pass\b/)
  expect(output).not.toMatch(/\b[1-9]\d* skip\b/)
  expect(Omni.snapshot().spawns).toBeGreaterThan(before.spawns)
  expect(Omni.snapshot().delegations).toBe(before.delegations)
  console.log(output)
}

if (process.env.LEAN_CHAPTER_DOM !== "1") {
  test("actual Lean chapter route/default entry in isolated browser lane", async () => {
    expectSpawn(import.meta.path)
    await child(["--conditions=browser", "test", "--preload", "./happydom.ts", import.meta.path], {
      ...process.env, LEAN_CHAPTER_DOM: "1",
    })
  }, 240000)
} else {
  const { createComponent, createStore, render } = await import("./lean-dom.test-helper")
  const { MemoryRouter, Route, createMemoryHistory } = await import("@solidjs/router")
  const { solidDom } = await import("./solid-dom")
  const { Orchestra } = await import("@orchestra/client")
  const { ServerConnection }: typeof import("@/context/server") = await import(solidDom("@/context/server", import.meta.dir))
  const { ServerScope }: typeof import("@/utils/server-scope") = await import(solidDom("@/utils/server-scope", import.meta.dir))
  const { PlatformProvider }: typeof import("@/context/platform") = await import(solidDom("@/context/platform", import.meta.dir))
  const { LanguageProvider }: typeof import("@/context/language") = await import(solidDom("@/context/language", import.meta.dir))
  const { navigation }: typeof import("@/orchestra/navigation") = await import(solidDom("@/orchestra/navigation", import.meta.dir))

  const snapshot = (directory: string, bytes: number, enabled = true): LeanDashboard.Info => ({
    scope: { directory, profileID: directory, projectID: "same-git-project" }, engine: "http-fixture",
    enabled, coverage: "saved-profile-history", complete: true,
    savings: { bytesSaved: bytes, tokensSaved: bytes / 4, calls: 1, tokenCalls: 1 },
    items: (["cargo", "pytest", "go"] as const).map((id) => ({ id, enabled: true,
      savings: { bytesSaved: bytes, tokensSaved: bytes / 4, calls: 1, tokenCalls: 1 } })),
  })
  type Event = { name: string; details: { type: string } }
  async function nativeServer(bytes: number, name: string, supported = true) {
    const data = new Map<string, LeanDashboard.Info>()
    const provider: NormalizedProviderListResponse = { all: new Map(), connected: [], default: {} }
    const catalogs = new Map<string, { directory: string; provider_ready: boolean; provider: typeof provider }>()
    const requests: { method: string; directory: string; path: string; body?: LeanDashboard.Update }[] = []
    const listeners = new Set<(event: Event) => void>()
    const gates = { read: undefined as Promise<void> | undefined, write: undefined as Promise<void> | undefined,
      history: undefined as Promise<void> | undefined }
    const server = createServer(async (request, response) => {
      response.setHeader("access-control-allow-origin", "*")
      response.setHeader("access-control-allow-headers", "authorization,content-type,x-orchestra-directory")
      response.setHeader("access-control-allow-methods", "GET,PATCH,OPTIONS")
      if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return }
      const url = new URL(request.url!, "http://fixture")
      const directory = url.searchParams.get("location[directory]")!
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const body: LeanDashboard.Update | undefined = request.method === "PATCH" ? JSON.parse(Buffer.concat(chunks).toString()) : undefined
      requests.push({ method: request.method!, directory, path: url.pathname, body })
      // A server without the Lean routes answers an undeclared 404, which the chapter reads as unsupported.
      if (!supported) { response.writeHead(404, { "content-type": "application/json" }); response.end("{}"); return }
      if (directory === "/one") await (body ? gates.write : url.pathname.includes("history") ? gates.history : gates.read)
      const saved = data.get(directory) ?? snapshot(directory, bytes)
      const updated = !body ? saved : body.itemID
        ? { ...saved, items: saved.items.map((item) => item.id === body.itemID ? { ...item, enabled: body.enabled } : item) }
        : { ...saved, enabled: body.enabled }
      data.set(directory, updated)
      const history: LeanDashboard.History = { scope: updated.scope, itemID: "cargo", complete: true, executions: [{
        sessionID: "saved-session", messageID: "message", partID: "part", callID: "call", itemID: "cargo",
        command: `cargo test --manifest-path '${directory}/Cargo.toml'`, commandTruncated: false, status: "completed",
        exit: 0, time: 123, bytesSaved: bytes, tokensSaved: bytes / 4,
      }] }
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify({ location: { directory, project: { id: "same-git-project", directory } },
        data: url.pathname.includes("history") ? history : updated }))
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("No native fixture HTTP port")
    const connection: ServerConnection.Any = { type: "http", http: { url: `http://127.0.0.1:${address.port}` } }
    const scope = ServerScope.fromServerKey(ServerConnection.key(connection))
    return {
      connection, data, requests, gates, listeners, catalogs,
      projects: { list: () => [{ id: "same-git-project", name, worktree: "/one", sandboxes: ["/two"] }] },
      sync: { data: { provider }, child: (directory: string) => {
        const catalog = catalogs.get(directory) ?? { directory, provider_ready: true, provider }
        catalogs.set(directory, catalog)
        return [catalog] as const
      } },
      sdk: { scope, orchestra: Orchestra.make({ baseUrl: connection.http.url }),
        ensureDirSdkContext: (directory: string) => ({ scope, directory }),
        event: { listen: (listener: (event: Event) => void) => { listeners.add(listener); return () => { listeners.delete(listener) } } },
      },
      close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
    }
  }

  test("registered native chapter remounts same-project directories and servers; late history/input and preferences cannot mix", async () => {
    const one = await nativeServer(800, "Native named profile")
    const two = await nativeServer(4000, "Remote named profile")
    const unsupported = await nativeServer(0, "Unsupported", false)
    const servers = [one, two, unsupported]
    const [selection, select] = createStore({ server: ServerConnection.key(one.connection), directory: "/one" })
    const opened: { server: ServerConnection.Key; sessionId: string }[] = []
    // Native context fixtures only; real route, SDKProvider, generated client, controller and U view execute. Fixtures
    // replace the solidDom() copies (./solid-dom) that the rendered route imports.
    mock.module(solidDom("../src/context/global", import.meta.dir), () => ({ useGlobal: () => ({
      servers: { list: () => servers.map((server) => server.connection) },
      ensureServerCtx: (connection: ServerConnection.Any) => servers.find((server) => server.connection === connection)!,
    }) }))
    mock.module(solidDom("../src/context/layout", import.meta.dir), () => ({ useLayout: () => ({ ready: () => true, home: { selection: () => selection } }) }))
    mock.module(solidDom("../src/context/server", import.meta.dir), () => ({ ServerConnection, useServer: () => ({
      get current() { return servers.find((server) => ServerConnection.key(server.connection) === selection.server)?.connection },
    }) }))
    mock.module(solidDom("../src/context/tabs", import.meta.dir), () => ({ useTabs: () => ({ addSessionTab: (value: typeof opened[number]) => value,
      select: (value: typeof opened[number]) => opened.push(value) }) }))
    // The real SDK/Sync providers capture each route owner; Lean reads go through the selected fixture's Orchestra client.
    const { ServerSDKProvider }: typeof import("@/context/server-sdk") = await import(
      solidDom("@/context/server-sdk", import.meta.dir)
    )
    const { OrchestraChapterRoute, chapterPages }: typeof import("@/orchestra/chapter-route") = await import(
      solidDom("@/orchestra/chapter-route", import.meta.dir)
    )
    expect(typeof chapterPages.lean).toBe("function")
    expect(navigation.filter((item) => item.id === "lean")).toHaveLength(1)
    const host = document.createElement("div")
    document.body.append(host)
    const history = createMemoryHistory()
    history.set({ value: "/orchestra/lean", scroll: false, replace: true })
    const dispose = render(() => createComponent(PlatformProvider, {
      value: { platform: "web", openExternal() {}, async restart() {}, async notify() {} }, get children() {
        return createComponent(LanguageProvider, { locale: "en", get children() {
          return createComponent(ServerSDKProvider, {
            server: () => servers.find((server) => ServerConnection.key(server.connection) === selection.server)!.connection,
            get children() {
              return createComponent(MemoryRouter, { history, get children() {
                return createComponent(Route, { path: "/orchestra/:chapter", component: OrchestraChapterRoute })
              } })
            },
          })
        } })
      },
    }), host)
    const until = async (check: () => boolean) => {
      for (let n = 0; n < 200 && !check(); n++) await Bun.sleep(10)
      if (!check()) throw new Error(`Route expectation not reached: ${host.textContent}`)
    }
    const total = () => host.querySelector('[data-lean-total="bytes"]')?.textContent
    const toggle = (id: string) => host.querySelector<HTMLButtonElement>(`[data-lean-item="${id}"] [role="switch"]`)!
    const open = () => host.querySelector<HTMLButtonElement>("#lean-trigger-cargo")!.click()
    const late = Promise.withResolvers<void>()
    try {
      await until(() => total() === "+800")
      expect(host.querySelector('[data-mx-page="orchestra-lean"]') !== null).toBe(true)
      expect(host.textContent).toContain("Native named profile")
      toggle("cargo").click()
      await until(() => toggle("cargo").getAttribute("aria-checked") === "false" && !toggle("cargo").disabled)
      expect(toggle("pytest").getAttribute("aria-checked")).toBe("true")
      expect(total()).toBe("+800")
      open()
      await until(() => !!host.querySelector("[data-lean-execution]"))
      expect(host.querySelector(".lean-detail code")?.textContent).toBe("cargo test --manifest-path '/one/Cargo.toml'")
      host.querySelector<HTMLButtonElement>(".lean-detail [data-lean-execution] button")!.click()
      expect(opened).toEqual([{ server: selection.server, sessionId: "saved-session" }])
      one.gates.history = late.promise; one.gates.read = late.promise; one.gates.write = late.promise
      open(); open()
      toggle("pytest").click()
      host.querySelector<HTMLButtonElement>(".lean-caption button")!.click()
      const search = host.querySelector<HTMLInputElement>('input[type="search"]')!
      search.value = "cargo"; search.dispatchEvent(new Event("input", { bubbles: true }))
      await until(() => one.requests.some((request) => request.body?.itemID === "pytest"))
      select("directory", "/two")
      await until(() => total() === "+800" && !!toggle("pytest"))
      expect(host.querySelector<HTMLInputElement>('input[type="search"]')?.value).toBe("")
      expect(host.querySelector(".lean-detail")).toBeNull()
      expect(toggle("cargo").getAttribute("aria-checked")).toBe("true")
      late.resolve(); await Bun.sleep(30)
      expect(host.querySelector(".lean-detail")).toBeNull()
      expect(host.querySelector('[role="alert"]')).toBeNull()
      select("server", ServerConnection.key(two.connection))
      await until(() => total() === "+3.91 KiB")
      expect(host.textContent).toContain("Remote named profile")
      two.data.set("/two", snapshot("/two", 4800, false))
      two.listeners.forEach((listener) => listener({ name: "/two", details: { type: "config.updated" } }))
      await until(() => total() === "+4.69 KiB")
      expect(host.textContent).toContain("Lean is off for this profile")
      two.data.set("/two", snapshot("/two", 5200))
      host.querySelector<HTMLButtonElement>(".lean-caption button")!.click()
      await until(() => total() === "+5.08 KiB")
      select("directory", "/fallback-name")
      await until(() => host.textContent!.includes("Orchestra profile · fallback-name"))
      select("server", ServerConnection.key(unsupported.connection))
      await until(() => total() === "Unavailable")
      // The empty state says Lean is unavailable; no error banner repeats it.
      expect(host.querySelector('[role="alert"]')).toBeNull()
      expect(host.querySelector('[role="switch"]')).toBeNull()
      expect(unsupported.requests.map((request) => [request.method, request.path, request.directory])).toEqual([
        ["GET", "/api/lean", "/fallback-name"],
      ])
      expect(one.listeners.size).toBe(0)
      expect(two.listeners.size).toBe(0)
      expect([...one.catalogs.keys()]).toEqual(["/one", "/two"])
      expect([...two.catalogs.keys()]).toEqual(["/two", "/fallback-name"])
      expect([...unsupported.catalogs.keys()]).toEqual(["/fallback-name"])
    } finally {
      late.resolve()
      dispose(); host.remove()
      await Promise.all(servers.map((server) => server.close()))
      mock.restore()
    }
  }, 30000)
}
