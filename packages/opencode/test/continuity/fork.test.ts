import { expect } from "bun:test"
import { Cause, Deferred, Effect, Exit, Fiber, Layer, Stream } from "effect"
import { TestClock } from "effect/testing"
import { LLMEvent } from "@opencode-ai/llm"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { Provider } from "@/provider/provider"
import type { LLM } from "@/session/llm"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { request, run, snapshot } from "@/continuity/fork"
import { ProviderTest } from "../fake/provider"
import { testEffect } from "../lib/effect"

const model = ProviderTest.model({ id: ModelV2.ID.make("summary-model"), providerID: ProviderV2.ID.make("test") })
const it = testEffect(Layer.mock(Provider.Service, { getModel: () => Effect.succeed(model) }))
const sessionID = SessionID.make("ses_parent")
function input() {
  const history: SessionV1.WithParts[] = Array.from({ length: 10 }, (_, index) => {
    const id = MessageID.make(`msg_${index}`)
    return {
      info: {
        id, sessionID, role: "user", agent: "parent-agent",
        model: { providerID: model.providerID, modelID: model.id, variant: "parent-variant" },
        time: { created: index }, system: "parent-system-must-not-leak", tools: { bash: true },
        format: { type: "json_schema", schema: { parent: true }, retryCount: 2 },
      },
      parts: [{ id: PartID.make(`prt_${index}`), messageID: id, sessionID, type: "text", text: `turn-${index}`,
        metadata: { private: "raw-metadata-must-not-leak" } }],
    }
  })
  const selected = snapshot(sessionID, history, "prior-unique-context")
  if (!selected) throw new Error("fixture must have compressible head")
  return selected
}
function text(value = "summary-unique-success"): LLMEvent[] {
  return [LLMEvent.textStart({ id: "text-1" }), LLMEvent.textDelta({ id: "text-1", text: value }), LLMEvent.textEnd({ id: "text-1" })]
}
function execute(events: Stream.Stream<LLMEvent, unknown>, inspect?: (request: LLM.StreamInput) => void) {
  return Effect.gen(function* () {
    const provider = yield* Provider.Service
    return yield* run(input(), { provider, llm: { stream: (request) => { inspect?.(request); return events } } })
  })
}
it.effect("successful stream returns trimmed text with sanitized request", () => Effect.gen(function* () {
  const result = yield* execute(Stream.fromIterable([
    LLMEvent.reasoningDelta({ id: "thinking", text: "hidden-reasoning" }), ...text("  summary-unique-success  "),
    LLMEvent.stepFinish({ index: 0, reason: "stop" }), LLMEvent.finish({ reason: "stop" }),
  ]), (request) => {
    expect(request.tools).toEqual({})
    expect(request.toolChoice).toBe("none")
    expect(request.agent.permission).toEqual([{ permission: "*", pattern: "*", action: "deny" }])
    expect(request.agent.prompt).toContain("MAINTENANCE FORK, not the original assistant or worker")
    expect(request.agent.prompt).toContain("parent retains its own role")
    expect(request.user.system).toBeUndefined()
    expect(request.user.tools).toBeUndefined()
    expect(request.user.format).toBeUndefined()
    expect(request.user.model.variant).toBeUndefined()
    expect(request.sessionID).not.toBe(sessionID)
    const payload = JSON.parse(String(request.messages[0].content))
    expect(payload.previous).toBe("prior-unique-context")
    expect(payload.history[0].parts[0].text).toBe("turn-0")
    expect(JSON.stringify(request.messages)).not.toContain("turn-2")
    expect(JSON.stringify(request)).not.toContain("must-not-leak")
  })
  expect(result).toBe("summary-unique-success")
}))
it.effect("partial text plus provider error never becomes context", () => Effect.gen(function* () {
  expect(yield* execute(Stream.fromIterable([
    ...text("partial-provider-error-evidence"), LLMEvent.providerError({ message: "provider-error-unique" }), LLMEvent.finish({ reason: "stop" }),
  ]))).toBeUndefined()
}))
for (const event of [
  LLMEvent.toolInputStart({ id: "tool-1", name: "bash" }),
  LLMEvent.toolInputDelta({ id: "tool-1", name: "bash", text: "{}" }),
  LLMEvent.toolInputEnd({ id: "tool-1", name: "bash" }),
  LLMEvent.toolCall({ id: "tool-1", name: "bash", input: { command: "touch forbidden" } }),
  LLMEvent.toolResult({ id: "tool-1", name: "bash", result: { type: "text", value: "forbidden-result" } }),
  LLMEvent.toolError({ id: "tool-1", name: "bash", message: "forbidden-error" }),
]) it.effect(`rejects ${event.type} even with text and stop`, () => Effect.gen(function* () {
  expect(yield* execute(Stream.fromIterable([...text("partial-tool-attempt"), event, LLMEvent.finish({ reason: "stop" })]))).toBeUndefined()
}))
it.effect("length terminal rejects nonempty partial output", () => Effect.gen(function* () {
  expect(yield* execute(Stream.fromIterable([...text("partial-length-evidence"), LLMEvent.finish({ reason: "length" })]))).toBeUndefined()
}))
it.effect("step finish is not a terminal finish", () => Effect.gen(function* () {
  expect(yield* execute(Stream.fromIterable([...text("missing-terminal-evidence"), LLMEvent.stepFinish({ index: 0, reason: "stop" })]))).toBeUndefined()
}))
it.effect("empty stop output is invalid", () => Effect.gen(function* () {
  expect(yield* execute(Stream.fromIterable([...text(" \n "), LLMEvent.finish({ reason: "stop" })]))).toBeUndefined()
}))
it.effect("stream failure propagates instead of accepting partial text", () => Effect.gen(function* () {
  const failure = new Error("stream-failure-unique")
  const exit = yield* execute(Stream.concat(Stream.fromIterable(text()), Stream.fail(failure))).pipe(Effect.exit)
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBe(failure)
}))
it.effect("maintenance times out after sixty seconds", () => Effect.gen(function* () {
  const ready = yield* Deferred.make<void>()
  const stream = Stream.fromEffect(Deferred.succeed(ready, undefined).pipe(Effect.andThen(Effect.never)))
  const fiber = yield* execute(stream).pipe(Effect.exit, Effect.forkChild)
  yield* Deferred.await(ready)
  yield* TestClock.adjust("60 seconds")
  const exit = yield* Fiber.join(fiber)
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toMatchObject({ _tag: "TimeoutError" })
}))
it.effect("maintenance retains tool evidence and file references", () => Effect.gen(function* () {
  const selected = input()
  const base = { sessionID, messageID: selected.head[0].info.id }
  const attachment: SessionV1.FilePart = { ...base, id: PartID.make("prt_file"), type: "file", mime: "text/plain", filename: "evidence.txt", url: "file:///unique/evidence.txt" }
  selected.head[0].parts.push({ ...base, id: PartID.make("prt_completed"), type: "tool", callID: "call-read", tool: "read",
    state: { status: "completed", input: { filePath: "/unique/input.ts" }, output: "tool-output-unique-fact", title: "Read",
      metadata: { private: "private-tool-metadata" }, time: { start: 0, end: 1 }, attachments: [attachment] } },
    { ...base, id: PartID.make("prt_error"), type: "tool", callID: "call-error", tool: "bash",
      state: { status: "error", input: { command: "unique-command" }, error: "tool-error-unique-fact", time: { start: 0, end: 1 } } }, attachment)
  const provider = yield* Provider.Service
  expect(yield* run(selected, { provider, llm: { stream: (request) => {
    const payload = JSON.parse(String(request.messages[0].content))
    expect(payload.history[0].parts[1].output).toBe("tool-output-unique-fact")
    expect(payload.history[0].parts[1].input).toEqual({ filePath: "/unique/input.ts" })
    expect(payload.history[0].parts[1].attachments[0].url).toBe(attachment.url)
    expect(payload.history[0].parts[2].error).toBe("tool-error-unique-fact")
    expect(JSON.stringify(payload)).not.toContain("private-tool-metadata")
    return Stream.fromIterable([...text("tool-evidence-summary"), LLMEvent.finish({ reason: "stop" })])
  } } })).toBe("tool-evidence-summary")
}))

for (const condition of ["workflow", "workflow-alias", "input-limit"] as const) it.effect(`maintenance declines ${condition} before streaming`, () => Effect.gen(function* () {
  const provider = yield* Provider.Service
  const selected = condition !== "input-limit"
    ? { ...model, id: ModelV2.ID.make(condition === "workflow" ? "duo-workflow-test" : "maintenance-alias"), api: { ...model.api, id: "duo-workflow-test", npm: "gitlab-ai-provider" } }
    : { ...model, limit: { ...model.limit, input: 1 } }
  let streamed = false
  const result = yield* run(input(), {
    provider: { ...provider, getModel: () => Effect.succeed(selected) },
    llm: { stream: () => { streamed = true; return Stream.fromIterable([...text(), LLMEvent.finish({ reason: "stop" })]) } },
  })
  expect(result).toBeUndefined()
  expect(streamed).toBe(false)
}))
it.effect("compacted output and inline media are not resurrected into text", () => Effect.gen(function* () {
  const selected = input()
  const base = { sessionID, messageID: selected.head[0].info.id }
  selected.head[0].parts.push({ ...base, id: PartID.make("prt_compacted"), type: "tool", callID: "cleared", tool: "read",
    state: { status: "completed", input: {}, output: "CLEARED_OUTPUT_MUST_NOT_RETURN", title: "read", metadata: {}, time: { start: 0, end: 1, compacted: 2 } } },
    { ...base, id: PartID.make("prt_inline"), type: "file", mime: "image/png", url: "data:image/png;base64,INLINE_BASE64_MUST_NOT_RETURN" })
  const payload = JSON.stringify(request(selected.head))
  expect(payload).toContain("[Tool output cleared]")
  expect(payload).toContain("[inline attachment]")
  expect(payload).not.toContain("MUST_NOT_RETURN")
}))

it.effect("supported terse model uses medium verbosity for maintenance only", () => Effect.gen(function* () {
  const provider = yield* Provider.Service
  const luna = { ...model, id: ModelV2.ID.make("gpt-5.6-luna"), api: { ...model.api, id: "gpt-5.6-luna", npm: "@ai-sdk/openai" } }
  let inspected = false
  const result = yield* run(input(), {
    provider: { ...provider, getModel: () => Effect.succeed(luna) },
    llm: { stream: (request) => {
      inspected = true
      expect(request.agent.options).toEqual({ textVerbosity: "medium" })
      expect(luna.options).toEqual(model.options)
      return Stream.fromIterable([...text(), LLMEvent.finish({ reason: "stop" })])
    } },
  })
  expect(inspected).toBe(true)
  expect(result).toBe("summary-unique-success")
}))
