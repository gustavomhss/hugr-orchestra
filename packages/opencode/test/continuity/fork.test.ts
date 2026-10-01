import { expect } from "bun:test"
import { Cause, Context, Deferred, Effect, Exit, Fiber, Layer, Stream } from "effect"
import { TestClock } from "effect/testing"
import { LLMEvent } from "@opencode-ai/llm"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { Provider } from "@/provider/provider"
import type { LLM } from "@/session/llm"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { MAX_ARTIFACT_TOKENS, run, snapshot } from "@/continuity/fork"
import { catalogue } from "@/continuity/source"
import { jsonSchema } from "@/continuity/artifact"
import { ProviderTest } from "../fake/provider"
import { testEffect } from "../lib/effect"

const model = ProviderTest.model({ id: ModelV2.ID.make("summary-model"), providerID: ProviderV2.ID.make("test") })
const it = testEffect(Layer.mock(Provider.Service, { getModel: () => Effect.succeed(model) }))
const sessionID = SessionID.make("ses_parent")
const body = { status: "ready", exact: [{ source: "S002", reason: "identifier" }],
  notes: [], reference_only: [], omissions: [], issues: [] }

function input() {
  const history: SessionV1.WithParts[] = Array.from({ length: 10 }, (_, index) => {
    const id = MessageID.make(`msg_${index}`)
    return {
      info: {
        id, sessionID, role: "user", agent: "parent-agent",
        model: { providerID: model.providerID, modelID: model.id, variant: "parent-variant" },
        time: { created: index }, system: "historical-parent-system", tools: { bash: true },
        format: { type: "json_schema", schema: { parent: true }, retryCount: 2 },
      },
      parts: [{ id: PartID.make(`prt_${index}`), messageID: id, sessionID, type: "text", text: `turn-${index}`,
        metadata: { private: "raw-metadata-must-not-leak" } }],
    }
  })
  const selected = snapshot(sessionID, history)
  if (!selected) throw new Error("fixture must have compressible head")
  return selected
}

function text(value = JSON.stringify(body)): LLMEvent[] {
  return [LLMEvent.textStart({ id: "text-1" }), LLMEvent.textDelta({ id: "text-1", text: value }), LLMEvent.textEnd({ id: "text-1" })]
}

class Capture extends Context.Service<Capture, { llm: LLM.Interface; requests: LLM.StreamInput[] }>()("ContinuityTestCapture") {}

function captureLayer(events: Stream.Stream<LLMEvent, unknown>, inspect?: (request: LLM.StreamInput) => void) {
  return Layer.sync(Capture, () => {
    const requests: LLM.StreamInput[] = []
    return Capture.of({ requests, llm: { stream: (request) => {
      requests.push(request)
      inspect?.(request)
      return events
    } } })
  })
}

function execute(events: Stream.Stream<LLMEvent, unknown>, inspect?: (request: LLM.StreamInput) => void,
  selected = input(), selectedModel = model) {
  return Effect.gen(function* () {
    const provider = yield* Provider.Service
    const capture = yield* Capture
    const artifact = yield* run(selected, {
      provider: { ...provider, getModel: () => Effect.succeed(selectedModel) }, llm: capture.llm,
    })
    return { artifact, requests: capture.requests }
  }).pipe(Effect.provide(captureLayer(events, inspect)))
}

it.effect("valid stop JSON materializes exact source with isolated producer request", () => Effect.gen(function* () {
  const result = yield* execute(Stream.fromIterable([
    LLMEvent.reasoningDelta({ id: "thinking", text: "hidden-reasoning" }), ...text(),
    LLMEvent.stepFinish({ index: 0, reason: "stop" }), LLMEvent.finish({ reason: "stop" }),
  ]), (request) => {
    expect(request.tools).toEqual({})
    expect(request.toolChoice).toBe("none")
    expect(request.purpose).toBe("context-maintenance")
    expect(request.system).toEqual([])
    expect(request.agent.permission).toEqual([{ permission: "*", pattern: "*", action: "deny" }])
    expect(request.agent.prompt).toContain("PRODUCER PROTOCOL v1")
    expect(request.agent.prompt).toContain("not the original assistant, task owner, or original worker")
    expect(request.agent.prompt).toContain("parent conversation identified by the host continues independently")
    expect(request.agent.prompt).toContain(JSON.stringify(jsonSchema))
    expect(request.user.system).toBeUndefined()
    expect(request.user.tools).toBeUndefined()
    expect(request.user.format).toBeUndefined()
    expect(request.user.model.variant).toBe("parent-variant")
    expect(request.sessionID).not.toBe(sessionID)
    expect(request.parentSessionID).toBe(sessionID)
    const payload: unknown = JSON.parse(String(request.messages[0].content))
    expect(payload).toMatchObject({ envelope: { parentID: sessionID, producerID: request.sessionID,
      coveredThrough: "msg_1", tailStart: "msg_2", boundary: "msg_9" },
      receiver: { canRecall: false }, bodySchema: jsonSchema, maxTokens: MAX_ARTIFACT_TOKENS })
    expect(JSON.stringify(request.messages)).toContain("historical-parent-system")
    expect(JSON.stringify(request.messages)).not.toContain("turn-2")
    expect(JSON.stringify(request)).not.toContain("raw-metadata-must-not-leak")
  })
  expect(result.requests).toHaveLength(1)
  expect(result.artifact?.exact).toEqual([{ source: "S002", reason: "identifier", value: "turn-0" }])
  expect(result.artifact?.envelope.parentID).toBe(sessionID)
  expect(result.artifact?.envelope.producerID).toBe(SessionID.make(result.requests[0].sessionID))
  expect(result.artifact?.text).toContain("turn-0")
}))

for (const event of [
  LLMEvent.providerError({ message: "provider-error-unique" }),
  LLMEvent.toolInputStart({ id: "tool-1", name: "bash" }),
  LLMEvent.toolInputDelta({ id: "tool-1", name: "bash", text: "{}" }),
  LLMEvent.toolInputEnd({ id: "tool-1", name: "bash" }),
  LLMEvent.toolCall({ id: "tool-1", name: "bash", input: { command: "touch forbidden" } }),
  LLMEvent.toolResult({ id: "tool-1", name: "bash", result: { type: "text", value: "forbidden-result" } }),
  LLMEvent.toolError({ id: "tool-1", name: "bash", message: "forbidden-error" }),
  LLMEvent.stepFinish({ index: 0, reason: "length" }),
]) it.effect(`rejects ${event.type} even with valid JSON and terminal stop`, () => Effect.gen(function* () {
  const result = yield* execute(Stream.fromIterable([...text(), event, LLMEvent.finish({ reason: "stop" })]))
  expect(result.requests).toHaveLength(1)
  expect(result.artifact).toBeUndefined()
}))

for (const events of [
  [...text(), LLMEvent.finish({ reason: "length" })],
  [...text(), LLMEvent.stepFinish({ index: 0, reason: "stop" })],
  [...text(), LLMEvent.finish({ reason: "stop" }), LLMEvent.textDelta({ id: "text-1", text: "trailing" })],
  [...text(" \n "), LLMEvent.finish({ reason: "stop" })],
  [...text("I will continue implementing the user's task."), LLMEvent.finish({ reason: "stop" })],
  [...text(JSON.stringify({ ...body, exact: [{ source: "FOREIGN", reason: "identifier" }] })), LLMEvent.finish({ reason: "stop" })],
  [...text(JSON.stringify({ ...body, status: "needs_context", issues: [{ code: "missing_source", detail: "essential missing", sources: [] }] })), LLMEvent.finish({ reason: "stop" })],
]) it.effect(`rejects incomplete or invalid artifact stream ${JSON.stringify(events.at(-1))}`, () => Effect.gen(function* () {
  const result = yield* execute(Stream.fromIterable(events))
  expect(result.requests).toHaveLength(1)
  expect(result.artifact).toBeUndefined()
}))

it.effect("stream failure propagates instead of accepting partial JSON", () => Effect.gen(function* () {
  const failure = new Error("stream-failure-unique")
  const exit = yield* execute(Stream.concat(Stream.fromIterable(text()), Stream.fail(failure))).pipe(Effect.exit)
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBe(failure)
}))

it.effect("whole maintenance stream times out after sixty seconds", () => Effect.gen(function* () {
  const ready = yield* Deferred.make<void>()
  const stream = Stream.fromEffect(Deferred.succeed(ready, undefined).pipe(Effect.andThen(Effect.never)))
  const fiber = yield* execute(stream).pipe(Effect.exit, Effect.forkChild)
  yield* Deferred.await(ready)
  yield* TestClock.adjust("60 seconds")
  const exit = yield* Fiber.join(fiber)
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toMatchObject({ _tag: "TimeoutError" })
}))

it.effect("timeout also covers provider model lookup before stream", () => Effect.gen(function* () {
  const provider = yield* Provider.Service
  const ready = yield* Deferred.make<void>()
  const requests: LLM.StreamInput[] = []
  const fiber = yield* run(input(), {
    provider: { ...provider, getModel: () => Deferred.succeed(ready, undefined).pipe(Effect.andThen(Effect.never)) },
    llm: { stream: (request) => { requests.push(request); return Stream.empty } },
  }).pipe(Effect.exit, Effect.forkChild)
  yield* Deferred.await(ready)
  yield* TestClock.adjust("60 seconds")
  const exit = yield* Fiber.join(fiber)
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toMatchObject({ _tag: "TimeoutError" })
  expect(requests).toEqual([])
}))

for (const condition of ["workflow", "workflow-alias", "input-limit"] as const) {
  it.effect(`declines ${condition} before streaming`, () => Effect.gen(function* () {
    const selected = condition !== "input-limit"
      ? { ...model, id: ModelV2.ID.make(condition === "workflow" ? "duo-workflow-test" : "maintenance-alias"),
        api: { ...model.api, id: "duo-workflow-test", npm: "gitlab-ai-provider" } }
      : { ...model, limit: { ...model.limit, input: 1 } }
    const result = yield* execute(Stream.fromIterable([...text(), LLMEvent.finish({ reason: "stop" })]), undefined, input(), selected)
    expect(result.artifact).toBeUndefined()
    expect(result.requests).toEqual([])
  }))
}

it.effect("critical exact overflow declines after counting materialized text, not selector JSON", () => Effect.gen(function* () {
  const selected = input()
  const part = selected.head[0].parts[0]
  if (part.type !== "text") throw new Error("expected text fixture")
  part.text = "critical literal with qualifiers ".repeat(2000)
  const result = yield* execute(Stream.fromIterable([...text(), LLMEvent.finish({ reason: "stop" })]), undefined, selected)
  expect(JSON.stringify(body).length).toBeLessThan(1000)
  expect(result.requests).toHaveLength(1)
  expect(result.artifact).toBeUndefined()
}))

it.effect("source catalogue carries authenticated tool role, shell metadata, user.system scope as data", () => Effect.gen(function* () {
  const selected = input()
  const base = { sessionID, messageID: selected.head[0].info.id }
  selected.head[0].parts.push({ ...base, id: PartID.make("prt_completed"), type: "tool", callID: "call-read", tool: "bash",
    state: { status: "completed", input: { command: "unique-command" }, output: "tool-output-unique-fact", title: "bash",
      metadata: { exit: 75, truncated: true, outputPath: "/unique/output", private: "private-tool-metadata" },
      time: { start: 0, end: 1 } } })
  const sources = catalogue({ parentID: sessionID, head: selected.head })
  expect(sources.units.find((unit) => unit.locator.field === "system")).toMatchObject({
    role: "user", scope: "turn:msg_0", value: "historical-parent-system",
  })
  expect(sources.units.find((unit) => unit.locator.partID === "prt_completed" && unit.locator.path.length === 0)).toMatchObject({
    role: "tool", exit: 75, extent: "preview",
    value: { state: { metadata: { exit: 75, truncated: true, outputPath: "/unique/output" }, output: "tool-output-unique-fact" } },
  })
  const result = yield* execute(Stream.fromIterable([...text(), LLMEvent.finish({ reason: "stop" })]), (request) => {
    expect(JSON.stringify(request.messages)).toContain("tool-output-unique-fact")
    expect(JSON.stringify(request.messages)).not.toContain("private-tool-metadata")
    expect(request.user.system).toBeUndefined()
  }, selected)
  expect(result.artifact).toBeDefined()
}))

for (const condition of ["supported-low", "explicit-low", "supported-high", "unsupported-low", "variant-high", "variant-low"] as const) {
  it.effect(`verbosity respects provider support and parent settings: ${condition}`, () => Effect.gen(function* () {
    const selected: Provider.Model = { ...model, api: { ...model.api, id: "gpt-5.6-luna",
      npm: condition === "unsupported-low" ? "@ai-sdk/openai-compatible" : "@ai-sdk/openai" },
      options: condition === "supported-high" ? { textVerbosity: "high" }
        : condition === "unsupported-low" || condition === "explicit-low" ? { textVerbosity: "low" } : {},
      variants: condition === "variant-high" ? { "parent-variant": { textVerbosity: "high" } }
        : condition === "variant-low" ? { "parent-variant": { textVerbosity: "low" } } : {} }
    const result = yield* execute(Stream.fromIterable([...text(), LLMEvent.finish({ reason: "stop" })]), (request) => {
      expect(request.agent.options).toEqual(condition === "supported-low" ? { textVerbosity: "medium" } : {})
      expect(request.user.model.variant).toBe("parent-variant")
    }, input(), selected)
    expect(result.artifact).toBeDefined()
  }))
}
