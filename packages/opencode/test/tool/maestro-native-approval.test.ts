import { createHash } from "node:crypto"
import { afterEach, describe, expect } from "bun:test"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Database } from "@opencode-ai/core/database/database"
import { filesystem } from "@opencode-ai/core/effect/app-node-platform"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { EventV2 } from "@opencode-ai/core/event"
import { EventTable } from "@opencode-ai/core/event/sql"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { MaestroEvent } from "@opencode-ai/schema/maestro-event"
import { eq } from "drizzle-orm"
import { Cause, Effect, Exit, FileSystem, Schema } from "effect"
import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Git } from "@/git"
import { recordAdmission } from "@/maestro/admission-record"
import { renderPresentation } from "@/maestro/approval"
import { presentApproval, recordApproval } from "@/maestro/approval-record"
import { recordContext } from "@/maestro/context-record"
import { recordPlanRevision } from "@/maestro/plan-revision"
import { taskHash } from "@/maestro/task-hash"
import { recordReview, recordValidation, validationRecordHash } from "@/maestro/validation-record"
import { MessageID, PartID } from "@/session/schema"
import { Session } from "@/session/session"
import { Skill } from "@/skill"
import { MaestroPresentApprovalTool, MaestroRecordApprovalTool } from "@/tool/maestro-approval"
import { Truncate } from "@/tool/truncate"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

afterEach(async () => disposeAllInstances())

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

const model = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") }
const intent = {
  subagentType: "backend",
  prompt: "  Implement exact card.\n",
  model: "test/test-model",
  taskID: "task_exact",
}

// Real Git, Session messages, admission, plan, context, validation, and Lucy receipt.
const seed = Effect.fn("MaestroNativeApprovalTest.seed")(function* () {
  const test = yield* TestInstance
  const git = yield* Git.Service
  expect((yield* git.run(["branch", "-M", "main"], { cwd: test.directory })).exitCode).toBe(0)
  if (yield* Effect.promise(() => Bun.file(`${test.directory}/opencode.json`).exists())) {
    expect((yield* git.run(["add", "opencode.json"], { cwd: test.directory })).exitCode).toBe(0)
    expect((yield* git.run(["commit", "-m", "fixture config"], { cwd: test.directory })).exitCode).toBe(0)
  }
  expect((yield* git.run(["checkout", "-b", "approval-test"], { cwd: test.directory })).exitCode).toBe(0)
  // Bun.write can resolve on Windows before its handle closes; Git for Windows' FSCache then reads the stale
  // zero-byte directory entry, stages an empty blob, and every later clean-tree check sees proof.txt modified.
  const fs = yield* FileSystem.FileSystem
  yield* fs.writeFileString(`${test.directory}/proof.txt`, "proof\n")
  expect((yield* git.run(["add", "proof.txt"], { cwd: test.directory })).exitCode).toBe(0)
  expect((yield* git.run(["commit", "-m", "proof"], { cwd: test.directory })).exitCode).toBe(0)
  const sessions = yield* Session.Service
  const session = yield* sessions.create({ title: "Native approval" })
  const user = yield* sessions.updateMessage({
    id: MessageID.ascending(),
    role: "user",
    sessionID: session.id,
    agent: "maestro",
    model,
    time: { created: 1 },
  })
  yield* sessions.updatePart({
    id: PartID.ascending(),
    sessionID: session.id,
    messageID: user.id,
    type: "text",
    text: "Implement exact card.",
  })
  const admission = yield* recordAdmission({
    sessionID: session.id,
    messageID: user.id,
    methodVersion: "admit-request-v1",
    assessment: {
      kind: "work",
      goal: "Implement exact card.",
      known: [],
      proposals: [],
      unknowns: [],
      uncertainty: "none",
      activeWorkEffect: "none",
      reason: "Goal is ready for a draft.",
    },
  })
  expect(admission.outcome).toBe("READY_TO_DRAFT")
  const assistant: SessionV1.Assistant = {
    id: MessageID.ascending(),
    role: "assistant",
    parentID: user.id,
    sessionID: session.id,
    mode: "maestro",
    agent: "maestro",
    cost: 0,
    path: { cwd: session.directory, root: session.directory },
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    modelID: model.modelID,
    providerID: model.providerID,
    time: { created: 2 },
  }
  yield* sessions.updateMessage(assistant)
  return {
    session,
    user,
    assistant,
    caller: {
      sessionID: session.id,
      messageID: assistant.id,
      callID: "call_native_approval",
      agent: "maestro",
      agentID: "maestro",
      abort: new AbortController().signal,
      messages: [],
      metadata: () => Effect.void,
      ask: () => Effect.void,
    },
  }
})

const evidence = Effect.fn("MaestroNativeApprovalTest.evidence")(function* (
  fixture: Effect.Success<ReturnType<typeof seed>>,
  revision = "first",
  review = true,
) {
  const plan = yield* recordPlanRevision({
    sessionID: fixture.session.id,
    admissionMessageID: fixture.user.id,
    methodVersion: `draft-plan-${revision}`,
    goal: { value: `Implement exact card (${revision}).`, source: "maestro" },
    acceptance: [{ value: "Tests pass.", source: "maestro" }],
    scope: [{ value: "proof.txt", source: "maestro" }],
    constraints: [],
    reviewRequirement: { value: "Lucy", source: "maestro" },
    contextRequirement: "PENDING",
    assumptions: [{ value: "Preserve exact intent.", source: "maestro" }],
    risks: [],
  })
  const context = yield* recordContext(plan.id, fixture.session.id)
  const workCard = [
    "# Card",
    "## Definition of Done",
    "proof.txt carries the exact card result.",
    "## Invariants",
    "The approved intent stays byte-identical.",
    "## Quality Standards",
    "Typecheck passes.",
    "## Completeness Criteria",
    "The single proof file is covered.",
    "## Success Criteria",
    "The owner approves and the exact card is dispatched.",
    "",
  ].join("\n")
  const validation = yield* recordValidation({
    sessionID: fixture.session.id,
    projectID: fixture.session.projectID,
    planRevisionID: plan.id,
    contextRecordID: context.id,
    contextHash: context.contextHash,
    workCardID: `card_${revision}`,
    workCard,
    routedMemberID: "backend",
    validatorID: "maestro",
    validatorVersion: "validation-v1",
    checks: [{ id: "typecheck", status: "PASS", detail: "clean" }],
  })
  if (!("reviewBaseSHA" in validation) || typeof validation.reviewBaseSHA !== "string")
    throw new Error("expected validation V3")
  if (review) {
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
      { cwd: fixture.session.directory },
    )
    expect(diff.exitCode).toBe(0)
    yield* recordReview({
      sessionID: fixture.session.id,
      validationRecordID: validation.id,
      workCard,
      reviewerID: "lucy",
      reviewMethodVersion: "review-v1",
      verdict: "APPROVE",
      findings: [],
      checks: validation.checks,
      artifact: {
        baseSHA: validation.reviewBaseSHA,
        headSHA: context.headSHA,
        worktree: fixture.session.directory,
        changedPaths: ["proof.txt"],
        sha256: createHash("sha256").update(diff.stdout).digest("hex"),
      },
    })
  }
  const binding = {
    planRevisionID: plan.id,
    revisionHash: plan.revisionHash,
    validationRecordID: validation.id,
    validationHash: validationRecordHash(validation),
    contextHash: context.contextHash,
    policyHash: validation.reviewPolicyHash,
  }
  return {
    plan,
    context,
    validation,
    binding,
    params: {
      ...binding,
      revisionHash: "caller hash",
      validationHash: "caller hash",
      contextHash: "caller hash",
      policyHash: "caller hash",
      contextRecordID: context.id,
      intent,
      methodVersion: "request-approval-v1",
      plan: "caller prose must not become authority",
      provenance: "caller provenance",
      assumptions: ["caller assumption"],
      validationLedger: "caller ledger",
      contextState: "CURRENT" as const,
    },
  }
})

const presentations = Effect.fn("MaestroNativeApprovalTest.presentations")(function* (sessionID: string) {
  const database = yield* Database.Service
  const rows = yield* database.db
    .select()
    .from(EventTable)
    .where(eq(EventTable.aggregate_id, sessionID))
    .all()
    .pipe(Effect.orDie)
  return rows
    .filter((row) => row.type === EventV2.versionedType(MaestroEvent.Approval.Presented.type, 1))
    .map((row) => Schema.decodeUnknownSync(MaestroEvent.Approval.Presented.data)(row.data))
})

function expectRejected(exit: Exit.Exit<unknown, unknown>, reason: string) {
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isFailure(exit)) expect(Cause.pretty(exit.cause)).toContain(reason)
}

describe("native Maestro approval admission", () => {
  it.instance(
    "omitted hash persists canonical binding, exact render, and direct user approval",
    () =>
      Effect.gen(function* () {
        const fixture = yield* seed()
        const chain = yield* evidence(fixture)
        const tool = yield* MaestroPresentApprovalTool
        const def = yield* tool.init()
        const result = yield* def.execute(chain.params, fixture.caller)
        const truncate = yield* Truncate.Service
        expect((yield* truncate.output(result.output)).truncated).toBe(true)
        expect(result.metadata.truncated).toBe(false)
        const rows = yield* presentations(fixture.session.id)
        expect(rows).toHaveLength(1)
        const row = rows[0]
        if (!row) throw new Error("missing persisted presentation")
        expect(row.taskHash).toMatch(/^[0-9a-f]{64}$/)
        expect(row.taskHash).toBe(taskHash({ ...intent, ...chain.binding }))
        expect(row.intent).toEqual(intent)
        expect(row.plan).toBe(chain.plan.goal.value)
        expect(row.provenance).toBe(`admission ${fixture.user.id}`)
        expect(row.assumptions).toEqual(["Preserve exact intent."])
        expect(row.validationLedger).toBe("typecheck: PASS (clean)")
        expect(result.metadata.presentationID).toBe(row.id)
        const rendered = renderPresentation({
          ...row,
          actor: { projectId: row.projectID, sessionId: row.sessionID, memberId: row.memberID },
        })
        expect(Buffer.from(result.output).equals(Buffer.from(rendered))).toBe(true)
        expect((yield* def.execute({ ...chain.params, taskHash: row.taskHash }, fixture.caller)).output).toBe(rendered)
        expect(yield* presentations(fixture.session.id)).toEqual(rows)
        const sessions = yield* Session.Service
        yield* sessions.updatePart({
          id: PartID.ascending(),
          sessionID: fixture.session.id,
          messageID: fixture.assistant.id,
          type: "tool",
          tool: "maestro_present_approval",
          callID: fixture.caller.callID,
          state: {
            status: "completed",
            input: chain.params,
            output: result.output,
            title: result.title,
            metadata: result.metadata,
            time: { start: 2, end: 3 },
          },
        })
        const recordTool = yield* MaestroRecordApprovalTool
        const record = yield* recordTool.init()
        const early = yield* record.execute({}, fixture.caller)
        expect(early.metadata).toEqual({ status: "HOLD", approvalMessageID: "", truncated: false })
        expect(early.output).toBe(
          "HOLD: reply-not-after-presentation. The owner has not replied since the presentation; end the turn and wait for the owner.",
        )
        const reply = yield* sessions.updateMessage({
          id: MessageID.ascending(),
          role: "user",
          sessionID: fixture.session.id,
          agent: "maestro",
          model,
          time: { created: 4 },
        })
        yield* sessions.updatePart({
          id: PartID.ascending(),
          sessionID: fixture.session.id,
          messageID: reply.id,
          type: "text",
          text: "approve",
        })
        expect(yield* recordApproval(fixture.session.id)).toMatchObject({
          status: "APPROVED",
          decision: { taskHash: row.taskHash, approvalMessageID: reply.id },
        })
        // maestro_grant_authorization needs the approval message ID; it must reach the model, not only metadata.
        const approved = yield* record.execute({}, fixture.caller)
        expect(approved.metadata).toEqual({ status: "APPROVED", approvalMessageID: reply.id, truncated: false })
        expect(approved.output).toBe(
          `APPROVED: exact plan revision ${chain.plan.id}\n\nBindings: ${JSON.stringify({
            approvalMessageID: reply.id,
            planRevisionID: chain.plan.id,
          })}`,
        )
      }),
    { git: true, config: { tool_output: { max_lines: 1, max_bytes: 1 } } },
  )

  it.instance(
    "wrong, empty, and blank supplied hashes reject without adding presentation events",
    () =>
      Effect.gen(function* () {
        const fixture = yield* seed()
        const chain = yield* evidence(fixture)
        const tool = yield* MaestroPresentApprovalTool
        const def = yield* tool.init()
        expect(taskHash({ ...intent, ...chain.binding })).not.toBe("wrong")
        yield* Effect.forEach(["wrong", "", " \t\n"], (supplied) =>
          Effect.gen(function* () {
            expectRejected(
              yield* Effect.exit(def.execute({ ...chain.params, taskHash: supplied }, fixture.caller)),
              supplied === "" ? "invalid arguments" : "task hash does not match",
            )
            expect(yield* presentations(fixture.session.id)).toHaveLength(0)
          }),
        )
        yield* def.execute(chain.params, fixture.caller)
        const before = yield* presentations(fixture.session.id)
        expect(before).toHaveLength(1)
        expectRejected(
          yield* Effect.exit(def.execute({ ...chain.params, taskHash: "wrong" }, fixture.caller)),
          "task hash does not match",
        )
        expect(yield* presentations(fixture.session.id)).toEqual(before)
      }),
    { git: true },
  )

  it.instance(
    "same exact intent with changed durable evidence produces different persisted hash",
    () =>
      Effect.gen(function* () {
        const fixture = yield* seed()
        const first = yield* evidence(fixture)
        const second = yield* evidence(fixture, "second")
        const tool = yield* MaestroPresentApprovalTool
        const def = yield* tool.init()
        yield* def.execute(first.params, fixture.caller)
        yield* def.execute(second.params, {
          ...fixture.caller,
          messageID: MessageID.ascending(),
          callID: "call_second",
        })
        const rows = yield* presentations(fixture.session.id)
        expect(rows).toHaveLength(2)
        expect(rows.map((row) => row.intent)).toEqual([intent, intent])
        expect(rows.map((row) => row.taskHash)).toEqual([
          taskHash({ ...intent, ...first.binding }),
          taskHash({ ...intent, ...second.binding }),
        ])
        expect(rows[0]?.taskHash).not.toBe(rows[1]?.taskHash)
      }),
    { git: true },
  )

  it.instance(
    "internal blank identity, binding, call, intent, and method reject before persistence",
    () =>
      Effect.gen(function* () {
        const fixture = yield* seed()
        const chain = yield* evidence(fixture)
        const input = {
          ...chain.params,
          sessionID: fixture.session.id,
          assistantMessageID: fixture.assistant.id,
          callID: fixture.caller.callID,
          projectID: fixture.session.projectID,
          memberID: "maestro",
          taskHash: taskHash({ ...intent, ...chain.binding }),
        }
        const database = yield* Database.Service
        const before = yield* database.db.select().from(EventTable).all().pipe(Effect.orDie)
        yield* Effect.forEach(
          [
            "sessionID",
            "assistantMessageID",
            "callID",
            "projectID",
            "memberID",
            "planRevisionID",
            "validationRecordID",
            "revisionHash",
            "validationHash",
            "contextHash",
            "policyHash",
            "taskHash",
            "methodVersion",
          ],
          (field) =>
            Effect.forEach(["", " \t\n"], (value) =>
              Effect.gen(function* () {
                expectRejected(
                  yield* Effect.exit(presentApproval({ ...input, [field]: value })),
                  `Malformed approval presentation: ${field}`,
                )
                expect(yield* presentations(fixture.session.id)).toHaveLength(0)
              }),
            ),
        )
        yield* Effect.forEach(["subagentType", "prompt", "model", "taskID"], (field) =>
          Effect.gen(function* () {
            expectRejected(
              yield* Effect.exit(presentApproval({ ...input, intent: { ...intent, [field]: " \t\n" } })),
              `Malformed approval presentation: ${field}`,
            )
            expect(yield* presentations(fixture.session.id)).toHaveLength(0)
          }),
        )
        expect(yield* database.db.select().from(EventTable).all().pipe(Effect.orDie)).toEqual(before)
        const accepted = yield* presentApproval(input)
        expect(accepted.taskHash).toBe(input.taskHash)
        expect(yield* presentations(fixture.session.id)).toHaveLength(1)
      }),
    { git: true },
  )

  it.instance(
    "still rejects no Lucy, foreign Session, spoofed identity, and stale context",
    () =>
      Effect.gen(function* () {
        const fixture = yield* seed()
        const missingLucy = yield* evidence(fixture, "no-lucy", false)
        const tool = yield* MaestroPresentApprovalTool
        const def = yield* tool.init()
        expectRejected(yield* Effect.exit(def.execute(missingLucy.params, fixture.caller)), "requires Lucy APPROVE")
        const chain = yield* evidence(fixture)
        const sessions = yield* Session.Service
        const other = yield* sessions.create({ title: "foreign" })
        expectRejected(
          yield* Effect.exit(def.execute(chain.params, { ...fixture.caller, sessionID: other.id })),
          "session mismatch",
        )
        expectRejected(
          yield* Effect.exit(def.execute(chain.params, { ...fixture.caller, agentID: "general" })),
          "requires Maestro",
        )
        yield* FileSystem.FileSystem.use((fs) => fs.writeFileString(`${fixture.session.directory}/proof.txt`, "changed\n"))
        expectRejected(yield* Effect.exit(def.execute(chain.params, fixture.caller)), "context is stale")
        expect(yield* presentations(fixture.session.id)).toHaveLength(0)
      }),
    { git: true },
  )

  it.instance(
    "still rejects current but dirty durable context",
    () =>
      Effect.gen(function* () {
        const fixture = yield* seed()
        yield* FileSystem.FileSystem.use((fs) => fs.writeFileString(`${fixture.session.directory}/proof.txt`, "dirty\n"))
        const chain = yield* evidence(fixture, "dirty", false)
        expect(chain.context.changedPaths).toContain("proof.txt")
        const tool = yield* MaestroPresentApprovalTool
        const def = yield* tool.init()
        expectRejected(yield* Effect.exit(def.execute(chain.params, fixture.caller)), "context is dirty")
        expect(yield* presentations(fixture.session.id)).toHaveLength(0)
      }),
    { git: true },
  )
})
