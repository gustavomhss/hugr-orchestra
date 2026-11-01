---
name: maestro-orchestra-setup-composer
description: What HuGR Composer is, how to install and enable it for the backend seat, and its known install limit.
internal: true
when: The owner asks about Composer, FastAPI building blocks, or why the `backend` seat is not using them.
not-when: The question is a general MCP server failure (use the MCP errors leaf).
covers: []
---

# HuGR Composer

Composer is an MCP server (a Python package) with a catalog of production FastAPI building blocks: auth, data, API, realtime, resiliency, observability, compliance, deployment and testing. It can scaffold, compose, audit and verify a service. In Orchestra it serves the `backend` seat.

## Install

```bash
uv tool install git+https://github.com/gustavomhss/hugr-composer
```

This places a `hugr-composer` command in `~/.local/bin`.

Known limit: Composer pins its `hugr-core` dependency to a repository that is no longer reachable, so that command fails until the pin moves. Install from a checkout with a uv override pointing `hugr-core` at a local copy: `uv tool install <checkout> --overrides <file>`.

## Turn it on

Add to the global config (`~/.config/orchestra/orchestra.json`):

```json
{
  "mcp": { "servers": { "hugr-composer": { "type": "local", "command": ["/Users/<you>/.local/bin/hugr-composer"], "timeout": { "request": 300000 } } } },
  "permissions": [{ "action": "hugr-composer_*", "resource": "*", "effect": "deny" }]
}
```

- The server name must be `hugr-composer`. The `backend` seat declares `mcp: ["hugr-composer"]` and is allowed tools whose names start with `hugr-composer_`.
- The deny rule keeps the tools from Maestro and other agents; the seat's own profile wins over it. Leave it out to share Composer, or set the `hugr-composer (MCP server)` row on one agent's Tools tab to Allow.
- The 300000 ms request timeout is there because composing can take minutes.
- Restart Orchestra to load the change. Declared in a project config instead, the project must be trusted first (global `trusted_projects`).

## Use

The owner does not call Composer. When `backend` gets backend work and the tools are present, its prompt tells it to start from `hugr-composer_fastapi_meta_home` and compose from the catalog. Without the server it writes the code itself.

## Failures

A start failure shows with the other MCP failures (see the MCP errors leaf).
