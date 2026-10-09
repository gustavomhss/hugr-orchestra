import { expect } from "bun:test"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { eq } from "drizzle-orm"
import { Cause, Effect, Exit, Layer } from "effect"
import { Database } from "@orchestra/core/database/database"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { SessionProjector } from "@orchestra/core/session/projector"
import { SessionTable } from "@orchestra/core/session/sql"
import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { InstanceRef } from "@/effect/instance-ref"
import { InstanceState } from "@/effect/instance-state"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { InvocationBindingHost } from "@/maestro/invocation-binding"
import { LogicalTask } from "@/maestro/logical-task"
import { SessionPrompt } from "@/session/prompt"
import { MessageID, SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import { ToolRegistry } from "@/tool/registry"
import { Tool } from "@/tool/tool"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { TestConfig } from "../fixture/config"
import { provideInstance, TestInstance, tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { TestLLMServer } from "../lib/llm-server"

const model = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") }
const config = Layer.effect(
  Config.Service,
  Effect.gen(function* () {
    const llm = yield* TestLLMServer
    return TestConfig.make({
      get: () =>
        InstanceState.directory.pipe(
          Effect.map((directory) => ({
            agent: { backend: { name: "Copper" } },
            plugin_origins: [
              {
                spec: pathToFileURL(path.join(directory, "binding-plugin.ts")).href,
                source: path.join(directory, "orchestra.json"),
                scope: "local" as const,
              },
            ],
            provider: {
              test: {
                npm: "@ai-sdk/openai-compatible",
                name: "Test",
                options: { baseURL: llm.url, apiKey: "test" },
                models: { "test-model": { name: "Test", limit: { context: 100000, output: 10000 } } },
              },
            },
          })),
        ),
    })
  }),
)
const it = testEffect(
  TestAppNodeBuilder.build(
    LayerNode.group([
      ToolRegistry.node,
      Session.node,
      SessionProjector.node,
      SessionPrompt.node,
      Agent.node,
      Database.node,
      FSUtil.node,
      CrossSpawnSpawner.node,
      EventV2Bridge.node,
    ]),
    [
      [Config.node, config],
      [RuntimeFlags.node, RuntimeFlags.layer({ disableDefaultPlugins: true })],
    ],
  ).pipe(Layer.provideMerge(TestLLMServer.layer)),
)

// Real Plugin loader + registry adapter. A permitted read override also exercises the native prompt path.
const options = {
  git: true,
  init: (directory: string) =>
    Effect.promise(() =>
      Bun.write(
        path.join(directory, "binding-plugin.ts"),
        `export default async () => ({ tool: { read: {
    description: "binding probe",
    args: { filePath: { type: "string" }, fail: { type: "boolean" } },
    execute: async (_args, context) => {
      await context.ask({ permission: "read", patterns: ["."], always: [], metadata: {} })
      const binding = context.binding
      const frozen = binding ? Object.isFrozen(binding) : false
      const mutation = binding ? Reflect.set(binding, "memberId", "spoof") : false
      const replacement = Reflect.set(context, "binding", { memberId: "spoof" })
      await context.metadata({ title: "plugin progress", metadata: { receipt: "before-failure", forgedTask: "spoof" } })
      if (_args.fail) throw new Error("plugin probe failed")
      return { output: "ok", metadata: {
        binding, frozen, mutation, replacement, contextFrozen: Object.isFrozen(context),
        agent: context.agent, agentID: context.agentID, callID: context.callID,
        directory: context.directory, worktree: context.worktree,
      } }
    },
  } } })`,
      ),
    ).pipe(Effect.asVoid),
}

const fixture = Effect.gen(function* () {
  const sessions = yield* Session.Service
  const registry = yield* ToolRegistry.Service
  const agents = yield* Agent.Service
  const instance = yield* InstanceState.context
  const root = yield* sessions.create({ title: "Root", agent: "maestro" })
  const parent = yield* sessions.create({ parentID: root.id, agent: "maestro" })
  // Session.agent deliberately differs from the executing assistant's agentID.
  const child = yield* sessions.create({
    parentID: parent.id,
    agent: "maestro",
    metadata: {
      binding: { memberId: "spoof", authoritySessionId: "ses_spoofed_authority" },
      taskId: "spoof",
    },
  })
  const backend = yield* agents.get("backend")
  if (!backend) throw new Error("native backend missing")
  expect(backend.native).toBe(true)
  expect(backend.name).toBe("Copper")
  const tool = (yield* registry.tools({ ...model, agent: backend })).findLast((tool) => tool.id === "read")
  if (!tool || tool.description !== "binding probe") throw new Error("real plugin read override missing")
  const asks: unknown[] = []
  const context: Tool.Context = {
    sessionID: child.id,
    messageID: MessageID.make("msg_binding"),
    callID: "call_binding",
    agent: backend.name,
    agentID: backend.id,
    abort: new AbortController().signal,
    messages: [],
    ask: (request) =>
      Effect.sync(() => {
        asks.push(request)
      }),
    metadata: () => Effect.void,
  }
  return {
    sessions,
    registry,
    tool,
    context,
    root,
    parent,
    child,
    instance,
    asks,
    args: { filePath: path.join(instance.directory, "binding-plugin.ts"), fail: false },
  }
})

it.instance(
  "binds renamed executing member to stored root authority and immutable public refs",
  () =>
    Effect.gen(function* () {
      const f = yield* fixture
      const spoofed = { ...f.context, binding: { memberId: "spoof" } }
      const result = yield* f.tool.execute({ ...f.args, binding: { authoritySessionId: "spoof" } }, spoofed)
      expect(result.metadata).toMatchObject({
        agent: "Copper",
        agentID: "backend",
        callID: f.context.callID,
        frozen: true,
        contextFrozen: true,
        mutation: false,
        replacement: false,
        directory: f.child.directory,
        worktree: f.instance.worktree,
        binding: {
          projectId: f.child.projectID,
          directory: f.child.directory,
          worktree: f.instance.worktree,
          memberId: "backend",
          executionSessionId: f.child.id,
          authoritySessionId: f.root.id,
          assistantMessageID: f.context.messageID,
          callID: f.context.callID,
        },
      })
      expect(result.metadata.binding.taskId).toBeUndefined()
      expect(result.metadata.binding.resumeRef).toBeUndefined()
      expect(f.asks).toHaveLength(1)
      const task = yield* LogicalTask.ensure({
        executionSessionID: f.child.id,
        authoritySessionID: f.root.id,
        projectID: f.child.projectID,
        memberID: "backend",
        source: "host",
      })
      const resumed = yield* f.tool.execute(f.args, f.context)
      expect(resumed.metadata.binding.taskId).toBe(task.taskId)
      expect(resumed.metadata.binding.resumeRef).toBeUndefined()
    }),
  options,
)

it.instance(
  "direct invocation has equal authority and execution Session; non-git worktree stays literal",
  () =>
    Effect.gen(function* () {
      const f = yield* fixture
      const result = yield* f.tool
        .execute(f.args, { ...f.context, sessionID: f.root.id })
        .pipe(Effect.provideService(InstanceRef, { ...f.instance, worktree: "/" }))
      expect(result.metadata.binding).toMatchObject({
        authoritySessionId: f.root.id,
        executionSessionId: f.root.id,
        directory: f.root.directory,
        worktree: "/",
      })
    }),
  options,
)

const refusals = [
  ["wrong-project", "session-project-mismatch"],
  ["foreign-parent", "session-project-mismatch"],
  ["cycle", "session-parent-cycle"],
  ["missing-session", "session-missing"],
  ["missing-parent", "session-missing"],
  ["missing-call", "invocation-identity-missing"],
  ["missing-assistant", "invocation-identity-missing"],
  ["missing-agent", "invocation-identity-missing"],
]
refusals.forEach(([scenario, reason]) =>
  it.instance(
    `native plugin refuses ${scenario} before plugin callback`,
    () =>
      Effect.gen(function* () {
        const f = yield* fixture
        // Positive control: this exact loaded plugin reaches its bridged ask before the invalid call.
        yield* f.tool.execute(f.args, f.context)
        expect(f.asks).toHaveLength(1)
        f.asks.splice(0)
        const database = yield* Database.Service
        const foreignDir = yield* tmpdirScoped({ git: true })
        const foreign = yield* f.sessions.create({}).pipe(provideInstance(foreignDir))
        if (scenario === "cycle" || scenario === "foreign-parent" || scenario === "missing-parent")
          yield* database.db
            .update(SessionTable)
            .set({
              parent_id:
                scenario === "cycle"
                  ? f.child.id
                  : scenario === "foreign-parent"
                    ? foreign.id
                    : SessionID.make("ses_missing_parent"),
            })
            .where(eq(SessionTable.id, f.root.id))
            .run()
            .pipe(Effect.orDie)
        const context = {
          ...f.context,
          sessionID:
            scenario === "wrong-project"
              ? foreign.id
              : scenario === "missing-session"
                ? SessionID.make("ses_missing")
                : f.child.id,
          callID: scenario === "missing-call" ? undefined : f.context.callID,
          agentID: scenario === "missing-agent" ? undefined : f.context.agentID,
        }
        if (scenario === "missing-assistant") Reflect.deleteProperty(context, "messageID")
        const exit = yield* f.tool.execute(f.args, context).pipe(Effect.exit)
        expect(Exit.isFailure(exit)).toBe(true)
        if (!Exit.isFailure(exit)) throw new Error("invalid native binding executed")
        const error = Cause.squash(exit.cause)
        expect(error).toBeInstanceOf(InvocationBindingHost.Denied)
        if (!(error instanceof InvocationBindingHost.Denied)) throw error
        expect(error.reason).toBe(reason)
        expect(f.asks).toEqual([])
      }),
    options,
  ),
)

it.instance(
  "legacy contexts keep agent fallback, bridged ask and optional call/binding",
  () =>
    Effect.gen(function* () {
      const f = yield* fixture
      const legacy = (yield* f.registry.all()).findLast((tool) => tool.id === "read")
      if (!legacy) throw new Error("legacy plugin missing")
      const result = yield* legacy.execute(f.args, {
        ...f.context,
        agent: "general",
        agentID: undefined,
        callID: undefined,
      })
      expect(result.output).toBe("ok")
      expect(result.metadata).toMatchObject({ agent: "general", agentID: "general", replacement: false })
      expect(result.metadata.callID).toBeUndefined()
      expect(result.metadata.binding).toBeUndefined()
      expect(f.asks).toHaveLength(1)
    }),
  options,
)

it.instance(
  "awaits async host metadata persistence before real plugin failure",
  () =>
    Effect.gen(function* () {
      const f = yield* fixture
      const exit = yield* f.tool
        .execute(
          { ...f.args, fail: true },
          {
            ...f.context,
            metadata: (input) => f.sessions.setMetadata({ sessionID: f.child.id, metadata: input.metadata ?? {} }),
          },
        )
        .pipe(Effect.exit)
      expect(Exit.isFailure(exit)).toBe(true)
      if (!Exit.isFailure(exit)) throw new Error("plugin failure missing")
      expect(String(Cause.squash(exit.cause))).toContain("plugin probe failed")
      expect((yield* f.sessions.get(f.child.id)).metadata).toMatchObject({ receipt: "before-failure" })
    }),
  options,
)

it.instance(
  "plugin metadata persists in real failed tool part through native V1 prompt",
  () =>
    Effect.gen(function* () {
      const f = yield* fixture
      const prompt = yield* SessionPrompt.Service
      const llm = yield* TestLLMServer
      const fs = yield* FSUtil.Service
      const test = yield* TestInstance
      const filePath = path.join(test.directory, "input.txt")
      yield* fs.writeFileString(filePath, "input")
      yield* llm.tool("read", { filePath, fail: true })
      yield* llm.text("failure recorded")
      yield* prompt.prompt({
        sessionID: f.child.id,
        agent: "backend",
        model,
        parts: [{ type: "text", text: "Run the read probe once." }],
      })
      const messages = yield* f.sessions.messages({ sessionID: f.child.id })
      const failed = messages
        .flatMap((message) => message.parts)
        .find((part) => part.type === "tool" && part.tool === "read" && part.state.status === "error")
      expect(failed).toBeDefined()
      if (!failed || failed.type !== "tool" || failed.state.status !== "error")
        throw new Error("failed read part missing")
      expect(failed.state.error).toContain("plugin probe failed")
      expect(failed.state.metadata).toMatchObject({ receipt: "before-failure", forgedTask: "spoof" })
      expect(yield* llm.pending).toBe(0)
    }),
  options,
  60000,
)
