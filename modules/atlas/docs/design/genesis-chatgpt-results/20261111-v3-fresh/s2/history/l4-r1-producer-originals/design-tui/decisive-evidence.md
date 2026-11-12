# Decisive evidence for s2.l4.design-tui

## Scope and claim classes

This operational guidance uses accepted L3 explanations at source revision `1cde2ff7a71bcf7aecb5d030917b577165135d38`, including the accepted corrected design/TUI r2 body. The protocol pin remains `ee2521a5b966bd505cc95bd1c733e09e12f33531`. It does not add a source domain, revise product behavior or claim an executed check. Repository and captured-skill directives are attributed instructions; their prose is not evidence that every callsite complies. Diagnosis, stopping/deepening and factual-dependent rebuild guidance are maintenance recommendations drawn from the accepted boundaries.

Newly explicit primary facts concern the exact TUI/UI typecheck scripts, the UI build and generator aliases, the absence of a declared Storybook typecheck script, the precise TuiConfig.Info/composer edit owners and the CLI generator’s three schema writes. Current root/package test/localization/benchmark instructions and the log/RTL skills were read directly. These facts and attributed policies are supported by bounded exact excerpts below. No CI runner implementation, helper runtime, corpus website or platform environment was newly inspected.

## Exact accepted inputs

| Factual build artifact | Accepted body SHA256 | Bytes |
| --- | --- | --- |
| `s2.l3.design-tui` — `deliverable/layers/l3/design-tui/body.md` | `cbd099450a7072e72449b9fd3ef31b5032f171f64f7222405abfce0b88072730` | 15780 |
| `s2.l3.app-session` — `deliverable/layers/l3/app-session/body.md` | `7611e2ddfb015b2538a2d38a174d383e47bac7e2879e83f9622146ed30cf80b7` | 14334 |
| `s2.l3.desktop-web` — `deliverable/layers/l3/desktop-web/body.md` | `fb0609ee88fddc8a87b36b16d584fcd5d074842052cf7d092cc7aaa9bd11f37e` | 14715 |

Consumed manifests, relative to `deliverable/`:

- `accepted/l1.json` — SHA256 `8bb7bb5298f42eefe3fb34246a8303ad974947ef54ac99f1390ed40e276644c8`.
- `accepted/l2.json` — SHA256 `27db0efc4d2495a7666117abe57907d2bd9e46c1e9bbef3b27ca23140c2ae36c`.
- `accepted/l3.json` — SHA256 `dabee552a1eca7242365072a06604d3468b4de6be04a0085ed70286dbed1497b`.

The three manifests were read as allowed metadata and hash-verified. No review-response reference was followed. L1/L2 are lineage pins; the three accepted L3 bodies actually consumed are the direct build dependencies. The three L4 keys in navigation were neither read nor used as factual evidence.

## Maintenance synthesis mapped to accepted sections

| L4 material | Accepted predecessor sections | Direct support and inference boundary |
| --- | --- | --- |
| Orientation and initial identity capture | `s2.l3.design-tui` §Orientation and accepted ownership; §Terminal input becomes admission through ordered, separate operations. | Retains 2,087 paths/67 families/13 metadata-only limits, historical SDK-only versus current Core-permitting ownership, and README/preset discrepancy. Recording the relevant identities before editing is a maintenance recommendation, not a new persistence mechanism. |
| Submission and API compatibility | `s2.l3.design-tui` §Terminal input becomes admission through ordered, separate operations; §Ambiguous sends, live projection and request decisions keep different identities. `s2.l3.app-session` §Submit once, then hand the draft to its session. | S10 identifies the actual composer entry/dispatch location. S01 attributes regeneration and runtime dependency instructions. Browser identity/policy/restoration constraints stay scoped; no blind TUI stable-ID retry or all-failure restoration is inferred. |
| UI lifecycle, accessibility and typed copy | `s2.l3.design-tui` §Rendered state follows caller and resource lifetimes; §Language and appearance cross app and host contracts. `s2.l3.app-session` §Render and localize under caller-owned lifetimes. | S02–S05 supply instructions for keys/copy, typed app/native APIs, shared grammar/locale ownership and behavioral RTL checks. The corrected L3 contract and known startup exception are retained. Direction, cleanup, labels and sanitizer placement do not become runtime/a11y proof. |
| Themes, assets and generated products | `s2.l3.design-tui` §Generated products reach consumers through distinct maintenance paths; §Language and appearance cross app and host contracts. `s2.l3.desktop-web` §Carry changes through shared UI and distribution. | S11–S12 pin TuiConfig.Info, generator import and all three schema outputs; S08 gives exact token-generator aliases and build declaration. Named producers do not establish all generated provenance, external logo reproducibility, rights or installed output. |
| Operational diagnosis | `s2.l3.design-tui` §Ambiguous sends, live projection and request decisions keep different identities. `s2.l3.desktop-web` §Launch, choose a server and identify the health decision; §Cross renderer, preload and main with a scoped capability. | S03 forbids restart; S04 attributes preload/main registration instructions; S06 attributes log/observer/error-handling policy. Health predicates, stable-exit discrepancy and channel-specific admission remain actual accepted boundaries, not proof of an exploit or host recovery. |
| Verification and update/stop consequences | `s2.l3.design-tui` §Change impact and verification ownership; §Generated products reach consumers through distinct maintenance paths. `s2.l3.app-session` §Recover the projection without inventing execution recovery. | S01 gives the exact CI template and named-file behavior; S03 gives benchmark instructions; S07–S09 give package script declarations. Existing tests remain source routes, not results. Package-selector implementation remains uninspected; dependent-evidence rebuild guidance is a maintenance recommendation. |

## Exact primary excerpts

`sources.json` SHA256 `16582ee7bae87983ed0fc3fca82fa7f2d6c1f773191c37b70ff0667810f98c2c` binds the following 12 actually used captures to commit, repository path, Git blob SHA, SHA256, byte length, local capture/original response path and actual inspection ranges. Whole-capture hashing is not whole-file behavioral inspection. Source snippets are exact text from the stated captured line ranges.

### S01 — `AGENTS.md`

Attributed public API/client-generation and runtime-dependency directions, exact CI-only product-test route and admission/execution/recovery limits.

Exact capture lines 1–2:

```markdown
- After changing the public Protocol or Server `HttpApi`, run `bun run generate` from `packages/client`. Do not edit `src/generated` or `src/generated-effect` directly.
- Keep runtime dependencies directed from Schema to Core and Protocol, then from Core and Protocol to Server. Client runtime code may depend on Schema and Protocol but never Core or Server; `sdk-next` composes Client, Core, and Server.
```

Exact capture lines 159–166:

```markdown
- Test actual implementation, do not duplicate logic into tests
- Tests run on GitHub Actions, never on this machine. From the repository root: `bun run test:ci <package> [test files...] [-t pattern] [--os linux|windows|both]`, for example `bun run test:ci maestro test/roster.test.ts`.
  - Named test files run exactly and in the order given. Any other argument, such as a directory, is a Bun substring filter that may match several files, which Bun runs in its own order.
  - It uploads a snapshot of your working tree to a temporary `ci-run-*` branch, waits for the `test-ci` workflow, prints the result and exits non-zero when tests fail. No commit is needed; untracked files that are not gitignored are included, so keep secrets out of the tree.
  - A run takes a few minutes: give the shell call a long timeout or run it in the background.
  - A Python package (a `requirements-dev.txt` and no `package.json`) runs pytest instead. In a package with both, such as `modules/relay`, naming only `.py` files runs pytest, for example `bun run test:ci relay tests/test_authoring.py`, and anything else runs `bun test`; `-t` becomes pytest's `-k`.
  - The omni positive control (`script/test-omni-control.ts`) prints one `omni positive control:` line per run, and `test:ci` fails a job without it or whose verdict is neither `pass` nor `not applicable`. Full lanes and whole-package `test:ci` runs expect every run to spawn through omni; a narrower `test:ci` run (`ORCHESTRA_OMNI_CONTROL=declared`, derived from the request) expects it only from tests that declared it. A test that must spawn through omni calls `expectSpawn(import.meta.path)` from `packages/core/test/fixture/omni-expect.ts` in its body, before it spawns; it then fails unless it made an omni spawn of its own. `packages/core/test/omni-expect-guard.test.ts` requires the call in test files that import omni's spawn surface. `test:ci` accepts only `1` or `strict` for `--env ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER`: `0` or a typo would run the tests on legacy with the control off. Legacy rollback runs only in test.yml's named lanes.
  - A local `bun test` stops with a pointer to `test:ci` (`script/test-guard.ts`). Only the owner may allow a local run, with `ORCHESTRA_LOCAL_TESTS=1`.
```

Exact capture lines 209–210:

```markdown
- Keep durable prompt admission separate from model execution. `SessionV2.prompt(...)` admits one durable `session_input` row before scheduling advisory `SessionExecution.wake(sessionID)` unless `resume: false` requests admit-only behavior. The serialized runner promotes admitted inputs into visible user messages at safe boundaries.
- Reusing a Session ID adopts the existing Session. Reusing a prompt message ID reconciles an exact retry only when Session, prompt, and delivery mode match; conflicting reuse fails. Historical projected prompts lazily synthesize promoted inbox records during exact retry.
```

Exact capture lines 214–216:

```markdown
- Keep local Session drains process-local until clustering is implemented. `SessionRunCoordinator` joins explicit same-Session resumes, coalesces prompt wakeups, and allows different Sessions to run concurrently. Advisory wakes drain eligible durable inbox rows only; post-crash continuation recovery requires a separate explicit design before it may retry provider work. A drain has no durable identity or transcript boundary.
- Keep delivery vocabulary explicit. Prompts steer by default and promote at the next safe provider-turn boundary while the current drain requires continuation. An explicit `queue` input remains pending until the Session would otherwise become idle; promote one queued input at that boundary, then reevaluate continuation before promoting another. Promoting any new user input resets the selected agent's provider-turn allowance; a batch of steers resets it once.
- Keep EventV2 replay owner claims separate from clustered Session execution ownership.
```

### S02 — `packages/ui/AGENTS.md`

Attributed i18n keys/copy preservation, complete phrases, corpus verification and uncertainty obligations.

Exact capture lines 3–9:

```markdown
- NEVER hardcode user-visible English strings in production code. ALWAYS use an i18n key for component defaults, visible copy, placeholders, accessible labels, tooltips, dialogs, toasts, empty states, and displayed errors.
- When migrating existing copy to i18n, preserve the English text byte-for-byte unless the task explicitly requests a copy change.
- NEVER change existing English text or English keys to facilitate translation. English is intentional, designer-written source copy; adapt locale-specific translations and i18n mechanics around it.
- Do not translate from model knowledge alone. Verify terminology and grammar with Unicode CLDR locale/plural data, Microsoft Localization Style Guides and terminology, Apple localization/style guidance and localized platform UI, Mozilla localization style guides, Mozilla Pontoon, and the Firefox localization corpus at `github.com/mozilla-l10n/firefox-l10n`.
- For developer-facing terminology, prefer established usage in the target language's developer community over literal translations. Cross-check maintained Firefox, KDE, and VS Code localizations, using at least two independent corpora when available. Keep established English loanwords and acronyms instead of inventing unfamiliar terms.
- Translate whole UI phrases in context rather than substituting glossary words. Audit recurring concepts for consistency and review every exact-English value; retain it only when it is an intentional product/provider/tool name, URL, code token, keyboard legend, acronym, asset name, or established borrowing.
- Record the corpora used and flag uncertain or regional terminology in review notes.
```

### S03 — `packages/app-shell/AGENTS.md`

Attributed benchmark requirement, prohibition on restarting app/server, typed language API ownership and localization review obligations.

Exact capture lines 3–8:

```markdown
- Prioritise, in this order: stability, simplicity, performance.
- Before changing session or timeline code, record a production benchmark baseline and compare it after the change.

## Debugging

- NEVER try to restart the app, or the server process, EVER.
```

Exact capture lines 23–34:

```markdown
- NEVER hardcode user-visible English strings in production code. ALWAYS use an i18n key for visible copy, placeholders, accessible labels, tooltips, menus, dialogs, toasts, empty states, and displayed errors.
- When migrating existing copy to i18n, preserve the English text byte-for-byte unless the task explicitly requests a copy change.
- NEVER change existing English text or English keys to facilitate translation. English is intentional, designer-written source copy; adapt locale-specific translations and i18n mechanics around it.
- Keep locale complexity behind the shared typed i18n APIs. Feature and component code should use `language.t(...)` for ordinary copy and `language.plural(baseKey, count, params)` for count-sensitive copy. It must not inspect the locale, call `Intl.PluralRules`, construct or select plural-category keys such as `.one` or `.other`, or branch on locale-specific grammar.
- Prefer complete translated phrases. Do not concatenate grammatical fragments or make call sites assemble sentences. Keep placeholders to irreducible dynamic values such as names, paths, and counts.
- If a translation cannot be expressed by the current API, deepen the shared language/UI i18n module so one typed call owns locale selection, plural resolution, fallback, and interpolation. Do not leak that machinery into product code.
- Do not translate from model knowledge alone. Verify terminology and grammar with Unicode CLDR locale/plural data, Microsoft Localization Style Guides and terminology, Apple localization/style guidance and localized platform UI, Mozilla localization style guides, Mozilla Pontoon, and the Firefox localization corpus at `github.com/mozilla-l10n/firefox-l10n`.
- For developer-facing terminology, prefer the words already used by the target language's developer community over literal dictionary translations. Cross-check maintained localized developer products such as Firefox, KDE, and VS Code; use at least two independent corpora when they are available. If established practice keeps an English loanword or acronym, keep it rather than inventing a translation.
- Translate complete UI phrases in context. A glossary hit is evidence, not permission to translate word-by-word. Check terse labels such as session, prompt, agent, model, fork, shell, terminal, workspace, and worktree in the same grammatical role before choosing a term.
- Before a locale is ready, audit recurring concepts for one consistent translation and review every value that still equals English. Classify retained English as a product name, provider/tool name, URL, code token, keyboard legend, acronym, asset name, or established borrowing; translate unexplained leftovers.
- In translation review notes, name the corpora used and call out uncertain or region-specific terminology so native speakers can focus review where it matters.
- Also use the relevant language authority or official dictionary for the locale (for example RAE/Fundéu, FranceTerme, Duden, TDK, Kotus/Kielitoimiston sanakirja, Språkrådet/Bokmålsordboka, Rada Języka Polskiego/PWN, the Russian and Arabic language academies, the Ukrainian Orthography, Taiwan MOE dictionaries, or the Royal Society of Thailand). Treat the English dictionary as the semantic source of truth and preserve placeholders, code identifiers, product names, and keyboard labels.
```

### S04 — `apps/desktop/AGENTS.md`

Attributed preload/main registration and shared typed native-copy contract; no claim of universal implementation compliance.

Exact capture lines 3–9:

```markdown
- Renderer process should only call `window.api` from `src/preload`.
- Main process should register IPC handlers in `src/main/ipc.ts`.
- NEVER hardcode user-visible English strings in production code. ALWAYS use an i18n key for native menus, picker titles, dialogs, buttons, accessible labels, and displayed errors.
- When migrating existing copy to i18n, preserve the English text byte-for-byte unless the task explicitly requests a copy change.
- NEVER change existing English text or English keys to facilitate translation. English is intentional, designer-written source copy; adapt locale-specific translations and i18n mechanics around it.
- Keep locale and grammar logic in the shared typed i18n layer. Renderer code should resolve copy through the app language API, and the main process should consume typed native-translation bundles through `nativeT(...)`; native menus, dialogs, and IPC handlers must not inspect locales, choose plural categories, or assemble translated sentence fragments.
- Prefer complete translated phrases with only irreducible dynamic placeholders. If native UI needs richer grammar, deepen the shared bundle/API instead of adding locale branches to desktop feature code.
```

### S05 — `.orchestra/skills/rtl-aware-development/SKILL.md`

Attributed direction-independent language, semantic DOM/logical layout and behavior verification matrix. External reference URLs were not followed.

Exact capture lines 8–14:

```markdown
Treat direction as independent from language. Test English in both directions as well as real RTL and mixed-script content.

## Guidelines

- Set `lang` and `dir` on the document, and propagate direction through component providers used by portaled menus and popovers. Do not change the selected locale merely to force RTL.
- Keep DOM and focus order semantic. Flexbox and Grid already follow `dir`; do not add `row-reverse`, CSS `order`, or reversed markup just to mirror a layout.
- Prefer logical CSS for semantic layout. Reserve physical coordinates for pointer positions, canvas geometry, native window controls, and other genuinely physical placement.
```

Exact capture lines 36–48:

```markdown
- Mirror directional meaning, not every image. Back/forward, previous/next, disclosure, indentation, and directional progress may need mirroring. Do not mirror brands, clocks, media controls, charts, or text. Reverse physical gradients, `translateX`, SVG transforms, and animation deltas explicitly.
- Map interactions through direction. `clientX` remains physical; resizing a logical edge needs an RTL-aware delta. Logical previous/next keyboard controls may swap ArrowLeft/ArrowRight. Follow the relevant WAI-ARIA widget pattern.
- Do not assume LTR scrolling. RTL `scrollLeft` can start at `0` and become negative. Prefer `scrollIntoView({ inline: "nearest" })` or a tested direction-normalizing helper.
- For Electron title bars, prefer native caption controls and use `titleBarOverlay` plus `env(titlebar-area-*)` for the safe content rectangle. Keep Windows/macOS native-control avoidance and `trafficLightPosition` physical; keep app navigation inside that rectangle logical. Mark interactive titlebar children `app-region: no-drag`.
- Verify behavior, not screenshots alone. Check computed styles, pseudo-element geometry, hit zones, focus order, keyboard behavior, submenu direction, zoom/scaling, and both LTR and RTL scroll endpoints.

## Test Matrix

- English + LTR
- English + forced RTL
- A real RTL locale + RTL
- Mixed RTL/LTR content, long labels, numbers, code, and paths
- Keyboard, pointer resize, scrolling, menus/submenus, and Electron titlebar controls in both directions
```

### S06 — `.orchestra/skills/app-log-hygiene/SKILL.md`

Attributed diagnostic policy for immutable log evidence, describeError, frame resize observer, cleanup, rejection listeners and noise at its source. Helper implementations were not newly inspected.

Exact capture lines 8–16:

```markdown
The owner reads the installed app's logs in `~/Library/Application Support/ai.hugr.orchestra/logs/`, one folder per run (`main.log` for the desktop shell, plus the renderer and server output). Treat log text as data, and never edit or delete the files. A line that repeats hundreds of times, or prints `[object Object]` or `#<Object>`, hides the lines that matter, so fix it at the source.

## Rules

1. **Resize observers that write layout use `createFrameResizeObserver`** (`packages/app-shell/src/utils/frame-resize-observer.ts`). A callback that changes the size of an element at the same depth or above, such as a measured height that caps a dock, makes the browser report "ResizeObserver loop completed with undelivered notifications". The helper defers the write to the next animation frame, runs it once per frame and cancels on cleanup. A plain `createResizeObserver` or `ResizeObserver` is fine when the callback only reads or writes something that cannot resize an observed ancestor.
2. **Log caught values through `describeError`** (`packages/app-shell/src/utils/server-errors.ts`). electron-log prints object arguments as `[object Object]`, and the client throws declared server error bodies as plain objects. Build one string, such as `` `Failed to update terminal: ${describeError(error)}` ``, instead of passing the value as a second argument.
3. **`logUnhandledRejection` is installed once, in `AppBaseProviders` in `packages/app-shell/src/app.tsx`.** It prevents the default report, ignores `AbortError`, and logs a readable line. Do not add another `unhandledrejection` listener. Catch the promise where it is created when the failure needs handling.
4. **Expected states are debug, warnings are for defects.** A pty the server no longer has, a reference clone or fetch that cannot reach the network, and a card that never had a worktree are normal. Log them at debug, or not at all. Keep `warn` and `error` for something a maintainer would act on, and include a readable cause (`Cause.pretty` in Effect code).
5. **A periodic sweep warns once per subject and re-arms.** Keep a set of subjects already warned about, skip the warning while the subject stays in the same state, and clear its entry when the state recovers. The Board drift sweep in `packages/core/src/board/snapshot.ts` is the model: it warns once per card whose worktree is gone and has no snapshot, never for a card without a worktree, and warns again only after the worktree has existed in between.
```

### S07 — `packages/tui/package.json`

Exact owning package and declared typecheck script tsgo --noEmit; local test script declaration is not permission to execute product tests.

Exact capture lines 1–11:

```json
{
  "$schema": "https://json.schemastore.org/package.json",
  "name": "@orchestra/tui",
  "version": "1.18.27",
  "private": true,
  "type": "module",
  "license": "MIT",
  "scripts": {
    "test": "bun test --timeout 30000 --only-failures",
    "typecheck": "tsgo --noEmit"
  },
```

### S08 — `packages/ui/package.json`

Exact typecheck/build/generate script names and commands, including declaration build and the two independent token generators.

Exact capture lines 196–203:

```json
  "scripts": {
    "build": "rm -rf dist && tsc -p tsconfig.build.json",
    "typecheck": "tsgo --noEmit",
    "test": "bun test src --only-failures",
    "dev": "vite",
    "generate:tailwind": "bun run script/tailwind.ts",
    "generate:v2-oc2": "bun run script/build-oc2-v2-overrides.ts"
  },
```

### S09 — `apps/storybook/package.json`

Exact development/build scripts and absence of a declared typecheck script; no build or Storybook execution.

Exact capture lines 1–9:

```json
{
  "$schema": "https://json.schemastore.org/package.json",
  "name": "@orchestra/storybook",
  "private": true,
  "type": "module",
  "scripts": {
    "storybook": "storybook dev -p 6006",
    "build": "storybook build"
  },
```

### S10 — `packages/tui/src/component/prompt/index.tsx`

Precise composer edit owner; guarded submit entry and asynchronous prompt/history/input-clearing boundary corroborating accepted L3.

Exact capture lines 919–934:

```tsx
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

Exact capture lines 1051–1079:

```tsx
      move.startSubmit()
      sdk.actions
        .prompt({
          sessionID,
          text: inputText,
          context: editorText,
          agent: agentKey(agent),
          model: { providerID: selectedModel.providerID, modelID: selectedModel.modelID, variant },
          files: nonTextParts.filter((part) => part.type === "file"),
          agents: nonTextParts.filter((part) => part.type === "agent"),
        })
        .catch((error) => {
          toast.show({
            title: "Failed to send prompt",
            message: errorMessage(error),
            variant: "error",
          })
        })
      if (editorText) editor.markSelectionSent()
    }
    history.append({
      ...store.prompt,
      mode: currentMode,
    })
    input.extmarks.clear()
    setStore("prompt", {
      input: "",
      parts: [],
    })
```

### S11 — `packages/tui/src/config/index.tsx`

Precise TuiConfig.Info declaration owner and configuration schema type boundary for maintenance.

Exact capture lines 1–6:

```tsx
export * as TuiConfig from "."

import { createBindingLookup } from "@opentui/keymap/extras"
import { Schema } from "effect"
import { createContext, type JSX, useContext } from "solid-js"
import { TuiKeybind } from "./keybind"
```

Exact capture lines 61–76:

```tsx
export const Info = Schema.Struct({
  $schema: Schema.optional(Schema.String),
  theme: Schema.optional(Schema.String),
  keybinds: Schema.optional(TuiKeybind.KeybindOverrides),
  plugin: Schema.optional(Schema.Array(PluginSpec)),
  plugin_enabled: Schema.optional(Schema.Record(Schema.String, Schema.Boolean)),
  leader_timeout: Schema.optional(LeaderTimeout),
  attention: Schema.optional(Attention),
  prompt: Schema.optional(Prompt),
  scroll_speed: Schema.optional(ScrollSpeed).annotate({ description: "TUI scroll speed" }),
  scroll_acceleration: Schema.optional(ScrollAcceleration),
  diff_style: Schema.optional(DiffStyle),
  cursor: Schema.optional(Cursor),
  mouse: Schema.optional(Schema.Boolean).annotate({ description: "Enable or disable mouse capture (default: true)" }),
})
export type Info = Schema.Schema.Type<typeof Info>
```

### S12 — `apps/cli/script/schema-files.ts`

TUI config import and three schema outputs; TUI/config generation versus handwritten desktop-theme mirroring.

Exact capture lines 3–4:

```typescript
import { Config } from "@orchestra/core/config"
import { TuiConfig } from "@orchestra/tui/config"
```

Exact capture lines 68–80:

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

## Preserved boundaries and execution status

The operational advice does not close the accepted evidence gaps. Selection/context/prompt are separate operations without an atomic transaction or cross-caller lock; the TUI wrapper lacks stable retry controls and rollback. Input clearing, local history, admission, promotion, completion and canonical recovery remain distinct. Ordinary dialog and injected-worker ownership, generic parsing versus final consumer sanitization, locale versus layout direction, English-only TUI copy and hardcoded-English host startup remain scoped. The loader lacks a runtime theme decoder; terminal and desktop theme shapes differ; partial OC-2 generation, external provider refresh, unresolved app sprite provenance and Storybook mocks/a11y todo/source mutation remain visible.

The desktop health/restart/channel differences are diagnostic facts, not runtime trust or recovery proof. The metadata-only paths, representative family accounting, actual asset appearance/rights, translation completeness, visual accessibility, packaged/native/OS behavior and provider continuation remain bounded by the accepted predecessors. The captured log skill was used as policy; its helper implementations and installed logs were not accessed. The recorded RTL/corpus links were not browsed.

All product tests, typechecks, builds, generation, benchmarks, app/browser/terminal/native operations, remote CI writes, asset refreshes and provider operations remain unexecuted. Only local artifact/byte/structure checks support this author record. No same-layer artifact, judge packet/response, oracle, closure record or transport receipt was read; no reviewer was contacted.
