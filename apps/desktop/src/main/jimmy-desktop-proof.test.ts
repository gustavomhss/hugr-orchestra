import { afterAll, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, fstatSync, writeFileSync, writeSync } from "node:fs"
import { cp, mkdir, mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises"
import { builtinModules, createRequire } from "node:module"
import { createConnection, createServer } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { Schema } from "effect"
import { Research } from "../../../../packages/schema/src/research"
import { reply } from "../../../orchestra/test/lib/llm-server"
import { testProviderConfig } from "../../../orchestra/test/lib/test-provider"
import ts from "typescript"
import { expectSpawn } from "../../../../packages/core/test/fixture/omni-expect"
import { cleanupProofRoot } from "./jimmy-desktop-cleanup.fixture"
import { DesktopOmni } from "./omni-process"

const desktop = path.resolve(import.meta.dir, "../..")
const repo = path.resolve(desktop, "../..")
const stages: unknown[] = []
function stage(name: string, details?: unknown) {
  const record = { name, details, pid: process.pid, time: Date.now(), written: 0, fds: [0, 1, 2].map((fd) => {
    try {
      const stat = fstatSync(fd)
      return { fd, dev: stat.dev, ino: stat.ino, mode: stat.mode }
    } catch (error) { return { fd, error: String(error) } }
  }) }
  stages.push(record)
  writeFileSync(path.join(repo, "test-ci-evidence/jimmy-desktop-diagnostic.json"), JSON.stringify({ sha: process.env.GITHUB_SHA, runID: process.env.GITHUB_RUN_ID, stages }))
  record.written = writeSync(2, `JIMMY_DESKTOP_STAGE=${name}\n`)
  writeFileSync(path.join(repo, "test-ci-evidence/jimmy-desktop-diagnostic.json"), JSON.stringify({ sha: process.env.GITHUB_SHA, runID: process.env.GITHUB_RUN_ID, stages }))
}
afterAll(() => {
  if (process.env.ORCHESTRA_JIMMY_DESKTOP_PROOF === "1") stage("after-all")
})
const body = "Résumé: Version 1 is supported [source](research:supported); disabled rejects operation [exception](research:disabled).\n"
const sourceText = "Version 1 only.\nDisabled rejects operation.\n"
// This fixed read fixture projects two lines without the file's terminal newline.
const sourceProjection = "Version 1 only.\nDisabled rejects operation."
const json = <A>(schema: Schema.Decoder<A>, value: unknown) => Schema.decodeUnknownSync(schema)(value)
const object = (value: unknown): Record<string, unknown> => json(Schema.Record(Schema.String, Schema.Unknown), value)
const parse = (value: string) => json(Schema.fromJsonString(Schema.Unknown), value)
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex")

// Only the selected test-ci provisioning step enables these specialized proofs.
test.skipIf(process.env.ORCHESTRA_JIMMY_DESKTOP_PROOF !== "1")("real Electron production Node-sidecar Jimmy Task and generated artifact bridge", async () => {
  if (!process.env.GITHUB_RUN_ID) throw new Error("GitHub-only desktop proof; local execution forbidden")
  if (!["darwin", "linux"].includes(process.platform)) throw new Error(`Unsupported desktop proof platform: ${process.platform}`)
  if (process.platform === "darwin" && process.arch !== "arm64") throw new Error("Desktop macOS proof requires native arm64")
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "jimmy-desktop-proof-")))
  stage("native-test-start", { root })
  expect(existsSync(root)).toBe(true)
  const env = {
    ...process.env,
    MODELS_DEV_API_JSON: path.join(repo, "apps/orchestra/test/tool/fixtures/models-api.json"),
    NODE_OPTIONS: "--max-old-space-size=5120",
  }
  try {
    // The host's build commands run through DesktopOmni.execFile when omni is on (command() below).
    expectSpawn(import.meta.path)
    await command([process.execPath, "run", "generate"], path.join(repo, "packages/client"), env, 60000)
    await command([process.execPath, "script/build-node.ts"], path.join(repo, "apps/orchestra"), env, 90000)
    const require = createRequire(path.join(desktop, "package.json"))
    await command([process.execPath, "run", "--silent", "electron-vite", "build", "--config", "src/main/jimmy-desktop-proof.vite.ts"], desktop, env, 90000)
    const install = path.join(root, "install/apps/desktop")
    await mkdir(install, { recursive: true })
    await cp(path.join(desktop, "out/main"), path.join(install, "out/main"), { recursive: true, dereference: true })
    await Bun.write(path.join(install, "package.json"), '{"type":"module"}')
    // sidecarLaunchEnv requires the Claude Code executable beside the install. This proof never runs it (the Task uses
    // the fixture provider), so an existence-only placeholder satisfies the access check.
    await Bun.write(path.join(install, "resources/claude-code", process.platform === "win32" ? "claude.exe" : "claude"), "")
    const bare = new Set<string>()
    for (const file of await Array.fromAsync(new Bun.Glob("**/*.js").scan({ cwd: path.join(install, "out/main") }))) {
      const source = ts.createSourceFile(file, await readFile(path.join(install, "out/main", file), "utf8"), ts.ScriptTarget.Latest)
      const visit = (node: ts.Node) => {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) bare.add(node.moduleSpecifier.text)
        if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require")) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) bare.add(node.arguments[0].text)
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
    const copied = new Set<string>()
    const copyDependency = async (name: string, from: string): Promise<void> => {
      if (builtinModules.includes(name) || name.startsWith("node:") || name.startsWith(".") || name === "electron" || name.startsWith("/")) return
      const packageName = name.startsWith("@") ? name.split("/").slice(0, 2).join("/") : name.split("/")[0]
      if (copied.has(packageName)) return
      if (packageName.startsWith("@orchestra/")) throw new Error(`Unbundled workspace source dependency: ${name}`)
      copied.add(packageName)
      const locate = async (directory: string): Promise<string> => {
        // Manifest dependencies include type-only packages with no resolvable runtime entry.
        // Resolve the installed package directory instead of inventing an entry for them.
        const installed = await realpath(path.join(directory, "node_modules", packageName)).then(
          (value) => value,
          (error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") return undefined
            throw error
          },
        )
        if (installed) {
          const manifest = json(Schema.fromJsonString(Schema.Struct({ name: Schema.String })), await readFile(path.join(installed, "package.json"), "utf8"))
          if (manifest.name !== packageName) throw new Error(`External package identity differs: ${packageName}`)
          return installed
        }
        if (path.dirname(directory) === directory) throw new Error(`External package root unavailable: ${name}`)
        return locate(path.dirname(directory))
      }
      const directory = await locate(from)
      await cp(directory, path.join(install, "node_modules", packageName), { recursive: true, dereference: true })
      const manifest = json(Schema.fromJsonString(Schema.Struct({ dependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)) })), await readFile(path.join(directory, "package.json"), "utf8"))
      await Promise.all(Object.keys(manifest.dependencies ?? {}).map((dependency) => copyDependency(dependency, directory)))
    }
    await Promise.all([...bare, `@lydell/node-pty-${process.platform}-${process.arch}`].map((name) => copyDependency(name, desktop)))
    const compiled = await readFile(path.join(install, "out/main/sidecar.js"), "utf8")
    expect(compiled).toContain("JIMMY_NODE_IDENTITY=")
    const positive = await runProof(root, install, require("electron"), false)
    // Remove the real compiled API route from a separate owned artifact, not a fake service/fetch response.
    const mutant = path.join(root, "mutant/apps/desktop")
    await cp(install, mutant, { recursive: true, dereference: true })
    const changes: string[] = []
    for (const file of await Array.fromAsync(new Bun.Glob("**/*.js").scan({ cwd: path.join(mutant, "out/main") }))) {
      const filename = path.join(mutant, "out/main", file)
      const text = await readFile(filename, "utf8")
      const broken = text.replaceAll("/session/:sessionID/research/:artifactID", "/session/:sessionID/missing-native-bridge/:artifactID")
      if (text === broken) continue
      await Bun.write(filename, broken)
      changes.push(file)
    }
    expect(changes.length, "Native bridge mutation must alter a compiled route").toBeGreaterThan(0)
    const failure = await runProof(root, mutant, require("electron"), true).then(() => undefined, (error: unknown) => String(error))
    expect(failure).toContain("generated native artifact bridge")
    stage("mutant-asserted")
    const evidence = { schema: "jimmy-desktop-proof-v1", sha: process.env.GITHUB_SHA, runID: process.env.GITHUB_RUN_ID, ...positive, mutation: { changes, failure } }
    stage("evidence-write-start")
    await Bun.write(path.join(repo, "test-ci-evidence/jimmy-desktop-proof.json"), JSON.stringify(evidence))
    stage("evidence-write-done")
    // Keep full evidence in the artifact. A giant synchronous pipe write loses CI log framing.
    console.log(`JIMMY_DESKTOP_EVIDENCE=${JSON.stringify({ schema: evidence.schema, sha: evidence.sha, runID: evidence.runID, platform: evidence.platform, stopped: evidence.stopped, mutation: evidence.mutation })}`)
    stage("evidence-console-done")
  } finally {
    stage("root-rm-start")
    // A separate Node process owns deletion; verify it finishes before returning this test.
    await cleanupProofRoot(root, (name, details) => stage(name, details))
    expect(existsSync(root)).toBe(false)
    stage("root-rm-done")
  }
  stage("native-test-return")
}, 360000)

test.skipIf(process.env.ORCHESTRA_JIMMY_DESKTOP_PROOF !== "1")("owned desktop proof typechecks", async () => {
  if (!process.env.GITHUB_RUN_ID) throw new Error("GitHub-only desktop proof typecheck")
  stage("typecheck-start")
  expectSpawn(import.meta.path)
  await command([process.execPath, "run", "generate"], path.join(repo, "packages/client"), process.env, 60000)
  await command([process.execPath, "typecheck", "src/main/jimmy-desktop-proof.tsconfig.json"], desktop, process.env, 90000)
  await Bun.write(path.join(repo, "test-ci-evidence/jimmy-desktop-typecheck.json"), JSON.stringify({ schema: "jimmy-desktop-typecheck-v1", sha: process.env.GITHUB_SHA, runID: process.env.GITHUB_RUN_ID, passed: true }))
  stage("typecheck-return")
}, 160000)

test("owned recursive cleanup preserves real Bun two-case completion", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "jimmy-cleanup-completion-"))
  try {
    await Bun.write(path.join(root, "completion.test.ts"), `
      import { expect, test } from "bun:test"
      import { existsSync, mkdirSync, writeFileSync } from "node:fs"
      import { cleanupProofRoot } from ${JSON.stringify(path.join(import.meta.dir, "jimmy-desktop-cleanup.fixture.ts"))}
      const root = ${JSON.stringify(path.join(root, "install"))}
      test("cleanup first case", async () => {
        Array.from({ length: 256 }, (_, directory) => {
          const folder = root + "/" + directory
          mkdirSync(folder, { recursive: true })
          Array.from({ length: 64 }, (_, file) => writeFileSync(folder + "/" + file, "owned install fixture"))
        })
        expect(existsSync(root)).toBe(true)
        if (process.env.JIMMY_EARLY_EXIT_CONTROL === "1") process.exit(0)
        await cleanupProofRoot(root)
        expect(existsSync(root)).toBe(false)
        writeFileSync(${JSON.stringify(path.join(root, "first"))}, "completed")
      }, 30000)
      test("completion second case", () => {
        expect(existsSync(root)).toBe(false)
        writeFileSync(${JSON.stringify(path.join(root, "second"))}, "completed")
      })
    `)
    const run = async (earlyExit: boolean) => {
      const child = Bun.spawn([process.execPath, "test", "./completion.test.ts"], {
        cwd: root, env: { ...process.env, JIMMY_EARLY_EXIT_CONTROL: earlyExit ? "1" : "0" },
        stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 40000, killSignal: "SIGKILL",
      })
      const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
      return { output: stdout + stderr, code }
    }
    const incomplete = await run(true)
    expect(incomplete.code).toBe(0)
    expect(incomplete.output).not.toMatch(/^\s*2 pass\s*$/m)
    expect(existsSync(path.join(root, "first"))).toBe(false)
    expect(existsSync(path.join(root, "second"))).toBe(false)
    const completed = await run(false)
    if (process.env.ORCHESTRA_JIMMY_DESKTOP_PROOF === "1") stage("completion-subprocess", { incomplete, completed })
    expect(completed.code).toBe(0)
    expect(completed.output).toMatch(/^\s*2 pass\s*$/m)
    expect(completed.output).toMatch(/^\s*0 fail\s*$/m)
    expect(completed.output).toContain("(pass) cleanup first case")
    expect(completed.output).toContain("(pass) completion second case")
    expect(await readFile(path.join(root, "first"), "utf8")).toBe("completed")
    expect(await readFile(path.join(root, "second"), "utf8")).toBe("completed")
    expect(existsSync(path.join(root, "install"))).toBe(false)
    if (process.env.ORCHESTRA_JIMMY_DESKTOP_PROOF === "1") stage("completion-asserted")
  } finally {
    await cleanupProofRoot(root)
  }
}, 90000)

async function runProof(root: string, install: string, electron: string, mutant: boolean) {
  const owned = path.join(root, mutant ? "negative" : "positive")
  const project = path.join(owned, "project")
  await Promise.all(["project", "home", "desktop", "session", "config", "managed", "cache", "data", "state"].map((name) => mkdir(path.join(owned, name), { recursive: true })))
  const port = await new Promise<number>((resolve, reject) => {
    const socket = createServer()
    socket.once("error", reject)
    socket.listen(0, "127.0.0.1", () => {
      const address = socket.address()
      if (!address || typeof address === "string") return reject(new Error("Owned sidecar port unavailable"))
      socket.close(() => resolve(address.port))
    })
  })
  const baseUrl = `http://127.0.0.1:${port}`
  const headers = { authorization: `Basic ${Buffer.from("orchestra:owned-proof-password").toString("base64")}`, "x-orchestra-directory": project, "content-type": "application/json" }
  const api = async (route: string, input?: unknown) => {
    const response = await fetch(`${baseUrl}${route}`, { headers, ...(input === undefined ? {} : { method: "POST", body: JSON.stringify(input) }), signal: AbortSignal.timeout(45000) })
    const text = await response.text()
    if (!response.ok) throw new Error(`Desktop native API ${route}: ${response.status} ${text}`)
    return parse(text)
  }
  const historySchema = Schema.Array(Schema.Struct({ info: Schema.Struct({ id: Schema.String }), parts: Schema.Array(Schema.Unknown) }))
  const state: { parent?: string; child?: string; source?: Research.SourceReceipt; finding?: typeof Research.FindingRecord.Type; document?: Research.DocumentReceipt; page?: Research.ArtifactPage } = {}
  const requests: { path: string; tools: string[]; toolResponses: string[] }[] = []
  const errors: string[] = []
  const skills = ["jimmy-reference"]
  const provider = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    try {
      const payload = json(Schema.Struct({ model: Schema.Literal("test-model"), stream: Schema.Literal(true), tools: Schema.Array(Schema.Struct({ function: Schema.Struct({ name: Schema.String }) })), messages: Schema.Array(Schema.Struct({ role: Schema.String, content: Schema.Unknown })) }), await request.json())
      const turns = requests.length
      requests.push({ path: new URL(request.url).pathname, tools: payload.tools.map((tool) => tool.function.name), toolResponses: payload.messages.flatMap((message) => message.role === "tool" && typeof message.content === "string" ? [message.content] : []) })
      const tool = (name: string, input: unknown) => reply().tool(name, input)
      const output = await (async () => {
        if (turns === 0) return tool("task", { description: "Inspect conditional behavior", prompt: "Load the jimmy skill, read task-evidence.txt, retain both branches, publish qualified answer, close the inquiry.", subagent_type: "jimmy" })
        if (turns === 1) return tool("skill", { name: skills[0] })
        if (turns === 2) return tool("read", { filePath: "task-evidence.txt" })
        if (!state.parent) throw new Error("Native parent session missing")
        const children = json(Schema.Array(Schema.Struct({ id: Schema.String, parentID: Schema.String })), await api(`/session/${state.parent}/children`))
        expect(children).toHaveLength(1)
        state.child = children[0].id
        const history = json(historySchema, await api(`/session/${state.child}/message`))
        const parts = history.flatMap((message) => message.parts).map(object)
        const completed = parts.filter((part) => part.type === "tool" && object(part.state).status === "completed")
        const latest = object(completed.at(-1)?.state)
        if (turns === 3) {
          state.source = json(Research.SourceReceipt, object(latest.metadata).researchSource)
          await rm(path.join(project, "task-evidence.txt"))
          return tool("research_record", { action: "finding", proposition: "Version 1 is supported only when enabled", nature: "extraction", conditions: ["version 1", "enabled"], evidence: [{ source: state.source.ref, locator: { kind: "quote", exact: "Version 1 only." } }], contrary: [{ source: state.source.ref, locator: { kind: "quote", exact: "Disabled rejects operation." } }] })
        }
        if (turns === 4) {
          state.finding = json(Research.FindingRecord, object(parse(String(latest.output))).record)
          return tool("research_record", { action: "document", document: { title: "Native desktop conditional answer", genre: "answer", body, findingRefs: [{ id: state.finding.id, revision: state.finding.revision }], citations: { supported: state.finding.evidence[0], disabled: state.finding.contrary[0] } } })
        }
        if (turns === 5) {
          state.document = json(Research.DocumentReceipt, object(parse(String(latest.output))).document)
          return tool("research_view", { action: "document", ref: state.document.ref })
        }
        if (turns === 6) {
          state.page = json(Research.ArtifactPage, parse(String(latest.output)))
          return tool("inquiry", { action: "open", question: "When is version 1 supported?", subquestions: ["Which condition enables version 1"], profile: "understand" })
        }
        // The host assembles the card on inquiry close; the open reply's first line names the subquestion to claim.
        if (turns === 7) {
          const opened = json(Schema.Struct({ subquestions: Schema.NonEmptyArray(Research.RecordRef) }), parse(String(latest.output).split("\n")[0]))
          return tool("inquiry", { action: "claim", subquestion: opened.subquestions[0], proposition: "Version 1 is supported when enabled", nature: "extraction", conditions: ["version 1", "enabled"], evidence: [{ source: state.source?.ref, quote: "Version 1 only." }], contrary: [{ source: state.source?.ref, quote: "Disabled rejects operation." }] })
        }
        if (turns === 8) return tool("inquiry", { action: "check" })
        if (turns === 9) return tool("inquiry", { action: "close", sufficiency: "answered", answer: "Version 1 is supported when enabled; disabled rejects operation.", limitations: ["Scripted static-source mechanics only"] })
        if (turns === 10) return reply().text("Inquiry closed.").stop()
        if (turns === 11) return reply().text("Native discovery returned with verified admitted references.").stop()
        throw new Error(`Unexpected provider turn ${turns}`)
      })()
      const item = output.item()
      if (item.type !== "sse") throw new Error("Expected scripted SSE")
      return new Response([...item.head, ...item.tail].map((line) => `data: ${JSON.stringify(line)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } })
    } catch (error) {
      errors.push(String(error))
      return new Response(String(error), { status: 500 })
    }
  } })
  await Bun.write(path.join(project, "orchestra.json"), JSON.stringify({ ...testProviderConfig(`http://127.0.0.1:${provider.port}/v1`), model: "test/test-model", small_model: "test/test-model", plugin: [], mcp: {}, compaction: { auto: false }, agent: { maestro: { permission: { task: "allow" } } } }))
  await Bun.write(path.join(project, "task-evidence.txt"), sourceText)
  const entry = path.join(install, "out/main/jimmy-desktop-proof.js")
  const executable = process.platform === "linux" ? "xvfb-run" : electron
  const child = spawn(executable, process.platform === "linux" ? ["-a", electron, "--no-sandbox", entry] : [entry], {
    cwd: project, stdio: ["pipe", "pipe", "pipe"], detached: true,
    env: {
      // The relocated install ships no omni files; the run's omni mode and CI's explicit omni-binaries paths
      // (HUGR_OMNI_*, see desktop omni-host.ts) are what spawnLocalServer's sidecarEnv locates.
      ...Object.fromEntries(Object.entries(process.env).filter(([key]) => ["PATH", "TMPDIR", "DISPLAY", "XAUTHORITY",
        "HUGR_OMNI_ADDON", "HUGR_OMNI_SUPERVISOR", "ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER"].includes(key))),
      HOME: path.join(owned, "home"), XDG_CACHE_HOME: path.join(owned, "cache"), XDG_DATA_HOME: path.join(owned, "data"), XDG_CONFIG_HOME: path.join(owned, "config"), XDG_STATE_HOME: path.join(owned, "state"),
      ORCHESTRA_DB: path.join(owned, "native.db"), ORCHESTRA_INHERIT_CREDENTIALS: "0", ORCHESTRA_TEST_HOME: path.join(owned, "home"), ORCHESTRA_TEST_MANAGED_CONFIG_DIR: path.join(owned, "managed"),
      ORCHESTRA_CONFIG_CONTENT: "{}", ORCHESTRA_CLIENT: "desktop", ORCHESTRA_PURE: "true", ORCHESTRA_DISABLE_DEFAULT_PLUGINS: "true", ORCHESTRA_DISABLE_EXTERNAL_SKILLS: "true", ORCHESTRA_DISABLE_MODELS_FETCH: "true", ORCHESTRA_DISABLE_AUTOUPDATE: "true", ORCHESTRA_DISABLE_LSP_DOWNLOAD: "true", ORCHESTRA_DISABLE_EMBEDDED_WEB_UI: "true", ORCHESTRA_EXPERIMENTAL_DISABLE_FILEWATCHER: "true",
      JIMMY_DESKTOP_ROOT: owned, JIMMY_DESKTOP_PORT: String(port),
    },
  })
  const exited = new Promise<number | null>((resolve, reject) => {
    child.once("exit", resolve)
    child.once("error", reject)
  })
  // A private process group bounds the Electron utility child and Linux Xvfb wrapper too.
  const killOwned = () => {
    if (!child.pid) return
    const group = Bun.spawnSync(["ps", "-p", String(child.pid), "-o", "pgid="], { stdout: "pipe", stderr: "pipe" })
    if (group.exitCode !== 0) return
    if (Number(group.stdout.toString().trim()) !== child.pid) throw new Error("Electron fixture does not own its process group")
    const host = Bun.spawnSync(["ps", "-p", String(process.pid), "-o", "pgid="], { stdout: "pipe", stderr: "pipe" })
    if (host.exitCode !== 0 || Number(host.stdout.toString().trim()) === child.pid) throw new Error("Refusing to reap host test process group")
    const killed = Bun.spawnSync(["/bin/kill", "-s", "KILL", "--", `-${child.pid}`], { stdout: "pipe", stderr: "pipe" })
    if (killed.exitCode !== 0) throw new Error(`Owned Electron group reap failed: ${killed.stderr.toString()}`)
  }
  const timeout = setTimeout(killOwned, 100000)
  const logs = { stdout: "", stderr: "" }
  const consume = async (stream: AsyncIterable<Uint8Array>, key: "stdout" | "stderr") => {
    for await (const chunk of stream) logs[key] += Buffer.from(chunk).toString("utf8")
  }
  const readers = [consume(child.stdout, "stdout"), consume(child.stderr, "stderr")]
  const pids: number[] = []
  const marker = (name: string) => {
    const lines = logs.stdout.split(/\r?\n/).filter((line) => line.startsWith(`${name}=`))
    expect(lines).toHaveLength(1)
    return object(parse(lines[0].slice(name.length + 1)))
  }
  try {
    const deadline = Date.now() + 35000
    while (!logs.stdout.includes("JIMMY_DESKTOP_READY=")) {
      if (child.exitCode !== null || child.signalCode !== null || Date.now() > deadline) throw new Error(`Electron production launcher failed: ${JSON.stringify(logs)}`)
      await Bun.sleep(50)
    }
    const main = marker("JIMMY_DESKTOP_READY")
    const node = marker("JIMMY_NODE_IDENTITY")
    pids.push(Number(main.pid), Number(node.pid))
    expect(main.windows).toBe(0)
    expect(main.entry).toBe(new URL(`file://${entry}`).href)
    expect(main.userData).toBe(path.join(owned, "desktop"))
    expect(node.entry).toBe(new URL(`file://${path.join(install, "out/main/sidecar.js")}`).href)
    expect(node.db).toBe(path.join(owned, "native.db"))
    expect(node.ppid).toBe(main.pid)
    expect(node.pid).not.toBe(main.pid)
    expect(object(node.versions).bun).toBeUndefined()
    expect(Number(String(object(node.versions).node).split(".")[0])).toBeGreaterThanOrEqual(22)
    expect(object(main.versions).electron).toBe("42.3.3")
    const metrics = json(Schema.Array(Schema.Struct({ pid: Schema.Number, type: Schema.String, name: Schema.optional(Schema.String) })), main.metrics)
    expect(metrics).toContainEqual(expect.objectContaining({ pid: node.pid, type: "Utility", name: "Orchestra server" }))
    const processes = await command(["ps", "-p", `${main.pid},${node.pid}`, "-o", "pid=,ppid=,comm=,args="], project, process.env, 5000)
    expect(processes).toContain(String(main.pid))
    expect(processes).toContain(String(node.pid))
    expect(await realpath(String(main.execPath))).toBe(await realpath(electron))
    expect(processes).toContain(String(main.execPath))
    expect(processes).toContain(String(node.execPath))
    if (process.platform === "linux") expect(await realpath(`/proc/${node.pid}/exe`)).toBe(await realpath(String(node.execPath)))
    state.parent = String(object(await api("/session", { title: "Desktop native Task authority", agent: "maestro" })).id)
    await api(`/session/${state.parent}/message`, { agent: "maestro", model: { providerID: "test", modelID: "test-model" }, parts: [{ type: "text", text: "Delegate conditional source research to jimmy and receive verified document references." }] })
    expect(errors).toEqual([])
    expect(requests).toHaveLength(12)
    requests.slice(1, 11).forEach((request) => {
      expect(request.path).toBe("/v1/chat/completions")
      expect(request.tools).toContain("research_record")
      expect(request.tools).toContain("research_view")
      expect(request.tools).toContain("inquiry")
      ;["task", "bash", "edit"].forEach((tool) => expect(request.tools).not.toContain(tool))
    })
    if (!state.child || !state.source || !state.finding || !state.document || !state.page) throw new Error("Desktop native corpus missing")
    const parentHistory = json(historySchema, await api(`/session/${state.parent}/message`))
    const childHistory = json(historySchema, await api(`/session/${state.child}/message`))
    const parts = childHistory.flatMap((message) => message.parts).map(object)
    const calls = parts.filter((part) => part.type === "tool")
    expect(calls.map((part) => ({ tool: part.tool, status: object(part.state).status }))).toEqual(["skill", "read", "research_record", "research_record", "research_view", "inquiry", "inquiry", "inquiry", "inquiry"].map((tool) => ({ tool, status: "completed" })))
    const loaded = await Promise.all(calls.slice(0, 1).map(async (part, index) => {
      const metadata = object(object(part.state).metadata)
      const location = path.join(String(metadata.dir), "SKILL.md")
      expect(location.startsWith(path.join(owned, "cache") + path.sep)).toBe(true)
      const extracted = await readFile(location, "utf8")
      const authored = await readFile(path.join(repo, "packages/jimmy-specialist/skills", skills[index], "SKILL.md"), "utf8")
      expect(extracted).toBe(authored)
      expect(String(object(part.state).output)).toContain(`<skill_content name="${skills[index]}">`)
      return { name: skills[index], location, digest: hash(extracted), bytes: Buffer.byteLength(extracted) }
    }))
    const task = parentHistory.flatMap((message) => message.parts).map(object).find((part) => part.type === "tool" && part.tool === "task")
    expect(task).toBeDefined()
    expect(object(task?.state).status).toBe("completed")
    const metadata = object(object(task?.state).metadata)
    const report = object(metadata.workResult)
    expect(report).toMatchObject({ schema: "discovery-work-result-v1", card: { parsed: true }, outcome: "done", referencesChecked: true, terminal: { reason: "ended" },
      discovery: { schema: "jimmy-card-v2", sufficiency: "answered", answer: "Version 1 is supported when enabled; disabled rejects operation.", check: { verdict: "pass" },
        claims: [{ proposition: "Version 1 is supported when enabled", evidence: state.finding.evidence, contrary: state.finding.contrary }] } })
    expect(object(report.corpus).documents).toEqual([state.document])
    expect(state.source.binding).toMatchObject({ memberID: "jimmy", executionSessionID: state.child, authoritySessionID: state.parent, taskId: report.taskId, directory: project, worktree: project })
    expect(state.source).toMatchObject({ complete: true, transformation: "read-line-projection-v1" })
    expect(state.page.text).toBe(body)
    expect(state.finding.evidence).toEqual([{ source: state.source.ref, locator: { kind: "quote", exact: "Version 1 only." } }])
    expect(state.finding.contrary).toEqual([{ source: state.source.ref, locator: { kind: "quote", exact: "Disabled rejects operation." } }])
    const { Orchestra } = await import("../../../../packages/client/src/index")
    const transport: { url: string; status: number }[] = []
    const client = Orchestra.make({ baseUrl, headers, fetch: Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, { ...init, signal: AbortSignal.timeout(5000) })
      const response = await fetch(request)
      transport.push({ url: request.url, status: response.status })
      return response
    }, { preconnect: fetch.preconnect }) })
    const generated = await client.research.artifact({ sessionID: state.child, artifactID: state.document.artifact.id, revision: state.document.artifact.revision }).catch((error: unknown) => {
      if (mutant) expect(transport).toEqual([{ url: `${baseUrl}/api/session/${state.child}/research/${state.document?.artifact.id}?revision=${state.document?.artifact.revision}`, status: 404 }])
      throw new Error(`generated native artifact bridge failed: ${String(error)}`)
    })
    expect(generated).toEqual(state.page)
    expect(transport[0]).toEqual({ url: `${baseUrl}/api/session/${state.child}/research/${state.document.artifact.id}?revision=${state.document.artifact.revision}`, status: 200 })
    expect(state.document.bytes).toBe(Buffer.byteLength(body))
    expect(state.document.digest).toBe(hash(body))
    expect(requests[3].toolResponses.join("\n")).toContain(state.source.ref.digest)
    expect(requests[4].toolResponses.join("\n")).toContain(state.finding.id)
    expect(requests[5].toolResponses.join("\n")).toContain(state.document.digest)
    expect(requests[6].toolResponses.join("\n")).toContain(body.trim())
    expect(requests[10].toolResponses.join("\n")).toContain("\"closed\":\"answered\"")
    expect(requests[11].toolResponses.join("\n")).toContain("Inquiry check: pass")
    const sibling = String(object(await api("/session", { agent: "jimmy", parentID: state.parent })).id)
    const siblingError = await client.research.artifact({ sessionID: sibling, artifactID: state.document.artifact.id, revision: state.document.artifact.revision }).then(() => undefined, (error: unknown) => object(error))
    expect(siblingError).toMatchObject({ _tag: "ResearchArtifactNotFoundError", message: "Research artifact not found" })
    expect(transport[1].status).toBe(404)
    const files = await Array.fromAsync(new Bun.Glob("**/*.body").scan({ cwd: path.join(owned, "data"), absolute: true }))
    const retained = files.filter((file) => path.basename(file) === `${state.document?.artifact.id}-${state.document?.artifact.revision}.body`)
    expect(retained).toHaveLength(1)
    expect(await readFile(retained[0], "utf8")).toBe(body)
    expect(hash(await readFile(retained[0]))).toBe(state.document.digest)
    expect((await stat(path.join(owned, "native.db"))).size).toBeGreaterThan(0)
    const database = new Database(path.join(owned, "native.db"), { readonly: true })
    const childID = state.child
    const source = state.source
    const sourceOracle = await (async () => {
      try {
        expect(database.query("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" })
        expect(database.query("SELECT count(*) AS count FROM session").get()).toMatchObject({ count: 3 })
        const published = json(Schema.Array(Schema.Struct({ data: Schema.String })), database.query("SELECT data FROM event WHERE aggregate_id = ? AND type LIKE 'research.document.published%'").all(childID))
        expect(published).toHaveLength(1)
        expect(object(parse(published[0].data)).receipt).toEqual(state.document)
        const committed = json(Schema.Array(Schema.Struct({ data: Schema.String })), database.query("SELECT data FROM event WHERE aggregate_id = ? AND type LIKE 'research.record.committed%'").all(childID))
        // The inquiry commits its question, claim and relation records beside the published finding.
        expect(committed.map((row) => object(parse(row.data)).record).filter((record) => object(record).id === state.finding?.id)).toEqual([state.finding])
        // Read admissions and immutable blobs from the host, independently of HTTP/tool metadata.
        const admitted = json(Schema.Array(Schema.Struct({ sessionID: Schema.String, binding: Research.Binding, receipt: Research.SourceReceipt })), json(Schema.Array(Schema.Struct({ data: Schema.String })), database.query("SELECT data FROM event WHERE aggregate_id = ? AND type = 'research.source.admitted.1'").all(childID)).map((row) => parse(row.data)))
        expect(admitted).toHaveLength(2)
        const readMetadata = object(object(calls[1].state).metadata)
        return await Promise.all(["received", "text"].map(async (representation) => {
          const events = admitted.filter((event) => event.receipt.ref.representation === representation)
          expect(events).toHaveLength(1)
          const event = events[0]
          expect(event.sessionID).toBe(childID)
          expect(event.binding).toEqual(event.receipt.binding)
          expect(event.binding).toEqual(source.binding)
          expect(event.receipt.origin).toEqual({ kind: "file", uri: path.join(project, "task-evidence.txt") })
          expect(event.receipt.complete).toBe(true)
          const blobs = files.filter((file) => path.basename(file) === `${event.receipt.ref.artifact.id}-${event.receipt.ref.artifact.revision}.body`)
          expect(blobs).toHaveLength(1)
          const bytes = await readFile(blobs[0])
          const expected = Buffer.from(representation === "received" ? sourceText : sourceProjection)
          assertSourceBytes(event.receipt, json(Research.SourceReceipt, readMetadata[representation === "received" ? "researchReceived" : "researchSource"]), bytes, expected)
          if (representation === "text") {
            expect(event.receipt).toEqual(source)
            expect(event.receipt.derivedFrom).toEqual(admitted.find((item) => item.receipt.ref.representation === "received")?.receipt.ref)
            // Corrupt both receipt copies identically: metadata self-comparison would still pass.
            const wrongLength = { ...event.receipt, bytes: event.receipt.bytes + 1 }
            expect(() => assertSourceBytes(wrongLength, wrongLength, bytes, expected)).toThrow("Retained source byte length differs from SQLite receipt")
            const wrongDigest = { ...event.receipt, ref: { ...event.receipt.ref, digest: hash("corrupt source receipt") } }
            expect(() => assertSourceBytes(wrongDigest, wrongDigest, bytes, expected)).toThrow("Retained source SHA256 differs from SQLite receipt")
            const corrupt = Buffer.from(bytes)
            corrupt[0] ^= 1
            const consistent = { ...event.receipt, ref: { ...event.receipt.ref, digest: hash(corrupt) } }
            expect(() => assertSourceBytes(consistent, consistent, corrupt, expected)).toThrow("Retained source bytes differ from fixture projection")
          }
          return { receipt: event.receipt, retained: blobs[0], bytes: bytes.byteLength, digest: hash(bytes), controls: representation === "text" ? ["receipt-length", "receipt-sha256", "self-consistent-corrupt-blob"] : [] }
        }))
      } finally { database.close() }
    })()
    console.log(`JIMMY_NATIVE_ASSERTED=${JSON.stringify({ platform: process.platform, arch: process.arch, main, node, processes, loaded, source: state.source, sourceOracle, finding: state.finding, document: state.document, report, transport, digest: hash(body) })}`)
    child.stdin.write("stop\n")
    child.stdin.end()
    const stopDeadline = Date.now() + 10000
    while (!logs.stdout.includes("JIMMY_DESKTOP_STOP_ACK=")) {
      if (Date.now() > stopDeadline) throw new Error(`Native desktop sidecar stop deadline: ${JSON.stringify(logs)}`)
      await Bun.sleep(25)
    }
    expect(marker("JIMMY_DESKTOP_STOP_ACK").windows).toBe(0)
    expect(logs.stdout).toContain("JIMMY_SIDECAR_EXIT=0")
    await waitForPidExit(Number(node.pid))
    killOwned()
    expect(await exited).toBeNull()
    expect(child.signalCode).toBe("SIGKILL")
    await waitForPidExit(Number(main.pid))
    await waitForPortRefusal(port)
    // A real listener on the same owned port must fail even with both native PIDs gone.
    const survivor = createServer((socket) => socket.end())
    await new Promise<void>((resolve, reject) => {
      survivor.once("error", reject)
      survivor.listen(port, "127.0.0.1", resolve)
    })
    const survivorFailure = await (async () => {
      try {
        const failure = await waitForPortRefusal(port).then(() => undefined, (error: unknown) => String(error))
        expect(failure).toContain("Owned HTTP port still accepts TCP connections")
        return failure
      } finally {
        await new Promise<void>((resolve, reject) => survivor.close((error) => error ? reject(error) : resolve()))
      }
    })()
    const portClosed = await waitForPortRefusal(port)
    console.log(`JIMMY_DESKTOP_STOPPED=${JSON.stringify({ mainPID: main.pid, utilityPID: node.pid, portClosed, survivorFailure })}`)
    return { platform: process.platform, arch: process.arch, main, node, processes, loaded, requests, parentID: state.parent, childID: state.child, source: state.source, sourceOracle, finding: state.finding, document: state.document, report, transport, retained: retained[0], digest: hash(body), db: path.join(owned, "native.db"), portClosed, survivorFailure, stopped: true, fixtureReaped: "SIGKILL" }
  } finally {
    const providerPort = provider.port
    await provider.stop(true)
    clearTimeout(timeout)
    if (child.exitCode === null && child.signalCode === null) {
      child.stdin.write("stop\n")
      child.stdin.end()
      await Promise.race([exited, Bun.sleep(8000)])
      if (child.exitCode === null && child.signalCode === null) killOwned()
    }
    await exited
    await Promise.all(pids.map(waitForPidExit))
    await Promise.race([Promise.all(readers), Bun.sleep(1000)])
    stage("streams-before-destroy", { mutant })
    child.stdout.destroy()
    child.stderr.destroy()
    await Promise.allSettled(readers)
    stage("streams-after-destroy", { mutant })
    const portClosed = await waitForPortRefusal(port)
    if (providerPort === undefined) throw new Error("Owned provider port unavailable after shutdown")
    const providerClosed = await waitForPortRefusal(providerPort)
    writeSync(2, `JIMMY_DESKTOP_CLEANUP=${JSON.stringify({ mutant, pids, portClosed, providerClosed })}\n`)
    if (errors.length) console.error(`JIMMY_PROVIDER_ERRORS=${JSON.stringify(errors)}`)
    if (child.exitCode !== 0 && child.signalCode !== "SIGKILL") console.error(`JIMMY_PROCESS_LOGS=${JSON.stringify({ stdout: logs.stdout.slice(-4000), stderr: logs.stderr.slice(-4000) })}`)
  }
}

function assertSourceBytes(receipt: Research.SourceReceipt, metadata: Research.SourceReceipt, bytes: Buffer, expected: Buffer) {
  expect(receipt, "SQLite source receipt differs from read metadata").toEqual(metadata)
  if (!bytes.equals(expected)) throw new Error("Retained source bytes differ from fixture projection")
  if (bytes.byteLength !== receipt.bytes) throw new Error("Retained source byte length differs from SQLite receipt")
  if (hash(bytes) !== receipt.ref.digest) throw new Error("Retained source SHA256 differs from SQLite receipt")
}

function waitForPortRefusal(port: number, timeout = 3000) {
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error(`Invalid owned HTTP port: ${port}`)
  return new Promise<{ host: string; port: number; result: "ECONNREFUSED"; timeout: number }>((resolve, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port })
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error(`Owned HTTP port probe timed out: 127.0.0.1:${port}`))
    }, timeout)
    socket.once("connect", () => {
      clearTimeout(timer)
      socket.destroy()
      reject(new Error(`Owned HTTP port still accepts TCP connections: 127.0.0.1:${port}`))
    })
    socket.once("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      socket.destroy()
      if (error.code === "ECONNREFUSED") return resolve({ host: "127.0.0.1", port, result: "ECONNREFUSED", timeout })
      reject(new Error(`Owned HTTP port probe failed: ${String(error)}`))
    })
  })
}

// Like the desktop's own spawn sites, the host's build and typecheck children go through omni when it is on, so a
// run of this file alone meets the omni positive control (script/test-omni-control.ts) with real spawns.
async function command(cmd: string[], cwd: string, env: Record<string, string | undefined>, timeout: number) {
  if (DesktopOmni.enabled()) {
    const result = await DesktopOmni.execFile(cmd[0], cmd.slice(1), { cwd, env, timeout, killSignal: "SIGKILL", maxBuffer: 256 * 1024 * 1024 })
      .catch((error: Error & { code?: unknown; stdout?: string; stderr?: string }) => {
        throw new Error(`${cmd.join(" ")} failed (${String(error.code)}):\n${error.stdout ?? ""}\n${error.stderr ?? ""}`, { cause: error })
      })
    return result.stdout
  }
  const child = Bun.spawn(cmd, { cwd, env, stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout, killSignal: "SIGKILL" })
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  if (code !== 0) throw new Error(`${cmd.join(" ")} failed (${code}):\n${stdout}\n${stderr}`)
  return stdout
}

// Electron utility exit and the Xvfb wrapper's exit can precede OS PID reaping.
// Only ps's empty, successful selection failure establishes disappearance.
async function waitForPidExit(pid: number) {
  if (!Number.isInteger(pid) || pid <= 0) throw new Error(`Invalid owned PID: ${pid}`)
  const deadline = Date.now() + 3000
  while (true) {
    const observed = Bun.spawnSync(["ps", "-p", String(pid), "-o", "pid=,ppid=,stat=,args="], { stdout: "pipe", stderr: "pipe" })
    if (observed.exitCode === 1 && !observed.stdout.toString().trim() && !observed.stderr.toString().trim()) return
    if (observed.exitCode !== 0) throw new Error(`Cannot observe owned PID ${pid}: ${observed.stderr.toString()}`)
    if (Date.now() > deadline) throw new Error(`Owned PID not reaped after exit: ${observed.stdout.toString()}`)
    await Bun.sleep(25)
  }
}
