import { expect } from "bun:test"
import { Auth, LLMClient, RequestExecutor } from "@orchestra/llm/route"
import { bodyFields, route, type OpenAIChatBody } from "@orchestra/llm/protocols/openai-chat"
import { AgentV2 } from "@orchestra/core/agent"
import { CapabilityInvocation } from "@orchestra/core/capability/invocation"
import { CapabilityPolicy } from "@orchestra/core/capability/policy"
import { Config } from "@orchestra/core/config"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNodePlatform } from "@orchestra/core/effect/app-node-platform"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Location } from "@orchestra/core/location"
import { PermissionV2 } from "@orchestra/core/permission"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { SessionEvent } from "@orchestra/core/session/event"
import { Prompt } from "@orchestra/core/session/prompt"
import { SessionProjector } from "@orchestra/core/session/projector"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionRunCoordinator } from "@orchestra/core/session/run-coordinator"
import { SessionRunner } from "@orchestra/core/session/runner"
import { node } from "@orchestra/core/session/runner/llm"
import { SessionRunnerModel } from "@orchestra/core/session/runner/model"
import { SessionInputTable, SessionTable } from "@orchestra/core/session/sql"
import { SessionStore } from "@orchestra/core/session/store"
import { Snapshot } from "@orchestra/core/snapshot"
import { SystemContext } from "@orchestra/core/system-context"
import { SkillGuidance } from "@orchestra/core/skill/guidance"
import { ReferenceGuidance } from "@orchestra/core/reference/guidance"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Tool } from "@orchestra/core/tool/tool"
import { Deferred, Effect, Fiber, Layer, Ref, Schema } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { eq } from "drizzle-orm"
import { it } from "./lib/effect"
import { location } from "./fixture/location"

// Core roots only: this does not prove an app/child bridge or a native Permission floor.
it.live("binds real Core roots to issuing placement and pre-provider permission snapshot", () =>
  Effect.gen(function* () {
    const placement = location({ directory: AbsolutePath.make("/project") })
    const ref = Location.Ref.make({ directory: placement.directory, workspaceID: placement.workspaceID })
    const issuer = AgentV2.ID.make("issuer")
    const replacement = AgentV2.ID.make("replacement")
    const rules: PermissionV2.Ruleset = [
      { action: "read", resource: "*", effect: "allow" },
      { action: "read", resource: "secret", effect: "deny" },
      { action: "hidden_probe", resource: "*", effect: "deny" },
    ]
    const selected = yield* Deferred.make<void>()
    const providerGate = yield* Deferred.make<void>()
    const ready = yield* Deferred.make<void>()
    const toolGate = yield* Deferred.make<void>()
    const started = yield* Ref.make(0)
    const effects = yield* Ref.make<string[]>([])
    const contexts: Tool.Context[] = []
    const bindings: CapabilityInvocation.Binding[] = []
    const requests: { sessionID: string | null; auth: string | null; body: OpenAIChatBody }[] = []
    const fake = {
      issuer: "app", owner: { projectID: "fake", sessionID: "fake", agentID: "replacement" },
      invocation: { assistantMessageID: "fake", callID: "fake" }, rootToolName: "hidden_probe",
      effectiveRules: [{ action: "*", resource: "*", effect: "allow" }], nativeDenyFloor: [],
    }
    // Scoped server starts only when this live test executes in test:ci.
    const server = yield* Effect.acquireRelease(
      Effect.sync(() => Bun.serve({
        hostname: "127.0.0.1", port: 0,
        fetch: async (request) => {
          const body = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Struct(bodyFields)))(await request.text())
          requests.push({ sessionID: request.headers.get("X-Session-Id"), auth: request.headers.get("authorization"), body })
          if (request.method !== "POST" || new URL(request.url).pathname !== "/chat/completions" || requests.length > 2)
            return new Response("Unexpected provider request", { status: 400 })
          const first = requests.length === 1
          const events = first ? [
            { choices: [{ delta: { tool_calls: ["public", "secret"].map((resource, index) => ({
              index, id: `call-${resource}`, function: {
                name: "service_call", arguments: JSON.stringify({ resource, binding: fake }),
              },
            })) } }] },
            { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
          ] : [{ choices: [{ delta: { content: "Done" }, finish_reason: "stop" }] }]
          return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n", {
            headers: { "content-type": "text/event-stream" },
          })
        },
      })),
      (server) => Effect.promise(() => server.stop(true)),
    )
    const model = route.with({ endpoint: { baseURL: `http://127.0.0.1:${server.port}` }, auth: Auth.none }).model({ id: "fixture" })
    const client = LLMClient.layer.pipe(Layer.provide(RequestExecutor.layer.pipe(Layer.provide(FetchHttpClient.layer))))
    const replacements = [
      [Location.node, Layer.succeed(Location.Service, Location.Service.of(placement))],
      [LayerNodePlatform.llmClient, client],
      [SessionRunnerModel.node, SessionRunnerModel.layerWith(() => Deferred.succeed(selected, undefined).pipe(
        Effect.andThen(Deferred.await(providerGate)), Effect.as(model),
      ))],
      [Config.node, Layer.succeed(Config.Service, Config.Service.of({ entries: () => Effect.succeed([]) }))],
      [Snapshot.node, Snapshot.noopLayer],
      [SkillGuidance.node, Layer.succeed(SkillGuidance.Service, SkillGuidance.Service.of({ load: () => Effect.succeed(SystemContext.empty) }))],
      [ReferenceGuidance.node, Layer.succeed(ReferenceGuidance.Service, ReferenceGuidance.Service.of({ load: () => Effect.succeed(SystemContext.empty) }))],
    ] as const
    const runnerLayer = AppNodeBuilder.build(node, replacements)
    const execution = Layer.effect(SessionExecution.Service, Effect.gen(function* () {
      const runner = yield* SessionRunner.Service
      const coordinator = yield* SessionRunCoordinator.make<SessionV2.ID, SessionRunner.RunError>({
        drain: (sessionID, force) => runner.run({ sessionID, force }),
      })
      return SessionExecution.Service.of({
        active: coordinator.active, resume: coordinator.run, wake: coordinator.wake, interrupt: coordinator.interrupt,
      })
    })).pipe(Layer.provide(runnerLayer))
    const layer = AppNodeBuilder.build(LayerNode.group([
      node, SessionV2.node, SessionProjector.node, SessionStore.node, PermissionV2.node, ToolRegistry.node,
      Database.node, AgentV2.node, EventV2.node, Location.node,
    ]), [...replacements, [SessionExecution.node, execution]])

    yield* Effect.gen(function* () {
      const database = yield* Database.Service
      const agents = yield* AgentV2.Service
      const sessions = yield* SessionV2.Service
      const store = yield* SessionStore.Service
      const permissions = yield* PermissionV2.Service
      const registry = yield* ToolRegistry.Service
      const events = yield* EventV2.Service
      const policy = yield* CapabilityPolicy.make
      const sessionID = SessionV2.ID.create()
      yield* database.db.insert(ProjectTable).values({
        id: placement.project.id, worktree: placement.directory, sandboxes: [],
      }).onConflictDoNothing().run().pipe(Effect.orDie)
      yield* database.db.insert(SessionTable).values({
        id: sessionID, project_id: placement.project.id, directory: placement.directory,
        slug: "capability-runner", title: "capability-runner", version: "test", agent: issuer,
      }).run().pipe(Effect.orDie)
      yield* agents.transform((editor) => {
        editor.update(issuer, (agent) => { agent.permissions = rules.map((rule) => ({ ...rule })) })
        editor.update(replacement, (agent) => { agent.permissions = [{ action: "*", resource: "*", effect: "deny" }] })
      })
      const tool = Tool.make({
        description: "Authorize a resource before the sentinel side effect",
        input: Schema.Struct({ resource: Schema.String, binding: Schema.Unknown }),
        output: Schema.String,
        execute: (input, context) => Effect.gen(function* () {
          contexts.push(context)
          const stored = yield* store.message(context.assistantMessageID)
          expect(stored?.message).toMatchObject({ type: "assistant", agent: issuer })
          expect(stored?.message.type === "assistant" ? stored.message.content.find((part) =>
            part.type === "tool" && part.id === context.toolCallID) : undefined).toMatchObject({
            type: "tool", id: context.toolCallID, name: "service_call", state: { status: "running" },
          })
          if ((yield* Ref.updateAndGet(started, (n) => n + 1)) === 2) yield* Deferred.succeed(ready, undefined)
          yield* Deferred.await(toolGate)
          expect(input.binding).toEqual(fake)
          const binding = yield* CapabilityInvocation.require(context, { projectID: placement.project.id, location: ref })
          bindings.push(binding)
          yield* Effect.forEach(contexts.filter((other) => other.toolCallID !== context.toolCallID), (other) =>
            CapabilityInvocation.require(other, { projectID: placement.project.id, location: ref }).pipe(
              Effect.flip, Effect.orDie, Effect.tap((error) => Effect.sync(() => expect(error.code).toBe("invocation_binding_mismatch"))),
            ),
          )
          yield* policy.assert(context, { action: "read", resources: [input.resource] })
          yield* Ref.update(effects, (resources) => [...resources, input.resource])
          return input.resource
        }).pipe(Effect.catchTag("Capability.Failure", (error) => Effect.fail(new Tool.Failure({ message: error.code, error })))),
      })
      // One construction/registration serves both concurrent calls; binding is settlement-scoped.
      yield* registry.register({ service_call: tool, hidden_probe: tool })
      const pendingCalls: string[] = []
      const publicationBindings: string[] = []
      const unsubscribe = yield* events.listen((event) => Effect.gen(function* () {
        if (event.type === SessionEvent.Tool.Input.Started.type) {
          const data = Schema.decodeUnknownSync(Schema.toType(SessionEvent.Tool.Input.Started.data))(event.data)
          const stored = yield* store.message(data.assistantMessageID)
          expect(stored?.message.type === "assistant" ? stored.message.content.find((part) =>
            part.type === "tool" && part.id === data.callID) : undefined).toMatchObject({
            type: "tool", id: data.callID, name: "service_call", state: { status: "pending" },
          })
          pendingCalls.push(data.callID)
          return
        }
        if (event.type !== SessionEvent.Tool.Success.type && event.type !== SessionEvent.Tool.Failed.type) return
        const context = contexts[0]
        if (!context) return
        publicationBindings.push((yield* CapabilityInvocation.require(context, {
          projectID: placement.project.id, location: ref,
        }).pipe(Effect.flip, Effect.orDie)).code)
      }))
      yield* Effect.addFinalizer(() => unsubscribe)
      const admitted = yield* sessions.prompt({ sessionID, prompt: Prompt.make({ text: "Read public and secret" }), resume: false })
      expect(yield* database.db.select().from(SessionInputTable).where(eq(SessionInputTable.id, admitted.id)).get()).toMatchObject({
        session_id: sessionID, promoted_seq: null,
      })
      expect(requests).toHaveLength(0)
      const fiber = yield* sessions.resume(sessionID).pipe(Effect.forkChild)
      yield* Deferred.await(selected)
      // Change current configuration before materialization/provider work. Captured deny must survive.
      yield* agents.transform((editor) => editor.update(issuer, (agent) => {
        agent.permissions = [{ action: "*", resource: "*", effect: "allow" }]
      }))
      yield* sessions.switchAgent({ sessionID, agent: replacement })
      yield* Deferred.succeed(providerGate, undefined)
      yield* Effect.raceFirst(Deferred.await(ready), Fiber.join(fiber).pipe(Effect.andThen(Effect.die("ROOT_CALLS_DID_NOT_START"))))
      expect(contexts).toHaveLength(2)
      expect(requests).toHaveLength(1)
      expect(requests[0]?.body.tools?.map((tool) => tool.function.name)).toEqual(["service_call"])
      expect((yield* sessions.get(sessionID)).agent).toBe(replacement)
      expect(yield* permissions.evaluate({ sessionID, action: "read", resources: ["public"] })).toBe("deny")
      expect(yield* permissions.evaluate({ sessionID, agent: issuer, action: "read", resources: ["secret"] })).toBe("allow")
      yield* Effect.forEach(contexts, (context) => CapabilityInvocation.require(context, {
        projectID: placement.project.id, location: ref,
      }).pipe(Effect.flip, Effect.orDie, Effect.tap((error) => Effect.sync(() => expect(error.code).toBe("invocation_binding_missing")))))
      yield* Deferred.succeed(toolGate, undefined)
      yield* Fiber.join(fiber)

      expect(yield* Ref.get(effects)).toEqual(["public"])
      expect(bindings).toHaveLength(2)
      contexts.forEach((context) => {
        const binding = bindings.find((binding) => binding.invocation.callID === context.toolCallID)
        expect(binding?.issuer).toBe("core")
        expect(binding?.owner).toEqual({ projectID: placement.project.id, location: ref, sessionID, agentID: issuer })
        expect(binding?.invocation).toEqual({
          sessionID, agentID: issuer, assistantMessageID: context.assistantMessageID, callID: context.toolCallID,
        })
        expect(binding?.rootToolName).toBe("service_call")
        expect(binding?.effectiveRules).toEqual(rules)
        expect(binding?.nativeDenyFloor).toEqual([])
      })
      expect(contexts.map((context) => context.toolCallID).sort()).toEqual(["call-public", "call-secret"])
      expect(pendingCalls.sort()).toEqual(["call-public", "call-secret"])
      expect(new Set(contexts.map((context) => context.assistantMessageID)).size).toBe(1)
      const messages = yield* sessions.context(sessionID)
      const root = messages.find((message) => message.type === "assistant" && message.agent === issuer)
      if (!root || root.type !== "assistant") return yield* Effect.die("ISSUING_ASSISTANT_MISSING")
      expect(root.id).toBe(contexts[0]?.assistantMessageID)
      expect(root.content).toMatchObject([
        { type: "tool", id: "call-public", state: { status: "completed", structured: { value: "public" } } },
        { type: "tool", id: "call-secret", state: { status: "error", error: { message: "target_denied" } } },
      ])
      expect(requests).toHaveLength(2)
      expect(requests.map((request) => [request.sessionID, request.auth, request.body.model, request.body.stream])).toEqual([
        [sessionID, null, "fixture", true], [sessionID, null, "fixture", true],
      ])
      expect(requests[1]?.body.messages.filter((message) => message.role === "tool")).toMatchObject([
        { tool_call_id: "call-public", content: "public" },
        { tool_call_id: "call-secret", content: JSON.stringify({
          error: { type: "unknown", message: "target_denied" }, content: [], structured: {},
        }) },
      ])
      expect(yield* permissions.list()).toEqual([])
      expect(publicationBindings).toEqual(["invocation_binding_missing", "invocation_binding_missing"])
      yield* Effect.forEach(contexts, (context) => CapabilityInvocation.require(context, {
        projectID: placement.project.id, location: ref,
      }).pipe(Effect.flip, Effect.orDie, Effect.tap((error) => Effect.sync(() => expect(error.code).toBe("invocation_binding_missing")))))
    }).pipe(Effect.provide(layer), Effect.timeout("30 seconds"))
  }),
  45_000,
)
