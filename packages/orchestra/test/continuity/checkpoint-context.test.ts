import { expect, test } from "bun:test"
import { asSchema, jsonSchema, type JSONSchema7 } from "ai"
import { Effect, Fiber, Layer } from "effect"
import { CheckpointContext } from "@/continuity/checkpoint-context"
import type { LLM } from "@/session/llm"
import { LLMPrepared } from "@/session/llm/prepared"
import { MessageID, SessionID } from "@/session/schema"
import { ProviderTest } from "../fake/provider"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.empty)

function input(): LLM.StreamInput {
  const model = ProviderTest.model({ options: { reasoning: { effort: "high" } }, variants: { deliberate: { temperature: 0.1 } },
    headers: { Authorization: "TRANSPORT_HEADER_SECRET" } })
  model.api.url = "https://TRANSPORT_USER:TRANSPORT_PASSWORD@example.test/private"
  const sessionID = SessionID.make("ses_checkpoint")
  return {
    sessionID, parentSessionID: "ses_parent", model,
    user: { id: MessageID.make("msg_checkpoint"), sessionID, role: "user", agent: "build", time: { created: 1 },
      model: { modelID: model.id, providerID: model.providerID, variant: "deliberate" } },
    agent: { name: "build", mode: "primary", prompt: "Exact agent role", permission: [], options: { temperature: 0.2 } },
    permission: [{ permission: "read", pattern: "*", action: "allow" }],
    system: ["Exact system", "# Working memory\nRemember"],
    messages: [{ role: "user", content: "Replay prefix" }, { role: "assistant", content: "Prior reply" },
      { role: "user", content: "Correction suffix" }],
    tools: { read: { description: "Exact tool", inputSchema: jsonSchema({ type: "object", properties: { path: { type: "string" } } }) } },
    responseSchema: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"] },
    toolChoice: "none", purpose: "context-maintenance", contextMemory: true, small: false, retries: 0,
    preflightParams: { temperature: 0.3, topP: 0.9, topK: 3, maxOutputTokens: 2000, options: { cache: "exact" } },
    prepared: LLMPrepared.token(),
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected object")
  return Object.fromEntries(Object.entries(value))
}

it.effect("captures exact transport context and contextual model descriptor, not provider wire", () => Effect.gen(function* () {
  const original = input()
  const result = yield* CheckpointContext.capture(original)
  const saved = object(CheckpointContext.decode(result.payload))
  const { tools, prepared, model, ...data } = result.request
  expect(saved).toEqual({ ...data, model: {
    id: model.id, providerID: model.providerID, name: model.name, family: model.family,
    api: { id: model.api.id, npm: model.api.npm }, capabilities: model.capabilities, cost: model.cost, limit: model.limit,
    status: model.status, options: model.options, release_date: model.release_date, variants: model.variants,
  }, tools: { read: { description: tools.read.description, inputSchema: asSchema(tools.read.inputSchema).jsonSchema } } })
  expect(result.request.prepared).toBe(original.prepared)
  expect(Object.hasOwn(saved, "prepared")).toBe(false)
  expect(result.payload).not.toContain("TRANSPORT_")
  expect(result.request.model.headers).toEqual(original.model.headers)
  expect(result.request.model.api.url).toBe(original.model.api.url)
  expect(JSON.parse(result.payload)).toMatchObject({ version: 1, representation: "continuity-fork-input/v1" })
  expect((yield* CheckpointContext.capture(result.request)).payload).toBe(result.payload)
  expect(Object.isFrozen(result.request)).toBe(true)
  expect(Object.isFrozen(result.request.tools.read)).toBe(true)
  expect(Object.isFrozen(result.request.messages)).toBe(true)
}))

it.effect("optional undefined fields remain aligned with snapshot transport input", () => Effect.gen(function* () {
  const original = input()
  delete original.permission
  delete original.preflightParams
  delete original.responseSchema
  original.tools = {}
  const result = yield* CheckpointContext.capture(original)
  const saved = object(CheckpointContext.decode(result.payload))
  for (const key of ["permission", "preflightParams", "responseSchema"] as const) {
    expect(Object.hasOwn(saved, key)).toBe(Object.hasOwn(result.request, key))
    expect(saved[key]).toBe(result.request[key])
  }
  expect((yield* CheckpointContext.capture(result.request)).payload).toBe(result.payload)
}))

it.effect("detaches before asynchronous schemas; resolves each builder once and retains host bindings", () => Effect.gen(function* () {
  const original = input()
  const started = Promise.withResolvers<void>()
  const released = Promise.withResolvers<JSONSchema7>()
  const builds = { input: 0, output: 0 }
  const schema: JSONSchema7 = { type: "object", properties: { path: { type: "string" } } }
  const output: JSONSchema7 = { type: "string" }
  const execute = async () => "host-only"
  const callback = () => {}
  const needsApproval = () => true
  const validate = (value: unknown) => ({ success: true as const, value })
  original.tools.read = { description: "Before await", inputExamples: [{ input: { path: "before" } }],
    inputSchema: jsonSchema(() => { builds.input++; started.resolve(); return released.promise }, { validate }),
    outputSchema: jsonSchema(() => { builds.output++; return output }, { validate }),
    execute, toModelOutput: () => ({ type: "text", value: "host-output" }),
    onInputStart: callback, onInputDelta: callback, onInputAvailable: callback, needsApproval,
  }
  const bindings = original.tools.read
  const fiber = yield* CheckpointContext.capture(original).pipe(Effect.forkChild)
  yield* Effect.promise(() => started.promise)
  original.messages.push({ role: "user", content: "Late message" })
  original.system[0] = "Late system"
  original.agent.options.temperature = 9
  original.model.options.reasoning = "late"
  original.user.model.variant = "late"
  original.tools.read.description = "Late description"
  original.tools.read.execute = async () => "late"
  original.tools.read.inputExamples?.push({ input: { path: "late" } })
  if (!original.preflightParams) throw new Error("Missing source parameters")
  original.preflightParams.options.cache = "late"
  released.resolve(schema)
  const result = yield* Fiber.join(fiber)
  const capturedOutput = result.request.tools.read.outputSchema
  if (!capturedOutput) throw new Error("Missing output schema")
  expect(builds).toEqual({ input: 1, output: 1 })
  const saved = object(CheckpointContext.decode(result.payload))
  const tool = object(object(saved.tools).read)
  expect(saved.messages).toEqual(result.request.messages)
  expect(result.request.messages).toHaveLength(3)
  expect(result.request.system[0]).toBe("Exact system")
  expect(result.request.agent.options.temperature).toBe(0.2)
  expect(result.request.model.options.reasoning).toEqual({ effort: "high" })
  expect(result.request.user.model.variant).toBe("deliberate")
  expect(result.request.preflightParams?.options.cache).toBe("exact")
  expect(tool).toEqual({ description: "Before await", inputExamples: [{ input: { path: "before" } }], inputSchema: schema, outputSchema: output })
  expect(tool.inputSchema).toEqual(asSchema(result.request.tools.read.inputSchema).jsonSchema)
  expect(tool.outputSchema).toEqual(asSchema(capturedOutput).jsonSchema)
  expect(result.request.tools.read.execute).toBe(execute)
  expect(result.request.tools.read.onInputStart).toBe(callback)
  expect(result.request.tools.read.onInputDelta).toBe(callback)
  expect(result.request.tools.read.onInputAvailable).toBe(callback)
  expect(result.request.tools.read.needsApproval).toBe(needsApproval)
  expect(result.request.tools.read.toModelOutput).toBe(bindings.toModelOutput)
  expect(asSchema(result.request.tools.read.inputSchema).validate).toBe(validate)
  expect(asSchema(capturedOutput).validate).toBe(validate)
  expect(result.request.prepared).toBe(original.prepared)
  schema.description = "Mutated resolved schema"
  output.description = "Mutated output schema"
  original.messages.length = 0
  expect(CheckpointContext.decode(result.payload)).toEqual(saved)
  expect(tool.inputSchema).toEqual(asSchema(result.request.tools.read.inputSchema).jsonSchema)
  expect(tool.outputSchema).toEqual(asSchema(capturedOutput).jsonSchema)
}))

it.effect("round-trips large Unicode, nested media, URL, exact bytes, undefined, Date and collision keys", () => Effect.gen(function* () {
  const original = input()
  const text = "🪨漢字e\u0301\u0000\ud800".repeat(20_000)
  const bytes = new Uint8Array([0, 1, 127, 128, 254, 255])
  const buffer = bytes.buffer.slice(0)
  const nodeBuffer = Buffer.from([0, 128, 255])
  const url = new URL("https://example.test/image?q=%F0%9F%AA%A8#exact")
  original.messages = [{ role: "user", content: [{ type: "text", text },
    { type: "image", image: bytes }, { type: "image", image: buffer }, { type: "image", image: url }, { type: "image", image: nodeBuffer }] }]
  original.agent.options.extra = { nested: [{ media: bytes, buffer, url, nodeBuffer, absent: undefined }],
    date: new Date("2026-01-01T00:00:00.000Z"), negativeZero: -0, undefined: undefined,
    type: "uint8array", data: ["undefined"], path: ["object"], $tag: "url",
    collision: Object.fromEntries([["__proto__", { intact: true }], ["constructor", "data"]]) }
  const result = yield* CheckpointContext.capture(original)
  const saved = object(CheckpointContext.decode(result.payload))
  expect(saved.messages).toEqual(result.request.messages)
  expect(saved.messages).toEqual(original.messages)
  const extra = object(object(saved.agent).options).extra
  expect(extra).toEqual(original.agent.options.extra)
  expect(Object.hasOwn(object(extra), "undefined")).toBe(true)
  expect(Object.is(object(extra).negativeZero, -0)).toBe(true)
  expect(result.request.agent.options.extra).toEqual(extra)
  bytes.fill(42)
  nodeBuffer.fill(42)
  new Uint8Array(buffer).fill(42)
  url.pathname = "/late"
  original.agent.options.extra = "late"
  expect(result.request.agent.options.extra).toEqual(extra)
  expect(saved.messages).toEqual(result.request.messages)
  expect(CheckpointContext.decode(result.payload)).toEqual(saved)
}))

for (const [name, value] of [
  ["function", () => "PRIVATE_CONTENT"], ["class", new (class Hidden { secret = "PRIVATE_CONTENT" })()],
  ["map", new Map([["secret", "PRIVATE_CONTENT"]])], ["infinity", Infinity], ["nan", NaN],
  ["bigint", 1n], ["symbol", Symbol("PRIVATE_CONTENT")], ["date", new Date(NaN)],
  ["typed-array", new Uint16Array([1])], ["sparse-array", new Array(2)],
  ["accessor", Object.defineProperty({}, "secret", { enumerable: true, get: () => "PRIVATE_CONTENT" })],
  ["symbol-key", { [Symbol("PRIVATE_CONTENT")]: 1 }],
  ["binary-property", Object.assign(new Uint8Array([1]), { hiddenCallback: () => "PRIVATE_CONTENT" })],
] as const) {
  it.effect(`rejects unsupported ${name} with content-free typed error`, () => Effect.gen(function* () {
    const original = input()
    original.agent.options.extra = value
    const error = yield* CheckpointContext.capture(original).pipe(Effect.flip)
    expect(error).toBeInstanceOf(CheckpointContext.CaptureError)
    expect(error._tag).toBe("ContinuityCheckpointError")
    expect(error.reason.length).toBeGreaterThan(0)
    expect(JSON.stringify(error)).not.toContain("PRIVATE_CONTENT")
  }))
}

it.effect("rejects cycles, unknown tool functions and missing request data", () => Effect.gen(function* () {
  const cycle: Record<string, unknown> = {}
  cycle.self = cycle
  const original = input()
  original.agent.options.extra = cycle
  expect((yield* CheckpointContext.capture(original).pipe(Effect.flip)).reason).toBe("cyclic-value")
  delete original.agent.options.extra
  Object.assign(original.tools.read, { unexpectedCallback: () => "PRIVATE_CONTENT" })
  expect((yield* CheckpointContext.capture(original).pipe(Effect.flip)).reason).toBe("unsupported-value")
  original.tools.read = { inputSchema: jsonSchema({}), needsApproval: true }
  const boolean = yield* CheckpointContext.capture(original)
  expect(object(object(object(CheckpointContext.decode(boolean.payload)).tools).read).needsApproval).toBe(true)
  Object.defineProperty(original.tools.read, "hiddenCallback", { value: () => "PRIVATE_CONTENT" })
  expect((yield* CheckpointContext.capture(original).pipe(Effect.flip)).reason).toBe("unsupported-property")
  const missing = input()
  Object.assign(missing, { messages: undefined })
  expect((yield* CheckpointContext.capture(missing).pipe(Effect.flip)).reason).toBe("invalid-request")
  const malformed = input()
  Object.assign(malformed.tools.read, { inputSchema: undefined })
  expect(yield* CheckpointContext.capture(malformed).pipe(Effect.flip)).toBeInstanceOf(CheckpointContext.CaptureError)
}))

it.effect("schema failures remain safe checkpoint errors", () => Effect.gen(function* () {
  const original = input()
  original.tools.read.inputSchema = jsonSchema(async () => { throw new Error("PRIVATE_CONTENT") })
  const error = yield* CheckpointContext.capture(original).pipe(Effect.flip)
  expect(error.reason).toBe("capture-failed")
  expect(JSON.stringify(error)).not.toContain("PRIVATE_CONTENT")
  original.tools.read.inputSchema = jsonSchema(async () => { throw new CheckpointContext.CaptureError({ reason: "PRIVATE_CONTENT" }) })
  const forged = yield* CheckpointContext.capture(original).pipe(Effect.flip)
  expect(forged.reason).toBe("capture-failed")
  expect(JSON.stringify(forged)).not.toContain("PRIVATE_CONTENT")
}))

it.effect("rejects decorated URLs and array subclasses before invoking their overrides", () => Effect.gen(function* () {
  const invoked = { getter: 0, map: 0 }
  const hidden = Object.defineProperty(new URL("https://example.test"), "hidden", { value: "PRIVATE_CONTENT" })
  const symbol = Object.defineProperty(new URL("https://example.test"), Symbol("hidden"), { value: "PRIVATE_CONTENT" })
  const accessor = Object.defineProperty(new URL("https://example.test"), "href", { get: () => {
    invoked.getter++
    return "https://substituted.test"
  } })
  class CustomArray extends Array<string> {}
  Object.defineProperty(CustomArray.prototype, "map", { value: () => { invoked.map++; return ["SUBSTITUTED"] } })
  for (const extra of [hidden, symbol, accessor, new CustomArray("original")]) {
    const original = input()
    original.agent.options.extra = extra
    const error = yield* CheckpointContext.capture(original).pipe(Effect.flip)
    expect(error).toBeInstanceOf(CheckpointContext.CaptureError)
    expect(JSON.stringify(error)).not.toContain("PRIVATE_CONTENT")
  }
  expect(invoked).toEqual({ getter: 0, map: 0 })
}))

it.effect("materializes PromiseLike schemas once, including asynchronous output schemas", () => Effect.gen(function* () {
  const original = input()
  const resolutions = { input: 0, output: 0 }
  const schema: JSONSchema7 = { type: "string" }
  const thenable: PromiseLike<JSONSchema7> = { then: (success, failure) => {
    resolutions.input++
    return Promise.resolve(schema).then(success, failure)
  } }
  original.tools.read = { inputSchema: jsonSchema(thenable), outputSchema: jsonSchema(async () => {
    resolutions.output++
    return schema
  }) }
  const result = yield* CheckpointContext.capture(original)
  const saved = object(object(object(CheckpointContext.decode(result.payload)).tools).read)
  expect(resolutions).toEqual({ input: 1, output: 1 })
  expect(saved.inputSchema).toEqual(asSchema(result.request.tools.read.inputSchema).jsonSchema)
  if (!result.request.tools.read.outputSchema) throw new Error("Missing output schema")
  expect(saved.outputSchema).toEqual(asSchema(result.request.tools.read.outputSchema).jsonSchema)
}))

test("decode rejects malformed envelopes and tags without echoing payload", () => {
  const envelope = (data: unknown) => JSON.stringify({ version: 1, representation: "continuity-fork-input/v1", data })
  const invalid = ["PRIVATE_CONTENT", "null", "{}", JSON.stringify({ version: 2, representation: "continuity-fork-input/v1", data: null }),
    JSON.stringify({ version: 1, representation: "continuity-fork-input/v1", data: null, extra: true }),
    envelope(["unknown", "PRIVATE_CONTENT"]), envelope(["undefined", 1]), envelope(["array"]),
    envelope(["object", [["same", 1], ["same", 2]]]), envelope(["object", [["key"]]]),
    envelope(["uint8array", "not base64"]), envelope(["arraybuffer", "AB=="]), envelope(["url", "PRIVATE_CONTENT"]),
    envelope(["date", "invalid"]), envelope(["object", []])]
  for (const payload of invalid) {
    expect(() => CheckpointContext.decode(payload)).toThrow(CheckpointContext.CaptureError)
    try { CheckpointContext.decode(payload) } catch (error) {
      expect(JSON.stringify(error)).not.toContain("PRIVATE_CONTENT")
    }
  }
})
