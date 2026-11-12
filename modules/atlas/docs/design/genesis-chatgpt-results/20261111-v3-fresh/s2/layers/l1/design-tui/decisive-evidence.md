# Decisive evidence — design-tui L1

All source excerpts are from `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Excerpts are unchanged UTF-8 source lines; each block names its inclusive line interval and Git blob SHA. Source bytes, SHA-256 and original connector responses are retained in `sources.json` and the referenced capture files.

These witnesses establish selected critical mechanisms and limitations. They are not execution evidence. All product tests, builds, typechecks, generators, terminal/browser sessions and remote mutations remain unexecuted. See `l1.md` and `coverage.json` for the full family disposition.

## E01. Current boundary and language policy

Current terminal ownership permits core and says V2. The language policy is English-only; the UI has its own i18n instruction.

**Source:** `packages/tui/README.md:17–18` · blob `3033116c72a3a39851f35f48536b79728305596f`

```text
- Layer `terminal-ui`: may use core (it runs in the backend process), plugin, schema, ui and client.
- The TUI speaks only V2: Sessions, messages and events come from `@orchestra/client` and the types in `packages/tui/src/types.ts`.
```

**Source:** `packages/tui/README.md:28–30` · blob `3033116c72a3a39851f35f48536b79728305596f`

```text
## Language policy

The TUI is English-only for now. Strings are written in place and there is no i18n layer. Do not add ad hoc translation dictionaries; a localization layer needs its own design, as the web and desktop apps have one in `packages/app-shell`.
```

**Source:** `packages/ui/AGENTS.md:3–5` · blob `73b12de4d7cea0029707d89edff72c14575498cc`

```text
- NEVER hardcode user-visible English strings in production code. ALWAYS use an i18n key for component defaults, visible copy, placeholders, accessible labels, tooltips, dialogs, toasts, empty states, and displayed errors.
- When migrating existing copy to i18n, preserve the English text byte-for-byte unless the task explicitly requests a copy change.
- NEVER change existing English text or English keys to facilitate translation. English is intentional, designer-written source copy; adapt locale-specific translations and i18n mechanics around it.
```

## E02. The inspected CLI supplies an empty plugin host

Feature source existence cannot establish activation by this adapter.

**Source:** `apps/cli/src/tui.ts:23–40` · blob `ec99d67457f67a0a184b742dd4e61c84efaada4d`

```typescript
    }
    directory?: string
  } = {},
) {
  return Effect.promise(() => loadTuiConfig(options.directory ?? process.cwd())).pipe(
    Effect.flatMap((config) =>
      run({
        ...transport,
        args: options.args ?? {},
        directory: options.directory,
        config,
        pluginHost: {
          async start() {},
          async dispose() {},
        },
      }),
    ),
    Effect.provide(AppNodeBuilder.build(Global.node)),
```

## E03. Renderer and injected host cleanup are scoped

This source registers plugin/audio cleanup and SIGHUP shutdown; the test below uses a mocked renderer.

**Source:** `packages/tui/src/app.tsx:211–230` · blob `8471637f416eece3baf17e66e8653c59676b1d8f`

```typescript
        Effect.sync(() => registerOrchestraKeymap(keymap, renderer, input.config)),
        (unregister) => Effect.sync(unregister),
      )
      yield* Effect.addFinalizer(() =>
        Effect.promise(async () => {
          try {
            await input.pluginHost.dispose()
          } catch (error) {
            console.error("Failed to dispose TUI plugins", error)
          }
        }),
      )
      yield* Effect.addFinalizer(() => Effect.sync(TuiAudio.dispose))
      const shutdown = yield* Deferred.make<unknown>()
      const onSighup = () => destroyRenderer(renderer)
      yield* Effect.acquireRelease(
        Effect.sync(() => process.on("SIGHUP", onSighup)),
        () => Effect.sync(() => process.off("SIGHUP", onSighup)),
      )
      renderer.once("destroy", () => Deferred.doneUnsafe(shutdown, Effect.void))
```

**Source:** `packages/tui/test/app-lifecycle.test.tsx:50–60` · blob `7a32ed20d7c0d220070a4a93415863d375ee0b2a`

```typescript
    process.emit("SIGHUP")
    await task

    expect(setup.renderer.isDestroyed).toBe(true)
    expect(titles.at(-1)).toBe("")
    expect(disposes).toBe(1)
    expect(process.listeners("SIGHUP").every((listener) => listeners.has(listener))).toBe(true)
  } finally {
    if (!setup.renderer.isDestroyed) setup.renderer.destroy()
    mock.restore()
  }
```

## E04. Injected event source and SSE have distinct ownership

The selected source branch and cleanup are visible; no live transport was used.

**Source:** `packages/tui/src/context/sdk.tsx:114–128` · blob `b595aa115e6902542a41bee79be7fc26ca434ded`

```typescript
    onMount(async () => {
      if (props.events) {
        const unsub = await props.events.subscribe(handleEvent)
        onCleanup(unsub)
        return
      }
      startSSE()
    })

    onCleanup(() => {
      abort.abort()
      sse?.abort()
      if (timer) clearTimeout(timer)
      handlers.clear()
    })
```

## E05. History hydration retains rows changed by live events

This is the production merge and lifecycle, including the history-error fallback. It is not a claim that the test executed.

**Source:** `packages/tui/src/context/sync.tsx:498–537` · blob `d780ec3db53f6adbd36131e9342d5899b0b517a5`

```typescript
        async sync(sessionID: string) {
          if (fullSyncedSessions.has(sessionID)) return
          const syncing = syncingSessions.get(sessionID)
          if (syncing) return syncing
          const touched = new Set<string>()
          hydratingSessions.set(sessionID, touched)
          const task = (async () => {
            const [session, messages, todo] = await Promise.all([
              sdk.catalog.session(sessionID),
              // The earlier runtime rendered a Session whose message route failed as empty instead of failing the sync.
              sdk.catalog.messages(sessionID).catch(() => []),
              sdk.catalog.todo(sessionID),
            ])
            const live = history.get(sessionID) ?? []
            history.set(
              sessionID,
              [
                ...messages.map(
                  (message) => live.find((item) => item.id === message.id && touched.has(item.id)) ?? message,
                ),
                ...live.filter((item) => touched.has(item.id) && !messages.some((message) => message.id === item.id)),
              ].toSorted((a, b) => b.time.created - a.time.created || b.id.localeCompare(a.id)),
            )
            setStore(
              produce((draft) => {
                const match = search(draft.session, sessionID, (s) => s.id)
                if (match.found) draft.session[match.index] = session
                if (!match.found) draft.session.splice(match.index, 0, session)
                draft.todo[sessionID] = todo
              }),
            )
            projectHistory(sessionID)
            fullSyncedSessions.add(sessionID)
            await refreshDiff(sessionID)
          })().finally(() => {
            syncingSessions.delete(sessionID)
            hydratingSessions.delete(sessionID)
          })
          syncingSessions.set(sessionID, task)
          return task
```

**Source:** `packages/tui/test/cli/cmd/tui/sync-live-hydration.test.tsx:163–174` · blob `de09c3c7d6a229963050b82e428fee12e6c2c33e`

```typescript
          },
        ],
        cursor: {},
      }),
    )
    await hydrate

    expect(content(sync)?.[0]).toMatchObject({ type: "text", text: "live" })
  } finally {
    app.renderer.destroy()
  }
})
```

## E06. Prompt action order uses the V2 adapter

Selection, optional synthetic editor input and prompt dispatch are ordered here.

**Source:** `packages/tui/src/context/session-actions.ts:38–53` · blob `255420d1e93ce0fca21b941c673abdede087e91e`

```typescript
      await select(input)
      if (input.context)
        await client.sessions.synthetic({ sessionID: input.sessionID, text: input.context, resume: false })
      return client.sessions.prompt({
        sessionID: input.sessionID,
        prompt: {
          text: input.text,
          files: input.files.map(toFile),
          agents: input.agents.map((agent) => ({
            name: agent.name,
            source: agent.source
              ? { start: agent.source.start, end: agent.source.end, text: agent.source.value }
              : undefined,
          })),
        },
      })
```

## E07. Production submission guard and mirrored test limit

The guard protects admission; the regression source explicitly says its test is a mirror.

**Source:** `packages/tui/src/component/prompt/index.tsx:919–934` · blob `6cd7cc1bd79c141c2c821853a688438396fd1b80`

```typescript
  let submitting = false
  async function submit() {
    // Prevent overlapping invocations (e.g. a double-pressed Enter, or the
    // input's native onSubmit racing another dispatch). Without this guard,
    // a second call slips past the empty-input check before the first call
    // clears `store.prompt.input`, then awaits its own `session.create` and
    // ultimately reads the now-empty store — sending a phantom empty prompt
    // to a freshly created session.
    if (submitting) return false
    submitting = true
    try {
      return await submitInner()
    } finally {
      submitting = false
    }
  }
```

**Source:** `packages/tui/test/cli/tui/prompt-submit-race.test.ts:17–20` · blob `fb85a7f5b1288b111be7ea2679003104f3092f0d`

```typescript
// `submitMirror` below has the exact shape of the production `submit()`
// after the fix: an in-flight `submitting` guard wraps the original body.
// Two concurrent invocations must result in exactly one submission carrying
// the user's text, with no empty-text submission.
```

## E08. Facade lifecycle is a placeholder

The host must supply meaningful lifecycle behavior elsewhere; this facade does not implement disposal registration.

**Source:** `packages/tui/src/plugin/api.ts:42–51` · blob `8591ef36024aeeda7785127710d920e9dad236c0`

```typescript
export function createTuiApi(input: Omit<TuiPluginApi, "lifecycle">): TuiPluginApi {
  return {
    ...input,
    lifecycle: {
      signal: new AbortController().signal,
      onDispose() {
        return () => {}
      },
    },
  }
```

## E09. Terminal defaults and suspend compatibility

Attention remains disabled by default; subordinate notification/sound values do not enable it.

**Source:** `packages/tui/src/config/index.tsx:101–120` · blob `de463aa8b09ae8958d06f5de61c55d15b6df5c35`

```typescript
export function resolve(input: Info, options: ResolveOptions): Resolved {
  const keybinds: TuiKeybind.KeybindOverrides = { ...input.keybinds }
  if (!options.terminalSuspend) {
    keybinds.terminal_suspend = "none"
    if (keybinds.input_undo === undefined) {
      const inputUndo = TuiKeybind.defaultValue("input_undo")
      keybinds.input_undo = ["ctrl+z", ...(typeof inputUndo === "string" ? inputUndo.split(",") : [])]
        .filter((value, index, values) => values.indexOf(value) === index)
        .join(",")
    }
  }

  return {
    ...input,
    attention: {
      enabled: input.attention?.enabled ?? false,
      notifications: input.attention?.notifications ?? true,
      sound: input.attention?.sound ?? true,
      volume: input.attention?.volume ?? 0.4,
      sound_pack: input.attention?.sound_pack ?? "orchestra.default",
```

## E10. Transcript is a sorted display projection

Export sorts by time and ID, and omits message kinds outside its explicit cases.

**Source:** `packages/tui/src/util/transcript.ts:22–46` · blob `55e9f1e52a00fb4336753bffec52c66043db28f3`

```typescript
export function formatTranscript(session: SessionInfo, messages: SessionMessage[], options: TranscriptOptions): string {
  const providers = Model.index(options.providers)
  const header =
    `# ${session.title}\n\n` +
    `**Session ID:** ${session.id}\n` +
    `**Created:** ${new Date(session.time.created).toLocaleString()}\n` +
    `**Updated:** ${new Date(session.time.updated).toLocaleString()}\n\n` +
    `---\n\n`
  return messages
    .toSorted((a, b) => a.time.created - b.time.created || a.id.localeCompare(b.id))
    .map((message) => formatMessage(message, options, providers))
    .filter((text) => text !== "")
    .reduce((transcript, text) => transcript + text + `---\n\n`, header)
}

/** One message as Markdown. Host-injected, system and switch messages are not part of the conversation and render empty. */
export function formatMessage(
  message: SessionMessage,
  options: TranscriptOptions,
  providers?: Provider[] | ReadonlyMap<string, Provider>,
): string {
  if (message.type === "user") return `## User\n\n${message.text}\n\n`
  if (message.type === "shell") return `## Shell\n\n\`\`\`\n$ ${message.command}\n${message.output}\n\`\`\`\n\n`
  if (message.type === "compaction") return `## Compaction\n\n${message.summary}\n\n`
  if (message.type !== "assistant") return ""
```

## E11. Selection copy is asynchronous and clears immediately

This preserves the actual timing contract; no clipboard operation ran.

**Source:** `packages/tui/src/util/selection.ts:26–43` · blob `d9158ba407607583bbc15e4b04ffa8550f21aded`

```typescript
export function copy(renderer: Renderer, toast: Toast, clipboard: ClipboardService): boolean {
  const selection = renderer.getSelection()
  if (!selection) return false

  const text = selection.getSelectedText()
  if (!text) return false

  const focus = renderer.currentFocusedRenderable
  const clipboardText =
    focus?.getClipboardText && selection.selectedRenderables.includes(focus) ? focus.getClipboardText(text) : text

  clipboard
    ?.write?.(clipboardText)
    .then(() => toast.show({ message: "Copied to clipboard", variant: "info" }))
    .catch(toast.error)

  renderer.clearSelection()
  return true
```

## E12. Reactive helper cleans its timer

The debounce setter replaces pending work and disposes it with its owner.

**Source:** `packages/tui/src/util/signal.ts:3–17` · blob `e28c680cd4102dd6a11aec21f297c956e1c8cbdf`

```typescript
export function createDebouncedSignal<T>(value: T, ms: number): [Accessor<T>, (value: T) => void] {
  const [get, set] = createSignal(value)
  let timer: ReturnType<typeof setTimeout> | undefined
  const debounced = (next: T) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      set(() => next)
    }, ms)
  }
  onCleanup(() => {
    if (timer) clearTimeout(timer)
  })
  return [get, debounced]
}
```

## E13. Demo request identity and local interception

Demo IDs are intercepted before permission replies can reach the V2 server; synthetic UI results are not tool results.

**Source:** `packages/tui/src/context/demo.ts:49–54` · blob `6f0adbdeb640a83004a8bfeeed978856a363d074`

```typescript
/** Ids of everything the demo makes up start with this, so a reply to one is answered locally. */
export const PREFIX = "demo_"

export function isDemoRequest(id: string) {
  return id.startsWith(PREFIX)
}
```

**Source:** `packages/tui/src/context/sdk.tsx:130–145` · blob `b595aa115e6902542a41bee79be7fc26ca434ded`

```typescript
    // Replies to the requests the mini-mode demo made up are answered here instead of by the server.
    const answerLocally = (type: string, data: Record<string, unknown>) =>
      emitter.emit("event", {
        directory: props.directory ?? "",
        payload: { id: `demo_evt_${type}`, type, data },
      } as GlobalEvent)
    const api = {
      ...v2,
      permissions: {
        ...v2.permissions,
        reply: (input: Parameters<typeof v2.permissions.reply>[0], options?: Parameters<typeof v2.permissions.reply>[1]) =>
          isDemoRequest(input.requestID)
            ? Promise.resolve(
                answerLocally("permission.v2.replied", { sessionID: input.sessionID, requestID: input.requestID, reply: input.reply }),
              )
            : v2.permissions.reply(input, options),
```

**Source:** `packages/tui/src/context/demo.ts:224–233` · blob `6f0adbdeb640a83004a8bfeeed978856a363d074`

```typescript
export function settle(
  requestID: string,
  outcome: { readonly type: "completed"; readonly answers?: readonly (readonly string[])[] } | { readonly type: "error"; readonly error: string },
  now = Date.now(),
): { messageID: string; tool: SessionMessageAssistantTool } | undefined {
  const entry = waiting.get(requestID)
  if (!entry) return undefined
  waiting.delete(requestID)
  const input = entry.tool.state.status === "pending" ? {} : entry.tool.state.input
  const time = { ...entry.tool.time, completed: now }
```

## E14. Replay projection is mini-specific

The helper itself has no CLI-argument validation; ordinary sessions retain their input message array.

**Source:** `packages/tui/src/context/replay.ts:1–12` · blob `572923473d3af34f4c8e2d1f2fda2a8e08c77bd7`

```typescript
/**
 * The messages a mini-mode session shows: `--no-replay` hides what existed when the screen opened, and
 * `--replay-limit N` keeps the newest N of what is left. Outside mini mode every message shows.
 */
export function replayWindow<T extends { readonly time: { readonly created: number } }>(
  messages: readonly T[],
  options: { readonly mini?: boolean; readonly replay?: boolean; readonly limit?: number; readonly openedAt: number },
) {
  if (!options.mini) return messages
  const fresh = options.replay === false ? messages.filter((message) => message.time.created >= options.openedAt) : messages
  return options.limit === undefined ? fresh : fresh.slice(-options.limit)
}
```

## E15. Thinking preference migrates stored values

The default is hide, with legacy boolean migration; this is disclosure state.

**Source:** `packages/tui/src/context/thinking.ts:29–36` · blob `bb1c2a6929f92b936fbc70c7cb52966d02e87f94`

```typescript
export function useThinkingMode() {
  const kv = useKV()
  // Capture pre-state before `kv.signal` seeds a default, so we can detect
  // first-time users with a legacy `thinking_visibility` boolean and migrate.
  // The KVProvider only renders children once kv.ready, so reads here are safe.
  const hadStored = kv.get("thinking_mode") !== undefined
  const legacy = kv.get("thinking_visibility")
  const [stored, setStored] = kv.signal<ThinkingMode>("thinking_mode", "hide")
```

**Source:** `packages/tui/src/context/thinking.ts:48–61` · blob `bb1c2a6929f92b936fbc70c7cb52966d02e87f94`

```typescript
  // Preserve previous experience for users who had explicitly toggled the
  // legacy `thinking_visibility` boolean. First-time users (no legacy key)
  // get the new "hide" default (collapsed thinking).
  if (!hadStored) {
    if (legacy === true) set("show")
    else if (legacy === false) set("hide")
  }

  if ((stored() as string) === "minimal") set("hide")

  const mode = createMemo<ThinkingMode>(() => {
    const value = stored()
    return isThinkingMode(value) ? value : "hide"
  })
```

## E16. Parser source mixes pinned and moving external references

This is declared configuration, not proof that external grammar/query bytes were downloaded or compatible.

**Source:** `packages/tui/src/parsers-config.ts:1–19` · blob `8a5a71fb85391476943224d0b94b1ee257d18481`

```typescript
export default {
  // NOTE: FOR markdown, javascript and typescript, we use the opentui built-in parsers
  // Warn: when taking queries from the nvim-treesitter repo, make sure to include the query dependencies as well
  //       marked with for example `; inherits: ecma` at the top of the file. Just put the dependencies before the actual query.
  //       ALSO: Some queries use breaking changes in the nvim-treesitter repo, that are not compatible with the (web-)tree-sitter parser.
  parsers: [
    {
      filetype: "python",
      wasm: "https://github.com/tree-sitter/tree-sitter-python/releases/download/v0.23.6/tree-sitter-python.wasm",
      queries: {
        highlights: [
          // NOTE: This nvim-treesitter query is currently broken, because the parser is not compatible with the query apparently.
          //       it is using "except" nodes that the parser is complaining about, but it has been in the query for 3+ years.
          //       Unclear.
          // "https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/refs/heads/master/queries/python/highlights.scm",
          "https://github.com/tree-sitter/tree-sitter-python/raw/refs/heads/master/queries/highlights.scm",
        ],
        locals: [
          "https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/refs/heads/master/queries/python/locals.scm",
```

**Source:** `packages/tui/src/routes/session/index.tsx:69–69` · blob `a61f7477250895d31dea4f50e806dadfa45afcd9`

```typescript
addDefaultParsers(parsers.parsers)
```

## E17. UI provider keeps layout locale separate

The fallback and provider wiring do not certify translation completeness.

**Source:** `packages/ui/src/context/i18n.tsx:52–68` · blob `757083f8f7842815c6e835d722a9f8887a9088bc`

```typescript
const fallback: UiI18n = {
  locale: () => "en",
  t: (key, params) => {
    const value = source[key] ?? String(key)
    return resolveTemplate(value, params)
  },
  plural: (key, count, params) =>
    fallback.t(pluralKey(key, pluralCategory(fallback.locale(), count)), { ...params, count }),
}

const Context = createContext<UiI18n>(fallback)

function UiI18nProvider(props: ParentProps<{ value: UiI18n }>) {
  return (
    <I18nProvider locale={(props.value.layoutLocale ?? props.value.locale)()}>
      <Context.Provider value={props.value}>{props.children}</Context.Provider>
    </I18nProvider>
```

## E18. Field synchronizes control accessibility attributes

This is a concrete source mechanism; no screen-reader test ran.

**Source:** `packages/ui/src/v2/components/field-v2.tsx:81–109` · blob `45b5a70b2efb0ae179d41b70e1dd39f4b0ba53cb`

```typescript
  const syncControlA11y = () => {
    const root = rootRef
    if (!root) return

    const control = root.querySelector(CONTROL_SELECTOR) as HTMLInputElement | HTMLTextAreaElement | null
    if (!control) return

    const shell = control.closest(
      "[data-component='text-input-v2'], [data-component='textarea-v2'], [data-component='inline-input-v2']",
    ) as HTMLElement | null

    control.id = controlId
    control.setAttribute("aria-labelledby", labelId)

    const describedBy = ctx.getDescribedBy()
    if (describedBy) {
      control.setAttribute("aria-describedby", describedBy)
    } else {
      control.removeAttribute("aria-describedby")
    }

    if (ctx.invalid()) {
      control.setAttribute("aria-invalid", "true")
      shell?.setAttribute("data-invalid", "")
    } else {
      control.removeAttribute("aria-invalid")
      shell?.removeAttribute("data-invalid")
    }
  }
```

## E19. Segmented-control arrows use DOM-order increments

The shown key handler has no direction lookup, leaving RTL behavioral verification open.

**Source:** `packages/ui/src/v2/components/segmented-control-v2.tsx:158–169` · blob `006b28394f3e611c52746ddf26e88b7a8288a1d5`

```typescript
  const onKeyDown: JSX.EventHandlerUnion<HTMLButtonElement, KeyboardEvent> = (e) => {
    invokeButtonHandler(local.onKeyDown, e)
    if (e.defaultPrevented || disabled()) return
    const t = e.currentTarget

    if (e.key === "ArrowRight") {
      e.preventDefault()
      ctx.focusNext(t, 1)
    } else if (e.key === "ArrowLeft") {
      e.preventDefault()
      ctx.focusNext(t, -1)
    }
```

## E20. Context readiness and worker ownership

Readiness gates consumers. Pools are injected and selected, with no creation or disposal in this wrapper.

**Source:** `packages/ui/src/context/helper.tsx:20–35` · blob `172fed460ec63fc373e616fcbef40d8cb21be5ee`

```typescript
      // Access init.ready inside the memo to make it reactive for getter properties
      const isReady = createMemo(() => {
        // @ts-expect-error
        const ready = init.ready as Accessor<boolean> | boolean | undefined
        return ready === undefined || (typeof ready === "function" ? ready() : ready)
      })
      return (
        <Show when={isReady()}>
          <ctx.Provider value={init}>{props.children}</ctx.Provider>
        </Show>
      )
    },
    use() {
      const value = useContext(ctx)
      if (!value) throw new Error(`${input.name} context must be used within a context provider`)
      return value
```

**Source:** `packages/ui/src/context/worker-pool.tsx:9–20` · blob `5f788f7866abfd25e701e37ea377d416f87a4e4f`

```typescript
const ctx = createSimpleContext<WorkerPools, { pools: WorkerPools }>({
  name: "WorkerPool",
  init: (props) => props.pools,
})

export const WorkerPoolProvider = ctx.provider

export function useWorkerPool(diffStyle: "unified" | "split" | undefined) {
  const pools = ctx.use()
  if (diffStyle === "split") return pools.split
  return pools.unified
}
```

## E21. Theme formats have different contracts

Terminal defs/theme and desktop light/dark variants must not be treated as one schema.

**Source:** `packages/tui/src/theme/index.ts:120–128` · blob `bcdeff3a46e498bf1aadbcac39d6c149030657fb`

```typescript
export type ThemeJson = {
  $schema?: string
  defs?: Record<string, HexColor | RefName>
  theme: Omit<Record<ThemeColor, ColorValue>, "selectedListItemText" | "backgroundMenu"> & {
    selectedListItemText?: ColorValue
    backgroundMenu?: ColorValue
    thinkingOpacity?: number
  }
}
```

**Source:** `packages/ui/src/theme/types.ts:35–49` · blob `2284659b48426bc293c744916583260d3c4aa3f5`

```typescript
type ThemeVariantBase = {
  overrides?: Record<string, ColorValue>
  v2Overrides?: Record<string, V2ColorValue>
}

export type ThemeVariant =
  | ({ seeds: ThemeSeedColors; palette?: never } & ThemeVariantBase)
  | ({ palette: ThemePaletteColors; seeds?: never } & ThemeVariantBase)

export interface DesktopTheme {
  $schema?: string
  name: string
  id: string
  light: ThemeVariant
  dark: ThemeVariant
```

## E22. Actual schema generator and mirror source

These are the precise owners of the assigned editor schemas. Python additionally verified exact desktop-schema copy equality; no generator ran.

**Source:** `apps/cli/script/schema-files.ts:68–80` · blob `b965bf921f0a75ab6abfd2149e1d24b50f86f83b`

```typescript
export const configSchemaFile = path.resolve(import.meta.dir, "../../../schema/config.json")
export const tuiSchemaFile = path.resolve(import.meta.dir, "../../../schema/tui.json")
export const themeSchemaFile = path.resolve(import.meta.dir, "../../../schema/theme.json")
export const themeSchemaSource = path.resolve(import.meta.dir, "../../../packages/ui/src/theme/desktop-theme.schema.json")

export const configSchemaText = () => JSON.stringify(generateEffect(Config.Info), null, 2)
export const tuiSchemaText = () => JSON.stringify(generateEffect(TuiConfig.Info), null, 2)

// schema/ is what editors fetch through the $schema URLs; the theme schema is hand-written in packages/ui and mirrored verbatim.
if (import.meta.main) {
  await Bun.write(configSchemaFile, configSchemaText())
  await Bun.write(tuiSchemaFile, tuiSchemaText())
  await Bun.write(themeSchemaFile, Bun.file(themeSchemaSource))
```

## E23. Verified file and provider sprite generation

The config declares these two outputs. It does not declare an app-icons producer.

**Source:** `packages/ui/vite.config.ts:10–24` · blob `b89c666ae19be83a567d525687404fb6bc137857`

```typescript
    iconsSpritesheet([
      {
        withTypes: true,
        inputDir: "src/assets/icons/file-types",
        outputDir: "src/components/file-icons",
        formatter: "prettier",
      },
      {
        withTypes: true,
        inputDir: "src/assets/icons/provider",
        outputDir: "src/components/provider-icons",
        formatter: "prettier",
        iconNameTransformer: (iconName) => iconName,
      },
    ]),
```

**Source:** `packages/ui/vite.config.ts:47–58` · blob `b89c666ae19be83a567d525687404fb6bc137857`

```typescript
async function fetchProviderIcons() {
  const url = process.env.ORCHESTRA_MODELS_URL || "https://models.dev"
  const providers = await fetch(`${url}/api.json`)
    .then((res) => res.json())
    .then((json) => Object.keys(json))
  await Promise.all(
    providers.map((provider) =>
      fetch(`${url}/logos/${provider}.svg`)
        .then((res) => res.text())
        .then((svg) => fs.writeFileSync(`./src/assets/icons/provider/${provider}.svg`, svg)),
    ),
  )
```

## E24. Bundled fonts do not establish loading

The exported Font component is empty. Actual font loading requires a consumer boundary.

**Source:** `packages/ui/src/components/font.tsx:1–1` · blob `f89dfafe1db32114fde53f9581a7c46992512092`

```typescript
export const Font = () => null
```

## E25. Storybook accessibility remains a todo

A configured workbench is not a test pass.

**Source:** `apps/storybook/.storybook/preview.tsx:98–110` · blob `a6052bf222a2146b2aca63109d3583f1cef399fd`

```typescript
  parameters: {
    actions: {
      argTypesRegex: "^on.*",
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      test: "todo",
    },
```

## E26. Workbench CSS editing writes source

The development middleware is capable of source mutation; no middleware request was made.

**Source:** `apps/storybook/.storybook/playground-css-plugin.ts:113–124` · blob `cc73ecf667fd444d0d1ddde9ba30f9487906bead`

```typescript
              continue
            }

            try {
              const content = fs.readFileSync(abs, "utf-8")
              const applied = applyEdits(content, edits)
              results.push(...applied.results)

              if (applied.results.some((r) => r.ok)) {
                fs.writeFileSync(abs, applied.content, "utf-8")
              }
            } catch (err) {
```

## E27. Historical verification is explicitly limited

This past receipt is not a current product test result.

**Source:** `docs/specs/frontend-recovery-receipt.json:66–71` · blob `ab453aa29c818d7c84e0d9e50502c519d7429c6c`

```json
  "explicitLimits": [
    "CI was not run or published in this task.",
    "No live model turns using owner credentials were performed.",
    "Packaged desktop behavior on Windows/Linux and real screen-reader coverage remain unverified.",
    "Core V2 model policy and Task enforcement are implemented. CCSDK execution requires its host consumer of the same guard; native Task explicitly rejects unsupported CC targets.",
    "Older V2 servers lacking the new endpoints receive explanatory unsupported states; current V2 supports model policy, archive, archived listing and restore."
```

## E28. README render relationship is explicit

Only assigned output basenames matching HTML inputs are mapped to this loop; binary equivalence is unverified.

**Source:** `docs/images/readme/src/render.sh:1–19` · blob `2e3769d9b7c6577c7252d85bce9110ab0c3c92e8`

```bash
#!/bin/sh
# Renders each diagram in src/ to ../<name>-dark.png and ../<name>-light.png at 2x with headless Chrome,
# sized to the canvas, then quantizes the PNG to keep the README light.
# Usage: sh docs/images/readme/src/render.sh [name...]
set -e
dir=$(cd "$(dirname "$0")" && pwd)
chrome="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
names=${*:-$(cd "$dir" && ls *.html | sed 's/\.html$//')}
for name in $names; do
  height=$("$chrome" --headless=new --disable-gpu --window-size=1200,900 --virtual-time-budget=3000 \
    --dump-dom "file://$dir/$name.html" 2>/dev/null | sed -n 's:.*<title>\([0-9]*\)</title>.*:\1:p' | head -1)
  for theme in dark light; do
    out="$dir/../$name-$theme.png"
    "$chrome" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
      --window-size=1200,"${height:-900}" --virtual-time-budget=3000 \
      --screenshot="$out" "file://$dir/$name.html#$theme" >/dev/null 2>&1
    python3 -c "import sys; from PIL import Image; Image.open(sys.argv[1]).convert('RGB').quantize(256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG).save(sys.argv[1], optimize=True)" "$out"
  done
done
```

## Evidence integrity and unresolved transport boundary

The initial `fetch_file` response for `schema/tui.json` supplied an empty body. A second read using the assigned exact blob SHA recovered 1,131,057 bytes and passed Git blob SHA verification. Both original responses remain in the capture record. The controller-reported 256,000-byte observer limit is an import/runtime constraint; the semantic source is available here.

This document contains 28 critical-claim groups, 40 bounded source slices and 535 quoted source lines. No historical PASS label has been promoted to a result of this task.


# Resumed correction evidence

## tui-adapter

Complete adapter contract and mapping; no execution, transaction, fallback or retry proof.

Source: `packages/tui/src/context/session-actions.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `255420d1e93ce0fca21b941c673abdede087e91e`; SHA-256 `e858f281b3b0a8ac722faadab2d0f7218d846b968e02f9ec06a0d32e958d82bd`.

Exact lines 4–92:

```ts
type Client = ReturnType<typeof Orchestra.make>
type Model = { providerID: string; modelID: string; variant?: string }

// The V2 server serves these session actions under `/api/session/:id/*`. The legacy `/session/:id/*`
// routes (abort, shell, command, summarize, revert, unrevert) are not served by it.
export function createSessionActions(client: Client) {
  async function select(input: { sessionID: string; agent: string; model: Model }) {
    await client.sessions.switchAgent({ sessionID: input.sessionID, agent: input.agent })
    await client.sessions.switchModel({
      sessionID: input.sessionID,
      model: { providerID: input.model.providerID, id: input.model.modelID, variant: input.model.variant },
    })
  }

  return {
    // Without a directory the V2 server places the Session in its own working directory.
    create: (input: { agent: string; model: Model; directory?: string; workspaceID?: string }) =>
      client.sessions.create({
        agent: input.agent,
        model: { providerID: input.model.providerID, id: input.model.modelID, variant: input.model.variant },
        location: input.directory ? { directory: input.directory, workspaceID: input.workspaceID } : undefined,
      }),
    // The earlier runtime sent the agent and model with every prompt; V2 prompts run on the Session's selection, so select first.
    // Editor context was a hidden synthetic part in the earlier runtime; V2 admits it as a synthetic input that does not wake the
    // Session, so the prompt that follows carries it into the same turn.
    async prompt(input: {
      sessionID: string
      text: string
      context?: string
      agent: string
      model: Model
      files: ReadonlyArray<Pick<TuiPromptFilePart, "url" | "filename" | "source">>
      agents: ReadonlyArray<Pick<TuiPromptAgentPart, "name" | "source">>
    }) {
      await select(input)
      if (input.context)
        await client.sessions.synthetic({ sessionID: input.sessionID, text: input.context, resume: false })
      return client.sessions.prompt({
        sessionID: input.sessionID,
        prompt: {
          text: input.text,
          files: input.files.map(toFile),
          agents: input.agents.map((agent) => ({
            name: agent.name,
            source: agent.source
              ? { start: agent.source.start, end: agent.source.end, text: agent.source.value }
              : undefined,
          })),
        },
      })
    },
    interrupt: (sessionID: string) => client.sessions.interrupt({ sessionID }),
    // V2 compaction uses the Session's own model, so no model is passed.
    compact: (sessionID: string) => client.sessions.compact({ sessionID }),
    // V2 shell records the command and its output for the next turn; it takes no agent or model.
    shell: (input: { sessionID: string; command: string }) => client.sessions.shell(input),
    reply: (input: { sessionID: string; requestID: string; reply: "once" | "always" | "reject" }) =>
      client.permissions.reply(input),
    revert: (input: { sessionID: string; messageID: string }) => client.sessions.stage({ ...input, files: true }),
    unrevert: (sessionID: string) => client.sessions.clear({ sessionID }),
    // V2 commands run on the Session's selected agent and model, so select them first.
    async command(input: {
      sessionID: string
      command: string
      arguments: string
      agent: string
      model: Model
      files: ReadonlyArray<Pick<TuiPromptFilePart, "url" | "filename" | "source">>
    }) {
      await select(input)
      return client.sessions.command({
        sessionID: input.sessionID,
        command: input.command,
        arguments: input.arguments,
        files: input.files.map(toFile),
      })
    },
  }
}

function toFile(file: Pick<TuiPromptFilePart, "url" | "filename" | "source">) {
  return {
    uri: file.url,
    name: file.filename,
    source: file.source?.text
      ? { start: file.source.text.start, end: file.source.text.end, text: file.source.text.value }
      : undefined,
  }
}
```

## tui-session-protocol-create-select-admit

Exact create, selection, prompt, command and compact route contracts with declared semantics.

Source: `packages/protocol/src/groups/session.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `5830f50001c8dc01227a920f04276054c0e29570`; SHA-256 `2dad331fa3b169d4eff2f870b70a4524f24497cb4a08dda3ee4a09cf3783af1f`.

Exact lines 157–165:

```ts
      HttpApiEndpoint.post("session.create", "/api/session", {
        payload: Schema.Struct({
          id: Session.ID.pipe(Schema.optional),
          agent: Agent.ID.pipe(Schema.optional),
          model: Model.Ref.pipe(Schema.optional),
          location: Location.Ref.pipe(Schema.optional),
        }),
        success: Schema.Struct({ data: Session.Info }),
        error: SessionNotFoundError,
```

Exact lines 301–394:

```ts
      HttpApiEndpoint.post("session.switchAgent", "/api/session/:sessionID/agent", {
        params: { sessionID: Session.ID },
        payload: Schema.Struct({ agent: Agent.ID }),
        success: HttpApiSchema.NoContent,
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.switchAgent",
            summary: "Switch session agent",
            description: "Switch the agent used by subsequent provider turns.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.post("session.switchModel", "/api/session/:sessionID/model", {
        params: { sessionID: Session.ID },
        payload: Schema.Struct({ model: Model.Ref }),
        success: HttpApiSchema.NoContent,
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.switchModel",
            summary: "Switch session model",
            description: "Switch the model used by subsequent provider turns.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.post("session.prompt", "/api/session/:sessionID/prompt", {
        params: { sessionID: Session.ID },
        payload: Schema.Struct({
          id: SessionMessage.ID.pipe(Schema.optional),
          prompt: PromptInput.Prompt,
          delivery: SessionInput.Delivery.pipe(Schema.optional),
          resume: Schema.Boolean.pipe(Schema.optional),
        }),
        success: Schema.Struct({ data: SessionInput.Admitted }),
        error: [ConflictError, SessionNotFoundError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.prompt",
            summary: "Send message",
            description: "Durably admit one session input and schedule agent-loop execution unless resume is false.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.post("session.command", "/api/session/:sessionID/command", {
        params: { sessionID: Session.ID },
        payload: Schema.Struct({
          id: SessionMessage.ID.pipe(Schema.optional),
          command: Schema.String,
          arguments: Schema.String.pipe(Schema.optional),
          files: PromptInput.Prompt.fields.files,
          agents: PromptInput.Prompt.fields.agents,
          delivery: SessionInput.Delivery.pipe(Schema.optional),
          resume: Schema.Boolean.pipe(Schema.optional),
        }),
        success: Schema.Struct({ data: SessionInput.Admitted }),
        error: [ConflictError, SessionNotFoundError, InvalidRequestError, UnknownError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.command",
            summary: "Run command",
            description:
              "Render a configured command or an MCP prompt (`server:prompt`) with its arguments and admit the result as one session input.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.post("session.compact", "/api/session/:sessionID/compact", {
        params: { sessionID: Session.ID },
        success: Schema.Struct({ data: Schema.Struct({ compacted: Schema.Boolean }) }).annotate({
          identifier: "SessionCompactResult",
        }),
        error: [SessionNotFoundError, ConflictError, UnknownError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.compact",
            summary: "Compact session",
            description:
              "Summarize the conversation now into a compaction checkpoint. `compacted` is false when there was nothing to summarize. A running Session is refused as busy.",
          }),
        ),
```

## tui-session-protocol-other-actions

Exact shell/synthetic/stage/clear/commit/interrupt declarations; adapter exposes no commit action.

Source: `packages/protocol/src/groups/session.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `5830f50001c8dc01227a920f04276054c0e29570`; SHA-256 `2dad331fa3b169d4eff2f870b70a4524f24497cb4a08dda3ee4a09cf3783af1f`.

Exact lines 431–443:

```ts
      HttpApiEndpoint.post("session.shell", "/api/session/:sessionID/shell", {
        params: { sessionID: Session.ID },
        payload: Schema.Struct({ id: Schema.String.pipe(Schema.optional), command: Schema.NonEmptyString }),
        success: HttpApiSchema.NoContent,
        error: [SessionNotFoundError, ConflictError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.shell",
            summary: "Run shell command",
            description:
              "Run a shell command in the Session's location and record it with its output for the next turn. No turn starts.",
```

Exact lines 464–479:

```ts
      HttpApiEndpoint.post("session.synthetic", "/api/session/:sessionID/synthetic", {
        params: { sessionID: Session.ID },
        payload: Schema.Struct({
          id: SessionMessage.ID.pipe(Schema.optional),
          text: Schema.String,
          resume: Schema.Boolean.pipe(Schema.optional),
        }),
        success: Schema.Struct({ data: Schema.Struct({ id: SessionMessage.ID }) }),
        error: [SessionNotFoundError, ConflictError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.synthetic",
            summary: "Add synthetic context",
            description: "Record text as synthetic context, then run a turn unless resume is false.",
```

Exact lines 550–582:

```ts
      HttpApiEndpoint.post("session.revert.stage", "/api/session/:sessionID/revert/stage", {
        params: { sessionID: Session.ID },
        payload: Schema.Struct({ messageID: SessionMessage.ID, files: Schema.Boolean.pipe(Schema.optional) }),
        success: Schema.Struct({ data: Revert.State }),
        error: [MessageNotFoundError, SessionNotFoundError, UnknownError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.revert.stage",
            summary: "Stage session revert",
            description: "Stage or move a reversible session boundary and optionally apply its file changes.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.post("session.revert.clear", "/api/session/:sessionID/revert/clear", {
        params: { sessionID: Session.ID },
        success: HttpApiSchema.NoContent,
        error: [SessionNotFoundError, UnknownError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(OpenApi.annotations({ identifier: "v2.session.revert.clear", summary: "Clear staged revert" })),
    )
    .add(
      HttpApiEndpoint.post("session.revert.commit", "/api/session/:sessionID/revert/commit", {
        params: { sessionID: Session.ID },
        success: HttpApiSchema.NoContent,
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({ identifier: "v2.session.revert.commit", summary: "Commit staged revert" }),
```

Exact lines 655–665:

```ts
      HttpApiEndpoint.post("session.interrupt", "/api/session/:sessionID/interrupt", {
        params: { sessionID: Session.ID },
        success: HttpApiSchema.NoContent,
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.interrupt",
            summary: "Interrupt session execution",
            description: "Interrupt active execution owned by this Orchestra process. Idle interruption is a no-op.",
```

## tui-permission-protocol

Both IDs, reply payload, optional message and declared missing-session/request errors.

Source: `packages/protocol/src/groups/permission.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `a34d8726146a5cdc1b989b583a4943290584d34b`; SHA-256 `9cef92dd60326651b2ee4b6d5946e4381ea6791076c017da532122b9be0fa1ab`.

Exact lines 119–134:

```ts
      HttpApiEndpoint.post("session.permission.reply", "/api/session/:sessionID/permission/:requestID/reply", {
        params: { sessionID: Session.ID, requestID: Permission.ID },
        payload: Schema.Struct({
          reply: Permission.Reply,
          message: Schema.String.pipe(Schema.optional),
        }),
        success: HttpApiSchema.NoContent,
        error: [SessionNotFoundError, PermissionNotFoundError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.permission.reply",
            summary: "Reply to pending permission request",
            description: "Respond to a pending permission request owned by a session.",
          }),
```

## tui-request-assertions

Real-client/replaced-transport assertions for paths, bodies and order; read only, never run.

Source: `packages/tui/test/context/session-actions.test.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `9d22d47f255e6a1c73a1ce2bfe40ce87c467a27a`; SHA-256 `48423aa811be59b328fc29d306cca600f8aa9aaa91a96e1e53b832cb59e39e42`.

Exact lines 5–27:

```ts
// The real client builds every request; only the transport is replaced, to record what it sends.
function recorder() {
  const calls: { method: string; path: string; body: unknown }[] = []
  const fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      calls.push({
        method: request.method,
        path: new URL(request.url).pathname,
        body: request.body ? await request.json() : undefined,
      })
      if (request.url.endsWith("/compact")) return Response.json({ data: { compacted: true } })
      if (request.url.endsWith("/prompt") || request.url.endsWith("/synthetic"))
        return Response.json({ data: { id: "msg_1" } })
      if (request.method === "POST" && request.url.endsWith("/api/session"))
        return Response.json({ data: { id: "ses_new" } })
      return request.url.endsWith("/revert/stage") || request.url.endsWith("/command")
        ? Response.json({ data: {} })
        : new Response(null, { status: 204 })
    },
    { preconnect: globalThis.fetch.preconnect },
  )
  return { calls, actions: createSessionActions(Orchestra.make({ baseUrl: "http://localhost:1", fetch })) }
```

Exact lines 30–62:

```ts
test("interrupt, compact, shell, revert and unrevert hit the V2 session routes", async () => {
  const { calls, actions } = recorder()
  await actions.interrupt("ses_1")
  await actions.compact("ses_1")
  await actions.shell({ sessionID: "ses_1", command: "ls" })
  await actions.revert({ sessionID: "ses_1", messageID: "msg_1" })
  await actions.unrevert("ses_1")
  expect(calls).toEqual([
    { method: "POST", path: "/api/session/ses_1/interrupt", body: undefined },
    { method: "POST", path: "/api/session/ses_1/compact", body: undefined },
    { method: "POST", path: "/api/session/ses_1/shell", body: { command: "ls" } },
    { method: "POST", path: "/api/session/ses_1/revert/stage", body: { messageID: "msg_1", files: true } },
    { method: "POST", path: "/api/session/ses_1/revert/clear", body: undefined },
  ])
})

test("command selects the agent and model, then maps file parts to V2 files", async () => {
  const { calls, actions } = recorder()
  await actions.command({
    sessionID: "ses_1",
    command: "review",
    arguments: "src",
    agent: "build",
    model: { providerID: "p", modelID: "m", variant: "high" },
    files: [{ url: "file:///a.ts", filename: "a.ts", source: undefined }],
  })
  expect(calls.map((call) => call.path)).toEqual([
    "/api/session/ses_1/agent",
    "/api/session/ses_1/model",
    "/api/session/ses_1/command",
  ])
  expect(calls[1].body).toEqual({ model: { providerID: "p", id: "m", variant: "high" } })
  expect(calls[2].body).toEqual({ command: "review", arguments: "src", files: [{ uri: "file:///a.ts", name: "a.ts" }] })
```

Exact lines 65–85:

```ts
test("create places the Session in the given directory with the chosen agent and model", async () => {
  const { calls, actions } = recorder()
  await actions.create({
    agent: "build",
    model: { providerID: "p", modelID: "m" },
    directory: "/repo/app",
    workspaceID: "ws_1",
  })
  await actions.create({ agent: "build", model: { providerID: "p", modelID: "m" } })
  expect(calls).toEqual([
    {
      method: "POST",
      path: "/api/session",
      body: {
        agent: "build",
        model: { providerID: "p", id: "m" },
        location: { directory: "/repo/app", workspaceID: "ws_1" },
      },
    },
    { method: "POST", path: "/api/session", body: { agent: "build", model: { providerID: "p", id: "m" } } },
  ])
```

Exact lines 88–149:

```ts
test("prompt selects agent and model, admits editor context without waking, then sends the prompt", async () => {
  const { calls, actions } = recorder()
  await actions.prompt({
    sessionID: "ses_1",
    text: "fix @a.ts with @review",
    context: "selection: line 3",
    agent: "build",
    model: { providerID: "p", modelID: "m", variant: "high" },
    files: [
      {
        url: "file:///a.ts",
        filename: "a.ts",
        source: { type: "file", path: "a.ts", text: { start: 4, end: 9, value: "@a.ts" } },
      },
    ],
    agents: [{ name: "review", source: { start: 15, end: 22, value: "@review" } }],
  })
  expect(calls).toEqual([
    { method: "POST", path: "/api/session/ses_1/agent", body: { agent: "build" } },
    {
      method: "POST",
      path: "/api/session/ses_1/model",
      body: { model: { providerID: "p", id: "m", variant: "high" } },
    },
    { method: "POST", path: "/api/session/ses_1/synthetic", body: { text: "selection: line 3", resume: false } },
    {
      method: "POST",
      path: "/api/session/ses_1/prompt",
      body: {
        prompt: {
          text: "fix @a.ts with @review",
          files: [{ uri: "file:///a.ts", name: "a.ts", source: { start: 4, end: 9, text: "@a.ts" } }],
          agents: [{ name: "review", source: { start: 15, end: 22, text: "@review" } }],
        },
      },
    },
  ])
})

test("prompt without editor context sends no synthetic input", async () => {
  const { calls, actions } = recorder()
  await actions.prompt({
    sessionID: "ses_1",
    text: "hi",
    agent: "build",
    model: { providerID: "p", modelID: "m" },
    files: [],
    agents: [],
  })
  expect(calls.map((call) => call.path)).toEqual([
    "/api/session/ses_1/agent",
    "/api/session/ses_1/model",
    "/api/session/ses_1/prompt",
  ])
})

test("reply answers the permission request on the V2 route", async () => {
  const { calls, actions } = recorder()
  await actions.reply({ sessionID: "ses_1", requestID: "per_1", reply: "once" })
  expect(calls).toEqual([
    { method: "POST", path: "/api/session/ses_1/permission/per_1/reply", body: { reply: "once" } },
  ])
```

