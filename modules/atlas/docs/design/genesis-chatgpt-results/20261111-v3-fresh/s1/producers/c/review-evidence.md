# S1-L1-C exact review evidence
These are original contiguous source-byte excerpts at the pinned baseline. The surrounding prose identifies their role; code fences do not modify excerpt bytes. Line spans are inclusive and each span has its own SHA-256. A documentary excerpt proves what that document says, not that the described host behavior ran. No runtime or semantic pass is asserted.

## Artifact to excerpt map

| Artifact | Evidence groups |
| --- | --- |
| `s1.runtime.llm_turns.l1` | C01, C02, C03, C04 |
| `s1.runtime.llm_providers.l1` | C05, C06, C07, C08, C09, C10, C11 |
| `s1.runtime.llm_recording.l1` | C12, C13, C14, C36 |
| `s1.runtime.plugin.l1` | C15, C16, C17, C18 |
| `s1.runtime.codemode.l1` | C19, C20, C21, C22, C23, C24 |
| `s1.runtime.codemode_openapi.l1` | C25, C26, C27, C28 |
| `s1.runtime.effect_sqlite.l1` | C29, C30, C31, C32, C33 |
| `s1.runtime.http_recorder.l1` | C34, C35, C36, C37, C38, C39 |
| `s1.runtime.guides_intent.l1` | C11, C40, C41, C42, C43, C44 |
| `s1.runtime.maintenance_intent.l1` | C45, C46, C47, C48, C49 |

## C01 — Compile/prepare and terminal finish boundary
Artifacts: s1.runtime.llm_turns.l1.

Source `packages/llm/src/route/client.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `5f064512f9ff1b449137778440eb0fd6b86c8131`; full-source SHA-256 `d5dea2096bdab9ef55e1d9593d5eb5e05adf0c7c873b5cfc8671b73b322e37c1`.

Lines 341–390; excerpt SHA-256 `1c7c43321327f29d8c056968819d1ec57fe38f98e8f5130efde1cc41cdb1471f`.

~~~~text
// `compile` is the important boundary: it turns a common `LLMRequest` into a
// validated provider body plus transport-private prepared data, but does not
// execute transport.
const compile = Effect.fn("LLM.compile")(function* (request: LLMRequest) {
  const resolved = applyCachePolicy(resolveRequestOptions(request))
  const route = resolved.model.route

  const body = yield* route.body
    .from(resolved)
    .pipe(Effect.flatMap(ProviderShared.validateWith(Schema.decodeUnknownEffect(route.body.schema))))
  const prepared = yield* route.prepareTransport(body, resolved)

  return {
    request: resolved,
    route,
    body,
    prepared,
  }
})

const prepareWith = Effect.fn("LLMClient.prepare")(function* (request: LLMRequest) {
  const compiled = yield* compile(request)

  return new PreparedRequest({
    id: compiled.request.id ?? "request",
    route: compiled.route.id,
    protocol: compiled.route.protocol,
    model: compiled.request.model,
    body: compiled.body,
    metadata: { transport: compiled.route.transport.id },
  })
})

const streamRequestWith = (runtime: TransportRuntime) => (request: LLMRequest) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const compiled = yield* compile(request)
      return compiled.route.streamPrepared(compiled.prepared, compiled.request, runtime)
    }),
  )

const generateWith = (stream: Interface["stream"]) =>
  Effect.fn("LLM.generate")(function* (request: LLMRequest) {
    const state = yield* stream(request).pipe(Stream.runFold(LLMResponse.empty, LLMResponse.reduce))
    const response = LLMResponse.complete(state)
    if (response) return response
    return yield* ProviderShared.eventError(
      `${request.model.provider}/${request.model.route.id}`,
      "Provider stream ended without a terminal finish event",
    )
~~~~

## C02 — Dynamic schema identity versus Effect codecs
Artifacts: s1.runtime.llm_turns.l1.

Source `packages/llm/src/tool.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `11ed9854ca38a9ef648705d1091aaa35e1660da0`; full-source SHA-256 `5a15723f7efb2d01c49fff1fd510cd72ece0c7544a89b37622f4c6c151ff5103`.

Lines 165–196; excerpt SHA-256 `132f36c297776e836740edfa89648e193e7390779d3ad0ec0db0d23ec1ccd2a5`.

~~~~text
export function make(config: TypedToolConfig | DynamicToolConfig): AnyTool {
  if ("jsonSchema" in config) {
    return {
      description: config.description,
      parameters: Schema.Unknown as ToolSchema<unknown>,
      success: Schema.Unknown as ToolSchema<unknown>,
      execute: config.execute,
      toModelOutput: config.toModelOutput,
      toStructuredOutput: config.toStructuredOutput,
      _decode: Effect.succeed,
      _encode: Effect.succeed,
      _project: (parameters, callID, output) =>
        project(config.toModelOutput, config.toStructuredOutput, parameters, callID, output),
      _legacyResult: config.toModelOutput === undefined && config.toStructuredOutput === undefined,
      _definition: new ToolDefinition({
        name: "",
        description: config.description,
        inputSchema: config.jsonSchema,
        outputSchema: config.outputSchema,
      }),
    }
  }
  return {
    description: config.description,
    parameters: config.parameters,
    success: config.success,
    execute: config.execute,
    toModelOutput: config.toModelOutput,
    toStructuredOutput: config.toStructuredOutput,
    _decode: Schema.decodeUnknownEffect(config.parameters),
    _encode: Schema.encodeEffect(config.success),
    _project: (parameters, callID, output) =>
~~~~

## C03 — One-call dispatch and mapped tool failures
Artifacts: s1.runtime.llm_turns.l1.

Source `packages/llm/src/tool-runtime.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `d69bbb9d478ca532a1481e8d7502c8e5c2b55dc6`; full-source SHA-256 `da324a868e54e4f884ca4255ea8d8e34ee080d05daef0afbf11aebe3bdc18e1f`.

Lines 22–61; excerpt SHA-256 `3747d48ae40d5b6e3f001921c645eaa0e1265442fb99436c3a8a043b1932703a`.

~~~~text
/** Execute one canonical tool call without owning provider IO or continuation. */
export const dispatch = (tools: Tools, call: ToolCallPart): Effect.Effect<DispatchResult> => {
  const tool = tools[call.name]
  if (!tool) return Effect.succeed(result(call, { type: "error", value: `Unknown tool: ${call.name}` }))
  if (!tool.execute)
    return Effect.succeed(result(call, { type: "error", value: `Tool has no execute handler: ${call.name}` }))

  return decodeAndExecute(tool, call).pipe(
    Effect.map((value) => result(call, value)),
    Effect.catchTag("LLM.ToolFailure", (failure) =>
      Effect.succeed(result(call, { type: "error", value: failure.message }, failure.error)),
    ),
  )
}

const decodeAndExecute = (tool: AnyTool, call: ToolCallPart): Effect.Effect<ToolSettlement, ToolFailure> =>
  tool._decode(call.input).pipe(
    Effect.mapError((error) => new ToolFailure({ message: `Invalid tool input: ${error.message}` })),
    Effect.flatMap((decoded) =>
      tool.execute!(decoded, { id: call.id, name: call.name }).pipe(
        Effect.flatMap((value) =>
          tool._encode(value).pipe(
            Effect.mapError(
              (error) =>
                new ToolFailure({
                  message: `Tool returned an invalid value for its success schema: ${error.message}`,
                }),
            ),
          ),
        ),
        Effect.map((encoded) => {
          if (tool._legacyResult && ToolResultValue.is(encoded))
            return { result: encoded, output: ToolOutput.fromResultValue(encoded) }
          const output = tool._project(decoded, call.id, encoded)
          const result = ToolOutput.toResultValue(output)
          return result.type === "error" ? { result } : { result, output }
        }),
      ),
    ),
  )
~~~~

## C04 — Forced structured-object tool and decode refusal
Artifacts: s1.runtime.llm_turns.l1.

Source `packages/llm/src/llm.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `e4781d8608b0185c500866aae20fda8335640550`; full-source SHA-256 `974e8bbab37e712bc58df24f76db9f3d66faf00929ad0782d3ca16db4451c2a7`.

Lines 110–142; excerpt SHA-256 `4d4c58140e17632edee208947295cf87fe814bc84f43f78cbe27d74345091d18`.

~~~~text
const runGenerateObject = Effect.fn("LLM.generateObject")(function* (
  options: GenerateObjectBase,
  tool: ReturnType<typeof makeTool>,
) {
  const baseRequest = request(options)
  const generateRequest = LLMRequest.update(baseRequest, {
    tools: toDefinitions({ [GENERATE_OBJECT_TOOL_NAME]: tool }),
    toolChoice: ToolChoice.named(GENERATE_OBJECT_TOOL_NAME),
  })
  const response = yield* LLMClient.generate(generateRequest)
  const call = response.toolCalls.find(
    (event) => LLMEvent.is.toolCall(event) && event.name === GENERATE_OBJECT_TOOL_NAME,
  )
  if (!call || !LLMEvent.is.toolCall(call))
    return yield* new LLMError({
      module: "LLM",
      method: "generateObject",
      reason: new InvalidProviderOutputReason({
        message: `generateObject: model did not call the forced \`${GENERATE_OBJECT_TOOL_NAME}\` tool`,
      }),
    })
  const object = yield* tool._decode(call.input).pipe(
    Effect.mapError(
      (error) =>
        new LLMError({
          module: "LLM",
          method: "generateObject",
          reason: new InvalidProviderOutputReason({
            message: `generateObject: tool input failed schema decode: ${error.message}`,
          }),
        }),
    ),
  )
~~~~

## C05 — Protocol-owned overlay refusal and auth order
Artifacts: s1.runtime.llm_providers.l1.

Source `packages/llm/src/route/transport/http.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `acc52c6ea173c28f92247b0fd31d58ea688df7e5`; full-source SHA-256 `7f956da303ff5d0532498901845ee0e64a26fa78dd25697b229d3855c9483dd7`.

Lines 31–42; excerpt SHA-256 `a9026431e47853a4f9ecd179052f612c8af910736aa2dc1787df20eea89cf450`.

~~~~text
const PROTOCOL_BODY_OVERLAY_DENYLIST = new Set([
  "content",
  "contents",
  "frequencyPenalty",
  "frequency_penalty",
  "generationConfig",
  "inferenceConfig",
  "input",
  "maxTokens",
  "max_tokens",
  "messages",
  "model",
~~~~

Lines 59–85; excerpt SHA-256 `e5ef95aac6b7f5912987d84ec8719db46310cd536b358f3dd1d67d8e523ea836`.

~~~~text
  "toolChoice",
  "toolConfig",
  "tool_choice",
  "tool_config",
  "tools",
  "topK",
  "topP",
  "top_k",
  "top_p",
])

const forbiddenBodyOverlayKeys = (body: Record<string, unknown>) =>
  Object.keys(body).filter((key) => PROTOCOL_BODY_OVERLAY_DENYLIST.has(key))

const bodyWithOverlay = <Body>(body: Body, request: LLMRequest, encodeBody: (body: Body) => string) =>
  Effect.gen(function* () {
    if (request.http?.body === undefined) return { jsonBody: body, bodyText: encodeBody(body) }
    const forbiddenKeys = forbiddenBodyOverlayKeys(request.http.body)
    if (forbiddenKeys.length > 0)
      return yield* ProviderShared.invalidRequest(
        `http.body cannot overlay protocol-owned field(s): ${forbiddenKeys.join(", ")}`,
      )
    if (ProviderShared.isRecord(body)) {
      const overlaid = mergeJsonRecords(body, request.http.body) ?? {}
      return { jsonBody: overlaid, bodyText: ProviderShared.encodeJson(overlaid) }
    }
    return yield* ProviderShared.invalidRequest("http.body can only overlay JSON object request bodies")
~~~~

Lines 88–105; excerpt SHA-256 `c0e56ac91b292880a72b1186edb1d3823b0f7393339e94b11e2723d042756c43`.

~~~~text
export const jsonRequestParts = <Body>(input: JsonRequestInput<Body>) =>
  Effect.gen(function* () {
    const url = applyQuery(
      renderEndpoint(input.endpoint, { request: input.request, body: input.body }).toString(),
      input.request.http?.query,
    )
    const body = yield* bodyWithOverlay(input.body, input.request, input.encodeBody)
    const headers = yield* Auth.toEffect(input.auth)({
      request: input.request,
      method: "POST",
      url,
      body: body.bodyText,
      headers: Headers.fromInput({
        ...input.headers?.({ request: input.request }),
        ...input.request.http?.headers,
      }),
    })
    return { url, jsonBody: body.jsonBody, bodyText: body.bodyText, headers }
~~~~

## C06 — Retryable and nonretryable error classes
Artifacts: s1.runtime.llm_providers.l1.

Source `packages/llm/src/schema/errors.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `072e4e83892890ba48b25e45eb3cd2592afc9f86`; full-source SHA-256 `a1b34b20c32343aeece5d0da5e93896f7b1102b7a2cf4e1b65609d982ba5b159`.

Lines 74–131; excerpt SHA-256 `b1694b866675409c364e25c7720f5f8623762aeca05df84ceca1a3c3e0083ce7`.

~~~~text
export class RateLimitReason extends Schema.Class<RateLimitReason>("LLM.Error.RateLimit")({
  _tag: Schema.tag("RateLimit"),
  message: Schema.String,
  retryAfterMs: Schema.optional(Schema.Number),
  rateLimit: Schema.optional(HttpRateLimitDetails),
  providerMetadata: Schema.optional(ProviderMetadata),
  http: Schema.optional(HttpContext),
}) {
  get retryable() {
    return true
  }
}

export class QuotaExceededReason extends Schema.Class<QuotaExceededReason>("LLM.Error.QuotaExceeded")({
  _tag: Schema.tag("QuotaExceeded"),
  message: Schema.String,
  providerMetadata: Schema.optional(ProviderMetadata),
  http: Schema.optional(HttpContext),
}) {
  get retryable() {
    return false
  }
}

export class ContentPolicyReason extends Schema.Class<ContentPolicyReason>("LLM.Error.ContentPolicy")({
  _tag: Schema.tag("ContentPolicy"),
  message: Schema.String,
  providerMetadata: Schema.optional(ProviderMetadata),
  http: Schema.optional(HttpContext),
}) {
  get retryable() {
    return false
  }
}

export class ProviderInternalReason extends Schema.Class<ProviderInternalReason>("LLM.Error.ProviderInternal")({
  _tag: Schema.tag("ProviderInternal"),
  message: Schema.String,
  status: Schema.Number,
  retryAfterMs: Schema.optional(Schema.Number),
  providerMetadata: Schema.optional(ProviderMetadata),
  http: Schema.optional(HttpContext),
}) {
  get retryable() {
    return true
  }
}

export class TransportReason extends Schema.Class<TransportReason>("LLM.Error.Transport")({
  _tag: Schema.tag("Transport"),
  message: Schema.String,
  kind: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
  http: Schema.optional(HttpContext),
}) {
  get retryable() {
    return false
  }
~~~~

Source `packages/llm/src/route/executor.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `aaf189c0493309d998b1c8647f308aff57a6644e`; full-source SHA-256 `5d79a756e023054cfdd9995f4ff117cc0d2ee876ff7afb5eb9b27da6badc953c`.

Lines 355–364; excerpt SHA-256 `6ccd2640a5c96059626dc48c9cea3563616c398accb5ce67d6159fec4c6e3ba7`.

~~~~text
  retries = MAX_RETRIES,
  attempt = 0,
): Effect.Effect<A, LLMError, R> =>
  Effect.catchTag(effect, "LLM.Error", (error): Effect.Effect<A, LLMError, R> => {
    if (!error.retryable || retries <= 0) return Effect.fail(error)
    return retryDelay(error, attempt).pipe(
      Effect.flatMap((delay) => Effect.sleep(delay)),
      Effect.flatMap(() => retryStatusFailures(effect, retries - 1, attempt + 1)),
    )
  })
~~~~

## C07 — Text-only escaped chronological update fallback
Artifacts: s1.runtime.llm_providers.l1.

Source `packages/llm/src/protocols/shared.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `c14f52faccd472ae0f68f1a272a03d9e1310167c`; full-source SHA-256 `4d2bb4018b1bae0559474a7ad1ea679c9030f1277f7fb3f1cc4388579048c976`.

Lines 104–148; excerpt SHA-256 `ba56b7f405c43d12dbf204e1158ce78e072fbadae9f3cf46223b5b1e323867d7`.

~~~~text
 * Join the `text` field of a list of parts with newlines. Used by routes
 * that flatten system / message content arrays into a single provider string
 * (OpenAI Chat `system` content, OpenAI Responses `system` content, Gemini
 * `systemInstruction.parts[].text`).
 */
export const joinText = (parts: ReadonlyArray<{ readonly text: string }>) => parts.map((part) => part.text).join("\n")

const escapeSystemUpdateText = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")

/**
 * Stable fallback representation for chronological `Message.system(...)`
 * updates on routes that do not support that privileged role natively. The
 * wrapper remains visibly lower-authority user text, preserves the original
 * temporal position, and XML-escapes content so it cannot close the wrapper.
 */
export const wrapSystemUpdate = (parts: ReadonlyArray<{ readonly text: string }>) =>
  `<system-update>\n${escapeSystemUpdateText(joinText(parts))}\n</system-update>`

/**
 * Chronological system updates deliberately accept text only. Do not insert
 * raw retrieved, tool, or web content into privileged updates: keep untrusted
 * data in ordinary user/tool messages instead.
 */
export const systemUpdateText = Effect.fn("ProviderShared.systemUpdateText")(function* (
  route: string,
  message: LLMRequest["messages"][number],
) {
  const content: TextPart[] = []
  for (const part of message.content) {
    if (!supportsContent(part, ["text"])) return yield* unsupportedContent(route, "system", ["text"])
    content.push(part)
  }
  return content
})

/** Lower an unsupported privileged update into visible, in-order user text. */
export const wrappedSystemUpdate = Effect.fn("ProviderShared.wrappedSystemUpdate")(function* (
  route: string,
  message: LLMRequest["messages"][number],
) {
  const content = yield* systemUpdateText(route, message)
  return { type: "text" as const, text: wrapSystemUpdate(content), cache: content.at(-1)?.cache }
})

~~~~

## C08 — Anthropic model/placement and pending-tool boundary
Artifacts: s1.runtime.llm_providers.l1.

Source `packages/llm/src/protocols/anthropic-messages.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `1c0dcd32a4332261a1361010f2f314cbda4fda54`; full-source SHA-256 `7f9480cf92848569c0825726490582e1d627810fa46a58c3c474828cc65d0dd6`.

Lines 342–395; excerpt SHA-256 `80d5a6c94516fe1b83d4ff3b5b35bc31373cadb1e898da10b2eba6109acfc4b8`.

~~~~text
})

const lowerToolResultContent = Effect.fn("AnthropicMessages.lowerToolResultContent")(function* (part: ToolResultPart) {
  // Text / json / error results stay as a string for backward compatibility
  // with existing cassettes and provider expectations.
  if (part.result.type !== "content") return ProviderShared.toolResultText(part)
  // Preserve the narrowed array element type when compiled through a consumer package.
  const content: ReadonlyArray<ToolContent> = part.result.value
  return yield* Effect.forEach(content, lowerToolResultContentItem)
})

// Mid-conversation system messages are a native Claude API feature only for
// Opus 4.8. Other Anthropic models intentionally use the same visible wrapped-
// user fallback as non-Anthropic routes rather than sending a role they reject.
const supportsNativeSystemUpdates = (request: LLMRequest) => String(request.model.id) === "claude-opus-4-8"

const endsInServerToolUse = (message: LLMRequest["messages"][number]) => {
  const last = message.content.at(-1)
  return message.role === "assistant" && last?.type === "tool-call" && last.providerExecuted === true
}

const canUseNativeSystemUpdate = (messages: LLMRequest["messages"], index: number) => {
  const previous = messages[index - 1]
  const next = messages[index + 1]
  return (
    previous !== undefined &&
    previous.role !== "system" &&
    (previous.role === "user" || previous.role === "tool" || endsInServerToolUse(previous)) &&
    next?.role !== "system" &&
    (next === undefined || next.role === "assistant")
  )
}

const splitsLocalToolResults = (messages: LLMRequest["messages"], index: number) => {
  const pending = new Set<string>()
  for (const message of messages.slice(0, index)) {
    for (const part of message.content) {
      if (message.role === "assistant" && part.type === "tool-call" && part.providerExecuted !== true)
        pending.add(part.id)
      if (message.role === "tool" && part.type === "tool-result") pending.delete(part.id)
    }
  }
  return pending.size > 0
}

const lowerNativeSystemUpdate = Effect.fn("AnthropicMessages.lowerNativeSystemUpdate")(function* (
  message: LLMRequest["messages"][number],
  breakpoints: Cache.Breakpoints,
) {
  const content = yield* ProviderShared.systemUpdateText("Anthropic Messages", message)
  return {
    role: "system" as const,
    content: content.map((part) => ({
      type: "text" as const,
~~~~

Lines 408–422; excerpt SHA-256 `ebb2a3ceaded3cfc8fb383b79fe84468db55d6c829fc04bb7311f2d28a20eb55`.

~~~~text
  for (const [index, message] of request.messages.entries()) {
    if (message.role === "system") {
      if (splitsLocalToolResults(request.messages, index))
        return yield* invalid("Anthropic Messages system updates cannot split a local tool call from its tool result")
      if (supportsNativeSystemUpdates(request) && canUseNativeSystemUpdate(request.messages, index)) {
        messages.push(yield* lowerNativeSystemUpdate(message, breakpoints))
        continue
      }
      const part = yield* ProviderShared.wrappedSystemUpdate("Anthropic Messages", message)
      const block = { type: "text" as const, text: part.text, cache_control: cacheControl(breakpoints, part.cache) }
      const previous = messages.at(-1)
      if (previous?.role === "user")
        messages[messages.length - 1] = { role: "user", content: [...previous.content, block] }
      else messages.push({ role: "user", content: [block] })
      continue
~~~~

## C09 — Responses structured-output refusal
Artifacts: s1.runtime.llm_providers.l1.

Source `packages/llm/src/protocols/openai-responses.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `7281d1ba2fe664db26a0ff5fbf2cb0eb99aca503`; full-source SHA-256 `3f097c0228e1d579c602569292b443459dc802bc8b9f10387e66c0c67beda46e`.

Lines 911–919; excerpt SHA-256 `1a8c754bd2a5fb34ca819b62ed2a11bfdc5d27d8fac27d5d0d97bf8894dd52e4`.

~~~~text
const step = (state: ParserState, event: OpenAIResponsesEvent) => {
  // JSON-only refusals invalidate structured output without exposing provider text.
  if (state.json && (event.type === "response.refusal.delta" || event.type === "response.refusal.done"))
    return Effect.succeed(
      onProviderError(
        state,
        LLMEvent.providerError({ message: "Provider refused structured response", retryable: false }),
      ),
    )
~~~~

## C10 — Missing WebSocket service refuses the transport
Artifacts: s1.runtime.llm_providers.l1.

Source `packages/llm/src/route/transport/websocket.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `edb8aafa28922cbe1dda18c28367e0b3487297b7`; full-source SHA-256 `faf505cee9cb136244b6dd36db4209770243028f0fbd48bb2463e4b694a3a6e9`.

Lines 240–259; excerpt SHA-256 `1925b134518cbde49a6cd4b2a6787d985f03c9f215a4a6127979a566a0b85125`.

~~~~text
  frames: (prepared, _request, runtime) => {
    const webSocket = runtime.webSocket
    if (!webSocket) {
      return Stream.fail(
        transportError("json", "WebSocket JSON transport requires WebSocketExecutor.Service", {
          url: prepared.url,
          kind: "websocket",
        }),
      )
    }
    const decoder = new TextDecoder()
    return Stream.unwrap(
      Effect.gen(function* () {
        const connection = yield* Effect.acquireRelease(
          webSocket.open({ url: prepared.url, headers: prepared.headers }),
          (connection) => connection.close,
        )
        yield* connection.sendText(prepared.message)
        return connection.messages.pipe(Stream.map((message) => messageText(message, decoder)))
      }),
~~~~

## C11 — Guide distinguishes model-layer implementation and Core routing
Artifacts: s1.runtime.llm_providers.l1, s1.runtime.guides_intent.l1.

Source `docs/guides/models.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `1acc49061d975b65c05cb2c194cd612b802914d8`; full-source SHA-256 `5821a5ac3a5cc3090224989a2b94e32d80b55f4dbc6f3b296272b63e32c8d399`.

Lines 7–16; excerpt SHA-256 `8c1f668c2a789bc75b55d46d52fe60b27b6cf290e705e47a87bc7886bfa101a7`.

~~~~text
- About 30 built-in provider plugins. Model catalog from models.dev, with an offline snapshot built in. Reasoning level per model.

| Wire protocol | Routed by the session core |
| --- | --- |
| Anthropic Messages | Yes |
| OpenAI Responses | Yes |
| OpenAI-compatible chat | Yes |
| Bedrock Converse | Not yet (implemented in the model layer) |
| Gemini | Not yet (implemented in the model layer) |
| OpenAI Chat | Not yet (implemented in the model layer) |
~~~~

## C12 — Recording/replay skip and failure decisions
Artifacts: s1.runtime.llm_recording.l1.

Source `packages/llm/test/recorded-runner.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `49d44f554628b887d14f8a4141f8b53ce19f3a64`; full-source SHA-256 `948936a73c0cc7d455c71fba1cf65cd7b019ec46ef3f6394bda5fce7d7315ad4`.

Lines 48–101; excerpt SHA-256 `d01cd5b7edb6e83d015685d8277b3602d580fd4a2642364c82c3d4e8241a3696`.

~~~~text
    name: string,
    caseOptions: CaseOptions,
    body: RecordedBody<A, E2, R>,
    testOptions?: number | TestOptions,
  ) => {
    const cassette = cassetteName(input.options.prefix, name, caseOptions)
    if (cassettes.has(cassette)) throw new Error(`Duplicate ${input.duplicateLabel} "${cassette}"`)
    cassettes.add(cassette)
    const tags = unique([
      ...classifiedTags(input.options),
      ...classifiedTags({
        provider: caseOptions.provider,
        protocol: caseOptions.protocol,
        tags: caseOptions.tags,
      }),
    ])

    if (!matchesSelected({ prefix: input.options.prefix, name, cassette, tags }))
      return test.skip(name, () => {}, testOptions)

    const recording = process.env.RECORD === "true"
    if (recording) {
      if (missingEnv([...(input.options.requires ?? []), ...(caseOptions.requires ?? [])]).length > 0) {
        return test.skip(name, () => {}, testOptions)
      }
    } else if (Object.hasOwn(unrecorded, cassette)) {
      // A ledgered case is skipped until it is recorded; recording it makes the entry stale, which fails.
      if (!input.cassetteExists(cassette)) return test.skip(name, () => {}, testOptions)
      return test(name, () => {
        throw new Error(`${cassette} is recorded now; remove its entry from unrecorded in recorded-utils.ts`)
      }, testOptions)
    } else if (!input.cassetteExists(cassette)) {
      // Replay without a cassette used to skip, so a deleted or renamed cassette left its case green and unrun.
      return test(name, () => {
        throw new Error(`${cassette} has no cassette: record it with RECORD=true, or ledger it in unrecorded in recorded-utils.ts`)
      }, testOptions)
    }

    return testEffect(
      input.layer({
        cassette,
        tags,
        metadata: { ...input.options.metadata, ...caseOptions.metadata, tags },
        recording,
        options: input.options,
        caseOptions,
      }),
    ).live(name, body, testOptions)
  }

  const effect = <A, E2>(name: string, body: RecordedBody<A, E2, R>, testOptions?: number | TestOptions) =>
    run(name, {} as CaseOptions, body, testOptions)

  effect.with = <A, E2>(
~~~~

## C13 — Unrecorded ledger rationale and examples
Artifacts: s1.runtime.llm_recording.l1.

Source `packages/llm/test/recorded-utils.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `1c135ee695029626a5f06329c652231d7840481d`; full-source SHA-256 `b9646ce6055c37762760fe72a0b719ebc18f1eb3dd287e23618e0c850d97184d`.

Lines 51–90; excerpt SHA-256 `177f801d9e9f7c4fd8673d998496b16f1633da974475d79ce6861b1dff11f8d2`.

~~~~text

// Recorded cases that have no cassette yet, each with its reason. Replay fails a case whose cassette is missing unless
// it is here, and fails an entry here whose cassette now exists. Shrink-only: record a case (RECORD=true) and delete
// its entry. Until this ledger existed these cases skipped silently, so a deleted or renamed cassette looked green.
const renamed =
  "the case was renamed after recording: a cassette under its older name sits in the same prefix, unverified as matching this request; re-record"
const never = "never recorded: no cassette was committed for this case"
export const unrecorded: Record<string, string> = {
  "anthropic-messages/rejects-malformed-assistant-tool-order": renamed,
  "bedrock-converse-cache/writes-then-reads-cachepoint-on-identical-second-call": never,
  "openai-chat/openai-chat-gpt-4o-mini-text": renamed,
  "openai-chat/openai-chat-gpt-4o-mini-tool-call": renamed,
  "openai-chat/openai-chat-gpt-4o-mini-tool-loop": renamed,
  "openai-chat/openai-chat-gpt-4o-mini-image-tool-result": never,
  "openai-responses/openai-responses-gpt-5-5-text": renamed,
  "openai-responses/openai-responses-gpt-5-5-tool-call": renamed,
  "openai-responses/openai-responses-gpt-5-5-tool-loop": renamed,
  "openai-responses-websocket/openai-responses-websocket-gpt-4-1-mini-tool-loop": never,
  "anthropic-messages/anthropic-haiku-4-5-text": renamed,
  "anthropic-messages/anthropic-haiku-4-5-tool-call": renamed,
  "anthropic-messages/anthropic-opus-4-7-tool-loop": renamed,
  "gemini/gemini-2-5-flash-text": renamed,
  "gemini/gemini-2-5-flash-tool-call": renamed,
  "gemini/gemini-2-5-flash-image-tool-result": never,
  "xai/xai-grok-3-mini-text": never,
  "xai/xai-grok-3-mini-tool-call": never,
  "xai/xai-grok-4-3-tool-loop": never,
  "openai-compatible-chat/deepseek-chat-text": renamed,
  "openai-compatible-chat/togetherai-llama-3-3-70b-text": renamed,
  "openai-compatible-chat/togetherai-llama-3-3-70b-tool-call": renamed,
  "openai-compatible-chat/groq-llama-3-3-70b-text": renamed,
  "openai-compatible-chat/groq-llama-3-3-70b-tool-call": renamed,
  "openai-compatible-chat/groq-llama-3-3-70b-tool-loop": renamed,
  "openai-compatible-chat/openrouter-gpt-4o-mini-text": renamed,
  "openai-compatible-chat/openrouter-gpt-4o-mini-tool-call": renamed,
  "openai-compatible-chat/openrouter-gpt-4o-mini-tool-loop": renamed,
  "openai-compatible-chat/openrouter-gpt-5-5-tool-loop": renamed,
  "openai-compatible-chat/openrouter-claude-opus-4-7-tool-loop": renamed,
}

~~~~

## C14 — LLM fixture adapter uses internal recorder API
Artifacts: s1.runtime.llm_recording.l1.

Source `packages/llm/test/recorded-websocket.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `7da0ae3ba35f97eae8303b2662300d760acf9fd3`; full-source SHA-256 `f8effb3b935f690827339ddfd3adfdf059bea3e2a19d11094c0ea3e23ef42245`.

Lines 1–26; excerpt SHA-256 `f8effb3b935f690827339ddfd3adfdf059bea3e2a19d11094c0ea3e23ef42245`.

~~~~text
import { HttpRecorderInternal } from "@orchestra/http-recorder/internal"
import { Effect, Layer } from "effect"
import { WebSocketExecutor } from "../src/route"
import type { Service as WebSocketExecutorService } from "../src/route/transport/websocket"

const liveWebSocket = WebSocketExecutor.open

export const webSocketCassetteLayer = (
  cassette: string,
  input: { readonly metadata?: Record<string, unknown>; readonly mode: HttpRecorderInternal.RecordReplayMode },
): Layer.Layer<WebSocketExecutorService, never, HttpRecorderInternal.Cassette.Service> =>
  Layer.effect(
    WebSocketExecutor.Service,
    Effect.gen(function* () {
      const cassetteService = yield* HttpRecorderInternal.Cassette.Service
      const executor = yield* HttpRecorderInternal.makeWebSocketExecutor({
        name: cassette,
        mode: input.mode,
        metadata: input.metadata,
        cassette: cassetteService,
        live: { open: liveWebSocket },
        compareClientMessagesAsJson: true,
      })
      return WebSocketExecutor.Service.of(executor)
    }),
  )
~~~~

## C15 — Host binding, agent identity and metadata contract
Artifacts: s1.runtime.plugin.l1.

Source `packages/plugin/src/tool.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `cdf9a933f496db2a00907a4f388220715aec0097`; full-source SHA-256 `62423741f0e96fece2e8292e724774717c16f6cdc9ffbfcf1dd3a37d261a2c3c`.

Lines 3–42; excerpt SHA-256 `aee824009309162e7588cabce8035ffd1fdc18be7098bb7b67bcf864d45a9c1b`.

~~~~text
/** Host-owned invocation identity. Labels, model arguments and plugin metadata cannot grant authority. */
export type InvocationBinding = Readonly<{
  projectId: string
  directory: string
  worktree: string
  workspaceID?: string
  memberId: string
  executionSessionId: string
  authoritySessionId: string
  assistantMessageID: string
  callID: string
  taskId?: string
  /** Present only when this call runs inside a resumed Task: identifies that one resume (dispatching Session and Task call). */
  resumeRef?: string
}>

export type ToolContext = {
  sessionID: string
  messageID: string
  /** Optional for legacy hosts; native backend calls always carry both fields. */
  readonly callID?: string
  readonly binding?: InvocationBinding
  /** Display label of the executing agent. Users can rename it, so never route or authorize on it. */
  agent: string
  /** Stable id of the executing agent: the identity that routes, owns memory and holds permissions. */
  agentID: string
  /**
   * Current project directory for this session.
   * Prefer this over process.cwd() when resolving relative paths.
   */
  directory: string
  /**
   * Project worktree root for this session.
   * Useful for generating stable relative paths (e.g. path.relative(worktree, absPath)).
   */
  worktree: string
  abort: AbortSignal
  /** Await the returned Promise before relying on persisted progress. Fire-and-forget persistence is not guaranteed. */
  metadata(input: { title?: string; metadata?: { [key: string]: any } }): Promise<void> | void
  ask(input: AskInput): Promise<void>
~~~~

Lines 68–75; excerpt SHA-256 `2d68f65b549f951dcd91c1e1e6582049f4fea8c10282046b99fff16a5602afa9`.

~~~~text
export function tool<Args extends z.ZodRawShape>(input: {
  description: string
  args: Args
  execute(args: z.infer<z.ZodObject<Args>>, context: ToolContext): Promise<ToolResult>
}) {
  return input
}
tool.schema = z
~~~~

## C16 — Current context and scoped registration signatures
Artifacts: s1.runtime.plugin.l1.

Source `packages/plugin/src/v2/effect/context.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `9089334ee3bb2d0f909877acea0f85d145577930`; full-source SHA-256 `fdfb91252f21fc9bed98a3dc3e9d8d6a4650272bbad687989a0acf8c459c406c`.

Lines 12–22; excerpt SHA-256 `37cc6a894e2aea09a18c163ab63f48a9eb84efd140fe7b0092dbad4b3aebb764`.

~~~~text
export interface PluginContext {
  readonly options: PluginOptions
  readonly agent: AgentHooks & Reload
  readonly aisdk: AISDKHooks
  readonly catalog: CatalogHooks & Reload
  readonly command: CommandHooks & Reload
  readonly integration: IntegrationHooks & Reload
  readonly plugin: PluginDomain
  readonly reference: ReferenceHooks & Reload
  readonly skill: SkillHooks & Reload
}
~~~~

Source `packages/plugin/src/v2/effect/registration.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `dfe5626397645e9fbefd793d9f6b4a48974a36c0`; full-source SHA-256 `5f12992aee537e74e4ed49d82d5c0c7b4f7fd2c2131e319fdee9dfe83cea91a0`.

Lines 1–15; excerpt SHA-256 `5f12992aee537e74e4ed49d82d5c0c7b4f7fd2c2131e319fdee9dfe83cea91a0`.

~~~~text
import type { Effect, Scope } from "effect"

export interface Registration {
  readonly dispose: Effect.Effect<void>
}

export interface Reload {
  readonly reload: () => Effect.Effect<void>
}

export type Hooks<Spec> = {
  readonly [Name in keyof Spec]: (
    callback: (input: Spec[Name]) => Effect.Effect<void> | void,
  ) => Effect.Effect<Registration, never, Scope.Scope>
}
~~~~

## C17 — TUI compatibility and distinct client capability
Artifacts: s1.runtime.plugin.l1.

Source `packages/plugin/src/tui.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `df0eec88398ab435191810dc5e651b746561c512`; full-source SHA-256 `cdc7bc32e189f2924c79e587729458f7c39bac7d3be08b30637b7cf09e9a6d28`.

Lines 92–121; excerpt SHA-256 `5a97bfc2fc85e56fdfc4784819e6ae31179e3f2086e77e184b2b169e938d6f28`.

~~~~text

/**
 * Legacy `api.command` shape kept so v1 plugins can initialize. Remove in v2.
 *
 * @deprecated Use `api.keymap.registerLayer({ commands, bindings })` instead.
 */
export type TuiCommand = {
  title: string
  value: string
  description?: string
  category?: string
  keybind?: string
  suggested?: boolean
  hidden?: boolean
  enabled?: boolean
  slash?: {
    name: string
    aliases?: string[]
  }
  onSelect?: (dialog?: TuiDialogStack) => void | Promise<void>
}

/**
 * Legacy `api.command` API kept so v1 plugins can initialize. Remove in v2.
 *
 * @deprecated Use `api.keymap.registerLayer`, `api.keymap.dispatchCommand`, and
 * `api.keymap.dispatchCommand("command.palette.show")` instead.
 */
export type TuiCommandApi = {
  /** @deprecated Use `api.keymap.registerLayer({ commands, bindings })` instead. */
~~~~

Lines 647–671; excerpt SHA-256 `4afa7783be38c1ebc5036ac4eaffd00977564650d611ee2bfcda5e98fa818997`.

~~~~text
  readonly tuiConfig: Frozen<TuiConfigView>
  kv: TuiKV
  state: TuiState
  theme: TuiTheme
  client: ReturnType<typeof Orchestra.make>
  event: TuiEventBus
  renderer: CliRenderer
  slots: TuiSlots
  plugins: {
    list: () => ReadonlyArray<TuiPluginStatus>
    activate: (id: string) => Promise<boolean>
    deactivate: (id: string) => Promise<boolean>
    add: (spec: string) => Promise<boolean>
    install: (spec: string, options?: TuiPluginInstallOptions) => Promise<TuiPluginInstallResult>
  }
  lifecycle: TuiLifecycle
}

export type TuiPlugin = (api: TuiPluginApi, options: PluginOptions | undefined, meta: TuiPluginMeta) => Promise<void>

export type TuiPluginModule = {
  id?: string
  tui: TuiPlugin
  server?: never
}
~~~~

## C18 — V2 target plan is not current API documentation
Artifacts: s1.runtime.plugin.l1.

Source `packages/plugin/src/v2/effect/PLAN.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `889e8d056b5bdedaeec259c9f5976783c54ad789`; full-source SHA-256 `ea6fd6bce86efaf9f0d6976b0a6562b1ce62c37f60281a8cc72d22d73b0c28fb`.

Lines 1–16; excerpt SHA-256 `655f226d1a662c5759c7f5d2047ae4fbde498c52ee284adfa930c915e059a0ac`.

~~~~text
# V2 Plugin System Implementation Plan

## Status

This document describes the agreed target design for the V2 plugin system. It is an implementation plan, not documentation for the current API.

## Goals

- Internal and external plugins use the same public plugin API.
- Effect plugins import `@orchestra/plugin/v2/effect`, not `@orchestra/core`.
- Public domain values use `@orchestra/schema` types, never the legacy `@orchestra/sdk`.
- Core may retain branded IDs, decoded Effect schemas, and internal service types.
- Plugins may register replayable domain transforms and runtime hooks imperatively during setup.
- Registrations are scoped, independently disposable, ordered, and removable.
- Dynamic sources such as models.dev, config files, and skill directories can rebuild one domain without reloading the entire Location.
- The initial implementation covers the Effect API. A Promise API will be designed afterward as a wrapper over the same capabilities.
~~~~

## C19 — Limits have no defaults and invalid configuration throws
Artifacts: s1.runtime.codemode.l1.

Source `packages/codemode/src/codemode.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `14782d7c8aaed7b4647e64f6631459bdd4684a64`; full-source SHA-256 `3879f24437731883f423bf249e8cf13a4fda3f14a354fc42ab390877c53d7d0d`.

Lines 119–142; excerpt SHA-256 `c709fff954d94054c2a8c035e87041adf1f03864760c50753bd017080b1c2a50`.

~~~~text
const validateLimit = <Value extends number | undefined>(
  name: keyof ExecutionLimits,
  value: Value,
  minimum: number,
): Value => {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < minimum)) {
    throw new RangeError(`${name} must be a safe integer greater than or equal to ${minimum}.`)
  }
  return value
}

const resolveExecutionLimits = (limits?: ExecutionLimits): ResolvedExecutionLimits => ({
  timeoutMs: validateLimit("timeoutMs", limits?.timeoutMs, 1),
  maxToolCalls: validateLimit("maxToolCalls", limits?.maxToolCalls, 0),
  maxOutputBytes: validateLimit("maxOutputBytes", limits?.maxOutputBytes, 0),
})

/** Executes one Effect-native CodeMode program without constructing a reusable runtime. */
export const execute = <const Tools extends Record<string, unknown>>(
  options: ExecuteOptions<Tools>,
): Effect.Effect<Result, never, Services<Tools>> => {
  const tools = (options.tools ?? {}) as HostTools<Services<Tools>>
  ToolRuntime.assertValidTools(tools)
  return executeWithLimits(options, resolveExecutionLimits(options.limits), ToolRuntime.searchIndex(tools))
~~~~

## C20 — Effect validation versus render-only JSON Schema
Artifacts: s1.runtime.codemode.l1.

Source `packages/codemode/src/tool.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `6c6863f99dcf7e659a4e1a2b582095694404e39c`; full-source SHA-256 `e297f881d51f281d21376ce58cd30909aa0e69f8ec1b722334c09834d6f6a1bd`.

Lines 3–8; excerpt SHA-256 `9d51368503544a13e7ca94e348485ad9b6ecc66caa72e557057a8035f73a9dfe`.

~~~~text
/**
 * JSON Schema subset accepted for render-only tool schemas.
 *
 * A JSON-Schema-described side of a tool is used to generate the model-visible TypeScript
 * signature only - CodeMode performs no validation against it. This is the natural shape for
 * adapter-provided tools (e.g. MCP definitions) whose schemas arrive as JSON Schema documents.
~~~~

Lines 62–68; excerpt SHA-256 `62a9362ab3dee41cdad1b1a351e7adabfb47eea01cf62fc10751bde9e62b16d5`.

~~~~text
 * Defines one schema-described tool available to a CodeMode program through `tools.*`.
 *
 * `input` and `output` each accept a validating Effect Schema or a render-only JSON Schema
 * document. Effect Schema input is decoded before `run` is invoked, and `run` returns the
 * encoded representation of an Effect Schema `output`, which CodeMode decodes before returning
 * it to the program. JSON Schemas only shape the model-visible signature; values pass through
 * unvalidated. `output` is optional - without it the signature advertises `unknown` and the
~~~~

## C21 — Plain-object, cycle and blocked-property refusal
Artifacts: s1.runtime.codemode.l1.

Source `packages/codemode/src/tool-runtime.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `f4ccc61d4c49a4f7572906559e5a4e2a11acdec9`; full-source SHA-256 `4b10bd31a9c10104a0248e8f614cb7274c964eb8efddcce749382361bcd65d20`.

Lines 268–293; excerpt SHA-256 `b7486fa62d97a099a090992d95a21a591597c916ca875afa7f72a81e112367cb`.

~~~~text

  if (seen.has(value)) {
    throw new ToolRuntimeError("InvalidDataValue", `${label} contains a circular value.`)
  }

  seen.add(value)

  if (Array.isArray(value)) {
    const copied = value.map((item) => copyBounded(item, label, depth + 1, seen, preserveSandboxValues))
    seen.delete(value)
    return copied
  }

  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ToolRuntimeError("InvalidDataValue", `${label} must contain plain objects only.`)
  }

  const copied: SafeObject = Object.create(null) as SafeObject
  for (const [key, item] of Object.entries(value)) {
    if (isBlockedMember(key)) {
      throw new ToolRuntimeError("InvalidDataValue", `${label} contains blocked property '${key}'.`)
    }
    copied[key] = copyBounded(item, label, depth + 1, seen, preserveSandboxValues)
  }
  seen.delete(value)
~~~~

## C22 — Supervised calls, abandoned promises and fixed concurrency
Artifacts: s1.runtime.codemode.l1.

Source `packages/codemode/src/interpreter/runtime.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `093f577765100e95597919986f606010fd82066e`; full-source SHA-256 `7ee1e5c5b9c096b7d6b77e5ee7d3f9604d48e4964a33e40345a48746d08eb053`.

Lines 692–740; excerpt SHA-256 `22dfb7840014ef64e08bd0d034fd3ebb1efaae45d639884c46f120e3a390d1d5`.

~~~~text
      // The program body runs inside an implicit async function, so a returned promise
      // resolves before crossing the data boundary - `return tools.ns.tool(...)` works
      // without an explicit await, exactly as in JS.
      if (value instanceof SandboxPromise) value = yield* self.settlePromise(value)
      yield* self.drainPendingSettlements()
      return value
    }).pipe(Effect.ensuring(Effect.sync(() => self.popScope())))
  }

  // Awaits every fiber-backed promise the program abandoned (fire-and-forget tool calls), so
  // their work completes before the execution ends - mirroring a JS runtime waiting on
  // in-flight I/O at exit. A failure nobody could have handled becomes an unhandled-rejection
  // diagnostic (interrupted calls, e.g. Promise.race losers, are ignored).
  private drainPendingSettlements(): Effect.Effect<void, unknown, never> {
    const self = this
    return Effect.gen(function* () {
      for (const promise of [...self.pendingSettlements]) {
        const exit = yield* self.observePromise(promise)
        if (Exit.isSuccess(exit) || Cause.hasInterruptsOnly(exit.cause)) continue
        const failure = normalizeError(Cause.squash(exit.cause))
        throw new InterpreterRuntimeError(
          `Unhandled rejection from an un-awaited tool call: ${failure.message}`,
          undefined,
          failure.kind,
          ["Await tool calls - `const result = await tools.ns.tool(...)` - so failures can be caught and handled."],
        )
      }
    })
  }

  // Eagerly starts a tool call on a supervised child fiber (so the execution timeout and
  // scope teardown interrupt it) gated by the concurrency semaphore, and wraps the fiber in a
  // first-class promise value. `startImmediately` makes the runtime admit the call - charging
  // the tool-call budget and firing onToolCallStart - at the call site, before any await.
  private createToolCallPromise(
    path: ReadonlyArray<string>,
    args: Array<unknown>,
  ): Effect.Effect<SandboxPromise, never, R> {
    const self = this
    return Effect.map(
      Effect.forkChild(this.callPermits.withPermit(Effect.suspend(() => self.invokeTool(path, args))), {
        startImmediately: true,
      }),
      (fiber) => {
        const promise = new SandboxPromise(fiber)
        self.pendingSettlements.add(promise)
        return promise
      },
    )
~~~~

Source `packages/codemode/src/stdlib/promise.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `d0b442ccf74f2230e0e8cbe060b0be86a120ce6a`; full-source SHA-256 `ba9f90a9bb9c37feefbbc26b4cc28f259224a26fea193840162841d6fbe89609`.

Lines 1–6; excerpt SHA-256 `ba9f90a9bb9c37feefbbc26b4cc28f259224a26fea193840162841d6fbe89609`.

~~~~text
import type { PromiseMethodName } from "../interpreter/model.js"

export const promiseStatics = new Set<PromiseMethodName>(["all", "allSettled", "race", "resolve", "reject"])

/** Maximum number of eagerly forked tool calls that may run concurrently. */
export const TOOL_CALL_CONCURRENCY = 8
~~~~

## C23 — Host interruption and sanitized failure
Artifacts: s1.runtime.codemode.l1.

Source `packages/codemode/src/tool-runtime.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `f4ccc61d4c49a4f7572906559e5a4e2a11acdec9`; full-source SHA-256 `4b10bd31a9c10104a0248e8f614cb7274c964eb8efddcce749382361bcd65d20`.

Lines 143–150; excerpt SHA-256 `bb958aa24852c5761cccc19e4312e40702511a563079281945d88fbf37448b71`.

~~~~text
const runHost = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, ToolError, R> =>
  effect.pipe(
    Effect.catchCause((cause) => {
      if (Cause.hasInterruptsOnly(cause)) return Effect.interrupt
      const error = Cause.squash(cause)
      return Effect.fail(error instanceof ToolError ? error : toolError("Tool execution failed", error))
    }),
  )
~~~~

Source `packages/codemode/src/interpreter/runtime.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `093f577765100e95597919986f606010fd82066e`; full-source SHA-256 `7ee1e5c5b9c096b7d6b77e5ee7d3f9604d48e4964a33e40345a48746d08eb053`.

Lines 3394–3406; excerpt SHA-256 `57336d18d32488bd64c3a49db998dcbe59253e3f2fe1f21cdb90562ebc59e99a`.

~~~~text
  return operation.pipe(
    Effect.catchCause((cause) =>
      Cause.hasInterruptsOnly(cause)
        ? Effect.interrupt
        : Effect.succeed({
            ok: false,
            error: normalizeError(Cause.squash(cause)),
            ...logged(),
            toolCalls: tools.calls,
          } satisfies Result),
    ),
    Effect.map((result) => (limits.maxOutputBytes === undefined ? result : boundOutput(result, limits.maxOutputBytes))),
  )
~~~~

## C24 — Output payload truncation and added explanatory markers
Artifacts: s1.runtime.codemode.l1.

Source `packages/codemode/src/interpreter/runtime.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `093f577765100e95597919986f606010fd82066e`; full-source SHA-256 `7ee1e5c5b9c096b7d6b77e5ee7d3f9604d48e4964a33e40345a48746d08eb053`.

Lines 3420–3438; excerpt SHA-256 `b88ed2999bfedfe9d25029c7674535931b6bf04301644434b10c6567ccbfea36`.

~~~~text
/**
 * Bounds the model-facing output (serialized result value plus logs) to `maxOutputBytes`.
 * Oversized values are replaced by their truncated serialized text with an explanatory marker,
 * and logs are kept from the start until the remaining budget is exhausted. Truncation never
 * fails the execution; `truncated: true` marks affected results. Only runs when the host set
 * `maxOutputBytes` - with the limit absent, output passes through unbounded.
 */
const boundOutput = (result: Result, maxOutputBytes: number): Result => {
  let truncated = false

  let value: DataValue = null
  let valueBytes = 0
  if (result.ok) {
    const serialized = JSON.stringify(result.value) ?? "null"
    const bytes = utf8ByteLength(serialized)
    if (bytes > maxOutputBytes) {
      truncated = true
      value = `${utf8Truncate(serialized, maxOutputBytes)} [result truncated: ${bytes} bytes exceeds the ${maxOutputBytes}-byte output limit; return a smaller value]`
      valueBytes = maxOutputBytes
~~~~

Lines 3445–3465; excerpt SHA-256 `aba6ebc9592326edc16e4559ffec7e995f2d8176914ce6125235f74ad37db4b8`.

~~~~text
  const logs = result.logs ?? []
  const kept: Array<string> = []
  const logBudget = Math.max(0, maxOutputBytes - valueBytes)
  let logBytes = 0
  for (const line of logs) {
    const lineBytes = utf8ByteLength(line) + 1
    if (logBytes + lineBytes > logBudget) break
    logBytes += lineBytes
    kept.push(line)
  }
  if (kept.length < logs.length) {
    truncated = true
    kept.push(`[logs truncated: showing ${kept.length} of ${logs.length} lines]`)
  }

  if (!truncated) return result
  const logsPart = kept.length > 0 ? { logs: kept } : {}
  return result.ok
    ? { ok: true, value, ...logsPart, truncated: true, toolCalls: result.toolCalls }
    : { ok: false, error: result.error, ...logsPart, truncated: true, toolCalls: result.toolCalls }
}
~~~~

## C25 — Unsupported parameter encoding and invalid base URL
Artifacts: s1.runtime.codemode_openapi.l1.

Source `packages/codemode/src/openapi/spec.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `bd4dc5aed63e44d81e4976a7e2e374cc44c53d6d`; full-source SHA-256 `48840fc9c5426a199e18c4136aebc4a693bd4d6c71d78249ea0f9b9468b15ea8`.

Lines 128–154; excerpt SHA-256 `d35429c1f15e4f11a1d7187998908679099f2434d121804b7659951e86da695e`.

~~~~text
    if (location === "cookie") return { ok: false, reason: `cookie parameter '${name}' is not supported` }
    if (location !== "path" && location !== "query" && location !== "header") {
      return { ok: false, reason: `parameter '${name}' uses unsupported location '${location}'` }
    }
    if (location === "header" && ignoredHeaderParameters.has(name.toLowerCase())) continue
    if (resolved.schema === undefined && resolved.content === undefined) {
      return { ok: false, reason: `parameter '${name}' declares neither schema nor content` }
    }
    if (resolved.content !== undefined)
      return { ok: false, reason: `parameter '${name}' uses unsupported content encoding` }
    if (resolved.style !== undefined && nonEmptyString(resolved.style) === undefined) {
      return { ok: false, reason: `parameter '${name}' has an invalid style` }
    }
    if (resolved.explode !== undefined && typeof resolved.explode !== "boolean") {
      return { ok: false, reason: `parameter '${name}' has an invalid explode value` }
    }
    if (resolved.allowReserved !== undefined && typeof resolved.allowReserved !== "boolean") {
      return { ok: false, reason: `parameter '${name}' has an invalid allowReserved value` }
    }
    if (resolved.allowReserved === true)
      return { ok: false, reason: `parameter '${name}' uses unsupported allowReserved encoding` }
    const declaredStyle = nonEmptyString(resolved.style) ?? (location === "query" ? "form" : "simple")
    if (location === "query" && declaredStyle !== "form" && declaredStyle !== "deepObject") {
      return { ok: false, reason: `query parameter '${name}' uses unsupported style '${declaredStyle}'` }
    }
    if (location !== "query" && declaredStyle !== "simple") {
      return { ok: false, reason: `${location} parameter '${name}' uses unsupported style '${declaredStyle}'` }
~~~~

Lines 428–440; excerpt SHA-256 `a8a2be83206a84f0fca45117c1b4456c1e9381b7666521dfdd2fb4ba7602e594`.

~~~~text
export const validateBaseUrl = (value: string): Parsed<string> => {
  if (!/^https?:\/\//i.test(value)) return { ok: false, reason: `server URL '${value}' is not an absolute HTTP(S) URL` }
  const url = URL.parse(value)
  if (url === null || (url.protocol !== "http:" && url.protocol !== "https:")) {
    return { ok: false, reason: `server URL '${value}' is not an absolute HTTP(S) URL` }
  }
  if (url.search !== "" || url.hash !== "") {
    return { ok: false, reason: `server URL '${value}' contains an unsupported query string or fragment` }
  }
  return { ok: true, value }
}

export const securityRequirements = (value: unknown): Parsed<ReadonlyArray<SecurityRequirement>> => {
~~~~

## C26 — Host security alternatives and path refusals
Artifacts: s1.runtime.codemode_openapi.l1.

Source `packages/codemode/src/openapi/runtime.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `2515621792b22f23fa52967362ecf69828e21ee4`; full-source SHA-256 `aaf64bec2bccfebc7b52d590683cbdebd2397066659086d480509e1d09498c7d`.

Lines 116–153; excerpt SHA-256 `e21cf6e89a7a9863d40942c2cb63b0bb2601adaa6700107679b9142a0061a7fd`.

~~~~text
const resolveAuth = (plan: Plan): Effect.Effect<AppliedAuth, unknown> =>
  Effect.gen(function* () {
    const none: AppliedAuth = { headers: {}, query: {} }
    if (plan.security.length === 0) return none

    const unavailable: Array<string> = []
    alternatives: for (const requirement of plan.security) {
      const names = Object.keys(requirement)
      if (names.length === 0) return none
      const credentials: Array<readonly [string, SecurityScheme, Credential]> = []
      for (const name of names) {
        const scheme = own(plan.schemes, name)
        if (scheme === undefined || plan.auth === undefined) {
          unavailable.push(name)
          continue alternatives
        }
        const credential = yield* plan.auth.resolve({
          name,
          definition: scheme,
          scopes: requirement[name] ?? [],
          operation: plan.operation,
        })
        if (credential === undefined) {
          unavailable.push(name)
          continue alternatives
        }
        credentials.push([name, scheme, credential])
      }
      const applied = applyCredentials(credentials)
      return applied instanceof ToolError ? yield* Effect.fail(applied) : applied
    }

    return yield* Effect.fail(
      toolError(
        `${plan.operation.method} ${plan.operation.path} requires authentication; no credential available for: ${[...new Set(unavailable)].join(", ")}.`,
      ),
    )
  })
~~~~

Lines 210–225; excerpt SHA-256 `d5064d2e68478c8f9abfb367878daef3ea95bfd0826228cd5e047e8a0fe564dc`.

~~~~text
        /[!'()*]/g,
        (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
      ),
    )
    if (fieldValue instanceof ToolError) return fieldValue
    // '.'/'..' survive encoding and URL normalization collapses them, letting a
    // model-supplied value retarget the request to a different endpoint.
    if (fieldValue === "" || fieldValue === "." || fieldValue === "..") {
      return toolError(`Invalid path parameter '${field.inputName}'.`)
    }
    url = url.replaceAll(`{${field.name}}`, fieldValue)
  }
  const unresolved = url.match(/\{[^{}]+\}/)
  if (unresolved !== null) return toolError(`Unresolved path parameter ${unresolved[0]}.`)
  return url
}
~~~~

## C27 — Response body cap before and during reading
Artifacts: s1.runtime.codemode_openapi.l1.

Source `packages/codemode/src/openapi/runtime.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `2515621792b22f23fa52967362ecf69828e21ee4`; full-source SHA-256 `aaf64bec2bccfebc7b52d590683cbdebd2397066659086d480509e1d09498c7d`.

Lines 9–9; excerpt SHA-256 `e55908ef94ec6b294f5f048069d669f54bdf80cac78ca00de89d2f15b767ea45`.

~~~~text
const maxResponseBodyBytes = 50 * 1024 * 1024
~~~~

Lines 290–326; excerpt SHA-256 `cb090bcfa81383d09e2d6dea1b49e72c63821158eff24542567b65b5ed3c90cb`.

~~~~text
  plan: Plan,
): Effect.Effect<string, ToolError> =>
  Effect.gen(function* () {
    const contentLength = response.headers["content-length"]
    const parsedSize = contentLength === undefined ? undefined : Number.parseInt(contentLength, 10)
    const declaredSize =
      parsedSize !== undefined && Number.isSafeInteger(parsedSize) && parsedSize >= 0 ? parsedSize : undefined
    if (declaredSize !== undefined && declaredSize > maxResponseBodyBytes) {
      return yield* Effect.fail(toolError(`${plan.operation.method} ${plan.operation.path} response exceeds 50 MiB.`))
    }
    let body = Buffer.allocUnsafe(Math.min(maxResponseBodyBytes, declaredSize ?? 64 * 1024))
    let size = 0
    yield* Stream.runForEach(response.stream, (chunk) => {
      if (size + chunk.byteLength > maxResponseBodyBytes) {
        return Effect.fail(toolError(`${plan.operation.method} ${plan.operation.path} response exceeds 50 MiB.`))
      }
      if (size + chunk.byteLength > body.byteLength) {
        const grown = Buffer.allocUnsafe(
          Math.min(maxResponseBodyBytes, Math.max(size + chunk.byteLength, body.byteLength * 2)),
        )
        body.copy(grown, 0, 0, size)
        body = grown
      }
      body.set(chunk, size)
      size += chunk.byteLength
      return Effect.void
    }).pipe(
      Effect.catch((cause) => {
        if (cause instanceof ToolError) return Effect.fail(cause)
        if (cause.reason._tag === "EmptyBodyError") return Effect.void
        return Effect.fail(
          toolError(`${plan.operation.method} ${plan.operation.path} failed while reading the response body.`, cause),
        )
      }),
    )
    return new TextDecoder().decode(body.subarray(0, size))
  })
~~~~

## C28 — Documented unresolved OpenAPI boundaries
Artifacts: s1.runtime.codemode_openapi.l1.

Source `packages/codemode/src/openapi/TODO.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `cbcfe81a68c8df2fa7aae622ddf2997e3ab29433`; full-source SHA-256 `fd764b43f04fb0137b51ce7a5465408303bd4eeb007dacc8ced6fe0bfd4869fa`.

Lines 1–19; excerpt SHA-256 `fd764b43f04fb0137b51ce7a5465408303bd4eeb007dacc8ced6fe0bfd4869fa`.

~~~~text
# OpenAPI Follow-ups

The initial adapter intentionally skips operations it cannot execute correctly. Future work may add:

- Cookie parameters, authentication, and cookie-header merging.
- Matrix, label, space-delimited, pipe-delimited, `allowReserved`, and parameter `content` serialization.
- External references and complete nested `$defs` support.
- Relative or templated server URLs and server variables.
- Base URLs containing query strings or fragments.
- Runtime response-schema validation and full content negotiation.
- Binary response values and explicit byte-oriented return types.
- Request/response projection for `readOnly` and `writeOnly` properties.
- SSE, WebSocket, and other streaming transports.
- Recovery of responses rejected by a status-filtering `HttpClient`.
- Configurable request and response size limits.
- Adapter-enforced redirect policy independent of the supplied `HttpClient`.
- Strict UTF-8 and empty-body validation for JSON responses.
- Compile-time rejection of parameter schemas with nested values unsupported by their serialization style; runtime rejects them before auth resolution.
- Complete malformed-security-scheme validation and broader auth-combination coverage.
~~~~

## C29 — Transaction connection and cleanup control flow
Artifacts: s1.runtime.effect_sqlite.l1.

Source `packages/effect-drizzle-sqlite/src/effect-sqlite/session.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `e7b9d6b32cd835bdf54d70ba39e92a5839f26968`; full-source SHA-256 `4fa29583a6cbd148a5a8699dfd96d87944b2b04a559335c461a6e3635d7d9cf1`.

Lines 149–196; excerpt SHA-256 `9018c398410376943aae3a4549177c488777c7e2cd2d52aff864a69bedec65e3`.

~~~~text
            const transaction = this.executeTransactionStatement(
              connection,
              id === 0 ? `begin ${config?.behavior ?? "deferred"}` : `savepoint effect_sql_${id}`,
            ).pipe(
              Effect.flatMap(() =>
                Effect.provideContext(
                  restore(effect),
                  Context.add(services, this.client.transactionService, [connection, id]),
                ).pipe(
                  Effect.exit,
                  Effect.flatMap((exit) => {
                    return Effect.gen({ self: this }, function* () {
                      if (Exit.isSuccess(exit)) {
                        const committed = yield* Effect.exit(
                          this.executeTransactionStatement(
                            connection,
                            id === 0 ? "commit" : `release savepoint effect_sql_${id}`,
                          ),
                        )
                        if (Exit.isSuccess(committed)) return yield* exit
                        // Failed commits can leave SQLite transactions open, including fatal exits.
                        const rolledBack = yield* Effect.exit(
                          this.executeTransactionStatement(
                            connection,
                            id === 0 ? "rollback" : `rollback to savepoint effect_sql_${id}`,
                          ),
                        )
                        const failed = finalizedExit(committed, rolledBack)
                        if (id === 0) return yield* failed
                        const released = yield* Effect.exit(
                          this.executeTransactionStatement(connection, `release savepoint effect_sql_${id}`),
                        )
                        return yield* finalizedExit(failed, released)
                      }

                      const rolledBack = yield* Effect.exit(
                        this.executeTransactionStatement(
                          connection,
                          id === 0 ? "rollback" : `rollback to savepoint effect_sql_${id}`,
                        ),
                      )
                      const failed = finalizedExit(exit, rolledBack)
                      if (id === 0) return yield* failed
                      // A failed ROLLBACK TO must not prevent best-effort savepoint release.
                      const released = yield* Effect.exit(
                        this.executeTransactionStatement(connection, `release savepoint effect_sql_${id}`),
                      )
                      return yield* finalizedExit(failed, released)
~~~~

## C30 — Preserve every original and cleanup failure reason
Artifacts: s1.runtime.effect_sqlite.l1.

Source `packages/effect-drizzle-sqlite/src/effect-sqlite/session.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `e7b9d6b32cd835bdf54d70ba39e92a5839f26968`; full-source SHA-256 `4fa29583a6cbd148a5a8699dfd96d87944b2b04a559335c461a6e3635d7d9cf1`.

Lines 237–247; excerpt SHA-256 `71166a3ecb34c0675c3330841cda0ad498a74861816219383b6547aa15a0a1a4`.

~~~~text
function finalizedExit<A, E, E2>(original: Exit.Failure<A, E>, cleanup: Exit.Exit<unknown, E2>): Exit.Exit<never, E | E2>
function finalizedExit<A, E, E2>(original: Exit.Exit<A, E>, cleanup: Exit.Exit<unknown, E2>): Exit.Exit<A, E | E2>
function finalizedExit<A, E, E2>(original: Exit.Exit<A, E>, cleanup: Exit.Exit<unknown, E2>): Exit.Exit<A, E | E2> {
  if (Exit.isSuccess(cleanup)) return original
  // Cause.combine deduplicates equal reasons; distinct cleanup attempts must all survive.
  return Exit.failCause<E | E2>(
    Exit.isFailure(original)
      ? Cause.fromReasons<E | E2>([...original.cause.reasons, ...cleanup.cause.reasons])
      : cleanup.cause,
  )
}
~~~~

## C31 — Journal matching and unmatched-row refusal
Artifacts: s1.runtime.effect_sqlite.l1.

Source `packages/effect-drizzle-sqlite/src/up-migrations/sqlite.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `2887c66bed735cd812d885953335d8f99c6dad2a`; full-source SHA-256 `d4ac9eaf56892c0b18d66918da22412e3b2a96eac3ddb9433db619a328798828`.

Lines 59–90; excerpt SHA-256 `35ad55aaa3cf6cd35bb6c445158a126c367ce1c2dad66fd726bf0c66160fb23f`.

~~~~text
  for (const dbRow of dbRows) {
    const stringified = String(dbRow.created_at)
    const millis = Number(stringified.substring(0, stringified.length - 3) + "000")
    const candidates = byMillis.get(millis)

    const matchedByMillis = candidates?.length === 1 ? candidates[0] : undefined
    const matchedByCandidateHash =
      candidates && candidates.length > 1
        ? candidates.find((candidate) => candidate.hash && dbRow.hash && candidate.hash === dbRow.hash)
        : undefined
    const matchedByHash = matchedByMillis || matchedByCandidateHash ? undefined : byHash.get(dbRow.hash)
    const matched = matchedByMillis ?? matchedByCandidateHash ?? matchedByHash

    if (matched) {
      toApply.push({
        name: matched.name,
        selector:
          dbRow.id !== null
            ? { column: "id", value: dbRow.id }
            : matchedByMillis
              ? { column: "created_at", value: dbRow.created_at }
              : { column: "hash", value: dbRow.hash },
      })
      continue
    }

    unmatched.push(dbRow)
  }

  if (unmatched.length > 0) {
    throw unmatchedMigrationError(unmatched)
  }
~~~~

## C32 — Migration init refusal and transactional execution
Artifacts: s1.runtime.effect_sqlite.l1.

Source `packages/effect-drizzle-sqlite/src/sqlite-core/effect/session.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `15a56f2ca7d9fe73a1fdaaa244d3430fb74cd965`; full-source SHA-256 `54648e442841965faa98f12948903d3805207412d338bedbe460e27034114d82`.

Lines 452–489; excerpt SHA-256 `9927db39f3261591fe1fcf81d992f062519ea78fcd1fd112aa1b5413345099f6`.

~~~~text
  if (typeof config === "object" && config.init) {
    if (dbMigrations.length) {
      return yield* new MigratorInitError({ exitCode: "databaseMigrations" })
    }

    if (migrations.length > 1) {
      return yield* new MigratorInitError({ exitCode: "localMigrations" })
    }

    const [migration] = migrations
    if (!migration) return

    yield* session.run(
      sql`insert into ${sql.identifier(
        migrationsTable,
      )} ("hash", "created_at", "name", "applied_at") values(${migration.hash}, ${migration.folderMillis}, ${migration.name}, ${new Date().toISOString()})`,
    )

    return
  }

  const migrationsToRun = getMigrationsToRun({ localMigrations: migrations, dbMigrations })
  if (migrationsToRun.length === 0) return

  yield* session.transaction((tx) =>
    Effect.gen(function* () {
      for (const migration of migrationsToRun) {
        for (const stmt of migration.sql) {
          yield* tx.run(sql.raw(stmt))
        }
        yield* tx.run(
          sql`insert into ${sql.identifier(
            migrationsTable,
          )} ("hash", "created_at", "name", "applied_at") values(${migration.hash}, ${migration.folderMillis}, ${migration.name}, ${new Date().toISOString()})`,
        )
      }
    }),
  )
~~~~

## C33 — Node constructor, unsupported stream and documented usage limit
Artifacts: s1.runtime.effect_sqlite.l1.

Source `packages/effect-sqlite-node/src/index.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `fe8d67b91b7c8a9fc977eba61f14de94db22fabf`; full-source SHA-256 `61aabb392d528e09553383961a52a4055dbcdbbde01c1a19ed608abddf1ae679`.

Lines 59–70; excerpt SHA-256 `359fffbd5ef364795779a38a7da107a4cdc313c8dff68854abfaea09b53f6133`.

~~~~text
      const db = new DatabaseSync(options.filename, {
        readOnly: options.readonly,
        timeout: options.timeout,
        allowExtension: options.allowExtension,
        enableForeignKeyConstraints: true,
        open: true,
      })
      yield* Effect.addFinalizer(() => Effect.sync(() => db.close()))

      if (options.disableWAL !== true && options.readonly !== true) {
        db.exec("PRAGMA journal_mode = WAL;")
      }
~~~~

Lines 113–121; excerpt SHA-256 `6bce7b7b925a01bfdb3f0eacd130805ea5683fee63f1f49a7872c8768af28b47`.

~~~~text
          return runValues(sql, params)
        },
        executeUnprepared(sql, params, transformRows) {
          return this.execute(sql, params, transformRows)
        },
        executeStream() {
          return Stream.die("executeStream not implemented")
        },
        loadExtension: (path) =>
~~~~

Source `packages/effect-sqlite-node/README.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `5b1aa3d802989d35580a1f9fc970d9a3b3958892`; full-source SHA-256 `1cbb59b5444a8836281356a9371dea7512e69691830ce6e1e361549b18d790b6`.

Lines 3–13; excerpt SHA-256 `78e8f3e964d4d7a205d9ec0e0f3ee3511485e6446932c58e651f7cfb206f8e12`.

~~~~text
Effect SQLite client for Node runtimes that nothing in the repository imports.

## Purpose and ownership

- One module, `packages/effect-sqlite-node/src/index.ts`, exporting `NodeSqliteClient`: `make`, `layer`, and the `SqliteClient` service and config types. It wraps `node:sqlite` as an Effect `SqlClient`.
- Nothing uses it today. Core opens its database through `packages/core/src/database/sqlite.node.ts`, which carries its own `node:sqlite` client.

## Public entry points and consumers

- Export `.`.
- No importers in the repository; `packages/core` lists it as a dependency without importing it.
~~~~

## C34 — Auto-mode and unused-interaction exception
Artifacts: s1.runtime.http_recorder.l1.

Source `tooling/http-recorder/src/recorder.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `c58afde4633ce7c77939650dce276b8710fe6955`; full-source SHA-256 `0a5127e617a6c1c2175600318fe22ab7c1188659c277f4cfc16c36809a9d6a76`.

Lines 6–18; excerpt SHA-256 `a7754c18cf377c60719c857b9b9a98784c35daaaf50d3a6d27326571362bd0ed`.

~~~~text
const isCI = () => {
  const value = process.env.CI
  return value !== undefined && value !== "" && value !== "false" && value !== "0"
}

export const resolveAutoMode = (
  cassette: CassetteService.Interface,
  name: string,
): Effect.Effect<"record" | "replay" | "passthrough"> =>
  Effect.gen(function* () {
    if (isCI()) return "replay"
    return (yield* cassette.exists(name)) ? "replay" : "record"
  })
~~~~

Lines 35–58; excerpt SHA-256 `eb9985f9ec4b43b4ace9f7bd07b2cf4d3ab94a1ac7f22aa970129940b04da4ef`.

~~~~text
    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        const used = yield* SynchronizedRef.get(position)
        if (used === 0) return yield* Effect.void
        const interactions = yield* load.pipe(Effect.orDie)
        if (used < interactions.length)
          return yield* Effect.die(
            new Error(`Unused recorded interactions in ${name}: used ${used} of ${interactions.length}`),
          )
        return yield* Effect.void
      }),
    )

    return {
      claim: (validate) =>
        Effect.flatMap(load, (interactions) =>
          SynchronizedRef.modifyEffect(position, (index) =>
            Effect.gen(function* () {
              const interaction = interactions[index]
              yield* validate(interaction, index, interactions)
              if (interaction === undefined)
                return yield* Effect.die("Replay validation accepted a missing interaction")
              return [{ interaction, index }, index + 1] as const
            }),
~~~~

## C35 — Replay delegates exact sequential matching
Artifacts: s1.runtime.http_recorder.l1.

Source `tooling/http-recorder/src/internal-effect.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `6b886311a99548188be8ab4086dc30be49bf6846`; full-source SHA-256 `06b7522ec87f00c79ea9045e3570921de90ef910c740e7c757faf12836fa1c2d`.

Lines 156–178; excerpt SHA-256 `2b660ab6b580940f5d9a491a82493f8500549a9bb29a678c49ef46e3b1454f16`.

~~~~text
      const replay = yield* makeReplayState(cassetteService, name, httpInteractions)
      return HttpClient.make((request) =>
        Effect.gen(function* () {
          const incoming = yield* snapshotRequest(request)
          const claimed = yield* replay
            .claim((interaction, index, interactions) => {
              const result = selectSequential(interactions, incoming, match, index)
              if (result.interaction) return Effect.void
              return Effect.fail(
                transportError(request, `Fixture "${name}" does not match the current request: ${result.detail}.`),
              )
            })
            .pipe(
              Effect.mapError((error) =>
                error._tag === "CassetteNotFoundError"
                  ? transportError(
                      request,
                      `Fixture "${name}" not found. Run locally to record it (CI=true forces replay).`,
                    )
                  : error,
              ),
            )
          return responseFromSnapshot(request, claimed.interaction.response)
~~~~

## C36 — Internal executor separates server/client event lists
Artifacts: s1.runtime.http_recorder.l1, s1.runtime.llm_recording.l1.

Source `tooling/http-recorder/src/websocket.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `869cd3bf90e0df8140eb2e708e0728d197415311`; full-source SHA-256 `cb0ba77ff4b848cab63e7df6a033c12baa0ee96f67b49126b3692eb87965f772`.

Lines 138–169; excerpt SHA-256 `1aca488ea808578f3cbe445c7cb6d88638be6e3ac222cdc06fc43e647d0ee8d1`.

~~~~text
    const replay = yield* makeReplayState(options.cassette, options.name, webSocketInteractions)
    return {
      open: (request) =>
        Effect.gen(function* () {
          const claimed = yield* replay
            .claim((interaction, index) =>
              Effect.sync(() => {
                const incoming = canonicalizeJson(openSnapshot(request))
                if (interaction && JSON.stringify(incoming) === JSON.stringify(canonicalizeJson(interaction.open)))
                  return
                throw new Error(`WebSocket open ${index + 1} does not match ${safeText(incoming)}`)
              }),
            )
            .pipe(Effect.orDie)
          const client = claimed.interaction.events.filter((event) => event.direction === "client")
          const server = claimed.interaction.events.filter((event) => event.direction === "server")
          const position = yield* SynchronizedRef.make(0)
          return {
            sendText: (message) =>
              SynchronizedRef.updateEffect(position, (index) =>
                assertClientEvent(message, client[index], index, options.compareClientMessagesAsJson === true).pipe(
                  Effect.as(index + 1),
                ),
              ),
            messages: Stream.fromIterable(server).pipe(Stream.map(decodeEvent)),
            close: Effect.gen(function* () {
              const used = yield* SynchronizedRef.get(position)
              if (used !== client.length)
                return yield* Effect.die(
                  new Error(`WebSocket client frame count: expected ${client.length}, received ${used}`),
                )
            }),
~~~~

## C37 — Lexical path and prewrite secret refusal
Artifacts: s1.runtime.http_recorder.l1.

Source `tooling/http-recorder/src/cassette.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `cefc3fbc703db1f8e4dceb1cf9249f900dadd08a`; full-source SHA-256 `e023331feff17778547ae4d42387ce9a7147ddc40e01b2464b7fddc8ea4ae4f0`.

Lines 41–49; excerpt SHA-256 `aee669cba54260df2a4cbb21fd6a730f7ddfbd923cc845e2feb8fcde37dc18cf`.

~~~~text
const cassettePath = (directory: string, name: string) => {
  if (!name || path.isAbsolute(name) || path.win32.isAbsolute(name) || name.split(/[\\/]/).includes(".."))
    throw new Error(`Invalid cassette name "${name}"`)
  const root = path.resolve(directory)
  const target = path.resolve(root, `${name}.json`)
  const relative = path.relative(root, target)
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
    throw new Error(`Invalid cassette name "${name}"`)
  return target
~~~~

Lines 104–121; excerpt SHA-256 `1a0e33d82ad5797b7685eb2a0fc3ff6bfd37d0629749939965b519790fa546f1`.

~~~~text
        append: (name, interaction, metadata) =>
          appendLock.withPermit(
            Effect.gen(function* () {
              const entry = recorded.get(name) ?? { interactions: [], findings: [] }
              const interactions = [...entry.interactions, interaction]
              const interactionFindings = [...entry.findings, ...secretFindings(interaction)]
              const cassette = buildCassette(name, interactions, metadata)
              const findings = [...interactionFindings, ...secretFindings(cassette.metadata ?? {})]
              yield* failIfUnsafe(name, findings)
              const target = pathFor(name)
              yield* fs.makeDirectory(path.dirname(target), { recursive: true }).pipe(Effect.orDie)
              const temporary = `${target}.${crypto.randomUUID()}.tmp`
              yield* fs.writeFileString(temporary, formatCassette(cassette)).pipe(
                Effect.flatMap(() => fs.rename(temporary, target)),
                Effect.ensuring(fs.remove(temporary, { force: true }).pipe(Effect.catch(() => Effect.void))),
                Effect.orDie,
              )
              recorded.set(name, { interactions, findings: interactionFindings })
~~~~

## C38 — Public replay advances through interleaved traffic
Artifacts: s1.runtime.http_recorder.l1.

Source `tooling/http-recorder/src/socket.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `c7486db4aa29bc88bd48eaa17890286670cb575d`; full-source SHA-256 `92a6e20bdf6d056f0bcbbc861b508db62a5accc5a8c0659f140b15dad5086228`.

Lines 74–108; excerpt SHA-256 `2eff487d671511a22e62f1e57ef0c314e2e361c5f128b9b3b2d8e3c559e788f0`.

~~~~text
const runReplay = <A, E, R>(
  state: ActiveReplay,
  handler: (value: A) => Effect.Effect<unknown, E, R> | void,
  decode: (event: WebSocketEvent) => A,
  onOpen: Effect.Effect<void> | undefined,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const handlers = yield* FiberSet.make<unknown, E>()
      const run = yield* FiberSet.runtime(handlers)<R>()
      if (onOpen) yield* onOpen

      const drive = Effect.gen(function* () {
        while (true) {
          const current = yield* Ref.get(state.progress)
          const event = state.interaction.events[current.position]
          if (!event) return
          if (yield* Ref.get(state.closed))
            return yield* Effect.die(
              new Error(
                `WebSocket closed with unconsumed events: used ${current.position} of ${state.interaction.events.length}`,
              ),
            )
          if (event.direction === "server") {
            yield* Ref.set(state.progress, {
              position: current.position + 1,
              changed: yield* Deferred.make<void>(),
            })
            run(runHandler(handler, decode(event)))
            continue
          }
          yield* Deferred.await(current.changed)
        }
      })

~~~~

Lines 236–244; excerpt SHA-256 `cc6b1e0d9deeffb7f7b4c0701a2277ba90539ad273a07a2c500bc068ac73c95b`.

~~~~text
            writeLock,
            closed: yield* Ref.make(false),
          }
          const occupied = yield* Ref.modify(active, (current) => [current !== undefined, current ?? state])
          if (occupied) return yield* Effect.die("Concurrent runs of a replayed WebSocket are not supported")
          yield* runReplay(state, handler, decodeEvent, runOptions?.onOpen).pipe(
            Effect.ensuring(Ref.set(active, undefined)),
          )
        }),
~~~~

## C39 — Pack removes internal export and rewrites public paths
Artifacts: s1.runtime.http_recorder.l1.

Source `tooling/http-recorder/script/pack.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `746d7aaebd8af9117eebed109689d6751b87f1a4`; full-source SHA-256 `faa507f536a28130f49010ad52e88aafbc0e32017a3d644d1e4765e8461addd6`.

Lines 16–28; excerpt SHA-256 `31562c73e56aef10cd3de991a72501ece0534b52f900a3d39514df6468276251`.

~~~~text

  for (const [key, value] of Object.entries(pkg.exports)) {
    if (key === "./internal") {
      delete pkg.exports[key]
      continue
    }
    if (typeof value !== "string") continue
    const file = value.replace("./src/", "./dist/").replace(/\.ts$/, "")
    pkg.exports[key] = { import: `${file}.js`, types: `${file}.d.ts` }
  }
  await Bun.write("package.json", JSON.stringify(pkg, null, 2))
  try {
    await $`bun pm pack`
~~~~

## C40 — Global-only project trust and API path refusal are guide claims
Artifacts: s1.runtime.guides_intent.l1.

Source `docs/guides/mcp-project-trust.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `da47586309cc0c24ca4b7427b358c3706b648a46`; full-source SHA-256 `712b0e470369f8a261b91d2ae96991fee0dfdcfca221fd66f2ff79aa2a58a9e1`.

Lines 3–14; excerpt SHA-256 `e484a6adde5ad46c152ca6c11e269d12f2690760744c551416f42748588cca0a`.

~~~~text
A project can declare code to run in its own config (`orchestra.json`, `orchestra.jsonc`, or the same files under `.orchestra/`). A cloned repository could use that to run anything on your machine. So none of the following run until you approve the project:

- local MCP servers (a command);
- plugins: the `plugins` list in the project config, and plugin files in `.orchestra/plugin/` or `.orchestra/plugins/`;
- `formatter` entries of the project config (a formatter is a command);
- `lsp` entries of the project config (a language server is a command).

When the project is not approved, the project's formatter and LSP settings are ignored as a whole (the built-in defaults and your own config still apply), and a warning in the log says so.

Remote MCP servers (a URL), and anything declared in your own global config, are not affected.

Trust only folders you wrote or reviewed. Do not approve a project just to make a banner go away.
~~~~

Lines 48–60; excerpt SHA-256 `e42138781f6e88ef9a41702a8ace3757d2979cb38d81162a792811abefdf845e`.

~~~~text
The server refuses a folder that does not exist, a file, a relative path and the filesystem root.

## Alternative: edit the config by hand

`trusted_projects` is a list of absolute paths in your global config (`orchestra.json` in your Orchestra config folder). A project is approved when its folder is one of the listed paths or inside one. Listing a parent folder approves every project under it.

```json
{
  "trusted_projects": ["/Users/you/work/my-project", "/Users/you/trusted-code"]
}
```

Only the global config counts. A `trusted_projects` entry in a project's own config is ignored, so a repository cannot approve itself.
~~~~

## C41 — Permission reply and client-state persistence distinctions
Artifacts: s1.runtime.guides_intent.l1.

Source `docs/guides/permissions.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `4ece5d1d331da22ad5d67441e01f6ccef6717eb8`; full-source SHA-256 `3617f418e1f8e8c32f7c9c5eacdcfebc8f255a406ec2b227a86342a7b5a569e1`.

Lines 13–29; excerpt SHA-256 `4f439c4fba4151c4429657ec5e4a3ec29365b12b4636a8d8eae1dee90f06a4ca`.

~~~~text
## Your answer

- **Deny** refuses this request and every other request still waiting in the same session. The agent may try another route.
- **Allow once** lets this one request run. The next one asks again.
- **Always allow in this project** lets matching requests run without asking again in this project. The dock says what it covers:
  - "every Read request" means every request of that tool in this project.
  - "only this Bash request" means only that exact command or path. Similar requests still ask.
- **Stop** ends the whole run, not just this request. Every open permission and question of the session is rejected. See [Permission and question requests](session-requests.md).

Permissions are saved per project. Allowing something always in one project does not allow it in another.

## Auto-accept in one session

The composer's **Ask** button switches the session to **Auto-accept**. While it reads Auto-accept, every request in this session is allowed once without a dock, including any request already waiting. Other sessions still ask, and nothing is saved as a rule. Click it again to be asked again. The same switch is in Settings, General, and on the keyboard as `Mod+Shift+A`.

## Saved permissions

~~~~

## C42 — Database backup intent and refusal
Artifacts: s1.runtime.guides_intent.l1.

Source `docs/guides/database-backups.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `a661c599a3519440fd8d990bf1d48d21d3885467`; full-source SHA-256 `a1e33b9ab1fd151fb706b7d3d8f6d9e830b065491f91d568981249e992d1f629`.

Lines 1–24; excerpt SHA-256 `572f2c4b18637a281067faa52d475f5b1f94145ef03ca1b6e38730f688195f79`.

~~~~text
# Database backups and restore

Orchestra keeps sessions, projects and settings in one SQLite file. Print its location with:

```bash
orchestra db path
```

`ORCHESTRA_DB` overrides it. An absolute path or `:memory:` is used as is; a relative name is placed in Orchestra's data directory.

## Automatic backup before every migration

When a new version opens a database that still has pending migrations, it first writes a consistent copy next to the database with SQLite `VACUUM INTO`:

```
<database>.backup-<last-applied-migration>-<unix-ms>
```

`legacy` replaces the migration id when the database predates the migration journal.

- The three newest backups are kept and older ones are deleted.
- If the backup cannot be written (full disk, read-only folder), the migration does not run and nothing is changed. Free space and start the app again.
- An in-memory database is never backed up.

~~~~

## C43 — Credential storage and decryption-failure intent
Artifacts: s1.runtime.guides_intent.l1.

Source `docs/guides/credentials.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `9e6c450c0a51ac92c9adc5852db920b575f2150a`; full-source SHA-256 `a0c4d1888c597f5f4ab95a36c64f4d4f897f1a6fbdcb232263c382763d2e2c2d`.

Lines 9–17; excerpt SHA-256 `d8631cfffbb7f7412b869923bf5edb27d84acec2d7d5ff4f9832f77b7378085b`.

~~~~text
Provider credentials and integration tokens are stored in Orchestra's database, `orchestra.db` in the data directory
(`~/.local/share/orchestra` on Linux and macOS unless `XDG_DATA_HOME` says otherwise). MCP OAuth tokens are stored in
`mcp-auth.json` in the same directory.

Every secret is encrypted with AES-256-GCM before it is written. The encryption key is a random 32-byte key that
Orchestra creates on first start and keeps in your operating system's credential store: the Keychain on macOS, the
Secret Service (for example GNOME Keyring or KWallet) on Linux, and Credential Manager on Windows. The entry is named
`ai.hugr.orchestra` / `credential-key`. Copying the database or `mcp-auth.json` to another machine does not copy the
key, so the secrets in the copy cannot be read there.
~~~~

Lines 28–35; excerpt SHA-256 `3aaa71be315790a2ed1e10d0d83a7bb0064fa319adc2bbbee41d03b2221b2748`.

~~~~text
If a stored secret cannot be decrypted (for example because the key was removed from the credential store), Orchestra
logs an error for that credential and skips it. It never deletes or overwrites it, so restoring the key makes it readable
again. Logging in again creates a new credential.

On macOS an update can make the Keychain ask again whether Orchestra may use its key. If you decline that prompt or do
not answer it within 10 seconds, Orchestra falls back to the key file for that run. Your stored credentials are skipped,
not lost. `mcp-auth.json` is left in place: MCP servers show as logged out and new MCP logins fail rather than
overwrite it. Restart Orchestra and allow the prompt to get everything back.
~~~~

## C44 — Behavior plugins differ from code authoring package
Artifacts: s1.runtime.guides_intent.l1.

Source `docs/guides/plugins.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `4a271a325f679e25a990e51f89ea0009d8c48131`; full-source SHA-256 `4cdd834146b9d9a9a6dfecfde22a25cddd9f08a04e82cf5de2edf704e020ff34`.

Lines 1–14; excerpt SHA-256 `21061eeca9c09d235e51d32f9d6e3fd460757e6ce8c9ece14ef6bb6bc3c58922`.

~~~~text
# Plugins

Plugins shape how the model thinks and speaks. Each one is a short set of behavior instructions that you switch on for a project. The page is titled **LLM behavior** and its sidebar entry is **Plugins**.

## Where it lives

Open **Plugins** in the sidebar's Advanced group. It needs a project, and each project keeps its own behaviors: what you enable here does not change other projects. The description reads **Shape how the LLM thinks and speaks. Each project has its own behavior.** Use **Search plugins** to filter the list.

## What is in the list

- **Caveman** is built in: **Technical substance stays. Fluff goes.** It has an **Intensity** of lite, full or ultra.
- Behaviors you add yourself are marked **custom**.

Each row shows a badge: **Active** when the behavior is switched on and has instructions, **Enabled** or **Disabled** for the switch, and **No instructions** when a behavior is on but has nothing to say. The switch **Enable {name}** turns a behavior on or off. **Configure** opens its details.
~~~~

Lines 27–31; excerpt SHA-256 `4ce64116d4a1e0eedacb76601b508b5cc55661ea3fca1c0e03e8e015cf1ef77a`.

~~~~text
## When it applies

An enabled behavior is added to new chat messages. It does not apply to slash commands or shell runs. When the server holds the behaviors, they apply on the server to every turn, including chats that are already open. If the server cannot accept per-prompt instructions, the row says **not applied**, and the behavior has no effect until the server supports it.

If saving to the server fails, the row says **sync failed** with **Retry**. Your change stays in the page, and choosing **Retry** sends it again.
~~~~

## C45 — Root test-execution authority
Artifacts: s1.runtime.maintenance_intent.l1.

Source `AGENTS.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `ef3b523b0c00aed722582b870c1919188edc4c4f`; full-source SHA-256 `07acaefb95db4b07b4e76c4255f7d6e0ecc4c7466b46fbf6ec5e5cdf6cc01b4f`.

Lines 158–166; excerpt SHA-256 `ca9a57e354268945a159d0986e50c0e604c709fdb777c54fc984da83a1168659`.

~~~~text
- Avoid mocks as much as possible, you shouldn't be using globalThis.\* at all unless it's the only option.
- Test actual implementation, do not duplicate logic into tests
- Tests run on GitHub Actions, never on this machine. From the repository root: `bun run test:ci <package> [test files...] [-t pattern] [--os linux|windows|both]`, for example `bun run test:ci maestro test/roster.test.ts`.
  - Named test files run exactly and in the order given. Any other argument, such as a directory, is a Bun substring filter that may match several files, which Bun runs in its own order.
  - It uploads a snapshot of your working tree to a temporary `ci-run-*` branch, waits for the `test-ci` workflow, prints the result and exits non-zero when tests fail. No commit is needed; untracked files that are not gitignored are included, so keep secrets out of the tree.
  - A run takes a few minutes: give the shell call a long timeout or run it in the background.
  - A Python package (a `requirements-dev.txt` and no `package.json`) runs pytest instead. In a package with both, such as `modules/relay`, naming only `.py` files runs pytest, for example `bun run test:ci relay tests/test_authoring.py`, and anything else runs `bun test`; `-t` becomes pytest's `-k`.
  - The omni positive control (`script/test-omni-control.ts`) prints one `omni positive control:` line per run, and `test:ci` fails a job without it or whose verdict is neither `pass` nor `not applicable`. Full lanes and whole-package `test:ci` runs expect every run to spawn through omni; a narrower `test:ci` run (`ORCHESTRA_OMNI_CONTROL=declared`, derived from the request) expects it only from tests that declared it. A test that must spawn through omni calls `expectSpawn(import.meta.path)` from `packages/core/test/fixture/omni-expect.ts` in its body, before it spawns; it then fails unless it made an omni spawn of its own. `packages/core/test/omni-expect-guard.test.ts` requires the call in test files that import omni's spawn surface. `test:ci` accepts only `1` or `strict` for `--env ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER`: `0` or a typo would run the tests on legacy with the control off. Legacy rollback runs only in test.yml's named lanes.
  - A local `bun test` stops with a pointer to `test:ci` (`script/test-guard.ts`). Only the owner may allow a local run, with `ORCHESTRA_LOCAL_TESTS=1`.
~~~~

## C46 — Historical phase-card baseline and commands
Artifacts: s1.runtime.maintenance_intent.l1.

Source `docs/architecture/phase-plans/70-90-briefs/FAC-PLUGIN.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `0184770b62c7e569adc4757bec75a168eb3da00b`; full-source SHA-256 `432c412302afee982a151d55955602f24bbf2c9b008031deedd822f1a72a1239`.

Lines 7–19; excerpt SHA-256 `9be52439fc964a4af2e6b8fd6a66d5f080dd162b5a5fd2047194151e8bfa9bac`.

~~~~text
- Worktree (already created for you): `/Users/gustavoschneiter/Documents/HuGR/_worktrees/ms-fac-plugin`
- Branch (already checked out): `ms-fac-plugin`
- BASE commit: `7181942eaa733b9cc3f4ff6aef79231d0d1c2f93`
- Remote: `fork`

## Hard rules

1. Work only inside the worktree. Never write, create or delete anything outside it.
2. Never run `bun install`, `bun typecheck`, `bun test`, `bun run test:ci`, `turbo`, `tsgo`, `tsc`, `bunx`, or any build.
3. Allowed commands: `git status|diff|grep|add|commit|push`, `node -e` one-liners, `python3 -` when a step gives the script, the `bun run script/<tool>.ts` commands below, and `bun run check:boundaries --no-stale --json --scope ...` (through the `SCOPED` helper).
4. Edit only the owned files listed below. Never edit `script/boundary-ledger.json`, `script/module-architecture.json`, any other `package.json`, `.github/**`, `turbo.json`, `nix/**`, `bun.lock`, or generated directories.
5. Never write the old upstream product name in any letter case, and never write a seat display name. Write in English.
6. Stop line: if any output differs from the expected value, stop. Do not fix or improvise. Report the exact output.
~~~~

## C47 — Removal spec separates completion labels from old inventory
Artifacts: s1.runtime.maintenance_intent.l1.

Source `docs/specs/storage/remove-orchestra-db.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `85fdbfcf3d21d1d708be632dc4471fe145deadb5`; full-source SHA-256 `984679f16782781d728a4564a1df4863472aae7c2cef777b9416f8ed64f7e9a9`.

Lines 43–63; excerpt SHA-256 `a46b70ffe6900a562e3634899fd6cc75b58996406f568e03d19d620d22ad81c6`.

~~~~text
- `packages/orchestra/src/worktree/index.ts`

There are 65 direct API/type references in those files. The references fall into the groups below.

## Group 1: Database Runtime And Startup

Status: Completed. Startup, the public node export, and database CLI tooling no longer import the legacy orchestra database wrapper; `packages/orchestra/src/storage/db.ts` has been deleted.

Files:

- `packages/orchestra/src/storage/db.ts`
- `packages/orchestra/src/index.ts`
- `packages/orchestra/src/node.ts`
- `packages/orchestra/src/cli/cmd/db.ts`

Current usage:

- `storage/db.ts` opens the singleton database, applies pragmas, exposes callback-style access, holds ambient transaction context, and queues post-commit effects.
- `index.ts` no longer performs the removed JSON-to-SQLite migration during startup.
- `node.ts` publicly re-exports `Database` from the legacy module.
- `cli/cmd/db.ts` uses `Database.getPath()` to print the path, open a readonly Bun SQLite handle, run `sqlite3`, and vacuum.
~~~~

## C48 — Deferred database constraints and reported landed indexes
Artifacts: s1.runtime.maintenance_intent.l1.

Source `docs/specs/database/integrity-followups.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `23e4f2a883b42894f8cd2cfa929377acc246df16`; full-source SHA-256 `de59e7ad05a9a323631de4ddfb8cd49125c2f4bbd0362aeb886f21d85389358b`.

Lines 1–8; excerpt SHA-256 `3aed76bdb838bea33e63420e5c2b1eef6a793b63aec70b2a57f8e1f2b19a7a81`.

~~~~text
# Database integrity follow-ups

Status: deferred. Source: round-2 audit, section G (2026-10-17). Indexes from G6 landed in migration
`20261018031800_session_list_indexes`; G4, G7 and G8 need no action.

No foreign key below is added now. SQLite cannot add a foreign key to an existing table; it needs a full
table rebuild (`CREATE TABLE new … ; INSERT … SELECT ; DROP ; RENAME`), and with `PRAGMA foreign_keys=ON`
(`packages/core/src/database/database.ts`) any orphan row already present in a user database makes the
~~~~

## C49 — Exact config schema root, plugin entry and current property names
Artifacts: s1.runtime.maintenance_intent.l1.

Source `schema/config.json`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `ba9b5d2121a9a3bda733cba0459094b69757ede6`; full-source SHA-256 `8fda412b89aa5630cfd7b2e2116a0789ab7b793423edfbf8dcec3927c6016747`.

Lines 1–4; excerpt SHA-256 `80e43edc1b9ca0dc0ac5f1ec0741047f1bcdd98eafabb0a4e3b49f39705efa4a`.

~~~~text
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$ref": "#/$defs/Config.Info",
  "$defs": {
~~~~

Lines 536–554; excerpt SHA-256 `90cc55120b715341c50a53ae5869cd7df7cc2feb6512033d81ffc03ff47b7e74`.

~~~~text
    "ConfigV2.Plugin.Entry": {
      "type": "object",
      "properties": {
        "package": {
          "type": "string"
        },
        "options": {
          "type": "object"
        }
      },
      "required": [
        "package"
      ],
      "additionalProperties": false
    },
    "Policy.Effect": {
      "type": "string",
      "enum": [
        "allow",
~~~~

Lines 1205–1217; excerpt SHA-256 `596753c78642862430b2afa9deb6b1dc82038e6cbe6d47ab8e6984e7b4b59d7d`.

~~~~text
        "plugins": {
          "type": "array",
          "items": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "$ref": "#/$defs/ConfigV2.Plugin.Entry"
              }
            ]
          },
          "description": "Ordered external plugin packages to load"
~~~~

Lines 1240–1246; excerpt SHA-256 `6fc4246e444670e5202d4df1613937856f8289fcdfd88378bee33bbb44b3e8d0`.

~~~~text
      },
      "additionalProperties": false
    }
  },
  "allowComments": true,
  "allowTrailingCommas": true
}
~~~~
