export * as ClaudeHostDelegation from "./delegation"

// Orchestra's records of Claude Code's own subagent dispatches (Archie contract V2, `dispatchKind: "claude-code-agent"`),
// written only from in-process hooks. Claude Code executes the `Agent` call; Orchestra witnesses it and records:
// - at `PreToolUse[Agent]`: the seat, the write-root grant bound to the `tool_use_id`, the child Session with those
//   roots, and the logical Task under root authority, before any child frame;
// - through the join (join.ts): Claude Code's subagent id for the `tool_use_id`, from `task_started` only;
// - at `PostToolUse[Agent]`: the author message (the byte-complete `AgentOutput.content`) and the parent `Agent` part,
//   provider-executed, with the work result and the closed `claudeCodeDispatch` evidence;
// - for a background non-proposal seat: the delivery, from the stream's `task_notification` only, never `SubagentStop`.
// The parent part keeps Claude Code's raw tool name; no record ever claims a `task` call Orchestra did not run.
import { isDeepStrictEqual } from "node:util"
import { Effect, Exit, Option, Schema, Semaphore } from "effect"
import type { PreToolUseHookInput, PostToolUseHookInput, PostToolUseFailureHookInput, SDKTaskNotificationMessage } from "@anthropic-ai/claude-agent-sdk"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { ModelV2 } from "@orchestra/core/model"
import { SessionSubagentModels } from "@orchestra/core/session/subagent-models"
import { Database } from "@orchestra/core/database/database"
import { SessionTable } from "@orchestra/core/session/sql"
import { eq } from "drizzle-orm"
import { Research } from "@orchestra/schema/research"
import type { UpstreamAttribution } from "@orchestra/schema/upstream-attribution"
import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { Identifier } from "@/id/id"
import { SeatWork } from "@/maestro/backend-work"
import { DiscoveryResult } from "@/maestro/discovery-result"
import { GovernedTaskReservation } from "@/maestro/governed-task-reservation"
import { LogicalTask } from "@/maestro/logical-task"
import { lookupRouteGrant } from "@orchestra/maestro/route-grant"
import { Seats, type Seat } from "@orchestra/maestro/seats"
import { SessionAuthority } from "@orchestra/maestro/session-authority"
import { UpstreamResult } from "@orchestra/maestro/upstream-result"
import { WriteRoots } from "@/maestro/write-roots"
import { ResearchSeatTools } from "@orchestra/core/research/seat-tools"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import type { ClaudeHostGate } from "./gate"
import type { ClaudeHostJoin } from "@orchestra/engine-claude-code/host/join"
import { ClaudeHostMcp } from "./mcp"
import { ClaudeHostPlugin } from "./plugin"
import { ClaudeHostResearchResult } from "./research-result"

/** Plugin-scoped seat names: `orchestra:<seat id>`. */
export const PREFIX = "orchestra:"

type AgentDispatch = typeof UpstreamAttribution.ClaudeCodeAgentDispatch.Type

/**
 * `metadata.claudeCodeDispatch` on the parent Agent part (contract V2 §2), closed. The literals come from the schema;
 * `subagentType` and `seat` are the dispatched seat's (the observer accepts `orchestra:archie` / `archie` only).
 */
export type Evidence = {
  readonly executor: AgentDispatch["executor"]
  readonly toolName: AgentDispatch["tool"]
  readonly toolUseID: string
  readonly agentID: AgentDispatch["agentID"]
  readonly grantID: AgentDispatch["grantID"]
  readonly subagentType: string
  readonly seat: string
  readonly writeRoots: readonly string[]
  readonly background: boolean
}

/** The mirror's part API for mirrored tool calls (HOST host/mirror.ts): a part by `tool_use_id`, and its write. */
export type Parts = {
  readonly tool: (callID: string) => SessionV1.ToolPart | undefined
  /** The exact child author observed under this call's parent_tool_use_id, retained even after its step closes. */
  readonly author?: (callID: string) => MessageID | undefined
  readonly complete: (part: SessionV1.ToolPart) => Effect.Effect<void>
}

type Record = {
  readonly toolUseID: string
  readonly toolName: AgentDispatch["tool"]
  readonly subagentType: string
  readonly description: string
  readonly dispatcher: ClaudeHostGate.Actor
  /** Admitted SDK-owned concrete wire identity. */
  readonly model?: string
  readonly modelRef?: ModelV2.Ref
  readonly background: boolean
  /** Absent for Claude Code's own subagents (not Orchestra seats): they act under their dispatcher's rules. */
  readonly seat?: Seat
  readonly child?: SessionID
  readonly grantID?: string
  readonly writeRoots: readonly string[]
  /** The research seat's web search domains for this dispatch (J1.9); absent means unrestricted. */
  readonly allowedDomains?: readonly string[]
  readonly logical?: LogicalTask.Binding
  /** The subagent's last text from `SubagentStop`: the author of a background run, recorded only once it is delivered. */
  final?: string
  author?: MessageID
  launched?: boolean
  notice?: SDKTaskNotificationMessage
  settled?: boolean
  delivered?: boolean
  admitted?: boolean
  /** Admitted inspection refusal; survives cancellation of the fiber waiting to retain its HOLD. */
  rejection?: PostToolUseHookInput
  rejectionHold?: string
  /** Exact cleanup target captured while the native identity join still accepts this author. */
  rejectionCleanup?: {
    readonly agentID: string
    readonly sessionID: SessionID
    readonly messageID: MessageID
    parts?: readonly SessionV1.TextPart[]
  }
}

type Admission = {
  readonly args: unknown
  readonly toolName: string
  readonly dispatcher: ClaudeHostGate.Actor
  grant?: ClaudeHostMcp.Grant
  grants?: Map<string, ClaudeHostMcp.Grant>
  spent: boolean
  denied?: string
  cleanup?: SessionID
}

export type Summary = Pick<Record, "toolUseID" | "subagentType" | "child" | "grantID" | "writeRoots" | "background" | "settled"> & {
  readonly hold?: string
  readonly seat?: string
  readonly taskId?: string
}

/** The actor of a call, or the HOLD that refuses it. */
export type Resolved = ClaudeHostGate.Actor | { readonly hold: string }

export type ModelSelection = { readonly model: string; readonly ref: ModelV2.Ref }
export type Models = (type: string, override: unknown) => Effect.Effect<ModelSelection | undefined, unknown>

export function make(input: {
  readonly sessionID: SessionID
  readonly agent: string
  readonly path: { readonly cwd: string; readonly root: string }
  readonly join: ClaudeHostJoin.Join
  readonly parts?: Parts
  readonly research?: ClaudeHostResearchResult.Port
  readonly models?: Models
}) {
  const records = new Map<string, Record>()
  const join = input.join
  const locks = new Map<string, Semaphore.Semaphore>()
  const admissions = new Map<string, Admission>()
  const exclusive = <A, E, R>(toolUseID: string, effect: Effect.Effect<A, E, R>) => Effect.suspend(() => {
    const lock = locks.get(toolUseID) ?? Semaphore.makeUnsafe(1)
    locks.set(toolUseID, lock)
    return lock.withPermits(1)(effect)
  })

  /**
   * Who makes a call: the main conversation, the joined seat's child Session, or a HOLD. A child's hook may run before
   * HOST has seen its `task_started`, so the join is awaited briefly; a subagent still unjoined is denied everything.
   */
  const actor = Effect.fn("ClaudeHostDelegation.actor")(function* (agentID: string | undefined): Effect.fn.Return<Resolved> {
    if (!agentID) return { sessionID: input.sessionID, seat: input.agent }
    const toolUseID = yield* joined(agentID)
    const entry = toolUseID ? records.get(toolUseID) : undefined
    const hold = toolUseID ? join.get(toolUseID)?.hold : undefined
    if (!entry || hold)
      return { hold: `HOLD: subagent ${agentID} is not joined to an Orchestra dispatch${hold ? ` (${hold})` : ""}, so its calls cannot be scoped to a grant.` }
    if (!entry.seat) {
      // HOST creates generic subagents' own Sessions at their first frame. Gate their tools in that placement too.
      for (let round = 0; round < 150; round++) {
        const child = join.child(toolUseID!)
        if (child) return { ...entry.dispatcher, sessionID: child, agentID }
        yield* Effect.sleep("20 millis")
      }
      return { hold: `HOLD: subagent ${agentID} has no mirrored child Session, so its calls cannot be scoped.` }
    }
    if (!entry.child) return { hold: `HOLD: ${entry.seat.id} has no child Session.` }
    return { sessionID: entry.child, seat: entry.seat.id, agentID }
  })

  function joined(agentID: string) {
    return Effect.gen(function* () {
      for (let round = 0; round < 150; round++) {
        const toolUseID = join.toolUse(agentID)
        if (toolUseID) return toolUseID
        yield* Effect.sleep("20 millis")
      }
      return undefined
    })
  }

  /** `PreToolUse[Agent]`, after the gate allowed it. Fails with the reason the dispatch is denied. */
  const dispatch = Effect.fn("ClaudeHostDelegation.dispatch")(function* (hook: PreToolUseHookInput, dispatcher: ClaudeHostGate.Actor) {
    return yield* exclusive(hook.tool_use_id, Effect.gen(function* () {
      const prior = admissions.get(hook.tool_use_id)
      if (prior && (prior.toolName !== hook.tool_name || !isDeepStrictEqual(prior.args, hook.tool_input) ||
        !isDeepStrictEqual(prior.dispatcher, dispatcher))) return yield* refuse(`HOLD: conflicting reuse of ${hook.tool_use_id}`)
      if (prior?.denied) {
        yield* cleanup(prior)
        return yield* refuse(prior.denied)
      }
      const ownership: Admission = prior ?? { args: structuredClone(hook.tool_input), toolName: hook.tool_name, dispatcher: { ...dispatcher }, spent: false }
      admissions.set(hook.tool_use_id, ownership)
      const args = record(hook.tool_input)
      const subagentType = text(args, "subagent_type") ?? "general-purpose"
      const existing = records.get(hook.tool_use_id)
      if (existing) {
        yield* assertChild(hook.tool_use_id, ownership, dispatcher.sessionID, existing.modelRef)
        if (existing.seat) yield* running(existing)
        yield* assertChild(hook.tool_use_id, ownership, dispatcher.sessionID, existing.modelRef)
        return
      }
      const selection = input.models ? yield* input.models(subagentType, args.model) : undefined
      // Recheck after the per-call wait and model lookup, before any grant/child/native dispatch.
      // Generic agents pass this same canonical boundary, even though they have no seat reservation.
      yield* assertChild(hook.tool_use_id, ownership, dispatcher.sessionID, selection?.ref)
      if (ownership.spent) return yield* refuse(`HOLD: admission for ${hook.tool_use_id} already spent its grant; no new child may be created`)
      return yield* Effect.gen(function* () {
        // Claude Code runs a subagent in the background unless the call says otherwise; an absent type is its default agent.
        const base = { toolUseID: hook.tool_use_id, toolName: hook.tool_name === "Task" ? "Task" as const : "Agent" as const, subagentType,
          description: text(args, "description") ?? subagentType, dispatcher, background: args.run_in_background !== false,
          writeRoots: [], model: selection?.model, modelRef: selection?.ref }
        if (!subagentType.startsWith(PREFIX)) {
          records.set(hook.tool_use_id, base)
          join.dispatched(hook.tool_use_id, {})
          return
        }
        const seat = yield* resolve(subagentType)
        const registry = yield* Agent.Service
        const sessions = yield* Session.Service
        const config = yield* Config.Service
        const next = yield* registry.get(seat.id)
        if (!next || next.mode === "primary") return yield* refuse(`${subagentType} cannot be started as a subagent.`)
        // Proposal seats settle through the parent part: Claude Code's background delivery has no host settlement (B3).
        if (seat.workResult !== undefined && base.background)
          return yield* refuse(`HOLD: ${seat.id} runs in the foreground only. Call ${base.toolName} again with run_in_background: false.`)
        if (seat.workResult !== undefined && args.isolation !== undefined)
          return yield* refuse(`${seat.id} writes only its granted roots in this worktree. Call ${base.toolName} again without isolation.`)
        const parent = yield* sessions.get(dispatcher.sessionID)
        const cfg = yield* config.get()
        const authority = yield* SessionAuthority.make((id) => sessions.get(id))(parent.id, parent.projectID)
        if (authority.ancestry.length - 1 >= (cfg.subagent_depth ?? 1))
          return yield* refuse("You cannot start teammates of your own, so no teammate was started. Do this work yourself, or say in your report what still needs a teammate.")
        yield* assertChild(hook.tool_use_id, ownership, dispatcher.sessionID, selection?.ref)
        // The research seat's grant is optional and carries only its web domains (J1.9).
        const research = seat.id === ResearchSeatTools.SEAT
        const grant = seat.writeRoots || (research && ClaudeHostMcp.referenced(text(args, "prompt") ?? ""))
          ? yield* take(seat, text(args, "prompt") ?? "", dispatcher.sessionID, ownership) : undefined
        const domains = research ? grant?.allowedDomains ?? configured(cfg.agent?.[seat.id]?.options) : undefined
        const permission = yield* WriteRoots.bind(seat.id, seat.writeRoots ? grant?.writePaths : undefined,
          GovernedTaskReservation.childPermissions({ parent, next, primaryTools: cfg.experimental?.primary_tools }))
        const brief = yield* lastUser(parent.id)
        const confirmed = input.models ? yield* input.models(subagentType, args.model) : undefined
        yield* assertChild(hook.tool_use_id, ownership, dispatcher.sessionID, confirmed?.ref)
        // Once child creation starts, failures are closed: restoring this capability could authorize another child.
        ownership.spent = true
        const child = yield* sessions.create({ parentID: parent.id, title: `${base.description} (@${next.name} subagent)`, agent: seat.id, permission })
        // The binding exists before Claude Code starts the subagent, so its first frame already has a logical task.
        const logical = yield* LogicalTask.ensure({ executionSessionID: child.id, authoritySessionID: authority.rootID,
          projectID: parent.projectID, memberID: seat.id, source: "host" })
        const prompt = yield* sessions.updateMessage({ id: MessageID.ascending(), role: "user", sessionID: child.id, agent: seat.id,
          model: brief.model, time: { created: Date.now() } } satisfies SessionV1.User)
        yield* sessions.updatePart({ id: PartID.ascending(), sessionID: child.id, messageID: prompt.id, type: "text", text: text(args, "prompt") ?? "" })
        const entry = { ...base, model: confirmed?.model, modelRef: confirmed?.ref, seat, child: child.id, logical, grantID: grant?.grantID ?? Identifier.create("grt", "ascending"),
          writeRoots: WriteRoots.read(permission) ?? [], ...(domains?.length ? { allowedDomains: domains } : {}) }
        records.set(hook.tool_use_id, entry)
        join.dispatched(hook.tool_use_id, { seat: seat.id, grantID: entry.grantID, child: child.id })
        yield* running(entry)
      }).pipe(Effect.onExit((exit) => Effect.sync(() => {
        if (!Exit.isFailure(exit) || ownership.spent || admissions.get(hook.tool_use_id) !== ownership) return
        const grants = ClaudeHostMcp.grants(dispatcher.sessionID)
        if (ownership.grant && ownership.grants === grants && !grants.has(ownership.grant.grantID))
          grants.set(ownership.grant.grantID, ownership.grant)
        ownership.grant = undefined
      })))
    }))
  })

  /** Last hook admission checkpoint, after research and other awaited setup. */
  const admit = Effect.fn("ClaudeHostDelegation.admit")(function* (hook: PreToolUseHookInput, dispatcher: ClaudeHostGate.Actor) {
    return yield* exclusive(hook.tool_use_id, Effect.gen(function* () {
      const entry = records.get(hook.tool_use_id)
      const ownership = admissions.get(hook.tool_use_id)
      if (!entry || !ownership || ownership.denied || join.get(hook.tool_use_id)?.hold)
        return yield* refuse(ownership?.denied ?? "HOLD: native model admission is unavailable")
      const policies = yield* SessionSubagentModels.Service
      const checked = yield* Effect.exit(Effect.gen(function* () {
        const selection = entry.admitted ? undefined : input.models
          ? yield* input.models(entry.subagentType, record(hook.tool_input).model) : undefined
        yield* policies.assertChild(dispatcher.sessionID, entry.admitted ? entry.modelRef : selection?.ref)
        return selection
      }))
      if (Exit.isSuccess(checked)) {
        records.set(hook.tool_use_id, entry.admitted ? entry : { ...entry, model: checked.value?.model, modelRef: checked.value?.ref, admitted: true })
        return
      }
      yield* deny(hook.tool_use_id, ownership)
      return yield* Effect.failCause(checked.cause)
    }))
  })

  function assertChild(toolUseID: string, ownership: Admission, sessionID: SessionID, model: ModelV2.Ref | undefined) {
    return Effect.gen(function* () {
      const policies = yield* SessionSubagentModels.Service
      yield* policies.assertChild(sessionID, model).pipe(Effect.catchCause((cause) =>
        deny(toolUseID, ownership).pipe(Effect.andThen(Effect.failCause(cause)))))
    })
  }

  function deny(toolUseID: string, ownership: Admission) {
    return Effect.gen(function* () {
      const entry = records.get(toolUseID)
      // Latch refusal, spend reserved authority and withdraw replay eligibility before fallible teardown.
      ownership.denied ??= "HOLD: subagent model policy denied this native admission"
      ownership.spent = true
      ownership.cleanup ??= entry?.admitted ? undefined : entry?.child
      join.hold(toolUseID, ownership.denied)
      records.delete(toolUseID)
      yield* cleanup(ownership)
    }).pipe(Effect.uninterruptible)
  }

  function cleanup(ownership: Admission) {
    return Effect.gen(function* () {
      if (!ownership.cleanup) return
      const child = ownership.cleanup
      const database = yield* Database.Service
      const sessions = yield* Session.Service
      const present = () => database.db.select({ id: SessionTable.id }).from(SessionTable)
        .where(eq(SessionTable.id, child)).get().pipe(Effect.orDie)
      const removal = yield* Effect.exit(Effect.gen(function* () {
        if (yield* present()) yield* sessions.remove(child)
      }))
      if (yield* present()) return yield* Exit.isFailure(removal) ? Effect.failCause(removal.cause)
        : refuse("HOLD: denied native admission cleanup is still pending")
      ownership.cleanup = undefined
    }).pipe(Effect.uninterruptible)
  }

  /** `SubagentStop`: the subagent's last text. It delivers nothing (spike S12): a background run is delivered on notice. */
  const stop = (agentID: string, final: string | undefined) => {
    const entry = records.get(join.toolUse(agentID) ?? "")
    if (entry && final !== undefined) entry.final = final
  }

  /**
   * `PostToolUse[Agent]`: the settlement record. Returns context for the model when Orchestra holds the result.
   * `refused` is a reason the host already refuses this result for (a secret in its output).
   */
  const settle = Effect.fn("ClaudeHostDelegation.settle")(function* (hook: PostToolUseHookInput, refused?: string) {
    // Record admission before the interruptible semaphore wait. Delivery cannot consume this obligation.
    const admitted = records.get(hook.tool_use_id)
    if (refused !== undefined && admitted && !admitted.settled) admitted.rejection ??= structuredClone(hook)
    return yield* exclusive(hook.tool_use_id, Effect.gen(function* () {
      const entry = records.get(hook.tool_use_id)
      if (entry?.settled && (!entry.rejection || !entry.delivered)) {
        entry.rejection = undefined
        return undefined
      }
      // Dispatch admission may have been ahead of this settlement when its record was not yet published.
      if (refused !== undefined && entry && !entry.settled) entry.rejection ??= structuredClone(hook)
      const researchControl = entry?.seat?.id === ResearchSeatTools.SEAT && entry.child
        ? yield* ClaudeHostResearchResult.close(entry.child, entry.toolUseID, join, input.research) : undefined
      const ended = ClaudeHostResearchResult.terminal(researchControl)
      if (entry?.rejection) return yield* reject(entry, entry.rejection, researchControl, ended)
      if (!entry?.seat || !entry.child) return undefined
      if (entry.launched) {
        if (entry.notice) yield* deliver(entry, entry.notice)
        return undefined
      }
      const agentID = join.get(entry.toolUseID)?.taskID
      const response = record(hook.tool_response)
      const status = text(response, "status")
      // AgentOutput.content is the subagent's own final text, byte for byte (spike S13); the tool result Maestro reads
      // wraps it in a hand-back frame.
      const blocks = content(response)
      const reply = blocks.join("\n")
      const identity = join.confirm(entry.toolUseID, [text(response, "agentId"), agentID])
      const hold = ("hold" in identity ? identity.hold : undefined) ??
        (status === "async_launched" && entry.seat.workResult !== undefined ? "a proposal seat ran in the background" : undefined) ??
        (status !== "completed" && status !== "async_launched" ? `Claude Code returned ${status ?? "no status"}` : undefined) ??
        (status === "completed" && !blocks.length ? "the subagent returned no final text" : undefined)
      if (hold !== undefined || "hold" in identity) {
        const reason = `HOLD: ${hold ?? "join failed"}`
        join.hold(entry.toolUseID, reason)
        yield* write(entry, ended ? ClaudeHostResearchResult.report(reply, ended) : reply,
          { parentSessionId: entry.dispatcher.sessionID, sessionId: entry.child, background: entry.background, hold: reason,
            ...(researchControl ? { researchControl } : {}), ...(ended ? { terminal: ended } : {}) })
        entry.settled = true
        return `${ended ? `Orchestra research ${ended.reason}: ${ended.hostDetail}. ` : ""}Orchestra recorded no attributed result for this ${entry.toolName} call (${reason}). Do not treat it as accepted work.`
      }
      const evidence = { executor: "claude-code-host", toolName: entry.toolName, toolUseID: entry.toolUseID, agentID: identity.agentID,
        grantID: entry.grantID ?? "", subagentType: entry.subagentType, seat: entry.seat.id, writeRoots: [...entry.writeRoots],
        background: status === "async_launched" } satisfies Evidence
      const base = { parentSessionId: entry.dispatcher.sessionID, sessionId: entry.child, background: evidence.background, claudeCodeDispatch: evidence,
        ...(researchControl ? { researchControl } : {}) }
      if (status === "async_launched") {
        yield* write(entry, reply, base)
        entry.launched = true
        if (entry.notice) yield* deliver(entry, entry.notice)
        return undefined
      }
      const author = yield* authored(entry.child, entry.seat.id, identity.agentID, blocks, text(response, "resolvedModel"))
      entry.author = author.info.id
      const recorded = entry.seat.workResult !== undefined ? yield* work(entry, entry.child, author) : undefined
      const workResult = recorded && ended ? { ...recorded, terminal: ended } : recorded
      const retained = workResult ? DiscoveryResult.report(reply, workResult) : reply
      const report = ended ? ClaudeHostResearchResult.report(retained, ended) : retained
      // Maestro records a plan from a proposal with these identities, and Claude Code's Agent result carries none of
      // them. They are host facts; maestro_record_plan_revision re-verifies every one against the durable records.
      // They come first, before any text the child wrote, so a look-alike line in that text cannot pass for them.
      const parent = workResult?.schema === UpstreamResult.SCHEMA ? yield* find(entry) : undefined
      const proposal = workResult?.schema === UpstreamResult.SCHEMA ? "Host attribution of this proposal " +
        `(maestro_record_plan_revision upstream): ${JSON.stringify({ parentMessageID: parent?.messageID,
          parentCallID: entry.toolUseID, authorSessionID: entry.child, authorMessageID: author.info.id,
          logicalTaskID: workResult.taskId, dispatchKind: "claude-code-agent" })}\n\n${report}` : undefined
      yield* write(entry, proposal ?? report, { ...base, ...(workResult ? { workResult } : {}) })
      entry.settled = true
      return proposal ?? (ended || workResult?.schema === "discovery-work-result-v1" ? report : undefined)
    }))
  })

  /** SDK failure facts only: no AgentOutput, invented task identity, author, or physical delivery. */
  const fail = Effect.fn("ClaudeHostDelegation.fail")(function* (hook: PostToolUseFailureHookInput) {
    return yield* exclusive(hook.tool_use_id, Effect.gen(function* () {
      const entry = records.get(hook.tool_use_id)
      if (!entry || entry.settled || entry.rejection) return undefined
      const error = yield* ClaudeHostResearchResult.diagnostic(hook.error)
      const researchControl = entry.seat?.id === ResearchSeatTools.SEAT && entry.child
        ? yield* ClaudeHostResearchResult.close(entry.child, entry.toolUseID, join, input.research) : undefined
      const part = yield* find(entry)
      if (!part) return yield* refuse(`HOLD: the ${entry.toolName} call ${entry.toolUseID} has no mirrored part to record`)
      const terminal = { reason: hook.is_interrupt ? "interrupted" : "failed", hostDetail: error }
      const ended = ClaudeHostResearchResult.terminal(researchControl)
      const reason = `CLAUDE_CODE_AGENT_${hook.is_interrupt ? "INTERRUPTED" : "FAILED"}: ${error}${ended ? `\nResearch ${ended.reason}: ${ended.hostDetail}` : ""}`
      const child = entry.child ?? join.child(entry.toolUseID)
      yield* save({ ...part, metadata: { ...part.metadata, ...placement(entry), providerExecuted: true, claudeCodeTool: entry.toolName },
        state: { status: "error", input: part.state.input, error: reason,
          metadata: { parentSessionId: entry.dispatcher.sessionID, ...(child ? { sessionId: child } : {}), background: entry.background,
            terminal, nativeError: { source: "claude-code-post-tool-use-failure", name: "CLAUDE_CODE_AGENT_FAILURE",
              message: error, interrupted: hook.is_interrupt === true },
            ...(researchControl ? { researchControl } : {}) },
          time: { start: part.state.status === "running" ? part.state.time.start : Date.now(), end: Date.now() } } })
      entry.final = undefined
      entry.notice = undefined
      entry.settled = true
      return `${reason}. Orchestra retained a ${terminal.reason} Agent part; no authored result or delivery was recorded.`
    }))
  })

  function reject(entry: Record, hook: PostToolUseHookInput, researchControl: ClaudeHostResearchResult.Diagnostic | undefined,
    ended: ReturnType<typeof ClaudeHostResearchResult.terminal>) {
    return Effect.gen(function* () {
      const reason = `HOLD: ${entry.toolName} output refused by ToolSafety inspection`
      const blocks = content(record(hook.tool_response))
      // A failed HOLD save stays retryable even when the preceding delivery was already retained.
      entry.settled = false
      entry.delivered = false
      entry.final = undefined
      const child = entry.child ?? join.child(entry.toolUseID)
      const authorID = entry.author ?? input.parts?.author?.(entry.toolUseID)
      if (!entry.rejectionHold && !entry.rejectionCleanup) {
        const identity = join.confirm(entry.toolUseID, [text(record(hook.tool_response), "agentId")])
        if (child && authorID && "agentID" in identity && blocks.length)
          entry.rejectionCleanup = { agentID: identity.agentID, sessionID: child, messageID: authorID }
      }
      const cleanup = entry.rejectionCleanup
      // Capture the exact part vector before publishing our HOLD. Cancellation during validation retains the target.
      if (cleanup && !cleanup.parts) {
        const sessions = yield* Session.Service
        const author = (yield* sessions.messages({ sessionID: cleanup.sessionID })).find((message) => message.info.id === cleanup.messageID)
        if (author?.info.role !== "assistant" || author.info.sessionID !== cleanup.sessionID ||
          entry.seat && author.info.agent !== entry.seat.id ||
          !isDeepStrictEqual(author.parts.flatMap((part) => part.type === "text" ? [part.text] : []), blocks))
          return yield* refuse(`HOLD: rejected author ownership changed for ${entry.toolUseID}`)
        const parts = author.parts.filter((part): part is SessionV1.TextPart => part.type === "text")
        if (parts.some((part) => part.sessionID !== cleanup.sessionID || part.messageID !== cleanup.messageID))
          return yield* refuse(`HOLD: rejected part ownership changed for ${entry.toolUseID}`)
        cleanup.parts = parts
      }
      if (!cleanupJoined(entry, reason))
        return yield* refuse(`HOLD: conflicting native identity prevents rejected author cleanup for ${entry.toolUseID}`)
      join.hold(entry.toolUseID, reason)
      entry.rejectionHold = reason
      if (cleanup?.parts) {
        const sessions = yield* Session.Service
        yield* Effect.forEach(cleanup.parts, (original) => Effect.gen(function* () {
          const part = yield* sessions.getPart({ sessionID: cleanup.sessionID, messageID: cleanup.messageID, partID: original.id })
          if (part?.type !== "text" || part.id !== original.id || part.sessionID !== cleanup.sessionID || part.messageID !== cleanup.messageID ||
            part.text !== original.text && part.text !== reason)
            return yield* refuse(`HOLD: rejected part ownership changed for ${entry.toolUseID}`)
          if (!cleanupJoined(entry, reason))
            return yield* refuse(`HOLD: conflicting native identity prevents rejected author cleanup for ${entry.toolUseID}`)
          // A partially completed cleanup is idempotent; never select an older turn by its bytes.
          if (part.text !== reason) yield* sessions.updatePart({ ...part, text: reason })
        }))
      }
      if (!cleanupJoined(entry, reason))
        return yield* refuse(`HOLD: conflicting native identity prevents rejected author cleanup for ${entry.toolUseID}`)
      yield* write(entry, reason, { parentSessionId: entry.dispatcher.sessionID, ...(child ? { sessionId: child } : {}),
        background: entry.background, hold: reason, output: reason, claudeCodeDispatch: undefined, workResult: undefined, delivery: undefined,
        ...(researchControl ? { researchControl } : {}), terminal: ended ?? { reason: "failed", hostDetail: reason } })
      entry.settled = true
      entry.rejection = undefined
      entry.rejectionCleanup = undefined
      entry.rejectionHold = undefined
      entry.notice = undefined
      return `Orchestra recorded no attributed result for this ${entry.toolName} call (${reason}). Do not treat it as accepted work.`
    })
  }

  function cleanupJoined(entry: Record, reason: string) {
    const joined = join.get(entry.toolUseID)
    return (joined?.hold === undefined || entry.rejectionHold === reason && joined.hold === reason) &&
      (!entry.rejectionCleanup || joined?.taskID === entry.rejectionCleanup.agentID &&
        join.toolUse(entry.rejectionCleanup.agentID) === entry.toolUseID)
  }

  /** `task_notification` from the stream (through the join): the only source of a background delivery record. */
  const notify = Effect.fn("ClaudeHostDelegation.notify")(function* (message: SDKTaskNotificationMessage) {
    const toolUseID = join.notification(message)
    if (!toolUseID) return
    yield* exclusive(toolUseID, Effect.gen(function* () {
      const entry = records.get(toolUseID)
      if (!entry?.seat || !entry.child || entry.settled) return
      if (join.notification(message) !== entry.toolUseID) return
      entry.notice ??= message
      if (!entry.launched) {
        return
      }
      yield* deliver(entry, entry.notice)
    }))
  })

  function deliver(entry: Record, message: SDKTaskNotificationMessage) {
    return Effect.gen(function* () {
      if (entry.settled || !entry.seat || !entry.child) return
      if (join.notification(message) !== entry.toolUseID) return
      const part = yield* find(entry)
      if (!part || part.state.status !== "completed") return yield* refuse(`HOLD: launch part for ${entry.toolUseID} is not retained`)
      if (message.status === "completed" && entry.final !== undefined) {
        const author = yield* authored(entry.child, entry.seat.id, message.task_id, [entry.final], undefined)
        entry.author = author.info.id
      }
      yield* save({ ...part, state: { ...part.state, metadata: { ...part.state.metadata, delivery: {
        source: "claude-code-task-notification", taskID: message.task_id, status: message.status, summary: message.summary,
        outputFile: message.output_file, ...(message.usage ? { usage: message.usage } : {}),
      } } } })
      entry.settled = true
      entry.delivered = true
      entry.notice = undefined
      join.retained(message)
    })
  }

  return {
    actor,
    dispatch,
    admit,
    stop,
    settle,
    fail,
    notify,
    /** The child Session of a dispatch, for mirroring its `parent_tool_use_id` frames. */
    child: (toolUseID: string) => records.get(toolUseID)?.child,
    seat: (toolUseID: string) => records.get(toolUseID)?.seat?.id,
    /** The web search domains bound to the dispatch that created this child Session (J1.9). */
    domains: (child: SessionID) => [...records.values()].find((entry) => entry.child === child)?.allowedDomains,
    /** Every dispatch of this host session so far, for working memory. */
    summaries: () => [...records.values()].flatMap((entry): Summary[] => entry.seat ? [{
      toolUseID: entry.toolUseID, subagentType: entry.subagentType, child: entry.child, grantID: entry.grantID,
      writeRoots: entry.writeRoots, background: entry.background, hold: join.get(entry.toolUseID)?.hold, settled: entry.settled,
      seat: entry.seat.id, taskId: entry.logical?.taskId,
    }] : []),
    /** The grants issued in this host session that no dispatch has bound yet. */
    grants: () => [...ClaudeHostMcp.grants(input.sessionID).values()],
  }

  function take(seat: Seat, prompt: string, sessionID: string, ownership: Admission) {
    return Effect.gen(function* () {
      const id = ClaudeHostMcp.referenced(prompt)
      const how = `Call mcp__orchestra__task_grant with seat "${seat.id}" and its writePaths, then put "grantID: <id>" on its own line in the Agent prompt.`
      if (!id) return yield* refuse(`HOLD: ${seat.id} needs a write-root grant for this dispatch. ${how}`)
      const grants = ClaudeHostMcp.grants(sessionID)
      const grant = grants.get(id)
      if (!grant || grant.seat !== seat.id || grant.sessionID !== sessionID)
        return yield* refuse(`HOLD: ${id} is not an unused ${seat.id} grant of this session. ${how}`)
      // No yield between lookup and removal: this reservation belongs to this call before admission does I/O.
      ownership.grant = grant
      ownership.grants = grants
      grants.delete(id)
      return grant
    })
  }

  // Waits for the mirror to see the call: Claude Code may run a hook before its tool_use block reaches the stream.
  function find(entry: Record) {
    return Effect.gen(function* () {
      const sessions = yield* Session.Service
      for (let round = 0; round < 150; round++) {
        const mirrored = input.parts?.tool(entry.toolUseID)
        if (mirrored) return mirrored
        const stored = (yield* sessions.messages({ sessionID: entry.dispatcher.sessionID })).flatMap((message) => message.parts)
          .find((part): part is SessionV1.ToolPart => part.type === "tool" && part.callID === entry.toolUseID)
        if (stored) return stored
        yield* Effect.sleep("20 millis")
      }
      return undefined
    })
  }

  function save(part: SessionV1.ToolPart) {
    return Effect.gen(function* () {
      const sessions = yield* Session.Service
      if (input.parts) return yield* input.parts.complete(part)
      yield* sessions.updatePart(part)
    })
  }

  // The live task card needs the child Session while the subagent runs. The mirror finds it on the part's own metadata
  // (HOST host/session.ts); the contract reads it from the call state's.
  function running(entry: Record) {
    return Effect.gen(function* () {
      const part = yield* find(entry)
      if (!part || part.state.status !== "running") return
      yield* save({ ...part, metadata: { ...part.metadata, ...placement(entry) }, state: { ...part.state, title: entry.description,
        metadata: { ...part.state.metadata, ...placement(entry), background: entry.background } } })
    })
  }

  function placement(entry: Record) {
    return { parentSessionId: entry.dispatcher.sessionID, ...(entry.child ? { sessionId: entry.child } : {}) }
  }

  // The parent part: Claude Code's raw tool name, executed by Claude Code, with what Maestro received as its output.
  function write(entry: Record, output: string, metadata: { readonly [key: string]: unknown }) {
    return Effect.gen(function* () {
      const part = yield* find(entry)
      if (!part) return yield* refuse(`HOLD: the ${entry.toolName} call ${entry.toolUseID} has no mirrored part to record`)
      const start = part.state.status === "running" ? part.state.time.start : Date.now()
      yield* save({ ...part, tool: entry.toolName, metadata: { ...part.metadata, ...placement(entry), providerExecuted: true, claudeCodeTool: entry.toolName },
        state: { status: "completed", input: part.state.input, output, title: entry.description, metadata: { ...metadata },
          time: { start, end: Date.now() } } })
    })
  }

  // The child's author message is the subagent's byte-complete final text, one text part per returned block. A mirrored
  // message that already carries exactly those texts, completed, is the author; otherwise the host records it, tagged so
  // nobody mistakes it for a natively mirrored turn (its cost and tokens are unknown, not zero).
  function authored(child: SessionID, seat: string, agentID: string, blocks: readonly string[], model: string | undefined) {
    return Effect.gen(function* () {
      const sessions = yield* Session.Service
      const history = yield* sessions.messages({ sessionID: child })
      const last = history.findLast((message) => message.info.role === "assistant")
      if (last?.info.role === "assistant" && last.info.agent === seat && last.info.time.completed !== undefined && !last.info.error &&
        last.info.finish !== undefined && !["error", "tool-calls"].includes(last.info.finish) &&
        isDeepStrictEqual(last.parts.flatMap((part) => part.type === "text" ? [part.text] : []), [...blocks])) return last
      const prompt = history.find((message) => message.info.role === "user")
      if (prompt?.info.role !== "user") return yield* refuse(`HOLD: the ${seat} Session has no brief to answer`)
      const now = Date.now()
      const info = yield* sessions.updateMessage({ id: MessageID.ascending(), sessionID: child, parentID: prompt.info.id, role: "assistant",
        mode: seat, agent: seat, path: { ...input.path }, cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        modelID: model ? ModelV2.ID.make(model) : prompt.info.model.modelID, providerID: prompt.info.model.providerID,
        time: { created: now, completed: now }, finish: "stop" } satisfies SessionV1.Assistant)
      const parts = yield* Effect.forEach(blocks, (block) => sessions.updatePart({ id: PartID.ascending(), sessionID: child,
        messageID: info.id, type: "text", text: block, time: { start: now, end: now },
        metadata: { source: "claude-code-agent-output", agentID } } satisfies SessionV1.TextPart))
      return { info, parts }
    })
  }

  // The work result exactly as the Task path assembles it (SeatWork.track), on the author message.
  function work(entry: Record, childID: SessionID, author: SessionV1.WithParts) {
    return Effect.gen(function* () {
      const sessions = yield* Session.Service
      const child = yield* sessions.get(childID)
      const tracker = SeatWork.track({ enabled: true, seat: entry.seat, sessionID: child.id, taskId: entry.logical?.taskId,
        memberId: entry.seat?.id, authoritySessionId: entry.logical ? SessionID.make(entry.logical.authoritySessionID) : undefined,
        writeRoots: yield* WriteRoots.effective(child.permission), publish: () => Effect.void })
      return yield* tracker.record(author)
    })
  }

  function lastUser(sessionID: SessionID) {
    return Effect.gen(function* () {
      const sessions = yield* Session.Service
      const user = (yield* sessions.messages({ sessionID })).findLast((message) => message.info.role === "user")
      if (user?.info.role !== "user") return yield* refuse("HOLD: the dispatching Session has no user message to take a model from")
      return user.info
    })
  }
}

/**
 * The seat a plugin-scoped subagent type names, from the registry; anything else is a HOLD. The research seat is named
 * only with its tier, `orchestra:jimmy-<tier>` (J1.4); no other seat takes a tier suffix.
 */
function resolve(subagentType: string) {
  return Effect.gen(function* () {
    const named = ClaudeHostPlugin.agent(subagentType.slice(PREFIX.length))
    if (named.seat === ResearchSeatTools.SEAT && !named.tier)
      return yield* refuse(`HOLD: ${named.seat} is dispatched with its research tier. Use subagent_type ` +
        `${Research.Depth.literals.map((tier) => `"${PREFIX}${named.seat}-${tier}"`).join(", ")}.`)
    const route = lookupRouteGrant(named.seat)
    if (route.status === "HOLD") return yield* refuse(`HOLD: ${subagentType} is not an Orchestra seat (${route.reason}).`)
    const seat = Seats.find(route.grant.memberId)
    if (!seat) return yield* refuse(`HOLD: ${subagentType} is not an Orchestra seat (unknown-member-id).`)
    return seat
  })
}

// The configured default domains, `agent.jimmy.web.allowedDomains`, which the agent config keeps among its options.
function configured(options: unknown) {
  return Option.getOrUndefined(Schema.decodeUnknownOption(Schema.Struct({
    web: Schema.Struct({ allowedDomains: Schema.Array(Schema.String) }) }))(options))?.web.allowedDomains
}

function refuse(reason: string) {
  return Effect.fail(new Error(reason))
}

function content(response: { readonly [key: string]: unknown }) {
  const blocks: readonly unknown[] = Array.isArray(response.content) ? response.content : []
  return blocks.flatMap((block) => {
    const item = record(block)
    return item.type === "text" && typeof item.text === "string" ? [item.text] : []
  })
}

function record(value: unknown): { readonly [key: string]: unknown } {
  return isRecord(value) ? value : {}
}

function isRecord(value: unknown): value is { readonly [key: string]: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function text(input: { readonly [key: string]: unknown }, key: string) {
  const value = input[key]
  return typeof value === "string" ? value : undefined
}
