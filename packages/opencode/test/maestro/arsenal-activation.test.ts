import { expect } from "bun:test"
import path from "node:path"
import { Cause, Effect, Layer, Schema } from "effect"
import { AgentV2 } from "@opencode-ai/core/agent"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { AppProcess } from "@opencode-ai/core/process"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Global } from "@opencode-ai/core/global"
import { LocationServiceMap } from "@opencode-ai/core/location-services"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { SessionMessage } from "@opencode-ai/core/session/message"
import { SessionStore } from "@opencode-ai/core/session/store"
import { ToolRegistry } from "@opencode-ai/core/tool/registry"
import { MaestroArsenal } from "@opencode-ai/core/tool/maestro-arsenal"
import { ArsenalBindings } from "@/maestro/arsenal-bindings"
import { ArsenalCompletion } from "@/maestro/arsenal-completion"
import { ArsenalObservations } from "@/maestro/arsenal-observations"
import { AppRuntime } from "@/effect/app-runtime"
import { InstanceRef } from "@/effect/instance-ref"
import { InstanceStore } from "@/project/instance-store"
import { Session } from "@/session/session"
import { MessageID, PartID } from "@/session/schema"
import { Service } from "@/tool/registry"
import { Tool } from "@/tool/tool"
import { Agent } from "@/agent/agent"
import { Permission } from "@/permission"
import { MCP } from "@/mcp"
import { Provider } from "@/provider/provider"
import { SessionProcessor } from "@/session/processor"
import { SessionTools } from "@/session/tools"
import { SessionPrompt } from "@/session/prompt"
import { Snapshot } from "@/snapshot"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import { Truncate } from "@/tool/truncate"
import { tmpdir } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { prepareArsenalSDK } from "./arsenal-fixture"
import { Database } from "@opencode-ai/core/database/database"
import { EventTable } from "@opencode-ai/core/event/sql"
import { EventV2 } from "@opencode-ai/core/event"
import { SessionEvent } from "@opencode-ai/core/session/event"
import { and, eq } from "drizzle-orm"

const it = testEffect(Layer.empty)

it.live(
  "real MCP transport stays behind native pre-execution guard; full remote output is inspected before retention",
  () =>
    Effect.promise(async () => {
      await using tmp = await tmpdir({
        git: true,
        config: {
          agent: { build: { permission: { "*": "allow" } } },
          provider: {
            native: {
              npm: "@ai-sdk/openai-compatible",
              options: { apiKey: "fixture-not-used", baseURL: "http://127.0.0.1:1" },
              models: { probe: { name: "Native boundary fixture" } },
            },
          },
        },
      })
      await prepareArsenalSDK(tmp.path, Global.Path.config)
      await AppRuntime.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const remote = yield* Effect.acquireRelease(
              Effect.promise(async () => {
                const calls: string[] = []
                const protocol = new Server({ name: "native-probe", version: "1.0.0" }, { capabilities: { tools: {} } })
                protocol.setRequestHandler(ListToolsRequestSchema, async () => ({
                  tools: [
                    {
                      name: "probe",
                      description: "Real remote safety fixture",
                      inputSchema: {
                        type: "object",
                        properties: { command: { type: "string" } },
                        required: ["command"],
                      },
                    },
                  ],
                }))
                protocol.setRequestHandler(CallToolRequestSchema, async (request) => {
                  const command = Schema.decodeUnknownSync(Schema.Struct({ command: Schema.String }))(
                    request.params.arguments,
                  ).command
                  calls.push(command)
                   return {
                     isError: command === "failure",
                     content: [
                      {
                        type: "text" as const,
                        text: "remote benign\n".repeat(10000) + (command === "raw" ? "ghp_" + "K".repeat(36) : ""),
                      },
                    ],
                  }
                })
                const transport = new WebStandardStreamableHTTPServerTransport({
                  sessionIdGenerator: () => crypto.randomUUID(),
                  enableJsonResponse: true,
                })
                await protocol.connect(transport)
                const http = Bun.serve({ port: 0, fetch: (request) => transport.handleRequest(request) })
                return {
                  calls,
                  url: http.url.toString(),
                  close: async () => {
                    await http.stop(true)
                    await protocol.close()
                  },
                }
              }),
              (server) => Effect.promise(server.close),
            )
            const instances = yield* InstanceStore.Service
            const instance = yield* instances.load({ directory: tmp.path })
            yield* Effect.gen(function* () {
              const sessions = yield* Session.Service
              const session = yield* sessions.create({ agent: "build" })
              const agents = yield* Agent.Service
              const agent = yield* agents.get("build")
              const providers = yield* Provider.Service
              const model = yield* providers.getModel(ProviderV2.ID.make("native"), ModelV2.ID.make("probe"))
              const mcp = yield* MCP.Service
              expect(
                (yield* mcp.add("native-probe", { type: "remote", url: remote.url, oauth: false })).status,
              ).toMatchObject({ "native-probe": { status: "connected" } })
              yield* Effect.addFinalizer(() => mcp.disconnect("native-probe").pipe(Effect.orDie))
              const snapshots = yield* Snapshot.Service
              const revision = yield* snapshots.track()
              const message = yield* sessions.updateMessage({
                id: MessageID.ascending(),
                sessionID: session.id,
                role: "assistant",
                parentID: MessageID.ascending(),
                agent: "build",
                mode: "build",
                path: { cwd: tmp.path, root: tmp.path },
                cost: 0,
                tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
                modelID: model.id,
                providerID: model.providerID,
                time: { created: Date.now() },
              })
              yield* sessions.updatePart({
                id: PartID.ascending(),
                sessionID: session.id,
                messageID: message.id,
                type: "step-start",
                snapshot: revision,
              })
              const processors = yield* SessionProcessor.Service
              const processor = yield* processors.create({ assistantMessage: message, sessionID: session.id, model })
              const prompts = yield* SessionPrompt.Service
              const native = yield* ArsenalBindings.make
              yield* native.withSession(
                session.id,
                Effect.gen(function* () {
                  const resolved = yield* SessionTools.resolve({
                    agent,
                    session,
                    model,
                    processor,
                    bypassAgentCheck: false,
                    messages: [],
                    promptOps: {
                      cancel: prompts.cancel,
                      resolvePromptParts: prompts.resolvePromptParts,
                      prompt: (input, options) =>
                        (options?.beforeModel ?? Effect.void).pipe(Effect.andThen(prompts.prompt(input)), Effect.orDie),
                    },
                  })
                  const tools = yield* native.wrapTools(
                    {
                      sessionID: session.id,
                      assistantMessageID: message.id,
                      directory: tmp.path,
                      projectID: session.projectID,
                    },
                    resolved,
                  )
                  const probe = Object.entries(tools).find(([name]) => name.endsWith("_probe"))
                  if (!probe || !probe[1].execute) throw new Error("Real MCP producer missing")
                  const execute = probe[1].execute
                   const invoke = (id: string, command: string, abortSignal = new AbortController().signal) =>
                    Effect.gen(function* () {
                      yield* sessions.updatePart({
                        id: PartID.ascending(),
                        sessionID: session.id,
                        messageID: message.id,
                        type: "tool",
                        tool: probe[0],
                        callID: id,
                        state: { status: "pending", input: { command }, raw: "" },
                      })
                      return yield* Effect.promise(async () =>
                        execute(
                          { command },
                           { toolCallId: id, messages: [], abortSignal },
                        ),
                      ).pipe(Effect.exit)
                    })
                  const denied = yield* invoke("mcp-denied", "rm -rf /")
                  expect(denied._tag).toBe("Failure")
                  expect(remote.calls).toEqual([])
                  const safe = yield* invoke("mcp-safe", "safe")
                  if (safe._tag !== "Success") return yield* safe
                  const output = Schema.decodeUnknownSync(
                    Schema.Struct({
                      title: Schema.String,
                      output: Schema.String,
                      metadata: Schema.Record(Schema.String, Schema.Unknown),
                    }),
                  )(safe.value)
                  expect(output.metadata.truncated).toBe(true)
                  yield* processor.completeToolCall("mcp-safe", output)
                  expect(remote.calls).toEqual(["safe"])
                  const fs = yield* FSUtil.Service
                  const before = yield* fs.readDirectory(Truncate.DIR)
                  const raw = yield* invoke("mcp-raw", "raw")
                  expect(raw._tag).toBe("Failure")
                  if (raw._tag !== "Failure") throw new Error("Remote raw secret escaped inspection")
                  expect(Cause.pretty(raw.cause)).toContain("Tool safety HOLD:")
                  expect(remote.calls).toEqual(["safe", "raw"])
                   expect(yield* fs.readDirectory(Truncate.DIR)).toEqual(before)
                   const failed = yield* invoke("mcp-failed", "failure")
                   expect(failed._tag).toBe("Failure")
                   if (failed._tag !== "Failure") throw new Error("Actual MCP SDK isError did not reject")
                   expect(Cause.pretty(failed.cause)).toContain("remote benign")
                   const cancelled = new AbortController()
                   cancelled.abort()
                   yield* invoke("mcp-cancelled", "safe", cancelled.signal)
                   const database = yield* Database.Service
                   const progress = yield* database.db.select().from(EventTable).where(and(eq(EventTable.aggregate_id, session.id), eq(EventTable.type, EventV2.versionedType(SessionEvent.Tool.Progress.type, 1)))).all().pipe(Effect.orDie)
                   const durable = progress.map((row) => Schema.decodeUnknownSync(SessionEvent.Tool.Progress.data)(row.data))
                   expect(durable.filter((data) => data.callID === "mcp-safe").map((data) => Schema.decodeUnknownSync(Schema.Struct({ outcome: Schema.String }))(data.structured.nativeArsenal).outcome)).toEqual(["started", "success"])
                   expect(durable.filter((data) => data.callID === "mcp-failed").map((data) => Schema.decodeUnknownSync(Schema.Struct({ outcome: Schema.String }))(data.structured.nativeArsenal).outcome)).toEqual(["started", "failure"])
                   expect(durable.filter((data) => data.callID === "mcp-cancelled").map((data) => Schema.decodeUnknownSync(Schema.Struct({ outcome: Schema.String }))(data.structured.nativeArsenal).outcome)).toEqual(["started", "cancelled"])
                   const observations = yield* ArsenalObservations.Service
                  const audit = yield* observations.read({
                    sessionID: session.id,
                    operation: "audit",
                    placement: { directory: tmp.path, projectID: session.projectID },
                  })
                  const facts = Schema.decodeUnknownSync(
                    Schema.Struct({
                      actions: Schema.Array(Schema.Struct({ tool: Schema.String, outcome: Schema.String })),
                    }),
                  )(audit.observations)
                  expect(
                    facts.actions
                      .filter((fact) => fact.tool === probe[0])
                      .map((fact) => fact.outcome)
                      .sort(),
                   ).toEqual(["denied", "denied", "failed", "failed", "succeeded"])
                }),
              )
            }).pipe(Effect.provideService(InstanceRef, instance))
          }).pipe(Effect.provide(LayerNode.compile(LayerNode.group([AppProcess.node, Global.node])))),
        ),
      )
    }),
  60000,
)

it.live(
  "production V2 registry reloads managed preferences after construction; restrictive reads and durable denied facts reach audit",
  () =>
    Effect.promise(async () => {
      await using tmp = await tmpdir({ git: true, config: { agent: { maestro: { permission: { "*": "allow" } } } } })
      await Bun.write(path.join(tmp.path, "locked.txt"), "locked\n")
      await Bun.write(path.join(tmp.path, "free.txt"), "free\n")
      await AppRuntime.runPromise(
        Effect.gen(function* () {
          const instances = yield* InstanceStore.Service
          const instance = yield* instances.load({ directory: tmp.path })
          const sessions = yield* Session.Service
          const session = yield* sessions
            .create({ agent: "maestro" })
            .pipe(Effect.provideService(InstanceRef, instance))
          const store = yield* SessionStore.Service
          const projected = yield* store.get(session.id)
          if (!projected) throw new Error("Session projection missing")
          const locations = yield* LocationServiceMap.Service
          yield* Effect.gen(function* () {
            const registry = yield* ToolRegistry.Service
            const materialized = yield* registry.materialize()
            const invoke = (id: string, name: string, input: unknown) =>
              materialized.settle({
                sessionID: session.id,
                agent: AgentV2.ID.make("maestro"),
                assistantMessageID: SessionMessage.ID.make("msg_profile_reload"),
                call: { type: "tool-call", id, name, input },
              })
            expect((yield* invoke("before", "read", { path: "locked.txt" })).result.type).toBe("json")
            expect((yield* invoke("describe", MaestroArsenal.names.describe, { name: "profile" })).result.type).toBe(
              "text",
            )
            expect(
              (yield* invoke("set", MaestroArsenal.names.execute, {
                name: "profile",
                arguments: { action: "set", patch: { neverTouch: ["locked.txt"] } },
              })).result.type,
            ).toBe("text")
            expect((yield* invoke("denied", "read", { path: "locked.txt" })).result).toEqual({
              type: "error",
              value: "Tool safety HOLD: project-never-touch",
            })
            expect((yield* invoke("allowed", "read", { path: "free.txt" })).result).toMatchObject({
              type: "json",
              value: { content: "free\n" },
            })
            const observations = yield* ArsenalObservations.Service
            const audit = yield* observations.read({
              sessionID: session.id,
              operation: "audit",
              placement: { directory: tmp.path, projectID: session.projectID },
            })
            const facts = Schema.decodeUnknownSync(
              Schema.Struct({ actions: Schema.Array(Schema.Struct({ tool: Schema.String, outcome: Schema.String })) }),
            )(audit.observations)
            expect(facts.actions.filter((fact) => fact.tool === "read").map((fact) => fact.outcome)).toEqual([
              "succeeded",
              "denied",
              "succeeded",
            ])
            expect(
              (yield* invoke("reset", MaestroArsenal.names.execute, {
                name: "profile",
                arguments: { action: "set", patch: { neverTouch: [] } },
              })).result.type,
            ).toBe("text")
            expect((yield* invoke("after-reset", "read", { path: "locked.txt" })).result.type).toBe("json")
          }).pipe(Effect.provide(locations.get(projected.location)))
        }),
      )
    }),
)

it.live(
  "custom producer denies before execution and inspects full raw metadata before truncation writes",
  () =>
    Effect.promise(async () => {
      await using tmp = await tmpdir({ git: true })
      await prepareArsenalSDK(tmp.path, Global.Path.config)
      await Bun.write(
        path.join(tmp.path, ".opencode/tools/probe.ts"),
        `export default {
      description: "Native boundary fixture",
      args: { command: { type: "string" } },
      async execute(args, context) {
        await Bun.write(context.directory + "/producer-ran", args.command)
        return { output: "benign\\n".repeat(10000), metadata: args.command === "raw" ? { token: "ghp_" + "J".repeat(36) } : { exit: args.command === "failed" ? 9 : 0 } }
      },
    }`,
      )
      await AppRuntime.runPromise(
        Effect.gen(function* () {
          const instances = yield* InstanceStore.Service
          const instance = yield* instances.load({ directory: tmp.path })
          yield* Effect.gen(function* () {
            const sessions = yield* Session.Service
            const session = yield* sessions.create({ agent: "build" })
            const registry = yield* Service
            const definitions = yield* registry.all()
            const probe = definitions.find((definition) => definition.id === "probe")
            if (!probe) throw new Error("Real custom producer missing")
            const fs = yield* FSUtil.Service
            const permission = yield* Permission.Service
            const agents = yield* Agent.Service
            const agent = yield* agents.get("build")
            const context: Tool.Context = {
              sessionID: session.id,
              messageID: MessageID.ascending(),
              callID: "custom-denied",
              agent: "build",
              abort: new AbortController().signal,
              messages: [],
              ask: (request) =>
                permission
                  .ask({
                    ...request,
                    sessionID: session.id,
                    ruleset: Permission.merge(agent.permission, session.permission ?? []),
                  })
                  .pipe(Effect.orDie),
              metadata: () => Effect.void,
            }
            const denied = yield* probe.execute({ command: "rm -rf /" }, context).pipe(Effect.exit)
            expect(denied._tag).toBe("Failure")
            expect(yield* fs.exists(path.join(tmp.path, "producer-ran"))).toBe(false)
            const safe = yield* probe.execute({ command: "safe" }, { ...context, callID: "custom-safe" })
            expect(safe.metadata.truncated).toBe(true)
            expect(yield* fs.exists(path.join(tmp.path, "producer-ran"))).toBe(true)
            const before = yield* fs.readDirectory(Truncate.DIR)
            const raw = yield* probe.execute({ command: "raw" }, { ...context, callID: "custom-raw" }).pipe(Effect.exit)
            expect(raw._tag).toBe("Failure")
            if (raw._tag !== "Failure") throw new Error("Raw secret escaped producer inspection")
            expect(Cause.pretty(raw.cause)).toContain("Tool safety HOLD:")
            expect(yield* fs.readDirectory(Truncate.DIR)).toEqual(before)
            const failed = yield* probe.execute({ command: "failed" }, { ...context, callID: "custom-failed" })
            expect(failed.metadata.exit).toBe(9)
            const database = yield* Database.Service
            const progress = yield* database.db.select().from(EventTable).where(and(eq(EventTable.aggregate_id, session.id), eq(EventTable.type, EventV2.versionedType(SessionEvent.Tool.Progress.type, 1)))).all().pipe(Effect.orDie)
            expect(progress.map((row) => Schema.decodeUnknownSync(SessionEvent.Tool.Progress.data)(row.data)).filter((data) => data.callID === "custom-failed").map((data) => Schema.decodeUnknownSync(Schema.Struct({ outcome: Schema.String }))(data.structured.nativeArsenal).outcome)).toEqual(["started", "failure"])
            const observations = yield* ArsenalObservations.Service
            const audit = yield* observations.read({
              sessionID: session.id,
              operation: "audit",
              placement: { directory: tmp.path, projectID: session.projectID },
            })
            expect(audit.observations).toMatchObject({
              actions: [
                { tool: "probe", outcome: "denied" },
                { tool: "probe", outcome: "succeeded" },
                { tool: "probe", outcome: "denied" },
                { tool: "probe", outcome: "failed" },
              ],
            })
          }).pipe(Effect.provideService(InstanceRef, instance))
        }),
      )
    }),
  90000,
)

it.live(
  "native Task host binds stored arm tokens to actual parent/child/call; green checks pass, red and unknown checks HOLD",
  () =>
    Effect.promise(async () => {
      await using tmp = await tmpdir({ git: true, config: { agent: { maestro: { permission: { "*": "allow" } } } } })
      await AppRuntime.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const instances = yield* InstanceStore.Service
            const instance = yield* instances.load({ directory: tmp.path })
            yield* Effect.gen(function* () {
              const sessions = yield* Session.Service
              const parent = yield* sessions.create({ agent: "maestro" })
              const child = yield* sessions.create({
                parentID: parent.id,
                agent: "build",
                permission: [{ permission: "edit", pattern: "**", action: "allow" }],
              })
              const messageID = MessageID.ascending()
              yield* sessions.updateMessage({
                id: messageID,
                sessionID: parent.id,
                role: "assistant",
                parentID: MessageID.ascending(),
                agent: "maestro",
                mode: "maestro",
                path: { cwd: tmp.path, root: tmp.path },
                cost: 0,
                tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
                modelID: ModelV2.ID.make("test"),
                providerID: ProviderV2.ID.make("test"),
                time: { created: Date.now() },
              })
              yield* sessions.updatePart({
                id: PartID.ascending(),
                messageID,
                sessionID: parent.id,
                type: "tool",
                tool: "task",
                callID: "native-task",
                state: { status: "running", input: { subagent_type: "build" }, time: { start: Date.now() } },
              })
              const registry = yield* Service
              const definitions = yield* registry.all()
              const describe = definitions.find((definition) => definition.id === MaestroArsenal.names.describe)
              const execute = definitions.find((definition) => definition.id === MaestroArsenal.names.execute)
              if (!describe || !execute) throw new Error("Native Arsenal tools missing")
              const permission = yield* Permission.Service
              const agents = yield* Agent.Service
              const agent = yield* agents.get("maestro")
              const context: Tool.Context = {
                sessionID: parent.id,
                messageID,
                callID: "native-arm",
                agent: "maestro",
                abort: new AbortController().signal,
                messages: [],
                ask: (request) =>
                  permission
                    .ask({
                      ...request,
                      sessionID: parent.id,
                      ruleset: Permission.merge(agent.permission, parent.permission ?? []),
                    })
                    .pipe(Effect.orDie),
                metadata: () => Effect.void,
              }
              yield* describe.execute({ name: "relay-arm" }, context)
              const arm = (check: string) =>
                execute.execute(
                  {
                    name: "relay-arm",
                    arguments: {
                      action: "arm",
                      contract: {
                        sessionID: parent.id,
                        label: check,
                        chain: [{ id: "gate", checks: [{ id: "proof", hostCheck: check }] }],
                      },
                    },
                  },
                  context,
                )
              const runtime = yield* ArsenalBindings.make
              const completion = yield* runtime.construct(ArsenalCompletion.make)
              const dispatch = {
                sessionID: parent.id,
                taskID: child.id,
                callID: "native-task",
                directory: tmp.path,
                projectID: parent.projectID,
              }
              yield* arm("permissions")
              expect(
                yield* completion.beforeDispatch({ ...dispatch, callID: "fabricated-call" }).pipe(Effect.flip),
              ).toMatchObject({ reason: "completion-native-task-call-missing-or-ambiguous" })
              const receipt = yield* completion.beforeDispatch(dispatch)
              if (!receipt) throw new Error("Actual native host did not bind completion")
              expect(yield* completion.verifiedCompletion(receipt, child.id)).toMatchObject({
                verified: true,
                taskID: child.id,
                checks: 1,
              })
              yield* arm("git-clean")
              const red = yield* completion.beforeDispatch(dispatch)
              expect(yield* completion.verifiedCompletion(red, child.id).pipe(Effect.flip)).toMatchObject({
                reason: "completion-checks-not-passing",
              })
              const observations = yield* ArsenalObservations.Service
              const audit = yield* observations.read({
                sessionID: parent.id,
                operation: "audit",
                placement: { directory: tmp.path, projectID: parent.projectID },
              })
              expect(audit.observations).toMatchObject({
                checks: {
                  complete: true,
                  results: [
                    {
                      status: "fail",
                      exitCode: 1,
                      provenance: {
                        source: "host-check",
                        sessionID: parent.id,
                        projectID: parent.projectID,
                        revisionKind: "git",
                      },
                    },
                  ],
                },
              })
              yield* arm("unknown-check")
              expect(yield* completion.beforeDispatch(dispatch).pipe(Effect.flip)).toMatchObject({
                reason: "completion-host-check-unbound",
              })
              const fs = yield* FSUtil.Service
              const tokenDirectory = path.join(
                MaestroArsenal.stateDirectory(Global.Path.data, parent.projectID),
                parent.projectID,
                "completion",
              )
              expect((yield* fs.readDirectory(tokenDirectory)).length).toBe(3)
            }).pipe(Effect.provideService(InstanceRef, instance))
          }).pipe(Effect.provide(LayerNode.compile(LayerNode.group([AppProcess.node, Global.node])))),
        ),
      )
    }),
)
