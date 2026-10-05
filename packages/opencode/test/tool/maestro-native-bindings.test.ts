import { afterEach, describe, expect } from "bun:test"
import path from "node:path"
import { publishTerritoryCatalog } from "@opencode-ai/atlas-boundary"
import { materializeStaticOwnSnapshot, parseOwnSnapshot } from "@opencode-ai/atlas-boundary/materialize"
import { Database } from "@opencode-ai/core/database/database"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { filesystem } from "@opencode-ai/core/effect/app-node-platform"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { Cause, Effect, Exit, FileSystem, Schema } from "effect"
import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Git } from "@/git"
import { recordAdmission } from "@/maestro/admission-record"
import { readContext } from "@/maestro/context-record"
import { readPlanRevision } from "@/maestro/plan-revision"
import { readValidation, validationRecordHash, workCardHash } from "@/maestro/validation-record"
import { MessageID } from "@/session/schema"
import { Session } from "@/session/session"
import { Skill } from "@/skill"
import { MaestroRecordContextTool } from "@/tool/maestro-context"
import { MaestroRecordPlanRevisionTool } from "@/tool/maestro-plan"
import { MaestroRecordValidationTool } from "@/tool/maestro-validation"
import { Truncate } from "@/tool/truncate"
import { disposeAllInstances, requireInstance, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

afterEach(async () => disposeAllInstances())

const it = testEffect(
  AppNodeBuilder.build(
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
    [[RuntimeFlags.node, RuntimeFlags.layer({ pure: true, disableDefaultPlugins: true, disableExternalSkills: true })]],
  ),
)

const PlanBindings = Schema.Struct({ planRevisionID: Schema.NonEmptyString, revisionHash: Schema.NonEmptyString })
const ContextBindings = Schema.Struct({
  contextRecordID: Schema.NonEmptyString,
  contextHash: Schema.NonEmptyString,
  mode: Schema.Literal("GROUNDED"),
})
const ValidationBindings = Schema.Struct({
  validationRecordID: Schema.NonEmptyString,
  validationHash: Schema.NonEmptyString,
  policyHash: Schema.NonEmptyString,
  workCardHash: Schema.NonEmptyString,
  reviewBaseSHA: Schema.NonEmptyString,
})

function bindings(output: string) {
  const lines = output.split("\n").filter((line) => line.startsWith("Bindings: "))
  expect(lines).toHaveLength(1)
  return Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(lines[0].slice("Bindings: ".length))
}

const command = Effect.fn("NativeBindingsTest.git")(function* (directory: string, args: string[]) {
  const git = yield* Git.Service
  const result = yield* git.run(args, { cwd: directory })
  expect(result.exitCode).toBe(0)
  expect(result.truncated).toBe(false)
  return result
})

const prepare = Effect.fn("NativeBindingsTest.prepare")(function* () {
  const instance = yield* requireInstance
  const test = yield* TestInstance
  const fs = yield* FileSystem.FileSystem
  yield* fs.writeFileString(
    path.join(test.directory, "opencode.json"),
    JSON.stringify({
      $schema: "https://opencode.ai/config.json",
      maestro: { atlas: { projectID: instance.project.id, directory: ".atlas" } },
      tool_output: { max_lines: 1, max_bytes: 1 },
    }),
  )
  // Pin the fixture's baseline independently of the developer's Git defaults.
  yield* command(test.directory, ["branch", "-M", "dev"])
  yield* command(test.directory, ["config", "init.defaultBranch", "dev"])
  yield* command(test.directory, ["checkout", "-b", "bindings-feature"])
  yield* fs.makeDirectory(path.join(test.directory, "src"))
  yield* fs.writeFileString(path.join(test.directory, "src/owned.ts"), "export const owned = 1\n")
  yield* command(test.directory, ["add", "opencode.json", "src/owned.ts"])
  yield* command(test.directory, ["commit", "-m", "bounded sources"])
  const snapshot = parseOwnSnapshot(
    JSON.stringify({
      schemaVersion: 1,
      snapshot: "native-bindings-v1",
      sourceRevision: (yield* command(test.directory, ["rev-parse", "HEAD"])).text().trim(),
      units: [
        {
          unit: { level: "module", id: "module/backend", grounding: null },
          sourceBlobs: {
            "src/owned.ts": (yield* command(test.directory, ["hash-object", "--no-filters", "src/owned.ts"]))
              .text()
              .trim(),
          },
          pack: {
            unit: "Backend owns one stable exported constant.",
            invariants: [
              { nodeId: "owned:contract", tier: "T1", claim: "Owned stays deterministic.", freshness: "FRESH" },
            ],
            shape: { contents: ["src/owned.ts"], owner: "charlie", tier: "T1" },
            edges: { dependents: [], dependencies: [] },
            gotchas: [],
            advisory: [],
            memory: null,
            drill: { finer: [], refresh: { pull: "refresh:backend" }, complement: { pull: "relate:backend" } },
            grounding: { source: "tree" },
            tokenEstimate: 300,
            manifest: { pointers: [], truncated: false },
            pullReachable: [],
            advisoryDropped: 0,
          },
        },
      ],
    }),
  )
  if (!snapshot) throw new Error("canonical Own fixture refused")
  const materialized = materializeStaticOwnSnapshot(snapshot)
  yield* fs.makeDirectory(path.join(test.directory, ".atlas"))
  yield* fs.writeFileString(
    path.join(test.directory, ".atlas/TERRITORY-CATALOG.json"),
    JSON.stringify(
      publishTerritoryCatalog(instance.project.id, [
        { name: "backend", owner: "charlie", tier: "T1", globs: ["src/**"] },
      ]),
    ),
  )
  yield* fs.writeFileString(path.join(test.directory, ".atlas/OWN-SNAPSHOT.json"), JSON.stringify(snapshot))
  yield* Effect.forEach([...materialized.skills, materialized.coverage], (file) =>
    Effect.gen(function* () {
      yield* fs.makeDirectory(path.dirname(path.join(test.directory, ".atlas", file.path)), { recursive: true })
      yield* fs.writeFileString(path.join(test.directory, ".atlas", file.path), file.content)
    }),
  )
  yield* command(test.directory, ["add", ".atlas"])
  yield* command(test.directory, ["commit", "-m", "verified static Own"])
  const sessions = yield* Session.Service
  const session = yield* sessions.create({ title: "native bindings", agent: "maestro" })
  const user = yield* sessions.updateMessage({
    id: MessageID.ascending(),
    role: "user",
    sessionID: session.id,
    agent: "maestro",
    model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") },
    time: { created: Date.now() },
  })
  const admission = yield* recordAdmission({
    sessionID: session.id,
    messageID: user.id,
    methodVersion: "admit-request-v1",
    assessment: {
      kind: "work",
      goal: "Review bounded backend constant",
      known: [],
      proposals: [],
      unknowns: [],
      uncertainty: "low",
      activeWorkEffect: "none",
      reason: "one file, one constant",
    },
  })
  expect(admission.outcome).toBe("READY_TO_DRAFT")
  const caller = {
    sessionID: session.id,
    messageID: user.id,
    agent: "maestro",
    agentID: "maestro",
    abort: AbortSignal.any([]),
    messages: [],
    metadata: () => Effect.void,
    ask: () => Effect.void,
  }
  return {
    session,
    directory: test.directory,
    caller,
    input: {
      admissionMessageID: user.id,
      methodVersion: "draft-plan-v2",
      goal: { value: "Review bounded backend constant", source: "stakeholder" as const },
      acceptance: [{ value: "Exact source and Own hashes verified", source: "maestro" as const }],
      scope: [{ value: "backend", source: "maestro" as const }],
      units: ["module/backend"],
      constraints: [],
      reviewRequirement: { value: "Lucy", source: "maestro" as const },
      assumptions: [],
      risks: [],
    },
  }
})

describe("Maestro native output bindings", () => {
  it.instance(
    "hands off output-only plan/context/validation bindings without team execution or truncating Own",
    () =>
      Effect.gen(function* () {
        const data = yield* prepare()
        const planTool = yield* MaestroRecordPlanRevisionTool
        const planDef = yield* planTool.init()
        const planResult = yield* planDef.execute(data.input, data.caller)
        const plan = Schema.decodeUnknownSync(PlanBindings)(bindings(planResult.output))
        expect(planResult.metadata.truncated).toBe(false)
        const truncate = yield* Truncate.Service
        expect((yield* truncate.output(planResult.output)).truncated).toBe(true)
        expect(planResult.output.startsWith(`PROPOSED: ${plan.planRevisionID}\n\nBindings: `)).toBe(true)
        expect((yield* readPlanRevision(plan.planRevisionID))?.revisionHash).toBe(plan.revisionHash)

        const contextTool = yield* MaestroRecordContextTool
        const contextDef = yield* contextTool.init()
        const contextResult = yield* contextDef.execute({ planRevisionID: plan.planRevisionID }, data.caller)
        const context = Schema.decodeUnknownSync(ContextBindings)(bindings(contextResult.output))
        const persistedContext = yield* readContext(context.contextRecordID)
        if (!persistedContext || persistedContext.mode !== "GROUNDED") throw new Error("missing grounded context")
        expect(context.contextHash).toBe(persistedContext.contextHash)
        expect(contextResult.output).toBe(
          [
            `GROUNDED: ${context.contextRecordID}`,
            `Bindings: ${JSON.stringify(context)}`,
            ...persistedContext.skills.map(
              (skill) => `<skill_content name="${skill.name}">\n${skill.content}\n</skill_content>`,
            ),
          ].join("\n\n"),
        )
        expect(contextResult.output.split("\n").length).toBeGreaterThan((yield* truncate.limits()).maxLines)
        expect((yield* truncate.output(contextResult.output)).truncated).toBe(true)
        expect(contextResult.metadata.truncated).toBe(false)

        const workCard = [
          "# Card",
          "Scope: src/owned.ts only.",
          "## Definition of Done",
          "owned exports 1 and the exact Own receipt is verified.",
          "## Invariants",
          "No file outside src/owned.ts changes.",
          "## Quality Standards",
          "The Git blob and Own receipt are checked, not assumed.",
          "## Completeness Criteria",
          "The single exported constant is covered.",
          "## Success Criteria",
          "Lucy can review the bounded backend change against this card.",
          "",
        ].join("\n")
        const checks = [{ id: "source", status: "PASS" as const, detail: "Exact Git blob and Own receipt verified" }]
        const validationTool = yield* MaestroRecordValidationTool
        const validationDef = yield* validationTool.init()
        const params = {
          planRevisionID: plan.planRevisionID,
          contextRecordID: context.contextRecordID,
          contextHash: context.contextHash,
          projectID: data.session.projectID,
          workCardID: "bounded-backend",
          workCard,
          routedMemberID: "charlie",
          validatorVersion: "validation-v1",
          checks,
        }
        const result = yield* validationDef.execute(params, data.caller)
        const validation = Schema.decodeUnknownSync(ValidationBindings)(bindings(result.output))
        expect(result.metadata.truncated).toBe(false)
        expect((yield* truncate.output(result.output)).truncated).toBe(true)
        const persisted = yield* readValidation(validation.validationRecordID)
        if (!persisted) throw new Error("missing persisted validation")
        expect(result.output.startsWith(`VALID: ${validation.validationRecordID}\n\nBindings: `)).toBe(true)
        expect(validation.validationHash).toBe(validationRecordHash(persisted))
        expect(validation.policyHash).toBe(persisted.reviewPolicyHash)
        expect(validation.workCardHash).toBe(workCardHash(workCard))
        expect(persisted.contextHash).toBe(context.contextHash)
        expect(persisted.planRevisionID).toBe(plan.planRevisionID)
        expect(validation.reviewBaseSHA).toBe((yield* command(data.directory, ["rev-parse", "dev"])).text().trim())

        const sessions = yield* Session.Service

        yield* Effect.forEach(["planRevisionID", "contextRecordID", "contextHash"] as const, (field) =>
          Effect.gen(function* () {
            const required = yield* Effect.exit(
              validationDef.execute({ ...params, [field]: undefined } as never, data.caller),
            )
            const empty = yield* Effect.exit(validationDef.execute({ ...params, [field]: "" }, data.caller))
            expect(Exit.isFailure(required)).toBe(true)
            expect(Exit.isFailure(empty)).toBe(true)
            if (Exit.isFailure(required)) expect(Cause.pretty(required.cause)).toContain(field)
            if (Exit.isFailure(empty)) expect(Cause.pretty(empty.cause)).toContain(field)
          }),
        )
        const forged = yield* Effect.exit(
          validationDef.execute({ ...params, contextHash: "f".repeat(64) }, data.caller),
        )
        expect(Exit.isFailure(forged)).toBe(true)
        if (Exit.isFailure(forged))
          expect(Cause.pretty(forged.cause)).toContain("Validation contextHash does not match ContextRecord")
        const foreign = yield* sessions.create({ title: "foreign session" })
        const wrongSession = yield* Effect.exit(
          validationDef.execute(params, { ...data.caller, sessionID: foreign.id }),
        )
        expect(Exit.isFailure(wrongSession)).toBe(true)
        if (Exit.isFailure(wrongSession))
          expect(Cause.pretty(wrongSession.cause)).toContain("Validation context does not match Session")

        const fs = yield* FileSystem.FileSystem
        yield* fs.writeFileString(path.join(data.directory, "src/owned.ts"), "export const owned = 99\n")
        yield* command(data.directory, ["add", "src/owned.ts"])
        yield* command(data.directory, ["commit", "-m", "source drift"])
        const stale = yield* Effect.exit(validationDef.execute(params, data.caller))
        expect(Exit.isFailure(stale)).toBe(true)
        if (Exit.isFailure(stale))
          expect(Cause.pretty(stale.cause)).toContain(
            "Validation context is stale: HEAD, the working tree or the Own source changed since the context was recorded; record a new plan revision",
          )
        const drifted = yield* Effect.exit(planDef.execute(data.input, data.caller))
        expect(Exit.isFailure(drifted)).toBe(true)
        if (Exit.isFailure(drifted)) {
          expect(Cause.pretty(drifted.cause)).toContain(
            "artifacts-invalid: source blob drift: module/backend -> src/owned.ts",
          )
          expect(Cause.pretty(drifted.cause)).toContain(
            "Own artifacts are stale against the current source or their snapshot and must be re-materialized by the owner or a maintainer",
          )
        }
        expect(
          Exit.isFailure(yield* Effect.exit(contextDef.execute({ planRevisionID: plan.planRevisionID }, data.caller))),
        ).toBe(true)
      }),
    { git: true },
    300_000,
  )
})
