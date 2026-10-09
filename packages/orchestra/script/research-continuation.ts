// Observer/adapter only: no scripted provider, authored findings, replacement children or copied transcript.
import path from "node:path"
import fs from "node:fs/promises"
import { isDeepStrictEqual } from "node:util"
import { Cause, Deferred, Effect, Exit, Fiber, Layer, Option, Schema, Stream } from "effect"
import { Research } from "@orchestra/schema/research"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { ResearchArtifacts } from "@orchestra/core/research/artifacts"
import { ResearchBinding } from "@orchestra/core/research/binding"
import { ResearchLedger } from "@orchestra/core/research/ledger"
import { ResearchRecords } from "@orchestra/core/research/records"
import { SessionV1 } from "@orchestra/core/v1/session"
import { AtlasMemory } from "../src/maestro/atlas-memory"
import { AtlasResume } from "../src/maestro/atlas-resume"
import { Git } from "../src/git"
import { LogicalTask } from "../src/maestro/logical-task"
import { LLM } from "../src/session/llm"
import { Session } from "../src/session/session"
import { SessionID } from "../src/session/schema"
import type { Tool } from "../src/tool/tool"
import { ResearchRetained } from "./research-retained"

export const node = LayerNode.group([ResearchRecords.node, ResearchArtifacts.node, Database.node, Git.node, EventV2.node])
export const protocol = `\n\nDisclosed continuation protocol: before continuing beyond an evidence-backed interim finding with contrary evidence and an actually failed approach, retain an own Atlas task checkpoint for this task. Its optional ref field must be JSON {"finding": <actual retained finding ref>, "sources": [<actual evidence and contrary source refs>]}. Preserve what you actually attempted, why it failed, where you stopped and what you learned. Do not invent a failure or evidence to meet this protocol. Continue your investigation after checkpoint admission; the evaluator may interrupt a later provider stream and resume the same task. Tool choice and research conclusions remain yours.`

type ProviderWitness = { sessionID: string; userMessageID: string; openedAt: number; openedSequence: number; eventSequence?: number;
  qualifying: boolean; event?: string; live: boolean; interrupted: boolean; endedAt?: number }
type EmitBoundary = { sequence: number; partID: string; sessionID: string; callID: string; completedAt: number }
export function observe() {
  const state: { sequence: number; armed?: { sessionID: string; after: number; ready: Deferred.Deferred<ProviderWitness> };
    streams: ProviderWitness[]; emits: Map<string, EmitBoundary> } = { sequence: 0, streams: [], emits: new Map() }
  const implementation = LLM.live
  const replacement = [LLM.node, { ...LLM.node, implementation: Layer.effect(LLM.Service, Effect.gen(function* () {
    const native = yield* LLM.Service
    return LLM.Service.of({ stream: (input) => Stream.scoped(Stream.unwrap(Effect.gen(function* () {
      const witness: ProviderWitness = { sessionID: input.sessionID, userMessageID: input.user.id, openedAt: Date.now(), openedSequence: ++state.sequence,
        qualifying: input.agent.id === "jimmy" && !input.small && input.purpose !== "context-maintenance", live: false, interrupted: false }
      state.streams.push(witness)
      yield* Effect.addFinalizer((exit) => Effect.sync(() => {
        witness.interrupted ||= Exit.hasInterrupts(exit)
        witness.live = false
        witness.endedAt = Date.now()
      }))
      return native.stream(input).pipe(
        Stream.tap((event) => Effect.gen(function* () {
          witness.event = event.type
          witness.eventSequence = ++state.sequence
          if (["finish", "step-finish", "error"].includes(event.type) || event.type.startsWith("tool-")) witness.live = false
          if (event.type !== "reasoning-delta" && event.type !== "text-delta") return
          witness.live = true
          if (state.armed?.sessionID === input.sessionID && witness.openedSequence > state.armed.after && witness.qualifying)
            yield* Deferred.succeed(state.armed.ready, witness)
        })),
        Stream.tapCause((cause) => Effect.sync(() => { witness.interrupted = Cause.hasInterrupts(cause) })),
      )
    }))) })
  })).pipe(Layer.provide(implementation)) }] as const
  return { state, replacement }
}

type Dispatch = {
  run: Effect.Effect<Tool.ExecuteResult<Record<string, unknown>>>
  metadata: { value: Record<string, unknown> }
  abort: AbortSignal
  part: SessionV1.ToolPart
  startedAt: number
  deadlineAt: number
}

export const run = Effect.fn("ResearchContinuation.run")(function* (input: {
  first: Dispatch
  call: (input: Record<string, unknown>, callID: string, deadlineMs: number) => Effect.Effect<Dispatch>
  input: Record<string, unknown>
  observation: ReturnType<typeof observe>
  parent: Session.Info
  preparedAt: number
  totalTimeoutMs: number
  resumeTimeoutMs: number
  source: string
  sources: readonly ResearchRetained.SourceIdentity[]
  data: string
  scannerConfigured: boolean
}) {
  const sessions = yield* Session.Service
  if (typeof AtlasResume.selectedRef !== "function")
    return yield* Effect.die(new Error("atlas-resume-selected-ref-unavailable: integrate the lead-owned pure AtlasResume.selectedRef export before execution"))
  const events = yield* EventV2.Service
  const unsubscribe = yield* events.listen((event) => Effect.sync(() => {
    if (event.type !== SessionV1.Event.PartUpdated.type) return
    const update = Schema.decodeUnknownOption(SessionV1.Event.PartUpdated.data)(event.data)
    if (Option.isNone(update)) return
    const part = update.value.part
    if (part.type !== "tool" || part.tool !== "atlas_memory_emit" || part.state.status !== "completed" || input.observation.state.emits.has(part.id)) return
    const receipt = Schema.decodeUnknownOption(Schema.Struct({ schema: Schema.Literal("atlas-memory-receipt-v1"), op: Schema.Literal("emit"), outcome: Schema.Literal("admitted") }))(part.state.metadata[AtlasMemory.RECEIPT_KEY])
    if (Option.isNone(receipt)) return
    input.observation.state.emits.set(part.id, { sequence: ++input.observation.state.sequence, partID: part.id, sessionID: part.sessionID,
      callID: part.callID, completedAt: part.state.time.end })
  }))
  yield* Effect.addFinalizer(() => unsubscribe)
  const phases: { dispatch: number; startedAt: number; endedAt: number; deadlineAt: number; deadlineSignaled: boolean;
    output: Exit.Exit<Tool.ExecuteResult<Record<string, unknown>>>; metadata: Record<string, unknown>; histories: SessionV1.WithParts[][] }[] = []
  const remaining = () => input.preparedAt + input.totalTimeoutMs - Date.now()
  const retain = (dispatch: Dispatch, output: Exit.Exit<Tool.ExecuteResult<Record<string, unknown>>>, number: number) => Effect.gen(function* () {
    const phase = { dispatch: number, startedAt: dispatch.startedAt, endedAt: Date.now(), deadlineAt: dispatch.deadlineAt, deadlineSignaled: dispatch.abort.aborted,
      output, metadata: structuredClone(dispatch.metadata.value),
      histories: yield* Effect.forEach(yield* sessions.children(input.parent.id), (child) => sessions.messages({ sessionID: child.id })) }
    phases.push(phase)
    yield* sessions.updatePart({ ...dispatch.part, state: Exit.isSuccess(output)
      ? { status: "completed", input: dispatch.part.state.input, output: output.value.output, title: output.value.title, metadata: output.value.metadata,
        time: { start: dispatch.startedAt, end: phase.endedAt } }
      : { status: "error", input: dispatch.part.state.input, error: Cause.pretty(output.cause), metadata: phase.metadata,
        time: { start: dispatch.startedAt, end: phase.endedAt } } })
    yield* Effect.promise(() => fs.writeFile(path.join(input.data, `phase-${number}.json`), JSON.stringify(phase), { flag: "wx", mode: 0o600 }))
  })
  const worker = yield* input.first.run.pipe(Effect.forkScoped)
  const checkpoint = yield* Effect.gen(function* () {
    while (!worker.pollUnsafe() && !input.first.abort.aborted && remaining() > 0) {
      const selected = yield* selectCheckpoint(input, "checkpoint-observed.json")
      if (selected) return selected
      yield* Effect.sleep("100 millis")
    }
  }).pipe(Effect.exit)
  const selected = Exit.isSuccess(checkpoint) ? checkpoint.value : undefined
  const ready = yield* Deferred.make<ProviderWitness>()
  if (selected) {
    input.observation.state.armed = { sessionID: selected.binding.executionSessionID, after: selected.boundary.sequence, ready }
    const live = input.observation.state.streams.findLast((stream) => stream.sessionID === selected.binding.executionSessionID && stream.qualifying &&
      stream.live && stream.openedSequence > selected.boundary.sequence)
    if (live) yield* Deferred.succeed(ready, live)
  }
  if (selected) yield* Effect.raceFirst(
    Deferred.await(ready),
    Effect.raceFirst(Fiber.await(worker), Effect.sleep(Math.max(1, Math.min(remaining(), input.first.deadlineAt - Date.now())))),
  )
  const witness = selected ? input.observation.state.streams.findLast((stream) => stream.sessionID === selected.binding.executionSessionID &&
    stream.qualifying && stream.live && stream.openedSequence > selected.boundary.sequence) : undefined
  const interruptedAt = Date.now()
  const running = !!witness && !worker.pollUnsafe() && !input.first.abort.aborted && interruptedAt < input.first.deadlineAt && remaining() > 0
  const providerAtInterrupt = witness ? { ...witness } : undefined
  // Existing Task release cancels the actual child prompt/background job and publishes host-ended metadata.
  if (!worker.pollUnsafe()) yield* Fiber.interrupt(worker)
  input.observation.state.armed = undefined
  const firstOutput = yield* Fiber.await(worker)
  yield* retain(input.first, firstOutput, 1)
  const host = Schema.decodeUnknownOption(Schema.Struct({ sessionId: Schema.String,
    workResult: Schema.Struct({ taskId: Schema.String, terminal: Schema.Struct({ reason: Schema.String }) }) }))(input.first.metadata.value)
  const interrupted = running && witness?.interrupted === true && Exit.hasInterrupts(firstOutput) && Option.isSome(host) &&
    host.value.sessionId === selected?.binding.executionSessionID && host.value.workResult.taskId === selected?.binding.taskId &&
    host.value.workResult.terminal.reason === "interrupted"
  const blocker = remaining() <= 0 ? "total-wall-clock-exhausted"
    : input.first.abort.aborted || interruptedAt >= input.first.deadlineAt ? "first-dispatch-deadline-exhausted"
    : !selected || !interrupted ? "checkpoint-not-reached" : undefined
  const detail = blocker === "total-wall-clock-exhausted" ? "whole-attempt deadline reached before resume"
    : blocker === "first-dispatch-deadline-exhausted" ? "first dispatch deadline reached before a witnessed checkpoint interruption"
    : !selected ? !input.scannerConfigured ? "trusted scanner setup missing; no eligible checkpoint"
    : Exit.isFailure(checkpoint) ? "checkpoint observation failed; exact cause retained in raw trial" : "first Task ended or deadline reached without eligible own admitted checkpoint"
    : !interrupted ? "actual running provider interruption and native interrupted host metadata were not both witnessed" : undefined
  const base = { schema: "jimmy-native-continuation-v1", phases, interruptedAt, providerAtInterrupt, providerWitness: witness, runningAtInterrupt: running,
    streamScopeObservations: input.observation.state.streams,
    observedCheckpoint: selected, checkpoint: undefined, blocker, detail, totalTimeoutMs: input.totalTimeoutMs, resumeTimeoutMs: input.resumeTimeoutMs,
    checkpointFailure: Exit.isFailure(checkpoint) ? checkpoint.cause : undefined,
    dispatchCeilings: [Research.Limits, Research.Limits], maximumDispatches: 2,
    totalAllowance: { providerCalls: Research.Limits.providerCalls * 2, toolCalls: Research.Limits.toolCalls * 2, capturedBytes: Research.Limits.capturedBytes * 2 },
    deadlineContainment: "cooperative; native startup cancellation controls and resource cleanup still require final execution and an external process deadline",
    startupAbort: "native-startup-cancellation-controls-unrun",
    deadlineSignaled: phases.some((phase) => phase.deadlineSignaled) || remaining() <= 0,
    output: firstOutput, metadata: input.first.metadata.value }
  if (blocker || !selected) return base
  // Cancellation may finish an emit already in flight. Native selection, not the earlier observation, decides the resume.
  const revalidation = yield* selectCheckpoint(input, "checkpoint.json").pipe(Effect.exit)
  const retained = Exit.isSuccess(revalidation) ? revalidation.value : undefined
  const resumable = { ...base, checkpoint: retained }
  if (!retained) {
    const currentRef = AtlasResume.selectedRef(yield* sessions.messages({ sessionID: selected.binding.executionSessionID }), {
      projectID: selected.logical.projectID, memoryOwner: "jimmy", logicalResumeID: `${input.parent.id}/pilot-R14-resume`, kind: "task", id: selected.logical.taskId,
    })
    return { ...resumable,
      blocker: !currentRef ? "checkpoint-reference-unavailable" : !isDeepStrictEqual(currentRef, selected.receipt.ref)
        ? "checkpoint-changed-not-eligible" : "checkpoint-revalidation-failed",
      detail: "Post-interruption checkpoint eligibility/store/source validation failed; reference comparison and available cause are retained.",
      revalidatedRef: currentRef, revalidationFailure: Exit.isFailure(revalidation) ? revalidation.cause : undefined }
  }
  // Verify exact authority/project/owner/child again, never allocate a substitute on a mismatch.
  const logical = yield* LogicalTask.read(retained.binding.executionSessionID)
  const children = yield* sessions.children(input.parent.id)
  if (!logical || !isDeepStrictEqual(logical, retained.logical) || !isDeepStrictEqual(logical, selected.logical)) return { ...resumable, blocker: "resume-binding-mismatch" }
  if (remaining() <= 0) return { ...resumable, blocker: "total-wall-clock-exhausted", deadlineSignaled: true }
  const second = yield* input.call({ ...input.input, description: "Resume retained R14 research",
    prompt: "Continue your interrupted task. Recover your own admitted task checkpoint and reopen its exact retained finding, evidence and contrary references. Verify qualifiers and failed approaches before completing the original request; report unavailable evidence honestly.",
    task_id: logical.taskId, memoryUnit: { kind: "task", id: logical.taskId } }, "pilot-R14-resume", Math.max(1, Math.min(input.resumeTimeoutMs, remaining())))
  const resumed = yield* second.run.pipe(Effect.forkScoped)
  yield* Effect.raceFirst(Fiber.await(resumed), Effect.sleep(Math.max(1, second.deadlineAt - Date.now())))
  const cancellationOverdue = !resumed.pollUnsafe() && Date.now() >= second.deadlineAt
  if (!resumed.pollUnsafe()) yield* Fiber.interrupt(resumed)
  const output = yield* Fiber.await(resumed)
  yield* retain(second, output, 2)
  const history = yield* sessions.messages({ sessionID: retained.binding.executionSessionID })
  const admission = AtlasMemory.findAdmission(history, { projectID: logical.projectID, memoryOwner: "jimmy",
    logicalResumeID: `${input.parent.id}/pilot-R14-resume`, kind: "task", id: logical.taskId })
  const sameChildren = isDeepStrictEqual(children.map((child) => child.id).toSorted(), (yield* sessions.children(input.parent.id)).map((child) => child.id).toSorted())
  const restored = sameChildren && isDeepStrictEqual(yield* LogicalTask.read(logical.executionSessionID), logical) && admission?.verdict.ok &&
    isDeepStrictEqual(admission.verdict.ref, retained.receipt.ref)
  const previous = new Set(phases[0]?.histories.flat().map((message) => message.info.id))
  const resumedTools = history.filter((message) => !previous.has(message.info.id)).flatMap((message) => message.parts)
    .filter((part) => part.type === "tool" && part.state.status === "completed")
  const restoration = {
    recalledOwnCheckpoint: resumedTools.some((part) => part.type === "tool" && part.state.status === "completed" && part.tool === "atlas_memory_recall" &&
      part.state.input.kind === "task" && part.state.input.taskId === logical.taskId &&
      Schema.decodeUnknownOption(Schema.Struct({ outcome: Schema.Literal("read"), store: Schema.Literal("complete"), refs: Schema.Array(Schema.Struct({ eventId: Schema.String, contentHash: Schema.String })) }))(part.state.metadata[AtlasMemory.RECEIPT_KEY]).pipe(
        Option.exists((receipt) => receipt.refs.some((ref) => isDeepStrictEqual(ref, retained.receipt.ref))))),
    reopenedFinding: resumedTools.some((part) => part.type === "tool" && part.state.status === "completed" && part.tool === "research_view" &&
      isDeepStrictEqual(part.state.metadata.research, retained.findingEvent.data.record)),
    reopenedSources: retained.sources.map((source) => ({ ref: source.receipt.ref,
      observed: resumedTools.some((part) => part.type === "tool" && part.state.status === "completed" && part.tool === "research_view" &&
        Schema.decodeUnknownOption(Research.ArtifactPage)(part.state.metadata.research).pipe(Option.exists((page) => isDeepStrictEqual(page.receipt, source.receipt)))) })),
  }
  const reopened = restoration.recalledOwnCheckpoint && restoration.reopenedFinding && restoration.reopenedSources.every((source) => source.observed)
  return { ...resumable, output, metadata: second.metadata.value, admission, restoration,
    blocker: cancellationOverdue ? "native-deadline-cancellation-unqualified" : remaining() <= 0 ? "total-wall-clock-exhausted" : second.abort.aborted ? "resume-dispatch-deadline-exhausted"
      : !restored ? "resume-checkpoint-not-restored" : !reopened ? "resume-evidence-not-reopened" : undefined,
    deadlineSignaled: base.deadlineSignaled || second.abort.aborted || remaining() <= 0 }
})

const selectCheckpoint = Effect.fn("ResearchContinuation.selectCheckpoint")(function* (input: {
  first: Dispatch; parent: Session.Info; source: string; sources: readonly ResearchRetained.SourceIdentity[]; data: string;
  scannerConfigured: boolean; observation: ReturnType<typeof observe>
}, snapshot?: "checkpoint-observed.json" | "checkpoint.json") {
  if (!input.scannerConfigured) return
  const child = Schema.decodeUnknownOption(SessionID)(input.first.metadata.value.sessionId)
  if (Option.isNone(child)) return
  const logical = yield* LogicalTask.read(child.value)
  if (!logical || logical.authoritySessionID !== input.parent.id || logical.projectID !== input.parent.projectID || logical.memberID !== "jimmy") return
  const sessions = yield* Session.Service
  const binding = yield* ResearchBinding.resolve(child.value, input.parent.projectID)
  const entries = yield* ResearchLedger.entries(binding)
  const history = yield* sessions.messages({ sessionID: child.value })
  const latest = AtlasResume.selectedRef(history, { projectID: logical.projectID, memoryOwner: "jimmy", logicalResumeID: `${input.parent.id}/pilot-R14-resume`, kind: "task", id: logical.taskId })
  if (!latest) return
  // Find the original completed receipt for the native-selected ref. Reconciled copies do not move its boundary.
  const part = history.flatMap((message) => message.parts).find((part) => part.type === "tool" && part.tool === "atlas_memory_emit" &&
    part.state.status === "completed" && part.state.metadata[AtlasMemory.RECEIPT_KEY]?.schema === "atlas-memory-receipt-v1" &&
    part.state.metadata[AtlasMemory.RECEIPT_KEY]?.op === "emit" && part.state.metadata[AtlasMemory.RECEIPT_KEY]?.outcome === "admitted" &&
    part.state.metadata[AtlasMemory.RECEIPT_KEY]?.binding?.projectID === logical.projectID &&
    part.state.metadata[AtlasMemory.RECEIPT_KEY]?.binding?.memoryOwner === "jimmy" && part.state.input.entry?.taskId === logical.taskId &&
    isDeepStrictEqual(part.state.metadata[AtlasMemory.RECEIPT_KEY]?.ref, latest))
  if (!part || part.type !== "tool" || part.state.status !== "completed") return
  const boundary = input.observation.state.emits.get(part.id)
  if (!boundary || boundary.sessionID !== child.value || boundary.callID !== part.callID) return
  const receipt = Schema.decodeUnknownOption(Schema.Struct({ schema: Schema.Literal("atlas-memory-receipt-v1"), op: Schema.Literal("emit"), outcome: Schema.Literal("admitted"),
    binding: Schema.Struct({ projectID: Schema.String, root: Schema.String, memoryOwner: Schema.Literal("jimmy"), sessionID: Schema.String, callID: Schema.String, assistantMessageID: Schema.String }),
    ref: Schema.Struct({ eventId: Schema.String, contentHash: Schema.String }) }))(part.state.metadata[AtlasMemory.RECEIPT_KEY])
  const entry = Schema.decodeUnknownOption(Schema.Struct({ taskId: Schema.String, attempted: Schema.Array(Schema.String), failedWith: Schema.Array(Schema.String),
    stoppedAt: Schema.String, lesson: Schema.String, ref: Schema.String }))(part.state.input.entry)
  if (Option.isNone(receipt) || Option.isNone(entry) || entry.value.taskId !== logical.taskId || !entry.value.attempted.length || !entry.value.failedWith.length ||
    receipt.value.binding.projectID !== logical.projectID || receipt.value.binding.sessionID !== child.value || receipt.value.binding.root !== binding.worktree ||
    receipt.value.binding.callID !== part.callID || receipt.value.binding.assistantMessageID !== part.messageID) return
  const pointer = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Struct({ finding: Research.RecordRef, sources: Schema.Array(Research.SourceRef) })))(entry.value.ref)
  if (Option.isNone(pointer)) return
  const finding = entries.find((event) => event.type === "research.record.committed" && event.data.record.kind === "finding" &&
    event.data.record.id === pointer.value.finding.id && event.data.record.revision === pointer.value.finding.revision)
  if (!finding || finding.type !== "research.record.committed" || finding.data.record.kind !== "finding" || !finding.data.record.evidence.length || !finding.data.record.contrary.length) return
  const refs = [...finding.data.record.evidence, ...finding.data.record.contrary]
  if (refs.some((ref) => !pointer.value.sources.some((source) => isDeepStrictEqual(source, ref.source)))) return
  const records = yield* ResearchRecords.Service
  yield* Effect.forEach(refs, (ref) => records.verifyEvidence(binding, ref), { discard: true })
  const sources = entries.flatMap((event) => event.type === "research.source.admitted" && refs.some((ref) => isDeepStrictEqual(ref.source, event.data.receipt.ref)) ? [event.data.receipt] : [])
  if (refs.some((ref) => !sources.some((source) => isDeepStrictEqual(ref.source, source.ref)))) return
  const evidence = yield* Effect.forEach(sources, (receipt) => ResearchRetained.authenticate(receipt, input))
  const memory = yield* AtlasMemory.open({ sessionID: child.value, callID: part.callID, assistantMessageID: part.messageID }, { native: true, id: "jimmy" })
  if ("unavailable" in memory) return
  const recall = memory.recall({ kind: "task", taskId: logical.taskId })
  const index = recall.refs.findIndex((ref) => isDeepStrictEqual(ref, receipt.value.ref))
  if (recall.store !== "complete" || index < 0 || !isDeepStrictEqual(recall.records[index]?.entry, entry.value)) return
  const fold = memory.resolveFold({ kind: "task", id: logical.taskId }, receipt.value.ref)
  if (!fold.ok) return
  const checkpoint = { binding, logical, receipt: receipt.value, entry: entry.value, findingEvent: finding, sources: evidence, boundary, observedAt: Date.now() }
  if (snapshot) yield* Effect.promise(() => fs.writeFile(path.join(input.data, snapshot), JSON.stringify(checkpoint), { flag: "wx", mode: 0o600 }))
  return checkpoint
})

// Grader projection excludes raw histories, Task briefs, provider inputs and native skill/prompt bodies.
export function project(result: Effect.Success<ReturnType<typeof run>>) {
  return { schema: result.schema, blocker: result.blocker, detail: result.detail, interruptedAt: result.interruptedAt,
    providerAtInterrupt: result.providerAtInterrupt, providerWitness: result.providerWitness, runningAtInterrupt: result.runningAtInterrupt,
    streamScopeObservations: result.streamScopeObservations,
    checkpoint: result.checkpoint, totalTimeoutMs: result.totalTimeoutMs, resumeTimeoutMs: result.resumeTimeoutMs,
    observedCheckpoint: "observedCheckpoint" in result ? result.observedCheckpoint : undefined,
    dispatchCeilings: result.dispatchCeilings, maximumDispatches: result.maximumDispatches, totalAllowance: result.totalAllowance,
    deadlineContainment: result.deadlineContainment, startupAbort: result.startupAbort, restoration: "restoration" in result ? result.restoration : undefined,
    phases: result.phases.map((phase) => ({ dispatch: phase.dispatch, startedAt: phase.startedAt,
      endedAt: phase.endedAt, deadlineAt: phase.deadlineAt, deadlineSignaled: phase.deadlineSignaled, terminal: Exit.isSuccess(phase.output) ? "task-returned" : Exit.hasInterrupts(phase.output) ? "interrupted" : "task-failed",
      metadata: phase.metadata,
      result: Exit.isSuccess(phase.output) ? phase.output.value : { failed: true },
      historyScope: "cumulative retained child snapshot; do not sum phases",
      trace: phase.histories.flatMap((history) => history.filter((message) => message.info.role === "assistant").map((message) => ({
        messageID: message.info.id, sessionID: message.info.sessionID,
        steps: message.parts.flatMap((part) => part.type === "step-finish" ? [{ reason: part.reason, tokens: part.tokens, nativeCostEstimate: part.cost }] : []),
        tools: message.parts.flatMap((part) => part.type === "tool" ? [{ tool: part.tool, callID: part.callID, status: part.state.status }] : []),
      }))),
    })), admission: "admission" in result && result.admission ? { key: result.admission.key, verdict: result.admission.verdict, residency: result.admission.residency } : undefined }
}

export * as ResearchContinuation from "./research-continuation"
