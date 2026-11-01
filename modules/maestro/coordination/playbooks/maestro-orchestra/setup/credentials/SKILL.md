---
name: maestro-orchestra-setup-credentials
description: Where provider, integration and MCP OAuth secrets are stored, how they are encrypted, what happens when the key is lost, and how to remove them.
internal: true
when: The owner asks where keys are kept, whether they are safe, why a login vanished after a Keychain prompt, or how to log out or wipe secrets.
not-when: The question is a provider that rejects a valid key (a provider issue, not storage).
covers: []
---

# Stored credentials

## What and where

| Secret | Location |
|---|---|
| Provider keys and OAuth tokens | `orchestra.db`, table `credential`, in the data directory |
| Integration tokens (Slack, Discord) | `orchestra.db` |
| MCP OAuth tokens | `mcp-auth.json` in the data directory |

The data directory is `<xdg data>/orchestra` (usually `~/.local/share/orchestra`).

## Encryption

Every secret is sealed with AES-256-GCM under one random 32-byte key made on first start. The key lives in the OS store under service `ai.hugr.orchestra`, name `credential-key`: Keychain on macOS, Secret Service on Linux, Credential Manager on Windows. A copied database or `mcp-auth.json` cannot be read elsewhere because the key does not travel. The desktop's own live key is separate (Electron safeStorage).

## When the store is unavailable

- The keychain call has a 10 second timeout. On failure, no answer, or no D-Bus session bus on Linux, Orchestra logs a warning and uses `credential.key` in the data directory (mode 0600). This is weaker: anyone who can read the directory reads both.
- If the key file is missing but sealed data exists, Orchestra refuses to make a new key and says to restore the key file or keychain entry. A new key would orphan every old row.
- A secret that cannot be decrypted is logged and skipped, never deleted or overwritten; restoring the key brings it back.
- `ORCHESTRA_CREDENTIAL_KEY_FILE` supplies a key file instead of the store (used by tests).
- On macOS a declined or unanswered Keychain prompt falls back for that run. `mcp-auth.json` is left untouched: MCP servers show logged out and new MCP logins fail instead of overwriting. Restart and allow the prompt.

## Damaged and old files

A `mcp-auth.json` that cannot be parsed is renamed `mcp-auth.json.corrupt-<timestamp>` and MCP servers need a new login. Plaintext credentials from old versions are rewritten sealed on the first start.

## Dev builds

`ORCHESTRA_INHERIT_CREDENTIALS` lets dev and branch builds read integration credentials read-only from the release database when theirs has none. Unset means on, except for `:memory:`.

## Removing

- `orchestra providers logout [provider]` (also `orchestra auth logout`).
- `orchestra mcp logout [name]` removes OAuth tokens, disconnects and sets `needs_auth`; `orchestra mcp auth <server>` signs in again.
- Everything: quit Orchestra, delete `orchestra.db` with `-wal` and `-shm`, and `mcp-auth.json`. This also deletes Sessions and local data. To drop the key too, delete the keychain entry and `credential.key`.

Never ask the owner to paste a key into chat.
