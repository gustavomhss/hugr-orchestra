---
name: desktop-startup-maintenance
description: How the desktop app starts its owned server, where launch time goes, and the traps that made the first launch fail or every launch slow
---

# Desktop startup maintenance

User guide: `docs/guides/desktop-startup.md`.

## Path

1. `apps/desktop/src/main/index.ts` starts the loading task: Dock channel, then `resolveCliBinary` and `sidecarLaunchEnv` in parallel, then `startOwnedServe`.
2. `resolveCliBinary` (`background-cli.ts`) calls `installCliArtifact` (`cli-install.ts`), which copies the bundled CLI into `userData/cli/<version>-<target>-<sha256>/` once, then runs `--version`.
3. `startOwnedServe` (`owned-serve.ts`) spawns `orchestra serve` through omni and polls `/api/health`. `main.log` records each step with a timestamp; `server.log` has the server's own output.

## Rules

- Readiness fails at once when the child exits. `READY_TIMEOUT` only ends a child that stays alive without answering, so keep it long: macOS scans a new unsigned executable on its first run, and that took about 30s on 0.3.1. A 20s cap turned that scan into "Owned serve not healthy within 20000ms".
- A valid installed copy is hashed against its own manifest on every launch; the bundled copy (about 116 MB) is hashed only when it must be installed. Do not add a second full hash to the warm path.
- Nothing the server start does not need may be awaited before the loading task (the net log once cost about a second there).
- The owned server runs with cwd `userData/global`, an empty folder. Requests that name no directory (Home's provider and model lists) boot a Location for the server's cwd; in the home directory that Location watched the whole home and cost about 3.4s after `server listening`. Never start the owned server in home or another large folder.
- Developer ID signing and notarization remove the first-run scan and the Keychain prompt after each update; until the release secrets exist, builds ship unsigned.

## Measuring

Read the timestamps in the newest `logs/<run>/main.log`: app starting, sidecar connection started, v2 CLI executable resolved, owned serve starting, server ready. Compare a launch right after install with a second launch to separate the macOS scan from our own work.
