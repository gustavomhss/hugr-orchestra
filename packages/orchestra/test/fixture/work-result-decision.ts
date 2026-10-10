import { SessionV1 } from "@orchestra/core/v1/session"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { Effect, Schema } from "effect"
import { LogicalTask } from "@/maestro/logical-task"
import { WorkResultDecision } from "@/maestro/work-result-decision"
import { MessageID, PartID } from "@/session/schema"
import { Session } from "@/session/session"
import type { Tool } from "@/tool/tool"

export const decisionFixture = Effect.fn("WorkResultDecisionTest.fixture")(function* (options: {
  verification?: Schema.Schema.Type<typeof MaestroEvent.WorkResult.Decided.data>["verificationState"]
  terminal?: "ended" | "blocked" | "failed" | "interrupted" | "running"
  nested?: boolean
} = {}) {
  const sessions = yield* Session.Service
  const root = yield* sessions.create({ agent: "maestro", title: "result-decision authority" })
  const parent = options.nested ? yield* sessions.create({ parentID: root.id, agent: "general" }) : root
  const child = yield* sessions.create({ parentID: parent.id, agent: "backend" })
  const binding = yield* LogicalTask.ensure({
    executionSessionID: child.id, authoritySessionID: root.id, projectID: root.projectID,
    memberID: "backend", source: "host",
  })
  const message = yield* sessions.updateMessage({
    id: MessageID.ascending(), sessionID: parent.id, parentID: MessageID.ascending(), role: "assistant",
    agent: "maestro", mode: "maestro", modelID: ModelV2.ID.make("test"), providerID: ProviderV2.ID.make("test"),
    path: { cwd: parent.directory, root: parent.directory }, time: { created: Date.now() },
    cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  })
  const result = {
    schema: "backend-work-result-v1", taskId: binding.taskId, memberId: "backend",
    authoritySessionId: root.id, executionSessionId: child.id,
    mode: options.verification && options.verification !== "not-host-verified" ? "delegated-armed" : "delegated",
    acceptance: { state: "pending" }, verification: { state: options.verification ?? "not-host-verified" },
    terminal: { reason: options.terminal ?? "ended" }, card: { parsed: true }, outcome: "done",
    changes: [], checks: [], blockers: [], risks: [], nextActions: [], memory: { reads: [], writes: [] },
  }
  const part: SessionV1.ToolPart = {
    type: "tool", tool: "task", id: PartID.ascending(), sessionID: parent.id, messageID: message.id,
    callID: `call_${PartID.ascending()}`,
    state: { status: "completed", input: { subagent_type: "backend" }, title: "backend result", output: "done",
      time: { start: 1, end: 2 }, metadata: { sessionId: child.id, workResult: result } },
  }
  yield* sessions.updatePart(part)
  const target: Schema.Schema.Type<typeof WorkResultDecision.Parameters> = {
    parentSessionID: parent.id, messageID: message.id, partID: part.id, decision: "accepted",
  }
  const context: Tool.Context = {
    sessionID: root.id, messageID: message.id, agent: "maestro", agentID: "maestro", callID: "decision_call",
    abort: AbortSignal.any([]), messages: [], metadata: () => Effect.void, ask: () => Effect.void,
  }
  return { root, parent, child, binding, part, result, target, context,
    input: { sessionID: root.id, agentID: "maestro", target } }
})
