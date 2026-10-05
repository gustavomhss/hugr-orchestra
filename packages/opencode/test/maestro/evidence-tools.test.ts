import { createHash } from "node:crypto"
import { afterEach, describe, expect } from "bun:test"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { filesystem } from "@opencode-ai/core/effect/app-node-platform"
import { Skill } from "../../src/skill"
import { EventV2 } from "@opencode-ai/core/event"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { MaestroEvent } from "@opencode-ai/schema/maestro-event"
import { Cause, Effect, Exit, FileSystem, Schema } from "effect"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { Agent } from "../../src/agent/agent"
import { Config } from "../../src/config/config"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { Git } from "../../src/git"
import { readValidation, workCardHash } from "../../src/maestro/validation-record"
import { recordContext } from "../../src/maestro/context-record"
import type { SessionPrompt } from "../../src/session/prompt"
import { MessageID, PartID } from "../../src/session/schema"
import { Session } from "../../src/session/session"
import { MaestroPresentApprovalTool } from "../../src/tool/maestro-approval"
import { MaestroRequestReviewTool } from "../../src/tool/maestro-review"
import { MaestroRecordValidationTool } from "../../src/tool/maestro-validation"
import type { TaskPromptOps } from "../../src/tool/task"
import { Truncate } from "../../src/tool/truncate"
import { disposeAllInstances, provideInstance, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

afterEach(async () => disposeAllInstances())

const model = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") }
const it = testEffect(
  LayerNode.compile(
    LayerNode.group([
      filesystem,
      Skill.node,
      Agent.node,
      Config.node,
      CrossSpawnSpawner.node,
      Database.node,
      EventV2Bridge.node,
      Git.node,
      Session.node,
      SessionProjector.node,
      Truncate.node,
    ]),
  ),
)

const seed = Effect.fn("MaestroEvidenceToolsTest.seed")(function* () {
  const sessions = yield* Session.Service
  const chat = yield* sessions.create({ title: "evidence tools" })
  const user = yield* sessions.updateMessage({
    id: MessageID.ascending(),
    role: "user",
    sessionID: chat.id,
    agent: "maestro",
    model,
    time: { created: Date.now() },
  })
  const assistant: SessionV1.Assistant = {
    id: MessageID.ascending(),
    role: "assistant",
    parentID: user.id,
    sessionID: chat.id,
    mode: "maestro",
    agent: "maestro",
    cost: 0,
    path: { cwd: chat.directory, root: chat.directory },
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    modelID: model.modelID,
    providerID: model.providerID,
    time: { created: Date.now() },
  }
  yield* sessions.updateMessage(assistant)
  return { chat, assistant }
})

function promptOps(onPrompt: (input: SessionPrompt.PromptInput) => void): TaskPromptOps {
  return {
    cancel: () => Effect.void,
    resolvePromptParts: (template) => Effect.succeed([{ type: "text", text: template }]),
    prompt: (input) =>
      Effect.sync(() => {
        onPrompt(input)
        const id = MessageID.ascending()
        return {
          info: {
            id,
            role: "assistant",
            parentID: input.messageID ?? MessageID.ascending(),
            sessionID: input.sessionID,
            mode: input.agent ?? "lucy",
            agent: input.agent ?? "lucy",
            cost: 0,
            path: { cwd: "/tmp", root: "/tmp" },
            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
            modelID: input.model?.modelID ?? model.modelID,
            providerID: input.model?.providerID ?? model.providerID,
            time: { created: Date.now() },
            finish: "stop",
          },
          parts: [{ id: PartID.ascending(), messageID: id, sessionID: input.sessionID, type: "text", text: "done" }],
        }
      }),
  }
}

describe("Maestro evidence tools", () => {
  it.instance(
    "sends full repository diff from nested Session and rejects foreign or dirty context",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        yield* Effect.promise(() => mkdir(`${test.directory}/nested`))
        const { chat, assistant } = yield* provideInstance(`${test.directory}/nested`)(seed())
        const events = yield* EventV2Bridge.Service
        const git = yield* Git.Service
        // Bun.write can resolve on Windows before its file handle closes, so Git for Windows' FSCache may read a stale
        // directory entry (an empty blob for new files, an unchanged size for edits). FileSystem writes close first.
        const fs = yield* FileSystem.FileSystem
        const first = path.join(test.directory, "first.txt")
        const workCard = "# Card\nReview full branch diff.\n"
        const base = (yield* git.run(["rev-parse", "HEAD"], { cwd: test.directory })).text().trim()
        yield* fs.writeFileString(first, "first\n")
        yield* git.run(["add", "first.txt"], { cwd: test.directory })
        yield* git.run(["commit", "-m", "first"], { cwd: test.directory })
        yield* fs.writeFileString(path.join(test.directory, "second.txt"), "second\n")
        yield* git.run(["add", "second.txt"], { cwd: test.directory })
        yield* git.run(["commit", "-m", "second"], { cwd: test.directory })
        const planRevisionID = EventV2.ID.make("evt_plan_review_tool")
        yield* events.publish(
          MaestroEvent.PlanRevision.Recorded,
          {
            id: planRevisionID,
            sessionID: chat.id,
            admissionMessageID: "msg_admission",
            methodVersion: "draft-plan-v1",
            revision: "v1",
            goal: { value: "review full branch diff", source: "maestro" },
            acceptance: [{ value: "tests pass", source: "maestro" }],
            scope: [{ value: "card", source: "maestro" }],
            constraints: [],
            reviewRequirement: { value: "Lucy", source: "maestro" },
            contextRequirement: "PENDING",
            assumptions: [],
            risks: [],
            status: "PROPOSED",
            revisionHash: "f".repeat(64),
            createdAt: 1,
          },
          { id: planRevisionID },
        )
        const context = yield* recordContext(planRevisionID, chat.id)
        const validationRecordID = EventV2.ID.make("evt_maestro_validation_review_tool")
        yield* events.publish(
          MaestroEvent.Validation.RecordedV3,
          {
            sessionID: chat.id,
            planRevisionID,
            contextRecordID: context.id,
            contextHash: context.contextHash,
            reviewBaseSHA: base,
            projectID: chat.projectID,
            workCardID: "card_review_tool",
            workCard,
            workCardHash: workCardHash(workCard),
            routedMemberID: "charlie",
            rosterHash: "b".repeat(64),
            grantHash: "c".repeat(64),
            reviewPolicyHash: "d".repeat(64),
            actor: { version: "rfc8785-v1", bytes: "actor", sha256: "e".repeat(64) },
            validatorID: "maestro",
            validatorVersion: "validation-v1",
            checks: [{ id: "typecheck", status: "PASS", detail: "clean" }],
            outcome: "VALID",
          },
          { id: validationRecordID },
        )
        let prompt = ""
        const tool = yield* MaestroRequestReviewTool
        const result = yield* tool.init().pipe(
          Effect.flatMap((def) =>
            def.execute(
              { validationRecordID, workCard, reviewMethodVersion: "review-v1" },
              {
                sessionID: chat.id,
                messageID: assistant.id,
                agent: "maestro",
                agentID: "maestro",
                abort: new AbortController().signal,
                extra: {
                  promptOps: promptOps(
                    (input) =>
                      (prompt = input.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("")),
                  ),
                },
                messages: [],
                metadata: () => Effect.void,
                ask: () => Effect.void,
              },
            ),
          ),
        )

        expect(result.output).toContain("LUCY_NO_RECEIPT")
        expect(prompt).toContain(`\"baseSHA\":\"${base}\"`)
        expect(prompt).toContain("first.txt")
        expect(prompt).toContain("second.txt")
        const artifact = Schema.decodeUnknownSync(
          Schema.fromJsonString(
            Schema.Struct({
              baseSHA: Schema.String,
              headSHA: Schema.String,
              changedPaths: Schema.Array(Schema.String),
              sha256: Schema.String,
            }),
          ),
        )(/^artifact JSON: (.+)$/m.exec(prompt)?.[1])
        const full = yield* git.run(
          [
            "diff",
            "--binary",
            "--full-index",
            "--no-ext-diff",
            "--no-renames",
            "--src-prefix=a/",
            "--dst-prefix=b/",
            base,
            context.headSHA,
            "--",
            ".",
          ],
          { cwd: test.directory },
        )
        expect(artifact.baseSHA).toBe(base)
        expect(artifact.headSHA).toBe(context.headSHA)
        expect(artifact.changedPaths).toEqual(["first.txt", "second.txt"])
        expect(artifact.sha256).toBe(createHash("sha256").update(full.stdout).digest("hex"))
        // Lucy reads the diff as text and never receives it as base64 to copy back.
        expect(prompt).toContain(full.text())
        expect(prompt).not.toContain(full.stdout.toString("base64"))

        const sessions = yield* Session.Service
        const other = yield* sessions.create({ title: "foreign context" })
        const caller = {
          sessionID: other.id,
          messageID: assistant.id,
          agent: "maestro",
          agentID: "maestro",
          abort: new AbortController().signal,
          messages: [],
          metadata: () => Effect.void,
          ask: () => Effect.void,
        }
        const validationTool = yield* MaestroRecordValidationTool
        const foreignValidation = yield* validationTool.init().pipe(
          Effect.flatMap((def) =>
            def.execute(
              {
                planRevisionID,
                contextRecordID: context.id,
                contextHash: context.contextHash,
                projectID: other.projectID,
                workCardID: "foreign",
                workCard,
                routedMemberID: "charlie",
                validatorVersion: "validation-v1",
                checks: [{ id: "typecheck", status: "PASS", detail: "clean" }],
              },
              caller,
            ),
          ),
          Effect.exit,
        )
        expect(Exit.isFailure(foreignValidation)).toBe(true)
        if (Exit.isFailure(foreignValidation))
          expect(Cause.pretty(foreignValidation.cause)).toContain("Validation context does not match Session")
        const validation = yield* readValidation(validationRecordID)
        if (!validation) throw new Error("missing validation")
        const foreignID = EventV2.ID.make("evt_validation_foreign_context")
        yield* events.publish(
          MaestroEvent.Validation.RecordedV3,
          Schema.decodeUnknownSync(MaestroEvent.Validation.RecordedV3.data)({ ...validation, sessionID: other.id }),
          { id: foreignID },
        )
        const foreignReview = yield* tool.init().pipe(
          Effect.flatMap((def) =>
            def.execute({ validationRecordID: foreignID, workCard, reviewMethodVersion: "review-v1" }, caller),
          ),
          Effect.exit,
        )
        expect(Exit.isFailure(foreignReview)).toBe(true)
        if (Exit.isFailure(foreignReview))
          expect(Cause.pretty(foreignReview.cause)).toContain("Review delegation context is stale or dirty")
        yield* fs.writeFileString(first, "dirty sibling\n")
        const dirtyReview = yield* tool.init().pipe(
          Effect.flatMap((def) =>
            def.execute(
              { validationRecordID, workCard, reviewMethodVersion: "review-v1" },
              { ...caller, sessionID: chat.id },
            ),
          ),
          Effect.exit,
        )
        expect(Exit.isFailure(dirtyReview)).toBe(true)
        if (Exit.isFailure(dirtyReview))
          expect(Cause.pretty(dirtyReview.cause)).toContain("Review delegation context is stale or dirty")
        yield* fs.writeFileString(first, "first\n")
        const hookTool = yield* MaestroRequestReviewTool.pipe(
          Effect.provideService(Session.Service, {
            ...sessions,
            create: (input) =>
              sessions.create(input).pipe(
                Effect.tap(() =>
                  Effect.gen(function* () {
                    yield* fs.writeFileString(first, "child hook change\n")
                    yield* git.run(["add", "first.txt"], { cwd: test.directory })
                    expect((yield* git.run(["commit", "-m", "child hook"], { cwd: test.directory })).exitCode).toBe(0)
                  }),
                ),
              ),
          }),
        )
        let delegations = 0
        const changedDuringCreation = yield* hookTool.init().pipe(
          Effect.flatMap((def) =>
            def.execute(
              { validationRecordID, workCard, reviewMethodVersion: "review-v1" },
              { ...caller, sessionID: chat.id, extra: { promptOps: promptOps(() => delegations++) } },
            ),
          ),
          Effect.exit,
        )
        expect(Exit.isFailure(changedDuringCreation)).toBe(true)
        if (Exit.isFailure(changedDuringCreation))
          expect(Cause.pretty(changedDuringCreation.cause)).toContain(
            "Review delegation context changed during child creation",
          )
        expect(delegations).toBe(0)
      }),
    { git: true },
    30_000,
  )

  it.instance(
    "rejects approval presentation when durable context is stale",
    () =>
      Effect.gen(function* () {
        const { chat, assistant } = yield* seed()
        const events = yield* EventV2Bridge.Service
        const planRevisionID = EventV2.ID.make("evt_plan_stale_presentation")
        const contextRecordID = EventV2.ID.make("evt_context_stale_presentation")
        const validationRecordID = EventV2.ID.make("evt_validation_stale_presentation")
        yield* events.publish(
          MaestroEvent.PlanRevision.Recorded,
          {
            id: planRevisionID,
            sessionID: chat.id,
            admissionMessageID: "msg_admission",
            methodVersion: "draft-plan-v1",
            revision: "v1",
            goal: { value: "implement card", source: "maestro" },
            acceptance: [{ value: "tests pass", source: "maestro" }],
            scope: [{ value: "card", source: "maestro" }],
            constraints: [],
            reviewRequirement: { value: "Lucy", source: "maestro" },
            contextRequirement: "PENDING",
            assumptions: [],
            risks: [],
            status: "PROPOSED",
            revisionHash: "a".repeat(64),
            createdAt: 1,
          },
          { id: planRevisionID },
        )
        yield* events.publish(
          MaestroEvent.Context.Recorded,
          {
            id: contextRecordID,
            sessionID: chat.id,
            planRevisionID,
            projectID: chat.projectID,
            directory: chat.directory,
            mode: "UNGROUNDED",
            branch: "test",
            headSHA: "b".repeat(40),
            changedPaths: [],
            currentEvidenceIdentityHash: "c".repeat(64),
            contextHash: "d".repeat(64),
            status: "CURRENT",
            createdAt: 1,
          },
          { id: contextRecordID },
        )
        yield* events.publish(
          MaestroEvent.Validation.RecordedV3,
          {
            sessionID: chat.id,
            planRevisionID,
            contextRecordID,
            contextHash: "d".repeat(64),
            reviewBaseSHA: "e".repeat(40),
            projectID: chat.projectID,
            workCardID: "card_stale_presentation",
            workCard: "# Card\n",
            workCardHash: workCardHash("# Card\n"),
            routedMemberID: "charlie",
            rosterHash: "f".repeat(64),
            grantHash: "1".repeat(64),
            reviewPolicyHash: "2".repeat(64),
            actor: { version: "rfc8785-v1", bytes: "actor", sha256: "3".repeat(64) },
            validatorID: "maestro",
            validatorVersion: "validation-v1",
            checks: [{ id: "typecheck", status: "PASS", detail: "clean" }],
            outcome: "VALID",
          },
          { id: validationRecordID },
        )
        const tool = yield* MaestroPresentApprovalTool
        const exit = yield* tool.init().pipe(
          Effect.flatMap((def) =>
            def.execute(
              {
                planRevisionID,
                validationRecordID,
                contextRecordID,
                revisionHash: "ignored",
                validationHash: "ignored",
                contextHash: "ignored",
                policyHash: "ignored",
                intent: { subagentType: "charlie", prompt: "implement card" },
                methodVersion: "request-approval-v1",
                plan: "ignored",
                provenance: "ignored",
                assumptions: [],
                validationLedger: "ignored",
                contextState: "CURRENT",
              },
              {
                sessionID: chat.id,
                messageID: assistant.id,
                callID: "call_stale_presentation",
                agent: "maestro",
                agentID: "maestro",
                abort: new AbortController().signal,
                messages: [],
                metadata: () => Effect.void,
                ask: () => Effect.void,
              },
            ),
          ),
          Effect.exit,
        )

        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) expect(Cause.pretty(exit.cause)).toContain("Approval presentation context is stale")
      }),
    { git: true },
    15_000,
  )
})
