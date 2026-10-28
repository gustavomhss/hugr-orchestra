# MCP Dock: every open interface is an MCP server

Each interface open in the MCP Dock becomes its own MCP server while it stays open: every browser tab and the Linux
workspace. Any agent on any engine sees them with its other MCP servers, with nothing to configure. Closing the tab
takes its server away before the agent's next turn.

## Names

- The Linux workspace is `dock-linux`.
- A browser tab is `dock-<site>`, for example `dock-github-com`. A second tab on the same site is `dock-github-com-2`.
- A server you configured with the same name wins over the dock's.

Tools appear as `<server>_<tool>` (for example `dock-github-com_look`), or as `mcp__orchestra__<server>_<tool>` in
Claude mode.

## Tools

Every answer comes from the accessibility tree the dock already reads. No screenshot is taken and no model is
called.

| Tool | What it does |
|---|---|
| `look` | The whole interface as an indented outline. Each line shows role, "name", states and a `[ref]`, and the indentation is the hierarchy. `scope=<ref>` shows only one region. On a page, `text=true` adds the visible text. |
| `find` | Search by text and/or role. Each match shows where it sits (`form "Sign in" › button "Continue" [3]`). |
| `act` | Click, type, press keys or scroll, by `ref` or by `name` and `role`. The answer lists what changed: focus, plus the lines that appeared, went away or changed. |
| `wait` | Wait until text appears, or goes away with `gone=true`, for up to 15 seconds. |
| `navigate` | Browser tabs only. Open an address, or go back, forward or reload. |

Each server also lists one resource, `dock://<server>/outline`, which holds the same outline `look` returns.

## Permissions

These are MCP tools, so the usual permission rules apply. By default an agent is asked before each use. To let an
agent work an interface without asking, allow its tools in that agent's permissions (see
[Permissions and saved rules](permissions.md)).

## Limits

- On Linux, `act` locates a control by its name and role. A control with no name can only be reached with keys.
- A very large interface is cut at 40,000 characters. When that happens, look at one region with `scope`.
- When the interface reports a partial tree, `look` says so.
