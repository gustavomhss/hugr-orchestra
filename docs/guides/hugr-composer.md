# HuGR Composer: FastAPI building blocks for the backend seat

HuGR Composer is an MCP server with a catalog of production FastAPI building blocks: auth, data, API, realtime, resiliency, observability, compliance, deployment and testing. It can also scaffold, compose, audit and verify a service. In Orchestra, only the backend seat can use it. Maestro, the other seats and your own agents cannot call its tools, whatever your permissions allow.

## Install

Composer is a Python package. Install it with [uv](https://docs.astral.sh/uv/):

```bash
uv tool install git+https://github.com/gustavomhss/hugr-composer
```

This puts a `hugr-composer` command in `~/.local/bin`.

Known limit: Composer pins its `hugr-core` dependency to a repository that is no longer reachable, so this command fails until the pin moves. Until then, install from a checkout with a uv override that points `hugr-core` at a local copy (`uv tool install <checkout> --overrides <file>`).

## Turn it on

Add the server to your global config, `~/.config/orchestra/orchestra.json`:

```json
{
  "mcp": {
    "servers": {
      "hugr-composer": {
        "type": "local",
        "command": ["/Users/<you>/.local/bin/hugr-composer"],
        "timeout": { "request": 300000 }
      }
    }
  }
}
```

The server name must be `hugr-composer`. The backend seat is given exactly the tools whose names start with `hugr-composer_`, so a server under any other name stays closed to it. Composing a service can take a few minutes, which is why the request timeout is raised to five minutes.

Restart Orchestra to load the change. If you declare the server in a project's config instead, the project must be trusted first (see [Project trust](mcp-project-trust.md)).

## Use it

You do not call Composer yourself. When Maestro hands backend work to the backend seat, the seat starts from `hugr-composer_fastapi_meta_home`, picks building blocks from the catalog and composes them instead of writing that infrastructure by hand. Without the server, the seat writes the code itself.

If the server fails to start, its error appears with the other MCP failures (see [MCP and CLI failures](mcp-and-cli-failures.md)).
