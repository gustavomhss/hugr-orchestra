import { expect, mock, test } from "bun:test"
import { createServer } from "node:http"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { LeanDashboard } from "@orchestra/schema/lean-dashboard"
import type { ServerConnection } from "@/context/server"
import type { JSX } from "solid-js"

async function child(args: string[], env = process.env) {
  const process = Bun.spawn([Bun.which("bun")!, ...args], {
    cwd: path.resolve(import.meta.dir, ".."), env, stdout: "pipe", stderr: "pipe", timeout: 180000,
  })
  const [out, err, code] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited])
  if (code !== 0) throw new Error(`${args.join(" ")} exited ${code}\n${out}\n${err}`)
  console.log(out + err)
}

if (process.env.LEAN_CHAPTER_DOM !== "1") {
  test("actual Lean chapter route/default entry in isolated browser lane", async () => {
    await child(["--conditions=browser", "test", "--preload", "./happydom.ts", import.meta.path], {
      ...process.env, LEAN_CHAPTER_DOM: "1",
    })
  }, 240000)
  test("actual app plus route fixture types", async () => {
    const scratch = await mkdtemp(path.join(os.tmpdir(), "lean-route-types-"))
    try {
      const app = path.resolve(import.meta.dir, "..")
      const config = path.join(scratch, "tsconfig.json")
      await Bun.write(config, JSON.stringify({ extends: path.join(app, "tsconfig.json"), compilerOptions: {
        composite: false, declaration: false, emitDeclarationOnly: false, noEmit: true,
        rootDir: path.resolve(app, "../.."), tsBuildInfoFile: path.join(scratch, "types.tsbuildinfo"),
      }, include: [path.join(app, "src"), path.join(app, "package.json"), import.meta.path,
        path.join(import.meta.dir, "lean-project-metrics.test-helper.ts")],
      }))
      await child(["typecheck", config])
    } finally { await rm(scratch, { recursive: true, force: true }) }
  }, 240000)
} else {
  const { createComponent, createStore, render } = await import("./lean-project-metrics.test-helper")
  const { createContext, useContext } = await import("solid-js")
  const { MemoryRouter, Route, createMemoryHistory } = await import("@solidjs/router")
  const { createSdkForServer } = await import("@/utils/server")
  const { ServerConnection } = await import("@/context/server")
  const { ServerScope } = await import("@/utils/server-scope")
  const { PlatformProvider } = await import("@/context/platform")
  const { LanguageProvider } = await import("@/context/language")
  const { navigation } = await import("@/orchestra/navigation")

  const snapshot = (directory: string, bytes: number, enabled = true): LeanDashboard.Info => ({
    scope: { directory, profileID: directory, projectID: "same-git-project" }, engine: "http-fixture",
    enabled, coverage: "saved-profile-history", complete: true,
    savings: { bytesSaved: bytes, tokensSaved: bytes / 4, calls: 1, tokenCalls: 1 },
    items: (["cargo", "pytest", "go"] as const).map((id) => ({ id, enabled: true,
      savings: { bytesSaved: bytes, tokensSaved: bytes / 4, calls: 1, tokenCalls: 1 } })),
  })
  type Event = { name: string; details: { type: string } }
  async function nativeServer(bytes: number, name: string, protocol: "v1" | "v2" = "v1") {
    const data = new Map<string, LeanDashboard.Info>()
    const requests: { method: string; directory: string; path: string; body?: LeanDashboard.Update }[] = []
    const listeners = new Set<(event: Event) => void>()
    const gates = { read: undefined as Promise<void> | undefined, write: undefined as Promise<void> | undefined,
      history: undefined as Promise<void> | undefined }
    const server = createServer(async (request, response) => {
      response.setHeader("access-control-allow-origin", "*")
      response.setHeader("access-control-allow-headers", "content-type,x-orchestra-directory")
      response.setHeader("access-control-allow-methods", "GET,PATCH,OPTIONS")
      if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return }
      const url = new URL(request.url!, "http://fixture")
      const directory = url.searchParams.get("directory")!
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const body: LeanDashboard.Update | undefined = request.method === "PATCH" ? JSON.parse(Buffer.concat(chunks).toString()) : undefined
      requests.push({ method: request.method!, directory, path: url.pathname, body })
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
      response.end(JSON.stringify(url.pathname.includes("history") ? history : updated))
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("No native fixture HTTP port")
    const connection: ServerConnection.Any = { type: "http", http: { url: `http://127.0.0.1:${address.port}` } }
    const scope = ServerScope.fromServerKey(ServerConnection.key(connection))
    return {
      connection, data, requests, gates, listeners,
      projects: { list: () => [{ id: "same-git-project", name, worktree: "/one", sandboxes: ["/two"] }] },
      sdk: { scope, protocol: Promise.resolve(protocol),
        ensureDirSdkContext: (directory: string) => ({ scope, directory, protocol: Promise.resolve(protocol),
          client: createSdkForServer({ server: connection.http, directory, throwOnError: true }) }),
        event: { listen: (listener: (event: Event) => void) => { listeners.add(listener); return () => { listeners.delete(listener) } } },
      },
      close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
    }
  }

  test("registered native chapter remounts same-project directories and servers; late history/input and preferences cannot mix", async () => {
    const one = await nativeServer(800, "Native named profile")
    const two = await nativeServer(4000, "Remote named profile")
    const unsupported = await nativeServer(0, "Unsupported", "v2")
    const servers = [one, two, unsupported]
    const [selection, select] = createStore({ server: ServerConnection.key(one.connection), directory: "/one" })
    const opened: { server: ServerConnection.Key; sessionId: string }[] = []
    const Context = createContext<typeof one.sdk>()
    // Native context fixtures only; real route, SDKProvider, generated client, controller and U view execute.
    mock.module("../src/context/global", () => ({ useGlobal: () => ({
      servers: { list: () => servers.map((server) => server.connection) },
      ensureServerCtx: (connection: ServerConnection.Any) => servers.find((server) => server.connection === connection)!,
    }) }))
    mock.module("../src/context/layout", () => ({ useLayout: () => ({ home: { selection: () => selection } }) }))
    mock.module("../src/context/tabs", () => ({ useTabs: () => ({ addSessionTab: (value: typeof opened[number]) => value,
      select: (value: typeof opened[number]) => opened.push(value) }) }))
    mock.module("../src/context/server-sync", () => ({ ServerSyncProvider: (props: { children?: JSX.Element }) => props.children }))
    mock.module("../src/context/server-sdk", () => ({
      ServerSDKProvider: (props: { server: () => ServerConnection.Any; children?: JSX.Element }) => createComponent(Context.Provider, {
        value: servers.find((server) => server.connection === props.server())!.sdk, get children() { return props.children },
      }),
      useServerSDK: () => { const value = useContext(Context)!; return () => value },
    }))
    const { OrchestraChapterRoute, chapterPages } = await import("@/orchestra/chapter-route")
    expect(typeof chapterPages.lean).toBe("function")
    expect(navigation.filter((item) => item.id === "lean")).toHaveLength(1)
    const host = document.createElement("div")
    document.body.append(host)
    const history = createMemoryHistory()
    history.set({ value: "/orchestra/lean", scroll: false, replace: true })
    const dispose = render(() => createComponent(PlatformProvider, {
      value: { platform: "web", openExternal() {}, async restart() {}, async notify() {} }, get children() {
        return createComponent(LanguageProvider, { locale: "en", get children() {
          return createComponent(MemoryRouter, { history, get children() {
            return createComponent(Route, { path: "/orchestra/:chapter", component: OrchestraChapterRoute })
          } })
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
      await until(() => total() === "+4,000")
      expect(host.textContent).toContain("Remote named profile")
      two.data.set("/two", snapshot("/two", 4800, false))
      two.listeners.forEach((listener) => listener({ name: "/two", details: { type: "config.updated" } }))
      await until(() => total() === "+4,800")
      expect(host.textContent).toContain("Lean is off for this profile")
      two.data.set("/two", snapshot("/two", 5200))
      host.querySelector<HTMLButtonElement>(".lean-caption button")!.click()
      await until(() => total() === "+5,200")
      select("directory", "/fallback-name")
      await until(() => host.textContent!.includes("Orchestra profile · fallback-name"))
      select("server", ServerConnection.key(unsupported.connection))
      await until(() => !!host.querySelector('[role="alert"]'))
      expect(total()).toBe("Unavailable")
      expect(host.querySelector('[role="switch"]')).toBeNull()
      expect(unsupported.requests).toHaveLength(0)
      expect(one.listeners.size).toBe(0)
      expect(two.listeners.size).toBe(0)
    } finally {
      late.resolve()
      dispose(); host.remove()
      await Promise.all(servers.map((server) => server.close()))
      mock.restore()
    }
  }, 30000)
}
