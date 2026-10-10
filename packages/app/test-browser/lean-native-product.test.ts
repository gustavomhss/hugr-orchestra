import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import http from "node:http"
import { mkdtemp, mkdir, realpath, rm, symlink } from "node:fs/promises"
import { createRequire } from "node:module"
import { createHash } from "node:crypto"
import type { Config, Message, Part, Session, ToolPart } from "@orchestra/sdk/v2/client"
import type { LeanDashboard } from "@orchestra/schema/lean-dashboard"

// Adapted from orchestra/test/lean-package.test.ts at 66172f566642a3f66580b001082aba4448e75946
// (repository MIT): Node-only artifact, observed whole output, real HTTP config and Solid consumers.
const orchestra = path.resolve(import.meta.dir, "../../orchestra")
function child(cmd: string[], env = process.env, cwd = orchestra) {
  const proc = Bun.spawn(cmd, { cwd, env, stdout: "pipe", stderr: "pipe", timeout: 600000, killSignal: "SIGKILL" })
  const result = Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
  return { proc, async finish(stopping = false) {
    const [stdout, stderr, code] = await result
    if (proc.signalCode === "SIGKILL" || (code !== 0 && !(stopping && (proc.signalCode === "SIGTERM" || code === 143))))
      throw new Error(`${cmd.join(" ")} exited ${code}/${proc.signalCode}\n${stdout}\n${stderr}`)
    return stdout + stderr
  } }
}
type Resource = { label: string; close: () => unknown | Promise<unknown>; expire?: () => void }
async function cleanup(resources: Resource[], errors: unknown[]) {
  for (const resource of resources.reverse()) {
    const deadline = Promise.withResolvers<never>()
    const timer = setTimeout(() => {
      deadline.reject(new Error(`${resource.label} cleanup timed out after 10000 ms`))
      try { resource.expire?.() } catch (error) { errors.push(error) }
    }, 10000)
    const closing = Promise.resolve().then(resource.close).catch((error) => { errors.push(error) })
    try { await Promise.race([closing, deadline.promise]) }
    catch (error) { errors.push(error) }
    finally { clearTimeout(timer) }
  }
}

if (process.env.LEAN_NATIVE_PRODUCT_DOM !== "1") {
  test("production Node native Lean HTTP persistence reaches real Solid consumers", async () => {
    console.log(await child([process.execPath, "--conditions=browser", "test", "--preload", "./happydom.ts", import.meta.path],
      { ...process.env, LEAN_NATIVE_PRODUCT_DOM: "1" }, path.resolve(import.meta.dir, "..")).finish())
  }, 600000)
  test("combined Schema/Core/Orchestra/app/session-ui/ui types in CI", async () => {
    for (const pkg of ["schema", "core", "orchestra", "app", "session-ui", "ui"])
      console.log(`${pkg}: ${await child([process.execPath, "typecheck"], process.env, path.resolve(orchestra, "..", pkg)).finish()}`)
  }, 600000)
  test("native product proof file typechecks through standard app script in CI", async () => {
    const errors: unknown[] = []
    const resources: Resource[] = []
    try {
      const dir = await mkdtemp(path.join(os.tmpdir(), "lean-proof-types-"))
      resources.push({ label: "typecheck scratch", close: () => rm(dir, { recursive: true, force: true }) })
      const app = path.resolve(import.meta.dir, "..")
      const config = path.join(dir, "tsconfig.json")
      await Bun.write(config, JSON.stringify({ extends: path.join(app, "tsconfig.json"),
        compilerOptions: { composite: false, declaration: false, emitDeclarationOnly: false, noEmit: true, rootDir: path.resolve(app, "../.."), tsBuildInfoFile: path.join(dir, "types.tsbuildinfo") },
         include: [path.join(app, "src"), path.join(app, "package.json"), import.meta.path, path.join(import.meta.dir, "lean-native-product.test-helper.ts"), path.join(import.meta.dir, "lean-project-metrics.test-helper.ts")],
      }))
      console.log(await child([process.execPath, "typecheck", config], process.env, app).finish())
    } catch (error) { errors.push(error) }
    await cleanup(resources, errors)
    if (errors.length) throw new AggregateError(errors, "Proof typecheck primary and cleanup errors")
  }, 600000)
} else {
   const { createComponent, createRoot, createStore, render } = await import("./lean-project-metrics.test-helper")
  Bun.plugin({ name: "lean-native-product-assets", setup(build) {
    build.onLoad({ filter: /\?(worker&)?url$/ }, (args) => ({ contents: `export default ${JSON.stringify(args.path)}`, loader: "js" }))
  } })
   const { createLeanController } = await import("@/orchestra/chapters/lean-controller")
   const { LeanProfileView } = await import("@/orchestra/chapters/lean-view")
   const { LeanDashboard } = await import("@orchestra/schema/lean-dashboard")
   const { Schema } = await import("effect")
   const { verifyProfileRows } = await import("./lean-native-product.test-helper")
  const { LanguageProvider, useLanguage } = await import("@/context/language")
  const { PlatformProvider } = await import("@/context/platform")
  const { PART_MAPPING, ToolRegistry } = await import("../../session-ui/src/components/message-part")
  const { DataProvider } = await import("../../session-ui/src/context/data")
  const { LeanMetrics } = await import("@orchestra/schema/lean-metrics")

  test("real Node Go30: durable owners/bytes/estimates, shell DOM, replay, privacy and persisted disable", async () => {
    if (!process.env.CI && !process.env.GITHUB_RUN_ID) throw new Error("Package builds require CI")
    const errors: unknown[] = []
    const disposers: (() => void)[] = []
    const resources: Resource[] = []
    try {
      const buildEnv = { ...process.env, MODELS_DEV_API_JSON: path.join(orchestra, "test/tool/fixtures/models-api.json"), ORCHESTRA_CHANNEL: "dev", ORCHESTRA_VERSION: "1.18.27" }
      console.log(await child(["bun", "run", "script/build-node.ts"], buildEnv).finish())
      const artifact = path.join(orchestra, "dist/node/node.js")
      await mkdir(path.join(orchestra, "dist/node/node_modules/@lydell"), { recursive: true })
      const pty = createRequire(path.join(orchestra, "../core/package.json")).resolve("@lydell/node-pty/package.json")
      await symlink(path.dirname(pty), path.join(orchestra, "dist/node/node_modules/@lydell/node-pty"), "junction")
      const manifest = await Bun.file(path.join(orchestra, "dist/node/licenses/hugr-lean/manifest.json")).json()
       const archive = new Uint8Array(await Bun.file(path.join(orchestra, "../core/vendor/hugr-lean-0.2.0-native-465fb4c04773.tgz")).arrayBuffer())
       const digest = createHash("sha256").update(archive).digest("hex")
       expect(digest).toBe("369206cd0a468904d7896c3e729535911e9258a7d4a3e9c8eedb078b6a096ec1")
       expect(manifest).toMatchObject({ version: "0.2.0", commit: "465fb4c04773f1a40733c9f4c334b980e3195646", sha256: digest })
       const files = await new Bun.Archive(archive).files()
       for (const material of manifest.materials) {
         const original = new Uint8Array(await files.get(`package/${material.path}`)!.arrayBuffer())
         const copied = new Uint8Array(await Bun.file(path.join(orchestra, "dist/node/licenses/hugr-lean", material.path)).arrayBuffer())
         expect(copied).toEqual(original)
         expect(createHash("sha256").update(original).digest("hex")).toBe(material.sha256)
       }
      console.log(`Node artifact sha256=${createHash("sha256").update(new Uint8Array(await Bun.file(artifact).arrayBuffer())).digest("hex")} Lean=${JSON.stringify(manifest)}`)
      const scratch = await mkdtemp(path.join(os.tmpdir(), "lean-native-product-"))
      resources.push({ label: "native scratch", close: () => rm(scratch, { recursive: true, force: true }) })
      const home = await realpath(scratch)
      const project = path.join(home, "project")
      const configFile = path.join(home, "config/orchestra/orchestra.json")
      const observer = path.join(home, "observe.mjs")
      const ready = path.join(home, "ready")
      const hits: { messages: { role: string; tool_call_id?: string; content: string }[] }[] = []
      const turn = { callID: "call_enabled" }
      const provider = http.createServer(async (req, res) => { try {
        if (!req.url?.endsWith("/chat/completions")) { res.writeHead(400); res.end("unexpected provider route"); return }
        expect(req.headers.authorization).toBe("Bearer synthetic-key")
        const bytes: Buffer[] = []
        for await (const chunk of req) bytes.push(Buffer.from(chunk))
        const body = JSON.parse(Buffer.concat(bytes).toString("utf8"))
        hits.push(body)
        const complete = body.messages.some((message: { role: string; tool_call_id?: string }) => message.role === "tool" && message.tool_call_id === turn.callID)
        const delta = complete ? { content: "done" } : { tool_calls: [{ index: 0, id: turn.callID, type: "function", function: {
          name: "bash", arguments: JSON.stringify({ command: "go test -v .", workdir: project, timeout: 120000 }),
        } }] }
        const chunks = [{ role: "assistant", ...delta }, {}].map((delta, index) => `data: ${JSON.stringify({ id: "completion", object: "chat.completion.chunk", created: 1,
          model: "test-model", choices: [{ index: 0, delta, finish_reason: index ? (complete ? "stop" : "tool_calls") : null }] })}\n\n`)
        res.writeHead(200, { "content-type": "text/event-stream" })
        res.end(chunks.join("") + "data: [DONE]\n\n")
      } catch (error) { errors.push(error); res.destroy(error instanceof Error ? error : new Error(String(error))) } })
      resources.push({ label: "loopback provider", close: () => !provider.listening ? undefined
        : new Promise<void>((resolve, reject) => provider.close((error) => error ? reject(error) : resolve())),
        expire: () => provider.closeAllConnections() })
      await new Promise<void>((resolve, reject) => { provider.once("error", reject); provider.listen(0, "127.0.0.1", resolve) })
      const address = provider.address()
      if (!address || typeof address === "string") throw new Error("Missing loopback provider port")
      await mkdir(project, { recursive: true })
      await mkdir(path.dirname(configFile), { recursive: true })
      await mkdir(path.join(home, "tmp"))
      await Bun.write(path.join(project, "go.mod"), "module example.test\n\ngo 1.20\n")
      await Bun.write(path.join(project, "native_test.go"), `package example\nimport "testing"\n${Array.from({ length: 30 }, (_, i) => `func TestCase${i}(t *testing.T) {}`).join("\n")}\n`)
      // Read-only observation before production projection: preserves original output and capture mapping.
      await Bun.write(observer, `import { writeFile } from "node:fs/promises";
export default async () => ({ "tool.execute.after": async (input, output) => {
  if (input.tool === "bash") await writeFile(${JSON.stringify(home)} + "/" + input.callID + ".json", JSON.stringify({ output: output.output, metadata: output.metadata }));
} });`)
      await Bun.write(configFile, JSON.stringify({ model: "test/test-model", autoupdate: false, plugin: [observer],
        tool_output: { max_lines: 2000, max_bytes: 50000, lean: { enabled: true } },
        provider: { test: { id: "test", name: "Test", env: [], npm: "@ai-sdk/openai-compatible", options: { apiKey: "synthetic-key", baseURL: `http://127.0.0.1:${address.port}/v1` },
          models: { "test-model": { id: "test-model", name: "Test", tool_call: true, limit: { context: 100000, output: 10000 }, cost: { input: 0, output: 0 } } } } } }))
      const env = { PATH: process.env.PATH!, HOME: home, USERPROFILE: home, ORCHESTRA_TEST_HOME: home,
        XDG_DATA_HOME: path.join(home, "data"), XDG_CACHE_HOME: path.join(home, "cache"), XDG_CONFIG_HOME: path.join(home, "config"), XDG_STATE_HOME: path.join(home, "state"),
        ORCHESTRA_TEST_MANAGED_CONFIG_DIR: path.join(home, "managed"), ORCHESTRA_DB: path.join(home, "proof.sqlite"), ORCHESTRA_INHERIT_CREDENTIALS: "0",
        ORCHESTRA_DISABLE_DEFAULT_PLUGINS: "true", ORCHESTRA_DISABLE_MODELS_FETCH: "true", ORCHESTRA_DISABLE_AUTOUPDATE: "true", ORCHESTRA_DISABLE_EXTERNAL_SKILLS: "true", ORCHESTRA_DISABLE_CLAUDE_CODE: "true",
        ORCHESTRA_EXPERIMENTAL_DISABLE_FILEWATCHER: "true", ORCHESTRA_DISABLE_LSP_DOWNLOAD: "true", GOTOOLCHAIN: "local", GOPROXY: "off", GOSUMDB: "off", CGO_ENABLED: "0",
        GOCACHE: path.join(home, "go-cache"), GOPATH: path.join(home, "go"), TMPDIR: path.join(home, "tmp"), TMP: path.join(home, "tmp"), TEMP: path.join(home, "tmp"),
        ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}), ...(process.env.PATHEXT ? { PATHEXT: process.env.PATHEXT } : {}) }
      const server = child(["node", path.join(orchestra, "test/fixture/lean-package/node.mjs"), artifact, ready], env, project)
      resources.push({ label: "Node server", close: async () => {
        try { if (server.proc.exitCode === null) server.proc.kill("SIGTERM") } catch (error) { errors.push(error) }
        await server.finish(true)
      }, expire: () => { if (server.proc.exitCode === null) server.proc.kill("SIGKILL") } })
      const deadline = Date.now() + 120000
      while (!(await Bun.file(ready).exists())) {
        if (server.proc.exitCode !== null) { await server.finish(); throw new Error("Server exited before readiness") }
        if (Date.now() >= deadline) throw new Error("Packaged server readiness timed out")
        await Bun.sleep(100)
      }
      const base = await Bun.file(ready).text()
       async function request<T>(route: string, method = "GET", body?: unknown, directory = project): Promise<T> {
        // Native HTTP avoids HappyDOM's synthetic-origin fetch policy; endpoint remains real loopback.
        const response = await new Promise<{ status: number; text: string }>((resolve, reject) => {
           const req = http.request(new URL(`${route}?directory=${encodeURIComponent(directory)}`, base), { method,
            headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(120000) }, (res) => {
            const chunks: string[] = []
            res.setEncoding("utf8")
            res.on("data", (chunk) => chunks.push(chunk))
            res.on("error", reject)
            res.on("end", () => resolve({ status: res.statusCode!, text: chunks.join("") }))
          })
          req.on("error", reject)
          req.end(body === undefined ? undefined : JSON.stringify(body))
        })
        if (response.status < 200 || response.status >= 300) throw new Error(`${method} ${route}: ${response.status} ${response.text}`)
        return JSON.parse(response.text)
      }
      const admitted = await request<Session>("session", "POST", { title: "Native product proof", permission: [{ permission: "*", pattern: "*", action: "allow" }] })
      type Saved = { info: Message; parts: Part[] }[]
      async function execute(callID: string) {
        turn.callID = callID
        await request(`session/${admitted.id}/message`, "POST", { agent: "maestro", model: { providerID: "test", modelID: "test-model" }, parts: [{ type: "text", text: "Run native tests once." }] })
        const messages = await request<Saved>(`session/${admitted.id}/message`)
        const tools = messages.flatMap((message) => message.parts).filter((part): part is ToolPart => part.type === "tool" && part.callID === callID)
        expect(tools).toHaveLength(1)
        const tool = tools[0]!
        if (tool.state.status !== "completed") throw new Error(`Packaged tool failed: ${JSON.stringify(tool.state)}`)
        expect(tool.state.input.command).toBe("go test -v .")
        expect(tool.state.metadata.exit).toBe(0)
        expect(tool.state.metadata.truncated).toBe(false)
        const next = hits.flatMap((hit) => hit.messages).filter((message) => message.role === "tool" && message.tool_call_id === callID)
        expect(next).toHaveLength(1)
        expect(Buffer.from(next[0]!.content)).toEqual(Buffer.from(tool.state.output))
        const upstream: { output: string; metadata: { output: string } } = await Bun.file(path.join(home, `${callID}.json`)).json()
        for (let i = 0; i < 30; i++) expect(upstream.output).toContain(`=== RUN   TestCase${i}\n`)
        // Persistence assertion: production must attach a Decision to the actual saved ToolPart.
        const metric = LeanMetrics.decode(tool.state.metadata.lean)
        expect(metric).toBeDefined()
        if (!metric) throw new Error("Missing persisted Lean Decision")
        const session = await request<Session>(`session/${admitted.id}`)
        expect(session.directory).toBe(project)
        expect(metric.owner).toEqual({ projectID: session.projectID, location: session.directory, sessionID: session.id, callID })
        expect(metric.model).toEqual({ provider: "test", id: "test-model" })
        expect(metric.producer).toBe("native-shell")
        expect(metric.eligible).toBe(true)
        expect(metric.bytes).toEqual({ before: Buffer.byteLength(upstream.output), after: Buffer.byteLength(tool.state.output), saved: Buffer.byteLength(upstream.output) - Buffer.byteLength(tool.state.output) })
        expect(metric.tokens).toEqual({ kind: "estimated", counter: "chars-per-token-4", before: Math.round(upstream.output.length / 4), after: Math.round(tool.state.output.length / 4), saved: Math.round(upstream.output.length / 4) - Math.round(tool.state.output.length / 4) })
        return { messages, tool: { ...tool, state: tool.state }, metric, session, upstream }
      }
      const enabled = await execute("call_enabled")
      expect(enabled.metric.status).toBe("applied")
      expect(enabled.metric.filterProfile).toBe("go-test-verbose")
      expect(enabled.tool.state.output).not.toContain("=== RUN")
      expect(enabled.tool.state.output).toContain("PASS\n")
      expect(enabled.metric.bytes.saved).toBeGreaterThan(0)
       const [data, setData] = createStore(structuredClone({ session: [enabled.session],
        message: { [admitted.id]: enabled.messages.map((message) => message.info) },
        part: Object.fromEntries(enabled.messages.map((message) => [message.info.id, message.parts])),
        session_status: {}, session_diff: {}, current: enabled.tool }))
       const patches: LeanDashboard.Update[] = []
       const decodeInfo = Schema.decodeUnknownSync(LeanDashboard.Info, { onExcessProperty: "error" })
       const decodeHistory = Schema.decodeUnknownSync(LeanDashboard.History, { onExcessProperty: "error" })
       const transport = (directory: string, route = "project/lean"): LeanDashboard.Transport => ({
         read: async () => decodeInfo(await request(route, "GET", undefined, directory)),
         update: async (value) => { patches.push(value); return decodeInfo(await request("project/lean", "PATCH", value, directory)) },
         history: async (itemID) => decodeHistory(await request(`project/lean/history/${itemID}`, "GET", undefined, directory)),
       })
       const owned = createRoot((dispose) => ({ dispose, lean: createLeanController((error) => ({
         message: String(error), unavailable: String(error).includes("404"),
       })) }))
       disposers.push(owned.dispose, owned.lean.dispose)
       const controller = owned.lean
       const select = (directory: string, route?: string) => controller.select({ server: base, directory, transport: transport(directory, route) })
      const host = document.createElement("div")
      document.body.appendChild(host)
      disposers.push(() => host.remove())
      expect(ToolRegistry.render("bash")).toBeDefined()
      disposers.push(render(() => createComponent(PlatformProvider, {
        value: { platform: "web", openExternal() {}, async restart() {}, async notify() {} },
        get children() { return createComponent(LanguageProvider, { locale: "en", get children() {
          useLanguage().setLocale("en")
           return [createComponent(LeanProfileView, { get data() { return controller.state.data }, profileName: "Native selected profile",
             get loading() { return controller.state.loading }, get error() { return controller.state.error },
             get pending() { return controller.state.pending }, get history() { return controller.state.history },
             get historyLoading() { return controller.state.historyLoading }, get historyError() { return controller.state.historyError },
             onUpdate: controller.update, onRefresh: controller.refresh, onHistory: controller.history, onOpenSession() {} }),
            createComponent(DataProvider, { data, directory: enabled.session.directory, get children() {
              return createComponent(PART_MAPPING.tool!, { get part() { return data.current },
                message: enabled.messages.find((message) => message.info.id === enabled.tool.messageID)!.info, defaultOpen: true, deferToolContent: false })
            } })]
        } }) },
      }), host))
      await Bun.sleep(20)
       const row = (id = "go") => host.querySelector(`[data-lean-item="${id}"]`)!
       const input = () => row().querySelector<HTMLButtonElement>('[role="switch"]')!
       const unavailable = () => { expect(controller.state.data).toBeUndefined(); expect(host.querySelector('[role="switch"]')).toBeNull() }
      // Missing GET and real rejected missing-endpoint GET cannot turn bootstrap defaults into permission to write.
      unavailable()
       await controller.update({ itemID: "go", enabled: false })
      expect(patches).toHaveLength(0)
       await select(project, "project/lean-not-found")
       expect(controller.state.error).toContain("GET project/lean-not-found: 404")
      unavailable()
       await controller.update({ itemID: "go", enabled: false })
      expect(patches).toHaveLength(0)
      expect((await Bun.file(configFile).json()).tool_output.lean.enabled).toBe(true)
       await select(project)
       expect(controller.state.error).toBeUndefined()
       const first = controller.state.data!
       expect(first.scope).toMatchObject({ projectID: enabled.session.projectID, directory: project })
       const savings = { bytesSaved: enabled.metric.bytes.saved, tokensSaved: enabled.metric.tokens.kind === "estimated" ? enabled.metric.tokens.saved : null, calls: 1, tokenCalls: 1 }
       expect(first.savings).toEqual(savings)
       await verifyProfileRows(first.scope, enabled.tool, enabled.metric)
      const toolPanel = () => host.querySelector('[data-component="lean-tool-metrics"]')
      const body = () => host.querySelector('[data-component="bash-output"] code')?.textContent
      const fmt = (n: number) => n.toLocaleString("en-US")
      expect(body()).toBe(`$ go test -v .\n\n${enabled.tool.state.output}`)
       expect(toolPanel()).toBeNull()
       const pairs = () => {
         expect(host.querySelectorAll("[data-lean-item]")).toHaveLength(32)
         for (const item of controller.state.data!.items) {
           expect(row(item.id).querySelector('[data-lean-value="bytes"]')?.getAttribute("title")).toBe(`Exact UTF-8 bytes: ${item.savings.bytesSaved ? "+" : ""}${fmt(item.savings.bytesSaved!)}`)
           expect(row(item.id).querySelector('[data-lean-value="tokens"]')?.textContent).toBe(`${item.savings.tokensSaved ? "+" : ""}${fmt(item.savings.tokensSaved!)}`)
         }
       }
       pairs()
      // Replay the actual fetched durable ToolPart; summary deduplicates identity, never increments.
      const replay = await request<Saved>(`session/${admitted.id}/message`)
       expect(replay.flatMap((message) => message.parts).find((part) => part.id === enabled.tool.id)).toEqual(enabled.tool)
       await controller.refresh()
       expect(controller.state.data!.savings).toEqual(savings)
       expect(input().getAttribute("aria-checked")).toBe("true")
      input()!.click()
      const configDeadline = Date.now() + 30000
       while (controller.state.pending.size || controller.state.loading) {
        if (Date.now() >= configDeadline) throw new Error("Config PATCH did not settle")
        await Bun.sleep(20)
      }
       expect(controller.state.error).toBeUndefined()
       expect(controller.state.data!.enabled).toBe(true)
       expect(input().getAttribute("aria-checked")).toBe("false")
       expect(patches).toEqual([{ itemID: "go", enabled: false }])
       expect(controller.state.data!.savings).toEqual(savings)
       const preference = await Bun.file(path.join(home, "data/orchestra/lean/profiles", `${first.scope.profileID}.json`)).json()
       expect(preference.items.go).toBe(false)
       for (const config of [await request<Config>("global/config"), await Bun.file(configFile).json()])
         expect(config.tool_output).toEqual({ max_lines: 2000, max_bytes: 50000, lean: { enabled: true } })
      const disabled = await execute("call_disabled")
      expect(disabled.metric.status).toBe("passthrough")
       expect(disabled.metric.reason).toBe("item_disabled")
       expect(disabled.metric.bytes.saved).toBe(0)
       expect(disabled.metric.tokens).toMatchObject({ kind: "estimated", saved: 0 })
      expect(Buffer.from(disabled.tool.state.output)).toEqual(Buffer.from(disabled.upstream.output))
      expect(disabled.tool.state.output.match(/=== RUN/g)).toHaveLength(30)
      setData("message", admitted.id, disabled.messages.map((message) => message.info))
      setData("part", Object.fromEntries(disabled.messages.map((message) => [message.info.id, message.parts])))
      setData("current", disabled.tool)
       await controller.refresh()
       expect(controller.state.data!.savings).toEqual({ ...savings, calls: 2, tokenCalls: 2 })
       pairs()
       row().querySelector<HTMLButtonElement>("button")!.click()
       const historyDeadline = Date.now() + 30000
       while (controller.state.historyLoading) {
         if (Date.now() >= historyDeadline) throw new Error("History GET did not settle")
         await Bun.sleep(20)
       }
       const history = controller.state.history!
       expect(history.scope).toEqual(first.scope)
       expect(history.executions).toHaveLength(2)
       for (const run of [enabled, disabled]) {
         expect(history.executions.find((entry) => entry.callID === run.tool.callID)).toMatchObject({
           sessionID: admitted.id, messageID: run.tool.messageID, partID: run.tool.id, command: run.tool.state.input.command,
           commandTruncated: false, status: "completed", exit: 0, bytesSaved: run.metric.bytes.saved,
           tokensSaved: run.metric.tokens.kind === "estimated" ? run.metric.tokens.saved : null,
         })
       }
       expect([...host.querySelectorAll("[data-lean-execution] code")].map((code) => code.textContent)).toEqual(["go test -v .", "go test -v ."])
       const other = path.join(home, "profile-b")
       await mkdir(other)
       await select(other)
       expect(controller.state.data!.scope.projectID).toBe(first.scope.projectID)
       expect(controller.state.data!.scope.profileID).not.toBe(first.scope.profileID)
       expect(controller.state.data!.savings).toEqual({ bytesSaved: 0, tokensSaved: 0, calls: 0, tokenCalls: 0 })
       expect(input().getAttribute("aria-checked")).toBe("true")
       expect(controller.state.history).toBeUndefined()
       expect(host.querySelector("[data-lean-execution]")).toBeNull()
       pairs()
       await controller.update({ itemID: "cargo", enabled: false })
       await select(project)
       expect(controller.state.data!.scope).toEqual(first.scope)
       expect(controller.state.data!.savings).toEqual({ ...savings, calls: 2, tokenCalls: 2 })
       expect(input().getAttribute("aria-checked")).toBe("false")
       expect(row("cargo").querySelector('[role="switch"]')?.getAttribute("aria-checked")).toBe("true")
       expect(controller.state.history).toBeUndefined()
       expect(host.querySelector("[data-lean-execution]")).toBeNull()
       pairs()
      expect(body()).toBe(`$ go test -v .\n\n${disabled.tool.state.output}`)
       expect(toolPanel()).toBeNull()
       console.log(`native calls=2 Go cases=30/call profile A/B/A rows=32 privacy controls=10 foreign owners=4 replay=1 unavailable=2 bytes=${JSON.stringify(enabled.metric.bytes)} tokens=${JSON.stringify(enabled.metric.tokens)}`)
    } catch (error) { errors.push(error) }
    for (const dispose of disposers.reverse()) { try { dispose() } catch (error) { errors.push(error) } }
    await cleanup(resources, errors)
    if (errors.length) throw new AggregateError(errors, "Native product primary and cleanup errors")
  }, 600000)
}
