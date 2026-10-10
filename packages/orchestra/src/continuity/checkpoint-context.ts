import { asSchema, jsonSchema, type JSONSchema7, type Tool } from "ai"
import { Effect, Schema } from "effect"
import type { LLM } from "@/session/llm"
import { LLMPrepared } from "@/session/llm/prepared"

export class CaptureError extends Schema.TaggedErrorClass<CaptureError>()("ContinuityCheckpointError", {
  reason: Schema.String,
}) {}

const representation = "continuity-fork-input/v1"
const failures = new WeakSet<CaptureError>()
const callbacks = new Set(["execute", "toModelOutput", "onInputStart", "onInputDelta", "onInputAvailable", "needsApproval"])
const fields = new Set(["user", "sessionID", "parentSessionID", "model", "agent", "permission", "system", "messages",
  "small", "tools", "retries", "toolChoice", "responseSchema", "contextMemory", "purpose", "prepared", "preflightParams"])

/** Detached transport input, before SDK framing; not provider wire or executable replay authority. */
export const capture = Effect.fn("CheckpointContext.capture")(function* (input: LLM.StreamInput) {
  return yield* Effect.tryPromise({
    try: async () => {
      if (!record(input) || Object.keys(input).some((key) => !fields.has(key)) || !input.model || !input.user || !input.agent ||
        typeof input.sessionID !== "string" || !Array.isArray(input.system) || !Array.isArray(input.messages) || !record(input.tools))
        fail("invalid-request")
      properties(input)
      properties(input.tools)
      // The codec validates before structuredClone can erase unsupported prototypes or properties.
      const { tools, prepared, ...rest } = input
      const data = clone(rest)
      const definitions = Object.fromEntries(Object.entries(tools).map(([name, tool]) => {
        if (!record(tool)) fail("invalid-tool")
        properties(tool)
        const { inputSchema, outputSchema, ...rest } = tool
        const bindings = Object.fromEntries(Object.entries(rest).filter(([key, value]) => callbacks.has(key) && typeof value === "function"))
        const visible = clone(Object.fromEntries(Object.entries(rest).filter(([key, value]) => !callbacks.has(key) || typeof value !== "function")))
        return [name, { visible, bindings, input: materialize(inputSchema),
          output: outputSchema === undefined ? undefined : materialize(outputSchema) }]
      }))
      // All request data and schema handles are captured before the first await.
      // Data is already detached by the lossless codec. A second structuredClone is both
      // redundant and unable to preserve URL objects on supported Bun releases.
      const snapshot = { ...data, prepared, tools: Object.fromEntries(Object.entries(definitions).map(([name, tool]) =>
        [name, { ...tool.visible, ...tool.bindings, inputSchema: tool.input }])) }
      const [resolved, outputs] = await Promise.all([LLMPrepared.tools(snapshot.tools), Promise.all(
        Object.entries(definitions).map(async ([name, tool]) => [name, tool.output === undefined ? undefined :
          jsonSchema(clone(await tool.output.jsonSchema), { validate: tool.output.validate })] as const),
      ).then(Object.fromEntries)])
      const request: LLM.StreamInput = { ...snapshot, ...data, tools: Object.fromEntries(
        Object.entries(definitions).map(([name, tool]) => [name, { ...resolved[name], ...tool.visible, ...tool.bindings,
          ...(outputs[name] === undefined ? {} : { outputSchema: outputs[name] }) }]),
      ) }
      const capturedTools = Object.fromEntries(Object.entries(request.tools).map(([name, tool]) => [name, {
        ...definitions[name].visible,
        inputSchema: asSchema(tool.inputSchema).jsonSchema,
        ...(tool.outputSchema === undefined ? {} : { outputSchema: asSchema(tool.outputSchema).jsonSchema }),
      }]))
      const model = request.model
      const context = Object.fromEntries(Object.entries(request).filter(([key]) => key !== "tools" && key !== "prepared"))
      const payload = JSON.stringify({ version: 1, representation, data: encode({ ...context,
        model: { id: model.id, providerID: model.providerID, name: model.name, family: model.family,
          api: { id: model.api.id, npm: model.api.npm }, capabilities: model.capabilities, cost: model.cost,
          limit: model.limit, status: model.status, options: model.options, release_date: model.release_date, variants: model.variants },
        tools: capturedTools,
      }) })
      // Bindings (including validation and the prepared token) remain host-owned and confer no payload authority.
      freeze(data)
      Object.entries(request.tools).forEach(([name, tool]) => {
        freeze(definitions[name].visible)
        freeze(asSchema(tool.inputSchema).jsonSchema)
        if (tool.outputSchema !== undefined) freeze(asSchema(tool.outputSchema).jsonSchema)
        Object.freeze(tool)
      })
      Object.freeze(request.tools)
      return { request: Object.freeze(request), payload }
    },
    catch: (error) => error instanceof CaptureError && failures.has(error) ? error : new CaptureError({ reason: "capture-failed" }),
  })
})

/** Inspect data only. Closed envelope and explicit tags cannot instantiate host bindings. */
export function decode(payload: string): unknown {
  try {
    const envelope: unknown = JSON.parse(payload)
    if (!record(envelope) || Object.keys(envelope).sort().join(",") !== "data,representation,version" ||
      envelope.version !== 1 || envelope.representation !== representation) fail("invalid-envelope")
    const data = unpack(envelope.data)
    if (!record(data) || !record(data.model) || !record(data.user) || !record(data.agent) || !record(data.tools) ||
      !Array.isArray(data.messages) || !Array.isArray(data.system) || typeof data.sessionID !== "string" ||
      Object.keys(data).some((key) => !fields.has(key) || key === "prepared")) fail("invalid-context")
    return data
  } catch (error) {
    throw error instanceof CaptureError ? error : new CaptureError({ reason: "invalid-payload" })
  }
}

function materialize(input: Tool["inputSchema"]) {
  if (input === undefined || input === null) fail("invalid-schema")
  const schema = asSchema(input)
  const value = schema.jsonSchema
  // jsonSchema memoizes the lazy result, so snapshot/tools never re-run the original builder.
  if (value && typeof value === "object" && "then" in value && typeof value.then === "function") {
    const pending = Promise.resolve(value).then(schemaData)
    // Setup may fail synchronously on a different definition; that must not leak an unhandled rejection.
    void pending.catch(() => {})
    return jsonSchema(pending, { validate: schema.validate })
  }
  return jsonSchema(schemaData(value), { validate: schema.validate })
}

function schemaData(value: unknown): JSONSchema7 {
  if (!record(value)) fail("invalid-schema")
  return clone(value)
}

function freeze(value: unknown): void {
  if (!Array.isArray(value) && !record(value)) return
  Object.values(value).forEach(freeze)
  Object.freeze(value)
}

function clone<T>(value: T): T {
  return unpack(encode(value)) as T
}

function fail(reason: string): never {
  const error = new CaptureError({ reason })
  failures.add(error)
  throw error
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
}

// Every container is tagged: user keys/arrays can never collide with codec tags.
type Encoded = null | boolean | string | number | Encoded[]
function encode(value: unknown, seen = new Set<object>()): Encoded {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("nonfinite-number")
    return Object.is(value, -0) ? ["negative-zero"] : value
  }
  if (value === undefined) return ["undefined"]
  if (typeof value !== "object") fail("unsupported-value")
  if (seen.has(value)) fail("cyclic-value")
  seen.add(value)
  try {
    if (value instanceof URL && Object.getPrototypeOf(value) === URL.prototype) {
      if (Object.keys(value).length) fail("unsupported-property")
      return ["url", value.href]
    }
    if (value instanceof Date && Object.getPrototypeOf(value) === Date.prototype) {
      if (Reflect.ownKeys(value).length) fail("unsupported-property")
      if (!Number.isFinite(value.getTime())) fail("invalid-date")
      return ["date", value.toISOString()]
    }
    if (value instanceof ArrayBuffer && Object.getPrototypeOf(value) === ArrayBuffer.prototype) {
      if (Reflect.ownKeys(value).length) fail("unsupported-property")
      return ["arraybuffer", Buffer.from(value).toString("base64")]
    }
    if (value instanceof Uint8Array && Object.getPrototypeOf(value) === Uint8Array.prototype) {
      if (Reflect.ownKeys(value).length !== value.length) fail("unsupported-property")
      return ["uint8array", Buffer.from(value).toString("base64")]
    }
    if (Buffer.isBuffer(value) && Object.getPrototypeOf(value) === Buffer.prototype) {
      if (Reflect.ownKeys(value).length !== value.length) fail("unsupported-property")
      return ["buffer", value.toString("base64")]
    }
    if (!Array.isArray(value) && !record(value)) fail("unsupported-class")
    const keys = properties(value)
    if (Array.isArray(value)) {
      if (keys.length !== value.length || keys.some((key, index) => key !== String(index))) fail("unsupported-array")
      return ["array", value.map((item) => encode(item, seen))]
    }
    return ["object", Object.entries(value).map(([key, item]) => [key, encode(item, seen)])]
  } finally {
    seen.delete(value)
  }
}

function properties(value: object) {
  const keys = Reflect.ownKeys(value).filter((key) => !(Array.isArray(value) && key === "length"))
  if (keys.some((key) => typeof key !== "string" || !Object.getOwnPropertyDescriptor(value, key)?.enumerable ||
    !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key) ?? {}, "value"))) fail("unsupported-property")
  return keys
}

function unpack(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (!Array.isArray(value)) fail("invalid-tag")
  const [tag, data] = value
  if (tag === "undefined" && value.length === 1) return undefined
  if (tag === "negative-zero" && value.length === 1) return -0
  if (value.length !== 2) fail("invalid-tag")
  if (tag === "array" && Array.isArray(data)) return data.map(unpack)
  if (tag === "object" && Array.isArray(data)) {
    const keys = new Set<string>()
    return Object.fromEntries(data.map((entry) => {
      if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" || keys.has(entry[0])) fail("invalid-object")
      keys.add(entry[0])
      return [entry[0], unpack(entry[1])]
    }))
  }
  if (typeof data !== "string") fail("invalid-tag")
  if (tag === "url") {
    const url = new URL(data)
    if (url.href !== data) fail("invalid-url")
    return url
  }
  if (tag === "date") {
    const date = new Date(data)
    if (!Number.isFinite(date.getTime()) || date.toISOString() !== data) fail("invalid-date")
    return date
  }
  if (tag === "arraybuffer" || tag === "uint8array" || tag === "buffer") {
    const bytes = Uint8Array.from(Buffer.from(data, "base64"))
    if (Buffer.from(bytes).toString("base64") !== data) fail("invalid-binary")
    if (tag === "buffer") return Buffer.from(bytes)
    return tag === "arraybuffer" ? bytes.buffer : bytes
  }
  return fail("invalid-tag")
}

export * as CheckpointContext from "./checkpoint-context"
