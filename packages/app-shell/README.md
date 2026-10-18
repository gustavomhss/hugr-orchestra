# Orchestra App

`@orchestra/app` is the shared Solid application library for Orchestra.
Desktop imports the shared application from this package; the private
`@orchestra/web` package owns the browser bootstrap and web build.

## Responsibilities

- Own browser-safe application UI, routing, shared providers, server state,
  settings, commands, localization, and platform-neutral UI behavior.
- Keep host behavior behind the `Platform` contract and providers. The web
  entrypoint in `apps/web` supplies browser storage, notifications, navigation,
  and server URL behavior; Desktop supplies native integrations through its
  renderer and preload API.
- Keep Electron main-process APIs, Node-only adapters, IPC implementation,
  and packaging in `packages/desktop`. Shared UI must not import those host
  implementation details.
- Keep static public assets under `public/` (including `/orchestra/` assets),
  locale dictionaries and language behavior in `src/i18n` and
  `src/context/language`, and shared styles in `src/index.css` and their
  feature-owned style files.

## Public package API

The package `exports` map in `package.json` defines supported imports. The
root export (`@orchestra/app`) exposes shared providers, application
components, hooks, platform types, and other stable UI contracts. Use named
subpaths for supported host integrations and assets, such as
`@orchestra/app/updater`, `@orchestra/app/orchestra/brand`, and
`@orchestra/app/index.css`. Desktop's renderer consumes these exports.
Internal `src/` modules and the `@/` Vite alias are implementation details;
do not make consumers depend on them.

When adding a shared capability, decide whether it belongs in the root or an
explicit package subpath and update `exports` accordingly. Keep browser-only
startup in `apps/web`; the reusable application surface is composed from
`AppBaseProviders`, `PlatformProvider`, and `AppInterface`.

## Web development

Run web commands from `apps/web`:

```bash
bun dev
bun run build
bun run serve
```

Vite serves the web bootstrap on port `3000` by default. The production build
uses `apps/web/dist/`; `serve` previews that build. Configure the backend with
`VITE_ORCHESTRA_SERVER_HOST` and `VITE_ORCHESTRA_SERVER_PORT` when needed.
The resulting `apps/web/dist/` contains the static web deployment assets.

## Browser end-to-end tests

Run the declared Playwright commands from `packages/app-shell`; its config
starts the Vite dev server from `apps/web` and passes the backend address
through to the app:

```bash
bunx playwright install chromium
bun run test:e2e:local
bun run test:e2e:local -- --grep "settings"
```

The default Vite port is `3000`, the base URL is
`http://127.0.0.1:3000`, and the backend defaults to `127.0.0.1:4096`.
Override them with `PLAYWRIGHT_PORT`, `PLAYWRIGHT_BASE_URL`,
`PLAYWRIGHT_SERVER_HOST`, and `PLAYWRIGHT_SERVER_PORT`. Playwright reuses an
existing dev server outside CI; `PLAYWRIGHT_FULLY_PARALLEL=1` enables full
parallel mode. The Chromium project accepts `PLAYWRIGHT_EXECUTABLE_PATH`, and
`PLAYWRIGHT_NO_VIDEO=1` disables failure video recording. Repository test
execution policy is in `../../AGENTS.md`; these commands are not a request to
run a full browser suite for each restructuring PR.

## Desktop and Linux references

For host-specific Linux integration, see the Desktop [Linux runtime guide](../desktop/docs/linux-runtime.md)
and [Linux workspace access guide](../desktop/docs/linux-workspace-access.md).
