import { createHash } from "node:crypto"
import path from "node:path"
import type { HookInput } from "@anthropic-ai/claude-agent-sdk"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { Database } from "@orchestra/core/database/database"
import { filesystem } from "@orchestra/core/effect/app-node-platform"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { SessionProjector } from "@orchestra/core/session/projector"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { Effect } from "effect"
import { Agent } from "@/agent/agent"
import { BackgroundJob } from "@/background/job"
import { ClaudeHostHooks } from "@/claude-code/host/hooks"
import { ClaudeHostJoin } from "@/claude-code/host/join"
import { Config } from "@/config/config"
import { Archive } from "@/continuity/archive"
import { ArsenalBindings } from "@/maestro/arsenal-bindings"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Git } from "@/git"
import { LogicalTask } from "@/maestro/logical-task"
import { MessageID, PartID, type SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import { Todo } from "@/session/todo"
import { Skill } from "@/skill"
import { Truncate } from "@/tool/truncate"
import { TestAppNodeBuilder } from "../../fixture/app-node-builder"
import { testEffect } from "../../lib/effect"

export const it = testEffect(TestAppNodeBuilder.build(
  LayerNode.group([filesystem, FSUtil.node, CrossSpawnSpawner.node, Agent.node, BackgroundJob.node, Session.node,
    SessionProjector.node, EventV2Bridge.node, Database.node, Config.node, Todo.node, Archive.node, Truncate.node,
    ArsenalBindings.node, Git.node, Skill.node]),
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
    return Effect.promise(() => callback(event, undefined, { signal }))
  }
  const base = { session_id: `native-${chat.id}`, transcript_path: path.join(chat.directory, "native.jsonl"), cwd: chat.directory }
  const compact = (sessionID = base.session_id, signal = abort.signal, agentID?: string) =>
    fire({ ...base, session_id: sessionID, hook_event_name: "SessionStart", source: "compact", ...(agentID ? { agent_id: agentID } : {}) }, signal)
  const summary = (text: string, trigger: "manual" | "auto" = "auto", sessionID = base.session_id, signal = abort.signal, agentID?: string) =>
    fire({ ...base, session_id: sessionID, hook_event_name: "PostCompact", compact_summary: text, trigger,
      ...(agentID ? { agent_id: agentID } : {}) }, signal)
  const ref = { providerID: ProviderV2.ID.make("anthropic"), modelID: ModelV2.ID.make("claude-test") }
  const user = input.user === false || input.sessionID ? undefined : yield* sessions.updateMessage({
    id: MessageID.ascending(), role: "user", sessionID: chat.id, agent: ctx.agent, model: ref, time: { created: Date.now() },
  })
  const assistant = user ? yield* sessions.updateMessage({
    id: MessageID.ascending(), role: "assistant", sessionID: chat.id, parentID: user.id, agent: ctx.agent, mode: ctx.agent,
    providerID: ref.providerID, modelID: ref.modelID, cost: 0, path: { cwd: chat.directory, root: chat.directory },
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: Date.now(), completed: Date.now() }, finish: "stop",
  } satisfies SessionV1.Assistant) : undefined
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
  return { chat, ctx, hooks, compact, summary, fire, base, sessions, todos, archive, archiveDirectory, fs, user, assistant, task }
})

export * as CompactionFixture from "./compaction-fixture"
