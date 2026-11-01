# Environment variables

Switches that change what Orchestra does on the network or what it writes to disk. A value of `1` or `true` turns a switch on.

| Variable | Effect |
| --- | --- |
| `ORCHESTRA_DISABLE_AUTOUPDATE` | The desktop app never checks for updates: no polling, no update menu entry. |
| `ORCHESTRA_DISABLE_MODELS_FETCH` | The model catalog is not fetched from the network; the bundled snapshot or `ORCHESTRA_MODELS_PATH` is used. |
| `ORCHESTRA_SERVER_PASSWORD` | Basic-auth password for `serve` and `web`. Read once at startup and then removed from the process environment, so MCP servers, language servers and terminals the server starts never see it. |
| `ORCHESTRA_LOG_LEVEL` | `DEBUG`, `INFO` (default), `WARN` or `ERROR`. |

## The .env editor

The **.env** page in the sidebar's Advanced group edits a project's `.env` file. Its description reads **Your project's environment keys. Open, edit, and download a .env file.** It is separate from the switches above: those configure Orchestra, and this page edits the file your own project reads.

Nothing is read until you open a file. Values stay in this page until you leave or reload; **Download .env** saves the edited file.

1. Choose **Open .env** and pick the file.
2. Read the keys. Values are masked with dots. **Show** and **Hide** reveal a value, and **Search .env** filters the list. With no keys the page says **No environment keys yet.**, and with no match **No keys match your search.**
3. Choose **Add key** to add one. The dialog **Add environment key** takes a **Key** and a **Value**. **Edit** on a row opens **Edit {key}**, and **Remove** asks **Remove {key}?** before it removes anything.
4. Choose **Download .env** to save the result. **View file** shows the file as it will be saved.

Lines the page does not understand, such as comments or unusual syntax, are kept as they are and shown read-only (**This line is preserved as read-only.**), so they survive your edits.

| Message | What to do |
| --- | --- |
| Use a valid environment key name. | Use letters, digits and underscores, and do not start with a digit. |
| This key already exists. | Edit the existing key, or choose another name. |
| Could not read this file as text. Your previous draft is still available. | Pick a text file. Your earlier draft stays on the page. |
| Could not download this file. | Try again. |
| This browser does not support local file import and download. | Open the page in a browser that does. |

Keys and values can be secrets. Keep the downloaded file out of version control unless the project already ignores it.

See [Actions](actions.md) for the secrets and variables of a repository host, which are separate from this file.

## Logs

The server writes `orchestra.log` in its log folder with owner-only permissions (0600). When the file passes 10 MB at startup the previous one is kept as `orchestra.log.1`, replacing any older copy. Logs name the executable and argument count of a command, not its arguments or working directory.

Help > Export debug logs replaces `auth_token=` values and `Authorization` header values with `[redacted]` in the log files it zips. Review the zip before you share it: prompts and file paths can still appear in logs.
