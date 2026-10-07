# npm packaging (W14, ADR-0004)

Nine packages, one version. `hugr-omni` (index.js, index.d.ts, no native file, no scripts) lists eight
`optionalDependencies`; each `hugr-omni-<id>` holds `hugr-omni.node` and, next to it, `hugr-omni-supervisor`
(the static musl build on Linux), and says `os`/`cpu`/`libc` so a package manager installs only its own. Installing
never compiles or downloads. Nothing here publishes.

| id | built with | `.node` from | supervisor from |
|---|---|---|---|
| `win32-x64-msvc` | Windows | `x86_64-pc-windows-msvc` | same |
| `win32-arm64-msvc` | Windows on Arm | `aarch64-pc-windows-msvc` | same |
| `darwin-arm64` | macOS | `aarch64-apple-darwin` | same |
| `darwin-x64` | macOS | `x86_64-apple-darwin` | same |
| `linux-x64-gnu` | zig, glibc 2.17 | `x86_64-unknown-linux-gnu` | `x86_64-unknown-linux-musl` |
| `linux-arm64-gnu` | zig, glibc 2.17 | `aarch64-unknown-linux-gnu` | `aarch64-unknown-linux-musl` |
| `linux-x64-musl` | Alpine (`rust:1-alpine`), `-crt-static` | `x86_64-unknown-linux-musl` | same, static |
| `linux-arm64-musl` | Alpine (`rust:1-alpine`), `-crt-static` | `aarch64-unknown-linux-musl` | same, static |

The loader (`index.js`) picks the package by `process.platform`, `process.arch` and, on Linux, the C library: the text
of `/usr/bin/ldd`, else `process.report`'s `header.glibcVersionRuntime` (absent on musl). A musl addon links musl's
`libc.musl-<arch>.so.1` dynamically, so a musl Node or Bun can load it; `pack.mjs` checks its `DT_NEEDED`, and that a
glibc addon needs `libc.so.6` and no musl. Deno has no musl build, so musl is proven with npm and Bun only.

## Build (always with an explicit `--target`, so the files land in `target/<triple>/release/`)

```sh
# macOS (Intel builds both; arm64 cross-compiles, it only runs on an Apple-silicon Mac)
rustup target add x86_64-apple-darwin aarch64-apple-darwin
cargo build --release -p hugr-omni-node -p omni-supervisor --target x86_64-apple-darwin
cargo build --release -p hugr-omni-node -p omni-supervisor --target aarch64-apple-darwin

# Windows (x64; on Arm, aarch64-pc-windows-msvc)
cargo build --release -p hugr-omni-node -p omni-supervisor --target x86_64-pc-windows-msvc

# Linux musl, inside Alpine on a host of that CPU: the supervisor static (the default), then the addon with -crt-static
# (only for it: it must never reach the supervisor, so it is not in .cargo/config.toml)
docker run --rm -v "$PWD":/w -w /w rust:1-alpine sh -euc 'apk add --no-cache gcc musl-dev >/dev/null; rustup toolchain install
  cargo build --release -p omni-supervisor --target x86_64-unknown-linux-musl
  RUSTFLAGS="-C target-feature=-crt-static" cargo build --release -p hugr-omni-node --target x86_64-unknown-linux-musl'

# Linux, from macOS or Linux with zig and cargo-zigbuild (the `.2.17` is the glibc floor; measured: GLIBC_2.17)
rustup target add x86_64-unknown-linux-gnu aarch64-unknown-linux-gnu x86_64-unknown-linux-musl aarch64-unknown-linux-musl
cargo zigbuild --release -p hugr-omni-node --target x86_64-unknown-linux-gnu.2.17
cargo zigbuild --release -p omni-supervisor --target x86_64-unknown-linux-musl
# aarch64: zig 0.16 with cargo-zigbuild 0.19.8 rejects `-Wl,--fix-cortex-a53-843419`, which rustc passes. A linker
# wrapper drops it (not needed once the tools accept the flag; then use `cargo zigbuild` as above):
printf '%s\n' '#!/bin/bash' 'a=(); for x in "$@"; do [ "$x" = "-Wl,--fix-cortex-a53-843419" ] || a+=("$x"); done' \
  'exec cargo-zigbuild zig cc -- -g -target "$ZIGTARGET" "${a[@]}"' > /tmp/zigcc && chmod +x /tmp/zigcc
ZIGTARGET=aarch64-linux-gnu.2.17 CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER=/tmp/zigcc \
  cargo build --release -p hugr-omni-node --target aarch64-unknown-linux-gnu
ZIGTARGET=aarch64-linux-musl CARGO_TARGET_AARCH64_UNKNOWN_LINUX_MUSL_LINKER=/tmp/zigcc \
  cargo build --release -p omni-supervisor --target aarch64-unknown-linux-musl
```

## Pack and prove

```sh
node bindings/node/npm/pack.mjs dist [id ...]    # all eight, or only those named; writes dist/tarballs/*.tgz
node bindings/node/npm/verify.mjs dist/tarballs node|bun|deno   # K9 on the platform it runs on
```

`pack.mjs` reads `target/<triple>/release` (`CARGO_TARGET_DIR` moves it), checks that every binary is the right
format and CPU for its package and that the Linux supervisor is static, packs, and checks each tarball (exact file
list, supervisor executable, no scripts). Run it on a POSIX host when it packs Linux or macOS packages: a Windows
host cannot keep the execute bit. It also asserts that `package.json` lists the eight packages at its own version
(keep them static; bump all nine together).

`verify.mjs` serves the tarballs from a localhost registry, installs `hugr-omni` into an empty project with npm,
`bun install` or `deno install` (empty cache, no `HUGR_OMNI_*` variable), checks that only this platform's package was
installed, with the supervisor next to the addon and no script anywhere, and runs
`bindings/node/examples/quickstart.ts` as written (Node: through `tsc`, which also types it against the installed
`index.d.ts`; Deno with `--allow-ffi --allow-env --allow-read`). Install and quickstart must each finish in 30 s.
With `node` it also checks the loader's messages for an unsupported platform and for a missing platform package.
`HUGR_BUN` / `HUGR_DENO` name the launcher (`npx -y bun@1`, `npx -y deno@2`) when the tool is not on the PATH.

## Docker (Linux run of K9; build the Linux packages first, as above, into `target/`)

```sh
node bindings/node/npm/pack.mjs dist linux-x64-gnu linux-arm64-gnu
docker run --rm --platform linux/amd64 -v "$PWD":/w:ro -w /w node:22-bookworm-slim sh -c '
  apt-get update -qq && apt-get install -y -qq git >/dev/null &&
  for rt in node bun deno; do HUGR_BUN="npx -y bun@1" HUGR_DENO="npx -y deno@2" node bindings/node/npm/verify.mjs dist/tarballs $rt || exit 1; done'
# arm64 (emulated on an Intel host): the same with --platform linux/arm64

# musl: the same under Alpine, with npm and Bun (Deno has no musl build)
node bindings/node/npm/pack.mjs dist linux-x64-musl
docker run --rm -v "$PWD":/w -w /w node:22-alpine sh -euc 'apk add --no-cache git tar >/dev/null
  for rt in node bun; do HUGR_BUN="npx -y bun@1" node bindings/node/npm/verify.mjs dist/tarballs $rt; done'
```

## CI (`scripts/ci.mjs --release` runs these; the commands by hand)

```sh
# Linux: the musl supervisor release is already built. The addon is the one that ships: built with zig at the
# glibc 2.17 floor (never natively against the image's glibc 2.39), its floor checked, then installed and run.
pip install --user ziglang && cargo install --locked cargo-zigbuild
cargo zigbuild --release -p hugr-omni-node --target x86_64-unknown-linux-gnu.2.17
F=$(objdump -T target/x86_64-unknown-linux-gnu/release/libhugr_omni_node.so | grep -o 'GLIBC_[0-9.]*' | sort -V | tail -1)
[ "$F" = GLIBC_2.17 ] || { echo "the addon needs $F, above the 2.17 floor"; exit 1; }
node bindings/node/npm/pack.mjs dist linux-x64-gnu
for rt in node bun deno; do HUGR_BUN="npx -y bun@1" HUGR_DENO="npx -y deno@2" node bindings/node/npm/verify.mjs dist/tarballs $rt; done

# macOS (whatever its CPU is)
T=$(rustc -vV | sed -n 's/^host: //p'); case "$T" in aarch64*) ID=darwin-arm64;; *) ID=darwin-x64;; esac
cargo build --release -p hugr-omni-node -p omni-supervisor --target "$T"
node bindings/node/npm/pack.mjs dist "$ID"
for rt in node bun deno; do HUGR_BUN="npx -y bun@1" HUGR_DENO="npx -y deno@2" node bindings/node/npm/verify.mjs dist/tarballs $rt; done
```

```bat
:: Windows
cargo build --release -p hugr-omni-node -p omni-supervisor --target x86_64-pc-windows-msvc
node bindings\node\npm\pack.mjs dist win32-x64-msvc
node bindings\node\npm\verify.mjs dist\tarballs node
set "HUGR_BUN=npx -y bun@1" && node bindings\node\npm\verify.mjs dist\tarballs bun
set "HUGR_DENO=npx -y deno@2" && node bindings\node\npm\verify.mjs dist\tarballs deno
```

## Release (W21)

Publish the eight platform packages first and `hugr-omni` last: Deno reads the packument of every optional dependency
and fails on one that does not exist yet.
