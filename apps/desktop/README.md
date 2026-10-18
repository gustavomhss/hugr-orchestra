# Orchestra Desktop

Orchestra Desktop is the Electron host for the shared Solid application in
`@orchestra/app`. It owns Electron main, preload, and renderer processes,
platform adapters, durable desktop drafts and settings, resources, and
application packaging.

The main process owns native lifecycle and privileged services. The preload
exposes the narrow `window.api` bridge used by the renderer; renderer UI calls
that bridge and composes the shared app package rather than reaching into main
process modules. The renderer also owns Desktop-specific navigation,
initialization, styles, and host integration.

## Development

Install dependencies from the repository root, then run from `apps/desktop`:

```bash
bun dev
```

The `predev` lifecycle installs Electron, copies channel-specific icons, builds
the legacy Orchestra Node bundle, stages Omni, and builds/stages the V2 CLI
resources. Then `dev` starts Electron Vite. Icons use `ORCHESTRA_CHANNEL` or
`dev`; `predev` always uses Omni's `dev` staging policy. Bundle channel/version
stamping follows the build helpers rather than one shared preparation default.

## Build and package

```bash
bun run build
bun run package
```

`prebuild` prepares channel-specific icons and Linux metainfo, builds the legacy
Node bundle, stages Omni, and builds/stages CLI resources before Electron Vite
builds the main, preload, and renderer outputs in `out/`. `package` runs
electron-builder and writes distributables under `dist/`. Platform-specific
scripts are `package:mac`, `package:win`, and `package:linux`.

## Persistent data

Electron settings and desktop draft data live under Electron's `userData`
directory. Drafts use `drafts.sqlite`; settings use Electron stores. These
belong to the desktop profile. `ORCHESTRA_DB` configures the Orchestra Core
database used by the app/server process; it does not redirect or isolate the
entire Electron profile, its settings, or other desktop state.

## Platform guides

- [Linux runtime](docs/linux-runtime.md)
- [Linux workspace access](docs/linux-workspace-access.md)
