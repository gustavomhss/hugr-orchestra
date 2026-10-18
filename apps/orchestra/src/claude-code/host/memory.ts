export * as ClaudeHostMemory from "./memory"

import type { SessionV1 } from "@orchestra/core/v1/session"
import { Effect, Option, Schema } from "effect"
import { Agent } from "@/agent/agent"
import { Archive } from "@/continuity/archive"
import { ownedHistory, tailIndex } from "@/continuity/model"
import { AtlasMemory } from "@/maestro/atlas-memory"
import { readAdmission } from "@/maestro/admission-record"
import { LogicalTask } from "@/maestro/logical-task"
import { readPlanRevision } from "@/maestro/plan-revision"
import { MessageID, PartID, type SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import { Todo } from "@/session/todo"
import { ClaudeCodeTools } from "../tools"
import type { ClaudeHostDelegation } from "./delegation"
import { ClaudeHostGate } from "./gate"
import { ClaudeHostGrantHistory } from "./grant-history"
import { ClaudeHostBoundary } from "./boundary"
import type { ClaudeHostMcp } from "./mcp"
import { ClaudeHostTodos } from "./todos"

/** The exclusive user cut is applied before every domain reader, including Archive coverage validation. */
export const retained = Effect.fn("ClaudeHostMemory.retained")(function* (sessionID: SessionID) {
  const sessions = yield* Session.Service
  const session = yield* sessions.get(sessionID)
  const all = yield* sessions.messages({ sessionID })
  const view = ClaudeHostBoundary.retained(session, all)
  const history = view.history
  if (!ownedHistory(sessionID, history)) return yield* Effect.fail(new Error("COMPACT_HISTORY_OWNER_MISMATCH"))
  return { ...view, history }
})

export const read = Effect.fn("ClaudeHostMemory.read")(function* (input: {
  sessionID: SessionID
  pending: readonly ClaudeHostDelegation.Summary[]
  grants: readonly ClaudeHostMcp.Grant[]
}) {
  const sessions = yield* Session.Service
  const todos = yield* Todo.Service
  const archive = yield* Archive.Service
  const agents = yield* Agent.Service
  const view = yield* retained(input.sessionID)
  const binding = yield* LogicalTask.read(input.sessionID)
  const calls = view.history.flatMap((message) => message.parts).filter((part): part is SessionV1.ToolPart => part.type === "tool")
  const tasks = yield* Effect.forEach(yield* sessions.children(input.sessionID), (child) => Effect.gen(function* () {
    const call = calls.findLast((part) => (part.tool === "task" || ClaudeHostGate.agentCall(part.tool)) && part.state.status !== "pending" &&
      part.state.metadata?.sessionId === child.id)
    // A side-store binding without its retained producing Agent part is not evidence in this view.
    if (!call || call.state.status === "pending") return []
    const binding = yield* LogicalTask.read(child.id)
    if (!binding) return []
    const receipt = call.state.metadata?.workResult?.terminal?.reason
    if (call.state.status === "completed" && receipt === "ended") return []
    return [JSON.stringify({ binding, title: child.title, call })]
  }))
  const plan = yield* planState(view, calls)
  const native = ClaudeHostTodos.latest(view)
  // Ordinary TodoWrite is a fallback, not evidence that supersedes a native receipt (including an empty one).
  const snapshot = calls.findLast((part) => part.state.status === "completed" &&
    !ClaudeHostTodos.TOOLS.includes(part.tool) &&
    !(typeof part.metadata?.claudeCodeTool === "string" && ClaudeHostTodos.TOOLS.includes(part.metadata.claudeCodeTool)) &&
    (["todowrite", "TodoWrite"].includes(part.tool) || ClaudeCodeTools.orchestra(part.tool) === "todowrite"))
  // Cuts and legacy native calls without ordered receipts cannot safely use the latest aggregate todo table.
  const cut = view.cut
  const todo = native ? native.status === "known" ? native.todos : [] : snapshot?.state.status === "completed"
    ? Schema.decodeUnknownSync(TodoSnapshot, { onExcessProperty: "preserve" })(snapshot.state.metadata?.todos ?? snapshot.state.input.todos)
    : cut || calls.some((part) => ClaudeHostTodos.TOOLS.includes(part.tool) ||
      typeof part.metadata?.claudeCodeTool === "string" && ClaudeHostTodos.TOOLS.includes(part.metadata.claudeCodeTool))
      ? [] : yield* todos.get(input.sessionID)
  const saved = yield* archive.readMemory(input.sessionID)
  const memory = saved?.context && tailIndex(saved.context, view.history) !== undefined ? [saved.context.text] : []
  const member = AtlasMemory.owner(view.session.agent ? yield* agents.get(view.session.agent) : undefined)
  // Atlas unit IDs are independent of logical task IDs. Only retained host admissions choose the
  // latest full project/member/resume/unit key; restored copies cannot supersede a later refusal.
  const admission = member ? view.history.flatMap((message) => message.parts).flatMap((part) => [
    part.type === "text" && part.synthetic ? part.metadata?.[AtlasMemory.ADMISSION_KEY] : undefined,
    part.type === "tool" && part.state.status !== "pending" ? part.state.metadata?.[AtlasMemory.ADMISSION_KEY] : undefined,
  ]).filter((value): value is AtlasMemory.Admission => value?.schema === "atlas-resume-admission-v1" &&
    value.residency === "admitted" && value.key?.memoryOwner === member && value.key.projectID === view.session.projectID &&
    typeof value.key.logicalResumeID === "string" && value.key.logicalResumeID.length > 0 &&
    (value.key.kind === "task" || value.key.kind === "pr") && typeof value.key.id === "string" && value.key.id.length > 0 &&
    typeof value.text === "string" && (value.verdict?.ok === true && typeof value.verdict.ref?.eventId === "string" &&
      typeof value.verdict.ref.contentHash === "string" || value.verdict?.ok === false && typeof value.verdict.refusal === "string")).at(-1) : undefined
  const sections = [
    ["Owning logical task (retained binding and permissions)", binding ? [JSON.stringify({ binding, permission: view.session.permission })] : []],
    ["Open logical tasks (retained records)", tasks.flat()],
    ["Pending delegations (process-local; not recovered after restart)", input.pending.filter((item) =>
      !item.settled && calls.some((part) => part.callID === item.toolUseID)).map((item) => JSON.stringify(item))],
    ["Write grants (retained issuance; exact live ownership or explicit invalidation)", ClaudeHostGrantHistory.read({
      sessionID: input.sessionID, history: view.history, live: input.grants,
    })],
    ["Plan revision (retained producing tool and admission)", plan],
    ["Todos", native?.status === "unavailable" ? [JSON.stringify({ status: "unavailable", reason: native.unavailable.reason,
      order: native.order, locator: native.locator, recall: { message_id: native.locator.messageID, part_id: native.locator.partID },
      recallExtent: "Owning tool input/output only; unavailable marker is supplied inline and excluded from context_recall metadata. Current native task state is withheld." })]
      : [...(native?.status === "known" && native.coverage === "observed-tasks"
        ? ["Known native state covers observed task IDs only; remaining task inventory is unproven."] : []),
        ...todo.filter((item) => item.status !== "completed" && item.status !== "cancelled").map((item) => JSON.stringify(item))]],
    ["Native task records (validated retained receipt; explicit inventory coverage)", native?.status === "known"
      ? native.snapshot.tasks.filter((task) => task.status !== "completed" && task.status !== "cancelled").map((task) => JSON.stringify({
        status: native.status, coverage: native.coverage, order: native.order, locator: native.locator, task,
      })) : []],
    ["Applicable owned continuity memory (historical)", memory],
    ["Atlas resume Admission (historical evidence; not new permission)", admission ? [admission.text, JSON.stringify({
      key: admission.key, residency: admission.residency, verdict: admission.verdict,
    })] : []],
  ] as const
  const body = sections.filter((section) => section[1].length).map((section) => [`## ${section[0]}`, ...section[1]].join("\n"))
  // The native SDK owns context budgeting. Every required record is rendered whole, without invented recall refs.
  return body.length ? ["# Orchestra working memory (after Claude Code's compaction)", ...body].join("\n\n") : undefined
})

/** Each delivery is a distinct immutable observation; the SDK supplies no stable event ID. */
export const observe = Effect.fn("ClaudeHostMemory.observe")(function* (input: {
  sessionID: SessionID; nativeSessionID: string; text: string; trigger: string
}) {
  const archive = yield* Archive.Service
  const view = yield* retained(input.sessionID)
  const user = view.history.findLast((message) => message.info.role === "user")
  if (user?.info.role !== "user") return
  const now = Date.now()
  const agent = view.session.agent ?? user.info.agent
  const info = { id: MessageID.ascending(), sessionID: input.sessionID, parentID: user.info.id, role: "assistant", mode: agent,
    agent, path: { cwd: view.session.directory, root: view.session.directory }, summary: true, cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, modelID: user.info.model.modelID,
    providerID: user.info.model.providerID, time: { created: now, completed: now }, finish: "stop" } satisfies SessionV1.Assistant
  yield* archive.publish({ sessionID: input.sessionID, messages: [{ info, parts: [{ id: PartID.ascending(), sessionID: input.sessionID,
    messageID: info.id, type: "text", synthetic: true,
    text: `Claude Code compaction summary (${input.trigger}):\nNative owner: ${input.nativeSessionID}\nScope: observed native summary only; contextual retained user anchor, not an exact provider request. Descriptor usage is unmeasured.\n\n${input.text}` }] }] })
})

const TodoSnapshot = Schema.Array(Schema.Struct({ content: Schema.String, status: Schema.String, priority: Schema.String,
  activeForm: Schema.optional(Schema.String) }))

function planState(view: ClaudeHostBoundary.Retained, calls: SessionV1.ToolPart[]) {
  return Effect.gen(function* () {
    const revisions = yield* Effect.forEach(calls.filter((part) => part.state.status === "completed" &&
      (part.tool === "maestro_record_plan_revision" || ClaudeCodeTools.orchestra(part.tool) === "maestro_record_plan_revision")),
    (part) => Effect.gen(function* () {
      if (part.state.status !== "completed") return []
      const output = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(part.state.output.split("\n\nBindings: ")[1] ?? "")
      const id = part.state.metadata?.planRevisionID ?? (Option.isSome(output) ? record(output.value).planRevisionID : undefined)
      if (typeof id !== "string") return yield* Effect.fail(new Error("COMPACT_PLAN_PRODUCER_ID_UNAVAILABLE"))
      const revision = yield* readPlanRevision(id)
      if (!revision) return yield* Effect.fail(new Error("COMPACT_PLAN_REVISION_UNAVAILABLE"))
      const origins = ClaudeHostBoundary.origins(view, part.messageID).filter((origin) => origin.sessionID === revision.sessionID)
      if (origins.length !== 1) return yield* Effect.fail(new Error("COMPACT_PLAN_OWNER_MISMATCH"))
      ClaudeHostBoundary.reference(view, { ...origins[0], admissionMessageID: revision.admissionMessageID,
        producerMessageID: origins[0].messageID })
      if (part.state.input.admissionMessageID !== revision.admissionMessageID ||
        (part.state.metadata?.revisionHash ?? (Option.isSome(output) ? record(output.value).revisionHash : undefined)) !== revision.revisionHash)
        return yield* Effect.fail(new Error("COMPACT_PLAN_ADMISSION_MISMATCH"))
      const admission = yield* readAdmission({ sessionID: revision.sessionID, messageID: revision.admissionMessageID, methodVersion: "admit-request-v1" })
      if (!admission || admission.sessionID !== revision.sessionID || admission.messageID !== revision.admissionMessageID ||
        admission.methodVersion !== "admit-request-v1" || admission.outcome !== "READY_TO_DRAFT")
        return yield* Effect.fail(new Error("COMPACT_PLAN_ADMISSION_UNAVAILABLE"))
      return [JSON.stringify(revision)]
    }))
    return revisions.flat().slice(-1)
  })
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : {}
}
