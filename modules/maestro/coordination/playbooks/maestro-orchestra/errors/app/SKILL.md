---
name: maestro-orchestra-errors-app
description: What the desktop app and CLI show when startup or a server read fails, and what the owner should do for each.
internal: true
when: The owner reports a blank or stuck window, "could not start", a provider list that never loads, a failed pipeline card, or a CLI run that exits non-zero.
not-when: The error names a config file (config errors leaf) or an MCP server (MCP errors leaf).
covers: []
---

# App and CLI errors

## Desktop startup

- The local server runs in its own empty folder, `global`, under the app's data folder (`app.getPath("userData")/global`), not in the home folder. Projects and Sessions always name their own folder.
- If the local server exits, the start screen shows the reason and the last lines it printed (for example a database or permission error). A server that runs but does not answer gets up to 120 seconds (`READY_TIMEOUT` 120000 ms in apps/desktop/src/main/owned-serve.ts).
- The first launch after installing or updating an unsigned build is slower, about half a minute, while macOS scans the new server program.
- With a healthy remote server configured, the app connects to it and keeps the local failure in diagnostics.
- A very early failure (for example an unreadable settings file) shows a dialog titled "HuGR Orchestra could not start" with the log folder, then exits. Logs are in `logs` under the app's data folder, one timestamped folder per run; `main.log` has the full error. Help, Export debug logs works when the app opens.

## The start screen buttons

Try again; Export logs (a debug zip into Downloads, shown in Finder); Restart app (only when the selected server is the local one). The form below is for other servers.

## Toasts and screens

| Symptom | Meaning and action |
|---|---|
| Error toast ends with a server message | That is the server's reason. A bare "request failed" means no reason arrived; check the server log. |
| Providers list shows "not ready" after 15 seconds | Local server still starting or crashed. |
| Inbox flags a project | That project's source failed to load; the inbox no longer says "nothing waiting" while a source fails. |
| A skill is missing from the list | Its file failed to parse; a warning in the server log names the file. |
| Relay judge rules always fail | Default backend `stub` has no judge. Set `relay.judge.backend` to `"api"` and `relay.judge.apiKey`. Failing closed is intended. |
| Meeting handoff fails | "Could not send these items to Maestro. Try again." Press Hand to Maestro again; nothing retries. |
| Failed pipeline or CI run | Ask Maestro to fix opens a draft chat with the failure output; nothing runs until sent. |
| Failed schedule run | "The last run failed on <date>", raw error under Technical details. |
| New workflow disabled | A line under the Actions header says why: connect a repository, wait for the access check, or the repository disallows it. |

## CLI

- `orchestra serve` without `--port` tries 4096 and moves up only when a port is taken (apps/cli/src/commands/handlers/serve.ts:119). Other bind errors are reported.
- `orchestra run "message"` does not read stdin when a message is given.
- `orchestra api` prints the body, then exits non-zero for a non-2xx status.
- `orchestra run --continue` with no earlier session prints `No earlier session to continue in <dir>; started a new session.` and runs in a new one. `--session <id>` requires an existing one.
- A headless run that needs a permission prints `auto-rejecting. Pass --auto to allow it.`, rejects it and exits non-zero. With `--format json` only the exit code reports it.
- `mcp add`, `mcp auth`, `mcp logout` and `agent create` print one error line, not a stack.
