import { createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import type {
  AssistantMessage,
  Message,
  Part,
  PermissionRequest,
  QuestionRequest,
  Session,
  SessionStatus,
} from "@opencode-ai/sdk/v2/client"
import { useServerSDK } from "@/context/server-sdk"
import { useSync } from "@/context/sync"
import { ScopedKey, type ServerScope } from "@/utils/server-scope"
import { useSessionLayout } from "./session-layout"

type ToolPart = Extract<Part, { type: "tool" }>

export type TasksItemState = "running" | "needs-input" | "completed" | "error" | "interrupted" | "unknown"

export interface TasksItem {
  /** Server-qualified key, so rows from two servers never collide. */
  key: string
  kind: "agent" | "shell"
  headline: string
  agent?: string
  state: TasksItemState
  /** Undefined when no synced record says when the work started. */
  startTime?: number
  /** Undefined unless a terminal record carries the end time. */
  endTime?: number
  /** Child session id — the official join key (task.ts metadata.sessionId). */
  childId?: string
  /** Parent session that spawned the work. */
  sessionId: string
  /** References from the loaded projection, not guessed from timestamps or call IDs. */
  sourceMessageID?: string
  sourcePartID?: string
  callID?: string
  originUserMessageID?: string
  /** Nested subagent count ((+N), Claude panel parity). */
  nested?: number
  stats?: TaskStats
}

/** Undefined fields are unknown; numbers are values the synced data proves, zeros included. */
export interface TaskStats {
  model?: string
  agent?: string
  toolCalls?: number
  fails?: number
  tokens?: { input: number; output: number }
  cost?: number
}

export type TasksInput = {
  scope: ServerScope
  sessionID: string
  sessions: readonly Session[]
  message: Record<string, Message[] | undefined>
  part: Record<string, Part[] | undefined>
  status: Record<string, SessionStatus | undefined>
  permission: Record<string, PermissionRequest[] | undefined>
  question: Record<string, QuestionRequest[] | undefined>
  /** True only after a transcript page has loaded, with no page load in flight. */
  loaded: (sessionID: string) => boolean
  /** True while older transcript pages exist that the store has not loaded. */
  more: (sessionID: string) => boolean
  /** Session cost/tokens are server data only on v2; the v1 compat layer zero-fills missing ones. */
  aggregates: boolean
}

/**
 * Derives the background-work list for the current session from the already
 * synced reactive stores — sessions (incl. children via parentID), message
 * parts, session status and pending requests. No fetching, no polling.
 */
export function createTasksData() {
  const sync = useSync()
  const serverSDK = useServerSDK()
  const { params } = useSessionLayout()

  const items = createMemo(() => {
    const sessionID = params.id
    if (!sessionID) return { running: [] as TasksItem[], finished: [] as TasksItem[] }
    const store = sync()
    return deriveTasks({
      scope: serverSDK().scope,
      sessionID,
      sessions: store.data.session ?? [],
      message: store.data.message,
      part: store.data.part,
      status: store.data.session_status,
      permission: store.data.permission,
      question: store.data.question,
      loaded: store.session.history.loaded,
      more: store.session.history.more,
      aggregates: serverSDK().protocolKind() === "v2",
    })
  })

  const liveCount = createMemo(() => items().running.length)

  const ready = () => sync().ready && (!params.id || sync().data.message[params.id] !== undefined)
  return { items, liveCount, ready }
}

/** The one Tasks projection a session owns; every Tasks and Activity view reads this instance. */
export type TasksData = ReturnType<typeof createTasksData>

/**
 * The compact Tasks summary: active work first (needs input, then running; newest known start
 * first, unknown starts after known ones, then by key). Finished work fills only the slots active
 * work leaves free, failures first. Counts come from the whole collection, never from the rows shown.
 */
export function summarizeTasks(items: { running: TasksItem[]; finished: TasksItem[] }, limit = 3) {
  const active = items.running.toSorted(
    (a, b) =>
      Number(b.state === "needs-input") - Number(a.state === "needs-input") ||
      newest(a.startTime, b.startTime) ||
      a.key.localeCompare(b.key),
  )
  const finished = items.finished.toSorted(
    (a, b) =>
      Number(b.state === "error") - Number(a.state === "error") ||
      newest(a.endTime, b.endTime) ||
      a.key.localeCompare(b.key),
  )
  const rows = [...active.slice(0, limit), ...finished.slice(0, Math.max(0, limit - active.length))]
  return {
    rows,
    active: active.length,
    needsInput: active.filter((item) => item.state === "needs-input").length,
    hiddenFailures: finished.filter((item) => item.state === "error" && !rows.includes(item)).length,
    total: active.length + finished.length,
  }
}

/** Comparator for optional timestamps: newest first, unknown after every known one. */
export function newest(a: number | undefined, b: number | undefined) {
  if (a === undefined) return b === undefined ? 0 : 1
  if (b === undefined) return -1
  return b - a
}

export function deriveTasks(input: TasksInput) {
  const waiting = waitingRequests(input)
  const messages = input.message[input.sessionID] ?? []
  const users = new Set(
    messages
      .filter((message) => message.role === "user" && message.sessionID === input.sessionID)
      .map((message) => message.id),
  )
  const origins = new Map(
    messages.flatMap((message) =>
      message.role === "assistant" && message.sessionID === input.sessionID && users.has(message.parentID)
        ? [[message.id, message.parentID] as const]
        : [],
    ),
  )
  const calls = messages.flatMap((message) =>
    (input.part[message.id] ?? []).filter(
      (part): part is ToolPart =>
        part.type === "tool" && part.sessionID === input.sessionID && part.messageID === message.id,
    ),
  )
  const source = (part: ToolPart | undefined) =>
    part && {
      sourceMessageID: part.messageID,
      sourcePartID: part.id,
      callID: part.callID,
      originUserMessageID: origins.get(part.messageID),
    }
  // The latest task call per child wins: resuming a task reuses its child session.
  const taskCalls = new Map(
    calls.flatMap((part) => {
      const childID = part.tool === "task" ? text(toolMetadata(part).sessionId) : undefined
      return childID ? [[childID, part] as const] : []
    }),
  )
  const sessions = new Map(input.sessions.map((session) => [session.id, session]))
  const childIDs = new Set([
    ...input.sessions.flatMap((session) => (session.parentID === input.sessionID ? [session.id] : [])),
    ...taskCalls.keys(),
  ])
  const agents = [...childIDs].map((childID) => ({
    ...agentItem(input, waiting, childID, sessions.get(childID), taskCalls.get(childID)),
    ...source(taskCalls.get(childID)),
  }))
  // Foreground shell tools surface as Shell cards while running.
  const shells = new Map(
    calls
      .filter((part) => (part.tool === "bash" || part.tool === "shell") && !terminal(part.state))
      .map((part): [string, TasksItem] => [
        part.callID,
        {
          key: ScopedKey.from(input.scope, input.sessionID, "shell", part.callID),
          kind: "shell",
          headline: toolTitle(part.state) ?? part.tool,
          state: waiting.calls.has(part.callID) ? "needs-input" : "running",
          startTime: toolStart(part.state),
          sessionId: input.sessionID,
          ...source(part),
        },
      ]),
  )
  const all = [...agents, ...shells.values()]
  return {
    running: all.filter(live).sort((a, b) => (b.startTime ?? 0) - (a.startTime ?? 0)),
    finished: all.filter((item) => !live(item)).sort((a, b) => (b.endTime ?? 0) - (a.endTime ?? 0)),
  }
}

export function live(item: Pick<TasksItem, "state">) {
  return item.state === "running" || item.state === "needs-input"
}

export type StopState = "pending" | "failed"

/**
 * Stop interrupts the child session only — never the parent — and keeps the outcome visible: pending
 * while in flight, failed with retry on rejection. Task keys are server and session qualified, so an
 * outcome that settles after the view moved to another session still lands on its own row.
 */
export function createTaskStops(interrupt: (sessionID: string) => Promise<unknown>) {
  const [stops, setStops] = createStore<Record<string, StopState | undefined>>({})
  return {
    state: (key: string) => stops[key],
    stop(item: TasksItem) {
      const sessionID = item.childId
      if (!sessionID || stops[item.key] === "pending") return
      setStops(item.key, "pending")
      interrupt(sessionID).then(
        () => setStops(item.key, undefined),
        () => setStops(item.key, "failed"),
      )
    },
  }
}

function agentItem(
  input: TasksInput,
  waiting: ReturnType<typeof waitingRequests>,
  childID: string,
  child: Session | undefined,
  call: ToolPart | undefined,
): TasksItem {
  const callInput = call?.state.input ?? {}
  const outcome = agentOutcome(input, waiting, childID, call)
  return {
    key: ScopedKey.from(input.scope, input.sessionID, "agent", childID),
    kind: "agent",
    // Child session titles read "<description> (@<agent> subagent)".
    headline:
      (call && toolTitle(call.state)) ||
      text(callInput.description) ||
      (child ? (child.title ?? "").replace(/ \(@[^)]* subagent\)$/, "") : childID),
    agent: text(callInput.subagent_type),
    state: outcome.state,
    startTime: child?.time.created ?? (call ? toolStart(call.state) : undefined),
    endTime: outcome.endTime,
    childId: childID,
    sessionId: input.sessionID,
    nested: input.sessions.filter((session) => session.parentID === childID).length || undefined,
    stats: agentStats(input, childID, child, call),
  }
}

/** Claims an outcome only from a record that proves it; otherwise "unknown". */
function agentOutcome(
  input: TasksInput,
  waiting: ReturnType<typeof waitingRequests>,
  childID: string,
  call: ToolPart | undefined,
): { state: TasksItemState; endTime?: number } {
  if (waiting.sessions.has(childID) || (call && waiting.calls.has(call.callID))) return { state: "needs-input" }
  if ((input.status[childID]?.type ?? "idle") !== "idle") return { state: "running" }
  // A background task call completes as soon as its job starts, so only the
  // child transcript can prove how the child itself ended.
  if (call && toolMetadata(call).background !== true) {
    if (call.state.status === "completed") return { state: "completed", endTime: call.state.time.end }
    if (call.state.status === "error")
      return { state: interruptedCall(call) ? "interrupted" : "error", endTime: call.state.time.end }
    return { state: "running" }
  }
  const last = input.message[childID]?.at(-1)
  if (last?.role !== "assistant") return { state: "unknown" }
  if (last.error?.name === "MessageAbortedError") return { state: "interrupted", endTime: last.time.completed }
  if (last.error) return { state: "error", endTime: last.time.completed }
  if (last.finish && !["tool-calls", "unknown"].includes(last.finish))
    return { state: "completed", endTime: last.time.completed }
  return { state: "unknown" }
}

function agentStats(
  input: TasksInput,
  childID: string,
  child: Session | undefined,
  call: ToolPart | undefined,
): TaskStats {
  const messages = input.message[childID]
  const last = messages?.findLast((message): message is AssistantMessage => message.role === "assistant")
  const complete = input.loaded(childID) && transcriptComplete(messages, input.part, input.more(childID))
  const assistants = complete
    ? messages.filter((message): message is AssistantMessage => message.role === "assistant")
    : undefined
  const tools = complete
    ? messages.flatMap((message) => (input.part[message.id] ?? []).filter((part) => part.type === "tool"))
    : undefined
  const callModel = toolMetadata(call).model
  const aggregate = input.aggregates ? child : undefined
  return {
    model:
      (last && shortModel(last.providerID, last.modelID)) ??
      (child?.model && shortModel(child.model.providerID, child.model.id)) ??
      (isRecord(callModel) ? shortModel(text(callModel.providerID), text(callModel.modelID)) : undefined),
    agent: last?.agent || child?.agent || undefined,
    toolCalls: tools?.length,
    fails: tools?.filter((part) => part.state.status === "error").length,
    // Session aggregates are server-maintained; a complete transcript is the only other proof.
    tokens: aggregate?.tokens
      ? { input: aggregate.tokens.input, output: aggregate.tokens.output }
      : assistants && {
          input: assistants.reduce((sum, message) => sum + message.tokens.input, 0),
          output: assistants.reduce((sum, message) => sum + message.tokens.output, 0),
        },
    cost: aggregate?.cost ?? assistants?.reduce((sum, message) => sum + message.cost, 0),
  }
}

/**
 * A loaded transcript proves counts only when no older page remains, every
 * message has parts, and every assistant turn's prompt is present.
 */
function transcriptComplete(
  messages: Message[] | undefined,
  parts: TasksInput["part"],
  more: boolean,
): messages is Message[] {
  if (!messages || more || messages.some((message) => parts[message.id] === undefined)) return false
  const prompts = new Set(messages.flatMap((message) => (message.role === "user" ? [message.id] : [])))
  return prompts.size > 0 && messages.every((message) => message.role === "user" || prompts.has(message.parentID))
}

/** Pending permissions and questions, indexed by owning session and by raising tool call. */
function waitingRequests(input: TasksInput) {
  const requests = [
    ...Object.values(input.permission).flatMap((list) => list ?? []),
    ...Object.values(input.question).flatMap((list) => list ?? []),
  ]
  return {
    sessions: new Set(requests.map((request) => request.sessionID)),
    calls: new Set(requests.flatMap((request) => (request.tool ? [request.tool.callID] : []))),
  }
}

// processor.ts marks parent aborts; task.ts reports a cancelled child as "Task cancelled".
function interruptedCall(call: ToolPart) {
  if (call.state.status !== "error") return false
  return (
    toolMetadata(call).interrupted === true ||
    call.state.error === "Tool execution aborted" ||
    call.state.error === "Task cancelled"
  )
}

function terminal(state: ToolPart["state"]) {
  return state.status === "completed" || state.status === "error"
}

function toolTitle(state: ToolPart["state"]) {
  if (state.status === "completed" || state.status === "running") return state.title || undefined
  return undefined
}

function toolStart(state: ToolPart["state"]) {
  if (state.status === "pending") return undefined
  return state.time.start
}

function toolMetadata(part: ToolPart | undefined): Record<string, unknown> {
  if (!part) return {}
  if (part.state.status === "pending") return part.metadata ?? {}
  return part.metadata ?? part.state.metadata ?? {}
}

function shortModel(providerID: string | undefined, modelID: string | undefined) {
  if (!providerID || !modelID) return undefined
  return `${providerID}/${modelID.replace(/^(anthropic|openai|google|opencode)-/i, "")}`
}

function text(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}
