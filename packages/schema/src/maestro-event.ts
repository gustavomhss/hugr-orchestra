export * as MaestroEvent from "./maestro-event"

import { Event } from "./event"
import { Schema } from "effect"
import { NonNegativeInt, PositiveInt } from "./schema"
import { MaestroContext } from "./maestro-context"

export namespace Approval {
  export const Presented = Event.define({
    type: "maestro.approval.presented",
    durable: { version: 1, aggregate: "sessionID" },
    schema: {
      id: Schema.String,
      sessionID: Schema.String,
      assistantMessageID: Schema.String,
      callID: Schema.String,
      planRevisionID: Schema.String,
      validationRecordID: Schema.String,
      projectID: Schema.String,
      memberID: Schema.String,
      revisionHash: Schema.String,
      validationHash: Schema.String,
      contextHash: Schema.String,
      policyHash: Schema.String,
      taskHash: Schema.String,
      intent: Schema.Struct({
        subagentType: Schema.String,
        prompt: Schema.String,
        model: Schema.optional(Schema.String),
        taskID: Schema.optional(Schema.String),
      }),
      methodVersion: Schema.String,
      plan: Schema.String,
      provenance: Schema.String,
      assumptions: Schema.Array(Schema.String),
      validationLedger: Schema.String,
      contextState: Schema.Literal("CURRENT"),
    },
  })
  export type Presented = typeof Presented.Type

  export const Decided = Event.define({
    type: "maestro.approval.decided",
    durable: { version: 1, aggregate: "sessionID" },
    schema: {
      sessionID: Schema.String,
      projectID: Schema.String,
      memberID: Schema.String,
      presentationID: Schema.String,
      presentationMessageID: Schema.String,
      approvalMessageID: Schema.String,
      planRevisionID: Schema.String,
      validationRecordID: Schema.String,
      revisionHash: Schema.String,
      validationHash: Schema.String,
      contextHash: Schema.String,
      policyHash: Schema.String,
      taskHash: Schema.String,
      methodVersion: Schema.String,
      outcome: Schema.Literals(["APPROVED", "DECLINED"]),
      decisionTime: NonNegativeInt,
    },
  })
  export type Decided = typeof Decided.Type

  export const Consumed = Event.define({
    type: "maestro.approval.consumed",
    durable: { version: 1, aggregate: "sessionID" },
    schema: {
      sessionID: Schema.String,
      presentationID: Schema.String,
      approvalMessageID: Schema.String,
      taskHash: Schema.String,
      callID: Schema.String,
    },
  })
  export type Consumed = typeof Consumed.Type

  export const Reserved = Event.define({
    type: "maestro.approval.reserved",
    durable: { version: 1, aggregate: "sessionID" },
    schema: {
      sessionID: Schema.String,
      presentationID: Schema.String,
      approvalMessageID: Schema.String,
      projectID: Schema.String,
      memberID: Schema.String,
      planRevisionID: Schema.String,
      validationRecordID: Schema.String,
      revisionHash: Schema.String,
      validationHash: Schema.String,
      contextHash: Schema.String,
      policyHash: Schema.String,
      taskHash: Schema.String,
      callID: Schema.String,
      childSessionID: Schema.String,
      parentSessionID: Schema.String,
      agent: Schema.String,
    },
  })
  export type Reserved = typeof Reserved.Type

  export const ReservedV2 = Event.define({
    type: "maestro.approval.reserved",
    durable: { version: 2, aggregate: "sessionID" },
    schema: {
      sessionID: Schema.String,
      presentationID: Schema.String,
      approvalMessageID: Schema.String,
      projectID: Schema.String,
      memberID: Schema.String,
      planRevisionID: Schema.String,
      validationRecordID: Schema.String,
      revisionHash: Schema.String,
      validationHash: Schema.String,
      contextHash: Schema.String,
      policyHash: Schema.String,
      taskHash: Schema.String,
      callID: Schema.String,
      childSessionID: Schema.String,
      parentSessionID: Schema.String,
      agent: Schema.String,
      permission: Schema.Array(
        Schema.Struct({
          permission: Schema.String,
          pattern: Schema.String,
          action: Schema.Literals(["allow", "deny", "ask"]),
        }),
      ),
    },
  })
  export type ReservedV2 = typeof ReservedV2.Type

  export const ConsumedV2 = Event.define({
    type: "maestro.approval.consumed",
    durable: { version: 2, aggregate: "sessionID" },
    schema: {
      sessionID: Schema.String,
      presentationID: Schema.String,
      approvalMessageID: Schema.String,
      taskHash: Schema.String,
      callID: Schema.String,
      childSessionID: Schema.String,
    },
  })
  export type ConsumedV2 = typeof ConsumedV2.Type
}

export namespace Admission {
  const KnownFact = Schema.Struct({
    text: Schema.String,
    source: Schema.Literals(["stakeholder", "orientation"]),
  })
  const Proposal = Schema.Struct({
    text: Schema.String,
    source: Schema.Literal("maestro"),
  })
  const Assessment = Schema.Struct({
    kind: Schema.Literals(["orient", "work"]),
    goal: Schema.optional(Schema.String),
    known: Schema.Array(KnownFact),
    proposals: Schema.Array(Proposal),
    unknowns: Schema.Array(Schema.String),
    uncertainty: Schema.String,
    activeWorkEffect: Schema.Literals(["none", "new-scope-or-revision"]),
    reason: Schema.String,
  })

  export const Decided = Event.define({
    type: "maestro.admission.decided",
    durable: { version: 1, aggregate: "sessionID" },
    schema: {
      sessionID: Schema.String,
      messageID: Schema.String,
      methodVersion: Schema.String,
      outcome: Schema.Literals(["ORIENT", "CLARIFY", "READY_TO_DRAFT"]),
      reason: Schema.optional(
        Schema.Literals(["invalid-assessment", "missing-usable-goal", "material-blocker", "active-work-conflict"]),
      ),
      assessment: Schema.optional(Assessment),
    },
  })
  export type Decided = typeof Decided.Type
}

export namespace PlanRevision {
  const Field = Schema.Struct({
    value: Schema.String,
    source: Schema.Literals(["stakeholder", "maestro", "orientation"]),
  })

  export const Recorded = Event.define({
    type: "maestro.plan_revision.recorded",
    durable: { version: 1, aggregate: "sessionID" },
    schema: {
      id: Schema.String,
      sessionID: Schema.String,
      admissionMessageID: Schema.String,
      methodVersion: Schema.String,
      revision: Schema.Literal("v1"),
      goal: Field,
      acceptance: Schema.Array(Field),
      scope: Schema.Array(Field),
      constraints: Schema.Array(Field),
      reviewRequirement: Field,
      contextRequirement: Schema.Literal("PENDING"),
      assumptions: Schema.Array(Field),
      risks: Schema.Array(Field),
      status: Schema.Literal("PROPOSED"),
      revisionHash: Schema.String,
      createdAt: NonNegativeInt,
    },
  })
  export type Recorded = typeof Recorded.Type

  export const RecordedV2 = Event.define({
    type: Recorded.type,
    durable: { version: 2, aggregate: "sessionID" },
    schema: {
      ...Recorded.data.fields,
      revision: Schema.Literal("v2"),
      grounding: MaestroContext.Grounding,
    },
  })
  export type RecordedV2 = typeof RecordedV2.Type
}

export namespace Context {
  export const Recorded = Event.define({
    type: "maestro.context.recorded",
    durable: { version: 1, aggregate: "sessionID" },
    schema: {
      id: Schema.String,
      sessionID: Schema.String,
      planRevisionID: Schema.String,
      projectID: Schema.String,
      directory: Schema.String,
      mode: Schema.Literals(["GROUNDED", "UNGROUNDED"]),
      branch: Schema.String,
      headSHA: Schema.String,
      changedPaths: Schema.Array(Schema.String),
      currentEvidenceIdentityHash: Schema.String,
      contextHash: Schema.String,
      status: Schema.Literal("CURRENT"),
      createdAt: NonNegativeInt,
    },
  })
  export type Recorded = typeof Recorded.Type

  export const RecordedV2 = Event.define({
    type: Recorded.type,
    durable: { version: 2, aggregate: "sessionID" },
    schema: {
      ...Recorded.data.fields,
      mode: Schema.Literal("GROUNDED"),
      planRevisionHash: Schema.NonEmptyString,
      sourceIdentityHash: Schema.NonEmptyString,
      toolPlan: MaestroContext.ToolPlan,
      skills: Schema.Array(MaestroContext.LoadedSkill).check(Schema.isMinLength(1)),
    },
  })
  export type RecordedV2 = typeof RecordedV2.Type
}

export namespace Clarification {
  export const Decided = Event.define({
    type: "maestro.clarification.decided",
    durable: { version: 1, aggregate: "sessionID" },
    schema: {
      sessionID: Schema.String,
      projectID: Schema.String,
      mode: Schema.Literal("maestro"),
      predecessorID: Schema.String,
      methodVersion: Schema.String,
      decision: Schema.String,
      question: Schema.String,
    },
  })
  export type Decided = typeof Decided.Type
}

export namespace Scope {
  export const Decided = Event.define({
    type: "maestro.scope.decided",
    durable: { version: 1, aggregate: "sessionID" },
    schema: {
      sessionID: Schema.String,
      projectID: Schema.String,
      mode: Schema.Literal("maestro"),
      predecessorID: Schema.String,
      methodVersion: Schema.String,
      scopeID: Schema.String,
    },
  })
  export type Decided = typeof Decided.Type
}

export namespace Held {
  export const Entered = Event.define({
    type: "maestro.held.entered",
    durable: { version: 1, aggregate: "sessionID" },
    schema: {
      sessionID: Schema.String,
      projectID: Schema.String,
      mode: Schema.Literal("maestro"),
      predecessorID: Schema.String,
      reason: Schema.String,
    },
  })
  export type Entered = typeof Entered.Type
}

export namespace Validation {
  export const Recorded = Event.define({
    type: "maestro.validation.recorded",
    durable: { version: 1, aggregate: "sessionID" },
    schema: {
      sessionID: Schema.NonEmptyString,
      planRevisionID: Schema.optional(Schema.NonEmptyString),
      contextRecordID: Schema.optional(Schema.NonEmptyString),
      contextHash: Schema.optional(Schema.NonEmptyString),
      projectID: Schema.NonEmptyString,
      workCardID: Schema.NonEmptyString,
      workCard: Schema.NonEmptyString,
      workCardHash: Schema.NonEmptyString,
      routedMemberID: Schema.NonEmptyString,
      rosterHash: Schema.NonEmptyString,
      grantHash: Schema.NonEmptyString,
      reviewPolicyHash: Schema.NonEmptyString,
      actor: Schema.Struct({
        version: Schema.Literal("rfc8785-v1"),
        bytes: Schema.NonEmptyString,
        sha256: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
      }),
      validatorID: Schema.Literal("maestro"),
      validatorVersion: Schema.NonEmptyString,
      checks: Schema.Array(
        Schema.Struct({
          id: Schema.NonEmptyString,
          status: Schema.Literals(["PASS", "FAIL", "HOLD"]),
          detail: Schema.NonEmptyString,
        }),
      ).check(Schema.isMinLength(1)),
      outcome: Schema.Literals(["VALID", "INVALID", "HOLD"]),
    },
  })
  export type Recorded = typeof Recorded.Type

  export const RecordedV2 = Event.define({
    type: "maestro.validation.recorded",
    durable: { version: 2, aggregate: "sessionID" },
    schema: {
      sessionID: Schema.NonEmptyString,
      planRevisionID: Schema.NonEmptyString,
      contextRecordID: Schema.NonEmptyString,
      contextHash: Schema.NonEmptyString,
      projectID: Schema.NonEmptyString,
      workCardID: Schema.NonEmptyString,
      workCard: Schema.NonEmptyString,
      workCardHash: Schema.NonEmptyString,
      routedMemberID: Schema.NonEmptyString,
      rosterHash: Schema.NonEmptyString,
      grantHash: Schema.NonEmptyString,
      reviewPolicyHash: Schema.NonEmptyString,
      actor: Schema.Struct({
        version: Schema.Literal("rfc8785-v1"),
        bytes: Schema.NonEmptyString,
        sha256: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
      }),
      validatorID: Schema.Literal("maestro"),
      validatorVersion: Schema.NonEmptyString,
      checks: Schema.Array(
        Schema.Struct({
          id: Schema.NonEmptyString,
          status: Schema.Literals(["PASS", "FAIL", "HOLD"]),
          detail: Schema.NonEmptyString,
        }),
      ).check(Schema.isMinLength(1)),
      outcome: Schema.Literals(["VALID", "INVALID", "HOLD"]),
    },
  })
  export type RecordedV2 = typeof RecordedV2.Type

  export const RecordedV3 = Event.define({
    type: "maestro.validation.recorded",
    durable: { version: 3, aggregate: "sessionID" },
    schema: {
      sessionID: Schema.NonEmptyString,
      planRevisionID: Schema.NonEmptyString,
      contextRecordID: Schema.NonEmptyString,
      contextHash: Schema.NonEmptyString,
      reviewBaseSHA: Schema.String.check(Schema.isPattern(/^[0-9a-f]{40}$/)),
      projectID: Schema.NonEmptyString,
      workCardID: Schema.NonEmptyString,
      workCard: Schema.NonEmptyString,
      workCardHash: Schema.NonEmptyString,
      routedMemberID: Schema.NonEmptyString,
      rosterHash: Schema.NonEmptyString,
      grantHash: Schema.NonEmptyString,
      reviewPolicyHash: Schema.NonEmptyString,
      actor: Schema.Struct({
        version: Schema.Literal("rfc8785-v1"),
        bytes: Schema.NonEmptyString,
        sha256: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
      }),
      validatorID: Schema.Literal("maestro"),
      validatorVersion: Schema.NonEmptyString,
      checks: Schema.Array(
        Schema.Struct({
          id: Schema.NonEmptyString,
          status: Schema.Literals(["PASS", "FAIL", "HOLD"]),
          detail: Schema.NonEmptyString,
        }),
      ).check(Schema.isMinLength(1)),
      outcome: Schema.Literals(["VALID", "INVALID", "HOLD"]),
    },
  })
  export type RecordedV3 = typeof RecordedV3.Type
}

export namespace Review {
  export const Received = Event.define({
    type: "maestro.review.received",
    durable: { version: 1, aggregate: "sessionID" },
    schema: {
      sessionID: Schema.NonEmptyString,
      projectID: Schema.NonEmptyString,
      validationRecordID: Schema.NonEmptyString,
      workCardHash: Schema.NonEmptyString,
      routedMemberID: Schema.NonEmptyString,
      rosterHash: Schema.NonEmptyString,
      grantHash: Schema.NonEmptyString,
      reviewPolicyHash: Schema.NonEmptyString,
      actor: Schema.Struct({
        version: Schema.Literal("rfc8785-v1"),
        bytes: Schema.NonEmptyString,
        sha256: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
      }),
      reviewerID: Schema.Literal("lucy"),
      reviewMethodVersion: Schema.NonEmptyString,
      artifact: Schema.Struct({
        workCardHash: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
        sha256: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
        baseSHA: Schema.NonEmptyString,
        headSHA: Schema.NonEmptyString,
        worktree: Schema.NonEmptyString,
        changedPaths: Schema.Array(Schema.NonEmptyString),
        bytes: Schema.NonEmptyString,
      }),
      verdict: Schema.Literals(["APPROVE", "FIX_FIRST", "REJECT"]),
      findings: Schema.Array(
        Schema.Struct({ path: Schema.NonEmptyString, line: PositiveInt, message: Schema.NonEmptyString }),
      ),
    },
  })
  export type Received = typeof Received.Type

  // Binds the receipt to the reviewed diff by digest; the server recomputes the diff, so the bytes
  // never have to travel through the model or into the event log.
  export const ReceivedV2 = Event.define({
    type: Received.type,
    durable: { version: 2, aggregate: "sessionID" },
    schema: {
      ...Received.data.fields,
      artifact: Schema.Struct({
        workCardHash: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
        sha256: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
        baseSHA: Schema.NonEmptyString,
        headSHA: Schema.NonEmptyString,
        worktree: Schema.NonEmptyString,
        changedPaths: Schema.Array(Schema.NonEmptyString),
      }),
    },
  })
  export type ReceivedV2 = typeof ReceivedV2.Type
}

export namespace Authorization {
  export const Granted = Event.define({
    type: "maestro.authorization.granted",
    durable: { version: 1, aggregate: "sessionID" },
    schema: {
      sessionID: Schema.NonEmptyString,
      projectID: Schema.NonEmptyString,
      approvalMessageID: Schema.NonEmptyString,
      validationRecordID: Schema.NonEmptyString,
      workCardHash: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
      routedMemberID: Schema.NonEmptyString,
      rosterHash: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
      grantHash: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
      reviewPolicyHash: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
      actor: Schema.Struct({
        version: Schema.Literal("rfc8785-v1"),
        bytes: Schema.NonEmptyString,
        sha256: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
      }),
      reviewerID: Schema.Literal("lucy"),
      taskIntentHash: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
      methodVersion: Schema.NonEmptyString,
    },
  })
  export type Granted = typeof Granted.Type
}

export namespace Dispatch {
  export const Reserved = Event.define({
    type: "maestro.dispatch.reserved",
    durable: { version: 1, aggregate: "sessionID" },
    schema: {
      sessionID: Schema.NonEmptyString,
      authorizationID: Schema.NonEmptyString,
      childSessionID: Schema.NonEmptyString,
      projectID: Schema.NonEmptyString,
      routedMemberID: Schema.NonEmptyString,
      taskIntentHash: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
    },
  })
  export type Reserved = typeof Reserved.Type

  export const ReservedV2 = Event.define({
    type: "maestro.dispatch.reserved",
    durable: { version: 2, aggregate: "sessionID" },
    schema: {
      sessionID: Schema.NonEmptyString,
      authorizationID: Schema.NonEmptyString,
      childSessionID: Schema.NonEmptyString,
      projectID: Schema.NonEmptyString,
      routedMemberID: Schema.NonEmptyString,
      taskIntentHash: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
      permission: Schema.Array(
        Schema.Struct({
          permission: Schema.String,
          pattern: Schema.String,
          action: Schema.Literals(["allow", "deny", "ask"]),
        }),
      ),
    },
  })
  export type ReservedV2 = typeof ReservedV2.Type
}

export const Definitions = Event.inventory(
  Approval.Presented,
  Approval.Decided,
  Approval.Consumed,
  Approval.Reserved,
  Approval.ReservedV2,
  Approval.ConsumedV2,
  Admission.Decided,
  PlanRevision.Recorded,
  PlanRevision.RecordedV2,
  Context.Recorded,
  Context.RecordedV2,
  Clarification.Decided,
  Scope.Decided,
  Held.Entered,
  Validation.Recorded,
  Validation.RecordedV2,
  Validation.RecordedV3,
  Review.Received,
  Review.ReceivedV2,
  Authorization.Granted,
  Dispatch.Reserved,
  Dispatch.ReservedV2,
)
