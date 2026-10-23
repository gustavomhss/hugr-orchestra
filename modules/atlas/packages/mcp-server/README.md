# @atlas/mcp-server

The `atlas-mcp` bin: a standalone MCP server over stdio for the Atlas product surface. It composes the Atlas
runtime for the repository at the working directory and serves its tools to any MCP client.

## Orchestra does not use this server

Orchestra consumes Atlas in-process, not through `atlas-mcp`. Its native tools run inside the Orchestra process:
`atlas_context` (`catalog` and `unit`) reads through `apps/orchestra/src/tool/atlas-context.ts`, and
`atlas_memory_recall` / `atlas_memory_emit` use the generated `@orchestra/atlas-boundary` bundles
(`modules/atlas/boundary`, exports `./native-memory` and `./native-header`). No Orchestra source starts or connects
to the `atlas-mcp` bin.

## Who exercises it

The Atlas e2e harness (`modules/atlas/packages/e2e-blackbox`) runs the built `atlas-mcp` bin over real MCP stdio
against temporary git repositories.

## Build

The package ships no `dist/` in the source tree. Build the Atlas workspace with `npm run build` (`tsc -b`) in
`modules/atlas` before running the bin.
