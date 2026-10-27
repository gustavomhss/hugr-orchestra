---
name: settings-usage
description: How to use Settings and the MCP page in the app — which sections show with no project open, adding or fixing an MCP server (transport inferred from the endpoint, environment and headers fields, Try again), trusting a blocked project from its banner, and revoking trust in Settings
---

# Settings usage

For people and agents driving the Settings screen and the MCP page. The trust rules themselves: `docs/guides/mcp-project-trust.md`, which lists the on-screen paths first (first run, the MCP banner, Settings > Trusted projects) and the API and hand-edit paths after. New users: `docs/guides/getting-started.md`. The screen guide: `docs/guides/settings.md`.

## Sections

- With no project open, the list shows General, Shortcuts, Servers and Trusted projects. Providers, Models, Permissions, Agents and MCP are hidden until a project is open. A deep link to a hidden section (`?section=mcp`) opens General.
- With a project open, every section is listed. Trusted projects is always there because trust is global.

## Adding or fixing an MCP server

1. Open the project's MCP page and choose **Add MCP server**, or **Configure** on a card.
2. Type the endpoint. A URL (`https://…`) connects over HTTP. Anything else runs as a local command. There is no transport choice. The line under the field says which one was detected.
3. For a local server, enter environment variables as `KEY=value`, one per line. For a remote server, enter headers as `Name: value`, one per line.
4. Entered values replace the set of the same kind in the config file. Leave the box empty to keep the file's set. OAuth clients and client secrets are not on this page. Add them to `orchestra.json`.
5. A card that failed shows its error and a **Try again** button. The switch is for servers that are connected or off.

## Blocked project

- A local server from a project that is not trusted stays blocked. The MCP page then shows a banner with **Trust this project**. Approving it starts the blocked servers and refreshes the page.
- Do not trust a project only to make a banner go away. Trust lets its config run commands on this machine.

## Revoking trust

- Settings > Trusted projects lists each approved folder. **Revoke** removes that folder's own entry and stops its running local MCP servers.
- A folder trusted only through a parent stays trusted. Revoke the parent folder instead.

## Checks

- Settings has no project when the list shows only four tabs. If a tab says "Open a project", that is a bug: the tab should be hidden.
- A typed `https://` endpoint with no host is refused as an invalid URL, not saved as a command.
