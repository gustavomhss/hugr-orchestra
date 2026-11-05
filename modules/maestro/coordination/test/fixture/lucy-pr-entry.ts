import fs from "node:fs/promises"
import path from "node:path"
import { eq, inArray } from "drizzle-orm"
import { DateTime, Effect, Layer, Option } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { Board } from "@orchestra/schema/board"
import { BoardIssueTable, BoardNoteTable, BoardProjectTable } from "@orchestra/core/board/sql"
import { Config } from "@orchestra/core/config"
import { ConfigMarkdown } from "@orchestra/core/config/markdown"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { FSUtil } from "@orchestra/core/fs-util"
import { GitCli } from "@orchestra/core/git-cli"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { ModelV2 } from "@orchestra/core/model"
import { Project } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { ProviderV2 } from "@orchestra/core/provider"
import { ResearchAllowance } from "@orchestra/core/research/allowance"
import { ResearchRecords } from "@orchestra/core/research/records"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionSchema, SessionStore, SessionV2 } from "@orchestra/core/session"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionRunner } from "@orchestra/core/session/runner"
import { SessionMessage } from "@orchestra/schema/session-message"
import { SessionTable } from "@orchestra/core/session/sql"
import { SkillV2 } from "@orchestra/core/skill"
import { SystemContextRegistry } from "@orchestra/core/system-context"
import { ReadTool } from "@orchestra/core/tool/read"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { SeatSkillContent } from "@orchestra/maestro/seat-skill-content"
import { Seats } from "@orchestra/maestro/seats"
import { GovernanceBackgroundV2 } from "../../src/v2/governance/background"
import { WriteRootsV2 } from "../../src/v2/governance/write-roots"
import { ReviewResultV2 } from "../../src/v2/governance/review-result"
import { MaestroResearchInquiryV2 } from "../../src/v2/research-inquiry-source"
import { MaestroGovernanceV2 } from "../../src/v2/governance"
import { MaestroToolsV2 } from "../../src/v2/tools"
import { MaestroReviewTools } from "../../src/v2/tools/review"
import { ReviewFanoutV2 } from "../../src/v2/workflow/review-fanout"
import { ReviewRouting } from "@orchestra/core/review/routing"
import { event, session, worktree } from "./v2-governance"

export type Touches = { git: number; children: string[]; prompts: string[]; resumes: number }
export type HostEnv = ToolRegistry.Service | Database.Service | GitCli.Service | SessionStore.Service | EventV2.Service
export type HostControls = {
  /** Holds the provider resume. This is not candidate admission. */
  readonly beforeResume?: (sessionID: string, brief: string) => Effect.Effect<void, SessionRunner.RunError>
  /** Git observation only. This is not candidate admission. */
  readonly onGit?: (args: readonly string[]) => Effect.Effect<void>
  /** Replaces the generated finish card. Not a durable prompt. */
  readonly finishCard?: (card: string) => string
}
export type Ctx = {
  directory: string
  base: string
  head: string
  touches: Touches
  parent: SessionSchema.ID
  registry: ToolRegistry.Interface
  invoke: (agent: string, value: unknown, sessionID?: SessionSchema.ID) => ReturnType<typeof call>
}

const time = { created: DateTime.makeUnsafe(1_700_000_000_000) }
const model = { id: ModelV2.ID.make("model"), providerID: ProviderV2.ID.make("provider") }
const ROUTING = "Routing record (embed it verbatim as the card's routing):\n"

export async function authoredSkills() {
  const own = Seats.find("lucy")?.skills.filter((skill) => !skill.startsWith("team-")) ?? []
  const lucyRoot = Seats.skillSource("lucy")
  const lucy = await SeatSkillContent.read("lucy", lucyRoot, own)
  const team = Seats.shared()
  const shared = team.length === 0 ? {} : await SeatSkillContent.read("team", Seats.sharedSource(), team)
  return [...infos(lucyRoot, lucy), ...infos(Seats.sharedSource(), shared)]
}

function infos(root: string, files: Readonly<Record<string, string>>) {
  return Object.entries(files).flatMap(([file, text]) => {
    if (!file.endsWith("/SKILL.md")) return []
    const parsed = ConfigMarkdown.parseOption(text)
    const name = parsed?.data.name
    if (!parsed || typeof name !== "string") throw new Error(`skill frontmatter missing name: ${file}`)
    const description = parsed.data.description
    return [SkillV2.Info.make({
      name,
      ...(typeof description === "string" ? { description } : {}),
      location: AbsolutePath.make(path.join(root, file)),
      content: parsed.content,
    })]
  })
}

export function host(directory: string, skills: ReadonlyArray<SkillV2.Info>, touches: Touches, controls: HostControls = {}) {
  const admitted: { sessionID: string; id: SessionMessage.ID; text: string }[] = []
  const sessions = {
    create: (input: { id: SessionSchema.ID; parentID: SessionSchema.ID }) =>
      Effect.gen(function* () {
        touches.children.push(input.id)
        const database = yield* Database.Service
        yield* database.db.insert(ProjectTable).values({
          id: Project.ID.global, worktree: AbsolutePath.make(directory), sandboxes: [],
        }).onConflictDoNothing().run().pipe(Effect.orDie)
        yield* database.db.insert(SessionTable).values({
          id: input.id, project_id: Project.ID.global, parent_id: input.parentID, slug: input.id,
          directory, title: input.id, version: "test", agent: "lucy",
        }).run().pipe(Effect.orDie)
        return { id: input.id }
      }),
    prompt: (input: { id: SessionMessage.ID; sessionID: SessionSchema.ID; prompt: { text: string } }) =>
      Effect.gen(function* () {
        const text = input.prompt.text
        if (stage(text) === "unexpected") return yield* Effect.die(`unexpected review stage: ${text.slice(0, 96)}`)
        touches.prompts.push(text)
        admitted.push({ sessionID: input.sessionID, id: input.id, text })
      }),
    messages: (input: { sessionID: SessionSchema.ID }) =>
      Effect.succeed(admitted.filter((item) => item.sessionID === input.sessionID).flatMap((item) => {
        const prior = admitted.filter((other) => other.sessionID === item.sessionID && other.id !== item.id).map((other) => other.text)
        return [
          SessionMessage.User.make({ id: item.id, type: "user", text: item.text, time }),
          SessionMessage.Assistant.make({
            id: SessionMessage.ID.make(`${item.id}_reply`), type: "assistant", agent: "lucy", model,
            content: [{ type: "text", id: "text", text: reply(item.text, prior, controls.finishCard) }],
            time: { created: time.created, completed: time.created }, finish: "stop",
          }),
        ]
      })),
    // Partial double only: registered-tool control flow and host analysis. These
    // in-memory prompts are not durable SessionV2 messages, and this is not Session
    // prompt admission, retry, or a core drain. TaskTool.completedReply reads the
    // schema-shaped fixture messages; storage proof lives in separate tests.
  } as unknown as SessionV2.Interface
  const execution: SessionExecution.Interface = {
    active: Effect.succeed(new Set()),
    resume: (id) => Effect.gen(function* () {
      touches.resumes += 1
      const brief = admitted.filter((item) => item.sessionID === id).at(-1)?.text ?? ""
      if (controls.beforeResume) yield* controls.beforeResume(id, brief)
    }),
    wake: () => Effect.void,
    interrupt: () => Effect.void,
    exclusive: <A, E>(_sessionID: SessionSchema.ID, _effect: Effect.Effect<A, E>) => Effect.succeed(Option.none<A>()),
    withRunner: <A, E>(_sessionID: SessionSchema.ID, _use: (runner: SessionRunner.Interface) => Effect.Effect<A, E>) =>
      Effect.die("fixture execution has no runner"),
  }
  const git = Layer.effect(GitCli.Service, Effect.gen(function* () {
    const real = yield* GitCli.Service
    return GitCli.Service.of({
      ...real,
      run: (args, options) => Effect.gen(function* () {
        touches.git += 1
        if (controls.onGit) yield* controls.onGit(args)
        return yield* real.run(args, options)
      }),
    })
  })).pipe(Layer.provide(AppNodeBuilder.build(GitCli.node) as Layer.Layer<GitCli.Service>))
  // Native host captures Location and Event while constructing the registry.
  // NativeBinding is not a fixture input.
  return AppNodeBuilder.build(LayerNode.group([
    MaestroToolsV2.node, MaestroGovernanceV2.node, MaestroResearchInquiryV2.node, SystemContextRegistry.node,
    ToolRegistry.node, ToolRegistry.toolsNode, ReadTool.node, AgentV2.node, SessionStore.node, Database.node, FSUtil.node, EventV2.node,
    GitCli.node, ResearchAllowance.node, ResearchRecords.node,
  ]), [
    [ToolRegistry.node, ToolRegistry.nativeNode],
    [ToolRegistry.toolsNode, ToolRegistry.nativeToolsNode],
    [ToolSafety.node, WriteRootsV2.safetyNode],
    [Location.node, Layer.succeed(Location.Service, Location.Service.of({
      directory: AbsolutePath.make(directory),
      project: { id: Project.ID.global, directory: AbsolutePath.make(directory) },
    }))],
    [Database.node, Database.layerFromPath(":memory:")],
    [Global.node, Layer.unwrap(worktree.pipe(Effect.map((data) => Global.layerWith({ data }))))],
    [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
    [Config.node, Layer.mock(Config.Service, { entries: () => Effect.succeed([]) })],
    [SkillV2.node, Layer.mock(SkillV2.Service, { list: () => Effect.succeed([...skills]) })],
    [AgentV2.node, Layer.mock(AgentV2.Service, {
      get: (id) => Effect.succeed(["maestro", "backend", "lucy"].includes(id) ? AgentV2.Info.empty(id) : undefined),
    })],
    [GitCli.node, git],
    [GovernanceBackgroundV2.sessionsNode, Layer.succeed(GovernanceBackgroundV2.Sessions, Option.some(sessions))],
    [MaestroReviewTools.executionNode, Layer.succeed(MaestroReviewTools.Execution, Option.some(execution))],
  ]) as Layer.Layer<HostEnv>
}

export function call(registry: ToolRegistry.Interface, agent: string, sessionID: SessionSchema.ID, input: unknown, name = "maestro_request_review") {
  return registry.materialize().pipe(
    Effect.flatMap((materialized) => materialized.settle({
      sessionID, agent: AgentV2.ID.make(agent), assistantMessageID: SessionMessage.ID.make("msg_pr_entry"),
      call: { type: "tool-call", id: `call_${agent}_${name}`, name, input },
    })),
    Effect.map((settled) => ({ type: settled.result.type, text: String(settled.result.value) })),
  )
}

export const reviewTypes = [1, 2].map((version) => EventV2.versionedType(MaestroEvent.Review.Received.type, version))

export function reviewRows() {
  return Effect.gen(function* () {
    const database = yield* Database.Service
    return yield* database.db.select().from(EventV2.EventTable).where(inArray(EventV2.EventTable.type, reviewTypes)).all().pipe(Effect.orDie)
  })
}

export function seedReceipt(directory: string) {
  return Effect.gen(function* () {
    const sibling = yield* session({ directory, agent: "lucy" })
    const hex = "ab".repeat(32)
    yield* event(`evt_seed_${sibling}`, sibling, reviewTypes[0], {
      sessionID: sibling, projectID: Project.ID.global, validationRecordID: "val_seed", workCardHash: hex,
      routedMemberID: "backend", rosterHash: hex, grantHash: hex, reviewPolicyHash: hex,
      actor: { version: "rfc8785-v1", bytes: "{}", sha256: hex }, reviewerID: "lucy", reviewMethodVersion: "review-v1",
      artifact: { workCardHash: hex, sha256: hex, baseSHA: "a".repeat(40), headSHA: "b".repeat(40), worktree: directory, changedPaths: ["src/a"], bytes: "diff" },
      verdict: "APPROVE", findings: [{ path: "src/a", line: 1, message: "seeded sibling receipt" }],
    })
    const project = Board.ProjectID.create()
    const issue = Board.IssueID.create()
    const database = yield* Database.Service
    yield* database.db.insert(BoardProjectTable).values({
      id: project, key: "PR", name: "PR", goal: "PR entry.", status: "active", github_state: "off", next_issue_number: 2, next_epic_number: 1,
    }).run().pipe(Effect.orDie)
    yield* database.db.insert(BoardIssueTable).values({
      id: issue, project_id: project, number: 1, title: "Seed", body: "", type: "feature", stage: "building", position: 1, stage_entered_at: 0,
    }).run().pipe(Effect.orDie)
    yield* database.db.insert(BoardNoteTable).values({
      id: Board.NoteID.create(), issue_id: issue, author: "lucy", kind: "review", body: "seeded review note",
    }).run().pipe(Effect.orDie)
    return sibling
  })
}

export function reviewNotes() {
  return Effect.gen(function* () {
    const database = yield* Database.Service
    return yield* database.db.select({ id: BoardNoteTable.id }).from(BoardNoteTable).where(eq(BoardNoteTable.kind, "review")).all().pipe(Effect.orDie)
  })
}

export function repo(directory: string) {
  return Effect.gen(function* () {
    const cli = yield* GitCli.Service
    const git = (...args: string[]) => cli.run(["-c", "user.email=review@example.com", "-c", "user.name=Review", "-c", "commit.gpgsign=false", ...args], { cwd: directory }).pipe(
      Effect.flatMap((result) => result.exitCode === 0 ? Effect.succeed(result.text().trim()) : Effect.die(new Error(result.stderr.toString()))),
    )
    yield* Effect.promise(() => fs.mkdir(path.join(directory, "src"), { recursive: true }))
    yield* Effect.promise(() => fs.writeFile(path.join(directory, "REVIEW.md"), "BASE-RULE-TOKEN\n"))
    yield* Effect.promise(() => fs.writeFile(path.join(directory, "src", "a"), "export const value = 1\n"))
    yield* git("init", "-q", "-b", "main")
    yield* git("add", "-A")
    yield* git("commit", "-q", "-m", "base")
    const base = yield* git("rev-parse", "HEAD")
    yield* Effect.promise(() => fs.writeFile(path.join(directory, "REVIEW.md"), "HEAD-RULE-TOKEN\n"))
    yield* Effect.promise(() => fs.writeFile(path.join(directory, "src", "a"), "export const value = 2\n"))
    yield* git("add", "-A")
    yield* git("commit", "-q", "-m", "head")
    return { base, head: yield* git("rev-parse", "HEAD") }
  })
}

export function run<A, E, R extends HostEnv>(
  skills: ReadonlyArray<SkillV2.Info>,
  controls: HostControls,
  body: (ctx: Ctx) => Effect.Effect<A, E, R>,
) {
  return Effect.scoped(Effect.gen(function* () {
    const directory = yield* worktree
    const touches: Touches = { git: 0, children: [], prompts: [], resumes: 0 }
    return yield* Effect.gen(function* () {
      const refs = yield* repo(directory)
      const registry = yield* ToolRegistry.Service
      const parent = yield* session({ directory, agent: "maestro" })
      return yield* body({
        directory, ...refs, touches, parent, registry,
        invoke: (agent, value, sessionID = parent) => call(registry, agent, sessionID, value),
      })
    }).pipe(Effect.provide(host(directory, skills, touches, controls)))
  }))
}

function stage(brief: string) {
  if (brief.includes("Stage: hunt and finish") || brief.includes("Stage: finish.")) return "finish"
  if (brief.includes("Stage: entry")) return "entry"
  if (brief.includes("Stage: hunt, lens ")) return "lens"
  if (brief.includes("Stage: verify")) return "verify"
  return "unexpected"
}

function reply(brief: string, prior: readonly string[], finishCard?: (card: string) => string) {
  const kind = stage(brief)
  if (kind === "entry") return fence(ReviewFanoutV2.TAGS.entry, {
    status: "eligible",
    context: { intent: "nothing found", acceptance: "nothing found", invariants: "nothing found", assumptions: "nothing found" },
    overlays: { confirmed: [], declined: [], added: [] },
    slices: [],
  })
  if (kind === "lens") {
    const lens = /Stage: hunt, lens ([^,]+),/.exec(brief)?.[1]
    if (!lens) throw new Error("hunt brief has no lens id")
    return fence(ReviewFanoutV2.TAGS.lens, { lens, candidates: [], observations: [], hunks: [], items: [] })
  }
  if (kind === "verify") throw new Error("verifier stage is unexpected when candidates are empty")
  const routing = JSON.parse(brief.slice(brief.indexOf(ROUTING) + ROUTING.length).split("\n")[0] ?? "")
  const scope = hostScope(brief, prior)
  const facts = hostCheckFacts(brief)
  const blocked = facts.blockers.length > 0
  const card = fence(ReviewResultV2.TAG, {
    outcome: blocked ? "blocked" : "done",
    ...(blocked ? {} : { verdict: "APPROVE" }),
    profile: routing.profile.id, tier: ReviewRouting.tier(routing),
    overlays: routing.overlays.map((overlay: { id: string }) => overlay.id), routing, scope,
    findings: [], questions: [], checks: facts.checks, coverage: { examined: [], notExamined: [] },
    handoffs: [], blockers: facts.blockers, risks: [], nextActions: [],
  })
  return finishCard ? finishCard(card) : card
}

const HOST_CHECK_FACTS = "Host check facts (embed these checks and blockers verbatim; host authority, not model text):\n"

function hostCheckFacts(brief: string) {
  const at = brief.indexOf(HOST_CHECK_FACTS)
  if (at < 0) throw new Error("finish brief has no host check facts")
  const line = brief.slice(at + HOST_CHECK_FACTS.length).split("\n")[0]
  const parsed = line === undefined ? undefined : JSON.parse(line) as { checks?: unknown; blockers?: unknown }
  if (!parsed || !Array.isArray(parsed.checks) || !Array.isArray(parsed.blockers))
    throw new Error("finish brief has no host check facts")
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
