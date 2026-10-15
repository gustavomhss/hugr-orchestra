import { afterEach, describe, expect } from "bun:test"
import { Database } from "@orchestra/core/database/database"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { filesystem } from "@orchestra/core/effect/app-node-platform"
import { EventTable } from "@orchestra/core/event/sql"
import { ModelV2 } from "@orchestra/core/model"
import { Npm } from "@orchestra/core/npm"
import { ProviderV2 } from "@orchestra/core/provider"
import { Cause, Effect, Exit, Schema } from "effect"
import { Agent } from "@/agent/agent"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Git } from "@/git"
import { Config } from "@/config/config"
import { Skill } from "@/skill"
import { MessageID, SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import { SessionProjector } from "@orchestra/core/session/projector"
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
  workCard: [
    "# Card",
    "## Definition of Done",
    "Tool boundary evidence is recorded.",
    "## Invariants",
    "A rejected call persists no receipt.",
    "## Quality Standards",
    "Focused tool tests pass.",
    "## Completeness Criteria",
    "Every rejection path is exercised.",
    "## Success Criteria",
    "Maestro records validation only through the tool boundary.",
    "",
  ].join("\n"),
  routedMemberID: "backend",
  validatorVersion: "validation-v1",
  checks: [{ id: "typecheck", status: "PASS" as const, detail: "clean" }],
}

const headings =
  "## Definition of Done, ## Invariants, ## Quality Standards, ## Completeness Criteria, ## Success Criteria"

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
      const general = yield* agents.get("general")
      if (!maestro || !lucy || !general) throw new Error("expected native agents")
      const ref = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") }

      expect((yield* registry.tools({ ...ref, agent: maestro })).map((tool) => tool.id)).toContain(
        "maestro_record_validation",
      )
      expect((yield* registry.tools({ ...ref, agent: lucy })).map((tool) => tool.id)).toContain("maestro_record_review")
      expect((yield* registry.tools({ ...ref, agent: general })).map((tool) => tool.id)).not.toContain(
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
              sha256: "a".repeat(64),
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

  direct.instance("rejects work cards that break the five-section contract before reading evidence", () =>
    Effect.gen(function* () {
      const tool = yield* MaestroRecordValidationTool
      const def = yield* tool.init()
      const success = "## Success Criteria\nMaestro records validation only through the tool boundary.\n"
      const quality = "## Quality Standards\nFocused tool tests pass.\n"
      const cards = [
        [validation.workCard.replace(success, ""), "missing-section (## Success Criteria)"],
        [`${validation.workCard}## Invariants\nA second copy.\n`, "duplicate-section (## Invariants)"],
        [validation.workCard.replace(quality, "## Quality Standards\n"), "empty-section (## Quality Standards)"],
        [
          validation.workCard.replace("## Completeness Criteria", "### Completeness Criteria"),
          "malformed-heading (## Completeness Criteria)",
        ],
        [
          validation.workCard.replace(success, "").replace(quality, "## Quality Standards\n"),
          "missing-section (## Success Criteria); empty-section (## Quality Standards)",
        ],
        ["# Card\nTool boundary evidence.\n", `missing-section (${headings})`],
      ] as const
      yield* Effect.forEach(cards, ([workCard, offending]) =>
        Effect.gen(function* () {
          const rejected = yield* Effect.exit(def.execute({ ...validation, workCard }, context("maestro")))
          expect(Exit.isFailure(rejected)).toBe(true)
          if (Exit.isFailure(rejected))
            expect(Cause.pretty(rejected.cause)).toContain(
              `Validation rejected workCard: ${offending}. Write exactly one non-empty section under each of these exact headings, each alone on its line at column zero and outside code fences: ${headings}.`,
            )
        }),
      )
      const { db } = yield* Database.Service
      expect(yield* db.select().from(EventTable).all().pipe(Effect.orDie)).toHaveLength(0)
      // A conforming card passes the contract gate and reaches the evidence checks.
      const valid = yield* Effect.exit(def.execute(validation, context("maestro")))
      expect(Exit.isFailure(valid)).toBe(true)
      if (Exit.isFailure(valid)) {
        expect(Cause.pretty(valid.cause)).toContain("Validation planRevisionID not found")
        expect(Cause.pretty(valid.cause)).not.toContain("Validation rejected workCard")
      }
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
            sha256: "a".repeat(64),
          },
          checks: validation.checks,
        } as never
        for (const caller of [context("Pikachu", "maestro"), context("Pikachu", "Pikachu"), context("Lucy", "Lucy")]) {
          const rejected = yield* Effect.exit(def.execute(review, caller))
          expect(Exit.isFailure(rejected) && Cause.pretty(rejected.cause)).toContain(
            "Review recording requires Pikachu",
          )
        }
      }),
    { config: { agent: { lucy: { name: "Pikachu" } } } },
  )

  direct.instance("uses stable native ID, never display name, for authorization", () =>
    Effect.gen(function* () {
      const tool = yield* MaestroRecordValidationTool
      const def = yield* tool.init()
      const rejected = yield* Effect.exit(def.execute(validation, context("maestro", "general")))

      expect(Exit.isFailure(rejected)).toBe(true)
      if (Exit.isFailure(rejected))
        expect(Cause.pretty(rejected.cause)).toContain("Validation recording requires Maestro")
    }),
  )
})
