# Claude mode onboarding: UI map

> Path note: `packages/orchestra` was the V1 monolith and no longer exists (see `docs/architecture/monolith-map.md`). Paths below under `packages/orchestra` are historical; the live code is in `packages/core`, `modules/*` and `apps/cli`.

This is the UI work for the "Orchestra visual handoff" session. The backend is on branch `claude-mode-onboarding`.
Claude mode means Maestro running on Claude Code (`agent.maestro.engine: "claude-code"`). It is the launch fallback:
a desktop user with no API key turns it on and signs in from the app, with no terminal and no separate Claude Code
install. The desktop's bundled binary (`Resources/claude-code`) does the sign-in.

Line numbers refer to `fork/launch1-bundle` at the time this was written. Paths are under `packages/app/src` unless
they say otherwise.

## Backend contract

The app has no Claude-mode screen today. These are the calls a new screen uses:

| Purpose | Client call | Route | Result |
|---|---|---|---|
| Read the engine | `sync.data.config.agent?.maestro?.engine` | (bootstrap config) | `"claude-code"` or unset/`"orchestra"` |
| Set the engine | `sync().updateConfig({ agent: { maestro: { engine } } })` (`context/server-sync.tsx:596-624`, which calls `global.config.update`) | `PATCH /global/config` (deep merge into the global config file) | updated config. Note: a change disposes all instances. |
| Account status | `sdk().client.provider.claudeCode.account()` | `GET /provider/claude-code/account` | `{ signedIn, email?, subscription? }`. Cached for 30 s and refreshed when a sign-in ends. |
| Start sign-in | `sdk().client.provider.claudeCode.login()` | `POST /provider/claude-code/login` | `{ url }`, or 400 `ClaudeCodeLoginError { data: { message } }` |
| Paste fallback code | `sdk().client.provider.claudeCode.loginCode({ code })` | `POST /provider/claude-code/login/code` | `true` if a running sign-in took the code |

What `claude auth login --claudeai` does (Claude Code 2.1.289):

1. The CLI opens the system browser itself, on the automatic flow, which redirects to localhost.
2. The returned `url` is the manual fallback. Its page shows a `code#state` string for the owner to paste back.
3. The sign-in finishes in the background. The CLI exits 0 once either flow stores the login.

So the screen must not open `url` automatically, or the owner gets two tabs. Show it as a "Browser didn't open?" link
(`platform.openExternal(url)`, `context/platform.tsx:40`), next to a code field that sends `loginCode`. Poll
`account()` every 2–3 s while the sign-in runs, and stop when `signedIn` is true. Starting a new sign-in replaces an
unfinished one.

Engine and sign-in are independent. The owner may sign in before or after switching the engine. The provider list
shows Anthropic as connected through Claude mode only while the engine is `claude-code` and the account is signed in
(`handlers/provider.ts`, `executionHost: "claude-code"`).

## 1. Settings: "Claude mode" section in Providers

- **Where:** `orchestra/chapters/providers.tsx`, after the route block (`</div>` at about :324, still inside the
  `<Show when={data()}>`). It goes before the empty state (:326) and `.mx-grid` (:331). The chapter is registered at
  `orchestra/navigation.ts:25` and `orchestra/chapter-route.tsx:29`, and the sidebar opens it as a panel
  (`orchestra/sidebar.tsx:451`).
- **Why here:** the chapter already holds the server-wide "Route for new turns" setting, reads config through
  `useServerSync()` (:52), and writes it with `updateConfig` (:177, :244, :436).
- **Heading: "Claude mode".** The signed-out turn error now tells owners to go to "Settings › Claude mode", so the
  section must carry that name. If it lands elsewhere, update `SIGNED_OUT` in
  `modules/engine-adapters/claude-code/src/sdk.ts` to match.
- **Controls:**
  - A "Maestro engine" select with "Orchestra" (unset or `"orchestra"`) and "Claude Code" (`"claude-code"`). It
    writes with `updateConfig({ agent: { maestro: { engine } } })`. Disable it while the write is pending, like the
    route select (`state.route`).
  - Account row, signed out: a "Sign in to Claude" button that calls `login()`.
  - Account row, signing in: "Waiting for your browser…", the fallback link, a code field with a Submit button
    (`loginCode`), and Cancel. Cancel can simply stop polling; the next `login()` replaces the CLI.
  - Account row, signed in: "Signed in as {{email}} · {{subscription}}". `email` and `subscription` may be missing,
    so fall back to "Signed in".
  - Error: show the 400 `data.message`. It comes from Claude Code's stderr, for example a managed-settings refusal.
- **Optional alternative:** a Maestro-only note in Agents (`orchestra/chapters/agents-view.tsx:106`) that links to this
  section. Do not duplicate the controls there.

## 2. No-provider surfaces: "Use your Claude subscription (Claude mode)"

- **Model dialog without a provider:** `components/dialog-select-model-unpaid.tsx:37` and
  `components/dialog-select-model-unpaid-v2.tsx:61` (both under `orchestra.chat.model.noProvider`). Add a primary
  option above the provider list (v1 list at about :44, v2 open-connect at :23-26). It sets the engine to
  `claude-code` and opens the Claude mode section, or runs the sign-in inline.
- **Connect dialog:** `components/dialog-connect-provider.tsx`. In `ProviderPickerV2` (:226) the groups are built at
  :247-261 and rendered at :312-324; put the option first there. The v1 `ProviderPicker` (:156, `groupBy` :192)
  matches.
- **New-session tip:** `pages/new-session/new-session-view.tsx:132-145` (`data-component="provider-tip"`,
  `home.providerTip`; the dismissal setting is at :27). Offer the Claude-mode line when no provider is connected.
- **Agents empty state:** `orchestra.agents.noProviderTitle` (`orchestra/chapters/agents.tsx:150`) can link to the
  same section.

## 3. i18n keys (English)

Put orchestra keys in `i18n/orchestra-chapters/providers.ts`. Its header comment at :1 says new keys go there, not in
`orchestra.ts`.

**Locale overlay rule:** `context/language.tsx:51-55` merges each locale over the English base, so an untranslated
key shows English. `i18n/parity.test.ts:78-103` checks only the app (`en.ts`), ui, desktop and lean domains. That
means new `orchestra.*` keys need no translations. A new key in `i18n/en.ts`, such as a `home.*` tip, does need every
locale.

Proposed keys:

```
"orchestra.providers.claudeMode": "Claude mode",
"orchestra.providers.claudeMode.description": "Run Maestro on Claude Code with your Claude subscription. No API key needed.",
"orchestra.providers.claudeMode.engine": "Maestro engine",
"orchestra.providers.claudeMode.engine.orchestra": "Orchestra",
"orchestra.providers.claudeMode.engine.claudeCode": "Claude Code",
"orchestra.providers.claudeMode.signIn": "Sign in to Claude",
"orchestra.providers.claudeMode.waiting": "Waiting for your browser…",
"orchestra.providers.claudeMode.fallback": "Browser didn't open? Open the sign-in page",
"orchestra.providers.claudeMode.code": "Paste the code from the sign-in page",
"orchestra.providers.claudeMode.submit": "Submit code",
"orchestra.providers.claudeMode.signedIn": "Signed in as {{email}}",
"orchestra.providers.claudeMode.signedInPlan": "Signed in as {{email}} · {{subscription}}",
"orchestra.providers.claudeMode.signedInAnonymous": "Signed in",
"orchestra.providers.claudeMode.failed": "Sign-in failed: {{message}}",
"orchestra.providers.claudeMode.use": "Use your Claude subscription (Claude mode)",
```

Server copy that appears on screen without an app key: the turn error `SIGNED_OUT`, "Claude Code is not signed in.
Sign in to Claude in Settings › Claude mode, or run `claude auth login`, then send your message again."
(`modules/engine-adapters/claude-code/src/sdk.ts`). There is also the 400 `message` from the sign-in route.

## 4. Tests and oracles the visual work touches

- Unit tests: `orchestra/chapters/providers-disconnect.test.ts` (config writes through a fake `sync.updateConfig`;
  extend the same way for the engine write), `orchestra/chapters/providers-data.test.ts`,
  `orchestra/chapters/agents-roster.test.ts` (engine on the roster), `hooks/model-execution.test.ts` and
  `testing/model-execution-fixture.ts` (Claude-mode execution).
- i18n: `i18n/parity.test.ts`.
- e2e: `packages/app/e2e/orchestra/chapter-providers.spec.ts` (main oracle for the new section),
  `chapter-agents.spec.ts` (+ `chapter-agents.fixture.ts`, `chapter-agents.models.ts`), `chapter-settings.spec.ts`,
  `chat-session.spec.ts` (signed-out turn copy), `agent-picker.browser.test.ts`.
- Stories: `components/dialog-select-model-unpaid-v2.stories.tsx`, `components/dialog-connect-provider.stories.tsx`.
- Backend oracles (already on the branch): `packages/orchestra/test/claude-code/login.test.ts`,
  `packages/orchestra/test/claude-code/host/provider.test.ts`, and the HttpApi exercise
  `packages/orchestra/test/server/httpapi-exercise/provider.ts` (`bun run test:httpapi`).

## Catalog in Claude mode

With `agents.maestro.engine: "claude-code"` and Claude Code signed in, `modules/engine-adapters/claude-code/src/v2/catalog.ts` (the `engine-claude-code` host contribution `references`) provides `CatalogAvailability.AdditionalProviders` and `DefaultModel`. The provider and model lists then include Anthropic (`api.settings.executionHost: "claude-code"`) with no API key, and the default model is `agents.maestro.model` or `model` when it is an enabled `anthropic/...` model, else the first enabled Anthropic model. A disabled Anthropic provider, a signed-out binary or any other Maestro engine advertises nothing.
