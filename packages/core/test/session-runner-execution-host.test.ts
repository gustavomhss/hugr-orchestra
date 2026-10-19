import { describe, expect } from "bun:test"
import { LLMClient, LLMEvent, type LLMClientShape } from "@orchestra/llm"
import { AgentV2 } from "@orchestra/core/agent"
import { Database } from "@orchestra/core/database/database"
import { PermissionV2 } from "@orchestra/core/permission"
import { SessionV2 } from "@orchestra/core/session"
import { Prompt } from "@orchestra/core/session/prompt"
import { ExecutionHost } from "@orchestra/core/session/runner"
import { SessionRunnerModel } from "@orchestra/core/session/runner/model"
import { SessionTable } from "@orchestra/core/session/sql"
import { SkillGuidance } from "@orchestra/core/skill/guidance"
import { SystemContext } from "@orchestra/core/system-context"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Tool } from "@orchestra/core/tool/tool"
import { eq } from "drizzle-orm"
import { Effect, Exit, Layer, Schema, Stream } from "effect"
import { Harness, sessionID } from "./session-runner-harness"

// An agent whose engine names an execution host runs each provider turn through the host's one stream: no model is
// resolved, `llm.stream` is never called, provider-executed tool calls persist settled, and the host's durable state
// carries from one turn to the next.

let llmCalls = 0
let mode: "turns" | "tools" = "turns"
const asked: PermissionV2.AssertInput[] = []
const seen: { tools: string[]; output: unknown; allowed: boolean; denied: boolean }[] = []
const turns: { system: ReadonlyArray<string>; users: string[]; state: unknown }[] = []

const client = Layer.succeed(
  LLMClient.Service,
  LLMClient.Service.of({
    prepare: () => Effect.die("unused"),
    stream: (() => {
      llmCalls++
      return Stream.die("a hosted turn must not call llm.stream")
    }) as unknown as LLMClientShape["stream"],
    generate: () => Effect.die("unused"),
  }),
)

const host: ExecutionHost.Interface = {
  id: "claude-code",
  stateKey: "claudeCode",
  stream: (turn) =>
    Stream.unwrap(
      Effect.gen(function* () {
        if (mode === "tools") {
          const settlement = yield* turn.execute({ id: "orc-1", name: "echo", input: { text: "hi" } })
          const allowed = yield* turn.authorize({ callID: "tu-1", tool: "Bash", action: "bash", resources: ["ls"] }).pipe(Effect.exit)
          const denied = yield* turn.authorize({ callID: "tu-2", tool: "Bash", action: "bash", resources: ["rm -rf /"] }).pipe(Effect.exit)
          seen.push({ tools: turn.tools.map((tool) => tool.name), output: settlement.result, allowed: Exit.isSuccess(allowed), denied: Exit.isFailure(denied) })
          return Stream.make(LLMEvent.stepStart({ index: 0 }), LLMEvent.stepFinish({ index: 0, reason: "stop" }))
        }
        const users = turn.history.flatMap((message) => (message.type === "user" ? [message.text] : []))
        turns.push({ system: turn.system, users, state: yield* turn.state.get })
        yield* turn.state.update(() => ({ sessionId: "claude-session", delivered: users.length }))
        const call = `call-${turns.length}`
        return Stream.make(
          LLMEvent.stepStart({ index: 0 }),
          LLMEvent.textStart({ id: "text" }),
          LLMEvent.textDelta({ id: "text", text: `Answer ${turns.length}` }),
          LLMEvent.textEnd({ id: "text" }),
          LLMEvent.toolCall({ id: call, name: "Bash", input: { command: "ls" }, providerExecuted: true }),
          LLMEvent.toolResult({ id: call, name: "Bash", result: { type: "text", value: "a.txt" }, providerExecuted: true }),
          LLMEvent.stepFinish({ index: 0, reason: "stop", usage: { inputTokens: 3, outputTokens: 2 } }),
        )
      }),
    ),
}

const it = Harness.make({
  client,
  models: SessionRunnerModel.layerWith(() => Effect.die("a hosted turn must not resolve a model")),
  echo: Layer.effectDiscard(
    ToolRegistry.Service.use((registry) =>
      registry.register({
        echo: Tool.make({
          description: "Echo text",
          input: Schema.Struct({ text: Schema.String }),
          output: Schema.Struct({ text: Schema.String }),
          toModelOutput: ({ output }) => [{ type: "text", text: output.text }],
          execute: ({ text }) => Effect.succeed({ text }),
        }),
      }),
    ),
  ),
  permissions: Layer.mock(PermissionV2.Service, {
    authorize: (input) =>
      Effect.sync(() => asked.push(input)).pipe(
        Effect.andThen(input.resources[0]?.startsWith("rm") ? Effect.fail(new PermissionV2.BlockedError({ rules: [] })) : Effect.void),
      ),
  }),
  systemContext: Harness.systemContextLayer,
  skillGuidance: Layer.mock(SkillGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) }),
  hosts: Layer.succeed(ExecutionHost.Service, ExecutionHost.of([host])),
})

describe("SessionRunner execution host", () => {
  it.effect("runs each turn of a claude-code agent through its host and resumes with the host's state", () =>
    Effect.gen(function* () {
      yield* Harness.setup
      mode = "turns"
      llmCalls = 0
      turns.length = 0
      const agents = yield* AgentV2.Service
      yield* agents.transform((draft) =>
        draft.update(AgentV2.defaultID, (agent) => {
          agent.engine = "claude-code"
          agent.system = "Maestro instructions"
          agent.mode = "primary"
        }),
      )
      const session = yield* SessionV2.Service
      yield* session.prompt({ sessionID, prompt: Prompt.make({ text: "First" }), resume: false })
      yield* session.resume(sessionID)
      yield* session.prompt({ sessionID, prompt: Prompt.make({ text: "Second" }), resume: false })
      yield* session.resume(sessionID)

      expect(llmCalls).toBe(0)
      expect(turns).toEqual([
        { system: ["Maestro instructions"], users: ["First"], state: undefined },
        { system: ["Maestro instructions"], users: ["First", "Second"], state: { sessionId: "claude-session", delivered: 1 } },
      ])
      const messages = yield* session.messages({ sessionID })
      expect(messages.map((message) => message.type).toSorted()).toEqual(["assistant", "assistant", "user", "user"])
      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "assistant",
            agent: "maestro",
            content: [
              expect.objectContaining({ type: "text", text: "Answer 1" }),
              expect.objectContaining({
                type: "tool",
                id: "call-1",
                name: "Bash",
                state: expect.objectContaining({ status: "completed" }),
                provider: expect.objectContaining({ executed: true }),
              }),
            ],
          }),
        ]),
      )
      const { db } = yield* Database.Service
      const row = yield* db.select().from(SessionTable).where(eq(SessionTable.id, sessionID)).get().pipe(Effect.orDie)
      expect(row?.metadata).toEqual({ claudeCode: { sessionId: "claude-session", delivered: 2 } })
    }),
  )

  it.effect("settles an Orchestra tool the host invokes through the registry and asks V2 permission for its own calls", () =>
    Effect.gen(function* () {
      yield* Harness.setup
      mode = "tools"
      asked.length = 0
      seen.length = 0
      const agents = yield* AgentV2.Service
      yield* agents.transform((draft) =>
        draft.update(AgentV2.defaultID, (agent) => {
          agent.engine = "claude-code"
          agent.mode = "primary"
        }),
      )
      const session = yield* SessionV2.Service
      yield* session.prompt({ sessionID, prompt: Prompt.make({ text: "Use tools" }), resume: false })
      yield* session.resume(sessionID)

      expect(seen).toHaveLength(1)
      expect(seen[0]).toMatchObject({ allowed: true, denied: true })
      expect(seen[0]?.tools).toContain("echo")
      expect(asked.map((input) => ({ agent: String(input.agent), action: input.action, resources: input.resources }))).toEqual([
        { agent: "maestro", action: "bash", resources: ["ls"] },
        { agent: "maestro", action: "bash", resources: ["rm -rf /"] },
      ])
      const assistant = (yield* session.messages({ sessionID })).find((message) => message.type === "assistant")
      expect(assistant).toMatchObject({
        content: [
          {
            type: "tool",
            id: "orc-1",
            name: "echo",
            state: { status: "completed" },
            provider: { executed: true, metadata: { orchestra: { executor: "orchestra" } } },
          },
        ],
      })
    }),
  )
})
