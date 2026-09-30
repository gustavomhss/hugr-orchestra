import { afterEach, expect } from "bun:test"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { filesystem } from "@opencode-ai/core/effect/app-node-platform"
import { Skill } from "../../src/skill"
import { EventV2 } from "@opencode-ai/core/event"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { MaestroEvent } from "@opencode-ai/schema/maestro-event"
import { Cause, Deferred, Effect, Exit, Fiber } from "effect"
import { Agent } from "../../src/agent/agent"
import { BackgroundJob } from "../../src/background/job"
import { Config } from "../../src/config/config"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { authorizationTaskIntentHash } from "../../src/maestro/authorization"
import { recordContext } from "../../src/maestro/context-record"
import { recordValidation } from "../../src/maestro/validation-record"
import { Git } from "../../src/git"
import { Session } from "../../src/session/session"
import type { SessionPrompt } from "../../src/session/prompt"
import { MessageID, PartID } from "../../src/session/schema"
import { SessionRunState } from "../../src/session/run-state"
import { SessionStatus } from "../../src/session/status"
import { TaskTool, type TaskPromptOps } from "../../src/tool/task"
import { Truncate } from "../../src/tool/truncate"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(
  LayerNode.compile(
    LayerNode.group([
      filesystem,
      Skill.node,
      Agent.node,
      BackgroundJob.node,
      Config.node,
      CrossSpawnSpawner.node,
      Database.node,
      EventV2Bridge.node,
      Git.node,
      Ripgrep.node,
      RuntimeFlags.node,
      Session.node,
      SessionProjector.node,
      SessionRunState.node,
      SessionStatus.node,
      Truncate.node,
    ]),
  ),
)

const model = {
  providerID: ProviderV2.ID.make("test"),
  modelID: ModelV2.ID.make("test-model"),
}

const seed = Effect.fn("TaskGovernanceTest.seed")(function* () {
  const sessions = yield* Session.Service
  const chat = yield* sessions.create({ title: "Pinned" })
  const user = yield* sessions.updateMessage({
    id: MessageID.ascending(),
    role: "user",
    sessionID: chat.id,
    agent: "build",
    model,
    time: { created: Date.now() },
  })
  const assistant: SessionV1.Assistant = {
    id: MessageID.ascending(),
    role: "assistant",
    parentID: user.id,
    sessionID: chat.id,
    mode: "build",
    agent: "build",
    cost: 0,
    path: { cwd: "/tmp", root: "/tmp" },
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    modelID: model.modelID,
    providerID: model.providerID,
    variant: "xhigh",
    time: { created: Date.now() },
  }
  yield* sessions.updateMessage(assistant)
  return { chat, assistant }
})

function reply(input: SessionPrompt.PromptInput): SessionV1.WithParts {
  const id = MessageID.ascending()
  return {
    info: {
      id,
      role: "assistant",
      parentID: input.messageID ?? MessageID.ascending(),
      sessionID: input.sessionID,
      mode: input.agent ?? "general",
      agent: input.agent ?? "general",
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
}

function stubOps(onPrompt?: (input: SessionPrompt.PromptInput) => void): TaskPromptOps {
  return {
    cancel: () => Effect.void,
    resolvePromptParts: (template) => Effect.succeed([{ type: "text", text: template }]),
    prompt: (input) =>
      Effect.sync(() => {
        onPrompt?.(input)
        return reply(input)
      }),
  }
}

afterEach(async () => {
  await disposeAllInstances()
})

it.instance(
  "dispatches exact routed child from AuthorizationGranted",
  () =>
    Effect.gen(function* () {
      const events = yield* EventV2Bridge.Service
      const { chat, assistant } = yield* seed()
      const planRevisionID = EventV2.ID.make("evt_maestro_plan_task_test")
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
      const contextRecord = yield* recordContext(planRevisionID, chat.id)
      const validation = yield* recordValidation({
        sessionID: chat.id,
        planRevisionID,
        contextRecordID: contextRecord.id,
        contextHash: contextRecord.contextHash,
        projectID: chat.projectID,
        workCardID: "card_task_test",
        workCard: "# Card\n",
        routedMemberID: "charlie",
        validatorID: "maestro",
        validatorVersion: "validation-v1",
        checks: [{ id: "typecheck", status: "PASS", detail: "clean" }],
      })
      const authorizationID = EventV2.ID.make("evt_maestro_authorization_task_test")
      yield* events.publish(
        MaestroEvent.Authorization.Granted,
        {
          sessionID: chat.id,
          projectID: chat.projectID,
          approvalMessageID: "msg_approval",
          validationRecordID: validation.id,
          workCardHash: validation.workCardHash,
          routedMemberID: validation.routedMemberID,
          rosterHash: validation.rosterHash,
          grantHash: validation.grantHash,
          reviewPolicyHash: validation.reviewPolicyHash,
          actor: validation.actor,
          reviewerID: "lucy",
          taskIntentHash: authorizationTaskIntentHash({ subagentType: "charlie", prompt: "implement card" }),
          methodVersion: "authorization-v1",
        },
        { id: authorizationID },
      )
      const config = yield* Config.Service
      const entered = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      let entries = 0
      const task = yield* TaskTool.pipe(
        Effect.provideService(Config.Service, {
          ...config,
          get: () =>
            Effect.gen(function* () {
              entries++
              yield* Deferred.succeed(entered, undefined)
              yield* Deferred.await(release)
              return yield* config.get()
            }),
        }),
      )
      const def = yield* task.init()
      let prompts = 0
      const context = {
        sessionID: chat.id,
        messageID: assistant.id,
        agent: "maestro",
        agentID: "maestro",
        abort: new AbortController().signal,
        extra: { promptOps: stubOps(() => prompts++) },
        messages: [],
        metadata: () => Effect.void,
        ask: () => Effect.void,
      }
      const params = {
        description: "implement card",
        prompt: "implement card",
        subagent_type: "charlie",
        authorizationID,
      }
      const first = yield* def.execute(params, context).pipe(Effect.exit, Effect.forkChild({ startImmediately: true }))
      yield* Deferred.await(entered)
      // Both callers start immediately; pause the first inside execution before any Git or DB work.
      const second = yield* def.execute(params, context).pipe(Effect.exit, Effect.forkChild({ startImmediately: true }))
      expect(entries).toBe(1)
      yield* Deferred.succeed(release, undefined)
      const attempts = yield* Effect.all([Fiber.join(first), Fiber.join(second)])
      const successes = attempts.filter(Exit.isSuccess)
      const failures = attempts.filter(Exit.isFailure)
      expect(successes).toHaveLength(1)
      expect(failures).toHaveLength(1)
      expect(Cause.pretty(failures[0].cause)).toContain("reserved-child-incomplete")
      const result = successes[0].value
      const sessions = yield* Session.Service
      const child = (yield* sessions.children(chat.id))[0]
      expect(child?.agent).toBe("charlie")
      expect(result.metadata.sessionId).toBe(child?.id)
      expect(prompts).toBe(1)
      const incomplete = yield* def.execute(params, context).pipe(Effect.exit)
      expect(Exit.isFailure(incomplete)).toBe(true)
      if (Exit.isFailure(incomplete)) expect(Cause.pretty(incomplete.cause)).toContain("reserved-child-incomplete")
      if (!child) throw new Error("missing child")
      const childUser = yield* sessions.updateMessage({
        id: MessageID.ascending(),
        role: "user",
        sessionID: child.id,
        agent: "charlie",
        model,
        time: { created: Date.now() },
      })
      const completed: SessionV1.Assistant = {
        id: MessageID.ascending(),
        role: "assistant",
        parentID: childUser.id,
        sessionID: child.id,
        mode: "charlie",
        agent: "charlie",
        cost: 0,
        path: { cwd: "/tmp", root: "/tmp" },
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        modelID: model.modelID,
        providerID: model.providerID,
        time: { created: Date.now() },
        finish: "stop",
      }
      const test = yield* TestInstance
      yield* Effect.promise(() => Bun.write(`${test.directory}/child-change.txt`, "authorized work\n"))
      const intermediate = {
        ...completed,
        id: MessageID.ascending(),
        finish: "tool-calls",
        time: { created: completed.time.created - 1 },
      }
      yield* sessions.updateMessage(intermediate)
      yield* sessions.updatePart({
        id: PartID.ascending(),
        messageID: intermediate.id,
        sessionID: child.id,
        type: "text",
        text: "intermediate",
      })
      const continuing = yield* def.execute(params, context).pipe(Effect.exit)
      expect(Exit.isFailure(continuing)).toBe(true)
      if (Exit.isFailure(continuing)) expect(Cause.pretty(continuing.cause)).toContain("reserved-child-incomplete")
      yield* sessions.updateMessage(completed)
      yield* sessions.updatePart({
        id: PartID.ascending(),
        messageID: completed.id,
        sessionID: child.id,
        type: "text",
        text: "done",
      })
      const replay = yield* def.execute(params, context)
      expect(replay.metadata.sessionId).toBe(child.id)
      expect(replay.output).toContain("done")
      expect(replay.output).not.toContain("intermediate")
      expect(prompts).toBe(1)
      const newer = {
        ...completed,
        id: MessageID.ascending(),
        finish: undefined,
        time: { created: completed.time.created + 1 },
      }
      yield* sessions.updateMessage(newer)
      const unfinished = yield* def.execute(params, context).pipe(Effect.exit)
      expect(Exit.isFailure(unfinished)).toBe(true)
      if (Exit.isFailure(unfinished)) expect(Cause.pretty(unfinished.cause)).toContain("reserved-child-incomplete")
      yield* sessions.updateMessage({ ...newer, finish: "unknown" })
      const unknown = yield* def.execute(params, context).pipe(Effect.exit)
      expect(Exit.isFailure(unknown)).toBe(true)
      if (Exit.isFailure(unknown)) expect(Cause.pretty(unknown.cause)).toContain("reserved-child-incomplete")
      yield* sessions.updateMessage({
        ...newer,
        finish: "stop",
        error: { name: "UnknownError", data: { message: "failed" } },
      })
      const failed = yield* def.execute(params, context).pipe(Effect.exit)
      expect(Exit.isFailure(failed)).toBe(true)
      if (Exit.isFailure(failed)) expect(Cause.pretty(failed.cause)).toContain("reserved-child-incomplete")
      yield* sessions.updateMessage({ ...newer, finish: "stop" })
      yield* sessions.updatePart({
        id: PartID.ascending(),
        messageID: newer.id,
        sessionID: child.id,
        type: "tool",
        tool: "shell",
        callID: "failed-tool",
        metadata: { providerExecuted: true },
        state: { status: "error", input: {}, error: "tool failed", time: { start: 1, end: 2 } },
      })
      const toolFailed = yield* def.execute(params, context).pipe(Effect.exit)
      expect(Exit.isFailure(toolFailed)).toBe(true)
      if (Exit.isFailure(toolFailed)) expect(Cause.pretty(toolFailed.cause)).toContain("reserved-child-incomplete")
      yield* sessions.removeMessage({ sessionID: child.id, messageID: newer.id })
      const background = yield* BackgroundJob.Service
      const finish = yield* Deferred.make<void>()
      yield* background.start({ id: child.id, type: "task", run: Deferred.await(finish).pipe(Effect.as("done")) })
      const running = yield* def.execute(params, context).pipe(Effect.exit)
      expect(Exit.isFailure(running)).toBe(true)
      if (Exit.isFailure(running)) expect(Cause.pretty(running.cause)).toContain("reserved-child-incomplete")
      yield* Deferred.succeed(finish, undefined)
      yield* background.wait({ id: child.id })
      expect((yield* def.execute(params, context)).output).toContain("done")
      expect(prompts).toBe(1)
      const changed = yield* Effect.exit(
        def.execute(
          { description: "different", prompt: "different work", subagent_type: "charlie", authorizationID },
          context,
        ),
      )
      expect(Exit.isFailure(changed)).toBe(true)
      if (Exit.isFailure(changed)) expect(Cause.pretty(changed.cause)).toContain("task-intent-mismatch")
    }),
  { git: true },
)

it.instance("resumes exact native task session from task_id", () =>
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    const { chat, assistant } = yield* seed()
    const child = yield* sessions.create({ parentID: chat.id, title: "Existing child", agent: "general" })
    const priorUser = yield* sessions.updateMessage({
      id: MessageID.ascending(),
      role: "user",
      sessionID: child.id,
      agent: "general",
      model,
      time: { created: Date.now() },
    })
    yield* sessions.updatePart({
      id: PartID.ascending(),
      messageID: priorUser.id,
      sessionID: child.id,
      type: "text",
      text: "prior task prompt",
    })
    const priorAssistant: SessionV1.Assistant = {
      id: MessageID.ascending(),
      role: "assistant",
      parentID: priorUser.id,
      sessionID: child.id,
      mode: "general",
      agent: "general",
      cost: 0,
      path: { cwd: "/tmp", root: "/tmp" },
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      modelID: model.modelID,
      providerID: model.providerID,
      time: { created: Date.now() },
    }
    yield* sessions.updateMessage(priorAssistant)
    yield* sessions.updatePart({
      id: PartID.ascending(),
      messageID: priorAssistant.id,
      sessionID: child.id,
      type: "text",
      text: "prior task result",
    })
    const priorHistory = yield* sessions.messages({ sessionID: child.id })
    let seen: SessionPrompt.PromptInput | undefined
    const task = yield* TaskTool
    const result = yield* task.init().pipe(
      Effect.flatMap((def) =>
        def.execute(
          {
            description: "inspect bug",
            prompt: "look into the cache key path",
            subagent_type: "general",
            task_id: child.id,
          },
          {
            sessionID: chat.id,
            messageID: assistant.id,
            agent: "build",
            abort: new AbortController().signal,
            extra: { promptOps: stubOps((input) => (seen = input)) },
            messages: [],
            metadata: () => Effect.void,
            ask: () => Effect.void,
          },
        ),
      ),
    )
    const children = yield* sessions.children(chat.id)
    expect(children).toHaveLength(1)
    expect(children[0]?.id).toBe(child.id)
    expect(children[0]?.parentID).toBe(chat.id)
    expect(children[0]?.agent).toBe("general")
    expect(result.metadata.sessionId).toBe(child.id)
    expect(result.output).toContain(`<task id="${child.id}" state="completed">`)
    expect(seen?.sessionID).toBe(child.id)
    expect(seen?.agent).toBe("general")
    expect(seen?.parts).toEqual([{ type: "text", text: "look into the cache key path" }])
    expect(seen?.variant).toBe("xhigh")
    expect(yield* sessions.messages({ sessionID: child.id })).toEqual(priorHistory)
  }),
)

it.instance("denies task_id with different parent or agent", () =>
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    const { chat, assistant } = yield* seed()
    const otherParent = yield* sessions.create({ title: "Other parent" })
    const wrongParent = yield* sessions.create({ parentID: otherParent.id, title: "Wrong parent", agent: "general" })
    const wrongAgent = yield* sessions.create({ parentID: chat.id, title: "Wrong agent", agent: "explore" })
    const task = yield* TaskTool
    const def = yield* task.init()
    const execute = (taskID: string) =>
      def.execute(
        {
          description: "inspect bug",
          prompt: "look into the cache key path",
          subagent_type: "general",
          task_id: taskID,
        },
        {
          sessionID: chat.id,
          messageID: assistant.id,
          agent: "build",
          abort: new AbortController().signal,
          extra: { promptOps: stubOps() },
          messages: [],
          metadata: () => Effect.void,
          ask: () => Effect.void,
        },
      )
    for (const taskID of [wrongParent.id, wrongAgent.id]) {
      const exit = yield* execute(taskID).pipe(Effect.exit)
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(Cause.pretty(exit.cause)).toContain("Task resume denied: task is not direct child for selected agent")
      }
    }
    expect(yield* sessions.children(chat.id)).toEqual([wrongAgent])
    expect(yield* sessions.children(otherParent.id)).toEqual([wrongParent])
  }),
)

it.instance(
  "native task permission denies survive bypass while custom callers remain unchanged",
  () =>
    Effect.gen(function* () {
      const { chat, assistant } = yield* seed()
      const task = yield* TaskTool
      const def = yield* task.init()
      const invoke = (caller: string) =>
        def.execute(
          { description: "inspect bug", prompt: "look into the cache key path", subagent_type: "general" },
          {
            sessionID: chat.id,
            messageID: assistant.id,
            agent: caller,
            abort: new AbortController().signal,
            extra: { bypassAgentCheck: true, promptOps: stubOps() },
            messages: [],
            metadata: () => Effect.void,
            ask: () => Effect.void,
          },
        )
      for (const caller of ["Lucy", "Charlie"]) {
        const exit = yield* invoke(caller).pipe(Effect.exit)
        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBeInstanceOf(PermissionV1.DeniedError)
      }
      yield* invoke("custom")
    }),
  { config: { agent: { custom: { mode: "subagent" } } } },
)
