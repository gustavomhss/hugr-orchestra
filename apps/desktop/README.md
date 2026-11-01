# Orchestra Desktop

The Electron host for the shared Solid application in `@orchestra/app` (`packages/app-shell`). It owns the Electron main,
preload and renderer processes, platform adapters, desktop drafts and settings, bundled resources, and packaging.

The main process owns native lifecycle and privileged services. The preload exposes the narrow `window.api` bridge; the
renderer calls only that bridge and composes the shared app package rather than importing main-process modules. The
renderer also owns desktop-specific navigation, initialization and styles.

## Who uses it

People, through the installed app. It runs the compiled `apps/cli` binary (staged in `resources/cli`) as its server, and
bundles Omni and Claude Code resources. Startup failures and what the user sees are described in
[desktop startup](../../docs/guides/desktop-startup.md).

## Development

From the repository root:

```bash
bun run dev:desktop
```

This runs `bun dev` here. The `predev` script installs Electron, copies the channel icons (`ORCHESTRA_CHANNEL`, default
`dev`), stages Claude Code and Omni (always with the `dev` staging policy; it borrows this checkout's Omni build or the
installed app's when `OMNI_ARTIFACTS` is unset), and builds the CLI into `resources/cli`. Then `dev` starts Electron Vite.
`bun typecheck` runs from this directory. Tests run on CI from the repository root: `bun run test:ci desktop [files]`.

## Build and package

```bash
bun run build
bun run package
```

`prebuild` prepares the channel icons and Linux metainfo, stages Claude Code and Omni, and builds the CLI into resources
before Electron Vite writes the main, preload and renderer outputs to `out/`. `package` runs electron-builder and writes
distributables to `dist/`; `package:mac`, `package:win` and `package:linux` target one platform.

The server is the CLI binary staged in `resources/cli`, not the source: only the `predev` and `prebuild` lifecycles
rebuild it. Calling `electron-vite dev`, `electron-vite build` or `bun run preview` directly reuses the staged binary, so
a change under `packages/` or `modules/` does not reach the app. After a server-side change, run `bun run dev:desktop` or
`bun run build` through bun so the lifecycle runs.

## Server

Each launch starts one local server for the app. By default it is a desktop-owned V2 `orchestra serve` child: the
bundled CLI runs as a child of the main process on a loopback port with a per-launch password, restarts with backoff
when it crashes, and stops with the app (`src/main/owned-serve.ts`). It reaches the main process's MCP Dock handlers
through a loopback channel (`src/main/dock-channel.ts`). On its first start it copies V1 transcripts from the shared
database into V2 once.

`ORCHESTRA_SIDECAR` selects another server for the launch:

| Value | Server |
| --- | --- |
| unset or `owned` | the desktop-owned `orchestra serve` child (default) |
| `shared` | the shared background daemon managed through the CLI |

## Persistent data

Electron settings and desktop draft data live under Electron's `userData`
directory. Drafts use `drafts.sqlite`; settings use Electron stores. These
belong to the desktop profile. `ORCHESTRA_DB` configures the Orchestra Core
database used by the app/server process; it does not redirect or isolate the
entire Electron profile, its settings, or other desktop state.

A dev build has its own `userData`, but without `ORCHESTRA_DB` it opens the same Core database as the installed app
(`orchestra.db` under the XDG data directory). To keep a long-running dev build off it, set `ORCHESTRA_DB` to an
absolute path in a directory of its own.

## Security hardening

- **Renderer origin.** A packaged build ignores `ELECTRON_RENDERER_URL`; only an unpackaged app loads the dev server
  (`src/main/renderer-origin.ts`). The packaged window is always `oc://renderer`.
- **IPC sender check.** Every handler registered in `src/main/ipc.ts` rejects an event whose `senderFrame` is not the
  renderer's own origin, so a navigated or foreign-origin frame cannot reach files, stores or the sidecar. The live,
  janitor and MCP Dock handlers register separately and validate their own senders.
- **IPC arguments.** The renderer is untrusted, so `src/main/ipc-validate.ts` checks what it names before main acts:
  store names must be renderer `.dat` stores (main-owned stores and `..` are refused); the default server is an
  http(s) URL or a `sidecar`, `wsl:` or `ssh:` connection key; an "open in" app must be one the app's own list
  (`packages/app-shell/src/open-apps.ts`) offers, and it only receives a directory; paths must be absolute; a path that
  would launch something (an app bundle, `.command`, `.exe`, a script, a file with an execute bit) is revealed in the
  file manager, never opened; a draft blob is capped at 20 MiB.
- **Content-Security-Policy.** Renderer HTML responses carry an enforced `object-src 'none'; base-uri 'self'` and a
  full policy in `Content-Security-Policy-Report-Only`. Promote the report-only policy to enforced after watching the
  packaged app's console for violations (remote servers, blob workers, wasm and inline styles are expected users).
- **Electron fuses** (`electronFuses` in `electron-builder.config.ts`): `runAsNode`, `NODE_OPTIONS` and `--inspect`
  are off and app code loads only from `app.asar`. The server is the bundled CLI binary, never this executable run as
  Node. Embedded asar integrity is not enabled yet.
- **`ORCHESTRA_TEST_ONBOARDING`** is honored in packaged builds on purpose: the hosted packaged omni smoke needs it.
  It only moves state to a temp directory and an in-memory database.
- **Shutdown.** SIGINT/SIGTERM just call `app.quit()`; `before-quit` flushes windows, then stops sidecars. Every
  caller of `killSidecar` awaits one shared stop, and the owned server's stop waits for the child's `close`.

## Platform guides

- [Linux runtime](docs/linux-runtime.md)
- [Linux workspace access](docs/linux-workspace-access.md)
- `bun run linux` (`scripts/linux-workspace.ts`) drives the Linux workspace from the command line.

<!-- module-contract:start (generated by script/module-readme.ts from script/module-architecture.json; do not edit) -->
## Module contract
- Package: `@orchestra/desktop` at `apps/desktop` (alias `desktop`)
- Summary: The Electron host for the shared Solid application.
- Layer: `app`; may depend on: `foundation`, `native`, `contract`, `client`, `extension-api`, `library`, `tooling`, `module`, `platform`, `product`, `composition`, `ui`, `terminal-ui`
- Status: `canonical`
- Owner: desktop maintainer
- Public entry: `main` field (`./out/main/index.js`)
- Legacy and compatibility: none
- Enforced by `bun run check:boundaries`; exceptions in `script/boundary-ledger.json`.
<!-- module-contract:end -->
