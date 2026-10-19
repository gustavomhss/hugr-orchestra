import { describe, expect } from "bun:test"
import path from "node:path"
import { Cause, Effect, Exit, Schema } from "effect"
import { Database } from "@orchestra/core/database/database"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { filesystem, httpClient } from "@orchestra/core/effect/app-node-platform"
import { FSUtil } from "@orchestra/core/fs-util"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { ResearchRecords } from "@orchestra/core/research/records"
import { SessionProjector } from "@orchestra/core/session/projector"
import { Token } from "@orchestra/core/util/token"
import { Research } from "@orchestra/schema/research"
import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Git } from "@/git"
import { AtlasKnowledge } from "@/maestro/atlas-knowledge"
import { LogicalTask } from "@/maestro/logical-task"
import { Permission } from "@/permission"
import { ResearchExecution } from "@/research/allowance"
import { ResearchInquiry } from "@/research/inquiry"
import { ResearchSeatTools } from "@/research/seat-tools"
import { Instruction } from "@/session/instruction"
import { MessageID, PartID } from "@/session/schema"
import { Session } from "@/session/session"
import { Skill } from "@/skill"
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
const DISPATCH = "inquiry-dispatch"

// One native jimmy dispatch with the registry's wrapped tools, as the task tool runs them.
const setup = Effect.fn("InquiryTest.setup")(function* () {
  const sessions = yield* Session.Service
  const agents = yield* Agent.Service
  const permission = yield* Permission.Service
  const registry = yield* ToolRegistry.Service
  const execution = yield* ResearchExecution.Service
  const database = yield* Database.Service
  const fs = yield* FSUtil.Service
  const instance = yield* TestInstance
  const authority = yield* sessions.create({ agent: "maestro", title: "Inquiry authority" })
  const child = yield* sessions.create({ agent: ResearchSeatTools.SEAT, title: "Inquiry execution", parentID: authority.id })
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
  const tool = (name: string) => {
    const found = tools.find((candidate) => candidate.id === name)
    if (!found) throw new Error(`Missing native research tool: ${name}`)
    return found
  }
  const call = (name: string, args: unknown) => Effect.gen(function* () {
    const callID = PartID.ascending()
    yield* sessions.updatePart({ type: "tool", id: PartID.ascending(), sessionID: child.id, messageID: assistant.id, callID, tool: name,
      state: { status: "running", input: {}, time: { start: Date.now() } } })
    return yield* execution.enter(child.id, DISPATCH, tool(name).execute(args, context(callID)))
  })
  const inquiry = (input: Research.InquiryInput) => call("inquiry", input)
  const refused = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(Effect.exit, Effect.map((exit) => Exit.isFailure(exit) ? Cause.pretty(exit.cause) : "accepted"))
  const write = (name: string, text: string) => fs.writeFileString(path.join(instance.directory, name), text)
  const source = (name: string) => call("read", { filePath: name }).pipe(
    Effect.map((result) => Schema.decodeUnknownSync(Research.SourceReceipt)(result.metadata.researchSource).ref))
  // The snapshot the host puts before each turn, rebuilt from the ledger alone.
  const turn = () => execution.enter(child.id, DISPATCH, ResearchInquiry.turn().pipe(Effect.provideService(Database.Service, database)))
  return { sessions, authority, call, inquiry, refused, write, source, turn }
})

const Opened = Schema.Struct({ question: Research.RecordRef, subquestions: Schema.Array(Research.RecordRef) })
const opened = (result: Tool.ExecuteResult) => Schema.decodeUnknownSync(Opened)(result.metadata.inquiry)
const hypothesized = (result: Tool.ExecuteResult) =>
  Schema.decodeUnknownSync(Schema.Struct({ hypothesis: Research.RecordRef }))(result.metadata.inquiry).hypothesis

describe("the inquiry state machine", () => {
  it.instance("refuses to close over an uncovered subquestion or a stale check, and backs the closed state with the ledger", () =>
    Effect.gen(function* () {
      const fixture = yield* setup()
      yield* fixture.write("a.ts", "export const a = 1\n")
      expect(yield* fixture.refused(fixture.inquiry({ action: "check" }))).toContain("open the inquiry first")
      const open = opened(yield* fixture.inquiry({ action: "open", question: "What does a.ts export?",
        subquestions: ["Which names", "Which defaults"], profile: "understand" }))
      expect(yield* fixture.refused(fixture.inquiry({ action: "open", question: "Again", subquestions: ["x"], profile: "locate" })))
        .toContain("already open")
      const source = yield* fixture.source("a.ts")
      yield* fixture.inquiry({ action: "claim", subquestion: open.subquestions[0], proposition: "a.ts exports a", nature: "extraction",
        evidence: [{ source, lines: { start: 1, end: 1 } }] })
      expect(yield* fixture.refused(fixture.inquiry({ action: "close", sufficiency: "partial", answer: "a.ts:1 exports a." })))
        .toContain("no check is registered")
      const failed = yield* fixture.inquiry({ action: "check" })
      expect(failed.output).toContain("\"verdict\":\"fail\"")
      expect(failed.output).toContain("\"rule\":\"R7\"")
      // The second subquestion has neither a claim nor a declared gap.
      expect(yield* fixture.refused(fixture.inquiry({ action: "close", sufficiency: "partial", answer: "a.ts:1 exports a." })))
        .toContain("neither an answering claim nor a declared gap")
      yield* fixture.inquiry({ action: "drop", ref: open.subquestions[1], reason: "a.ts has no default export to inspect" })
      expect(yield* fixture.refused(fixture.inquiry({ action: "close", sufficiency: "partial", answer: "a.ts:1 exports a." })))
        .toContain("invalidated")
      yield* fixture.inquiry({ action: "check" })
      expect(yield* fixture.refused(fixture.inquiry({ action: "close", sufficiency: "answered", answer: "a.ts:1 exports a." })))
        .toContain("the last check failed")
      expect((yield* fixture.inquiry({ action: "close", sufficiency: "partial", answer: "a.ts:1 exports a." })).output)
        .toContain("\"closed\":\"partial\"")
      // Closed is a ledger fact: every later call of the dispatch is refused, whatever process serves it.
      expect(yield* fixture.refused(fixture.call("read", { filePath: "a.ts" }))).toContain("inquiry closed")
      expect(yield* fixture.refused(fixture.inquiry({ action: "status" }))).toContain("inquiry closed")
      expect(yield* fixture.turn()).toContain("<inquiry state=\"closed\">")
      yield* fixture.sessions.remove(fixture.authority.id)
    }))

  it.instance("an answered close needs every hypothesis decided, and the per-turn snapshot stays compact", () =>
    Effect.gen(function* () {
      const fixture = yield* setup()
      yield* fixture.write("b.ts", Array.from({ length: 20 }, (_, index) => `export const b${index} = ${index}`).join("\n"))
      const open = opened(yield* fixture.inquiry({ action: "open", question: "What does b.ts export?", subquestions: ["Its names"], profile: "understand" }))
      const source = yield* fixture.source("b.ts")
      yield* Effect.forEach(Array.from({ length: 20 }, (_, index) => index), (index) => fixture.inquiry({ action: "claim",
        subquestion: open.subquestions[0], proposition: `b.ts exports b${index}`, nature: "extraction",
        evidence: [{ source, lines: { start: index + 1, end: index + 1 } }] }), { discard: true })
      const hypothesis = hypothesized(yield* fixture.inquiry({ action: "hypothesize", subquestion: open.subquestions[0],
        proposition: "b.ts exports only constants" }))
      const pending = yield* fixture.inquiry({ action: "check" })
      expect(pending.output).toContain("open hypothesis in an answered inquiry")
      yield* fixture.inquiry({ action: "resolve", hypothesis, status: "confirmed", evidence: [{ source, lines: { start: 1, end: 20 } }] })
      expect((yield* fixture.inquiry({ action: "check" })).output).toContain("\"verdict\":\"pass\"")
      // Rebuilt from the ledger alone, as after a compaction: twenty claims and their evidence fit well under 1.5k tokens.
      const snapshot = yield* fixture.turn()
      expect(snapshot).toContain("<inquiry state=\"checked\">")
      expect(snapshot).toContain(`${hypothesis.id}@${hypothesis.revision}:confirmed`)
      expect(Token.estimate(snapshot ?? "")).toBeLessThan(1500)
      expect((yield* fixture.inquiry({ action: "close", sufficiency: "answered", answer: "b.ts:1-20 exports b0 to b19." })).output)
        .toContain("\"closed\":\"answered\"")
      yield* fixture.sessions.remove(fixture.authority.id)
    }))

  it.instance("an identical call with an unchanged output digest is refused; a changed one runs", () =>
    Effect.gen(function* () {
      const fixture = yield* setup()
      yield* fixture.write("c.ts", "export const c = 1\n")
      expect((yield* fixture.call("grep", { pattern: "export const" })).output).toContain("c.ts")
      expect(yield* fixture.refused(fixture.call("grep", { pattern: "export const" }))).toContain("repeated_call")
      yield* fixture.write("c.ts", "export const c = 2\nexport const d = 3\n")
      expect((yield* fixture.call("grep", { pattern: "export const" })).output).toContain("c.ts")
      yield* fixture.sessions.remove(fixture.authority.id)
    }))
})
