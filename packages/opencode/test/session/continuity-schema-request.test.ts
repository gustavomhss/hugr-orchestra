import { expect, test } from "bun:test"
import { Cause, Effect, Exit, Layer, Stream } from "effect"
import { createOpenAI } from "@ai-sdk/openai"
import { Output, jsonSchema, streamText, tool, type JSONSchema7 } from "ai"
import { LLMEvent, type LLMRequest } from "@opencode-ai/llm"
import { LLMClient } from "@opencode-ai/llm/route"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNodePlatform } from "@opencode-ai/core/effect/app-node-platform"
import { Plugin } from "@/plugin"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { LLM } from "@/session/llm"
import { LLMNative } from "@/session/llm/native-request"
import { LLMNativeRuntime } from "@/session/llm/native-runtime"
import { Provider } from "@/provider/provider"
import { Auth } from "@/auth"
import { Config } from "@/config/config"
import { MessageID, SessionID } from "@/session/schema"
import PROMPT from "@/continuity/prompt.txt"
import { ProviderTest } from "../fake/provider"
import { testEffect } from "../lib/effect"

const schema: JSONSchema7 = {
  type: "object", properties: { status: { type: "string", enum: ["ready", "needs_context"] } },
  required: ["status"], additionalProperties: false,
}
const role = PROMPT + `\nBODY SCHEMA (host-owned):\n${JSON.stringify(schema)}`
const valid = '{"status":"ready"}'
type Mode = "valid" | "invalid" | "partial" | "refusal" | "error"

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function request(responseSchema?: JSONSchema7): LLM.StreamInput {
  const model = ProviderTest.model()
  return {
    purpose: "context-maintenance", responseSchema,
    sessionID: SessionID.make("ses_schema"), parentSessionID: SessionID.make("ses_parent"), model,
    agent: { name: "continuity", mode: "subagent", prompt: role, options: {}, temperature: 0.31, topP: 0.81,
      permission: [{ permission: "*", pattern: "*", action: "allow" }] },
    user: { id: MessageID.make("msg_schema"), sessionID: SessionID.make("ses_schema"), role: "user",
      agent: "continuity", model: { providerID: model.providerID, modelID: model.id }, time: { created: 0 },
      system: "PARENT_CODING_PERSONA" },
    system: ["PARENT_CODING_PERSONA"], messages: [{ role: "user", content: '{"source":"continue coding"}' }],
    tools: { bash: tool({ inputSchema: jsonSchema({ type: "object", properties: {} }) }) },
    toolChoice: "required",
  }
}

function capture(mode: Mode = "valid", text = valid) {
  const bodies: Record<string, unknown>[] = []
  const headers: Headers[] = []
  const fetch: typeof globalThis.fetch = Object.assign(async (_url: Parameters<typeof globalThis.fetch>[0],
    init?: Parameters<typeof globalThis.fetch>[1]) => {
    const body: unknown = JSON.parse(await new Response(init?.body).text())
    if (!record(body)) throw new Error("fixture requires an object body")
    bodies.push(body)
    headers.push(new Headers(init?.headers))
    if (mode === "error") return new Response('{"error":{"message":"local upstream failure"}}', { status: 503 })
    const delta = mode === "invalid" ? "not JSON" : mode === "partial" ? '{"status":' : text
    const item = { id: "msg-local", type: "message", role: "assistant", content: [] }
    const events = [
      { type: "response.created", response: { id: "resp-local", created_at: 0, model: "gpt-5.2" } },
      { type: "response.output_item.added", output_index: 0, item },
      ...(mode === "refusal" ? [
        { type: "response.refusal.delta", item_id: item.id, output_index: 0, content_index: 0, delta: "I cannot comply" },
      ] : [
        { type: "response.content_part.added", item_id: item.id, output_index: 0, content_index: 0,
          part: { type: "output_text", text: "", annotations: [] } },
        { type: "response.output_text.delta", item_id: item.id, output_index: 0, content_index: 0, delta },
      ]),
      { type: "response.output_item.done", output_index: 0, item },
      { type: mode === "partial" ? "response.incomplete" : "response.completed", response: {
        incomplete_details: mode === "partial" ? { reason: "max_output_tokens" } : null,
        usage: { input_tokens: 1, output_tokens: 1 },
      } },
    ]
    return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), {
      headers: { "Content-Type": "text/event-stream" },
    })
  }, { preconnect: () => { throw new Error("unexpected preconnect in local fixture") } })
  return { bodies, headers, fetch }
}

function harness(value: LLM.StreamInput, options: {
  native?: boolean; oauth?: boolean; mode?: Mode; mutateCaller?: boolean; hostile?: boolean
} = {}) {
  const wire = capture(options.mode)
  const nativeRequests: LLMRequest[] = []
  const selected: Provider.Model[] = []
  const contexts: unknown[] = []
  const plugin = Layer.succeed(Plugin.Service, Plugin.Service.of({
    trigger: (name, input, output) => Effect.sync(() => {
      contexts.push(input)
      if (record(input)) expect(Object.hasOwn(input, "responseSchema")).toBe(false)
      if (options.mutateCaller && value.responseSchema) value.responseSchema.required = ["injected"]
      if (options.hostile && record(input) && record(input.model)) {
        if (record(input.model.api)) input.model.api.id = "forged-model"
        if (record(input.model.options) && record(input.model.options.responseSchema)) {
          input.model.options.responseSchema.required = ["injected"]
        }
      }
      if (record(output)) {
        if (options.hostile && name === "experimental.chat.system.transform" && Array.isArray(output.system))
          output.system.splice(0, output.system.length, "HOOK_CODING_PERSONA")
        if (options.hostile && name === "chat.params") {
          Object.assign(output, { temperature: 1.91, topP: 0.01, topK: 99, maxOutputTokens: 1 })
          if (record(output.options)) output.options.instructions = "HOOK_CODING_PERSONA"
        }
        if (name === "chat.headers" && record(output.headers)) {
          output.headers.Authorization = "Bearer trusted-plugin"
          output.headers["OpenAI-Beta"] = "responses=experimental"
        }
      }
      return output
    }), list: () => Effect.succeed([]), init: () => Effect.void,
  }))
  const provider = ProviderTest.fake({ model: value.model,
    info: ProviderTest.info({ options: { apiKey: "local-only", ...(options.oauth ? { fetch: wire.fetch } : {}) } }, value.model),
    getLanguage: (model) => Effect.sync(() => {
      selected.push(structuredClone(model))
      // Real SDK OpenAI transport; alternate npm fixtures exercise native selection only.
      return createOpenAI({ apiKey: "local-only", fetch: wire.fetch }).responses(model.api.id)
    }),
  })
  const client = Layer.succeed(LLMClient.Service, LLMClient.Service.of({
    prepare: () => Effect.die(new Error("unexpected native prepare")),
    generate: () => Effect.die(new Error("unexpected native generate")),
    stream: (input) => {
      nativeRequests.push(input)
      return Stream.make(LLMEvent.textStart({ id: "native" }), LLMEvent.textDelta({ id: "native", text: valid }),
        LLMEvent.textEnd({ id: "native" }), LLMEvent.finish({ reason: "stop" }))
    },
  }))
  const layer = AppNodeBuilder.build(LLM.node, [
    [Provider.node, provider.layer], [Plugin.node, plugin],
    [Auth.node, Layer.mock(Auth.Service, { get: () => Effect.succeed(options.oauth
      ? { type: "oauth" as const, access: "local", refresh: "local", expires: 0 } : undefined) })],
    [Config.node, Layer.mock(Config.Service, { get: () => Effect.succeed({}) })],
    [RuntimeFlags.node, RuntimeFlags.layer({ experimentalNativeLlm: options.native ?? false })],
    [LayerNodePlatform.llmClient, client],
  ])
  return { wire, nativeRequests, selected, contexts,
    run: LLM.Service.use((llm) => llm.stream(value).pipe(Stream.runCollect)).pipe(Effect.provide(layer)) }
}

const it = testEffect(Layer.empty)

for (const native of [false, true]) for (const oauth of [false, true]) {
  it.instance(`schema reaches ${native ? "native canonical request" : "SDK wire"}, oauth=${oauth}`, () => Effect.gen(function* () {
    const value = request(structuredClone(schema))
    value.model.options.responseSchema = value.responseSchema
    const before = structuredClone({ model: value.model, messages: value.messages })
    const check = harness(value, { native, oauth, hostile: true })
    const events = yield* check.run
    expect(check.selected).toHaveLength(1)
    expect(check.selected[0].api.id).toBe(before.model.api.id)
    expect(value.responseSchema).toEqual(schema)
    expect(value.model).toEqual(before.model)
    expect(value.messages).toEqual(before.messages)
    expect(check.contexts.length).toBeGreaterThan(0)
    expect(events.filter((event) => event.type === "text-delta").map((event) => event.text).join("")).toBe(valid)
    expect(events.find((event) => event.type === "finish")?.reason).toBe("stop")
    if (native) {
      expect(check.nativeRequests).toHaveLength(1)
      const outgoing = check.nativeRequests[0]
      expect(outgoing.responseFormat).toEqual({ type: "json", schema: { ...schema } })
      expect(outgoing.tools).toEqual([])
      expect(outgoing.toolChoice?.type).toBe("none")
      expect(outgoing.generation?.maxTokens).toBe(oauth ? undefined : 10000)
      expect(outgoing.system.map((part) => part.text)).toEqual(oauth ? [] : [role])
      expect(outgoing.providerOptions?.openai?.instructions).toBe(oauth ? role : undefined)
      expect(check.wire.bodies).toEqual([])
      return
    }
    expect(check.wire.bodies).toHaveLength(1)
    expect(check.wire.bodies[0].text).toMatchObject({ format: { type: "json_schema", name: "response", strict: true, schema } })
    expect(check.wire.bodies[0].tools ?? []).toEqual([])
    expect(check.wire.bodies[0].tool_choice).toBeUndefined() // SDK omits tool_choice with no tools.
    expect(check.wire.bodies[0].max_output_tokens).toBe(oauth ? undefined : 10000)
    expect(check.wire.bodies[0].instructions).toBe(oauth ? role : undefined)
    if (oauth) expect(Object.hasOwn(check.wire.bodies[0], "max_output_tokens")).toBe(false)
    expect(JSON.stringify(check.wire.bodies[0])).toContain(JSON.stringify(role).slice(1, -1))
    expect(check.wire.headers[0].get("Authorization")).toBe("Bearer trusted-plugin")
    expect(check.wire.headers[0].get("OpenAI-Beta")).toBe("responses=experimental")
    expect(check.wire.headers[0].get("x-parent-session-id")).toBe("ses_parent")
  }))
}

for (const native of [false, true]) {
  it.instance(`in-flight schema detached before caller-side mutation during hooks, native=${native}`, () => Effect.gen(function* () {
    const value = request(structuredClone(schema))
    const check = harness(value, { native, mutateCaller: true })
    yield* check.run
    expect(value.responseSchema?.required).toEqual(["injected"]) // Deliberate external caller mutation.
    if (native) expect(check.nativeRequests[0].responseFormat).toEqual({ type: "json", schema: { ...schema } })
    if (!native) expect(check.wire.bodies[0].text).toMatchObject({ format: { schema } })
  }))
}

it.instance("ordinary parent wire unchanged when schema absent", () => Effect.gen(function* () {
  const parent = request()
  parent.purpose = undefined
  parent.agent.prompt = "PARENT_AGENT_ROLE"
  parent.tools = {}
  parent.toolChoice = "none"
  const plain = harness(parent)
  yield* plain.run
  const structured = harness({ ...parent, responseSchema: schema })
  yield* structured.run
  expect(plain.wire.bodies).toHaveLength(1)
  expect(structured.wire.bodies).toHaveLength(1)
  const body = structuredClone(structured.wire.bodies[0])
  if (!record(body.text)) throw new Error("schema wire missing text settings")
  delete body.text.format
  if (!Object.keys(body.text).length) delete body.text
  expect(body).toEqual(plain.wire.bodies[0])
  expect(JSON.stringify(plain.wire.bodies[0])).toContain("PARENT_AGENT_ROLE")
  expect(JSON.stringify(plain.wire.bodies[0])).toContain("PARENT_CODING_PERSONA")
}))

test("native lowering omits responseFormat without schema", () => {
  const value = request()
  const plain = LLMNative.request({ ...value, tools: {} })
  const formatted = LLMNative.request({ ...value, tools: {}, responseSchema: schema })
  expect(plain.responseFormat).toBeUndefined()
  expect(formatted.responseFormat).toEqual({ type: "json", schema: { ...schema } })
  expect(formatted.messages).toEqual(plain.messages)
  expect(formatted.generation).toEqual(plain.generation)
  expect(JSON.parse(JSON.stringify({ ...formatted, responseFormat: undefined }))).toEqual(JSON.parse(JSON.stringify(plain)))
})

it.instance("uncloneable response schema fails before model selection or hooks", () => Effect.gen(function* () {
  const value = request(schema)
  Object.assign(value, { responseSchema: { ...schema, hostile: () => "not pure data" } })
  const check = harness(value)
  const result = yield* check.run.pipe(Effect.exit)
  expect(Exit.isFailure(result)).toBe(true)
  if (Exit.isFailure(result)) expect(Cause.squash(result.cause)).toMatchObject({ name: "DataCloneError" })
  expect(check.selected).toEqual([])
  expect(check.contexts).toEqual([])
  expect(check.wire.bodies).toEqual([])
}))

for (const npm of ["@ai-sdk/anthropic", "@ai-sdk/openai-compatible"]) {
  it.instance(`native ${npm} schema returns unsupported and LLM falls back with SDK output`, () => Effect.gen(function* () {
    const value = request(schema)
    value.model.api.npm = npm
    const check = harness(value, { native: true })
    yield* check.run
    expect(check.nativeRequests).toHaveLength(0)
    expect(check.wire.bodies).toHaveLength(1)
    expect(check.wire.bodies[0].text).toMatchObject({ format: { type: "json_schema", schema } })
    const result = LLMNativeRuntime.stream({ ...value, provider: ProviderTest.info({ options: { apiKey: "local" } }, value.model),
      auth: undefined, llmClient: { prepare: () => Effect.die("unexpected prepare"),
        generate: () => Effect.die("unexpected generate"), stream: () => Stream.die("unsupported request executed") },
      headers: {}, abort: new AbortController().signal })
    expect(result).toEqual({ type: "unsupported", reason: "native response schemas require @ai-sdk/openai" })
  }))
}

for (const mode of ["valid", "invalid", "partial", "refusal", "error"] as const) {
  it.instance(`schema preserves SDK text/finish/error behavior: ${mode}`, () => Effect.gen(function* () {
    const plain = harness(request(), { mode })
    const formatted = harness(request(schema), { mode })
    const baseline = yield* plain.run.pipe(Effect.exit)
    const result = yield* formatted.run.pipe(Effect.exit)
    expect(plain.wire.bodies).toHaveLength(1)
    expect(formatted.wire.bodies).toHaveLength(1) // No plaintext retry, including transient HTTP 503.
    expect(result._tag).toBe(baseline._tag)
    if (mode === "error") {
      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) expect(String(Cause.squash(result.cause))).toContain("local upstream failure")
      return
    }
    if (!Exit.isSuccess(result) || !Exit.isSuccess(baseline)) throw new Error("fixture expected streamed completion")
    const text = (events: readonly LLMEvent[]) => events.filter((event) => event.type === "text-delta").map((event) => event.text).join("")
    expect(text(result.value)).toBe(text(baseline.value))
    expect(text(result.value)).toBe(mode === "valid" ? valid : mode === "invalid" ? "not JSON" : mode === "partial" ? '{"status":' : "")
    expect(result.value.find((event) => event.type === "finish")?.reason).toBe(mode === "partial" ? "length" : "stop")
  }))
}

test("real SDK Output.object exposes JSON text and terminal parse; host completeness remains separate", async () => {
  for (const text of [valid, "not JSON", "{}"] as const) {
    const wire = capture("valid", text)
    const result = streamText({ model: createOpenAI({ apiKey: "local", fetch: wire.fetch }).responses("gpt-5.2"),
      messages: [{ role: "system", content: role }, { role: "user", content: "produce body" }],
      output: Output.object({ name: "response", schema: jsonSchema(schema) }), tools: {}, toolChoice: "none", maxRetries: 0 })
    const parts = []
    for await (const part of result.fullStream) parts.push(part)
    expect(parts.filter((part) => part.type === "text-delta").map((part) => part.text).join("")).toBe(text)
    expect(parts.some((part) => part.type === "finish")).toBe(true)
    expect(wire.bodies[0].text).toMatchObject({ format: { type: "json_schema", strict: true, name: "response", schema } })
    if (text === "not JSON") await expect(Promise.resolve(result.output)).rejects.toThrow("No object generated")
    // jsonSchema(schema) has no local validator; the wire schema is not host completeness proof.
    if (text !== "not JSON") expect(await result.output).toEqual(JSON.parse(text))
  }
})
