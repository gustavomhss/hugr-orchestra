import { afterEach, describe, expect } from "bun:test"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Session } from "@/session/session"
import { MessageID, PartID } from "@/session/schema"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { Effect } from "effect"
import { disposeAllInstances } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { presentApprovalFromSession, recordApproval } from "../../src/maestro/approval-record"
import { renderPresentation } from "../../src/maestro/approval"

afterEach(async () => {
  await disposeAllInstances()
})

const it = testEffect(
  LayerNode.compile(LayerNode.group([Database.node, EventV2Bridge.node, Session.node, SessionProjector.node])),
)

const model = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") }

function seed(presentationOutput?: (output: string) => string) {
  return Effect.gen(function* () {
    const sessions = yield* Session.Service
    const session = yield* sessions.create({ title: "Approval" })
    const user = yield* sessions.updateMessage({
      id: MessageID.ascending(),
      role: "user",
      sessionID: session.id,
      agent: "maestro",
      model,
      time: { created: 1 },
    })
    const assistant: SessionV1.Assistant = {
      id: MessageID.ascending(),
      role: "assistant",
      parentID: user.id,
      sessionID: session.id,
      mode: "maestro",
      agent: "maestro",
      cost: 0,
      path: { cwd: "/tmp", root: "/tmp" },
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      modelID: model.modelID,
      providerID: model.providerID,
      time: { created: 2 },
    }
    yield* sessions.updateMessage(assistant)
    const presentation = yield* presentApprovalFromSession({
      sessionID: session.id,
      assistantMessageID: assistant.id,
      callID: "call_present",
      memberID: "maestro",
      planRevisionID: "plan_v1",
      validationRecordID: "val_v1",
      revisionHash: "revision-hash",
      validationHash: "validation-hash",
      contextHash: "context-hash",
      policyHash: "policy-hash",
      taskHash: "task-hash",
      intent: { subagentType: "general", prompt: "Add dark mode." },
      methodVersion: "request-approval-v1",
      plan: "Add dark mode.",
      provenance: "request msg_01",
      assumptions: [],
      validationLedger: "val_v1: VALID",
      contextState: "CURRENT",
    })
    const output = renderPresentation(presentation)
    yield* sessions.updatePart({
      id: PartID.ascending(),
      sessionID: session.id,
      messageID: assistant.id,
      type: "tool",
      tool: "maestro_present_approval",
      callID: "call_present",
      state: {
        status: "completed",
        input: {},
        output: presentationOutput ? presentationOutput(output) : output,
        title: "Maestro plan approval",
        metadata: {},
        time: { start: 2, end: 3 },
      },
    })
    const reply = yield* sessions.updateMessage({
      id: MessageID.ascending(),
      role: "user",
      sessionID: session.id,
      agent: "maestro",
      model,
      time: { created: 4 },
    })
    return { session, sessions, assistant, reply }
  })
}

describe("Maestro approval record", () => {
  it.instance("records direct approval from exact rendered tool evidence", () =>
    Effect.gen(function* () {
      const { session, sessions, reply } = yield* seed()
      yield* sessions.updatePart({
        id: PartID.ascending(),
        sessionID: session.id,
        messageID: reply.id,
        type: "text",
        text: "aprovo",
      })

      const first = yield* recordApproval(session.id)
      const replay = yield* recordApproval(session.id)

      expect(first.status).toBe("APPROVED")
      expect(replay).toEqual(first)
    }),
  )

  it.instance("holds when tool output differs from immutable presentation", () =>
    Effect.gen(function* () {
      const { session, sessions, reply } = yield* seed(() => "altered")
      yield* sessions.updatePart({
        id: PartID.ascending(),
        sessionID: session.id,
        messageID: reply.id,
        type: "text",
        text: "approve",
      })

      expect(yield* recordApproval(session.id)).toEqual({ status: "HOLD", reason: "presentation-message-mismatch" })
    }),
  )

  it.instance("allows assistant narration but holds when another user intervenes", () =>
    Effect.gen(function* () {
      const { session, sessions, reply } = yield* seed()
      const intervening: SessionV1.Assistant = {
        id: MessageID.ascending(),
        role: "assistant",
        parentID: reply.id,
        sessionID: session.id,
        mode: "maestro",
        agent: "maestro",
        cost: 0,
        path: { cwd: "/tmp", root: "/tmp" },
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        modelID: model.modelID,
        providerID: model.providerID,
        time: { created: 3 },
      }
      yield* sessions.updateMessage(intervening)
      yield* sessions.updatePart({
        id: PartID.ascending(),
        sessionID: session.id,
        messageID: reply.id,
        type: "text",
        text: "approve",
      })

      expect(yield* recordApproval(session.id)).toMatchObject({ status: "APPROVED" })
    }),
  )

  it.instance("replays one presentation for same revision after a retried tool call", () =>
    Effect.gen(function* () {
      const { session, sessions, assistant } = yield* seed()
      const retry: SessionV1.Assistant = { ...assistant, id: MessageID.ascending(), time: { created: 3 } }
      yield* sessions.updateMessage(retry)

      const replay = yield* presentApprovalFromSession({
        sessionID: session.id,
        assistantMessageID: retry.id,
        callID: "call_retry",
        memberID: "maestro",
        planRevisionID: "plan_v1",
        validationRecordID: "val_v1",
        revisionHash: "revision-hash",
        validationHash: "validation-hash",
        contextHash: "context-hash",
        policyHash: "policy-hash",
        taskHash: "task-hash",
        intent: { subagentType: "general", prompt: "Add dark mode." },
        methodVersion: "request-approval-v1",
        plan: "Add dark mode.",
        provenance: "request msg_01",
        assumptions: [],
        validationLedger: "val_v1: VALID",
        contextState: "CURRENT",
      })

      expect(replay.assistantMessageID).toBe(assistant.id)
    }),
  )
})
