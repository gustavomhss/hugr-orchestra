export * as BackendWork from "./backend-work"
export * as SeatWork from "./backend-work"

import { Effect, Option } from "effect"
import path from "path"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { ToolSafetySandbox } from "@orchestra/core/tool-safety-sandbox"
import { Patch } from "@orchestra/core/patch"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { MessageV2 } from "@/session/message-v2"
import { Session } from "@/session/session"
import { InstanceState } from "@/effect/instance-state"
import type { SessionID } from "@/session/schema"
import { BackendResult } from "./backend-result"
import { BackendEvidence } from "./backend-evidence"
import { DiscoveryResult } from "./discovery-result"
import { ResearchRecords } from "@orchestra/core/research/records"
import { UpstreamResult } from "@orchestra/maestro/upstream-result"
import type { ArsenalCompletion } from "./arsenal-completion"
import type { Seat } from "@orchestra/maestro/seats"

// F4 cl.6: stream the shared work-result contract onto the Task part as `metadata.workResult`.
// Definition supplies the fenced tag, schema id and memory capability; seats without workResult opt out.
export function track(input: {
  readonly enabled: boolean
  readonly seat?: Seat
  readonly sessionID: SessionID
  // Host fact: the logical task bound to the child (F2.11); absent for a seat without a binding.
  readonly taskId?: string
  readonly memberId?: string
  readonly authoritySessionId?: SessionID
  readonly armed?: boolean
  readonly research?: ResearchRecords.Interface
  // Host fact: the write roots ToolSafety enforces for the child (F2.14); empty means read-only.
  readonly writeRoots?: ReadonlyArray<string>
  readonly publish: (workResult: BackendResult.WorkResult) => Effect.Effect<void>
}) {
  const evidence: { value?: BackendResult.WorkResult } = {}
  const returned: { value?: BackendResult.WorkResult } = {}
  const ended: { value?: BackendResult.WorkResult } = {}
  const claimed: { note?: string } = {}
  const completion: { observed?: true; interrupted?: true; projection?: Pick<BackendResult.WorkResult, "verification" | "hostChecks" | "delta"> } = {}
  const project = (result: BackendResult.WorkResult): BackendResult.WorkResult => ({
    ...result,
    ...(input.memberId ? { memberId: input.memberId, executionSessionId: input.sessionID } : {}),
    ...(input.authoritySessionId ? { authoritySessionId: input.authoritySessionId } : {}),
    mode: input.armed ? "delegated-armed" : "delegated",
    acceptance: { state: "pending" },
    verification: { state: input.armed ? "host-incomplete" : "not-host-verified" },
    ...completion.projection,
  })
  // The shell fact is what the child's commands actually got; before any ran, what this host would give them now.
  const bound = Effect.fnUntraced(function* (result: BackendResult.WorkResult, history: readonly SessionV1.WithParts[]) {
    // Background callbacks may omit Session services; absent or mismatched placement cannot mint evidence.
    const sessions = yield* Effect.serviceOption(Session.Service)
    const session = Option.isSome(sessions)
      ? yield* sessions.value.get(input.sessionID).pipe(Effect.catch(() => Effect.succeed(undefined)))
      : undefined
    const placement = yield* InstanceState.context
    // Upstream proposals never carry implementation evidence, including host-ended snapshots.
    const located = result.schema !== UpstreamResult.SCHEMA && session && session.id === input.sessionID && path.isAbsolute(session.directory) &&
      path.resolve(session.directory) === path.resolve(placement.directory) && session.projectID === placement.project.id &&
      session.workspaceID === (yield* InstanceState.workspaceID)
      ? { ...result, workerEvidence: BackendEvidence.bind(result, history, { executionSessionID: session.id, directory: session.directory }) }
      : result
    const task = project(input.taskId ? { ...located, taskId: input.taskId } : located)
    if (!input.writeRoots) return task
    const shell = ToolSafety.shellFact(input.sessionID) ?? (yield* ToolSafetySandbox.status())
    return { ...task, writeRoots: [...input.writeRoots], ...shell }
  })
  const history = () => MessageV2.stream(input.sessionID)
  const discovery = input.seat?.id === "jimmy" && input.seat.workResult === "discovery-work-result-v1"
  const assemble = (message: SessionV1.WithParts, session: readonly SessionV1.WithParts[]) =>
    discovery
      ? DiscoveryResult.assemble(message, session).pipe(input.research ? Effect.provideService(ResearchRecords.Service, input.research) : (effect) => effect)
      : Effect.succeed(BackendResult.assemble(message, session, input.seat))
  const hostEnded = (message: SessionV1.WithParts | undefined, session: readonly SessionV1.WithParts[], reason: "failed" | "interrupted" | "running", detail: string) =>
    message && discovery
      ? assemble(message, session).pipe(Effect.map((result) => ({ ...result, terminal: { reason, hostDetail: detail } })))
      : Effect.succeed({
          ...BackendResult.hostEnded({ message, session, reason, detail }, input.seat),
          ...(discovery ? { referencesChecked: false } : {}),
        })
  const publish = Effect.fn("SeatWork.publish")((effect: Effect.Effect<void>) => effect.pipe(Effect.catchCause((cause) => {
    // Publication is part of completion: a defect after observation also revokes the pass receipt.
    if (completion.projection?.verification.state === "host-verified") {
      completion.projection = { ...completion.projection, verification: {
        state: "host-incomplete", hostReason: { reason: "completion-evaluation-acquisition" },
      } }
    }
    if (!evidence.value) return Effect.failCause(cause)
    evidence.value = project(evidence.value)
    return input.publish(evidence.value).pipe(Effect.catchCause(() => Effect.void), Effect.andThen(Effect.failCause(cause)))
  })))

  return {
    report: (text: string) => {
      const reported = evidence.value ? DiscoveryResult.report(text, evidence.value) : text
      return claimed.note ? `${reported}\n\n${claimed.note}` : reported
    },
    publish,
    observe: Effect.fn("SeatWork.observe")(function* (facts: ArsenalCompletion.Facts) {
      completion.observed = true
      if (!input.enabled) return
      completion.projection = {
        verification: {
          state: facts.state,
          ...(facts.receipt ? { receipt: facts.receipt } : {}),
          ...(facts.hostReason ? { hostReason: { reason: facts.hostReason.reason, ...(facts.hostReason.detail ? { detail: facts.hostReason.detail } : {}) } } : {}),
          ...(facts.deltaReason ? { deltaReason: { reason: facts.deltaReason.reason, ...(facts.deltaReason.detail ? { detail: facts.deltaReason.detail } : {}) } } : {}),
        },
        ...(facts.checks ? { hostChecks: facts.checks } : {}),
        ...(facts.delta ? { delta: facts.delta } : {}),
      }
      if (!evidence.value) return
      const observed = project(evidence.value)
      evidence.value = observed
      yield* publish(input.publish(observed))
    }),
    attach: <T extends object>(metadata: T) => ({
      ...metadata,
      ...(evidence.value ? { workResult: structuredClone(evidence.value) } : {}),
    }),
    record: Effect.fn("SeatWork.record")(function* (message: SessionV1.WithParts) {
      if (!input.enabled) return
      const snapshot = structuredClone(message)
      const session = structuredClone(yield* history())
      const captured = yield* bound(yield* assemble(snapshot, session), session)
      returned.value = structuredClone(captured)
      evidence.value = structuredClone(captured)
      claimed.note = captured.schema === UpstreamResult.SCHEMA && captured.card?.parsed
        ? claimedArtifacts(captured.artifacts ?? [], [...session, snapshot]) : undefined
      yield* input.publish(structuredClone(captured))
      return captured
    }),
    // When the host ends the Task before or instead of the child's final message, stream the work result it can
    // stand behind: the card already assembled, else the child's last assistant message, else no card.
    hostEnded: Effect.fn("SeatWork.hostEnded")(function* (
      reason: "failed" | "interrupted" | "running",
      detail: string,
    ) {
      if (!input.enabled) return
      // A completion denial is not a worker failure. Preserve the independently observed execution terminal.
      if (reason === "failed" && (completion.observed || completion.interrupted)) return
      if (reason === "interrupted") completion.interrupted = true
      // A `running` snapshot only marks the dispatch start; a later end re-reads the child's last assistant message.
      const prior = evidence.value?.terminal.reason === "running" ? undefined : evidence.value
      const session = prior ? [] : structuredClone(yield* history())
      const captured = structuredClone(prior
        ? { ...prior, terminal: ended.value?.terminal ?? { reason, hostDetail: detail } }
        : yield* bound(yield* hostEnded(lastAssistant(session), session, reason, detail), session))
      // Historical evidence is not an assistant returned by this dispatch.
      if (!returned.value) delete captured.author
      evidence.value = captured
      if (captured.terminal.reason === "failed" || captured.terminal.reason === "interrupted")
        ended.value = structuredClone(captured)
      yield* input.publish(structuredClone(captured))
    }),
    // Never query history here: retain the returned assistant, or the captured host failure when none returned.
    // Both carry the host verification projection this dispatch observed, never one from a later turn.
    notice: Effect.fn("SeatWork.notice")(function* (_state: "completed" | "error", _text: string) {
      if (!input.enabled) return undefined
      const captured = returned.value ?? ended.value
      // Nothing returned or ended: still report the host facts (bound roots, shell fact) of a child with no message.
      if (!captured)
        return yield* bound(yield* hostEnded(undefined, [], "interrupted", "No completed child message"), [])
      // A completion-shaped notice cannot erase a later observed host failure.
      return structuredClone(project(returned.value && ended.value ? { ...captured, terminal: ended.value.terminal } : captured))
    }),
  }
}

function lastAssistant(messages: readonly SessionV1.WithParts[]) {
  // MessageV2.stream is newest-first, including across pages.
  return messages.find((message) => message.info.role === "assistant")
}

// An upstream card's artifact paths are the worker's claims. Name which of them this Task actually wrote, so the
// caller does not report a file that was never written; this checks that a write happened, not what it contains.
function claimedArtifacts(artifacts: NonNullable<BackendResult.WorkResult["artifacts"]>, history: readonly SessionV1.WithParts[]) {
  const paths = artifacts.flatMap((artifact) => artifact.path ? [artifact.path] : [])
  const cwd = history.flatMap((message) => message.info.role === "assistant" ? [message.info.path.cwd] : [])[0]
  if (!paths.length || !cwd) return undefined
  const written = new Set(history.flatMap((message) => message.parts).flatMap((part) =>
    part.type === "tool" && part.state.status === "completed" ? touched(part.tool, part.state.input) : [])
    .map((file) => path.resolve(cwd, file)))
  // Paths are the child's text: quote them so a path holding a newline cannot forge a host line.
  return ["Host check of the paths this card claims (that this Task wrote them, not what they contain):",
    ...paths.map((file) => written.has(path.resolve(cwd, file))
      ? `- ${JSON.stringify(file)}: written by this Task`
      : `- ${JSON.stringify(file)}: NOT written by this Task (no completed write, edit or apply_patch); treat the claim as unverified`)].join("\n")
}

function touched(tool: string, input: Record<string, unknown>) {
  if ((tool === "write" || tool === "edit") && typeof input.filePath === "string") return [input.filePath]
  if (tool !== "apply_patch" || typeof input.patchText !== "string") return []
  const patch = input.patchText
  // A patch the tool could not parse wrote nothing.
  const hunks = Effect.runSync(Effect.try({ try: () => Patch.parse(patch), catch: () => undefined }).pipe(
    Effect.orElseSucceed((): readonly Patch.Hunk[] => [])))
  // A deleted file and the source of a move are not left written.
  return hunks.flatMap((hunk) => {
    if (hunk.type === "delete") return []
    if (hunk.type === "update" && hunk.movePath) return [hunk.movePath]
    return [hunk.path]
  })
}
