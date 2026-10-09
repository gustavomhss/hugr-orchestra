// Native Maestro Task pilot. Private oracle assertions are never loaded or copied into candidate source/context.
import path from "node:path"
import os from "node:os"
import { createHash } from "node:crypto"
import { Effect, Exit, Layer, Option, Schema } from "effect"

const args = process.argv.slice(2)
const option = (name: string) => {
  const index = args.indexOf(name)
  return index < 0 ? undefined : args[index + 1]
}
const caseID = option("--case") ?? "R01"
const inputs = option("--inputs")
const privateManifest = option("--manifest")
const runRoot = option("--run-root")
if (!inputs || !privateManifest || !runRoot || !/^R(?:0[1-9]|1[0-4])$/.test(caseID))
  throw new Error("Usage: research-pilot --case R01 --inputs <public-root> --manifest <private-manifest> --run-root <isolated-run-root>")

const Public = Schema.Struct({ fixtures: Schema.Array(Schema.Struct({ caseID: Schema.String, inputFiles: Schema.Array(Schema.String),
  sourceReferences: Schema.Array(Schema.Struct({ path: Schema.String, sha256: Schema.String })) })) })
const Private = Schema.Struct({ cases: Schema.Array(Schema.Struct({ caseID: Schema.String, prompt: Schema.String, status: Schema.String })) })
const fixture = Schema.decodeUnknownSync(Public)(await Bun.file(path.join(inputs, "manifest.json")).json()).fixtures.find((entry) => entry.caseID === caseID)
const question = Schema.decodeUnknownSync(Private)(await Bun.file(privateManifest).json()).cases.find((entry) => entry.caseID === caseID)
if (!fixture || !question || question.status !== "ready") throw new Error("Independent audition fixture is not ready")
const fs = await import("node:fs/promises")
const source = path.join(runRoot, "source")
const data = path.join(runRoot, "state")
await fs.mkdir(source, { recursive: true })
await fs.mkdir(data, { recursive: true })
const canonicalSource = await fs.realpath(source)
await Promise.all(fixture.inputFiles.map(async (file) => {
  if (path.isAbsolute(file) || file.split(/[\\/]/).some((part) => part === "..")) throw new Error("Unsafe disclosed input path")
  const bytes = new Uint8Array(await Bun.file(path.join(inputs, file)).arrayBuffer())
  const reference = fixture.sourceReferences.find((entry) => entry.path === file)
  if (!reference || createHash("sha256").update(bytes).digest("hex") !== reference.sha256) throw new Error("Disclosed source hash differs from frozen manifest")
  await fs.mkdir(path.dirname(path.join(source, file)), { recursive: true })
  await Bun.write(path.join(source, file), bytes)
}))
await Bun.write(path.join(source, "orchestra.json"), JSON.stringify({ model: "openai/gpt-6.1-sol", small_model: "openai/gpt-6.1-sol",
  enabled_providers: ["openai"], plugin: [], mcp: {}, lsp: false, formatter: false, compaction: { auto: false },
  agent: { jimmy: { model: "openai/gpt-6.1-sol" } },
}))
process.env.ORCHESTRA_DB = path.join(data, "native.db")
const { Auth } = await import("../src/auth")
const legacy = Schema.decodeUnknownSync(Schema.Struct({ openai: Auth.Oauth }))(await Bun.file(path.join(os.homedir(), ".local/share/opencode/auth.json")).json())
const checked = () => Effect.gen(function* () {
  if (legacy.openai.expires <= Date.now() + 60_000) return yield* new Auth.AuthError({ message: "Read-only pilot OAuth requires owner refresh" })
  return legacy.openai
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
  [Global.node, Global.layerWith({ data, log: path.join(data, "log") })]])
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
    const output = yield* task.execute(input, { sessionID: parent.id, messageID: assistant.id, callID, agent: maestro.name, agentID: "maestro",
      permission: maestro.permission, abort: AbortSignal.any([]), messages: [],
      extra: { model, promptOps: { prompt: prompt.prompt, cancel: prompt.cancel, resolvePromptParts: prompt.resolvePromptParts } },
      ask: (request) => permissions.ask({ ...request, sessionID: parent.id, tool: { messageID: assistant.id, callID }, ruleset: maestro.permission }).pipe(Effect.orDie),
      metadata: (value) => Effect.sync(() => { if (value.metadata) metadata.value = value.metadata }),
    }).pipe(Effect.exit)
    const children = yield* sessions.children(parent.id)
    const histories = yield* Effect.forEach(children, (child) => sessions.messages({ sessionID: child.id }))
    return { caseID, stage: "provisional-pilot", model: "openai/gpt-6.1-sol", startedAt, endedAt: Date.now(),
      limits: Research.Limits, parentSessionID: parent.id, output, metadata: metadata.value, histories, qualityGrade: "not-run" }
  }))
}).pipe(Effect.provide(layer))))
await Bun.write(path.join(data, "trial.json"), JSON.stringify(result))
const evaluation = {
  schema: "jimmy-pilot-evaluation-v1", caseID, stage: result.stage, model: result.model, startedAt, endedAt: result.endedAt,
  limits: result.limits, parentSessionID: result.parentSessionID, qualityGrade: "not-run",
  output: Exit.isSuccess(result.output) ? result.output.value : { failed: true }, metadata: result.metadata,
  trace: result.histories.flatMap((history) => history.filter((message) => message.info.role === "assistant").map((message) => ({
    messageID: message.info.id, sessionID: message.info.sessionID, finish: "finish" in message.info ? message.info.finish : undefined,
    tokens: "tokens" in message.info ? message.info.tokens : undefined,
    finalText: "finish" in message.info && message.info.finish === "stop" ? message.parts.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n") : undefined,
    tools: message.parts.flatMap((part) => {
      if (part.type !== "tool") return []
      const receipt = "metadata" in part.state ? Schema.decodeUnknownOption(Research.SourceReceipt)(part.state.metadata?.researchSource) : Option.none()
      const sourceReceipt = Option.isSome(receipt) && receipt.value.origin.kind === "file" &&
        path.resolve(receipt.value.origin.uri).startsWith(canonicalSource + path.sep) ? receipt.value : undefined
      return [{ tool: part.tool, callID: part.callID, status: part.state.status,
        ...(part.state.status === "error" ? { error: part.state.error } : {}),
        ...(sourceReceipt ? { sourceReceipt } : {}),
        inputPath: typeof part.state.input.filePath === "string" ? part.state.input.filePath : undefined,
      }]
    }),
  }))),
}
await Bun.write(path.join(data, "evaluation.json"), JSON.stringify(evaluation))
console.log(JSON.stringify({ caseID, model: "openai/gpt-6.1-sol", artifact: path.join(data, "evaluation.json"), qualityGrade: "not-run" }))
