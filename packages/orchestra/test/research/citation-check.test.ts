import { describe, expect } from "bun:test"
import path from "node:path"
import { Effect, Schema } from "effect"
import { Database } from "@orchestra/core/database/database"
import { SessionProjector } from "@orchestra/core/session/projector"
import { FSUtil } from "@orchestra/core/fs-util"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { ResearchRecords } from "@orchestra/core/research/records"
import { ResearchArtifacts } from "@orchestra/core/research/artifacts"
import { Research } from "@orchestra/schema/research"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { Agent } from "@/agent/agent"
import { Git } from "@/git"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Permission } from "@/permission"
import { LogicalTask } from "@/maestro/logical-task"
import { DiscoveryResult } from "@/maestro/discovery-result"
import { ResearchExecution } from "@/research/allowance"
import { MessageID, PartID } from "@/session/schema"
import { Session } from "@/session/session"
import { Tool } from "@/tool/tool"
import { ToolRegistry } from "@/tool/registry"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(TestAppNodeBuilder.build(LayerNode.group([
  ToolRegistry.node, Session.node, ResearchExecution.node, ResearchRecords.node, ResearchArtifacts.node,
  Agent.node, Permission.node, FSUtil.node, Database.node, SessionProjector.node, EventV2Bridge.node, Git.node,
])))

// One native jimmy dispatch: its own execution Session, logical Task binding and research tools.
const dispatch = Effect.fn("CitationCheck.dispatch")(function* () {
  const sessions = yield* Session.Service
  const agents = yield* Agent.Service
  const permission = yield* Permission.Service
  const registry = yield* ToolRegistry.Service
  const execution = yield* ResearchExecution.Service
  const instance = yield* TestInstance
  const authority = yield* sessions.create({ agent: "maestro", title: "Citation authority" })
  const child = yield* sessions.create({ agent: "jimmy", title: "Citation execution", parentID: authority.id })
  yield* LogicalTask.ensure({ executionSessionID: child.id, authoritySessionID: authority.id,
    projectID: child.projectID, memberID: "jimmy", source: "host" })
  const agent = yield* agents.get("jimmy")
  const model = { providerID: ProviderV2.ID.make("openai"), modelID: ModelV2.ID.make("gpt-test") }
  const tools = yield* registry.tools({ agent, ...model })
  const user = yield* sessions.updateMessage({ id: MessageID.ascending(), sessionID: child.id, role: "user", agent: "jimmy",
    model, time: { created: Date.now() } })
  const assistant = { id: MessageID.ascending(), sessionID: child.id, role: "assistant" as const, parentID: user.id,
    agent: "jimmy", mode: "subagent", path: { cwd: instance.directory, root: instance.directory }, ...model, cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, time: { created: Date.now() } }
  yield* sessions.updateMessage(assistant)
  const run = (name: string, args: unknown) => Effect.gen(function* () {
    const tool = tools.find((candidate) => candidate.id === name)
    if (!tool) throw new Error(`Missing native research tool: ${name}`)
    const callID = PartID.ascending()
    const part = { type: "tool" as const, id: PartID.ascending(), sessionID: child.id, messageID: assistant.id, callID, tool: name,
      state: { status: "running" as const, input: {}, time: { start: Date.now() } } }
    yield* sessions.updatePart(part)
    const context: Tool.Context = { sessionID: child.id, messageID: assistant.id, callID, agent: agent.name, agentID: "jimmy",
      permission: agent.permission, abort: AbortSignal.any([]), messages: [], metadata: () => Effect.void,
      ask: (request) => permission.ask({ ...request, sessionID: child.id, tool: { messageID: assistant.id, callID }, ruleset: agent.permission }).pipe(Effect.orDie) }
    const result = yield* execution.enter(child.id, "citation-dispatch", tool.execute(args, context))
    yield* sessions.updatePart({ ...part, state: { status: "completed", input: {}, title: result.title, output: result.output,
      metadata: result.metadata, time: { start: part.state.time.start, end: Date.now() } } })
    return result
  })
  const assemble = (prose: string, card: Research.Card) => DiscoveryResult.assemble({
    info: { ...assistant, finish: "stop", time: { ...assistant.time, completed: Date.now() } },
    parts: [{ id: PartID.ascending(), sessionID: child.id, messageID: assistant.id, type: "text" as const,
      text: `${prose}\n${fence}jimmy-result\n${JSON.stringify(card)}\n${fence}` }],
  }, [])
  return { sessions, authority, run, assemble, directory: instance.directory }
})

const fence = "`".repeat(3)
const source = (result: Tool.ExecuteResult) => Schema.decodeUnknownSync(Research.SourceReceipt)(result.metadata.researchSource)
const base = { profile: "understand", depth: "quick", sufficiency: "answered", findingRefs: [], documentRefs: [],
  coverage: { examined: [], excluded: [], failures: [] }, limitations: [], nextActions: [] } as const

describe("host citation check", () => {
  it.instance("own retained quotes, paths and findings pass; whitespace-only quote drift is tolerated", () => Effect.gen(function* () {
    const fixture = yield* dispatch()
    const fs = yield* FSUtil.Service
    yield* fs.writeFileString(path.join(fixture.directory, "observed.txt"), "before\nonly  version 1 is\nsupported\nafter\n")
    const retained = source(yield* fixture.run("read", { filePath: "observed.txt", offset: 2, limit: 2 }))
    const finding = Schema.decodeUnknownSync(Schema.Struct({ record: Research.FindingRecord }))((yield* fixture.run("research_record", {
      action: "finding", proposition: "Only version 1 is supported", nature: "extraction", conditions: [],
      evidence: [{ source: retained.ref, locator: { kind: "lines", start: 1, end: 2 } }], contrary: [] })).metadata.research).record
    const card: Research.Card = { ...base, answer: "Only version 1 (observed.txt:2-3).",
      findingRefs: [{ id: finding.id, revision: finding.revision }],
      evidenceRefs: [{ source: retained.ref, locator: { kind: "quote", exact: "only version 1 is supported" } }] }
    const result = yield* fixture.assemble("See observed.txt:3 for the support line.", card)
    expect(result.citationCheck).toEqual({ verdict: "pass", checked: { evidence: 1, prose: 2, findings: 1, documents: 0 }, issues: [], omitted: 0 })
    expect(result).toMatchObject({ referencesChecked: true, outcome: "done", discovery: card })
    const report = DiscoveryResult.report("See observed.txt:3 for the support line.", result)
    expect(report).toStartWith("Retained finding qualifications")
    expect(report).toContain("\nCitation check: pass; checked evidence=1 prose=2 findings=1 documents=0; unverified=0\n\n")
    yield* fixture.sessions.remove(fixture.authority.id)
  }))

  it.instance("unmapped, mismatched and foreign citations are reported and downgrade the card without erasing text", () => Effect.gen(function* () {
    const fixture = yield* dispatch()
    const foreign = yield* dispatch()
    const fs = yield* FSUtil.Service
    yield* fs.writeFileString(path.join(fixture.directory, "observed.txt"), "before\nonly version 1\nafter\n")
    yield* fs.writeFileString(path.join(fixture.directory, "foreign.txt"), "foreign claim\n")
    const retained = source(yield* fixture.run("read", { filePath: "observed.txt", offset: 2, limit: 1 }))
    const borrowed = source(yield* foreign.run("read", { filePath: "foreign.txt" }))
    // Core resolves explicit source IDs project-wide, so a finding can admit another Task's evidence.
    const finding = Schema.decodeUnknownSync(Schema.Struct({ record: Research.FindingRecord }))((yield* fixture.run("research_record", {
      action: "finding", proposition: "Foreign claim holds", nature: "extraction", conditions: [],
      evidence: [{ source: borrowed.ref, locator: { kind: "lines", start: 1, end: 1 } }], contrary: [] })).metadata.research).record
    const card: Research.Card = { ...base, answer: "Only version 1, see https://example.com/missing#top.",
      findingRefs: [{ id: finding.id, revision: finding.revision }],
      evidenceRefs: [
        { source: retained.ref, locator: { kind: "lines", start: 1, end: 1 } },
        { source: retained.ref, locator: { kind: "quote", exact: "only version 2" } },
        { source: borrowed.ref, locator: { kind: "lines", start: 1, end: 1 } },
      ] }
    const prose = "Proof at observed.txt:3 and missing.ts:10-12; observed.txt:2 holds."
    const result = yield* fixture.assemble(prose, card)
    expect(result.citationCheck?.verdict).toBe("fail")
    expect(result.citationCheck?.checked).toEqual({ evidence: 3, prose: 4, findings: 1, documents: 0 })
    expect(result.citationCheck?.issues.map((issue) => issue.reason).toSorted()).toEqual([
      "finding cites evidence not retained by this dispatch",
      "line outside captured range (captured 2-2)",
      "no retained source for this URL in this dispatch",
      "no retained source for this path in this dispatch",
      "quote not found in retained representation",
      "source not retained by this dispatch",
    ])
    expect(result.citationCheck?.issues).toContainEqual({ citation: "observed.txt:3", reason: "line outside captured range (captured 2-2)" })
    expect(result.citationCheck?.issues).toContainEqual({ citation: "missing.ts:10-12", reason: "no retained source for this path in this dispatch" })
    expect(result.citationCheck?.issues).toContainEqual({ citation: "https://example.com/missing#top", reason: "no retained source for this URL in this dispatch" })
    expect(result).toMatchObject({ referencesChecked: true, discovery: card })
    expect(result.outcome).toBeUndefined()
    expect(result.risks[0]).toBe("Citation check failed: 6 unverified citation(s); the answer has unverified citations.")
    const report = DiscoveryResult.report(prose, result)
    expect(report).toStartWith("Citation check: fail; checked evidence=3 prose=4 findings=1 documents=0; unverified=6\n- ")
    expect(report).toContain("- observed.txt:3: line outside captured range (captured 2-2)\n")
    expect(report).toContain("Answer has unverified citations:")
    expect(report).toContain(`\n> ${JSON.stringify(result.qualifications)}\n`)
    expect(report.endsWith(`\n> ${JSON.stringify(prose)}`)).toBe(true)
    yield* fixture.sessions.remove(fixture.authority.id)
    yield* foreign.sessions.remove(foreign.authority.id)
  }))
})
