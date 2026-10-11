import { expect } from "bun:test"
import path from "node:path"
import { Cause, Effect, Exit, Layer, Schema } from "effect"
import { EventV2 } from "@orchestra/core/event"
import { Database } from "@orchestra/core/database/database"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { ResearchBinding } from "@orchestra/core/research/binding"
import { ResearchRecords } from "@orchestra/core/research/records"
import { ResearchLedger } from "@orchestra/core/research/ledger"
import { SessionV1 } from "@orchestra/core/v1/session"
import { Research } from "@orchestra/schema/research"
import { ResearchEvent } from "@orchestra/schema/research-event"
import { Agent } from "@/agent/agent"
import { BackgroundJob } from "@/background/job"
import { Config } from "@/config/config"
import { DiscoveryResult } from "@/maestro/discovery-result"
import { LogicalTask } from "@/maestro/logical-task"
import { ResearchExecution } from "@/research/allowance"
import { ResearchQualifications } from "@/research/qualifications"
import { SessionCompaction } from "@/session/compaction"
import { MessageV2 } from "@/session/message-v2"
import { MessageID, PartID } from "@/session/schema"
import { ToolRegistry } from "@/tool/registry"
import { Truncate } from "@/tool/truncate"
import { awaitWithTimeout, pollWithTimeout, testEffect } from "../lib/effect"
import { reloadInstance, TestInstance } from "../fixture/fixture"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { NativeResearchTask } from "./fixtures/native-task"

// Optional Config is resolved at Truncate call time, so both services must be public root outputs.
const it = testEffect(Layer.mergeAll(NativeResearchTask.layer,
  TestAppNodeBuilder.build(LayerNode.group([Config.node, Truncate.node, Global.node])),
))
const Summary = Schema.Struct({ records: Schema.Array(Research.FindingRecord), complete: Schema.Boolean,
  total: Schema.Int, omitted: Schema.Int })
const Result = Schema.Struct({ workResult: Schema.Struct({ qualifications: Summary, discovery: Research.Card,
  referencesChecked: Schema.Boolean, terminal: Schema.Struct({ reason: Schema.String }) }) })

// Scripted public fixture checks handoff mechanics, not semantic truth or model quality.
for (const background of [false, true]) it.instance(`native qualified Task output survives vague card; background=${background}`, () => Effect.gen(function* () {
  const fs = yield* FSUtil.Service
  const instance = yield* TestInstance
  yield* fs.writeFileString(path.join(instance.directory, "orchestra.jsonc"), JSON.stringify({ compaction: { tail_turns: 0 }, tool_output: { max_bytes: 16 * 1024 } }))
  const config = yield* Config.Service
  yield* config.invalidate()
  yield* reloadInstance({ directory: instance.directory })
  const fixture = yield* NativeResearchTask.setup()
  yield* Effect.addFinalizer(() => fixture.sessions.remove(fixture.parent.id).pipe(Effect.orDie))
  const truncate = yield* Truncate.Service
  expect((yield* config.get()).tool_output?.max_bytes).toBe(16 * 1024)
  expect((yield* truncate.limits()).maxBytes).toBe(16 * 1024)
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
      if (!background && state.findings.length <= 4) {
        yield* fixture.remote.tool("research_record", { action: "finding", proposition: "é".repeat(4096), nature: "hypothesis",
          conditions: ["x".repeat(4096), "y".repeat(state.findings.length === 3 ? 300 : 4096)], evidence: [], contrary: [] })
        return
      }
      const refs = (background ? [state.findings[2]] : [state.findings[2], state.findings[3]])
        .map((finding) => ({ id: finding.id, revision: finding.revision }))
      yield* fixture.remote.tool("research_record", { action: "document", document: {
        title: "Conditional public fixture", genre: "comparison", body: "Support depends on scope [source](research:declared).",
        findingRefs: refs, citations: { declared: state.findings[0].evidence[0],
          ...Object.fromEntries(Array.from({ length: background ? 0 : 16 }, (_, index) => [`additional${index}`, state.findings[0].evidence[0]])) },
      } })
      return
    }
    if (event.type !== SessionV1.Event.PartUpdated.type) return
    const part = Schema.decodeUnknownSync(SessionV1.Event.PartUpdated.data)(event.data).part
    if (part.sessionID !== state.source?.binding.executionSessionID || part.type !== "tool" || part.tool !== "research_record" || part.state.status !== "completed") return
    const reply = Schema.decodeUnknownOption(Schema.Struct({ document: Research.DocumentReceipt, qualifications: Summary }))(part.state.metadata.research)
    if (reply._tag === "None" || state.document) return
    state.document = reply.value.document
    state.documentReply = part.state.output
    expect(reply.value.qualifications).toEqual({ records: background ? [state.findings[2]] : [state.findings[2], state.findings[3]],
      complete: true, total: background ? 1 : 2, omitted: 0 })
    if (!background) expect(Buffer.byteLength(JSON.stringify(part.state.metadata.research, null, 2), "utf8")).toBeGreaterThan(16 * 1024)
    expect(part.state.output.startsWith('{\n  "qualifications":')).toBe(true)
    expect(part.state.output.startsWith(`${JSON.stringify({ qualifications: reply.value.qualifications }, null, 2).slice(0, -2)},\n`)).toBe(true)
    expect(part.state.output).toContain(state.findings[2].proposition)
    expect(part.state.output.indexOf('"qualifications"')).toBeLessThan(part.state.output.indexOf('"receipt"'))
    if (!background) expect(part.state.metadata.truncated).toBe(true)
    const cardRefs = (background ? [state.findings[0]] : [state.findings[0], state.findings[4]])
      .map((finding) => ({ id: finding.id, revision: finding.revision }))
    state.card = { answer: "It works.", profile: "evaluate", depth: "focused", sufficiency: "answered",
      findingRefs: [...cardRefs, cardRefs[0]], evidenceRefs: [], documentRefs: [state.document.ref],
      coverage: { examined: ["public-conditions.txt"], excluded: [], failures: [] }, limitations: [], nextActions: [] }
    const prose = background ? "It works." : "It works.\n".repeat(2100)
    yield* fixture.remote.text(`${prose}\n\u0060\u0060\u0060jimmy-result\n${JSON.stringify(state.card)}\n\u0060\u0060\u0060`)
    yield* fixture.remote.text("Parent received retained qualifications.")
  }))
  yield* Effect.addFinalizer(() => unsubscribe)
  const args = { description: "Compare public fixture conditions", prompt: "Compare declaration and observation with contrary applicability", subagent_type: "jimmy", background }
  if (!background) yield* fixture.remote.tool("task", args)
  yield* fixture.remote.tool("read", { filePath: "public-conditions.txt" })
  const called = background ? yield* awaitWithTimeout(fixture.call(args, "qualified-task"), "Native background Task did not return", "30 seconds") : undefined
  if (called && Exit.isFailure(called.exit)) return yield* Effect.failCause(called.exit.cause)
  if (!background) yield* awaitWithTimeout(fixture.prompt.prompt({ sessionID: fixture.parent.id, agent: "maestro",
    model: { providerID: fixture.model.providerID, modelID: fixture.model.id }, parts: [{ type: "text", text: "Compare public fixture conditions using native Task." }] }),
    "Actual Maestro Task and parent continuation did not settle", "30 seconds")
  const jobs = yield* BackgroundJob.Service
  const job = called && Exit.isSuccess(called.exit) ? yield* jobs.wait({ id: String(called.exit.value.metadata.sessionId), timeout: 30_000 }) : undefined
  if (background) expect(job?.info?.status).toBe("completed")
  const delivered = background ? yield* pollWithTimeout(fixture.sessions.messages({ sessionID: fixture.parent.id }).pipe(
    Effect.map((history) => history.flatMap((message) => message.parts).find((part) => part.type === "text" &&
      part.metadata?.source?.type === "task-return" && part.metadata.source.state === "completed")),
  ), "Background Task did not deliver qualified output", "30 seconds") : (yield* fixture.sessions.messages({ sessionID: fixture.parent.id }))
    .flatMap((message) => message.parts).findLast((part) => part.type === "tool" && part.tool === "task")
  if (!delivered) throw new Error("Expected independently persisted native Task return")
  const returned = delivered.type === "text" ? { output: delivered.text, metadata: delivered.metadata }
    : delivered.type === "tool" && delivered.state.status === "completed" ? delivered.state : undefined
  if (!returned) throw new Error("Expected completed native Task return")
  const output = returned.output
  const metadata = returned.metadata
  const envelope = Schema.decodeUnknownSync(Result)(metadata)
  const expected = { records: background ? [state.findings[0], state.findings[2]] : [state.findings[0], state.findings[2], state.findings[3]],
    complete: background, total: background ? 2 : 4, omitted: background ? 0 : 1 }
  expect(envelope.workResult).toMatchObject({ qualifications: expected, discovery: state.card,
    referencesChecked: true, terminal: { reason: "ended" } })
  expect(output).toContain(`\n> ${JSON.stringify(expected)}`)
  expect(output.split("Retained finding qualifications")).toHaveLength(2)
  expect(output).toContain("It works.")
  if (!background) {
    expect(metadata?.truncated).toBe(true)
    expect(output).toContain("Incomplete: 1 finding(s) omitted; reopen exact retained finding references")
    expect(Buffer.byteLength(JSON.stringify(expected, null, 2), "utf8")).toBeGreaterThan(14 * 1024)
    expect(Buffer.byteLength(JSON.stringify({ qualifications: expected }, null, 2), "utf8")).toBeLessThanOrEqual(15 * 1024)
    expect(Buffer.byteLength(output.split("\n\n")[0], "utf8")).toBeLessThanOrEqual(16 * 1024)
    const preview = yield* truncate.output(`${output}\n${"Worker prose beyond handoff bounds.\n".repeat(2000)}`, { maxBytes: 16 * 1024 })
    expect(preview.truncated).toBe(true)
    expect(preview.content).toContain(`\n> ${JSON.stringify(expected)}`)
    expect(preview.content).toContain("Incomplete: 1 finding(s) omitted; reopen exact retained finding references")
  }
  expect(expected.records[0]).toMatchObject({ revision: 1, nature: "extraction", conditions: ["release 1", "enabled mode only; disabled mode does not apply"],
    reason: "Declaration is not observed runtime behavior" })
  const source = state.source
  if (!source) throw new Error("Expected retained native source")
  expect(expected.records[0].contrary).toEqual([{ source: source.ref,
    locator: { kind: "quote", exact: "Contrary: release 1 disabled mode rejects requests." } }])
  expect(expected.records[1]).toMatchObject({ nature: "observation", conditions: ["release 2", "disabled mode", "supplied public fixture only"] })
  expect(state.findings[1]).toMatchObject({ id: expected.records[0].id, revision: 2, nature: "hypothesis" })
  if (background) yield* fixture.remote.wait(7).pipe(Effect.timeout("30 seconds"))
  const inputs = yield* fixture.remote.inputs
  expect(inputs).toHaveLength(background ? 7 : 10)
  expect(JSON.stringify(inputs[background ? 5 : 8])).toContain(JSON.stringify(state.documentReply).slice(1, -1))
  expect(JSON.stringify(inputs.at(-1))).toContain(JSON.stringify(output).slice(1, -1))
  expect(JSON.stringify(inputs.at(-1))).toContain(JSON.stringify(JSON.stringify(expected)).slice(1, -1))
  if (!state.source || !state.card) throw new Error("Expected native retained findings and card")
  expect(yield* records.view(state.source.binding, { action: "record", ref: state.card.findingRefs[0] })).toEqual(expected.records[0])
  expect(yield* ResearchQualifications.collect(records, state.source.binding, [state.findings[0], state.findings[1], state.findings[0]]
    .map((finding) => ({ id: finding.id, revision: finding.revision })))).toEqual({ records: state.findings.slice(0, 2), complete: true, total: 2, omitted: 0 })

  if (background) return
  if (delivered.type !== "tool") throw new Error("Expected actual native Task part")

  const compaction = yield* SessionCompaction.Service
  const execution = yield* ResearchExecution.Service
  const childID = state.source.binding.executionSessionID
  yield* compaction.create({ sessionID: childID, agent: "jimmy", model: { providerID: fixture.model.providerID, modelID: fixture.model.id }, auto: false })
  const history = yield* fixture.sessions.messages({ sessionID: childID })
  const boundary = history.at(-1)
  if (!boundary || boundary.info.role !== "user") throw new Error("Expected real compaction boundary")
  yield* fixture.remote.text("It works; details omitted in this summary.")
  expect(yield* execution.enter(childID, delivered.callID, compaction.process({ sessionID: childID, parentID: boundary.info.id, messages: history, auto: false }))).toBe("continue")
  const visible = MessageV2.filterCompacted((yield* fixture.sessions.messages({ sessionID: childID })).toReversed())
  expect(visible.some((message) => message.parts.some((part) => part.type === "tool" && part.tool === "research_record"))).toBe(false)
  yield* fixture.fs.remove(path.join(fixture.instance.directory, "public-conditions.txt"))
  yield* fixture.remote.tool("task", { description: "Reopen historical qualifications", prompt: "Return retained historical references", subagent_type: "jimmy", task_id: state.source.binding.taskId })
  yield* fixture.remote.text(`\u0060\u0060\u0060jimmy-result\n${JSON.stringify(state.card)}\n\u0060\u0060\u0060`)
  yield* fixture.remote.text("Parent received historical qualifications.")
  yield* fixture.prompt.prompt({ sessionID: fixture.parent.id, agent: "maestro", model: { providerID: fixture.model.providerID, modelID: fixture.model.id },
    parts: [{ type: "text", text: "Resume same Task after compaction." }] })
  const resumed = (yield* fixture.sessions.messages({ sessionID: fixture.parent.id })).flatMap((message) => message.parts)
    .findLast((part) => part.type === "tool" && part.tool === "task")
  if (resumed?.type !== "tool" || resumed.state.status !== "completed") throw new Error("Expected persisted resumed native Task")
  expect(Schema.decodeUnknownSync(Result)(resumed.state.metadata).workResult.qualifications).toEqual(expected)
  expect(resumed.state.output).toContain(`\n> ${JSON.stringify(expected)}`)
}), { git: true }, 120_000)

it.instance("own exact refs reject foreign/nonfinding; lookup and UTF-8 bounds explicitly omit whole records", () => Effect.gen(function* () {
  const fs = yield* FSUtil.Service
  const instance = yield* TestInstance
  yield* fs.writeFileString(path.join(instance.directory, "orchestra.jsonc"), JSON.stringify({ tool_output: { max_bytes: 16 * 1024 } }))
  const config = yield* Config.Service
  yield* config.invalidate()
  yield* reloadInstance({ directory: instance.directory })
  const fixture = yield* NativeResearchTask.setup()
  yield* Effect.addFinalizer(() => fixture.sessions.remove(fixture.parent.id).pipe(Effect.orDie))
  const truncate = yield* Truncate.Service
  expect((yield* config.get()).tool_output?.max_bytes).toBe(16 * 1024)
  expect((yield* truncate.limits()).maxBytes).toBe(16 * 1024)
  const records = yield* ResearchRecords.Service
  const database = yield* Database.Service
  const agents = yield* Agent.Service
  const registry = yield* ToolRegistry.Service
  const execution = yield* ResearchExecution.Service
  const child = yield* fixture.sessions.create({ agent: "jimmy", parentID: fixture.parent.id, title: "Qualification boundary execution" })
  yield* LogicalTask.ensure({ executionSessionID: child.id, authoritySessionID: fixture.parent.id, projectID: child.projectID, memberID: "jimmy", source: "host" })
  const binding = yield* ResearchBinding.resolve(child.id, child.projectID)
  const agent = yield* agents.get("jimmy")
  const tool = (yield* registry.tools({ agent, providerID: fixture.model.providerID, modelID: fixture.model.id })).find((tool) => tool.id === "research_record")
  if (!tool) throw new Error("Expected actual native record tool")
  const user = yield* fixture.sessions.updateMessage({ id: MessageID.ascending(), sessionID: child.id, role: "user", agent: "jimmy",
    model: { providerID: fixture.model.providerID, modelID: fixture.model.id }, time: { created: Date.now() } })
  const assistant = yield* fixture.sessions.updateMessage({ ...fixture.assistant, id: MessageID.ascending(), sessionID: child.id, parentID: user.id, agent: "jimmy", mode: "subagent" })
  const record = (input: Research.RecordInput, sessionID = child.id, messageID = assistant.id, callID = PartID.ascending()) => Effect.gen(function* () {
    const part = { id: callID, sessionID, messageID, type: "tool" as const, tool: "research_record", callID,
      state: { status: "running" as const, input, time: { start: Date.now() } } }
    yield* fixture.sessions.updatePart(part)
    const result = yield* execution.enter(sessionID, "qualification-bounds", tool.execute(input, { sessionID, messageID, callID,
      agent: agent.name, agentID: "jimmy", permission: agent.permission, abort: AbortSignal.any([]), messages: [],
      ask: () => Effect.void, metadata: () => Effect.void }))
    yield* fixture.sessions.updatePart({ ...part, state: { status: "completed", input, title: result.title, output: result.output,
      metadata: result.metadata, time: { start: part.state.time.start, end: Date.now() } } })
    return result
  })
  const finding = { action: "finding" as const, proposition: "Public fixture hypothesis", nature: "hypothesis" as const,
    conditions: Array.from({ length: 32 }, (_, index) => `scope ${index}`), evidence: [], contrary: [] }
  const admitted = yield* Effect.forEach(Array.from({ length: 33 }, (_, index) => index), (index) => record({ ...finding, proposition: `${finding.proposition} ${index}` }))
  const refs = admitted.map((reply) => Schema.decodeUnknownSync(Schema.Struct({ record: Research.FindingRecord }))(reply.metadata.research).record)
    .map((value) => ({ id: value.id, revision: value.revision }))
  const calls = { views: 0, queries: 0 }
  const counted = { ...records, view: (binding: Research.Binding, input: Research.ViewInput) => {
    if (input.action === "record") calls.views++
    return records.view(binding, input)
  } }
  const instrumented = { ...database, db: new Proxy(database.db, { get: (target, key, receiver) => {
    if (key === "select") calls.queries++
    return Reflect.get(target, key, receiver)
  } }) }
  const bounded = yield* ResearchQualifications.collect(counted, binding, [...refs.slice(0, 32), refs[0]]).pipe(Effect.provideService(Database.Service, instrumented))
  expect(calls.views).toBe(32)
  expect(calls.queries).toBeGreaterThan(0)
  expect(bounded).toMatchObject({ complete: false, total: 32, omitted: 32 - bounded.records.length })
  expect(bounded.records.length).toBeGreaterThan(10)
  expect(bounded.records).toEqual(admitted.slice(0, bounded.records.length)
    .map((reply) => Schema.decodeUnknownSync(Schema.Struct({ record: Research.FindingRecord }))(reply.metadata.research).record))
  expect(Buffer.byteLength(JSON.stringify({ qualifications: bounded }, null, 2), "utf8")).toBeLessThanOrEqual(15 * 1024)
  yield* record({ ...finding, id: refs[0].id, baseRevision: 1, proposition: "Later applicability must not replace own historical finding", reason: "Scope revised after admission" })
  const manyLines = { action: "document" as const, document: { genre: "answer" as const, title: "Many-line qualification packet",
    body: "Own historical constraints", findingRefs: refs.slice(0, 32), citations: {} } }
  const documentCall = PartID.ascending()
  const published = yield* record(manyLines, child.id, assistant.id, documentCall)
  const qualified = Schema.decodeUnknownSync(Schema.Struct({ qualifications: Summary, document: Research.DocumentReceipt }))(published.metadata.research)
  expect(qualified.qualifications).toEqual(bounded)
  expect(Buffer.byteLength(JSON.stringify(published.metadata.research, null, 2), "utf8")).toBeGreaterThan(16 * 1024)
  expect(published.metadata.truncated).toBe(true)
  const packet = JSON.stringify({ qualifications: bounded }, null, 2).slice(0, -2)
  expect(packet.split("\n").length).toBeGreaterThan(500)
  expect(published.output.startsWith(`${packet},\n`)).toBe(true)
  const receiptStart = published.output.indexOf(',\n  "receipt":')
  if (receiptStart < 0) throw new Error("Native preview dropped qualification boundary")
  expect(Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Struct({ qualifications: Summary })))(`${published.output.slice(0, receiptStart)}\n}`).qualifications).toEqual(bounded)
  const preview = yield* truncate.output(JSON.stringify({ qualifications: bounded, receipt: qualified.document }, null, 2), { maxBytes: 16 * 1024 })
  expect(preview.truncated).toBe(true)
  expect(preview.content.startsWith(`${packet},\n`)).toBe(true)
  expect((yield* record(manyLines, child.id, assistant.id, documentCall)).metadata.research).toEqual(published.metadata.research)
  const huge = yield* record({ ...finding, proposition: "é".repeat(4096), conditions: ["é".repeat(2048), "界".repeat(1365)] })
  const hugeRecord = Schema.decodeUnknownSync(Schema.Struct({ record: Research.FindingRecord }))(huge.metadata.research).record
  const byteBound = yield* ResearchQualifications.collect(records, binding, [{ id: hugeRecord.id, revision: 1 }, refs[0]])
  expect(byteBound).toMatchObject({ complete: false, total: 2, omitted: 1 })
  expect(byteBound.records).toEqual(bounded.records.slice(0, 1))
  const question = yield* record({ action: "question", question: "Which conditions apply?", selection: { profile: "locate", depth: "quick", genre: "answer" } })
  const questionRecord = Schema.decodeUnknownSync(Schema.Struct({ record: Research.QuestionRecord }))(question.metadata.research).record
  const foreign = yield* fixture.sessions.create({ agent: "jimmy", parentID: fixture.parent.id, title: "Foreign qualification owner" })
  yield* LogicalTask.ensure({ executionSessionID: foreign.id, authoritySessionID: fixture.parent.id, projectID: foreign.projectID, memberID: "jimmy", source: "host" })
  const foreignBinding = yield* ResearchBinding.resolve(foreign.id, foreign.projectID)
  // Core explicit-ID reuse remains project-wide; the handoff boundary must independently reject it.
  expect(yield* records.view(foreignBinding, { action: "record", ref: refs[0] })).toMatchObject(refs[0])
  expect((yield* ResearchQualifications.collect(records, foreignBinding, [refs[0]]).pipe(Effect.flip)).code).toBe("reference_invalid")
  const foreignUser = yield* fixture.sessions.updateMessage({ ...user, id: MessageID.ascending(), sessionID: foreign.id })
  const foreignAssistant = yield* fixture.sessions.updateMessage({ ...assistant, id: MessageID.ascending(), sessionID: foreign.id, parentID: foreignUser.id })
  const foreignReply = yield* record(finding, foreign.id, foreignAssistant.id)
  const foreignRecord = Schema.decodeUnknownSync(Schema.Struct({ record: Research.FindingRecord }))(foreignReply.metadata.research).record
  const foreignRef = { id: foreignRecord.id, revision: foreignRecord.revision }
  for (const last of [refs[32], { ...refs[0], revision: 999 }, foreignRef]) {
    calls.views = 0
    calls.queries = 0
    expect((yield* ResearchQualifications.collect(counted, binding, [...refs.slice(0, 32), last])
      .pipe(Effect.provideService(Database.Service, instrumented), Effect.flip)).code).toBe("over_cap")
    expect(calls).toEqual({ views: 0, queries: 0 })
  }
  const doc = { genre: "answer" as const, title: "Oversized own reference union", body: "Authored fixture", findingRefs: [refs[32]], citations: {} }
  const before = (yield* ResearchLedger.entries(binding)).filter((entry) => entry.type === "research.document.published")
  expect(before).toHaveLength(1)
  expect(before[0].data.receipt.bytes).toBeGreaterThan(0)
  const global = yield* Global.Service
  const directory = path.join(global.data, "research", ResearchLedger.digest(binding.projectID), ResearchLedger.digest(binding.taskId))
  const files = (yield* fs.readDirectory(directory)).toSorted()
  expect(files.some((file) => file.endsWith(".body"))).toBe(true)
  const bytes = (yield* Effect.forEach(files, (file) => fs.stat(path.join(directory, file)))).reduce((bytes, stat) => bytes + Number(stat.size), 0)
  const rejectedInput = { action: "document" as const, document: { ...doc, title: "Foreign document-linked finding", findingRefs: [foreignRef] } }
  yield* fixture.remote.tool("research_record", rejectedInput)
  yield* fixture.remote.text("Foreign document preflight rejected.")
  yield* execution.enter(child.id, "qualification-bounds", fixture.prompt.prompt({ sessionID: child.id, agent: "jimmy",
    model: { providerID: fixture.model.providerID, modelID: fixture.model.id }, parts: [{ type: "text", text: "Attempt supplied document mutation." }] }))
  const rejected = (yield* fixture.sessions.messages({ sessionID: child.id })).flatMap((message) => message.parts)
    .findLast((part) => part.type === "tool" && part.tool === "research_record")
  if (rejected?.type !== "tool" || rejected.state.status !== "error") throw new Error("Expected persisted native document rejection")
  expect(rejected.state.error).toContain("Qualification finding is not admitted by this Task")
  const retried = yield* execution.enter(child.id, "qualification-bounds", tool.execute(rejectedInput, { sessionID: child.id,
    messageID: rejected.messageID, callID: rejected.callID, agent: agent.name, agentID: "jimmy", permission: agent.permission,
    abort: AbortSignal.any([]), messages: [], ask: () => Effect.void, metadata: () => Effect.void })).pipe(Effect.exit)
  expect(Exit.isFailure(retried) && Cause.pretty(retried.cause)).toContain("Qualification finding is not admitted by this Task")
  const after = (yield* ResearchLedger.entries(binding)).filter((entry) => entry.type === "research.document.published")
  expect(after).toEqual(before)
  expect(after.filter((entry) => entry.data.receipt.title === rejectedInput.document.title)).toHaveLength(0)
  expect((yield* fs.readDirectory(directory)).toSorted()).toEqual(files)
  expect((yield* Effect.forEach(files, (file) => fs.stat(path.join(directory, file)))).reduce((bytes, stat) => bytes + Number(stat.size), 0) - bytes).toBe(0)
  const document = Schema.decodeUnknownSync(Schema.Struct({ document: Research.DocumentReceipt }))((yield* record({ action: "document", document: doc })).metadata.research).document
  for (const input of [{ findings: refs.slice(0, 32), document },
    { findings: [...refs.slice(0, 31), { ...refs[0], revision: 999 }], document }]) {
    const card: Research.Card = { answer: "It works.", profile: "locate", depth: "quick", sufficiency: "answered", findingRefs: input.findings,
      evidenceRefs: [], documentRefs: [input.document.ref], coverage: { examined: [], excluded: [], failures: [] }, limitations: [], nextActions: [] }
    const raw = `\u0060\u0060\u0060jimmy-result\n${JSON.stringify(card)}\n\u0060\u0060\u0060`
    calls.views = 0
    const result = yield* DiscoveryResult.assemble({ info: { ...assistant, finish: "stop" }, parts: [{ id: PartID.ascending(), sessionID: child.id,
      messageID: assistant.id, type: "text", text: raw }] }, []).pipe(Effect.provideService(ResearchRecords.Service, counted))
    expect(calls.views).toBe(0)
    expect(result).toMatchObject({ referencesChecked: false, terminal: { reason: "ended" } })
    expect(result.qualifications).toBeUndefined()
    expect(result.discovery).toBeUndefined()
    const report = DiscoveryResult.report(raw, result)
    expect(report).toContain("Finding qualifications unavailable:")
    expect(report).toContain(`\n> ${JSON.stringify(raw)}`)
    expect((yield* truncate.output(report, { maxBytes: 16 * 1024 })).content).toContain("Finding qualifications unavailable:")
  }
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
    expect(DiscoveryResult.report("Original worker text", result)).toContain('Finding qualifications unavailable:')
    expect(DiscoveryResult.report("Original worker text", result)).toContain('\n> "Original worker text"')
  }
  expect(DiscoveryResult.report("Unsupported seat text", { schema: "backend-work-result-v1", qualifications: bounded,
    mode: "delegated", acceptance: { state: "pending" }, verification: { state: "not-host-verified" },
    card: { parsed: false }, changes: [], checks: [], blockers: [], risks: [], nextActions: [], terminal: { reason: "ended" }, memory: { reads: [], writes: [] } })).toBe("Unsupported seat text")
}), { git: true }, 120_000)
