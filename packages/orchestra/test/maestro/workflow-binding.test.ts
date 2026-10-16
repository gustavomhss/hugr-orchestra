import { describe, expect } from "bun:test"
import { Effect, Result, Schema } from "effect"
import { Database } from "@orchestra/core/database/database"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { SessionProjector } from "@orchestra/core/session/projector"
import { SessionV1 } from "@orchestra/core/v1/session"
import { Event } from "@orchestra/schema/event"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { RelayArm } from "@orchestra/schema/relay-arm"
import { RelayWorkflowBinding } from "@orchestra/core/relay-workflow-binding"
import { EventV2Bridge } from "@/event-v2-bridge"
import { workflowRevisionBody } from "../../src/maestro/plan-revision"
import { WorkflowBinding } from "../../src/maestro/workflow-binding"
import { testEffect } from "../lib/effect"
import { MessageID, PartID } from "../../src/session/schema"
import { Session } from "../../src/session/session"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"

const it = testEffect(TestAppNodeBuilder.build(LayerNode.group([Session.node, SessionProjector.node, Database.node, EventV2Bridge.node])))

// A model can choose references but cannot make them observed upstream authorship. Until the reviewed upstream
// verifier is wired, the native preparation path must fail before touching a store, reserving or dispatching.
describe("workflow upstream integration seam", () => {
  it.instance("caller-selected publication/source references cannot mint upstream authority", () => Effect.gen(function* () {
    const result = yield* WorkflowBinding.beforeTask({
      sessionID: "ses_authority", assistantMessageID: "msg_authority", callID: "native-task-call",
      projectID: "project", directory: "/project", writePaths: ["src"], subagentType: "backend", prompt: "Implement packet",
      workflow: { documentID: "selected-document", planRevisionID: Event.ID.make("evt_selected_revision"), parameters: {} },
    }).pipe(Effect.result)
    expect(Result.isFailure(result)).toBe(true)
    if (Result.isSuccess(result)) throw new Error("Unverified upstream proposal was admitted")
    expect(result.failure).toBeInstanceOf(RelayWorkflowBinding.Held)
    if (!(result.failure instanceof RelayWorkflowBinding.Held)) throw new Error("Expected named HOLD")
    expect(result.failure.reason).toBe("UPSTREAM_ATTRIBUTION_MISSING")
  }))

  // The live run dispatched with writePaths that differed from the approved ones and got only the bare code back.
  it.instance("a Task whose writePaths differ from the approved plan names both scopes before any store is read", () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const parent = yield* sessions.create({ title: "Workflow dispatch", agent: "maestro" })
      const model = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") }
      const user = yield* sessions.updateMessage({ id: MessageID.ascending(), role: "user", sessionID: parent.id,
        agent: "maestro", model, time: { created: 1 } })
      const definition = Schema.decodeUnknownSync(RelayArm.WorkflowDefinition)({
        publication: { projectID: parent.projectID, documentID: "packet", activeVersionID: "version-1",
          immutableVersionBodyChecksum: "1".repeat(64), livePublicationChecksum: "2".repeat(64) },
        materialization: { schemaIdentifier: "RelaySprint.Sprint", digest: "3".repeat(64), byteLength: 128 },
        resolvedSkills: [], parameters: {}, writePaths: ["src/money.ts"],
      })
      const field = { value: "Convert money exactly.", source: "maestro" as const }
      const revision = Schema.decodeUnknownSync(MaestroEvent.PlanRevision.RecordedV3.data)(workflowRevisionBody({
        sessionID: parent.id, admissionMessageID: user.id, methodVersion: "draft-plan-v3", goal: field,
        acceptance: [field], scope: [field], constraints: [], reviewRequirement: field, contextRequirement: "PENDING",
        assumptions: [], risks: [], status: "PROPOSED", createdAt: 1,
      }, definition))
      const events = yield* EventV2Bridge.Service
      yield* events.publish(MaestroEvent.PlanRevision.RecordedV3, revision, { id: EventV2.ID.make(revision.id) })
      const workflow = { documentID: "packet", planRevisionID: Event.ID.make(revision.id), parameters: {} }
      const assistant: SessionV1.Assistant = { id: MessageID.ascending(), role: "assistant", parentID: user.id,
        sessionID: parent.id, mode: "maestro", agent: "maestro", cost: 0,
        path: { cwd: parent.directory, root: parent.directory },
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        modelID: model.modelID, providerID: model.providerID, time: { created: 2 } }
      yield* sessions.updateMessage(assistant)
      const input = { subagent_type: "backend", prompt: "Implement packet", writePaths: ["proposal.md"], workflow }
      yield* sessions.updatePart({ id: PartID.ascending(), sessionID: parent.id, messageID: assistant.id, type: "tool",
        tool: "task", callID: "call_dispatch", state: { status: "running", input, time: { start: 2 } } })
      const unreached = () => Effect.die(new Error("the scope check must hold before the host is consulted"))
      const host: WorkflowBinding.Host = { publication: unreached, verifyUpstream: unreached, approve: unreached,
        complete: unreached }

      const result = yield* WorkflowBinding.beforeTask({ sessionID: parent.id, assistantMessageID: assistant.id,
        callID: "call_dispatch", projectID: parent.projectID, directory: parent.directory, writePaths: ["proposal.md"],
        subagentType: "backend", prompt: "Implement packet", workflow,
      }).pipe(Effect.provideService(WorkflowBinding.NativeHost, host), Effect.result)
      if (Result.isSuccess(result)) throw new Error("Unapproved scope was admitted")
      expect(result.failure).toBeInstanceOf(RelayWorkflowBinding.Held)
      if (!(result.failure instanceof RelayWorkflowBinding.Held)) throw new Error("Expected named HOLD")
      expect(result.failure.reason).toBe("WORKFLOW_APPROVED_SCOPE_MISMATCH")
      expect(result.failure.message).toBe(`Tool safety HOLD: WORKFLOW_APPROVED_SCOPE_MISMATCH. Plan revision ${revision.id} approved writePaths ["src/money.ts"]; this Task passed ["proposal.md"]. Retry with exactly the approved writePaths, in the same order.`)
    }))
})
