import { createHash } from "node:crypto"
import path from "node:path"
import type { HookInput } from "@anthropic-ai/claude-agent-sdk"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { Database } from "@orchestra/core/database/database"
import { filesystem } from "@orchestra/core/effect/app-node-platform"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { LocationServiceMap } from "@orchestra/core/location-services"
import { ModelV2 } from "@orchestra/core/model"
import { AppProcess } from "@orchestra/core/process"
import { ProviderV2 } from "@orchestra/core/provider"
import { SessionProjector } from "@orchestra/core/session/projector"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { Effect } from "effect"
import { Agent } from "@/agent/agent"
import { BackgroundJob } from "@/background/job"
import { ClaudeHostGate } from "@/claude-code/host/gate"
import { ClaudeHostHooks } from "@/claude-code/host/hooks"
import { ClaudeHostJoin } from "@/claude-code/host/join"
import { ClaudeHostMirror } from "@/claude-code/host/mirror"
import { ClaudeHost } from "@/claude-code/host/session"
import { ClaudeHostTodos } from "@/claude-code/host/todos"
import { Config } from "@/config/config"
import { Archive } from "@/continuity/archive"
import { recordAdmission } from "@/maestro/admission-record"
import { recordPlanRevision } from "@/maestro/plan-revision"
import { ArsenalBindings } from "@/maestro/arsenal-bindings"
import { ArsenalObservations } from "@/maestro/arsenal-observations"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Git } from "@/git"
import { LogicalTask } from "@/maestro/logical-task"
import { Permission } from "@/permission"
import { MessageID, PartID, type SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import { Todo } from "@/session/todo"
import { Skill } from "@/skill"
import { Truncate } from "@/tool/truncate"
import { TestAppNodeBuilder } from "../../fixture/app-node-builder"
import { testEffect } from "../../lib/effect"

export const it = testEffect(TestAppNodeBuilder.build(
  LayerNode.group([ClaudeHost.node, filesystem, FSUtil.node, CrossSpawnSpawner.node, Agent.node, BackgroundJob.node, Session.node,
    SessionProjector.node, EventV2Bridge.node, Database.node, Config.node, Todo.node, Archive.node, Truncate.node,
    ArsenalBindings.node, Git.node, Skill.node, Permission.node, AppProcess.node, ArsenalObservations.node,
    LocationServiceMap.node]),
  [[RuntimeFlags.node, RuntimeFlags.layer({})]],
))

/** Actual Session/SQLite/Todo/archive services; only the documented SDK callback input is scripted. */
export const make = Effect.fnUntraced(function* (input: {
  sessionID?: SessionID; parentID?: SessionID; agent?: string; user?: boolean
} = {}) {
  const sessions = yield* Session.Service
  const todos = yield* Todo.Service
  const archive = yield* Archive.Service
  const fs = yield* FSUtil.Service
  const context = yield* Effect.context<never>()
  const chat = input.sessionID ? yield* sessions.get(input.sessionID)
    : yield* sessions.create({ parentID: input.parentID, agent: input.agent ?? "maestro", title: "Compact-hook fixture" })
  if (!input.sessionID) yield* sessions.setMetadata({ sessionID: chat.id, metadata: {
    ...chat.metadata, claudeCode: { ...chat.metadata?.claudeCode, sessionId: `native-${chat.id}` },
  } })
  const archiveDirectory = path.join(yield* fs.realPath(Global.Path.data), "continuity",
    createHash("sha256").update(chat.id).digest("hex"))
  const abort = new AbortController()
  yield* Effect.addFinalizer(() => Effect.sync(() => abort.abort()))
  yield* Effect.addFinalizer(() => fs.remove(archiveDirectory, { recursive: true, force: true }).pipe(Effect.orDie))
  const ctx = {
    sessionID: chat.id, directory: chat.directory, worktree: chat.directory, agent: chat.agent ?? "maestro", abort,
    join: ClaudeHostJoin.make(), granted: { maestro: ["task"], backend: ["read"], archie: ["read"] },
    // HOST's service interpreter erases the effect's environment after capturing its actual built layer.
    run: <A, R>(effect: Effect.Effect<A, unknown, R>) =>
      Effect.runPromiseWith(context)(effect as unknown as Effect.Effect<A, unknown>),
  } satisfies ClaudeHostHooks.Context
  const hooks = ClaudeHostHooks.create(ctx)
  const fire = (event: HookInput, signal = abort.signal) => {
    const callback = hooks[event.hook_event_name]?.[0]?.hooks[0]
    if (!callback) throw new Error(`Missing ${event.hook_event_name} callback`)
    return Effect.promise(() => callback(event, undefined, { signal })).pipe(
      Effect.tap((output) =>
        Effect.sync(() => {
          if (event.hook_event_name === "PreToolUse" && event.tool_name === "Agent" && ClaudeHostGate.denied(output))
            console.error("Compaction fixture dispatch denied:", JSON.stringify(output))
        }),
      ),
    )
  }
  const base = { session_id: `native-${chat.id}`, transcript_path: path.join(chat.directory, "native.jsonl"), cwd: chat.directory }
  const compact = (sessionID = base.session_id, signal = abort.signal, agentID?: string) =>
    fire({ ...base, session_id: sessionID, hook_event_name: "SessionStart", source: "compact", ...(agentID !== undefined ? { agent_id: agentID } : {}) }, signal)
  const summary = (text: string, trigger: "manual" | "auto" = "auto", sessionID = base.session_id, signal = abort.signal, agentID?: string) =>
    fire({ ...base, session_id: sessionID, hook_event_name: "PostCompact", compact_summary: text, trigger,
      ...(agentID !== undefined ? { agent_id: agentID } : {}) }, signal)
  const ref = { providerID: ProviderV2.ID.make("anthropic"), modelID: ModelV2.ID.make("claude-test") }
  const created = Date.now()
  const user = input.user === false || input.sessionID ? undefined : yield* sessions.updateMessage({
    id: MessageID.ascending(), role: "user", sessionID: chat.id, agent: ctx.agent, model: ref, time: { created },
  })
  const assistant = user ? yield* sessions.updateMessage({
    id: MessageID.ascending(), role: "assistant", sessionID: chat.id, parentID: user.id, agent: ctx.agent, mode: ctx.agent,
    providerID: ref.providerID, modelID: ref.modelID, cost: 0, path: { cwd: chat.directory, root: chat.directory },
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: created + 1, completed: created + 1 }, finish: "stop",
  } satisfies SessionV1.Assistant) : undefined
  // Session pagination orders by timestamp then ID. Cloning the first turn's times can move a cut before its producer.
  const nextUser = Effect.fnUntraced(function* () {
    if (!user) throw new Error("Chronology fixture requires a user")
    const history = yield* sessions.messages({ sessionID: chat.id })
    return yield* sessions.updateMessage({ ...user, id: MessageID.ascending(),
      time: { created: Math.max(created, ...history.map((message) => message.info.time.created)) + 1 } })
  })
  const nextAssistant = Effect.fnUntraced(function* (owner: SessionV1.User) {
    if (!assistant) throw new Error("Chronology fixture requires an assistant")
    const history = yield* sessions.messages({ sessionID: chat.id })
    const time = Math.max(owner.time.created, ...history.map((message) => message.info.time.created)) + 1
    return yield* sessions.updateMessage({ ...assistant, id: MessageID.ascending(), parentID: owner.id,
      time: { created: time, completed: time } })
  })
  // Authored native result input goes through the same causal producer and durable receipt writes as the host mirror.
  const taskList = Effect.fnUntraced(function* (tasks: { id: string; subject: string; status: string }[], author = assistant) {
    if (!author) throw new Error("Native todo fixture requires an assistant")
    const part = yield* sessions.updatePart({ id: PartID.ascending(), sessionID: chat.id, messageID: author.id,
      type: "tool", tool: ClaudeHostMirror.toolName("TaskList"), callID: crypto.randomUUID(),
      metadata: { providerExecuted: true, claudeCodeTool: "TaskList" },
      state: { status: "completed", input: {}, output: JSON.stringify({ tasks }), title: "Tasks", metadata: {},
        time: { start: author.time.created, end: author.time.completed ?? author.time.created } } })
    const native = yield* ClaudeHostTodos.update({ sessionID: chat.id, sessions, name: "TaskList", args: {}, result: { tasks }, part })
    if (native?.status !== "known" || part.state.status !== "completed") throw new Error("Native TaskList did not produce a snapshot")
    const completed = yield* sessions.updatePart({ ...part, state: { ...part.state, input: { todos: native.todos },
      metadata: { todos: native.todos, claudeCodeTodo: native.receipt } } })
    yield* todos.update({ sessionID: chat.id, todos: native.todos })
    return completed
  })
  const task = Effect.fnUntraced(function* (id: string, ended = false) {
    if (!assistant) throw new Error("Task fixture requires a user and assistant")
    const child = yield* sessions.create({ parentID: chat.id, agent: "backend", title: id })
    yield* LogicalTask.ensure({ executionSessionID: child.id, authoritySessionID: chat.id,
      projectID: chat.projectID, memberID: "backend", source: "user", taskId: id })
    yield* sessions.updatePart({ id: PartID.ascending(), sessionID: chat.id, messageID: assistant.id,
      type: "tool", tool: "Agent", callID: `call-${id}`, metadata: { providerExecuted: true }, state: {
        status: "completed", title: id, input: { subagent_type: "orchestra:backend" }, output: "retained task receipt",
        metadata: { sessionId: child.id, workResult: { terminal: { reason: ended ? "ended" : "interrupted" } },
          claudeCodeDispatch: { grantID: `grant-${id}`, writeRoots: ["src/task"] } },
        time: { start: Date.now(), end: Date.now() },
      },
    })
    return child
  })
  const plan = Effect.fnUntraced(function* (goal: string, owner = user, author = assistant) {
    if (!owner || !author) throw new Error("Plan fixture requires a user and assistant")
    if (owner.sessionID !== chat.id || author.sessionID !== chat.id || author.parentID !== owner.id)
      throw new Error("Plan fixture requires the admission's actual owning producer")
    yield* recordAdmission({ sessionID: chat.id, messageID: owner.id, methodVersion: "admit-request-v1", assessment: {
      kind: "work", goal, known: [], proposals: [], unknowns: [], uncertainty: "none", activeWorkEffect: "none", reason: "Explicit work request." } })
    const revision = yield* recordPlanRevision({ sessionID: chat.id, admissionMessageID: owner.id, methodVersion: "plan-v1",
      goal: { value: goal, source: "stakeholder" }, acceptance: Array.from({ length: 10 }, (_, index) => ({
        value: `${goal}-ACCEPT-${index}`, source: "stakeholder" as const })), scope: [], constraints: [{ value: "DO-NOT-DEPLOY", source: "stakeholder" }],
      reviewRequirement: { value: "Cold review", source: "maestro" }, contextRequirement: "PENDING", assumptions: [], risks: [] })
    const name = "mcp__orchestra__maestro_record_plan_revision"
    const part = yield* sessions.updatePart({ id: PartID.ascending(), sessionID: chat.id, messageID: author.id, type: "tool",
      tool: ClaudeHostMirror.toolName(name), callID: `plan-${goal}`, metadata: { claudeCodeTool: name }, state: { status: "completed",
        input: { admissionMessageID: owner.id }, output: `${revision.status}: ${revision.id}\n\nBindings: ${JSON.stringify({ planRevisionID: revision.id, revisionHash: revision.revisionHash })}`,
        title: "Plan", metadata: { planRevisionID: revision.id, revisionHash: revision.revisionHash }, time: { start: 1, end: 2 } } })
    return { revision, part }
  })
  return { chat, ctx, hooks, compact, summary, fire, base, sessions, todos, archive, archiveDirectory, fs, user, assistant,
    nextUser, nextAssistant, taskList, task, plan }
})

export * as CompactionFixture from "./compaction-fixture"
