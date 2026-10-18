import { afterEach, expect } from "bun:test"
import path from "node:path"
import { mkdir, rm } from "node:fs/promises"
import { and, eq } from "drizzle-orm"
import { Cause, Effect, Exit, Schema } from "effect"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { filesystem } from "@orchestra/core/effect/app-node-platform"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { RelayWorkflowBinding } from "@orchestra/core/relay-workflow-binding"
import { RelayWorkflowSession } from "@orchestra/core/relay-workflow-session"
import { SessionProjector } from "@orchestra/core/session/projector"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { Ripgrep } from "@orchestra/core/ripgrep"
import { SessionV1 } from "@orchestra/core/v1/session"
import { AuthoringGraph } from "@orchestra/relay/authoring/graph"
import { AuthoringStore } from "@orchestra/relay/authoring/store"
import { Event } from "@orchestra/schema/event"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { ProjectID } from "@orchestra/schema/project-id"
import { SessionMessage } from "@orchestra/schema/session-message"
import { Skill } from "../../src/skill"
import { Agent } from "../../src/agent/agent"
import { BackgroundJob } from "../../src/background/job"
import { Config } from "../../src/config/config"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { Git } from "../../src/git"
import { ArsenalCompletion } from "../../src/maestro/arsenal-completion"
import { authorizationTaskIntentHash } from "../../src/maestro/authorization"
import { CodeReview } from "../../src/maestro/code-review"
import { Dispatch } from "../../src/maestro/dispatch"
import { recordContext } from "../../src/maestro/context-record"
import { LogicalTask } from "../../src/maestro/logical-task"
import { workflowRevisionBody } from "../../src/maestro/plan-revision"
import { recordValidation } from "../../src/maestro/validation-record"
import { WorkflowBinding } from "../../src/maestro/workflow-binding"
import { Session } from "../../src/session/session"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import { SessionRunState } from "../../src/session/run-state"
import { SessionStatus } from "../../src/session/status"
import { TaskTool, type TaskPromptOps } from "../../src/tool/task"
import { Truncate } from "../../src/tool/truncate"
import { disposeAllInstances, tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { relayFor } from "../maestro/relay-fixture"

// The Task tool's wiring of a workflow step held for a code review: the real Task tool, authorization, reservation,
// workflow binding, arm (Relay), settlement host and hold record. Only the owner-facing hosts (publication approval,
// upstream, the cold-review callback) and the child's model turn are stand-ins.
const it = testEffect(
  LayerNode.compile(
    LayerNode.group([
      filesystem, Skill.node, Agent.node, BackgroundJob.node, Config.node, CrossSpawnSpawner.node, Database.node,
      EventV2Bridge.node, Git.node, Ripgrep.node, RuntimeFlags.node, Session.node, SessionProjector.node,
      SessionRunState.node, SessionStatus.node, Truncate.node,
    ]),
  ),
)

afterEach(async () => {
  await disposeAllInstances()
})

const model = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") }
const token = "arm-held"

// `hook` changes the tree inside writePaths after the reservation and before the model, as a session-start hook can.
// `persisted` writes the child's user message and its empty reply before the pre-model check, as the prompt loop does.
const fixture = Effect.fn("TaskWorkflowResumeTest.fixture")(function* (options: { hook?: boolean; persisted?: boolean } = {}) {
  const sessions = yield* Session.Service
  const events = yield* EventV2Bridge.Service
  const chat = yield* sessions.create({ title: "Workflow resume" })
  const user = yield* sessions.updateMessage({ id: MessageID.ascending(), role: "user", sessionID: chat.id, agent: "maestro",
    model, time: { created: Date.now() } })
  const assistant: SessionV1.Assistant = { id: MessageID.ascending(), role: "assistant", parentID: user.id, sessionID: chat.id,
    mode: "maestro", agent: "maestro", cost: 0, path: { cwd: chat.directory, root: chat.directory },
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, modelID: model.modelID,
    providerID: model.providerID, time: { created: Date.now() } }
  yield* sessions.updateMessage(assistant)

  // The plan, context, validation and authorization that route "implement card" to the backend seat.
  const planRevisionID = EventV2.ID.make("evt_maestro_plan_workflow_resume")
  yield* events.publish(MaestroEvent.PlanRevision.Recorded, {
    id: planRevisionID, sessionID: chat.id, admissionMessageID: "msg_admission", methodVersion: "draft-plan-v1",
    revision: "v1", goal: { value: "implement card", source: "maestro" }, acceptance: [{ value: "tests pass", source: "maestro" }],
    scope: [{ value: "card", source: "maestro" }], constraints: [], reviewRequirement: { value: "Lucy", source: "maestro" },
    contextRequirement: "PENDING", assumptions: [], risks: [], status: "PROPOSED", revisionHash: "a".repeat(64), createdAt: 1,
  }, { id: planRevisionID })
  const context = yield* recordContext(planRevisionID, chat.id)
  const validation = yield* recordValidation({ sessionID: chat.id, planRevisionID, contextRecordID: context.id,
    contextHash: context.contextHash, projectID: chat.projectID, workCardID: "card_workflow_resume", workCard: "# Card\n",
    routedMemberID: "backend", validatorID: "maestro", validatorVersion: "validation-v1",
    checks: [{ id: "typecheck", status: "PASS", detail: "clean" }] })
  // Each authorization of the same validated card reserves its own child.
  const authorize = (id: string) => events.publish(MaestroEvent.Authorization.Granted, {
    sessionID: chat.id, projectID: chat.projectID, approvalMessageID: "msg_approval", validationRecordID: validation.id,
    workCardHash: validation.workCardHash, routedMemberID: validation.routedMemberID, rosterHash: validation.rosterHash,
    grantHash: validation.grantHash, reviewPolicyHash: validation.reviewPolicyHash, actor: validation.actor,
    reviewerID: "lucy", taskIntentHash: authorizationTaskIntentHash({ subagentType: "backend", prompt: "implement card" }),
    methodVersion: "authorization-v1",
  }, { id: EventV2.ID.make(id) }).pipe(Effect.as(id))
  const authorizationID = yield* authorize("evt_maestro_authorization_workflow_resume")

  // One published workflow step whose final checks are the build and the cold review, outside the project directory.
  const projectID = ProjectID.make(chat.projectID)
  const authoring = yield* tmpdirScoped()
  const port: RelayWorkflowBinding.PublicationPort = {
    projectID,
    use: (read) => Effect.scoped(AuthoringStore.open(authoring, projectID).pipe(Effect.flatMap(read))),
    skills: () => Effect.fail(new AuthoringGraph.Refusal({ status: 404, code: "skill-unavailable", message: "No skill selected" })),
  }
  const documentID = yield* Effect.scoped(Effect.gen(function* () {
    const store = yield* AuthoringStore.open(authoring, projectID)
    const draft = yield* store.save({ body: yield* AuthoringGraph.project("Held packet", { work_packages: [{
      id: "implement", instructions: "Implement the card.",
      checklist: [{ id: "build", host_check: "package-verification" }, { id: "review", host_check: "cold-review" }],
    }] }) })
    yield* store.publish(draft.id, draft.versionId)
    return draft.id
  }))
  const acquired = yield* RelayWorkflowBinding.acquire({ port, projectID, documentID, parameters: {}, writePaths: ["src"] })
  const field = { value: "Implement the card.", source: "maestro" as const }
  const revision = Schema.decodeUnknownSync(MaestroEvent.PlanRevision.RecordedV3.data)(workflowRevisionBody({
    sessionID: chat.id, admissionMessageID: user.id, methodVersion: "draft-plan-v3", goal: field, acceptance: [field],
    scope: [field], constraints: [], reviewRequirement: field, contextRequirement: "PENDING", assumptions: [], risks: [],
    status: "PROPOSED", createdAt: 1,
  }, acquired.definition))
  yield* events.publish(MaestroEvent.PlanRevision.RecordedV3, revision, { id: EventV2.ID.make(revision.id) })
  const workflow = { documentID, planRevisionID: Event.ID.make(revision.id), parameters: {} }
  const workflowHost: WorkflowBinding.Host = { publication: () => Effect.succeed(port), verifyUpstream: () => Effect.void,
    approve: () => Effect.void, complete: () => Effect.void }

  // The armed completion contract and its native host; `reviewed` is whether a code-stage APPROVE covers the tree.
  // `resolve` answers the latest arm. Re-arming an identical contract returns the same token (it is content-addressed),
  // so the arm stays `token` until `rearm` arms a changed contract under a new one.
  const reviewed = { value: false }
  const state = yield* tmpdirScoped()
  yield* Effect.promise(() => mkdir(path.join(state, chat.projectID, "completion"), { recursive: true }))
  const armed = { token }
  const rearm = (next: string) => Effect.promise(() => Bun.write(path.join(state, chat.projectID, "completion", `${next}.json`),
    JSON.stringify({ schema: 1, projectID: chat.projectID, contract: { sessionID: chat.id, label: next, chain: [{ id: "gate",
      checks: [{ id: "build", hostCheck: "package-verification" }, { id: "review", hostCheck: "cold-review" }] }] } })))
    .pipe(Effect.andThen(Effect.sync(() => {
      armed.token = next
    })))
  yield* rearm(token)
  const relay = yield* relayFor({ directory: chat.directory, projectID: chat.projectID })
  const completionHost: ArsenalCompletion.Host = {
    resolve: (input) => Effect.succeed({ ...input, planID: revision.id, token: armed.token, stateDirectory: state, ownedPaths: [] }),
    checks: new Map<string, ArsenalCompletion.HostCheck>([
      ["package-verification", () => Effect.succeed({ status: "pass" as const, exitCode: 0 })],
      ["cold-review", () => reviewed.value ? Effect.succeed({ status: "pass" as const, exitCode: 0 })
        : Effect.fail(new RelayWorkflowBinding.Held({ reason: CodeReview.REQUIRED }))],
    ]),
    relay: () => Effect.succeed(relay),
    observe: () => Effect.void,
  }
  const def = yield* TaskTool.pipe(Effect.flatMap((tool) => tool.init()),
    Effect.provideService(ArsenalCompletion.NativeHost, completionHost))

  // The child's turn as the workflow loop runs it: the reservation check before the model, one reply that leaves an
  // uncommitted edit inside writePaths, then the settlement through the native host.
  const services = yield* Effect.context<Session.Service | Database.Service>()
  const prompts = { count: 0 }
  const hook = { value: options.hook === true }
  const edit = (text: string) => Effect.promise(() => Bun.write(path.join(chat.directory, "src", "card.ts"), text))
  const ops: TaskPromptOps = {
    cancel: () => Effect.void,
    resolvePromptParts: (template) =>
      Effect.as(hook.value ? edit("// hook\n") : Effect.void, [{ type: "text" as const, text: template }]),
    prompt: (input, prompt) => Effect.gen(function* () {
      if (options.persisted) {
        const sessions = yield* Session.Service
        const asked = yield* sessions.updateMessage({ id: MessageID.ascending(), role: "user", sessionID: input.sessionID,
          agent: "backend", model, time: { created: Date.now() } })
        yield* sessions.updateMessage({ id: MessageID.ascending(), role: "assistant", parentID: asked.id,
          sessionID: input.sessionID, mode: "backend", agent: "backend", cost: 0, path: { cwd: chat.directory, root: chat.directory },
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, modelID: model.modelID,
          providerID: model.providerID, time: { created: Date.now() } })
      }
      yield* prompt?.beforeModel ?? Effect.void
      prompts.count++
      yield* edit(`export const card = ${prompts.count}\n`)
      const sessions = yield* Session.Service
      const asked = yield* sessions.updateMessage({ id: input.messageID ?? MessageID.ascending(), role: "user",
        sessionID: input.sessionID, agent: "backend", model, time: { created: Date.now() } })
      const info: SessionV1.Assistant = { id: MessageID.ascending(), role: "assistant", parentID: asked.id,
        sessionID: input.sessionID, mode: "backend", agent: "backend", cost: 0, path: { cwd: chat.directory, root: chat.directory },
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, modelID: model.modelID,
        providerID: model.providerID, time: { created: Date.now(), completed: Date.now() }, finish: "stop" }
      yield* sessions.updateMessage(info)
      const part = { id: PartID.ascending(), messageID: info.id, sessionID: input.sessionID, type: "text" as const, text: "done" }
      yield* sessions.updatePart(part)
      const current = yield* RelayWorkflowSession.current(input.sessionID)
      if (!current) return yield* Effect.die(new Error("fixture child is not workflow-bound"))
      yield* RelayWorkflowSession.settle({ current, assistantMessageID: SessionMessage.ID.make(info.id), succeeded: true })
      return { info, parts: [part] }
    }).pipe(Effect.provide(services), Effect.orDie),
  }

  const params = { description: "implement card", prompt: "implement card", subagent_type: "backend", authorizationID,
    workflow, writePaths: ["src"] }
  // Each call is its own Task tool call of Maestro's turn, as the workflow approval reads it back. `abort` cancels the
  // call at its first metadata update, which comes after completion.beforeDispatch and before the child is prompted.
  const call = (extra: { task_id?: string; authorizationID?: string } = {}, options: { abort?: boolean } = {}) =>
    Effect.gen(function* () {
      const callID = `call_${PartID.ascending()}`
      const input = { ...params, ...extra }
      const controller = new AbortController()
      yield* sessions.updatePart({ id: PartID.ascending(), sessionID: chat.id, messageID: assistant.id, type: "tool",
        tool: "task", callID, state: { status: "running", input, time: { start: Date.now() } } })
      return yield* def.execute(input, { sessionID: chat.id, messageID: assistant.id, callID, agent: "maestro",
        agentID: "maestro", abort: controller.signal, extra: { promptOps: ops }, messages: [],
        metadata: () => Effect.sync(() => {
          if (options.abort) controller.abort()
        }), ask: () => Effect.void })
        .pipe(Effect.provideService(WorkflowBinding.NativeHost, workflowHost), Effect.exit)
    })

  // Puts the tree back to the one the authorizations approved, as a reverted worker edit does.
  const revert = () => Effect.promise(() => rm(path.join(chat.directory, "src", "card.ts"), { force: true }))
  return { chat, prompts, reviewed, hook, relay, call, authorize, revert, rearm }
})

// The first dispatch: the reply settles, the cold review finds no code review, and the Task returns the hold.
const setup = Effect.fn("TaskWorkflowResumeTest.setup")(function* () {
  const f = yield* fixture()
  const sessions = yield* Session.Service
  const held = yield* f.call()
  expect(Exit.isFailure(held)).toBe(true)
  expect(f.prompts.count).toBe(1)
  const child = SessionID.make((yield* sessions.children(f.chat.id))[0]?.id ?? "ses_missing")
  const logical = yield* LogicalTask.read(child)
  if (!logical) throw new Error("fixture child has no logical task")
  return { child, taskID: logical.taskId, prompts: f.prompts, reviewed: f.reviewed, call: f.call }
})

it.instance("a held workflow child resumed with the approved input is prompted again and settles the held step", () =>
  Effect.gen(function* () {
    const f = yield* setup()
    // The real settlement host recorded the hold: nothing in this test writes it.
    const holds = yield* WorkflowBinding.reviewHolds(f.child)
    expect(holds).toHaveLength(1)
    expect(holds[0]).toMatchObject({ executionSessionID: f.child, token, expected: { attempt: 0, ledgerSeq: -1 } })

    f.reviewed.value = true
    // The held turn left its edit uncommitted, so the tree no longer equals the approved context; the continuation
    // runs on the workers' result instead of failing context-not-current.
    const resumed = yield* f.call({ task_id: f.taskID })
    expect(f.prompts.count).toBe(2)
    expect(Exit.isSuccess(resumed)).toBe(true)
    // The continuation graded the held step, so a later resume has nothing held to continue and only replays.
    yield* f.call({ task_id: f.taskID })
    expect(f.prompts.count).toBe(2)
  }), { git: true })

it.instance("an authorized dispatch that is not a continuation still requires the approved tree before the model", () =>
  Effect.gen(function* () {
    const f = yield* fixture({ hook: true })
    const exit = yield* f.call()
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) expect(Cause.pretty(exit.cause)).toContain("MaestroDispatchRejected: context-not-current")
    expect(f.prompts.count).toBe(0)
  }), { git: true })

// Live-03: a dispatch bound the arm and then held before its child's first provider turn, so the next authorization's
// dispatch failed WORKFLOW_ARM_BINDING_MISMATCH and re-arming the same contract returned the same, still-bound token.
it.instance("an arm bound to a child that held before the model moves to the next authorization's child", () =>
  Effect.gen(function* () {
    const f = yield* fixture({ hook: true, persisted: true })
    const sessions = yield* Session.Service
    const held = yield* f.call()
    expect(Exit.isFailure(held)).toBe(true)
    if (Exit.isFailure(held)) expect(Cause.pretty(held.cause)).toContain("context-not-current")
    expect(f.prompts.count).toBe(0)
    const unrun = (yield* sessions.children(f.chat.id))[0]
    if (!unrun) throw new Error("missing reserved child")
    // The child holds its prompt and an empty reply, and the arm is bound to it.
    expect((yield* sessions.messages({ sessionID: unrun.id })).map((message) => message.info.role).sort())
      .toEqual(["assistant", "user"])
    expect((yield* WorkflowBinding.read(unrun.id))?.token).toBe(token)

    // The identical contract re-armed resolves the same token; the next authorization's child takes the arm and runs.
    f.hook.value = false
    yield* f.revert()
    f.reviewed.value = true
    const next = yield* f.authorize("evt_maestro_authorization_workflow_rearm")
    const ran = yield* f.call({ authorizationID: next })
    expect(Exit.isSuccess(ran)).toBe(true)
    expect(f.prompts.count).toBe(1)
    const child = SessionID.make(Dispatch.childSessionID(next))
    expect((yield* WorkflowBinding.read(child))?.token).toBe(token)

    // The move is recorded on the new child, the old binding stays as history, and the arm's ledger still audits.
    const database = yield* Database.Service
    const rebound = yield* database.db.select().from(EventTable).where(and(eq(EventTable.aggregate_id, child),
      eq(EventTable.type, EventV2.versionedType(MaestroEvent.Task.WorkflowRebound.type, 1)))).all().pipe(Effect.orDie)
    expect(rebound.map((row) => row.data)).toEqual([expect.objectContaining({ executionSessionID: child, from: unrun.id, token })])
    expect((yield* WorkflowBinding.read(unrun.id))?.executionSessionID).toBe(unrun.id)
    expect((yield* f.relay.audit(token)).result).toBe("PASS")
  }), { git: true })

it.instance("an arm bound to a child that ran refuses another authorization's child and leaves that authorization unspent", () =>
  Effect.gen(function* () {
    const f = yield* fixture()
    const sessions = yield* Session.Service
    // The first child runs and holds for the code review before the arm grades: the arm is untouched, but the child ran.
    expect(Exit.isFailure(yield* f.call())).toBe(true)
    expect(f.prompts.count).toBe(1)
    const ran = (yield* sessions.children(f.chat.id))[0]
    if (!ran) throw new Error("missing reserved child")

    yield* f.revert()
    f.reviewed.value = true
    const next = yield* f.authorize("evt_maestro_authorization_workflow_other")
    const refused = yield* f.call({ authorizationID: next })
    expect(Exit.isFailure(refused)).toBe(true)
    if (Exit.isFailure(refused)) expect(Cause.pretty(refused.cause)).toContain("WORKFLOW_ARM_BINDING_MISMATCH")
    expect(f.prompts.count).toBe(1)
    const child = SessionID.make(Dispatch.childSessionID(next))
    expect(yield* WorkflowBinding.read(child)).toBeUndefined()
    expect((yield* WorkflowBinding.read(ran.id))?.token).toBe(token)

    // Nothing of the authorization was spent: its child was never prompted, so it dispatches under a new contract.
    expect(yield* sessions.messages({ sessionID: child })).toHaveLength(0)
    yield* f.rearm("arm-fresh")
    const retried = yield* f.call({ authorizationID: next })
    expect(Exit.isSuccess(retried)).toBe(true)
    expect(f.prompts.count).toBe(2)
  }), { git: true })

const unheld = {
  "an absent hold record": (child: SessionID) => Effect.gen(function* () {
    const database = yield* Database.Service
    yield* database.db.delete(EventTable).where(and(eq(EventTable.aggregate_id, child),
      eq(EventTable.type, EventV2.versionedType(MaestroEvent.Task.WorkflowReviewHeld.type, 1)))).run().pipe(Effect.orDie)
  }),
  "a hold record of another position": (child: SessionID) => Effect.gen(function* () {
    const database = yield* Database.Service
    const rows = yield* database.db.select().from(EventTable).where(and(eq(EventTable.aggregate_id, child),
      eq(EventTable.type, EventV2.versionedType(MaestroEvent.Task.WorkflowReviewHeld.type, 1)))).all().pipe(Effect.orDie)
    expect(rows).toHaveLength(1)
    const data = Schema.decodeUnknownSync(MaestroEvent.Task.WorkflowReviewHeld.data)(rows[0].data)
    yield* database.db.update(EventTable).set({ data: { ...data, expected: { ...data.expected, ledgerSeq: data.expected.ledgerSeq + 1 } } })
      .where(eq(EventTable.id, rows[0].id)).run().pipe(Effect.orDie)
  }),
  "a running background job": (child: SessionID) => Effect.gen(function* () {
    const background = yield* BackgroundJob.Service
    yield* background.start({ id: child, type: "task", run: Effect.never })
  }),
}

for (const [variant, prepare] of Object.entries(unheld)) {
  it.instance(`a held workflow child with ${variant} replays strictly and is not prompted again`, () =>
    Effect.gen(function* () {
      const f = yield* setup()
      yield* prepare(f.child)
      f.reviewed.value = true
      const replay = yield* f.call({ task_id: f.taskID })
      expect(Exit.isFailure(replay)).toBe(true)
      expect(f.prompts.count).toBe(1)
      const background = yield* BackgroundJob.Service
      yield* background.cancel(f.child)
    }), { git: true })
}
