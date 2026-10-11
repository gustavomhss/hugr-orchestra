import { describe, expect } from "bun:test"
import { Effect, Result } from "effect"
import { Database } from "@orchestra/core/database/database"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Event } from "@orchestra/schema/event"
import { RelayWorkflowBinding } from "@orchestra/core/relay-workflow-binding"
import { WorkflowBinding } from "../../src/maestro/workflow-binding"
import { testEffect } from "../lib/effect"
import { Session } from "../../src/session/session"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"

const it = testEffect(TestAppNodeBuilder.build(LayerNode.group([Session.node, Database.node])))

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
})
