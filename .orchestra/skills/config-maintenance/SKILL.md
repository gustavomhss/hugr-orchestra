---
name: config-maintenance
description: Who owns Orchestra config loading (orchestra.json and .orchestra directories), the key schema, global writes, project trust and the legacy upgrade, the invariants that must not regress, and how to add a key
---

# Config maintenance and ownership

Config is read by the Location-scoped `Config.Service` in `packages/core/src/config.ts`, with one module per key group in `packages/core/src/config/`. The spec is `docs/specs/v2/config.md`. The user-facing guides are `docs/guides/settings.md`, `config-errors.md` and `mcp-project-trust.md`; a user-visible config change updates its guide. For the trust decision on MCP servers see also `orchestra-ownership`.

## Ownership

| Piece | Owner file | Rule |
|---|---|---|
| `Config.Info` (the key schema), `Document`, `Directory`, `Entry`, `latest`, `mcpTimeout` | `packages/core/src/config.ts` | One `Schema.Class` with every top-level key optional. Each key's type lives in its own module or in `packages/schema` (`ConfigMCP`, `ConfigMaestro`) |
| Key group modules | `packages/core/src/config/{agent,attachments,command,compaction,continuity,experimental,formatter,lsp,plugin,provider,reference,relay,research,tool-output,watcher}.ts` | Each starts with the self-export `export * as ConfigX from "./x"` and exports `Info` (or the key's schema). `provider-options.ts` holds shared provider request options |
| Loading and merge | `Config.Service` layer in `config.ts` | Parses JSONC, upgrades old shapes, decodes, rejects remote instructions, merges by order. See Invariants |
| Legacy upgrade | `packages/core/src/config/upgrade/*` | `needsUpgrade` detects old keys (`agent`, `permission`, `plugin`, `provider`, ...) and an old-format `mcp`; `migrate` maps them to `Info`. `source.ts` is the old schema |
| Global writes | `Config.updateGlobal`, `Config.readGlobal` | The only writers of the user's `orchestra.json(c)`. `GlobalPatch` lists exactly what the app may write |
| Project trust | `packages/core/src/config/trust.ts` (`ConfigTrust`) | `isUser`, `isTrusted`, `runnable`, `list`, `approve`, `revoke`, `approveHint` |
| Entries that load from config | `packages/core/src/config/plugin/{agent,command,skill,reference,provider,external}.ts` | One internal plugin per kind. They read `Config.entries()` and install into the matching registry |
| Agent and plugin file editing | `config/agent-file.ts`, `config/plugin-file.ts`, `config/markdown.ts` | The file API that writes agent Markdown files and the plugin list. `ConfigAgentFile.ConflictError` when the caller's `revision` no longer matches the file |
| TUI config files | `packages/core/src/tui-config-files.ts` | Finds `tui.json(c)` folders; separate from `Config.Info` |
| HTTP surface | `packages/server/src/handlers/config.ts`, `trust.ts` | Global groups (no Location) that call `Config.readGlobal`, `Config.updateGlobal` and `ConfigTrust`. See `server-maintenance` |

## Load order and merge

For a Location, `Config.Service` builds `entries()` from lowest to highest priority:

1. The global config folder (`global.config`): `orchestra.json`, then `orchestra.jsonc` (a later file wins), then the folder itself as a `Directory` entry.
2. Project files found walking up from the Location's directory to the project root: `orchestra.json` and `orchestra.jsonc`, farthest first, so the closest wins.
3. `.orchestra` directories found on the same walk, farthest first, each as its own `Document`s plus a `Directory` entry.

A consumer reads a key with `Config.latest(entries, key)` (the last document that sets it) or merges itself (for example MCP servers by name, with `Config.mcpTimeout` taken per field). A Location opened in the global config folder itself skips discovery. Project and `.orchestra` entries are read once when the Location opens; global entries are read again on every `entries()` call so a settings write reaches the next agent or catalog reload without reopening the Location.

## Invariants

- An existing file that cannot be parsed or fails the schema is a `Config.InvalidError`; it is never skipped, because the user would silently run on defaults. Syntax is JSONC with trailing commas allowed. Unknown extra keys are ignored (`onExcessProperty: "ignore"`), which is why a typo is silent: keep that in the guide.
- Decoding is `errors: "all"`, so one error shows every bad key. Do not change it to first-error.
- `instructions` entries must be local paths: any `scheme://` value is an `InvalidError`. A project config may only name files inside the project; instruction escape makes the whole instruction context unavailable (see `system-context-maintenance`).
- A repository's config is not the user's. What it declares to run (local MCP servers, config plugins, formatter and language-server commands) is code the repository chose, so it runs only when the Location is under a path in `trusted_projects` of a user document. `ConfigTrust.isUser` is true for documents under `global.config` (and documents with no file); `runnable` keeps all entries for a trusted project and only the user's own otherwise. Callers today: `mcp.ts` (`isTrusted`, `isUser`), `relay.ts` (`isTrusted`), `lsp/lsp.ts`, `format/format.ts` and `config/plugin/external.ts` (`runnable`). A new place that executes something named by config must use these, never its own check.
- `trusted_projects` is honored only from the user's own documents; a project's own `trusted_projects` never counts. `approve` stores the canonical real path of an existing absolute folder, rejects the filesystem root, and is a no-op when the folder is already covered by a parent. `revoke` removes only the folder's own entry; a folder trusted through a parent stays trusted.
- Writing a global setting edits the highest-priority existing global file in place with `jsonc-parser` `modify`, so comments and unrelated keys survive, and writes atomically. Lists (`permissions`, `trusted_projects`, the disabled providers) are written whole so a shorter list drops the old tail. `readGlobal` is cached per config directory by mtime, size and inode of both files and returns a copy; `updateGlobal` drops the entry.
- Disabled providers are stored as exact `provider.use` deny policies under `experimental.policies`. Other policy statements (such as an allowlist's `*` denial) stay untouched, and a legacy `disabled_providers` list is rewritten too because the upgrade appends it after every policy.
- Policies load in reverse document order so a user-global rule overrides a repository rule; the order inside each file is unchanged. Keep that when touching `loadPolicies`.
- A file in the old format is upgraded on read, never rewritten on disk. Settings that write current `permissions` into a file that still has old keys are re-read by `settings()` so the old-format decode does not drop them. A new rename of a key needs an upgrade entry and a row in `docs/specs/v2/schema-changelog.md`.
- A plugin, agent or command entry from config goes through the registry of its kind; `config/plugin/*.ts` does not create a second path to the model, tools or permissions.
- Layering: key schemas that Client or Protocol need live in `packages/schema` (`config-mcp.ts`, `config-maestro.ts`); the rest are Core. Client code never imports `@orchestra/core`.
- `ORCHESTRA_DISABLE_PROJECT_CONFIG` is read through `Flag` in two places only: ambient `AGENTS.md` discovery in `instruction-context.ts` and project `tui.json` discovery in `tui-config-files.ts`. It does not stop `Config.Service` from loading project `orchestra.json`; do not describe it as disabling project config in general.

## Adding or changing a key

1. Add the schema in `packages/core/src/config/<group>.ts` (self-export header, `Info`) or, if Client or Protocol need it, in `packages/schema/src/config-<group>.ts`. Give it an `annotate({ description })`.
2. Add the key to `Config.Info` in `config.ts`. Keep every key optional.
3. If a consumer executes something the key names, route it through `ConfigTrust`. If the app must write the key, extend `GlobalPatch`, `updateGlobal` and `readGlobal` together.
4. After a change to the Protocol or Server `HttpApi` that exposes the key, run `bun run generate` in `packages/client`.
5. Update `docs/specs/v2/config.md` and the guide (`docs/guides/settings.md` or the group's own guide), and add a changelog line if a stored shape changed.
6. Test it (below).

## Testing

Tests run on GitHub Actions only: `bun run test:ci core <files>` from the repository root. Files in `packages/core/test/config`:

- Loading, merge order (including global, ancestor and `.orchestra` directories), invalid files, remote instructions, v1 upgrade, policy order, MCP timeouts: `config.test.ts`. Legacy `config.json` is not loaded (also asserted there).
- Global read and write, cache, comment preservation: `config-global.test.ts`.
- Trust: `trust.test.ts`, and in `packages/core/test` `mcp-trust.test.ts` for MCP.
- Key groups: `agent.test.ts`, `command.test.ts`, `provider.test.ts`, `provider-options.test.ts`, `provider-policy-migration.test.ts`, `lsp.test.ts`, `skill.test.ts`, `tool-output-lean.test.ts`.
- File APIs: `agent-file.test.ts`, `plugin-file.test.ts`, `plugin.test.ts`, `markdown.test.ts`.
- Related: `packages/core/test/instruction-context.test.ts` (`ORCHESTRA_DISABLE_PROJECT_CONFIG`, project escape). `src/npm-config.ts` is npm registry configuration and unrelated to `orchestra.json`.

A change to what a project config may run needs a test of the untrusted case, not only the trusted one.

## Traps

- `orchestra.jsonc` wins over `orchestra.json` in the same folder; the file `updateGlobal` edits is the one that wins, and a new file is `orchestra.json` only when neither exists.
- Project documents are a snapshot from when the Location opened; editing a project file does not reach a running Location. Only global documents reload on each call.
- `Config.latest` returns the last document that sets the key, so a key set to an empty array in a later document hides earlier values. Merge explicitly where lists should combine, as MCP servers and `mcpTimeout` do.
- `trusted_projects` matching is path containment after `path.resolve`. `approve` stores the canonical real path, but `isTrusted` does not canonicalize the directory it checks, so a symlinked path is compared as written.
- `docs/guides` is not published yet, but a user-facing change still updates its guide.
- This skill is repo-only: never add it to a seat's `skills`.
