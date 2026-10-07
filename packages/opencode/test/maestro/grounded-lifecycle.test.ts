import { createHash } from "node:crypto"
import { expect } from "bun:test"
import path from "node:path"
import { Effect, FileSystem } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { EventTable } from "@opencode-ai/core/event/sql"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { filesystem } from "@opencode-ai/core/effect/app-node-platform"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { publishTerritoryCatalog } from "@opencode-ai/atlas-boundary"
import { materializeStaticOwnSnapshot, parseOwnSnapshot } from "@opencode-ai/atlas-boundary/materialize"
import { EventV2 } from "@opencode-ai/core/event"
import { MaestroEvent } from "@opencode-ai/schema/maestro-event"
import { Config } from "../../src/config/config"
import { Git } from "../../src/git"
import { Session } from "../../src/session/session"
import type { SessionPrompt } from "../../src/session/prompt"
import { Skill } from "../../src/skill"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { recordAdmission } from "../../src/maestro/admission-record"
import { recordPlanRevision, readPlanRevision } from "../../src/maestro/plan-revision"
import { contextIsCurrent, readContext, recordContext } from "../../src/maestro/context-record"
import { recordValidation } from "../../src/maestro/validation-record"
import { recordReview, validationRecordHash } from "../../src/maestro/validation-record"
import { grantAuthorization } from "../../src/maestro/authorization"
import { presentApprovalFromSession, recordApproval } from "../../src/maestro/approval-record"
import { renderPresentation } from "../../src/maestro/approval"
import { Agent } from "../../src/agent/agent"
import { BackgroundJob } from "../../src/background/job"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { Truncate } from "../../src/tool/truncate"
import { TaskTool } from "../../src/tool/task"
import { MessageID, PartID } from "../../src/session/schema"
import { AtlasContextHeld } from "../../src/maestro/atlas-source"
import { requireInstance, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(
  LayerNode.compile(
    LayerNode.group([
      filesystem,
      Config.node,
      Git.node,
      Session.node,
      Skill.node,
      Database.node,
      EventV2Bridge.node,
      SessionProjector.node,
      Agent.node,
      BackgroundJob.node,
      RuntimeFlags.node,
      Truncate.node,
      CrossSpawnSpawner.node,
      Ripgrep.node,
    ]),
  ),
)

const prepare = Effect.fn("GroundedLifecycleTest.prepare")(function* () {
  const instance = yield* requireInstance
  const test = yield* TestInstance
  const fs = yield* FileSystem.FileSystem
  const git = yield* Git.Service
  yield* fs.writeFileString(
    path.join(test.directory, "opencode.json"),
    JSON.stringify({
      $schema: "https://opencode.ai/config.json",
      maestro: { atlas: { projectID: instance.project.id, directory: ".atlas" } },
    }),
  )
  yield* fs.makeDirectory(path.join(test.directory, "src"))
  yield* fs.writeFileString(path.join(test.directory, "src/owned.ts"), "export const owned = 1\n")
  expect((yield* git.run(["checkout", "-b", "grounded-feature"], { cwd: test.directory })).exitCode).toBe(0)
  yield* git.run(["add", "opencode.json", "src/owned.ts"], { cwd: test.directory })
  expect((yield* git.run(["commit", "-m", "grounded sources"], { cwd: test.directory })).exitCode).toBe(0)
  const sourceRevision = (yield* git.run(["rev-parse", "HEAD"], { cwd: test.directory })).text().trim()
  const blob = (yield* git.run(["hash-object", "--no-filters", "src/owned.ts"], { cwd: test.directory })).text().trim()
  const snapshot = parseOwnSnapshot(
    JSON.stringify({
      schemaVersion: 1,
      snapshot: "grounded-test-v1",
      sourceRevision,
      units: [
        {
          unit: { level: "module", id: "module/backend", grounding: null },
          sourceBlobs: { "src/owned.ts": blob },
          pack: {
            unit: "Backend owns exact source behavior.",
            invariants: [
              {
                nodeId: "owned:contract",
                tier: "T1",
                claim: "Owned source exposes one stable constant.",
                freshness: "FRESH",
              },
            ],
            shape: { contents: ["src/owned.ts"], owner: "backend", tier: "T1" },
            edges: { dependents: [], dependencies: [] },
            gotchas: [],
            advisory: [],
            memory: null,
            drill: { finer: [], refresh: { pull: "refresh:backend" }, complement: { pull: "relate:backend" } },
            grounding: { source: "tree" },
            tokenEstimate: 30,
            manifest: { pointers: [], truncated: false },
            pullReachable: [],
            advisoryDropped: 0,
          },
        },
      ],
    }),
  )
  if (!snapshot) throw new Error("fixture rejected by canonical parser")
  const materialized = materializeStaticOwnSnapshot(snapshot)
  yield* fs.makeDirectory(path.join(test.directory, ".atlas"))
  yield* fs.writeFileString(
    path.join(test.directory, ".atlas/TERRITORY-CATALOG.json"),
    JSON.stringify(
      publishTerritoryCatalog(instance.project.id, [
        { name: "backend", owner: "backend", tier: "T1", globs: ["src/**"] },
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
  yield* git.run(["add", ".atlas"], { cwd: test.directory })
  expect((yield* git.run(["commit", "-m", "grounded static context"], { cwd: test.directory })).exitCode).toBe(0)
  const sessions = yield* Session.Service
  const session = yield* sessions.create({ title: "grounded lifecycle", agent: "maestro" })
  const admission = yield* sessions.updateMessage({
    id: MessageID.ascending(),
    role: "user",
    sessionID: session.id,
    agent: "maestro",
    model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") },
    time: { created: Date.now() },
  })
  yield* sessions.updatePart({
    id: PartID.ascending(),
    messageID: admission.id,
    sessionID: session.id,
    type: "text",
    text: "Implement exact backend behavior",
  })
  yield* recordAdmission({
    sessionID: session.id,
    messageID: admission.id,
    methodVersion: "admit-request-v1",
    assessment: {
      kind: "work",
      goal: "Implement exact backend behavior",
      known: [],
      proposals: [],
      unknowns: [],
      uncertainty: "low",
      activeWorkEffect: "none",
      reason: "bounded goal",
    },
  })
  return {
    session,
    test,
    snapshot,
    input: {
      sessionID: session.id,
      admissionMessageID: admission.id,
      methodVersion: "draft-plan-v2",
      goal: { value: "Implement exact backend behavior", source: "stakeholder" as const },
      acceptance: [{ value: "Focused tests pass", source: "maestro" as const }],
      scope: [{ value: "backend", source: "maestro" as const }],
      units: ["module/backend"],
      constraints: [],
      reviewRequirement: { value: "Lucy", source: "maestro" as const },
      assumptions: [],
      risks: [],
      contextRequirement: "PENDING" as const,
    },
  }
})

it.instance(
  "persists V2 grounded plan and actually loaded Own context with exact replay",
  () =>
    Effect.gen(function* () {
      const data = yield* prepare()
      const plan = yield* recordPlanRevision(data.input)
      expect(plan.revision).toBe("v2")
      expect(yield* readPlanRevision(plan.id)).toEqual(plan)
      expect(yield* recordPlanRevision(data.input)).toEqual(plan)
      const context = yield* recordContext(plan.id, data.session.id, true)
      expect(context.mode).toBe("GROUNDED")
      if (context.mode !== "GROUNDED") throw new Error("missing grounding")
      expect(context.toolPlan.planRevision).toEqual({ id: plan.id, hash: plan.revisionHash })
      expect(context.toolPlan.actions.map((action) => action.operation)).toEqual(["load-skill"])
      const skills = yield* Skill.Service
      expect(context.skills[0].content).toBe((yield* skills.require(context.skills[0].name)).content)
      expect(context.skills[0].content).toContain("owned:contract")
      expect(yield* contextIsCurrent(context)).toBe(true)
      expect(yield* readContext(context.id)).toEqual(context)
      expect(yield* recordContext(plan.id, data.session.id, true)).toEqual(context)
      const validation = yield* recordValidation({
        sessionID: data.session.id,
        planRevisionID: plan.id,
        contextRecordID: context.id,
        contextHash: context.contextHash,
        projectID: data.session.projectID,
        workCardID: "grounded-card",
        workCard: [
          "# Card",
          "## Definition of Done",
          "Bounded backend work matches owned:contract.",
          "## Invariants",
          "Owned stays deterministic.",
          "## Quality Standards",
          "The current Own source is verified.",
          "## Completeness Criteria",
          "The single grounded backend unit is covered.",
          "## Success Criteria",
          "The backend specialist returns the grounded result.",
          "",
        ].join("\n"),
        routedMemberID: "backend",
        validatorID: "maestro",
        validatorVersion: "validation-v1",
        checks: [{ id: "source", status: "PASS", detail: "current" }],
      })
      expect(validation.contextHash).toBe(context.contextHash)
      if (!("reviewBaseSHA" in validation) || typeof validation.reviewBaseSHA !== "string")
        throw new Error("missing review baseline")
      const git = yield* Git.Service
      const diff = yield* git.run(
        [
          "diff",
          "--binary",
          "--full-index",
          "--no-ext-diff",
          "--no-renames",
          "--src-prefix=a/",
          "--dst-prefix=b/",
          validation.reviewBaseSHA,
          context.headSHA,
          "--",
          ".",
        ],
        { cwd: data.test.directory },
      )
      const names = yield* git.run(
        [
          "diff",
          "--no-ext-diff",
          "--no-renames",
          "--name-only",
          "-z",
          validation.reviewBaseSHA,
          context.headSHA,
          "--",
          ".",
        ],
        { cwd: data.test.directory },
      )
      yield* recordReview({
        sessionID: data.session.id,
        validationRecordID: validation.id,
        workCard: validation.workCard,
        reviewerID: "lucy",
        reviewMethodVersion: "review-v1",
        verdict: "APPROVE",
        findings: [],
        checks: validation.checks,
        artifact: {
          baseSHA: validation.reviewBaseSHA,
          headSHA: context.headSHA,
          worktree: data.test.directory,
          changedPaths: names.text().split("\0").filter(Boolean),
          sha256: createHash("sha256").update(diff.stdout).digest("hex"),
        },
      })
      const sessions = yield* Session.Service
      const assistant: SessionV1.Assistant = {
        id: MessageID.ascending(),
        parentID: MessageID.make(data.input.admissionMessageID),
        role: "assistant",
        sessionID: data.session.id,
        agent: "maestro",
        mode: "maestro",
        path: { cwd: data.test.directory, root: data.test.directory },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        providerID: ProviderV2.ID.make("test"),
        modelID: ModelV2.ID.make("test"),
        time: { created: Date.now() },
      }
      yield* sessions.updateMessage(assistant)
      const intent = { subagentType: "backend", prompt: "Implement exact backend behavior" }
      const presentation = yield* presentApprovalFromSession({
        sessionID: data.session.id,
        assistantMessageID: assistant.id,
        callID: "grounded-presentation",
        memberID: "maestro",
        planRevisionID: plan.id,
        validationRecordID: validation.id,
        revisionHash: plan.revisionHash,
        validationHash: validationRecordHash(validation),
        contextHash: context.contextHash,
        policyHash: validation.reviewPolicyHash,
        taskHash: "a".repeat(64),
        intent,
        methodVersion: "request-approval-v1",
        plan: plan.goal.value,
        provenance: "verified static Own",
        assumptions: [],
        validationLedger: "VALID",
        contextState: "CURRENT",
      })
      yield* sessions.updatePart({
        id: PartID.ascending(),
        messageID: assistant.id,
        sessionID: data.session.id,
        type: "tool",
        tool: "maestro_present_approval",
        callID: "grounded-presentation",
        state: {
          status: "completed",
          input: {},
          output: renderPresentation(presentation),
          title: "approval",
          metadata: {},
          time: { start: 1, end: 2 },
        },
      })
      const user = yield* sessions.updateMessage({
        id: MessageID.ascending(),
        role: "user",
        sessionID: data.session.id,
        agent: "maestro",
        model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") },
        time: { created: Date.now() },
      })
      yield* sessions.updatePart({
        id: PartID.ascending(),
        messageID: user.id,
        sessionID: data.session.id,
        type: "text",
        text: "approve",
      })
      expect((yield* recordApproval(data.session.id)).status).toBe("APPROVED")
      const authorization = yield* grantAuthorization({
        sessionID: data.session.id,
        validationRecordID: validation.id,
        approvalMessageID: user.id,
      })
      const task = yield* TaskTool
      const def = yield* task.init()
      const result = yield* def.execute(
        {
          description: "grounded backend",
          prompt: intent.prompt,
          subagent_type: "backend",
          authorizationID: authorization.id,
        },
        {
          sessionID: data.session.id,
          messageID: assistant.id,
          agent: "maestro",
          agentID: "maestro",
          abort: new AbortController().signal,
          messages: [],
          metadata: () => Effect.void,
          ask: () => Effect.void,
          extra: {
            promptOps: {
              cancel: () => Effect.void,
              resolvePromptParts: (text: string) => Effect.succeed([{ type: "text", text }]),
              prompt: (input: SessionPrompt.PromptInput) =>
                Effect.gen(function* () {
                  expect(
                    input.parts.some((part) => part.type === "text" && part.text?.includes("owned:contract")),
                  ).toBe(true)
                  const childUser = yield* sessions.updateMessage({
                    id: MessageID.ascending(),
                    role: "user",
                    sessionID: input.sessionID,
                    agent: "backend",
                    model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") },
                    time: { created: Date.now() },
                  })
                  const reply = {
                    ...assistant,
                    id: MessageID.ascending(),
                    parentID: childUser.id,
                    sessionID: input.sessionID,
                    agent: "backend",
                    mode: "backend",
                    finish: "stop",
                    time: { created: Date.now() },
                  }
                  yield* sessions.updateMessage(reply)
                  const text = {
                    id: PartID.ascending(),
                    messageID: reply.id,
                    sessionID: input.sessionID,
                    type: "text" as const,
                    text: "grounded result",
                  }
                  yield* sessions.updatePart(text)
                  return { info: reply, parts: [text] }
                }),
            },
          },
        },
      )
      expect(result.output).toContain("grounded result")
      const database = yield* Database.Service
      const rows = yield* database.db.select().from(EventTable).all().pipe(Effect.orDie)
      expect(rows.find((row) => row.id === plan.id)?.type).toBe(
        EventV2.versionedType(MaestroEvent.PlanRevision.RecordedV2.type, 2),
      )
      expect(rows.find((row) => row.id === context.id)?.type).toBe(
        EventV2.versionedType(MaestroEvent.Context.RecordedV2.type, 2),
      )
    }),
  { git: true },
  30000,
)

it.instance(
  "rejects guessed scope and stale source before grounded context can persist",
  () =>
    Effect.gen(function* () {
      const data = yield* prepare()
      const rejected = yield* recordPlanRevision({
        ...data.input,
        scope: [{ value: "src/**", source: "maestro" }],
      }).pipe(Effect.flip)
      expect(rejected).toBeInstanceOf(AtlasContextHeld)
      const plan = yield* recordPlanRevision(data.input)
      const context = yield* recordContext(plan.id, data.session.id, true)
      const fs = yield* FileSystem.FileSystem
      yield* fs.writeFileString(path.join(data.test.directory, "src/owned.ts"), "export const owned = 2\n")
      expect(yield* contextIsCurrent(context)).toBe(false)
      expect(yield* recordContext(plan.id, data.session.id, true).pipe(Effect.flip)).toBeInstanceOf(AtlasContextHeld)
    }),
  { git: true },
  30000,
)

// F4-O4: Atlas Memory logs travel with the code but are not task output, so a Memory write keeps the context current.
it.instance(
  "an Atlas Memory write keeps the context current while a code change still makes it stale",
  () =>
    Effect.gen(function* () {
      const data = yield* prepare()
      const plan = yield* recordPlanRevision(data.input)
      const context = yield* recordContext(plan.id, data.session.id, true)
      const fs = yield* FileSystem.FileSystem
      yield* fs.writeFileString(path.join(data.test.directory, ".atlas/memory.jsonl"), '{"memory":"lesson"}\n')
      yield* fs.writeFileString(path.join(data.test.directory, ".atlas/orientation.jsonl"), '{"orientation":"hit"}\n')
      expect(yield* contextIsCurrent(context)).toBe(true)
      expect(yield* recordContext(plan.id, data.session.id, true)).toEqual(context)
      yield* fs.writeFileString(path.join(data.test.directory, "src/owned.ts"), "export const owned = 2\n")
      expect(yield* contextIsCurrent(context)).toBe(false)
    }),
  { git: true },
  30000,
)
