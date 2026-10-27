# Stored credentials

Orchestra keeps three kinds of secrets on your machine: provider credentials (API keys and OAuth tokens for model
providers), integration tokens (for example Slack or Discord connections), and OAuth tokens for MCP servers. This guide
explains where they live and how they are protected.

## Where they are stored

Provider credentials and integration tokens are stored in Orchestra's database, `orchestra.db` in the data directory
(`~/.local/share/orchestra` on Linux and macOS unless `XDG_DATA_HOME` says otherwise). MCP OAuth tokens are stored in
`mcp-auth.json` in the same directory.

Every secret is encrypted with AES-256-GCM before it is written. The encryption key is a random 32-byte key that
Orchestra creates on first start and keeps in your operating system's credential store: the Keychain on macOS, the
Secret Service (for example GNOME Keyring or KWallet) on Linux, and Credential Manager on Windows. The entry is named
`ai.hugr.orchestra` / `credential-key`. Copying the database or `mcp-auth.json` to another machine does not copy the
key, so the secrets in the copy cannot be read there.

The desktop app's own live key is protected separately by Electron's safeStorage and is not covered here; see
[Live meetings](live-meetings.md).

## Upgrading from a version that stored plaintext

Earlier versions stored these secrets in plaintext. On the first start after upgrading, Orchestra reads every plaintext
credential and writes it back encrypted; `mcp-auth.json` is encrypted the first time it is read. Nothing needs to be
done by hand and no login is lost.

If a stored secret cannot be decrypted (for example because the key was removed from the credential store), Orchestra
logs an error for that credential and skips it. It never deletes or overwrites it, so restoring the key makes it readable
again. Logging in again creates a new credential.

On macOS an update can make the Keychain ask again whether Orchestra may use its key. If you decline that prompt or do
not answer it within 10 seconds, Orchestra falls back to the key file for that run. Your stored credentials are skipped,
not lost. `mcp-auth.json` is left in place: MCP servers show as logged out and new MCP logins fail rather than
overwrite it. Restart Orchestra and allow the prompt to get everything back.

If `mcp-auth.json` is damaged (it cannot be parsed, or its contents have the wrong shape), Orchestra moves it aside to `mcp-auth.json.corrupt-<timestamp>`,
logs where it went, and starts with no MCP logins. The original file is kept for inspection; MCP servers need a new
login.

## When the credential store is unavailable

Some systems have no usable credential store, for example a Linux server or container without a Secret Service, or a
session where the store is locked and does not answer. In that case Orchestra keeps the key in `credential.key` in the
data directory, readable only by your user (mode 0600), and logs a warning once. On Linux without a D-Bus session bus (headless servers, CI, bare WSL) Orchestra does not try the store at all. This is weaker: anyone who can read
your data directory can read both the key and the secrets. Protect that directory, or run Orchestra where a credential
store is available. If the credential store becomes available later, secrets encrypted with the key file stay readable.

## Removing stored credentials

- Provider credentials: `orchestra providers logout [provider]` (also available as `orchestra auth logout`).
- MCP OAuth tokens: `orchestra mcp logout [name]`.
- Everything at once: quit Orchestra, then delete `orchestra.db` (with its `-wal` and `-shm` files) and `mcp-auth.json`
  from the data directory. This also removes your sessions and other local data. To remove the encryption key as well,
  delete the `ai.hugr.orchestra` / `credential-key` entry from your credential store and `credential.key` from the data
  directory if it exists. Once the key is gone, any remaining encrypted secret can no longer be read.
