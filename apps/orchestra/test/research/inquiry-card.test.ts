import { describe, expect } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { $ } from "bun"
import { Cause, Effect, Exit, Schema } from "effect"
import { Database } from "@orchestra/core/database/database"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { filesystem, httpClient } from "@orchestra/core/effect/app-node-platform"
import { FSUtil } from "@orchestra/core/fs-util"
import { ModelV2 } from "@orchestra/core/model"
import { AppProcess } from "@orchestra/core/process"
import { ProviderV2 } from "@orchestra/core/provider"
import type { CodeIndex } from "@orchestra/core/research-toolkit/code-index/types"
import { Liveness } from "@orchestra/core/research-toolkit/liveness"
import { ResearchRecords } from "@orchestra/core/research/records"
import { RipgrepBinary } from "@orchestra/core/ripgrep/binary"
import { SessionProjector } from "@orchestra/core/session/projector"
import { Research } from "@orchestra/schema/research"
import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Git } from "@/git"
import { AtlasKnowledge } from "@/maestro/atlas-knowledge"
import { DiscoveryResult } from "@/maestro/discovery-result"
import { LogicalTask } from "@/maestro/logical-task"
import { Permission } from "@/permission"
import { ResearchExecution } from "@/research/allowance"
import { ResearchSeatTools } from "@orchestra/core/research/seat-tools"
import { Instruction } from "@/session/instruction"
import { MessageID, PartID } from "@/session/schema"
import { Session } from "@/session/session"
import { Skill } from "@/skill"
import { Links } from "@/tool/inquiry"
import { ToolRegistry } from "@/tool/registry"
import { Tool } from "@/tool/tool"
import { Truncate } from "@/tool/truncate"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

// The wired check (J5.6) behind inquiry check and close, and the card v2 the parent receives (J5.12-J5.14), through
// the registry's real tools, ledger and retained bytes.

const it = testEffect(TestAppNodeBuilder.build(LayerNode.group([
  Agent.node, Config.node, Git.node, Session.node, SessionProjector.node, Database.node, Permission.node, FSUtil.node,
  Skill.node, Truncate.node, filesystem, httpClient, Instruction.node, AtlasKnowledge.node,
  EventV2Bridge.node, ResearchExecution.node, ResearchRecords.node, AppProcess.node, RipgrepBinary.node, ToolRegistry.node,
]), [[RuntimeFlags.node, RuntimeFlags.layer({ pure: true, disableDefaultPlugins: true, disableExternalSkills: true })]]))

const model = { providerID: ProviderV2.ID.make("openai"), modelID: ModelV2.ID.make("gpt-test") }
const DISPATCH = "inquiry-card-dispatch"

const setup = Effect.fn("InquiryCardTest.setup")(function* () {
  const sessions = yield* Session.Service
  const agents = yield* Agent.Service
  const permission = yield* Permission.Service
  const registry = yield* ToolRegistry.Service
  const execution = yield* ResearchExecution.Service
  const instance = yield* TestInstance
  const authority = yield* sessions.create({ agent: "maestro", title: "Inquiry card authority" })
  const child = yield* sessions.create({ agent: ResearchSeatTools.SEAT, title: "Inquiry card execution", parentID: authority.id })
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
  const call = (name: string, args: unknown) => Effect.gen(function* () {
    const found = tools.find((candidate) => candidate.id === name)
    if (!found) throw new Error(`Missing native research tool: ${name}`)
    const callID = PartID.ascending()
    yield* sessions.updatePart({ type: "tool", id: PartID.ascending(), sessionID: child.id, messageID: assistant.id, callID, tool: name,
      state: { status: "running", input: {}, time: { start: Date.now() } } })
    return yield* execution.enter(child.id, DISPATCH, found.execute(args as never, context(callID)))
  })
  const inquiry = (input: Research.InquiryInput) => call("inquiry", input)
  const refused = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(Effect.exit, Effect.map((exit) => Exit.isFailure(exit) ? Cause.pretty(exit.cause) : "accepted"))
  const write = (name: string, text: string) => Effect.promise(async () => {
    await fs.mkdir(path.dirname(path.join(instance.directory, name)), { recursive: true })
    await Bun.write(path.join(instance.directory, name), text)
  })
  const read = (name: string) => call("read", { filePath: name }).pipe(
    Effect.map((result) => Schema.decodeUnknownSync(Research.SourceReceipt)(result.metadata.researchSource).ref))
  const open = (subquestions: string[]) => inquiry({ action: "open", question: "Where is it defined?", subquestions, profile: "locate" })
    .pipe(Effect.map((result) => Schema.decodeUnknownSync(Opened)(result.metadata.inquiry)))
  // The parent's packet: the same assembly the loop's Task and Claude mode's PostToolUse[Agent] run (J5.14).
  const assemble = Effect.gen(function* () {
    const result = yield* DiscoveryResult.assemble({ info: { ...assistant, finish: "stop", time: { ...assistant.time, completed: Date.now() } },
      parts: [{ id: PartID.ascending(), sessionID: child.id, messageID: assistant.id, type: "text" as const, text: "Closed." }] }, [])
    return { result, report: DiscoveryResult.report("Closed.", result) }
  })
  return { cleanup: sessions.remove(authority.id), call, inquiry, refused, write, read, open, assemble, directory: instance.directory }
})

const Opened = Schema.Struct({ question: Research.RecordRef, subquestions: Schema.Array(Research.RecordRef) })
const located = (output: string) => JSON.parse(output.split("\n\nRetained source evidence:")[0]) as CodeIndex.LocateResult

const repo = (directory: string) => Effect.promise(async () => {
  await Bun.write(path.join(directory, "src/x.ts"), "export function viaExports(value: number) {\n  return value + 1\n}\n")
  await Bun.write(path.join(directory, "src/y.ts"), "import { viaExports } from \"./x\"\n\nexport function relayed(value: number) {\n  return viaExports(value) * 2\n}\n")
  await $`git add -A`.cwd(directory).quiet()
  await $`git commit -m fixture`.cwd(directory).quiet()
})

describe("inquiry check and card v2", () => {
  it.instance("close is refused over an uncited claim or an answer citing lines no claim holds; the parent gets card v2", () =>
    Effect.gen(function* () {
      const fixture = yield* setup()
      yield* fixture.write("a.ts", "export const a = 1\nexport const b = 2\n")
      yield* fixture.write("b.ts", "export const c = 3\n")
      const before = yield* fixture.assemble
      expect(before.result.outcome).toBeUndefined()
      expect(before.result.risks[0]).toStartWith("Inquiry not closed")
      expect(before.report).toStartWith("Inquiry not closed")
      const open = yield* fixture.open(["Which file defines a"])
      const source = yield* fixture.read("a.ts")
      yield* fixture.read("b.ts")
      // A claim without evidence fails R2 at check, and an answered close needs a passing check.
      const bare = Schema.decodeUnknownSync(Schema.Struct({ claim: Research.RecordRef }))((yield* fixture.inquiry({ action: "claim",
        subquestion: open.subquestions[0], proposition: "a is defined in a.ts", nature: "extraction", evidence: [] })).metadata.inquiry).claim
      expect((yield* fixture.inquiry({ action: "check" })).output).toContain("claim has no evidence")
      expect(yield* fixture.refused(fixture.inquiry({ action: "close", sufficiency: "answered", answer: "a.ts:1 defines a." })))
        .toContain("the last check failed")
      yield* fixture.inquiry({ action: "drop", ref: bare, reason: "restated with evidence" })
      yield* fixture.inquiry({ action: "claim", subquestion: open.subquestions[0], proposition: "a is defined in a.ts", nature: "extraction",
        evidence: [{ source, lines: { start: 1, end: 1 } }] })
      expect((yield* fixture.inquiry({ action: "check" })).output).toContain("\"verdict\":\"pass\"")
      // The check passed, but the closing answer cites b.ts, which no claim holds: close re-runs the check on it.
      const uncited = yield* fixture.refused(fixture.inquiry({ action: "close", sufficiency: "answered", answer: "a.ts:1 defines a; b.ts:1 defines c." }))
      expect(uncited).toContain("the closing check failed")
      expect(uncited).toContain("R9 b.ts:1")
      expect((yield* fixture.inquiry({ action: "close", sufficiency: "answered", answer: "a is defined at a.ts:1." })).output)
        .toContain("\"closed\":\"answered\"")
      const after = yield* fixture.assemble
      expect(after.result).toMatchObject({ outcome: "done", card: { parsed: true }, referencesChecked: true,
        locations: [{ path: "a.ts", start: 1, end: 1 }],
        discovery: { schema: "jimmy-card-v2", sufficiency: "answered", profile: "locate", answer: "a is defined at a.ts:1.",
          check: { verdict: "pass" } } })
      expect(after.result.discovery?.sources.total).toBeGreaterThanOrEqual(2)
      expect(after.result.discovery?.claims).toHaveLength(1)
      expect(after.result.qualifications?.records).toHaveLength(1)
      expect(after.report).toStartWith("Inquiry check: pass; rules ")
      expect(after.report).toContain("\nLocations: a.ts:1-1\nSources (")
      expect(after.report).toContain("\nRetained finding qualifications")
      expect(after.report).toContain(`\nCard answer (answered; host-assembled`)
      yield* fixture.cleanup
    }))

  it.instance("a code_locate range retained in its snapshot is citable by original lines, and only for its own file", () =>
    Effect.gen(function* () {
      const fixture = yield* setup()
      const open = yield* fixture.open(["Which function doubles the relayed value"])
      const result = located((yield* fixture.call("code_locate", { terms: ["relayed"], paths: ["src/**"] })).output)
      const range = result.ranges.find((item) => item.path === "src/y.ts")
      if (!range) throw new Error(`code_locate returned no src/y.ts range: ${JSON.stringify(result.ranges)}`)
      expect(range.endLine).toBeGreaterThanOrEqual(4)
      // Original-file lines admit on the snapshot (its own lines are fewer and differ); so does a literal quote.
      yield* fixture.inquiry({ action: "claim", subquestion: open.subquestions[0], proposition: "relayed doubles viaExports(value)",
        nature: "extraction", evidence: [{ source: result.evidence, lines: { start: range.startLine, end: range.endLine } },
          { source: result.evidence, quote: "return viaExports(value) * 2" }] })
      expect(yield* fixture.refused(fixture.inquiry({ action: "claim", subquestion: open.subquestions[0], proposition: "out of range",
        nature: "extraction", evidence: [{ source: result.evidence, lines: { start: 90, end: 91 } }] }))).toContain("not inside one range")
      expect((yield* fixture.inquiry({ action: "check" })).output).toContain("\"verdict\":\"pass\"")
      const cited = `src/y.ts:${range.startLine}-${range.endLine}`
      expect(yield* fixture.refused(fixture.inquiry({ action: "close", sufficiency: "answered", answer: `${cited}; also src/x.ts:1.` })))
        .toContain("R9 src/x.ts:1")
      expect((yield* fixture.inquiry({ action: "close", sufficiency: "answered", answer: `relayed is at ${cited} (line 4 of src/y.ts).` })).output)
        .toContain("\"closed\":\"answered\"")
      const after = yield* fixture.assemble
      expect(after.result).toMatchObject({ outcome: "done", discovery: { check: { verdict: "pass" } } })
      expect(after.result.locations).toEqual([{ path: "src/y.ts", start: range.startLine, end: range.endLine }, { path: "src/y.ts", start: 4, end: 4 }])
      yield* fixture.cleanup
    }), { git: true, init: repo }, 120_000)

  it.instance("a dead URL never seen in the dispatch is LIKELY_HALLUCINATED and fails the card", () =>
    Effect.gen(function* () {
      const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("missing", { status: 404 }) })
      yield* Effect.addFinalizer(() => Effect.promise(() => server.stop(true)))
      const fixture = yield* setup()
      const dead = `http://127.0.0.1:${server.port}/paper`
      yield* fixture.write("a.ts", "export const a = 1\n")
      const open = yield* fixture.open(["Which file defines a"])
      const source = yield* fixture.read("a.ts")
      yield* fixture.inquiry({ action: "claim", subquestion: open.subquestions[0], proposition: "a is defined in a.ts", nature: "extraction",
        evidence: [{ source, lines: { start: 1, end: 1 } }] })
      yield* fixture.inquiry({ action: "check" })
      // Real liveness classification; only the loopback refusal is lifted so the local server can answer.
      const local = Effect.provideService(Links, (urls, options) => Liveness.check(urls, { ...options, privateNetwork: true }))
      const answer = `a.ts:1 defines a, as ${dead} describes.`
      const refusal = yield* fixture.refused(local(fixture.inquiry({ action: "close", sufficiency: "answered", answer })))
      expect(refusal).toContain("R10")
      expect(refusal).toContain("likely hallucinated")
      yield* local(fixture.inquiry({ action: "close", sufficiency: "partial", answer }))
      const after = yield* fixture.assemble
      expect(after.result.discovery?.check.verdict).toBe("fail")
      expect(after.result.discovery?.check.urls).toEqual([{ url: dead, status: "LIKELY_HALLUCINATED", httpStatus: 404 }])
      expect(after.result.discovery?.web.urls).toEqual(after.result.discovery?.check.urls)
      expect(after.result.outcome).toBeUndefined()
      expect(after.result.risks[0]).toStartWith("Inquiry check failed")
      expect(after.report).toStartWith("Inquiry check: fail")
      expect(after.report).toContain("Answer has unverified citations")
      yield* fixture.cleanup
    }))
})
