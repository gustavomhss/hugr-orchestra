import { expect } from "bun:test"
import path from "node:path"
import { Cause, Context, Deferred, Effect, Exit, Fiber, Option, Schema } from "effect"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { ResearchRecords } from "@orchestra/core/research/records"
import { SessionProjector } from "@orchestra/core/session/projector"
import { Research } from "@orchestra/schema/research"
import { ResearchEvent } from "@orchestra/schema/research-event"
import { SessionV1 } from "@orchestra/core/v1/session"
import { Agent } from "@/agent/agent"
import { LogicalTask } from "@/maestro/logical-task"
import { AtlasMemory } from "@/maestro/atlas-memory"
import { Permission } from "@/permission"
import { Provider } from "@/provider/provider"
import { Session } from "@/session/session"
import { SessionPrompt } from "@/session/prompt"
import { MessageID, PartID } from "@/session/schema"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { ToolRegistry } from "@/tool/registry"
import { Tool } from "@/tool/tool"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { TestLLMServer } from "../lib/llm-server"
import { testProviderConfig } from "../lib/test-provider"

const server = LayerNode.make({ service: TestLLMServer, layer: TestLLMServer.layer, deps: [] })
const it = testEffect(TestAppNodeBuilder.build(LayerNode.group([
  SessionPrompt.node, ToolRegistry.node, Session.node, SessionProjector.node, Agent.node, Provider.node,
  Permission.node, ResearchRecords.node, Database.node, EventV2.node, FSUtil.node, server,
])))

// Scripted provider responses qualify native mechanics, not real-model research quality.
it.instance("native Task interruption resumes exact corpus through own admitted Atlas checkpoint", () => Effect.gen(function* () {
  const remote = yield* TestLLMServer
  const fs = yield* FSUtil.Service
  const instance = yield* TestInstance
  yield* fs.writeFileString(path.join(instance.directory, "orchestra.json"), JSON.stringify({
    ...testProviderConfig(remote.url), model: "test/test-model", small_model: "test/test-model", plugin: [], mcp: {},
    compaction: { auto: false }, continuity: { trigger: 1 },
  }))
  yield* fs.writeFileString(path.join(instance.directory, "conditions.txt"), "Only version 1 permits enabled operation.\nDisabled operation rejects the request.\n")
  const sessions = yield* Session.Service
  const prompt = yield* SessionPrompt.Service
  const agents = yield* Agent.Service
  const permission = yield* Permission.Service
  const registry = yield* ToolRegistry.Service
  const events = yield* EventV2.Service
  const records = yield* ResearchRecords.Service
  const provider = yield* Provider.Service
  const model = yield* provider.getModel(ProviderV2.ID.make("test"), ModelV2.ID.make("test-model"))
  const maestro = yield* agents.get("maestro")
  const parent = yield* sessions.create({ agent: "maestro", title: "Native continuation authority" })
  const user = yield* sessions.updateMessage({ id: MessageID.ascending(), sessionID: parent.id, role: "user", agent: "maestro",
    model: { providerID: model.providerID, modelID: model.id }, time: { created: Date.now() } })
  const assistant = yield* sessions.updateMessage({ id: MessageID.ascending(), sessionID: parent.id, parentID: user.id,
    role: "assistant", agent: "maestro", mode: "maestro", path: { cwd: instance.directory, root: instance.directory },
    providerID: model.providerID, modelID: model.id, cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, time: { created: Date.now() } })
  const task = (yield* registry.tools({ agent: maestro, providerID: model.providerID, modelID: model.id })).find((tool) => tool.id === "task")
  if (!task) throw new Error("Expected native Task definition")
  const state: { source?: Research.SourceReceipt; finding?: Research.RecordRef; taskId?: string; metadata: Record<string, unknown>;
    recalled?: { source: Research.SourceRef; finding: Research.RecordRef }; halted?: boolean; finalQueued?: boolean; reread?: Research.SourceRef } = { metadata: {} }
  const checkpoint = yield* Deferred.make<void>()
  const unsubscribe = yield* events.listen((event) => Effect.gen(function* () {
    if (event.type === ResearchEvent.SourceAdmitted.type) {
      const decoded = Schema.decodeUnknownOption(ResearchEvent.SourceAdmitted.data)(event.data)
      if (Option.isNone(decoded) || decoded.value.binding.authoritySessionID !== parent.id || decoded.value.receipt.ref.representation !== "text" || state.source) return
      state.source = decoded.value.receipt
      state.taskId = decoded.value.binding.taskId
      yield* remote.tool("research_record", { action: "finding", proposition: "Version 1 requires enabled operation", nature: "extraction",
        conditions: ["version 1", "enabled"], evidence: [{ source: state.source.ref, locator: { kind: "quote", exact: "Only version 1 permits enabled operation." } }],
        contrary: [{ source: state.source.ref, locator: { kind: "quote", exact: "Disabled operation rejects the request." } }],
      })
      return
    }
    if (event.type === ResearchEvent.RecordCommitted.type) {
      const decoded = Schema.decodeUnknownOption(ResearchEvent.RecordCommitted.data)(event.data)
      if (Option.isNone(decoded) || decoded.value.binding.authoritySessionID !== parent.id || decoded.value.record.kind !== "finding" || !state.source || state.finding) return
      state.finding = { id: decoded.value.record.id, revision: decoded.value.record.revision }
      yield* remote.tool("atlas_memory_emit", { entry: { taskId: decoded.value.binding.taskId,
        attempted: ["Read conditions.txt and retain both applicable branches"], failedWith: [], stoppedAt: "Condition-sensitive finding retained",
        lesson: "Disabled operation is contrary evidence against an unconditional conclusion",
        ref: JSON.stringify({ source: state.source.ref, finding: state.finding }),
      } })
      return
    }
    if (event.type !== SessionV1.Event.PartUpdated.type) return
    const decoded = Schema.decodeUnknownOption(SessionV1.Event.PartUpdated.data)(event.data)
    if (Option.isNone(decoded)) return
    const part = decoded.value.part
    if (part.type !== "tool" || part.state.status !== "completed") return
    if (part.tool === "atlas_memory_recall" && state.source) {
      if (state.recalled) return
      const recalled = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Struct({
        store: Schema.Literal("complete"), records: Schema.Array(Schema.Struct({ entry: Schema.Struct({ ref: Schema.String }) })),
      })))(part.state.output)
      if (Option.isNone(recalled) || recalled.value.records.length !== 1)
        return yield* Effect.die(new Error("Expected exact own checkpoint with retained corpus pointer"))
      state.recalled = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Struct({ source: Research.SourceRef, finding: Research.RecordRef })))(recalled.value.records[0].entry.ref)
      yield* remote.tool("research_view", { action: "source", ref: state.recalled.source })
      return
    }
    if (part.tool !== "atlas_memory_emit" || state.halted) return
    const receipt = Schema.decodeUnknownOption(Schema.Struct({ outcome: Schema.Literal("admitted") }))(part.state.metadata[AtlasMemory.RECEIPT_KEY])
    if (Option.isNone(receipt)) return
    state.halted = true
    yield* remote.hang
    yield* Deferred.succeed(checkpoint, undefined)
  }))
  yield* Effect.addFinalizer(() => unsubscribe)
  const call = (args: Record<string, unknown>, callID: string, cancellation?: { signal: AbortSignal; onMetadata?: () => void }) => Effect.gen(function* () {
    const part = { id: PartID.ascending(), sessionID: parent.id, messageID: assistant.id, type: "tool" as const, tool: "task", callID,
      state: { status: "running" as const, input: args, time: { start: Date.now() } } }
    yield* sessions.updatePart(part)
    const ctx: Tool.Context = { sessionID: parent.id, messageID: assistant.id, callID, agent: maestro.name, agentID: "maestro",
      permission: maestro.permission, abort: cancellation?.signal ?? AbortSignal.any([]), messages: [],
      extra: { model, promptOps: { prompt: prompt.prompt, cancel: prompt.cancel, resolvePromptParts: prompt.resolvePromptParts } },
      ask: (request) => permission.ask({ ...request, sessionID: parent.id, tool: { messageID: assistant.id, callID }, ruleset: maestro.permission }).pipe(Effect.orDie),
      metadata: (value) => Effect.sync(() => {
        if (value.metadata) state.metadata = value.metadata
        cancellation?.onMetadata?.()
      }),
    }
    // The public caller need not expose the research service captured by the native Task definition.
    return yield* task.execute(args, ctx).pipe(Effect.updateContext<never, never>(Context.omit(ResearchRecords.Service)))
  })
  const cancelled = new AbortController()
  cancelled.abort()
  const beforeCancelled = yield* sessions.children(parent.id)
  const args = { description: "Cancelled discovery", prompt: "Do not run after cancellation", subagent_type: "jimmy" }
  const preaborted = yield* call(args, "discovery-preaborted", { signal: cancelled.signal }).pipe(Effect.exit)
  expect(Exit.isFailure(preaborted) && Cause.pretty(preaborted.cause)).toContain("Task cancelled")
  expect(yield* sessions.children(parent.id)).toHaveLength(beforeCancelled.length)
  expect(yield* remote.calls).toBe(0)
  const startup = new AbortController()
  const abortedDuringStartup = yield* call(args, "discovery-startup-abort", {
    signal: startup.signal, onMetadata: () => startup.abort(),
  }).pipe(Effect.exit)
  expect(Exit.isFailure(abortedDuringStartup) && Cause.pretty(abortedDuringStartup.cause)).toContain("Task cancelled")
  expect(state.metadata).toMatchObject({ workResult: { terminal: { reason: "interrupted" } } })
  expect(yield* remote.calls).toBe(0)
  yield* remote.tool("read", { filePath: "conditions.txt" })
  const worker = yield* call({ description: "Inspect conditional behavior", prompt: "Investigate conditions and preserve contrary evidence", subagent_type: "jimmy" }, "discovery-first").pipe(Effect.forkScoped)
  yield* Effect.raceFirst(Deferred.await(checkpoint), Fiber.join(worker).pipe(
    Effect.flatMap((result) => Effect.gen(function* () {
      const calls = yield* remote.calls
      const children = yield* sessions.children(parent.id)
      const histories = yield* Effect.forEach(children, (child) => sessions.messages({ sessionID: child.id }))
      return yield* Effect.die(new Error(`Native Task ended before checkpoint: ${JSON.stringify({ result, calls, histories })}`))
    })),
  )).pipe(Effect.timeoutOrElse({ duration: "30 seconds", orElse: () => Effect.gen(function* () {
    const inputs = yield* remote.inputs
    const children = yield* sessions.children(parent.id)
    const histories = yield* Effect.forEach(children, (child) => sessions.messages({ sessionID: child.id }))
    return yield* Effect.die(new Error(`Native checkpoint not reached: ${JSON.stringify({ metadata: state.metadata, inputs, histories })}`))
  }) }))
  yield* remote.wait(4).pipe(Effect.timeout("30 seconds"))
  yield* Fiber.interrupt(worker)
  expect(state.source).toBeDefined()
  expect(state.finding).toBeDefined()
  expect(state.taskId).toBeString()
  if (!state.source || !state.finding || !state.taskId) throw new Error("Expected actual native corpus/checkpoint")
  const interrupted = Schema.decodeUnknownSync(Schema.Struct({ workResult: Schema.Struct({ terminal: Schema.Struct({ reason: Schema.String }), corpus: Research.Corpus }) }))(state.metadata)
  expect(interrupted.workResult.terminal.reason).toBe("interrupted")
  expect(interrupted.workResult.corpus.sources.map((source) => source.ref)).toContainEqual(state.source.ref)
  const childID = state.source.binding.executionSessionID
  expect((yield* LogicalTask.read(childID))?.taskId).toBe(state.taskId)
  const children = yield* sessions.children(parent.id)
  yield* remote.tool("atlas_memory_recall", { kind: "task", taskId: state.taskId })
  const answer = "Version 1 with enabled operation; disabled operation rejects requests."
  // Full recall, rather than the canonical reduced closing fold, carries the authored corpus pointer. The resumed
  // dispatch's inquiry cites only its own retained sources, so it rereads the file before it claims and closes.
  const recovered = yield* events.listen((event) => Effect.gen(function* () {
    if (event.type === ResearchEvent.SourceAdmitted.type) {
      const decoded = Schema.decodeUnknownOption(ResearchEvent.SourceAdmitted.data)(event.data)
      if (Option.isNone(decoded) || decoded.value.binding.authoritySessionID !== parent.id || decoded.value.receipt.ref.representation !== "text" ||
        !state.finalQueued || state.reread) return
      state.reread = decoded.value.receipt.ref
      yield* remote.tool("inquiry", { action: "open", question: "Which conditions apply?", subquestions: ["What does disabled operation do"], profile: "investigate" })
      return
    }
    if (event.type === ResearchEvent.InquiryOpened.type) {
      const decoded = Schema.decodeUnknownOption(ResearchEvent.InquiryOpened.data)(event.data)
      if (Option.isNone(decoded) || decoded.value.binding.authoritySessionID !== parent.id || !state.reread) return
      yield* remote.tool("inquiry", { action: "claim", subquestion: decoded.value.subquestions[0], proposition: "Disabled operation rejects the request",
        nature: "extraction", evidence: [{ source: state.reread, quote: "Disabled operation rejects the request." }] })
      yield* remote.tool("inquiry", { action: "check" })
      yield* remote.tool("inquiry", { action: "close", sufficiency: "answered", answer, limitations: ["Static supplied conditions only"] })
      yield* remote.text("Resumed research closed.")
      return
    }
    if (event.type !== SessionV1.Event.PartUpdated.type) return
    const decoded = Schema.decodeUnknownOption(SessionV1.Event.PartUpdated.data)(event.data)
    if (Option.isNone(decoded)) return
    const part = decoded.value.part
    if (part.type === "tool" && part.tool === "research_view" && part.state.status === "completed" && state.recalled && !state.finalQueued) {
      state.finalQueued = true
      yield* remote.tool("read", { filePath: "conditions.txt" })
    }
  }))
  yield* Effect.addFinalizer(() => recovered)
  const resumed = yield* call({ description: "Resume existing research", prompt: "Reopen retained contrary source, preserve qualifiers", subagent_type: "jimmy", task_id: state.taskId,
    memoryUnit: { kind: "task", id: state.taskId } }, "discovery-resume")
  expect(resumed.metadata.sessionId).toBe(childID)
  expect(yield* sessions.children(parent.id)).toHaveLength(children.length)
  expect(resumed.metadata.workResult).toMatchObject({ schema: "discovery-work-result-v1", taskId: state.taskId,
    card: { parsed: true }, referencesChecked: true, terminal: { reason: "ended" }, outcome: "done",
    discovery: { schema: "jimmy-card-v2", answer, sufficiency: "answered", check: { verdict: "pass" } },
    memory: { writes: [{ outcome: "admitted" }] } })
  const history = yield* sessions.messages({ sessionID: childID })
  const admissions = history.flatMap((message) => message.parts).flatMap((part) => "metadata" in part && part.metadata?.[AtlasMemory.ADMISSION_KEY] ? [part.metadata[AtlasMemory.ADMISSION_KEY]] : [])
  expect(admissions).toHaveLength(1)
  expect(state.recalled).toEqual({ source: state.source.ref, finding: state.finding })
  expect(yield* records.view(state.source.binding, { action: "record", ref: state.finding })).toMatchObject({ conditions: ["version 1", "enabled"], contrary: [{ source: state.source.ref }] })
  const wrong = yield* call({ description: "Reject unknown task", prompt: "Do not replace retained task", subagent_type: "jimmy", task_id: "tsk_missing" }, "discovery-unknown").pipe(Effect.exit)
  expect(Exit.isFailure(wrong) && Cause.pretty(wrong.cause)).toContain("Task")
  expect(yield* sessions.children(parent.id)).toHaveLength(children.length)
  yield* sessions.remove(parent.id)
}), { git: true }, 120_000)
