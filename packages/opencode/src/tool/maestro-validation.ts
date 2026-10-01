import { Effect, FileSystem, Schema } from "effect"
import { Agent } from "@/agent/agent"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Git } from "@/git"
import { Config } from "@/config/config"
import { Session } from "@/session/session"
import { SessionID } from "@/session/schema"
import { SessionTable } from "@opencode-ai/core/session/sql"
import { eq } from "drizzle-orm"
import { recordReview, recordValidation } from "@/maestro/validation-record"
import { readPlanRevision } from "@/maestro/plan-revision"
import { contextIsCurrent, readContext } from "@/maestro/context-record"
import { Database } from "@opencode-ai/core/database/database"
import * as Tool from "./tool"

const Check = Schema.Struct({
  id: Schema.String,
  status: Schema.Literals(["PASS", "FAIL", "HOLD"]),
  detail: Schema.String,
})

const ValidationParameters = Schema.Struct({
  planRevisionID: Schema.optional(Schema.String),
  contextRecordID: Schema.optional(Schema.String),
  contextHash: Schema.optional(Schema.String),
  projectID: Schema.String,
  workCardID: Schema.String,
  workCard: Schema.String,
  routedMemberID: Schema.String,
  validatorVersion: Schema.String,
  checks: Schema.Array(Check),
})

const ReviewParameters = Schema.Struct({
  validationRecordID: Schema.String,
  workCard: Schema.String,
  reviewMethodVersion: Schema.String,
  verdict: Schema.Literals(["APPROVE", "FIX_FIRST", "REJECT"]),
  findings: Schema.Array(
    Schema.Struct({
      path: Schema.String,
      line: Schema.Number,
      message: Schema.String,
    }),
  ),
  artifact: Schema.Struct({
    baseSHA: Schema.NonEmptyString,
    headSHA: Schema.NonEmptyString,
    worktree: Schema.NonEmptyString,
    changedPaths: Schema.Array(Schema.NonEmptyString),
    encoding: Schema.Literal("base64"),
    bytes: Schema.NonEmptyString,
  }),
  checks: Schema.Array(Check),
})

export const MaestroRecordValidationTool = Tool.define(
  "maestro_record_validation",
  Effect.gen(function* () {
    const database = yield* Database.Service
    const events = yield* EventV2Bridge.Service
    const agents = yield* Agent.Service
    const git = yield* Git.Service
    const config = yield* Config.Service
    const fs = yield* FileSystem.FileSystem
    const sessions = yield* Session.Service
    return {
      description: "Record validation evidence for one routed work card. Maestro only.",
      parameters: ValidationParameters,
      strictParameters: {
        planRevisionID: true,
        contextRecordID: true,
        contextHash: true,
        projectID: true,
        workCardID: true,
        workCard: true,
        routedMemberID: true,
        validatorVersion: true,
        checks: [{ id: true, status: true, detail: true }],
      },
      execute: (params: Schema.Schema.Type<typeof ValidationParameters>, ctx) =>
        Effect.gen(function* () {
          const agent = ctx.agentID ? yield* agents.get(ctx.agentID) : undefined
          if (agent?.id !== "maestro" || agent.native !== true) {
            return yield* Effect.fail(new Error("Validation recording requires Maestro"))
          }
          if (!params.planRevisionID || !params.contextRecordID || !params.contextHash)
            return yield* Effect.fail(new Error("Validation requires PlanRevision and current ContextRecord"))
          const plan = yield* readPlanRevision(params.planRevisionID)
          const context = yield* readContext(params.contextRecordID)
          if (!plan || !context || context.planRevisionID !== plan.id || context.contextHash !== params.contextHash)
            return yield* Effect.fail(new Error("Validation context does not match PlanRevision"))
          if (!(yield* contextIsCurrent(context))) return yield* Effect.fail(new Error("Validation context is stale"))
          const sessionRow = yield* database.db
            .select()
            .from(SessionTable)
            .where(eq(SessionTable.id, SessionID.make(ctx.sessionID)))
            .get()
            .pipe(Effect.orDie)
          if (!sessionRow) return yield* Effect.fail(new Error("Validation session not found"))
          const session = Session.fromRow(sessionRow)
          if (
            plan.sessionID !== session.id ||
            context.sessionID !== session.id ||
            context.projectID !== session.projectID ||
            context.directory !== session.directory
          )
            return yield* Effect.fail(new Error("Validation context does not match Session"))
          const record = yield* recordValidation({
            planRevisionID: params.planRevisionID,
            contextRecordID: params.contextRecordID,
            contextHash: params.contextHash,
            projectID: session.projectID,
            sessionID: ctx.sessionID,
            workCardID: params.workCardID,
            workCard: params.workCard,
            routedMemberID: params.routedMemberID,
            validatorID: "maestro",
            validatorVersion: params.validatorVersion,
            checks: params.checks,
          })
          return {
            title: `Validation ${record.outcome}`,
            metadata: { validationRecordID: record.id, outcome: record.outcome },
            output: `${record.outcome}: ${record.id}`,
          }
        }).pipe(
          Effect.provideService(Database.Service, database),
          Effect.provideService(EventV2Bridge.Service, events),
          Effect.provideService(Agent.Service, agents),
          Effect.provideService(Git.Service, git),
          Effect.provideService(Config.Service, config),
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Session.Service, sessions),
          Effect.orDie,
        ),
    }
  }),
)

export const MaestroRecordReviewTool = Tool.define(
  "maestro_record_review",
  Effect.gen(function* () {
    const database = yield* Database.Service
    const events = yield* EventV2Bridge.Service
    const agents = yield* Agent.Service
    const git = yield* Git.Service
    const sessions = yield* Session.Service
    const config = yield* Config.Service
    const fs = yield* FileSystem.FileSystem
    return {
      description: "Record cold review evidence for one validation record. Lucy only.",
      parameters: ReviewParameters,
      strictParameters: {
        validationRecordID: true,
        workCard: true,
        reviewMethodVersion: true,
        verdict: true,
        findings: [{ path: true, line: true, message: true }],
        artifact: {
          baseSHA: true,
          headSHA: true,
          worktree: true,
          changedPaths: [true],
          encoding: true,
          bytes: true,
        },
        checks: [{ id: true, status: true, detail: true }],
      },
      execute: (params: Schema.Schema.Type<typeof ReviewParameters>, ctx) =>
        Effect.gen(function* () {
          const agent = ctx.agentID ? yield* agents.get(ctx.agentID) : undefined
          if (agent?.id !== "lucy" || agent.native !== true) {
            return yield* Effect.fail(new Error("Review recording requires Lucy"))
          }
          const child = yield* sessions.get(SessionID.make(ctx.sessionID))
          if (!child.parentID) return yield* Effect.fail(new Error("Review recording requires Lucy child session"))
          const record = yield* recordReview({ ...params, sessionID: child.parentID, reviewerID: "lucy" })
          return {
            title: `Review ${record.verdict}`,
            metadata: { reviewReceiptID: record.id, verdict: record.verdict },
            output: `${record.verdict}: ${record.id}`,
          }
        }).pipe(
          Effect.provideService(Database.Service, database),
          Effect.provideService(EventV2Bridge.Service, events),
          Effect.provideService(Git.Service, git),
          Effect.provideService(Agent.Service, agents),
          Effect.provideService(Session.Service, sessions),
          Effect.provideService(Config.Service, config),
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.orDie,
        ),
    }
  }),
)
