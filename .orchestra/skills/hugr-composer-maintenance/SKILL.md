---
name: hugr-composer-maintenance
description: Use when changing or debugging how HuGR Composer reaches the backend seat (`mcp.servers.hugr-composer` in config, the seat's `mcp` field), installing it on the owner's Mac, or when composer tools are missing from the backend seat. What must not regress
---

# HuGR Composer: maintenance and ownership

User guide: `docs/guides/hugr-composer.md`. Producer repository: `gustavomhss/hugr-composer` (local checkout `~/Documents/HuGR/composer`).

## How it is wired

- V2 plugins cannot contribute tools or MCP servers (`packages/plugin/src/v2/promise/context.ts` has no such hook), so Composer is not a plugin. It is a local MCP server in config, `mcp.servers.hugr-composer`, started by `packages/core/src/mcp.ts` through omni. It needs no spawn-allowlist entry.
- Its tools are named `hugr-composer_<tool>` (`McpCatalog.toolName`). Every call goes through `permission.assert` with that name as the action.
- The backend seat declares `mcp: ["hugr-composer"]` (`seats/backend.ts`). A seat's floor denies every tool it is not granted, so `seatProfile` in `roster.ts` turns each declared server into an allow for `<server>_*`. Which other agents see Composer is ordinary config permissions; the guide's example denies it globally, and the backend floor, applied after config, wins. One agent can be granted or denied it on the agent screen's Tools tab, which writes `hugr-composer_*` to that agent's file (`agent-screen-maintenance`).
- The backend prompt (`seats/prompt/backend.txt`) tells the seat to start from `hugr-composer_fastapi_meta_home` when the tools are present.

## Invariants

- The backend seat keeps `hugr-composer_*` over a configured deny. `test/v2-seats.test.ts` covers it.
- The backend seat gets no other MCP server's tools through this grant.
- Renaming the server breaks the grant. If the name changes, change the backend seat's `mcp` field, the guide and this skill together.

## Install on the owner's Mac

The package pins `hugr-core` to `humangr-labs/HuGR-Arsenal`, which no longer exists. Install with an override that points at the local copy, whose history contains the pinned commit:

```bash
echo 'hugr-core @ file:///Users/gustavoschneiter/Documents/HuGR/HuGR_Arsenal/hugr-core' > /tmp/composer-override.txt
uv tool install /Users/gustavoschneiter/Documents/HuGR/composer --overrides /tmp/composer-override.txt
```

The command lands at `~/.local/bin/hugr-composer`. To smoke-test it, send `initialize`, then `tools/list`, over stdio: it lists 18 tools (`fastapi_meta_*` and the nine `fastapi_<area>` ones). Warnings and a banner on stderr at startup are harmless.

Moving `hugr-core` to a reachable repository and repinning it in the Composer repository would make the plain `uv tool install git+…` in the user guide work without the override.
