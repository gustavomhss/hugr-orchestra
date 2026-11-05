---
name: maestro-orchestra-start-orchestra
description: What Orchestra is and which surface (desktop app, command line, terminal UI, web, storybook) is for what.
internal: true
when: The owner asks what Orchestra is, which app or interface to use, or how the desktop app, the CLI and the web UI relate.
not-when: The question is about the code layout or packages (open architecture), installing (open install), or one capability or seat.
covers: [apps/desktop, apps/cli, apps/web, apps/storybook, packages/tui, packages/app-shell, packages/ui, packages/session-ui]
---

# What Orchestra is and its surfaces

Orchestra is a team of AI agents for software work, led by one agent the owner talks to (Maestro). Maestro plans,
hands pieces to specialist seats, checks what returns and asks the owner before anything lands. It runs on the
owner's machine in the owner's repository, on a Claude subscription (Claude mode) or on model providers with API
keys. The repository is MIT licensed; the product is an early release and builds are not code signed.

One Orchestra server holds the state (sessions, board, config, database). Every surface below is a client of it, so
the same agents, sessions and settings appear in all of them.

| Surface | Package | For |
|---|---|---|
| Desktop app | `apps/desktop` | The main interface: chat with Maestro, board, agents, Actions, workflows, MCP Dock, providers, settings |
| Command line and terminal UI | `apps/cli`, `packages/tui` | The `orchestra` command: terminal UI, one-shot runs, server, web |
| Web | `apps/web` | The same app in a browser, served by the CLI |
| Storybook | `apps/storybook` | Developer workbench for components; not for end users |

The shared Solid UI is layered: `packages/ui` (base components, themes), `packages/session-ui` (transcript
rendering), `packages/app-shell` (the application itself).

## `apps/desktop`
The Electron host for the shared app in `packages/app-shell`. It owns the main, preload and renderer processes,
native integrations, settings, bundled resources and packaging. It starts its own local server by running the
compiled CLI binary (`orchestra serve`) as a child, on 127.0.0.1 with a random password, and restarts it with
backoff if it dies. With `ORCHESTRA_SIDECAR=shared` it uses the shared background service instead. The MCP Dock,
live meetings (macOS) and the in-app updater live here. Installers: macOS dmg and zip, Windows nsis, Linux
AppImage, deb and rpm.

## `apps/cli`
The `orchestra` executable (npm package `@humanguardrail/cli`, a thin shim that launches the native binary).
Commands whose handlers exist: `run` (one task without the app), `serve` (the API server, Basic Auth),
`web` (serve plus the web UI), `attach` (a terminal UI to a running server), `acp` (Agent Client Protocol on stdio
for editors), `pr` (check a pull request out into a session), `stats` (token and cost statistics), `export` and
`import` (transcripts), `session`, `agent`, `models`, `providers`, `mcp`, `plugin`, `toolkit`, `service` (the
background server), `db`, `upgrade`, `uninstall`. Read `apps/cli/src/commands/commands.ts` for exact flags.
`orchestra run` rejects a permission nobody can answer and exits non-zero unless `--auto` is passed.

## `apps/web`
A thin browser shell: it builds a web `Platform` (browser draft store, notifications, server URL in
`localStorage`) and renders the same `AppInterface` as the desktop. The CLI serves its build, looking in
`ORCHESTRA_WEB_UI_DIR`, then a `web` folder beside the executable, then `apps/web/dist`. In dev it targets
`localhost:4096` unless `VITE_ORCHESTRA_SERVER_HOST` or `VITE_ORCHESTRA_SERVER_PORT` is set.

## `apps/storybook`
A Storybook workbench for components in `packages/ui`, `packages/session-ui` and `packages/app-shell`. It holds no
stories of its own and is built in CI only on the `epic` label or by manual dispatch. Developers only.

## `packages/tui`
The terminal UI (OpenTUI and Solid) that `apps/cli` starts. It speaks only the V2 session API through
`@orchestra/client`, has its own routes, prompt, dialogs, keymap and themes, and hosts TUI plugins.

## `packages/app-shell`
Package name `@orchestra/app`. The shared Solid application: routing, providers, server state, settings, commands,
localization. Desktop and web both import it, so the UI is written once; host differences sit behind the `Platform`
contract. It talks to the server only through `@orchestra/client` and must not import Core. The sidebar shows Home,
Chat, Project Board, Agents and Actions; the rest (Workflows, Hooks, MCP, Settings, Context savings, Atlas) sits in
the Extensions group.

## `packages/ui`
The Solid component library: base components, the theme system with JSON themes, locale files, fonts, audio, icons
and Tailwind styles. Every Solid screen builds on it. Visual rules are in the repository design-system skill.

## `packages/session-ui`
Solid components that render sessions: message parts, markdown, diffs, session review, line comments, and the V2
prompt input. Consumed by `packages/app-shell` and Storybook.
