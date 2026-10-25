import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import http from "node:http"
import { mkdtemp, mkdir, realpath, rm } from "node:fs/promises"
import { createHash } from "node:crypto"
import { Effect, Option, Stream } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { Orchestra } from "@orchestra/client"
import type { LeanDashboard } from "@orchestra/schema/lean-dashboard"
import { LayerNode } from "../../core/src/effect/layer-node"
import { AppProcess } from "../../core/src/process"
import { expectSpawn } from "../../core/test/fixture/omni-expect"

// The V2 CLI product end to end: apps/cli/script/build.ts builds the real binary, `serve` runs it with a password, a
// loopback provider drives two bash turns (`go test -v .`) through the real session API, and the Lean dashboard route
// reports what Lean saved. The Solid consumers then render that same server in a browser-conditioned child. The bundled
// hugr-lean notices are checked against the pinned vendor archive. Replaces the V1 Node-artifact proof.
const cli = path.resolve(import.meta.dir, "../../../apps/cli")
const password = "lean-native-product-password"
const authorization = `Basic ${Buffer.from(`orchestra:${password}`).toString("base64")}`

if (process.env.LEAN_NATIVE_PRODUCT_URL === undefined) {
  test("production V2 CLI Lean persistence reaches the dashboard route and real Solid consumers", async () => {
    expectSpawn(import.meta.path)
    if (!process.env.CI && !process.env.GITHUB_RUN_ID) throw new Error("Package builds require CI")
    if (!Bun.which("go")) throw new Error("The Lean native proof needs a Go toolchain")
    await Effect.runPromise(Effect.scoped(proof()).pipe(Effect.provide(LayerNode.compile(AppProcess.node))))
  }, 900_000)
} else {
  await import("./lean-native-product.dom")
}

function proof() {
  return Effect.gen(function* () {
    const app = yield* AppProcess.Service
    const run = (command: string, args: string[], cwd: string, env: Record<string, string>) =>
      app.run(ChildProcess.make(command, args, { cwd, env, extendEnv: false }), { timeout: 600_000 })

    // 1. Build the shipped CLI for this host, without the install step or the compile evidence.
    const built = yield* run(process.execPath, ["script/build.ts", "--single", "--skip-install", "--no-compile-evidence"], cli, {
      ...(process.env as Record<string, string>),
      ORCHESTRA_CHANNEL: "dev",
    })
    expect(built.exitCode, built.stdout.toString() + built.stderr.toString()).toBe(0)
    const targets = (yield* Effect.promise(() => Array.fromAsync(new Bun.Glob("cli-*").scan({ cwd: path.join(cli, "dist"), onlyFiles: false }))))
    expect(targets).toHaveLength(1)
    const bin = path.join(cli, "dist", targets[0]!, "bin")
    const binary = path.join(bin, process.platform === "win32" ? "orchestra.exe" : "orchestra")

    // 2. The bundled hugr-lean notices equal the pinned archive's materials, byte for byte.
    const archive = new Uint8Array(yield* Effect.promise(() => Bun.file(path.join(cli, "../../packages/core/vendor/hugr-lean-0.4.0-0660c2b5dc92.tgz")).arrayBuffer()))
    const digest = createHash("sha256").update(archive).digest("hex")
    expect(digest).toBe("5ff983c58aa056d82059d5edd5b428478dda50a7683a201b7d844949aa1712a3")
    const manifest = yield* Effect.promise(() => Bun.file(path.join(bin, "licenses/hugr-lean/manifest.json")).json())
    expect(manifest).toMatchObject({ version: "0.4.0", commit: "0660c2b5dc9249816330603160aadfaeb33e5fc7", sha256: digest })
    const files = yield* Effect.promise(() => new Bun.Archive(archive).files())
    const paths = manifest.materials.map((material: { path: string }) => material.path)
    expect(paths).toContain("LICENSE")
    expect(paths).toContain("NOTICE")
    for (const material of manifest.materials) {
      const original = new Uint8Array(yield* Effect.promise(() => files.get(`package/${material.path}`)!.arrayBuffer()))
      const copied = new Uint8Array(yield* Effect.promise(() => Bun.file(path.join(bin, "licenses/hugr-lean", material.path)).arrayBuffer()))
      expect(copied).toEqual(original)
      expect(createHash("sha256").update(original).digest("hex")).toBe(material.sha256)
    }

    // 3. A loopback provider that asks for `go test -v .` once per turn and records what the model received.
    const scratch = yield* Effect.acquireRelease(
      Effect.promise(async () => realpath(await mkdtemp(path.join(os.tmpdir(), "lean-native-product-")))),
      (dir) => Effect.promise(() => rm(dir, { recursive: true, force: true })),
    )
    const project = path.join(scratch, "project")
    const hits: { messages: { role: string; tool_call_id?: string; content: string }[] }[] = []
    const turn = { callID: "call_enabled" }
    const provider = http.createServer(async (req, res) => {
      const bytes: Buffer[] = []
      for await (const chunk of req) bytes.push(Buffer.from(chunk))
      if (!req.url?.endsWith("/chat/completions")) return void res.writeHead(400).end("unexpected provider route")
      const body = JSON.parse(Buffer.concat(bytes).toString("utf8"))
      hits.push(body)
      const complete = body.messages.some((message: { role: string; tool_call_id?: string }) => message.role === "tool" && message.tool_call_id === turn.callID)
      const delta = complete ? { content: "done" } : { tool_calls: [{ index: 0, id: turn.callID, type: "function", function: {
        name: "bash", arguments: JSON.stringify({ command: "go test -v .", workdir: project, timeout: 120000 }),
      } }] }
      res.writeHead(200, { "content-type": "text/event-stream" })
      res.end([{ role: "assistant", ...delta }, {}].map((delta, index) => `data: ${JSON.stringify({ id: "completion", object: "chat.completion.chunk", created: 1,
        model: "test-model", choices: [{ index: 0, delta, finish_reason: index ? (complete ? "stop" : "tool_calls") : null }] })}\n\n`).join("") + "data: [DONE]\n\n")
    })
    yield* Effect.acquireRelease(
      Effect.promise(() => new Promise<void>((resolve) => provider.listen(0, "127.0.0.1", resolve))),
      () => Effect.promise(() => new Promise<void>((resolve) => { provider.closeAllConnections(); provider.close(() => resolve()) })),
    )
    const address = provider.address()
    if (!address || typeof address === "string") throw new Error("Missing loopback provider port")
    yield* Effect.promise(async () => {
      await mkdir(project, { recursive: true })
      await Bun.write(path.join(project, "go.mod"), "module example.test\n\ngo 1.20\n")
      await Bun.write(path.join(project, "native_test.go"), `package example\nimport "testing"\n${Array.from({ length: 30 }, (_, i) => `func TestCase${i}(t *testing.T) {}`).join("\n")}\n`)
      await Bun.write(path.join(project, "orchestra.json"), JSON.stringify({ model: "test/test-model", autoupdate: false,
        permission: { "*": "allow" }, agent: { maestro: { model: "test/test-model", permission: { "*": "allow" } } },
        tool_output: { max_lines: 2000, max_bytes: 50000, lean: { enabled: true } },
        provider: { test: { id: "test", name: "Test", env: [], npm: "@ai-sdk/openai-compatible", options: { apiKey: "synthetic-key", baseURL: `http://127.0.0.1:${address.port}/v1` },
          models: { "test-model": { id: "test-model", name: "Test", tool_call: true, limit: { context: 100000, output: 10000 }, cost: { input: 0, output: 0 } } } } } }))
    })

    // 4. The shipped binary, serving.
    const env: Record<string, string> = { PATH: process.env.PATH!, HOME: scratch, USERPROFILE: scratch, ORCHESTRA_TEST_HOME: scratch,
      XDG_DATA_HOME: path.join(scratch, "data"), XDG_CACHE_HOME: path.join(scratch, "cache"), XDG_CONFIG_HOME: path.join(scratch, "config"), XDG_STATE_HOME: path.join(scratch, "state"),
      ORCHESTRA_SERVER_PASSWORD: password, ORCHESTRA_INHERIT_CREDENTIALS: "0", ORCHESTRA_DISABLE_DEFAULT_PLUGINS: "true", ORCHESTRA_DISABLE_MODELS_FETCH: "true",
      ORCHESTRA_DISABLE_AUTOUPDATE: "true", ORCHESTRA_DISABLE_EXTERNAL_SKILLS: "true", ORCHESTRA_DISABLE_CLAUDE_CODE: "true", ORCHESTRA_EXPERIMENTAL_DISABLE_FILEWATCHER: "true",
      ORCHESTRA_DISABLE_LSP_DOWNLOAD: "true", GOTOOLCHAIN: "local", GOPROXY: "off", GOSUMDB: "off", CGO_ENABLED: "0",
      GOCACHE: path.join(scratch, "go-cache"), GOPATH: path.join(scratch, "go"), TMPDIR: path.join(scratch, "tmp"), TMP: path.join(scratch, "tmp"), TEMP: path.join(scratch, "tmp"),
      ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}), ...(process.env.PATHEXT ? { PATHEXT: process.env.PATHEXT } : {}),
      // omni is on by default; the desktop hands its sidecar these paths, so the proof does too.
      ...Object.fromEntries(["HUGR_OMNI_ADDON", "HUGR_OMNI_SUPERVISOR"].flatMap((key) => process.env[key] ? [[key, process.env[key]!]] : [])) }
    yield* Effect.promise(() => mkdir(env.TMPDIR!, { recursive: true }))
    const server = yield* app.spawn(ChildProcess.make(binary, ["serve", "--port", "0", "--hostname", "127.0.0.1"], { cwd: project, env, extendEnv: false }))
    const listening = yield* server.all.pipe(
      Stream.decodeText, Stream.splitLines,
      Stream.map((line) => line.match(/listening on (http:\/\/\S+)/)?.[1]),
      Stream.filter((url): url is string => url !== undefined),
      Stream.runHead,
      Effect.timeout("120 seconds"),
    )
    const base = Option.getOrThrow(listening)

    const call = async <T>(route: string, method = "GET", body?: unknown, directory = project): Promise<T> => {
      const response = await fetch(new URL(route, base), { method, signal: AbortSignal.timeout(120_000),
        headers: { "content-type": "application/json", authorization, "x-orchestra-directory": encodeURIComponent(directory) },
        body: body === undefined ? undefined : JSON.stringify(body) })
      const text = await response.text()
      if (!response.ok) throw new Error(`${method} ${route}: ${response.status} ${text}`)
      return JSON.parse(text)
    }
    const dashboard = async (directory = project) => (await call<{ data: LeanDashboard.Info }>("/api/lean", "GET", undefined, directory)).data
    const go = async (callID: string) => {
      turn.callID = callID
      const session = (await call<{ data: { id: string } }>("/api/session", "POST", { agent: "maestro", model: { providerID: "test", id: "test-model" } })).data
      await call(`/api/session/${session.id}/prompt`, "POST", { prompt: { text: "Run native tests once." } })
      await call(`/api/session/${session.id}/wait`, "POST")
      const received = hits.flatMap((hit) => hit.messages).filter((message) => message.role === "tool" && message.tool_call_id === callID)
      expect(received).toHaveLength(1)
      return received[0]!.content
    }

    // 5. Lean enabled: the model receives the reduced Go output, and the dashboard counts the call.
    const reduced = yield* Effect.promise(() => go("call_enabled"))
    expect(reduced).not.toContain("=== RUN")
    expect(reduced).toContain("PASS")
    const first = yield* Effect.promise(() => dashboard())
    expect(first.enabled).toBe(true)
    expect(first.scope.directory).toBe(project)
    expect(first.items).toHaveLength(37)
    expect(first.savings.calls).toBe(1)
    expect(first.savings.bytesSaved).toBeGreaterThan(0)
    expect(first.items.find((item) => item.id === "go")!.savings.calls).toBe(1)

    // 6. The Solid consumers render this server and switch the Go item off through the real PATCH.
    const dom = yield* run(process.execPath, ["--conditions=browser", "test", "--preload", "./happydom.ts", import.meta.path], path.resolve(import.meta.dir, ".."), {
      ...(process.env as Record<string, string>), LEAN_NATIVE_PRODUCT_URL: base, LEAN_NATIVE_PRODUCT_PASSWORD: password, LEAN_NATIVE_PRODUCT_DIR: project,
    })
    const domOutput = dom.stdout.toString() + dom.stderr.toString()
    expect(dom.exitCode, domOutput).toBe(0)
    expect(domOutput).toMatch(/\b[1-9]\d* pass\b/)
    expect(domOutput).not.toMatch(/\b[1-9]\d* skip\b/)

    // 7. Lean switched off: the next turn passes the full output through and adds a second call without savings.
    const raw = yield* Effect.promise(() => go("call_disabled"))
    expect(raw.match(/=== RUN/g)).toHaveLength(30)
    const second = yield* Effect.promise(() => dashboard())
    expect(second.items.find((item) => item.id === "go")!.enabled).toBe(false)
    expect(second.savings.calls).toBe(2)
    expect(second.savings.bytesSaved).toBe(first.savings.bytesSaved)
    const preference = yield* Effect.promise(() => Bun.file(path.join(scratch, "data/orchestra/lean/profiles", `${first.scope.profileID}.json`)).json())
    expect(preference.items.go).toBe(false)
    const history = (yield* Effect.promise(() => call<{ data: LeanDashboard.History }>("/api/lean/history/go"))).data
    expect(history.executions).toHaveLength(2)
    expect(history.executions.map((execution) => execution.command)).toEqual(["go test -v .", "go test -v ."])

    // 8. Another directory is another profile: no savings, and the switch is still on.
    const other = path.join(scratch, "profile-b")
    yield* Effect.promise(() => mkdir(other))
    const third = yield* Effect.promise(() => dashboard(other))
    expect(third.scope.projectID).toBe(first.scope.projectID)
    expect(third.scope.profileID).not.toBe(first.scope.profileID)
    expect(third.savings).toEqual({ bytesSaved: 0, tokensSaved: 0, calls: 0, tokenCalls: 0 })
    expect(third.items.find((item) => item.id === "go")!.enabled).toBe(true)
  })
}
