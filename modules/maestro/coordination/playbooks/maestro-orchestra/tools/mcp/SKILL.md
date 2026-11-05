---
name: maestro-orchestra-tools-mcp
description: How MCP servers are configured, started, trusted and named in Orchestra, what the statuses mean, and which `orchestra mcp` commands manage them.
internal: true
when: The owner asks about adding, trusting or fixing an MCP server, a server's tool is missing or named differently than expected, or a server shows failed or needs_auth.
not-when: The tool is already listed and working, or the question is about the Dock's own tabs (use the dock leaf).
covers: []
---

# MCP servers

An MCP server gives an agent extra tools. Orchestra lists them in `<mcp_instructions>` in your context; a server you do not see there is not connected in this session.

## Naming

A server's tool arrives as `<server>_<tool>`. Both parts are sanitized: every character outside `a-z A-Z 0-9 _ -` becomes `_` (packages/core/src/mcp/catalog.ts `toolName`). A server `my.db` with tool `run query` is `my_db_run_query`. In Claude mode the names carry the prefix `mcp__orchestra__`. The Dock adds its own servers `dock-<site>` and `dock-linux` (see the dock leaf); a server the owner configured with the same name wins over the Dock's.

## Configuration

Servers live under `mcp` in `orchestra.json` or `orchestra.jsonc`, in the project root or in `.orchestra/`, or in the owner's global config. A later file wins; the project files are read in this order: `orchestra.json`, `orchestra.jsonc`, `.orchestra/orchestra.json`, `.orchestra/orchestra.jsonc`.

| Kind | Fields |
|---|---|
| `local` | `command` (array), `cwd` (relative paths resolve from the workspace), `environment` (key to value), `disabled`, `timeout` |
| `remote` | `url`, `headers`, `oauth` (an object with `client_id`, `client_secret`, `scope`, `callback_port`, `redirect_uri`, or `false` to turn OAuth off), `disabled`, `timeout` |

`timeout.startup` bounds connecting and initializing, `timeout.request` bounds each request after that; both are milliseconds, defaulting to 30,000 (packages/core/src/mcp.ts). A top-level `mcp` timeout is the default for all servers. A tool listing is paged and a failed refresh keeps the previous tool set. `disabled: true` gives status `disabled`.

## Statuses

| Status | Meaning |
|---|---|
| `connected` | Tools listed. |
| `failed` | Carries the reason: a spawn or connect error, `Listing tools failed: ...`, or `Connection closed` followed by the last 20 stderr lines of a local server. Also the blocked-by-trust case below. |
| `needs_auth` | A remote server wants OAuth sign-in. |
| `needs_client_registration` | The remote server needs a client id configured. |
| `disabled` | Turned off in config. |

## Project trust

A project's own config could run anything, so these do not run until the project is approved: local MCP servers (a command), plugins, and the project's `formatter` and `lsp` entries. Remote servers (a URL) and anything in the owner's global config are never blocked.

- A blocked local server is `failed` with: `Not started: this project's config declares a local command for this server. Add "<folder>" to trusted_projects in your user config to approve it.` Nothing was run.
- Approval is the list `trusted_projects` (absolute paths) in the global config only. A project's own `trusted_projects` is ignored, so a repository cannot approve itself. A folder inside a listed path is trusted (packages/core/src/config/trust.ts).
- Ways to approve: the Trust this project banner on the MCP page, first-run folder choice, `orchestra mcp add` for a local server (adding is the owner's decision, so it also approves the project), or `POST /api/trust/approve` with `{ "directory": "<abs path>" }`. Approving starts the blocked servers at once with no restart; `POST /api/trust/revoke` stops that project's local servers. The server refuses a missing folder, a file, a relative path and the filesystem root.
- Plugins and LSP servers load at session start, so a session restart is needed after approving or revoking a project that declares them.
- Settings > Trusted projects lists approved folders with Revoke. A folder trusted only through its parent stays trusted until the parent is revoked.
- Tell the owner to approve only folders they wrote or reviewed. Never edit `trusted_projects` yourself to clear a banner.

## CLI

| Command | Does |
|---|---|
| `orchestra mcp list` (`ls`) | Servers and status. |
| `orchestra mcp add [name] --url <url> [--header K=V]` | Add a remote server. |
| `orchestra mcp add [name] [--env K=V] -- <command...>` | Add a local server and approve the project. |
| `orchestra mcp auth [name]`, `mcp auth list` | OAuth sign-in; auth status. |
| `orchestra mcp debug <name>` | Debug the OAuth connection. |
| `orchestra mcp logout [name]` | Remove stored OAuth credentials; status becomes `needs_auth`. |

The OAuth browser callback is `http://127.0.0.1:19876/mcp/oauth/callback`. If another program holds the port, sign-in fails at once with `OAuth callback port <port> is already in use`; set `oauth.callback_port` or `oauth.redirect_uri`. Sign-ins are stored encrypted. The MCP page has a Try again button per card.

## Permissions

MCP tools follow the usual permission rules (asked by default per call). Dock tools ask the `dock` permission.

## Fixing a missing tool

1. Is the server in `<mcp_instructions>`? If not, check `orchestra mcp list` status.
2. `failed` with the Not started message: trust the project (owner decision).
3. `failed` with stderr lines: the command itself is broken; read those lines.
4. `needs_auth`: `orchestra mcp auth <name>`.
5. Name differs from the server's own: look for the sanitized `<server>_<tool>` form.
