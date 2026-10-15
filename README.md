# HuGR Orchestra

HuGR Orchestra is a desktop app for software work. You talk to Maestro, the lead agent. Maestro scopes the work, delegates it to a team of specialist agents, and brings the plan and the results back to you for approval.

The app is an Electron shell (`packages/desktop`) around a local server (`packages/orchestra`) that runs sessions, agents, tools and plugins.

## Run from source

You need Bun 1.3.14, the version pinned in `package.json`.

```bash
bun install
```

### Desktop app

```bash
bun run dev:desktop
```

This runs `packages/desktop`'s `predev` step, which builds the server bundle the app loads, and then `electron-vite dev`. The `predev` step also calls an `install-electron` script that `packages/desktop` does not define yet. Until it does, run the steps yourself:

```bash
cd packages/desktop
bun ./scripts/copy-icons.ts dev
(cd ../orchestra && bun script/build-node.ts)
./node_modules/.bin/electron-vite dev
```

A dev run uses your normal data directory. Set `ORCHESTRA_DB` to an absolute path, for example `ORCHESTRA_DB=/tmp/orchestra-dev.db`, to keep it away from your real database.

### Other entry points

- `bun dev` runs the terminal UI and server from `packages/orchestra/src/index.ts`. `bun dev <directory>` runs it against another directory.
- `bun run dev:web` runs the web UI from `packages/app`.
- `./packages/orchestra/script/build.ts --single` compiles a standalone binary for your platform into `packages/orchestra/dist/orchestra-<platform>/bin/orchestra`.

### Checks

- Type check from a package directory: `bun typecheck`.
- Tests run on GitHub Actions, not locally: `bun run test:ci <package> [test files...]` from the repository root. A local `bun test` stops with a pointer to it.
- `bun run check:godfile` flags source files that grow past the line limit.

## Where things live

| Path                       | What it holds                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| `packages/desktop`         | The Electron app; `docs/` covers the Linux workspace and App Dock                               |
| `packages/app`             | The web UI that the desktop app renders                                                         |
| `packages/orchestra`       | Server, agents, tools and the plugin loader; `playbooks/` holds Maestro's playbooks             |
| `packages/core`            | Session runtime, configuration, providers and the plugin host                                   |
| `packages/plugin`          | The plugin SDK, `@orchestra/plugin`; Orchestra bundles it and never installs it from a registry |
| `foundation/atlas`         | Atlas, the grounded knowledge layer for a codebase; see its `README.md` and `docs/`             |
| `specs/hugr-maestro`       | Maestro's contracts, roadmap and work packages                                                  |
| `specs/backend-specialist` | The backend specialist's architecture and tool contracts                                        |
| `specs/orchestra-visual`   | The visual design handoff and its verification                                                  |
| `specs/v2`                 | V2 designs: API, sessions, configuration, providers, tools and the plugin lifecycle             |
| `CONTEXT.md`               | Vocabulary of the session runtime                                                               |
| `AGENTS.md`                | Rules for agents that work in this repository                                                   |
