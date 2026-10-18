import { describe, expect, test } from "bun:test"
import path from "node:path"
import { Cause, Effect, Exit } from "effect"
import { Database } from "@orchestra/core/database/database"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { filesystem, httpClient } from "@orchestra/core/effect/app-node-platform"
import { FSUtil } from "@orchestra/core/fs-util"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { ResearchRecords } from "@orchestra/core/research/records"
import { SessionProjector } from "@orchestra/core/session/projector"
import { Research } from "@orchestra/schema/research"
import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Git } from "@/git"
import { AtlasKnowledge } from "@/maestro/atlas-knowledge"
import { LogicalTask } from "@/maestro/logical-task"
import { nativeProfiles } from "@/maestro/roster"
import { SeatSkillRoot } from "@/maestro/seat-skill-root"
import { Seats } from "@/maestro/seats"
import { define } from "@/maestro/seats/seat"
import { Permission } from "@/permission"
import { ResearchExecution } from "@/research/allowance"
import { ResearchSeatTools } from "@/research/seat-tools"
import { Instruction } from "@/session/instruction"
import { MessageID, PartID } from "@/session/schema"
import { Session } from "@/session/session"
import { Skill } from "@/skill"
import { ResearchRegistry } from "@/tool/research-registry"
import { ToolRegistry } from "@/tool/registry"
import { Tool } from "@/tool/tool"
import { Truncate } from "@/tool/truncate"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(TestAppNodeBuilder.build(LayerNode.group([
  Agent.node, Config.node, Git.node, Session.node, SessionProjector.node, Database.node, Permission.node, FSUtil.node,
  Skill.node, Truncate.node, filesystem, httpClient, Instruction.node, AtlasKnowledge.node,
  EventV2Bridge.node, ResearchExecution.node, ResearchRecords.node,
  ToolRegistry.node,
]), [[RuntimeFlags.node, RuntimeFlags.layer({ pure: true, disableDefaultPlugins: true, disableExternalSkills: true })]]))

const model = { providerID: ProviderV2.ID.make("openai"), modelID: ModelV2.ID.make("gpt-test") }
// The engine tools F0 stubbed: registered now, granted to the seat only by the PR that qualifies each one (JD-2).
const PENDING = ["code_query", "code_locate", "code_search", "probe_run", "inquiry"]
const RETIRED = ["lsp", "webfetch", "repo_map", "repo_symbols", "repo_git_state"]

const setup = Effect.fn("SeatToolsTest.setup")(function* () {
  const sessions = yield* Session.Service
  const agents = yield* Agent.Service
  const permission = yield* Permission.Service
  const registry = yield* ToolRegistry.Service
  const execution = yield* ResearchExecution.Service
  const instance = yield* TestInstance
  const authority = yield* sessions.create({ agent: "maestro", title: "Research authority" })
  const child = yield* sessions.create({ agent: ResearchSeatTools.SEAT, title: "Research execution", parentID: authority.id })
  yield* LogicalTask.ensure({ executionSessionID: child.id, authoritySessionID: authority.id,
    projectID: child.projectID, memberID: ResearchSeatTools.SEAT, source: "host" })
  const agent = yield* agents.get(ResearchSeatTools.SEAT)
  const tools = yield* registry.tools({ ...model, agent })
  const user = yield* sessions.updateMessage({ id: MessageID.ascending(), sessionID: child.id, role: "user",
    agent: ResearchSeatTools.SEAT, model, time: { created: Date.now() } })
  const assistant = { id: MessageID.ascending(), sessionID: child.id, role: "assistant" as const, parentID: user.id,
    agent: ResearchSeatTools.SEAT, mode: "subagent", path: { cwd: instance.directory, root: instance.directory },
    ...model, cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, time: { created: Date.now() } }
  yield* sessions.updateMessage(assistant)
  const context = (callID: string): Tool.Context => ({
    sessionID: child.id, messageID: assistant.id, callID, agent: agent.name, agentID: ResearchSeatTools.SEAT,
    permission: agent.permission, abort: AbortSignal.any([]), messages: [], metadata: () => Effect.void,
    ask: (request) => permission.ask({ ...request, sessionID: child.id, tool: { messageID: assistant.id, callID }, ruleset: agent.permission }).pipe(Effect.orDie),
  })
  // Every call of one dispatch, as the task tool runs them: one dispatch call identity, a persisted tool part per call.
  const run = <A, E, R>(name: string, call: (context: Tool.Context) => Effect.Effect<A, E, R>) => Effect.gen(function* () {
    const callID = PartID.ascending()
    yield* sessions.updatePart({ type: "tool", id: PartID.ascending(), sessionID: child.id, messageID: assistant.id, callID, tool: name,
      state: { status: "running", input: {}, time: { start: Date.now() } } })
    return yield* execution.enter(child.id, "seat-tools-dispatch", call(context(callID)))
  })
  const tool = (name: string) => {
    const found = tools.find((candidate) => candidate.id === name)
    if (!found) throw new Error(`Missing native research tool: ${name}`)
    return found
  }
  return { sessions, registry, authority, tools, tool, run, directory: instance.directory }
})

describe("the seat's one tool descriptor", () => {
  test("the discovery profile grants exactly the descriptor's tools", () => {
    const profile = Permission.fromConfig(nativeProfiles[ResearchSeatTools.SEAT])
    const action = (id: string, pattern = "*") => Permission.evaluate(id, pattern, profile).action
    for (const id of [...ResearchSeatTools.OWN, ...ResearchSeatTools.LOOP].filter((id) => id !== "skill" && id !== "read"))
      expect([id, action(id)]).toEqual([id, "allow"])
    expect(action("read", "src/index.ts")).toBe("allow")
    expect(action("read", ".env")).toBe("deny")
    for (const name of Seats.all.jimmy.skills) expect(action("skill", name)).toBe("allow")
    expect(action("skill", "other-skill")).toBe("deny")
    for (const id of [...RETIRED, ...PENDING.filter((id) => !(ResearchSeatTools.OWN as readonly string[]).includes(id))])
      expect([id, action(id)]).toEqual([id, "deny"])
  })

  test("the research registry registers every own tool and every pending engine tool", () => {
    const memory = ["atlas_memory_recall", "atlas_memory_emit"]
    expect(ResearchSeatTools.OWN.filter((id) => !memory.includes(id) && !ResearchRegistry.IDS.includes(id))).toEqual([])
    expect(PENDING.filter((id) => !ResearchRegistry.IDS.includes(id))).toEqual([])
  })

  test("only the research seat may be a research engine seat", () => {
    expect(Seats.all.jimmy.research).toBe(true)
    expect(Object.values(Seats.all).filter((seat) => seat.research).map((seat) => seat.id)).toEqual([ResearchSeatTools.SEAT])
    expect(() => define({ ...Seats.all.lucy, research: true }))
      .toThrow(`The research engine supports only the ${ResearchSeatTools.SEAT} seat: lucy`)
  })
})

describe("the loop's research registry", () => {
  it.instance("discovery sees web search without provider flags, no retired tool, and no pending tool; nobody else sees research tools", () =>
    Effect.gen(function* () {
      const fixture = yield* setup()
      const agents = yield* Agent.Service
      const ids = fixture.tools.map((tool) => tool.id)
      expect(ids).toEqual(expect.arrayContaining(["read", "grep", "glob", "websearch", "research_capture", "research_view", "research_record", "atlas_context"]))
      expect(ids.filter((id) => [...RETIRED, ...PENDING].includes(id))).toEqual([])
      expect(yield* fixture.registry.ids()).toEqual(expect.arrayContaining(PENDING))
      const general = (yield* fixture.registry.tools({ ...model, agent: yield* agents.get("general") })).map((tool) => tool.id)
      expect(general.filter((id) => ResearchRegistry.IDS.includes(id))).toEqual([])
      expect(general).not.toContain("websearch")
      yield* fixture.sessions.remove(fixture.authority.id)
    }))

  it.instance("reading the seat's own skill is never retained as evidence; a product read is", () =>
    Effect.gen(function* () {
      const fixture = yield* setup()
      const fs = yield* FSUtil.Service
      yield* fs.writeFileString(path.join(fixture.directory, "product.txt"), "product bytes")
      const read = fixture.tool("read")
      const product = yield* fixture.run("read", (context) => read.execute({ filePath: "product.txt" }, context))
      expect(product.metadata.researchSource).toBeDefined()
      expect(product.output).toContain("Retained source evidence")
      expect(product.output).not.toContain("Locators address retained representation")
      const skill = path.join(SeatSkillRoot.roots[ResearchSeatTools.SEAT], Seats.all.jimmy.skills[0], "SKILL.md")
      const method = yield* fixture.run("read", (context) => read.execute({ filePath: skill }, context))
      expect(method.output).toContain("name:")
      expect(method.metadata.researchSource).toBeUndefined()
      expect(method.output).not.toContain("Retained")
      yield* fixture.sessions.remove(fixture.authority.id)
    }))

  it.instance("a closed inquiry denies every later tool call of its dispatch", () =>
    Effect.gen(function* () {
      const fixture = yield* setup()
      const fs = yield* FSUtil.Service
      yield* fs.writeFileString(path.join(fixture.directory, "product.txt"), "product bytes")
      const research = yield* ResearchRegistry.make
      const read = fixture.tool("read")
      const inquiry: Tool.Def<typeof Research.InquiryInput> = {
        id: "inquiry", description: "Accepted inquiry", parameters: Research.InquiryInput,
        execute: () => Effect.succeed({ title: "inquiry", output: "accepted", metadata: {} }),
      }
      const call = (input: Research.InquiryInput) => fixture.run("inquiry", (context) =>
        research.charge(inquiry, input, context, (effect) => effect))
      expect((yield* call({ action: "status" })).output).toBe("accepted")
      expect((yield* fixture.run("read", (context) => read.execute({ filePath: "product.txt" }, context))).output).toContain("product bytes")
      expect((yield* call({ action: "close", sufficiency: "answered", answer: "The answer." })).output).toBe("accepted")
      for (const after of [
        fixture.run("read", (context) => read.execute({ filePath: "product.txt" }, context)),
        call({ action: "status" }),
      ]) {
        const exit = yield* after.pipe(Effect.exit)
        expect(Exit.isFailure(exit) && Cause.pretty(exit.cause)).toContain("inquiry closed")
      }
      yield* fixture.sessions.remove(fixture.authority.id)
    }))
})
