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
import { Effect } from "effect"
import type { PreToolUseHookInput, PostToolUseHookInput, SDKTaskNotificationMessage } from "@anthropic-ai/claude-agent-sdk"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { ModelV2 } from "@orchestra/core/model"
import type { UpstreamAttribution } from "@orchestra/schema/upstream-attribution"
import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { Identifier } from "@/id/id"
import { SeatWork } from "@/maestro/backend-work"
import { GovernedTaskReservation } from "@/maestro/governed-task-reservation"
import { LogicalTask } from "@/maestro/logical-task"
import { lookupRouteGrant } from "@/maestro/route-grant"
import { Seats, type Seat } from "@/maestro/seats"
import { SessionAuthority } from "@/maestro/session-authority"
import { WriteRoots } from "@/maestro/write-roots"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import type { ClaudeHostGate } from "./gate"
import type { ClaudeHostJoin } from "./join"
import { ClaudeHostMcp } from "./mcp"

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
  readonly complete: (part: SessionV1.ToolPart) => Effect.Effect<void>
}

type Record = {
  readonly toolUseID: string
  readonly toolName: AgentDispatch["tool"]
  readonly subagentType: string
  readonly description: string
  readonly dispatcher: ClaudeHostGate.Actor
  readonly background: boolean
  /** Absent for Claude Code's own subagents (not Orchestra seats): they act under their dispatcher's rules. */
  readonly seat?: Seat
  readonly child?: SessionID
  readonly grantID?: string
  readonly writeRoots: readonly string[]
  readonly logical?: LogicalTask.Binding
  /** The subagent's last text from `SubagentStop`: the author of a background run, recorded only once it is delivered. */
  final?: string
  launched?: boolean
  notice?: SDKTaskNotificationMessage
  settled?: boolean
}

export type Summary = Pick<Record, "toolUseID" | "subagentType" | "child" | "grantID" | "writeRoots" | "background" | "settled"> & {
  readonly hold?: string
  readonly seat?: string
  readonly taskId?: string
}

/** The actor of a call, or the HOLD that refuses it. */
export type Resolved = ClaudeHostGate.Actor | { readonly hold: string }

export function make(input: {
  readonly sessionID: SessionID
  readonly agent: string
  readonly path: { readonly cwd: string; readonly root: string }
  readonly join: ClaudeHostJoin.Join
  readonly parts?: Parts
}) {
  const records = new Map<string, Record>()
  const join = input.join

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
    if (!entry.seat || !entry.child) return { ...entry.dispatcher, agentID }
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
    const args = record(hook.tool_input)
    // Claude Code runs a subagent in the background unless the call says otherwise; an absent type is its default agent.
    const subagentType = text(args, "subagent_type") ?? "general-purpose"
    const base = { toolUseID: hook.tool_use_id, toolName: hook.tool_name === "Task" ? "Task" as const : "Agent" as const, subagentType,
      description: text(args, "description") ?? subagentType, dispatcher, background: args.run_in_background !== false,
      writeRoots: [] }
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
    const grant = seat.writeRoots ? yield* take(seat, text(args, "prompt") ?? "", dispatcher.sessionID) : undefined
    const permission = yield* WriteRoots.bind(seat.id, grant?.writePaths,
      GovernedTaskReservation.childPermissions({ parent, next, primaryTools: cfg.experimental?.primary_tools }))
    const brief = yield* lastUser(parent.id)
    const child = yield* sessions.create({ parentID: parent.id, title: `${base.description} (@${next.name} subagent)`, agent: seat.id, permission })
    // The binding exists before Claude Code starts the subagent, so its first frame already has a logical task.
    const logical = yield* LogicalTask.ensure({ executionSessionID: child.id, authoritySessionID: authority.rootID,
      projectID: parent.projectID, memberID: seat.id, source: "host" })
    const prompt = yield* sessions.updateMessage({ id: MessageID.ascending(), role: "user", sessionID: child.id, agent: seat.id,
      model: brief.model, time: { created: Date.now() } } satisfies SessionV1.User)
    yield* sessions.updatePart({ id: PartID.ascending(), sessionID: child.id, messageID: prompt.id, type: "text", text: text(args, "prompt") ?? "" })
    // Bound to this tool use only: the grant cannot be named by a second dispatch.
    if (grant) ClaudeHostMcp.grants(dispatcher.sessionID).delete(grant.grantID)
    const entry = { ...base, seat, child: child.id, logical, grantID: grant?.grantID ?? Identifier.create("grt", "ascending"),
      writeRoots: WriteRoots.read(permission) ?? [] }
    records.set(hook.tool_use_id, entry)
    join.dispatched(hook.tool_use_id, { seat: seat.id, grantID: entry.grantID, child: child.id })
    yield* running(entry)
  })

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
    const entry = records.get(hook.tool_use_id)
    if (!entry?.seat || !entry.child || entry.settled || entry.launched) return undefined
    const agentID = join.get(entry.toolUseID)?.taskID
    const response = record(hook.tool_response)
    const status = text(response, "status")
    // AgentOutput.content is the subagent's own final text, byte for byte (spike S13); the tool result Maestro reads
    // wraps it in a hand-back frame.
    const blocks = content(response)
    const reply = blocks.join("\n")
    const identity = join.confirm(entry.toolUseID, [text(response, "agentId"), agentID])
    const hold = refused ?? ("hold" in identity ? identity.hold : undefined) ??
      (status === "async_launched" && entry.seat.workResult !== undefined ? "a proposal seat ran in the background" : undefined) ??
      (status !== "completed" && status !== "async_launched" ? `Claude Code returned ${status ?? "no status"}` : undefined) ??
      (status === "completed" && !blocks.length ? "the subagent returned no final text" : undefined)
    if (hold !== undefined || "hold" in identity) {
      entry.settled = true
      const reason = `HOLD: ${hold ?? "join failed"}`
      join.hold(entry.toolUseID, reason)
      yield* write(entry, reply, { parentSessionId: entry.dispatcher.sessionID, sessionId: entry.child, background: entry.background, hold: reason })
      return `Orchestra recorded no attributed result for this ${entry.toolName} call (${reason}). Do not treat it as accepted work.`
    }
    const evidence = { executor: "claude-code-host", toolName: entry.toolName, toolUseID: entry.toolUseID, agentID: identity.agentID,
      grantID: entry.grantID ?? "", subagentType: entry.subagentType, seat: entry.seat.id, writeRoots: [...entry.writeRoots],
      background: status === "async_launched" } satisfies Evidence
    const base = { parentSessionId: entry.dispatcher.sessionID, sessionId: entry.child, background: evidence.background, claudeCodeDispatch: evidence }
    if (status === "async_launched") {
      entry.launched = true
      yield* write(entry, reply, base)
      if (entry.notice) yield* deliver(entry, entry.notice)
      return undefined
    }
    entry.settled = true
    const author = yield* authored(entry.child, entry.seat.id, blocks, text(response, "resolvedModel"))
    const workResult = entry.seat.workResult !== undefined ? yield* work(entry, entry.child, author) : undefined
    yield* write(entry, reply, { ...base, ...(workResult ? { workResult } : {}) })
    return undefined
  })

  /** `task_notification` from the stream (through the join): the only source of a background delivery record. */
  const notify = Effect.fn("ClaudeHostDelegation.notify")(function* (message: SDKTaskNotificationMessage) {
    const entry = message.tool_use_id ? records.get(message.tool_use_id) : undefined
    if (!entry?.seat || !entry.child || entry.settled) return
    if (!entry.launched) {
      entry.notice = message
      return
    }
    yield* deliver(entry, message)
  })

  function deliver(entry: Record, message: SDKTaskNotificationMessage) {
    return Effect.gen(function* () {
      if (entry.settled || !entry.seat || !entry.child) return
      entry.settled = true
      if (message.status === "completed" && entry.final !== undefined) yield* authored(entry.child, entry.seat.id, [entry.final], undefined)
      const part = yield* find(entry)
      if (!part || part.state.status !== "completed") return
      yield* save({ ...part, state: { ...part.state, metadata: { ...part.state.metadata, delivery: {
        source: "claude-code-task-notification", taskID: message.task_id, status: message.status, summary: message.summary,
        outputFile: message.output_file, ...(message.usage ? { usage: message.usage } : {}),
      } } } })
    })
  }

  return {
    actor,
    dispatch,
    stop,
    settle,
    notify,
    /** The child Session of a dispatch, for mirroring its `parent_tool_use_id` frames. */
    child: (toolUseID: string) => records.get(toolUseID)?.child,
    seat: (toolUseID: string) => records.get(toolUseID)?.seat?.id,
    /** Every dispatch of this host session so far, for working memory. */
    summaries: () => [...records.values()].flatMap((entry): Summary[] => entry.seat ? [{
      toolUseID: entry.toolUseID, subagentType: entry.subagentType, child: entry.child, grantID: entry.grantID,
      writeRoots: entry.writeRoots, background: entry.background, hold: join.get(entry.toolUseID)?.hold, settled: entry.settled,
      seat: entry.seat.id, taskId: entry.logical?.taskId,
    }] : []),
    /** The grants issued in this host session that no dispatch has bound yet. */
    grants: () => [...ClaudeHostMcp.grants(input.sessionID).values()],
  }

  function take(seat: Seat, prompt: string, sessionID: string) {
    return Effect.gen(function* () {
      const id = ClaudeHostMcp.referenced(prompt)
      const how = `Call mcp__orchestra__task_grant with seat "${seat.id}" and its writePaths, then put "grantID: <id>" on its own line in the Agent prompt.`
      if (!id) return yield* refuse(`HOLD: ${seat.id} needs a write-root grant for this dispatch. ${how}`)
      const grant = ClaudeHostMcp.grants(sessionID).get(id)
      if (!grant || grant.seat !== seat.id || grant.sessionID !== sessionID)
        return yield* refuse(`HOLD: ${id} is not an unused ${seat.id} grant of this session. ${how}`)
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
  // message that already carries exactly those texts, completed, is the author; otherwise the host records it.
  function authored(child: SessionID, seat: string, blocks: readonly string[], model: string | undefined) {
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
        messageID: info.id, type: "text", text: block, time: { start: now, end: now } } satisfies SessionV1.TextPart))
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

/** The seat a plugin-scoped subagent type names, from the registry; anything else is a HOLD. */
function resolve(subagentType: string) {
  return Effect.gen(function* () {
    const route = lookupRouteGrant(subagentType.slice(PREFIX.length))
    if (route.status === "HOLD") return yield* refuse(`HOLD: ${subagentType} is not an Orchestra seat (${route.reason}).`)
    const seat = Seats.find(route.grant.memberId)
    if (!seat) return yield* refuse(`HOLD: ${subagentType} is not an Orchestra seat (unknown-member-id).`)
    return seat
  })
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
