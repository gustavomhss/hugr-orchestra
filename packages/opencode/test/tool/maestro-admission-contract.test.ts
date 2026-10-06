import { afterEach, describe, expect, test } from "bun:test"
import { Database } from "@opencode-ai/core/database/database"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { Cause, Effect, Exit, Schema } from "effect"
import { Agent } from "@/agent/agent"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { readAdmission } from "@/maestro/admission-record"
import { IntentAssessment } from "@/maestro/admit-request"
import { MessageID, SessionID } from "@/session/schema"
import { MaestroRecordAdmissionTool } from "@/tool/maestro-admission"
import { ToolJsonSchema } from "@/tool/json-schema"
import { Tool } from "@/tool/tool"
import { Truncate } from "@/tool/truncate"
import { disposeAllInstances } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

afterEach(async () => disposeAllInstances())

const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Agent.node, Database.node, EventV2Bridge.node, Truncate.node]), [
    [RuntimeFlags.node, RuntimeFlags.layer({ pure: true, disableDefaultPlugins: true })],
  ]),
)

const assessment: IntentAssessment = {
  kind: "work",
  goal: "Add dark mode to settings.",
  known: [{ text: "User requested dark mode in settings.", source: "stakeholder" }],
  proposals: [{ text: "Draft scope before implementation.", source: "maestro" }],
  unknowns: [],
  uncertainty: "Theme persistence needs later inspection.",
  activeWorkEffect: "none",
  reason: "Goal is usable for a draft.",
}

const context = (agent = "maestro", agentID?: string): Tool.Context => ({
  sessionID: SessionID.make("ses_admission_contract"),
  messageID: MessageID.make("msg_assistant_call"),
  agent,
  agentID,
  abort: AbortSignal.any([]),
  messages: [2, 1].map((created) => ({
    info: {
      id: MessageID.make(`msg_user_${created}`),
      sessionID: SessionID.make("ses_admission_contract"),
      role: "user",
      agent: "maestro",
      model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") },
      time: { created },
    },
    parts: [],
  })),
  metadata: () => Effect.void,
  ask: () => Effect.void,
})

function skillExample(source: string) {
  // The skill's example is delimited by literal JSON fences; Git may check it out with CRLF.
  const json = source.replaceAll("\r\n", "\n").match(/^```json\n([\s\S]*?)\n```$/m)?.[1]
  if (!json) throw new Error("frame-request must contain a JSON tool payload example")
  return json
}

describe("Maestro admission contract", () => {
  test.each(["\n", "\r\n"])("extracts the literal JSON example with newline %j", (newline) => {
    const json = '{"methodVersion":"admit-request-v1","assessment":{"kind":"work"}}'
    expect(skillExample(["Intro", "```json", json, "```", "Outro"].join(newline))).toBe(json)
  })

  test.each(["{}", "```text\n{}\n```", "```json\n{}", "```json\n\n```"])(
    "rejects missing or empty JSON example fences: %j",
    (source) => {
      expect(() => skillExample(source)).toThrow("frame-request must contain a JSON tool payload example")
    },
  )

  it.instance("advertises provenance and records actual skill example against latest direct user message", () =>
    Effect.gen(function* () {
      const tool = yield* MaestroRecordAdmissionTool
      const def = yield* Tool.init(tool)
      expect(ToolJsonSchema.fromTool(def)).toMatchObject({
        properties: {
          methodVersion: { type: "string", description: expect.stringContaining("admit-request-v1") },
          assessment: {
            type: "object",
            required: expect.arrayContaining(["known", "proposals", "uncertainty", "activeWorkEffect"]),
            properties: {
              known: {
                type: "array",
                items: {
                  type: "object",
                  required: ["text", "source"],
                  properties: {
                    text: { type: "string", pattern: "\\S" },
                    source: { enum: ["stakeholder", "orientation"] },
                  },
                },
              },
              proposals: { type: "array", items: { properties: { source: { enum: ["maestro"] } } } },
              uncertainty: { type: "string", pattern: "\\S" },
              activeWorkEffect: { enum: ["none", "new-scope-or-revision"] },
            },
          },
        },
      })
      const skill = yield* Effect.promise(() =>
        Bun.file(new URL("../../../../.opencode/skills/frame-request/SKILL.md", import.meta.url)).text(),
      )
      const raw = Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(skillExample(skill))
      expect(raw).toHaveProperty("assessment")
      expect(raw).not.toHaveProperty("assessment.outcome")
      const params = Schema.decodeUnknownSync(def.parameters)(raw)
      expect(params.methodVersion).toBe("admit-request-v1")
      expect(params.assessment).not.toHaveProperty("outcome")
      const ctx = context()
      const result = yield* def.execute(params, ctx)
      expect(result.metadata).toMatchObject({ messageID: "msg_user_2", outcome: "READY_TO_DRAFT" })
      expect(
        yield* readAdmission({
          sessionID: ctx.sessionID,
          messageID: "msg_user_2",
          methodVersion: params.methodVersion,
        }),
      ).toEqual({ sessionID: ctx.sessionID, messageID: "msg_user_2", ...params, outcome: "READY_TO_DRAFT" })
    }),
  )

  it.instance("rejects malformed pilot arguments before recording", () =>
    Effect.gen(function* () {
      const tool = yield* MaestroRecordAdmissionTool
      const def = yield* Tool.init(tool)
      const ctx = context()
      yield* Effect.forEach(
        [
          { ...assessment, known: ["User requested dark mode in settings."] },
          { ...assessment, uncertainty: ["Theme persistence needs later inspection."] },
          { ...assessment, activeWorkEffect: undefined },
          { ...assessment, known: [{ text: "Maestro guess.", source: "maestro" }] },
        ],
        (input) =>
          Effect.gen(function* () {
            const result = yield* Effect.exit(
              def.execute({ methodVersion: "admit-request-v1", assessment: input } as never, ctx),
            )
            expect(Exit.isFailure(result)).toBe(true)
            expect(Exit.isFailure(result) && String(Cause.squash(result.cause))).toContain("invalid arguments")
          }),
      )
      expect(
        yield* readAdmission({ sessionID: ctx.sessionID, messageID: "msg_user_2", methodVersion: "admit-request-v1" }),
      ).toBeUndefined()
    }),
  )

  it.instance(
    "authorizes stable native ID after display rename and rejects display-name impersonation",
    () =>
      Effect.gen(function* () {
        const tool = yield* MaestroRecordAdmissionTool
        const def = yield* Tool.init(tool)
        const rejected = yield* Effect.exit(
          def.execute({ methodVersion: "admit-request-v1", assessment }, context("maestro", "build")),
        )
        expect(Exit.isFailure(rejected)).toBe(true)
        expect(Exit.isFailure(rejected) && String(Cause.squash(rejected.cause))).toContain(
          "Admission recording requires Maestro",
        )
        expect(
          yield* def.execute({ methodVersion: "admit-request-v1", assessment }, context("Conductor", "maestro")),
        ).toMatchObject({ metadata: { outcome: "READY_TO_DRAFT" } })
      }),
  )

  it.instance("requires direct user message and retains open method-version input", () =>
    Effect.gen(function* () {
      const tool = yield* MaestroRecordAdmissionTool
      const def = yield* Tool.init(tool)
      const params = { methodVersion: "historical-method", assessment }
      const rejected = yield* Effect.exit(def.execute(params, { ...context(), messages: [] }))
      expect(Exit.isFailure(rejected)).toBe(true)
      expect(Exit.isFailure(rejected) && String(Cause.squash(rejected.cause))).toContain(
        "Admission recording requires direct user message",
      )
      const ctx = context()
      yield* def.execute(params, ctx)
      expect(
        yield* readAdmission({
          sessionID: ctx.sessionID,
          messageID: "msg_user_2",
          methodVersion: params.methodVersion,
        }),
      ).toMatchObject({ methodVersion: "historical-method", outcome: "READY_TO_DRAFT" })
    }),
  )
})
