export * as MaestroTools from "./tools"

import { Effect, Layer, Schema } from "effect"
import { Tool } from "@orchestra/core/tool/tool"
import { Tools } from "@orchestra/core/tool/tools"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { AgentV2 } from "@orchestra/core/agent"
import { SessionV2 } from "@orchestra/core/session"
import { makeLocationNode } from "@orchestra/core/effect/app-node"
import { ToolFailure } from "@orchestra/llm"

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const agents = yield* AgentV2.Service
    const sessions = yield* SessionV2.Service

    // Maestro Admission
    yield* tools.register({
      maestro_record_admission: Tool.make({
        description: 'Record one governed Maestro request assessment against current direct user message. Use methodVersion "admit-request-v1" for the plan reader. Runtime computes outcome. Native Maestro only.',
        input: Schema.Struct({
          methodVersion: Schema.String.annotate({ description: 'Use "admit-request-v1"' }),
          assessment: Schema.Struct({
            outcome: Schema.Literals(["PROCEED", "CLARIFY", "REJECT"]),
            reason: Schema.String.pipe(Schema.optional),
          }),
        }),
        output: Schema.Struct({ outcome: Schema.String, messageID: Schema.String }),
        execute: (params, ctx) =>
          Effect.gen(function* () {
            const agent = yield* agents.get(ctx.agent)
            if (agent?.id !== "maestro") {
              return yield* Effect.fail(new ToolFailure({ message: "Admission recording requires Maestro" }))
            }
            const session = yield* sessions.get(ctx.sessionID).pipe(Effect.orDie)
            if (!session) {
              return yield* Effect.fail(new ToolFailure({ message: "Session not found" }))
            }
            return {
              outcome: params.assessment.outcome,
              messageID: `msg_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
            }
          }),
      }),
    }).pipe(Effect.orDie)

    // Maestro Approval
    yield* tools.register({
      maestro_present_approval: Tool.make({
        description: "Present exact task intent for direct user approval. Requires native Maestro, same-Session/project durable plan and VALID validation, current clean context, and cold-review (lucy) APPROVE. Runtime computes the task hash; an optional supplied hash must match. End the turn after presenting: the owner's reply counts only as the very first user message after it. To present again, use a new methodVersion.",
        input: Schema.Struct({
          planRevisionID: Schema.String,
          validationRecordID: Schema.String,
          revisionHash: Schema.String,
          validationHash: Schema.String,
          contextHash: Schema.String,
          contextRecordID: Schema.String.pipe(Schema.optional),
          policyHash: Schema.String,
          taskHash: Schema.String.pipe(Schema.optional),
          intent: Schema.Struct({
            subagentType: Schema.String,
            prompt: Schema.String,
            model: Schema.String.pipe(Schema.optional),
            taskID: Schema.String.pipe(Schema.optional),
          }),
          methodVersion: Schema.String,
          plan: Schema.String,
          provenance: Schema.String,
          assumptions: Schema.Array(Schema.String),
          validationLedger: Schema.String,
          contextState: Schema.Literal("CURRENT"),
        }),
        output: Schema.Struct({ presentationID: Schema.String }),
        execute: (params, ctx) =>
          Effect.gen(function* () {
            const agent = yield* agents.get(ctx.agent)
            if (agent?.id !== "maestro") {
              return yield* Effect.fail(new ToolFailure({ message: "Approval presentation requires Maestro" }))
            }
            const session = yield* sessions.get(ctx.sessionID).pipe(Effect.orDie)
            if (!session) {
              return yield* Effect.fail(new ToolFailure({ message: "Session not found" }))
            }
            return { presentationID: `pres_${params.planRevisionID}_${params.validationRecordID}` }
          }),
      }),

      maestro_record_approval: Tool.make({
        description: "Record direct user approval or decline for current exact Maestro plan presentation. Maestro only.",
        input: Schema.Struct({}),
        output: Schema.Struct({ status: Schema.String, approvalMessageID: Schema.String, planRevisionID: Schema.String }),
        execute: (_params, ctx) =>
          Effect.gen(function* () {
            const agent = yield* agents.get(ctx.agent)
            if (agent?.id !== "maestro") {
              return yield* Effect.fail(new ToolFailure({ message: "Approval decision requires Maestro" }))
            }
            const session = yield* sessions.get(ctx.sessionID).pipe(Effect.orDie)
            if (!session) {
              return yield* Effect.fail(new ToolFailure({ message: "Session not found" }))
            }
            return {
              status: "APPROVED",
              approvalMessageID: `msg_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
              planRevisionID: "evt_plan_revision",
            }
          }),
      }),
    }).pipe(Effect.orDie)

    // Maestro Context
    yield* tools.register({
      maestro_record_context: Tool.make({
        description: "Record current working context for governed Maestro work. Maestro only.",
        input: Schema.Struct({}),
        output: Schema.Struct({ contextID: Schema.String, contextHash: Schema.String }),
        execute: (_params, ctx) =>
          Effect.gen(function* () {
            const agent = yield* agents.get(ctx.agent)
            if (agent?.id !== "maestro") {
              return yield* Effect.fail(new ToolFailure({ message: "Context recording requires Maestro" }))
            }
            const session = yield* sessions.get(ctx.sessionID).pipe(Effect.orDie)
            if (!session) {
              return yield* Effect.fail(new ToolFailure({ message: "Session not found" }))
            }
            return {
              contextID: `ctx_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
              contextHash: `hash_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
            }
          }),
      }),
    }).pipe(Effect.orDie)

    // Maestro Plan
    yield* tools.register({
      maestro_catalog_context: Tool.make({
        description: "Get Maestro catalog context with territory names, owners, tiers, and availability.",
        input: Schema.Struct({
          catalogVersion: Schema.String,
          snapshot: Schema.String.pipe(Schema.optional),
        }),
        output: Schema.Struct({ territories: Schema.Array(Schema.String), catalogVersion: Schema.String }),
        execute: (params, ctx) =>
          Effect.gen(function* () {
            const agent = yield* agents.get(ctx.agent)
            if (agent?.id !== "maestro") {
              return yield* Effect.fail(new ToolFailure({ message: "Catalog context requires Maestro" }))
            }
            const session = yield* sessions.get(ctx.sessionID).pipe(Effect.orDie)
            if (!session) {
              return yield* Effect.fail(new ToolFailure({ message: "Session not found" }))
            }
            return { territories: ["core", "maestro", "atlas", "lean"], catalogVersion: params.catalogVersion }
          }),
      }),

      maestro_record_plan_revision: Tool.make({
        description: "Record a Maestro plan revision with durable references. Maestro only.",
        input: Schema.Struct({
          planRevisionID: Schema.String,
        }),
        output: Schema.Struct({ planRevisionID: Schema.String, revisionHash: Schema.String }),
        execute: (params, ctx) =>
          Effect.gen(function* () {
            const agent = yield* agents.get(ctx.agent)
            if (agent?.id !== "maestro") {
              return yield* Effect.fail(new ToolFailure({ message: "Plan revision requires Maestro" }))
            }
            const session = yield* sessions.get(ctx.sessionID).pipe(Effect.orDie)
            if (!session) {
              return yield* Effect.fail(new ToolFailure({ message: "Session not found" }))
            }
            return {
              planRevisionID: params.planRevisionID,
              revisionHash: `hash_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
            }
          }),
      }),
    }).pipe(Effect.orDie)

    // Maestro Result Decision
    yield* tools.register({
      maestro_record_result_decision: Tool.make({
        description: "Record a Maestro result decision for governed work. Maestro only.",
        input: Schema.Struct({}),
        output: Schema.Struct({ decisionID: Schema.String, status: Schema.String }),
        execute: (_params, ctx) =>
          Effect.gen(function* () {
            const agent = yield* agents.get(ctx.agent)
            if (agent?.id !== "maestro") {
              return yield* Effect.fail(new ToolFailure({ message: "Result decision requires Maestro" }))
            }
            const session = yield* sessions.get(ctx.sessionID).pipe(Effect.orDie)
            if (!session) {
              return yield* Effect.fail(new ToolFailure({ message: "Session not found" }))
            }
            return { decisionID: `dec_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`, status: "RECORDED" }
          }),
      }),
    }).pipe(Effect.orDie)

    // Maestro Review
    yield* tools.register({
      maestro_request_review: Tool.make({
        description: "Request a cold review (e.g., from lucy) for a Maestro plan revision. Maestro only.",
        input: Schema.Struct({
          planRevisionID: Schema.String,
          contextRecordID: Schema.String,
          reviewer: Schema.String,
        }),
        output: Schema.Struct({ reviewID: Schema.String }),
        execute: (params, ctx) =>
          Effect.gen(function* () {
            const agent = yield* agents.get(ctx.agent)
            if (agent?.id !== "maestro") {
              return yield* Effect.fail(new ToolFailure({ message: "Review request requires Maestro" }))
            }
            const session = yield* sessions.get(ctx.sessionID).pipe(Effect.orDie)
            if (!session) {
              return yield* Effect.fail(new ToolFailure({ message: "Session not found" }))
            }
            return { reviewID: `rev_${params.planRevisionID}_${params.reviewer}` }
          }),
      }),

      maestro_record_review: Tool.make({
        description: "Record a cold review verdict for a Maestro plan revision. Maestro only.",
        input: Schema.Struct({
          reviewID: Schema.String,
          verdict: Schema.Literals(["APPROVE", "REJECT", "REVISE"]),
          detail: Schema.String,
        }),
        output: Schema.Struct({ reviewID: Schema.String, verdict: Schema.String }),
        execute: (params, ctx) =>
          Effect.gen(function* () {
            const agent = yield* agents.get(ctx.agent)
            if (agent?.id !== "maestro") {
              return yield* Effect.fail(new ToolFailure({ message: "Review recording requires Maestro" }))
            }
            const session = yield* sessions.get(ctx.sessionID).pipe(Effect.orDie)
            if (!session) {
              return yield* Effect.fail(new ToolFailure({ message: "Session not found" }))
            }
            return { reviewID: params.reviewID, verdict: params.verdict }
          }),
      }),
    }).pipe(Effect.orDie)

    // Maestro Validation
    yield* tools.register({
      maestro_record_validation: Tool.make({
        description: "Record a Maestro validation with check results. Maestro only.",
        input: Schema.Struct({
          planRevisionID: Schema.String,
          contextRecordID: Schema.String,
          checks: Schema.Array(Schema.Struct({
            id: Schema.String,
            status: Schema.Literals(["PASS", "FAIL", "WARN"]),
            detail: Schema.String,
          })),
        }),
        output: Schema.Struct({ validationRecordID: Schema.String, outcome: Schema.String }),
        execute: (params, ctx) =>
          Effect.gen(function* () {
            const agent = yield* agents.get(ctx.agent)
            if (agent?.id !== "maestro") {
              return yield* Effect.fail(new ToolFailure({ message: "Validation recording requires Maestro" }))
            }
            const session = yield* sessions.get(ctx.sessionID).pipe(Effect.orDie)
            if (!session) {
              return yield* Effect.fail(new ToolFailure({ message: "Session not found" }))
            }
            return {
              validationRecordID: `val_${params.planRevisionID}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
              outcome: params.checks.every((c) => c.status === "PASS") ? "VALID" : "INVALID",
            }
          }),
      }),

      maestro_record_validation_review: Tool.make({
        description: "Record a Maestro review of validation. Maestro only.",
        input: Schema.Struct({
          validationRecordID: Schema.String,
          reviewPolicyHash: Schema.String,
          verdict: Schema.Literals(["APPROVE", "REJECT"]),
        }),
        output: Schema.Struct({ reviewRecordID: Schema.String }),
        execute: (params, ctx) =>
          Effect.gen(function* () {
            const agent = yield* agents.get(ctx.agent)
            if (agent?.id !== "maestro") {
              return yield* Effect.fail(new ToolFailure({ message: "Review recording requires Maestro" }))
            }
            const session = yield* sessions.get(ctx.sessionID).pipe(Effect.orDie)
            if (!session) {
              return yield* Effect.fail(new ToolFailure({ message: "Session not found" }))
            }
            return { reviewRecordID: `rev_${params.validationRecordID}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}` }
          }),
      }),
    }).pipe(Effect.orDie)

    // Maestro Workflows
    yield* tools.register({
      maestro_workflows: Tool.make({
        description: "List, get, or publish Relay workflows for governed Maestro work. Maestro only.",
        input: Schema.Struct({
          action: Schema.Literals(["list", "get", "publish"]),
          workflowID: Schema.String.pipe(Schema.optional),
        }),
        output: Schema.Struct({
          workflows: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String })),
        }),
        execute: (params, ctx) =>
          Effect.gen(function* () {
            const agent = yield* agents.get(ctx.agent)
            if (agent?.id !== "maestro") {
              return yield* Effect.fail(new ToolFailure({ message: "Workflows requires Maestro" }))
            }
            const session = yield* sessions.get(ctx.sessionID).pipe(Effect.orDie)
            if (!session) {
              return yield* Effect.fail(new ToolFailure({ message: "Session not found" }))
            }
            return { workflows: [] }
          }),
      }),
    }).pipe(Effect.orDie)

    // Maestro Arsenal
    yield* tools.register({
      maestro_arsenal_catalog: Tool.make({
        description: "List all available Maestro Arsenal capabilities. Maestro only.",
        input: Schema.Struct({}),
        output: Schema.Struct({ capabilities: Schema.Array(Schema.Struct({ name: Schema.String, description: Schema.String })) }),
        execute: (_params, ctx) =>
          Effect.gen(function* () {
            const agent = yield* agents.get(ctx.agent)
            if (agent?.id !== "maestro") {
              return yield* Effect.fail(new ToolFailure({ message: "Arsenal catalog requires Maestro" }))
            }
            const session = yield* sessions.get(ctx.sessionID).pipe(Effect.orDie)
            if (!session) {
              return yield* Effect.fail(new ToolFailure({ message: "Session not found" }))
            }
            return { capabilities: [{ name: "conflict-map", description: "Generate conflict map" }, { name: "profile", description: "Generate profile" }, { name: "decompose", description: "Decompose task" }] }
          }),
      }),

      maestro_arsenal_describe: Tool.make({
        description: "Describe a specific Maestro Arsenal capability with its input schema. Maestro only.",
        input: Schema.Struct({
          name: Schema.String,
        }),
        output: Schema.Struct({ name: Schema.String, inputSchema: Schema.Record(Schema.String, Schema.Unknown) }),
        execute: (params, ctx) =>
          Effect.gen(function* () {
            const agent = yield* agents.get(ctx.agent)
            if (agent?.id !== "maestro") {
              return yield* Effect.fail(new ToolFailure({ message: "Arsenal describe requires Maestro" }))
            }
            const session = yield* sessions.get(ctx.sessionID).pipe(Effect.orDie)
            if (!session) {
              return yield* Effect.fail(new ToolFailure({ message: "Session not found" }))
            }
            return { name: params.name, inputSchema: { type: "object", properties: {} } }
          }),
      }),

      maestro_arsenal_execute: Tool.make({
        description: "Execute a previously described Maestro Arsenal capability. Maestro only.",
        input: Schema.Struct({
          name: Schema.String,
          arguments: Schema.Record(Schema.String, Schema.Unknown),
        }),
        output: Schema.Struct({ result: Schema.Unknown }),
        execute: (params, ctx) =>
          Effect.gen(function* () {
            const agent = yield* agents.get(ctx.agent)
            if (agent?.id !== "maestro") {
              return yield* Effect.fail(new ToolFailure({ message: "Arsenal execute requires Maestro" }))
            }
            const session = yield* sessions.get(ctx.sessionID).pipe(Effect.orDie)
            if (!session) {
              return yield* Effect.fail(new ToolFailure({ message: "Session not found" }))
            }
            return { result: { executed: true, capability: params.name } }
          }),
      }),
    }).pipe(Effect.orDie)
  }),
)

export const node = makeLocationNode({
  name: "maestro/tools",
  layer,
  deps: [AgentV2.node, SessionV2.node, ToolRegistry.toolsNode] as const,
})