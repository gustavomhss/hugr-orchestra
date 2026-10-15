import { expect } from "bun:test"
import { SessionV1 } from "@orchestra/core/v1/session"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { filesystem } from "@orchestra/core/effect/app-node-platform"
import { SessionProjector } from "@orchestra/core/session/projector"
import { Cause, Effect, Exit, Schema } from "effect"
import { Agent } from "../../src/agent/agent"
import { BackgroundJob } from "@/background/job"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Config } from "@/config/config"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { Ripgrep } from "@orchestra/core/ripgrep"
import { Session } from "@/session/session"
import type { SessionPrompt } from "../../src/session/prompt"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import { SessionRunState } from "@/session/run-state"
import { SessionStatus } from "@/session/status"
import { TaskTool, type TaskPromptOps } from "../../src/tool/task"
import { MaestroPresentApprovalTool } from "../../src/tool/maestro-approval"
import { Truncate } from "@/tool/truncate"
import { ToolRegistry } from "@/tool/registry"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { disposeAllInstances } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { ProviderV2 } from "@orchestra/core/provider"
import { ModelV2 } from "@orchestra/core/model"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { recordAdmission } from "../../src/maestro/admission-record"
import { presentApprovalFromSession, recordApproval } from "../../src/maestro/approval-record"
import { renderPresentation } from "../../src/maestro/approval"
import { taskHash } from "../../src/maestro/task-hash"
import { and, eq } from "drizzle-orm"
import { createHash } from "node:crypto"
import { Git } from "@/git"
import { ArsenalCompletion } from "@/maestro/arsenal-completion"
import { FSUtil } from "@orchestra/core/fs-util"
import { AppProcess } from "@orchestra/core/process"
import { TestInstance, tmpdirScoped } from "../fixture/fixture"


import { AppNodeBuilderV1 } from "@/effect/app-node-builder-v1"
export const ref = {
  providerID: ProviderV2.ID.make("test"),
  modelID: ModelV2.ID.make("test-model"),
}

export const layer = AppNodeBuilderV1.build(
  LayerNode.group([
    filesystem,
    Agent.node,
    BackgroundJob.node,
    EventV2Bridge.node,
    Git.node,
    Config.node,
    CrossSpawnSpawner.node,
    Session.node,
    SessionProjector.node,
    SessionRunState.node,
    SessionStatus.node,
    Truncate.node,
    ToolRegistry.node,
    Database.node,
    RuntimeFlags.node,
    Ripgrep.node,
    FSUtil.node,
    AppProcess.node,
  ]),
)


export function stubOps(options?: { onPrompt?: (input: SessionPrompt.PromptInput) => void }): TaskPromptOps {
  return {
    cancel: () => Effect.void,
    resolvePromptParts: (template) => Effect.succeed([{ type: "text" as const, text: template }]),
    prompt: (input) =>
      Effect.sync(() => {
        options?.onPrompt?.(input)
        return {
          info: {
            id: MessageID.ascending(),
            role: "assistant",
            parentID: input.messageID ?? MessageID.ascending(),
            sessionID: input.sessionID,
            mode: input.agent ?? "general",
            agent: input.agent ?? "general",
            cost: 0,
            path: { cwd: "/tmp", root: "/tmp" },
            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
            modelID: input.model?.modelID ?? ref.modelID,
            providerID: input.model?.providerID ?? ref.providerID,
            time: { created: Date.now() },
            finish: "stop",
          },
          parts: [],
        }
      }),
  }
}

export const seed = Effect.fn("MaestroLifecycleTest.seed")(function* () {
  const sessions = yield* Session.Service
  const chat = yield* sessions.create({ title: "Maestro lifecycle" })
  const user = yield* sessions.updateMessage({
    id: MessageID.ascending(),
    role: "user",
    sessionID: chat.id,
    agent: "maestro",
    model: ref,
    time: { created: Date.now() },
  })
  const assistant: SessionV1.Assistant = {
    id: MessageID.ascending(),
    role: "assistant",
    parentID: user.id,
    sessionID: chat.id,
    mode: "maestro",
    agent: "maestro",
    cost: 0,
    path: { cwd: "/tmp", root: "/tmp" },
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    modelID: ref.modelID,
    providerID: ref.providerID,
    time: { created: Date.now() },
  }
  yield* sessions.updateMessage(assistant)
  return { chat, user, assistant, sessions }
})


export const dispatch = Effect.fn("MaestroLifecycleFixture.dispatch")(function* (
  options: { subagentType?: string; writePaths?: string[] } = {},
) {
  const subagentType = options.subagentType ?? "general"
  const { chat, user, assistant, sessions } = yield* seed()
  yield* sessions.updatePart({
    id: PartID.ascending(),
    messageID: user.id,
    sessionID: chat.id,
    type: "text",
    text: "Add dark mode to settings.",
  })
  const admission = yield* recordAdmission({
    sessionID: chat.id,
    messageID: user.id,
    methodVersion: "admit-request-v1",
    assessment: {
      kind: "work",
      goal: "Add dark mode to settings.",
      known: [{ text: "Settings page exists.", source: "orientation" }],
      proposals: [{ text: "Draft scope first.", source: "maestro" }],
      unknowns: [],
      uncertainty: "Persistence needs inspection.",
      activeWorkEffect: "none",
      reason: "Goal is usable for a draft.",
    },
  })
  expect(admission.outcome).toBe("READY_TO_DRAFT")
  const presentation = yield* presentApprovalFromSession({
    sessionID: chat.id,
    assistantMessageID: assistant.id,
    callID: "call_present",
    memberID: "maestro",
    planRevisionID: "plan_v1",
    validationRecordID: "val_v1",
    revisionHash: "revision-hash",
    validationHash: "validation-hash",
    contextHash: "context-hash",
    policyHash: "policy-hash",
    taskHash: taskHash({
      subagentType,
      prompt: "implement dark mode",
      planRevisionID: "plan_v1",
      revisionHash: "revision-hash",
      validationRecordID: "val_v1",
      validationHash: "validation-hash",
      contextHash: "context-hash",
      policyHash: "policy-hash",
    }),
    intent: { subagentType, prompt: "implement dark mode" },
    methodVersion: "request-approval-v1",
    plan: "Add dark mode to settings.",
    provenance: `request ${user.id}`,
    assumptions: [],
    validationLedger: "val_v1: VALID",
    contextState: "CURRENT",
  })
  yield* sessions.updatePart({
    id: PartID.ascending(),
    messageID: assistant.id,
    sessionID: chat.id,
    type: "tool",
    tool: "maestro_present_approval",
    callID: "call_present",
    state: {
      status: "completed",
      input: {},
      output: renderPresentation(presentation),
      title: "Maestro plan approval",
      metadata: {},
      time: { start: 2, end: 3 },
    },
  })
  const approvalTime = Date.now() + 1_000
  const approvalMessage = yield* sessions.updateMessage({
    id: MessageID.ascending(),
    role: "user",
    sessionID: chat.id,
    agent: "maestro",
    model: ref,
    time: { created: approvalTime },
  })
  yield* sessions.updatePart({
    id: PartID.ascending(),
    messageID: approvalMessage.id,
    sessionID: chat.id,
    type: "text",
    text: "aprovo",
  })
  const approval = yield* recordApproval(chat.id)
  if (approval.status !== "APPROVED") throw new Error("expected exact approval")
  const dispatchMessage: SessionV1.Assistant = {
    id: MessageID.ascending(),
    parentID: approvalMessage.id,
    role: "assistant",
    sessionID: chat.id,
    mode: "maestro",
    agent: "Conductor",
    cost: 0,
    path: { cwd: "/tmp", root: "/tmp" },
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    modelID: ref.modelID,
    providerID: ref.providerID,
    time: { created: approvalTime + 1_000 },
  }
  yield* sessions.updateMessage(dispatchMessage)
  const tool = yield* TaskTool
  const def = yield* tool.init()
  const input = {
    description: "implement dark mode",
    prompt: "implement dark mode",
    subagent_type: subagentType,
    ...(options.writePaths ? { writePaths: options.writePaths } : {}),
    governed: {
      sessionID: chat.id,
      projectID: chat.projectID,
      memberID: "maestro",
      approvalMessageID: approval.decision.approvalMessageID,
      planRevisionID: approval.decision.planRevisionID,
      revisionHash: approval.decision.revisionHash,
      validationRecordID: approval.decision.validationRecordID,
      validationHash: approval.decision.validationHash,
      contextHash: approval.decision.contextHash,
      policyHash: approval.decision.policyHash,
      taskHash: approval.decision.taskHash,
    },
  }
  let prompts = 0
  const context = {
    sessionID: chat.id,
    messageID: dispatchMessage.id,
    callID: "call_task_01",
    agent: "Conductor",
    agentID: "maestro",
    abort: new AbortController().signal,
    extra: { promptOps: stubOps({ onPrompt: () => prompts++ }) },
    messages: [],
    metadata: () => Effect.void,
    ask: () => Effect.void,
  }
  const first = yield* def.execute(input, context)
  const spoofed = yield* Effect.exit(def.execute(input, { ...context, agentID: "spoofed-maestro" }))
  expect(Exit.isFailure(spoofed)).toBe(true)
  if (Exit.isFailure(spoofed)) expect(Cause.pretty(spoofed.cause)).toContain("Unknown Task caller: spoofed-maestro")
  const notMaestro = yield* Effect.exit(def.execute(input, { ...context, agentID: "general" }))
  expect(Exit.isFailure(notMaestro)).toBe(true)
  if (Exit.isFailure(notMaestro)) expect(Cause.pretty(notMaestro.cause)).toContain("Governed Task requires Maestro")
  const retry = yield* def.execute({ ...input, task_id: first.metadata.sessionId }, context)
  const children = yield* sessions.children(chat.id)
  expect(children).toHaveLength(1)
  expect(retry.metadata.sessionId).toBe(first.metadata.sessionId)

  return { chat, user, assistant, sessions, approval, def, input, first, context, promptCount: () => prompts }
})
