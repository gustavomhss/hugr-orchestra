import { describe, expect, test } from "bun:test"
import {
  evaluateReply,
  renderPresentation,
  type ApprovalDecision,
  type ApprovalMessage,
  type ApprovalPresentation,
} from "../../src/maestro/approval"

const presentation: ApprovalPresentation = {
  id: "apr_01",
  sessionID: "ses_01",
  assistantMessageID: "msg_present",
  planRevisionID: "plan_v3",
  validationRecordID: "val_v3",
  actor: { projectId: "prj_01", sessionId: "ses_01", memberId: "maestro" },
  revisionHash: "revision-v3-hash",
  validationHash: "validation-v3-hash",
  contextHash: "context-v3-hash",
  policyHash: "policy-v3-hash",
  taskHash: "task-v3-hash",
  intent: { subagentType: "general", prompt: "Implement bounded scoped retrieval.", model: "test/model" },
  methodVersion: "maestro-v2",
  plan: "Implement bounded scoped retrieval.",
  provenance: "request msg_before; validation val_v3",
  assumptions: ["Atlas scope remains read-only."],
  validationLedger: "val_v3: VALID",
  contextState: "CURRENT",
}

function message(input: Partial<ApprovalMessage> & Pick<ApprovalMessage, "id" | "seq" | "role">): ApprovalMessage {
  return {
    sessionID: "ses_01",
    text: "",
    synthetic: false,
    ...input,
  }
}

function conversation(reply: ApprovalMessage, extra: readonly ApprovalMessage[] = []) {
  return [
    message({ id: "msg_before", seq: 1, role: "user", text: "build this" }),
    message({ id: "msg_present", seq: 2, role: "assistant", text: renderPresentation(presentation) }),
    ...extra,
    reply,
  ]
}

type EvaluateOptions = Pick<
  Partial<Parameters<typeof evaluateReply>[0]>,
  "presentations" | "messages" | "decisions" | "presentationCurrent" | "decisionTime"
>

function evaluate(reply: ApprovalMessage, options?: EvaluateOptions) {
  return evaluateReply({
    presentation,
    presentations: options?.presentations ?? [presentation],
    messages: conversation(reply, options?.messages ?? []),
    replyMessageID: reply.id,
    decisions: options?.decisions ?? [],
    presentationCurrent: options?.presentationCurrent ?? true,
    decisionTime: options?.decisionTime ?? 123,
  })
}

describe("Maestro approval", () => {
  test("binds explicit direct approval to visible exact revision and validation", () => {
    const reply = message({ id: "msg_reply", seq: 3, role: "user", text: "aprovo" })

    const result = evaluate(reply)

    expect(result.status).toBe("APPROVED")
    if (result.status !== "APPROVED") throw new Error("expected approval")
    expect(result.decision).toMatchObject({
      presentationID: presentation.id,
      approvalMessageID: reply.id,
      sessionID: presentation.sessionID,
      planRevisionID: presentation.planRevisionID,
      validationRecordID: presentation.validationRecordID,
      actor: presentation.actor,
      revisionHash: presentation.revisionHash,
      validationHash: presentation.validationHash,
      contextHash: presentation.contextHash,
      policyHash: presentation.policyHash,
      taskHash: presentation.taskHash,
      methodVersion: presentation.methodVersion,
      outcome: "APPROVED",
      time: { created: 123 },
    })
  })

  test("accepts exact English approval and explicit decline", () => {
    expect(evaluate(message({ id: "msg_approve", seq: 3, role: "user", text: "approve" })).status).toBe("APPROVED")
    expect(evaluate(message({ id: "msg_decline", seq: 3, role: "user", text: "cancel" })).status).toBe("DECLINED")
  })

  test("keeps questions and sentiment pending", () => {
    expect(
      evaluate(message({ id: "msg_question", seq: 3, role: "user", text: "what changes after approval?" })),
    ).toEqual({
      status: "PENDING",
      kind: "question",
    })
    expect(evaluate(message({ id: "msg_sentiment", seq: 3, role: "user", text: "looks good" }))).toEqual({
      status: "PENDING",
      kind: "ambiguous",
    })
  })

  test("mutation probe: assistant or tool text cannot self-approve", () => {
    for (const role of ["assistant", "tool"] as const) {
      expect(evaluate(message({ id: `msg_${role}`, seq: 3, role, text: "approve" }))).toEqual({
        status: "HOLD",
        reason: "reply-not-direct-user",
      })
    }
  })

  test("mutation probe: synthetic user text cannot approve", () => {
    expect(evaluate(message({ id: "msg_synthetic", seq: 3, role: "user", text: "approve", synthetic: true }))).toEqual({
      status: "HOLD",
      reason: "reply-synthetic",
    })
  })

  test("mutation probe: reply must follow exact visible presentation in same session", () => {
    expect(evaluate(message({ id: "msg_early", seq: 1, role: "user", text: "approve" }))).toEqual({
      status: "HOLD",
      reason: "reply-not-after-presentation",
    })
    expect(
      evaluate(message({ id: "msg_other_session", seq: 3, role: "user", sessionID: "ses_02", text: "approve" })),
    ).toEqual({ status: "HOLD", reason: "reply-session-mismatch" })
    expect(
      evaluate(message({ id: "msg_bad_presentation", seq: 3, role: "user", text: "approve" }), {
        messages: [message({ id: "msg_present", seq: 2, role: "assistant", text: "Approve this plan?" })],
      }),
    ).toEqual({ status: "HOLD", reason: "presentation-message-mismatch" })
  })

  test("holds stale presentation when a newer presentation intervenes", () => {
    const newer = {
      ...presentation,
      id: "apr_02",
      assistantMessageID: "msg_newer",
      planRevisionID: "plan_v4",
      revisionHash: "revision-v4-hash",
    }
    const reply = message({ id: "msg_reply", seq: 4, role: "user", text: "approve" })

    expect(
      evaluate(reply, {
        presentations: [presentation, newer],
        messages: [message({ id: "msg_newer", seq: 3, role: "assistant", text: renderPresentation(newer) })],
      }),
    ).toEqual({ status: "HOLD", reason: "presentation-not-current" })
  })

  test("mutation probe: duplicated presentation identity holds", () => {
    const duplicate = {
      ...presentation,
      assistantMessageID: "msg_duplicate",
      planRevisionID: "plan_v4",
      revisionHash: "revision-v4-hash",
      plan: "Implement a different plan.",
    }
    const reply = message({ id: "msg_reply", seq: 4, role: "user", text: "approve" })

    expect(
      evaluate(reply, {
        presentations: [presentation, duplicate],
        messages: [message({ id: "msg_duplicate", seq: 3, role: "assistant", text: renderPresentation(duplicate) })],
      }),
    ).toEqual({ status: "HOLD", reason: "presentation-not-current" })
  })

  test("replays only same decision; reused reply against another presentation holds", () => {
    const reply = message({ id: "msg_reply", seq: 3, role: "user", text: "approve" })
    const first = evaluate(reply)
    if (first.status !== "APPROVED") throw new Error("expected approval")

    expect(evaluate(reply, { decisions: [first.decision] })).toEqual(first)
    const other: ApprovalDecision = { ...first.decision, presentationID: "apr_other" }
    expect(evaluate(reply, { decisions: [other] })).toEqual({ status: "HOLD", reason: "reply-already-bound" })
  })

  test("holds when revision evidence no longer current", () => {
    expect(
      evaluate(message({ id: "msg_reply", seq: 3, role: "user", text: "approve" }), { presentationCurrent: false }),
    ).toEqual({
      status: "HOLD",
      reason: "presentation-not-current",
    })
  })

  test("holds malformed actor identity and timestamp before interpreting approval", () => {
    const malformed = {
      ...presentation,
      actor: { ...presentation.actor, sessionId: "ses_other" },
    }
    const reply = message({ id: "msg_reply", seq: 3, role: "user", text: "approve" })
    const messages = [
      message({ id: "msg_present", seq: 2, role: "assistant", text: renderPresentation(malformed) }),
      reply,
    ]

    expect(
      evaluateReply({
        presentation: malformed,
        presentations: [malformed],
        messages,
        replyMessageID: reply.id,
        decisions: [],
        presentationCurrent: true,
        decisionTime: 123,
      }),
    ).toEqual({ status: "HOLD", reason: "presentation-identity-invalid" })
    expect(evaluate(reply, { decisionTime: -1 })).toEqual({ status: "HOLD", reason: "presentation-identity-invalid" })
  })
})
