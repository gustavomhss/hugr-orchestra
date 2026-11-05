---
name: credential-auth-maintenance
description: Use when changing stored credentials, provider authentication or MCP OAuth storage and their availability boundaries.
---

# Credential and authentication maintenance

This is a repo-only maintainer map, not a runtime seat skill.
Start with [Stored credentials](../../../docs/guides/credentials.md) and the credentials row of `orchestra-ownership`.

## Owners and sources

| Concern | Source of authority |
|---|---|
| Provider/integration credential service | `packages/core/src/credential.ts`, `credential/sql.ts` |
| Encryption and key selection | `packages/core/src/credential/cipher.ts` |
| MCP OAuth file | `packages/core/src/mcp/auth.ts` |
| Provider types and provider-specific auth | `packages/core/src/provider.ts`, `packages/core/src/plugin/provider/` |
| User-facing recovery and storage | `docs/guides/credentials.md` |

## Authority and lifecycle traps

- Provider and integration secrets live in the database; MCP OAuth uses `mcp-auth.json`.
  MCP auth is a separate store and lifecycle, not a provider credential alias.
- Secrets at rest use AES-256-GCM; the key comes from the OS keychain or a
  mode-0600 `credential.key` fallback. Linux without a session bus skips the keychain.
- A database row that no loaded key can decrypt is skipped and retained, not deleted.
  The sealed MCP file is likewise retained and cannot be overwritten in that state.
- Legacy plaintext credentials are read and re-sealed at startup; the MCP file is
  migrated on read. Corrupt MCP files are moved aside, not treated as wrong-key files.
- Provider availability is not just config: credentials, environment and provider
  plugins may affect connection and model availability. Keyless Zen is not connected;
  see `orchestra-ownership` for settled Zen/Go and OpenAI login decisions.
- Never inspect a user's actual credential files or log secret values while debugging.

## Safe change checklist

1. Trace the affected store and provider plugin separately; preserve wrong-key data.
2. Use isolated test keys (`ORCHESTRA_CREDENTIAL_KEY_FILE`), never real credentials.
3. Check migration, fallback and recovery; update the user guide for changed behavior.
4. Follow repo testing and guardrail instructions; do not infer CI success from this map.

## Existing test witnesses

- `packages/core/test/credential-at-rest.test.ts`: sealed round trip, plaintext migration,
  and retention of a row under an unavailable key.
- `packages/core/test/mcp/auth.test.ts`: serialized updates, migration, corrupt-file
  preservation and wrong-key write refusal.
- `packages/core/test/plugin/provider-opencode.test.ts`: provider authentication and
  catalog behavior; inspect the relevant cases before changing availability.
