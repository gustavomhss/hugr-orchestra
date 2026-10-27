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

To approve a project by hand, edit the global config (`orchestra.json` in your Orchestra config folder):

```json
{
  "trusted_projects": ["/Users/you/work/my-project", "/Users/you/trusted-code"]
}
```

To stop trusting a project, remove its path from the list. Restart the session for the change to apply to servers already blocked or running.

## What a blocked project shows

Blocked project plugins, formatter and LSP config are skipped and the log carries a warning ending in `Add "<project folder>" to trusted_projects in your user config to approve it.` Restart the session after approving.

## What a blocked server shows

The server is listed with status `failed` and this error:

```
Not started: this project's config declares a local command for this server. Add "<project folder>" to trusted_projects in your user config to approve it.
```

Nothing was run. Approve the project as above, then connect the server again.
