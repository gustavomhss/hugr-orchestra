# `@orchestra/plugin`

`@orchestra/plugin` owns the public authoring contracts and helpers for legacy server, TUI, and V2 plugins. Hosts own plugin loading and runtime authority. Import from the explicit package subpath for the runtime you use; package exports are listed in `package.json`.

## Choose an entrypoint

| Import | Contract |
| --- | --- |
| `@orchestra/plugin` | Legacy server plugin types and the `tool()` helper |
| `@orchestra/plugin/tool` | Tool authoring types and the `tool()` helper |
| `@orchestra/plugin/tui` | TUI plugin types, key helpers, and binding lookup |
| `@orchestra/plugin/v2/effect` | V2 Effect plugin definition and hook types |
| `@orchestra/plugin/v2/promise` | V2 Promise plugin definition and hook types |

SDK models used by the legacy contracts are primarily imported as types. This package is not the server SDK client. Runtime exports are limited to helpers such as `tool`, TUI key utilities, and v2 `define`; an import of a type alone does not load or provide the corresponding host runtime.

From this package directory, run `bun typecheck` to typecheck the package.

## Legacy server plugins

The legacy default export is a server module whose `server(input, options)` function returns a Promise of `Hooks`. `PluginInput` supplies the SDK client, project and workspace context, server URL, and Bun shell. Hooks include events such as `chat.params`, `tool.execute.before`, `session.start`, and `stop`.

```ts
import { tool, type Plugin, type Hooks } from "@orchestra/plugin"
import { z } from "zod"

export const Example: Plugin = async () => {
  const hooks: Hooks = {
    tool: {
      greet: tool({
        description: "Return a greeting",
        args: { name: z.string() },
        execute: async ({ name }) => `Hello, ${name}`,
      }),
    },
  }
  return hooks
}

export default { server: Example }
```

`tool()` uses Zod-shaped arguments and returns a tool definition; execution receives typed arguments and a `ToolContext` with session, directory, abort, permission, and metadata APIs. Legacy server modules and TUI modules have distinct entry shapes. Existing v1 plugins remain consumed by Orchestra's server and TUI loaders.

## V2 server plugins
V2 plugins register hooks through `PluginContext`; setup does not return a legacy `Hooks` object. Stateful transforms are available for agent, catalog, command, integration, reference, and skill domains. Reload reruns transforms for the selected domain. Registrations belong to plugin lifetime and can be disposed.

```ts
import { define } from "@orchestra/plugin/v2/effect"
import { Effect } from "effect"

export default define({
  id: "example",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.catalog.transform((catalog) => {
      catalog.provider.update("example", (provider) => {
        provider.name = "Example"
      })
    })
  }),
})
```

The Promise entrypoint offers the same domains and hooks with `setup: async (ctx) => { ... }`, `await ctx.catalog.transform(...)`, and Promise-based reload/disposal. The current external-plugin loader accepts either `{ id, effect }` or `{ id, setup }` and adapts Promise plugins into the Effect host.

## TUI plugins
Import `TuiPlugin` and `TuiPluginApi` from `@orchestra/plugin/tui`. TUI modules expose `tui(api, options, meta)` and can register routes, slots, key bindings, dialogs, toasts, attention sounds, and lifecycle cleanup. `api.command` remains present for v1 initialization but is deprecated in favor of `api.keymap`.

The OpenTUI packages (`@opentui/core`, `@opentui/keymap`, and `@opentui/solid`) are optional peers. Install compatible peers when authoring or running a TUI plugin. Keep TUI imports in TUI-specific modules; the TUI entrypoint loads OpenTUI types and key helpers and should not be pulled into server-only startup paths.

## Consumers and compatibility
The Orchestra server still imports legacy types and `tool()` for built-in and configured plugins; the TUI and core plugin loader consume their respective subpaths. V2 server modules are loaded from configured plugin files or packages. Use the exact exported subpaths above: package exports are explicit, and unlisted deep paths are not public entrypoints. Core owns the bundled SDK manifest and runtime import map in `packages/core/src/plugin/sdk-package.ts` and `sdk-runtime.ts`, validates SDK scope and version during package installation, and admits external imports before evaluation. Orchestra resolves the requested server or TUI entrypoint in `apps/orchestra/src/plugin/loader.ts`, checks npm plugin compatibility, then admits and imports the module. Hosted checks for those SDK boundaries are in `packages/core/test/npm-sdk.test.ts`, `apps/orchestra/test/plugin/sdk-admission.test.ts`, and `apps/orchestra/test/plugin/sdk-final-matrix.test.ts`. The manifest declares `effect`, `zod`, `@ai-sdk/provider`, and `@orchestra/sdk` as dependencies; OpenTUI peers are optional. `files` publishes `dist`, so package builds must include the exported files before publishing.

<!-- module-contract:start (generated by script/module-readme.ts from script/module-architecture.json; do not edit) -->
## Module contract
- Package: `@orchestra/plugin` at `packages/plugin` (alias `plugin`)
- Summary: Public authoring contracts and helpers for server, terminal UI and V2 plugins.
- Layer: `extension-api`; may depend on: `foundation`, `contract`, `client`
- Status: `canonical`
- Owner: plugin API maintainer
- Public entry: explicit `exports` in package.json
- Legacy and compatibility: none
- Enforced by `bun run check:boundaries`; exceptions in `script/boundary-ledger.json`.
<!-- module-contract:end -->
