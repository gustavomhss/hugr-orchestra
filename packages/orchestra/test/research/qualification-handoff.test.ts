import { expect } from "bun:test"
import path from "node:path"
import { Effect, Exit, Schema } from "effect"
import { EventV2 } from "@orchestra/core/event"
import { FSUtil } from "@orchestra/core/fs-util"
import { ResearchBinding } from "@orchestra/core/research/binding"
import { ResearchRecords } from "@orchestra/core/research/records"
import { SessionV1 } from "@orchestra/core/v1/session"
import { Research } from "@orchestra/schema/research"
import { ResearchEvent } from "@orchestra/schema/research-event"
import { Agent } from "@/agent/agent"
import { BackgroundJob } from "@/background/job"
import { DiscoveryResult } from "@/maestro/discovery-result"
import { LogicalTask } from "@/maestro/logical-task"
import { ResearchExecution } from "@/research/allowance"
import { ResearchQualifications } from "@/research/qualifications"
import { SessionCompaction } from "@/session/compaction"
import { MessageV2 } from "@/session/message-v2"
import { MessageID, PartID } from "@/session/schema"
import { ToolRegistry } from "@/tool/registry"
import { awaitWithTimeout, pollWithTimeout, testEffect } from "../lib/effect"
import { TestInstance } from "../fixture/fixture"
import { NativeResearchTask } from "./fixtures/native-task"

const it = testEffect(NativeResearchTask.layer)
const Summary = Schema.Struct({ records: Schema.Array(Research.FindingRecord), complete: Schema.Boolean,
  total: Schema.Int, omitted: Schema.Int })
const Result = Schema.Struct({ workResult: Schema.Struct({ qualifications: Summary, discovery: Research.Card,
  referencesChecked: Schema.Boolean, terminal: Schema.Struct({ reason: Schema.String }) }) })

// Scripted public fixture checks handoff mechanics, not semantic truth or model quality.
for (const background of [false, true]) it.instance(`native qualified Task output survives vague card; background=${background}`, () => Effect.gen(function* () {
  const fs = yield* FSUtil.Service
  const instance = yield* TestInstance
  yield* fs.writeFileString(path.join(instance.directory, "orchestra.jsonc"), JSON.stringify({ compaction: { tail_turns: 0 } }))
  const fixture = yield* NativeResearchTask.setup()
  yield* Effect.addFinalizer(() => fixture.sessions.remove(fixture.parent.id).pipe(Effect.orDie))
  const events = yield* EventV2.Service
  const records = yield* ResearchRecords.Service
  const state: { source?: Research.SourceReceipt; findings: Extract<Research.Record, { kind: "finding" }>[];
    document?: Research.DocumentReceipt; documentReply?: string; card?: Research.Card } = { findings: [] }
  const text = "Declared: release 1 supports enabled mode.\nObserved: release 2 rejects disabled mode.\nContrary: release 1 disabled mode rejects requests."
  yield* fixture.fs.writeFileString(path.join(fixture.instance.directory, "public-conditions.txt"), text)
  const unsubscribe = yield* events.listen((event) => Effect.gen(function* () {
    if (event.type === ResearchEvent.SourceAdmitted.type) {
      const admitted = Schema.decodeUnknownSync(ResearchEvent.SourceAdmitted.data)(event.data)
      if (admitted.binding.authoritySessionID !== fixture.parent.id || admitted.receipt.ref.representation !== "text" || state.source) return
      state.source = admitted.receipt
      yield* fixture.remote.tool("research_record", { action: "finding", proposition: "Declared support requires release 1 and enabled mode",
        nature: "extraction", conditions: ["release 1", "enabled mode only; disabled mode does not apply"],
        evidence: [{ source: state.source.ref, locator: { kind: "lines", start: 1, end: 1 } }],
        contrary: [{ source: state.source.ref, locator: { kind: "quote", exact: "Contrary: release 1 disabled mode rejects requests." } }],
        reason: "Declaration is not observed runtime behavior" })
      return
    }
    if (event.type === ResearchEvent.RecordCommitted.type) {
      const committed = Schema.decodeUnknownSync(ResearchEvent.RecordCommitted.data)(event.data)
      if (committed.binding.authoritySessionID !== fixture.parent.id || committed.record.kind !== "finding" || !state.source) return
      state.findings.push(committed.record)
      if (state.findings.length === 1) {
        yield* fixture.remote.tool("research_record", { action: "finding", id: committed.record.id, baseRevision: 1,
          proposition: "Later declaration revision must not replace selected history", nature: "hypothesis", conditions: ["later scope"],
          evidence: committed.record.evidence, contrary: [], reason: "Scope changed after original finding" })
        return
      }
      if (state.findings.length === 2) {
        yield* fixture.remote.tool("research_record", { action: "finding", proposition: "Observed fixture rejects release 2 disabled mode",
          nature: "observation", conditions: ["release 2", "disabled mode", "supplied public fixture only"],
          evidence: [{ source: state.source.ref, locator: { kind: "lines", start: 2, end: 2 } }], contrary: [],
          reason: "Observation and declaration have different applicability" })
        return
      }
      const refs = [state.findings[0], state.findings[2]].map((finding) => ({ id: finding.id, revision: finding.revision }))
      yield* fixture.remote.tool("research_record", { action: "document", document: {
        title: "Conditional public fixture", genre: "comparison", body: "Support depends on scope [source](research:declared).",
        findingRefs: refs, citations: { declared: state.findings[0].evidence[0] },
      } })
      return
    }
    if (event.type !== SessionV1.Event.PartUpdated.type) return
    const part = Schema.decodeUnknownSync(SessionV1.Event.PartUpdated.data)(event.data).part
    if (part.sessionID !== state.source?.binding.executionSessionID || part.type !== "tool" || part.tool !== "research_record" || part.state.status !== "completed") return
    const reply = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Struct({ document: Research.DocumentReceipt, qualifications: Summary })))(part.state.output)
    if (reply._tag === "None" || state.document) return
    state.document = reply.value.document
    state.documentReply = part.state.output
    expect(reply.value.qualifications).toEqual({ records: [state.findings[0], state.findings[2]], complete: true, total: 2, omitted: 0 })
    state.card = { answer: "It works.", profile: "evaluate", depth: "focused", sufficiency: "answered",
      findingRefs: [state.document.findingRefs[0], state.document.findingRefs[0]], evidenceRefs: [], documentRefs: [state.document.ref],
      coverage: { examined: ["public-conditions.txt"], excluded: [], failures: [] }, limitations: [], nextActions: [] }
    const prose = background ? "It works." : "It works.\n".repeat(2100)
    yield* fixture.remote.text(`${prose}\n\u0060\u0060\u0060jimmy-result\n${JSON.stringify(state.card)}\n\u0060\u0060\u0060`)
    if (background) yield* fixture.remote.text("Parent received retained qualifications.")
  }))
  yield* Effect.addFinalizer(() => unsubscribe)
  yield* fixture.remote.tool("read", { filePath: "public-conditions.txt" })
  const called = yield* awaitWithTimeout(fixture.call({ description: "Compare public fixture conditions", prompt: "Compare declaration and observation with contrary applicability",
    subagent_type: "jimmy", background }, "qualified-task"), "Native qualified Task did not return", "30 seconds")
  if (Exit.isFailure(called.exit)) return yield* Effect.failCause(called.exit.cause)
  const jobs = yield* BackgroundJob.Service
  const job = background ? yield* jobs.wait({ id: String(called.exit.value.metadata.sessionId), timeout: 30_000 }) : undefined
  if (background) expect(job?.info?.status).toBe("completed")
  const delivered = background ? yield* pollWithTimeout(fixture.sessions.messages({ sessionID: fixture.parent.id }).pipe(
    Effect.map((history) => history.flatMap((message) => message.parts).find((part) => part.type === "text" &&
      part.metadata?.source?.type === "task-return" && part.metadata.source.state === "completed")),
  ), "Background Task did not deliver qualified output", "30 seconds") : undefined
  if (background && delivered?.type !== "text") throw new Error("Expected native background return text")
  const output = delivered?.type === "text" ? delivered.text : called.exit.value.output
  const metadata = delivered?.type === "text" ? delivered.metadata : called.exit.value.metadata
  const envelope = Schema.decodeUnknownSync(Result)(metadata)
  const expected = { records: [state.findings[0], state.findings[2]], complete: true, total: 2, omitted: 0 }
  expect(envelope.workResult).toMatchObject({ qualifications: expected, discovery: state.card,
    referencesChecked: true, terminal: { reason: "ended" } })
  expect(output).toContain(`\n> ${JSON.stringify(expected)}`)
  expect(output.split("Retained finding qualifications")).toHaveLength(2)
  expect(output).toContain("It works.")
  if (!background) expect(called.exit.value.metadata.truncated).toBe(true)
  expect(expected.records[0]).toMatchObject({ revision: 1, nature: "extraction", conditions: ["release 1", "enabled mode only; disabled mode does not apply"],
    reason: "Declaration is not observed runtime behavior" })
  expect(expected.records[0].contrary).toHaveLength(1)
  expect(expected.records[1]).toMatchObject({ nature: "observation", conditions: ["release 2", "disabled mode", "supplied public fixture only"] })
  expect(state.findings[1]).toMatchObject({ id: expected.records[0].id, revision: 2, nature: "hypothesis" })
  if (background) yield* fixture.remote.wait(7).pipe(Effect.timeout("30 seconds"))
  const inputs = yield* fixture.remote.inputs
  expect(inputs).toHaveLength(background ? 7 : 6)
  expect(JSON.stringify(inputs[5])).toContain(JSON.stringify(state.documentReply).slice(1, -1))
  if (!state.source || !state.card) throw new Error("Expected native retained findings and card")
  expect(yield* records.view(state.source.binding, { action: "record", ref: state.card.findingRefs[0] })).toEqual(expected.records[0])
  expect(yield* ResearchQualifications.collect(records, state.source.binding, [state.findings[0], state.findings[1], state.findings[0]]
    .map((finding) => ({ id: finding.id, revision: finding.revision })))).toEqual({ records: state.findings.slice(0, 2), complete: true, total: 2, omitted: 0 })

  if (background) {
    expect(JSON.stringify((yield* fixture.remote.inputs)[6])).toContain(JSON.stringify(output).slice(1, -1))
    return
  }
  yield* fixture.sessions.updateMessage({ ...fixture.assistant, finish: "tool-calls" })
  yield* fixture.remote.text("Parent received retained qualifications.")
  yield* fixture.prompt.prompt({ sessionID: fixture.parent.id, agent: "maestro", model: { providerID: fixture.model.providerID, modelID: fixture.model.id },
    parts: [{ type: "text", text: "Use returned Task qualifications." }] })
  expect(yield* fixture.remote.calls).toBe(7)
  expect(JSON.stringify((yield* fixture.remote.inputs)[6])).toContain(JSON.stringify(output).slice(1, -1))

  const compaction = yield* SessionCompaction.Service
  const execution = yield* ResearchExecution.Service
  const childID = state.source.binding.executionSessionID
  yield* compaction.create({ sessionID: childID, agent: "jimmy", model: { providerID: fixture.model.providerID, modelID: fixture.model.id }, auto: false })
  const history = yield* fixture.sessions.messages({ sessionID: childID })
  const boundary = history.at(-1)
  if (!boundary || boundary.info.role !== "user") throw new Error("Expected real compaction boundary")
  yield* fixture.remote.text("It works; details omitted in this summary.")
  expect(yield* execution.enter(childID, "qualified-task", compaction.process({ sessionID: childID, parentID: boundary.info.id, messages: history, auto: false }))).toBe("continue")
  const visible = MessageV2.filterCompacted((yield* fixture.sessions.messages({ sessionID: childID })).toReversed())
  expect(visible.some((message) => message.parts.some((part) => part.type === "tool" && part.tool === "research_record"))).toBe(false)
  yield* fixture.fs.remove(path.join(fixture.instance.directory, "public-conditions.txt"))
  yield* fixture.remote.text(`\u0060\u0060\u0060jimmy-result\n${JSON.stringify(state.card)}\n\u0060\u0060\u0060`)
  const resumed = yield* fixture.call({ description: "Reopen historical qualifications", prompt: "Return retained historical references", subagent_type: "jimmy",
    task_id: state.source.binding.taskId }, "qualified-resume")
  if (Exit.isFailure(resumed.exit)) return yield* Effect.failCause(resumed.exit.cause)
  expect(Schema.decodeUnknownSync(Result)(resumed.exit.value.metadata).workResult.qualifications).toEqual(expected)
  expect(resumed.exit.value.output).toContain(`\n> ${JSON.stringify(expected)}`)
}), { git: true }, 120_000)

it.instance("own exact refs reject foreign/nonfinding; lookup and UTF-8 bounds explicitly omit whole records", () => Effect.gen(function* () {
  const fixture = yield* NativeResearchTask.setup()
  yield* Effect.addFinalizer(() => fixture.sessions.remove(fixture.parent.id).pipe(Effect.orDie))
  const records = yield* ResearchRecords.Service
  const agents = yield* Agent.Service
  const registry = yield* ToolRegistry.Service
  const execution = yield* ResearchExecution.Service
  const child = yield* fixture.sessions.create({ agent: "jimmy", parentID: fixture.parent.id })
  yield* LogicalTask.ensure({ executionSessionID: child.id, authoritySessionID: fixture.parent.id, projectID: child.projectID, memberID: "jimmy", source: "host" })
  const binding = yield* ResearchBinding.resolve(child.id, child.projectID)
  const agent = yield* agents.get("jimmy")
  const tool = (yield* registry.tools({ agent, providerID: fixture.model.providerID, modelID: fixture.model.id })).find((tool) => tool.id === "research_record")
  if (!tool) throw new Error("Expected actual native record tool")
  const user = yield* fixture.sessions.updateMessage({ id: MessageID.ascending(), sessionID: child.id, role: "user", agent: "jimmy",
    model: { providerID: fixture.model.providerID, modelID: fixture.model.id }, time: { created: Date.now() } })
  const assistant = yield* fixture.sessions.updateMessage({ ...fixture.assistant, id: MessageID.ascending(), sessionID: child.id, parentID: user.id, agent: "jimmy", mode: "subagent" })
  const record = (input: Research.RecordInput) => Effect.gen(function* () {
    const callID = PartID.ascending()
    yield* fixture.sessions.updatePart({ id: PartID.ascending(), sessionID: child.id, messageID: assistant.id, type: "tool", tool: "research_record", callID,
      state: { status: "running", input, time: { start: Date.now() } } })
    return yield* execution.enter(child.id, "qualification-bounds", tool.execute(input, { sessionID: child.id, messageID: assistant.id, callID,
      agent: agent.name, agentID: "jimmy", permission: agent.permission, abort: AbortSignal.any([]), messages: [],
      ask: () => Effect.void, metadata: () => Effect.void }))
  })
  const finding = { action: "finding" as const, proposition: "Public fixture hypothesis", nature: "hypothesis" as const,
    conditions: ["Unobserved fixture hypothesis only"], evidence: [], contrary: [] }
  const admitted = yield* Effect.forEach(Array.from({ length: 33 }, (_, index) => index), (index) => record({ ...finding, proposition: `${finding.proposition} ${index}` }))
  const refs = admitted.map((reply) => Schema.decodeUnknownSync(Schema.Struct({ record: Research.FindingRecord }))(reply.metadata.research).record)
    .map((value) => ({ id: value.id, revision: value.revision }))
  const calls = { views: 0 }
  const bounded = yield* ResearchQualifications.collect({ ...records, view: (binding, input) => {
    calls.views++
    return records.view(binding, input)
  } }, binding, [...refs, refs[0]])
  expect(calls.views).toBe(32)
  expect(bounded).toMatchObject({ complete: false, total: 33, omitted: 1 })
  expect(bounded.records).toHaveLength(32)
  expect(Buffer.byteLength(JSON.stringify(bounded.records), "utf8")).toBeLessThanOrEqual(16 * 1024)
  const huge = yield* record({ ...finding, proposition: "é".repeat(4096), conditions: ["é".repeat(2048), "界".repeat(1365)] })
  const hugeRecord = Schema.decodeUnknownSync(Schema.Struct({ record: Research.FindingRecord }))(huge.metadata.research).record
  const byteBound = yield* ResearchQualifications.collect(records, binding, [{ id: hugeRecord.id, revision: 1 }, refs[0]])
  expect(byteBound).toMatchObject({ complete: false, total: 2, omitted: 1 })
  expect(byteBound.records).toEqual(bounded.records.slice(0, 1))
  expect(DiscoveryResult.report("Original worker text", { schema: "discovery-work-result-v1", qualifications: byteBound,
    card: { parsed: true }, changes: [], checks: [], blockers: [], risks: [], nextActions: [], terminal: { reason: "ended" }, memory: { reads: [], writes: [] } })).toContain(`\n> ${JSON.stringify(byteBound)}`)
  const question = yield* record({ action: "question", question: "Which conditions apply?", selection: { profile: "locate", depth: "quick", genre: "answer" } })
  const questionRecord = Schema.decodeUnknownSync(Schema.Struct({ record: Research.QuestionRecord }))(question.metadata.research).record
  const foreign = yield* fixture.sessions.create({ agent: "jimmy", parentID: fixture.parent.id })
  yield* LogicalTask.ensure({ executionSessionID: foreign.id, authoritySessionID: fixture.parent.id, projectID: foreign.projectID, memberID: "jimmy", source: "host" })
  const foreignBinding = yield* ResearchBinding.resolve(foreign.id, foreign.projectID)
  expect((yield* ResearchQualifications.collect(records, foreignBinding, [refs[0]]).pipe(Effect.flip)).code).toBe("reference_invalid")
  for (const item of [{ sessionID: child.id, ref: { id: questionRecord.id, revision: 1 } },
    { sessionID: child.id, ref: { ...refs[0], revision: 0 } },
    { sessionID: child.id, ref: { ...refs[0], revision: 999 } }, { sessionID: foreign.id, ref: refs[0] }]) {
    const ref = item.ref
    const own = item.sessionID === child.id ? binding : foreignBinding
    expect((yield* ResearchQualifications.collect(records, own, [ref]).pipe(Effect.flip)).code).toBe("reference_invalid")
    const card: Research.Card = { answer: "It works.", profile: "locate", depth: "quick", sufficiency: "answered", findingRefs: [ref], evidenceRefs: [], documentRefs: [],
      coverage: { examined: [], excluded: [], failures: [] }, limitations: [], nextActions: [] }
    const result = yield* DiscoveryResult.assemble({ info: { ...assistant, sessionID: item.sessionID, finish: "stop" }, parts: [{ id: PartID.ascending(), sessionID: item.sessionID, messageID: assistant.id,
      type: "text", text: `\u0060\u0060\u0060jimmy-result\n${JSON.stringify(card)}\n\u0060\u0060\u0060` }] }, [])
    expect(result).toMatchObject({ card: { parsed: ref.revision !== 0 }, referencesChecked: false, terminal: { reason: "ended" } })
    expect(result.discovery).toBeUndefined()
    expect(result.qualifications).toBeUndefined()
    expect(DiscoveryResult.report("Original worker text", result)).toBe("Original worker text")
  }
  expect(DiscoveryResult.report("Unsupported seat text", { schema: "backend-work-result-v1", qualifications: bounded,
    card: { parsed: false }, changes: [], checks: [], blockers: [], risks: [], nextActions: [], terminal: { reason: "ended" }, memory: { reads: [], writes: [] } })).toBe("Unsupported seat text")
}), { git: true }, 120_000)
