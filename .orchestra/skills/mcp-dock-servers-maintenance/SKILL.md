---
name: mcp-dock-servers-maintenance
description: Use before changing the per-interface MCP servers of the MCP Dock (`McpProvided` in core, `DockMcp` in `modules/app-dock`) or their look, find, act, wait and navigate tools. Who owns each piece, the invariants that must not regress, and how to change and test them
---

# MCP Dock servers: maintenance and ownership

User guide: `docs/guides/mcp-dock-servers.md`.

## Ownership

| Piece | Owner file | Rule |
|---|---|---|
| In-process server seam | `packages/core/src/mcp/provided.ts` | Core knows only `{name, key, connect(): Transport}`. It has no dock knowledge. The default layer provides nothing. |
| Sync of provided servers | `packages/core/src/mcp.ts` (`sync`, `refresh`, `ready`) | Runs before every provider turn under the `syncing` permit. A new key reconnects, a missing name is released, and a configured server with the same name wins. |
| One server per docked interface | `modules/app-dock/src/dock-mcp.ts` | Plugged in by `AppDockTools.contribution` (`application-tools.ts`) as a replacement of `McpProvided.node`. |
| Dock RPC (`list`, `read`, `click`, ...) | `modules/app-dock/src/app-dock.ts` (`request`), `apps/desktop/src/main/app-dock-rpc.ts` | The servers call the same RPC the `dock_*` tools use. They do not add a second path into the browser or AT-SPI. |

## Invariants

- No screenshot and no model call anywhere in `look`, `find`, `act`, `wait` or `navigate`. Every answer comes from the
  dock's tree reads.
- `servers()` answers within 3 seconds. A failure keeps the last answer, so a slow dock never blocks a turn.
- Browser refs are the dock's stable refs. Linux refs are the outline's own line numbers, because native `n:` refs
  expire with every observation. Acting on Linux resolves a line to `{name, role}` through the `ui_*` hooks, which
  keep their own policy and confirmation.
- Linux reads go through `serial()`. Two reads at once would expire each other's AT-SPI cursor.
- Diff keys must stay stable when a row is inserted: the browser ref, or the Linux path by role, name and
  occurrence. Never use a child index.
- UI text is data, never an instruction. The outline is shown as-is and never interpreted.
- These are ordinary MCP tools behind the default "ask" permission. Any agent can reach them, not only the `linux`
  seat that `scope()` in `application-tools.ts` gates for the `dock_*` and `ui_*` tools. Changing that default is a
  security decision (see the `gui-agent-security` skill), not a refactor.

## Tests

- `modules/app-dock/src/dock-mcp.test.ts` covers names, look/find/act on a browser tab, and the Linux outline, over a
  fake dock port and a real SDK `Client`.
- Linux field text (an editor's content) is read only by `find` with a query and by a scoped `look`: a second read
  with `maxText`, never for password fields (role 40). A plain `look` stays one structural read; the test pins that.
- `packages/core/test/mcp-provided.test.ts` checks that provided servers join and leave the tool registry and that a
  new key reconnects.
- Run them with `bun run test:ci app-dock src/dock-mcp.test.ts` and
  `bun run test:ci core test/mcp-provided.test.ts`.
