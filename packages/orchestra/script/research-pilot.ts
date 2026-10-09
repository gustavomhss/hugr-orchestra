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
if (!inputs || !privateManifest || !runRoot || !revision || !/^[a-f0-9]{40}$/.test(revision) || !/^R(?:0[1-9]|1[0-4])$/.test(caseID) ||
  !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647)
  throw new Error("Usage: research-pilot --case R01 --inputs <public-root> --manifest <private-manifest> --run-root <new-isolated-run-root> --source-revision <full-source-sha> --timeout-ms <declared-dispatch-deadline-ms>")
if (caseID === "R14") throw new Error("R14 requires evaluator-owned real interruption/compaction and strict Task resume; fresh-dispatch pilot cannot execute it")

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
await fs.mkdir(source, { recursive: true })
await fs.mkdir(data, { recursive: true })
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
  return { path: file, sha256: digest, bytes: bytes.length }
}))
const config = { model: "openai/gpt-6.1-sol", small_model: "openai/gpt-6.1-sol",
  enabled_providers: ["openai"], plugin: [], mcp: {}, lsp: false, formatter: false, compaction: { auto: false },
  agent: { jimmy: { model: "openai/gpt-6.1-sol" } },
}
// Set module-level Global.Path/XDG consumers before importing any native runtime module.
const credentialPath = path.join(os.homedir(), ".local/share/opencode/auth.json")
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
await Promise.all(["home", "tmp", "config", "managed"].map((dir) => fs.mkdir(path.join(root, dir))))
// The native macOS preference reader has no isolation override; refuse inherited MDM config.
if (process.platform === "darwin" && (await Promise.all([
  path.join("/Library/Managed Preferences", os.userInfo().username, "ai.hugr.orchestra.managed.plist"),
  "/Library/Managed Preferences/ai.hugr.orchestra.managed.plist",
].map((file) => fs.lstat(file).then(() => true, (error: NodeJS.ErrnoException) => {
  if (error.code === "ENOENT") return false
  throw error
})))).some(Boolean)) throw new Error("Pilot cannot isolate native macOS managed preferences on this host")
process.env.ORCHESTRA_DB = path.join(data, "native.db")
const skillFiles = (await git(["ls-files", "packages/jimmy-specialist/skills"])).split("\n").filter(Boolean)
if (!["jimmy-discovery", "jimmy-research"].every((skill) => skillFiles.includes(`packages/jimmy-specialist/skills/${skill}/SKILL.md`)))
  throw new Error("Pilot cannot identify the declared source skill entries")
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
  config, configSha256: createHash("sha256").update(JSON.stringify(config)).digest("hex"),
}
await fs.writeFile(path.join(data, "preparation.json"), JSON.stringify({ caseID, preparedAt, timeoutMs, stage: "provisional-pilot", identity,
  setup: { atlas: "unconfigured", lsp: "disabled", continuation: "unsupported", isolation: "state/config placement; not an OS sandbox" },
  qualityGrade: "not-run" }), { flag: "wx", mode: 0o600 })
const { Auth } = await import("../src/auth")
const legacy = Schema.decodeUnknownSync(Schema.Struct({ openai: Auth.Oauth }))(await Bun.file(credentialPath).json())
const checked = () => Effect.gen(function* () {
  if (!legacy.openai.access.trim() || legacy.openai.expires <= Date.now() + 60_000)
    return yield* new Auth.AuthError({ message: "Read-only pilot OAuth requires owner refresh" })
  return { ...legacy.openai }
})
const readonly = Auth.Service.of({
  get: (provider) => provider === "openai" ? checked() : Effect.succeed(undefined),
  all: () => checked().pipe(Effect.map((openai) => ({ openai }))),
  set: () => Effect.fail(new Auth.AuthError({ message: "Pilot cannot update inherited OAuth" })),
  remove: () => Effect.fail(new Auth.AuthError({ message: "Pilot cannot remove inherited OAuth" })),
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
const { Research } = await import("@orchestra/schema/research")
const layer = AppNodeBuilderV1.build(LayerNode.group([Agent.node, Provider.node, Session.node, SessionProjector.node, SessionPrompt.node,
  ToolRegistry.node, Permission.node, InstanceStore.node]), [[Auth.node, Layer.succeed(Auth.Service, readonly)],
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
    const model = yield* provider.getModel(ProviderV2.ID.make("openai"), ModelV2.ID.make("gpt-6.1-sol"))
    const maestro = yield* agents.get("maestro")
    const specialist = yield* agents.get("jimmy")
    const tools = yield* registry.tools({ agent: specialist, providerID: model.providerID, modelID: model.id })
    const parent = yield* sessions.create({ agent: "maestro", title: `Independent ${caseID} pilot authority` })
    const user = yield* sessions.updateMessage({ id: MessageID.ascending(), sessionID: parent.id, role: "user", agent: "maestro",
      model: { providerID: model.providerID, modelID: model.id }, time: { created: Date.now() } })
    const assistant = yield* sessions.updateMessage({ id: MessageID.ascending(), sessionID: parent.id, parentID: user.id,
      role: "assistant", agent: "maestro", mode: "maestro", path: { cwd: source, root: source }, providerID: model.providerID, modelID: model.id,
      cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, time: { created: Date.now() } })
    const task = (yield* registry.tools({ agent: maestro, providerID: model.providerID, modelID: model.id })).find((tool) => tool.id === "task")
    if (!task) throw new Error("Native Maestro Task is unavailable")
    const callID = `pilot-${caseID}`
    const input = { description: `${caseID} independent pilot`, prompt: `${question.prompt}\n\nSupplied source scope: ${fixture.inputFiles.join(", ")}. Use supplied retained source snapshots.`,
      subagent_type: "jimmy", model: "openai/gpt-6.1-sol" }
    yield* sessions.updatePart({ id: PartID.ascending(), sessionID: parent.id, messageID: assistant.id, type: "tool", tool: "task", callID,
      state: { status: "running", input, time: { start: Date.now() } } })
    const metadata: { value: Record<string, unknown> } = { value: {} }
    const abort = AbortSignal.timeout(timeoutMs)
    const output = yield* task.execute(input, { sessionID: parent.id, messageID: assistant.id, callID, agent: maestro.name, agentID: "maestro",
      permission: maestro.permission, abort, messages: [],
      extra: { model, promptOps: { prompt: prompt.prompt, cancel: prompt.cancel, resolvePromptParts: prompt.resolvePromptParts } },
      ask: (request) => permissions.ask({ ...request, sessionID: parent.id, tool: { messageID: assistant.id, callID }, ruleset: maestro.permission }).pipe(Effect.orDie),
      metadata: (value) => Effect.sync(() => { if (value.metadata) metadata.value = value.metadata }),
    }).pipe(Effect.exit)
    const deadlineSignaled = abort.aborted
    const children = yield* sessions.children(parent.id)
    const histories = yield* Effect.forEach(children, (child) => sessions.messages({ sessionID: child.id }))
    return { caseID, stage: "provisional-pilot", model: "openai/gpt-6.1-sol", startedAt, endedAt: Date.now(),
      limits: Research.Limits, timeoutMs, deadlineSignaled, parentSessionID: parent.id, output, metadata: metadata.value, histories, qualityGrade: "not-run",
      identity: { ...identity, effectivePromptSha256: createHash("sha256").update(specialist.prompt ?? "").digest("hex"),
        tools: tools.map((tool) => tool.id).toSorted(), temperature: specialist.temperature ?? null, topP: specialist.topP ?? null,
        variant: specialist.variant ?? null, agentOptions: specialist.options,
        modelLimits: model.limit, modelCostRates: model.cost } }
  }))
}).pipe(Effect.provide(layer))))
await fs.writeFile(path.join(data, "trial.json"), JSON.stringify(result), { flag: "wx", mode: 0o600 })
const evaluation = {
  schema: "jimmy-pilot-evaluation-v2", caseID, stage: result.stage, model: result.model, preparedAt, startedAt, endedAt: result.endedAt,
  identity: result.identity, timeoutMs, deadlineSignaled: result.deadlineSignaled,
  terminal: Exit.isSuccess(result.output) ? "task-returned" : "task-failed",
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
console.log(JSON.stringify({ caseID, model: "openai/gpt-6.1-sol", artifact: path.join(data, "evaluation.json"), qualityGrade: "not-run" }))
