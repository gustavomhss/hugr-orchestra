---
name: maestro-orchestra-start-install
description: How to install Orchestra (desktop app or npm CLI), what first run asks for, how the desktop app starts, and how it updates.
internal: true
when: The owner asks how to install, update or first set up Orchestra, why the desktop app will not start, or what the first launch of an unsigned build shows.
not-when: The question is about a model credential error or a project-trust problem after setup; open models or setup instead.
covers: []
---

# Install, first run, startup and updates

## Install

| Way | How |
|---|---|
| Desktop app | Installer from the latest `desktop-v<version>` release on GitHub Releases |
| Command line | `npm install -g @humanguardrail/cli`; upgrade with `orchestra upgrade` |
| CLI without npm | per-platform `.tar.gz` archives and `install.sh` attached to each release (macOS and Linux) |

Desktop files: macOS `orchestra-desktop-mac-arm64.dmg` (Apple silicon) and `-mac-x64.dmg` (Intel); Windows
`orchestra-desktop-win-x64.exe` and `-win-arm64.exe`; Linux `orchestra-desktop-linux-x86_64.AppImage` plus `.deb`
and `.rpm`. Each release attaches `SHA256SUMS`. Builds are not code signed: macOS asks for System Settings, Privacy
and Security, Open Anyway (the first check can take up to a minute); Windows SmartScreen needs More info, Run
anyway; Linux has no signature check.

## First run

1. Pick a folder. Choosing it also trusts it, so the MCP servers, plugins, formatters and language servers the
   folder declares may start. Orchestra never creates the folder; an empty one gets a git-init question. The folder
   is added as a project only after trust is saved.
2. Connect a model in Providers: Claude subscription (Claude mode) or a provider API key. Choosing Claude mode while
   signed out opens sign-in first; the engine switches to Claude Code only after sign-in succeeds. Providers is
   reachable with no project open.
3. Ask for something: "Start a session" on Home, or Chat in the sidebar.

Trust can be revoked through `POST /api/trust/revoke`. In a chat, a permission dock above the composer asks to
Allow, Reject or Stop; clicking Ask so it reads Auto-accept stops prompts in that chat.

## Desktop startup

The app runs its own local server in the folder `global` inside the app data folder, which stays empty, so requests
with no project do not scan the home folder. If the server exits, the start screen shows the reason and its last
output lines. A running server that has not answered gets up to 120 seconds (`READY_TIMEOUT` in
`apps/desktop/src/main/owned-serve.ts`). A healthy configured remote server is used instead. The first launch after
installing an unsigned build can take about half a minute because macOS scans the server. A very early failure
shows "HuGR Orchestra could not start" with the log folder (`logs` in the app data folder, `main.log` per run);
Help, Export debug logs collects it.

## Updates

The desktop app updates in place on Windows (NSIS), AppImage and signed macOS builds. Unsigned macOS, deb and rpm
builds announce the new release with a link; the owner installs it over the old one. The updater only offers newer
releases and never downgrades. The CLI updates with `orchestra upgrade`.
