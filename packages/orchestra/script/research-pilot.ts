// Native Maestro Task pilot. Private oracle assertions are never loaded or copied into candidate source/context.
import path from "node:path"
import os from "node:os"
import { createHash } from "node:crypto"
import { Effect, Exit, Layer, Option, Schema } from "effect"

if (Object.keys(process.env).some((key) => key.toUpperCase().startsWith("GIT_")))
  throw new Error("Pilot requires an unredirected Git environment; inherited GIT_* variables are not allowed")

const args = process.argv.slice(2)
const option = (name: string) => {
  const index = args.indexOf(name)
  return index < 0 ? undefined : args[index + 1]
}
const caseID = option("--case") ?? "R01"
const inputs = option("--inputs")
const privateManifest = option("--manifest")
const runRoot = option("--run-root")
const revision = option("--source-revision")
const timeoutMs = Number(option("--timeout-ms"))
const resumeTimeoutMs = Number(option("--resume-timeout-ms"))
const totalTimeoutMs = Number(option("--total-timeout-ms"))
const setupPath = option("--setup")
const engine = option("--engine")
const milliseconds = (value: number) => Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647
const flags = ["--case", "--inputs", "--manifest", "--run-root", "--source-revision", "--timeout-ms", "--resume-timeout-ms", "--total-timeout-ms", "--setup", "--engine"]
if (args.length % 2 || args.some((arg, index) => index % 2 === 0 && (!flags.includes(arg) || args.indexOf(arg) !== index)) ||
  args.some((arg, index) => index % 2 === 1 && arg.startsWith("--"))) throw new Error("Pilot CLI has unknown, duplicate or valueless options")
if (!inputs || !privateManifest || !runRoot || !revision || !/^[a-f0-9]{40}$/.test(revision) || !/^R(?:0[1-9]|1[0-4])$/.test(caseID) ||
  !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647)
  throw new Error("Usage: research-pilot --case R01 --inputs <public-root> --manifest <private-manifest> --run-root <new-isolated-run-root> --source-revision <full-source-sha> --timeout-ms <declared-dispatch-deadline-ms>")
if (caseID === "R14" && (!milliseconds(resumeTimeoutMs) || !milliseconds(totalTimeoutMs)))
  throw new Error("R14 requires --timeout-ms <first-dispatch-ms> --resume-timeout-ms <second-dispatch-ms> --total-timeout-ms <whole-attempt-ms>")
if (engine !== undefined && engine !== "claude-code") throw new Error("Pilot --engine accepts only claude-code; omit it for the original OpenAI path")
// Claude mode: Jimmy runs on the Claude Code engine, which the Claude Agent SDK authenticates with the machine's own Claude
// Code login; Maestro stays on Orchestra's loop with a free Zen model. The OpenAI OAuth loan is skipped entirely.
const claude = engine === "claude-code" ? { engine, jimmyModel: "anthropic/claude-opus-5-5", parentModel: "opencode/big-pickle",
  credential: "claude-code-machine-login; owned by the Claude Agent SDK, never read by the pilot" } : undefined
const jimmyModel = claude?.jimmyModel ?? "openai/gpt-6.1-sol"

const preparedAt = Date.now()
const fs = await import("node:fs/promises")
const repository = await fs.realpath(path.resolve(import.meta.dir, "../../.."))
const git = async (commands: string[]) => {
  const child = Bun.spawn(["git", ...commands], { cwd: repository, stdout: "pipe", stderr: "ignore" })
  const text = await new Response(child.stdout).text()
  if (await child.exited !== 0) throw new Error("Cannot acquire pilot source identity")
  return text.trim()
}
if (await git(["rev-parse", "HEAD"]) !== revision || await git(["status", "--porcelain", "--untracked-files=all"]))
  throw new Error("Pilot requires the frozen source revision and a clean checkout")
const publicRoot = await fs.realpath(inputs)
const privatePath = await fs.realpath(privateManifest)
const root = path.join(await fs.realpath(path.dirname(path.resolve(runRoot))), path.basename(path.resolve(runRoot)))
const inside = (directory: string, file: string) => file === directory || file.startsWith(directory + path.sep)
if (inside(publicRoot, privatePath) || inside(repository, privatePath) || inside(publicRoot, root) || inside(root, publicRoot) ||
  inside(repository, root) || inside(root, privatePath))
  throw new Error("Pilot inputs, private question and run state must have separate placement outside the checkout")

const Public = Schema.Struct({ fixtures: Schema.Array(Schema.Struct({ caseID: Schema.String, inputFiles: Schema.Array(Schema.String),
  sourceReferences: Schema.Array(Schema.Struct({ path: Schema.String, sha256: Schema.String })) })) })
const Private = Schema.Struct({ cases: Schema.Array(Schema.Struct({ caseID: Schema.String, prompt: Schema.String, status: Schema.String })) })
if (await fs.realpath(path.join(publicRoot, "manifest.json")) !== path.join(publicRoot, "manifest.json") ||
  !(await fs.lstat(path.join(publicRoot, "manifest.json"))).isFile()) throw new Error("Disclosed manifest must be a regular non-symlink file")
const manifestBytes = new Uint8Array(await Bun.file(path.join(publicRoot, "manifest.json")).arrayBuffer())
const manifestText = new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes)
const fixtures = Schema.decodeUnknownSync(Public)(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(manifestText)).fixtures
const questions = Schema.decodeUnknownSync(Private)(await Bun.file(privatePath).json()).cases
if (fixtures.filter((entry) => entry.caseID === caseID).length !== 1 || questions.filter((entry) => entry.caseID === caseID).length !== 1)
  throw new Error("Independent case selection is missing or ambiguous")
const fixture = fixtures.find((entry) => entry.caseID === caseID)
const question = questions.find((entry) => entry.caseID === caseID)
if (!fixture || !question || question.status !== "ready") throw new Error("Independent audition fixture is not ready")
if (!fixture.inputFiles.length || new Set(fixture.inputFiles.map((file) => file.toLowerCase())).size !== fixture.inputFiles.length)
  throw new Error("Disclosed inputs must be nonempty and have unique portable paths")
const source = path.join(root, "source")
const data = path.join(root, "state")
// Exclusive creation refuses both reuse and symlinks. Preserve failed setups as separate attempts.
await fs.mkdir(root, { mode: 0o700 })
await Promise.all(["source", "state", "home", "tmp", "config", "managed", "xdg-data", "xdg-cache", "xdg-config", "xdg-state", "toolkit"].map((dir) => fs.mkdir(path.join(root, dir), { mode: 0o700 })))
await fs.mkdir(path.join(data, "frozen-public"), { mode: 0o700 })
const canonicalSource = await fs.realpath(source)
const sources = await Promise.all(fixture.inputFiles.map(async (file) => {
  if (/[\\:<>"|?*\p{Cc}]/u.test(file) || file.startsWith("/") || file.split("/").some((part) => ["", ".", "..", ".git"].includes(part.toLowerCase()) || /[. ]$/.test(part)))
    throw new Error("Unsafe disclosed input path")
  const target = path.join(publicRoot, file)
  if (await fs.realpath(target) !== target || !(await fs.lstat(target)).isFile()) throw new Error("Disclosed input must be a regular non-symlink file")
  const bytes = new Uint8Array(await Bun.file(target).arrayBuffer())
  const references = fixture.sourceReferences.filter((entry) => entry.path === file)
  const digest = createHash("sha256").update(bytes).digest("hex")
  if (references.length !== 1 || digest !== references[0]?.sha256) throw new Error("Disclosed source hash differs from frozen manifest")
  await fs.mkdir(path.dirname(path.join(source, file)), { recursive: true })
  await fs.writeFile(path.join(source, file), bytes, { flag: "wx", mode: 0o600 })
  // Host-only archive is outside the child Location and its native external-directory read scope.
  await fs.writeFile(path.join(data, "frozen-public", createHash("sha256").update(file).digest("hex") + ".bytes"), bytes, { flag: "wx", mode: 0o400 })
  return { path: file, sha256: digest, bytes: bytes.length }
}))
const config = claude ? { model: claude.parentModel, small_model: claude.parentModel,
  // Zen serves its free models with the public key; nothing secret is written. Jimmy's Anthropic model is never resolved
  // through a provider: the engine hands it to the Claude Agent SDK, so no Anthropic API key is needed.
  // The Zen provider's id is the parent model's provider prefix.
  enabled_providers: [claude.parentModel.split("/")[0]], provider: { [claude.parentModel.split("/")[0]]: { options: { apiKey: "public" } } },
  plugin: [], mcp: {}, lsp: false, formatter: false, compaction: { auto: false },
  agent: { jimmy: { engine: claude.engine, model: claude.jimmyModel } },
} : { model: "openai/gpt-6.1-sol", small_model: "openai/gpt-6.1-sol",
  enabled_providers: ["openai"], plugin: [], mcp: {}, lsp: false, formatter: false, compaction: { auto: false },
  agent: { jimmy: { model: "openai/gpt-6.1-sol" } },
}
// Trusted operational setup is separate from disclosed evidence and never executes fixture config.
const Setup = Schema.Struct({
  snapshotGit: Schema.Boolean,
  scanner: Schema.optional(Schema.Struct({ command: Schema.String, sha256: Schema.String })),
  lsp: Schema.optional(Schema.Record(Schema.String, Schema.Struct({
    command: Schema.Array(Schema.String), sha256: Schema.String, extensions: Schema.Array(Schema.String),
    initialization: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  }))),
  atlas: Schema.optional(Schema.Struct({ projectID: Schema.String, directory: Schema.String, sourceDirectory: Schema.optional(Schema.String) })),
})
const setupFile = setupPath ? await fs.realpath(setupPath) : undefined
if (setupFile && (inside(publicRoot, setupFile) || inside(repository, setupFile) || inside(root, setupFile) ||
  await fs.realpath(path.resolve(setupPath ?? "")) !== path.resolve(setupPath ?? "") || !(await fs.lstat(setupFile)).isFile()))
  throw new Error("Trusted setup must be a regular non-symlink file outside disclosed inputs, checkout and run root")
const setupBytes = setupFile ? new Uint8Array(await Bun.file(setupFile).arrayBuffer()) : undefined
const setup = setupBytes ? Schema.decodeUnknownSync(Setup)(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(
  new TextDecoder("utf-8", { fatal: true }).decode(setupBytes)), { onExcessProperty: "error" }) : undefined
const binaries = await Promise.all([...(setup?.scanner ? [setup.scanner] : []), ...Object.values(setup?.lsp ?? {}).map((server) => ({ command: server.command[0], sha256: server.sha256 }))].map(async (binary) => {
  if (!binary.command || !path.isAbsolute(binary.command) || await fs.realpath(binary.command) !== binary.command ||
    !(await fs.lstat(binary.command)).isFile() || !/^[a-f0-9]{64}$/.test(binary.sha256) ||
    createHash("sha256").update(new Uint8Array(await Bun.file(binary.command).arrayBuffer())).digest("hex") !== binary.sha256)
    throw new Error("Trusted setup requires preprovisioned regular absolute executables matching their SHA-256")
  await fs.access(binary.command, fs.constants.X_OK)
  return binary
}))
if (setup?.scanner && path.basename(setup.scanner.command) !== (process.platform === "win32" ? "gitleaks.exe" : "gitleaks"))
  throw new Error("Trusted scanner must be the preprovisioned native gitleaks executable")
if (setup?.atlas && [setup.atlas.directory, setup.atlas.sourceDirectory ?? "."].some((file) => file !== "." &&
  (path.isAbsolute(file) || /[\\\p{Cc}]/u.test(file) || file.split("/").some((part) => ["", ".", ".."].includes(part)))))
  throw new Error("Trusted Atlas directories must stay inside the isolated disclosed source")
const sourceGit = async (commands: string[]) => {
  const child = Bun.spawn(["git", "-c", `core.hooksPath=${path.join(root, "config", "hooks-disabled")}`, ...commands], {
    cwd: source, stdout: "pipe", stderr: "pipe", env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: path.join(root, "config", "git-empty") },
  })
  const text = await new Response(child.stdout).text()
  const error = await new Response(child.stderr).text()
  if (await child.exited !== 0) throw new Error(`Isolated snapshot Git setup failed: ${error}`)
  return text.trim()
}
// Set module-level Global.Path/XDG consumers before importing any native runtime module.
// Capture the historical OAuth store before isolating HOME; its on-disk directory must not be renamed.
const credentialPath = path.join(os.homedir(), ".local/share", ["open", "code"].join(""), "auth.json")
Object.keys(process.env).filter((key) => key.toUpperCase().startsWith("ORCHESTRA_") || key.toUpperCase().startsWith("OTEL_")).forEach((key) => { delete process.env[key] })
Object.assign(process.env, {
  HOME: path.join(root, "home"), USERPROFILE: path.join(root, "home"), ORCHESTRA_TEST_HOME: path.join(root, "home"),
  XDG_DATA_HOME: path.join(root, "xdg-data"), XDG_CACHE_HOME: path.join(root, "xdg-cache"),
  XDG_CONFIG_HOME: path.join(root, "xdg-config"), XDG_STATE_HOME: path.join(root, "xdg-state"),
  TMPDIR: path.join(root, "tmp"), TMP: path.join(root, "tmp"), TEMP: path.join(root, "tmp"),
  ORCHESTRA_CONFIG_DIR: path.join(root, "config"), ORCHESTRA_TEST_MANAGED_CONFIG_DIR: path.join(root, "managed"),
  ORCHESTRA_CONFIG_CONTENT: JSON.stringify(config), ORCHESTRA_DISABLE_PROJECT_CONFIG: "1", ORCHESTRA_INHERIT_CREDENTIALS: "0",
  ORCHESTRA_DISABLE_EXTERNAL_SKILLS: "1", ORCHESTRA_DISABLE_CLAUDE_CODE: "1", ORCHESTRA_DISABLE_LSP_DOWNLOAD: "1",
  ORCHESTRA_PURE: "1", ORCHESTRA_DISABLE_AUTOUPDATE: "1",
})
if (claude) {
  // The Claude Agent SDK spawns Claude Code with this environment. Inherited Anthropic/Claude variables could swap the
  // machine login for an API key or another backend, so drop them unread. Claude Code finds the login Keychain through
  // $HOME and names the item's account from $USER, so both carry real values; Orchestra state stays isolated
  // (ORCHESTRA_TEST_HOME, XDG_*), Claude Code state goes to CLAUDE_CONFIG_DIR, and the empty secure-storage directory keeps
  // Claude Code on its unsuffixed login item. Side effect: "~" in permission patterns means the real home.
  Object.keys(process.env).filter((key) => /^(ANTHROPIC_|CLAUDE)/i.test(key)).forEach((key) => { delete process.env[key] })
  Object.assign(process.env, { HOME: os.userInfo().homedir, USER: os.userInfo().username, CLAUDE_CONFIG_DIR: path.join(root, "claude"),
    CLAUDE_SECURESTORAGE_CONFIG_DIR: "" })
  await fs.mkdir(path.join(root, "claude"), { mode: 0o700 })
}
// Native Memory falls back to this actual scanner. The Effect toolkit target below refuses implicit installs.
process.env.BACKEND_TOOLKIT_ROOT = path.join(root, "toolkit")
process.env.ORCHESTRA_DB = path.join(data, "native.db")
if (setup?.scanner) process.env.PATH = path.dirname(setup.scanner.command) + path.delimiter + process.env.PATH
const lsp = setup?.lsp ? await (async () => {
  const servers = await import("../src/lsp/server")
  return { ...Object.fromEntries(Object.values(servers).filter((server) => typeof server === "object" && "id" in server).map((server) => [server.id, { disabled: true }])),
    ...Object.fromEntries(Object.entries(setup.lsp ?? {}).map(([id, server]) => [id, { command: server.command, extensions: server.extensions, initialization: server.initialization }])) }
})() : false
const operationalConfig = { ...config, lsp, ...(setup?.atlas ? { maestro: { atlas: setup.atlas } } : {}) }
process.env.ORCHESTRA_CONFIG_CONTENT = JSON.stringify(operationalConfig)
await fs.writeFile(path.join(root, "config", "git-empty"), "", { flag: "wx", mode: 0o600 })
// This is a new snapshot commit, not supplied historical or deployed-build identity.
const sourceSnapshotRevision = setup?.snapshotGit ? await (async () => {
  await sourceGit(["init", "--template=", "--initial-branch=evaluation"])
  await sourceGit(["add", "-f", "--", ...fixture.inputFiles])
  await sourceGit(["-c", "user.name=Evaluation", "-c", "user.email=evaluation@invalid", "-c", "commit.gpgsign=false", "commit", "-m", "Disclosed evaluation snapshot"])
  return sourceGit(["rev-parse", "HEAD"])
})() : undefined
// The native macOS preference reader has no isolation override; refuse inherited MDM config.
if (process.platform === "darwin" && (await Promise.all([
  path.join("/Library/Managed Preferences", os.userInfo().username, "ai.hugr.orchestra.managed.plist"),
  "/Library/Managed Preferences/ai.hugr.orchestra.managed.plist",
].map((file) => fs.lstat(file).then(() => true, (error: NodeJS.ErrnoException) => {
  if (error.code === "ENOENT") return false
  throw error
})))).some(Boolean)) throw new Error("Pilot cannot isolate native macOS managed preferences on this host")
const skillFiles = (await git(["ls-files", "packages/jimmy-specialist/skills"])).split("\n").filter(Boolean)
if (!["jimmy-discovery", "jimmy-research"].every((skill) => skillFiles.includes(`packages/jimmy-specialist/skills/${skill}/SKILL.md`)))
  throw new Error("Pilot cannot identify the declared source skill entries")
const { Research } = await import("@orchestra/schema/research")
const identity = {
  sourceRevision: revision, sourceClean: true, runtime: "source-bun", bun: Bun.version, platform: process.platform, arch: process.arch,
  executableSha256: createHash("sha256").update(new Uint8Array(await Bun.file(process.execPath).arrayBuffer())).digest("hex"),
  runnerSha256: createHash("sha256").update(new Uint8Array(await Bun.file(import.meta.path).arrayBuffer())).digest("hex"),
  lockSha256: createHash("sha256").update(new Uint8Array(await Bun.file(path.join(repository, "bun.lock")).arrayBuffer())).digest("hex"),
  promptSha256: createHash("sha256").update(new Uint8Array(await Bun.file(path.join(repository, "packages/orchestra/src/agent/prompt/jimmy.txt")).arrayBuffer())).digest("hex"),
  publicManifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
  questionSha256: createHash("sha256").update(question.prompt).digest("hex"), sources,
  skillFiles: await Promise.all(skillFiles.map(async (file) => ({
    path: file, sha256: createHash("sha256").update(new Uint8Array(await Bun.file(path.join(repository, file)).arrayBuffer())).digest("hex"),
  }))),
  config: operationalConfig, configSha256: createHash("sha256").update(JSON.stringify(operationalConfig)).digest("hex"),
  setupSha256: setupBytes ? createHash("sha256").update(setupBytes).digest("hex") : null, binaries, sourceSnapshotRevision,
  continuationRunnerSha256: createHash("sha256").update(new Uint8Array(await Bun.file(path.join(import.meta.dir, "research-continuation.ts")).arrayBuffer())).digest("hex"),
  retainedReaderSha256: createHash("sha256").update(new Uint8Array(await Bun.file(path.join(import.meta.dir, "research-retained.ts")).arrayBuffer())).digest("hex"),
  // Claude mode only, so the original OpenAI identity serializes unchanged. sourceRevision pins the engine and SDK.
  ...(claude ? { engine: claude } : {}),
}
await fs.writeFile(path.join(data, "preparation.json"), JSON.stringify({ caseID, preparedAt, timeoutMs, stage: "provisional-pilot", identity,
  resumeTimeoutMs: caseID === "R14" ? resumeTimeoutMs : undefined, totalTimeoutMs: caseID === "R14" ? totalTimeoutMs : undefined,
  dispatchCeilings: caseID === "R14" ? [{ dispatch: 1, timeoutMs, ...Research.Limits }, { dispatch: 2, timeoutMs: resumeTimeoutMs, ...Research.Limits }] : undefined,
  setup: { atlas: setup?.atlas ? "configured-unqualified" : "unconfigured", lsp: lsp ? "configured-unqualified" : "disabled",
    continuation: caseID === "R14" ? "native-interruption" : "not-requested", scanner: setup?.scanner ? "hashed-fallback-unqualified" : "unprovisioned",
    isolation: "state/config placement; not an OS sandbox" },
  qualityGrade: "not-run" }), { flag: "wx", mode: 0o600 })
const { Auth } = await import("../src/auth")
const legacy = claude ? undefined : Schema.decodeUnknownSync(Schema.Struct({ openai: Auth.Oauth }))(await Bun.file(credentialPath).json())
const checked = () => Effect.gen(function* () {
  if (!legacy?.openai.access.trim() || legacy.openai.expires <= Date.now() + 60_000)
    return yield* new Auth.AuthError({ message: "Read-only pilot OAuth requires owner refresh" })
  return { ...legacy.openai }
})
const readonly = Auth.Service.of({
  get: (provider) => provider === "openai" ? checked() : Effect.succeed(undefined),
  all: () => checked().pipe(Effect.map((openai) => ({ openai }))),
  set: () => Effect.fail(new Auth.AuthError({ message: "Pilot cannot update inherited OAuth" })),
  remove: () => Effect.fail(new Auth.AuthError({ message: "Pilot cannot remove inherited OAuth" })),
})
// Claude mode holds no Orchestra credential at all: Zen's public key is config, and the SDK owns the Claude Code login.
const sealed = Auth.Service.of({
  get: () => Effect.succeed(undefined),
  all: () => Effect.succeed({}),
  set: () => Effect.fail(new Auth.AuthError({ message: "Pilot cannot store credentials" })),
  remove: () => Effect.fail(new Auth.AuthError({ message: "Pilot cannot remove credentials" })),
})
const { AppNodeBuilderV1 } = await import("../src/effect/app-node-builder-v1")
const { LayerNode } = await import("@orchestra/core/effect/layer-node")
const { Global } = await import("@orchestra/core/global")
const { Agent } = await import("../src/agent/agent")
const { Provider } = await import("../src/provider/provider")
const { ProviderV2 } = await import("@orchestra/core/provider")
const { ModelV2 } = await import("@orchestra/core/model")
const { Session } = await import("../src/session/session")
const { SessionProjector } = await import("@orchestra/core/session/projector")
const { SessionPrompt } = await import("../src/session/prompt")
const { ToolRegistry } = await import("../src/tool/registry")
const { Permission } = await import("../src/permission")
const { InstanceStore } = await import("../src/project/instance-store")
const { MessageID, PartID } = await import("../src/session/schema")
const { BackendToolkit } = await import("@orchestra/core/backend-toolkit")
const { ResearchContinuation } = await import("./research-continuation")
const observation = ResearchContinuation.observe()
const layer = AppNodeBuilderV1.build(LayerNode.group([Agent.node, Provider.node, Session.node, SessionProjector.node, SessionPrompt.node,
  ToolRegistry.node, Permission.node, InstanceStore.node, ResearchContinuation.node]), [[Auth.node, Layer.succeed(Auth.Service, claude ? sealed : readonly)],
  ...(caseID === "R14" ? [observation.replacement] : []),
  [Global.node, Global.layerWith({ data, log: path.join(data, "log"), repos: path.join(data, "repos") })]])
const startedAt = Date.now()
const result = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
  const instances = yield* InstanceStore.Service
  return yield* instances.provide({ directory: source }, Effect.gen(function* () {
    const sessions = yield* Session.Service
    const prompt = yield* SessionPrompt.Service
    const agents = yield* Agent.Service
    const provider = yield* Provider.Service
    const registry = yield* ToolRegistry.Service
    const permissions = yield* Permission.Service
    // Maestro's model; in the original path it is also Jimmy's.
    const parentModel = claude ? Provider.parseModel(claude.parentModel) : { providerID: ProviderV2.ID.make("openai"), modelID: ModelV2.ID.make("gpt-6.1-sol") }
    const model = yield* provider.getModel(parentModel.providerID, parentModel.modelID)
    const maestro = yield* agents.get("maestro")
    const specialist = yield* agents.get("jimmy")
    if (claude && (specialist.engine !== "claude-code" || `${specialist.model?.providerID}/${specialist.model?.modelID}` !== claude.jimmyModel ||
      maestro.engine !== undefined)) throw new Error("Claude mode requires Jimmy on claude-code with the selected model and Maestro on Orchestra's loop")
    const tools = yield* registry.tools({ agent: specialist,
      ...(claude ? Provider.parseModel(claude.jimmyModel) : { providerID: model.providerID, modelID: model.id }) })
    const parent = yield* sessions.create({ agent: "maestro", title: `Independent ${caseID} pilot authority` })
    const user = yield* sessions.updateMessage({ id: MessageID.ascending(), sessionID: parent.id, role: "user", agent: "maestro",
      model: { providerID: model.providerID, modelID: model.id }, time: { created: Date.now() } })
    const assistant = yield* sessions.updateMessage({ id: MessageID.ascending(), sessionID: parent.id, parentID: user.id,
      role: "assistant", agent: "maestro", mode: "maestro", path: { cwd: source, root: source }, providerID: model.providerID, modelID: model.id,
      cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, time: { created: Date.now() } })
    const task = (yield* registry.tools({ agent: maestro, providerID: model.providerID, modelID: model.id })).find((tool) => tool.id === "task")
    if (!task) throw new Error("Native Maestro Task is unavailable")
    const input = { description: `${caseID} independent pilot`, prompt: `${question.prompt}\n\nSupplied source scope: ${fixture.inputFiles.join(", ")}. Use supplied retained source snapshots.${caseID === "R14" ? ResearchContinuation.protocol : ""}`,
      subagent_type: "jimmy", model: jimmyModel }
    const call = (input: Record<string, unknown>, callID: string, deadlineMs: number) => Effect.gen(function* () {
      const part = { id: PartID.ascending(), sessionID: parent.id, messageID: assistant.id, type: "tool" as const, tool: "task", callID,
        state: { status: "running" as const, input, time: { start: Date.now() } } }
      yield* sessions.updatePart(part)
      const metadata: { value: Record<string, unknown> } = { value: {} }
      const dispatchStartedAt = Date.now()
      const abort = AbortSignal.timeout(deadlineMs)
      return { metadata, abort, part, startedAt: dispatchStartedAt, deadlineAt: dispatchStartedAt + deadlineMs,
        run: task.execute(input, { sessionID: parent.id, messageID: assistant.id, callID, agent: maestro.name, agentID: "maestro",
          permission: maestro.permission, abort, messages: [],
          extra: { model, promptOps: { prompt: prompt.prompt, cancel: prompt.cancel, resolvePromptParts: prompt.resolvePromptParts } },
          ask: (request) => permissions.ask({ ...request, sessionID: parent.id, tool: { messageID: assistant.id, callID }, ruleset: maestro.permission }).pipe(Effect.orDie),
          metadata: (value) => Effect.gen(function* () {
            if (!value.metadata) return
            metadata.value = value.metadata
            yield* sessions.updatePart({ ...part, state: { ...part.state, metadata: value.metadata } })
          }),
        }) }
    })
    if (caseID === "R14" && Date.now() >= preparedAt + totalTimeoutMs) throw new Error("total-wall-clock-exhausted before first native dispatch")
    const first = yield* call(input, `pilot-${caseID}-first`, caseID === "R14" ? Math.max(1, Math.min(timeoutMs, preparedAt + totalTimeoutMs - Date.now())) : timeoutMs)
    const continuation = caseID === "R14" ? yield* ResearchContinuation.run({ first, call, input, observation, parent,
      preparedAt, totalTimeoutMs, resumeTimeoutMs, source, sources, data, scannerConfigured: !!setup?.scanner }) : undefined
    const output = continuation ? continuation.output : yield* first.run.pipe(Effect.exit)
    const deadlineSignaled = continuation?.deadlineSignaled ?? first.abort.aborted
    const children = yield* sessions.children(parent.id)
    const histories = yield* Effect.forEach(children, (child) => sessions.messages({ sessionID: child.id }))
    return { caseID, stage: "provisional-pilot", model: jimmyModel, startedAt, endedAt: Date.now(),
      limits: Research.Limits, timeoutMs, deadlineSignaled, parentSessionID: parent.id, output, metadata: continuation?.metadata ?? first.metadata.value, histories, qualityGrade: "not-run",
      continuation,
      identity: { ...identity, effectivePromptSha256: createHash("sha256").update(specialist.prompt ?? "").digest("hex"),
        tools: tools.map((tool) => tool.id).toSorted(), temperature: specialist.temperature ?? null, topP: specialist.topP ?? null,
        variant: specialist.variant ?? null, agentOptions: specialist.options,
        // In Claude mode `model` is Maestro's Zen model, not Jimmy's; Claude Code owns Jimmy's limits and billing.
        modelLimits: claude ? null : model.limit, modelCostRates: claude ? null : model.cost } }
  }))
}).pipe(Effect.provide(layer), Effect.provideService(BackendToolkit.Target, { unsupported: "evaluation-no-implicit-install" }))))
await fs.writeFile(path.join(data, "trial.json"), JSON.stringify(result), { flag: "wx", mode: 0o600 })
const evaluation = {
  schema: "jimmy-pilot-evaluation-v2", caseID, stage: result.stage, model: result.model, preparedAt, startedAt, endedAt: result.endedAt,
  identity: result.identity, timeoutMs, deadlineSignaled: result.deadlineSignaled,
  terminal: result.continuation?.blocker ?? (Exit.isSuccess(result.output) ? "task-returned" : "task-failed"),
  continuation: result.continuation ? ResearchContinuation.project(result.continuation) : undefined,
  usage: { scope: "retained direct-child assistant step-finish records; native-normalized, not provider billing",
    missingProviderUsage: "unknown; native normalization can replace missing fields with zero",
    providerAggregate: null, totalTokens: null, totalCost: null, maintenanceUsage: null, repairUsage: null,
    setupMilliseconds: startedAt - preparedAt, dispatchMilliseconds: result.endedAt - startedAt, humanRescue: null },
  limits: result.limits, parentSessionID: result.parentSessionID, qualityGrade: "not-run",
  output: Exit.isSuccess(result.output) ? result.output.value : { failed: true }, metadata: result.metadata,
  trace: result.histories.flatMap((history) => history.filter((message) => message.info.role === "assistant").map((message) => ({
    messageID: message.info.id, sessionID: message.info.sessionID, finish: "finish" in message.info ? message.info.finish : undefined,
    tokens: "tokens" in message.info ? message.info.tokens : undefined,
    steps: message.parts.flatMap((part) => part.type === "step-finish" ? [{ reason: part.reason, tokens: part.tokens, nativeCostEstimate: part.cost }] : []),
    finalText: "finish" in message.info && message.info.finish === "stop" ? message.parts.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n") : undefined,
    tools: message.parts.flatMap((part) => {
      if (part.type !== "tool") return []
      const receipt = "metadata" in part.state ? Schema.decodeUnknownOption(Research.SourceReceipt)(part.state.metadata?.researchSource) : Option.none()
      const sourceReceipt = Option.getOrUndefined(receipt)
      const disclosed = sourceReceipt?.origin.kind === "file" && fixture.inputFiles.some((file) => path.join(canonicalSource, file) === sourceReceipt.origin.uri)
      const nativeSkill = sourceReceipt?.origin.kind === "file" && skillFiles.some((file) => path.join(repository, file) === sourceReceipt.origin.uri)
      const inputPath = typeof part.state.input.filePath === "string" ? part.state.input.filePath :
        typeof part.state.input.path === "string" ? part.state.input.path : undefined
      return [{ tool: part.tool, callID: part.callID, status: part.state.status,
        ...(part.state.status === "error" ? { error: part.state.error } : {}),
        ...(sourceReceipt && (disclosed || nativeSkill || sourceReceipt.origin.kind !== "file") ? { sourceReceipt } : {}),
        receiptDisclosure: sourceReceipt ? disclosed ? "disclosed-input" : nativeSkill ? "native-skill" : sourceReceipt.origin.kind === "file" ? "undisclosed-file" : "non-file" :
          "metadata" in part.state && part.state.metadata?.researchSource ? "invalid-receipt" : "no-receipt",
        inputPath: inputPath && (fixture.inputFiles.find((file) => inputPath === file || inputPath === path.join(canonicalSource, file)) ??
          skillFiles.find((file) => inputPath === path.join(repository, file))),
        pathDisclosure: inputPath ? fixture.inputFiles.some((file) => inputPath === file || inputPath === path.join(canonicalSource, file)) ? "disclosed-input" :
          skillFiles.some((file) => inputPath === path.join(repository, file)) ? "native-skill" : "undisclosed-path" : "no-path",
      }]
    }),
  }))),
}
await fs.writeFile(path.join(data, "evaluation.json"), JSON.stringify(evaluation), { flag: "wx", mode: 0o600 })
console.log(JSON.stringify({ caseID, model: jimmyModel, artifact: path.join(data, "evaluation.json"), qualityGrade: "not-run" }))
