# S1-L1-C compact exact evidence

Baseline for every source: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. This projection selects decisive original line spans; full evidence and all captured bytes remain in `review-evidence.md` and `sources/`. IDs match the full archive. Documentary excerpts are intent evidence only. No execution or semantic verdict is asserted. Excerpt byte hashes are in `review-evidence-compact-index.json`. Supplementary helper, retry, TUI, packaging and credential-guide groups C04, C06, C10, C17, C39 and C43 remain in the full archive; they are omitted here for economy, not treated as disproved or accepted.

## Artifact to excerpt map

| Artifact | Evidence groups |
| --- | --- |
| `s1.runtime.llm_turns.l1` | C01, C02, C03 |
| `s1.runtime.llm_providers.l1` | C05, C07, C08, C09, C11 |
| `s1.runtime.llm_recording.l1` | C12, C13, C14, C36 |
| `s1.runtime.plugin.l1` | C15, C16, C18 |
| `s1.runtime.codemode.l1` | C19, C20, C21, C22, C23, C24 |
| `s1.runtime.codemode_openapi.l1` | C25, C26, C27, C28 |
| `s1.runtime.effect_sqlite.l1` | C29, C30, C31, C32, C33 |
| `s1.runtime.http_recorder.l1` | C34, C35, C36, C37, C38 |
| `s1.runtime.guides_intent.l1` | C11, C40, C41, C42, C44 |
| `s1.runtime.maintenance_intent.l1` | C45, C46, C47, C48, C49 |

## Source identities

| ID | Repository path | Git blob |
| --- | --- | --- |
| S01 | `AGENTS.md` | `ef3b523b0c00aed722582b870c1919188edc4c4f` |
| S02 | `docs/architecture/phase-plans/70-90-briefs/FAC-PLUGIN.md` | `0184770b62c7e569adc4757bec75a168eb3da00b` |
| S03 | `docs/guides/database-backups.md` | `a661c599a3519440fd8d990bf1d48d21d3885467` |
| S04 | `docs/guides/mcp-project-trust.md` | `da47586309cc0c24ca4b7427b358c3706b648a46` |
| S05 | `docs/guides/models.md` | `1acc49061d975b65c05cb2c194cd612b802914d8` |
| S06 | `docs/guides/permissions.md` | `4ece5d1d331da22ad5d67441e01f6ccef6717eb8` |
| S07 | `docs/guides/plugins.md` | `4a271a325f679e25a990e51f89ea0009d8c48131` |
| S08 | `docs/specs/database/integrity-followups.md` | `23e4f2a883b42894f8cd2cfa929377acc246df16` |
| S09 | `docs/specs/storage/remove-orchestra-db.md` | `85fdbfcf3d21d1d708be632dc4471fe145deadb5` |
| S10 | `packages/codemode/src/codemode.ts` | `14782d7c8aaed7b4647e64f6631459bdd4684a64` |
| S11 | `packages/codemode/src/interpreter/runtime.ts` | `093f577765100e95597919986f606010fd82066e` |
| S12 | `packages/codemode/src/openapi/TODO.md` | `cbcfe81a68c8df2fa7aae622ddf2997e3ab29433` |
| S13 | `packages/codemode/src/openapi/runtime.ts` | `2515621792b22f23fa52967362ecf69828e21ee4` |
| S14 | `packages/codemode/src/openapi/spec.ts` | `bd4dc5aed63e44d81e4976a7e2e374cc44c53d6d` |
| S15 | `packages/codemode/src/stdlib/promise.ts` | `d0b442ccf74f2230e0e8cbe060b0be86a120ce6a` |
| S16 | `packages/codemode/src/tool-runtime.ts` | `f4ccc61d4c49a4f7572906559e5a4e2a11acdec9` |
| S17 | `packages/codemode/src/tool.ts` | `6c6863f99dcf7e659a4e1a2b582095694404e39c` |
| S18 | `packages/effect-drizzle-sqlite/src/effect-sqlite/session.ts` | `e7b9d6b32cd835bdf54d70ba39e92a5839f26968` |
| S19 | `packages/effect-drizzle-sqlite/src/sqlite-core/effect/session.ts` | `15a56f2ca7d9fe73a1fdaaa244d3430fb74cd965` |
| S20 | `packages/effect-drizzle-sqlite/src/up-migrations/sqlite.ts` | `2887c66bed735cd812d885953335d8f99c6dad2a` |
| S21 | `packages/effect-sqlite-node/README.md` | `5b1aa3d802989d35580a1f9fc970d9a3b3958892` |
| S22 | `packages/effect-sqlite-node/src/index.ts` | `fe8d67b91b7c8a9fc977eba61f14de94db22fabf` |
| S23 | `packages/llm/src/protocols/anthropic-messages.ts` | `1c0dcd32a4332261a1361010f2f314cbda4fda54` |
| S24 | `packages/llm/src/protocols/openai-responses.ts` | `7281d1ba2fe664db26a0ff5fbf2cb0eb99aca503` |
| S25 | `packages/llm/src/protocols/shared.ts` | `c14f52faccd472ae0f68f1a272a03d9e1310167c` |
| S26 | `packages/llm/src/route/client.ts` | `5f064512f9ff1b449137778440eb0fd6b86c8131` |
| S27 | `packages/llm/src/route/transport/http.ts` | `acc52c6ea173c28f92247b0fd31d58ea688df7e5` |
| S28 | `packages/llm/src/tool-runtime.ts` | `d69bbb9d478ca532a1481e8d7502c8e5c2b55dc6` |
| S29 | `packages/llm/src/tool.ts` | `11ed9854ca38a9ef648705d1091aaa35e1660da0` |
| S30 | `packages/llm/test/recorded-runner.ts` | `49d44f554628b887d14f8a4141f8b53ce19f3a64` |
| S31 | `packages/llm/test/recorded-utils.ts` | `1c135ee695029626a5f06329c652231d7840481d` |
| S32 | `packages/llm/test/recorded-websocket.ts` | `7da0ae3ba35f97eae8303b2662300d760acf9fd3` |
| S33 | `packages/plugin/src/tool.ts` | `cdf9a933f496db2a00907a4f388220715aec0097` |
| S34 | `packages/plugin/src/v2/effect/PLAN.md` | `889e8d056b5bdedaeec259c9f5976783c54ad789` |
| S35 | `packages/plugin/src/v2/effect/context.ts` | `9089334ee3bb2d0f909877acea0f85d145577930` |
| S36 | `packages/plugin/src/v2/effect/registration.ts` | `dfe5626397645e9fbefd793d9f6b4a48974a36c0` |
| S37 | `schema/config.json` | `ba9b5d2121a9a3bda733cba0459094b69757ede6` |
| S38 | `tooling/http-recorder/src/cassette.ts` | `cefc3fbc703db1f8e4dceb1cf9249f900dadd08a` |
| S39 | `tooling/http-recorder/src/internal-effect.ts` | `6b886311a99548188be8ab4086dc30be49bf6846` |
| S40 | `tooling/http-recorder/src/recorder.ts` | `c58afde4633ce7c77939650dce276b8710fe6955` |
| S41 | `tooling/http-recorder/src/socket.ts` | `c7486db4aa29bc88bd48eaa17890286670cb575d` |
| S42 | `tooling/http-recorder/src/websocket.ts` | `869cd3bf90e0df8140eb2e708e0728d197415311` |

## C01 — Compile/prepare and terminal finish boundary

S26, lines 344–351:

~~~~text
const compile = Effect.fn("LLM.compile")(function* (request: LLMRequest) {
  const resolved = applyCachePolicy(resolveRequestOptions(request))
  const route = resolved.model.route

  const body = yield* route.body
    .from(resolved)
    .pipe(Effect.flatMap(ProviderShared.validateWith(Schema.decodeUnknownEffect(route.body.schema))))
  const prepared = yield* route.prepareTransport(body, resolved)
~~~~

S26, lines 381–390:

~~~~text

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

S29, lines 165–170:

~~~~text
export function make(config: TypedToolConfig | DynamicToolConfig): AnyTool {
  if ("jsonSchema" in config) {
    return {
      description: config.description,
      parameters: Schema.Unknown as ToolSchema<unknown>,
      success: Schema.Unknown as ToolSchema<unknown>,
~~~~

S29, lines 174–175:

~~~~text
      _decode: Effect.succeed,
      _encode: Effect.succeed,
~~~~

S29, lines 187–195:

~~~~text
  return {
    description: config.description,
    parameters: config.parameters,
    success: config.success,
    execute: config.execute,
    toModelOutput: config.toModelOutput,
    toStructuredOutput: config.toStructuredOutput,
    _decode: Schema.decodeUnknownEffect(config.parameters),
    _encode: Schema.encodeEffect(config.success),
~~~~

## C03 — One-call dispatch and mapped tool failures

S28, lines 22–34:

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
~~~~

## C05 — Protocol-owned overlay refusal and auth order

S27, lines 73–85:

~~~~text
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

## C07 — Text-only escaped chronological update fallback

S25, lines 111–112:

~~~~text
const escapeSystemUpdateText = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
~~~~

S25, lines 120–121:

~~~~text
export const wrapSystemUpdate = (parts: ReadonlyArray<{ readonly text: string }>) =>
  `<system-update>\n${escapeSystemUpdateText(joinText(parts))}\n</system-update>`
~~~~

S25, lines 128–137:

~~~~text
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
~~~~

## C08 — Anthropic model/placement and pending-tool boundary

S23, lines 356–356:

~~~~text
const supportsNativeSystemUpdates = (request: LLMRequest) => String(request.model.id) === "claude-opus-4-8"
~~~~

S23, lines 363–373:

~~~~text
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
~~~~

S23, lines 408–417:

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
~~~~

## C09 — Responses structured-output refusal

S24, lines 911–919:

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

## C11 — Guide distinguishes model-layer implementation and Core routing

S05, lines 9–16:

~~~~text
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

S30, lines 68–84:

~~~~text
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
~~~~

## C13 — Unrecorded ledger rationale and examples

S31, lines 51–60:

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
~~~~

## C14 — LLM fixture adapter uses internal recorder API

S32, lines 1–5:

~~~~text
import { HttpRecorderInternal } from "@orchestra/http-recorder/internal"
import { Effect, Layer } from "effect"
import { WebSocketExecutor } from "../src/route"
import type { Service as WebSocketExecutorService } from "../src/route/transport/websocket"

~~~~

S32, lines 14–24:

~~~~text
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
~~~~

## C15 — Host binding, agent identity and metadata contract

S33, lines 3–17:

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
~~~~

S33, lines 25–28:

~~~~text
  /** Display label of the executing agent. Users can rename it, so never route or authorize on it. */
  agent: string
  /** Stable id of the executing agent: the identity that routes, owns memory and holds permissions. */
  agentID: string
~~~~

S33, lines 40–42:

~~~~text
  /** Await the returned Promise before relying on persisted progress. Fire-and-forget persistence is not guaranteed. */
  metadata(input: { title?: string; metadata?: { [key: string]: any } }): Promise<void> | void
  ask(input: AskInput): Promise<void>
~~~~

## C16 — Current context and scoped registration signatures

S35, lines 12–22:

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

S36, lines 3–15:

~~~~text
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

## C18 — V2 target plan is not current API documentation

S34, lines 1–5:

~~~~text
# V2 Plugin System Implementation Plan

## Status

This document describes the agreed target design for the V2 plugin system. It is an implementation plan, not documentation for the current API.
~~~~

## C19 — Limits have no defaults and invalid configuration throws

S10, lines 119–134:

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
~~~~

## C20 — Effect validation versus render-only JSON Schema

S17, lines 62–68:

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

S16, lines 268–291:

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
~~~~

## C22 — Supervised calls, abandoned promises and fixed concurrency

S11, lines 692–697:

~~~~text
      // The program body runs inside an implicit async function, so a returned promise
      // resolves before crossing the data boundary - `return tools.ns.tool(...)` works
      // without an explicit await, exactly as in JS.
      if (value instanceof SandboxPromise) value = yield* self.settlePromise(value)
      yield* self.drainPendingSettlements()
      return value
~~~~

S11, lines 705–716:

~~~~text
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
~~~~

S15, lines 3–6:

~~~~text
export const promiseStatics = new Set<PromiseMethodName>(["all", "allSettled", "race", "resolve", "reject"])

/** Maximum number of eagerly forked tool calls that may run concurrently. */
export const TOOL_CALL_CONCURRENCY = 8
~~~~

## C23 — Host interruption and sanitized failure

S16, lines 143–149:

~~~~text
const runHost = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, ToolError, R> =>
  effect.pipe(
    Effect.catchCause((cause) => {
      if (Cause.hasInterruptsOnly(cause)) return Effect.interrupt
      const error = Cause.squash(cause)
      return Effect.fail(error instanceof ToolError ? error : toolError("Tool execution failed", error))
    }),
~~~~

S11, lines 3394–3403:

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
~~~~

## C24 — Output payload truncation and added explanatory markers

S11, lines 3432–3438:

~~~~text
  if (result.ok) {
    const serialized = JSON.stringify(result.value) ?? "null"
    const bytes = utf8ByteLength(serialized)
    if (bytes > maxOutputBytes) {
      truncated = true
      value = `${utf8Truncate(serialized, maxOutputBytes)} [result truncated: ${bytes} bytes exceeds the ${maxOutputBytes}-byte output limit; return a smaller value]`
      valueBytes = maxOutputBytes
~~~~

S11, lines 3455–3464:

~~~~text
  if (kept.length < logs.length) {
    truncated = true
    kept.push(`[logs truncated: showing ${kept.length} of ${logs.length} lines]`)
  }

  if (!truncated) return result
  const logsPart = kept.length > 0 ? { logs: kept } : {}
  return result.ok
    ? { ok: true, value, ...logsPart, truncated: true, toolCalls: result.toolCalls }
    : { ok: false, error: result.error, ...logsPart, truncated: true, toolCalls: result.toolCalls }
~~~~

## C25 — Unsupported parameter encoding and invalid base URL

S14, lines 143–154:

~~~~text
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

S14, lines 430–440:

~~~~text
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

S13, lines 126–145:

~~~~text
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
~~~~

S13, lines 216–224:

~~~~text
    // model-supplied value retarget the request to a different endpoint.
    if (fieldValue === "" || fieldValue === "." || fieldValue === "..") {
      return toolError(`Invalid path parameter '${field.inputName}'.`)
    }
    url = url.replaceAll(`{${field.name}}`, fieldValue)
  }
  const unresolved = url.match(/\{[^{}]+\}/)
  if (unresolved !== null) return toolError(`Unresolved path parameter ${unresolved[0]}.`)
  return url
~~~~

## C27 — Response body cap before and during reading

S13, lines 9–9:

~~~~text
const maxResponseBodyBytes = 50 * 1024 * 1024
~~~~

S13, lines 297–306:

~~~~text
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
~~~~

## C28 — Documented unresolved OpenAPI boundaries

S12, lines 10–19:

~~~~text
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

S18, lines 169–181:

~~~~text
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
~~~~

S18, lines 190–196:

~~~~text
                      const failed = finalizedExit(exit, rolledBack)
                      if (id === 0) return yield* failed
                      // A failed ROLLBACK TO must not prevent best-effort savepoint release.
                      const released = yield* Effect.exit(
                        this.executeTransactionStatement(connection, `release savepoint effect_sql_${id}`),
                      )
                      return yield* finalizedExit(failed, released)
~~~~

## C30 — Preserve every original and cleanup failure reason

S18, lines 239–246:

~~~~text
function finalizedExit<A, E, E2>(original: Exit.Exit<A, E>, cleanup: Exit.Exit<unknown, E2>): Exit.Exit<A, E | E2> {
  if (Exit.isSuccess(cleanup)) return original
  // Cause.combine deduplicates equal reasons; distinct cleanup attempts must all survive.
  return Exit.failCause<E | E2>(
    Exit.isFailure(original)
      ? Cause.fromReasons<E | E2>([...original.cause.reasons, ...cleanup.cause.reasons])
      : cleanup.cause,
  )
~~~~

## C31 — Journal matching and unmatched-row refusal

S20, lines 64–70:

~~~~text
    const matchedByMillis = candidates?.length === 1 ? candidates[0] : undefined
    const matchedByCandidateHash =
      candidates && candidates.length > 1
        ? candidates.find((candidate) => candidate.hash && dbRow.hash && candidate.hash === dbRow.hash)
        : undefined
    const matchedByHash = matchedByMillis || matchedByCandidateHash ? undefined : byHash.get(dbRow.hash)
    const matched = matchedByMillis ?? matchedByCandidateHash ?? matchedByHash
~~~~

S20, lines 85–90:

~~~~text
    unmatched.push(dbRow)
  }

  if (unmatched.length > 0) {
    throw unmatchedMigrationError(unmatched)
  }
~~~~

## C32 — Migration init refusal and transactional execution

S19, lines 452–459:

~~~~text
  if (typeof config === "object" && config.init) {
    if (dbMigrations.length) {
      return yield* new MigratorInitError({ exitCode: "databaseMigrations" })
    }

    if (migrations.length > 1) {
      return yield* new MigratorInitError({ exitCode: "localMigrations" })
    }
~~~~

## C33 — Node constructor, unsupported stream and documented usage limit

S22, lines 118–120:

~~~~text
        executeStream() {
          return Stream.die("executeStream not implemented")
        },
~~~~

S21, lines 7–8:

~~~~text
- One module, `packages/effect-sqlite-node/src/index.ts`, exporting `NodeSqliteClient`: `make`, `layer`, and the `SqliteClient` service and config types. It wraps `node:sqlite` as an Effect `SqlClient`.
- Nothing uses it today. Core opens its database through `packages/core/src/database/sqlite.node.ts`, which carries its own `node:sqlite` client.
~~~~

S21, lines 13–13:

~~~~text
- No importers in the repository; `packages/core` lists it as a dependency without importing it.
~~~~

## C34 — Auto-mode and unused-interaction exception

S40, lines 6–18:

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

S40, lines 35–42:

~~~~text
    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        const used = yield* SynchronizedRef.get(position)
        if (used === 0) return yield* Effect.void
        const interactions = yield* load.pipe(Effect.orDie)
        if (used < interactions.length)
          return yield* Effect.die(
            new Error(`Unused recorded interactions in ${name}: used ${used} of ${interactions.length}`),
~~~~

## C35 — Replay delegates exact sequential matching

S39, lines 160–171:

~~~~text
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
~~~~

## C36 — Internal executor separates server/client event lists

S42, lines 152–169:

~~~~text
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

S38, lines 41–49:

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

S38, lines 109–112:

~~~~text
              const interactionFindings = [...entry.findings, ...secretFindings(interaction)]
              const cassette = buildCassette(name, interactions, metadata)
              const findings = [...interactionFindings, ...secretFindings(cassette.metadata ?? {})]
              yield* failIfUnsafe(name, findings)
~~~~

## C38 — Public replay advances through interleaved traffic

S41, lines 89–105:

~~~~text
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
~~~~

S41, lines 240–240:

~~~~text
          if (occupied) return yield* Effect.die("Concurrent runs of a replayed WebSocket are not supported")
~~~~

## C40 — Global-only project trust and API path refusal are guide claims

S04, lines 3–8:

~~~~text
A project can declare code to run in its own config (`orchestra.json`, `orchestra.jsonc`, or the same files under `.orchestra/`). A cloned repository could use that to run anything on your machine. So none of the following run until you approve the project:

- local MCP servers (a command);
- plugins: the `plugins` list in the project config, and plugin files in `.orchestra/plugin/` or `.orchestra/plugins/`;
- `formatter` entries of the project config (a formatter is a command);
- `lsp` entries of the project config (a language server is a command).
~~~~

S04, lines 48–48:

~~~~text
The server refuses a folder that does not exist, a file, a relative path and the filesystem root.
~~~~

S04, lines 60–60:

~~~~text
Only the global config counts. A `trusted_projects` entry in a project's own config is ignored, so a repository cannot approve itself.
~~~~

## C41 — Permission reply and client-state persistence distinctions

S06, lines 15–17:

~~~~text
- **Deny** refuses this request and every other request still waiting in the same session. The agent may try another route.
- **Allow once** lets this one request run. The next one asks again.
- **Always allow in this project** lets matching requests run without asking again in this project. The dock says what it covers:
~~~~

S06, lines 22–22:

~~~~text
Permissions are saved per project. Allowing something always in one project does not allow it in another.
~~~~

S06, lines 26–26:

~~~~text
The composer's **Ask** button switches the session to **Auto-accept**. While it reads Auto-accept, every request in this session is allowed once without a dock, including any request already waiting. Other sessions still ask, and nothing is saved as a rule. Click it again to be asked again. The same switch is in Settings, General, and on the keyboard as `Mod+Shift+A`.
~~~~

## C42 — Database backup intent and refusal

S03, lines 8–24:

~~~~text

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

## C44 — Behavior plugins differ from code authoring package

S07, lines 1–3:

~~~~text
# Plugins

Plugins shape how the model thinks and speaks. Each one is a short set of behavior instructions that you switch on for a project. The page is titled **LLM behavior** and its sidebar entry is **Plugins**.
~~~~

S07, lines 27–31:

~~~~text
## When it applies

An enabled behavior is added to new chat messages. It does not apply to slash commands or shell runs. When the server holds the behaviors, they apply on the server to every turn, including chats that are already open. If the server cannot accept per-prompt instructions, the row says **not applied**, and the behavior has no effect until the server supports it.

If saving to the server fails, the row says **sync failed** with **Retry**. Your change stays in the page, and choosing **Retry** sends it again.
~~~~

## C45 — Root test-execution authority

S01, lines 160–160:

~~~~text
- Tests run on GitHub Actions, never on this machine. From the repository root: `bun run test:ci <package> [test files...] [-t pattern] [--os linux|windows|both]`, for example `bun run test:ci maestro test/roster.test.ts`.
~~~~

## C46 — Historical phase-card baseline and commands

S02, lines 9–9:

~~~~text
- BASE commit: `7181942eaa733b9cc3f4ff6aef79231d0d1c2f93`
~~~~

## C47 — Removal spec separates completion labels from old inventory

S09, lines 45–49:

~~~~text
There are 65 direct API/type references in those files. The references fall into the groups below.

## Group 1: Database Runtime And Startup

Status: Completed. Startup, the public node export, and database CLI tooling no longer import the legacy orchestra database wrapper; `packages/orchestra/src/storage/db.ts` has been deleted.
~~~~

S09, lines 58–63:

~~~~text
Current usage:

- `storage/db.ts` opens the singleton database, applies pragmas, exposes callback-style access, holds ambient transaction context, and queues post-commit effects.
- `index.ts` no longer performs the removed JSON-to-SQLite migration during startup.
- `node.ts` publicly re-exports `Database` from the legacy module.
- `cli/cmd/db.ts` uses `Database.getPath()` to print the path, open a readonly Bun SQLite handle, run `sqlite3`, and vacuum.
~~~~

## C48 — Deferred database constraints and reported landed indexes

S08, lines 1–8:

~~~~text
# Database integrity follow-ups

Status: deferred. Source: round-2 audit, section G (2026-10-17). Indexes from G6 landed in migration
`20261018031800_session_list_indexes`; G4, G7 and G8 need no action.

No foreign key below is added now. SQLite cannot add a foreign key to an existing table; it needs a full
table rebuild (`CREATE TABLE new … ; INSERT … SELECT ; DROP ; RENAME`), and with `PRAGMA foreign_keys=ON`
(`packages/core/src/database/database.ts`) any orphan row already present in a user database makes the
~~~~

## C49 — Exact config schema root, plugin entry and current property names

S37, lines 536–554:

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

S37, lines 1205–1213:

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
~~~~

S37, lines 1240–1246:

~~~~text
      },
      "additionalProperties": false
    }
  },
  "allowComments": true,
  "allowTrailingCommas": true
}
~~~~
