import { afterAll, describe, expect } from "bun:test"
import { asc, eq } from "drizzle-orm"
import { Cause, Effect, Exit, Layer, Option, Schema } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { LLMError } from "@orchestra/llm"
import { AnthropicMessages, OpenAIChat, OpenAIResponses } from "@orchestra/llm/protocols"
import { Auth, LLMClient, RequestExecutor } from "@orchestra/llm/route"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { SessionV2 } from "@orchestra/core/session"
import { SessionEvent } from "@orchestra/core/session/event"
import { Prompt } from "@orchestra/core/session/prompt"
import { SessionRunnerModel } from "@orchestra/core/session/runner/model"
import { SessionInputTable, SessionMessageTable } from "@orchestra/core/session/sql"
import { SkillGuidance } from "@orchestra/core/skill/guidance"
import { SystemContext } from "@orchestra/core/system-context"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Tool } from "@orchestra/core/tool/tool"
import { Harness } from "./session-runner-harness"

// One local provider fixture; every test resets it and uses the real HTTP executor and parser.
const state = {
  protocol: "chat",
  frames: [] as unknown[],
  requests: 0,
  executions: [] as string[],
  eofGate: undefined as Promise<void> | undefined,
}
const delta = (content: string, reason: string | null = null) => ({
  id: "fixture",
  choices: [{ delta: { role: "assistant", content }, finish_reason: reason }],
  usage: null,
})
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch() {
    state.requests++
    // If an old runner incorrectly continues, finish the extra request so RED stays bounded and reports the duplicate.
    const frames =
      state.requests === 1
        ? state.frames
        : state.protocol === "chat"
          ? [delta("", "stop")]
          : state.protocol === "responses"
            ? [{ type: "response.completed", response: { id: "unexpected-followup" } }]
            : [{ type: "message_delta", delta: { stop_reason: "end_turn" } }, { type: "message_stop" }]
    const body = frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("")
    const gate = state.eofGate
    return new Response(
      gate
        ? new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(body))
              void gate.then(() => controller.close())
            },
          })
        : body,
      { headers: { "content-type": "text/event-stream" } },
    )
  },
})
afterAll(() => server.stop(true))

const client = LLMClient.layer.pipe(Layer.provide(RequestExecutor.layer.pipe(Layer.provide(FetchHttpClient.layer))))
const echo = Layer.effectDiscard(
  ToolRegistry.Service.use((registry) =>
    registry.register({
      echo: Tool.make({
        description: "Echo fixture text",
        input: Schema.Struct({ text: Schema.String }),
        output: Schema.Struct({ text: Schema.String }),
        toModelOutput: ({ output }) => [{ type: "text", text: output.text }],
        execute: ({ text }) =>
          Effect.sync(() => {
            state.executions.push(text)
            return { text }
          }),
      }),
    }),
  ),
)
const it = Harness.make({
  client,
  models: SessionRunnerModel.layerWith(() =>
    Effect.succeed(
      (state.protocol === "chat"
        ? OpenAIChat.route
        : state.protocol === "responses"
          ? OpenAIResponses.route
          : AnthropicMessages.route
      )
        .with({ endpoint: { baseURL: server.url.toString() }, auth: Auth.none })
        .model({ id: "fixture" }),
    ),
  ),
  echo,
  systemContext: Harness.systemContextLayer,
  skillGuidance: Layer.succeed(
    SkillGuidance.Service,
    SkillGuidance.Service.of({ load: () => Effect.succeed(SystemContext.empty) }),
  ),
})

const setup = (protocol: "chat" | "responses" | "anthropic", frames: unknown[]) =>
  Effect.gen(function* () {
    state.protocol = protocol
    state.frames = frames
    state.requests = 0
    state.eofGate = undefined
    state.executions.length = 0
    yield* Harness.setup
    const session = yield* SessionV2.Service
    yield* session.prompt({
      sessionID: Harness.sessionID,
      prompt: Prompt.make({ text: "Use local provider fixture" }),
      resume: false,
    })
    return session
  })

const persisted = Effect.gen(function* () {
  const database = yield* Database.Service
  return yield* database.db
    .select()
    .from(EventTable)
    .where(eq(EventTable.aggregate_id, Harness.sessionID))
    .orderBy(asc(EventTable.seq))
    .all()
    .pipe(Effect.orDie)
})

const replayProjection = Effect.gen(function* () {
  const rows = yield* persisted
  const events = yield* EventV2.Service
  const database = yield* Database.Service
  yield* events.remove(Harness.sessionID)
  yield* database.db
    .delete(SessionInputTable)
    .where(eq(SessionInputTable.session_id, Harness.sessionID))
    .run()
    .pipe(Effect.orDie)
  yield* database.db
    .delete(SessionMessageTable)
    .where(eq(SessionMessageTable.session_id, Harness.sessionID))
    .run()
    .pipe(Effect.orDie)
  yield* events.replayAll(
    rows.map((row) => ({ id: row.id, aggregateID: row.aggregate_id, seq: row.seq, type: row.type, data: row.data })),
  )
})

function expectMissingTerminal(exit: Exit.Exit<unknown, unknown>) {
  expect(Exit.isFailure(exit)).toBe(true)
  if (!Exit.isFailure(exit)) throw new Error("Truncated provider stream must fail the runner")
  const error = Option.getOrUndefined(Cause.findErrorOption(exit.cause))
  expect(error).toBeInstanceOf(LLMError)
  if (!(error instanceof LLMError)) throw new Error("Expected typed provider output failure")
  expect(error.reason.message).toContain("without a terminal finish")
}

const expectOneFailedStep = Effect.gen(function* () {
  const rows = yield* persisted
  expect(
    rows.filter(
      (row) =>
        row.type === EventV2.versionedType(SessionEvent.Step.Failed.type, SessionEvent.Step.Failed.durable!.version),
    ),
  ).toHaveLength(1)
})

describe("durable provider stream terminals", () => {
  it.live(
    "HTTP 200 delta then EOF produces one durable failed assistant and preserves its partial text after replay",
    () =>
      Effect.gen(function* () {
        const session = yield* setup("chat", [delta("partial")])
        const exit = yield* session.resume(Harness.sessionID).pipe(Effect.exit, Effect.timeout("10 seconds"))
        expectMissingTerminal(exit)
        yield* expectOneFailedStep
        expect(state.requests).toBe(1)
        yield* replayProjection
        expect(yield* session.context(Harness.sessionID)).toMatchObject([
          { type: "user" },
          {
            type: "assistant",
            finish: "error",
            error: { message: expect.stringContaining("without a terminal finish") },
            content: [{ type: "text", text: "partial" }],
          },
        ])
      }),
  )

  it.live("native onHalt finish remains a successful durable assistant without failed step", () =>
    Effect.gen(function* () {
      const session = yield* setup("chat", [delta("complete"), delta("", "stop")])
      yield* session.resume(Harness.sessionID)
      const rows = yield* persisted
      expect(
        rows.filter(
          (row) =>
            row.type ===
            EventV2.versionedType(SessionEvent.Step.Failed.type, SessionEvent.Step.Failed.durable!.version),
        ),
      ).toEqual([])
      yield* replayProjection
      expect(yield* session.context(Harness.sessionID)).toMatchObject([
        { type: "user" },
        { type: "assistant", finish: "stop", content: [{ type: "text", text: "complete" }] },
      ])
      expect(state.requests).toBe(1)
    }),
  )

  it.live("truncated Responses tool turn retains its one settled local tool and never retries provider or tool", () =>
    Effect.gen(function* () {
      const session = yield* setup("responses", [
        {
          type: "response.output_item.added",
          item: { type: "function_call", id: "item_echo", call_id: "call_echo", name: "echo", arguments: "" },
        },
        { type: "response.function_call_arguments.delta", item_id: "item_echo", delta: '{"text":"settled"}' },
        {
          type: "response.output_item.done",
          item: {
            type: "function_call",
            id: "item_echo",
            call_id: "call_echo",
            name: "echo",
            arguments: '{"text":"settled"}',
          },
        },
      ])
      const settled = Promise.withResolvers<void>()
      state.eofGate = settled.promise
      const events = yield* EventV2.Service
      const unlisten = yield* events.listen((event) =>
        Effect.sync(() => {
          if (Schema.is(SessionEvent.Tool.Success)(event) && event.data.callID === "call_echo") settled.resolve()
        }),
      )
      yield* Effect.addFinalizer(() => unlisten)
      // EOF is released only after durable Tool.Success, so the assertion concerns an already settled tool.
      const exit = yield* session.resume(Harness.sessionID).pipe(Effect.exit, Effect.timeout("10 seconds"))
      expectMissingTerminal(exit)
      yield* expectOneFailedStep
      expect(state.requests).toBe(1)
      expect(state.executions).toEqual(["settled"])
      yield* replayProjection
      const messages = yield* session.context(Harness.sessionID)
      const assistant = messages.find((message) => message.type === "assistant")
      expect(assistant).toMatchObject({ finish: "error" })
      if (assistant?.type !== "assistant") throw new Error("Expected failed assistant")
      expect(assistant.content.filter((part) => part.type === "tool")).toMatchObject([
        { id: "call_echo", state: { status: "completed" } },
      ])
    }),
  )

  it.live("EOF durably closes a provider-executed tool still in flight", () =>
    Effect.gen(function* () {
      const session = yield* setup("anthropic", [
        { type: "message_start", message: { usage: { input_tokens: 5 } } },
        {
          type: "content_block_start",
          index: 0,
          content_block: { type: "server_tool_use", id: "hosted_search", name: "web_search" },
        },
        {
          type: "content_block_delta",
          index: 0,
          delta: { type: "input_json_delta", partial_json: '{"query":"fixture"}' },
        },
        { type: "content_block_stop", index: 0 },
      ])
      const exit = yield* session.resume(Harness.sessionID).pipe(Effect.exit, Effect.timeout("10 seconds"))
      expectMissingTerminal(exit)
      yield* expectOneFailedStep
      yield* replayProjection
      const assistant = (yield* session.context(Harness.sessionID)).find((message) => message.type === "assistant")
      expect(assistant).toMatchObject({ finish: "error" })
      if (assistant?.type !== "assistant") throw new Error("Expected failed assistant")
      expect(assistant.content.filter((part) => part.type === "tool")).toMatchObject([
        { state: { status: "error" }, provider: { executed: true } },
      ])
      expect(state.requests).toBe(1)
      expect(state.executions).toEqual([])
    }),
  )
})
