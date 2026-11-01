# CLI Package Guide

`@orchestra/cli` is the `orchestra` executable. It composes Core, the server, the TUI and the engine adapters; it owns command parsing, the background server (`Daemon`) and the packaging of the native executable. Product behavior belongs in the package that owns it, not here. See `README.md` for entry points and the build.

## Package Boundary

- This is an app: it may depend on any lower layer, and nothing depends on it. Keep that direction; `bun run check:boundaries` enforces it.
- `src/host.ts` is the one place that lists the product contributions (`MaestroSeatsV2`, `ContinuityV2`, `ClaudeCodeHost`, and the app-dock tools when a dock is given). Its order matters: a later entry may replace a node an earlier one defined. Read the comment at the top before adding or moving an entry.
- Handlers in `src/commands/handlers` are loaded only when their command is selected: `src/index.ts` lists each one as a lazy `() => import(...)`, and `src/framework/runtime.ts` wires them to the command specs. Add a new command there as a lazy import, never a static one, and keep heavy imports inside the handler.
- `src/commands/commands.ts` is the single definition of commands and flags. Change a flag there and in its handler together, then update `test/commands-help.test.ts`.

## Processes

- Child processes start only through the sites listed for this package in `script/spawn-allowlist.json` (`bin/orchestra.cjs`, `src/services/daemon.ts`, `script/runtime-proof.ts`). Do not add a site; use `ChildProcessSpawner`, `Process` or `Process.interactive` instead.
- `src/services/daemon.ts` owns `server.json` and the server password. Never print the password, and never stop or restart a running Orchestra server or desktop app from tests or scripts.

## Packaging

- `script/build.ts` builds the executable and stages the Omni addon, tree-sitter files and ripgrep beside it. A packaged CLI must fetch nothing at run time.
- Seat skills and playbooks are embedded by `script/packaged-skills.ts` from the sources Maestro owns. Do not copy them into this package.
- `script/targets.ts` is the closed target matrix. A new target needs its native lane named in `script/test.ts` or its workflow, not a silent skip.
- Keep `bin/orchestra.cjs` a thin launcher: resolve the native executable, forward arguments and signals, return the child status.

## Testing

- Tests run on CI: `bun run test:ci cli test/commands-help.test.ts` from the repository root. Do not run `bun test` here.
- `script/test.ts` runs every file in `test/` except the ones it lists as belonging to a native lane. A new test file runs by default; excluding one needs an entry that names the lane.
- Prefer real command handlers and temporary directories over mocks.
