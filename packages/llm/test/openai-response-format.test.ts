import { describe, expect } from "bun:test"
import { Effect, Layer, Schema, Stream } from "effect"
import { HttpClientRequest } from "effect/unstable/http"
import { LLM, LLMEvent, ResponseFormat, ToolDefinition } from "../src"
import { Auth, LLMClient, RequestExecutor, WebSocketExecutor } from "../src/route"
import { OpenAIResponses } from "../src/protocols/openai-responses"
import { ProviderShared } from "../src/protocols/shared"
import { it } from "./lib/effect"
import { dynamicResponse, fixedResponse } from "./lib/http"
import { sseEvents } from "./lib/sse"

const schema = {
  type: "object",
  properties: {
    answer: { type: "string", description: "Exact answer" },
    evidence: { type: "array", items: { $ref: "#/$defs/evidence" } },
  },
  required: ["answer", "evidence"],
  additionalProperties: false,
  $defs: {
    evidence: {
      type: "object",
      properties: { source: { type: "string" } },
      required: ["source"],
      additionalProperties: false,
    },
  },
}
const format = { type: "json_schema", name: "response", strict: true, schema }
const tool = ToolDefinition.make({ name: "lookup", description: "Look up evidence", inputSchema: { type: "object" } })
const request = LLM.request({
  model: OpenAIResponses.route.with({ auth: Auth.none }).model({ id: "fixture-model" }),
  system: "Return evidence.",
  prompt: "Answer.",
  tools: [tool],
  toolChoice: "none",
  generation: { maxTokens: 100, temperature: 0, topP: 0.8 },
  providerOptions: {
    openai: {
      instructions: "Use supplied schema.",
      store: false,
      reasoningEffort: "low",
      reasoningSummary: "auto",
      include: ["reasoning.encrypted_content"],
      promptCacheKey: "format-fixture",
      serviceTier: "default",
    },
  },
})
const plainWire = {
  model: "fixture-model",
  input: [
    { role: "system", content: "Return evidence." },
    { role: "user", content: [{ type: "input_text", text: "Answer." }] },
  ],
  tools: [
    {
      type: "function",
      name: "lookup",
      description: "Look up evidence",
      parameters: { type: "object" },
      strict: false,
    },
  ],
  tool_choice: "none",
  instructions: "Use supplied schema.",
  store: false,
  reasoning: { effort: "low", summary: "auto" },
  include: ["reasoning.encrypted_content"],
  prompt_cache_key: "format-fixture",
  service_tier: "default",
  max_output_tokens: 100,
  temperature: 0,
  top_p: 0.8,
}

describe("OpenAI Responses native JSON format", () => {
  for (const verbosity of [undefined, "low", "high"] as const) {
    const input = LLM.updateRequest(request, {
      responseFormat: { type: "json", schema },
      providerOptions: {
        openai: { ...request.providerOptions?.openai, textVerbosity: verbosity },
      },
    })
    const text = verbosity ? { verbosity, format } : { format }

    it.effect(`HTTP encoder retains strict format with verbosity ${verbosity}`, () =>
      Effect.gen(function* () {
        const lowered = yield* OpenAIResponses.protocol.body.from(input)
        expect(lowered.text?.format?.schema).toBe(
          input.responseFormat?.type === "json" ? input.responseFormat.schema : undefined,
        )
        expect(lowered.text?.format?.schema).toEqual(schema)
        const prepared = yield* LLMClient.prepare<OpenAIResponses.OpenAIResponsesBody>(input)
        const http = yield* OpenAIResponses.route.prepareTransport(prepared.body, input)
        const web = yield* HttpClientRequest.toWeb(http.request).pipe(Effect.orDie)
        expect(web.method).toBe("POST")
        expect(decodeWire(yield* Effect.promise(() => web.text()))).toEqual({ ...plainWire, stream: true, text })
      }),
    )

    it.effect(`WebSocket encoder retains strict format with verbosity ${verbosity}`, () =>
      Effect.gen(function* () {
        const websocket = LLM.updateRequest(input, {
          model: OpenAIResponses.webSocketRoute.with({ auth: Auth.none }).model({ id: "fixture-model" }),
        })
        const sent: string[] = []
        const deps = Layer.mergeAll(
          Layer.succeed(
            RequestExecutor.Service,
            RequestExecutor.Service.of({ execute: () => Effect.die("unexpected HTTP request") }),
          ),
          Layer.succeed(
            WebSocketExecutor.Service,
            WebSocketExecutor.Service.of({
              open: () =>
                Effect.succeed({
                  sendText: (message) =>
                    Effect.sync(() => {
                      sent.push(message)
                    }),
                  messages: Stream.fromArray([
                    ProviderShared.encodeJson({ type: "response.completed", response: { id: "format-ws" } }),
                  ]),
                  close: Effect.void,
                }),
            }),
          ),
        )
        const response = yield* LLMClient.generate(websocket).pipe(
          Effect.provide(LLMClient.layer.pipe(Layer.provide(deps))),
        )
        expect(sent).toHaveLength(1)
        expect(decodeWire(sent[0])).toEqual({ ...plainWire, type: "response.create", text })
        expect(response.events.filter(LLMEvent.is.finish)).toHaveLength(1)
      }),
    )
  }

  for (const responseFormat of [undefined, { type: "text" }, { type: "tool", tool }] as const) {
    for (const verbosity of [undefined, "medium"] as const) {
      it.effect(`plain and alias wires stay unchanged for ${responseFormat?.type} / ${verbosity}`, () =>
        Effect.gen(function* () {
          const input = LLM.updateRequest(request, {
            responseFormat,
            providerOptions: { openai: { ...request.providerOptions?.openai, textVerbosity: verbosity } },
          })
          const expected = { ...plainWire, stream: true, ...(verbosity ? { text: { verbosity } } : {}) }
          const prepared = yield* LLMClient.prepare<OpenAIResponses.OpenAIResponsesBody>(input)
          const http = yield* OpenAIResponses.route.prepareTransport(prepared.body, input)
          const web = yield* HttpClientRequest.toWeb(http.request).pipe(Effect.orDie)
          expect(decodeWire(yield* Effect.promise(() => web.text()))).toEqual(expected)
          const alias = OpenAIResponses.route.with({
            id: "responses-alias",
            provider: "fixture-alias",
            auth: Auth.none,
          })
          const aliased = LLM.updateRequest(input, { model: alias.model({ id: "fixture-model" }) })
          const aliasBody = yield* LLMClient.prepare<OpenAIResponses.OpenAIResponsesBody>(aliased)
          const aliasHttp = yield* alias.prepareTransport(aliasBody.body, aliased)
          const aliasWeb = yield* HttpClientRequest.toWeb(aliasHttp.request).pipe(Effect.orDie)
          expect(decodeWire(yield* Effect.promise(() => aliasWeb.text()))).toEqual(expected)
          const ws = yield* OpenAIResponses.webSocketRoute.prepareTransport(prepared.body, input)
          const { stream: _stream, ...core } = expected
          expect(decodeWire(ws.message)).toEqual({ ...core, type: "response.create" })
        }),
      )
    }
  }

  for (const malformed of [
    { type: "json", schema: null },
    { type: "json", schema: [] },
    { type: "json", schema: "{}" },
    { type: "json" },
    { type: "json_schema", schema },
  ]) {
    it.effect(`canonical format rejects ${JSON.stringify(malformed)}`, () =>
      Effect.gen(function* () {
        // Structural decoding/classification only; this does not validate JSON Schema semantics.
        const decode = ProviderShared.validateWith(Schema.decodeUnknownEffect(ResponseFormat))
        const error = yield* decode(malformed).pipe(Effect.flip)
        expect(error.reason._tag).toBe("InvalidRequest")
        expect(error.reason.retryable).toBe(false)
      }),
    )
  }

  it.effect("provider HTTP 400 keeps existing InvalidRequest path without retry", () =>
    Effect.gen(function* () {
      const sent: string[] = []
      const input = LLM.updateRequest(request, {
        responseFormat: { type: "json", schema: { type: "object", unsupportedKeyword: true } },
      })
      const error = yield* LLMClient.generate(input).pipe(
        Effect.provide(
          dynamicResponse(({ text, respond }) =>
            Effect.sync(() => {
              sent.push(text)
              return respond('{"error":{"message":"Unsupported strict schema","type":"invalid_request_error"}}', {
                status: 400,
                headers: { "content-type": "application/json" },
              })
            }),
          ),
        ),
        Effect.flip,
      )
      expect(sent).toHaveLength(1)
      expect(decodeWire(sent[0])).toMatchObject({
        text: { format: { ...format, schema: { type: "object", unsupportedKeyword: true } } },
      })
      expect(error.reason).toMatchObject({ _tag: "InvalidRequest", http: { response: { status: 400 } } })
      expect(error.reason.message).toContain("Unsupported strict schema")
      expect(error.reason.retryable).toBe(false)
    }),
  )

  for (const transport of ["HTTP", "WebSocket"] as const) {
    for (const refusals of [
      [{ type: "response.refusal.delta", delta: "fake-sensitive-refusal" }],
      [{ type: "response.refusal.done", refusal: "fake-sensitive-refusal" }],
      [
        { type: "response.refusal.delta", delta: "" },
        { type: "response.refusal.done", refusal: "" },
      ],
      [
        { type: "response.refusal.delta", delta: "fake-sensitive-refusal" },
        { type: "response.refusal.done", refusal: "fake-sensitive-refusal" },
      ],
    ]) {
      for (const responseFormat of [
        { type: "json", schema },
        undefined,
        { type: "text" },
        { type: "tool", tool },
      ] as const) {
        it.effect(
          `${transport} mixed refusal ${refusals[0].type} / ${refusals.length} / ${"delta" in refusals[0] && refusals[0].delta === "" ? "empty" : "nonempty"} / ${responseFormat?.type}`,
          () =>
            Effect.gen(function* () {
              const text = '{"answer":"safe","evidence":[]}'
              const events = yield* streamFrames(
                LLM.updateRequest(request, { responseFormat }),
                [
                  { type: "response.output_text.delta", item_id: "json", delta: text },
                  ...refusals,
                  { type: "response.completed", response: { id: "refused" } },
                  { type: "response.output_text.delta", item_id: "late", delta: '{"accepted":true}' },
                ],
                transport,
              )
              expect(
                events
                  .filter(LLMEvent.is.textDelta)
                  .map((event) => event.text)
                  .join(""),
              ).toBe(text)
              expect(events.filter(LLMEvent.is.finish)).toMatchObject([{ reason: "stop" }])
              const errors = events.filter(LLMEvent.is.providerError)
              if (responseFormat?.type === "json") {
                expect(errors.length).toBeGreaterThan(0)
                for (const error of errors) {
                  expect(error).toMatchObject({ message: "Provider refused structured response", retryable: false })
                  expect(events.indexOf(error)).toBeLessThan(events.findIndex(LLMEvent.is.finish))
                }
              }
              // Compatibility: non-JSON requests still ignore refusal frames.
              if (responseFormat?.type !== "json") expect(errors).toEqual([])
              expect(ProviderShared.encodeJson(events)).not.toContain("fake-sensitive-refusal")
            }),
        )
      }
    }
    for (const reason of ["stop", "length"] as const) {
      it.effect(`${transport} normal JSON keeps ${reason} finish without provider error`, () =>
        Effect.gen(function* () {
          const text = reason === "stop" ? '{"answer":"safe","evidence":[]}' : '{"answer":'
          const terminal =
            reason === "stop"
              ? { type: "response.completed", response: { id: "normal" } }
              : { type: "response.incomplete", response: { incomplete_details: { reason: "max_output_tokens" } } }
          const events = yield* streamFrames(
            LLM.updateRequest(request, { responseFormat: { type: "json", schema } }),
            [{ type: "response.output_text.delta", item_id: "json", delta: text }, terminal],
            transport,
          )
          expect(
            events
              .filter(LLMEvent.is.textDelta)
              .map((event) => event.text)
              .join(""),
          ).toBe(text)
          expect(events.filter(LLMEvent.is.providerError)).toEqual([])
          expect(events.filter(LLMEvent.is.finish)).toMatchObject([{ reason }])
        }),
      )
    }
  }

  it.effect("malformed provider frame keeps InvalidProviderOutput classifier", () =>
    Effect.gen(function* () {
      const error = yield* LLMClient.generate(
        LLM.updateRequest(request, { responseFormat: { type: "json", schema } }),
      ).pipe(Effect.provide(fixedResponse(sseEvents({ type: "response.output_text.delta", delta: 12 }))), Effect.flip)
      expect(error.reason._tag).toBe("InvalidProviderOutput")
    }),
  )
})

const decodeWire = Schema.decodeUnknownSync(Schema.UnknownFromJsonString)

const streamFrames = (
  input: ReturnType<typeof LLM.request>,
  frames: ReadonlyArray<unknown>,
  transport: "HTTP" | "WebSocket",
) => {
  if (transport === "HTTP")
    return LLMClient.stream(input).pipe(Stream.runCollect, Effect.provide(fixedResponse(sseEvents(...frames))))
  const websocket = LLM.updateRequest(input, {
    model: OpenAIResponses.webSocketRoute.with({ auth: Auth.none }).model({ id: "fixture-model" }),
  })
  const deps = Layer.mergeAll(
    Layer.succeed(
      RequestExecutor.Service,
      RequestExecutor.Service.of({ execute: () => Effect.die("unexpected HTTP request") }),
    ),
    Layer.succeed(
      WebSocketExecutor.Service,
      WebSocketExecutor.Service.of({
        open: () =>
          Effect.succeed({
            sendText: () => Effect.void,
            messages: Stream.fromArray(frames.map((frame) => ProviderShared.encodeJson(frame))),
            close: Effect.void,
          }),
      }),
    ),
  )
  return LLMClient.stream(websocket).pipe(Stream.runCollect, Effect.provide(LLMClient.layer.pipe(Layer.provide(deps))))
}
