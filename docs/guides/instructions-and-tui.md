# Instructions and TUI settings

## `instructions`

List extra instruction files in `orchestra.json` and the model reads them with your `AGENTS.md` files:

```json
{ "instructions": ["docs/style.md", "~/notes/team-rules.md"] }
```

- Paths are relative to the config file that lists them. `~/` means your home folder.
- A config in your global folder can name any file. A project config can only name files inside the project; a path that leaves the project makes the instructions unavailable, and the session does not start on stale context.
- A file that is missing is treated the same way.
- Globs such as `docs/*.md` are supported and match the files that exist when the session opens.
- URLs are not supported. A URL in `instructions` is a config error that names the file.

## `tui.json`

Terminal UI settings go in `tui.json` or `tui.jsonc`, separate from `orchestra.json`. Orchestra reads, from lowest to highest priority:

1. `tui.json` then `tui.jsonc` in your global config folder (`~/.config/orchestra`).
2. The same names in each project folder, from the project root down to the folder you opened, and in their `.orchestra/` folders.

A later file wins per key. `keybinds` and `plugin_enabled` merge by name. An invalid file stops the TUI with an error naming the file. See `schema/tui.json` for the keys.

## Removed keys

`autoupdate` and `username` no longer exist in the config schema because nothing read them. Old files that set them still load; the keys are ignored.

## MCP timeouts

`mcp.timeout.startup` and `mcp.timeout.request` each come from the last config file that sets them, so a project file that only lists servers keeps your global timeouts.
