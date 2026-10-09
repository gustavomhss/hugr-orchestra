// Observer/adapter only: no scripted provider, authored findings, replacement children or copied transcript.
import path from "node:path"
import fs from "node:fs/promises"
import { isDeepStrictEqual } from "node:util"
import { Cause, Deferred, Effect, Exit, Fiber, Layer, Option, Schema, Stream } from "effect"
import { Research } from "@orchestra/schema/research"
import { Database } from "@orchestra/core/database/database"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { ResearchArtifacts } from "@orchestra/core/research/artifacts"
import { ResearchBinding } from "@orchestra/core/research/binding"
import { ResearchLedger } from "@orchestra/core/research/ledger"
import { ResearchRecords } from "@orchestra/core/research/records"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { AtlasMemory } from "../src/maestro/atlas-memory"
import { Git } from "../src/git"
import { LogicalTask } from "../src/maestro/logical-task"
import { LLM } from "../src/session/llm"
import { Session } from "../src/session/session"
import { SessionID } from "../src/session/schema"
import type { Tool } from "../src/tool/tool"
import { ResearchRetained } from "./research-retained"

export const node = LayerNode.group([ResearchRecords.node, ResearchArtifacts.node, Database.node, Git.node])
export const protocol = `\n\nDisclosed continuation protocol: before continuing beyond an evidence-backed interim finding with contrary evidence and an actually failed approach, retain an own Atlas task checkpoint for this task. Its optional ref field must be JSON {"finding": <actual retained finding ref>, "sources": [<actual evidence and contrary source refs>]}. Preserve what you actually attempted, why it failed, where you stopped and what you learned. Do not invent a failure or evidence to meet this protocol. Continue your investigation after checkpoint admission; the evaluator may interrupt a later provider stream and resume the same task. Tool choice and research conclusions remain yours.`

type ProviderWitness = { sessionID: string; userMessageID: string; openedAt: number; event?: string; live: boolean; interrupted: boolean; endedAt?: number }
export function observe() {
  const state: { armed?: { sessionID: string; after: number; ready: Deferred.Deferred<ProviderWitness> }; streams: ProviderWitness[] } = { streams: [] }
  const implementation = LLM.node.implementation
  if (!implementation) throw new Error("Native LLM observer implementation unavailable")
  const replacement = [LLM.node, { ...LLM.node, implementation: Layer.effect(LLM.Service, Effect.gen(function* () {
    const native = yield* LLM.Service
    return LLM.Service.of({ stream: (input) => Stream.scoped(Stream.unwrap(Effect.gen(function* () {
      const witness: ProviderWitness = { sessionID: input.sessionID, userMessageID: input.user.id, openedAt: Date.now(), live: false, interrupted: false }
      state.streams.push(witness)
      yield* Effect.addFinalizer((exit) => Effect.sync(() => {
        witness.interrupted ||= Exit.hasInterrupts(exit)
        witness.live = false
        witness.endedAt = Date.now()
      }))
      return native.stream(input).pipe(
        Stream.tap((event) => Effect.gen(function* () {
          witness.event = event.type
          if (["finish", "step-finish", "error"].includes(event.type)) witness.live = false
          if (event.type !== "reasoning-delta" && event.type !== "text-delta") return
          witness.live = true
          if (state.armed?.sessionID === input.sessionID && witness.openedAt > state.armed.after && input.agent.id === "jimmy" && !input.small && input.purpose !== "context-maintenance")
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
  disclosedFiles: readonly string[]
  data: string
  scannerConfigured: boolean
}) {
  const sessions = yield* Session.Service
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
      const selected = yield* selectCheckpoint(input)
      if (selected) return selected
      yield* Effect.sleep("100 millis")
    }
  }).pipe(Effect.exit)
  const selected = Exit.isSuccess(checkpoint) ? checkpoint.value : undefined
  const ready = yield* Deferred.make<ProviderWitness>()
  if (selected) input.observation.state.armed = { sessionID: selected.binding.executionSessionID, after: selected.observedAt, ready }
  const trigger = selected ? yield* Effect.raceFirst(
    Deferred.await(ready).pipe(Effect.map((witness) => ({ witness }))),
    Effect.raceFirst(Fiber.await(worker), Effect.sleep(Math.max(1, Math.min(remaining(), input.first.deadlineAt - Date.now())))).pipe(Effect.as({ witness: undefined })),
  ) : { witness: undefined }
  const interruptedAt = Date.now()
  const running = !!trigger.witness?.live && !worker.pollUnsafe() && !input.first.abort.aborted && remaining() > 0
  const providerAtInterrupt = trigger.witness ? { ...trigger.witness } : undefined
  // Existing Task release cancels the actual child prompt/background job and publishes host-ended metadata.
  if (!worker.pollUnsafe()) yield* Fiber.interrupt(worker)
  input.observation.state.armed = undefined
  const firstOutput = yield* Fiber.await(worker)
  yield* retain(input.first, firstOutput, 1)
  const host = Schema.decodeUnknownOption(Schema.Struct({ sessionId: Schema.String,
    workResult: Schema.Struct({ taskId: Schema.String, terminal: Schema.Struct({ reason: Schema.String }) }) }))(input.first.metadata.value)
  const interrupted = running && trigger.witness?.interrupted === true && Exit.hasInterrupts(firstOutput) && Option.isSome(host) &&
    host.value.sessionId === selected?.binding.executionSessionID && host.value.workResult.taskId === selected?.binding.taskId &&
    host.value.workResult.terminal.reason === "interrupted"
  const blocker = !selected || !interrupted ? "checkpoint-not-reached" : remaining() <= 0 ? "total-wall-clock-exhausted" : undefined
  const detail = !selected ? !input.scannerConfigured ? "trusted scanner setup missing; no eligible checkpoint"
    : Exit.isFailure(checkpoint) ? "checkpoint observation failed; exact cause retained in raw trial" : "first Task ended or deadline reached without eligible own admitted checkpoint"
    : !interrupted ? "actual running provider interruption and native interrupted host metadata were not both witnessed" : undefined
  const base = { schema: "jimmy-native-continuation-v1", phases, interruptedAt, providerAtInterrupt, providerWitness: trigger.witness, runningAtInterrupt: running,
    streamScopeObservations: input.observation.state.streams,
    checkpoint: selected, blocker, detail, totalTimeoutMs: input.totalTimeoutMs, resumeTimeoutMs: input.resumeTimeoutMs,
    checkpointFailure: Exit.isFailure(checkpoint) ? checkpoint.cause : undefined,
    dispatchCeilings: [Research.Limits, Research.Limits], maximumDispatches: 2,
    totalAllowance: { providerCalls: Research.Limits.providerCalls * 2, toolCalls: Research.Limits.toolCalls * 2, capturedBytes: Research.Limits.capturedBytes * 2 },
    deadlineContainment: "cooperative; native abort startup race and resource cleanup require an external process deadline",
    startupAbort: "native-abort-startup-race-unqualified",
    deadlineSignaled: phases.some((phase) => phase.deadlineSignaled) || remaining() <= 0,
    output: firstOutput, metadata: input.first.metadata.value }
  if (blocker || !selected) return base
  // Verify exact authority/project/owner/child again, never allocate a substitute on a mismatch.
  const logical = yield* LogicalTask.read(selected.binding.executionSessionID)
  const children = yield* sessions.children(input.parent.id)
  if (!logical || !isDeepStrictEqual(logical, selected.logical)) return { ...base, blocker: "resume-binding-mismatch" }
  if (remaining() <= 0) return { ...base, blocker: "total-wall-clock-exhausted", deadlineSignaled: true }
  const second = yield* input.call({ ...input.input, description: "Resume retained R14 research",
    prompt: "Continue your interrupted task. Recover your own admitted task checkpoint and reopen its exact retained finding, evidence and contrary references. Verify qualifiers and failed approaches before completing the original request; report unavailable evidence honestly.",
    task_id: logical.taskId, memoryUnit: { kind: "task", id: logical.taskId } }, "pilot-R14-resume", Math.max(1, Math.min(input.resumeTimeoutMs, remaining())))
  const resumed = yield* second.run.pipe(Effect.forkScoped)
  yield* Effect.raceFirst(Fiber.await(resumed), Effect.sleep(Math.max(1, second.deadlineAt - Date.now())))
  const cancellationOverdue = !resumed.pollUnsafe() && Date.now() >= second.deadlineAt
  if (!resumed.pollUnsafe()) yield* Fiber.interrupt(resumed)
  const output = yield* Fiber.await(resumed)
  yield* retain(second, output, 2)
  const history = yield* sessions.messages({ sessionID: selected.binding.executionSessionID })
  const admission = AtlasMemory.findAdmission(history, { projectID: logical.projectID, memoryOwner: "jimmy",
    logicalResumeID: `${input.parent.id}/pilot-R14-resume`, kind: "task", id: logical.taskId })
  const sameChildren = isDeepStrictEqual(children.map((child) => child.id).toSorted(), (yield* sessions.children(input.parent.id)).map((child) => child.id).toSorted())
  const restored = sameChildren && isDeepStrictEqual(yield* LogicalTask.read(logical.executionSessionID), logical) && admission?.verdict.ok &&
    isDeepStrictEqual(admission.verdict.ref, selected.receipt.ref)
  const previous = new Set(phases[0]?.histories.flat().map((message) => message.info.id))
  const resumedTools = history.filter((message) => !previous.has(message.info.id)).flatMap((message) => message.parts)
    .filter((part) => part.type === "tool" && part.state.status === "completed")
  const restoration = {
    recalledOwnCheckpoint: resumedTools.some((part) => part.type === "tool" && part.state.status === "completed" && part.tool === "atlas_memory_recall" &&
      part.state.input.kind === "task" && part.state.input.taskId === logical.taskId &&
      Schema.decodeUnknownOption(Schema.Struct({ outcome: Schema.Literal("read"), store: Schema.Literal("complete"), refs: Schema.Array(Schema.Struct({ eventId: Schema.String, contentHash: Schema.String })) }))(part.state.metadata[AtlasMemory.RECEIPT_KEY]).pipe(
        Option.exists((receipt) => receipt.refs.some((ref) => isDeepStrictEqual(ref, selected.receipt.ref))))),
    reopenedFinding: resumedTools.some((part) => part.type === "tool" && part.state.status === "completed" && part.tool === "research_view" &&
      isDeepStrictEqual(part.state.metadata.research, selected.findingEvent.data.record)),
    reopenedSources: selected.sources.map((source) => ({ ref: source.receipt.ref,
      observed: resumedTools.some((part) => part.type === "tool" && part.state.status === "completed" && part.tool === "research_view" &&
        Schema.decodeUnknownOption(Research.ArtifactPage)(part.state.metadata.research).pipe(Option.exists((page) => isDeepStrictEqual(page.receipt, source.receipt)))) })),
  }
  const reopened = restoration.recalledOwnCheckpoint && restoration.reopenedFinding && restoration.reopenedSources.every((source) => source.observed)
  return { ...base, output, metadata: second.metadata.value, admission, restoration,
    blocker: cancellationOverdue ? "native-deadline-cancellation-unqualified" : remaining() <= 0 ? "total-wall-clock-exhausted" : second.abort.aborted ? "resume-dispatch-deadline-exhausted"
      : !restored ? "resume-checkpoint-not-restored" : !reopened ? "resume-evidence-not-reopened" : undefined,
    deadlineSignaled: base.deadlineSignaled || second.abort.aborted || remaining() <= 0 }
})

const selectCheckpoint = Effect.fn("ResearchContinuation.selectCheckpoint")(function* (input: {
  first: Dispatch; parent: Session.Info; source: string; disclosedFiles: readonly string[]; data: string; scannerConfigured: boolean
}) {
  if (!input.scannerConfigured) return
  const child = Schema.decodeUnknownOption(SessionID)(input.first.metadata.value.sessionId)
  if (Option.isNone(child)) return
  const logical = yield* LogicalTask.read(child.value)
  if (!logical || logical.authoritySessionID !== input.parent.id || logical.projectID !== input.parent.projectID || logical.memberID !== "jimmy") return
  const sessions = yield* Session.Service
  const binding = yield* ResearchBinding.resolve(child.value, input.parent.projectID)
  const entries = yield* ResearchLedger.entries(binding)
  const history = yield* sessions.messages({ sessionID: child.value })
  const emits = history.flatMap((message) => message.parts).filter((part) => part.type === "tool" && part.tool === "atlas_memory_emit" && part.state.status === "completed")
  for (const part of emits.toReversed()) {
    if (part.type !== "tool" || part.state.status !== "completed") continue
    const receipt = Schema.decodeUnknownOption(Schema.Struct({ schema: Schema.Literal("atlas-memory-receipt-v1"), op: Schema.Literal("emit"), outcome: Schema.Literal("admitted"),
      binding: Schema.Struct({ projectID: Schema.String, root: Schema.String, memoryOwner: Schema.Literal("jimmy"), sessionID: Schema.String, callID: Schema.String, assistantMessageID: Schema.String }),
      ref: Schema.Struct({ eventId: Schema.String, contentHash: Schema.String }) }))(part.state.metadata[AtlasMemory.RECEIPT_KEY])
    const entry = Schema.decodeUnknownOption(Schema.Struct({ taskId: Schema.String, attempted: Schema.Array(Schema.String), failedWith: Schema.Array(Schema.String),
      stoppedAt: Schema.String, lesson: Schema.String, ref: Schema.String }))(part.state.input.entry)
    if (Option.isNone(receipt) || Option.isNone(entry) || entry.value.taskId !== logical.taskId || !entry.value.attempted.length || !entry.value.failedWith.length ||
      receipt.value.binding.projectID !== logical.projectID || receipt.value.binding.sessionID !== child.value || receipt.value.binding.root !== binding.worktree ||
      receipt.value.binding.callID !== part.callID || receipt.value.binding.assistantMessageID !== part.messageID) continue
    const pointer = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Struct({ finding: Research.RecordRef, sources: Schema.Array(Research.SourceRef) })))(entry.value.ref)
    if (Option.isNone(pointer)) continue
    const finding = entries.find((event) => event.type === "research.record.committed" && event.data.record.kind === "finding" &&
      event.data.record.id === pointer.value.finding.id && event.data.record.revision === pointer.value.finding.revision)
    if (!finding || finding.type !== "research.record.committed" || finding.data.record.kind !== "finding" || !finding.data.record.evidence.length || !finding.data.record.contrary.length) continue
    const refs = [...finding.data.record.evidence, ...finding.data.record.contrary]
    if (refs.some((ref) => !pointer.value.sources.some((source) => isDeepStrictEqual(source, ref.source)))) continue
    const records = yield* ResearchRecords.Service
    yield* Effect.forEach(refs, (ref) => records.verifyEvidence(binding, ref), { discard: true })
    const sources = entries.flatMap((event) => event.type === "research.source.admitted" && refs.some((ref) => isDeepStrictEqual(ref.source, event.data.receipt.ref)) ? [event.data.receipt] : [])
    if (refs.some((ref) => !sources.some((source) => isDeepStrictEqual(ref.source, source.ref))) || sources.some((receipt) => receipt.origin.kind !== "file" ||
      !input.disclosedFiles.some((file) => path.join(input.source, file) === receipt.origin.uri))) continue
    const memory = yield* AtlasMemory.open({ sessionID: child.value, callID: part.callID, assistantMessageID: part.messageID }, { native: true, id: "jimmy" })
    if ("unavailable" in memory) continue
    const recall = memory.recall({ kind: "task", taskId: logical.taskId })
    const index = recall.refs.findIndex((ref) => isDeepStrictEqual(ref, receipt.value.ref))
    if (recall.store !== "complete" || index < 0 || !isDeepStrictEqual(recall.records[index]?.entry, entry.value)) continue
    const fold = memory.resolveFold({ kind: "task", id: logical.taskId }, receipt.value.ref)
    if (!fold.ok) continue
    const evidence = yield* Effect.forEach(sources, ResearchRetained.read)
    const checkpoint = { binding, logical, receipt: receipt.value, entry: entry.value, findingEvent: finding, sources: evidence, observedAt: Date.now() }
    yield* Effect.promise(() => fs.writeFile(path.join(input.data, "checkpoint.json"), JSON.stringify(checkpoint), { flag: "wx", mode: 0o600 }))
    return checkpoint
  }
})

// Grader projection excludes raw histories, Task briefs, provider inputs and native skill/prompt bodies.
export function project(result: Effect.Success<ReturnType<typeof run>>) {
  return { schema: result.schema, blocker: result.blocker, detail: result.detail, interruptedAt: result.interruptedAt,
    providerAtInterrupt: result.providerAtInterrupt, providerWitness: result.providerWitness, runningAtInterrupt: result.runningAtInterrupt,
    streamScopeObservations: result.streamScopeObservations,
    checkpoint: result.checkpoint, totalTimeoutMs: result.totalTimeoutMs, resumeTimeoutMs: result.resumeTimeoutMs,
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
