---
name: maestro-orchestra-errors-mcp
description: What MCP server failures and OAuth callback problems look like, with the exact messages, and what to do for each.
internal: true
when: A server shows failed or needs_auth, a sign-in fails with a port message, or the owner asks why a server connects with no tools.
not-when: The server is healthy but a tool name looks different (use the MCP tools leaf).
covers: []
---

# MCP failures

## Status messages

| Situation | Status and message |
|---|---|
| Connects, cannot list tools | `failed`: `Listing tools failed: <reason>` (never shown as connected with no tools) |
| Local server exits or crashes | `failed`: `Connection closed` or the connect error, then `Last stderr lines:` and the last 20 stderr lines |
| Remote server without valid tokens | `needs_auth` |
| After `orchestra mcp logout <server>` | `needs_auth`; OAuth credentials removed and server disconnected. Servers without OAuth are unchanged |

stderr is always drained, so a chatty server never blocks before it connects. The last 20 lines are the place to look first.

## OAuth callback port

Remote sign-in returns to `http://127.0.0.1:19876/mcp/oauth/callback`. If another program holds the port the sign-in fails at once with `OAuth callback port <port> is already in use. Close the program using it, or set another port with oauth.callback_port in the server's MCP config.` Set `oauth.callback_port` or `oauth.redirect_uri` in that server's MCP config.

The ChatGPT sign-in uses port 1455 and fails with `Port 1455 is already in use, likely by another ChatGPT or Codex sign-in. Finish or close it, then try again.` Closing the connect dialog cancels the sign-in and frees the port.

## Credential side effects

- Declined or unanswered macOS Keychain prompt: `mcp-auth.json` is left untouched, servers show logged out and new MCP logins fail rather than overwrite. Restart and allow the prompt.
- A damaged `mcp-auth.json` is moved to `mcp-auth.json.corrupt-<timestamp>`; every server needs a new login.

## Trust

A server declared in a project config does not start until the project is trusted in the user's global config (`trusted_projects`). It shows as failed with the blocked-by-trust reason, not as a crash.

## Commands

`orchestra mcp auth <server>` signs in; `orchestra mcp logout [name]` signs out; `orchestra mcp add` adds. Errors print one line and exit non-zero.

## What to tell the owner

Quote the last stderr lines, name the likely cause, and offer the fix (install the command, fix the path, free the port, log in). Do not log in for them.
