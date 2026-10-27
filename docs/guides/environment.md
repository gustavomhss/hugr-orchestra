# Environment variables

Switches that change what Orchestra does on the network or what it writes to disk. A value of `1` or `true` turns a switch on.

| Variable | Effect |
| --- | --- |
| `ORCHESTRA_DISABLE_AUTOUPDATE` | The desktop app never checks for updates: no polling, no update menu entry. |
| `ORCHESTRA_DISABLE_MODELS_FETCH` | The model catalog is not fetched from the network; the bundled snapshot or `ORCHESTRA_MODELS_PATH` is used. |
| `ORCHESTRA_SERVER_PASSWORD` | Basic-auth password for `serve` and `web`. Read once at startup and then removed from the process environment, so MCP servers, language servers and terminals the server starts never see it. |
| `ORCHESTRA_LOG_LEVEL` | `DEBUG`, `INFO` (default), `WARN` or `ERROR`. |

## Logs

The server writes `orchestra.log` in its log folder with owner-only permissions (0600). When the file passes 10 MB at startup the previous one is kept as `orchestra.log.1`, replacing any older copy. Logs name the executable and argument count of a command, not its arguments or working directory.

Help > Export debug logs replaces `auth_token=` values and `Authorization` header values with `[redacted]` in the log files it zips. Review the zip before you share it: prompts and file paths can still appear in logs.
