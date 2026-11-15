# B3/v4 — D09 — uso dos mapeamentos de falha MCP

Complemento obrigatório do bounded_claim retido: "Server delegates these operations through Location services and maps MCP missing/config/auth failures." Corpo v4 inalterado: SHA256 `36339a1329421f80d15e37b40ce26edd6e1c793a0ac1b5056471e4df2bfed57c`. Não reintroduz claims das tabelas retiradas nem concede PASS.

Fonte `1cde2ff7a71bcf7aecb5d030917b577165135d38` / `packages/server/src/handlers/mcp.ts`; blob `70a6b0ba7d3b8a8ee71fb9ba42b55710d1b43a18`; 3425 bytes; SHA256 `8b141ac204fe14e72a5576277a0c4c493a43b7921dfc4309b26d0b9fb08d5ad8`. Leitura estrita autorizada pela principal, identidades conferidas por script.

Linhas 24–33; 327 bytes; SHA256 `1a068bf8d4aae7a01923c1993eeac97d7a9ede5e21e521be1ed3b20c2651d012`.
```ts
    .handle(
      "mcp.remove",
      Effect.fn(function* (ctx) {
        const mcp = yield* Mcp.Service
        yield* mcp.remove(ctx.params.server).pipe(
          Effect.catchTag("Mcp.NotFoundError", notFound),
          Effect.catchTag("Mcp.ConfigError", (error) => Effect.fail(invalid(error))),
        )
      }),
    )
```

Linhas 60–69; 339 bytes; SHA256 `d74a0ef2527d4396f4ae81505d95c194a1931538bdb97a873e47529d2b7ac142`.
```ts
    .handle(
      "mcp.auth.start",
      Effect.fn(function* (ctx) {
        const mcp = yield* Mcp.Service
        return yield* mcp.startAuth(ctx.params.server).pipe(
          Effect.catchTag("Mcp.NotFoundError", notFound),
          Effect.catchTag("Mcp.AuthError", (error) => Effect.fail(invalid(error))),
        )
      }),
    )
```

Linhas 89–95; 292 bytes; SHA256 `dba614cca85d50fe2416cdd516304b77b4adcab1ea237bddd64e396b007d98c2`.
```ts
function notFound(error: Mcp.NotFoundError) {
  return Effect.fail(new McpServerNotFoundError({ server: error.name, message: `MCP server not found: ${error.name}` }))
}

function invalid(error: Mcp.ConfigError | Mcp.AuthError) {
  return new InvalidRequestError({ message: error.message })
}
```

