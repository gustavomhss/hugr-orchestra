// V10 natural event-loop boundary. Compiled CLI's explicit process.exit is NOT this proof.
// Node fixture follows script/build-node.ts; src/node.ts has no runtime disposal export.
// This is not the actual Electron desktop app. Only parent watchdog may kill a failed host.
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs"
import path from "node:path"
import { BUN, ORCHESTRA, ROOT, cleanup, client, control, fileTree, identity, inventoryScope, isolated, markerArgument, matches, members, own, prepareCapture, table, until, verdict, type Identity } from "./lib.ts"
import { authorized } from "./delivery-fixtures.ts"
import { WindowsInventory } from "./windows-inventory.ts"

export async function buildHosts() {
  // bun:test's OpenTUI preload installs a build loader; compile in a clean builder like build-node.ts.
  if (!import.meta.main) {
    const builder = Bun.spawn([BUN, path.join(import.meta.dirname, "v10-natural-exit.ts"), "--build"], { cwd: ROOT, stdout: "pipe", stderr: "pipe", timeout: 120_000 })
    const [stdout, stderr, code] = await Promise.all([new Response(builder.stdout).text(), new Response(builder.stderr).text(), builder.exited])
    if (code !== 0) throw new Error(`Natural builder failed (${code}): ${stdout}\n${stderr}`)
    const line = stdout.split("\n").find((line) => line.startsWith("NATURAL_BUILD "))
    if (!line) throw new Error(`Natural builder produced no manifest: ${stdout}\n${stderr}`)
    return JSON.parse(line.slice("NATURAL_BUILD ".length)) as { results: { target: "bun" | "node"; file: string; sha256: string }[]; inputs: Record<string, string>; entrySHA256: string; scope: string; publicEntry: string; home: string }
  }
  const scratch = isolated("natural-build", {})
  const dir = mkdtempSync(path.join(ORCHESTRA, "node_modules", ".omni-natural-exit-"))
  // Desktop supplies these externals. Isolated Bun installs put node-pty at its Core consumer, not Orchestra.
  for (const name of ["@lydell/node-pty", "jsonc-parser"]) {
    const link = path.join(dir, "node_modules", name)
    mkdirSync(path.dirname(link), { recursive: true })
    symlinkSync(packageRoot(Bun.resolveSync(name, path.join(ROOT, name === "jsonc-parser" ? "packages/orchestra" : "packages/core")), name), link, process.platform === "win32" ? "junction" : "dir")
  }
  const entry = path.join(dir, "entry.ts")
  const source = (file: string) => JSON.stringify(path.join(ROOT, file).replaceAll("\\", "/"))
  writeFileSync(entry, `
import { Effect, ManagedRuntime } from "effect"
import path from "node:path"
import { ChildProcess } from "effect/unstable/process"
import { AppRuntime } from ${source("packages/orchestra/src/effect/app-runtime.ts")}
import { Server } from ${source("packages/orchestra/src/server/server.ts")}
import { InstanceStore } from ${source("packages/orchestra/src/project/instance-store.ts")}
import { InstanceRef } from ${source("packages/orchestra/src/effect/instance-ref.ts")}
import { FSUtil } from ${source("packages/core/src/fs-util.ts")}
import { AppProcess } from ${source("packages/core/src/process.ts")}
import { AppNodeBuilderV1 } from ${source("packages/orchestra/src/effect/app-node-builder-v1.ts")}
import { Omni } from ${source("packages/core/src/omni.ts")}
import { LSP } from ${source("packages/orchestra/src/lsp/lsp.ts")}
import { MCP } from ${source("packages/orchestra/src/mcp/index.ts")}
import { naturalHost } from ${source("packages/omni/campaign/natural-host.ts")}

// Retain completed native objects/output through host lifetime. Neither GC nor unref is part of disposal.
const retained = []
const processes = ManagedRuntime.make(AppNodeBuilderV1.build(AppProcess.node))
await naturalHost({
  listen: () => Server.listen({ port: 0, hostname: "127.0.0.1", mdns: false }),
  activate: () => AppRuntime.runPromise(Effect.gen(function* () {
    const store = yield* InstanceStore.Service
    const ctx = yield* store.load({ directory: process.env.NATURAL_PROJECT })
    // Windows TEMP may be an 8.3 alias; InstanceStore canonicalizes the project to its long path.
    const file = path.join(ctx.directory, "natural.ts")
    return yield* Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const lsp = yield* LSP.Service
      const mcp = yield* MCP.Service
      yield* fs.writeFileString(file, "export const natural = 42\\n")
      yield* lsp.touchFile(file)
      const tools = yield* mcp.tools()
      const output = yield* Effect.promise(() => processes.runPromise(Effect.gen(function* () {
        const app = yield* AppProcess.Service
        return yield* app.run(ChildProcess.make(process.env.NATURAL_NODE, ["-e", "process.stdout.write('APP_PROCESS_READY');process.stderr.write('APP_PROCESS_STDERR')"]))
      })))
      retained.push(output)
      const binding = yield* Effect.promise(() => Omni.load())
      const pipe = binding.spawn(process.env.NATURAL_NODE, ["-e", "process.stdout.write('NATIVE_OUTPUT_READY\\\\n');process.stdin.resume()", process.env.NATURAL_NATIVE_NONCE], { stdin: "pipe", text: false, inheritEnv: false, env: Omni.childEnv(), backpressure: true })
      const chunks = []
      const pump = (async () => { for await (const chunk of pipe.output) chunks.push(chunk) })()
      retained.push({ pipe, output: pipe.output, pump, chunks })
      return { lsp: yield* lsp.status(), mcp: yield* mcp.status(), tools: Object.keys(tools), app: { exitCode: output.exitCode, stdout: output.stdout.toString(), stderr: output.stderr.toString() }, nativePID: pipe.pid, counts: Omni.snapshot() }
    }).pipe(Effect.provideService(InstanceRef, ctx))
  })),
  dispose: async () => {
    for (const value of retained) if (value.pipe) { await value.pipe.stop({ graceMs: 100 }); await value.pump }
    await AppRuntime.dispose()
    await processes.dispose()
    console.log("NATURAL_RETAINED " + JSON.stringify(retained.map(value => value.pipe ? { pid: value.pipe.pid, chunks: value.chunks.map(chunk => Buffer.from(chunk.data).toString()), retainedOutput: true } : { stdout: value.stdout.toString(), stderr: value.stderr.toString() })))
  },
})
`)
  const { backendSkillsModule } = await import("../../orchestra/script/backend-skills.ts")
  const inputs: Record<string, string> = {}
  const models = path.join(ORCHESTRA, "test/tool/fixtures/models-api.json")
  const results = await Promise.all((["bun", "node"] as const).map(async (target) => {
    const result = await Bun.build({
      target, entrypoints: [entry], outdir: dir, naming: `${target}.mjs`, format: "esm", sourcemap: "linked",
      external: ["jsonc-parser", "@lydell/node-pty"],
      define: { ORCHESTRA_MODELS_DEV: readFileSync(models, "utf8"), ORCHESTRA_VERSION: "'natural-proof'", ORCHESTRA_CHANNEL: "'dev'" },
      plugins: [{ name: "node-import-meta-dir-and-source-provenance", setup(build) {
        build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async (args) => {
          if (!args.path.includes(`${path.sep}packages${path.sep}`) || args.path.includes(`${path.sep}node_modules${path.sep}`)) return undefined
          const text = await Bun.file(args.path).text()
          inputs[path.relative(ROOT, args.path).replaceAll("\\", "/")] = createHash("sha256").update(text).digest("hex")
          if (!/[\\/]packages[\\/](orchestra|core)[\\/]src[\\/].*\.ts$/.test(args.path) || !/\bimport\.meta\.dir\b(?!name)/.test(text)) return undefined
          return { contents: text.replace(/\bimport\.meta\.dir\b(?!name)/g, "import.meta.dirname"), loader: "ts" }
        })
      } }],
      files: { "orchestra-web-ui.gen.ts": "", "orchestra-backend-skills.gen.ts": await backendSkillsModule(path.join(ROOT, "packages/backend-specialist/skills")) },
    })
    if (!result.success) throw new Error(`Natural ${target} build failed: ${result.logs.join("\n")}`)
    const bundle = result.outputs.find((output) => output.path.endsWith(".mjs"))
    if (!bundle) throw new Error(`Natural ${target} build produced no entry`)
    const text = await bundle.text()
    if (/(?:from\s*|import\(\s*|require\(\s*)["']hugr-omni["']/.test(text)) throw new Error("hugr-omni escaped natural bundle")
    if (/["'][\w./-]+\.gen\.ts["']/.test(text)) throw new Error("Unresolved generated module in natural bundle")
    return { target, file: bundle.path, sha256: createHash("sha256").update(text).digest("hex") }
  }))
  const boundary = ["packages/orchestra/script/build-node.ts", "packages/orchestra/src/node.ts", "packages/omni/campaign/natural-host.ts"]
  boundary.forEach((file) => { inputs[file] = createHash("sha256").update(readFileSync(path.join(ROOT, file))).digest("hex") })
  const publicEntry = readFileSync(path.join(ORCHESTRA, "src/node.ts"), "utf8")
  if (/export.*AppRuntime/.test(publicEntry)) throw new Error("Public Node exports changed: reassess fixture necessity")
  return { results, inputs, entrySHA256: createHash("sha256").update(readFileSync(entry)).digest("hex"), scope: "controlled production-source fixture; same Bun build-node pipeline; not actual Electron desktop or compiled CLI", publicEntry, home: scratch.home }
}

if (import.meta.main && process.argv.includes("--build")) console.log("NATURAL_BUILD " + JSON.stringify(await buildHosts()))

function packageRoot(file: string, name: string): string {
  const dir = path.dirname(realpathSync(file))
  const manifest = path.join(dir, "package.json")
  if (existsSync(manifest) && (JSON.parse(readFileSync(manifest, "utf8")) as { name?: string }).name === name) return dir
  if (path.dirname(dir) === dir) throw new Error(`No package root for ${name}: ${file}`)
  return packageRoot(dir, name)
}

export async function run(input: { runtime: "bun" | "node"; build: Awaited<ReturnType<typeof buildHosts>>; mutation?: "timer" }) {
  authorized()
  const boundMs = input.runtime === "bun" ? 10_000 : 20_000
  const scratch = isolated(`natural-${input.runtime}`, { formatter: false, share: "disabled", plugin: [] })
  const tree = fileTree(scratch.home, 1)
  const nonces = { lsp: `omni-natural-lsp-${tree.nonce.slice(10)}`, mcp: `omni-natural-mcp-${tree.nonce.slice(10)}`, native: `omni-natural-output-${tree.nonce.slice(10)}` }
  const node = Bun.which("node")
  if (!node) throw new Error("Natural proof requires a direct Node executable, not a Windows .cmd wrapper")
  const addon = process.env.HUGR_OMNI_ADDON
  const supervisor = process.env.HUGR_OMNI_SUPERVISOR
  if (!addon || !supervisor || !existsSync(addon) || !existsSync(supervisor)) throw new Error("Natural proof needs cached release HUGR_OMNI_ADDON and HUGR_OMNI_SUPERVISOR at child start")
  const config = {
    formatter: false, share: "disabled", plugin: [],
    lsp: { typescript: { disabled: true }, deno: { disabled: true }, eslint: { disabled: true }, oxlint: { disabled: true }, biome: { disabled: true }, campaign: { command: [node, path.join(ORCHESTRA, "test/fixture/lsp/fake-lsp-server.js"), nonces.lsp], extensions: [".ts"] } },
    mcp: { campaign: { type: "local", command: [BUN, path.join(ORCHESTRA, "test/fixture/mcp-omni-stdio.ts"), nonces.mcp], environment: { MCP_OMNI_TREE: JSON.stringify({ command: tree.command, args: tree.args }) }, timeout: 30_000 } },
  }
  const disposed = path.join(scratch.home, "disposed.json")
  const file = path.join(scratch.project, "natural.ts")
  const bundle = input.build.results.find((build) => build.target === input.runtime)
  if (!bundle) throw new Error(`Missing ${input.runtime} natural bundle`)
  const env = { ...scratch.env, HUGR_OMNI_ADDON: addon, HUGR_OMNI_SUPERVISOR: supervisor, ORCHESTRA_CONFIG_CONTENT: JSON.stringify(config), ORCHESTRA_PRINT_LOGS: "1", ORCHESTRA_LOG_LEVEL: "DEBUG", ORCHESTRA_DB: ":memory:", ORCHESTRA_MODELS_PATH: path.join(ORCHESTRA, "test/tool/fixtures/models-api.json"), ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: "strict", NATURAL_PROJECT: scratch.project, NATURAL_FILE: file, NATURAL_NODE: node, NATURAL_NATIVE_NONCE: nonces.native, NATURAL_DISPOSED: disposed, NATURAL_MUTATION: input.mutation ?? "none" }
  await prepareCapture()
  const proc = spawn(input.runtime === "bun" ? BUN : node, [bundle.file, scratch.home], { env, cwd: ORCHESTRA, stdio: ["ignore", "pipe", "pipe"], windowsHide: true })
  const state = { output: "", error: "", closed: false, exitAt: 0 }
  proc.stdout.on("data", (chunk) => { state.output += chunk.toString() })
  proc.stderr.on("data", (chunk) => { state.output += chunk.toString() })
  proc.on("error", (error) => { state.error = String(error) })
  proc.on("exit", () => { state.exitAt = Date.now() })
  proc.on("close", () => { state.closed = true })
  const evidence: Record<string, unknown> = {}
  const observation = { left: [] as Identity[], fixtures: [] as { nonce: string; members: Identity[]; wrappers: Identity[] }[], atMs: 0, disposed: false, exitCode: null as number | null, signalCode: null as string | null, closed: false }
  const retained: Identity[] = []
  const started = { value: 0 }
  let pass = false
  let failure = ""
  try {
    const host = own(scratch.home, proc)
    markerArgument(scratch.home, bundle.file)
    const ready = await until(120_000, "natural host readiness", () => {
      if (state.error || proc.exitCode !== null || proc.signalCode !== null) throw new Error(`Natural host startup failed: ${state.error}; ${state.output}`)
      const line = state.output.split("\n").find((line) => line.startsWith("NATURAL_READY "))
      return line ? JSON.parse(line.slice("NATURAL_READY ".length)) as { pid: number; product: string; control: string; runtime: Record<string, string> } : undefined
    })
    if (ready.pid !== host.pid) throw new Error("Readiness PID disagrees with retained host identity")
    evidence.ready = ready
    const api = client(ready.product, scratch.project)
    const ctl = client(ready.control, scratch.project)
    const activation = await ctl.post("/write") as { lsp: { id: string; status: string }[]; mcp: Record<string, { status: string }>; tools: string[]; app: { exitCode: number; stdout: string; stderr: string }; nativePID: number; counts: { spawns: number; delegations: number } }
    evidence.activation = activation
    if (readFileSync(file, "utf8") !== "export const natural = 42\n" || !activation.lsp.some((entry) => entry.id === "campaign" && entry.status === "connected") || activation.mcp.campaign?.status !== "connected" || activation.tools.length !== 1 || activation.app.exitCode !== 0 || activation.app.stdout !== "APP_PROCESS_READY" || activation.app.stderr !== "APP_PROCESS_STDERR" || activation.counts.spawns < 3 || activation.counts.delegations !== 0) throw new Error("Actual service/protocol/AppProcess activation control failed")
    const health = await api.get("/global/health") as { healthy: boolean; version: string }
    if (!health.healthy || health.version !== "natural-proof") throw new Error("Real Server health control failed")
    evidence.http = { health }
    const live = await until(30_000, "all real fixtures under native supervisors", () => {
      const rows = hostRows(host)
      const found = { lsp: control(nonces.lsp, 1, [host], rows), mcp: control(nonces.mcp, 1, [host], rows), native: control(nonces.native, 1, [host], rows), tree: control(tree.nonce, tree.size, [host], rows) }
      evidence.liveProbe = found
      evidence.ownerRows = inventoryScope(rows, [host])
      return Object.values(found).every((found) => found.pass) ? found : undefined
    })
    evidence.live = live
    const rows = hostRows(host)
    inventoryScope(rows, [host]).filter((row) => row.pid !== process.pid).forEach((row) => retained.push(identity(row.pid, rows)))
    evidence.retained = retained
    started.value = Date.now()
    // HTTP timeout is failure only. Successful child is never signalled and has no watchdog of its own.
    const shutdown = ctl.post("/dispose")
    void shutdown.catch(() => undefined)
    await until(boundMs, "natural code-zero unsignalled host close and owned inventory zero", () => {
      const budget = boundMs - (Date.now() - started.value)
      if (budget < 250) return undefined
      const rows = hostRows(host, Math.min(2000, budget))
      const left = retained.filter((id) => rows.some((row) => matches(row, id) && !row.state.startsWith("Z")))
      const fixtures = [...Object.values(nonces), tree.nonce].map((nonce) => { const found = members(nonce, rows); return { nonce, members: found.members, wrappers: found.wrappers } })
      Object.assign(observation, { left, fixtures, atMs: Date.now() - started.value, disposed: existsSync(disposed), exitCode: proc.exitCode, signalCode: proc.signalCode, closed: state.closed })
      evidence.after = observation
      if (proc.exitCode !== null && proc.exitCode !== 0 || proc.signalCode !== null) throw new Error(`Host did not exit naturally: ${proc.exitCode}/${proc.signalCode}`)
      return state.closed && proc.exitCode === 0 && proc.signalCode === null && existsSync(disposed) && left.length === 0 && fixtures.every((fixture) => fixture.members.length + fixture.wrappers.length === 0) ? true : undefined
    })
    await shutdown
    evidence.disposed = JSON.parse(readFileSync(disposed, "utf8"))
    if (!state.output.includes("NATURAL_RETAINED ") || !state.output.includes("NATIVE_OUTPUT_READY")) throw new Error("Retained native output reference/worker completion evidence missing")
    pass = true
  } catch (error) {
    failure = String(error)
    evidence.logs = await Promise.all((await Array.fromAsync(new Bun.Glob("**/orchestra.log").scan({ cwd: scratch.home, absolute: true }))).map(async (file) => ({ file, text: (await Bun.file(file).text()).slice(-12_000) })))
  } finally {
    // This can only force failed hosts. Final verdict comes after fallback cleanup, never before it.
    if (!pass) {
      if (proc.exitCode === null && proc.signalCode === null) proc.kill("SIGKILL")
      await until(10_000, "failed natural host handle closing", () => state.closed ? true : undefined)
      await cleanup(scratch.home, [tree.nonce]).catch((error) => { failure += `; failed cleanup: ${error}` })
    }
    // This is the parent's OS-query broker, not any product-owned host or supervisor.
    if (process.platform === "win32") await WindowsInventory.stop()
  }
  const sourceHashes = Object.fromEntries(Object.entries(input.build.inputs).filter(([file]) => /(?:app-runtime|build-node|src\/node|natural-host|lsp\/(?:lsp|client|launch)|mcp\/(?:index|stdio)|server\/server|core\/src\/(?:omni|omni-spawner|process))\.ts$/.test(file)))
  const manifest = path.join(path.dirname(bundle.file), "source-hashes.json")
  writeFileSync(manifest, JSON.stringify(input.build.inputs, null, 2))
  console.log("NATURAL_SUMMARY " + JSON.stringify({ os: process.platform, runtime: input.runtime, mutation: input.mutation ?? "none", pass, error: failure, after: evidence.after }))
  return verdict("v10-natural-exit", { runtime: input.runtime, mutation: input.mutation ?? "none", boundMs, pass, error: failure, hostPID: proc.pid, observation, exitMs: pass && started.value && state.exitAt ? state.exitAt - started.value : undefined, output: state.output, evidence, bundle, sourceHashes, sourceManifest: { file: manifest, sha256: createHash("sha256").update(readFileSync(manifest)).digest("hex") }, entrySHA256: input.build.entrySHA256, scope: input.build.scope, publicEntry: input.build.publicEntry, releaseArtifacts: { addon, supervisor }, compiledCLI: "explicit process.exit: not natural-exit evidence" })
}

function hostRows(host: Identity, timeoutMs = 10_000) {
  const rows = table(timeoutMs)
  // Windows keeps historical numeric PPIDs after parent death. A reused PID cannot adopt older processes.
  // Keep the query-host visibility control; all real child-host descendants satisfy this birth constraint.
  return process.platform === "win32"
    ? rows.filter((row) => row.pid === process.pid || BigInt(row.startTime) >= BigInt(host.startTime))
    : rows
}
