# Settings

Settings is at `/orchestra/settings`. It has a section list on the left and one section on the right. `?section=<id>` opens a section directly.

## With no project open

Only server-wide sections are listed: **General**, **Shortcuts**, **Servers** and **Trusted projects**. Project sections (Providers, Models, Permissions, Agents and MCP) are hidden instead of showing "Open a project", because they change one project's configuration. Open a project to reach them.

## Shortcuts

**Reset to defaults** asks you to confirm, because it drops every shortcut you changed at once.

## With a project open

All sections are listed. The project sections apply to the server or to the project, and the page says which where that matters.

## Trusted projects

This section lists the project folders the global config trusts. A trusted project's own local MCP servers, plugins and formatters run. **Revoke** removes that folder from the list and stops its running local MCP servers. Trust is granted from the project's MCP page, or by editing `trusted_projects` in your global config. See [Project trust](mcp-project-trust.md) for what trust covers.

Revoking a folder that is trusted only through a parent folder changes nothing for that folder. Revoke the parent instead.

## MCP servers

The MCP page lists the servers in the open project's config.

- **Add or configure**: type a command to run a local server, or a URL to connect to a remote one. The transport follows what you type, so there is no transport choice. A local server takes environment variables as `KEY=value` lines. A remote server takes headers as `Name: value` lines.
- Values you enter replace the set of the same kind in the config file. Leave the box empty to keep what the file has. Secrets and OAuth clients are not shown on the page. Add an OAuth client to `orchestra.json` by hand.
- **Try again** retries a server that failed to start. Its error is shown on the card.
- A local server from a project that is not trusted shows a banner with **Trust this project**.
