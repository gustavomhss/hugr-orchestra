# Project trust: MCP servers, plugins, formatters and LSP

A project can declare code to run in its own config (`orchestra.json`, `orchestra.jsonc`, or the same files under `.orchestra/`). A cloned repository could use that to run anything on your machine. So none of the following run until you approve the project:

- local MCP servers (a command);
- plugins: the `plugins` list in the project config, and plugin files in `.orchestra/plugin/` or `.orchestra/plugins/`;
- `formatter` entries of the project config (a formatter is a command);
- `lsp` entries of the project config (a language server is a command).

When the project is not approved, the project's formatter and LSP settings are ignored as a whole (the built-in defaults and your own config still apply), and a warning in the log says so.

Remote MCP servers (a URL), and anything declared in your own global config, are not affected.

## trusted_projects

`trusted_projects` is a list of absolute paths in your global config. A project is approved when its folder is one of the listed paths or inside one. Listing a parent folder approves every project under it.

Only the global config counts. A `trusted_projects` entry in a project's own config is ignored, so a repository cannot approve itself.

## Approving a project

`orchestra mcp add` with a local server writes the server to the project and adds the project to `trusted_projects` for you, since adding it is your decision.

On first launch, Home's first step chooses a folder and trusts it in one action. Other folders are still trusted through the API or by hand. See [First run](first-run.md).

To approve a project through the server API, send its folder (an existing absolute path) to `POST /api/trust/approve` with the body `{ "directory": "/Users/you/work/my-project" }`. The server stores the folder's real path in your global config and starts the project's blocked local MCP servers at once, with no restart. `GET /api/trust` lists the approved folders, and `POST /api/trust/revoke` with the same body removes one. Revoking stops that project's running local MCP servers. A folder trusted only through a parent stays trusted, so revoke the parent instead. The server refuses a folder that does not exist, a file, a relative path and the filesystem root.

To approve a project by hand, edit the global config (`orchestra.json` in your Orchestra config folder):

```json
{
  "trusted_projects": ["/Users/you/work/my-project", "/Users/you/trusted-code"]
}
```

Plugins and LSP servers of a project load when the session starts, so restart the session after approving or revoking a project that declares them.

## What a blocked project shows

Blocked project plugins, formatter and LSP config are skipped and the log carries a warning ending in `Add "<project folder>" to trusted_projects in your user config to approve it.` Approve the project as above, then restart the session so plugins and LSP servers load.

## What a blocked server shows

The server is listed with status `failed` and this error:

```
Not started: this project's config declares a local command for this server. Add "<project folder>" to trusted_projects in your user config to approve it.
```

Nothing was run. Approving the project starts the server without a restart. You can also connect it again by hand.
