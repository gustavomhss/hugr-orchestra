export * as ClaudeCodeHost from "./host"

import type { AgentDefinition, CanUseTool, HookCallback, PermissionResult, SDKMessage } from "@anthropic-ai/claude-agent-sdk"
import type { Host } from "@orchestra/core/host"
import { makeLocationNode } from "@orchestra/core/effect/app-node"
import { ExecutionHost } from "@orchestra/core/session/runner"
import { LLMEvent } from "@orchestra/llm"
import { Duration, Effect, Layer, Stream } from "effect"
import { createHash, randomUUID } from "node:crypto"
import path from "node:path"
import { ClaudeCodeAccount } from "@orchestra/core/claude-code-account"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { ResearchSeatTools } from "@orchestra/core/research/seat-tools"
import { Research } from "@orchestra/schema/research"
import { ClaudeHostOptions } from "../host/options"
import { ClaudeCodeSDK } from "../sdk"
import { ClaudeCodeTranscript } from "../transcript"
import { ClaudeCodeAccountV2 } from "./account"
import { ClaudeCodeCatalog } from "./catalog"
import { ClaudeCodeChannel } from "./channel"
import { ClaudeCodeOutput } from "./output"
import { ClaudeCodeRecord } from "./record"

export const ID = "claude-code"
/** The legacy `session.metadata` key (`host/session.ts`), so legacy Claude-hosted sessions resume on V2. */
export const STATE_KEY = "claudeCode"
/** The in-process MCP server that serves the Location's Orchestra tools to Claude Code. */
export const MCP_SERVER = "orchestra"
const MCP_PREFIX = `mcp__${MCP_SERVER}__`

/** Orchestra tools Claude Code has as built-ins, or that belong to Orchestra's own loop: never served. */
const UNSERVED = new Set(["bash", "read", "write", "edit", "apply_patch", "grep", "glob", "webfetch", "websearch", "todowrite", "question", "skill", "lsp", "invalid", "context_compact", "execute"])

const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const
/** The prefix of a seat's subagent name, as the V1 `orchestra` plugin named them. */
const SEAT_PREFIX = "orchestra:"
/** Seat prompt text that describes Orchestra's own loop, and its Claude Code equivalent. */
const LOOP_TEXT = [["the task delegation tool", "the Agent delegation tool"]] as const
const QUESTION_DISMISSED = "The owner dismissed this question."
/** A finished background task's process stays up this long waiting for the task to report; then it is let go. */
const BACKGROUND_PATIENCE = Duration.minutes(30)
const UNCHECKED = "Orchestra could not check this call, so it is refused."
/** A subagent other than a seat's would act as the main agent, with its permissions. */
const MAIN_ONLY = "Orchestra's tools serve the main agent and Orchestra's seats only."
const SEAT_ONLY = "This Orchestra tool belongs to a seat: delegate the work to that seat."
/** Claude Code defers MCP tools behind this one; it only loads their schemas, so every call to it is allowed. */
const TOOL_SEARCH = "ToolSearch"
/**
 * Claude Code built-ins that reach past this query: other Claude sessions on the machine (`ListAgents`,
 * `SendMessage`), the account's cloud routines (`RemoteTrigger`) and the owner's phone (`PushNotification`). An
 * Orchestra session never sees or drives what lies outside it.
 */
const HOST_REACH = new Set(["ListAgents", "SendMessage", "RemoteTrigger", "PushNotification"])
const OUTSIDE = "This Claude Code tool reaches outside the Orchestra session, so Orchestra refuses it."

/** One gate decision, shared by the PreToolUse hook and `canUseTool` so both settle a call the same way. */
type Decision = { readonly allow: true; readonly input?: Record<string, unknown> } | { readonly allow: false; readonly reason: string }

/** How a Claude Code built-in maps to a V2 permission: its action and the input field that names the resource. */
const PERMISSIONS: Readonly<Record<string, { action: string; field: string; path?: boolean }>> = {
  Bash: { action: "bash", field: "command" },
  Read: { action: "read", field: "file_path", path: true },
  Write: { action: "edit", field: "file_path", path: true },
  Edit: { action: "edit", field: "file_path", path: true },
  MultiEdit: { action: "edit", field: "file_path", path: true },
  NotebookEdit: { action: "edit", field: "notebook_path", path: true },
  Glob: { action: "glob", field: "pattern" },
  Grep: { action: "grep", field: "pattern" },
  WebFetch: { action: "webfetch", field: "url" },
  WebSearch: { action: "websearch", field: "query" },
}

/**
 * One Claude Code SDK turn (prompt sent → `result` frame) is one provider turn of the V2 runner. Claude Code keeps its
 * own prompt, tools, login, loop and context window; its tool calls surface as provider-executed events and every API
 * message of the turn collapses into the turn's single assistant message. The next turn resumes the same Claude Code
 * session, sending only the owner's messages it has not delivered yet.
 */
export const make = Effect.gen(function* () {
  const sdk = yield* ClaudeCodeSDK.Service
  const env = yield* ClaudeCodeSDK.Environment
  // Queries kept alive past their turn because background work still runs: one per Orchestra session, closed when
  // that work reports, when the session's next turn starts, or when it has waited long enough.
  const tails = new Map<string, { readonly close: () => Promise<void> }>()
  return {
    id: ID,
    stateKey: STATE_KEY,
    stream: (turn) =>
      Stream.unwrap(
        Effect.gen(function* () {
          // A session has one Claude Code process at a time: a query left up for background work goes first.
          yield* Effect.promise(() => tails.get(turn.session.id)?.close() ?? Promise.resolve())
          const stored = yield* turn.state.get
          const state = ClaudeCodeTranscript.record(stored) ? stored : {}
          const delivered = Array.isArray(state.delivered) ? state.delivered.filter((id) => typeof id === "string") : []
          const pending = turn.history.flatMap((message) =>
            message.type === "user" && !delivered.includes(message.id) ? [message] : [],
          )
          const prompt = pending.map((message) => message.text).join("\n\n").trim()
          if (!prompt) return Stream.make(LLMEvent.stepStart({ index: 0 }), LLMEvent.stepFinish({ index: 0, reason: "stop" }))
          const abort = new AbortController()
          // `handed`: Claude Code took the prompt from its input. Its transcript then holds the prompt, so a turn that
          // stops or breaks before its result must not send it again. Only a result that answered nothing (signed out,
          // billing) leaves the prompt to be sent again.
          const progress = { handed: false, answered: false, resulted: false }
          const served = [...turn.tools, ...turn.seatOnly].filter((tool) => !UNSERVED.has(tool.name))
          const seatOnly = new Set(turn.seatOnly.map((tool) => tool.name))
          const agents = subagents(turn.seats, turn.skills, served.map((tool) => tool.name), turn.seatTools)
          // The Context Epoch baseline and workflow instructions go in once per change, beside the prompt.
          const contextText = turn.context.filter(Boolean).join("\n\n")
          const contextHash = contextText ? createHash("sha256").update(contextText).digest("hex") : undefined
          const context = { sent: false }
          // Main-agent Orchestra calls learned at the gate, in order per tool: the fallback when an MCP request has no `_meta` id.
          const callIDs = new Map<string, string[]>()
          const learned = new Set<string>()
          // A seat's subagent calling an Orchestra tool: its tool_use id to the delegation's call, whose child settles it.
          const inside = new Map<string, { readonly parent: string; readonly name: string }>()
          const callID = (name: string, toolUseID: string | undefined) => {
            if (toolUseID) {
              callIDs.set(name, (callIDs.get(name) ?? []).filter((id) => id !== toolUseID))
              return learned.has(toolUseID) || inside.has(toolUseID) ? toolUseID : undefined
            }
            // Without the id, a subagent's pending call of the same tool makes the order ambiguous: refuse.
            if ([...inside.values()].some((call) => call.name === name)) return undefined
            return callIDs.get(name)?.shift() ?? `orchestra_${randomUUID()}`
          }
          const delegated: ExecutionHost.Turn["execute"] = (call) => {
            const within = inside.get(call.id)
            if (!within) return turn.execute(call)
            inside.delete(call.id)
            const ended = { result: { type: "error" as const, value: "The subagent's delegation has ended." } }
            return open(within.parent).pipe(Effect.flatMap((child) => (child ? child.execute(call) : Effect.succeed(ended))))
          }
          // A call is settled once, whichever of the hook and `canUseTool` asks first: asking twice would ask the owner
          // twice and charge a dispatch twice.
          const decisions = new Map<string, Promise<Decision>>()
          // `agentType` is set only for a call made inside a subagent (`""` when its type is unknown).
          const decide = (tool: string, input: Record<string, unknown>, toolUseID: string, signal: AbortSignal, agentType?: string, agentID?: string) => {
            const known = decisions.get(toolUseID)
            if (known) return known
            // Never rejects: a defect, a throw or an abort in Orchestra's own check refuses the call (fail closed).
            const made = Promise.resolve()
              .then((): Decision | Promise<Decision> => {
                // An agent whose rules deny `*` still reaches the Orchestra tools it holds, which sit behind ToolSearch.
                if (tool === TOOL_SEARCH) return { allow: true }
                if (HOST_REACH.has(tool)) return { allow: false, reason: OUTSIDE }
                if (tool.startsWith(MCP_PREFIX)) {
                  const name = tool.slice(MCP_PREFIX.length)
                  if (agentType !== undefined) {
                    // Claude Code's task id is the subagent's agent id; the delegation it names must be a seat's.
                    const parent = agentID === undefined ? undefined : started.get(agentID)
                    if (!parent || tasks.get(parent)?.seat === undefined) return { allow: false, reason: MAIN_ONLY }
                    inside.set(toolUseID, { parent, name })
                    return { allow: true }
                  }
                  if (seatOnly.has(name)) return { allow: false, reason: SEAT_ONLY }
                  if (!learned.has(toolUseID)) callIDs.set(name, [...(callIDs.get(name) ?? []), toolUseID])
                  learned.add(toolUseID)
                  // The registry settles the Orchestra tool's own permissions when the runner executes it.
                  return { allow: true }
                }
                // A call made inside a seat's subagent is checked under that seat's own permission rules.
                const seat = agentType === undefined ? undefined : ClaudeCodeRecord.seat(agentType, agents)
                const asked = ClaudeCodeRecord.SUBAGENT_TOOLS.has(tool) ? delegation(input, agents) : undefined
                if (asked && "allow" in asked) return asked
                return Effect.runPromise(
                  turn.authorize({
                    callID: toolUseID,
                    tool,
                    ...(asked ?? { ...permission(tool, input, turn.session.location.directory), safety: safetyCall(tool, input) }),
                    ...(seat ? { agent: seat } : {}),
                  }).pipe(
                    Effect.map((authorization): Decision => ({ allow: true, input: replacements(tool, authorization) })),
                    Effect.catch((error) => Effect.succeed<Decision>({ allow: false, reason: denial(error, asked !== undefined) })),
                  ),
                  { signal },
                )
              })
              .catch((): Decision => ({ allow: false, reason: UNCHECKED }))
            decisions.set(toolUseID, made)
            return made
          }
          // AskUserQuestion shows the owner's question and returns the answers Claude Code reads from `answers`.
          const ask = (input: Record<string, unknown>, toolUseID: string, signal: AbortSignal): Promise<PermissionResult> => {
            const asked = questions(input)
            return Effect.runPromise(
              turn.question({ callID: toolUseID, questions: asked }).pipe(
                Effect.map((answers): PermissionResult => ({
                  behavior: "allow",
                  updatedInput: { ...input, answers: Object.fromEntries(asked.map((item, index) => [item.question, (answers[index] ?? []).join(", ")])) },
                })),
                Effect.catch(() => Effect.succeed<PermissionResult>({ behavior: "deny", message: QUESTION_DISMISSED })),
              ),
              { signal },
            ).catch((): PermissionResult => ({ behavior: "deny", message: UNCHECKED }))
          }
          // Claude Code skips `canUseTool` whenever a settings allow rule matches, while a PreToolUse deny wins in every
          // permission mode: the hook is where Orchestra's permissions reach every call (the legacy gate.ts, spike S7).
          const gate: HookCallback = (input, _toolUseID, options) => {
            if (input.hook_event_name !== "PreToolUse") return Promise.resolve({})
            // The question needs the owner, so it is left to `canUseTool`, where its answers can be returned.
            if (input.tool_name === "AskUserQuestion") return Promise.resolve({})
            const args = ClaudeCodeTranscript.record(input.tool_input) ? input.tool_input : {}
            const agentType = input.agent_id === undefined ? undefined : (input.agent_type ?? "")
            return decide(input.tool_name, args, input.tool_use_id, options.signal, agentType, input.agent_id).then((decision) => ({
              hookSpecificOutput: decision.allow
                ? {
                    hookEventName: "PreToolUse" as const,
                    permissionDecision: "allow" as const,
                    ...(decision.input ? { updatedInput: { ...args, ...decision.input } } : {}),
                  }
                : { hookEventName: "PreToolUse" as const, permissionDecision: "deny" as const, permissionDecisionReason: decision.reason },
            }))
          }
          const canUseTool: CanUseTool = (tool, input, options) => {
            if (tool === "AskUserQuestion") return ask(input, options.toolUseID, options.signal)
            return decide(tool, input, options.toolUseID, options.signal, options.agentID === undefined ? undefined : "", options.agentID).then((decision) =>
              decision.allow ? { behavior: "allow" as const, updatedInput: { ...input, ...decision.input } } : { behavior: "deny" as const, message: decision.reason },
            )
          }
          // Claude Code's documented channel for context beside a prompt. Sent when it changed since the Claude Code
          // session last received it, once per turn.
          const prompted: HookCallback = (input) => {
            if (input.hook_event_name !== "UserPromptSubmit" || context.sent || !contextHash || contextHash === state.contextHash)
              return Promise.resolve({})
            context.sent = true
            return Promise.resolve({ hookSpecificOutput: { hookEventName: "UserPromptSubmit" as const, additionalContext: contextText } })
          }
          // What Orchestra keeps beyond Claude Code's own summary comes back right after a compaction, with the context
          // the summary may have dropped; the summary itself is archived in the session. A failure here never fails the turn.
          const recall: HookCallback = (input, _toolUseID, options) => {
            if (input.hook_event_name !== "SessionStart" || input.source !== "compact") return Promise.resolve({})
            return Effect.runPromise(turn.memory.recall, { signal: options.signal }).then(
              (text) => text,
              () => undefined,
            ).then((text) => {
              const joined = [contextText, text].filter(Boolean).join("\n\n")
              return joined ? { hookSpecificOutput: { hookEventName: "SessionStart" as const, additionalContext: joined } } : {}
            })
          }
          const archive: HookCallback = (input, _toolUseID, options) => {
            if (input.hook_event_name !== "PostCompact") return Promise.resolve({})
            return Effect.runPromise(
              turn.memory.archive({ summary: input.compact_summary, trigger: input.trigger, nativeSessionID: input.session_id }),
              { signal: options.signal },
            ).then(() => ({}), () => ({}))
          }
          // The client uuid of this turn's prompt: Claude Code stamps it on the replies once it has consumed the prompt.
          const sent = randomUUID()
          // Steers that arrive while the query runs go into its input; the uuid says which one Claude Code consumed.
          const steered = new Map<string, string>()
          const consumed = new Set<string>()
          // An assistant-level error (billing, rate limit, ...) fails the turn unless a later frame supersedes it.
          const failure: { uuid?: string; message?: string } = {}
          const deliver = (sessionId: string) =>
            turn.state.update((value) => ({
              ...(ClaudeCodeTranscript.record(value) ? value : {}),
              sessionId,
              delivered: [...new Set([...delivered, ...pending.map((item) => item.id), ...consumed])],
              ...(context.sent ? { contextHash } : {}),
            }))
          // The reasoning picker's level, when it is one Claude Code accepts.
          const effort = EFFORTS.find((level) => level === turn.model?.variant)
          const lifetime = ClaudeCodeSDK.processLifetime({
            cwd: turn.session.location.directory,
            ...(turn.model?.providerID === "anthropic" ? { model: turn.model.id } : {}),
            ...(effort ? { effort } : {}),
            ...(typeof state.sessionId === "string" ? { resume: state.sessionId } : { sessionId: claudeSessionID(turn.session.id) }),
            // Claude mode appends a short Orchestra note to Claude Code's own prompt and never replaces it (AGENTS:
            // claude_code preset); the seat's full Orchestra prompt stays out of it.
            systemPrompt: {
              type: "preset",
              preset: "claude_code",
              append: ClaudeHostOptions.append(turn.agent.id, Object.fromEntries(Object.entries(agents).map(([name, item]) => [name, item.seat]))),
            },
            settingSources: ["project"],
            permissionMode: "default",
            canUseTool,
            hooks: {
              PreToolUse: [{ hooks: [gate] }],
              UserPromptSubmit: [{ hooks: [prompted] }],
              SessionStart: [{ matcher: "compact", hooks: [recall] }],
              PostCompact: [{ hooks: [archive] }],
            },
            ...(Object.keys(agents).length
              ? { agents: Object.fromEntries(Object.entries(agents).map(([name, item]) => [name, item.definition])) }
              : {}),
            ...(served.length
              ? { mcpServers: { [MCP_SERVER]: ClaudeCodeChannel.server(MCP_SERVER, served, callID, delegated) } }
              : {}),
            env: ClaudeHostOptions.environment(env),
            abortController: abort,
          })
          // The SDK asks for the next input message only after it wrote the previous one to Claude Code.
          const channel = ClaudeCodeChannel.inbox(ClaudeCodeChannel.user(prompt, sent), abort.signal, (uuid) => {
            if (uuid === sent) progress.handed = true
          })
          // Background work Claude Code still has running when the turn's result arrives keeps the process up.
          const live = { background: 0, keep: false }
          const query = yield* Effect.acquireRelease(
            // Streaming input, which in-process MCP servers need and which carries mid-turn steers; the turn ends at
            // the `result` frame and the finalizer closes the input with the query.
            Effect.sync(() => sdk.query({ prompt: channel.messages, options: lifetime.options })),
            (opened) => {
              let closing: Promise<void> | undefined
              const close = () =>
                (closing ??= (async () => {
                  abort.abort()
                  await lifetime.join().catch(() => undefined)
                  if (tails.get(turn.session.id) === entry) tails.delete(turn.session.id)
                })())
              const entry = { close }
              // A taken prompt that was answered, or whose turn ended without a result, is in Claude Code's transcript.
              const settle = Effect.suspend(() =>
                progress.handed && (progress.answered || !progress.resulted)
                  ? turn.state.update((value) => {
                      const record = ClaudeCodeTranscript.record(value) ? value : {}
                      const prior = Array.isArray(record.delivered) ? record.delivered : []
                      return {
                        ...record,
                        delivered: [...new Set([...prior, ...pending.map((item) => item.id), ...consumed])],
                        ...(context.sent ? { contextHash } : {}),
                      }
                    })
                  : Effect.void,
              )
              if (!live.keep) return Effect.promise(close).pipe(Effect.andThen(settle))
              tails.set(turn.session.id, entry)
              // A background subagent's child Session stays open while the process waits for it, and ends with it.
              return settle.pipe(
                Effect.andThen(
                  follow(opened[Symbol.asyncIterator](), live, turn, { mirror, end, mark }).pipe(
                    Effect.timeout(BACKGROUND_PATIENCE),
                    Effect.ignore,
                    Effect.ensuring(Effect.forEach([...children.keys()], end, { discard: true }).pipe(Effect.andThen(Effect.promise(close)))),
                    Effect.forkDetach,
                  ),
                ),
                Effect.asVoid,
              )
            },
          )
          yield* turn.steers.pipe(
            Stream.runForEach((steer) =>
              Effect.sync(() => {
                const uuid = randomUUID()
                steered.set(uuid, steer.id)
                channel.push(ClaudeCodeChannel.user(steer.text, uuid))
              }),
            ),
            Effect.forkScoped,
          )
          const names = new Map<string, string>()
          const created = new Map<string, ClaudeCodeRecord.ChecklistItem>()
          const todos = new Map<string, unknown>()
          const tasks = new Map<string, Delegation>()
          // Claude Code's task id for each delegation's call, to find the call a later task update names.
          const started = new Map<string, string>()
          // Claude Code's task list outlives a turn, so the copy that fills the todo panel is kept in host state.
          const checklist: ClaudeCodeRecord.Checklist = { items: ClaudeCodeRecord.items(state.checklist), changed: false }
          // The child Session mirroring each running subagent, opened on its first frame. A closed one takes no more.
          const children = new Map<string, Effect.Success<ReturnType<typeof turn.child>> & { readonly tracker: Tracker }>()
          const closed = new Set<string>()
          const tracker = (): Tracker => ({ names: new Map(), todos: new Map(), tasks: new Map(), checklist: { items: [], changed: false }, created: new Map(), seats: agents, failure: {}, emitted: new Map(), model: undefined })
          // The child runs on the model that answered in the subagent, else its seat's model, else the turn's.
          const open = (callID: string, model?: string) =>
            Effect.gen(function* () {
              const task = tasks.get(callID)
              if (!task || closed.has(callID)) return undefined
              const known = children.get(callID)
              if (known) return known
              const defined = Object.values(agents).find((item) => item.seat === task.seat)?.definition.model
              const name = model ?? (defined === "inherit" ? undefined : defined)
              const child = yield* turn.child({
                callID,
                agent: task.seat ?? turn.agent.id,
                title: task.title,
                prompt: task.prompt,
                ...(name ? { model: { id: ModelV2.ID.make(name), providerID: ProviderV2.ID.anthropic } } : {}),
              })
              yield* child.publish(LLMEvent.stepStart({ index: 0 }))
              const entry = { ...child, tracker: tracker() }
              children.set(callID, entry)
              return entry
            })
          const mirror = (callID: string, message: SDKMessage & { readonly type: "assistant" | "user" }) =>
            Effect.gen(function* () {
              // The subagent's own prompt comes first; the child opens on its first reply, which names its model.
              if (message.type === "user" && !children.has(callID)) return
              const child = yield* open(callID, message.type === "assistant" ? message.message.model : undefined)
              if (!child) return
              const settled = yield* ClaudeCodeOutput.settle(events({ ...message, parent_tool_use_id: null }, child.tracker), message, { todos: child.tracker.todos, write: child.todos, directory: turn.session.location.directory })
              yield* Effect.forEach(settled, child.publish, { discard: true })
            })
          // Claude Code can move a running delegation to the background; its result then no longer ends the subagent.
          const mark = (message: SDKMessage) => {
            if (message.type !== "system") return
            const callID = message.subtype === "task_started" && message.is_backgrounded ? message.tool_use_id
              : message.subtype === "task_updated" && message.patch.is_backgrounded ? started.get(message.task_id) : undefined
            if (message.subtype === "task_started" && message.tool_use_id) started.set(message.task_id, message.tool_use_id)
            const task = callID ? tasks.get(callID) : undefined
            if (callID && task) tasks.set(callID, { ...task, background: true })
          }
          const end = (callID: string) =>
            Effect.gen(function* () {
              closed.add(callID)
              const open = children.get(callID)
              if (!open) return
              children.delete(callID)
              yield* open.publish(LLMEvent.stepFinish({ index: 0, reason: "stop" }))
              yield* open.finish
            })
          // What a stopped or failed turn leaves running is settled with it.
          // A background subagent that outlives the turn stays open: `follow` mirrors and ends it.
          yield* Effect.addFinalizer(() =>
            Effect.forEach([...children.keys()].filter((id) => !live.keep || tasks.get(id)?.background !== true), end, { discard: true }),
          )
          // Block ids by assistant message, for the retract a refusal fallback or a superseding reply asks for.
          const emitted = new Map<string, string[]>()
          // The iterator is pulled through a view without `return`: stopping at the result must not close the query.
          const iterator = query[Symbol.asyncIterator]()
          const pulled: AsyncIterable<SDKMessage> = { [Symbol.asyncIterator]: () => ({ next: () => iterator.next() }) }
          const frames = Stream.fromAsyncIterable(pulled, (error) => error).pipe(
            Stream.takeUntil((message) => message.type === "result"),
            Stream.mapEffect((message) =>
              Effect.gen(function* () {
                // A subagent's frames are its child Session's, never the parent's.
                if ((message.type === "assistant" || message.type === "user") && message.parent_tool_use_id !== null) {
                  yield* mirror(message.parent_tool_use_id, message)
                  return []
                }
                mark(message)
                // A delegation's result ends its subagent. A background one reports later: its child opens before the
                // result is recorded, so the task row links to it, and stays open for the frames still to come.
                if (message.type === "user" && Array.isArray(message.message.content))
                  yield* Effect.forEach(
                    message.message.content.flatMap((block) => (block.type === "tool_result" && tasks.has(block.tool_use_id) ? [block.tool_use_id] : [])),
                    (id) => (tasks.get(id)?.background ? Effect.asVoid(open(id)) : end(id)),
                    { discard: true },
                  )
                if (message.type === "assistant" && !message.error)
                  progress.answered = true
                if (message.type === "result") progress.resulted = true
                if (message.type === "system" && message.subtype === "init")
                  yield* turn.state.update((value) => ({ ...(ClaudeCodeTranscript.record(value) ? value : {}), sessionId: message.session_id }))
                if (message.type === "system" && message.subtype === "background_tasks_changed")
                  live.background = message.tasks.filter((task) => !task.ambient).length
                // A prompt Claude Code consumed is in its transcript: an interrupted turn must not send it again.
                if (message.type === "assistant" && message.parent_tool_use_id === null && !message.error) {
                  const echoed = message.user_message_uuids ?? (message.user_message_uuid ? [message.user_message_uuid] : [])
                  const steers = echoed.flatMap((uuid) => steered.get(uuid) ?? [])
                  steers.forEach((id) => consumed.add(id))
                  if (echoed.includes(sent) || steers.length) yield* deliver(message.session_id)
                  yield* Effect.forEach(steers, turn.consumed, { discard: true })
                }
                if (message.type === "result" && message.subtype === "success" && !message.is_error && failure.message === undefined) {
                  yield* deliver(message.session_id)
                  live.keep = live.background > 0
                }
                const settled = yield* ClaudeCodeOutput.settle(events(message, { names, todos, tasks, checklist, created, seats: agents, failure, emitted, model: turn.model?.id }), message, { todos, write: turn.todos, directory: turn.session.location.directory })
                if (checklist.changed) {
                  checklist.changed = false
                  yield* turn.state.update((value) => ({ ...(ClaudeCodeTranscript.record(value) ? value : {}), checklist: checklist.items }))
                }
                return settled
              }),
            ),
            Stream.flatMap((items) => Stream.fromIterable(items)),
            // A stream that ends on an assistant error without its `result` still fails the turn.
            Stream.concat(Stream.suspend(() =>
              failure.message === undefined ? Stream.empty : Stream.make(LLMEvent.providerError({ message: failure.message })),
            )),
            // A Claude Code process failure is the turn's provider error, never a retry (ClaudeCodeSDK).
            Stream.catch((error) =>
              Stream.make(LLMEvent.providerError({ message: error instanceof Error ? error.message : String(error) })),
            ),
          )
          return Stream.concat(Stream.make(LLMEvent.stepStart({ index: 0 })), frames)
        }),
      ),
  } satisfies ExecutionHost.Interface
})

/** Replaces the empty ExecutionHost registry with one holding the Claude Code host. */
export const node = makeLocationNode({
  service: ExecutionHost.Service,
  layer: Layer.effect(ExecutionHost.Service, make.pipe(Effect.map((host) => ExecutionHost.of([host])))),
  deps: [ClaudeCodeSDK.node],
})

export const contribution: Host.Contribution = {
  id: "engine-claude-code",
  replacements: [
    [ExecutionHost.node, node],
    // The app's Claude mode settings read the binary's sign-in and start its login through the server's account routes.
    [ClaudeCodeAccount.node, ClaudeCodeAccountV2.node],
  ],
  // In Claude mode the model picker lists Anthropic's models even with no API key: Claude Code holds the login.
  references: ClaudeCodeCatalog.layer,
}

type Delegation = {
  readonly seat: ReturnType<typeof subagents>[string]["seat"] | undefined
  readonly title: string
  readonly prompt: string
  readonly background: boolean
}

type Tracker = {
  readonly names: Map<string, string>
  /** Each TodoWrite call's list, recorded as its result and the Session's todos so the widget and panel show it. */
  readonly todos: Map<string, unknown>
  /** Claude Code's task list (TaskCreate, TaskUpdate), recorded as the todo list Orchestra's todo tool keeps. */
  readonly checklist: ClaudeCodeRecord.Checklist
  /** The entry each TaskCreate call added, which takes its id from the call's result. */
  readonly created: Map<string, ClaudeCodeRecord.ChecklistItem>
  /** Each delegation's seat and brief, to open the child Session that mirrors its subagent. */
  readonly tasks: Map<string, Delegation>
  /** The turn's seat subagents, to name a delegation's seat as Orchestra's task tool would. */
  readonly seats: ReturnType<typeof subagents>
  readonly failure: { uuid?: string; message?: string }
  /** Block and call ids emitted for each main-thread assistant message, so a superseded message can be retracted. */
  readonly emitted: Map<string, string[]>
  /** The model the turn runs on, to pick its entry out of the per-model usage Claude Code reports. */
  readonly model: string | undefined
}

/** Maps one main-thread SDK frame to runner events; a subagent's frames go to its child Session (`mirror`). */
function events(message: SDKMessage, tracker: Tracker): LLMEvent[] {
  const { names, failure, emitted } = tracker
  if (message.type === "assistant" && message.supersedes?.some((uuid) => uuid === failure.uuid)) failure.message = undefined
  if (message.type === "system" && message.subtype === "model_refusal_fallback" &&
    message.retracted_message_uuids?.some((uuid) => uuid === failure.uuid)) failure.message = undefined
  // What the engine replaced is retracted: a refusal fallback names the messages it retracts, a reply the ones it supersedes.
  const replaced = message.type === "assistant" ? message.supersedes : message.type === "system" && message.subtype === "model_refusal_fallback" ? message.retracted_message_uuids : undefined
  const retracted = (replaced ?? []).flatMap((uuid) => {
    const ids = emitted.get(uuid)
    emitted.delete(uuid)
    return ids ?? []
  })
  const retract = retracted.length ? [LLMEvent.retract({ ids: retracted })] : []
  if (message.type === "assistant" && message.parent_tool_use_id === null && message.error) {
    const text = message.message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("\n") || message.error
    failure.uuid = message.uuid
    failure.message = ClaudeCodeSDK.signedOut(message) ? ClaudeCodeSDK.SIGNED_OUT : (ClaudeCodeSDK.billingRejection(text) ?? text)
    return retract
  }
  if (message.type === "assistant" && message.parent_tool_use_id === null) {
    const ids: string[] = []
    const blocks = message.message.content.flatMap((block, index): LLMEvent[] => {
      const id = `${message.uuid}:${index}`
      if (block.type === "text") {
        ids.push(id)
        return [LLMEvent.textStart({ id }), LLMEvent.textDelta({ id, text: block.text }), LLMEvent.textEnd({ id })]
      }
      if (block.type === "thinking") {
        ids.push(id)
        return [LLMEvent.reasoningStart({ id }), LLMEvent.reasoningDelta({ id, text: block.thinking }), LLMEvent.reasoningEnd({ id })]
      }
      // Orchestra tools are recorded by the runner through `turn.execute`, never by the host. A call left off the record
      // has no name in `names`, so its result is left off too.
      if (block.type !== "tool_use" || block.name.startsWith(MCP_PREFIX) || ClaudeCodeRecord.UNRECORDED.has(block.name)) return []
      const listed = ClaudeCodeRecord.TASK_LIST_TOOLS.has(block.name) ? ClaudeCodeRecord.checklist(block.id, block.name, block.input, tracker.checklist, tracker.created) : undefined
      const call = listed ? { name: "todowrite", input: { todos: listed }, todos: listed } : ClaudeCodeRecord.shown(block.name, block.input, tracker.seats)
      names.set(block.id, call.name)
      if (call.name === "todowrite") tracker.todos.set(block.id, call.todos)
      if ("task" in call && call.task) tracker.tasks.set(block.id, call.task)
      ids.push(block.id)
      return [LLMEvent.toolCall({ id: block.id, name: call.name, input: call.input, providerExecuted: true })]
    })
    emitted.set(message.uuid, ids)
    return [...retract, ...blocks]
  }
  if (message.type === "system" && message.subtype === "model_refusal_fallback") return retract
  if (message.type === "user" && message.parent_tool_use_id === null && Array.isArray(message.message.content))
    return message.message.content.flatMap((block): LLMEvent[] => {
      if (block.type !== "tool_result") return []
      const name = names.get(block.tool_use_id)
      if (!name) return []
      const added = tracker.created.get(block.tool_use_id)
      if (added) ClaudeCodeRecord.assign(added, block.is_error === true, message.tool_use_result, tracker.checklist)
      const listed = tracker.todos.get(block.tool_use_id)
      const text = listed !== undefined && !block.is_error
        ? JSON.stringify({ todos: listed })
        : typeof block.content === "string"
          ? block.content
          : (block.content ?? []).flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n")
      return [LLMEvent.toolResult({
        id: block.tool_use_id,
        name,
        result: block.is_error ? { type: "error", value: text } : { type: "text", value: text },
        providerExecuted: true,
      })]
    })
  if (message.type !== "result") return []
  const pending = failure.message
  failure.message = undefined
  if (pending !== undefined) return [LLMEvent.providerError({ message: pending })]
  if (message.subtype !== "success" || message.is_error) {
    const detail = message.subtype === "success" ? message.result : [message.subtype, ...message.errors].join(": ")
    return [LLMEvent.providerError({ message: ClaudeCodeSDK.billingRejection(detail) ?? detail })]
  }
  return [LLMEvent.stepFinish({
    index: 0,
    reason: "stop",
    usage: {
      nonCachedInputTokens: message.usage.input_tokens,
      cacheReadInputTokens: message.usage.cache_read_input_tokens,
      cacheWriteInputTokens: message.usage.cache_creation_input_tokens,
      inputTokens: message.usage.input_tokens + message.usage.cache_read_input_tokens + message.usage.cache_creation_input_tokens,
      outputTokens: message.usage.output_tokens,
      // What Claude Code billed for the turn (this process is the turn's), and the window of the model that answered.
      ...(Number.isFinite(message.total_cost_usd) && message.total_cost_usd >= 0 ? { cost: message.total_cost_usd } : {}),
      ...contextWindow(message.modelUsage, tracker.model),
    },
  })]
}

/** The context window of the main model in Claude Code's per-model usage: the named model, else the busiest one. */
function contextWindow(usage: Record<string, { readonly contextWindow: number; readonly inputTokens: number; readonly outputTokens: number }> | undefined, model: string | undefined) {
  const entries = Object.entries(usage ?? {})
  const main = entries.find(([id]) => model !== undefined && id.startsWith(model)) ??
    entries.toSorted((a, b) => b[1].inputTokens + b[1].outputTokens - (a[1].inputTokens + a[1].outputTokens))[0]
  return main && Number.isFinite(main[1].contextWindow) && main[1].contextWindow > 0 ? { contextWindow: main[1].contextWindow } : {}
}

/**
 * Frames a query produces after its turn's result, while background work runs: a finished task reaches the session as
 * a steer prompt, so the model hears of it (the turn that answers resumes this Claude Code session, which first
 * closes this process). Reads until the work is gone, the query ends, or the host stops waiting.
 */
function follow(
  iterator: AsyncIterator<SDKMessage>,
  live: { background: number },
  turn: ExecutionHost.Turn,
  subagent: {
    readonly mirror: (callID: string, message: SDKMessage & { readonly type: "assistant" | "user" }) => Effect.Effect<void>
    readonly end: (callID: string) => Effect.Effect<void>
    readonly mark: (message: SDKMessage) => void
  },
) {
  return Effect.gen(function* () {
    while (live.background > 0) {
      const next = yield* Effect.promise(() => iterator.next())
      if (next.done) return
      const message = next.value
      subagent.mark(message)
      if ((message.type === "assistant" || message.type === "user") && message.parent_tool_use_id !== null)
        yield* subagent.mirror(message.parent_tool_use_id, message)
      if (message.type === "system" && message.subtype === "background_tasks_changed")
        live.background = message.tasks.filter((task) => !task.ambient).length
      if (message.type === "system" && message.subtype === "task_notification") {
        if (message.tool_use_id) yield* subagent.end(message.tool_use_id)
        yield* turn.notify({
          id: `msg_${turn.session.id}_task_${message.task_id}_${message.status}`,
          text: `Background task ${message.task_id} ${message.status}: ${message.summary}\nOutput: ${message.output_file}`,
        })
        return
      }
    }
  })
}

/**
 * Orchestra's seats as Claude Code subagents `orchestra:<id>`; the research seat is one per tier, with its budget. A
 * seat's skills are listed in its prompt by file: the subagent reads one when the task matches, as Orchestra's skill
 * tool would load it. Of the turn's Orchestra tools (`orchestra`), a subagent keeps those its seat may call
 * (`seatTools`); the rest are kept off its tool list.
 */
function subagents(seats: ExecutionHost.Turn["seats"], skills: ExecutionHost.Turn["skills"], orchestra: ReadonlyArray<string>, seatTools: ExecutionHost.Turn["seatTools"]) {
  return Object.fromEntries(
    seats.flatMap((seat): Array<readonly [string, { seat: typeof seat.id; definition: AgentDefinition }]> => {
      if (!seat.system) return []
      const listed = skills[seat.id] ?? []
      const kept = orchestra.filter((name) => !seatTools[seat.id]?.includes(name)).map((name) => `${MCP_PREFIX}${name}`)
      const definition: AgentDefinition = {
        description: seat.description ?? `Orchestra's \`${seat.id}\` seat.`,
        prompt: [
          LOOP_TEXT.reduce((text, [from, to]) => text.replaceAll(from, to), seat.system),
          ...(listed.length > 0
            ? [
                [
                  "# Skills",
                  "Each skill is a procedure for one kind of work. When the task matches one, read its file with the Read tool before you start, then follow it.",
                  ...listed.map((skill) => `- \`${skill.name}\`, ${skill.location}${skill.description ? `: ${skill.description}` : ""}`),
                ].join("\n"),
              ]
            : []),
        ].join("\n\n"),
        model: seat.model?.providerID === "anthropic" ? seat.model.id : "inherit",
        // Tools the seat may not call; the child's registry refuses them all the same.
        ...(kept.length > 0 ? { disallowedTools: kept } : {}),
      }
      if (seat.id !== ResearchSeatTools.SEAT) return [[`${SEAT_PREFIX}${seat.id}`, { seat: seat.id, definition }]]
      return Research.Depth.literals.map((tier) => [
        `${SEAT_PREFIX}${seat.id}-${tier}`,
        {
          seat: seat.id,
          definition: {
            ...definition,
            description: `${definition.description} Research tier ${tier}: up to ${Research.Tiers[tier].providerCalls} turns.`,
            maxTurns: Research.Tiers[tier].providerCalls,
            tools: [...ResearchSeatTools.CLAUDE],
          },
        },
      ])
    }),
  )
}

/**
 * An `Agent` call as the permission Orchestra's own task tool asks for: action `task` on the seat. A seat whose
 * proposal is needed in the same turn is refused in the background.
 */
function delegation(input: Record<string, unknown>, agents: ReturnType<typeof subagents>): Decision | { action: string; resources: string[] } {
  const type = typeof input.subagent_type === "string" ? input.subagent_type : "*"
  const seat = ClaudeCodeRecord.seat(type, agents) ?? type
  if (input.run_in_background === true && ClaudeHostOptions.FOREGROUND_SEATS.includes(seat))
    return { allow: false, reason: `Run \`${type}\` in the foreground: its result is needed in this turn.` }
  return { action: "task", resources: [seat] }
}

/** AskUserQuestion's questions in Orchestra's question shape. */
function questions(input: Record<string, unknown>) {
  const list = (value: unknown) => (Array.isArray(value) ? value.filter(ClaudeCodeTranscript.record) : [])
  const text = (value: unknown) => (typeof value === "string" ? value : "")
  return list(input.questions).map((item) => ({
    question: text(item.question),
    header: text(item.header),
    options: list(item.options).map((option) => ({ label: text(option.label), description: text(option.description) })),
    multiple: item.multiSelect === true,
  }))
}

/** The call as ToolSafety reads it, under Orchestra's tool name and argument names (legacy `gate.invocation`). */
function safetyCall(tool: string, input: Record<string, unknown>) {
  const text = (key: string) => (typeof input[key] === "string" ? input[key] : undefined)
  const file = text("file_path") ?? text("notebook_path")
  if (tool === "Bash") return { tool: "bash", args: { command: text("command") ?? "" } }
  if (tool === "Write") return { tool: "write", args: { filePath: file } }
  if (tool === "Edit" || tool === "MultiEdit" || tool === "NotebookEdit") return { tool: "edit", args: { filePath: file } }
  if (tool === "Read") return { tool: "read", args: { filePath: file, limit: input.limit, offset: input.offset } }
  return { tool: PERMISSIONS[tool]?.action ?? tool.toLowerCase(), args: input }
}

/** What Orchestra changes in the call's input: the sandboxed command, and the dispatch's domains for a web search. */
function replacements(tool: string, authorization: ExecutionHost.Authorization | undefined) {
  const changed = {
    ...authorization?.input,
    ...(tool === "WebSearch" && authorization?.domains ? { allowed_domains: [...authorization.domains] } : {}),
  }
  return Object.keys(changed).length ? changed : undefined
}

export function permission(tool: string, input: Record<string, unknown>, directory: string) {
  const rule = PERMISSIONS[tool]
  const value = rule ? input[rule.field] : undefined
  if (!rule || typeof value !== "string") return { action: tool.toLowerCase(), resources: ["*"] }
  if (!rule.path || !path.isAbsolute(value)) return { action: rule.action, resources: [value] }
  const relative = path.relative(directory, value)
  const outside = relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)
  return { action: rule.action, resources: [outside ? value : relative] }
}

// Every reason names a next step: a bare refusal left small models ending the turn without a word.
function denial(error: { readonly _tag: string }, delegated: boolean) {
  if ("feedback" in error && typeof error.feedback === "string") return error.feedback
  // ToolSafety's refusal names its reason, so the model can act on it.
  if (error._tag === "ToolSafety.Denied" && "message" in error && typeof error.message === "string") return error.message
  if (error._tag === "PermissionV2.DeclinedError") return "The owner declined this call."
  if (delegated) return "This agent may not delegate this work. Do it yourself with the tools you hold."
  return "Orchestra's permission rules deny this call. Continue with the tools you are allowed to use, or say what you need."
}

/** Claude Code's session id for an Orchestra session: a name-based (v5) UUID, stable across restarts. */
export function claudeSessionID(sessionID: string) {
  const hash = createHash("sha1").update(NAMESPACE).update(sessionID).digest()
  hash[6] = (hash[6] & 0x0f) | 0x50
  hash[8] = (hash[8] & 0x3f) | 0x80
  const hex = hash.subarray(0, 16).toString("hex")
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-")
}
const NAMESPACE = Buffer.from("8f0c5b3e6a2d4f1b9c7e0d2a4b6c8e1f", "hex")
