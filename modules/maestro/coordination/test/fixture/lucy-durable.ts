import fs from "node:fs/promises"
import path from "node:path"
import { LLMClient, Model, type LLMRequest } from "@orchestra/llm"
import { route } from "@orchestra/llm/protocols/openai-chat"
import { AgentV2 } from "@orchestra/core/agent"
import { Config } from "@orchestra/core/config"
import { ConfigCompaction } from "@orchestra/core/config/compaction"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNodePlatform } from "@orchestra/core/effect/app-node-platform"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { GitCli } from "@orchestra/core/git-cli"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import { ModelV2 } from "@orchestra/core/model"
import { PermissionV2 } from "@orchestra/core/permission"
import { ProviderV2 } from "@orchestra/core/provider"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionSchema, SessionStore, SessionV2 } from "@orchestra/core/session"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionExecutionLocal } from "@orchestra/core/session/execution/local"
import { SessionRunnerModel } from "@orchestra/core/session/runner/model"
import { SkillV2 } from "@orchestra/core/skill"
import { SkillGuidance } from "@orchestra/core/skill/guidance"
import { ReferenceGuidance } from "@orchestra/core/reference/guidance"
import { Snapshot } from "@orchestra/core/snapshot"
import { SystemContext } from "@orchestra/core/system-context"
import { SystemContextRegistry } from "@orchestra/core/system-context/registry"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { ReviewRouting } from "@orchestra/core/review/routing"
import { Context, Effect, Layer, Stream } from "effect"
import { fragmentFixture, systemContextLayer } from "../../../../../packages/core/test/session-runner-harness"
import { ReviewResultV2 } from "../../src/v2/governance/review-result"
import { GovernanceBackgroundV2 } from "../../src/v2/governance/background"
import { MaestroToolsV2 } from "../../src/v2/tools"
import { MaestroReviewTools } from "../../src/v2/tools/review"
import { ReviewFanoutV2 } from "../../src/v2/workflow/review-fanout"
import { authoredSkills, repo } from "./lucy-pr-entry"
import { worktree } from "./v2-governance"

export type RequestLog = { readonly sessionID: string; readonly text: string }

export type Ctx = {
  readonly directory: string
  readonly base: string
  readonly head: string
  readonly parent: SessionSchema.Info
  readonly requests: RequestLog[]
  readonly registry: ToolRegistry.Interface
  readonly sessions: SessionV2.Interface
  readonly store: SessionStore.Interface
  readonly skills: ReadonlyArray<SkillV2.Info>
}

const model = Model.make({ id: "fake-model", provider: "fake", route })
const modelRef = { id: ModelV2.ID.make("fake-model"), providerID: ProviderV2.ID.make("fake") }

/**
 * One compiled graph. SessionExecution is the production local node: SessionStore plus the builder's default
 * LocationServiceMap, whose lazy Location binds the real runner. Capture nodes are not replaced.
 */
export function open<A, E>(body: (ctx: Ctx) => Effect.Effect<A, E, Database.Service>) {
  return Effect.scoped(Effect.gen(function* () {
    const directory = yield* worktree
    const skills = yield* Effect.promise(() => authoredSkills())
    const refs = yield* repo(directory).pipe(Effect.provide(AppNodeBuilder.build(GitCli.node)))
    const requests: RequestLog[] = []
    yield* Effect.promise(() => fs.mkdir(path.join(directory, ".data"), { recursive: true }))
    yield* Effect.promise(() => fs.mkdir(path.join(directory, ".global"), { recursive: true }))
    return yield* Effect.gen(function* () {
      const sessions = yield* SessionV2.Service
      const parent = yield* sessions.create({
        agent: AgentV2.ID.make("maestro"),
        model: modelRef,
        location: Location.Ref.make({ directory: AbsolutePath.make(directory) }),
      })
      const locations = yield* LocationServiceMap.Service
      const opened = yield* locations.contextEffect(parent.location)
      const registry = Context.get(opened, ToolRegistry.Service)
      const store = yield* SessionStore.Service
      return yield* body({ directory, ...refs, parent, requests, registry, sessions, store, skills })
    }).pipe(Effect.provide(graph(directory, skills, requests)))
  }))
}

function graph(directory: string, skills: ReadonlyArray<SkillV2.Info>, requests: RequestLog[]) {
  return AppNodeBuilder.build(LayerNode.group([
    Database.node,
    EventV2.node,
    SessionStore.node,
    LocationServiceMap.node,
    SessionV2.node,
    SessionExecution.node,
    GovernanceBackgroundV2.sessionsNode,
    MaestroReviewTools.executionNode,
  ]), [
    [SessionExecution.node, SessionExecutionLocal.node],
    [LayerNodePlatform.llmClient, client(requests)],
    [SessionRunnerModel.node, SessionRunnerModel.layerWith(() => Effect.succeed(model))],
    [Snapshot.node, Snapshot.noopLayer],
    [SkillGuidance.node, Layer.mock(SkillGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) })],
    [ReferenceGuidance.node, Layer.mock(ReferenceGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) })],
    [SystemContextRegistry.node, systemContextLayer],
    [SkillV2.node, Layer.mock(SkillV2.Service, { list: () => Effect.succeed([...skills]) })],
    [AgentV2.node, agents],
    [PermissionV2.node, allow],
    [Config.node, config],
    [Global.node, Global.layerWith({
      home: directory,
      config: path.join(directory, ".global"),
      data: path.join(directory, ".data"),
    })],
  ], [MaestroToolsV2.node])
}

const known = ["maestro", "backend", "lucy"]
const agents = Layer.mock(AgentV2.Service, {
  get: (id) => Effect.succeed(known.includes(id) ? AgentV2.Info.empty(id) : undefined),
  select: (id) => Effect.succeed({
    id: AgentV2.ID.make(id ?? "maestro"),
    info: id !== undefined && known.includes(id) ? AgentV2.Info.empty(AgentV2.ID.make(id)) : undefined,
  }),
})
const allow = Layer.succeed(PermissionV2.Service, PermissionV2.Service.of({
  evaluate: () => Effect.die("unused"),
  authorize: () => Effect.die("unused"),
  askExplicit: () => Effect.die("unused"),
  assert: () => Effect.void,
  ask: () => Effect.die("unused"),
  reply: () => Effect.die("unused"),
  cancelSession: () => Effect.void,
  get: () => Effect.die("unused"),
  forSession: () => Effect.die("unused"),
  list: () => Effect.die("unused"),
}))
const config = Layer.succeed(Config.Service, Config.Service.of({
  entries: () => Effect.succeed([new Config.Document({
    type: "document",
    info: new Config.Info({ compaction: new ConfigCompaction.Info({ auto: false }) }),
  })]),
}))

function client(requests: RequestLog[]) {
  return Layer.succeed(LLMClient.Service, LLMClient.Service.of({
    prepare: () => Effect.die("unused"),
    generate: () => Effect.die("unused"),
    stream: (request) => Stream.unwrap(Effect.sync(() => {
      const texts = userTexts(request)
      const text = texts.at(-1) ?? ""
      requests.push({ sessionID: sessionOf(request), text })
      return Stream.fromIterable(fragmentFixture("text", "answer", [reply(text, texts.slice(0, -1))]).completeEvents)
    })),
  }))
}

function sessionOf(request: LLMRequest) {
  const value = request.http?.headers?.["x-session-affinity"]
  return typeof value === "string" ? value : ""
}

function userTexts(request: LLMRequest) {
  return request.messages.filter((message) => message.role === "user").map((message) =>
    message.content.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n"),
  )
}

export function stage(brief: string) {
  if (brief.includes("Stage: hunt and finish") || brief.includes("Stage: finish.")) return "finish"
  if (brief.includes("Stage: entry")) return "entry"
  if (brief.includes("Stage: hunt, lens ")) return "lens"
  if (brief.includes("Stage: verify")) return "verify"
  return "unexpected"
}

function reply(brief: string, prior: readonly string[]) {
  const kind = stage(brief)
  if (kind === "entry") return fence(ReviewFanoutV2.TAGS.entry, {
    status: "eligible",
    context: { intent: "nothing found", acceptance: "nothing found", invariants: "nothing found", assumptions: "nothing found" },
    overlays: { confirmed: [], declined: [], added: [] },
    slices: [],
  })
  if (kind === "lens") {
    const lens = /Stage: hunt, lens ([^,]+),/.exec(brief)?.[1]
    if (!lens) return unexpected(brief)
    return fence(ReviewFanoutV2.TAGS.lens, { lens, candidates: [], observations: [], hunks: [], items: [] })
  }
  if (kind === "verify") return unexpected(brief)
  const routing = JSON.parse(brief.slice(brief.indexOf(ROUTING) + ROUTING.length).split("\n")[0] ?? "")
  const facts = hostCheckFacts(brief)
  const blocked = facts.blockers.length > 0
  return fence(ReviewResultV2.TAG, {
    outcome: blocked ? "blocked" : "done",
    ...(blocked ? {} : { verdict: "APPROVE" }),
    profile: routing.profile.id,
    tier: ReviewRouting.tier(routing),
    overlays: routing.overlays.map((overlay: { id: string }) => overlay.id),
    routing,
    scope: hostScope(brief, prior),
    findings: [],
    questions: [],
    checks: facts.checks,
    coverage: { examined: [], notExamined: [] },
    handoffs: [],
    blockers: facts.blockers,
    risks: [],
    nextActions: [],
  })
}

function unexpected(brief: string): string {
  throw new Error(`unexpected review stage: ${brief.slice(0, 96)}`)
}

const ROUTING = "Routing record (embed it verbatim as the card's routing):\n"
const HOST_CHECK_FACTS = "Host check facts (embed these checks and blockers verbatim; host authority, not model text):\n"

function hostCheckFacts(brief: string) {
  const at = brief.indexOf(HOST_CHECK_FACTS)
  if (at < 0) throw new Error("finish brief has no host check facts")
  const parsed = JSON.parse(brief.slice(at + HOST_CHECK_FACTS.length).split("\n")[0] ?? "") as { checks?: unknown; blockers?: unknown }
  if (!Array.isArray(parsed.checks) || !Array.isArray(parsed.blockers)) throw new Error("finish brief has no host check facts")
  return { checks: parsed.checks, blockers: parsed.blockers }
}

function hostScope(brief: string, prior: readonly string[]) {
  const line = brief.split("\n").find((item) => item.startsWith("Scope: "))
  if (line) return JSON.parse(line.slice("Scope: ".length))
  for (const text of [brief, ...prior]) {
    const block = /<data name="work card">\n([\s\S]*?)\n<\/data>/.exec(text)?.[1]
    if (block) return JSON.parse(block).scope
  }
  throw new Error("finish brief has no host scope")
}

function fence(tag: string, value: unknown) {
  return ["```" + tag, JSON.stringify(value), "```"].join("\n")
}
