import { describe, expect } from "bun:test"
import { Tool } from "@orchestra/core/tool/tool"
import { AgentV2 } from "@orchestra/core/agent"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { ApplicationTools } from "@orchestra/core/tool/application-tools"
import { SessionV2 } from "@orchestra/core/session"
import { SessionMessage } from "@orchestra/core/session/message"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { PermissionV2 } from "@orchestra/core/permission"
import { Prompt } from "@orchestra/core/session/prompt"
import { ExecutionHost } from "@orchestra/core/session/runner"
import { SessionRunnerModel } from "@orchestra/core/session/runner/model"
import { SessionScope, SessionStore } from "@orchestra/core/session/store"
import { SkillGuidance } from "@orchestra/core/skill/guidance"
import { SystemContext } from "@orchestra/core/system-context"
import { LLMClient, LLMEvent, Model, type LLMClientShape, type LLMRequest } from "@orchestra/llm"
import { route } from "@orchestra/llm/protocols/openai-chat"
import { executeTool, settleTool, toolDefinitions } from "./lib/tool"
import { Cause, Deferred, Effect, Exit, Fiber, Layer, Option, Schema, SchemaGetter, SchemaIssue, Scope, Stream } from "effect"
import { testEffect } from "./lib/effect"
import { Harness, sessionID as runnerSessionID } from "./session-runner-harness"

const bounds: ToolOutputStore.BoundInput[] = []
const retentionFailure = new ToolOutputStore.StorageError({ operation: "write", cause: new Error("disk full") })
const outputStore = Layer.mock(ToolOutputStore.Service, {
  limits: () => Effect.succeed({ maxBytes: 50_000, maxLines: 2_000 }),
  bound: (input) => {
    if (input.toolCallID === "call-retention-failure") return Effect.fail(retentionFailure)
    return Effect.sync(() => bounds.push(input)).pipe(
      Effect.as(
        input.toolCallID === "call-bounded"
          ? {
              output: { structured: {}, content: [{ type: "text" as const, text: "bounded reference" }] },
              outputPaths: ["/managed/generic"],
            }
          : { output: input.output, outputPaths: [] },
      ),
    )
  },
})
const registryLayer = AppNodeBuilder.build(ToolRegistry.node, [[ToolOutputStore.node, outputStore]])
const it = testEffect(registryLayer)
const integrated = testEffect(
  AppNodeBuilder.build(LayerNode.group([ApplicationTools.node, ToolRegistry.node]), [
    [ToolOutputStore.node, outputStore],
  ]),
)
const identity = {
  agent: AgentV2.ID.make("maestro"),
  assistantMessageID: SessionMessage.ID.make("msg_registry"),
}
const sessionID = SessionV2.ID.make("ses_registry")
const call = (name: string, id = `call-${name}`): ToolRegistry.ExecuteInput => ({
  sessionID,
  ...identity,
  call: { type: "tool-call", id, name, input: { text: name } },
})

const make = (permission?: string) => {
  const tool = Tool.make({
    description: "Echo text",
    input: Schema.Struct({ text: Schema.String }),
    output: Schema.Struct({ text: Schema.String }),
    execute: ({ text }) => Effect.succeed({ text }),
    toModelOutput: ({ output }) => [{ type: "text", text: output.text }],
  })
  return permission ? Tool.withPermission(tool, permission) : tool
}

describe("ToolRegistry", () => {
  it.effect("filters disabled tools with edit aliases and ordered wildcard precedence", () =>
    Effect.gen(function* () {
      const service = yield* ToolRegistry.Service
      yield* service.register({
        question: make(),
        bash: make(),
        edit: make("edit"),
        write: make("edit"),
        apply_patch: make("edit"),
      })
      const names = (rules: Parameters<ToolRegistry.Interface["materialize"]>[0]) =>
        toolDefinitions(service, rules).pipe(Effect.map((definitions) => definitions.map((tool) => tool.name)))

      expect(yield* names([{ action: "question", resource: "*", effect: "deny" }])).toEqual([
        "bash",
        "edit",
        "write",
        "apply_patch",
      ])
      expect(
        yield* names([
          { action: "*", resource: "*", effect: "deny" },
          { action: "question", resource: "private", effect: "allow" },
        ]),
      ).toEqual(["question"])
      expect(
        yield* names([
          { action: "question", resource: "private", effect: "allow" },
          { action: "*", resource: "*", effect: "deny" },
        ]),
      ).toEqual([])
      expect(yield* names([{ action: "edit", resource: "*", effect: "deny" }])).toEqual(["question", "bash"])
    }),
  )

  it.effect("keeps permission decoration isolated between registrations", () =>
    Effect.gen(function* () {
      const service = yield* ToolRegistry.Service
      const shared = make()
      yield* service.register({ first: shared })
      yield* service.register({ second: Tool.withPermission(shared, "edit") })
      Tool.withPermission(shared, "question")

      expect(
        (yield* toolDefinitions(service, [{ action: "edit", resource: "*", effect: "deny" }])).map(
          (definition) => definition.name,
        ),
      ).toEqual(["first"])
    }),
  )

  it.effect("reuses model definitions across provider turns", () =>
    Effect.gen(function* () {
      const service = yield* ToolRegistry.Service
      yield* service.register({ echo: make() })
      const first = yield* toolDefinitions(service)
      const second = yield* toolDefinitions(service)

      expect(second[0]).toBe(first[0])
    }),
  )

  it.effect("removes a scoped registration", () =>
    Effect.gen(function* () {
      const service = yield* ToolRegistry.Service
      const scope = yield* Scope.make()
      yield* service.register({ echo: make() }).pipe(Scope.provide(scope))
      expect((yield* toolDefinitions(service)).map((tool) => tool.name)).toEqual(["echo"])
      yield* Scope.close(scope, Exit.void)
      expect(yield* toolDefinitions(service)).toEqual([])
    }),
  )

  it.effect("preserves an interrupted registration until its scope closes", () =>
    Effect.gen(function* () {
      const service = yield* ToolRegistry.Service
      const scope = yield* Scope.make()
      const registered = yield* Deferred.make<void>()
      const fiber = yield* service
        .register({ echo: make() })
        .pipe(
          Effect.andThen(Deferred.succeed(registered, undefined)),
          Effect.andThen(Effect.never),
          Scope.provide(scope),
          Effect.forkChild,
        )
      yield* Deferred.await(registered)
      yield* Fiber.interrupt(fiber)

      expect((yield* toolDefinitions(service)).map((tool) => tool.name)).toEqual(["echo"])
      yield* Scope.close(scope, Exit.void)
      expect(yield* toolDefinitions(service)).toEqual([])
    }),
  )

  it.effect("returns model errors without swallowing interruption or defects", () =>
    Effect.gen(function* () {
      const service = yield* ToolRegistry.Service
      yield* service.register({
        failed: Tool.make({
          description: "Failed",
          input: Schema.Struct({}),
          output: Schema.Struct({ ok: Schema.Boolean }),
          execute: () => Effect.fail(new Tool.Failure({ message: "Denied" })),
        }),
      })
      expect(
        yield* executeTool(service, {
          sessionID,
          ...identity,
          call: { type: "tool-call", id: "failed", name: "failed", input: {} },
        }),
      ).toEqual({ type: "error", value: "Denied" })
      expect(
        yield* executeTool(service, {
          sessionID,
          ...identity,
          call: { type: "tool-call", id: "missing", name: "missing", input: {} },
        }),
      ).toEqual({ type: "error", value: "Unknown tool: missing" })

      yield* service.register({
        defect: Tool.make({
          description: "Defect",
          input: Schema.Struct({}),
          output: Schema.Struct({}),
          execute: () => Effect.die("unexpected executor defect"),
        }),
      })
      expect(
        yield* service.materialize().pipe(
          Effect.flatMap((materialized) =>
            materialized.settle({
              sessionID,
              ...identity,
              call: { type: "tool-call", id: "defect", name: "defect", input: {} },
            }),
          ),
          Effect.catchDefect(Effect.succeed),
        ),
      ).toBe("unexpected executor defect")
    }),
  )

  it.effect("propagates retention failures through settlement", () =>
    Effect.gen(function* () {
      const service = yield* ToolRegistry.Service
      yield* service.register({ echo: make() })
      const materialized = yield* service.materialize()
      const exit = yield* materialized.settle(call("echo", "call-retention-failure")).pipe(Effect.exit)

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) expect(Option.getOrUndefined(Cause.findErrorOption(exit.cause))).toBe(retentionFailure)
      expect(retentionFailure.message).toBe("Failed to write tool output: disk full")
    }),
  )

  it.effect("exposes settlement only through materialization", () =>
    Effect.gen(function* () {
      const service = yield* ToolRegistry.Service
      expect("definitions" in service).toBe(false)
      expect("execute" in service).toBe(false)
      expect("settle" in service).toBe(false)
      expect(typeof service.materialize).toBe("function")
    }),
  )

  it.effect("passes complete invocation identity to the canonical handler", () =>
    Effect.gen(function* () {
      const service = yield* ToolRegistry.Service
      const contexts: Tool.Context[] = []
      yield* service.register({
        context: Tool.make({
          description: "Context",
          input: Schema.Struct({}),
          output: Schema.Struct({ ok: Schema.Boolean }),
          execute: (_, context) => Effect.sync(() => contexts.push(context)).pipe(Effect.as({ ok: true })),
        }),
      })
      yield* executeTool(service, {
        sessionID,
        ...identity,
        call: { type: "tool-call", id: "call-context", name: "context", input: {} },
      })
      expect(contexts).toEqual([{ sessionID, ...identity, toolCallID: "call-context" }])
    }),
  )

  it.effect("encodes output and applies generic settlement bounding", () =>
    Effect.gen(function* () {
      bounds.length = 0
      const service = yield* ToolRegistry.Service
      yield* service.register({ bounded: make() })
      const settlement = yield* settleTool(service, {
        sessionID,
        ...identity,
        call: { type: "tool-call", id: "call-bounded", name: "bounded", input: { text: "complete" } },
      })
      expect(settlement).toMatchObject({
        result: { type: "text" },
        output: { structured: {}, content: [{ type: "text" }] },
        outputPaths: ["/managed/generic"],
      })
      if (settlement.result.type !== "text") throw new Error("Expected bounded text settlement")
      const value = settlement.result.value
      if (typeof value !== "string") throw new Error("Expected bounded text value")
      expect(value).toContain("bounded reference")
      expect(value).toContain("/managed/generic")
      expect(value).toContain("Context pressure:")
      expect(Buffer.byteLength(value)).toBeLessThanOrEqual(50_000)
      expect(settlement.output?.content[0]).toEqual({ type: "text", text: value })
      expect(bounds).toHaveLength(1)
    }),
  )

  it.effect("enforces transformed codecs at execution and projection boundaries", () =>
    Effect.gen(function* () {
      const service = yield* ToolRegistry.Service
      const executed: string[] = []
      const Transformed = Schema.Boolean.pipe(
        Schema.decodeTo(Schema.String, {
          decode: SchemaGetter.transform((value) => (value ? "yes" : "no")),
          encode: SchemaGetter.transform((value) => value === "yes"),
        }),
      )
      yield* service.register({
        transformed: Tool.make({
          description: "Transform values",
          input: Schema.Struct({ value: Transformed }),
          output: Schema.Struct({ value: Transformed }),
          execute: ({ value }) => Effect.sync(() => executed.push(value)).pipe(Effect.as({ value })),
          toModelOutput: ({ output }) => [{ type: "text", text: String(output.value) }],
        }),
      })

      expect(
        yield* executeTool(service, {
          sessionID,
          ...identity,
          call: { type: "tool-call", id: "transformed", name: "transformed", input: { value: true } },
        }),
      ).toEqual({ type: "text", value: "true" })
      expect(executed).toEqual(["yes"])
      expect(
        yield* executeTool(service, {
          sessionID,
          ...identity,
          call: { type: "tool-call", id: "invalid-input", name: "transformed", input: { value: "yes" } },
        }),
      ).toMatchObject({ type: "error", value: expect.stringContaining("Invalid tool input") })
      expect(executed).toEqual(["yes"])

      yield* service.register({
        invalid_output: Tool.make({
          description: "Return invalid output",
          input: Schema.Struct({}),
          output: Schema.Struct({
            value: Schema.Boolean.pipe(
              Schema.decodeTo(Schema.String, {
                decode: SchemaGetter.transform((value) => String(value)),
                encode: SchemaGetter.transformOrFail((value) =>
                  value === "valid"
                    ? Effect.succeed(true)
                    : Effect.fail(new SchemaIssue.InvalidValue(Option.some(value), { message: "invalid output" })),
                ),
              }),
            ),
          }),
          execute: () => Effect.succeed({ value: "invalid" }),
        }),
      })
      expect(
        yield* executeTool(service, {
          sessionID,
          ...identity,
          call: { type: "tool-call", id: "invalid-output", name: "invalid_output", input: {} },
        }),
      ).toMatchObject({ type: "error", value: expect.stringContaining("invalid value for its output schema") })
    }),
  )

  it.effect("executes the unchanged registration advertised for a provider turn", () =>
    Effect.gen(function* () {
      const service = yield* ToolRegistry.Service
      yield* service.register({ echo: make() })
      const materialized = yield* service.materialize()

      expect((yield* materialized.settle(call("echo"))).result).toEqual({ type: "text", value: "echo" })
    }),
  )

  it.effect("rejects a call when its advertised registration was removed", () =>
    Effect.gen(function* () {
      const service = yield* ToolRegistry.Service
      const scope = yield* Scope.make()
      yield* service.register({ echo: make() }).pipe(Scope.provide(scope))
      const materialized = yield* service.materialize()
      yield* Scope.close(scope, Exit.void)

      expect((yield* materialized.settle(call("echo"))).result).toEqual({
        type: "error",
        value: "Stale tool call: echo",
      })
    }),
  )

  it.effect("rejects only the replaced name from a multi-tool provider turn", () =>
    Effect.gen(function* () {
      const service = yield* ToolRegistry.Service
      yield* service.register({ first: make(), second: make() })
      const materialized = yield* service.materialize()
      yield* service.register({ first: make() })

      expect((yield* materialized.settle(call("first"))).result).toEqual({
        type: "error",
        value: "Stale tool call: first",
      })
      expect((yield* materialized.settle(call("second"))).result).toEqual({ type: "text", value: "second" })
    }),
  )

  it.effect("treats revealing a previous overlay as stale", () =>
    Effect.gen(function* () {
      const service = yield* ToolRegistry.Service
      yield* service.register({ echo: make() })
      const overlay = yield* Scope.make()
      yield* service.register({ echo: make() }).pipe(Scope.provide(overlay))
      const materialized = yield* service.materialize()
      yield* Scope.close(overlay, Exit.void)

      expect((yield* materialized.settle(call("echo"))).result).toEqual({
        type: "error",
        value: "Stale tool call: echo",
      })
    }),
  )

  integrated.effect("rejects an application call after a Location override is registered", () =>
    Effect.gen(function* () {
      const applications = yield* ApplicationTools.Service
      const service = yield* ToolRegistry.Service
      yield* applications.register({ echo: make() })
      const materialized = yield* service.materialize()
      yield* service.register({ echo: make() })

      expect((yield* materialized.settle(call("echo"))).result).toEqual({
        type: "error",
        value: "Stale tool call: echo",
      })
    }),
  )

  integrated.effect("rejects a Location call after removal reveals an application registration", () =>
    Effect.gen(function* () {
      const applications = yield* ApplicationTools.Service
      const service = yield* ToolRegistry.Service
      yield* applications.register({ echo: make() })
      const scope = yield* Scope.make()
      yield* service.register({ echo: make() }).pipe(Scope.provide(scope))
      const materialized = yield* service.materialize()
      yield* Scope.close(scope, Exit.void)

      expect((yield* materialized.settle(call("echo"))).result).toEqual({
        type: "error",
        value: "Stale tool call: echo",
      })
    }),
  )

  it.effect("keeps captured execution running after registration mutation", () =>
    Effect.gen(function* () {
      const service = yield* ToolRegistry.Service
      const started = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const scope = yield* Scope.make()
      yield* service
        .register({
          echo: Tool.make({
            description: "Echo text",
            input: Schema.Struct({ text: Schema.String }),
            output: Schema.Struct({ text: Schema.String }),
            execute: ({ text }) =>
              Deferred.succeed(started, undefined).pipe(Effect.andThen(Deferred.await(release)), Effect.as({ text })),
            toModelOutput: ({ output }) => [{ type: "text", text: output.text }],
          }),
        })
        .pipe(Scope.provide(scope))
      const materialized = yield* service.materialize()
      const settlement = yield* materialized.settle(call("echo")).pipe(Effect.forkChild)
      yield* Deferred.await(started)
      yield* Scope.close(scope, Exit.void)
      yield* service.register({ echo: make() })
      yield* Deferred.succeed(release, undefined)

      expect(yield* Fiber.join(settlement)).toMatchObject({ result: { type: "text", value: "echo" } })
    }),
  )
})

// A scoped Session (SessionScope) on either engine: the runner's `settle` and `authorize` are where Orchestra
// executes or decides every call, so the tool allow-list and the call budget hold the same on both.
const scope: SessionScope.Scope = {
  skills: { entry: "lucy-review", allow: [] },
  tools: ["echo", "read"],
  budgets: { loads: 0, toolCalls: 2 },
}
const requests: LLMRequest[] = []
let responses: LLMEvent[][] = []
const toolCallTurn = (...calls: ReadonlyArray<readonly [string, string]>) => [
  LLMEvent.stepStart({ index: 0 }),
  ...calls.map(([id, name]) => LLMEvent.toolCall({ id, name, input: { text: id } })),
  LLMEvent.stepFinish({ index: 0, reason: "tool-calls" }),
  LLMEvent.finish({ reason: "tool-calls" }),
]
const finalTurn = [
  LLMEvent.stepStart({ index: 0 }),
  LLMEvent.textStart({ id: "final" }),
  LLMEvent.textDelta({ id: "final", text: "Done" }),
  LLMEvent.textEnd({ id: "final" }),
  LLMEvent.stepFinish({ index: 0, reason: "stop" }),
  LLMEvent.finish({ reason: "stop" }),
]
const runnerShared = {
  client: Layer.succeed(
    LLMClient.Service,
    LLMClient.Service.of({
      prepare: () => Effect.die("unused"),
      generate: () => Effect.die("unused"),
      stream: ((request: LLMRequest) => {
        requests.push(request)
        return Stream.fromIterable(responses.shift() ?? finalTurn)
      }) as unknown as LLMClientShape["stream"],
    }),
  ),
  models: SessionRunnerModel.layerWith(() => Effect.succeed(Model.make({ id: "fake-model", provider: "fake", route }))),
  echo: Layer.effectDiscard(ToolRegistry.Service.use((registry) => registry.register({ echo: make(), other: make() }))),
  systemContext: Harness.systemContextLayer,
  skillGuidance: Layer.mock(SkillGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) }),
}
const native = Harness.make(runnerShared)

// A stand-in for the Claude Code host: it calls Orchestra tools through `execute` and its own built-ins through
// `authorize`, as the real host does, and records what the runner offered it.
const hosted: { tools: string[][]; scopes: unknown[]; settled: unknown[]; refused: unknown[] } = { tools: [], scopes: [], settled: [], refused: [] }
const engine: ExecutionHost.Interface = {
  id: "claude-code",
  stateKey: "claudeCode",
  describeModel: () => Effect.succeed({ status: "ready" as const }),
  stream: (turn) =>
    Stream.unwrap(
      Effect.gen(function* () {
        hosted.tools.push(turn.tools.map((tool) => tool.name))
        hosted.scopes.push(turn.scope)
        for (const [id, name] of [["h1", "echo"], ["h2", "other"]] as const)
          hosted.settled.push((yield* turn.execute({ id, name, input: { text: id } })).result)
        for (const [id, tool] of [["h3", "grep"], ["h4", "read"], ["h5", "read"]] as const)
          hosted.refused.push(
            yield* turn
              .authorize({ callID: id, tool, action: tool, resources: ["*"], safety: { tool, args: {} } })
              .pipe(Effect.match({ onFailure: (error) => ("feedback" in error ? error.feedback : error._tag), onSuccess: () => "allowed" })),
          )
        return Stream.make(LLMEvent.stepStart({ index: 0 }), LLMEvent.stepFinish({ index: 0, reason: "stop" }))
      }),
    ),
}
const claude = Harness.make({
  ...runnerShared,
  permissions: Layer.mock(PermissionV2.Service, { authorize: () => Effect.void }),
  hosts: Layer.succeed(ExecutionHost.Service, ExecutionHost.of([engine])),
})

const narrowed = Effect.gen(function* () {
  requests.length = 0
  yield* Harness.setup
  const store = yield* SessionStore.Service
  yield* store.narrow(runnerSessionID, scope)
  return store
})

describe("SessionRunner with a scoped Session", () => {
  native.effect("advertises only scoped tools, refuses the rest, and makes the turn after the budget its last", () =>
    Effect.gen(function* () {
      const store = yield* narrowed
      responses = [toolCallTurn(["c1", "echo"], ["c2", "other"]), toolCallTurn(["c3", "echo"], ["c4", "echo"])]
      const session = yield* SessionV2.Service
      yield* session.prompt({ sessionID: runnerSessionID, prompt: Prompt.make({ text: "Review" }), resume: false })
      yield* session.resume(runnerSessionID)

      expect(requests[0]?.tools.map((tool) => tool.name)).toEqual(["echo"])
      // Two calls admitted; c2 is off the scope and one of the concurrent c3 and c4 is past the budget, so the third
      // turn is the last.
      expect(requests).toHaveLength(3)
      expect(requests[2]?.tools).toEqual([])
      expect(requests[2]?.toolChoice).toMatchObject({ type: "none" })
      const results = (yield* session.context(runnerSessionID)).flatMap((message) =>
        message.type === "assistant"
          ? message.content.flatMap((part) => (part.type === "tool" ? [{ id: part.id, state: part.state.status }] : []))
          : [],
      )
      expect(results.slice(0, 2)).toEqual([
        { id: "c1", state: "completed" },
        { id: "c2", state: "error" },
      ])
      expect(results.slice(2).map((result) => result.state).toSorted()).toEqual(["completed", "error"])
      expect(yield* store.scope(runnerSessionID)).toMatchObject({
        toolCalls: 2,
        deviations: [
          { kind: "tool-outside-scope", name: "other", detail: "The tool other is outside this Session's scope." },
          { kind: "tool-budget", name: "echo" },
        ],
      })
    }),
  )

  native.effect("leaves an unscoped Session as it was", () =>
    Effect.gen(function* () {
      requests.length = 0
      yield* Harness.setup
      responses = [toolCallTurn(["u1", "other"])]
      const session = yield* SessionV2.Service
      yield* session.prompt({ sessionID: runnerSessionID, prompt: Prompt.make({ text: "Work" }), resume: false })
      yield* session.resume(runnerSessionID)

      expect(requests[0]?.tools.map((tool) => tool.name).toSorted()).toEqual(["echo", "other"])
      expect(requests).toHaveLength(2)
      expect(requests[1]?.toolChoice).toBeUndefined()
      const store = yield* SessionStore.Service
      expect(yield* store.scope(runnerSessionID)).toBeUndefined()
    }),
  )

  claude.effect("holds the same scope for a hosted engine's Orchestra tools and its own built-ins", () =>
    Effect.gen(function* () {
      const store = yield* narrowed
      const agents = yield* AgentV2.Service
      yield* agents.transform((draft) =>
        draft.update(AgentV2.defaultID, (agent) => {
          agent.engine = "claude-code"
          agent.mode = "primary"
        }),
      )
      const session = yield* SessionV2.Service
      yield* session.prompt({ sessionID: runnerSessionID, prompt: Prompt.make({ text: "Review" }), resume: false })
      yield* session.resume(runnerSessionID)

      expect(hosted.tools[0]).toEqual(["echo"])
      expect(hosted.scopes[0]).toEqual(scope)
      expect(hosted.settled).toEqual([
        { type: "text", value: "h1" },
        { type: "error", value: "The tool other is outside this Session's scope." },
      ])
      expect(hosted.refused).toEqual([
        "The tool grep is outside this Session's scope.",
        "allowed",
        "This Session's tool call budget (2) is spent. Finish in your next reply without tools.",
      ])
      expect(yield* store.scope(runnerSessionID)).toMatchObject({
        toolCalls: 2,
        deviations: [
          { kind: "tool-outside-scope", name: "other" },
          { kind: "tool-outside-scope", name: "grep" },
          { kind: "tool-budget", name: "read" },
        ],
      })
    }),
  )
})
