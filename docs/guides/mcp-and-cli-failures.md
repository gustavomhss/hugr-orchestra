# MCP and CLI: what failures look like

## MCP server status

- **A server that connects but cannot list its tools** is `failed`, with the reason (`Listing tools failed: ...`). It is no longer shown as `connected` with no tools.
- **A local server that exits or crashes** is `failed` with `Connection closed` (or the connect error), followed by `Last stderr lines:` and the last 20 lines it wrote. Use them to find why it stopped.
- **`orchestra mcp logout <server>`** removes the stored OAuth credentials, disconnects the server and sets its status to `needs_auth`. Run `orchestra mcp auth <server>` to sign in again. Servers without OAuth are not changed.

## OAuth callback port

The browser sign-in for a remote server returns to `http://127.0.0.1:19876/mcp/oauth/callback`. If another program holds the port, starting the sign-in fails at once with `OAuth callback port <port> is already in use`. Close the program, or set `oauth.callback_port` (or `oauth.redirect_uri`) in the server's MCP config.

The ChatGPT browser sign-in uses port 1455 and fails with a clear message when it is taken. Closing the connect dialog, or going back from it, cancels the sign-in and releases the port.

## CLI

- `orchestra serve` without `--port` tries 4096 and up, moving on only when a port is taken. Any other bind error (for example a permission error) is reported.
- `orchestra run "message"` does not read stdin when a message argument is given, so it no longer waits on an open pipe. Pipe the text with no message argument to use it as the message.
- `orchestra api` prints the response body, then exits non-zero when the status is not 2xx.
- `orchestra mcp add`, `mcp auth`, `mcp logout` and `agent create` print a one-line error and exit non-zero instead of a stack dump.
