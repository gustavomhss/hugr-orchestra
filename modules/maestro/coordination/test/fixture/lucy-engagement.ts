import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { LLMClient, LLMEvent, Model, type LLMError, type LLMRequest } from "@orchestra/llm"
import { route } from "@orchestra/llm/protocols/openai-chat"
import { AgentV2 } from "@orchestra/core/agent"
import { Config } from "@orchestra/core/config"
import { ConfigCompaction } from "@orchestra/core/config/compaction"
import { Database } from "@orchestra/core/database/database"
import { Node } from "@orchestra/core/effect/app-node"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNodePlatform } from "@orchestra/core/effect/app-node-platform"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { GitCli } from "@orchestra/core/git-cli"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import { locationServices, type LocationServices } from "@orchestra/core/location-services"
import { ModelV2 } from "@orchestra/core/model"
import { ModelsDev } from "@orchestra/core/models-dev"
import { PermissionV2 } from "@orchestra/core/permission"
import { AppProcess } from "@orchestra/core/process"
import { ProviderV2 } from "@orchestra/core/provider"
import { ReferenceGuidance } from "@orchestra/core/reference/guidance"
import { CodeIndexBuild } from "@orchestra/core/research-toolkit/code-index/build"
import { CodeIndexShard } from "@orchestra/core/research-toolkit/code-index/shard"
import { CodeIndexStore } from "@orchestra/core/research-toolkit/code-index/store"
import { ResearchToolkit } from "@orchestra/core/research-toolkit/index"
import { ReviewRouting } from "@orchestra/core/review/routing"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionSchema, SessionStore, SessionV2 } from "@orchestra/core/session"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionExecutionLocal } from "@orchestra/core/session/execution/local"
import { SessionRunnerModel } from "@orchestra/core/session/runner/model"
import { SessionMessage } from "@orchestra/core/session/message"
import { SkillV2 } from "@orchestra/core/skill"
import { SkillGuidance } from "@orchestra/core/skill/guidance"
import { Snapshot } from "@orchestra/core/snapshot"
import { SystemContext } from "@orchestra/core/system-context"
import { SystemContextRegistry } from "@orchestra/core/system-context/registry"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { fragmentFixture, systemContextLayer } from "@orchestra/core/test/session-runner-harness"
import { Context, Effect, Layer, Schema, Stream } from "effect"
import { nativeProfiles } from "../../src/roster"
import { GovernanceBackgroundV2 } from "../../src/v2/governance/background"
import { ReviewResultV2 } from "../../src/v2/governance/review-result"
import { MaestroSeatsV2 } from "../../src/v2/seats"
import { MaestroToolsV2 } from "../../src/v2/tools"
import { MaestroReviewTools } from "../../src/v2/tools/review"
import { ReviewFanoutV2 } from "../../src/v2/workflow/review-fanout"
import { authoredSkills } from "./lucy-pr-entry"
import { worktree } from "./v2-governance"

export const sourcePath = "src/a.ts"
export const sourceText = 'export const sharedValue = "ENGAGEMENT-IN-SCOPE"\n'
export const outsidePath = "outside/private.ts"
export const outsideText = 'export const sharedValue = "ENGAGEMENT-OUTSIDE"\n'

export type RequestLog = { readonly sessionID: string; readonly text: string }
export type Controls = {
  readonly stream?: (log: RequestLog, request: LLMRequest) => Stream.Stream<LLMEvent, LLMError>
  /** Observes real Git; a suspended callback pauses the call before it is forwarded. */
  readonly onGit?: (args: readonly string[]) => void | Effect.Effect<void>
  readonly onConfig?: () => void | Effect.Effect<void>
}

type State = {
  readonly directory: string
  readonly base: string
  readonly head: string
  readonly filename: string
  readonly global: Global.Interface
  readonly storeRoot: string
  readonly parentID: SessionSchema.ID
  readonly requests: RequestLog[]
  readonly skills: ReadonlyArray<SkillV2.Info>
  readonly cli: GitCli.Interface
  readonly git: (...args: string[]) => Effect.Effect<string>
}

export type Fixture = Omit<State, "cli"> & { readonly open: ReturnType<typeof opener> }
export type Ctx = {
  readonly parent: SessionSchema.Info
  readonly registry: ToolRegistry.Interface
  readonly sessions: SessionV2.Interface
  readonly store: SessionStore.Interface
  readonly database: Database.Interface
  readonly db: Database.Interface["db"]
  readonly context: Context.Context<LocationServices>
  readonly execution: SessionExecution.Interface
  readonly permissions: PermissionV2.Interface
  readonly prepareIndex: () => ReturnType<typeof prepared>
  readonly invoke: (input: unknown, agent?: string, sessionID?: SessionSchema.ID) => ReturnType<typeof registered>
  readonly call: (name: string, input: unknown, agent?: string, sessionID?: SessionSchema.ID) => ReturnType<typeof registered>
}

const model = Model.make({ id: "fake-model", provider: "fake", route })
const modelRef = { id: ModelV2.ID.make("fake-model"), providerID: ProviderV2.ID.make("fake") }

/** Repository and SQLite files outlive each independently scoped application graph. */
export function run<A, E, R>(body: (ctx: Fixture) => Effect.Effect<A, E, R>) {
  return Effect.scoped(Effect.gen(function* () {
    const root = yield* worktree
    const directory = path.join(root, "repository")
    const global = Global.make({
      home: path.join(root, "home"), data: path.join(root, "data"), cache: path.join(root, "cache"),
      config: path.join(root, "config"), state: path.join(root, "state"), tmp: path.join(root, "tmp"),
      bin: path.join(root, "cache", "bin"), log: path.join(root, "data", "log"), repos: path.join(root, "data", "repos"),
    })
    yield* Effect.forEach([directory, ...Object.values(global), path.join(directory, "src"), path.join(directory, "outside")],
      (value) => Effect.promise(() => fs.mkdir(value, { recursive: true })), { discard: true })
    const cli = yield* GitCli.Service
    const git = (...args: string[]) => cli.run([
      "-c", "user.email=engagement@example.com", "-c", "user.name=Engagement", "-c", "commit.gpgsign=false",
      "-c", "core.autocrlf=false", ...args,
    ], { cwd: directory }).pipe(Effect.flatMap((result) => result.exitCode === 0 && !result.truncated
      ? Effect.succeed(result.text().trim()) : Effect.die(new Error(result.stderr.toString("utf8")))))
    yield* Effect.promise(() => fs.writeFile(path.join(directory, sourcePath), 'export const sharedValue = "ENGAGEMENT-BASE"\n'))
    yield* Effect.promise(() => fs.writeFile(path.join(directory, outsidePath), outsideText))
    yield* Effect.promise(() => fs.writeFile(path.join(directory, "tsconfig.json"), '{"compilerOptions":{"strict":true}}\n'))
    yield* git("init", "-q", "-b", "main")
    yield* git("add", "-A")
    yield* git("commit", "-q", "-m", "base")
    const base = yield* git("rev-parse", "HEAD")
    yield* Effect.promise(() => fs.writeFile(path.join(directory, sourcePath), sourceText))
    yield* git("add", "-A")
    yield* git("commit", "-q", "-m", "captured")
    const state: State = {
      directory, base, head: yield* git("rev-parse", "HEAD"), filename: path.join(global.data, "engagement.sqlite"),
      global, storeRoot: path.join(global.cache, "research-toolkit"), parentID: SessionSchema.ID.create(), requests: [],
      skills: yield* Effect.promise(() => authoredSkills()), cli, git,
    }
    return yield* body({ ...state, open: opener(state) })
  }).pipe(Effect.provide(AppNodeBuilder.build(GitCli.node))))
}

function opener(state: State) {
  return <A, E, R>(body: (ctx: Ctx) => Effect.Effect<A, E, R>, controls: Controls = {}) =>
    Effect.scoped(Effect.gen(function* () {
      const sessions = yield* SessionV2.Service
      const parent = yield* sessions.create({ id: state.parentID, agent: AgentV2.defaultID, model: modelRef,
        location: Location.Ref.make({ directory: AbsolutePath.make(state.directory) }) })
      const locations = yield* LocationServiceMap.Service
      const context = yield* locations.contextEffect(parent.location)
      const agents = Context.get(context, AgentV2.Service)
      // Core plugins have finished. Append the real native floor and visibility last, as the seats plugin does.
      yield* agents.transform((draft) => {
        for (const id of ["maestro", "backend", "lucy"]) draft.update(AgentV2.ID.make(id), (agent) => {
          agent.mode = id === "maestro" ? "primary" : "subagent"
          agent.permissions.push(...MaestroSeatsV2.floor(nativeProfiles[id]), ...MaestroSeatsV2.visibility(id))
        })
      })
      const skills = Context.get(context, SkillV2.Service)
      yield* skills.transform((draft) => {
        for (const skill of state.skills) draft.source(SkillV2.EmbeddedSource.make({ type: "embedded", skill }), { reserved: true })
      })
      const registry = Context.get(context, ToolRegistry.Service)
      const database = yield* Database.Service
      const store = yield* SessionStore.Service
      const execution = yield* SessionExecution.Service
      const processes = yield* AppProcess.Service
      const calls = { count: 0 }
      const call = (name: string, input: unknown, agent = "maestro", sessionID = parent.id) =>
        registered(registry, name, input, agent, sessionID, ++calls.count)
      return yield* body({
        parent, registry, sessions, store, database, db: database.db, context, execution,
        permissions: Context.get(context, PermissionV2.Service), prepareIndex: () => prepared(state, processes),
        invoke: (input, agent, sessionID) => call("maestro_request_review", input, agent, sessionID), call,
      }).pipe(Effect.provide(context))
    }).pipe(Effect.provide(Layer.fresh(graph(state, controls))), Effect.provideService(ResearchToolkit.Root, state.storeRoot)))
}

function graph(state: State, controls: Controls) {
  const researchRoot = Node.makeGlobalNode({ name: "test/engagement-research-root",
    layer: Layer.succeed(ResearchToolkit.Root, state.storeRoot), deps: [] })
  const nodes = LayerNode.group([
    Database.node, EventV2.node, SessionStore.node, LocationServiceMap.node, SessionV2.node, SessionExecution.node,
    GovernanceBackgroundV2.sessionsNode, MaestroReviewTools.executionNode, AppProcess.node, GitCli.node, researchRoot,
  ])
  return AppNodeBuilder.build(nodes, [
    ...globalBindings(LayerNode.group([nodes, locationServices, MaestroToolsV2.node,
      ToolRegistry.nativeNode, ToolRegistry.nativeToolsNode])),
    [Database.node, Database.layerFromPath(state.filename)],
    [SessionExecution.node, SessionExecutionLocal.node],
    [LayerNodePlatform.llmClient, client(state.requests, controls)],
    [SessionRunnerModel.node, SessionRunnerModel.layerWith(() => Effect.succeed(model))],
    // The scripted provider has no remote model catalog; graph acquisition must not fetch one.
    [ModelsDev.node, Layer.succeed(ModelsDev.Service, ModelsDev.Service.of({ get: () => Effect.succeed({}), refresh: () => Effect.void }))],
    [Snapshot.node, Snapshot.noopLayer],
    [SkillGuidance.node, Layer.mock(SkillGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) })],
    [ReferenceGuidance.node, Layer.mock(ReferenceGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) })],
    [SystemContextRegistry.node, systemContextLayer],
    [Config.node, Layer.succeed(Config.Service, Config.Service.of({ entries: () => Effect.gen(function* () {
      const observed = controls.onConfig?.()
      if (observed) yield* observed
      return [new Config.Document({ type: "document", info: new Config.Info({ compaction: new ConfigCompaction.Info({ auto: false }) }) })]
    }) }))],
    [GitCli.node, Layer.succeed(GitCli.Service, GitCli.Service.of({ ...state.cli, run: (args, options) => Effect.gen(function* () {
      const observed = controls.onGit?.(args)
      if (observed) yield* observed
      return yield* state.cli.run(args, options)
    }) }))],
    [Global.node, Global.layerWith(state.global)],
  ], [MaestroToolsV2.node])
}

// Pin the real global nodes before substituting the file database. The Location hoist otherwise sees both
// original globals and dependency-rewritten copies inside native tool replacements as conflicting objects.
function globalBindings(root: LayerNode.Node<unknown, unknown, LayerNode.Tag | undefined>): LayerNode.Replacements {
  const globals = new Map<string, LayerNode.Node<unknown, unknown, LayerNode.Tag | undefined>>()
  const seen = new Set<LayerNode.Node<unknown, unknown, LayerNode.Tag | undefined>>()
  const visit = (node: LayerNode.Node<unknown, unknown, LayerNode.Tag | undefined>) => {
    if (seen.has(node)) return
    seen.add(node)
    if (node.kind === "layer" && node.tag === Node.tags.values.global) {
      const existing = globals.get(node.name)
      if (existing && existing !== node) throw new Error(`fixture has conflicting global nodes for ${node.name}`)
      globals.set(node.name, node)
    }
    for (const dependency of node.dependencies) visit(dependency)
  }
  visit(root)
  return [...globals.values()].map((node) => [node, node] as const)
}

function registered(registry: ToolRegistry.Interface, name: string, input: unknown, agent: string,
  sessionID: SessionSchema.ID, sequence: number) {
  return registry.materialize().pipe(Effect.flatMap((tools) => tools.settle({
    sessionID, agent: AgentV2.ID.make(agent), assistantMessageID: SessionMessage.ID.make(`msg_engagement_${sequence}`),
    call: { type: "tool-call", id: `call_engagement_${sequence}`, name, input },
  })), Effect.map((settled) => ({ type: settled.result.type, text: String(settled.result.value), settled })))
}

function client(requests: RequestLog[], controls: Controls) {
  return Layer.succeed(LLMClient.Service, LLMClient.Service.of({
    prepare: () => Effect.die("fixture only streams"), generate: () => Effect.die("fixture only streams"),
    stream: (request) => Stream.unwrap(Effect.sync(() => {
      const affinity = request.http?.headers?.["x-session-affinity"]
      if (typeof affinity !== "string") throw new Error("provider request has no real Session affinity")
      const log = { sessionID: affinity, text: userTexts(request).at(-1) ?? "" }
      requests.push(log)
      return controls.stream ? controls.stream(log, request) : text(reply(log, request))
    })),
  }))
}

export function text(value: string) {
  return Stream.fromIterable(fragmentFixture("text", "answer", [value]).completeEvents)
}

export function tool(name: string, input: unknown, id = "engagement_tool") {
  return Stream.fromIterable([
    LLMEvent.stepStart({ index: 0 }), LLMEvent.toolInputStart({ id, name }),
    LLMEvent.toolInputDelta({ id, name, text: JSON.stringify(input) }), LLMEvent.toolInputEnd({ id, name }),
    LLMEvent.toolCall({ id, name, input }), LLMEvent.stepFinish({ index: 0, reason: "tool-calls" }),
    LLMEvent.finish({ reason: "tool-calls" }),
  ])
}

export function stage(brief: string) {
  if (brief.includes("Stage: hunt and finish") || brief.includes("Stage: finish.")) return "finish"
  if (brief.includes("Stage: entry")) return "entry"
  if (brief.includes("Stage: hunt, lens ")) return "lens"
  if (brief.includes("Stage: verify")) return "verify"
  return "unexpected"
}

export function reply(log: RequestLog, request: LLMRequest, options: { readonly quote?: boolean } = {}) {
  const brief = log.text
  const kind = stage(brief)
  if (kind === "entry") return fence(ReviewFanoutV2.TAGS.entry, {
    status: "eligible", context: { intent: "nothing found", acceptance: "nothing found", invariants: "nothing found", assumptions: "nothing found" },
    overlays: { confirmed: [], declined: [], added: [] }, slices: [],
  })
  if (kind === "lens") {
    const lens = /Stage: hunt, lens ([^,]+),/.exec(brief)?.[1]
    if (!lens) throw new Error("fixture hunt has no lens")
    return fence(ReviewFanoutV2.TAGS.lens, { lens, candidates: options.quote && lens === "correctness-logic" ? [{
      class: "logic.invariant", node: "lucy-lens-correctness-logic-invariants", path: sourcePath, line: 1, endLine: 1,
      severity: "P1", trigger: "The engagement brief requires sharedValue to preserve the captured invariant.", quote: sourceText.trim(),
    }] : [], observations: [], hunks: [], items: [] })
  }
  if (kind === "verify") {
    if (!options.quote) throw new Error("fixture has no scripted verifier finding")
    const candidates = Schema.decodeUnknownSync(Schema.Array(Schema.Struct({
      id: Schema.String, class: Schema.String, path: Schema.String, line: Schema.Number, region: Schema.String,
      options: Schema.Array(Schema.Struct({ id: Schema.String })),
    })))(data(brief, "candidates"))
    if (!candidates.length || candidates.some((candidate) => candidate.path !== sourcePath || candidate.line !== 1 ||
      !candidate.region.includes(sourceText.trim()) || !candidate.options.some((option) => option.id === "quote")))
      throw new Error("fixture verifier did not receive the captured quote and offered rung")
    return fence(ReviewFanoutV2.TAGS.verify, { class: "logic.invariant", results: candidates.map((candidate) => ({
      candidate: candidate.id, state: "confirmed", rung: "quote",
      evidence: { kind: "quote", path: candidate.path, startLine: 1, endLine: 1 }, history: [{ option: "quote", outcome: "settled" }],
    })) })
  }
  if (kind !== "finish") throw new Error(`unexpected engagement stage: ${brief.slice(0, 96)}`)
  const routing = Schema.decodeUnknownSync(ReviewRouting.Record)(line(brief, "Routing record (embed it verbatim as the card's routing):\n"))
  const facts = Schema.decodeUnknownSync(Schema.Struct({ checks: Schema.Array(Schema.Unknown), blockers: Schema.Array(Schema.Unknown) }))(
    line(brief, "Host check facts (embed these checks and blockers verbatim; host authority, not model text):\n"))
  const confirmed = options.quote ? Schema.decodeUnknownSync(Schema.Array(Schema.Struct({
    id: Schema.String, path: Schema.String, line: Schema.Number, endLine: Schema.optional(Schema.Number),
    severity: Schema.String, lens: Schema.String, class: Schema.String, node: Schema.String, rule: Schema.String,
    trigger: Schema.String, rungs: Schema.Array(Schema.String), evidence: Schema.Unknown,
  })))(data(brief, "confirmed findings, as the host merged them")) : []
  const scopeLine = brief.split("\n").find((value) => value.startsWith("Scope: "))
  const scope = scopeLine ? JSON.parse(scopeLine.slice("Scope: ".length)) : userTexts(request).map((value) => data(value, "work card", true))
    .filter((value): value is { scope: unknown } => typeof value === "object" && value !== null && "scope" in value).at(-1)?.scope
  return fence(ReviewResultV2.TAG, {
    outcome: facts.blockers.length ? "blocked" : "done", profile: routing.profile.id, tier: ReviewRouting.tier(routing),
    overlays: routing.overlays.map((overlay) => overlay.id), routing, scope,
    findings: confirmed.map((finding) => ({ ...finding, confidence: "high", status: "open" })), questions: [], checks: facts.checks,
    coverage: { examined: confirmed.length ? [sourcePath] : [], notExamined: routing.profile.id === "artifact"
      ? [{ item: "artifact:behavioral-eval", reason: "owner-permission" }] : [] },
    handoffs: [], blockers: facts.blockers, risks: [], nextActions: [],
  })
}

export function fence(tag: string, value: unknown) {
  return ["```" + tag, JSON.stringify(value), "```"].join("\n")
}

function userTexts(request: LLMRequest) {
  return request.messages.filter((message) => message.role === "user").map((message) =>
    message.content.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n"))
}

function line(brief: string, marker: string): unknown {
  const at = brief.indexOf(marker)
  if (at < 0) throw new Error(`fixture brief is missing ${marker.trim()}`)
  return JSON.parse(brief.slice(at + marker.length).split("\n")[0] ?? "")
}

function data(brief: string, name: string, optional = false): unknown {
  const start = `<data name="${name}">\n`
  const at = brief.indexOf(start)
  if (at < 0 && optional) return undefined
  const end = brief.indexOf("\n</data>", at + start.length)
  if (at < 0 || end < 0) throw new Error(`fixture brief is missing ${name}`)
  return JSON.parse(brief.slice(at + start.length, end))
}

function prepared(state: State, processes: AppProcess.Interface) {
  return Effect.gen(function* () {
    const manifest = yield* ResearchToolkit.Manifest
    const pack = manifest["scip-typescript"]
    if (!pack) return yield* Effect.die("fixture requires the shipped scip-typescript identity")
    const git = yield* CodeIndexShard.captured(state.directory, state.head)
    const plan = yield* CodeIndexBuild.plan({ root: state.directory, git, storeRoot: state.storeRoot,
      indexers: { ts: { id: pack.id, version: pack.version } }, uncached: true })
    if (plan.shards.length !== 1 || ![sourcePath, outsidePath].every((file) => plan.shards[0]?.shard.files.includes(file)))
      return yield* Effect.die("fixture requires both captured files in one real TypeScript shard")
    const planned = plan.shards[0]!
    const bytes = yield* CodeIndexShard.bytes(git, plan.tree, planned.shard.files)
    yield* CodeIndexStore.write(plan.dir, { shardKey: planned.key, commit: state.head, indexer: pack.id, version: pack.version }, {
      documents: planned.shard.files.map((file) => {
        const content = bytes.get(file)
        if (!content) throw new Error(`fixture captured file missing: ${file}`)
        return { path: file, language: "ts", sha256: createHash("sha256").update(content).digest("hex"),
          lines: 1, bytes: content.length, layer: 1 as const }
      }),
      symbols: planned.shard.files.map((file, index) => ({ id: index + 1, name: "sharedValue", kind: "constant", path: file,
        startLine: 1, endLine: 1, nameLine: 1, exported: true })),
      occurrences: planned.shard.files.map((file, index) => ({ symbolId: index + 1, path: file, line: 1, col: 13,
        endLine: 1, endCol: 24, role: 1, opaque: false })), relations: [], imports: [], skipped: [],
    })
    return plan
  }).pipe(Effect.provideService(AppProcess.Service, processes))
}
