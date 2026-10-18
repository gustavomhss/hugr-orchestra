import { expect } from "bun:test"
import path from "node:path"
import { Effect, Exit, Layer, Schema } from "effect"
import { EventV2 } from "@orchestra/core/event"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { ResearchArtifacts } from "@orchestra/core/research/artifacts"
import { ResearchRecords } from "@orchestra/core/research/records"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { Research } from "@orchestra/schema/research"
import { ResearchEvent } from "@orchestra/schema/research-event"
import { Config } from "@/config/config"
import { Git } from "@/git"
import { AtlasHeader } from "@/maestro/atlas-header"
import { AtlasMemory } from "@/maestro/atlas-memory"
import { AtlasResumeRestore } from "@/maestro/atlas-resume-restore"
import { LogicalTask } from "@/maestro/logical-task"
import { ResearchExecution } from "@/research/allowance"
import { SessionCompaction } from "@/session/compaction"
import { MessageV2 } from "@/session/message-v2"
import { NativeResearchTask } from "./fixtures/native-task"
import { TestInstance } from "../fixture/fixture"
import { awaitWithTimeout, testEffect } from "../lib/effect"

// Expose real host support services hidden inside the frozen fixture's dependency graph.
const it = testEffect(Layer.mergeAll(NativeResearchTask.layer, LayerNode.compile(LayerNode.group([Git.node, Config.node]))))

// Scripted HTTP replies exercise the installed provider and scanner, not model research quality.
it.instance("A02/A12 real provider turns isolate own Atlas header and retire rules on mid-session outage and member switch", () => Effect.gen(function* () {
  const fixture = yield* NativeResearchTask.setup()
  yield* Effect.addFinalizer(() => fixture.sessions.remove(fixture.parent.id).pipe(Effect.orDie))
  const events = yield* EventV2.Service
  const rules = { backend: "Backend checks its own execution boundary", jimmy: "Discovery checks source version before inference" }
  const seeds = yield* Effect.forEach(["backend", "jimmy"] as const, (member) => Effect.gen(function* () {
    const memory = yield* AtlasMemory.open({ sessionID: fixture.parent.id, callID: `seed-${member}`, assistantMessageID: fixture.assistant.id }, { id: member, native: true })
    if ("unavailable" in memory) throw new Error(memory.unavailable)
    expect(memory.binding.memoryOwner).toBe(member)
    expect(memory.binding.storage.projectID).toBe(fixture.parent.projectID)
    expect(FSUtil.resolve(memory.binding.storage.root)).toBe(FSUtil.resolve(fixture.instance.directory))
    expect(memory.binding.source.worktree).toBe(memory.binding.storage.root)
    const task = memory.write({ taskId: "header-excluded-task", attempted: ["HEADER_TASK_MUST_NOT_LOAD"], failedWith: [], stoppedAt: "Header exclusion control", lesson: "Task history is not a running header" })
    const pr = memory.write({ prId: "header-excluded-pr", decisions: ["HEADER_PR_MUST_NOT_LOAD"], reviewOutcomes: [], knowledgeDelta: [] })
    if (!task.ok || !pr.ok) throw new Error("Real Atlas scanner/provider did not admit harmless header controls")
    return { member, memory }
  }))
  // Atlas ages rules over every owner's folded log positions, not wall time or scope. Seeding the backend
  // rule before all five other records evicts it (1 * 0.5 ** 5 < 0.1). Write both rules after the checkpoints.
  seeds.forEach((seed) => {
    const rule = seed.memory.write({ rule: rules[seed.member], scope: "source" })
    if (!rule.ok) throw new Error("Real Atlas scanner/provider did not admit harmless header rule")
  })
  // Positive control at the final seed state: distinguish a bad fixture from lost provider InstanceRef/root.
  yield* Effect.forEach(seeds, (seed) => Effect.gen(function* () {
    const header = yield* AtlasHeader.render({ id: seed.member, native: true })
    expect(header).toContain(`member="${seed.member}" rules="1"`)
    expect(header).toContain(`- [source] ${rules[seed.member]}`)
    expect(header).not.toContain(rules[seed.member === "backend" ? "jimmy" : "backend"])
    expect(header).not.toContain("HEADER_TASK_MUST_NOT_LOAD")
    expect(header).not.toContain("HEADER_PR_MUST_NOT_LOAD")
  }))
  const roots = seeds.map((seed) => seed.memory.binding.storage.root)
  expect(roots[1]).toBe(roots[0])
  const backendCard = { outcome: "done", changes: [], checks: [], blockers: [], risks: [], nextActions: [] }
  yield* fixture.remote.textMatch((hit) => JSON.stringify(hit.body).includes("Return bounded header observation"), `\u0060\u0060\u0060backend-result\n${JSON.stringify(backendCard)}\n\u0060\u0060\u0060`)
  const backend = yield* awaitWithTimeout(fixture.call({ description: "Observe backend header", prompt: "Return bounded header observation", subagent_type: "backend" }, "backend-fresh"), "Backend header turn did not settle", "30 seconds")
  if (Exit.isFailure(backend.exit)) return yield* Effect.failCause(backend.exit.cause)
  expect(backend.exit.value.metadata.workResult).toMatchObject({ card: { parsed: true }, terminal: { reason: "ended" } })
  yield* fixture.fs.writeFileString(path.join(fixture.instance.directory, "conditions.txt"), "Only version 1 is supported.\n")
  const state: { source?: Research.SourceReceipt } = {}
  const unsubscribe = yield* events.listen((event) => Effect.gen(function* () {
    if (event.type !== ResearchEvent.SourceAdmitted.type) return
    const admitted = Schema.decodeUnknownSync(ResearchEvent.SourceAdmitted.data)(event.data)
    if (admitted.binding.authoritySessionID !== fixture.parent.id || admitted.receipt.ref.representation !== "text" || state.source) return
    state.source = admitted.receipt
    // Turn two must reacquire current header authority rather than reuse the previously loaded Rules.
    const log = path.join(roots[0], ".atlas/memory.jsonl")
    yield* fixture.fs.remove(log)
    yield* fixture.fs.makeDirectory(log)
    const card: Research.Card = { answer: "Only version 1; Atlas is unavailable.", profile: "understand", depth: "quick", sufficiency: "partial",
      findingRefs: [], evidenceRefs: [{ source: admitted.receipt.ref, locator: { kind: "quote", exact: "Only version 1 is supported." } }], documentRefs: [],
      coverage: { examined: ["conditions.txt"], excluded: ["Atlas"], failures: ["Atlas unavailable"] }, limitations: ["Current Atlas rules could not be loaded"], nextActions: [] }
    yield* fixture.remote.textMatch((hit) => JSON.stringify(hit.body).includes("Read conditions.txt; report scope and Atlas availability"), `\u0060\u0060\u0060jimmy-result\n${JSON.stringify(card)}\n\u0060\u0060\u0060`)
  }).pipe(Effect.orDie))
  yield* Effect.addFinalizer(() => unsubscribe)
  yield* fixture.remote.toolMatch((hit) => JSON.stringify(hit.body).includes("Read conditions.txt; report scope and Atlas availability"), "read", { filePath: path.join(fixture.instance.directory, "conditions.txt") })
  const discovery = yield* awaitWithTimeout(fixture.call({ description: "Observe discovery outage", prompt: "Read conditions.txt; report scope and Atlas availability", subagent_type: "jimmy" }, "jimmy-outage"), "Discovery outage turns did not settle", "30 seconds")
  if (Exit.isFailure(discovery.exit)) return yield* Effect.failCause(discovery.exit.cause)
  expect(state.source).toBeDefined()
  expect(discovery.exit.value.metadata.workResult).toMatchObject({ card: { parsed: true }, referencesChecked: true, terminal: { reason: "ended" } })
  yield* fixture.remote.textMatch((hit) => JSON.stringify(hit.body).includes("Report unavailable current Atlas"), `\u0060\u0060\u0060backend-result\n${JSON.stringify(backendCard)}\n\u0060\u0060\u0060`)
  const switched = yield* awaitWithTimeout(fixture.call({ description: "Observe backend cold outage", prompt: "Report unavailable current Atlas", subagent_type: "backend" }, "backend-unavailable"), "Backend outage turn did not settle", "30 seconds")
  if (Exit.isFailure(switched.exit)) return yield* Effect.failCause(switched.exit.cause)
  expect(switched.exit.value.metadata.workResult).toMatchObject({ card: { parsed: true }, terminal: { reason: "ended" } })
  const requests = yield* fixture.remote.inputs
  expect(requests).toHaveLength(4)
  const headers = requests.map(currentHeader)
  expect(headers[0]).toContain('member="backend"')
  expect(headers[0]).toContain(rules.backend)
  expect(headers[0]).not.toContain(rules.jimmy)
  expect(headers[0]).toContain('rules="1"')
  expect(headers[1]).toContain('member="jimmy"')
  expect(headers[1]).toContain(rules.jimmy)
  expect(headers[1]).not.toContain(rules.backend)
  expect(headers[1]).toContain('rules="1"')
  headers.slice(0, 2).forEach((header) => {
    expect(header).toContain("- [source] ")
    expect(header).toContain("Awareness:")
    expect(header).toContain("Orientation:")
    expect(header).not.toContain("HEADER_TASK_MUST_NOT_LOAD")
    expect(header).not.toContain("HEADER_PR_MUST_NOT_LOAD")
  })
  expect(headers[2]).toContain('member="jimmy" degraded="unavailable"')
  expect(headers[3]).toContain('member="backend" degraded="unavailable"')
  headers.slice(2).forEach((header) => {
    expect(header).not.toContain(rules.backend)
    expect(header).not.toContain(rules.jimmy)
    expect(header).toContain("no project rules are loaded")
  })
  expect(yield* fixture.remote.pending).toBe(0)
}), { git: true }, 120_000)

it.instance("A08 native Task checkpoint survives actual provider-driven compaction and reopens captured source", () => Effect.gen(function* () {
  const fs = yield* FSUtil.Service
  const instance = yield* TestInstance
  // JSONC loads after the fixture's JSON, before any Config-dependent setup initializes its cache.
  yield* fs.writeFileString(path.join(instance.directory, "orchestra.jsonc"), JSON.stringify({ compaction: { tail_turns: 0 } }))
  const fixture = yield* NativeResearchTask.setup()
  yield* Effect.addFinalizer(() => fixture.sessions.remove(fixture.parent.id).pipe(Effect.orDie))
  const config = yield* Config.Service
  expect((yield* config.get()).compaction?.tail_turns).toBe(0)
  const events = yield* EventV2.Service
  const compaction = yield* SessionCompaction.Service
  const execution = yield* ResearchExecution.Service
  const records = yield* ResearchRecords.Service
  const artifacts = yield* ResearchArtifacts.Service
  const sourceText = "Only version 1 permits enabled operation.\nDisabled operation rejects the request."
  yield* fixture.fs.writeFileString(path.join(instance.directory, "conditions.txt"), sourceText)
  const state: { source?: Research.SourceReceipt; sources: Research.SourceReceipt[];
    bounds: Schema.Schema.Type<typeof ResearchEvent.AllowanceBound.data>[];
    charges: Schema.Schema.Type<typeof ResearchEvent.AllowanceCharged.data>[] } = { sources: [], bounds: [], charges: [] }
  const card = (source: Research.SourceRef): Research.Card => ({
    answer: "Only version 1 with enabled operation; disabled operation rejects requests.", profile: "investigate", depth: "focused",
    sufficiency: "answered", findingRefs: [], evidenceRefs: [{ source, locator: { kind: "quote", exact: "Disabled operation rejects the request." } }],
    documentRefs: [], coverage: { examined: ["conditions.txt"], excluded: ["runtime execution"], failures: [] },
    limitations: ["Supplied static conditions only"], nextActions: [],
  })
  const unsubscribe = yield* events.listen((event) => Effect.gen(function* () {
    if (event.type === ResearchEvent.AllowanceBound.type) {
      const bound = Schema.decodeUnknownSync(ResearchEvent.AllowanceBound.data)(event.data)
      if (bound.allowance.binding.authoritySessionID === fixture.parent.id) state.bounds.push(bound)
      return
    }
    if (event.type === ResearchEvent.AllowanceCharged.type) {
      const charge = Schema.decodeUnknownSync(ResearchEvent.AllowanceCharged.data)(event.data)
      if (state.bounds.some((bound) => bound.sessionID === charge.sessionID)) state.charges.push(charge)
      return
    }
    if (event.type !== ResearchEvent.SourceAdmitted.type) return
    const admitted = Schema.decodeUnknownSync(ResearchEvent.SourceAdmitted.data)(event.data)
    if (admitted.binding.authoritySessionID !== fixture.parent.id || admitted.receipt.ref.representation !== "text") return
    state.sources.push(admitted.receipt)
    if (state.source) return
    state.source = admitted.receipt
    yield* fixture.remote.textMatch((hit) => JSON.stringify(hit.body).includes("Capture conditional source once"), `\u0060\u0060\u0060jimmy-result\n${JSON.stringify(card(admitted.receipt.ref))}\n\u0060\u0060\u0060`)
  }))
  yield* Effect.addFinalizer(() => unsubscribe)
  yield* fixture.remote.toolMatch((hit) => JSON.stringify(hit.body).includes("Capture conditional source once"), "read", { filePath: path.join(instance.directory, "conditions.txt") })
  const initial = yield* awaitWithTimeout(fixture.call({ description: "Capture conditional evidence", prompt: "Capture conditional source once", subagent_type: "jimmy" }, "source-capture"), "Initial native source capture did not settle", "30 seconds")
  if (Exit.isFailure(initial.exit)) return yield* Effect.failCause(initial.exit.cause)
  expect(initial.exit.value.metadata.workResult).toMatchObject({ card: { parsed: true }, referencesChecked: true, terminal: { reason: "ended" } })
  const source = state.source
  if (!source) throw new Error("Native Task did not capture source bytes")
  const childID = source.binding.executionSessionID
  const task = yield* LogicalTask.read(childID)
  if (!task) throw new Error("Native Task did not retain its logical identity")
  expect(task.taskId).toBe(source.binding.taskId)
  expect(initial.exit.value.metadata.sessionId).toBe(childID)
  const memory = yield* AtlasMemory.open({ sessionID: childID, callID: "host-checkpoint", assistantMessageID: fixture.assistant.id }, { id: "jimmy", native: true })
  if ("unavailable" in memory) throw new Error(memory.unavailable)
  const checkpoint = { taskId: task.taskId, attempted: ["Capture conditions.txt once"], failedWith: [],
    stoppedAt: "Conditional evidence captured", lesson: `Reopen retained source, never reacquire: ${JSON.stringify(source.ref)}` }
  const written = memory.write(checkpoint)
  if (!written.ok) throw new Error(`Real Atlas checkpoint refused: ${JSON.stringify(written)}`)
  const fold = memory.resolveFold({ kind: "task", id: task.taskId }, written.ref)
  if (!fold.ok) throw new Error(`Real Atlas checkpoint could not reopen: ${JSON.stringify(fold)}`)
  yield* fixture.fs.remove(path.join(instance.directory, "conditions.txt"))
  const resumeInput = { description: "Resume retained evidence", prompt: "Reopen retained source without reacquisition", subagent_type: "jimmy",
    task_id: task.taskId, memoryUnit: { kind: "task", id: task.taskId } }
  yield* fixture.remote.toolMatch((hit) => JSON.stringify(hit.body).includes(resumeInput.prompt), "research_view", { action: "source", ref: source.ref })
  yield* fixture.remote.textMatch((hit) => JSON.stringify(hit.body).includes(resumeInput.prompt), `\u0060\u0060\u0060jimmy-result\n${JSON.stringify(card(source.ref))}\n\u0060\u0060\u0060`)
  const resumed = yield* awaitWithTimeout(fixture.call(resumeInput, "checkpoint-resume"), "Native checkpoint resume did not settle", "30 seconds")
  if (Exit.isFailure(resumed.exit)) return yield* Effect.failCause(resumed.exit.cause)
  expect(resumed.exit.value.metadata).toMatchObject({ sessionId: childID, workResult: { taskId: task.taskId,
    card: { parsed: true }, referencesChecked: true, terminal: { reason: "ended" } } })
  const firstAdmission = admissionParts(yield* fixture.sessions.messages({ sessionID: childID }))
  expect(firstAdmission).toHaveLength(1)
  // A changed store cannot replace the durable selection when the same dispatch is retried.
  const later = memory.write({ ...checkpoint, lesson: "LATER_CHECKPOINT_MUST_NOT_REPLACE_ADMISSION" })
  if (!later.ok) throw new Error(`Real later checkpoint refused: ${JSON.stringify(later)}`)
  expect(later.ref).not.toEqual(written.ref)
  yield* fixture.remote.textMatch((hit) => JSON.stringify(hit.body).includes(resumeInput.prompt), `\u0060\u0060\u0060jimmy-result\n${JSON.stringify(card(source.ref))}\n\u0060\u0060\u0060`)
  const retried = yield* awaitWithTimeout(fixture.call(resumeInput, "checkpoint-resume"), "Exact native checkpoint retry did not settle", "30 seconds")
  if (Exit.isFailure(retried.exit)) return yield* Effect.failCause(retried.exit.cause)
  expect(retried.exit.value.metadata).toMatchObject({ sessionId: childID, workResult: { taskId: task.taskId,
    card: { parsed: true }, referencesChecked: true, terminal: { reason: "ended" } } })
  expect((yield* fixture.sessions.children(fixture.parent.id)).map((child) => child.id)).toEqual([childID])
  const before = yield* fixture.sessions.messages({ sessionID: childID })
  const admitted = admissionParts(before)
  expect(admitted).toHaveLength(1)
  expect(admitted).toEqual(firstAdmission)
  expect(admitted[0].admission).toMatchObject({ residency: "admitted", verdict: { ok: true, ref: written.ref },
    key: { projectID: fixture.parent.projectID, memoryOwner: "jimmy", logicalResumeID: `${fixture.parent.id}/checkpoint-resume`, kind: "task", id: task.taskId } })
  expect(admitted[0].part.text).toContain(written.ref.eventId)
  expect(admitted[0].part.text).toContain(JSON.stringify(fold.fold, null, 2))
  expect(admitted[0].part.text).not.toContain("LATER_CHECKPOINT_MUST_NOT_REPLACE_ADMISSION")
  const reopened = before.flatMap((message) => message.parts).filter((part) => part.type === "tool" && part.tool === "research_view")
  expect(reopened).toHaveLength(1)
  expect(reopened[0]).toMatchObject({ state: { status: "completed", input: { action: "source", ref: source.ref } } })
  if (reopened[0].type !== "tool" || reopened[0].state.status !== "completed") throw new Error("Native source reopen did not complete")
  expect(Schema.decodeUnknownSync(Schema.fromJsonString(Research.ArtifactPage))(reopened[0].state.output)).toMatchObject({ text: sourceText, complete: true, ref: source.ref.artifact })
  const providerBefore = state.charges.filter((charge) => charge.kind === "provider")
  expect(providerBefore.map((charge) => charge.dispatchCallID)).toEqual(["source-capture", "source-capture", "checkpoint-resume", "checkpoint-resume", "checkpoint-resume"])
  const requestsBefore = yield* fixture.remote.inputs
  expect(requestsBefore).toHaveLength(5)
  expect(JSON.stringify(requestsBefore[2])).toContain(written.ref.eventId)
  requestsBefore.map(currentHeader).forEach((header) => expect(header).toContain('member="jimmy"'))
  yield* compaction.create({ sessionID: childID, agent: "jimmy", model: { providerID: fixture.model.providerID, modelID: fixture.model.id }, auto: false })
  const compacting = yield* fixture.sessions.messages({ sessionID: childID })
  const boundary = compacting.at(-1)
  if (!boundary || boundary.info.role !== "user") throw new Error("Native compaction did not create user boundary")
  expect(boundary.parts).toMatchObject([{ type: "compaction", auto: false }])
  const summaryText = "Conditional research retained; reopen captured artifact, not live source."
  yield* fixture.remote.text(summaryText)
  expect(yield* awaitWithTimeout(execution.enter(childID, "checkpoint-resume", compaction.process({ sessionID: childID,
    parentID: boundary.info.id, messages: compacting, auto: false })), "Actual provider compaction did not settle", "30 seconds")).toBe("continue")
  const after = yield* fixture.sessions.messages({ sessionID: childID })
  const summary = after.at(-1)
  if (!summary || summary.info.role !== "assistant") throw new Error("Actual provider compaction did not produce assistant summary")
  expect(summary.info).toMatchObject({ parentID: boundary.info.id, agent: "compaction", summary: true, finish: "stop" })
  expect(summary.info.error).toBeUndefined()
  expect(summary.parts.filter((part) => part.type === "text").map((part) => part.text)).toEqual([summaryText])
  expect(after).toHaveLength(before.length + 2)
  const visible = MessageV2.filterCompacted(after.toReversed())
  expect(visible.map((message) => message.info.id)).toEqual([boundary.info.id, summary.info.id])
  expect(visible.flatMap((message) => message.parts).map((part) => part.id)).not.toContain(admitted[0].part.id)
  expect(admissionParts(after).map((part) => part.admission.residency)).toEqual(["admitted", "restored"])
  const restored = admissionParts(visible)
  expect(restored).toHaveLength(1)
  expect(restored[0].part).toMatchObject({ messageID: boundary.info.id, text: admitted[0].part.text,
    metadata: { atlasResume: { ...admitted[0].admission, residency: "restored" } } })
  yield* AtlasResumeRestore.restore({ session: fixture.sessions, sessionID: childID, messageID: boundary.info.id })
  yield* AtlasResumeRestore.restore({ session: fixture.sessions, sessionID: childID, messageID: boundary.info.id })
  const repeated = yield* fixture.sessions.messages({ sessionID: childID })
  expect(repeated.map((message) => message.info.id)).toEqual(after.map((message) => message.info.id))
  expect(admissionParts(repeated)).toEqual(admissionParts(after))
  expect(state.bounds.map((bound) => bound.allowance.dispatchCallID)).toEqual(["source-capture", "checkpoint-resume"])
  const maintenance = state.charges.filter((charge) => charge.operation.startsWith("provider:maintenance:"))
  expect(maintenance).toMatchObject([{ sessionID: childID, dispatchCallID: "checkpoint-resume", kind: "provider", amount: 1 }])
  expect(state.charges.filter((charge) => charge.kind === "provider")).toHaveLength(providerBefore.length + 1)
  const requests = yield* fixture.remote.inputs
  expect(requests).toHaveLength(requestsBefore.length + 1)
  expect(systemText(requests[5])).not.toContain('<atlas-header member="')
  expect(JSON.stringify(requests[5])).toContain(written.ref.eventId)
  expect(yield* artifacts.read(source.binding, source.ref.artifact)).toMatchObject({ text: sourceText, complete: true, receipt: source })
  expect(yield* records.view(source.binding, { action: "source", ref: source.ref })).toMatchObject({ text: sourceText, ref: source.ref.artifact })
  expect(state.sources).toEqual([source])
  expect(yield* fixture.remote.pending).toBe(0)
}), { git: true }, 120_000)

function systemText(request: unknown) {
  const decoded = Schema.decodeUnknownSync(Schema.Struct({ messages: Schema.Array(Schema.Struct({ role: Schema.String, content: Schema.Unknown })) }))(request)
  const system = decoded.messages.filter((message) => message.role === "system" || message.role === "developer")
  if (!system.length) throw new Error("Provider request has no current system instructions")
  return system.map((message) => {
    const content = Schema.decodeUnknownSync(Schema.Union([Schema.String, Schema.Array(Schema.Struct({ type: Schema.Literal("text"), text: Schema.String }))]))(message.content)
    return typeof content === "string" ? content : content.map((part) => part.text).join("\n")
  }).join("\n")
}

function currentHeader(request: unknown) {
  const system = systemText(request)
  const headers = [...system.matchAll(/^<atlas-header member="(?:backend|jimmy)"[^>]*>[\s\S]*?<\/atlas-header>/gm)]
  if (headers.length !== 1) throw new Error(`Expected one live native Atlas header, received ${headers.length}`)
  expect(system.trimEnd().endsWith(headers[0][0])).toBe(true)
  return headers[0][0]
}

function admissionParts(history: readonly SessionV1.WithParts[]) {
  return history.flatMap((message) => message.parts).flatMap((part) => {
    if (part.type !== "text" || part.metadata?.[AtlasMemory.ADMISSION_KEY]?.schema !== "atlas-resume-admission-v1") return []
    const admission: AtlasMemory.Admission = part.metadata[AtlasMemory.ADMISSION_KEY]
    expect(part.synthetic).toBe(true)
    expect(part.text).toBe(admission.text)
    return [{ part, admission }]
  })
}
