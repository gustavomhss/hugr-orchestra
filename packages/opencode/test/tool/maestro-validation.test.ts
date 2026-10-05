import { afterEach, describe, expect } from "bun:test"
import { Database } from "@opencode-ai/core/database/database"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { filesystem } from "@opencode-ai/core/effect/app-node-platform"
import { EventTable } from "@opencode-ai/core/event/sql"
import { ModelV2 } from "@opencode-ai/core/model"
import { Npm } from "@opencode-ai/core/npm"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { Cause, Effect, Exit, Schema } from "effect"
import { Agent } from "@/agent/agent"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Git } from "@/git"
import { Config } from "@/config/config"
import { Skill } from "@/skill"
import { MessageID, SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { MaestroRecordReviewTool, MaestroRecordValidationTool } from "@/tool/maestro-validation"
import { ToolRegistry } from "@/tool/registry"
import { Truncate } from "@/tool/truncate"
import type { Tool } from "@/tool/tool"
import { disposeAllInstances } from "../fixture/fixture"
import { NpmTest } from "../fake/npm"
import { testEffect } from "../lib/effect"

afterEach(async () => {
  await disposeAllInstances()
})

const registry = testEffect(
  TestAppNodeBuilder.build(LayerNode.group([Agent.node, ToolRegistry.node]), [
    [Npm.node, NpmTest.noop],
    [RuntimeFlags.node, RuntimeFlags.layer({ pure: true, disableDefaultPlugins: true })],
  ]),
)

const direct = testEffect(
  TestAppNodeBuilder.build(
    LayerNode.group([
      filesystem,
      Config.node,
      Skill.node,
      Agent.node,
      Database.node,
      EventV2Bridge.node,
      Git.node,
      Session.node,
      SessionProjector.node,
      Truncate.node,
    ]),
    [
      [Npm.node, NpmTest.noop],
      [RuntimeFlags.node, RuntimeFlags.layer({ pure: true, disableDefaultPlugins: true })],
    ],
  ),
)

const context = (agent: string, agentID = agent): Tool.Context => ({
  sessionID: SessionID.make("ses_validation_tool"),
  messageID: MessageID.make("msg_validation_tool"),
  agent,
  agentID,
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
})

const validation = {
  planRevisionID: "evt_plan_validation_tool",
  contextRecordID: "evt_context_validation_tool",
  contextHash: "a".repeat(64),
  projectID: "prj_validation_tool",
  workCardID: "card_validation_tool",
  workCard: "# Card\nTool boundary evidence.\n",
  routedMemberID: "charlie",
  validatorVersion: "validation-v1",
  checks: [{ id: "typecheck", status: "PASS" as const, detail: "clean" }],
}

describe("Maestro validation tools", () => {
  direct.instance("advertises required non-empty plan and context bindings", () =>
    Effect.gen(function* () {
      const tool = yield* MaestroRecordValidationTool
      const def = yield* tool.init()
      expect(Schema.toJsonSchemaDocument(def.parameters)).toMatchObject({
        schema: {
          required: expect.arrayContaining(["planRevisionID", "contextRecordID", "contextHash"]),
          properties: {
            planRevisionID: { type: "string", allOf: [{ minLength: 1 }] },
            contextRecordID: { type: "string", allOf: [{ minLength: 1 }] },
            contextHash: { type: "string", allOf: [{ minLength: 1 }] },
            checks: { description: expect.stringContaining("unique check IDs ordered lexicographically") },
          },
        },
      })
    }),
  )

  registry.instance("exposes validation only to Maestro and review only to Lucy", () =>
    Effect.gen(function* () {
      const agents = yield* Agent.Service
      const registry = yield* ToolRegistry.Service
      const maestro = yield* agents.get("maestro")
      const lucy = yield* agents.get("lucy")
      const build = yield* agents.get("build")
      if (!maestro || !lucy || !build) throw new Error("expected native agents")
      const ref = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") }

      expect((yield* registry.tools({ ...ref, agent: maestro })).map((tool) => tool.id)).toContain(
        "maestro_record_validation",
      )
      expect((yield* registry.tools({ ...ref, agent: lucy })).map((tool) => tool.id)).toContain("maestro_record_review")
      expect((yield* registry.tools({ ...ref, agent: build })).map((tool) => tool.id)).not.toContain(
        "maestro_record_validation",
      )
    }),
  )

  direct.instance("rejects unknown nested transcript and history fields before receipt persistence", () =>
    Effect.gen(function* () {
      const validationTool = yield* MaestroRecordValidationTool
      const validationDef = yield* validationTool.init()
      const reviewTool = yield* MaestroRecordReviewTool
      const reviewDef = yield* reviewTool.init()
      const transcript = yield* Effect.exit(
        validationDef.execute(
          { ...validation, checks: [{ ...validation.checks[0], transcript: "forged" }] } as never,
          context("maestro"),
        ),
      )
      const history = yield* Effect.exit(
        reviewDef.execute(
          {
            validationRecordID: "evt_validation",
            workCard: validation.workCard,
            reviewMethodVersion: "review-v1",
            verdict: "APPROVE",
            findings: [{ path: "proof.txt", line: 1, message: "clean", transcript: "forged" }],
            artifact: {
              baseSHA: "a".repeat(40),
              headSHA: "b".repeat(40),
              worktree: "/tmp/worktree",
              changedPaths: [],
              encoding: "base64",
              bytes: "cHJvb2Y=",
              history: [],
            },
            checks: validation.checks,
          } as never,
          context("lucy"),
        ),
      )
      const { db } = yield* Database.Service

      expect(Exit.isFailure(transcript)).toBe(true)
      expect(Exit.isFailure(history)).toBe(true)
      expect(Exit.isFailure(transcript) && String(Cause.squash(transcript.cause))).toContain("unknown parameter")
      expect(Exit.isFailure(history) && String(Cause.squash(history.cause))).toContain("unknown parameter")
      expect(yield* db.select().from(EventTable).all().pipe(Effect.orDie)).toHaveLength(0)
    }),
  )

  direct.instance(
    "names the configured cold reviewer label and never authorizes by it",
    () =>
      Effect.gen(function* () {
        const tool = yield* MaestroRecordReviewTool
        const def = yield* tool.init()
        const review = {
          validationRecordID: "evt_validation",
          workCard: validation.workCard,
          reviewMethodVersion: "review-v1",
          verdict: "APPROVE" as const,
          findings: [],
          artifact: {
            baseSHA: "a".repeat(40),
            headSHA: "b".repeat(40),
            worktree: "/tmp/worktree",
            changedPaths: [],
            encoding: "base64" as const,
            bytes: "cHJvb2Y=",
          },
          checks: validation.checks,
        }
        for (const caller of [context("Pikachu", "build"), context("Pikachu", "Pikachu"), context("Lucy", "Lucy")]) {
          const rejected = yield* Effect.exit(def.execute(review, caller))
          expect(Exit.isFailure(rejected) && Cause.pretty(rejected.cause)).toContain("Review recording requires Pikachu")
        }
      }),
    { config: { agent: { lucy: { name: "Pikachu" } } } },
  )

  direct.instance("uses stable native ID, never display name, for authorization", () =>
    Effect.gen(function* () {
      const tool = yield* MaestroRecordValidationTool
      const def = yield* tool.init()
      const rejected = yield* Effect.exit(def.execute(validation, context("maestro", "build")))

      expect(Exit.isFailure(rejected)).toBe(true)
      if (Exit.isFailure(rejected))
        expect(Cause.pretty(rejected.cause)).toContain("Validation recording requires Maestro")
    }),
  )
})
