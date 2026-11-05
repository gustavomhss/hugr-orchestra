---
name: maestro-orchestra-setup-config
description: Where Orchestra config files live, the order they load in, how values merge, which environment flags exist and what settings writes touch.
internal: true
when: The owner asks where to put a setting, why a value is ignored or overridden, or what an ORCHESTRA_ environment variable does.
not-when: The config file is invalid and Orchestra stops (use the config errors leaf).
covers: []
---

# Configuration

## Files

`orchestra.json` and `orchestra.jsonc`. Comments and trailing commas are accepted in both. An unknown extra key is ignored. An invalid file stops Orchestra with `Config.InvalidError`; it is never skipped.

The global folder is the XDG config path `<xdg config>/orchestra` (for example `~/.config/orchestra`). `ORCHESTRA_CONFIG_DIR` points elsewhere.

## Load order (lowest to highest priority)

1. The global folder: `orchestra.json`, then `orchestra.jsonc`, so jsonc wins.
2. Project files found walking up from the opened directory to the project root, root first, nearest last.
3. `.orchestra/` directory configs, same order.

Each source is an ordered entry. For a key, the last defined value wins. MCP timeouts merge per field (`mcp.timeout.startup` and `.request`). Policies under `experimental.policies` load in the reverse order, so a user-global rule beats a repository rule.

Project documents are snapshotted when the location opens; global documents are re-read on every read. A change to a project file needs a new session location or a restart.

## Settings writes

The Settings screen writes through `updateGlobal`, which edits the highest-priority global file in place. It writes model, shell, `agents.<id>.engine` (`orchestra` or `claude-code`), disabled providers, providers, permissions and `trusted_projects`. A project file can never trust itself: only the user's global config approves a project.

## Instructions

Instruction entries must be local file paths. A URL fails with `instructions must be local file paths; remote URLs are not supported (<url>)`. Project config can name only files inside the project. Old-format configs are upgraded on load.

## Environment flags (packages/core/src/flag/flag.ts)

| Flag | Effect |
|---|---|
| `ORCHESTRA_CONFIG`, `ORCHESTRA_CONFIG_CONTENT` | Extra config file path, or inline config content |
| `ORCHESTRA_CONFIG_DIR` | Global config folder |
| `ORCHESTRA_TUI_CONFIG` | TUI config path |
| `ORCHESTRA_DISABLE_PROJECT_CONFIG` | Ignore project config |
| `ORCHESTRA_DB` | Database path (see the backups leaf) |
| `ORCHESTRA_PERMISSION` | JSON permission rules |
| `ORCHESTRA_PURE` | Run without plugins |
| `ORCHESTRA_DISABLE_AUTOUPDATE` | No automatic update |
| `ORCHESTRA_DISABLE_MODELS_FETCH`, `ORCHESTRA_MODELS_URL`, `ORCHESTRA_MODELS_PATH` | Model list source |
| `ORCHESTRA_SERVER_PASSWORD`, `ORCHESTRA_SERVER_USERNAME` | Server basic auth |
| `ORCHESTRA_DISABLE_PRUNE`, `ORCHESTRA_DISABLE_AUTOCOMPACT` | Turn off pruning or auto-compaction |
| `ORCHESTRA_INHERIT_CREDENTIALS`, `ORCHESTRA_CREDENTIAL_KEY_FILE` | See the credentials leaf |
| `ORCHESTRA_AGENT_TERMINAL`, `ORCHESTRA_SHELL_INTEGRATION` | Opt-in terminal flags |
| `ORCHESTRA_EXPERIMENTAL_*` | Experimental switches |

Flags are read through `Flag`, not `process.env`, in code.
