# MCP servers and project trust

A project can declare MCP servers in its own config (`orchestra.json`, `orchestra.jsonc`, or the same files under `.orchestra/`). A local server is a command, and a cloned repository could use it to run anything on your machine. So a local server declared by a project does not start until you approve that project.

Remote servers (a URL), and servers declared in your own global config, are not affected.

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

## What a blocked server shows

The server is listed with status `failed` and this error:

```
Not started: this project's config declares a local command for this server. Add "<project folder>" to trusted_projects in your user config to approve it.
```

Nothing was run. Approve the project as above, then connect the server again.
