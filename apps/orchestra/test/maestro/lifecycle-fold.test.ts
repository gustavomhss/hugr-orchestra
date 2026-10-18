import { describe, expect, test } from "bun:test"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { Event } from "@orchestra/schema/event"
import { Schema } from "effect"
import { fold } from "../../src/maestro/lifecycle-fold"

const admission = MaestroEvent.Admission.Decided.make({
  id: Event.ID.make("evt_admission"),
  type: "maestro.admission.decided",
  data: { sessionID: "ses_1", messageID: "msg_1", methodVersion: "admit-request-v1", outcome: "READY_TO_DRAFT" },
})

const scope = MaestroEvent.Scope.Decided.make({
  id: Event.ID.make("evt_scope"),
  type: "maestro.scope.decided",
  data: {
    sessionID: "ses_1",
    projectID: "prj_1",
    mode: "maestro",
    predecessorID: admission.id,
    methodVersion: "resolve-scope-v1",
    scopeID: "scope_1",
  },
})

describe("Maestro lifecycle fold", () => {
  test("folds admission then scope and replays same durable events", () => {
    expect(fold([admission, scope, admission, scope])).toEqual({
      status: "PENDING",
      phase: "SCOPED",
      sessionID: "ses_1",
      projectID: "prj_1",
      mode: "maestro",
      predecessorID: "evt_scope",
    })
  })

  test("refuses missing predecessor, session, project, and mode evidence", () => {
    expect(fold([scope])).toMatchObject({ status: "HOLD", reason: "scope-predecessor" })
    expect(fold([admission, { ...scope, data: { ...scope.data, sessionID: "ses_2" } }])).toMatchObject({
      status: "HOLD",
      reason: "session-mismatch",
    })
    const clarificationAdmission = MaestroEvent.Admission.Decided.make({
      id: Event.ID.make("evt_clarification_admission"),
      type: "maestro.admission.decided",
      data: { sessionID: "ses_1", messageID: "msg_2", methodVersion: "admit-request-v1", outcome: "CLARIFY" },
    })
    const clarification = MaestroEvent.Clarification.Decided.make({
      id: Event.ID.make("evt_clarification"),
      type: "maestro.clarification.decided",
      data: {
        sessionID: "ses_1",
        projectID: "prj_1",
        mode: "maestro",
        predecessorID: clarificationAdmission.id,
        methodVersion: "clarify-decision-v1",
        decision: "target",
        question: "Which target?",
      },
    })
    const held = MaestroEvent.Held.Entered.make({
      id: Event.ID.make("evt_held"),
      type: "maestro.held.entered",
      data: {
        sessionID: "ses_1",
        projectID: "prj_2",
        mode: "maestro",
        predecessorID: clarification.id,
        reason: "missing-evidence",
      },
    })
    expect(fold([clarificationAdmission, clarification, held])).toMatchObject({
      status: "HOLD",
      reason: "project-mismatch",
    })
    expect(Schema.is(MaestroEvent.Scope.Decided)({ ...scope, data: { ...scope.data, mode: "general" } })).toBe(false)
  })

  test("holds changed duplicate event IDs", () => {
    expect(fold([admission, { ...admission, data: { ...admission.data, outcome: "CLARIFY" } }])).toMatchObject({
      status: "HOLD",
      reason: "changed-duplicate",
    })
  })
})
