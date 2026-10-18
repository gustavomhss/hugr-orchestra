# `@orchestra/cli`

`@orchestra/cli` is the executable and composition package for the Orchestra 2.0
preview. It is live V2 code and coexists with the legacy `apps/orchestra`
executable and product composition.

## Entry points

- `src/index.ts` assembles the Effect CLI runtime, command handlers, Node services,
  installation version, and the `Daemon` service layer.
- `src/commands/commands.ts` is the canonical command and option definition. Keep
  this README's command-family overview secondary to that source.
- `src/framework/runtime.ts` connects command specs to handler loaders. Handler
  modules are dynamically imported only when their command is selected.
- `src/omni-entry.ts` is the compiled executable preflight, then imports
  `src/index.ts`. The Omni addon and supervisor must be locatable when Omni is
  enabled.
- `bin/orchestra.cjs` is the npm package shim. It resolves the installed native
  executable (or `ORCHESTRA_BIN_PATH`), forwards arguments and signals, and returns
  the child exit status.

The command families currently defined in `commands.ts` are:

- `api`: make an HTTP request to the running server.
- `debug agents` and `debug symbols`: inspect agents and extract source symbols.
- `migrate`: migrate v1 data to v2 (the current handler reports that no migrations
  are available).
- `service start`, `restart`, `status`, `stop`, and `password`: manage or inspect
  the background server and its credential.
- `serve`: start the v2 API server; hostname defaults to `127.0.0.1`, and port
  selection starts at 4096 when omitted. `--register` publishes it to the service
  registration file.

Without a subcommand, the CLI obtains a Daemon transport, starts the background
server when needed, and launches the TUI with that transport.

## Runtime ownership

The CLI composes `@orchestra/core`, `@orchestra/server`, and `@orchestra/tui`,
along with the SDK and Effect/Node platform packages. The server routes are hosted
by `serve`; the CLI's `Daemon` owns start/status/stop, health and version checks,
registration, and the server password. Daemon state uses Core's XDG state path
under the `orchestra` application directory, with `server.json` and `password`
files. The password is retained across server restarts.

Desktop's opt-in V2 sidecar path (`ORCHESTRA_SIDECAR_V2=1`) consumes the compiled
CLI artifact as its background server. In that mode, its main process verifies or
installs the artifact, checks service status, starts the service, and obtains its
password through CLI commands. Desktop defaults to the legacy sidecar; the
legacy executable's commands and compatibility remain owned by `apps/orchestra`.

## Development and packaging

From this package directory, the command shapes are:

```sh
bun run dev
bun run build --single
bun typecheck
```

`dev` runs `src/index.ts`. `build` invokes `script/build.ts`; `--single` selects
the host OS/architecture build (with the script's AVX2/baseline selection).
Without `--single`, the builder selects its closed target matrix. A target name
can also be selected with `--target <name>`; see `script/targets.ts` for the exact
matrix. These are command descriptions, not runtime or build verification.

Compiled artifacts receive packaging inputs beside the executable: when enabled,
the Omni addon (`hugr_omni.node`) and supervisor; native tree-sitter files under
`bin/tree-sitter`; and the pinned ripgrep executable and license material under
`bin/ripgrep`. These are resolved and staged by the build, so a packaged CLI does
not fetch them at runtime. Release Omni inputs are supplied through
`OMNI_ARTIFACTS`; `--single` can use this checkout's Omni build when available.
Tree-sitter native bindings must be available for the selected target or the build
fails with a target-specific error.

There are implemented target exceptions: Omni is disabled for Linux musl and
Windows ARM64; tree-sitter is not shipped for musl; and no pinned ripgrep bundle
exists for Linux ARM64 musl. With `RIPGREP_BUNDLED=false`, a packager such as Nix
is responsible for putting `rg` on `PATH`. Do not infer universal CPU, operating
system, or libc support from the target list.

Packaged ripgrep runs from beside the executable, or from `PATH` when the packager
declares that arrangement. Source runs may use `PATH`, a previously downloaded
copy, or the pinned download path provided by Core.
