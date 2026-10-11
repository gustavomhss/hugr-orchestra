export * as ClaudeHostMirror from "./mirror"

// Mirrors a long-lived Claude Code session into Orchestra's session, so every widget keeps its data source (meta-harness
// 13-ui-inventory.md §5). The step, text, reasoning, tool, snapshot and patch writes are the existing turn mirror's
// (../mirror.ts), reused as is; this layer adds what a Claude-hosted session needs on top of it:
// - Claude Code's built-ins under Orchestra's tool ids (read, edit, write, todowrite, question, skill) and the
//   structured `tool_use_result` as the card metadata those views read (exit, diff, counts, todos, answers);
// - subagent frames (`parent_tool_use_id`) mirrored into the seat's child session at every depth, and `task_*` progress
//   on the Agent card. The Agent part keeps its raw name: delegation records (hooks) own it (contract V2 §2);
// - retry status, compaction dividers, rate limits, cost, model usage and context window.
// A steer that Claude Code reads mid-turn starts the next step under the steering user message.
import { Effect } from "effect"
import type { ModelUsage, SDKMessage } from "@anthropic-ai/claude-agent-sdk"
import type { SessionV1 } from "@orchestra/core/v1/session"
import type { Agent } from "@/agent/agent"
import { MessageID, PartID, type SessionID } from "@/session/schema"
import type { Session } from "@/session/session"
import type { SessionStatus } from "@/session/status"
import type { Todo } from "@/session/todo"
import type { Snapshot } from "@/snapshot"
import { Provider } from "@/provider/provider"
import { ModelV2 } from "@orchestra/core/model"
import type { ModelsDev } from "@orchestra/core/models-dev"
import { ClaudeCodeMirror, NAMES } from "../mirror"
import { ClaudeCodeTranscript } from "../transcript"

/** Claude Code built-ins shown under the Orchestra tool id whose card renders them. */
export const RENAME: Record<string, string> = {
  Read: "read", Edit: "edit", Write: "write", TodoWrite: "todowrite", AskUserQuestion: "question", Skill: "skill",
}

export function toolName(name: string) {
  return NAMES[name] ?? RENAME[name] ?? name
}

type Input = Record<string, unknown>
type Todos = { content: string; status: string; priority: string; activeForm?: string }[]
const text = (value: unknown) => (typeof value === "string" ? value : undefined)
const list = (value: unknown) => (Array.isArray(value) ? value.filter(ClaudeCodeTranscript.record) : [])

export function todos(value: unknown): Todos {
  return list(value).map((item) => ({ content: text(item.content) ?? "", status: text(item.status) ?? "pending",
    priority: "medium", ...(text(item.activeForm) ? { activeForm: text(item.activeForm) } : {}) }))
}

/** AskUserQuestion's questions in Orchestra's question shape (the dock and the question card). */
export function questions(input: Input) {
  return list(input.questions).map((item) => ({ question: text(item.question) ?? "", header: text(item.header) ?? "",
    options: list(item.options).map((option) => ({ label: text(option.label) ?? "", description: text(option.description) ?? "" })),
    multiple: item.multiSelect === true }))
}

/** The tool input with the field names Orchestra's cards read, beside Claude Code's own. */
export function toolInput(name: string, input: Input): Input {
  if (name === "Read") return { ...input, filePath: input.file_path }
  if (name === "Edit")
    return { ...input, filePath: input.file_path, oldString: input.old_string, newString: input.new_string, replaceAll: input.replace_all }
  if (name === "Write") return { ...input, filePath: input.file_path }
  if (name === "TodoWrite") return { ...input, todos: todos(input.todos) }
  if (name === "AskUserQuestion") return { ...input, questions: questions(input) }
  if (name === "Skill") return { ...input, name: input.skill ?? input.name }
  return input
}

/** Card metadata from a tool's structured result (`SDKUserMessage.tool_use_result`, typed in sdk-tools.d.ts). */
export function toolMetadata(name: string, structured: unknown, output: string, failed: boolean): Input {
  if (!ClaudeCodeTranscript.record(structured)) return {}
  if (name === "Bash") {
    // BashOutput has no numeric exit code: a failed call reports it in its text (13-ui-inventory.md §5.1, spike S1).
    const exit = failed ? Number(/exit code (\d+)/i.exec(output)?.[1] ?? 1) : 0
    return { exit, truncated: structured.persistedOutputPath !== undefined, outputPath: structured.persistedOutputPath,
      timeout: structured.timedOutAfterMs !== undefined, aborted: structured.interrupted === true,
      timedOutAfterMs: structured.timedOutAfterMs, interrupted: structured.interrupted,
      ...(structured.backgroundTaskId ? { backgroundTaskId: structured.backgroundTaskId } : {}) }
  }
  if (name === "Edit" || name === "Write") {
    const before = text(structured.originalFile) ?? ""
    const after = name === "Write" ? text(structured.content) ?? "" : replace(before, structured)
    const diff = ClaudeCodeTranscript.record(structured.gitDiff) ? structured.gitDiff : undefined
    const additions = typeof diff?.additions === "number" ? diff.additions : count(structured.structuredPatch, "+")
    const deletions = typeof diff?.deletions === "number" ? diff.deletions : count(structured.structuredPatch, "-")
    const file = text(structured.filePath) ?? ""
    return { filepath: file, exists: structured.originalFile !== null, diff: text(diff?.patch) ?? "", diagnostics: {},
      filediff: { file, before, after, additions, deletions } }
  }
  if (name === "Glob") return { count: structured.numFiles, truncated: structured.truncated === true }
  if (name === "Grep") return { matches: structured.numMatches ?? structured.numFiles }
  if (name === "TodoWrite") return { todos: todos(structured.newTodos) }
  if (name === "AskUserQuestion") {
    const answers = ClaudeCodeTranscript.record(structured.answers) ? structured.answers : {}
    return { answers: questions(structured).map((item) => (text(answers[item.question]) ?? "").split(", ").filter(Boolean)) }
  }
  if (name === "Agent" || name === "Task")
    return { claudeCodeAgent: Object.fromEntries(["agentId", "agentType", "status", "totalTokens", "totalDurationMs",
      "totalToolUseCount", "resolvedModel", "worktreePath", "outputFile"].flatMap((key) => structured[key] === undefined ? [] : [[key, structured[key]]])) }
  return {}
}

function replace(before: string, edit: Input) {
  const from = text(edit.oldString) ?? ""
  const to = text(edit.newString) ?? ""
  if (!from) return before
  if (edit.replaceAll === true) return before.split(from).join(to)
  const index = before.indexOf(from)
  return index < 0 ? before : before.slice(0, index) + to + before.slice(index + from.length)
}

function count(patch: unknown, sign: string) {
  return list(patch).flatMap((hunk) => Array.isArray(hunk.lines) ? hunk.lines : [])
    .filter((line) => typeof line === "string" && line.startsWith(sign)).length
}

/** A seat's child session that a subagent's frames mirror into. Created by the delegation records (hooks). */
export type Child = { sessionID: SessionID; user: SessionV1.User; agent: Agent.Info }

/** Spelled out because a mirror holds the child mirrors of its subagents. */
export interface Mirror {
  /** Apply one SDK frame; subagent frames go to the child session of their Agent call. */
  on(message: SDKMessage): Effect.Effect<void>
  /** Register the UUID of each user send before it enters the SDK input queue. */
  sent(user: SessionV1.User, uuid: string): Effect.Effect<void>
  /** Without a sent UUID a steer stays pending; only an SDK receipt can consume it. */
  steer(user: SessionV1.User, uuid?: string): Effect.Effect<void>
  /** A steer Claude Code has not answered yet. */
  pending(): SessionV1.User | undefined
  pendingInputs(): readonly { user: SessionV1.User; uuid?: string }[]
  consumed(): readonly SessionV1.User[]
  annotate(callID: string, patch: Input): Effect.Effect<void>
  /** A subagent ended: close its child session's last step. */
  settle(callID: string): Effect.Effect<void>
  current(): SessionV1.Assistant | undefined
  tool(callID: string): SessionV1.ToolPart | undefined
  retract(ids: readonly string[]): Effect.Effect<void>
  claim(name: string): SessionV1.ToolPart | undefined
  complete(part: SessionV1.ToolPart): Effect.Effect<void>
  /** The turn ended: close the last step and put the turn's cost on it. */
  finish(previousCost: number): Effect.Effect<{ cost: number; last: SessionV1.Assistant | undefined }>
  /** The turn failed or was stopped: running tools abort and the open step carries the error. */
  fail(cause: { aborted: boolean; message: string }): Effect.Effect<SessionV1.Assistant | undefined>
}

export function create(input: {
  sessionID: SessionID
  user: SessionV1.User
  agent: Agent.Info
  path: { cwd: string; root: string }
  sessions: Session.Interface
  snapshot: Snapshot.Interface
  todo: Todo.Interface
  status: SessionStatus.Interface
  /** The UI reads provider.models[id].limit, not session metadata. */
  provider?: Provider.Interface
  /** Native Claude sessions can run without a connected API provider; seed their UI model data from the catalog. */
  catalog?: ModelsDev.Interface
  /** The child session of an Agent call, once its delegation record exists; undefined keeps only the card. */
  child?: (call: SessionV1.ToolPart) => Effect.Effect<Child | undefined>
  /** Session-level host facts (cost, usage, rate limit, model) for the session's `claudeCode` metadata. */
  state?: (patch: Input) => Effect.Effect<void>
  record?: (input: { apiID?: string; uuid?: string; messageID: MessageID }) => Effect.Effect<void>
  /**
   * Agent calls and task ids by the mirror that owns them, shared by every turn of one live session: a background
   * subagent's frames and notification arrive after the turn that dispatched it has ended (spike S12).
   */
  known?: { calls: Map<string, Mirror>; tasks: Map<string, string>; usage?: Map<string, ModelUsage> }
}): Mirror {
  const { sessionID, sessions } = input
  const known: NonNullable<typeof input.known> = input.known ?? { calls: new Map<string, Mirror>(), tasks: new Map<string, string>() }
  const modelUsage = known.usage ??= new Map<string, ModelUsage>()
  const views = [view(input.user)]
  const children = new Map<string, { mirror: Mirror } | undefined>()
  const raw = new Map<string, string>()
  const sends = new Map<string, SessionV1.User>()
  const pending = new Map<MessageID, { user: SessionV1.User; uuid?: string }>()
  const consumed = new Map<MessageID, SessionV1.User>()
  let answering = input.user
  let apiID: string | undefined
  let retrying = false
  let model: string | undefined

  function view(user: SessionV1.User) {
    return ClaudeCodeMirror.create({ sessionID, user, agent: input.agent, path: input.path, sessions, snapshot: input.snapshot, record: input.record })
  }
  const current = () => views[views.length - 1]
  const tool = (callID: string) => views.findLast((item) => item.tool(callID))?.tool(callID)
  const state = (patch: Input) => input.state?.(patch) ?? Effect.void

  /** Rewrites a mirrored part, keeping metadata another writer (the delegation hooks) stored on it meanwhile. */
  const write = (next: SessionV1.ToolPart, stored?: SessionV1.Part) => Effect.gen(function* () {
    const owner = views.findLast((item) => item.tool(next.callID)) ?? current()
    const kept = stored?.type === "tool" ? stored : undefined
    const keptState = kept && kept.state.status !== "pending" ? kept.state.metadata : undefined
    const merged = { ...next, metadata: { ...kept?.metadata, ...next.metadata },
      state: next.state.status === "pending" ? next.state : { ...next.state, metadata: { ...keptState, ...next.state.metadata } } }
    yield* owner.complete(merged as SessionV1.ToolPart)
  })
  const stored = (part: SessionV1.ToolPart) => sessions.getPart({ sessionID, messageID: part.messageID, partID: part.id })

  /** Progress and results on an Agent card, merged with what the delegation hooks stored. */
  const annotate = (callID: string, patch: Input) => Effect.gen(function* () {
    const part = tool(callID)
    if (!part) return
    const saved = yield* stored(part)
    const previous = saved?.type === "tool" ? saved.metadata?.claudeCodeTask : undefined
    yield* write({ ...part, metadata: { ...part.metadata,
      claudeCodeTask: { ...(ClaudeCodeTranscript.record(previous) ? previous : {}), ...patch } } }, saved)
  })

  /** The child mirror of an Agent call, resolved once the child session exists. */
  const childOf = (callID: string) => Effect.gen(function* () {
    const cached = children.get(callID)
    if (cached) return cached.mirror
    const part = tool(callID)
    const resolved = part && input.child ? yield* input.child(part) : undefined
    if (!resolved) return undefined
    const mirror = create({ ...input, known, sessionID: resolved.sessionID, user: resolved.user, agent: resolved.agent, state: undefined, record: undefined })
    children.set(callID, { mirror })
    return mirror
  })
  /** The mirror that owns `callID`: this one, a seat below it, or an earlier turn's. */
  const owner = (callID: string) => tool(callID) ? self : known.calls.get(callID)

  const system = (message: Extract<SDKMessage, { type: "system" }>) => Effect.gen(function* () {
    if (message.subtype === "init") {
      model = message.model
      return yield* state({ sessionId: message.session_id, model: message.model, version: message.claude_code_version,
        apiKeySource: message.apiKeySource })
    }
    if (message.subtype === "api_retry") {
      retrying = true
      return yield* input.status.set(sessionID, { type: "retry", attempt: message.attempt,
        message: message.error_status ? `${message.error} (${message.error_status})` : message.error,
        next: Date.now() + message.retry_delay_ms })
    }
    if (message.subtype === "compact_boundary") {
      const info: SessionV1.User = { id: MessageID.ascending(), sessionID, role: "user", agent: input.user.agent,
        model: input.user.model, time: { created: Date.now() } }
      yield* sessions.updateMessage(info)
      yield* sessions.updatePart({ id: PartID.ascending(), sessionID, messageID: info.id, type: "compaction",
        auto: message.compact_metadata.trigger === "auto" })
      return
    }
    if (message.subtype === "task_started" || message.subtype === "task_progress" || message.subtype === "task_updated" ||
      message.subtype === "task_notification") {
      const callID = "tool_use_id" in message && message.tool_use_id ? message.tool_use_id : known.tasks.get(message.task_id)
      if (message.subtype === "task_started" && callID) known.tasks.set(message.task_id, callID)
      const target = callID ? owner(callID) : undefined
      if (!callID || !target) return
      const patch = message.subtype === "task_started"
        ? { taskID: message.task_id, status: "running", description: message.description, subagentType: message.subagent_type,
            background: message.is_backgrounded === true, depth: message.spawn_depth }
        : message.subtype === "task_progress"
          ? { taskID: message.task_id, summary: message.summary, lastTool: message.last_tool_name, usage: message.usage }
          : message.subtype === "task_updated"
            ? { taskID: message.task_id, ...message.patch }
            : { taskID: message.task_id, status: message.status, summary: message.summary, usage: message.usage }
      yield* target.annotate(callID, patch)
      // A background subagent ends with its notification, not with the Agent call's immediate result.
      if (message.subtype === "task_notification") yield* target.settle(callID)
    }
  })

  /** Rename new Claude Code tool parts to Orchestra's ids, with the input fields those cards read. */
  const renamed = (message: Extract<SDKMessage, { type: "assistant" }>) => Effect.gen(function* () {
    for (const block of message.message.content) {
      if (block.type !== "tool_use" || raw.has(block.id)) continue
      raw.set(block.id, block.name)
      known.calls.set(block.id, self)
      const part = tool(block.id)
      if (!part || !RENAME[block.name] || part.state.status !== "running") continue
      yield* write({ ...part, tool: RENAME[block.name], state: { ...part.state, input: toolInput(block.name, block.input as Input) } })
    }
  })

  const results = (message: Extract<SDKMessage, { type: "user" }>) =>
    Array.isArray(message.message.content)
      ? message.message.content.flatMap((block) => typeof block === "object" && block.type === "tool_result" ? [block] : [])
      : []

  const self: Mirror = {
    on: (message) => Effect.gen(function* () {
      const parent = "parent_tool_use_id" in message ? message.parent_tool_use_id : null
      if (parent) {
        if (!tool(parent)) {
          const other = known.calls.get(parent)
          return yield* other && other !== self ? other.on(message) : Effect.void
        }
        const child = yield* childOf(parent)
        if (child) yield* child.on({ ...message, parent_tool_use_id: null } as SDKMessage)
        return
      }
      const step = message.type === "stream_event" && message.event.type === "message_start" ? message.event.message.id
        : message.type === "assistant" ? message.message.id : undefined
      if (step && retrying) {
        retrying = false
        yield* input.status.set(sessionID, { type: "busy" })
      }
      // Receipts can include several batched sends and can arrive on the complete assistant after message_start.
      const receipts = "user_message_uuids" in message && message.user_message_uuids
        ? message.user_message_uuids : "user_message_uuid" in message && message.user_message_uuid ? [message.user_message_uuid] : []
      for (const uuid of receipts) {
        const user = sends.get(uuid)
        if (!user || consumed.has(user.id)) continue
        consumed.set(user.id, user)
        pending.delete(user.id)
        answering = user
      }
      if (message.type === "system") return yield* system(message)
      if (message.type === "rate_limit_event") return yield* state({ rateLimit: message.rate_limit_info })
      if (step && answering.id !== current().current()?.parentID && answering.id !== input.user.id) {
        if (step === apiID) yield* current().parent(answering.id)
        if (step !== apiID) {
          yield* current().finish(0)
          views.push(view(answering))
        }
      }
      if (step) apiID = step
      if (message.type === "assistant" && message.message.model) model = message.message.model
      const before = message.type === "user"
        ? yield* Effect.forEach(results(message), (block) => {
          const part = tool(block.tool_use_id)
          return part ? stored(part) : Effect.succeed(undefined)
        })
        : []
      yield* current().on(message)
      if (message.type === "assistant") return yield* renamed(message)
      if (message.type === "result") return yield* usage(message)
      if (message.type !== "user") return
      for (const [index, block] of results(message).entries()) {
        const part = tool(block.tool_use_id)
        const name = raw.get(block.tool_use_id) ?? ""
        if (!part || (part.state.status !== "completed" && part.state.status !== "error")) continue
        const output = part.state.status === "completed" ? part.state.output : part.state.error
        const metadata = toolMetadata(name, message.tool_use_result, output, block.is_error === true)
        yield* write({ ...part, state: { ...part.state, metadata: { ...part.state.metadata, ...metadata } } }, before[index])
        if (name === "TodoWrite" && Array.isArray(metadata.todos))
          yield* input.todo.update({ sessionID, todos: metadata.todos as Todos })
        if ((name === "Agent" || name === "Task") && ClaudeCodeTranscript.record(message.tool_use_result) &&
          message.tool_use_result.status === "completed") yield* self.settle(block.tool_use_id)
      }
    }),

    sent: (user, uuid) => Effect.sync(() => {
      if (sends.has(uuid) && sends.get(uuid)?.id !== user.id) throw new Error("SDK send UUID reused for another user message")
      sends.set(uuid, user)
      if (user.id !== input.user.id && !consumed.has(user.id)) pending.set(user.id, { user, uuid })
    }),
    steer: (user, uuid) => Effect.sync(() => {
      if (uuid) sends.set(uuid, user)
      if (!consumed.has(user.id)) pending.set(user.id, { user, uuid })
    }),
    pending: () => [...pending.values()].at(-1)?.user,
    pendingInputs: () => [...pending.values()],
    consumed: () => [...consumed.values()],
    annotate,
    settle: (callID) => Effect.gen(function* () {
      const child = children.get(callID)?.mirror
      if (child) yield* child.finish(0)
    }),
    current: () => current().current(),
    tool,
    retract: (ids) => Effect.forEach(views, (item) => item.retract(ids), { discard: true }),
    // An Orchestra MCP call by Maestro or by a seat whose child session is mirrored.
    claim: (name) => current().claim(name) ??
      [...children.values()].map((item) => item?.mirror.claim(name)).find((part) => part !== undefined),
    complete: (part) => tool(part.callID) ? write(part)
      : known.calls.get(part.callID)?.complete(part) ?? Effect.void,
    finish: (previousCost) => Effect.gen(function* () {
      yield* Effect.forEach([...children.values()], (item) => item?.mirror.finish(0) ?? Effect.void, { discard: true })
      return yield* current().finish(previousCost)
    }),
    fail: (cause) => Effect.gen(function* () {
      yield* Effect.forEach([...children.values()], (item) => item?.mirror.fail(cause) ?? Effect.void, { discard: true })
      return yield* current().fail(cause)
    }),
  }

  const usage = (message: Extract<SDKMessage, { type: "result" }>) => Effect.gen(function* () {
    const models = message.modelUsage ?? {}
    const main = models[model ?? ""] ?? Object.values(models).find((item) => item.canonicalModel === model)
    const providers = input.provider ? yield* input.provider.list() : undefined
    const catalog = input.catalog ? yield* input.catalog.get() : undefined
    const providerID = input.user.model.providerID
    const provider = providers?.[providerID] ?? (catalog?.[providerID] ? Provider.fromModelsDevProvider(catalog[providerID]) : undefined)
    for (const [id, usage] of Object.entries(models)) {
      // modelUsage is cumulative across the live query; preserve the baseline across mirrors and turns.
      let remaining = Math.max(0, (usage.thinkingTokens ?? 0) - (modelUsage.get(id)?.thinkingTokens ?? 0))
      for (const item of [...views].reverse()) remaining = yield* item.reasoning(id, remaining)
      modelUsage.set(id, usage)
      if (!provider || !providers) continue
      const catalogModel = provider.models[id] ?? Object.values(provider.models).find((item) =>
        item.api.id === id || item.id === usage.canonicalModel)
      const previous = catalogModel ?? provider.models[input.user.model.modelID]
      if (!previous) continue
      provider.models[id] = { ...previous, id: ModelV2.ID.make(id), name: catalogModel?.name ?? id, api: { ...previous.api, id },
        limit: { ...previous.limit, context: usage.contextWindow, output: usage.maxOutputTokens } }
      providers[providerID] = provider
    }
    yield* state({ cost: message.total_cost_usd, modelUsage: models,
      ...(main ? { contextWindow: main.contextWindow, maxOutputTokens: main.maxOutputTokens } : {}) })
  })

  return self
}
