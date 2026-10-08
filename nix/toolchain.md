# Local binary toolchain

`pkgs.callPackage ./nix/bun.nix {}` returns Bun **1.3.14**, with `bin/bun`,
`bin/bunx`, `.src`, `.sources` and `.compileTarget`.
`pkgs.callPackage ./nix/electron.nix {}` returns Electron **42.3.3**, with
`bin/electron`, `.src` and `.dist`. Both use normal `callPackage` arguments.
The consuming derivations must receive these packages explicitly. This checkpoint
does not wire the flake, dependency install, CLI or desktop derivations.

## Packaging evidence

The locked Nixpkgs revision is `9dd5558b06dbdacbf635a3dd36dce1b1a7ee3a89`:

- [Bun package](https://github.com/NixOS/nixpkgs/blob/9dd5558b06dbdacbf635a3dd36dce1b1a7ee3a89/pkgs/by-name/bu/bun/package.nix)
  is 1.3.13. `overrideAttrs` keeps its native binary installation, Linux
  `autoPatchelfHook`, Darwin ICU repair/signing, completions and `bunx` link.
  Version, source, source root, source passthru and changelog are replaced.
- [Electron binary generic](https://github.com/NixOS/nixpkgs/blob/9dd5558b06dbdacbf635a3dd36dce1b1a7ee3a89/pkgs/development/tools/electron/binary/generic.nix)
  is `args: version: hashes: derivation`, not a function taking `version` in its
  initial argument set. The [binary default](https://github.com/NixOS/nixpkgs/blob/9dd5558b06dbdacbf635a3dd36dce1b1a7ee3a89/pkgs/development/tools/electron/binary/default.nix)
  uses exactly `callPackage ./generic.nix {} version hashes`. Local code uses
  `pkgs.path` injected as `path` to select this implementation from the locked
  package set. Linux library wrapping/patching and Darwin app installation stay
  upstream. `.dist` is `$out/libexec/electron` on Linux and `$out/Applications`
  on Darwin. The pinned [version table](https://github.com/NixOS/nixpkgs/blob/9dd5558b06dbdacbf635a3dd36dce1b1a7ee3a89/pkgs/development/tools/electron/binary/info.json)
  stops at 41.2.0; the generic accepts our measured 42.3.3 release hashes.
- The generic's lazy `.headers` is removed: binary packaging does not need it,
  and its `fetchzip` needs an unpacked recursive hash. A native-addon rebuild
  must provision independently measured headers; there is no guessed hash.
- Native install checks verify the actual Bun executable version and Electron's
  `process.versions.electron` with `ELECTRON_RUN_AS_NODE=1`, without a display.

`toolchain-sources.json` records eight full ZIP downloads, independently measured
with Python SHA-256, `shasum` and OpenSSL, then compared against upstream
`SHASUMS256.txt` and GitHub release asset digests/sizes. Before measurement, all
three implementations hashed `abc` to the known SHA-256 control. Executable
members were checked in all ZIPs; Electron's `version` member was checked too.
The manifest includes exact commands, URLs, target mapping, sizes, hex and SRI.
Hashes are **flat archive hashes**, not NAR hashes. All downloaded bytes stayed
outside the repository.

## Baseline and offline compilation

Both x64 systems deliberately use Bun's baseline archive, not its AVX2/modern
archive. Baseline does not certify every possible x86_64 CPU or Rosetta: pinned
Nixpkgs explicitly notes Darwin baseline still requires AVX and excludes x64
Darwin completion execution. Native runner and CPU coverage remain required.

Read-only peer checkpoint: `696018ded7740e9725447475c044f50aa160c074` in
`runtime-closure-wt`. `packages/desktop/src/main/cli-artifacts.ts` selects baseline
for native x64; `scripts/utils.ts` and `packages/cli/script/build.ts` produce the
owned CLI and stage `resources/cli`. Desktop also declares modern x64 artifacts;
their names alone do not force Bun's compiler into modern mode.

Bun 1.3.14's [CompileTarget.zig](https://github.com/oven-sh/bun/blob/bun-v1.3.14/src/options_types/CompileTarget.zig)
defaults `baseline = !Environment.enableSIMD`; an explicit target without
`baseline` or `modern` inherits that default. Its `exePath` reuses the running
executable for the default target. Thus native baseline x64 and native arm64
compiles can reuse these binaries without another target download. Nix runner
must prove this with sandboxed compilation; it has not run here.

A genuinely non-default target/version/ABI uses the formatted filename
`bun-<os>-<arch>[-musl][-baseline]-v1.3.14` in the current working directory or
Bun install cache. Missing file triggers `@oven/bun-*` npm tarball download,
optionally redirected by `BUN_COMPILE_TARGET_TARBALL_URL`. Offline builds must
preseed an exact measured executable at that filename/cache location before
compiling; do not silently permit network downloads. This checkpoint provides
only the four native GNU/Darwin toolchains, not cross/musl/modern artifacts.
On Linux, [StandaloneModuleGraph.zig](https://github.com/oven-sh/bun/blob/bun-v1.3.14/src/standalone_graph/StandaloneModuleGraph.zig)
calls `normalizeInterpreter()` during executable emission. Lead must check and
patch the compiled CLI's interpreter/RPATH; patched Bun alone is not proof that
its emitted CLI runs in a Nix closure.

## Lead CI commands (not run locally)

Run from a checkout containing these files and the existing lock. Nix is absent
locally (`zsh:1: command not found: nix`); these are required validation commands,
not a claim of successful evaluation or compilation.

Evaluate all four declared systems without changing any flake exports:

```sh
nix eval --impure --json --expr '
  let
    flake = builtins.getFlake (toString ./.);
    systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
  in builtins.listToAttrs (map (system:
    let
      pkgs = flake.inputs.nixpkgs.legacyPackages.${system};
      bun = pkgs.callPackage ./nix/bun.nix {};
      electron = pkgs.callPackage ./nix/electron.nix {};
    in {
      name = system;
      value = {
        bun = { inherit (bun) version drvPath compileTarget; src = bun.src.drvPath; };
        electron = { inherit (electron) version drvPath dist; src = electron.src.drvPath; };
      };
    }) systems)
'
```

On **each matching native runner**, set its actual Nix system, then build both
packages. This executes the version install checks when the host is executable:

```sh
export TOOLCHAIN_SYSTEM=x86_64-linux
nix build --impure --no-link --print-out-paths --print-build-logs --expr '
  let
    flake = builtins.getFlake (toString ./.);
    pkgs = flake.inputs.nixpkgs.legacyPackages.${builtins.getEnv "TOOLCHAIN_SYSTEM"};
  in [ (pkgs.callPackage ./nix/bun.nix {}) (pkgs.callPackage ./nix/electron.nix {}) ]
'
```

Negative control, for **each tool on each native runner**: override only the
actual `.src` derivation output hash in memory, retaining its URL and downloader.
The following Bash sequence requires a named fixed-output mismatch, not a generic
build failure. It changes no source or lock file:

```bash
set -euo pipefail
for tool in bun electron; do
  export TOOLCHAIN_TOOL="$tool"
  log=$(mktemp)
  if nix build --impure --no-link --print-build-logs --expr '
    let
      flake = builtins.getFlake (toString ./.);
      pkgs = flake.inputs.nixpkgs.legacyPackages.${builtins.getEnv "TOOLCHAIN_SYSTEM"};
      package = pkgs.callPackage (./nix + "/${builtins.getEnv "TOOLCHAIN_TOOL"}.nix") {};
    in package.src.overrideAttrs (_: {
      outputHash = builtins.hashString "sha256" "toolchain-negative-control-${package.name}";
    })
  ' >"$log" 2>&1; then
    cat "$log"
    exit 1
  fi
  cat "$log"
  rg --fixed-strings 'hash mismatch in fixed-output derivation' "$log"
  rg --fixed-strings 'got:' "$log"
  expected=$(python3 -c 'import json, os; m = json.load(open("nix/toolchain-sources.json")); print(m[os.environ["TOOLCHAIN_TOOL"]]["sources"][os.environ["TOOLCHAIN_SYSTEM"]]["hash"])')
  rg --fixed-strings "$expected" "$log"
done
```

Compare each `got:` against the manifest's measured SRI for that exact archive;
retain command, exit code and log. Build the real sources/packages again after
the negative controls. Evaluation on one host is not four-system native coverage.
Desktop native-addon headers/ABI compatibility, final consumer wiring, emitted
CLI closure and native package builds remain lead-owned validation work.
