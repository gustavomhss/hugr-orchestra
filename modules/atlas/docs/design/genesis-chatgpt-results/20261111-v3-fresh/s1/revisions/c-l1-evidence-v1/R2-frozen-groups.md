# R2 — Complete unchanged frozen groups

The following six group sections are copied byte-for-byte from the frozen full evidence archive, SHA-256 `bfc3c3f4ea147681a1e19f18b46244b70ecefa8659e6e4efddbc43a95c75b899`. Their source identities, spans, text and hashes are unchanged. Additional narrow spans in R3 cover the directly associated material claims where the original named group alone supplied only part of the cited mechanism.

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

