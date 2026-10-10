import { afterAll, beforeAll, expect, test } from "bun:test"
import path from "node:path"
import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises"
import os from "node:os"
import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import ts from "typescript"
import { leanPin } from "../script/lean-notices"

const dir = path.resolve(import.meta.dirname, "..")
const scratch = await mkdtemp(path.join(os.tmpdir(), "lean-package-"))
const binary = path.join(dir, `dist/orchestra-${process.platform === "win32" ? "windows" : process.platform}-${process.arch}/bin/orchestra${process.platform === "win32" ? ".exe" : ""}`)
const node = path.join(dir, "dist/node/node.js")
const buildEnv = { ...process.env, MODELS_DEV_API_JSON: path.join(dir, "test/tool/fixtures/models-api.json"), ORCHESTRA_CHANNEL: "dev", ORCHESTRA_VERSION: "1.18.27" }
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")

function child(cmd: string[], env: Record<string, string | undefined>, cwd = dir) {
  const proc = Bun.spawn(cmd, { cwd, env, stdout: "pipe", stderr: "pipe", timeout: 240000, killSignal: "SIGKILL" })
  const output = Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
  return { proc, async finish(stopping = false) {
    const [stdout, stderr, code] = await output
    if (proc.signalCode === "SIGKILL" || (code !== 0 && !(stopping && (proc.signalCode === "SIGTERM" || code === 143))))
      throw new Error(`${cmd.join(" ")} exited ${code}/${proc.signalCode}\n${stdout}\n${stderr}`)
    return stdout
  } }
}

beforeAll(async () => {
  if (!process.env.CI && !process.env.GITHUB_RUN_ID) throw new Error("Package builds require CI")
  await child(["bun", "run", "script/build.ts", "--single", "--skip-install", "--skip-embed-web-ui", "--sourcemaps"], buildEnv).finish()
  await child(["bun", "run", "script/build-node.ts"], buildEnv).finish()
  // The production Node builder declares this native dependency external; supply the normal installed package.
  await mkdir(path.join(dir, "dist/node/node_modules/@lydell"), { recursive: true })
  const pty = createRequire(path.join(dir, "../core/package.json")).resolve("@lydell/node-pty/package.json")
  await symlink(path.dirname(pty), path.join(dir, "dist/node/node_modules/@lydell/node-pty"), "junction")
  await mkdir(path.join(scratch, "archive"))
  const tar = process.platform === "win32" ? path.join(process.env.SystemRoot!, "System32/tar.exe") : "tar"
  await child([tar, "-xzf", `../core/vendor/${leanPin.artifact}`, "-C", path.join(scratch, "archive")], buildEnv).finish()
}, 600000)
afterAll(() => rm(scratch, { recursive: true, force: true }))

test("orchestra package typecheck in CI", async () => {
  await child(["bun", "typecheck"], buildEnv).finish()
}, 240000)

test("actual Node and Bun artifacts retain exact pinned notices", async () => {
  const archive = new Uint8Array(await Bun.file(path.join(dir, "../core/vendor", leanPin.artifact)).arrayBuffer())
  expect(digest(archive)).toBe("369206cd0a468904d7896c3e729535911e9258a7d4a3e9c8eedb078b6a096ec1")
  const core = path.resolve(dir, "../core")
  expect((await Bun.file(path.join(core, "package.json")).json()).dependencies["hugr-lean"]).toBe(`file:./vendor/${leanPin.artifact}`)
  const installed = path.resolve(path.dirname(Bun.resolveSync("hugr-lean/core", core)), "../..")
  for (const file of ["package.json", "dist/core/index.js", "dist/core/profile-selection.js", "dist/core/command.js", "dist/profiles/index.js"]) {
    expect(new Uint8Array(await Bun.file(path.join(installed, file)).arrayBuffer()))
      .toEqual(new Uint8Array(await Bun.file(path.join(scratch, "archive/package", file)).arrayBuffer()))
  }
  const names = [...(await new Bun.Archive(archive).files()).keys()]
    .filter((file) => file === "package/LICENSE" || file === "package/NOTICE" || file.startsWith("package/licenses/") || file.endsWith("/SOURCES.md"))
    .map((file) => file.slice("package/".length)).sort()
  expect(names).toContain("LICENSE")
  expect(names).toContain("NOTICE")
  expect(names).toContain("licenses/TRS-MIT.txt")
  expect(names).toContain("fixtures/profiles/playwright/SOURCES.md")
  for (const root of [path.dirname(node), path.dirname(path.dirname(binary))]) {
    const manifest = await Bun.file(path.join(root, "licenses/hugr-lean/manifest.json")).json()
    expect(manifest).toMatchObject({ name: "hugr-lean", version: "0.2.0", commit: "465fb4c04773f1a40733c9f4c334b980e3195646", tree: "c3a77068a1b72d57ba39ca1b1aa145e0b6e506d7", sha256: digest(archive), integrity: `sha512-${createHash("sha512").update(archive).digest("base64")}` })
    expect(manifest.materials.map((entry: { path: string }) => entry.path)).toEqual(names)
    for (const file of names) {
      const original = new Uint8Array(await Bun.file(path.join(scratch, "archive/package", file)).arrayBuffer())
      const shipped = new Uint8Array(await Bun.file(path.join(root, "licenses/hugr-lean", file)).arrayBuffer())
      expect(shipped).toEqual(original)
      expect(manifest.materials.find((entry: { path: string }) => entry.path === file)?.sha256).toBe(digest(original))
      console.log(`notice ${path.basename(root)} ${file} ${digest(shipped)}`)
    }
  }
})

test("production Node bundle has no source TypeScript imports; Bun CLI version smoke", async () => {
  const imports = (text: string) => {
    const found: string[] = []
    const visit = (node: ts.Node) => {
      const spec = ts.isImportDeclaration(node) || ts.isExportDeclaration(node) ? node.moduleSpecifier
        : ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === "require") ? node.arguments[0] : undefined
      if (spec && ts.isStringLiteralLike(spec) && (/\.tsx?$/.test(spec.text) || /^(?:@orchestra\/|hugr-lean)/.test(spec.text))) found.push(spec.text)
      ts.forEachChild(node, visit)
    }
    visit(ts.createSourceFile("artifact.js", text, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS))
    return found
  }
  expect(imports('import("../../core/src/tool.ts"); export { x } from "./counterfeit.t\\u0073"; require("@orchestra/core")')).toHaveLength(3)
  const files = await Array.fromAsync(new Bun.Glob("**/*.js").scan({ cwd: path.dirname(node) }))
  expect(files).toContain("node.js")
  for (const file of files) expect(imports(await Bun.file(path.join(path.dirname(node), file)).text())).toEqual([])
  expect((await child([binary, "--version"], buildEnv).finish()).trim()).toBe("1.18.27")
})

for (const runtime of ["node", "bun"] as const) for (const mode of ["enabled", "disabled", "failure"] as const) {
  test(`packaged ${runtime} native Go ${mode}: next provider text equals durable tool text`, async () => {
    const home = path.join(scratch, `${runtime}-${mode}`)
    const project = path.join(home, "project")
    await mkdir(project, { recursive: true })
    const baseline = path.join(home, "upstream.json")
    const observer = path.join(home, "observe.mjs")
    if (mode === "failure") await Bun.write(observer, `import { writeFile } from "node:fs/promises";
export default async () => ({ "tool.execute.after": async (input, output) => {
  if (input.tool === "bash") await writeFile(${JSON.stringify(baseline)}, JSON.stringify({ callID: input.callID, raw: output.metadata.output, exit: output.metadata.exit, output: output.output }));
} });`)
    const hits: { messages: { role: string; tool_call_id?: string; content: string }[] }[] = []
    const callID = `call_${runtime}_${mode}`
    const provider = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req) {
      if (!new URL(req.url).pathname.endsWith("/chat/completions")) return new Response("unexpected provider route", { status: 400 })
      expect(req.headers.get("authorization")).toBe("Bearer synthetic-key")
      const body = await req.json()
      hits.push(body)
      const complete = body.messages.some((message: { role: string }) => message.role === "tool")
      const delta = complete ? { content: "done" } : { tool_calls: [{ index: 0, id: callID, type: "function", function: { name: "bash", arguments: JSON.stringify({ command: "go test -v .", workdir: project, timeout: 120000 }) } }] }
      const chunks = [{ role: "assistant", ...delta }, {}].map((delta, index) => `data: ${JSON.stringify({ id: "completion", object: "chat.completion.chunk", created: 1, model: "test-model", choices: [{ index: 0, delta, finish_reason: index ? (complete ? "stop" : "tool_calls") : null }] })}\n\n`)
      return new Response(chunks.join("") + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } })
    } })
    const errors: unknown[] = []
    let server: ReturnType<typeof child> | undefined
    try {
      const env: Record<string, string> = { PATH: process.env.PATH!, HOME: home, USERPROFILE: home, ORCHESTRA_TEST_HOME: home,
        XDG_DATA_HOME: path.join(home, "data"), XDG_CACHE_HOME: path.join(home, "cache"), XDG_CONFIG_HOME: path.join(home, "config"), XDG_STATE_HOME: path.join(home, "state"),
        ORCHESTRA_TEST_MANAGED_CONFIG_DIR: path.join(home, "managed"), ORCHESTRA_DB: path.join(home, "proof.sqlite"), ORCHESTRA_INHERIT_CREDENTIALS: "0",
        ORCHESTRA_DISABLE_DEFAULT_PLUGINS: "true", ORCHESTRA_DISABLE_MODELS_FETCH: "true", ORCHESTRA_DISABLE_AUTOUPDATE: "true", ORCHESTRA_DISABLE_EXTERNAL_SKILLS: "true", ORCHESTRA_DISABLE_CLAUDE_CODE: "true",
        ORCHESTRA_EXPERIMENTAL_DISABLE_FILEWATCHER: "true", ORCHESTRA_DISABLE_LSP_DOWNLOAD: "true", GOTOOLCHAIN: "local", GOPROXY: "off", GOSUMDB: "off", CGO_ENABLED: "0",
        GOCACHE: path.join(home, "go-cache"), GOPATH: path.join(home, "go"), TMPDIR: path.join(home, "tmp"), TMP: path.join(home, "tmp"), TEMP: path.join(home, "tmp"),
        ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
        ...(process.env.PATHEXT ? { PATHEXT: process.env.PATHEXT } : {}),
        ORCHESTRA_CONFIG_CONTENT: JSON.stringify({ model: "test/test-model", autoupdate: false, tool_output: { lean: { enabled: mode !== "disabled" } }, ...(mode === "failure" ? { plugin: [observer] } : {}),
          provider: { test: { id: "test", name: "Test", env: [], npm: "@ai-sdk/openai-compatible", options: { apiKey: "synthetic-key", baseURL: provider.url.href + "v1" },
            models: { "test-model": { id: "test-model", name: "Test", tool_call: true, limit: { context: 100000, output: 10000 }, cost: { input: 0, output: 0 } } } } } }) }
      await mkdir(path.join(home, "tmp"))
      await Bun.write(path.join(project, "go.mod"), "module example.test\n\ngo 1.20\n")
      await Bun.write(path.join(project, "native_test.go"), `package example\nimport "testing"\n${Array.from({ length: 30 }, (_, i) => `func TestCase${i}(t *testing.T) { ${mode === "failure" && i === 0 ? 't.Fatal("FAILURE MUST_KEEP")' : ""} }`).join("\n")}\n`)
      const ready = path.join(home, "ready")
      const reservation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() })
      const url = reservation.url.href
      const port = reservation.port!
      await reservation.stop(true)
      server = child(runtime === "node" ? ["node", path.join(dir, "test/fixture/lean-package/node.mjs"), node, ready] : [binary, "serve", "--hostname", "127.0.0.1", "--port", String(port)], env, project)
      const deadline = Date.now() + 120000
      const request = async (route: string, body?: unknown) => {
        const base = runtime === "node" ? await Bun.file(ready).text() : url
        const response = await fetch(new URL(`${route}?directory=${encodeURIComponent(project)}`, base), { method: body ? "POST" : "GET", headers: { "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(120000) })
        const text = await response.text()
        if (!response.ok) throw new Error(`${route}: ${response.status} ${text}`)
        return JSON.parse(text)
      }
      while (true) {
        if (server.proc.exitCode !== null) { await server.finish(); throw new Error("Server exited before readiness") }
        const available = runtime === "node" ? await Bun.file(ready).exists() : await fetch(new URL("global/health", url), { signal: AbortSignal.timeout(1000) }).then((r) => r.ok, () => false)
        if (available) break
        if (Date.now() >= deadline) throw new Error("Packaged server readiness timed out")
        await Bun.sleep(100)
      }
      const session = await request("session", { title: "Packaged Lean", permission: [{ permission: "*", pattern: "*", action: "allow" }] })
      await request(`session/${session.id}/message`, { agent: "maestro", model: { providerID: "test", modelID: "test-model" }, parts: [{ type: "text", text: "Run native tests once." }] })
      const messages = await request(`session/${session.id}/message`)
      const tools = messages.flatMap((message: { parts: { type: string; callID: string; state: { status: string; output: string; input: { command: string }; metadata: { exit: number; truncated: boolean } } }[] }) => message.parts).filter((part: { type: string; callID: string }) => part.type === "tool" && part.callID === callID)
      expect(tools).toHaveLength(1)
      const tool = tools[0]
      if (tool.state.status !== "completed") throw new Error(`Packaged tool failed: ${JSON.stringify(tool.state)}`)
      expect(tool.state.status).toBe("completed")
      expect(tool.state.input.command).toBe("go test -v .")
      expect(tool.state.metadata.exit).toBe(mode === "failure" ? 1 : 0)
      expect(tool.state.metadata.truncated).toBe(false)
      const next = hits.flatMap((hit) => hit.messages).filter((message) => message.role === "tool" && message.tool_call_id === callID)
      expect(next).toHaveLength(1)
      expect(next[0].content).toBe(tool.state.output)
      if (mode === "enabled") {
        expect(tool.state.output).not.toContain("=== RUN")
        expect(tool.state.output).toContain("PASS\n")
        expect(tool.state.output).toMatch(/ok {2}\texample\.test\t/)
      } else {
        for (let i = 0; i < 30; i++) expect(tool.state.output).toContain(`=== RUN   TestCase${i}\n`)
        expect(tool.state.output.match(/=== RUN/g)).toHaveLength(30)
        expect(tool.state.output).toContain(mode === "failure" ? "FAILURE MUST_KEEP" : "PASS\n")
        if (mode === "failure") {
          const upstream = await Bun.file(baseline).json()
          expect(upstream.callID).toBe(callID)
          expect(upstream.exit).toBe(1)
          expect(upstream.raw.length).toBeLessThanOrEqual(30000)
          expect(upstream.raw.startsWith("=== RUN   TestCase0\n")).toBe(true)
          const expected = `<shell_metadata>\nexit code: 1\n</shell_metadata>\n\n${upstream.raw}`
          expect(upstream.output).toBe(expected)
          expect(Buffer.from(tool.state.output)).toEqual(Buffer.from(expected))
        }
      }
    } catch (error) { errors.push(error) }
    if (server && server.proc.exitCode === null) server.proc.kill("SIGTERM")
    if (server) await server.finish(true).catch((error) => errors.push(error))
    await provider.stop(true).catch((error) => errors.push(error))
    if (errors.length) throw new AggregateError(errors, `Packaged ${runtime}/${mode} primary and cleanup errors`)
  }, 300000)
}
